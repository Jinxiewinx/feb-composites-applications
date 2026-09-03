/* render.js — page and panel rasterisation, with a cache.

   Two consumers, one path:
   - the page view wants whole pages, lazily, as they scroll into sight
   - the panel and overlay views want one panel, which is a crop of the strip and
     may span two pages

   Both go through renderPage(). A panel is composited from the page canvases it
   overlaps, which is what makes a panel that straddles a page break work at all.

   These are A3 pages and a report is 39 of them, so rendering everything up
   front would be slow and pointless. Pages render on demand and stay cached by
   (document, page, scale); the cache is bounded because a few hundred A3
   canvases will exhaust memory. */

const CACHE_LIMIT = 60;          // page canvases held across all documents
const cache = new Map();         // key -> { canvas, promise }
const inflight = new Map();

function touch(key, value) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

export function clearCache(docId) {
  if (!docId) return cache.clear();
  for (const k of [...cache.keys()]) if (k.startsWith(docId + "|")) cache.delete(k);
}

/* Measure each page's ink margins, so withContentSpace can drop them.

   Renders every page small (a plot is a big object, a coarse raster locates it
   fine) and finds the first and last inked row. Returns per-page
   { top, bottom } in page points. One pass at load; the pages view already
   rasterises all of them at full size, so a low-res pass is cheap. A page that
   fails to render contributes no trim rather than blocking the load. */
export async function measureMargins(doc, opts = {}) {
  const scale = opts.scale || 0.34;
  const threshold = opts.threshold ?? 246;
  const out = [];
  for (const pg of doc.index.pages) {
    let top = 0, bottom = 0;
    try {
      const { canvas } = await renderPage(doc, pg.index, scale);
      const w = canvas.width, h = canvas.height;
      const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      const inkRow = (y) => {
        const base = y * w * 4;
        for (let x = 0; x < w; x += 3) {
          const i = base + x * 4;
          if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) return true;
        }
        return false;
      };
      let a = 0, b = 0;
      for (let y = 0; y < h; y++) { if (inkRow(y)) break; a++; }
      for (let y = h - 1; y >= 0; y--) { if (inkRow(y)) break; b++; }
      // A blank page (a === h) would trim everything; leave it whole instead.
      if (a < h) { top = (a / h) * pg.height; bottom = (b / h) * pg.height; }
    } catch { /* leave this page untrimmed */ }
    out.push({ top, bottom });
    if (opts.onProgress) opts.onProgress(pg.index, doc.index.pages.length);
  }
  return out;
}

/* Render one page at a given CSS scale. Device pixel ratio is folded in so text
   and thin plot lines stay crisp on a retina display. */
export async function renderPage(doc, pageNum, scale) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const key = `${doc.id}|${pageNum}|${scale.toFixed(3)}|${dpr}`;
  const hit = cache.get(key);
  if (hit) { touch(key, hit); return hit; }
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const page = await doc.pdf.getPage(pageNum);
    const vp = page.getViewport({ scale: scale * dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();
    const entry = { canvas, scale, dpr };
    touch(key, entry);
    inflight.delete(key);
    return entry;
  })();

  inflight.set(key, job);
  return job;
}

/* Which pages does a content-space range touch, and where does it land on each?

   Ranges are in content space (margins already collapsed, see withContentSpace),
   so a page occupies [cy, cy + cHeight]. The source rows read from the page start
   at cTop, which is what skips the print margin: the whitespace above cTop and
   below cBottom is never sampled, so consecutive pages composite back to back
   with no seam. Falls back to full-page coordinates when a page has no measured
   margins (contentTop/Height absent). */
export function pagesForRange(index, absY, height) {
  const out = [];
  for (const p of index.pages) {
    const cy = p.cy != null ? p.cy : p.absY;
    const cH = p.cHeight != null ? p.cHeight : p.height;
    const cTop = p.cTop != null ? p.cTop : 0;
    const top = cy, bottom = cy + cH;
    if (bottom <= absY || top >= absY + height) continue;
    const takeFrom = Math.max(0, absY - top);            // offset into this page's content
    const takeTo = Math.min(cH, absY + height - top);
    out.push({
      page: p.index,
      srcY: cTop + takeFrom,                             // page points, past the top margin
      srcH: takeTo - takeFrom,
      dstY: Math.max(0, top - absY),                     // where it lands in the output
      pageHeight: p.height,
      pageWidth: p.width,
    });
  }
  return out;
}

/* Draw a strip range onto a canvas at `targetWidth` CSS pixels.

   Panels are cropped a little tighter than the raw pitch: the title sits at the
   top of the range and the next panel's title marks the end, so trimming a few
   points off the bottom keeps the neighbouring title out of the frame. */
export async function renderRange(doc, absY, height, targetWidth, opts = {}) {
  const index = doc.index;
  const pageW = index.pages[0].width;
  const scale = targetWidth / pageW;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const canvas = opts.canvas || document.createElement("canvas");
  canvas.width = Math.ceil(targetWidth * dpr);
  canvas.height = Math.ceil(height * scale * dpr);
  canvas.style.width = targetWidth + "px";
  canvas.style.height = height * scale + "px";
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const seg of pagesForRange(index, absY, height)) {
    const { canvas: src, dpr: sdpr } = await renderPage(doc, seg.page, scale);
    const k = scale * sdpr;                    // page points -> source pixels
    ctx.drawImage(
      src,
      0, Math.round(seg.srcY * k), src.width, Math.round(seg.srcH * k),
      0, Math.round(seg.dstY * scale * dpr), canvas.width, Math.round(seg.srcH * scale * dpr)
    );
  }
  return canvas;
}

