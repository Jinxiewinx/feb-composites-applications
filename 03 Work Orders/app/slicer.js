"use strict";
/* slicer.js — mold geometry. PURE: no DOM, no Firebase, no globals beyond the
   functions it defines. That's not tidiness, it's the point: purity is what
   lets slicer.worker.js run it off the main thread AND lets tools/test_slicer.mjs
   run it under node with no browser.

   Everything here exists to answer one question: what rectangles of tooling
   board do we saw so that, glued into a stack, the mold fits inside?

   ============================================================================
   LAYER FOOTPRINT — a union over the slab, never a section at one height
   ============================================================================

     z1 ────────────┐            Slicing at the TOP of a layer undersizes the
                    │  <- slab    blank by  thickness x tan(wall angle)  per
     z0 ──────────────┐           side. On a 50mm layer against a 45deg wall
                      │           that is 50mm per side — twice the entire
                                  margin band. The blank would not contain
                                  the mold.

     F(z) := cross-section at z, with each island's INNER contours discarded

   CS-003 §7.1.4 forbids overhangs and requires >=2 deg positive draft, so the
   solid grows monotonically DOWNWARD. Therefore:

        union over [z0,z1]  ==  F(z0)   exactly

   One slice per layer. No polygon boolean library, no sampling error. The
   standard the shop already follows is what makes the fast path correct.

   We assert that monotonicity rather than trusting it — but on 2D OUTER
   contours only. A bounding box cannot see an interior hole, so blind bottom
   dowel holes (which CS-003 §7.1.6 REQUIRES on split sections), enclosed voids
   and underside pockets cannot change any blank and must not be rejected.
   Note a "vertical ray crosses the boundary exactly twice" test is NOT
   equivalent — that is vertical convexity, strictly weaker, and it passes a
   blind hole where monotonicity genuinely fails.

   ============================================================================
   ISLANDS AND MERGING — iterate on GROUP boxes, never island boxes
   ============================================================================

     groups := one per island
     repeat to fixed point:
         if inflate(bbox(Gi)) intersects inflate(bbox(Gj)) : merge Gi, Gj

   WHY GROUP-LEVEL. Take a layer that is a U of three rails plus a central boss:

        +--------------------------+        rails merge (20mm apart) into one
        | ####################### |         group whose bbox is the WHOLE
        | ##                   ## |         envelope. The boss is 270mm from
        | ##       [boss]      ## |         every rail so it never merges — and
        | ##                   ## |         blank(boss) ends up ENTIRELY INSIDE
        | ##                   ## |         blank(rails). Two solid blocks in
        +--------------------------+        the same place. Impossible to build.

   Testing island boxes cannot see this; the collision is between GROUP boxes,
   which only exist after merging. Testing group boxes catches it on pass two.
   A frame with a central plug, a two-cavity mold with a divider, and a ribbed
   wing mold are all this shape. It is an ordinary layer, not a contrived one.

   Inflating by margin_max makes merging DECISION-INDEPENDENT: any margin later
   chosen is a subset of what was tested, so a set disjoint at margin_max stays
   disjoint. Merging therefore runs once, outside any optimizer loop.

   One rectangle per island. Never tile one island with butted rectangles — an
   L-shaped island stays one oversized rectangle, because a butted seam inside
   an island puts a glue line directly under the tool path, and that is where
   tooling board chips. */

/* All internal geometry is in MILLIMETRES. */
const MARGIN_MIN_MM = 25.4;   // 1in  — Simon: enough slop that a shifted glue-up still machines
const MARGIN_MAX_MM = 50.8;   // 2in  — top of the band; also the merge inflation
const WELD_TOL_MM = 0.01;     // contour stitching tolerance
const MONO_TOL_MM = 0.05;     // monotonicity slack; float noise on a drafted wall is ~1e-3
/* Slice a hair ABOVE the layer floor. At z0 exactly, a flat mold base is a
   sheet of coplanar triangles that produce no crossing segments at all, so the
   bottom layer would come back empty. The induced undersize is
   SLICE_EPS x tan(wall angle) — one nanometre at 45deg — against a 25.4mm
   margin. Correctness is unaffected; emptiness would not be. */
const SLICE_EPS_MM = 1e-3;

/* ---------------- STL parsing ---------------- */

/* Returns { tris: [{ax,ay,az,bx,by,bz,cx,cy,cz}, ...] }.
   Binary detection is by LENGTH, not by the "solid" prefix — plenty of binary
   exporters write "solid" into the 80-byte header and trip a prefix check. */
