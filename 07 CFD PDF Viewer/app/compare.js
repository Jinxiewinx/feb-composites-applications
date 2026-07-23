/* compare.js — lay two reports over each other and show what moved.

   Three modes, one rendering path. Both panels are drawn to offscreen canvases
   at identical size first, which is what makes them comparable at all, then
   composited:

   - Blend    fade between A and B. Good for "did the shock move".
   - Swipe    a draggable divider, A on the left, B on the right. Good for
              judging a boundary because the eye is very good at spotting a
              discontinuity across a straight edge.
   - Diff     per-pixel absolute difference, amplified. Good for "is anything
              different at all", which is often the real question.

   The difference is computed by hand rather than with a canvas blend mode
   because we also want the number: what fraction of the panel actually changed.
   Two identical reports must come out at exactly 0.00%, which doubles as a
   correctness check on the whole alignment and rendering path. */

import { S, el, esc, panelRows, currentRow, selectPanel } from "./core.js";
import { renderPanel, panelRange, jointCrop } from "./render.js";

const MODES = [
  ["diff", "Difference"],
  ["blend", "Blend"],
  ["swipe", "Swipe"],
];

export function renderOverlay(main) {
  const ready = S.docs.filter(d => d.index);
  if (ready.length < 2) {
    main.appendChild(el("div", "empty", `<div class="empty-card">Open a second report to overlay.</div>`));
    return;
  }
  if (S.overlay.a >= ready.length) S.overlay.a = 0;
  if (S.overlay.b >= ready.length) S.overlay.b = 1;

  const rows = panelRows();
  const row = currentRow();

  /* ---- toolbar ---- */
  const bar = el("div", "ovbar");

  const sel = el("select");
  for (const r of rows) {
    const o = el("option", "", esc(r.name) + (r.section ? "  ·  " + esc(r.section) : ""));
    o.value = r.id;
    if (row && r.id === row.id) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => selectPanel(sel.value, { stay: true });
  bar.appendChild(sel);

  const seg = el("div", "seg");
  for (const [id, label] of MODES) {
    const b = el("button", S.overlay.mode === id ? "active" : "", label);
    b.onclick = () => { S.overlay.mode = id; renderOverlayStage(); };
    seg.appendChild(b);
  }
  bar.appendChild(seg);

  const pick = (which) => {
    const s = el("select");
    ready.forEach((d, i) => {
      const o = el("option", "", esc(d.name));
      o.value = i;
      if (S.overlay[which] === i) o.selected = true;
      s.appendChild(o);
    });
    s.onchange = () => { S.overlay[which] = +s.value; renderOverlayStage(); };
    return s;
  };
  const pairing = el("label", "", "");
  pairing.appendChild(document.createTextNode("A"));
  pairing.appendChild(pick("a"));
  pairing.appendChild(document.createTextNode("B"));
  pairing.appendChild(pick("b"));
  bar.appendChild(pairing);

  const ctrl = el("label", "", "");
  bar.appendChild(ctrl);
  const legend = el("div", "ovlegend");
  bar.appendChild(legend);
  main.appendChild(bar);

  const stage = el("div", "ovstage");
  main.appendChild(stage);

  async function renderOverlayStage() {
    // Rebuild the mode buttons' active state without rebuilding the toolbar.
    [...seg.children].forEach((b, i) => b.classList.toggle("active", MODES[i][0] === S.overlay.mode));
    ctrl.innerHTML = "";
    legend.innerHTML = "";
    stage.innerHTML = `<div style="color:var(--muted);padding:40px">Rendering…</div>`;

    const r = currentRow();
    const A = ready[S.overlay.a], B = ready[S.overlay.b];
    const pa = r && r.cells[ready.indexOf(A)];
    const pb = r && r.cells[ready.indexOf(B)];
    if (!pa || !pb) {
      stage.innerHTML = `<div class="absent" style="color:var(--muted);padding:40px">
        This panel is not in both reports, so there is nothing to overlay.</div>`;
      return;
    }

    const width = Math.min(1100, Math.max(360, stage.clientWidth - 40));

    /* Both panels are rendered over the same strip range and then cropped with
       one shared box. Independent ranges or independent crops would offset the
       two images by a few points, and the difference view would report that
       offset as change across the entire panel. */
    const ra = panelRange(pa), rb = panelRange(pb);
    const rangeHeight = Math.max(ra.height, rb.height);
    const [ra0, rb0] = await Promise.all([
      renderPanel(A, pa, width, { range: { absY: ra.absY, height: rangeHeight } }),
      renderPanel(B, pb, width, { range: { absY: rb.absY, height: rangeHeight } }),
    ]);
    const [ca, cb] = jointCrop([ra0, rb0], rangeHeight).canvases;

    const hold = el("div", "ovhold");
    const out = document.createElement("canvas");
    out.width = Math.min(ca.width, cb.width);
    out.height = Math.min(ca.height, cb.height);
    out.style.width = width + "px";
    out.style.height = (out.height / (ca.width / width)) + "px";
    hold.style.width = width + "px";
    hold.appendChild(out);
    stage.innerHTML = "";
    stage.appendChild(hold);

    const ctx = out.getContext("2d", { willReadFrequently: S.overlay.mode === "diff" });

    if (S.overlay.mode === "blend") {
      const slider = el("input");
      slider.type = "range"; slider.min = 0; slider.max = 1; slider.step = 0.01; slider.value = S.overlay.blend;
      slider.oninput = () => { S.overlay.blend = +slider.value; paintBlend(); legendBlend(); };
      ctrl.appendChild(document.createTextNode("A"));
      ctrl.appendChild(slider);
      ctrl.appendChild(document.createTextNode("B"));
      const paintBlend = () => {
        ctx.globalAlpha = 1; ctx.drawImage(ca, 0, 0);
        ctx.globalAlpha = S.overlay.blend; ctx.drawImage(cb, 0, 0); ctx.globalAlpha = 1;
      };
      const legendBlend = () => {
        legend.innerHTML = `<span><b style="color:${A.color}">${esc(A.name)}</b> ${Math.round((1 - S.overlay.blend) * 100)}%</span>
          <span><b style="color:${B.color}">${esc(B.name)}</b> ${Math.round(S.overlay.blend * 100)}%</span>`;
      };
      paintBlend(); legendBlend();

    } else if (S.overlay.mode === "swipe") {
      const paintSwipe = () => {
        const x = Math.round(out.width * S.overlay.swipe);
        ctx.clearRect(0, 0, out.width, out.height);
        ctx.drawImage(ca, 0, 0);
        ctx.save();
        ctx.beginPath(); ctx.rect(x, 0, out.width - x, out.height); ctx.clip();
        ctx.drawImage(cb, 0, 0);
        ctx.restore();
        div.style.left = (S.overlay.swipe * 100) + "%";
      };
      const div = el("div", "divider");
      hold.appendChild(div);
      const onMove = ev => {
        const rect = hold.getBoundingClientRect();
        const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
        S.overlay.swipe = Math.max(0, Math.min(1, px / rect.width));
        paintSwipe();
      };
      const start = ev => {
        ev.preventDefault();
        onMove(ev);
        const stop = () => { removeEventListener("mousemove", onMove); removeEventListener("mouseup", stop); };
        addEventListener("mousemove", onMove); addEventListener("mouseup", stop);
      };
      div.addEventListener("mousedown", start);
      hold.addEventListener("mousedown", start);
      legend.innerHTML = `<span>left <b style="color:${A.color}">${esc(A.name)}</b></span>
        <span>right <b style="color:${B.color}">${esc(B.name)}</b></span><span>drag the divider</span>`;
      paintSwipe();

    } else {
      const slider = el("input");
      slider.type = "range"; slider.min = 1; slider.max = 20; slider.step = 1; slider.value = S.overlay.amp;
      slider.oninput = () => { S.overlay.amp = +slider.value; paintDiff(); };
      ctrl.appendChild(document.createTextNode("Amplify"));
      ctrl.appendChild(slider);

      // Read each canvas's pixels directly rather than drawing both onto one
      // scratch canvas and reading it back twice. That round-trip added a
      // couple of least-significant-bit differences on a GPU-backed canvas, so
      // two identical reports read as "0.00% differ" instead of identical.
      // After jointCrop ca and cb share out's dimensions, so a direct read lines
      // up. Fall back to the scratch path if a size ever mismatches.
      const readCanvas = (cv) => {
        if (cv.width === out.width && cv.height === out.height) {
          return cv.getContext("2d").getImageData(0, 0, out.width, out.height);
        }
        const t = document.createElement("canvas");
        t.width = out.width; t.height = out.height;
        const tc = t.getContext("2d", { willReadFrequently: true });
        tc.drawImage(cv, 0, 0);
        return tc.getImageData(0, 0, out.width, out.height);
      };
      const ia = readCanvas(ca);
      const ib = readCanvas(cb);

      const paintDiff = () => {
        const amp = S.overlay.amp;
        const outImg = ctx.createImageData(out.width, out.height);
        const a = ia.data, b = ib.data, o = outImg.data;
        let changed = 0, total = a.length / 4, peak = 0;
        for (let i = 0; i < a.length; i += 4) {
          const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
          if (d > 8) changed++;
          if (d > peak) peak = d;
          const v = Math.min(255, d * amp / 3);
          // Unchanged pixels stay near-white so the plot's own geometry is still
          // faintly readable; changes burn in as dark heat.
          o[i] = 255 - v; o[i + 1] = 255 - v * 0.72; o[i + 2] = 255 - v * 0.25; o[i + 3] = 255;
        }
        ctx.putImageData(outImg, 0, 0);
        const pct = (changed / total) * 100;
        const same = changed === 0;
        legend.innerHTML =
          `<span class="diffstat ${same ? "same" : "diff"}">${same ? "identical" : pct.toFixed(2) + "% of pixels differ"}</span>
           <span>peak Δ ${peak}</span>
           <span><b style="color:${A.color}">${esc(A.name)}</b> vs <b style="color:${B.color}">${esc(B.name)}</b></span>`;
        // Exposed for the browser-driven checks: identical inputs must be 0.
        window.__lastDiff = { changed, total, pct, peak };
      };
      paintDiff();
    }

    const save = el("button", "ghost", "Export PNG");
    save.onclick = () => {
      const a = document.createElement("a");
      a.download = `${r.name}-${A.name}-vs-${B.name}-${S.overlay.mode}.png`;
      a.href = out.toDataURL("image/png");
      a.click();
    };
    legend.appendChild(save);
  }

  renderOverlayStage();
}
