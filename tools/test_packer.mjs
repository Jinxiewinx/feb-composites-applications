#!/usr/bin/env node
/* Cut-list tests for 03 App/app/packer.js.

   The property that matters here is GUILLOTINE FEASIBILITY: every cut must span
   the whole piece being held, because Simon confirmed "you can only cut all the
   way across". A plan that packs tightly but cannot be sawn is worthless, so
   the headline test replays the cut sequence and checks that no cut ever passes
   through a placed blank.

   Run from SN6 Resources/:  node tools/test_packer.mjs */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "03 App", "app");
const src = readFileSync(join(root, "packer.js"), "utf8").replace(/"use strict";\n/, "");
globalThis.__P = {};
(0, eval)(src + "\n;Object.assign(globalThis.__P,{packBoard,packAll,cutSequence,utilisation,fitIn,KERF_MM,MIN_REMNANT_MM});");
const P = globalThis.__P;

const IN = 25.4;
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + " — " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }
const sheet = (w, h, extra) => ({ id: "B", len: w, wid: h, thk: IN, density: 30, qty: 1, ...extra });
const blank = (id, w, h) => ({ id, w, h, thickness: IN, density: 30 });

console.log("placement:");
t("blanks land inside the board and never overlap each other", () => {
  const parts = [];
  for (let i = 0; i < 12; i++) parts.push(blank("p" + i, 200 + (i % 4) * 60, 150 + (i % 3) * 70));
  const r = P.packBoard({ w: 8 * 12 * IN, h: 4 * 12 * IN }, parts, {});
  assert(r.placed.length > 0, "should place something");
  for (const a of r.placed) {
    assert(a.x >= -1e-6 && a.y >= -1e-6 && a.x + a.w <= 8 * 12 * IN + 1e-6 && a.y + a.h <= 4 * 12 * IN + 1e-6,
      `${a.part.id} falls off the board`);
  }
  for (let i = 0; i < r.placed.length; i++) {
    for (let j = i + 1; j < r.placed.length; j++) {
      const a = r.placed[i], b = r.placed[j];
      const sep = a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6;
      assert(sep, `${a.part.id} and ${b.part.id} overlap`);
    }
  }
});
t("kerf is real — two blanks are never closer than the blade", () => {
  const r = P.packBoard({ w: 1000, h: 1000 }, [blank("a", 400, 400), blank("b", 400, 400)], {});
  assert(r.placed.length === 2, "both should fit");
  const [a, b] = r.placed;
  const gapX = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const gapY = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  assert(Math.max(gapX, gapY) >= P.KERF_MM - 1e-6, "the blade eats material and the plan must allow for it");
});
t("a blank larger than the board is reported, not silently dropped", () => {
  const r = P.packBoard({ w: 500, h: 500 }, [blank("huge", 900, 300)], {});
  assert(r.placed.length === 0 && r.unplaced.length === 1, "it cannot fit and we must say so");
});
t("a blank is turned 90 degrees when that is what fits (board has no grain)", () => {
  const r = P.packBoard({ w: 1000, h: 300 }, [blank("wide", 250, 900)], {});
  assert(r.placed.length === 1 && r.placed[0].rotated, "should rotate to fit");
});

console.log("guillotine feasibility — the property that matters:");
t("CRITICAL replaying the cut sequence never saws through a placed blank", () => {
  // Every cut must span the piece in hand. Simulate: start with the whole
  // board as one piece; apply each cut to the piece that contains it; a cut is
  // only legal if it spans that piece edge to edge and misses every blank.
  const parts = [];
  for (let i = 0; i < 14; i++) parts.push(blank("p" + i, 150 + (i * 37) % 300, 120 + (i * 53) % 260));
  const board = { w: 8 * 12 * IN, h: 4 * 12 * IN };
  const r = P.packBoard(board, parts, {});
  let pieces = [{ x: 0, y: 0, w: board.w, h: board.h }];
  for (const c of r.cuts) {
    const hit = pieces.findIndex(p =>
      c.axis === "x"
        ? (c.at > p.x + 1e-6 && c.at < p.x + p.w - 1e-6 && c.from >= p.y - 1e-6 && c.to <= p.y + p.h + 1e-6)
        : (c.at > p.y + 1e-6 && c.at < p.y + p.h - 1e-6 && c.from >= p.x - 1e-6 && c.to <= p.x + p.w + 1e-6));
    assert(hit >= 0, `cut ${c.axis}@${c.at.toFixed(1)} does not lie on any piece in hand`);
    const p = pieces[hit];
    // The cut must run edge to edge across that piece — no notching.
    if (c.axis === "x") assert(c.from <= p.y + 1e-6 && c.to >= p.y + p.h - 1e-6, "a rip must cross the whole piece");
    else assert(c.from <= p.x + 1e-6 && c.to >= p.x + p.w - 1e-6, "a crosscut must cross the whole piece");
    // And it must not pass through a blank.
    for (const a of r.placed) {
      if (c.axis === "x") {
        const through = c.at > a.x + 1e-6 && c.at < a.x + a.w - 1e-6 && !(c.to <= a.y + 1e-6 || c.from >= a.y + a.h - 1e-6);
        assert(!through, `cut x@${c.at.toFixed(1)} saws through ${a.part.id}`);
      } else {
        const through = c.at > a.y + 1e-6 && c.at < a.y + a.h - 1e-6 && !(c.to <= a.x + 1e-6 || c.from >= a.x + a.w - 1e-6);
        assert(!through, `cut y@${c.at.toFixed(1)} saws through ${a.part.id}`);
      }
    }
    // The blade destroys KERF_MM of material, so the two pieces that come off
    // the saw are separated by the kerf, not adjacent. Modelling them as
    // touching makes every downstream piece boundary drift and the spans stop
    // matching — the simulation has to cut like a saw, not like scissors.
    pieces.splice(hit, 1);
    const K = P.KERF_MM;
    if (c.axis === "x") {
      pieces.push({ x: p.x, y: p.y, w: c.at - p.x, h: p.h });
      pieces.push({ x: c.at + K, y: p.y, w: p.x + p.w - c.at - K, h: p.h });
    } else {
      pieces.push({ x: p.x, y: p.y, w: p.w, h: c.at - p.y });
      pieces.push({ x: p.x, y: c.at + K, w: p.w, h: p.y + p.h - c.at - K });
    }
  }
  assert(r.cuts.length > 0, "a real pack should require cuts");
});

