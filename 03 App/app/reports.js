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
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
const CSV_SPECS = {
  parts: { file: "parts", rows: () => DB.parts, cols: [["id", r => r.id], ["part", r => r.partName], ["subteam", r => r.subteam], ["layupType", r => r.layupType], ["cad", r => r.cadProgress], ["mold", r => r.moldProgress], ["layup", r => r.layupProgress], ["moldEngineer", r => r.moldEngineer], ["mfgEngineer", r => r.manufacturingEngineer], ["weightG", r => r.weightG], ["deadline", r => r.layupDeadline]] },
  workOrders: { file: "work-orders", rows: () => DB.workOrders, cols: [["id", r => r.id], ["part", r => r.partName], ["subteam", r => r.subteam], ["process", r => r.processType], ["status", r => r.status], ["moldEngineer", r => r.moldEngineer], ["mfgEngineer", r => r.manufacturingEngineer], ["due", r => r.dueDate]] },
  projects: { file: "projects", rows: () => DB.projects, cols: [["id", r => r.id], ["title", r => r.title], ["status", r => r.status], ["priority", r => r.priority], ["due", r => r.dueDate], ["assignees", r => (r.assignees || []).join("; ")]] },
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
    <button onclick="exportCSV('projects')">Projects</button>
    <button onclick="exportCSV('budget')">Budget</button>
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
