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

/* Which pages does a strip range touch, and where does it land on each? */
export function pagesForRange(index, absY, height) {
  const out = [];
  for (const p of index.pages) {
    const top = p.absY, bottom = p.absY + p.height;
    if (bottom <= absY || top >= absY + height) continue;
    out.push({
      page: p.index,
      // portion of this page to take, in page points
      srcY: Math.max(0, absY - top),
      srcH: Math.min(p.height, absY + height - top) - Math.max(0, absY - top),
      // where that portion lands in the panel, in strip points
      dstY: Math.max(0, top - absY),
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
  const r = panelRange(panel);
  return renderRange(doc, r.absY, r.height, targetWidth, opts);
}
