"use strict";
/* drawings.js — the printed engineering drawing set for a mold stack plan.

   WHY THIS EXISTS
   ===============
   The plan page already answers "does the mold fit inside the blocks?" twice:
   meshview.js does it in 3D, stackview.js does it as the exploded isometric
   that gets initialled for the CS-003 §7.2 review. Neither answers the question
   the person GLUING has.

   The boards are glued by hand. Somebody stands at a table with a tape measure
   and has to put layer 3 down on layer 2 in the right place. That number exists
   today only as the "Datum offset" column in stackTable() — an absolute X/Y in
   the mold's CAD frame, which is not something you can measure against a board
   edge. This file turns the plan into a drawing you can work from:

     sheet 1        general view, assembled isometric
     sheet 2        three-view, third angle
     sheet 3..2+N   one per layer: this board, and where it lands on the one below

   ============================================================================
   EVERYTHING IS DRAWN IN PAGE COORDINATES
   ============================================================================
   A view exposes X(x)/Y(y), which map model millimetres onto the sheet. Every
   dimension line, arrowhead and label is emitted in PAGE units at a fixed point
   size. This is the whole reason the drawings survive a 900mm mold and a 90mm
   one at the same time: if furniture were drawn in model space and scaled with
   the geometry, the text would be unreadable on one and cartoonish on the other.
   The scale only ever enters through X() and Y().

   ============================================================================
   BLACK AND WHITE
   ============================================================================
   Same constraint as stackview.js and the traveler: this prints on the laser at
   RFS. Meaning is carried by rule weight and dash pattern, never by hue —
   blocks heavy solid, mold medium dashed, the layer below thin dash-dot,
   dimensions thin solid, a section split heavy.

   ============================================================================
   UNITS
   ============================================================================
   Geometry is millimetres (slicer.js's frame, unchanged). Dimensions PRINT as
   inches to the nearest 1/16 with the exact millimetre value bracketed beside
   them, because the tape measure at the bench is imperial and the mold is not.
   A value that is not exactly on a 1/16 gets a ≈ so nobody reads the fraction
   as the truth. The bracketed millimetre is always exact — see fmtDwg. */

/* ---------------- sheet geometry ----------------
   US Letter less the 0.45in @page margins from index.html, in CSS px at the
   spec's 96px/in. These are the numbers @media print actually lays out to, so
   an SVG sized in them lands on paper at the size it claims. */
const DWG_SHEET_W = 729.6;          // 7.6in
const DWG_SHEET_H = 969.6;          // 10.1in
const DWG_PX_PER_IN = 96;

/* Drawing-area heights per sheet type. Chosen so the title block lands at the
   foot of the sheet with the tables above it rather than floating mid-page. */
const DWG_ISO_H = 424;
const DWG_3V_H = 812;
const DWG_LAYER_H = 556;

/* Dimension furniture, page px (÷ 96 × 72 = points on paper). These are
   legibility floors for a laser print read at arm's length in a shop, not
   typographic preferences — ISO 3098 wants 2.5mm minimum character height, and
   tools/test_drawings.mjs fails anything under 5.5pt. Do not shrink them to fit
   a crowded sheet; move the label instead. */
const DW = {
  arrow: 7, arrowW: 4.4,
  ext: 6,            // extension line overshoot past the dimension line
  extGap: 3,         // gap between the feature and the start of its extension line
  font: 10.4,        // 7.8pt — the inch fraction, the number you work to
  sub: 8,            // 6.0pt — the bracketed millimetre
  tiny: 7.6,         // 5.7pt — notes and callouts
  minSpan: 44,       // below this a dimension puts its text off to the side
  thin: 0.6, med: 1.15, heavy: 2.1,
};
const INCH_MARK = '"';
const DASH_MOLD = "5 3";
const DASH_BELOW = "7 2.5 1.5 2.5";   // dash-dot: the layer underneath
const DASH_THIN = "3 2.5";

function f1(n) { return (Math.round(n * 10) / 10).toFixed(1); }

/* ---------------- units ----------------

   The inch mark is a plain ASCII quote, NOT U+2033 ″. The sheets are lettered in
   osifont (ISO 3098) and osifont has no double prime, so a ″ would silently fall
   back to another face for that one glyph — different metrics mid-dimension, on
   the string that appears on every dimension line on every sheet. A straight
   quote is ordinary drawing notation anyway. See fonts/osifont-LICENSE.md.

   Inches to the nearest 1/16, because that is what the tape at the bench reads.
   `exact` is the honest part: 44.45mm IS 1-3/4in and prints bare, while 43.9mm
   is not and prints with a ≈ so the fraction cannot be mistaken for the value.
   The millimetre in brackets is never rounded past a tenth and always governs. */
function inchFraction(mm) {
  const inch = mm / 25.4;
  const sign = inch < 0 ? "-" : "";
  const a = Math.abs(inch);
  const sixteenths = Math.round(a * 16);
  const exact = Math.abs(a * 16 - sixteenths) < 0.005;
  let whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16;
  let den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  let text;
  if (!num) text = String(whole);
  else if (!whole) text = `${num}/${den}`;
  else text = `${whole}-${num}/${den}`;
  return { text: sign + text, exact };
}
/* The two halves a dimension label is made of. Kept separate rather than
   pre-joined so a dimension line can stack them (fraction big, millimetre small
   underneath) while a table can put them on one line. */
function fmtDwg(mm) {
  if (!Number.isFinite(mm)) return { primary: "—", secondary: "", exact: false };
  const fr = inchFraction(mm);
  return {
    primary: (fr.exact ? "" : "≈") + fr.text + INCH_MARK,
    secondary: "[" + (Math.round(mm * 10) / 10) + "]",
    exact: fr.exact,
  };
}
function fmtDwgLine(mm) {
  const d = fmtDwg(mm);
  return d.secondary ? `${d.primary} ${d.secondary}` : d.primary;
}

/* ---------------- view transform ----------------

   bbox is in whatever 2D frame the projection produced (mm for the orthographic
   views, projected mm for the isometric). ox/oy place the view's top-left on the
   sheet. flipY is for the frames where the model's +Y is UP and SVG's is down. */
function dwgView(bbox, s, ox, oy, flipY) {
  const w = (bbox.x1 - bbox.x0) * s;
  const h = (bbox.y1 - bbox.y0) * s;
  return {
    s, ox, oy, w, h, bbox, flipY: !!flipY,
    X(x) { return ox + (x - bbox.x0) * s; },
    Y(y) { return flipY ? oy + h - (y - bbox.y0) * s : oy + (y - bbox.y0) * s; },
  };
}
/* Scale that fits a bbox into a page rectangle. Guards a degenerate span (a
   perfectly flat mold in one axis) rather than returning Infinity and drawing
   nothing at all. */
function dwgFit(bbox, w, h) {
  const sx = (bbox.x1 - bbox.x0) > 1e-9 ? w / (bbox.x1 - bbox.x0) : Infinity;
  const sy = (bbox.y1 - bbox.y0) > 1e-9 ? h / (bbox.y1 - bbox.y0) : Infinity;
  const s = Math.min(sx, sy);
  return Number.isFinite(s) && s > 0 ? s : 1;
}
function padBox(b, m) { return { x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m }; }

/* The printed ratio. Page px are CSS px, which the spec pins at 96 per inch, so
   a page span converts to real paper millimetres exactly — no printer guesswork.
   Stated on every sheet next to a bar you can lay a rule against, because a
   printer set to "fit to page" silently rescales and the bar is the only way to
   catch it. */
function dwgRatio(s) {
  const paperMmPerModelMm = (s / DWG_PX_PER_IN) * 25.4;
  if (!(paperMmPerModelMm > 0)) return "—";
  const r = 1 / paperMmPerModelMm;
  return r >= 1 ? `1:${r < 10 ? r.toFixed(1) : Math.round(r)}` : `${(1 / r).toFixed(1)}:1`;
}
/* A bar of a round model length, ticked at halves. Round in INCHES, not
   millimetres, because the rule in the drawer is an inch rule. */
function scaleBar(s, x, y) {
  const inches = [1, 2, 4, 6, 12, 24, 48];
  const want = 132;                                  // aim for ~1.4in of bar
  let pick = inches[0];
  for (const n of inches) { if (n * 25.4 * s <= want) pick = n; }
  const len = pick * 25.4 * s;
  const parts = [`<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + len)}" y2="${f1(y)}" stroke="currentColor" stroke-width="${DW.med}"/>`];
  for (let i = 0; i <= 2; i++) {
    const tx = x + (len * i) / 2;
    parts.push(`<line x1="${f1(tx)}" y1="${f1(y - 3.5)}" x2="${f1(tx)}" y2="${f1(y + 3.5)}" stroke="currentColor" stroke-width="${DW.thin}"/>`);
  }
  parts.push(`<text x="${f1(x + len + 5)}" y="${f1(y + 3)}" font-size="${DW.tiny}" fill="currentColor">${pick}${INCH_MARK}</text>`);
  return parts.join("");
}

/* ---------------- SVG primitives ---------------- */

/* Every label carries a white halo, painted UNDER its own glyphs.

   This is what CAD does and what a drawn-by-hand sheet does: dimension text
   breaks the line it sits on rather than fighting it. tools/test_drawings.mjs
   still fails any label a rule passes through, because a label that needs its
   halo is a label in the wrong place — but the fixtures in that test are eight
   molds and the shop will feed this hundreds, so the halo is what covers the
   layout nobody anticipated. Belt and braces, deliberately.

   paint-order="stroke" is what makes it a halo rather than an outline: without
   it the white stroke paints over the fill and the text comes out hollow. */
function dwgText(x, y, str, size, opts) {
  opts = opts || {};
  const a = opts.anchor ? ` text-anchor="${opts.anchor}"` : "";
  const w = opts.bold ? ` font-weight="700"` : "";
  const t = opts.rotate ? ` transform="rotate(${opts.rotate} ${f1(x)} ${f1(y)})"` : "";
  const ls = opts.track ? ` letter-spacing="${opts.track}"` : "";
  const halo = opts.noHalo ? "" : ` stroke="#fff" stroke-width="${(size * 0.34).toFixed(2)}" stroke-linejoin="round" paint-order="stroke"`;
  return `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}"${a}${w}${t}${ls}${halo} fill="currentColor">${esc(str)}</text>`;
}
/* Width of a string before it is laid out. drawings.js builds strings with no
   DOM, so there is nothing to measure — but a gutter has to be wide enough for
   the label going into it, and guessing low is how a callout runs off the sheet.
   0.56em per character is measured from osifont's own advance widths across the
   digits, capitals and punctuation these sheets actually use, rounded up. */