function parseSTL(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer || buffer);
  if (bytes.length === 0) throw new Error("That file is empty.");
  if (bytes.length >= 84) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = dv.getUint32(80, true);
    if (bytes.length === 84 + n * 50) return { tris: parseBinarySTL(dv, n) };
  }
  const text = new TextDecoder().decode(bytes);
  if (/^\s*solid/i.test(text) && /facet/i.test(text)) return { tris: parseAsciiSTL(text) };
  throw new Error("This does not look like an STL file.");
}
function parseBinarySTL(dv, n) {
  if (n === 0) throw new Error("That STL has no triangles in it.");
  const tris = new Array(n);
  let o = 84;
  for (let i = 0; i < n; i++) {
    o += 12; // skip the stored normal — we recompute what we need
    tris[i] = {
      ax: dv.getFloat32(o, true), ay: dv.getFloat32(o + 4, true), az: dv.getFloat32(o + 8, true),
      bx: dv.getFloat32(o + 12, true), by: dv.getFloat32(o + 16, true), bz: dv.getFloat32(o + 20, true),
      cx: dv.getFloat32(o + 24, true), cy: dv.getFloat32(o + 28, true), cz: dv.getFloat32(o + 32, true),
    };
    o += 36 + 2;
  }
  return tris;
}
function parseAsciiSTL(text) {
  const tris = [];
  const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
  const v = [];
  let m;
  while ((m = re.exec(text))) {
    v.push(+m[1], +m[2], +m[3]);
    if (v.length === 9) {
      tris.push({ ax: v[0], ay: v[1], az: v[2], bx: v[3], by: v[4], bz: v[5], cx: v[6], cy: v[7], cz: v[8] });
      v.length = 0;
    }
  }
  if (!tris.length) throw new Error("That STL has no triangles in it.");
  return tris;
}

/* Scale every triangle into millimetres. STL carries no units, so the caller
   must say which it is — guessing is how a mold comes out 25.4x wrong. */
function scaleTris(tris, unit) {
  const k = unit === "mm" ? 1 : 25.4;
  if (k === 1) return tris;
  return tris.map(t => ({
    ax: t.ax * k, ay: t.ay * k, az: t.az * k,
    bx: t.bx * k, by: t.by * k, bz: t.bz * k,
    cx: t.cx * k, cy: t.cy * k, cz: t.cz * k,
  }));
}
function meshBounds(tris) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const t of tris) {
    x0 = Math.min(x0, t.ax, t.bx, t.cx); x1 = Math.max(x1, t.ax, t.bx, t.cx);
    y0 = Math.min(y0, t.ay, t.by, t.cy); y1 = Math.max(y1, t.ay, t.by, t.cy);
    z0 = Math.min(z0, t.az, t.bz, t.cz); z1 = Math.max(z1, t.az, t.bz, t.cz);
  }
  return { x0, y0, z0, x1, y1, z1 };
}

/* ---------------- slicing ---------------- */

/* Intersect every triangle with the plane z, returning boundary segments.
   Triangles wholly above, wholly below, or coplanar contribute nothing — a
   coplanar face has no crossing, and its boundary is carried by the
   neighbouring faces that do cross. */
function sliceAt(tris, z) {
  const segs = [];
  for (const t of tris) {
    const p = [
      { x: t.ax, y: t.ay, z: t.az },
      { x: t.bx, y: t.by, z: t.bz },
      { x: t.cx, y: t.cy, z: t.cz },
    ];
    let above = 0, below = 0;
    for (const q of p) { if (q.z > z) above++; else if (q.z < z) below++; }
    if (above === 3 || below === 3) continue;
    if (above === 0 && below === 0) continue; // coplanar
    const hits = [];
    for (let i = 0; i < 3; i++) {
      const a = p[i], b = p[(i + 1) % 3];
      if ((a.z > z && b.z > z) || (a.z < z && b.z < z)) continue;
      if (a.z === b.z) continue;
      const s = (z - a.z) / (b.z - a.z);
      if (s < 0 || s > 1) continue;
      hits.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
    }
    // Dedupe a vertex that sits exactly on the plane and so is found twice.
    const uniq = [];
    for (const h of hits) {
      if (!uniq.some(u => Math.abs(u.x - h.x) < WELD_TOL_MM && Math.abs(u.y - h.y) < WELD_TOL_MM)) uniq.push(h);
    }
    if (uniq.length === 2) segs.push([uniq[0], uniq[1]]);
  }
  return segs;
}

