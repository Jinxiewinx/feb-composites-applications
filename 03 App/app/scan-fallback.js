"use strict";
/* scan-fallback.js — camera scanning where BarcodeDetector does not exist,
 * which is every browser on an iPhone.
 *
 * scan.js's original stance was to vendor nothing: Chrome and Android have
 * BarcodeDetector natively, and an FEB QR label read by the iPhone's own
 * camera app lands on q.html anyway. UC EH&S tags broke that logic — their
 * codes open nothing of ours, and the older stickers are linear barcodes a
 * camera app will not treat as a link — so Simon approved a vendored decoder
 * (2026-08-28). This file is the whole cost of that decision, kept in one
 * place: zxing-wasm's reader build (vendor/zxing/, 1.0MB of wasm plus 55KB
 * of JS), loaded lazily, ONLY on browsers with no native detector, cached by
 * the browser after the first fetch.
 *
 * The shape is a polyfill, not a second scan path. loadScanFallback()
 * installs a BarcodeDetector-compatible class on window, so tickScan and
 * everything downstream of the detector stay byte-identical. If the load
 * fails (offline first visit, blocked wasm), openScan degrades to the typed
 * box, which is where iPhones were before this file existed.
 */

/* idle -> loading -> ready | failed. `failed` is sticky for the session:
   retrying a fetch that just failed at the shelf, on RFS wifi, per scan,
   would hang every scan open. A reload retries. */
let ZX_FALLBACK = { state: "idle", promise: null, mod: null };

function scanFallbackNeeded() {
  return typeof window !== "undefined" && !("BarcodeDetector" in window);
}

async function loadScanFallback() {
  if (!scanFallbackNeeded()) return true;
  if (ZX_FALLBACK.state === "ready") return true;
  if (ZX_FALLBACK.state === "failed") return false;
  if (ZX_FALLBACK.state === "loading") return ZX_FALLBACK.promise;
  ZX_FALLBACK.state = "loading";
  ZX_FALLBACK.promise = (async () => {
    try {
      /* Resolved against this script's own URL, so it works wherever the app
         is served from. The es/ layout inside vendor/zxing/ is the package's
         own (reader imports ../share.js); the wasm sits at the vendor root
         and locateFile points the module at it. */
      const mod = await import("./vendor/zxing/es/reader/index.js");
      await mod.prepareZXingModule({
        overrides: { locateFile: (path, prefix) => /\.wasm$/.test(path) ? "vendor/zxing/" + path : prefix + path },
        fireImmediately: true,
      });
      ZX_FALLBACK.mod = mod;
      window.BarcodeDetector = zxDetectorClass(mod);
      ZX_FALLBACK.state = "ready";
      return true;
    } catch (e) {
      ZX_FALLBACK.state = "failed";
      return false;
    }
  })();
  return ZX_FALLBACK.promise;
}

/* The subset of BarcodeDetector format names scan.js asks for, mapped to
   zxing-wasm's names. Anything unmapped is dropped rather than guessed. */
const ZX_FORMATS = {
  qr_code: "QRCode", code_128: "Code128", code_39: "Code39",
  code_93: "Code93", data_matrix: "DataMatrix", ean_13: "EAN-13",
  upc_a: "UPC-A", itf: "ITF", aztec: "Aztec", pdf417: "PDF417",
};

function zxDetectorClass(mod) {
  return class {
    constructor(opts) {
      this.formats = ((opts && opts.formats) || []).slice();
      this.zx = this.formats.map(f => ZX_FORMATS[f]).filter(Boolean);
    }
    static async getSupportedFormats() { return Object.keys(ZX_FORMATS); }
    async detect(source) {
      const img = zxGrabFrame(source);
      if (!img) return [];
      /* tryHarder is the difference between reading a curled sticker on a
         jug and not. The frame rate cost is absorbed by tickScan's design:
         it awaits detect() before scheduling the next frame, so a slower
         detector just means fewer frames, never a backlog. */
      const hits = await mod.readBarcodes(img, {
        formats: this.zx, tryHarder: true, maxNumberOfSymbols: 4,
      });
      return hits.filter(h => h && h.text).map(h => ({
        rawValue: h.text,
        format: (Object.keys(ZX_FORMATS).find(k => ZX_FORMATS[k] === h.format) || "unknown"),
      }));
    }
  };
}

/* One canvas, reused per frame. Downscaled to 1024 on the long side: the
   wasm decode time scales with pixels and a 4k camera frame buys nothing a
   1024px one does not — the tag fills the scan box either way. */
let ZX_CANVAS = null;
function zxGrabFrame(video) {
  const vw = video && (video.videoWidth || video.width) || 0;
  const vh = video && (video.videoHeight || video.height) || 0;
  if (!vw || !vh || typeof document === "undefined") return null;
  const scale = Math.min(1, 1024 / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale)), h = Math.max(1, Math.round(vh * scale));
  if (!ZX_CANVAS) ZX_CANVAS = document.createElement("canvas");
  if (ZX_CANVAS.width !== w) ZX_CANVAS.width = w;
  if (ZX_CANVAS.height !== h) ZX_CANVAS.height = h;
  const ctx = ZX_CANVAS.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  try { return ctx.getImageData(0, 0, w, h); } catch (e) { return null; }
}