function estTextW(str, size) { return String(str || "").length * size * 0.56; }
function dwgLine(x1, y1, x2, y2, width, dash) {
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="currentColor" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}
function dwgPoly(pts, width, dash, close) {
  if (pts.length < 2) return "";
  const d = pts.map(p => `${f1(p.x)},${f1(p.y)}`).join(" ");
  return `<${close ? "polygon" : "polyline"} points="${d}" fill="none" stroke="currentColor" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}
// Filled triangle, tip at (x,y), pointing along the unit vector (ux,uy).
function dwgArrowhead(x, y, ux, uy) {
  const bx = x - ux * DW.arrow, by = y - uy * DW.arrow;
  const px = -uy * DW.arrowW / 2, py = ux * DW.arrowW / 2;
  return `<polygon points="${f1(x)},${f1(y)} ${f1(bx + px)},${f1(by + py)} ${f1(bx - px)},${f1(by - py)}" fill="currentColor"/>`;
}

/* A horizontal linear dimension. x1..x2 is the span, yLine is where the
   dimension line sits, yFeat is the geometry it measures (extension lines run
   from there to the line).

   Short spans get their arrows placed OUTSIDE pointing in, and the text moved
   off to the side. Without that, a 6mm glue inset — which is exactly the kind of
   number this drawing exists to communicate — renders as two arrowheads on top
   of each other with the label unreadable between them. */
function dimH(x1, x2, yLine, yFeat, mm, opts) {
  opts = opts || {};
  const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
  const span = hi - lo;
  const dir = yLine < yFeat ? -1 : 1;
  const d = fmtDwg(mm);
  const out = [];
  if (yFeat != null) {
    out.push(dwgLine(lo, yFeat + dir * DW.extGap, lo, yLine + dir * DW.ext, DW.thin));
    out.push(dwgLine(hi, yFeat + dir * DW.extGap, hi, yLine + dir * DW.ext, DW.thin));
  }
  const tight = span < DW.minSpan;
  if (tight) {
    out.push(dwgLine(lo - 12, yLine, hi + 12, yLine, DW.thin));
    out.push(dwgArrowhead(lo, yLine, -1, 0), dwgArrowhead(hi, yLine, 1, 0));
  } else {
    out.push(dwgLine(lo, yLine, hi, yLine, DW.thin));
    out.push(dwgArrowhead(lo, yLine, -1, 0), dwgArrowhead(hi, yLine, 1, 0));
  }
  /* Which end a tight label hangs off. Left to itself it always went right,
     which for a left-hand inset put it INSIDE the board it was measuring to —
     across the board's own edge rule. The caller knows which side is away from
     the geometry; it has to say. */
  const loSide = opts.tight === "lo";
  const tx = tight ? (loSide ? lo - 10 : hi + 10) : (lo + hi) / 2;
  const anchor = tight ? (loSide ? "end" : "start") : "middle";
  out.push(dwgText(tx, yLine - 12.5, d.primary, DW.font, { anchor, bold: true }));
  out.push(dwgText(tx, yLine - 3.5, d.secondary, DW.sub, { anchor }));
  if (opts.note) out.push(dwgText(tx, yLine + 10, opts.note, DW.tiny, { anchor }));
  return out.join("");
}
/* The vertical twin. Text reads bottom-to-top (rotated -90), which is the
   ordinary convention and keeps a tall dimension from needing a wide gutter. */
function dimV(y1, y2, xLine, xFeat, mm, opts) {
  opts = opts || {};
  const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
  const span = hi - lo;
  const dir = xLine < xFeat ? -1 : 1;
  const d = fmtDwg(mm);
  const out = [];
  if (xFeat != null) {
    out.push(dwgLine(xFeat + dir * DW.extGap, lo, xLine + dir * DW.ext, lo, DW.thin));
    out.push(dwgLine(xFeat + dir * DW.extGap, hi, xLine + dir * DW.ext, hi, DW.thin));
  }
  const tight = span < DW.minSpan;
  if (tight) out.push(dwgLine(xLine, lo - 12, xLine, hi + 12, DW.thin));
  else out.push(dwgLine(xLine, lo, xLine, hi, DW.thin));
  out.push(dwgArrowhead(xLine, lo, 0, -1), dwgArrowhead(xLine, hi, 0, 1));
  /* Same as dimH, with one extra trap: under rotate(-90) an anchor of "start"
     runs the string UPWARD. Hanging a tight label off the high end with "start"
     therefore walked it straight back across the feature. Anchor and side have
     to agree, or the label points the wrong way. */
  const loSide = opts.tight === "lo";
  const ty = tight ? (loSide ? lo - 10 : hi + 10) : (lo + hi) / 2;
  const anchor = tight ? (loSide ? "start" : "end") : "middle";
  out.push(dwgText(xLine - 12.5, ty, d.primary, DW.font, { anchor, bold: true, rotate: -90 }));
  out.push(dwgText(xLine - 3.5, ty, d.secondary, DW.sub, { anchor, rotate: -90 }));
  return out.join("");
}
/* An isometric dimension: parallel to the edge a→b, pushed off by (nx,ny), with
   the label rotated to lie along it.

   WHICH SIDE THE TEXT LANDS ON. An SVG text anchor is a BASELINE, so the glyphs
   sit above it — and after rotate(θ) "above" becomes the left normal of the
   text's own direction. So the direction the label is written in decides which
   side of the dimension line it ends up on. Choosing that direction by
   readability alone (flip when it would print upside down, which the left-hand
   isometric axis always would) put the label on the geometry side of the line
   half the time, and it printed across its own dimension line. Pick the
   direction whose left normal points the way we are already offsetting, then
   fix upside-down by reversing the offset instead. */
function dimIso(a, b, nx, ny, mm, off) {
  const o = off == null ? 22 : off;
  const A = { x: a.x + nx * o, y: a.y + ny * o };
  const B = { x: b.x + nx * o, y: b.y + ny * o };
  const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
  /* TWO constraints, and they fight.

     (1) The label must not print upside down. That fixes the writing direction:
         reverse it whenever the edge runs right-to-left, which the left-hand
         isometric axis always does.
     (2) The label must sit on the far side of its own dimension line from the
         object, or it prints across it.

     Choosing the direction to satisfy (2) breaks (1) — the first attempt at this
     produced two perfectly placed, perfectly mirrored dimensions. The way to
     have both is to fix the direction for readability and then move the ANCHOR:
     rotate(θ) puts the glyphs on the side (sinθ, −cosθ) of the baseline, so if
     that already points outward the anchor only has to clear the descender, and
     if it points inward the anchor moves out by a whole ascender instead. */
  let wx = ux, wy = uy;
  if (wx < 0 || (wx === 0 && wy < 0)) { wx = -wx; wy = -wy; }
  const deg = Math.atan2(wy, wx) * 180 / Math.PI;
  const outward = (wy * nx - wx * ny) > 0;      // (wy,−wx)·(nx,ny)
  const d = fmtDwg(mm);
  /* A short span with a long label: the text runs past both arrowheads and
     into the extension-line tips (a 3in height still prints as `3" [76.2]`,
     which is wider than its own dimension line). dimH solves this with
     minSpan; here the text stays put and moves OUT past the extension
     overshoot instead, which reads the same and costs no layout. */
  const over = estTextW(`${d.primary}  ${d.secondary}`, DW.font) > len - 8 ? DW.ext + 3 : 0;
  const clear = (outward ? DW.font * 0.28 : DW.font * 0.92) + 3 + over;
  const mx = (A.x + B.x) / 2 + nx * clear, my = (A.y + B.y) / 2 + ny * clear;
  return [
    dwgLine(a.x + nx * 4, a.y + ny * 4, A.x + nx * DW.ext, A.y + ny * DW.ext, DW.thin),
    dwgLine(b.x + nx * 4, b.y + ny * 4, B.x + nx * DW.ext, B.y + ny * DW.ext, DW.thin),
    dwgLine(A.x, A.y, B.x, B.y, DW.thin),
    dwgArrowhead(A.x, A.y, -ux, -uy), dwgArrowhead(B.x, B.y, ux, uy),
    dwgText(mx, my, `${d.primary}  ${d.secondary}`, DW.font, { anchor: "middle", bold: true, rotate: deg }),
  ].join("");
}
// Leader: an elbow from the geometry out to a label.
function leader(px, py, tx, ty, label) {
  const anchor = tx < px ? "end" : "start";
  const knee = { x: tx + (tx < px ? 7 : -7), y: ty };
  return [
    `<circle cx="${f1(px)}" cy="${f1(py)}" r="1.7" fill="currentColor"/>`,
    dwgLine(px, py, knee.x, knee.y, DW.thin),
    dwgLine(knee.x, knee.y, tx, ty, DW.thin),
    dwgText(tx + (anchor === "end" ? -3 : 3), ty + 3, label, DW.font, { anchor, bold: true }),
  ].join("");
}
/* The datum corner. Every sheet marks the SAME physical corner of the stack —
   the near-left one — so "38mm from the datum" means the same thing on sheet 4
   as it did on sheet 3, and it is a corner you can hook a tape on. */
/* The datum feature symbol, drawn the way a drawing draws it: a flag on the
   surface, a leader, and the letter in its own box. The letter used to float
   above the flag with nothing around it, which put it in the busiest corner of
   the sheet — the corner every dimension on the sheet also starts from. A boxed
   letter is both the convention and a guaranteed clear space. */
function datumMark(x, y, label) {
  const s = DW.font;
  const bw = Math.max(19, estTextW(label || "A", s) + 12);
  const bh = s * 1.75;
  /* The box goes DOWN-LEFT, off the corner. Straight above it — the obvious
     place — is the board's own left edge, so the letter printed on a heavy
     object line on every layer sheet. Down-left of the near-left corner is the
     one pocket that is outside the board, outside the extension line running
     left from the corner, and above the overall-width dimension row. */
  const cx = x - 34, cy = y + 17 + bh / 2;
  return [
    `<polygon points="${f1(x)},${f1(y)} ${f1(x + 7)},${f1(y + 11)} ${f1(x - 7)},${f1(y + 11)}" fill="currentColor" stroke="currentColor" stroke-width="${DW.thin}"/>`,
    dwgLine(x - 13, y, x + 13, y, DW.med),
    dwgLine(x, y + 11, cx + bw / 2, cy, DW.thin),
    `<rect x="${f1(cx - bw / 2)}" y="${f1(cy - bh / 2)}" width="${f1(bw)}" height="${f1(bh)}" fill="#fff" stroke="currentColor" stroke-width="${DW.med}"/>`,
    dwgText(cx, cy + bh * 0.24, label || "A", s, { anchor: "middle", bold: true, noHalo: true }),
  ].join("");
}
function centerline(x1, y1, x2, y2) { return dwgLine(x1, y1, x2, y2, DW.thin, DASH_BELOW); }

/* ---------------- plan helpers ---------------- */

function dwgLayers(plan) { return (plan && plan.layers) || []; }
// Footprint shared by every layer sheet, so the frame does not move sheet to
// sheet and a small top layer prints small — which is the point of drawing it.
function planFootprint(plan) {
  let b = null;
  dwgLayers(plan).forEach(L => (L.blanks || []).forEach(k => {
    b = b ? { x0: Math.min(b.x0, k.x0), y0: Math.min(b.y0, k.y0), x1: Math.max(b.x1, k.x1), y1: Math.max(b.y1, k.y1) }
          : { x0: k.x0, y0: k.y0, x1: k.x1, y1: k.y1 };
  }));
  return b || { x0: 0, y0: 0, x1: 1, y1: 1 };
}
function planDatum(plan) { const b = planFootprint(plan); return { x: b.x0, y: b.y0 }; }
function layerBox(L) {
  let b = null;
  (L.blanks || []).forEach(k => {
    b = b ? { x0: Math.min(b.x0, k.x0), y0: Math.min(b.y0, k.y0), x1: Math.max(b.x1, k.x1), y1: Math.max(b.y1, k.y1) }
          : { x0: k.x0, y0: k.y0, x1: k.x1, y1: k.y1 };
  });
  return b;
}

