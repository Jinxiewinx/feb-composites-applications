/* shell.js — the composites-app chrome around the CFD app: sidebar, topbar,
   theme, rail, lightbox. Copied in shape from 06 Composites App/app/core.js
   (renderSidebar, renderTopbar, theme + rail, lightbox) and trimmed to what a
   two-tab app with no sign-in needs. The classes are the design system's
   (ds/components.css); the mark is this app's own.

   Inline onclick handlers reach these through window.cfd, which core.js
   assembles, because ES modules have no globals of their own. */

import { esc } from "./util.js";

/* The app mark: the favicon's paths, inline, so it stays crisp anywhere. A
   gold wing section with blue flow over and under it, on the navy tile. */
export function cfdMark(size = 26) {
  return `<svg class="feb-mark" width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" aria-hidden="true">
    <rect width="512" height="512" rx="112" fill="#00294d"/>
    <g stroke="#2f6be4" stroke-width="30" stroke-linecap="round">
      <path d="M92 168 C 190 168, 230 114, 330 114 C 380 114, 410 126, 430 138"/>
      <path d="M92 236 C 200 236, 240 176, 340 176 C 385 176, 412 194, 430 206"/>
      <path d="M92 404 C 200 404, 260 372, 350 372 C 390 372, 415 384, 430 396"/>
    </g>
    <path d="M84 330 C 150 262, 300 246, 440 300 C 330 318, 190 352, 84 330 Z" fill="#fdb515"/>
  </svg>`;
}

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  // Two panes side by side: the viewer's whole idea.
  viewer: '<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/><path d="M7 9v6M17 9v6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  _fallback: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
};
export function icon(name, size = 18) {
  const p = ICONS[name] || ICONS._fallback;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

export const TABS = [
  { id: "dashboard", label: "Dashboard", ic: "dashboard", tip: "Every report in the library, and how the numbers move by design point" },
  { id: "viewer", label: "Viewer", ic: "viewer", tip: "Open reports side by side: pages, plots, overlays, numbers" },
];

/* No theme toggle and no rail toggle: the app is always dark and the sidebar
   is always the icon rail (Simon, 2026-09-03). index.html sets both before
   first paint. */

export function renderSidebar(page) {
  document.getElementById("sidebar").innerHTML = `
    <div class="sb-brand" onclick="cfd.setTab('dashboard')" title="FEB CFD · Dashboard">${cfdMark(28)}</div>
    <div class="sb-nav">
      ${TABS.map(t => `<button class="sb-item ${page === t.id ? "active" : ""}" title="${esc(t.label)} · ${esc(t.tip)}" aria-label="${esc(t.label)}" onclick="cfd.setTab('${t.id}')">
        <span class="ic">${icon(t.ic, 20)}</span>
      </button>`).join("")}
    </div>`;
}

export function renderTopbar(page, version, extra = "") {
  const t = TABS.find(t => t.id === page);
  document.getElementById("topbar").innerHTML = `
    <h1>${esc(t ? t.label : "")}</h1>
    <div class="actions">
      <span class="muted tny tb-ver">v${esc(version)}</span>
      ${extra}
      <button class="primary" onclick="cfd.pick()">${icon("upload", 16)} Open PDFs</button>
    </div>`;
}

/* ---------- lightbox ----------
   The composites lightbox, without the pinch-zoom: opaque scrim, name and
   count on top, controls in a bottom bar where a thumb can reach them.
   Any <img data-lb-src> on the page opens it; the arrows walk every such
   image in the same [data-lbgroup] (or the document). */
export function lightboxHtml() {
  return `<div id="lightbox" role="dialog" aria-modal="true" aria-label="Image">
    <div class="lb-scrim" onclick="cfd.closeLightbox()"></div>
    <div class="lb-bar"><span class="lb-name" id="lb-name"></span><span id="lb-count" class="tny"></span></div>
    <div class="lb-stage" onclick="if(event.target===this)cfd.closeLightbox()"><img id="lb-img" alt=""></div>
    <div class="lb-actions">
      <button id="lb-prev" title="Previous" aria-label="Previous" onclick="cfd.lbStep(-1)">${icon("chevronLeft", 18)}</button>
      <button id="lb-next" title="Next" aria-label="Next" onclick="cfd.lbStep(1)">${icon("chevronRight", 18)}</button>
      <a id="lb-dl" download target="_blank" rel="noopener" title="Download" aria-label="Download">${icon("download", 18)}</a>
      <button id="lb-close" title="Close" aria-label="Close" onclick="cfd.closeLightbox()">${icon("x", 18)}</button>
    </div>
  </div>`;
}
let LB = [], LB_I = 0, LB_RETURN = null;
const lbSrc = el => el.getAttribute("data-lb-src") || el.getAttribute("src") || "";
function lbCollect(scope) {
  const seen = new Set();
  return [...(scope || document).querySelectorAll("img[data-lb-src]")].filter(el => {
    const s = lbSrc(el);
    if (!s || el.closest("#lightbox") || seen.has(s)) return false;
    seen.add(s); return true;
  });
}
function lbShow() {
  const el = LB[LB_I]; if (!el) return;
  const src = lbSrc(el);
  const img = document.getElementById("lb-img");
  img.src = src; img.alt = el.getAttribute("data-lb-name") || el.alt || "";
  document.getElementById("lb-name").textContent = el.getAttribute("data-lb-name") || el.alt || "";
  document.getElementById("lb-count").textContent = LB.length > 1 ? `${LB_I + 1} / ${LB.length}` : "";
  const dl = document.getElementById("lb-dl"); dl.href = src; dl.download = (el.getAttribute("data-lb-name") || "image").replace(/[^\w.-]+/g, "_") + ".png";
  document.getElementById("lb-prev").hidden = LB.length < 2;
  document.getElementById("lb-next").hidden = LB.length < 2;
}
export function openLightbox(img) {
  const box = document.getElementById("lightbox"); if (!box || !img) return;
  LB = lbCollect(img.closest("[data-lbgroup]") || document);
  LB_I = Math.max(0, LB.indexOf(img));
  LB_RETURN = img;
  box.classList.add("open");
  document.getElementById("app").inert = true;
  lbShow();
  document.getElementById("lb-close").focus();
}
export function closeLightbox() {
  const box = document.getElementById("lightbox"); if (!box) return;
  box.classList.remove("open");
  document.getElementById("app").inert = false;
  document.getElementById("lb-img").removeAttribute("src");
  if (LB_RETURN && LB_RETURN.focus) LB_RETURN.focus();
  LB = [];
}
export function lbStep(d) {
  if (LB.length < 2) return;
  LB_I = (LB_I + d + LB.length) % LB.length;
  lbShow();
}
export function lightboxOpen() { return !!document.querySelector("#lightbox.open"); }
export function installLightbox() {
  document.addEventListener("click", e => {
    const img = e.target.closest && e.target.closest("img[data-lb-src]");
    if (!img) return;
    e.preventDefault();
    openLightbox(img);
  });
  document.addEventListener("keydown", e => {
    if (!lightboxOpen()) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); closeLightbox(); }
    else if (e.key === "ArrowRight") lbStep(1);
    else if (e.key === "ArrowLeft") lbStep(-1);
  }, true);
}
