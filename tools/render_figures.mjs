/* Rasterize the CS-standard figures: every SVG in "02 CS Standards/src/figures"
   becomes a same-named PNG beside it, at 2x for print.

   Why PNG exists at all: the SVGs are the editable sources, but none of the
   three consumers can take them — python-docx has no SVG support, pandoc's
   xelatex path needs rsvg-convert (not installed), and the app's markdown
   renderer serves whatever file the markdown names. PNG works in all three,
   so the markdown references the PNG and the SVG stays the thing you edit.

   Chromium does the rendering (via the same loadChromium the browser tests
   use) because it is the only SVG renderer this machine is known to have —
   ImageMagick is present but rasterizes SVG text badly without rsvg.

   Usage: node tools/render_figures.mjs [name.svg ...]   (no args = all)
   Re-run after editing any SVG, then tools/build_docx.py --all and
   tools/gen_docs_manifest.py so the docx/PDF/app copies pick it up. */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadChromium, skipMessage } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIG = join(ROOT, "02 CS Standards", "src", "figures");
const SCALE = 2;

const chromium = await loadChromium();
if (!chromium) {
  console.error(skipMessage("the CS figures"));
  process.exit(1);
}

const only = process.argv.slice(2);
const names = (await readdir(FIG)).filter(f => f.endsWith(".svg"))
  .filter(f => !only.length || only.includes(f));
if (!names.length) { console.error("no SVGs matched"); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: SCALE });
for (const name of names.sort()) {
  const svg = await readFile(join(FIG, name), "utf8");
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!m) { console.error(`${name}: no viewBox, skipped`); continue; }
  const [w, h] = [Math.ceil(+m[1]), Math.ceil(+m[2])];
  await page.setViewportSize({ width: w, height: h });
  /* data: URL, not a served file: the figure must be self-contained anyway
     (the docx embeds the PNG bytes), so a figure that only renders with
     external resources should fail here, loudly. */
  await page.goto("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  await page.screenshot({ path: join(FIG, name.replace(/\.svg$/, ".png")) });
  console.log(`rendered ${name} -> ${name.replace(/\.svg$/, ".png")} (${w * SCALE}x${h * SCALE})`);
}
await browser.close();