/* How far in from each edge of the board BELOW this blank sits. Negative means
   it hangs over that edge — which the slicer already warns about in words; here
   it gets a number and a side, because "layer 4 overhangs" is not something you
   can act on at a glue-up and "3/8in proud of the front edge" is.

   Pairs against the blank below with the largest overlap rather than the first
   one found: a two-blank layer over a two-blank layer would otherwise measure
   one blank against the wrong neighbour and print a plausible, wrong number. */
function insetsBetween(lower, upper) {
  if (!lower) return null;
  return {
    left: upper.x0 - lower.x0,
    right: lower.x1 - upper.x1,
    front: upper.y0 - lower.y0,
    back: lower.y1 - upper.y1,
  };
}
function bestSupport(blank, lowerBlanks) {
  let best = null, bestA = 0;
  (lowerBlanks || []).forEach(L => {
    const w = Math.min(blank.x1, L.x1) - Math.max(blank.x0, L.x0);
    const h = Math.min(blank.y1, L.y1) - Math.max(blank.y0, L.y0);
    const a = Math.max(0, w) * Math.max(0, h);
    if (a > bestA) { bestA = a; best = L; }
  });
  return bestA > 0 ? best : null;
}
// L1a / L1b … matching the cut list's blank ids (blanksFromPlans in stock.js).
function blankLabel(i, k, n) { return `L${i + 1}${n > 1 ? String.fromCharCode(97 + k) : ""}`; }

/* Where sectionize() split the stack for the ShopSabre's cut depth: the Z of
   each boundary, in the plan's own frame. Called out on the drawings because a
   split is two separate machine setups and two separate glue-ups, and somebody
   reading only the stack table would glue straight through it. */
function sectionSplitsZ(plan) {
  const out = [];
  const Ls = dwgLayers(plan);
  for (let i = 1; i < Ls.length; i++) {
    if ((Ls[i].section || 0) !== (Ls[i - 1].section || 0)) out.push(Ls[i].z0);
  }
  return out;
}

/* ============================================================================
   THE MOLD UNDER THE BLOCKS
   ============================================================================
   The blocks are boxes and draw themselves. The mold does not, and a drawing of
   stock with no mold in it is a drawing of a brick.

   The plan stores the mold mesh as a binary STL in Storage (stock.js parks it
   there so the 3D view survives a reload), so the honest thing to draw is that
   mesh, projected. Three ways to do it, and only one survives contact with a
   real Fusion export:

     full wireframe      every triangle edge. 40k triangles prints as a grey
                         smear and can choke the print dialog. No.
     silhouette edges    the edges shared by a front- and a back-facing
                         triangle. Correct on a clean mesh; on the rough ones
                         slicer.js spends its whole header accommodating, they
                         do not stitch into loops at all.
     rasterise and trace what is below. No polygon booleans, no assumption about
                         the mesh being closed, consistently wound or clean —
                         it cannot fail, only come out coarse.

   Rasterise: project every triangle, fill its cells, then walk the boundary of
   the filled set. That boundary is a staircase, so it is stitched into loops
   with slicer.js's OWN stitchContours — grid segments share endpoints exactly,
   which is the easy case for a function hardened against the hard one — and
   thinned with slicer.js's simplify(), which turns the staircase back into
   straight lines and diagonals. Two functions this app already trusts, reused
   rather than rewritten. */

/* 720 cells, not the 340 this started at: at 340 a CAD-straight mold edge came
   back as a visible wave (the cell is ~3mm on a metre-wide mold, and simplify's
   tolerance scales with it). 720 puts the trace within a printed pixel, and the
   budget rises with it — it is a hang guard, not a performance target. */
const DWG_MAX_CELLS = 720;        // longest axis; ~1px per cell on a printed sheet
const DWG_MIN_CELL_MM = 0.5;
const DWG_RASTER_BUDGET = 4e7;    // cell writes; a pathological mesh stops early rather than hanging

/* (x,y,z) -> a 2D frame per view. The isometric matches stackview.js exactly
   (px = (x-y)cos30, py = (x+y)sin30 - z) so the two drawings of the same stack
   agree; that projection is already in SVG's y-down sense, hence no flip. */
function dwgProject(name) {
  const COS30 = Math.cos(Math.PI / 6);
  if (name === "top") return { fn: (x, y) => ({ x, y }), flipY: true };
  if (name === "front") return { fn: (x, y, z) => ({ x, y: z }), flipY: true };
  if (name === "right") return { fn: (x, y, z) => ({ x: y, y: z }), flipY: true };
  return { fn: (x, y, z) => ({ x: (x - y) * COS30, y: (x + y) * 0.5 - z }), flipY: false };
}

/* Filled-cell occupancy of a projected mesh, then its boundary as loops.
   Returns [] rather than throwing on anything — this is the reference geometry
   on a drawing whose dimensions come from the blanks, so a mold that will not
   trace must cost the drawing its picture, never its numbers. */
function silhouetteLoops(tris, projName, opts) {
  opts = opts || {};
  const proj = dwgProject(projName).fn;
  if (!tris || !tris.length) return [];
  const P = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tris) {
    const a = proj(t.ax, t.ay, t.az), b = proj(t.bx, t.by, t.bz), c = proj(t.cx, t.cy, t.cz);
    P.push(a, b, c);
    for (const p of [a, b, c]) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
  }
  const spanX = x1 - x0, spanY = y1 - y0;
  if (!(spanX > 0) && !(spanY > 0)) return [];
  // minCellMm: the 0.5mm floor is sized for a tessellated mold mesh. The stock
  // outline pass traces a handful of axis-aligned boxes, where a finer grid is
  // cheap and keeps the heavy overdraw within a page pixel of the block edges.
  const cell = Math.max(opts.cell || Math.max(spanX, spanY) / DWG_MAX_CELLS,
    opts.minCellMm != null ? opts.minCellMm : DWG_MIN_CELL_MM);
  // One cell of padding all round, so an occupied cell on the edge of the model
  // still has an EMPTY neighbour to hand the boundary walk. Without it the
  // outline is open along whichever side the mold touches.
  const ox = x0 - cell, oy = y0 - cell;
  const nx = Math.ceil(spanX / cell) + 3, ny = Math.ceil(spanY / cell) + 3;
  const grid = new Uint8Array(nx * ny);
  let ops = 0;
  const mark = (i, j) => { if (i >= 0 && j >= 0 && i < nx && j < ny) grid[j * nx + i] = 1; };

  for (let t = 0; t < P.length; t += 3) {
    const g = [0, 1, 2].map(k => ({ x: (P[t + k].x - ox) / cell, y: (P[t + k].y - oy) / cell }));
    /* Edges first, by DDA. A sliver thinner than one cell produces no scanline
       hit at all, and slivers are exactly what a tessellated draft wall is made
       of — filling only the interior would leave the outline of a real mold
       full of holes. */
    for (let k = 0; k < 3; k++) {
      const a = g[k], b = g[(k + 1) % 3];
      const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))) + 1;
      if (steps > nx * ny) continue;               // degenerate/exploded coordinate
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        mark(Math.floor(a.x + (b.x - a.x) * u), Math.floor(a.y + (b.y - a.y) * u));
      }
      ops += steps;
    }
    // Interior by scanline. Cells are filled if the row's span touches them at
    // all, which over-covers by at most one cell — the safe direction for a
    // reference outline: slightly generous, never missing.
    const jlo = Math.max(0, Math.floor(Math.min(g[0].y, g[1].y, g[2].y)));
    const jhi = Math.min(ny - 1, Math.floor(Math.max(g[0].y, g[1].y, g[2].y)));
    for (let j = jlo; j <= jhi; j++) {
      const yc = j + 0.5;
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 3; k++) {
        const a = g[k], b = g[(k + 1) % 3];
        if ((a.y > yc) === (b.y > yc)) continue;
        const x = a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      if (!(hi >= lo)) continue;
      const ilo = Math.max(0, Math.floor(lo)), ihi = Math.min(nx - 1, Math.floor(hi));
      for (let i = ilo; i <= ihi; i++) grid[j * nx + i] = 1;
      ops += ihi - ilo + 1;
    }
    if (ops > DWG_RASTER_BUDGET) break;
  }

  // Boundary: every edge of a filled cell whose neighbour is empty.
  const segs = [];
  const gx = i => ox + i * cell, gy = j => oy + j * cell;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!grid[j * nx + i]) continue;
      const L = i > 0 && grid[j * nx + i - 1];
      const R = i < nx - 1 && grid[j * nx + i + 1];
      const D = j > 0 && grid[(j - 1) * nx + i];
      const U = j < ny - 1 && grid[(j + 1) * nx + i];
      if (!L) segs.push([{ x: gx(i), y: gy(j) }, { x: gx(i), y: gy(j + 1) }]);
      if (!R) segs.push([{ x: gx(i + 1), y: gy(j) }, { x: gx(i + 1), y: gy(j + 1) }]);
      if (!D) segs.push([{ x: gx(i), y: gy(j) }, { x: gx(i + 1), y: gy(j) }]);
      if (!U) segs.push([{ x: gx(i), y: gy(j + 1) }, { x: gx(i + 1), y: gy(j + 1) }]);
    }
  }
  if (!segs.length) return [];
  let loops;
  try { loops = stitchContours(segs, cell * 0.3); }
  catch (e) { return []; }
  // Drop specks: a loop smaller than a few cells is raster noise, not a feature,
  // and printing it as a dashed blob reads like a mold detail that isn't there.
  const min = cell * 3.5;
  return loops
    .map(l => straightenLoop(simplify(l, cell * 1.25), 8, cell * 2.5))
    .filter(l => {
      if (l.length < 4) return false;
      const b = bboxOf(l);
      return (b.x1 - b.x0) > min || (b.y1 - b.y0) > min;
    });
}

/* Collapse the raster staircase's residual micro-kinks. Douglas-Peucker bounds
   DEVIATION but happily keeps a long shallow S-wave inside its tolerance, and
   that wave is exactly what a CAD-straight edge traced through a grid looks
   like on paper. So gate on the TURN instead: drop a vertex when the direction
   barely changes there AND removing it moves the outline less than a couple of
   cells. Real corners turn hard and stay; real curves get checked against the
   deviation bound like everything else. A few passes, because removing one
   wobble vertex exposes the next. */
