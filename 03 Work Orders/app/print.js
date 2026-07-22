"use strict";
/* print.js — builds the printed work-order traveler.

   The printed sheet is its own document, not the screen view with the chrome
   hidden. It renders into #printroot (outside #app); index.html's @media print
   swaps which of the two is visible. Styles live in print.css and apply on
   screen too, so the preview here is exactly what comes out of the printer.

   Two ideas drive the layout:
   1. Every field is a BOX, whether or not the app has data for it. A work order
      printed from a half-filled record and a blank form off the shelf are the
      same document — one just arrives with more of it already inked.
   2. Every list ends in blank ruled rows. Layups grow steps, plies and BOM lines
      at the bench that nobody predicted at the desk, and if there's no room to
      write them they end up on the back of someone's hand. */

/* Trailing blank rows per section. These are the "leave extra space" budget —
   deliberately generous. Shrink them and the sheet stops being fillable. */
const BLANK_ROWS = { steps: 4, stack: 3, bom: 3, quality: 2, events: 4 };
/* A blank form has no data to anchor it, so it needs enough ruling to hold a
   whole real layup — SN5 stacks ran 6–8 plies. Three rows would send people to
   the margins on the first part they built. */
const BLANK_FORM_ROWS = { steps: 4, stack: 8, bom: 6, quality: 4, events: 6 };

/* Retro records carry the literal string "not recorded (retro)" in most fields.
   Printing that into a box is noise and, worse, it looks like data. Treat it as
   empty so the box stays writable. */
function pv(v) {
  const s = String(v ?? "").trim();
  return (!s || /not recorded/i.test(s)) ? "" : s;
}
function pcell(v, extra) {
  const s = pv(v);
  return `<div class="val ${s ? "filled" : ""} ${extra || ""}">${esc(s)}</div>`;
}
function pfield(label, v, cls, extra) {
  return `<div class="ws-f ${cls || ""}"><div class="lab">${esc(label)}</div>${pcell(v, extra)}</div>`;
}
/* "MoldWetLay" is a database value, not something to hand a person at a bench. */
function humanProcess(p) {
  return pv(p).replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}
function blankRows(n, cells) {
  let out = "";
  for (let i = 0; i < n; i++) out += `<tr class="blank">${cells}</tr>`;
  return out;
}

/* Steps for a blank form come from the standard list for the process, so a
   printed blank is a real procedure rather than empty ruling. */
function blankSteps(process) {
  return (STD_STEPS[process] || STD_STEPS.Other).map((s, i) =>
    ({ seq: i + 1, title: s[0], csRef: s[1], status: "open", buyoff: { name: "", date: "" }, notes: "" }));
}

