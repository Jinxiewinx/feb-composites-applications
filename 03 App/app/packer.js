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
/* How deep to try BOTH ways of splitting a rectangle instead of guessing.
   Depth climbs by 2 per level, so 4 means the top three levels branch: at most
   8 subtree evaluations, on a routine that is O(n^2) to begin with. Near the
   root the rectangles are big and the choice actually matters; deeper down it
   is a small subtree and the guess is fine. */
const SPLIT_TRIAL_DEPTH = 4;

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

/* Fill one free rectangle, guillotine-only.

   Recursive: take the largest part that fits, put it in the corner, then make
   ONE cut that separates it from the rest and recurse into both children.
   Because every cut is taken across the current rectangle, the result is
   guillotine-feasible by construction.

   PURE. Nothing here mutates a caller's array — `remaining` goes in, a smaller
   `remaining` comes out, and placements and cuts come back as fresh arrays.
   That is what lets a caller evaluate two different splits of the same
   rectangle and keep the better one; against shared closure state the first
   trial would poison the second. */
function packFill(x, y, w, h, depth, remaining, kerf, rotate) {
  const nothing = { placed: [], cuts: [], leftover: [{ x, y, w, h }], remaining };
  if (w <= 0 || h <= 0 || !remaining.length) return nothing;
  // Largest part that fits here.
  let idx = -1, fit = null;
  for (let i = 0; i < remaining.length; i++) {
    const f = fitIn(remaining[i], w, h, rotate);
    if (f) { idx = i; fit = f; break; }
  }
  if (idx < 0) return nothing;
  const part = remaining[idx];
  const rest = remaining.slice(0, idx).concat(remaining.slice(idx + 1));
  const here = { part, x, y, w: fit.w, h: fit.h, rotated: fit.rotated };

  const restW = w - fit.w - kerf;
  const restH = h - fit.h - kerf;
  /* Two ways to split what is left. The old rule always kept the bigger single
     offcut whole, which is a decent guess and only ever a guess — it is made
     before knowing what still has to be placed. Near the root, where the
     rectangles are big and the decision is worth the most, try both and keep
     the better result. Deeper down the guess stands, because the subtree is
     small and the branching is not free. */
  const wideFirst = Math.max(restW * h, w * restH) === restW * h;
  let sub = packSplit(x, y, w, h, depth, rest, kerf, rotate, fit, wideFirst);
  if (depth <= SPLIT_TRIAL_DEPTH) {
    const alt = packSplit(x, y, w, h, depth, rest, kerf, rotate, fit, !wideFirst);
    if (betterSplit(alt, sub)) sub = alt;
  }
  return {
    placed: [here].concat(sub.placed),
    cuts: sub.cuts,
    leftover: sub.leftover,
    remaining: sub.remaining,
  };
}

/* Split the rectangle one specific way and fill both children.
   `horizontalFirst` is the choice; everything else follows from it. */
function packSplit(x, y, w, h, depth, rest, kerf, rotate, fit, horizontalFirst) {
  /* Record the cuts. The span of the SECOND cut depends on whether the first
     one actually happened: if the leftover was thinner than the blade there
     is nothing to separate, no cut is made, and the piece still in hand is
     the full rectangle — so the second cut has to cross all of it, not just
     the part. Getting this wrong prints a cut that stops halfway, which is
     a notch, which a saw cannot do. */
  const restW = w - fit.w - kerf;
  const restH = h - fit.h - kerf;
  const cuts = [];
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
  /* Order matters and is load-bearing: this node's cuts, then A's subtree,
     then B's. A pre-order walk of the tree is the order to make the cuts, and
     B is filled from what A left, not from the original pile. */
  const ra = packFill(a.x, a.y, a.w, a.h, depth + 2, rest, kerf, rotate);
  const rb = packFill(b.x, b.y, b.w, b.h, depth + 2, ra.remaining, kerf, rotate);
  return {
    placed: ra.placed.concat(rb.placed),
    cuts: cuts.concat(ra.cuts, rb.cuts),
    leftover: ra.leftover.concat(rb.leftover),
    remaining: rb.remaining,
  };
}

