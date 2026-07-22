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

    cols.push({ doc, scroller, strip, scale: 1, slots: [] });
  }
  main.appendChild(wrap);

  // Width is known only once the columns are in the DOM.
  for (const c of cols) {
    const avail = c.scroller.clientWidth - COL_GAP * 2;
    const pageW = c.doc.index.pages[0].width;
    c.scale = S.fit ? avail / pageW : (avail / pageW) * S.zoom;
    buildStrip(c);
  }

  for (const [i, c] of cols.entries()) {
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

/* Placeholders sized to the real page, so the scrollbar is honest before
   anything has rendered. Canvases drop in as they scroll into view. */
function buildStrip(c) {
  const { strip, doc, scale } = c;
  strip.innerHTML = "";
  c.slots = [];
  let y = COL_GAP;
  for (const p of doc.index.pages) {
    const w = p.width * scale, h = p.height * scale;
    const box = el("div", "pagewrap");
    box.style.position = "absolute";
    box.style.top = y + "px";
    box.style.left = (COL_GAP) + "px";
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
