/* core.js — state, document loading, the shell, and the library wiring.

   Ported from 07 CFD PDF Viewer/app/core.js on 2026-09-02. What changed in
   the port: the Electron bridge is gone, the demo button is gone (the sample
   report lives in the library instead), reports come from a shared library
   (library.js) as well as from local files, the URL carries what is open, and
   the view rows come from indexer.js's matchPanels() instead of an inlined
   copy of it.

   This app uses ES modules rather than the classic global-scope scripts the
   composites app uses. pdf.js ships as a module and drags a module worker
   with it, so there is no honest way around it here.

   Everything the views need hangs off S. Views are pure-ish: they read S and
   rebuild their own subtree when render() is called. */

import * as pdfjs from "./vendor/pdf.mjs";
import { indexDocument, withContentSpace, matchPanels } from "./indexer.js";
import { clearCache, measureMargins } from "./render.js";
import { renderPages, resyncColumns, resyncAndLock, setSync, zoomBy, zoomFit, setZoomListener, currentZoom } from "./pages.js";
import { renderPanelView } from "./panels.js";
import { renderOverlay } from "./compare.js";
import { renderSummary } from "./summary.js";
import { renderSearch, focusSearch } from "./search.js";
import * as lib from "./library.js";

/* Bumped by hand at release time; tags are cfd-vX.Y.Z (see README). */
export const APP_VERSION = "0.1.0";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.mjs", import.meta.url).href;

const COLORS = ["#FDB515", "#5b8cff", "#34c88f", "#c07de8", "#ef8f5a", "#5ad2d2"];

export const S = {
  docs: [],
  tab: "pages",
  zoom: 1,               // multiplier on top of fit-width
  fit: true,
  sync: true,
  panelId: null,         // panel being compared / overlaid
  overlay: { mode: "swipe", a: 0, b: 1, blend: 0.5, swipe: 0.5, amp: 6 },
  query: "",
  library: null,         // null until the first snapshot; then the records, newest first
  libQuery: "",
  libError: null,
  addToLibrary: true,    // the checkbox: local files are uploaded as they open
  uploads: {},           // docId -> 0..1 while an upload is in flight
};

const TABS = [
  { id: "pages", label: "Pages" },
  { id: "panels", label: "Panels" },
  { id: "overlay", label: "Overlay" },
  { id: "summary", label: "Summary" },
];

export const $ = s => document.querySelector(s);
export const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
export function toast(msg, kind) {
  const t = el("div", "toast " + (kind || ""), esc(msg));
  $("#toasts").appendChild(t);
  setTimeout(() => { t.classList.add("hide"); setTimeout(() => t.remove(), 350); }, 3200);
}
const fmtMB = b => (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + " MB";
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

/* ---------- loading ---------- */

let seq = 0;
/* sources: [{ name, data: Uint8Array } | { name, file: File }], optionally with
   reportId when the bytes came from the library. Returns the docs it made
   (null where a source failed), so a caller can go on to upload them. */
export async function addDocs(sources) {
  const made = [];
  for (const src of sources) {
    const id = "d" + (++seq);
    const doc = {
      id, name: src.name.replace(/\.pdf$/i, ""), color: COLORS[(S.docs.length) % COLORS.length],
      pdf: null, index: null, loading: true, reportId: src.reportId || null,
    };
    S.docs.push(doc);
    renderChrome();
    try {
      const data = src.data || new Uint8Array(await src.file.arrayBuffer());
      // Keep the loading task: in pdf.js 6 the document proxy has no destroy(),
      // so tearing a report down goes through the task, not the proxy.
      // pdf.js transfers the buffer to its worker (detaching it), so the caller
      // keeps its own copy if it still needs the bytes: see ingest().
      doc.task = pdfjs.getDocument({ data });
      doc.pdf = await doc.task.promise;
      doc.index = await indexDocument(doc.pdf);
      // Drop the page print margins so a plot spanning a page break renders as
      // one continuous image. Needs a canvas, so it runs here rather than inside
      // the (node-testable) indexer.
      const margins = await measureMargins(doc);
      doc.index = withContentSpace(doc.index, margins);
      doc.loading = false;
      made.push(doc);
      renderChrome(); render();
    } catch (e) {
      console.error(e);
      S.docs = S.docs.filter(d => d.id !== id);
      made.push(null);
      toast("Could not read " + src.name + ": " + (e && e.message), "err");
      renderChrome(); render();
    }
  }
  // Two documents is the case the app is for, so start comparing immediately.
  if (S.docs.length >= 2 && !S.panelId) {
    const first = S.docs[0].index?.panels?.[0];
    if (first) S.panelId = first.id;
  }
  return made;
}

export function removeDoc(id) {
  const d = S.docs.find(x => x.id === id);
  // Tear down through the loading task, guarded: a failed teardown must never
  // stop the report from being removed from the list, which is the bug this
  // replaces (destroy() threw and the filter below never ran).
  try { d?.task?.destroy?.(); } catch (e) { console.warn("pdf teardown failed", e); }
  clearCache(id);
  S.docs = S.docs.filter(x => x.id !== id);
  if (S.overlay.a >= S.docs.length) S.overlay.a = 0;
  if (S.overlay.b >= S.docs.length) S.overlay.b = Math.min(1, S.docs.length - 1);
  renderChrome(); render();
}

/* Local files, from the picker or a drop. Each is opened first (so the
   indexer's page and panel counts exist), then uploaded to the library unless
   the checkbox says not to. The upload gets the original bytes; the viewer
   got a copy, because pdf.js detaches what it is handed. */
async function ingest(files) {
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const [doc] = await addDocs([{ name: f.name, data: bytes.slice() }]);
    if (!doc || !S.addToLibrary) continue;
    if (bytes.byteLength >= lib.MAX_BYTES) { toast(`${doc.name}: open, but over the library's ${fmtMB(lib.MAX_BYTES)} limit, so not uploaded`, "err"); continue; }
    S.uploads[doc.id] = 0; renderChrome();
    try {
      const rec = await lib.upload(bytes, f.name, { pages: doc.index.numPages, panels: doc.index.panels.length },
        p => { S.uploads[doc.id] = p; renderChrome(); });
      doc.reportId = rec.id;
      if (rec.existing) toast(`Already in the library as "${rec.name}"`);
      else toast(`Added "${rec.name}" to the library`);
    } catch (e) {
      console.error(e);
      toast("Upload failed: " + (e?.message || e), "err");
    } finally {
      delete S.uploads[doc.id]; renderChrome(); syncUrl();
    }
  }
}

