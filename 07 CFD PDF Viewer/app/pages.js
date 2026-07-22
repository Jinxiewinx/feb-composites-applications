/* pages.js — the side-by-side page view and its scroll sync.

   Sync is done in STRIP coordinates (PDF points from the top of page 1), not in
   pixels. Two reports rendered at different column widths have different pixel
   heights, so matching scrollTop directly would drift apart the further down you
   go. Converting to points and back keeps them locked wherever you are, and
   keeps working if the columns are ever different widths.

   The lock is a toggle rather than a mode: unlock to scroll one report on its
   own, then Re-sync snaps everything back to whichever column you last touched.
   That is the "look at this one bit closer, then carry on together" move. */

import { S, el, esc } from "./core.js";
import { renderPage, panelRange } from "./render.js";

const COL_GAP = 22;              // page margin inside a column
let cols = [];                   // { doc, scroller, scale }
let leader = 0;                  // last column the user actually scrolled
let syncing = false;             // reentrancy guard while mirroring scroll

export function setSync(on) {
  S.sync = on;
  if (on) resyncColumns();
}

/* Re-sync realigns the columns AND turns tracking back on. Matching them once
   and leaving them loose was the old behaviour, and it was useless: the very
   next scroll pulled them apart again. "Snap back to tracking" is one action. */
export function resyncAndLock() {
  S.sync = true;
  matchZoomToLeader();
  resyncColumns();
}

/* Strip position currently at the top of a column's viewport. */
function stripTop(c) {
  return (c.scroller.scrollTop - COL_GAP) / c.scale;
}
function scrollToStrip(c, absY, behavior) {
  const top = absY * c.scale + COL_GAP;
  if (behavior) c.scroller.scrollTo({ top, behavior });
  else c.scroller.scrollTop = top;
}

export function resyncColumns() {
  if (!cols.length) return;
  const src = cols[Math.min(leader, cols.length - 1)];
  const y = stripTop(src);
  syncing = true;
  for (const c of cols) if (c !== src) scrollToStrip(c, y);
  requestAnimationFrame(() => { syncing = false; });
}

export function scrollToPanel(panelId) {
  syncing = true;
  for (const c of cols) {
    const p = c.doc.index.panels.find(q => q.id === panelId);
    if (!p) continue;
    scrollToStrip(c, p.absY - 10, "smooth");
    markPanel(c, p);
  }
  requestAnimationFrame(() => { syncing = false; });
}

/* Flash a box around the panel that was jumped to. In a wall of near-identical
   contour plots, "it scrolled somewhere" is not the same as "I can see it". */
function markPanel(c, panel) {
  c.scroller.querySelectorAll(".panelmark").forEach(n => n.remove());
  const r = panelRange(panel);
  const box = el("div", "panelmark");
  box.style.top = (r.absY * c.scale + COL_GAP) + "px";
  box.style.height = (r.height * c.scale) + "px";
  box.style.left = "0"; box.style.right = "0";
  c.strip.appendChild(box);
  setTimeout(() => box.classList.add("fade"), 1400);
  setTimeout(() => box.remove(), 2100);
}

export function renderPages(main) {
  cols = [];
  const wrap = el("div", "cols");
  const ready = S.docs.filter(d => d.index);

  for (const doc of ready) {
    const col = el("div", "col");
    col.innerHTML = `<div class="col-h">
      <span class="swatch" style="background:${doc.color}"></span>
      <span class="nm">${esc(doc.name)}</span>
      <span class="meta">${doc.index.numPages} pages</span>
    </div>`;

    const scroller = el("div", "scroller");
    const strip = el("div", "strip");
    strip.style.position = "relative";
    scroller.appendChild(strip);
    col.appendChild(scroller);
    wrap.appendChild(col);

    cols.push({ doc, scroller, strip, scale: 1, zoom: S.fit ? 1 : S.zoom, slots: [] });
  }
  main.appendChild(wrap);

  // Width is known only once the columns are in the DOM.
  for (const c of cols) {
    c.scale = fitScale(c) * c.zoom;
    buildStrip(c);
  }

  for (const [i, c] of cols.entries()) {
    /* Trackpad pinch arrives as a wheel event with ctrlKey set, which is the
       only signal Chromium gives for it. Cmd-scroll is handled too since that
       is the other habit people have. preventDefault stops the browser zooming
       the whole UI out from under the app. */
    c.scroller.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = c.scroller.getBoundingClientRect();
      /* A trackpad pinch sends a stream of small deltas; a mouse wheel with ctrl
         held sends one of about 120. Clamping per event keeps the pinch smooth
         without letting a single wheel notch jump three times the scale. */
      const d = Math.max(-25, Math.min(25, e.deltaY));
      zoomBy(Math.exp(-d * 0.01), { col: c, offsetPx: e.clientY - rect.top });
      if (typeof onZoomChange === "function") onZoomChange();
    }, { passive: false });

    c.scroller.addEventListener("scroll", () => {
      if (!syncing) leader = i;
      draw(c);
      if (S.sync && !syncing) {
        syncing = true;
        const y = stripTop(c);
        for (const o of cols) if (o !== c) { scrollToStrip(o, y); draw(o); }
        requestAnimationFrame(() => { syncing = false; });
      }
    }, { passive: true });
  }

  // Restore roughly where the user was, so switching tabs is not a reset.
  if (S.panelId) {
    const p = ready[0]?.index.panels.find(q => q.id === S.panelId);
    if (p) for (const c of cols) scrollToStrip(c, p.absY - 10);
  }
  cols.forEach(draw);
}

