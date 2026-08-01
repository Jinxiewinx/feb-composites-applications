"use strict";
/* stackview.js — the exploded isometric view of a mold stack.
   This is the trust artifact. CS-003 §7.2 item 7 is a BLOCKER step: a reviewer
   who did not design the mold has to look at the stack plan and initial it
   before any board is glued or any machine slot booked. They cannot initial a
   table of numbers. They can initial a picture of the mold sitting inside the
   blocks.

   ============================================================================
   PROJECTION
   ============================================================================
        px = (x - y) * cos30
        py = (x + y) * sin30 - z          then negated for SVG's y-down axis

   Layers are drawn EXPLODED — pulled apart vertically by a fixed gap — which
   is not just for looks: separated layers cannot occlude one another, so the
   only depth ordering needed is bottom-to-top. Within a layer, blanks are
   disjoint by construction (see the merge rule in slicer.js), so they cannot
   occlude each other either. That removes the whole painter's-algorithm
   problem instead of solving it.

                       ___________              <- layer 3 blank (top face)
                      /__________/|
                       ___________              <- layer 2
                      /__________/|
                       ___________              <- layer 1 (widest: a plug)
                      /__________/|

   ============================================================================
   BLACK AND WHITE
   ============================================================================
   This prints on the laser at RFS. Every distinction survives grayscale: top
   faces are white with a heavy rule, sides are hatched, the mold outline is a
   dashed medium rule. Nothing depends on colour. Same rule the printed
   traveler follows. */

const ISO_COS30 = Math.cos(Math.PI / 6);
const ISO_SIN30 = 0.5;
const ISO_PAD = 24;         // svg padding, px
/* The explode gap has to scale with the mold. A fixed gap looks fine on a
   200mm part and turns a 500mm one into a pile of overlapping diamonds where
   nothing is separable and the layer labels collide. Proportional to the
   footprint, floored so a tiny mold still reads as a stack. */
function isoGap(layers) {
  let w = 0;
  layers.forEach(L => L.blanks.forEach(b => { w = Math.max(w, b.x1 - b.x0, b.y1 - b.y0); }));
  return Math.max(40, w * 0.45);
}

function isoPoint(x, y, z, s) {
  s = s || 1;
  return { px: (x - y) * ISO_COS30 * s, py: ((x + y) * ISO_SIN30 - z) * s };
}

/* One blank as a 3D slab: top face plus the two visible sides. */
function isoBoxFaces(b, zb, zt, s) {
  const P = (x, y, z) => isoPoint(x, y, z, s);
  return {
    top: [P(b.x0, b.y0, zt), P(b.x1, b.y0, zt), P(b.x1, b.y1, zt), P(b.x0, b.y1, zt)],
    // The two faces a viewer at +x +y +z can see.
    front: [P(b.x0, b.y1, zt), P(b.x1, b.y1, zt), P(b.x1, b.y1, zb), P(b.x0, b.y1, zb)],
    side: [P(b.x1, b.y0, zt), P(b.x1, b.y1, zt), P(b.x1, b.y1, zb), P(b.x1, b.y0, zb)],
  };
}
function ptsAttr(pts, ox, oy) { return pts.map(p => `${(p.px + ox).toFixed(1)},${(p.py + oy).toFixed(1)}`).join(" "); }

/* Render a sliced result as a standalone SVG string.
   `plan` is what slicer.js's sliceMold returned (or the saved record of it). */