/* A library record: fetch its bytes and open it, once. */
export async function openReport(rec) {
  if (S.docs.some(d => d.reportId === rec.id)) { toast(`"${rec.name}" is already open`); return; }
  const id = "d" + (seq + 1);
  S.uploads[id] = -1; // -1: downloading, indeterminate
  try {
    const data = await lib.fetchBytes(rec);
    await addDocs([{ name: rec.name, data, reportId: rec.id }]);
  } catch (e) {
    console.error(e);
    toast("Could not open " + rec.name + ": " + (e?.message || e), "err");
  } finally {
    delete S.uploads[id]; renderChrome(); syncUrl();
  }
}

async function renameReport(rec) {
  const name = prompt("Rename report", rec.name);
  if (name == null || !name.trim() || name.trim() === rec.name) return;
  try {
    await lib.rename(rec.id, name);
    for (const d of S.docs) if (d.reportId === rec.id) d.name = lib.cleanName(name);
    renderChrome(); render();
  } catch (e) { toast("Rename failed: " + (e?.message || e), "err"); }
}
async function deleteReport(rec) {
  if (!confirm(`Delete "${rec.name}" from the shared library?\n\nEveryone loses it. Anything open stays open until closed.`)) return;
  try {
    await lib.remove(rec);
    for (const d of S.docs) if (d.reportId === rec.id) d.reportId = null;
    toast(`Deleted "${rec.name}"`);
    renderChrome(); syncUrl();
  } catch (e) { toast("Delete failed: " + (e?.message || e), "err"); }
}

/* ---------- panels helpers shared by the views ---------- */

/* One row per plot name across every open report, in report order, with a
   cell per report (null where that report lacks the plot). matchPanels() is
   the tested implementation in indexer.js; 07 carried an untested copy. */
export function panelRows() {
  const withIx = S.docs.filter(d => d.index);
  if (!withIx.length) return [];
  const rows = matchPanels(withIx.map(d => d.index));
  for (const r of rows) r.order = (r.cells.find(Boolean) || {}).order ?? 0;
  return rows;
}
export function currentRow() {
  const rows = panelRows();
  return rows.find(r => r.id === S.panelId) || rows[0] || null;
}
export function selectPanel(id, opts = {}) {
  S.panelId = id;
  syncUrl();
  if (S.tab === "pages" && !opts.stay) {
    // In page view, jumping to a panel scrolls every column to it.
    import("./pages.js").then(m => m.scrollToPanel(id));
    renderChrome();
    return;
  }
  render(); renderChrome();
}

/* ---------- URL state ---------- */

/* ?open=RPT-A,RPT-B&tab=overlay&panel=Contours/velo-wing-3 — enough to send
   someone a comparison. Only library reports can be named; a local file that
   was not uploaded has no id and simply does not appear. */
