"use strict";
/* packer.js — turn a pile of blanks into a cut list for the saw. PURE, like
   slicer.js: no DOM, no Firebase, so it runs in the Worker and under node.

   ============================================================================
   THE CONSTRAINT: you can only cut all the way across
   ============================================================================
   Simon, confirming it as a hard rule and not a preference: "You can only cut
   all the way across." That is the guillotine constraint. Every cut splits the
   piece you are holding, edge to edge, into two smaller pieces. You can never
   cut a notch.

   So a board is a BINARY TREE of cuts, and that is exactly how it is modelled
   here — not as a list of (x, y) placements with the cuts reverse-engineered
   afterwards, which is how you end up printing a plan the saw cannot make.

       +-------------------------+          cut 1 (rip, full width)
       |            |            |          -> two pieces
       |     A      |            |
       |            |     cut 2  |          cut 2 crosscuts the RIGHT piece
       |------------|------------|             only — it spans that piece,
       |     B      |     C      |             not the original board
       +-------------------------+

   A pre-order walk of the tree is the order to make the cuts, and every cut in
   it spans whatever is in your hands at that moment. That property is
   structural, not checked afterwards.

   ============================================================================
   POLICY: spend offcuts before sheets
   ============================================================================
   Boards are tried smallest-first. The pile of remnants is only worth keeping
   if something actually consumes it, and Simon confirmed they keep pieces down
   to about 4 x 10 inches. Reaching for a fresh 4x8 while a usable offcut sits
   on the rack is how the rack fills up. */

const KERF_MM = 3.175;          // 1/8in saw blade
const MIN_REMNANT_MM = 101.6;   // 4in — Simon: "we have had small like 4 x 10 inch pieces"

/* One blank to cut. { id, w, h, thickness, density, label } — w/h already
   include the glue margin, straight from the slicer. */
function partArea(p) { return p.w * p.h; }

/* Can `part` sit in a free rect of w x h, and if so at what orientation?
   PU tooling board has no grain, so a blank may be turned 90 degrees. */
function fitIn(part, w, h, allowRotate) {
  if (part.w <= w + 1e-9 && part.h <= h + 1e-9) return { w: part.w, h: part.h, rotated: false };
  if (allowRotate !== false && part.h <= w + 1e-9 && part.w <= h + 1e-9) return { w: part.h, h: part.w, rotated: true };
  return null;
}

/* Pack as many parts as possible into one board, guillotine-only.

   Recursive: at each free rectangle, take the largest part that fits, put it in
   the corner, then make ONE cut that separates it from the rest and recurse
   into both children. Because every cut is taken across the current rectangle,
   the result is guillotine-feasible by construction. */
function packBoard(board, parts, opts) {
  opts = opts || {};
  const kerf = opts.kerf == null ? KERF_MM : opts.kerf;
  const rotate = opts.allowRotate !== false;
  const placed = [];
  const cuts = [];
  const remaining = parts.slice().sort((a, b) => (Math.max(b.w, b.h) - Math.max(a.w, a.h)) || (partArea(b) - partArea(a)));

  function fill(x, y, w, h, depth) {
    if (w <= 0 || h <= 0 || !remaining.length) return { leftover: [{ x, y, w, h }] };
    // Largest part that fits here.
    let idx = -1, fit = null;
    for (let i = 0; i < remaining.length; i++) {
      const f = fitIn(remaining[i], w, h, rotate);
      if (f) { idx = i; fit = f; break; }
    }
    if (idx < 0) return { leftover: [{ x, y, w, h }] };
    const part = remaining.splice(idx, 1)[0];
    placed.push({ part, x, y, w: fit.w, h: fit.h, rotated: fit.rotated });

    // Two ways to split what is left. Prefer the one that keeps the bigger
    // single offcut whole, because a big rectangle is reusable and two thin
    // strips are scrap.
    const restW = w - fit.w - kerf;
    const restH = h - fit.h - kerf;
    const horizontalFirst = Math.max(restW * h, w * restH) === restW * h;

    /* Record the cuts. The span of the SECOND cut depends on whether the first
       one actually happened: if the leftover was thinner than the blade there
       is nothing to separate, no cut is made, and the piece still in hand is
       the full rectangle — so the second cut has to cross all of it, not just
       the part. Getting this wrong prints a cut that stops halfway, which is
       a notch, which a saw cannot do. */
    let a, b;
    if (horizontalFirst) {
      const cutA = restW > 0;
      if (cutA) cuts.push({ axis: "x", at: x + fit.w, from: y, to: y + h, depth });
      a = { x: x + fit.w + kerf, y, w: restW, h };
      // Whatever is still in hand after cut A: fit.w wide if it happened, else w.
      const heldW = cutA ? fit.w : w;
      if (restH > 0) cuts.push({ axis: "y", at: y + fit.h, from: x, to: x + heldW, depth: depth + 1 });
      b = { x, y: y + fit.h + kerf, w: heldW, h: restH };
    } else {
      const cutA = restH > 0;
      if (cutA) cuts.push({ axis: "y", at: y + fit.h, from: x, to: x + w, depth });
      a = { x, y: y + fit.h + kerf, w, h: restH };
      const heldH = cutA ? fit.h : h;
      if (restW > 0) cuts.push({ axis: "x", at: x + fit.w, from: y, to: y + heldH, depth: depth + 1 });
      b = { x: x + fit.w + kerf, y, w: restW, h: heldH };
    }
    const ra = fill(a.x, a.y, a.w, a.h, depth + 2);
    const rb = fill(b.x, b.y, b.w, b.h, depth + 2);
    return { leftover: ra.leftover.concat(rb.leftover) };
  }

  const r = fill(0, 0, board.w, board.h, 0);
  const usable = r.leftover.filter(o => o.w >= MIN_REMNANT_MM && o.h >= MIN_REMNANT_MM);
  return { placed, cuts, leftover: usable, unplaced: remaining };
}

