"use strict";
/* slicer.worker.js — runs slicer.js off the main thread.
   A mold STL is commonly 10^5-10^6 triangles; parse + slice + stitch is seconds
   of work. render() in core.js is fully synchronous, so doing this inline
   freezes the whole tab with no spinner — the app has no spinner infrastructure
   to borrow because nothing else in it ever blocks.

   This file is deliberately thin. All the geometry lives in slicer.js, which is
   pure and therefore testable under node; a Worker is not.

   Protocol
     in : { cmd:"slice", buffer, unit, thicknesses, opts }
     out: { type:"progress", value 0..1 }
          { type:"done", result }
          { type:"error", message, region? }
   Note importScripts needs a CLASSIC worker (no { type:"module" }), which
   matches how the rest of the app loads. */

importScripts("slicer.js");

self.onmessage = function (e) {
  const msg = e.data || {};
  if (msg.cmd !== "slice") return;
  try {
    const parsed = parseSTL(msg.buffer);
    const tris = scaleTris(parsed.tris, msg.unit);
    const result = sliceMold(tris, msg.thicknesses, {
      ...(msg.opts || {}),
      onProgress: v => self.postMessage({ type: "progress", value: v }),
    });
    self.postMessage({
      type: "done",
      result: {
        layers: result.layers,
        bounds: result.bounds,
        warnings: result.warnings,
        triangleCount: parsed.tris.length,
      },
    });
  } catch (err) {
    // Structured-clone can't carry an Error, so flatten it. The region is what
    // lets the UI say WHERE an overhang is instead of just refusing the file.
    self.postMessage({ type: "error", message: err.message || String(err), region: err.region || null });
  }
};