/* Walk segments into closed loops. A tessellated mesh never has bit-identical
   shared vertices — the same corner reached from two triangles differs by float
   noise — so endpoints are welded within a tolerance.

   Endpoints are BUCKETED on a grid for speed, but matching ALWAYS searches the
   3x3 neighbourhood and confirms by real distance. Requiring an exact cell match
   is a trap that looks correct and is not: two points a millionth of a
   millimetre apart land in different cells whenever they straddle a cell
   boundary, and a perfectly good mesh then reports a gap. Real molds hit this
   constantly because designers put corners on round numbers, and round numbers
   are exactly where grid boundaries sit. */
function stitchContours(segs, tol) {
  tol = tol || WELD_TOL_MM;
  const cell = p => [Math.floor(p.x / tol), Math.floor(p.y / tol)];
  const buckets = new Map();
  const put = (p, rec) => {
    const [i, j] = cell(p);
    const k = i + "," + j;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(rec);
  };
  segs.forEach((s, i) => {
    put(s[0], { i, from: s[0], to: s[1] });
    put(s[1], { i, from: s[1], to: s[0] });
  });
  const used = new Array(segs.length).fill(false);
  /* Nearest unused endpoint within tol. Returns { rec, dist } so the caller can
     report HOW FAR the nearest edge was — the difference between "your
     tolerance is too tight" and "this mesh genuinely has a hole in it". */
  const nearest = (p) => {
    const [ci, cj] = cell(p);
    let best = null, bestD = Infinity;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const rec of buckets.get((ci + di) + "," + (cj + dj)) || []) {
          if (used[rec.i]) continue;
          const d = Math.hypot(rec.from.x - p.x, rec.from.y - p.y);
          if (d < bestD) { bestD = d; best = rec; }
        }
      }
    }
    return { rec: best, dist: bestD };
  };
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const start = segs[i][0];
    const pts = [start, segs[i][1]];
    let cur = segs[i][1];
    let guard = segs.length + 2;
    while (guard-- > 0) {
      if (Math.hypot(cur.x - start.x, cur.y - start.y) <= tol) break;
      const { rec, dist } = nearest(cur);
      if (!rec || dist > tol) {
        // Error path only: the bucket search reaches ~3 cells, so a genuinely
        // large hole finds nothing nearby and we'd have no distance to report.
        // The distance is the whole diagnostic — 0.0001mm means the tolerance is
        // too tight, 5mm means the mesh is broken — so pay for a full scan here.
        let far = Infinity;
        for (let k = 0; k < segs.length; k++) {
          if (used[k]) continue;
          for (const p of segs[k]) far = Math.min(far, Math.hypot(p.x - cur.x, p.y - cur.y));
        }
        const how = Number.isFinite(far)
          ? ` The nearest loose edge is ${far < 0.01 ? far.toExponential(1) : far.toFixed(3)}mm away, past the ${tol}mm join tolerance.`
          : " No edge continues from there at all.";
        throw new Error(`This mesh has a hole near X ${cur.x.toFixed(2)}, Y ${cur.y.toFixed(2)} — the outline does not close.${how} Re-export the STL from Fusion, or run a mesh repair on it.`);
      }
      used[rec.i] = true;
      cur = rec.to;
      pts.push(cur);
    }
    if (pts.length >= 4) loops.push(pts);
  }
  return loops;
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/* Keep only loops nested inside nothing: those are the islands. Holes and any
   island-inside-a-hole are dropped, which is exactly right because a bounding
   box cannot see them anyway. */
function outerContours(loops) {
  return loops.filter((l, i) =>
    !loops.some((o, j) => j !== i && Math.abs(polyArea(o)) > Math.abs(polyArea(l)) && pointInPoly(l[0], o)));
}

/* ---------------- boxes ---------------- */

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}
function unionBox(a, b) {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}
function inflateBox(b, m) { return { x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m }; }
function boxesOverlap(a, b) { return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1; }
function boxContains(outer, inner, tol) {
  tol = tol || 0;
  return inner.x0 >= outer.x0 - tol && inner.y0 >= outer.y0 - tol
      && inner.x1 <= outer.x1 + tol && inner.y1 <= outer.y1 + tol;
}
function boxW(b) { return b.x1 - b.x0; }
function boxH(b) { return b.y1 - b.y0; }

