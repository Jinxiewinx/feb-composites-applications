import { readFileSync, writeFileSync } from "node:fs";
const root = "/Users/simonstarbuck/Downloads/composites_programs/SN6 Resources/06 Composites App/app";
const src = readFileSync(root + "/slicer.js", "utf8").replace(/"use strict";\n/, "");
globalThis.__S = {};
(0, eval)(src + "\n;Object.assign(globalThis.__S,{parseSTL,scaleTris,meshBounds,splitBodies,planMold,sliceMold});");
const S = globalThis.__S;
const stl = process.argv[2];
const buf = readFileSync(stl);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const bodies = S.splitBodies(S.scaleTris(S.parseSTL(ab).tris, "mm"));
console.log("bodies:", bodies.length, bodies.map(b => ({ tris: b.tris.length, bounds: b.bounds })));
const tris = bodies[0].tris;
const avail = [25.4, 50.8];  // 1in and 2in board, the common rack
const r = S.planMold(tris, avail, {});
console.log("bounds:", r.bounds);
console.log("composition:", r.composition, "warnings:", r.warnings);
console.log("sections:", (r.sections || []).map(s => ({ index: s.index, height: s.height, layers: s.layers.length })));
for (const L of r.layers) console.log(`L${L.index + 1} z ${L.z0.toFixed(2)}..${L.z1.toFixed(2)} thk ${L.thickness} section ${L.section}`, JSON.stringify(L.blanks));
writeFileSync(stl.replace(/\.stl$/, "-plan.json"), JSON.stringify({ bounds: r.bounds, composition: r.composition, layers: r.layers.map(L => ({ index: L.index, z0: L.z0, z1: L.z1, thickness: L.thickness, section: L.section, blanks: L.blanks })) }, null, 1));
