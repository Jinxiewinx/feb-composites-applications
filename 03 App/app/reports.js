"use strict";
/* reports.js — the Reports tab.
   CSV exports per dataset (for spreadsheets / advisor updates) and a printable
   Monday-meeting status board. Read-only; builds from the in-memory data. */

function toCSV(rows, cols) {
  const esc = v => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [cols.map(c => esc(c.label)).join(",")]
    .concat(rows.map(r => cols.map(c => esc(c.get(r))).join(",")))
    .join("\n");
}
function downloadCSV(name, csv) {
  downloadBlob(name, new Blob([csv], { type: "text/csv" }));
}
const CSV_SPECS = {
  parts: { file: "parts", rows: () => DB.parts, cols: [["id", r => r.id], ["part", r => r.partName], ["subteam", r => r.subteam], ["layupType", r => r.layupType], ["cad", r => r.cadProgress], ["mold", r => r.moldProgress], ["layup", r => r.layupProgress], ["moldEngineer", r => r.moldEngineer], ["mfgEngineer", r => r.manufacturingEngineer], ["weightG", r => r.weightG], ["deadline", r => r.layupDeadline]] },
  workOrders: { file: "work-orders", rows: () => DB.workOrders, cols: [["id", r => r.id], ["part", r => r.partName], ["subteam", r => r.subteam], ["process", r => r.processType], ["status", r => r.status], ["moldEngineer", r => r.moldEngineer], ["mfgEngineer", r => r.manufacturingEngineer], ["due", r => r.dueDate]] },
  projects: { file: "tickets", rows: () => DB.projects, cols: [["id", r => r.id], ["kind", r => ticketKind(r)], ["title", r => r.title], ["status", r => projStatus(r)], ["priority", r => r.priority], ["due", r => r.dueDate], ["assignees", r => (r.assignees || []).join("; ")]] },
  budget: { file: "budget", rows: () => DB.budget, cols: [["id", r => r.id], ["item", r => r.item], ["purchaser", r => r.purchaser], ["purpose", r => r.purpose], ["status", r => r.status], ["cost", r => r.cost], ["dateOrdered", r => r.dateOrdered]] },
};
function exportCSV(which) {
  const s = CSV_SPECS[which]; if (!s) return;
  const cols = s.cols.map(([label, get]) => ({ label, get }));
  downloadCSV(`feb-${s.file}-${today()}.csv`, toCSV(s.rows(), cols));
  toast(s.file + " CSV downloaded.");
}