function straightenLoop(pts, maxTurnDeg, devTol) {
  const cosMin = Math.cos(maxTurnDeg * Math.PI / 180);
  let out = pts;
  for (let pass = 0; pass < 4; pass++) {
    const n = out.length;
    if (n < 5) break;
    const next = [];
    let dropped = 0, prevDropped = false;
    for (let i = 0; i < n; i++) {
      const p = out[(i - 1 + n) % n], q = out[i], r = out[(i + 1) % n];
      const ax = q.x - p.x, ay = q.y - p.y, bx = r.x - q.x, by = r.y - q.y;
      const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
      const shallow = (ax * bx + ay * by) / (la * lb) > cosMin;
      // Never drop neighbours in the same pass — that can walk a whole gentle
      // arc down to nothing while every single removal looked safe.
      if (shallow && !prevDropped && distToSeg(q, p, r) < devTol) { dropped++; prevDropped = true; continue; }
      prevDropped = false;
      next.push(q);
    }
    out = next;
    if (!dropped) break;
  }
  return out;
}

/* When the TRUE segments are known — the stock outline is a union of boxes
   whose projected edges are exact — don't settle for a straightened trace:
   snap every traced vertex onto the nearest exact edge (corners first, they
   beat any edge projection), then let straightenLoop collapse the now-collinear
   runs. The result lies ON the CAD line, so the heavy overdraw coincides with
   the block-face edges underneath it instead of chewing along them. */
function snapLoopToSegments(loop, segs, tol) {
  const out = [];
  for (const q of loop) {
    let px = q.x, py = q.y, best = tol;
    // Corners get 1.4x the reach: a raster corner cuts diagonally across the
    // true one, and landing exactly on it is what makes the miter sharp.
    for (const s of segs) {
      for (const e of s) {
        const d = Math.hypot(q.x - e.x, q.y - e.y);
        if (d < Math.min(best * 1.4, tol * 1.4)) { px = e.x; py = e.y; best = d / 1.4; }
      }
    }
    if (px === q.x && py === q.y) {
      for (const s of segs) {
        const a = s[0], b = s[1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2));
        const cx = a.x + t * dx, cy = a.y + t * dy;
        const d = Math.hypot(q.x - cx, q.y - cy);
        if (d < best) { px = cx; py = cy; best = d; }
      }
    }
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(prev.x - px, prev.y - py) > 1e-6) out.push({ x: px, y: py });
  }
  return out;
}

function polyPerimeter(pts) {
  let t = 0;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[(i + 1) % pts.length];
    t += Math.hypot(q.x - pts[i].x, q.y - pts[i].y);
  }
  return t;
}

/* Emit the waterline overlay for one iso view: keep-filtered levels, projected,
   with three suppressions that all exist because dashes cannot overlap and stay
   readable —
     specks    a loop shorter than a few dash periods on paper prints as dirt;
     tangency  where a section runs within a stroke-width of the silhouette,
               the two dashed curves bead into a doubled-stroke smear, and the
               silhouette is the one that carries meaning, so the section yields
               (a wall section that IS the silhouette vanishes entirely);
     stubs     what is left after cutting the tangent stretch out is dropped if
               it is shorter than two dash periods.
   dashFor(l) picks the dash per loop so the main view can keep its glue-line /
   intermediate distinction while the mold-only inset draws everything solid. */
function waterlinePaths(art, v, s, dashFor) {
  const wl = art.waterlines || { loops: [] };
  if (!wl.loops.length) return [];
  const proj = dwgProject("iso").fn;
  const silSegs = [];
  (art.iso.loops || []).forEach(loop => loop.forEach((p, i) => silSegs.push([p, loop[(i + 1) % loop.length]])));
  const keepZ = waterlineKeep(wl.loops, s);
  const nearTol = 2.5 / s;                  // ~2.5 page px, in projected mm
  const out = [];
  /* Draw order is priority order, because each drawn loop joins the occlusion
     set for the ones after it: glue-line sections first (they carry meaning),
     then intermediates, upper before lower within each. Two dashed curves a
     stroke apart bead into a smear, and this is what decides which one lives. */
  const drawn = wl.loops
    .filter(l => keepZ.has(l.z))
    .sort((a, b) => (a.kind === b.kind ? b.z - a.z : (a.kind === "interface" ? -1 : 1)));
  drawn.forEach(l => {
    const pj = l.pts.map(p => proj(p.x, p.y, l.z));
    if (polyPerimeter(pj) * s < 28) return;
    const page = pj.map(p => ({ x: v.X(p.x), y: v.Y(p.y) }));
    const near = pj.map(p => silSegs.some(g => distToSeg(p, g[0], g[1]) < nearTol));
    const dash = dashFor(l);
    const claim = () => pj.forEach((p, i) => silSegs.push([p, pj[(i + 1) % pj.length]]));
    if (!near.some(x => x)) { out.push(dwgPoly(page, DW.thin, dash, true)); claim(); return; }
    if (near.every(x => x)) return;
    const n = page.length;
    const start = near.findIndex(x => x);
    let run = [];
    let emitted = false;
    const flush = () => {
      let len = 0;
      for (let i = 1; i < run.length; i++) len += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
      if (run.length > 1 && len >= 16) { out.push(dwgPoly(run, DW.thin, dash, false)); emitted = true; }
      run = [];
    };
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (near[i]) flush();
      else run.push(page[i]);
    }
    flush();
    if (emitted) claim();
  });
  return out;
}

/* ---------------- waterlines ----------------

   The silhouette says where the mold is; it says nothing about the surface
   inside its own outline, which is why sheet 1 used to read as a brick with a
   dashed blob in it. Waterlines fix that the way a topographic map does:
   horizontal sections of the mold at a spread of heights, drawn over the iso
   view, so the SPACING of the lines is the shape — tight where the surface is
   steep, wide where it is flat. They are also literally what the ShopSabre
   cuts: a waterline is a roughing-pass boundary.

   Two kinds, on two dashes. A section at a board interface (each layer's z0,
   plus the stock top) is a physically meaningful curve — the mold crosses that
   glue line exactly there — and shares the mold's own dash. The evenly spaced
   intermediates are reference sections and take the short dash, so nobody
   reads one as a glue line.

   Slicing reuses slicer.js wholesale: sliceAt -> stitchRelaxed ->
   outerContours -> simplify, the same chain sliceMold trusts for the saved
   layer contours. A level that will not stitch is skipped and counted, never
   thrown — same contract as the silhouette above. */

const DWG_WATERLINE_TARGET = 12;    // z levels aimed for, interfaces included
const DWG_WATERLINE_DENSE = 100000; // tris; above this the target halves
const DWG_WATERLINE_GAP_PX = 7;     // min page-y between kept intermediate levels

function moldZRange(tris) {
  let z0 = Infinity, z1 = -Infinity;
  for (const t of tris) {
    for (const z of [t.az, t.bz, t.cz]) { if (z < z0) z0 = z; if (z > z1) z1 = z; }
  }
  return { z0, z1 };
}

/* The heights to section at: every board interface inside the mold's own Z
   range, then evenly spaced intermediates up to the target, dropped where they
   would crowd an interface. Both ends are inset by SLICE_EPS_MM because sliceAt
   skips coplanar triangles by design — a slice exactly on the mold's flat base
   returns nothing at all. */
function waterlineZs(plan, tris, targetN) {
  const r = moldZRange(tris);
  const z0 = r.z0 + SLICE_EPS_MM, z1 = r.z1 - SLICE_EPS_MM;
  if (!(z1 > z0)) return [];
  const n = targetN || (tris.length > DWG_WATERLINE_DENSE ? DWG_WATERLINE_TARGET / 2 : DWG_WATERLINE_TARGET);
  const zs = [];
  dwgLayers(plan).forEach(L => {
    const z = L.z0 + SLICE_EPS_MM;
    if (z > z0 && z < z1) zs.push({ z, kind: "interface" });
  });
  zs.push({ z: z1, kind: "interface" });
  const want = Math.max(0, Math.round(n) - zs.length);
  const minDz = (z1 - z0) / (n * 2);
  for (let i = 1; i <= want; i++) {
    const z = z0 + ((z1 - z0) * i) / (want + 1);
    if (zs.every(w => Math.abs(w.z - z) >= minDz)) zs.push({ z, kind: "intermediate" });
  }
  return zs.sort((a, b) => a.z - b.z);
}

function waterlineLoops(tris, zs) {
  const loops = [];
  let failures = 0;
  for (const w of zs) {
    const segs = sliceAt(tris, w.z);
    if (!segs.length) continue;
    let st;
    try { st = stitchRelaxed(segs, WELD_TOL_MM); }
    catch (e) { failures++; continue; }
    outerContours(st.loops).forEach(c => {
      // 0.8mm + the straighten pass, not sliceMold's raw 0.2: these are drawn,
      // never stored, and on a nearly-flat region a slice tracks tessellation
      // noise sideways — smoothing is what keeps a straight CAD contour
      // straight and a dash pattern regular instead of a trail of specks.
      const pts = straightenLoop(simplify(c, 0.8), 10, 2.0);
      if (pts.length > 3) loops.push({ z: w.z, kind: w.kind, pts });
    });
  }
  return { loops, failures };
}

/* Two sections at different heights of a VERTICAL wall are the same curve in
   XY, so drawing both prints the same line twice a couple of pixels apart —
   which on a flat-sided mold turns every wall into a smear of near-coincident
   dashes. Cheap likeness test: bounding boxes within tol and enclosed areas
   within tol times the perimeter. A wall with any real slope shifts the
   contour and fails it; a shape morphing at constant box AND constant area is
   not a mold. */
function loopsAlike(a, b, tol) {
  const ba = bboxOf(a), bb = bboxOf(b);
  if (Math.abs(ba.x0 - bb.x0) > tol || Math.abs(ba.y0 - bb.y0) > tol ||
      Math.abs(ba.x1 - bb.x1) > tol || Math.abs(ba.y1 - bb.y1) > tol) return false;
  const per = 2 * (ba.x1 - ba.x0 + ba.y1 - ba.y0) + 1;
  return Math.abs(Math.abs(polyArea(a)) - Math.abs(polyArea(b))) < tol * per;
}

/* Which z levels survive at a given page scale. EVERY level, interfaces
   included, must differ from the last kept one (loopsAlike above): on a
   vertical wall the section at a glue line is the same rectangle as the
   section below it, and seven identical rectangles stacked two pixels apart
   is a moiré, not information — the glue lines themselves are already named
   by the leader callouts. Intermediates additionally need a legible page gap.
   A dome, where every level genuinely differs, keeps its full contour
   ladder. */
function waterlineKeep(loops, s) {
  const byZ = new Map();
  loops.forEach(l => {
    if (!byZ.has(l.z)) byZ.set(l.z, []);
    byZ.get(l.z).push(l);
  });
  const zs = [...byZ.keys()].sort((a, b) => a - b);
  const keep = new Set();
  let last = null;
  zs.forEach(z => {
    const ls = byZ.get(z);
    const dup = last != null &&
      ls.every(l => (byZ.get(last) || []).some(o => loopsAlike(l.pts, o.pts, 1.2)));
    if (dup) return;
    const isInt = ls.some(l => l.kind === "interface");
    if (!isInt && last != null && s * (z - last) < DWG_WATERLINE_GAP_PX) return;
    keep.add(z);
    last = z;
  });
  return keep;
}

