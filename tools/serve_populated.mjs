/* serve_populated.mjs — the app, on a real port, with a populated database.
 *
 * WHY THIS EXISTS
 * tools/test_detailui.mjs measures the populated app and tools/shoot_ui.mjs
 * photographs it, but neither lets a person (or a browser-automation agent)
 * actually TOUCH the thing: open the doc-link modal, paste into the composer,
 * swipe the drawer closed, watch a lightbox open over a comment. Those are the
 * states a screenshot sweep cannot reach, and on a phone they are where the
 * remaining risk is.
 *
 * So: a static server over 03 App/app with /fb.js swapped for the test stub and
 * lib/fixtures.mjs + lib/fixtures-content.mjs applied on boot. No Firebase, no
 * auth, no network, and nothing written anywhere — every save lands in an async
 * no-op, so you can break things freely and reload to reset.
 *
 *   node tools/serve_populated.mjs             picks a free port, prints the URL
 *   node tools/serve_populated.mjs --port 8791
 *
 * Open it at a phone width. In Chrome that means the device toolbar (Cmd-Shift-M)
 * set to iPhone 15 / 393px, NOT a narrow desktop window: half the responsive
 * rules key off `pointer: coarse` rather than width, and only the device
 * toolbar sets that.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APPLY_FIXTURES } from "./lib/fixtures.mjs";
import { APPLY_CONTENT } from "./lib/fixtures-content.mjs";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "03 App", "app");
const i = process.argv.indexOf("--port");
const PORT = i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : 0;

/* The same stub test_detailui.mjs injects, with one difference: upload()
   returns a real servable image instead of an empty url, so attaching a file by
   hand renders a thumbnail rather than a broken-image box. */
const STUB = `
window.fb = {
  guest: false,
  async signInGuest() { fb.guest = true; },
  state: "ready",
  user: { uid: "u1", email: "starbuck@berkeley.edu", name: "Simon Starbuck" },
  roster: { role: "lead", name: "Simon Starbuck", email: "starbuck@berkeley.edu" },
  rosterCheckFailed: false,
  save: async () => {}, del: async () => {}, mutateField: async () => {}, appendTo: async () => {},
  // The bulk delete path. Present here because the app calls it: a shim missing
  // it turns "delete these work orders" into a TypeError in every local run.
  delMany: async () => {}, deleteFiles: async (p) => ({ ok: (p || []).length, failed: [] }),
  upload: async (path, file) => ({ url: "icon-192.png", path: "p", name: (file && file.name) || "uploaded.png", size: 1, type: "image/png" }),
  deleteFile: async () => {},
  allocId: async () => "X-1", importMany: async () => {},
  rosterAll: async () => [], rosterSet: async () => {}, rosterDelete: async () => {},
  notify: async () => {}, markNotifRead: async () => {},
  signOut: async () => {}, refreshRoster: async () => {},
  getConfig: async () => null, setConfig: async () => {},
};
window.__seedError = null;
async function seed(coll, file, pick) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const arr = pick ? pick(json) : json;
      if (!Array.isArray(arr) || !arr.length) throw new Error(file + " parsed but held no records");
      window.onFbData(coll, arr);
      return;
    } catch (e) {
      window.__seedError = String((e && e.message) || e);
      window.onFbData(coll, []);
      await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
    }
  }
}
await seed("parts", "sn5-parts.json");
await seed("workOrders", "sn5-work-orders.json", j => Array.isArray(j) ? j : (j.workOrders || []));
await seed("schedule", "sn5-schedule.json");
await seed("stock", "sn5-stock.json");
${APPLY_FIXTURES}
${APPLY_CONTENT}
window.onFbChange("ready");
window.__fixturesReady = true;
console.log("[populated] stub database — nothing here is saved, reload to reset");
`;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".stl": "model/stl", ".woff2": "font/woff2",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".pdf": "application/pdf", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json",
};

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || "/").split("?")[0]);
  if (path === "/fb.js") {
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
    return res.end(STUB);
  }
  const rel = path.replace(/^\/+/, "") || "index.html";
  for (const cand of [rel, join(rel, "index.html")]) {
    try {
      const buf = await readFile(join(APP, cand));
      res.writeHead(200, {
        "content-type": MIME[extname(cand)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      return res.end(buf);
    } catch { /* try the next candidate */ }
  }
  res.writeHead(404); res.end("not here");
}).listen(PORT, "127.0.0.1", function () {
  console.log(`populated app: http://127.0.0.1:${this.address().port}/index.html`);
});