function renderReports() {
  // Status board data
  const stages = ["Not Started", "In Layup", "Layup Complete", "Polished"];
  const partStage = {}; stages.forEach(s => partStage[s] = 0);
  DB.parts.forEach(p => { if (partStage[p.layupProgress] != null) partStage[p.layupProgress]++; else partStage["Not Started"]++; });
  const woInWork = DB.workOrders.filter(w => w.status === "InWork");
  const openBlockers = [];
  DB.workOrders.forEach(w => {
    if (w.retro) return;
    (w.steps || []).forEach(s => { if (typeof isBlocker === "function" && isBlocker(s) && !isSigned(s)) openBlockers.push({ wo: w, step: s }); });
  });
  const upcoming = (typeof deadlineItems === "function" ? deadlineItems() : [])
    .filter(i => !i.done && i.date && daysUntil(i.date) != null && daysUntil(i.date) >= 0 && daysUntil(i.date) <= 14)
    .sort((a, b) => a.date.localeCompare(b.date));
  const spend = DB.budget.reduce((s, b) => s + (parseFloat(String(b.cost).replace(/[^0-9.\-]/g, "")) || 0), 0);
  const openOrders = DB.budget.filter(b => b.status !== "Reimbursed").length;

  return `
  <div class="toolbar no-print">
    <b style="align-self:center">Export CSV:</b>
    <button onclick="exportCSV('parts')">Parts</button>
    <button onclick="exportCSV('workOrders')">Work Orders</button>
    <button onclick="exportCSV('projects')">Tickets</button>
    <button onclick="exportCSV('budget')">Budget</button>
    <button onclick="openLabelBuilder()">${icon("print", 15)} Labels</button>
    ${isLead() ? `<button onclick="rebuildScanMirror()" title="Re-publish the public scan nameplates for every physical record">Rebuild scan mirror</button>
    <button onclick="findMoldsInWorkOrders()" title="Turn the free-text mold names on work orders into real mold records">Find molds in work orders</button>
    <button onclick="backfillPartWorkOrderLinks()" title="Link each part to the work order with the same name">Link parts to work orders</button>` : ""}
    <button class="primary" style="margin-left:auto" onclick="window.print()">Print status board</button>
  </div>
  <div class="card">
    <h2>Weekly status board <span class="muted" style="font-size:13px">— ${today()}</span></h2>
    <h3>Parts by layup stage</h3>
    <div class="stagerow">${stages.map(s => `<span class="chip">${esc(s)}: <b>${partStage[s]}</b></span>`).join("")}</div>
    <h3>Work orders in progress (${woInWork.length})</h3>
    ${woInWork.length ? `<ul>${woInWork.map(w => `<li>${esc(w.id)} — ${esc(w.partName || "")} <span class="muted">(${esc(w.manufacturingEngineer || w.moldEngineer || "unassigned")})</span></li>`).join("")}</ul>` : '<p class="muted">None marked in-work.</p>'}
    <h3>Open blockers (${openBlockers.length})</h3>
    ${openBlockers.length ? `<ul>${openBlockers.map(b => `<li>${esc(b.wo.id)} — <b>${esc(b.step.title)}</b></li>`).join("")}</ul>` : '<p class="muted">No unsigned blockers on active work orders.</p>'}
    <h3>Deadlines in the next two weeks (${upcoming.length})</h3>
    ${upcoming.length ? `<ul>${upcoming.map(i => `<li>${esc(i.date)} — <b>${esc(i.label)}</b> <span class="muted">(${esc(i.kind)}${i.who ? ", " + esc(i.who) : ""})</span></li>`).join("")}</ul>` : '<p class="muted">Nothing due in the next two weeks.</p>'}
    <h3>Budget</h3>
    <p>Season spend <b>$${spend.toFixed(0)}</b> · ${openOrders} open purchase${openOrders === 1 ? "" : "s"}.</p>
  </div>`;
}

/* Rebuild every public scan nameplate.
 *
 * fb.save() mirrors a record into `pub` as it goes, but three cases slip past
 * that and there is no way to notice any of them from inside the app:
 *
 *   1. records that existed before labels were a feature — the whole SN5
 *      archive, and everything created in SN6 up to today;
 *   2. writes that never go through save(): fb.mutateField() (step buy-offs)
 *      and fb.appendTo() (comment and update logs) both write straight to the
 *      document;
 *   3. any window where the pub write was rejected — mid-rules-deploy, or an
 *      offline queue that was dropped. pubSync() only warns to the console on
 *      failure, deliberately, because a mirror failure must never surface as a
 *      save failure.
 *
 * So the mirror is allowed to drift, and this is the thing that pays for it.
 * Lead-only, because it writes once per physical record and there is no reason
 * for anyone else to run it.
 */
async function rebuildScanMirror() {
  if (!isLead()) return;
  if (typeof pubProjection !== "function") { toast("labels.js not loaded.", "error"); return; }

  const recs = [];
  for (const coll of ["molds", "workOrders", "parts", "stock", "items", "lots"]) {
    for (const o of DB[coll] || []) {
      const p = pubProjection(coll, o);
      if (p) recs.push(p);
    }
  }
  if (!recs.length) { toast("Nothing to publish yet."); return; }

  const ok = await confirmAsync(
    `Re-publish ${recs.length} public scan nameplate${recs.length === 1 ? "" : "s"}?\n\n` +
    `Each one carries only the ID, class, name, stage, location and work order — ` +
    `the same facts already printed on the physical label. No names, no layup stacks, no files.`,
    { ok: "Publish", danger: false });
  if (!ok) return;

  toast(`Publishing ${recs.length}…`);
  try {
    // publishPub, not importMany: importMany stamps updatedBy with an email,
    // which the /pub rules reject and which must never be published anyway.
    await fb.publishPub(recs);
    toast(`${recs.length} scan nameplate${recs.length === 1 ? "" : "s"} published.`);
  } catch (e) {
    toast("Couldn't publish: " + (e && e.message || e), "error");
  }
}