/* What to draw for the mold in one view, and where it came from.

   The fallback matters more than it looks. Plans made before the 3D view
   existed have no stored mesh at all, and so does any plan whose upload failed
   (stock.js treats that as survivable on purpose). Those still get a drawing —
   built from the per-layer contours already in the record — but the title block
   says so, because a stepped profile assembled from horizontal sections must
   never be mistaken for the mold's true shape. */
function moldOutlines(plan, tris, projName) {
  if (tris && tris.length) {
    const loops = silhouetteLoops(tris, projName);
    if (loops.length) return { loops, source: "mesh" };
  }
  const proj = dwgProject(projName).fn;
  const loops = [];
  dwgLayers(plan).forEach(L => {
    const islands = L.islands || [];
    if (projName === "top") {
      islands.forEach(is => { if ((is.contour || []).length > 2) loops.push(is.contour.map(p => ({ x: p.x, y: p.y }))); });
    } else if (projName === "iso") {
      // At z0, not z1: sliceMold cuts each contour at the BOTTOM of its board
      // (z0 + SLICE_EPS_MM), so drawing it at the top planted every section one
      // board thickness too high and the stepped silhouette read too large.
      islands.forEach(is => { if ((is.contour || []).length > 2) loops.push(is.contour.map(p => proj(p.x, p.y, L.z0))); });
    } else {
      // A stepped profile: each layer contributes the rectangle its outline
      // occupies over that layer's own Z band. Honest about what it is — this
      // is a stack of sections, not a silhouette.
      const b = islands.reduce((acc, is) => {
        const k = is.box || bboxOf(is.contour || []);
        if (!k || !Number.isFinite(k.x0)) return acc;
        return acc ? { x0: Math.min(acc.x0, k.x0), y0: Math.min(acc.y0, k.y0), x1: Math.max(acc.x1, k.x1), y1: Math.max(acc.y1, k.y1) } : k;
      }, null);
      if (!b) return;
      const u0 = projName === "front" ? b.x0 : b.y0;
      const u1 = projName === "front" ? b.x1 : b.y1;
      loops.push([{ x: u0, y: L.z0 }, { x: u1, y: L.z0 }, { x: u1, y: L.z1 }, { x: u0, y: L.z1 }]);
    }
  });
  return { loops, source: loops.length ? "outline" : "none" };
}

/* All four projections at once, cached per plan: the sheets each want a
   different one and the raster is the expensive step. */
const DWG_ART = {};
function moldArt(plan, tris) {
  const key = (plan && plan.id) || "anon";
  if (DWG_ART[key] && DWG_ART[key].hasMesh === !!(tris && tris.length)) return DWG_ART[key];
  const art = { hasMesh: !!(tris && tris.length) };
  ["iso", "top", "front", "right"].forEach(v => { art[v] = moldOutlines(plan, tris, v); });
  art.source = art.top.source === "mesh" ? "mesh" : art.top.source;
  // Waterlines only exist off a real mesh. The no-mesh fallback's iso loops ARE
  // horizontal sections already — computing them again would draw every line
  // twice, once medium and once thin.
  art.waterlines = art.hasMesh ? waterlineLoops(tris, waterlineZs(plan, tris)) : { loops: [], failures: 0 };
  DWG_ART[key] = art;
  return art;
}
function moldSourceNote(art) {
  if (!art || art.source === "mesh") return "Mold shown as a silhouette projected from the stored STL, with horizontal section contours on sheet 1.";
  if (art && art.source === "outline") return "No stored mold mesh — mold shown from the saved layer outlines, so the side views are a stepped profile, not the true surface.";
  return "No mold geometry stored with this plan — blocks only.";
}

/* ============================================================================
   SHEET 1 — GENERAL VIEW
   ============================================================================
   The stack ASSEMBLED, not exploded. The exploded picture already exists on the
   plan page and is reprinted small in the corner here as the layer key; what
   this sheet is for is the finished block — the thing that comes off the glue-up
   and goes on the machine bed — with the mold inside it and its overall size.

   Depth ordering is the same argument stackview.js makes: paint bottom layer
   first. Blanks within a layer are disjoint by construction (slicer.js's merge
   rule), and an upper layer painted over a lower one occludes it correctly from
   a viewer above. */

function isoCornersOf(plan) {
  const proj = dwgProject("iso").fn;
  const pts = [];
  dwgLayers(plan).forEach(L => (L.blanks || []).forEach(b => {
    for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [L.z0, L.z1]) pts.push(proj(x, y, z));
  }));
  return pts;
}
// Unit normal of a→b pointing AWAY from c, so a dimension never lands on top of
// the solid it measures.
function awayNormal(a, b, c) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  if ((mx + nx - c.x) ** 2 + (my + ny - c.y) ** 2 < (mx - c.x) ** 2 + (my - c.y) ** 2) { nx = -nx; ny = -ny; }
  return { nx, ny };
}
/* Leader labels stack up when layers are thin, so pull them apart to a minimum
   spacing before drawing. A 1in board on a 9in stack is ten page pixels, and six
   of them land as one illegible smear.

   Only ever pushed DOWN in order, so leaders cannot cross — a crossed leader is
   worse than a tight one, because it points at the wrong layer. lo/hi then slide
   the whole run back inside the drawing area if it grew past the bottom. */
function spreadLabels(items, minGap, lo, hi) {
  const gap = minGap || 13;
  const s = items.slice().sort((a, b) => a.y - b.y);
  for (let i = 1; i < s.length; i++) if (s[i].y - s[i - 1].y < gap) s[i].y = s[i - 1].y + gap;
  if (hi != null && s.length && s[s.length - 1].y > hi) {
    const over = s[s.length - 1].y - hi;
    s.forEach(it => { it.y -= over; });
  }
  if (lo != null && s.length && s[0].y < lo) {
    const under = lo - s[0].y;
    s.forEach(it => { it.y += under; });
  }
  return s;
}

/* The mold ALONE, small, beside the layer key. On the main view the mold is
   buried in stock and every line of it is hidden-line dashed; this is the one
   place it is out of the block, so here — and only here — its lines are solid:
   silhouette medium, waterlines thin. It answers "what does the finished mold
   look like" without touching the drawing people already initial. */
function moldInsetSvg(art) {
  if (!art || art.source !== "mesh" || !art.iso.loops.length) return "";
  const IW = 176, IH = 150, pad = 8;
  const box = bboxOf([].concat(...art.iso.loops));
  const s = dwgFit(box, IW - pad * 2, IH - pad * 2);
  const w = (box.x1 - box.x0) * s, h = (box.y1 - box.y0) * s;
  const v = dwgView(box, s, pad + (IW - pad * 2 - w) / 2, pad + (IH - pad * 2 - h) / 2, false);
  const parts = [];
  // The same hatch as the main view, so "hatched = mold material" holds across
  // the sheet. Sheet 1's <defs> carries the pattern; url(#) resolves
  // document-wide, and the inset only ever prints on sheet 1.
  parts.push(`<path d="${art.iso.loops.map(loop =>
    "M" + loop.map(p => `${f1(v.X(p.x))} ${f1(v.Y(p.y))}`).join("L") + "Z").join("")}"
    fill="url(#dwgHatch)" fill-rule="evenodd" stroke="none"/>`);
  parts.push(...waterlinePaths(art, v, s, () => null));
  art.iso.loops.forEach(loop => parts.push(dwgPoly(loop.map(p => ({ x: v.X(p.x), y: v.Y(p.y) })), DW.med, null, true)));
  return `<svg viewBox="0 0 ${IW} ${IH}" width="100%" role="img" aria-label="The machined mold alone, isometric">${parts.join("")}</svg>`;
}