function syncUrl() {
  const p = new URLSearchParams();
  const ids = S.docs.map(d => d.reportId).filter(Boolean);
  if (ids.length) p.set("open", ids.join(","));
  if (S.tab !== "pages") p.set("tab", S.tab);
  if (S.panelId && S.tab !== "pages") p.set("panel", S.panelId);
  const qs = p.toString();
  const next = location.pathname + (qs ? "?" + qs : "");
  if (next !== location.pathname + location.search) history.replaceState(null, "", next);
}
let urlApplied = false;
async function applyUrl() {
  if (urlApplied || !S.library) return;
  urlApplied = true;
  const p = new URLSearchParams(location.search);
  const tab = p.get("tab"); if (TABS.some(t => t.id === tab)) S.tab = tab;
  const panel = p.get("panel");
  const ids = (p.get("open") || "").split(",").filter(Boolean);
  const missing = [];
  for (const id of ids) {
    const rec = S.library.find(r => r.id === id);
    if (rec) await openReport(rec); else missing.push(id);
  }
  if (missing.length) toast(`Not in the library any more: ${missing.join(", ")}`, "err");
  if (panel && panelRows().some(r => r.id === panel)) S.panelId = panel;
  render(); renderChrome();
}

/* ---------- chrome ---------- */

export function renderChrome() {
  const tabs = $("#tabs");
  tabs.innerHTML = "";
  for (const t of TABS) {
    const b = el("button", S.tab === t.id ? "active" : "", t.label);
    b.onclick = () => { S.tab = t.id; render(); renderChrome(); syncUrl(); };
    b.disabled = (t.id === "overlay" || t.id === "summary") && S.docs.length < 2;
    tabs.appendChild(b);
  }

  // Open reports.
  const list = $("#doclist");
  list.innerHTML = "";
  for (const d of S.docs) {
    const row = el("div", "doc" + (d.loading ? " loading" : ""));
    const up = S.uploads[d.id];
    const meta = d.loading ? "reading…" : up != null && up >= 0 ? `uploading ${Math.round(up * 100)}%` : d.index.numPages + "p · " + d.index.panels.length;
    row.innerHTML = `<span class="swatch" style="background:${d.color}"></span>
      <span class="nm" title="${esc(d.name)}">${esc(d.name)}</span>
      <span class="meta">${esc(meta)}</span>`;
    if (up != null && up >= 0) row.appendChild(el("div", "prog", `<i style="width:${Math.round(up * 100)}%"></i>`));
    const x = el("button", "x", "✕");
    x.title = "Close this report";
    x.onclick = () => { removeDoc(d.id); syncUrl(); };
    row.appendChild(x);
    list.appendChild(row);
  }
  $("#doclist-empty").hidden = S.docs.length > 0;
  $("#addtolib").checked = S.addToLibrary;

  // The library.
  const ll = $("#liblist");
  ll.innerHTML = "";
  const q = S.libQuery.trim().toLowerCase();
  if (S.libError) ll.appendChild(el("div", "lib-note err", "Library unavailable: " + esc(S.libError)));
  else if (!S.library) ll.appendChild(el("div", "lib-note", "Loading the library…"));
  else {
    const recs = S.library.filter(r => !q || r.name.toLowerCase().includes(q) || (r.note || "").toLowerCase().includes(q));
    if (!S.library.length) ll.appendChild(el("div", "lib-note", "Nothing here yet. Open a PDF and it is added for everyone."));
    else if (!recs.length) ll.appendChild(el("div", "lib-note", "No report matches."));
    for (const r of recs) {
      const open = S.docs.find(d => d.reportId === r.id);
      const busy = Object.values(S.uploads).some(v => v === -1);
      const row = el("div", "doc lib" + (open ? " open" : ""));
      row.innerHTML = `<span class="swatch" style="background:${open ? open.color : "transparent"};border:1px solid ${open ? open.color : "var(--line)"}"></span>
        <span class="nm" title="${esc(r.note ? r.name + "\n" + r.note : r.name)}">${esc(r.name)}</span>
        <span class="meta">${r.pages}p · ${r.panels} · ${fmtMB(r.size)} · ${fmtDate(r.createdAt)}</span>`;
      const acts = el("span", "acts");
      const o = el("button", "sm", open ? "Open" : "Open"); o.disabled = !!open || busy; o.title = open ? "Already open" : "Open this report";
      o.onclick = () => openReport(r);
      const m = el("button", "sm ghost", "⋯"); m.title = "Rename or delete";
      m.onclick = () => {
        const c = prompt(`"${r.name}"\n\nType  rename  or  delete`, "rename");
        if (c === "rename") renameReport(r); else if (c === "delete") deleteReport(r);
      };
      acts.append(o, m);
      row.appendChild(acts);
      ll.appendChild(row);
    }
  }
  $("#libcount").textContent = S.library ? `${S.library.length}` : "";

  $("#synccontrols").style.display = S.tab === "pages" ? "" : "none";
  $("#synctoggle").classList.toggle("on", S.sync);
  $("#synctoggle").querySelector(".lbl").textContent = S.sync ? "Synced" : "Free";
  $("#resync").disabled = S.docs.length < 2;
  $(".ctl.zoom").style.display = (S.tab === "pages" || S.tab === "panels") ? "" : "none";
  const z = S.tab === "pages" && S.docs.length ? currentZoom() : S.zoom;
  $("#zoomlabel").textContent = S.fit ? "Fit" : Math.round(z * 100) + "%";
  renderSearch();
}

