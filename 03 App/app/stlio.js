"use strict";
/* stlio.js — writing STL, and shrinking a mesh so it fits storage.

   Pure: no DOM, no Firebase, no globals beyond what slicer.js already defines.
   That is deliberate — it runs in three places (the page, the slicer Worker,
   and the node test harness) and each one has a different idea of what exists.

   It serves BOTH new Stock features from one implementation:

     1. "Export stock STL" writes the planned blocks out for CAM.
     2. The 3D viewer needs the mold mesh to survive a page reload, and storing
        it AS a binary STL means slicer.js's existing, already-trusted
        parseSTL() reads it back with no second parser to keep correct.

   The second one is why the round-trip test in tools/test_app.mjs is worth more
   than it looks: writeBinarySTL → parseSTL exercises both halves against each
   other, and the reader half is code the slicer has depended on all along.

   UNITS: millimetres, always. Everything downstream of scaleTris() is mm, and
   an STL carries no units, so the header string says so in words for whoever
   finds the file on a laptop six months from now. */

/* ---------- geometry ---------- */

// Unit normal of a triangle, right-hand rule over (b-a) x (c-a). Returns +Z for
// a degenerate triangle rather than NaN — a zero-area facet is meaningless but
// it must not poison the whole file with NaN bytes.
function triNormal(t) {
  const ux = t.bx - t.ax, uy = t.by - t.ay, uz = t.bz - t.az;
  const vx = t.cx - t.ax, vy = t.cy - t.ay, vz = t.cz - t.az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 0)) return { x: 0, y: 0, z: 1 };
  return { x: nx / len, y: ny / len, z: nz / len };
}

// Two triangles spanning a planar quad, keeping the corner order (so the
// caller's winding decides which way the face points).
function quadTris(a, b, c, d) {
  return [
    { ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], cx: c[0], cy: c[1], cz: c[2] },
    { ax: a[0], ay: a[1], az: a[2], bx: c[0], by: c[1], bz: c[2], cx: d[0], cy: d[1], cz: d[2] },
  ];
}

/* One blank as a closed solid: 12 triangles, every normal pointing outward.

   NOT boxTris() from slicer.js — that one emits the 4 side walls only, with no
   top or bottom cap, because slicing clips triangles against Z planes and never
   needed a lid. An open box is fine to slice and useless to import: CAM wants a
   watertight solid. The corner order below is worked out per face so the
   right-hand normal faces away from the centre, and test_app.mjs asserts exactly
   that (normal · (faceCentre - boxCentre) > 0 for all 12) rather than trusting
   the derivation. */
function blankTris(b, z0, z1) {
  const P = (i, j, k) => [i ? b.x1 : b.x0, j ? b.y1 : b.y0, k ? z1 : z0];
  return [].concat(
    quadTris(P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)),  // bottom, -Z
    quadTris(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)),  // top,    +Z
    quadTris(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)),  // front,  -Y
    quadTris(P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)),  // back,   +Y
    quadTris(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)),  // left,   -X
    quadTris(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1))   // right,  +X
  );
}

/* Every block of one machining section, as triangles in the mold's own CAD
   coordinates — the same frame the uploaded STL was in, so the exported stock
   drops onto the model in CAD with nothing to align. (A blank's x0 is already
   NEGATIVE relative to a mold sitting at the origin: that is the CS-003
   machining margin sitting correctly outside the mold datum.)

   sectionize() stamps `section` on every layer and it survives into the saved
   record, so this needs no extra stored data. Plans saved before that existed
   have no `section` at all — treat those as one section, which is what a
   single-setup mold is anyway. */
function sectionTris(plan, sectionIndex) {
  const want = sectionIndex || 0;
  const out = [];
  ((plan && plan.layers) || []).forEach(L => {
    if ((L.section || 0) !== want) return;
    (L.blanks || []).forEach(b => { out.push(...blankTris(b, L.z0, L.z1)); });
  });
  return out;
}
// How many sections a saved plan actually has, derived from the layers rather
// than plan.sections — the stored sections array is a summary and a legacy
// record may not have one at all.
function sectionCount(plan) {
  const n = ((plan && plan.layers) || []).reduce((m, L) => Math.max(m, (L.section || 0) + 1), 0);
  return Math.max(1, n);
}

