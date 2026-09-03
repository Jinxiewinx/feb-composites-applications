/* dashboard.js — the landing page: the numbers, how they move by design
   point, the saved views, and every report in the library as a card.

   Written in the composites app's dashboard idiom (dashboard.js there): one
   card surface, Saira module headers with the gold slash, numerals on stat
   tiles, and an empty state that is a sentence carrying a fact rather than a
   hole. Returns an HTML string; core.js puts it in #main. */

import { S } from "./core.js";
import { esc, fmtMB, shortDate, fmtN } from "./util.js";
import { headline } from "./extract.js";
import { lineChart } from "./chart.js";
import { icon } from "./shell.js";

/* Reports in design-point order, unnumbered ones last in upload order. */
function ordered(recs) {
  const withDp = recs.filter(r => Number.isInteger(r.dp)).sort((a, b) => a.dp - b.dp || String(a.createdAt).localeCompare(String(b.createdAt)));
  const without = recs.filter(r => !Number.isInteger(r.dp)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return withDp.concat(without);
}
const dpLabel = r => Number.isInteger(r.dp) ? "DP " + r.dp : r.name.length > 8 ? r.name.slice(0, 7) + "…" : r.name;

export function renderDashboard() {
  const recs = S.library || [];
  const views = S.views || [];
  const seq = ordered(recs);
  const withNums = seq.filter(r => headline(r.results).downforce != null);
  const latest = withNums[withNums.length - 1] || null;
  const prev = withNums[withNums.length - 2] || null;
  const h = headline(latest && latest.results);
  const hp = headline(prev && prev.results);
  const delta = (a, b, digits) => a == null || b == null ? "" : `<span class="tny">${a - b >= 0 ? "+" : "−"}${fmtN(Math.abs(a - b), digits)} vs ${esc(dpLabel(prev))}</span>`;

  const stats = `<div class="stat-row dstats">
    <div class="stat-tile"><span class="bignum">${h.downforce == null ? "—" : fmtN(h.downforce) + " N"}</span>
      <div class="stat-label">Downforce${latest ? " · " + esc(dpLabel(latest)) : ""}</div>${h.cl != null ? `<div class="tny">Cl ${fmtN(-h.cl, 3)}</div>` : ""}${delta(h.downforce, hp.downforce, 0)}</div>
    <div class="stat-tile"><span class="bignum">${h.drag == null ? "—" : fmtN(h.drag) + " N"}</span>
      <div class="stat-label">Drag${latest ? " · " + esc(dpLabel(latest)) : ""}</div>${h.cd != null ? `<div class="tny">Cd ${fmtN(h.cd, 3)}</div>` : ""}${delta(h.drag, hp.drag, 0)}</div>
    <div class="stat-tile"><span class="bignum">${h.ld == null ? "—" : fmtN(h.ld, 2)}</span>
      <div class="stat-label">L/D${latest ? " · " + esc(dpLabel(latest)) : ""}</div>${delta(h.ld, hp.ld, 2)}</div>
    <div class="stat-tile"><span class="bignum">${recs.length}</span>
      <div class="stat-label">Reports in the library</div><div class="tny">${withNums.length === recs.length ? "all with numbers" : `${recs.length - withNums.length} without numbers yet`}</div></div>
  </div>`;

  const series = key => seq.map(r => { const hh = headline(r.results); return { x: r.dp, label: dpLabel(r), y: hh[key], title: r.name }; });
  const chartCard = (title, key, unit, digits, color) => `<div class="card trend-card">
    <div class="bmod-hd"><span>${esc(title)}</span><span class="gh-n tny">by design point</span></div>
    ${seq.length ? lineChart({ points: series(key), unit, digits, color, id: key }) : `<div class="dlane-empty">No reports yet. The first upload puts a point here.</div>`}
  </div>`;

  const viewsCard = `<div class="card">
    <div class="bmod-hd"><span>Saved views</span><span class="gh-n tny">${views.length || ""}</span></div>
    ${views.length ? `<div class="vlist">${views.map(v => {
      const names = (v.reports || []).map(id => { const r = recs.find(r => r.id === id); return r ? dpLabel(r) : id; });
      return `<div class="vrow">
        <button class="vopen" onclick="cfd.openView('${esc(v.id)}')" title="Open this view">${icon("bookmark", 15)} <b>${esc(v.name)}</b></button>
        <span class="tny">${esc(names.join(" vs "))} · ${shortDate(v.createdAt)}</span>
        <span class="vacts"><button class="icon-btn" title="Rename" aria-label="Rename view" onclick="cfd.renameView('${esc(v.id)}')">${icon("edit", 15)}</button>
        <button class="icon-btn" title="Delete" aria-label="Delete view" onclick="cfd.deleteView('${esc(v.id)}')">${icon("trash", 15)}</button></span>
      </div>`; }).join("")}</div>`
    : `<div class="dlane-empty">No saved views yet. Open two reports in the Viewer, set up the comparison, and press <b>Save view</b>; it lands here for everyone.</div>`}
  </div>`;

  const cards = recs.length ? `<div class="rgrid" data-lbgroup>${[...seq].reverse().map(reportCard).join("")}</div>`
    : `<div class="card"><div class="dlane-empty">The library is empty. Press <b>Open PDFs</b> and drop a Fluent report; it is uploaded for everyone, its numbers read off the report, and a card appears here.</div></div>`;

  return `<div class="dboard-cfd">
    ${S.libError ? `<div class="card"><div class="dlane-empty">The library could not be reached: <b>${esc(S.libError)}</b>.</div></div>` : ""}
    ${stats}
    <div class="trend-row">${chartCard("Downforce", "downforce", " N", 0, "var(--accent)")}${chartCard("Drag", "drag", " N", 0, "var(--gold)")}</div>
    ${viewsCard}
    <div class="bmod-hd rgrid-hd"><span>Reports</span><span class="gh-n tny">${recs.length}${recs.length ? ", newest design point first" : ""}</span></div>
    ${cards}
  </div>`;
}

function reportCard(r) {
  const h = headline(r.results);
  const open = S.docs.some(d => d.reportId === r.id);
  const thumb = r.thumb && r.thumb.url
    ? `<img class="phimg rthumb" loading="lazy" src="${esc(r.thumb.url)}" data-lb-src="${esc(r.thumb.url)}" data-lb-name="${esc(r.name + " · " + r.thumb.panel)}" alt="${esc(r.thumb.panel)} from ${esc(r.name)}">
       <div class="tny rthumb-cap">${esc(r.thumb.panel)}</div>`
    : `<div class="rthumb rthumb-none tny">No picture yet. Opening the report once renders one.</div>`;
  const m = r.meta || {};
  return `<div class="card rcard${open ? " open" : ""}">
    ${thumb}
    <div class="rcard-hd"><b class="rname" title="${esc(r.name)}">${esc(r.name)}</b>${Number.isInteger(r.dp) ? `<span class="pill">DP ${r.dp}</span>` : ""}</div>
    <div class="tny">${shortDate(r.createdAt)}${m.analyst ? " · " + esc(m.analyst) : ""}${m.cells ? " · " + fmtN(m.cells / 1e6, 1) + " M cells" : ""} · ${fmtMB(r.size)}</div>
    ${r.note ? `<div class="rnote">${esc(r.note)}</div>` : `<button class="link rnote none" onclick="cfd.editNote('${esc(r.id)}')">Add a note about this run</button>`}
    <div class="numrow">
      <span><b>${h.downforce == null ? "—" : fmtN(h.downforce) + " N"}</b><span class="tny">downforce</span></span>
      <span><b>${h.drag == null ? "—" : fmtN(h.drag) + " N"}</b><span class="tny">drag</span></span>
      <span><b>${h.ld == null ? "—" : fmtN(h.ld, 2)}</b><span class="tny">L/D</span></span>
      <span><b>${h.cl == null ? "—" : fmtN(-h.cl, 2)}</b><span class="tny">Cl</span></span>
      <span><b>${h.cd == null ? "—" : fmtN(h.cd, 3)}</b><span class="tny">Cd</span></span>
    </div>
    <div class="rcard-acts">
      <button class="${open ? "" : "primary"}" onclick="cfd.openInViewer('${esc(r.id)}')">${open ? "Show in Viewer" : "Open in Viewer"}</button>
      <button class="icon-btn" title="Rename, note or delete" aria-label="More" onclick="cfd.reportMenu('${esc(r.id)}')">${icon("more", 18)}</button>
    </div>
  </div>`;
}
