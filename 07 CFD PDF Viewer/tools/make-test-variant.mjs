/* Make a perturbed copy of the sample report, so the difference view has
   something to find.

   Two reports that are byte-identical prove the diff is correctly aligned (it
   must come out at exactly 0.00%), but they cannot prove it actually fires. Only
   one report exists so far, so this manufactures a second one by re-encoding the
   embedded contour images at lower quality with Ghostscript.

   That is a deliberate choice of perturbation: it leaves the document structure,
   page count, panel titles and layout untouched, so panel matching still has to
   work, while every contour image picks up real pixel differences. It stands in
   for "same geometry, slightly different solve" until a genuine second design
   point lands.

   Needs Ghostscript (`brew install ghostscript`).
   Run: node tools/make-test-variant.mjs */

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "DP_22.pdf");
const out = join(root, "DP_22_variant.pdf");

if (!existsSync(src)) {
  console.error("missing " + src);
  process.exit(1);
}

try {
  execFileSync("gs", [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dNOPAUSE", "-dQUIET", "-dBATCH",
    // Aggressive image downsampling is the whole point: it changes pixels
    // without touching the text layer the indexer reads.
    "-dDownsampleColorImages=true",
    "-dColorImageResolution=52",
    "-dColorImageDownsampleType=/Average",
    "-dAutoFilterColorImages=false",
    "-dColorImageFilter=/DCTEncode",
    `-sOutputFile=${out}`,
    src,
  ], { stdio: ["ignore", "ignore", "inherit"] });
} catch (e) {
  console.error("Ghostscript failed. Install it with: brew install ghostscript");
  process.exit(1);
}

const a = statSync(src).size, b = statSync(out).size;
console.log(`wrote DP_22_variant.pdf  ${(b / 1e6).toFixed(1)} MB (source ${(a / 1e6).toFixed(1)} MB)`);
console.log("Load it next to DP_22.pdf; the difference view should light up on the contours.");
