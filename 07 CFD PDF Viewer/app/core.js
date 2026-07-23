/* core.js — state, document loading, and the shell.

   This app deliberately uses ES modules rather than the classic global-scope
   scripts the composites app uses. pdf.js ships as a module and drags a module
   worker with it, so there is no honest way around it here.

   Everything the views need hangs off S. Views are pure-ish: they read S and
   rebuild their own subtree when render() is called. */

import * as pdfjs from "./vendor/pdf.mjs";
import { indexDocument, withContentSpace } from "./indexer.js";
import { clearCache, measureMargins } from "./render.js";
import { renderPages, resyncColumns, resyncAndLock, setSync, zoomBy, zoomFit, setZoomListener, currentZoom } from "./pages.js";
import { renderPanelView } from "./panels.js";
import { renderOverlay } from "./compare.js";
import { renderSummary } from "./summary.js";
import { renderSearch, focusSearch } from "./search.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.mjs", import.meta.url).href;

const COLORS = ["#FDB515", "#4c8dd8", "#4ec98a", "#c07de8", "#ef8f5a", "#5ad2d2"];

export const S = {
  docs: [],
  tab: "pages",
  zoom: 1,               // multiplier on top of fit-width
  fit: true,
  sync: true,
  panelId: null,         // panel being compared / overlaid
  overlay: { mode: "swipe", a: 0, b: 1, blend: 0.5, swipe: 0.5, amp: 6 },
  query: "",
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

/* ---------- loading ---------- */

let seq = 0;
export async function addDocs(sources) {
  for (const src of sources) {
    const id = "d" + (++seq);
    const doc = {
      id, name: src.name.replace(/\.pdf$/i, ""), color: COLORS[(S.docs.length) % COLORS.length],
      pdf: null, index: null, loading: true,
    };
    S.docs.push(doc);
    renderChrome();
    try {
      const data = src.data || new Uint8Array(await src.file.arrayBuffer());
      // Keep the loading task: in pdf.js 6 the document proxy has no destroy(),
      // so tearing a report down goes through the task, not the proxy.
      doc.task = pdfjs.getDocument({ data });
      doc.pdf = await doc.task.promise;
      doc.index = await indexDocument(doc.pdf);
      // Drop the page print margins so a plot spanning a page break renders as
      // one continuous image. Needs a canvas, so it runs here rather than inside
      // the (node-testable) indexer.
      const margins = await measureMargins(doc);
      doc.index = withContentSpace(doc.index, margins);
      doc.loading = false;
      renderChrome(); render();
    } catch (e) {
      console.error(e);
      S.docs = S.docs.filter(d => d.id !== id);
      toast("Could not read " + src.name + ": " + (e && e.message), "err");
      renderChrome(); render();
    }
  }
  // Two documents is the case the app is for, so start comparing immediately.
  if (S.docs.length >= 2 && !S.panelId) {
    const first = S.docs[0].index?.panels?.[0];
    if (first) S.panelId = first.id;
  }
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

async function loadSample() {
  try {
    const res = await fetch("../DP_22.pdf");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    // Loaded twice on purpose: with two identical reports the difference view
    // must come out completely blank, which is the quickest way to see that
    // alignment and rendering are correct.
    await addDocs([
      { name: "DP_22 (A)", data: buf },
      { name: "DP_22 (B)", data: buf.slice() },
    ]);
  } catch (e) {
    toast("Sample not found. Serve the folder over HTTP, or open reports manually.", "err");
  }
}

/* ---------- panels helpers shared by the views ---------- */

export function panelRows() {
  if (!S.docs.length) return [];
  const withIx = S.docs.filter(d => d.index);
  if (!withIx.length) return [];
  const seen = new Set(); const rows = [];
  for (const d of withIx) {
    for (const p of d.index.panels) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      rows.push({ id: p.id, name: p.name, section: p.section, order: p.order,
        cells: withIx.map(dd => dd.index.panels.find(q => q.id === p.id) || null) });
    }
  }
  rows.sort((a, b) => a.order - b.order);
  return rows;
}
export function currentRow() {
  const rows = panelRows();
  return rows.find(r => r.id === S.panelId) || rows[0] || null;
}
export function selectPanel(id, opts = {}) {
  S.panelId = id;
  if (S.tab === "pages" && !opts.stay) {
    // In page view, jumping to a panel scrolls every column to it.
    import("./pages.js").then(m => m.scrollToPanel(id));
    renderChrome();
    return;
  }
  render(); renderChrome();
}

/* ---------- chrome ---------- */

export function renderChrome() {
  const tabs = $("#tabs");
  tabs.innerHTML = "";
  for (const t of TABS) {
    const b = el("button", S.tab === t.id ? "active" : "", t.label);
    b.onclick = () => { S.tab = t.id; render(); renderChrome(); };
    b.disabled = (t.id === "overlay" || t.id === "summary") && S.docs.length < 2;
    tabs.appendChild(b);
  }

  const list = $("#doclist");
  list.innerHTML = "";
  for (const d of S.docs) {
    const row = el("div", "doc" + (d.loading ? " loading" : ""));
    row.innerHTML = `<span class="swatch" style="background:${d.color}"></span>
      <span class="nm">${esc(d.name)}</span>
      <span class="meta">${d.loading ? "reading…" : d.index.numPages + "p · " + d.index.panels.length}</span>`;
    const x = el("button", "x", "✕");
    x.title = "Close this report";
    x.onclick = () => removeDoc(d.id);
    row.appendChild(x);
    list.appendChild(row);
  }

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

/* In Electron, go through the native dialog so it feels like a real app. In a
   browser, fall back to the hidden file input. Both end up in addDocs(). */
function pick() {
  if (window.cfdNative?.isElectron) {
    window.cfdNative.openDialog().then(files => {
      if (files?.length) addDocs(files.map(f => ({ name: f.name, data: new Uint8Array(f.bytes) })));
    });
  } else {
    $("#filepick").click();
  }
}
if (window.cfdNative?.isElectron) {
  window.cfdNative.onMenuOpen(() => pick());
  window.cfdNative.onTab(tab => { S.tab = tab; render(); renderChrome(); });
  // The window is frameless, so on macOS the toolbar has to leave room for the
  // traffic lights or they land on top of the brand.
  if (window.cfdNative.platform === "darwin") document.body.classList.add("electron-mac");
}
$("#openbtn").onclick = pick;
$("#openbtn2").onclick = pick;
$("#addbtn").onclick = pick;
$("#samplebtn").onclick = loadSample;
$("#filepick").onchange = e => {
  const files = [...e.target.files].map(f => ({ name: f.name, file: f }));
  e.target.value = "";
  if (files.length) addDocs(files);
};

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

// Drag and drop anywhere. Electron gets native dialogs too, but this is the path
// that works identically in both modes.
let dragDepth = 0;
addEventListener("dragenter", e => { e.preventDefault(); if (++dragDepth === 1) $("#drop").classList.add("on"); });
addEventListener("dragleave", e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $("#drop").classList.remove("on"); } });
addEventListener("dragover", e => e.preventDefault());
addEventListener("drop", e => {
  e.preventDefault(); dragDepth = 0; $("#drop").classList.remove("on");
  const files = [...(e.dataTransfer?.files || [])].filter(f => /\.pdf$/i.test(f.name));
  if (files.length) addDocs(files.map(f => ({ name: f.name, file: f })));
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
  if (e.key >= "1" && e.key <= "4") { S.tab = TABS[+e.key - 1].id; render(); renderChrome(); }
});

addEventListener("resize", () => { if (S.docs.length) render(); });

renderChrome();
render();

// Handy in the console and used by the browser-driven checks.
window.CFD = { S, addDocs, render, renderChrome, panelRows, selectPanel };