function stackSvg(plan, opts) {
  opts = opts || {};
  const layers = (plan && plan.layers) || [];
  if (!layers.length) return `<div class="card"><span class="muted">Nothing to show yet — upload a mold to see its stack.</span></div>`;

  // Scale so the whole stack fits a sensible width, then measure for real.
  const width = opts.width || 720;
  const gap = isoGap(layers);
  const probe = [];
  layers.forEach((L, i) => {
    const zb = i * gap, zt = zb + L.thickness;
    L.blanks.forEach(b => {
      const f = isoBoxFaces(b, zb, zt, 1);
      probe.push(...f.top, ...f.front, ...f.side);
    });
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  probe.forEach(p => { minX = Math.min(minX, p.px); maxX = Math.max(maxX, p.px); minY = Math.min(minY, p.py); maxY = Math.max(maxY, p.py); });
  const s = (width - ISO_PAD * 2) / Math.max(1, maxX - minX);
  const h = (maxY - minY) * s + ISO_PAD * 2;
  const ox = ISO_PAD - minX * s, oy = ISO_PAD - minY * s;

  const parts = [];
  const labels = [];
  // Bottom layer first: with an exploded stack that is the entire depth order.
  layers.forEach((L, i) => {
    const zb = i * gap, zt = zb + L.thickness;
    L.blanks.forEach((b, bi) => {
      const f = isoBoxFaces(b, zb, zt, s);
      parts.push(`<polygon points="${ptsAttr(f.front, ox, oy)}" fill="url(#hatch)" stroke="currentColor" stroke-width="1"/>`);
      parts.push(`<polygon points="${ptsAttr(f.side, ox, oy)}" fill="url(#hatch)" stroke="currentColor" stroke-width="1"/>`);
      parts.push(`<polygon points="${ptsAttr(f.top, ox, oy)}" fill="var(--surface,#fff)" stroke="currentColor" stroke-width="1.8"/>`);
      if (bi === 0) {
        // Leftmost vertex of the diamond, so the label sits clear of every
        // slab. Collected, not drawn here: the next layer paints over this one.
        const c = isoPoint(b.x0, b.y1, zt, s);
        labels.push(`<text x="${(c.px + ox - 10).toFixed(1)}" y="${(c.py + oy + 4).toFixed(1)}" font-size="12" font-weight="600" text-anchor="end" fill="currentColor">L${i + 1}</text>`);
      }
    });
    // The mold's own outline, drawn on the layer's top face, so a reviewer can
    // see the part sitting inside the block rather than take it on trust.
    (L.islands || []).forEach(is => {
      const pts = (is.contour || []).map(p => isoPoint(p.x, p.y, zt, s));
      if (pts.length > 2) parts.push(`<polygon points="${ptsAttr(pts, ox, oy)}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5 3" opacity="0.75"/>`);
    });
  });

  return `<svg viewBox="0 0 ${width} ${Math.max(120, h).toFixed(0)}" width="100%" role="img"
    aria-label="Exploded isometric view of the mold stack, ${layers.length} layers">
    <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="0.8" opacity="0.45"/>
    </pattern></defs>
    ${parts.join("\n    ")}
    ${labels.join("\n    ")}
  </svg>`;
}

/* The numbers a person at the bench needs, next to the picture. */
function stackTable(plan) {
  const layers = (plan && plan.layers) || [];
  if (!layers.length) return "";
  return `<table class="list">
    <tr><th>Layer</th><th>Thickness</th><th>Blocks</th><th>Blank size</th><th>Datum offset</th></tr>
    ${layers.map((L, i) => L.blanks.map((b, bi) => `<tr>
      <td>${bi === 0 ? `<b>L${i + 1}</b>` : ""}</td>
      <td>${bi === 0 ? mmIn(L.thickness) : ""}</td>
      <td>${bi === 0 ? L.blanks.length : ""}</td>
      <td>${mmIn(b.x1 - b.x0)} &times; ${mmIn(b.y1 - b.y0)}</td>
      <td class="tny">X ${mmIn(b.x0)}, Y ${mmIn(b.y0)}</td>
    </tr>`).join("")).join("")}
  </table>`;
}
// Shop reads inches; the geometry is mm. Show both so nobody converts by hand.
function mmIn(mm) {
  if (!Number.isFinite(mm)) return "—";
  return `${(Math.round(mm * 10) / 10)} mm <span class="muted tny">(${(Math.round(mm / 25.4 * 100) / 100)}″)</span>`;
}