function sheetIso(plan, ctx) {
  const proj = dwgProject("iso").fn;
  const layers = dwgLayers(plan);
  /* The callouts hang off the RIGHT because the overall-height dimension owns
     the left, and the two crossing each other made both unreadable. The gutter
     is sized from the WIDEST callout rather than guessed: on a sectioned mold
     one of them carries a "◂ SPLIT" suffix, and a fixed gutter ran it off the
     edge of the sheet. */
  const callouts = layers.map((L, i) =>
    `L${i + 1} · ${fmtDwg(L.thickness).primary}${ctx.splits.some(z => Math.abs(L.z1 - z) < 1e-6) ? "  ◂ SPLIT" : ""}`);
  const gutter = Math.ceil(Math.max(...callouts.map(c => estTextW(c, DW.font)))) + 26;
  /* t clears the overall-size box drawn at the top left: that box has a white
     fill (it has to, or the geometry behind it makes it unreadable), so the
     drawing area must not reach under it. */
  const M = { l: 76, r: Math.max(90, gutter), t: 84, b: 40 };
  const pts = isoCornersOf(plan).concat(...ctx.art.iso.loops);
  const box = pts.length ? bboxOf(pts) : { x0: 0, y0: 0, x1: 1, y1: 1 };
  const s = dwgFit(box, DWG_SHEET_W - M.l - M.r, DWG_ISO_H - M.t - M.b);
  const w = (box.x1 - box.x0) * s, h = (box.y1 - box.y0) * s;
  const v = dwgView(box, s, M.l + (DWG_SHEET_W - M.l - M.r - w) / 2, M.t + (DWG_ISO_H - M.t - M.b - h) / 2, false);
  const P = (x, y, z) => { const p = proj(x, y, z); return { x: v.X(p.x), y: v.Y(p.y) }; };
  const centre = { x: v.ox + w / 2, y: v.oy + h / 2 };

  const body = [];
  const labels = [];
  layers.forEach((L, i) => {
    (L.blanks || []).forEach((b, k) => {
      const face = (pts2) => `<polygon points="${pts2.map(p => `${f1(p.x)},${f1(p.y)}`).join(" ")}" fill="#fff" stroke="currentColor" stroke-width="`;
      body.push(face([P(b.x0, b.y1, L.z1), P(b.x1, b.y1, L.z1), P(b.x1, b.y1, L.z0), P(b.x0, b.y1, L.z0)]) + DW.med + `"/>`);
      body.push(face([P(b.x1, b.y0, L.z1), P(b.x1, b.y1, L.z1), P(b.x1, b.y1, L.z0), P(b.x1, b.y0, L.z0)]) + DW.med + `"/>`);
      // Medium like the side faces, not heavy: a six-layer stack drew six heavy
      // top diamonds, and the glue joints shouted as loudly as the assembly
      // outline. The TRUE outer silhouette gets the heavy rule, once, below.
      body.push(face([P(b.x0, b.y0, L.z1), P(b.x1, b.y0, L.z1), P(b.x1, b.y1, L.z1), P(b.x0, b.y1, L.z1)]) + DW.med + `"/>`);
      if (k === 0) {
        // The RIGHT vertex of the top face: on a drafted stack that is the
        // silhouette edge, so the leader leaves the block rather than crossing it.
        // The split is named here rather than lettered onto the stack — a label
        // dropped at the split's own corner lands on the blocks below it, and
        // this is the line a reader is already scanning.
        const c = P(b.x1, b.y0, L.z1);
        labels.push({ y: c.y, px: c.x, py: c.y, text: callouts[i] });
      }
    });
  });
  /* Shade the mold's footprint before any of its lines: a light 45° hatch over
     the white faces, so where the mold sits inside the stock reads at a glance
     instead of having to be assembled from dashes. The hatch is a pattern fill
     on a single evenodd path, NOT generated lines — generated hatch would be
     hundreds of solid segments for the label-collision audit to trip over,
     while a pattern's one template line never meets a label. */
  const hatchPath = ctx.art.iso.loops.map(loop =>
    "M" + loop.map(p => `${f1(v.X(p.x))} ${f1(v.Y(p.y))}`).join("L") + "Z").join("");
  if (hatchPath) body.push(`<path d="${hatchPath}" fill="url(#dwgHatch)" fill-rule="evenodd" stroke="none"/>`);
  /* The stack's outer silhouette, heavy over the medium block faces — the one
     line that means "the edge of the thing you glued". Traced from the blanks'
     own box triangles through the same rasteriser the mold uses, on a much
     finer grid: a dozen axis-aligned boxes rasterise for nothing, and at these
     cells the heavy rule stays within a printed pixel of the true edges, so a
     CAD-straight edge prints straight. */
  const stockCell = Math.max(box.x1 - box.x0, box.y1 - box.y0) / 1400;
  const stockSegs = [];
  layers.forEach(L => (L.blanks || []).forEach(b => {
    const C = [];
    for (const z of [L.z0, L.z1]) for (const c of [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]) C.push(proj(c[0], c[1], z));
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
      .forEach(e => stockSegs.push([C[e[0]], C[e[1]]]));
  }));
  silhouetteLoops(stockGeometry(plan).tris, "iso", { cell: stockCell, minCellMm: 0.05 }).forEach(loop => {
    const exact = straightenLoop(snapLoopToSegments(loop, stockSegs, stockCell * 3), 8, stockCell * 2.5);
    body.push(dwgPoly(exact.map(p => ({ x: v.X(p.x), y: v.Y(p.y) })), DW.heavy, null, true));
  });
  // The mold last, over the blocks: it is the reference, and a dashed line under
  // a white face is a dashed line nobody can see.
  ctx.art.iso.loops.forEach(loop => {
    body.push(dwgPoly(loop.map(p => ({ x: v.X(p.x), y: v.Y(p.y) })), DW.med, DASH_MOLD, true));
  });
  /* Then its waterlines, thin over the medium silhouette: the surface between
     the silhouette's edges. FULL loops — everything mold on this sheet is
     hidden-line dashed already, so the far side of a section draws like the
     rest of it; a culled half-contour read as a broken line, not a convention.
     waterlinePaths drops duplicate levels, specks, and any stretch tangent to
     the silhouette (two dashed curves a stroke apart bead into a smear). */
  body.push(...waterlinePaths(ctx.art, v, s, l => l.kind === "interface" ? DASH_MOLD : DASH_THIN));

  spreadLabels(labels, 13, M.t + 6, DWG_ISO_H - M.b)
    .forEach(l => body.push(leader(l.px, l.py, DWG_SHEET_W - M.r + 16, l.y, l.text)));

  /* Overall size, dimensioned along the three isometric axes. A pictorial view
     is not normally the dimensioned one — sheet 2 is — but "how big is this
     block" is the question somebody asks holding the sheet next to the rack, and
     making them turn the page for it is a bad trade. */
  const B = ctx.stock;
  if (B) {
    const fx0 = P(B.x0, B.y1, B.z0), fx1 = P(B.x1, B.y1, B.z0);
    const ry0 = P(B.x1, B.y1, B.z0), ry1 = P(B.x1, B.y0, B.z0);
    const vz0 = P(B.x0, B.y1, B.z0), vz1 = P(B.x0, B.y1, B.z1);
    let n = awayNormal(fx0, fx1, centre);
    body.push(dimIso(fx0, fx1, n.nx, n.ny, B.x1 - B.x0, 26));
    n = awayNormal(ry0, ry1, centre);
    body.push(dimIso(ry0, ry1, n.nx, n.ny, B.y1 - B.y0, 26));
    n = awayNormal(vz0, vz1, centre);
    body.push(dimIso(vz0, vz1, n.nx, n.ny, B.z1 - B.z0, 26));
  }
  /* Section splits: the one thing on this sheet that changes what somebody DOES.
     Traced along the two VISIBLE top edges of the ACTUAL blank the split falls
     on — front then right. Not the overall stock box: on a stepped stack that
     box is wider than the block at that height, so the rule floated in space
     beside the model and read as a stray line rather than a parting plane. */
  ctx.splits.forEach((z) => {
    layers.filter(L => Math.abs(L.z1 - z) < 1e-6).forEach(L => (L.blanks || []).forEach(b => {
      const a = P(b.x0, b.y1, z), m = P(b.x1, b.y1, z), c = P(b.x1, b.y0, z);
      body.push(dwgLine(a.x, a.y, m.x, m.y, DW.heavy), dwgLine(m.x, m.y, c.x, c.y, DW.heavy));
    }));
  });

  const h0 = ctx.stock ? ctx.stock.z1 - ctx.stock.z0 : 0;
  const moldH = plan.bounds ? plan.bounds.z1 - plan.bounds.z0 : 0;
  const note = [
    ["OVERALL STOCK", `${fmtDwg(ctx.stock ? ctx.stock.x1 - ctx.stock.x0 : 0).primary} × ${fmtDwg(ctx.stock ? ctx.stock.y1 - ctx.stock.y0 : 0).primary} × ${fmtDwg(h0).primary}`],
    ["MOLD HEIGHT", fmtDwgLine(moldH)],
    ["BOARDS", `${layers.length} layer${layers.length === 1 ? "" : "s"}, ${layers.reduce((n2, L) => n2 + (L.blanks || []).length, 0)} block${layers.reduce((n2, L) => n2 + (L.blanks || []).length, 0) === 1 ? "" : "s"}`],
    ["MACHINE SETUPS", String(ctx.sectionCount)],
  ];
  /* Sized from its contents. A fixed-width box was fine until a 30in stack made
     the overall-size string long enough to run back into its own label. */
  const nbLab = Math.max(...note.map(r => estTextW(r[0], DW.tiny)));
  const nbVal = Math.max(...note.map(r => estTextW(r[1], DW.font)));
  const nbW = Math.min(DWG_SHEET_W - 12, Math.ceil(nbLab + nbVal + 26));
  const nbRow = 15;
  const nb = [`<rect x="6" y="8" width="${nbW}" height="${note.length * nbRow + 12}" fill="#fff" stroke="currentColor" stroke-width="${DW.thin}"/>`];
  note.forEach((row, i) => {
    nb.push(dwgText(13, 23 + i * nbRow, row[0], DW.tiny, { track: "0.06em" }));
    nb.push(dwgText(nbW - 7, 23 + i * nbRow, row[1], DW.font, { anchor: "end", bold: true }));
  });

  const svg = `<svg class="dwg-view" viewBox="0 0 ${DWG_SHEET_W} ${DWG_ISO_H}" width="100%" role="img"
    aria-label="Assembled isometric view of the mold stock, ${layers.length} layers">
    <defs><pattern id="dwgHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" stroke-width="0.5"/></pattern></defs>
    ${body.join("\n    ")}
    ${nb.join("\n    ")}
    ${scaleBar(s, 6, DWG_ISO_H - 10)}
  </svg>`;

  const rows = [];
  layers.forEach((L, i) => (L.blanks || []).forEach((b, k) => rows.push(`<tr>
    <td class="num">${blankLabel(i, k, L.blanks.length)}</td>
    <td>${esc(fmtDwgLine(L.thickness))}</td>
    <td>${esc(fmtDwgLine(b.x1 - b.x0))} × ${esc(fmtDwgLine(b.y1 - b.y0))}</td>
    <td class="num">${(L.section || 0) + 1}</td></tr>`)));

  const inset = moldInsetSvg(ctx.art);
  return dwgPage(plan, ctx, 1, "GENERAL VIEW — ASSEMBLED STOCK", dwgRatio(s), `
    ${svg}
    <div class="dwg-cols">
      <div class="dwg-key">
        <div class="dwg-cap">LAYER KEY — EXPLODED</div>
        ${stackSvg(plan, { width: 236 })}
      </div>
      ${inset ? `<div class="dwg-inset">
        <div class="dwg-cap">AS MACHINED — MOLD ONLY</div>
        ${inset}
      </div>` : ""}
      <div class="dwg-tabwrap">
        <div class="dwg-cap">BLOCKS TO CUT</div>
        <table class="ws-t rows dwg-t">
          <thead><tr><th class="num">Blank</th><th>Board</th><th>Size (X × Y)</th><th class="num">Setup</th></tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
    </div>`,
    "Hatching and dashed lines are the mold inside the stock, reference only: medium dashes its silhouette, thin long dashes its section at each glue line, thin short dashes intermediate sections (the mold-only inset draws them solid).");
}

/* ============================================================================
   SHEET 2 — THREE-VIEW, THIRD ANGLE
   ============================================================================
   Third angle (the US convention, and the one CS-005's machinist reads): the
   top view sits ABOVE the front view, the right view to the RIGHT of it. All
   three share one scale and stay aligned, which is what makes reading a feature
   across two views possible at all. */

function thirdAngleSymbol(x, y) {
  // The truncated cone, small end toward the viewer: a trapezoid beside two
  // concentric circles. Drawn rather than described because it is the only
  // unambiguous statement of which projection a sheet is in.
  const r = 7;
  return [
    `<polygon points="${f1(x)},${f1(y - r)} ${f1(x)},${f1(y + r)} ${f1(x + 17)},${f1(y + r * 0.55)} ${f1(x + 17)},${f1(y - r * 0.55)}" fill="none" stroke="currentColor" stroke-width="${DW.thin}"/>`,
    `<circle cx="${f1(x + 30)}" cy="${f1(y)}" r="${r}" fill="none" stroke="currentColor" stroke-width="${DW.thin}"/>`,
    `<circle cx="${f1(x + 30)}" cy="${f1(y)}" r="${f1(r * 0.55)}" fill="none" stroke="currentColor" stroke-width="${DW.thin}"/>`,
    dwgLine(x - 3, y, x + 41, y, DW.thin, DASH_BELOW),
  ].join("");
}

