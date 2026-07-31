/* Shared plumbing for the two tests that need a real browser
   (tools/test_drawings.mjs, tools/test_print_mobile.mjs).

   Both need the same three things: the app served over http, a Chromium that
   may or may not be installed, and — for anything that boots the whole app — a
   Firebase that isn't there. Written once here rather than twice badly. */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

export const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "03 App", "app");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".stl": "model/stl", ".woff2": "font/woff2",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

/* Static server over the app directory. `routes` maps a path to a string body,
   which is how a test injects a harness page without leaving a file behind in
   the app directory for someone to find and wonder about. */
export function serveApp(routes) {
  return new Promise(resolve => {
    const s = createServer(async (req, res) => {
      const path = decodeURIComponent((req.url || "/").split("?")[0]);
      if (routes && routes[path] != null) {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(routes[path]);
      }
      try {
        const buf = await readFile(join(APP_ROOT, path.replace(/^\/+/, "")));
        res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
        res.end(buf);
      } catch { res.writeHead(404); res.end("no"); }
    });
    s.listen(0, "127.0.0.1", () => resolve({ server: s, port: s.address().port }));
  });
}

/* Playwright is a dependency of these tests, not of the repo. Look where it
   plausibly is; the caller decides what to do when it is nowhere. */
export async function loadChromium() {
  const require_ = createRequire(import.meta.url);
  const tries = [];
  try { tries.push(require_.resolve("playwright")); } catch { /* not local */ }
  try {
    const g = execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    tries.push(join(g, "playwright", "index.mjs"));
  } catch { /* no npm */ }
  for (const p of tries) {
    try { return (await import(p.startsWith("/") ? "file://" + p : p)).chromium; } catch { /* next */ }
  }
  return null;
}

export function skipMessage(what) {
  return [
    `SKIPPED — Playwright is not installed, so ${what} was not rendered.`,
    "  npm i -g playwright && npx playwright install chromium",
    "  Nothing else in this repo can catch this class of bug; run it before shipping.",
  ].join("\n");
}

/* A stand-in for fb.js, injected by route interception so the real app boots
   with no Firebase, no network and no auth. It drives the app through the two
   hooks core.js exposes (onFbData / onFbChange), which is exactly how the real
   fb.js drives it — so this stubs the boundary rather than reaching past it. */
export const FB_STUB = `
window.fb = {
  state: "ready",
  user: { uid: "u1", email: "simon@example.com", name: "Simon" },
  roster: { role: "lead", name: "Simon", email: "simon@example.com" },
  rosterCheckFailed: false,
  save: async () => {}, del: async () => {}, mutateField: async () => {}, appendTo: async () => {},
  upload: async () => ({ url: "", path: "", name: "", size: 0, type: "" }), deleteFile: async () => {},
  allocId: async () => "X-1", importMany: async () => {},
  rosterAll: async () => [], rosterSet: async () => {}, rosterDelete: async () => {},
  notify: async () => {}, markNotifRead: async () => {},
  signOut: async () => {}, refreshRoster: async () => {},
  getConfig: async () => null, setConfig: async () => {},
};
/* Seed from the retro archive that ships with the app. Retried and then
   REPORTED, never swallowed: a silently empty DB looks exactly like a broken
   feature — the app renders "not found", no sheet mounts, and the test times out
   pointing at the wrong thing. Cost an hour of chasing a phantom once. */
window.__seedError = null;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const res = await fetch("sn5-work-orders.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const wos = await res.json();
    const arr = Array.isArray(wos) ? wos : (wos.workOrders || []);
    if (!arr.length) throw new Error("archive parsed but held no work orders");
    window.onFbData("workOrders", arr);
    window.__seedError = null;
    break;
  } catch (e) {
    window.__seedError = String((e && e.message) || e);
    window.onFbData("workOrders", []);
    await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
  }
}
window.onFbChange("ready");
`;

/* Boot the real index.html with the stub in place of fb.js. */
export async function openApp(ctx, port, path) {
  await ctx.route("**/fb.js", r => r.fulfill({ body: FB_STUB, contentType: "text/javascript" }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/${path || "index.html"}`, { waitUntil: "load" });
  await page.waitForFunction("window.fb && fb.state === 'ready'", null, { timeout: 20000 });
  const seedError = await page.evaluate("window.__seedError || null");
  if (seedError) throw new Error(`app booted with an empty database: ${seedError}`);
  return { page, errors };
}