/* ---------- zoom ---------- */

/* Base scale that makes a page exactly fit the column width. */
function fitScale(c) {
  const avail = c.scroller.clientWidth - COL_GAP * 2;
  return avail / c.doc.index.pages[0].width;
}

/* Apply a zoom factor to one column, keeping `anchorY` (a strip position) at the
   same place on screen. Rebuilds the strip in place instead of re-rendering the
   whole view, so zooming no longer throws you back to page 1. */
function applyZoom(c, zoom, anchorY, anchorOffsetPx) {
  c.zoom = Math.max(0.15, Math.min(6, zoom));
  c.scale = fitScale(c) * c.zoom;
  buildStrip(c);
  if (anchorY != null) c.scroller.scrollTop = anchorY * c.scale + COL_GAP - (anchorOffsetPx || 0);
  draw(c);
}

/* Notifies core.js so the zoom readout in the toolbar stays truthful. */
let onZoomChange = null;
export function setZoomListener(fn) { onZoomChange = fn; }

/* Zoom every column when tracking is on, otherwise only the one under the
   pointer. Same rule as scrolling: locked means together, free means alone.
   `origin` is { col, offsetPx } when a pinch drove it, so the point under the
   fingers stays put. */
export function zoomBy(factor, origin) {
  if (!cols.length) return;
  const originCol = origin?.col || cols[Math.min(leader, cols.length - 1)];
  const targets = S.sync ? cols : [originCol];
  for (const c of targets) {
    const anchorOffset = (c === originCol && origin) ? origin.offsetPx : c.scroller.clientHeight / 2;
    const anchorY = (c.scroller.scrollTop + anchorOffset - COL_GAP) / c.scale;
    applyZoom(c, c.zoom * factor, anchorY, anchorOffset);
  }
  S.zoom = originCol.zoom;
  S.fit = false;
}

export function zoomFit() {
  for (const c of cols) {
    const anchorY = (c.scroller.scrollTop - COL_GAP) / c.scale;
    c.zoom = 1;
    applyZoom(c, 1, anchorY, 0);
  }
  S.zoom = 1; S.fit = true;
}

function matchZoomToLeader() {
  if (!cols.length) return;
  const src = cols[Math.min(leader, cols.length - 1)];
  for (const c of cols) {
    if (c === src || c.zoom === src.zoom) continue;
    const anchorY = (c.scroller.scrollTop - COL_GAP) / c.scale;
    applyZoom(c, src.zoom, anchorY, 0);
  }
}

export function currentZoom() { return cols.length ? cols[0].zoom : 1; }

/* Placeholders sized to the real page, so the scrollbar is honest before
   anything has rendered. Canvases drop in as they scroll into view. */
function buildStrip(c) {
  const { strip, doc, scale } = c;
  strip.innerHTML = "";
  c.slots = [];
  let y = COL_GAP;
  const colW = c.scroller.clientWidth;
  for (const p of doc.index.pages) {
    const w = p.width * scale, h = p.height * scale;
    // Centre the page when it is narrower than the column; when it is wider,
    // sit at the gutter and let the column scroll sideways.
    const left = Math.max(COL_GAP, (colW - w) / 2);
    const box = el("div", "pagewrap");
    box.style.position = "absolute";
    box.style.top = y + "px";
    box.style.left = left + "px";
    box.style.width = w + "px";
    box.style.height = h + "px";
    box.innerHTML = `<div class="placeholder">page ${p.index}</div><div class="pagenum">${p.index}</div>`;
    strip.appendChild(box);
    c.slots.push({ page: p.index, box, done: false, y, h });
    y += h + 10;
  }
  strip.style.height = (y + COL_GAP) + "px";
}

/* Render the pages near the viewport, nearest first. */
function draw(c) {
  const top = c.scroller.scrollTop, vh = c.scroller.clientHeight;
  const pad = vh * 0.75;
  const wanted = c.slots.filter(s => s.y + s.h > top - pad && s.y < top + vh + pad && !s.done);
  wanted.sort((a, b) => Math.abs(a.y - top) - Math.abs(b.y - top));
  for (const slot of wanted) {
    slot.done = true;
    renderPage(c.doc, slot.page, c.scale).then(({ canvas }) => {
      if (!slot.box.isConnected) return;
      const ph = slot.box.querySelector(".placeholder");
      if (ph) ph.remove();
      const existing = slot.box.querySelector("canvas");
      if (existing) existing.remove();
      slot.box.insertBefore(canvas, slot.box.firstChild);
    }).catch(() => { slot.done = false; });
  }
}
