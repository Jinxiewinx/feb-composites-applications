/* Panel indexing, asserted against the real report.

   The app's whole comparison model rests on reading panels out of the PDF
   correctly, so this runs the actual indexer over DP_22.pdf rather than a
   fixture. If Fluent's export ever changes shape, this is what fails first.

   Run:  npm test          (from "07 CFD PDF Viewer/") */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { indexDocument, matchPanels } from "../app/indexer.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = join(root, "DP_22.pdf");

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + " — " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }

const data = new Uint8Array(readFileSync(SAMPLE));
const doc = await pdfjs.getDocument({ data, useSystemFonts: false }).promise;
const ix = await indexDocument(doc);

console.log("document shape:");
t("39 pages, all A3", () => {
  assert(ix.numPages === 39, "expected 39 pages, got " + ix.numPages);
  assert(ix.pages.every(p => Math.abs(p.width - 841.92) < 1 && Math.abs(p.height - 1191.12) < 1),
    "every page should be A3 landscape-height");
});
t("strip coordinates stack the pages", () => {
  assert(ix.pages[0].absY === 0, "page 1 starts the strip");
  for (let i = 1; i < ix.pages.length; i++) {
    const want = ix.pages[i - 1].absY + ix.pages[i - 1].height;
    assert(Math.abs(ix.pages[i].absY - want) < 0.01, "page " + (i + 1) + " misplaced in the strip");
  }
  assert(Math.abs(ix.stripHeight - 39 * 1191.12) < 1, "strip height is the sum of the pages");
});

console.log("sections:");
t("the three comparable sections are found, in order", () => {
  assert(ix.sections.map(s => s.name).join(",") === "Plots,Contours,Vectors",
    "got: " + ix.sections.map(s => s.name).join(","));
  assert(ix.sections[0].page === 9, "Plots starts on page 9, got " + ix.sections[0].page);
  assert(ix.sections[1].page === 17, "Contours starts on page 17");
  assert(ix.sections[2].page === 36, "Vectors starts on page 36");
});
t("setup headings are indexed but not treated as panels", () => {
  const names = ix.setup.map(s => s.name);
  assert(names.some(n => n.startsWith("Geometry")), "expected a Geometry heading: " + names);
  assert(ix.panels.every(p => p.page >= 9), "no panel may come from the setup pages");
});

console.log("panels:");
t("59 named panels across the three sections", () => {
  assert(ix.panels.length === 59, "expected 59 panels, got " + ix.panels.length);
});
t("36 contours, 6 vectors, 17 plots", () => {
  const by = s => ix.panels.filter(p => p.section === s).length;
  assert(by("Contours") === 36, "contours: " + by("Contours"));
  assert(by("Vectors") === 6, "vectors: " + by("Vectors"));
  assert(by("Plots") === 17, "plots: " + by("Plots"));
});
t("the contour naming grid is complete", () => {
  const names = new Set(ix.panels.map(p => p.name));
  for (const field of ["velo", "stat", "tot"]) {
    for (const region of ["wing", "car"]) {
      for (let i = 0; i <= 5; i++) {
        assert(names.has(`${field}-${region}-${i}`), "missing contour " + `${field}-${region}-${i}`);
      }
    }
  }
  for (let i = 0; i <= 5; i++) assert(names.has("vector-" + i), "missing vector-" + i);
});
t("convergence plots are indexed by name", () => {
  const names = ix.panels.map(p => p.name);
  ["Residuals", "total-drag-rplot", "total-lift-rplot", "fwing-cd-rplot"].forEach(n =>
    assert(names.includes(n), "missing plot " + n));
});
t("panels run top to bottom without duplicate ids", () => {
  for (let i = 1; i < ix.panels.length; i++) {
    assert(ix.panels[i].absY > ix.panels[i - 1].absY, "panels out of order at " + i);
  }
  assert(new Set(ix.panels.map(p => p.id)).size === ix.panels.length, "panel ids must be unique");
});