function woSheetHtml(wo, opts) {
  opts = opts || {};
  const blank = !!opts.blank;
  const steps = wo.steps && wo.steps.length ? wo.steps : blankSteps(wo.processType);
  const mold = wo.mold || {};
  const stack = wo.layupStack || [];
  const bom = wo.bom || [];
  const qc = wo.qualityChecks || [];
  const ev = wo.timeline || [];
  const R = blank ? BLANK_FORM_ROWS : BLANK_ROWS;

  const stampTxt = blank ? "Blank form" : (wo.retro ? "Retro record" : (wo.status === "Draft" ? "Draft" : ""));

  /* ---- steps: the centerpiece ---- */
  const stepRows = steps.map(s => {
    const isBlk = typeof isBlocker === "function" && isBlocker(s);
    const signed = !blank && typeof isSigned === "function" && isSigned(s);
    const nm = signed ? pv(s.buyoff && s.buyoff.name) : "";
    const dt = signed ? pv(s.buyoff && s.buyoff.date) : "";
    const note = blank ? "" : pv(s.notes);
    return `<tr class="${isBlk ? "blk" : ""}">
      <td class="num seq">${esc(s.seq || "")}</td>
      <td>
        <div class="stitle"><span class="ws-cb"></span>${esc(s.title)}${s.csRef ? ` <span class="cs">[${esc(s.csRef)}]</span>` : ""}</div>
        ${isBlk ? `<div class="blkflag">Blocker — no sign-off, no moving on</div>` : ""}
        ${note ? `<div class="cs">${esc(note)}</div>` : ""}
      </td>
      <td class="initial">${nm ? `<span class="signed"><span class="nm">${esc(nm)}</span></span>` : ""}</td>
      <td class="datec ${dt ? "" : "empty"}">${esc(dt)}</td>
    </tr>`;
  }).join("");

  /* ---- ply stack: a table, because the screen's colour bars mean nothing in B&W ---- */
  const stackRows = (blank ? [] : stack).map((p, i) => `<tr class="${typeof plyClass === "function" ? plyClass(p.material) : "other"}">
      <td class="sw"></td>
      <td class="num">${i + 1}</td>
      <td class="mat">${esc(pv(p.material))}</td>
      <td>${esc(pv(p.orientation))}</td>
      <td>${esc(pv(p.coverage))}</td>
      <td>${esc(pv(p.notes))}</td>
    </tr>`).join("");

  const bomRows = (blank ? [] : bom).map(b => `<tr>
      <td>${esc(pv(b.item))}</td><td class="num">${esc(pv(b.qty))}</td><td>${esc(pv(b.unit))}</td>
      <td>${esc(pv(b.source))}</td><td>${esc(pv(b.estCost))}</td></tr>`).join("");

  const qcRows = (blank ? [] : qc).map(q => `<tr>
      <td>${esc(pv(q.criterion))}</td><td>${esc(pv(q.target))}</td><td>${esc(pv(q.actual))}</td>
      <td class="num">${q.pass === true ? "PASS" : q.pass === false ? "FAIL" : ""}</td></tr>`).join("");

  const evRows = (blank ? [] : ev).map(t => `<tr>
      <td class="datec ${pv(t.date) ? "" : "empty"}">${esc(pv(t.date))}</td><td>${esc(pv(t.note))}</td></tr>`).join("");

  return `<div class="wsheet"><div class="ws-page">
  <div class="ws-head">
    <div class="brand">FEB COMPOSITES <span class="sub">SN6</span></div>
    ${stampTxt ? `<div class="ws-stamp">${esc(stampTxt)}</div>` : ""}
    <div class="idblock">
      <div class="idcell"><div class="lab">Work order</div><div class="val">${esc(blank ? "" : pv(wo.id))}</div></div>
      <div class="idcell"><div class="lab">Rev</div><div class="val">${esc(blank ? "" : pv(wo.revision))}</div></div>
      <div class="idcell wide"><div class="lab">Process</div><div class="val">${esc(humanProcess(wo.processType))}</div></div>
    </div>
  </div>
  <div class="ws-rule"></div>
  <div class="ws-sheetkind">
    <span>Manufacturing traveler — fill in at the bench, transcribe into the app after</span>
    <span>Printed ${esc(today())}</span>
  </div>

  <div class="ws-h">Part &amp; assignment</div>
  <div class="ws-grid">
    ${pfield("Part name", blank ? "" : wo.partName, "span2")}
    ${pfield("Subteam", blank ? "" : wo.subteam)}
    ${pfield("Status", blank ? "" : wo.status)}
    ${pfield("Mold engineer", blank ? "" : wo.moldEngineer)}
    ${pfield("Manufacturing engineer", blank ? "" : wo.manufacturingEngineer)}
    ${pfield("Created", blank ? "" : wo.createdDate, "", "date")}
    ${pfield("Due", blank ? "" : wo.dueDate, "", "date")}
    ${pfield("Mass target (g)", blank ? "" : wo.weightTargetG)}
    ${pfield("Mass actual (g)", blank ? "" : wo.weightActualG)}
    ${pfield("Mold ID", blank ? "" : mold.moldId)}
    ${pfield("Mold location", blank ? "" : mold.location)}
  </div>

  <div class="ws-h">Mold <span class="hint">CS-003 / CS-004</span></div>
  <div class="ws-grid c3">
    ${pfield("Tooling board layers", blank ? "" : mold.layers)}
    ${pfield("Density (lb/ft³)", blank ? "" : mold.density)}
    ${pfield("Sealing system", blank ? "" : mold.sealingType)}
  </div>

  <div class="ws-h">Layup stack <span class="hint">CS-002${!blank && pv(wo.stackNote) ? " · " + esc(pv(wo.stackNote)) : ""}</span></div>
  <table class="ws-t stack rows">
    <thead><tr><th class="sw"></th><th class="num">Ply</th><th>Material</th><th>Orientation</th><th>Coverage</th><th>Notes</th></tr></thead>
    <tbody>${stackRows}${blankRows(R.stack, '<td class="sw"></td><td class="num"></td><td></td><td></td><td></td><td></td>')}</tbody>
  </table>

  <div class="ws-h">Steps &amp; buy-offs <span class="hint">initial and date each step as it is completed</span></div>
  <table class="ws-t steps">
    <thead><tr><th class="num">#</th><th>Operation</th><th class="initial">Initial</th><th class="datec">Date</th></tr></thead>
    <tbody>${stepRows}${blankRows(R.steps, '<td class="num seq"></td><td></td><td class="initial"></td><td class="datec empty"></td>')}</tbody>
  </table>

  <div class="ws-h">Bill of materials</div>
  <table class="ws-t rows">
    <thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th>Source</th><th>Est. cost</th></tr></thead>
    <tbody>${bomRows}${blankRows(R.bom, "<td></td><td></td><td></td><td></td><td></td>")}</tbody>
  </table>

  <div class="ws-h">Quality checks <span class="hint">target is set before work starts — CS-010</span></div>
  <table class="ws-t rows">
    <thead><tr><th>Criterion</th><th>Target</th><th>Actual</th><th class="num">Pass</th></tr></thead>
    <tbody>${qcRows}${blankRows(R.quality, "<td></td><td></td><td></td><td></td>")}</tbody>
  </table>

  <div class="ws-h">Event log <span class="hint">what actually happened, including what went wrong</span></div>
  <table class="ws-t rows">
    <thead><tr><th class="datec">Date</th><th>Event</th></tr></thead>
    <tbody>${evRows}${blankRows(R.events, '<td class="datec empty"></td><td></td>')}</tbody>
  </table>

  <div class="ws-h">Notes</div>
  <div class="ws-lines h6">${!blank && pv(wo.notes) ? `<div class="prefill">${esc(pv(wo.notes))}</div>` : ""}</div>

  <div class="ws-sign">
    <div class="ws-h">Release sign-off</div>
    <div class="ws-signgrid">
      <div class="ws-sigbox">
        <div class="role">Manufacturing engineer</div>
        <div class="who">${esc(blank ? "" : pv(wo.manufacturingEngineer))}&nbsp;</div>
        <div class="ws-sigrow"><div class="sigline"></div><div class="dateline"></div></div>
        <div class="ws-caps"><div class="c1 cap">Signature</div><div class="c2 cap">Date</div></div>
      </div>
      <div class="ws-sigbox">
        <div class="role">Composites lead / requesting subteam lead</div>
        <div class="who">&nbsp;</div>
        <div class="ws-sigrow"><div class="sigline"></div><div class="dateline"></div></div>
        <div class="ws-caps"><div class="c1 cap">Signature</div><div class="c2 cap">Date</div></div>
      </div>
    </div>
  </div>

  <div class="ws-foot">
    <span>${esc(blank ? "Blank traveler" : pv(wo.id))}${!blank && pv(wo.revision) ? " · Rev " + esc(pv(wo.revision)) : ""}</span>
    <span>${esc(pv(wo.partName))}</span>
    <span class="sp">Page <span class="pg"></span> of <span class="pg"></span></span>
  </div>
</div></div>`;
}