/* ---------- binary STL ---------- */

// 80-byte header + uint32 count + 50 bytes per facet. Little-endian throughout,
// which is the format's one hard rule.
function writeBinarySTL(tris, header) {
  const n = tris.length;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Header is fixed-width and NOT null-terminated; anything past 80 chars is
  // dropped. Deliberately never starts with "solid", which would make a reader
  // sniffing the first word treat this binary file as ASCII.
  const text = String(header || "FEB Composites stock").slice(0, 80);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0x7f;

  dv.setUint32(80, n, true);
  let o = 84;
  for (const t of tris) {
    const nrm = triNormal(t);
    dv.setFloat32(o, nrm.x, true); dv.setFloat32(o + 4, nrm.y, true); dv.setFloat32(o + 8, nrm.z, true);
    dv.setFloat32(o + 12, t.ax, true); dv.setFloat32(o + 16, t.ay, true); dv.setFloat32(o + 20, t.az, true);
    dv.setFloat32(o + 24, t.bx, true); dv.setFloat32(o + 28, t.by, true); dv.setFloat32(o + 32, t.bz, true);
    dv.setFloat32(o + 36, t.cx, true); dv.setFloat32(o + 40, t.cy, true); dv.setFloat32(o + 44, t.cz, true);
    dv.setUint16(o + 48, 0, true);   // attribute byte count, unused
    o += 50;
  }
  return buf;
}
function stlByteLength(triangleCount) { return 84 + triangleCount * 50; }

/* ---------- decimation ---------- */

/* Vertex clustering on a uniform grid: snap every vertex to the average of the
   vertices sharing its cell, then drop triangles whose corners collapsed
   together.

   Chosen over dropping every Nth triangle, which is faster and wrong — it
   punches holes straight through a surface. Clustering is order-independent,
   keeps the mesh closed-ish, and cannot move a vertex further than one cell, so
   the silhouette stays put. That last property is what makes it safe here: this
   mesh is only ever DISPLAYED. Blanks and the cut list come from the full mesh
   at slice time and are never recomputed from a decimated one. */
function decimateTris(tris, targetCount) {
  if (!Array.isArray(tris) || tris.length <= targetCount || targetCount < 4) return tris;
  const bnd = meshBounds(tris);
  const span = Math.max(bnd.x1 - bnd.x0, bnd.y1 - bnd.y0, bnd.z1 - bnd.z0);
  if (!(span > 0)) return tris;

  // Cells are sized PER AXIS, not from one global span. A cube doesn't care,
  // but a real mold often doesn't have cube proportions — an undertray strake is
  // long and thin — and one cell size taken from the longest axis makes the
  // short axes a single cell deep, which collapses every triangle to
  // degenerate and returns an empty mesh. A flat axis (a truly planar mold)
  // keeps a nominal cell so it contributes nothing rather than dividing by zero.
  const cellFor = (lo, hi, res) => Math.max((hi - lo) / res, span * 1e-6);

  // Start near the resolution a target-sized mesh would want, then coarsen
  // until it actually fits. Each pass is O(triangles); an exact solve isn't
  // worth the code.
  let res = Math.max(4, Math.ceil(Math.cbrt(targetCount) * 2));
  let best = tris;
  for (let pass = 0; pass < 12; pass++) {
    const cell = {
      x: cellFor(bnd.x0, bnd.x1, res), y: cellFor(bnd.y0, bnd.y1, res), z: cellFor(bnd.z0, bnd.z1, res),
    };
    const out = clusterTris(tris, bnd, cell);
    // Never hand back nothing: an empty result means this resolution was too
    // coarse for the shape, so keep the last non-empty one instead.
    if (!out.length) return best === tris ? tris : best;
    best = out;
    if (out.length <= targetCount || res <= 4) return out;
    res = Math.max(4, Math.floor(res / 1.5));
  }
  return best;
}