console.log("geometry:");
t("pitch is measured from the document, near 502.5pt", () => {
  assert(Math.abs(ix.pitch - 502.5) < 5, "measured pitch " + ix.pitch);
});
t("panel height follows the real layout, not the median pitch", () => {
  /* A page break pushes the plot down, so those panels occupy more of the strip
     than the pitch suggests. Assuming the pitch cropped 28 of 58 panels, by up
     to 152pt, which cut the bottom off half the contours on screen. */
  const byName = n => ix.panels.find(p => p.name === n);
  const wide = ix.panels.filter(p => p.height > ix.pitch + 2);
  assert(wide.length >= 20, "expected many panels taller than the pitch, got " + wide.length);
  assert(Math.abs(byName("velo-wing-1").height - 654.1) < 2,
    "velo-wing-1 straddles a break and needs its full extent, got " + byName("velo-wing-1").height.toFixed(1));
  assert(Math.abs(byName("total-cd-rplot").height - 583.6) < 2,
    "total-cd-rplot needs 583.6, got " + byName("total-cd-rplot").height.toFixed(1));
});
t("no panel is shorter than the content the layout gives it", () => {
  for (const p of ix.panels) {
    const capped = p.extent > ix.pitch * 1.6;
    if (!capped) {
      assert(p.height >= Math.min(p.extent, ix.pitch) - 1,
        `${p.name} is cropped: height ${p.height.toFixed(1)} vs extent ${p.extent.toFixed(1)}`);
    }
  }
});
t("a panel at a section boundary is capped, not left mostly blank", () => {
  // ut-cl-rplot is the last plot before Contours, so its raw extent is over
  // 1000pt of which nearly all is trailing whitespace.
  const p = ix.panels.find(x => x.name === "ut-cl-rplot");
  assert(p.extent > 900, "expected a large raw extent, got " + p.extent.toFixed(1));
  assert(p.height <= ix.pitch * 1.6 + 1, "should be capped, got " + p.height.toFixed(1));
  assert(p.height >= ix.pitch, "but not below the normal panel height");
});
t("panels that straddle a page break are handled", () => {
  const straddlers = ix.panels.filter(p => {
    const page = ix.pages[p.page - 1];
    return p.pageY + p.height > page.height + 1;
  });
  assert(straddlers.length > 0, "the sample has panels crossing a page break; none detected");
  straddlers.forEach(p => assert(p.page < ix.numPages, "a straddling panel cannot start on the last page"));
});
t("no panel runs off the end of the strip", () => {
  ix.panels.forEach(p => assert(p.absY + p.height <= ix.stripHeight + 0.01, p.name + " overruns the strip"));
});

console.log("matching:");
t("a document matched against itself lines up one-to-one", () => {
  const rows = matchPanels([ix, ix]);
  assert(rows.length === 59, "expected 59 rows, got " + rows.length);
  assert(rows.every(r => r.cells[0] && r.cells[1]), "every panel should pair with itself");
  assert(rows.every(r => r.cells[0].id === r.cells[1].id), "pairs must share an id");
});
t("a panel missing from one document still gets a row", () => {
  const trimmed = { ...ix, panels: ix.panels.filter(p => p.name !== "vector-0") };
  const rows = matchPanels([ix, trimmed]);
  assert(rows.length === 59, "the row survives, got " + rows.length);
  const row = rows.find(r => r.name === "vector-0");
  assert(row && row.cells[0] && row.cells[1] === null, "the gap should be an explicit null");
});
t("a panel only in the second document is not dropped", () => {
  const extra = { ...ix, panels: [...ix.panels, { ...ix.panels[0], id: "Contours/new-plot", name: "new-plot", section: "Contours", order: 999 }] };
  const rows = matchPanels([ix, extra]);
  assert(rows.some(r => r.name === "new-plot"), "a new panel must appear in the comparison");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
