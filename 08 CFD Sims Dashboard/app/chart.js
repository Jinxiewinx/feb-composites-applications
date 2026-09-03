/* chart.js — one small line chart, as an SVG string. The design system has
   no chart vocabulary on purpose, so this is the CFD app's own and stays
   here. One series per chart (two measures of different scale get two
   charts, never two axes). Marks per the dataviz rules: a 2 px line, 8 px
   markers with a surface ring, a recessive baseline and gridlines, text in
   ink tokens, the series colour only on the marks, the last point labelled
   directly. Hover: every marker carries a <title> and a wide hit target. */

import { esc, fmtN } from "./util.js";

/* points: [{ x: number, label: string, y: number|null, title: string }] in
   plot order. Nulls are gaps: drawn as a break in the line and counted in
   the caption. */
export function lineChart({ points, unit = "", digits = 0, height = 180, color = "var(--accent)", id = "" }) {
  const W = 640, H = height, L = 52, R = 18, T = 14, B = 34;
  const pw = W - L - R, ph = H - T - B;
  const have = points.filter(p => p.y != null && isFinite(p.y));
  if (have.length === 0) return `<div class="trend-empty">No numbers to plot yet.</div>`;
  const ys = have.map(p => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  if (Math.min(...ys) >= 0 && lo < 0) lo = 0;
  const n = points.length;
  const xAt = i => n === 1 ? L + pw / 2 : L + (i / (n - 1)) * pw;
  const yAt = v => T + (1 - (v - lo) / (hi - lo)) * ph;
  // Ticks: three or four round values.
  const step = niceStep((hi - lo) / 3);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  // The line, broken at gaps.
  let d = "", pen = false;
  points.forEach((p, i) => {
    if (p.y == null || !isFinite(p.y)) { pen = false; return; }
    d += (pen ? " L" : " M") + xAt(i).toFixed(1) + " " + yAt(p.y).toFixed(1); pen = true;
  });
  const last = [...points].reverse().find(p => p.y != null && isFinite(p.y));
  const lastI = points.lastIndexOf(last);
  const gaps = n - have.length;
  const uid = id || "c" + Math.random().toString(36).slice(2, 7);
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${uid}-t" preserveAspectRatio="none">
    <title id="${uid}-t">${esc(points.map(p => `${p.label}: ${p.y == null ? "no value" : fmtN(p.y, digits) + unit}`).join(", "))}</title>
    <g class="grid">${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${yAt(v).toFixed(1)}" y2="${yAt(v).toFixed(1)}"/>`).join("")}</g>
    <g class="ticks">${ticks.map(v => `<text x="${L - 8}" y="${(yAt(v) + 4).toFixed(1)}" text-anchor="end">${fmtN(v, digits)}</text>`).join("")}</g>
    <line class="axis" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/>
    <g class="xlabels">${points.map((p, i) => `<text x="${xAt(i).toFixed(1)}" y="${H - 12}" text-anchor="middle">${esc(p.label)}</text>`).join("")}</g>
    <path class="line" d="${d.trim()}" style="stroke:${color}"/>
    <g class="marks">${points.map((p, i) => p.y == null || !isFinite(p.y) ? "" :
      `<g class="mark"><circle class="hit" cx="${xAt(i).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="14"><title>${esc(p.title || p.label)}: ${fmtN(p.y, digits)}${esc(unit)}</title></circle>
       <circle class="dot" cx="${xAt(i).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="4" style="fill:${color}"/></g>`).join("")}</g>
    ${last ? `<text class="lastlbl" x="${(xAt(lastI) + (lastI === n - 1 ? -8 : 8)).toFixed(1)}" y="${(yAt(last.y) - 9).toFixed(1)}" text-anchor="${lastI === n - 1 ? "end" : "start"}">${fmtN(last.y, digits)}${esc(unit)}</text>` : ""}
  </svg>${gaps ? `<div class="trend-note">${gaps} report${gaps > 1 ? "s have" : " has"} no value for this yet.</div>` : ""}`;
}
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
