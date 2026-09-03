/* panels.js — one named plot, from every loaded report, side by side.

   This is the view the app exists for. "We care most about comparing plots of
   the same kind between two different reports" means the unit of comparison is
   the panel, not the page: velo-wing-3 from DP_22 next to velo-wing-3 from
   DP_23, cropped identically and drawn at the same scale so the eye can do the
   differencing.

   A panel missing from one report is shown as an explicit gap rather than
   silently collapsing the row, because "this run didn't produce that plot" is
   itself worth seeing. */

import { S, el, esc, panelRows, currentRow, selectPanel } from "./core.js";
import { renderPanel, panelRange, jointCrop } from "./render.js";

export function renderPanelView(main) {
  const rows = panelRows();
  const row = currentRow();
  const ready = S.docs.filter(d => d.index);

  const bar = el("div", "panelbar");
  const sel = el("select");
  let section = null;
  let group = null;
  for (const r of rows) {
    if (r.section !== section) {
      section = r.section;
      group = el("optgroup");
      group.label = section || "Other";
      sel.appendChild(group);
    }
    const o = el("option", "", esc(r.name));
    o.value = r.id;
    if (row && r.id === row.id) o.selected = true;
    const missing = r.cells.filter(c => !c).length;
    if (missing) o.textContent += `  (missing in ${missing})`;
    (group || sel).appendChild(o);
  }
  sel.onchange = () => selectPanel(sel.value, { stay: true });

  const prev = el("button", "", "‹");
  const next = el("button", "", "›");
  const i = rows.findIndex(r => row && r.id === row.id);
  prev.disabled = i <= 0; next.disabled = i < 0 || i >= rows.length - 1;
  prev.onclick = () => selectPanel(rows[i - 1].id, { stay: true });
  next.onclick = () => selectPanel(rows[i + 1].id, { stay: true });
  prev.title = "Previous panel (k)"; next.title = "Next panel (j)";

  bar.appendChild(sel);
  bar.appendChild(prev);
  bar.appendChild(next);
  if (row) {
    bar.appendChild(el("span", "title", esc(row.name)));
    bar.appendChild(el("span", "sec", esc(row.section || "") + ` · ${i + 1} of ${rows.length}`));
  }
  main.appendChild(bar);

  const grid = el("div", "panelgrid");
  main.appendChild(grid);
  if (!row) { grid.appendChild(el("div", "absent", "No panels found in these reports.")); return; }

  /* Build every cell first, then measure. Measuring inside the loop reads the
     width of a grid that is still filling up, so the first report would be
     drawn larger than the rest and the whole point (identical scale, so the eye
     can compare) would be lost. */
  const bodies = [];
  for (const [d, doc] of ready.entries()) {
    const cell = el("div", "panelcell");
    cell.innerHTML = `<div class="cap">
      <span class="swatch" style="width:9px;height:9px;border-radius:3px;background:${doc.color}"></span>
      <b>${esc(doc.name)}</b>
      <span style="margin-left:auto;color:var(--faint)">${row.cells[d] ? "p" + row.cells[d].page : ""}</span>
    </div>`;
    const body = el("div", "body");
    cell.appendChild(body);
    grid.appendChild(cell);
    bodies.push({ doc, body, panel: row.cells[d] });
  }

  for (const { body, panel } of bodies) {
    if (!panel) {
      body.appendChild(el("div", "absent", `<b>${esc(row.name)}</b> is not in this report.<br>
        Either the run did not produce it, or it was renamed.`));
    }
  }

  /* Render every cell, then crop them all to one shared content box. The two
     steps cannot be merged: the crop has to see every report before it can pick
     a box that suits all of them, and cropping each one to its own content
     would leave the panes misaligned. */
  (async () => {
    const live = bodies.filter(b => b.panel);
    if (!live.length) return;

    /* Fit the whole panel in view rather than filling the width and letting it
       run off the bottom. Comparing two plots means seeing both at once. Zoom
       overrides it. Every cell uses the same range so they stay comparable, and
       the tallest panel drives the fit. */
    const doc0 = live[0].doc;
    const pageW = doc0.index.pages[0].width;
    const ranges = live.map(({ panel }) => panelRange(panel));
    const rangeHeight = Math.max(...ranges.map(r => r.height));
    const body0 = live[0].body;
    const availW = Math.max(160, body0.clientWidth - 26);
    const availH = Math.max(160, body0.clientHeight - 26);
    const fitW = Math.min(availW, availH * pageW / rangeHeight);
    const width = S.fit ? fitW : availW * S.zoom;

    let canvases;
    try {
      canvases = await Promise.all(live.map(({ doc, panel }, i) =>
        renderPanel(doc, panel, width, { range: { absY: ranges[i].absY, height: rangeHeight } })));
    } catch (e) {
      live.forEach(({ body }) => { body.innerHTML = `<div class="absent">Could not render: ${esc(e.message)}</div>`; });
      return;
    }

    const cropped = jointCrop(canvases, rangeHeight).canvases;

    // Re-fit to the height freed up by the crop, so the plot fills the pane.
    const first = cropped[0];
    if (first && S.fit) {
      const aspect = first.height / first.width;
      const better = Math.min(availW, availH / aspect);
      if (better > width * 1.02) {
        cropped.forEach(c => {
          c.style.width = better + "px";
          c.style.height = (better * aspect) + "px";
        });
      }
    }

    live.forEach(({ body }, i) => {
      if (!body.isConnected) return;
      body.innerHTML = "";
      body.appendChild(cropped[i]);
    });
  })();
}