/* Merge islands whose INFLATED GROUP boxes touch. See the header diagram for
   why this iterates on groups rather than islands — testing island boxes lets
   a blank end up inside another blank. */
function mergeToFixedPoint(islands, inflate) {
  const infl = inflate == null ? MARGIN_MAX_MM : inflate;
  let groups = islands.map((is, i) => ({ members: [i], box: is.box }));
  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (boxesOverlap(inflateBox(groups[i].box, infl), inflateBox(groups[j].box, infl))) {
          groups[i] = { members: groups[i].members.concat(groups[j].members), box: unionBox(groups[i].box, groups[j].box) };
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return groups;
}

/* Phase 1 uses a single fixed margin. The elastic band (any value in
   [MARGIN_MIN, MARGIN_MAX], chosen per blank so pieces share saw strips) is the
   optimizer's job in phase 2; its nesting and datum rules live in the design
   doc. Minimum applies on all four sides — a shifted glue-up needs slop
   everywhere, not on one edge. */
function applyMargin(box, margin) {
  const m = margin == null ? MARGIN_MIN_MM : margin;
  return inflateBox(box, m);
}

/* ---------------- monotonicity ---------------- */

/* Assert F(lower) contains F(upper). Vertex-sampled: every vertex of every
   upper island must lie inside some lower island. Honest limitation — an edge
   could in principle bulge out between two vertices without either vertex
   escaping; on a tessellated mesh vertices are dense enough that this does not
   happen in practice, and the containment test in tools/test_slicer.mjs is the
   real guard. Returns null when fine, or { region } naming where it broke. */
function checkMonotone(lowerIslands, upperIslands, tol) {
  const t = tol == null ? MONO_TOL_MM : tol;
  for (const up of upperIslands) {
    for (const p of up.contour) {
      const ok = lowerIslands.some(lo =>
        pointInPoly(p, lo.contour) || nearBoundary(p, lo.contour, t));
      if (!ok) return { region: { x: p.x, y: p.y } };
    }
  }
  return null;
}
function nearBoundary(pt, poly, tol) {
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    if (distToSeg(pt, poly[j], poly[i]) <= tol) return true;
  }
  return false;
}
function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  if (L === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let s = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L;
  s = Math.max(0, Math.min(1, s));
  return Math.hypot(p.x - (a.x + s * dx), p.y - (a.y + s * dy));
}

/* ---------------- simplification ---------------- */

/* Douglas-Peucker. Saved plans go into a Firestore document with a hard 1 MB
   ceiling, and a raw tessellated outline across eight layers will approach it.
   A silent write failure is the worst outcome available, so contours are
   simplified before they are ever stored. */