function clusterTris(tris, bnd, cell) {
  const key = (x, y, z) =>
    Math.floor((x - bnd.x0) / cell.x) + "," + Math.floor((y - bnd.y0) / cell.y) + "," + Math.floor((z - bnd.z0) / cell.z);
  // Pass 1: cell -> running mean of the vertices that landed in it.
  const acc = new Map();
  const add = (x, y, z) => {
    const k = key(x, y, z);
    const a = acc.get(k);
    if (a) { a.x += x; a.y += y; a.z += z; a.n++; } else acc.set(k, { x, y, z, n: 1 });
  };
  for (const t of tris) { add(t.ax, t.ay, t.az); add(t.bx, t.by, t.bz); add(t.cx, t.cy, t.cz); }
  const rep = new Map();
  acc.forEach((a, k) => rep.set(k, { x: a.x / a.n, y: a.y / a.n, z: a.z / a.n }));

  // Pass 2: remap, dropping any triangle that lost two corners to one cell, and
  // any triangle that now duplicates one already emitted.
  //
  // The dedupe matters more than it looks. Clustering pulls many source
  // triangles onto the SAME three representative vertices — a subdivided
  // surface, or the two coincident faces where blocks meet — and without this
  // the output keeps every copy, so the triangle count barely falls even though
  // the geometry did. Keyed on the SORTED cell triple, so a face and its
  // opposite-wound twin count as one: this mesh is only ever displayed, and a
  // duplicated back-face contributes nothing but bytes.
  const out = [];
  const seen = new Set();
  for (const t of tris) {
    const ka = key(t.ax, t.ay, t.az), kb = key(t.bx, t.by, t.bz), kc = key(t.cx, t.cy, t.cz);
    if (ka === kb || kb === kc || ka === kc) continue;
    const face = [ka, kb, kc].sort().join("|");
    if (seen.has(face)) continue;
    seen.add(face);
    const a = rep.get(ka), b = rep.get(kb), c = rep.get(kc);
    out.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, cx: c.x, cy: c.y, cz: c.z });
  }
  return out;
}

/* Shrink a mesh until its binary STL fits a byte budget, then write it. Used
   for the stored viewer mesh: storage.rules caps an upload at 10 MB and the app
   accepts STLs up to 64 MB, so something has to give, and it should be display
   fidelity rather than the upload failing.

   Returns null when there is nothing to store OR when the mesh genuinely cannot
   be made to fit. That second case is real, not defensive: vertex clustering
   cannot merge DISCONNECTED components, so a mold made of thousands of separate
   little bodies has a hard floor no cell size gets under. Returning null there
   is deliberate — the caller skips the upload, the plan saves with its blanks
   and cut list intact, and the viewer shows blocks only. The alternative is
   pushing an oversized file at Storage and getting a rules rejection that
   surfaces to the user as a meaningless permission error. */
function meshStlForStorage(tris, byteBudget) {
  if (!Array.isArray(tris) || !tris.length) return null;
  const budget = byteBudget || MESH_BYTE_BUDGET;
  const maxTris = Math.max(4, Math.floor((budget - 84) / 50));
  const kept = decimateTris(tris, maxTris);
  if (!kept.length || kept.length > maxTris) return null;
  return writeBinarySTL(kept, "FEB Composites mold mesh - millimetres");
}
// 6 MB against the 10 MB storage.rules cap. A normal mold is well under this
// and passes through untouched; only a big assembly export gets clustered.
const MESH_BYTE_BUDGET = 6 * 1024 * 1024;

/* Node (tests) and the Worker need these by name; the browser gets them as
   globals from the classic script tag. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    triNormal, blankTris, sectionTris, sectionCount,
    writeBinarySTL, stlByteLength, decimateTris, meshStlForStorage, MESH_BYTE_BUDGET,
  };
}