// Held aside because render() empties #main, which would otherwise destroy it.
const emptyState = $("#empty");

export function render() {
  const main = $("#main");
  main.innerHTML = "";
  if (!S.docs.length) { main.appendChild(emptyState); return; }
  if (S.tab === "pages") renderPages(main);
  else if (S.tab === "panels") renderPanelView(main);
  else if (S.tab === "overlay") renderOverlay(main);
  else if (S.tab === "summary") renderSummary(main);
}

/* ---------- wiring ---------- */

function pick() { $("#filepick").click(); }
$("#openbtn").onclick = pick;
$("#openbtn2").onclick = pick;
$("#addbtn").onclick = pick;
$("#filepick").onchange = e => {
  const files = [...e.target.files].filter(f => /\.pdf$/i.test(f.name));
  e.target.value = "";
  if (files.length) ingest(files);
};
$("#addtolib").onchange = e => { S.addToLibrary = e.target.checked; };
$("#libsearch").oninput = e => { S.libQuery = e.target.value; renderChrome(); };

$("#synctoggle").onclick = () => { S.sync = !S.sync; setSync(S.sync); renderChrome(); };
$("#resync").onclick = () => { resyncAndLock(); renderChrome(); toast("Tracking together again"); };

/* In page view the zoom controls rescale the columns in place, which keeps the
   scroll position. Elsewhere they still go through a re-render, since those
   views have nothing to preserve. */
const zoomStep = (factor) => {
  if (S.tab === "pages") { zoomBy(factor); renderChrome(); }
  else { S.fit = false; S.zoom = Math.max(0.15, Math.min(6, S.zoom * factor)); render(); renderChrome(); }
};
$("#zoomin").onclick = () => zoomStep(1.25);
$("#zoomout").onclick = () => zoomStep(1 / 1.25);
$("#zoomfit").onclick = () => {
  if (S.tab === "pages") { zoomFit(); renderChrome(); }
  else { S.fit = true; S.zoom = 1; render(); renderChrome(); }
};
setZoomListener(() => renderChrome());

// Drag and drop anywhere.
let dragDepth = 0;
addEventListener("dragenter", e => { e.preventDefault(); if (++dragDepth === 1) $("#drop").classList.add("on"); });
addEventListener("dragleave", e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $("#drop").classList.remove("on"); } });
addEventListener("dragover", e => e.preventDefault());
addEventListener("drop", e => {
  e.preventDefault(); dragDepth = 0; $("#drop").classList.remove("on");
  const files = [...(e.dataTransfer?.files || [])].filter(f => /\.pdf$/i.test(f.name));
  if (files.length) ingest(files);
  else toast("Those were not PDFs.", "err");
});

addEventListener("keydown", e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === "/" && !typing) { e.preventDefault(); focusSearch(); return; }
  if (typing) return;
  if (e.key === "s" || e.key === "S") { S.sync = !S.sync; setSync(S.sync); renderChrome(); }
  if (e.key === "r" || e.key === "R") { resyncColumns(); }
  if (e.key === "j" || e.key === "k") {
    const rows = panelRows(); if (!rows.length) return;
    const i = Math.max(0, rows.findIndex(r => r.id === S.panelId));
    const next = rows[Math.min(rows.length - 1, Math.max(0, i + (e.key === "j" ? 1 : -1)))];
    if (next) selectPanel(next.id);
  }
  if (e.key >= "1" && e.key <= "4") { S.tab = TABS[+e.key - 1].id; render(); renderChrome(); syncUrl(); }
});

addEventListener("resize", () => { if (S.docs.length) render(); });

$("#ver").textContent = "v" + APP_VERSION + (lib.usingEmulators ? " · emulators" : "");

renderChrome();
render();

lib.watchReports(recs => {
  S.library = recs; S.libError = null;
  renderChrome();
  applyUrl();
}, err => { S.libError = err?.code || err?.message || String(err); renderChrome(); });

// Handy in the console and used by the browser-driven checks.
window.CFD = { S, addDocs, ingest, openReport, render, renderChrome, panelRows, selectPanel, APP_VERSION };
