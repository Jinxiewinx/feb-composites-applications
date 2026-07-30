#!/usr/bin/env node
/* gen_sample_molds.mjs — build the sample molds that ship with the app.

   The Stock tab's mold planner needs an STL before it can show you anything,
   and "export one from Fusion first" is a poor way to meet a tool. These three
   land in 03 App/app/samples/, are served by Hosting alongside the app, and are
   offered directly in the "Plan a mold" modal — so a new lead can see the
   planner work on their phone thirty seconds after signing in.

   They are shaped after real SN5 parts and each one exercises a different path:

     nosecone-plug        under the 6in cut depth  -> one section, simplest case
     undertray-diffuser   9.4in tall               -> splits into 2 sections
     clamshell-assembly   3 separate bodies        -> the "which body?" picker

   Written with the app's OWN writeBinarySTL (stlio.js), so the files the app
   ships are produced by the code the app reads them back with.

   Regenerate:  node tools/gen_sample_molds.mjs                              */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "03 App", "app");
let src = ["slicer.js", "stlio.js"].map(f => readFileSync(join(root, f), "utf8")).join("\n;\n");
globalThis.window = globalThis;
(0, eval)(src.replace(/"use strict";\n/g, ""));

const IN = 25.4;   // everything below is written in millimetres

/* A solid from a height field over a rectangular base: top surface, four side
   walls down to z=0, and a flat bottom. Winding is outward throughout, which
   matters because a mold with inconsistent normals is exactly the "rough real
   export" case — worth having the SAMPLES be clean so a surprise in the app is
   the file's fault, not the fixture's. */
function heightFieldSolid(w, d, nx, ny, f, ox = 0, oy = 0) {
  const tris = [];
  const T = (a, b, c) => tris.push({ ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], cx: c[0], cy: c[1], cz: c[2] });
  const X = i => ox + (i / nx) * w;
  const Y = j => oy + (j / ny) * d;
  const Z = (i, j) => Math.max(0, f(i / nx, j / ny));
  const P = (i, j) => [X(i), Y(j), Z(i, j)];
  const B = (i, j) => [X(i), Y(j), 0];

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      // top: +Z
      T(P(i, j), P(i + 1, j), P(i + 1, j + 1));
      T(P(i, j), P(i + 1, j + 1), P(i, j + 1));
      // bottom: -Z (reverse order)
      T(B(i, j), B(i + 1, j + 1), B(i + 1, j));
      T(B(i, j), B(i, j + 1), B(i + 1, j + 1));
    }
  }
  // side walls, each wound so the normal points away from the solid
  for (let i = 0; i < nx; i++) {
    T(B(i, 0), P(i, 0), P(i + 1, 0));            T(B(i, 0), P(i + 1, 0), B(i + 1, 0));            // -Y
    T(B(i, ny), P(i + 1, ny), P(i, ny));         T(B(i, ny), B(i + 1, ny), P(i + 1, ny));         // +Y
  }
  for (let j = 0; j < ny; j++) {
    T(B(0, j), P(0, j + 1), P(0, j));            T(B(0, j), B(0, j + 1), P(0, j + 1));            // -X
    T(B(nx, j), P(nx, j), P(nx, j + 1));         T(B(nx, j), P(nx, j + 1), B(nx, j + 1));         // +X
  }
  return tris;
}

// Smooth falloff to zero at the rim, so every sample has positive draft and
// won't trip the CS-003 §7.1.4 overhang warning for the wrong reason.
const bump = (u, v, p = 2) =>
  Math.pow(Math.sin(Math.PI * u), p) * Math.pow(Math.sin(Math.PI * v), p);

/* Scale a 0..1-ish shape so its ACTUAL peak is the height asked for. Without
   this the stated height is only an upper bound — multiplying a bump by a ramp
   moves and lowers the maximum, and the diffuser below came out 5.1in instead
   of 9.4in, quietly landing under the 6in cut depth and not sectioning at all,
   which is the one thing that sample exists to demonstrate. */
function normalised(shape, peakMm, nx, ny) {
  let max = 0;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) max = Math.max(max, shape(i / nx, j / ny));
  const k = max > 0 ? peakMm / max : 0;
  return (u, v) => shape(u, v) * k;
}

/* Grid resolution is a payload decision, not a fidelity one: these ship with the
   app and are fetched on a phone. ~40x24 gives a few thousand triangles and
   about 100 KB each — enough that the slicer's contour stitching does real work
   and the 3D view looks like a mold, without putting a megabyte on Hosting. */
const samples = [
  {
    file: "nosecone-plug.stl",
    title: "Nosecone plug",
    // 22 x 13 x 4.6in — under the 6in cut depth, so one section: simplest case.
    nx: 44, ny: 26,
    tris(n) {
      return heightFieldSolid(22 * IN, 13 * IN, this.nx, this.ny,
        normalised((u, v) => bump(u, v, 1.6) * (0.55 + 0.45 * (1 - u)), 4.6 * IN, this.nx, this.ny));
    },
  },
  {
    file: "undertray-diffuser.stl",
    title: "Undertray diffuser",
    // 30 x 18 x 9.4in — past the 6in depth, so it splits into two sections,
    // with a ramped diffuser profile down its length.
    nx: 48, ny: 30,
    tris() {
      return heightFieldSolid(30 * IN, 18 * IN, this.nx, this.ny,
        normalised((u, v) => bump(u, v, 1.4) * (0.35 + 0.65 * u * u), 9.4 * IN, this.nx, this.ny));
    },
  },
  {
    file: "clamshell-assembly.stl",
    title: "Clamshell assembly (3 bodies)",
    // Three disjoint bodies in one file, spread apart the way a real Fusion
    // assembly export is — the SN5 undertray came out as 31 of these.
    tris() {
      const body = (w, d, h, nx, ny, ox, oy) =>
        heightFieldSolid(w * IN, d * IN, nx, ny, normalised((u, v) => bump(u, v, 2), h * IN, nx, ny), ox * IN, oy * IN);
      return [
        ...body(14, 10, 3.2, 30, 22, 0, 0),
        ...body(11, 9, 5.1, 26, 20, 20, 4),
        ...body(9, 7, 2.4, 22, 18, 6, 16),
      ];
    },
  },
];

mkdirSync(join(root, "samples"), { recursive: true });
for (const s of samples) {
  const tris = s.tris();
  const buf = writeBinarySTL(tris, `FEB sample mold - ${s.title} - millimetres`);
  writeFileSync(join(root, "samples", s.file), Buffer.from(buf));
  const b = meshBounds(tris);
  const inch = v => (v / IN).toFixed(1);
  console.log(
    `${s.file.padEnd(26)} ${String(tris.length).padStart(6)} tris  ${String(Math.round(buf.byteLength / 1024)).padStart(4)} KB  ` +
    `${inch(b.x1 - b.x0)} x ${inch(b.y1 - b.y0)} x ${inch(b.z1 - b.z0)} in`);
}