console.log("cuts:");
t("no blank ever costs more than two cuts", () => {
  // Structural: a placement makes at most one cut per axis. Asserted anyway,
  // because a rewrite that starts re-cutting a rectangle would still pass every
  // feasibility test above while quietly doubling the work at the saw.
  const parts = [];
  for (let i = 0; i < 10; i++) parts.push(blank("p" + i, 180 + (i % 5) * 90, 140 + (i % 4) * 60));
  const r = P.packBoard({ w: 8 * 12 * IN, h: 4 * 12 * IN }, parts, {});
  assert(r.cuts.length <= 2 * r.placed.length,
    `${r.cuts.length} cuts for ${r.placed.length} blanks`);
});
t("the split order is chosen, not fixed", () => {
  /* Four blanks that tile a 1220 square two-by-two. The old rule always split
     to keep the bigger single offcut, which here costs a cut it does not need;
     trying both orders finds the tiling. Same blanks placed either way — the
     whole difference is at the saw. */
  const parts = [0, 1, 2, 3].map(i => blank("q" + i, 600, 400));
  const r = P.packBoard({ w: 1220, h: 1220 }, parts, {});
  assert(r.placed.length === 4, "all four should fit");
  assert(r.cuts.length <= 6, "a tiling board should not need 8 cuts, got " + r.cuts.length);
});
t("the same board and the same blanks give the same plan twice", () => {
  const parts = [0, 1, 2, 3, 4].map(i => blank("d" + i, 300 + i * 40, 200 + (i % 3) * 55));
  const key = r => JSON.stringify([r.placed.map(p => [p.part.id, p.x, p.y, p.rotated]), r.cuts]);
  assert(key(P.packBoard({ w: 1500, h: 1000 }, parts, {})) === key(P.packBoard({ w: 1500, h: 1000 }, parts, {})),
    "ties must resolve the same way every run, or a printed cut list stops matching the screen");
});

console.log("stock policy:");
t("offcuts are spent before fresh sheets", () => {
  const boards = [
    sheet(8 * 12 * IN, 4 * 12 * IN, { id: "SHEET", kind: "sheet" }),
    sheet(600, 400, { id: "OFFCUT", kind: "remnant" }),
  ];
  const r = P.packAll([blank("small", 300, 200)], boards, {});
  assert(r.plans.length === 1, "one board should do it");
  assert(r.plans[0].board.src.id === "OFFCUT", "a fresh sheet must not be opened while an offcut fits");
});
t("a blank only comes from a board of matching thickness and density", () => {
  const boards = [
    { id: "thin", len: 2000, wid: 1000, thk: IN, density: 30, qty: 1 },
    { id: "thick", len: 2000, wid: 1000, thk: 2 * IN, density: 30, qty: 1 },
    { id: "dense", len: 2000, wid: 1000, thk: 2 * IN, density: 60, qty: 1 },
  ];
  const want = [{ id: "a", w: 300, h: 200, thickness: 2 * IN, density: 60 }];
  const r = P.packAll(want, boards, {});
  assert(r.plans.length === 1 && r.plans[0].board.src.id === "dense",
    "60lb board is not interchangeable with 30lb — CS-004");
});
t("running short produces a purchase list, not a crash", () => {
  const boards = [sheet(600, 400)];
  const want = [blank("a", 500, 300), blank("b", 500, 300), blank("c", 500, 300)];
  const r = P.packAll(want, boards, {});
  assert(r.shortfall.length >= 1, "what did not fit must be reported");
  assert(r.plans.length === 1, "and what did fit should still be planned");
});
t("leftovers below the minimum useful remnant are scrap, not ledger entries", () => {
  const r = P.packBoard({ w: 1000, h: 1000 }, [blank("a", 960, 960)], {});
  assert(r.leftover.every(o => o.w >= P.MIN_REMNANT_MM && o.h >= P.MIN_REMNANT_MM),
    "a 20mm sliver is not an offcut anybody will retrieve");
});

console.log("output:");
t("the cut sequence reads as instructions in both units", () => {
  const r = P.packBoard({ w: 2000, h: 1000 }, [blank("a", 800, 400), blank("b", 600, 300)], {});
  const seq = P.cutSequence(r);
  assert(seq.length === r.cuts.length, "one line per cut");
  assert(/Rip|Crosscut/.test(seq[0].text), "should say what kind of cut");
  assert(/mm.*in/.test(seq[0].text), "shop reads inches, geometry is mm — show both");
});
t("utilisation is reported so the plan can be judged", () => {
  const r = P.packAll([blank("a", 900, 500)], [sheet(1000, 600)], {});
  const u = P.utilisation(r.plans);
  assert(u > 0.6 && u <= 1, "one big blank on a snug board should be well used, got " + u.toFixed(2));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