/* Pack every blank across the whole stock list.

   `blanks`  [{ id, w, h, thickness, density, label }]
   `boards`  [{ id, len, wid, thk, density, qty, kind, label }]  (mm)
   Returns per-board plans, leftovers to write back, and any shortfall. */
function packAll(blanks, boards, opts) {
  opts = opts || {};
  const tol = opts.thicknessTol == null ? 0.5 : opts.thicknessTol;
  const plans = [];
  const shortfall = [];
  // Bucket by what can physically substitute for what: a blank can only come
  // from a board of the same thickness, and density is not interchangeable
  // (CS-004 — 60lb seals better, and you cannot swap it in silently).
  const buckets = new Map();
  for (const b of blanks) {
    const k = `${Math.round(b.thickness / tol)}|${b.density || 30}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(b);
  }
  // Expand quantities into individual boards, smallest first (spend offcuts).
  const pool = [];
  for (const bd of boards) {
    for (let i = 0; i < (bd.qty || 1); i++) {
      pool.push({ src: bd, w: bd.len, h: bd.wid, thk: bd.thk, density: bd.density || 30, kind: bd.kind, unit: i });
    }
  }
  pool.sort((a, b) => (a.w * a.h) - (b.w * b.h));

  for (const [k, wanted] of buckets) {
    let todo = wanted.slice();
    const [thkKey, densKey] = k.split("|");
    for (const board of pool) {
      if (!todo.length) break;
      if (board.used) continue;
      if (Math.round(board.thk / tol) !== +thkKey) continue;
      if (String(board.density) !== densKey) continue;
      const r = packBoard(board, todo, opts);
      if (!r.placed.length) continue;
      board.used = true;
      todo = r.unplaced;
      plans.push({
        board, placed: r.placed, cuts: r.cuts, leftover: r.leftover,
        thickness: board.thk, density: board.density,
      });
    }
    // Nothing left on the rack that fits: this is a purchase, not a failure.
    for (const p of todo) shortfall.push(p);
  }
  return { plans, shortfall, boardsUsed: plans.length };
}

/* Human-readable cut sequence for one board. The saw operator reads this top to
   bottom; every line is a cut they can actually make on the piece in hand. */
function cutSequence(plan) {
  return plan.cuts.map((c, i) => ({
    n: i + 1,
    text: c.axis === "x"
      ? `Rip at ${(c.at).toFixed(1)}mm (${(c.at / 25.4).toFixed(2)}in) from the left edge`
      : `Crosscut at ${(c.at).toFixed(1)}mm (${(c.at / 25.4).toFixed(2)}in) from the bottom edge`,
    axis: c.axis, at: c.at, from: c.from, to: c.to,
  }));
}

/* How much of each board actually became blanks. The number that says whether
   any of this was worth doing. */
function utilisation(plans) {
  let used = 0, total = 0;
  for (const p of plans) {
    total += p.board.w * p.board.h;
    for (const pl of p.placed) used += pl.w * pl.h;
  }
  return total ? used / total : 0;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { packBoard, packAll, cutSequence, utilisation, fitIn, KERF_MM, MIN_REMNANT_MM };
}