function sheetThreeView(plan, ctx) {
  const B = ctx.stock;
  const layers = dwgLayers(plan);
  const M = { l: 110, r: 60, t: 26, b: 58 };
  const gap = 62;
  const X = B.x1 - B.x0, Y = B.y1 - B.y0, Z = B.z1 - B.z0;
  const availW = DWG_SHEET_W - M.l - M.r - gap;
  const availH = DWG_3V_H - M.t - M.b - gap;
  const s = Math.min(
    X + Y > 1e-9 ? availW / (X + Y) : Infinity,
    Y + Z > 1e-9 ? availH / (Y + Z) : Infinity);
  const scale = Number.isFinite(s) && s > 0 ? s : 1;
  /* Third angle fixes the layout, so on a wide flat mold the WIDTH binds and the
     views use only part of the height. Size the drawing area to what the layout
     actually needs instead of leaving a page of blank inside the SVG — the title
     block floats to the foot of the sheet either way. */
  const H = Math.min(DWG_3V_H, Math.ceil(M.t + (Y + Z) * scale + gap + M.b));

  const topV = dwgView({ x0: B.x0, y0: B.y0, x1: B.x1, y1: B.y1 }, scale, M.l, M.t, true);
  const frontV = dwgView({ x0: B.x0, y0: B.z0, x1: B.x1, y1: B.z1 }, scale, M.l, M.t + Y * scale + gap, true);
  const rightV = dwgView({ x0: B.y0, y0: B.z0, x1: B.y1, y1: B.z1 }, scale, M.l + X * scale + gap, M.t + Y * scale + gap, true);

  const out = [];
  const rect = (v, a0, b0, a1, b1, width, dash) =>
    dwgPoly([{ x: v.X(a0), y: v.Y(b0) }, { x: v.X(a1), y: v.Y(b0) }, { x: v.X(a1), y: v.Y(b1) }, { x: v.X(a0), y: v.Y(b1) }], width, dash, true);

  // Blocks. Every blank in every view, so a two-block layer reads as two blocks
  // from the side as well as from above.
  layers.forEach(L => (L.blanks || []).forEach(b => {
    out.push(rect(topV, b.x0, b.y0, b.x1, b.y1, DW.med));
    out.push(rect(frontV, b.x0, L.z0, b.x1, L.z1, DW.med));
    out.push(rect(rightV, b.y0, L.z0, b.y1, L.z1, DW.med));
  }));
  // Overall outline heavy over the top, so the block's envelope reads first.
  out.push(rect(topV, B.x0, B.y0, B.x1, B.y1, DW.heavy));
  out.push(rect(frontV, B.x0, B.z0, B.x1, B.z1, DW.heavy));
  out.push(rect(rightV, B.y0, B.z0, B.y1, B.z1, DW.heavy));

  // The mold.
  [["top", topV], ["front", frontV], ["right", rightV]].forEach(([name, v]) => {
    ctx.art[name].loops.forEach(loop => out.push(dwgPoly(loop.map(p => ({ x: v.X(p.x), y: v.Y(p.y) })), DW.med, DASH_MOLD, true)));
  });

  // Section splits run right across the elevations: this is where the stack
  // becomes two separate machine setups and two separate glue-ups.
  ctx.splits.forEach((z, i) => {
    out.push(dwgLine(frontV.ox - 6, frontV.Y(z), frontV.ox + frontV.w + 6, frontV.Y(z), DW.heavy));
    out.push(dwgLine(rightV.ox - 6, rightV.Y(z), rightV.ox + rightV.w + 6, rightV.Y(z), DW.heavy));
    out.push(dwgText(rightV.ox + rightV.w + 10, rightV.Y(z) - 3, `SPLIT ${i + 1}`, DW.tiny, { bold: true }));
  });

  // Dimensions: each overall once, on the view that owns it.
  out.push(dimH(topV.ox, topV.ox + topV.w, topV.oy + topV.h + 30, topV.oy + topV.h, X));
  out.push(dimV(topV.oy, topV.oy + topV.h, topV.ox - 30, topV.ox, Y));
  out.push(dimH(frontV.ox, frontV.ox + frontV.w, frontV.oy + frontV.h + 34, frontV.oy + frontV.h, X));
  out.push(dimH(rightV.ox, rightV.ox + rightV.w, rightV.oy + rightV.h + 34, rightV.oy + rightV.h, Y));
  /* Overall height goes in the gutter BETWEEN the front and right views, not on
     the left: the left of the front elevation is the board callout column, and a
     dimension line there is crossed by every one of its leaders. */
  out.push(dimV(frontV.oy, frontV.oy + frontV.h, frontV.ox + frontV.w + 32, frontV.ox + frontV.w, Z));

  /* The stack recipe, board by board, up the front elevation. Ticked at every
     glue line and LABELLED ON LEADERS rather than as a dimension chain: on a
     9in stack of 1in boards each layer is ten page pixels, and six stacked
     dimension labels in that space overprint into one illegible smear. The
     leader column spreads them; the ticks keep them tied to the right joint. */
  const chain = [];
  layers.forEach((L, i) => {
    out.push(dwgLine(frontV.ox - 12, frontV.Y(L.z0), frontV.ox, frontV.Y(L.z0), DW.thin));
    chain.push({ y: frontV.Y((L.z0 + L.z1) / 2), px: frontV.ox, py: frontV.Y((L.z0 + L.z1) / 2), text: `L${i + 1} · ${fmtDwg(L.thickness).primary}` });
  });
  out.push(dwgLine(frontV.ox - 12, frontV.Y(B.z1), frontV.ox, frontV.Y(B.z1), DW.thin));
  spreadLabels(chain, 12.5, frontV.oy, frontV.oy + frontV.h)
    .forEach(l => out.push(leader(l.px, l.py, M.l - 46, l.y, l.text)));

  const cap = (v, text) => dwgText(v.ox + v.w / 2, v.oy - 9, text, DW.tiny, { anchor: "middle", bold: true, track: "0.14em" });
  out.push(cap(topV, "TOP"), cap(frontV, "FRONT"), cap(rightV, "RIGHT"));
  out.push(thirdAngleSymbol(DWG_SHEET_W - 62, 18));
  out.push(dwgText(DWG_SHEET_W - 41, 38, "THIRD ANGLE", DW.tiny, { anchor: "middle", track: "0.08em" }));

  const svg = `<svg class="dwg-view" viewBox="0 0 ${DWG_SHEET_W} ${H}" width="100%" role="img"
    aria-label="Three-view drawing of the mold stock: top, front and right elevations">
    ${out.join("\n    ")}
    ${scaleBar(scale, 6, H - 8)}
  </svg>`;

  /* A wide flat mold makes the sheet WIDTH bind, so the three views need only
     part of the page height. Centre them in what is left rather than hanging
     them off the top rule with a hand's width of nothing underneath. */
  return dwgPage(plan, ctx, 2, "THREE-VIEW — THIRD ANGLE", dwgRatio(scale), `<div class="dwg-fill">${svg}</div>`);
}

/* ============================================================================
   SHEETS 3..N — ONE PER LAYER, "WHERE THIS BOARD GOES"
   ============================================================================
   This is the sheet the drawing set exists for. You are holding board L3, the
   glue is mixed, and you have four hours of clamp time to get it in the right
   place (CS-003 §7.3). What you need is not an absolute coordinate in the mold's
   CAD frame — it is how far in from each edge of the board already on the table.

   So: this layer solid, the layer below it dash-dot underneath, and the inset
   from each of the four edges. The absolute datum table beside it is the
   cross-check, because a board sawn 3mm oversize makes every edge-relative
   number wrong in the same direction and the datum is how you catch that.

   Every layer sheet is drawn at ONE shared scale in ONE shared frame, so
   flipping between sheets does not also change the size of everything. */