/* Is subtree `a` better than subtree `b`? LEXICOGRAPHIC, not a weighted sum:
   a weighted sum would need exchange rates between blank area, saw cuts and
   offcut size, and there is no honest way to set those at this level. A strict
   order needs none, and it says what the shop would say out loud:

     1. get more blanks out of the board
     2. then make fewer cuts
     3. then leave one big usable offcut rather than several awkward ones

   Strictly-better only, so a tie keeps the incumbent and two runs of the same
   pack give the same answer. */
function betterSplit(a, b) {
  const area = r => r.placed.reduce((n, p) => n + p.w * p.h, 0);
  const biggest = r => r.leftover.reduce((n, o) =>
    (o.w >= MIN_REMNANT_MM && o.h >= MIN_REMNANT_MM) ? Math.max(n, o.w * o.h) : n, 0);
  const aa = area(a), ab = area(b);
  if (aa !== ab) return aa > ab;
  if (a.cuts.length !== b.cuts.length) return a.cuts.length < b.cuts.length;
  return biggest(a) > biggest(b);
}

/* Pack as many parts as possible into one board. */
function packBoard(board, parts, opts) {
  opts = opts || {};
  const kerf = opts.kerf == null ? KERF_MM : opts.kerf;
  const rotate = opts.allowRotate !== false;
  const sorted = parts.slice().sort((a, b) => (Math.max(b.w, b.h) - Math.max(a.w, a.h)) || (partArea(b) - partArea(a)));

  const r = packFill(0, 0, board.w, board.h, 0, sorted, kerf, rotate);
  const usable = r.leftover.filter(o => o.w >= MIN_REMNANT_MM && o.h >= MIN_REMNANT_MM);
  return { placed: r.placed, cuts: r.cuts, leftover: usable, unplaced: r.remaining };
}

/* ============================================================================
   WHICH BOARD TO OPEN
   ============================================================================
   The old rule was "smallest first, take anything that fits", on the theory
   that offcuts should be spent before sheets. It half-filled the rack: it would
   open a 33x19 offcut for one blank, mark it used, and never come back.

   Simon, on why a big board is worth more: "offcuts and large boards are
   essentially the same to us, just at different sizes, larger boards just tend
   to be more valuable as we can cut the large things first." So there is no
   sheet/offcut category to reason about, only size — and the reason to prefer
   the small board is OPTION VALUE. A big board is the only thing that can hold
   a big blank; spending one on small blanks destroys that.

   That is the whole cost function, and it needs no tuning constants:

     consumedArea = boardArea - (usable leftover)   material actually spent
     optionLoss   = boardArea - (biggest leftover)  largest blank it could
                                                    still have held, destroyed
     cost         = (consumedArea + optionLoss) / placedArea

   Everything is mm², so cost reads as "millimetres of board burned per
   millimetre of blank delivered". A 300x200 blank costs 7.3 on a 4x8 sheet and
   3.05 on a 600x400 board, so the small board wins — the old policy's INTENT,
   in pure size terms. And when only the 4x8 can hold a 1500x900 blank it is
   the only candidate that places anything, so option value never turns into a
   refusal to cut.

   Consumed area alone, without the option term, says opening a 4x8 for one
   blank is nearly free — true on paper, because guillotine cuts do leave two
   big usable rectangles, and false on the rack, where those offcuts are
   awkward and multiply. */
function boardCost(board, r) {
  const placedArea = r.placed.reduce((n, p) => n + p.w * p.h, 0);
  if (placedArea <= 0) return Infinity;
  const boardArea = board.w * board.h;
  let leftoverArea = 0, biggest = 0;
  for (const o of r.leftover) {           // already filtered to >= MIN_REMNANT_MM
    const a = o.w * o.h;
    leftoverArea += a;
    if (a > biggest) biggest = a;
  }
  return ((boardArea - leftoverArea) + (boardArea - biggest)) / placedArea;
}

/* Trial-packing every board against every blank is O(boards x blanks^2). Fine
   at shop scale (60 blanks, 20 rack rows is ~3e5 operations) and not fine if
   somebody batches a whole season. Past the budget, score only the smallest
   few boards that can still hold the largest thing left — a narrower search,
   never a silent one: `degraded` comes back on the result. */