/* ---------- mounting + preview ---------- */

function printRoot() { return document.getElementById("printroot"); }

/* Render a sheet and hand off to the browser's print dialog. */
function mountSheet(html, previewMode) {
  const root = printRoot();
  if (!root) return null;
  // body.sheet is what tells @media print to print the sheet instead of the app.
  // Without it every other tab (status board, documents) would print blank.
  document.body.classList.add("sheet");
  root.innerHTML = (previewMode ? `
    <div class="pv-bar no-print">
      <span class="t">Print preview</span>
      <span>US Letter · this is exactly what prints</span>
      <span class="sp"></span>
      <label><input type="checkbox" onchange="toggleGrayProof(this.checked)"> B&amp;W proof</label>
      <button onclick="closePrintPreview()">Close</button>
      <button class="primary" onclick="window.print()">Print</button>
    </div>` : "") + html;
  root.className = previewMode ? "preview" : "";
  return root;
}
function toggleGrayProof(on) {
  const root = printRoot(); if (!root) return;
  root.className = "preview" + (on ? " gray" : "");
}
function closePrintPreview() {
  const root = printRoot(); if (!root) return;
  root.innerHTML = ""; root.className = "";
  document.body.classList.remove("previewing", "sheet");
}

/* ⌘P on a work order should produce the traveler, not a blank page or a
   screenshot of the app. If nothing is mounted and the user is looking at a WO,
   mount it for them; anything else prints the screen view as it always did. */
function autoMountForPrint() {
  if (document.body.classList.contains("sheet")) return;
  if (typeof view === "undefined" || view.tab !== "workorders" || view.mode !== "detail" || !view.id) return;
  const wo = typeof woById === "function" ? woById(view.id) : null;
  if (wo) mountSheet(woSheetHtml(wo), false);
}
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("beforeprint", autoMountForPrint);
  // Tear the sheet down after a direct (non-preview) print so the app isn't
  // left with a hidden document mounted behind it.
  window.addEventListener("afterprint", () => {
    const root = printRoot();
    if (root && !document.body.classList.contains("previewing")) {
      root.innerHTML = ""; root.className = "";
      document.body.classList.remove("sheet");
    }
  });
}

function woForPrint(id) {
  const wo = typeof woById === "function" ? woById(id) : recById("workOrders", id);
  if (!wo) { if (typeof toast === "function") toast("Work order " + id + " not found.", "error"); return null; }
  return wo;
}

/* Preview first rather than printing straight away: paper is the expensive step,
   and a bad pagination is only obvious once you can see the page. */
function openPrintPreview(id) {
  const wo = woForPrint(id); if (!wo) return;
  mountSheet(woSheetHtml(wo), true);
  document.body.classList.add("previewing");
  window.scrollTo(0, 0);
}
function printWO(id) {
  const wo = woForPrint(id); if (!wo) return;
  mountSheet(woSheetHtml(wo), false);
  window.print();
}
/* A stack of blanks to take to the shop. */
function printBlankWO(process) {
  const p = process || "MoldInfusion";
  mountSheet(woSheetHtml({ processType: p, steps: [], layupStack: [], bom: [], qualityChecks: [], timeline: [] }, { blank: true }), true);
  document.body.classList.add("previewing");
  window.scrollTo(0, 0);
}