function sheetLayer(plan, ctx, i) {
  const layers = dwgLayers(plan);
  const L = layers[i];
  const below = i > 0 ? layers[i - 1] : null;
  const M = ctx.layerMargins;
  const s = ctx.layerScale;
  const fw = (ctx.frame.x1 - ctx.frame.x0) * s, fh = (ctx.frame.y1 - ctx.frame.y0) * s;
  const v = dwgView(ctx.frame, s,
    M.l + (DWG_SHEET_W - M.l - M.r - fw) / 2,
    M.t + (DWG_LAYER_H - M.t - M.b - fh) / 2, true);
  const out = [];
  const rect = (b, width, dash) => dwgPoly([
    { x: v.X(b.x0), y: v.Y(b.y0) }, { x: v.X(b.x1), y: v.Y(b.y0) },
    { x: v.X(b.x1), y: v.Y(b.y1) }, { x: v.X(b.x0), y: v.Y(b.y1) }], width, dash, true);

  if (below) (below.blanks || []).forEach(b => out.push(rect(b, DW.thin, DASH_BELOW)));
  // The mold's own outline at this height, so which way round the board goes is
  // a picture rather than a note somebody has to trust.
  (L.islands || []).forEach(is => {
    if ((is.contour || []).length > 2) out.push(dwgPoly(is.contour.map(p => ({ x: v.X(p.x), y: v.Y(p.y) })), DW.med, DASH_MOLD, true));
  });
  (L.blanks || []).forEach(b => {
    out.push(rect(b, DW.heavy));
    out.push(centerline(v.X((b.x0 + b.x1) / 2), v.Y(b.y0) + 9, v.X((b.x0 + b.x1) / 2), v.Y(b.y1) - 9));
    out.push(centerline(v.X(b.x0) - 9, v.Y((b.y0 + b.y1) / 2), v.X(b.x1) + 9, v.Y((b.y0 + b.y1) / 2)));
  });

  const nB = (L.blanks || []).length;
  const notes = [];
  (L.blanks || []).forEach((b, k) => {
    const tag = blankLabel(i, k, nB);
    /* Above the board's LEFT corner. Outside, because inside it lands on the
       heavy edge rule and on the mold outline; and off-centre, because the
       blank's own vertical centreline runs through the middle of the top edge
       and a tag centred there sits exactly on it. */
    out.push(dwgText(v.X(b.x0) + 2, v.Y(b.y1) - 6, tag, DW.font, { anchor: "start", bold: true }));
    // The board's own size, always — it is the first thing checked against
    // whatever came off the saw.
    out.push(dimH(v.X(b.x0), v.X(b.x1), v.oy + v.h + 26 + k * 27, v.Y(b.y0), b.x1 - b.x0));
    out.push(dimV(v.Y(b.y0), v.Y(b.y1), v.ox - 26 - k * 27, v.X(b.x0), b.y1 - b.y0));

    const sup = below ? bestSupport(b, below.blanks) : null;
    const ins = insetsBetween(sup, b);
    if (!ins) {
      /* Layer 1 (or an unsupported blank): position it off the datum corner
         instead, since there is no board underneath to measure from. Skipped
         when the offset is zero — which it is for the very blank that DEFINES
         the datum, and a dimension reading 0″ from a corner to itself is noise
         on the one sheet that most needs to be plain. The table still shows it. */
      if (Math.abs(b.x0 - ctx.datum.x) > 0.5) out.push(dimH(v.X(ctx.datum.x), v.X(b.x0), v.oy + v.h + 26 + (nB + k) * 27, v.Y(b.y0), b.x0 - ctx.datum.x));
      if (Math.abs(b.y0 - ctx.datum.y) > 0.5) out.push(dimV(v.Y(ctx.datum.y), v.Y(b.y0), v.ox - 26 - (nB + k) * 27, v.X(b.x0), b.y0 - ctx.datum.y));
      if (below) notes.push(`${tag} sits over no board below it — support it during glue-up so it cannot sag or shift.`);
      return;
    }
    const top = v.Y(b.y1), bot = v.Y(b.y0);
    const yA = top + (bot - top) * 0.3, yB = top + (bot - top) * 0.7;
    const xA = v.X(b.x0) + (v.X(b.x1) - v.X(b.x0)) * 0.32, xB = v.X(b.x0) + (v.X(b.x1) - v.X(b.x0)) * 0.68;
    /* Only the insets that are short enough to draw as a dimension get drawn.
       On a two-block layer sitting on one wide base, the far-edge inset is 500mm
       — a correct number, and a dimension line straight across the sheet and
       through the other block. All four are in the table either way; what the
       drawing shows is the pair you actually measure to. */
    /* …and an inset of zero is not drawn either: the two edges are flush, there
       is nothing to measure, and a dimension reading 0" printed on top of the
       coincident rule is the least readable thing on the sheet. The table still
       carries it. */
    const fits = (mm, span) => Math.abs(mm) > 0.5 && Math.abs(mm) * v.s <= span * 0.42;
    // `tight` names the end AWAY from this board, so a label too short to sit
    // between its own arrows hangs outside the board instead of over its edge.
    if (fits(ins.left, v.w)) out.push(dimH(v.X(sup.x0), v.X(b.x0), yA, null, ins.left, { tight: "lo" }));
    if (fits(ins.right, v.w)) out.push(dimH(v.X(b.x1), v.X(sup.x1), yB, null, ins.right, { tight: "hi" }));
    if (fits(ins.front, v.h)) out.push(dimV(v.Y(sup.y0), v.Y(b.y0), xA, null, ins.front, { tight: "hi" }));
    if (fits(ins.back, v.h)) out.push(dimV(v.Y(b.y1), v.Y(sup.y1), xB, null, ins.back, { tight: "lo" }));
    const over = [["left", ins.left], ["right", ins.right], ["front", ins.front], ["back", ins.back]]
      .filter(([, mm]) => mm < -0.05).map(([side]) => side);
    if (over.length) {
      notes.push(`${tag} overhangs the board below on the ${over.join(" and ")} edge${over.length > 1 ? "s" : ""} — support it during glue-up so it cannot sag or shift.`);
      // Clamped to the sheet: the drawing area's right edge is not the paper's,
      // and a leader aimed past it took the word off the page.
      out.push(leader(v.X((b.x0 + b.x1) / 2), v.Y((b.y0 + b.y1) / 2),
        Math.min(v.ox + v.w + 26, DWG_SHEET_W - M.r + 6), v.Y(b.y1) + 16, "OVERHANG"));
    }
  });

  /* The datum symbol is the annotation; what it MEANS belongs in the sheet note
     with the rest of the legend. A sentence floating next to the mark sat across
     the extension lines of the very dimensions it was explaining. */
  out.push(datumMark(v.X(ctx.datum.x), v.Y(ctx.datum.y), "A"));
  /* The legend goes in the title block, not on the drawing. Laid along the top
     of the drawing area it was the one piece of text nothing could be kept away
     from: a vertical inset label hanging off the top edge of a board reaches up
     by its own STRING LENGTH, and where that lands depends on the mold. Notes
     belong in the notes. */
  const legend = below
    ? `Datum A is the near-left corner of the stack. — · — is L${i} underneath; – – – is the mold at this height.`
    : `Datum A is the near-left corner of the stack, set by this board. – – – is the mold at this height.`;

  const svg = `<svg class="dwg-view" viewBox="0 0 ${DWG_SHEET_W} ${DWG_LAYER_H}" width="100%" role="img"
    aria-label="Top view of layer ${i + 1} with its placement dimensions">
    ${out.join("\n    ")}
    ${scaleBar(s, 6, DWG_LAYER_H - 8)}
  </svg>`;

  const place = (L.blanks || []).map((b, k) => {
    const sup = below ? bestSupport(b, below.blanks) : null;
    const ins = insetsBetween(sup, b);
    return `<tr>
      <td class="num">${blankLabel(i, k, nB)}</td>
      <td>${esc(fmtDwgLine(b.x1 - b.x0))} × ${esc(fmtDwgLine(b.y1 - b.y0))}</td>
      ${ins
        ? `<td>${esc(fmtDwgLine(ins.left))}</td><td>${esc(fmtDwgLine(ins.right))}</td><td>${esc(fmtDwgLine(ins.front))}</td><td>${esc(fmtDwgLine(ins.back))}</td>`
        : `<td colspan="4" class="tny">off the datum corner — no board below</td>`}
    </tr>`;
  }).join("");
  const datumRows = (L.blanks || []).map((b, k) => `<tr>
      <td class="num">${blankLabel(i, k, nB)}</td>
      <td>${esc(fmtDwgLine(b.x0 - ctx.datum.x))}</td>
      <td>${esc(fmtDwgLine(b.y0 - ctx.datum.y))}</td>
      <td>${esc(fmtDwgLine(b.x1 - ctx.datum.x))}</td>
      <td>${esc(fmtDwgLine(b.y1 - ctx.datum.y))}</td>
    </tr>`).join("");

  const body = `
    ${svg}
    <div class="dwg-cols">
      <div class="dwg-tabwrap">
        <div class="dwg-cap">${below ? `PLACEMENT ON L${i} — INSET FROM EACH EDGE` : "PLACEMENT — FROM DATUM A"}</div>
        <table class="ws-t rows dwg-t">
          <thead><tr><th class="num">Blank</th><th>Board size</th>${below ? "<th>Left</th><th>Right</th><th>Front</th><th>Back</th>" : "<th colspan=\"4\">Position</th>"}</tr></thead>
          <tbody>${place}</tbody>
        </table>
      </div>
      <div class="dwg-tabwrap">
        <div class="dwg-cap">CHECK — FROM DATUM A</div>
        <table class="ws-t rows dwg-t">
          <thead><tr><th class="num">Blank</th><th>X min</th><th>Y min</th><th>X max</th><th>Y max</th></tr></thead>
          <tbody>${datumRows}</tbody>
        </table>
      </div>
    </div>
    ${notes.length ? `<div class="dwg-notes">${notes.map(n => `<div>${esc(n)}</div>`).join("")}</div>` : ""}`;

  const title = `LAYER ${i + 1} OF ${layers.length} — ${esc(fmtDwg(L.thickness).primary)} BOARD · SETUP ${(L.section || 0) + 1}`;
  return dwgPage(plan, ctx, 3 + i, title, dwgRatio(s), body, legend);
}

/* ============================================================================
   SHEET SHELL
   ============================================================================
   Each sheet is a .ws-page, the same box the work-order traveler prints into.
   That is not laziness — it is what makes @page, the #app/#printroot print swap
   and the B&W proof toggle apply here with no second set of rules to keep
   correct. The footer is deliberately NOT .ws-foot: that one is position:fixed
   in print so it repeats on every page, which is right for a two-page traveler
   and wrong for a set where each sheet carries its own title block. */

function dwgPage(plan, ctx, sheetNo, title, scaleTxt, body, sheetNote) {
  return `<div class="ws-page dwg-page">
    <div class="dwg-top">
      <span>FEB COMPOSITES · MOLD STACK DRAWING</span>
      <span>${esc(plan.name || plan.id)}</span>
    </div>
    ${body}
    <div class="dwg-tb">
      <div class="tb-brand">FEB<span>SN6</span></div>
      <div class="tb-c wide"><span class="lab">Mold</span><span class="val">${esc(plan.name || "—")}</span></div>
      <div class="tb-c"><span class="lab">Plan</span><span class="val">${esc(plan.id || "—")}</span></div>
      <div class="tb-c"><span class="lab">Sheet</span><span class="val">${sheetNo} / ${ctx.sheets}</span></div>
      <div class="tb-c wide"><span class="lab">Sheet title</span><span class="val sm">${title}</span></div>
      <div class="tb-c"><span class="lab">Scale</span><span class="val">${esc(scaleTxt)}</span></div>
      <div class="tb-c"><span class="lab">Planned</span><span class="val sm">${esc(plan.by || "—")}<br>${esc(String(plan.ts || "").slice(0, 10))}</span></div>
      <div class="tb-note">
        <b>Dimensions govern — do not measure off the print.</b> Inches to the nearest 1/16" (≈ marks a value that is not exactly on a 1/16); the figure in [brackets] is the exact millimetre. ${sheetNote ? esc(sheetNote) + " " : ""}${esc(ctx.moldNote)}${ctx.meshNote ? " " + esc(ctx.meshNote) : ""} Source: ${esc(plan.source || "—")}. Printed ${esc(ctx.printed)}.
      </div>
    </div>
  </div>`;
}

/* ---------------- the document ----------------
   Pure: plan in, string out, no DOM anywhere. That is what lets
   tools/test_app.mjs assert on the whole set under node, and it is the same
   split slicer.js and meshview.js already use. */
function drawingSetHtml(plan, opts) {
  opts = opts || {};
  const layers = dwgLayers(plan);
  if (!layers.length) {
    return `<div class="dwg"><div class="ws-page dwg-page"><div class="dwg-top"><span>FEB COMPOSITES · MOLD STACK DRAWING</span></div>
      <p>This plan has no layers, so there is nothing to draw.</p></div></div>`;
  }
  const stock = stockBounds(plan) || { x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 };
  const art = moldArt(plan, opts.tris);
  const foot = planFootprint(plan);
  const M = { l: 92, r: 66, t: 34, b: 74 };
  const frame = padBox(foot, Math.max(2, Math.max(foot.x1 - foot.x0, foot.y1 - foot.y0) * 0.05));
  const ctx = {
    art, stock, frame,
    datum: planDatum(plan),
    layerMargins: M,
    layerScale: dwgFit(frame, DWG_SHEET_W - M.l - M.r, DWG_LAYER_H - M.t - M.b),
    splits: sectionSplitsZ(plan),
    sectionCount: sectionCount(plan),
    sheets: 2 + layers.length,
    printed: today(),
    moldNote: moldSourceNote(art),
    meshNote: opts.meshNote || "",
  };
  return `<div class="dwg">
    ${sheetIso(plan, ctx)}
    ${sheetThreeView(plan, ctx)}
    ${layers.map((L, i) => sheetLayer(plan, ctx, i)).join("")}
  </div>`;
}

/* The one function that touches the browser. Async because the mold mesh lives
   in Storage: it is fetched (and cached) by meshview.js's mvLoadMesh, which
   already names the CORS/403/404 failures in words, so a drawing set that has
   to fall back to layer outlines can say WHY on every sheet. */
async function openDrawings(planId) {
  const plan = typeof planById === "function" ? planById(planId) : null;
  if (!plan) { toast("That plan is gone.", "error"); return; }
  let tris = null, meshNote = "";
  if (plan.meshUrl) {
    try {
      toast("Loading the mold mesh for the drawings…");
      tris = await mvLoadMesh(plan.meshUrl);
    } catch (e) { meshNote = e.message; }
  }
  const html = drawingSetHtml(plan, { tris, meshNote });
  const n = 2 + dwgLayers(plan).length;
  mountSheet(html, true, `US Letter · ${n} sheets · this is exactly what prints`, `${plan.name || plan.id} drawings`);
  document.body.classList.add("previewing");
  if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
}