const TRIAL_BUDGET = 2e6;
const TRIAL_FALLBACK = 4;

/* Pack every blank across the whole stock list.

   `blanks`  [{ id, w, h, thickness, density, label }]
   `boards`  [{ id, len, wid, thk, density, qty, label }]  (mm)
   Returns per-board plans, leftovers to write back, and any shortfall. */
function packAll(blanks, boards, opts) {
  opts = opts || {};
  const tol = opts.thicknessTol == null ? 0.5 : opts.thicknessTol;
  const rotate = opts.allowRotate !== false;
  const plans = [];
  const shortfall = [];
  let degraded = false;
  // Bucket by what can physically substitute for what: a blank can only come
  // from a board of the same thickness, and density is not interchangeable
  // (CS-004 — 60lb seals better, and you cannot swap it in silently).
  const buckets = new Map();
  for (const b of blanks) {
    const k = `${Math.round(b.thickness / tol)}|${b.density || 30}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(b);
  }
  // Expand quantities into individual boards. Sorted smallest-first and by id
  // so the representative picked below is the same one on every run.
  const pool = [];
  for (const bd of boards) {
    for (let i = 0; i < (bd.qty || 1); i++) {
      pool.push({ src: bd, w: bd.len, h: bd.wid, thk: bd.thk, density: bd.density || 30, unit: i });
    }
  }
  pool.sort((a, b) => (a.w * a.h - b.w * b.h)
    || String(a.src.id).localeCompare(String(b.src.id)) || (a.unit - b.unit));

  for (const [k, wanted] of buckets) {
    let todo = wanted.slice();
    const [thkKey, densKey] = k.split("|");
    const usable = () => pool.filter(bd => !bd.used
      && Math.round(bd.thk / tol) === +thkKey && String(bd.density) === densKey);

    while (todo.length) {
      /* Identical units are interchangeable, so only one of each SIZE is worth
         trial-packing. This is Simon's "we only care about xyz and density"
         applied to the algorithm, and on a real rack it collapses the candidate
         set to a handful. */
      const reps = new Map();
      for (const bd of usable()) {
        const key = `${Math.round(bd.w * 10)}x${Math.round(bd.h * 10)}`;
        if (!reps.has(key)) reps.set(key, bd);
      }
      let cands = [...reps.values()];
      if (!cands.length) break;

      if (cands.length * todo.length * todo.length > TRIAL_BUDGET) {
        degraded = true;
        const big = todo.reduce((m, p) => Math.max(m, p.w, p.h), 0);
        const canHold = cands.filter(bd => Math.max(bd.w, bd.h) >= big);
        cands = (canHold.length ? canHold : cands).slice(0, TRIAL_FALLBACK);
      }

      let best = null;
      for (const bd of cands) {
        const r = packBoard(bd, todo, opts);
        if (!r.placed.length) continue;
        const cost = boardCost(bd, r);
        // Strictly better only, then the tiebreaks, so two runs agree. `cands`
        // is already in smallest-then-id order, which settles the last one.
        if (!best) { best = { bd, r, cost }; continue; }
        const d = cost - best.cost;
        if (d < -1e-9) best = { bd, r, cost };
        else if (d <= 1e-9 && r.cuts.length < best.r.cuts.length) best = { bd, r, cost };
      }
      // Nothing on the rack fits what is left: this is a purchase, not a failure.
      if (!best) break;

      best.bd.used = true;
      todo = best.r.unplaced;
      plans.push({
        board: best.bd, placed: best.r.placed, cuts: best.r.cuts,
        // boardId on every leftover, so whatever eventually writes offcuts back
        // into inventory knows which board each came off.
        leftover: best.r.leftover.map(o => ({ ...o, boardId: best.bd.src.id })),
        thickness: best.bd.thk, density: best.bd.density, cost: best.cost,
      });
    }
    for (const p of todo) shortfall.push(p);
  }
  return { plans, shortfall, boardsUsed: plans.length, degraded };
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
  module.exports = { packBoard, packAll, cutSequence, utilisation, fitIn, boardCost, KERF_MM, MIN_REMNANT_MM };
}