function simplify(pts, eps) {
  if (pts.length <= 3) return pts.slice();
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let far = -1, fd = eps;
    for (let i = s + 1; i < e; i++) {
      const d = distToSeg(pts[i], pts[s], pts[e]);
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = true; stack.push([s, far], [far, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* ---------------- containment (test helper, and worth having at runtime) ----

   Clip a triangle to the slab z in [z0,z1] and return the XY polygon of what
   survives. The containment test checks THAT POLYGON — not its bounding box,
   which false-fails whenever a polygon sits inside one blank while its box
   spans the gap between two disjoint blanks.

   The two naive alternatives are both wrong and both tempting:
     - "is every vertex with z in the slab inside a blank" is UNSOUND: a
       triangle can cross the slab with no vertex inside it at all.
     - "check all three vertices of any triangle overlapping the slab" is
       conservative but FALSE-FAILS on drafted walls, which is the geometry
       molds are actually made of: a tall wall triangle spanning three layers
       gets tested against the top layer's small blanks using its wide bottom
       vertex. */
function clipTriangleToSlab(tri, z0, z1) {
  let poly = [
    { x: tri.ax, y: tri.ay, z: tri.az },
    { x: tri.bx, y: tri.by, z: tri.bz },
    { x: tri.cx, y: tri.cy, z: tri.cz },
  ];
  poly = clipHalf(poly, p => p.z >= z0, z0);
  poly = clipHalf(poly, p => p.z <= z1, z1);
  return poly.map(p => ({ x: p.x, y: p.y }));
}
function clipHalf(poly, inside, zPlane) {
  const out = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const cur = poly[i], prev = poly[(i + n - 1) % n];
    const ci = inside(cur), pi = inside(prev);
    if (ci !== pi) {
      const s = (zPlane - prev.z) / (cur.z - prev.z);
      out.push({ x: prev.x + (cur.x - prev.x) * s, y: prev.y + (cur.y - prev.y) * s, z: zPlane });
    }
    if (ci) out.push(cur);
  }
  return out;
}

/* ---------------- top level ---------------- */

/* Slice a mold into layers.
     tris        — triangles already in mm (see scaleTris)
     thicknesses — ordered bottom-to-top, in mm; must cover the mold height
     opts        — { margin, inflate, simplifyEps, onProgress }
   Returns { layers, bounds, warnings }. Throws with a human sentence on a bad
   mesh; the message is shown to whoever picked the file. */
function sliceMold(tris, thicknesses, opts) {
  opts = opts || {};
  const margin = opts.margin == null ? MARGIN_MIN_MM : opts.margin;
  const inflate = opts.inflate == null ? MARGIN_MAX_MM : opts.inflate;
  const eps = opts.simplifyEps == null ? 0.2 : opts.simplifyEps;
  const bounds = meshBounds(tris);
  const total = thicknesses.reduce((a, b) => a + b, 0);
  const height = bounds.z1 - bounds.z0;
  const warnings = [];
  if (total < height - 1e-6) throw new Error(`The chosen boards add up to ${total.toFixed(1)}mm but the mold is ${height.toFixed(1)}mm tall.`);

  const layers = [];
  let z = bounds.z0;
  let prevIslands = null;
  for (let i = 0; i < thicknesses.length; i++) {
    const z0 = z, z1 = z + thicknesses[i];
    z = z1;
    if (z0 >= bounds.z1) break; // composition overshoots the mold; extra boards unused
    const loops = stitchContours(sliceAt(tris, z0 + SLICE_EPS_MM));
    const islands = outerContours(loops).map(c => {
      const contour = simplify(c, eps);
      return { contour, box: bboxOf(contour) };
    });
    if (!islands.length) throw new Error(`Layer ${i + 1} came out empty — the mold may not sit flat on Z.`);

    if (prevIslands) {
      const bad = checkMonotone(prevIslands, islands, MONO_TOL_MM);
      if (bad) {
        const e = new Error(`This mold has an overhang or negative draft near X ${bad.region.x.toFixed(1)}, Y ${bad.region.y.toFixed(1)} (layer ${i + 1}). CS-003 §7.1.4 requires positive draft — it cannot be machined in 3 axes as drawn.`);
        e.region = { ...bad.region, layer: i + 1 };
        throw e;
      }
    }

    const groups = mergeToFixedPoint(islands, inflate);
    const blanks = groups.map(g => applyMargin(g.box, margin));
    layers.push({
      index: i, z0, z1, thickness: thicknesses[i],
      islands, groups: groups.map(g => ({ box: g.box, count: g.members.length })), blanks,
    });
    prevIslands = islands;
    if (opts.onProgress) opts.onProgress((i + 1) / thicknesses.length);
  }

  // Nesting lemma, asserted rather than assumed: every blank must sit on
  // material below it. If this ever fires, the merge rule changed and the
  // group-refinement argument no longer holds.
  for (let i = 1; i < layers.length; i++) {
    for (const up of layers[i].blanks) {
      if (!layers[i - 1].blanks.some(lo => boxContains(lo, up, MONO_TOL_MM))) {
        warnings.push(`Layer ${i + 1} has a blank that overhangs the layer below it.`);
        break;
      }
    }
  }
  // No two blanks in a layer may occupy the same place.
  for (const L of layers) {
    for (let a = 0; a < L.blanks.length; a++) {
      for (let b = a + 1; b < L.blanks.length; b++) {
        if (boxesOverlap(L.blanks[a], L.blanks[b])) warnings.push(`Layer ${L.index + 1} produced two blanks that overlap.`);
      }
    }
  }
  return { layers, bounds, warnings };
}

/* Node (tests) and the Worker both need these; the browser gets them as
   globals from the classic script tag. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseSTL, scaleTris, meshBounds, sliceAt, stitchContours, outerContours,
    polyArea, pointInPoly, bboxOf, unionBox, inflateBox, boxesOverlap, boxContains,
    boxW, boxH, mergeToFixedPoint, applyMargin, checkMonotone, simplify,
    clipTriangleToSlab, sliceMold,
    MARGIN_MIN_MM, MARGIN_MAX_MM, WELD_TOL_MM, SLICE_EPS_MM,
  };
}
