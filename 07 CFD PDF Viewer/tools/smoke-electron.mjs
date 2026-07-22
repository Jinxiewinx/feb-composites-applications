/* Smoke test for the packaged app, driven over the DevTools protocol.

   Launching Electron and seeing a window is not proof the app works. The risky
   part is that pdf.js starts a module worker, and whether that is allowed
   depends entirely on the page's origin, which is the reason the app is served
   over a custom app:// protocol instead of file://. This drives the real window
   and checks that a report actually loads and indexes there.

   Start the app first:
     npx electron . --remote-debugging-port=9333
   Then:
     node tools/smoke-electron.mjs */

const PORT = process.env.CDP_PORT || 9333;
const DEADLINE = 90_000;

const fail = (m) => { console.error("FAIL " + m); process.exit(1); };

const list = await fetch(`http://localhost:${PORT}/json/list`).then(r => r.json()).catch(() => null);
if (!list?.length) fail(`nothing listening on ${PORT}. Start electron with --remote-debugging-port=${PORT}`);
const page = list.find(p => p.type === "page");
if (!page) fail("no page target");
console.log("  ok  window loaded: " + page.title + "  " + page.url);
if (!page.url.startsWith("app://")) fail("expected the app:// protocol, got " + page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let seq = 0;
ws.addEventListener("message", ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, res);
  setTimeout(() => { if (pending.delete(id)) rej(new Error(method + " timed out")); }, DEADLINE);
  ws.send(JSON.stringify({ id, method, params }));
});

await new Promise((res, rej) => {
  ws.addEventListener("open", res);
  ws.addEventListener("error", () => rej(new Error("websocket failed")));
  setTimeout(() => rej(new Error("websocket did not open")), 15_000);
}).catch(e => fail(e.message));

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) fail("page threw: " + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
  return r.result?.result?.value;
};

const bridge = await evaluate(`JSON.stringify({native: !!window.cfdNative, boot: !!window.CFD})`);
console.log("  ok  bridge + app booted: " + bridge);
const b = JSON.parse(bridge);
if (!b.native) fail("preload bridge missing (native file dialog would not work)");
if (!b.boot) fail("app module did not boot");

// The real check: fetch the bundled sample through app:// and index it, which
// exercises the module worker.
const out = await evaluate(`(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    const res = await fetch("../DP_22.pdf");
    if (!res.ok) return JSON.stringify({error: "sample fetch " + res.status});
    const buf = new Uint8Array(await res.arrayBuffer());
    await window.CFD.addDocs([{ name: "smoke", data: buf }]);
    for (let i = 0; i < 100; i++) { await wait(400); if (window.CFD.S.docs.some(d => d.index)) break; }
    const d = window.CFD.S.docs.find(x => x.index);
    if (!d) return JSON.stringify({error: "indexing never completed"});
    return JSON.stringify({ pages: d.index.numPages, panels: d.index.panels.length,
      sections: d.index.sections.map(s => s.name).join(",") });
  } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
})()`);

const r = JSON.parse(out || "{}");
if (r.error) fail("in the app window: " + r.error);
console.log(`  ok  indexed a report in the desktop app: ${r.pages} pages, ${r.panels} panels, sections ${r.sections}`);
if (r.pages !== 39 || r.panels !== 59) fail(`expected 39 pages and 59 panels, got ${r.pages} and ${r.panels}`);

console.log("\nElectron smoke test passed.");
ws.close();
process.exit(0);