/* A panel, cropped so the following panel's title does not bleed in. */
export function panelRange(panel) {
  const trim = Math.min(14, panel.height * 0.03);
  return { absY: panel.absY - 4, height: Math.max(40, panel.height - trim) };
}

export async function renderPanel(doc, panel, targetWidth, opts) {
  const r = opts?.range || panelRange(panel);
  return renderRange(doc, r.absY, r.height, targetWidth, opts);
}

/* Where the ink actually is, as offsets in strip points from the top of the
   given range.

   The source layout leaves a lot of empty space around a plot (in the sample,
   roughly the top 40% of a panel is blank), so cropping to content makes the
   comparison panes far denser. Rows are sampled rather than scanned pixel by
   pixel; a plot is a large object and there is no need to be exact about a
   hairline. */
export function contentBounds(canvas, rangeHeight, opts = {}) {
  const threshold = opts.threshold ?? 247;      // below this counts as ink
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return { top: 0, bottom: rangeHeight };
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let data;
  try { data = ctx.getImageData(0, 0, w, h).data; }
  catch { return { top: 0, bottom: rangeHeight }; }   // tainted canvas, don't guess

  const rowHasInk = (y) => {
    const base = y * w * 4;
    for (let x = 0; x < w; x += 2) {
      const i = base + x * 4;
      if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) return true;
    }
    return false;
  };

  const toPts = (px) => (px / h) * rangeHeight;

  /* Group the inked rows into blocks, splitting on any blank run longer than
     minGap. The panels have a characteristic shape: a title line, a wide empty
     band, then the plot. Knowing where the blocks are is what lets the caller
     drop the band without touching the plot itself. */
  const minGapPx = Math.max(4, (opts.minGapPts ?? 40) / rangeHeight * h);
  const blocks = [];
  let runStart = -1, blankRun = 0;
  for (let y = 0; y < h; y++) {
    if (rowHasInk(y)) {
      if (runStart < 0) runStart = y;
      blankRun = 0;
    } else if (runStart >= 0) {
      blankRun++;
      if (blankRun >= minGapPx) { blocks.push([runStart, y - blankRun]); runStart = -1; blankRun = 0; }
    }
  }
  if (runStart >= 0) blocks.push([runStart, h - 1]);
  if (!blocks.length) return { top: 0, bottom: rangeHeight, blocks: [] };

  return {
    top: toPts(blocks[0][0]),
    bottom: toPts(blocks[blocks.length - 1][1] + 1),
    blocks: blocks.map(([a, b]) => ({ top: toPts(a), bottom: toPts(b + 1) })),
  };
}

/* Crop several already-rendered panels to ONE shared content box.

   Joint rather than per-panel is the whole point. Cropping each report to its
   own content would leave them at different offsets, and the difference view
   would then light up everywhere from a pure alignment artefact rather than
   from anything that changed in the solve. Taking the union of the content
   boxes keeps every report on identical coordinates while still removing the
   dead space.

   Works on the pixels that were already drawn, so this costs a canvas copy
   rather than a second render. */
export function jointCrop(canvases, rangeHeight, opts = {}) {
  const pad = opts.pad ?? 6;                    // strip points of breathing room
  const live = canvases.filter(Boolean);
  if (!live.length) return { canvases, top: 0, height: rangeHeight };

  let top = Infinity, bottom = -Infinity;
  for (const c of live) {
    const b = contentBounds(c, rangeHeight, opts);
    let start = b.top;
    /* Crop down to the plot when the panel is the usual "title, empty band,
       plot" shape. Keyed on the last block dominating the panel rather than on
       the first block being thin: the header area also carries the section rules
       either side of the title, so it is taller than the text alone. The panel
       name is already in the toolbar and the column header, so dropping it from
       the image loses nothing. A single-block panel (most convergence plots) is
       left alone. */
    if (b.blocks.length >= 2) {
      const last = b.blocks[b.blocks.length - 1];
      const lastIsDominant = (last.bottom - last.top) > rangeHeight * 0.45;
      const roomAbove = last.top > rangeHeight * 0.10;
      if (lastIsDominant && roomAbove) start = last.top;
    }
    top = Math.min(top, start);
    bottom = Math.max(bottom, b.bottom);
  }
  top = Math.max(0, top - pad);
  bottom = Math.min(rangeHeight, bottom + pad);
  const height = bottom - top;

  // Not worth cropping if there is little to gain, and never crop to nothing.
  if (!isFinite(height) || height < rangeHeight * 0.25 || height > rangeHeight * 0.97) {
    return { canvases, top: 0, height: rangeHeight };
  }

  const out = canvases.map(c => {
    if (!c) return c;
    const scale = c.height / rangeHeight;       // device px per strip point
    const sy = Math.round(top * scale);
    const sh = Math.round(height * scale);
    const cropped = document.createElement("canvas");
    cropped.width = c.width;
    cropped.height = sh;
    const cssW = parseFloat(c.style.width) || c.width;
    cropped.style.width = cssW + "px";
    cropped.style.height = (cssW * sh / c.width) + "px";
    const cx = cropped.getContext("2d", { alpha: false });
    cx.fillStyle = "#fff";
    cx.fillRect(0, 0, cropped.width, cropped.height);
    cx.drawImage(c, 0, sy, c.width, sh, 0, 0, c.width, sh);
    return cropped;
  });
  return { canvases: out, top, height };
}
