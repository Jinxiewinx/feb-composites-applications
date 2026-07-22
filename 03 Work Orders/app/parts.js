"use strict";
/* parts.js — the Parts tab.
   The SN5 "Composites Part Tracker" reborn: the team tracks a part through
   three parallel stages (CAD → Mold → Layup), each its own progress enum, not
   one lifecycle status. Mirrors those columns. Light-links to its work order. */

const SUBTEAMS = ["AERO", "BERGO", "AUTO-MECH"];
const LAYUP_TYPES = ["MOLD INFUSION", "GLASS INFUSION", "MOLD WET LAY", "FOAM WRAPPED"];
// Ordered so the last value = fully done (drives the progress-pill color).
const STAGE_CAD = ["Not Started", "Part CAD Done", "Mold CAD/CAM Done"];
const STAGE_MOLD = ["N/A (Flat)", "Not Started", "Machining", "Machine Complete", "Sealed", "Ready For Layup"];
const STAGE_LAYUP = ["Not Started", "In Layup", "Layup Complete", "Polished"];

function partById(id) { return DB.parts.find(p => p.id === id); }
function savePart(p, field) { p = p || partById(view.id); if (p) save("parts", p, field); }

// Progress-pill class from a stage value's position in its enum.
function stageClass(val, enumArr) {
  if (val === "N/A (Flat)") return "st-na";
  const i = enumArr.indexOf(val);
  if (i <= 0) return "st-0";
  if (i >= enumArr.length - 1) return "st-done";
  return "st-mid";
}
function stagePill(val, enumArr) {
  val = val || enumArr[0];
  return `<span class="stage ${stageClass(val, enumArr)}">${esc(val)}</span>`;
}
// A part counts as "done" (not behind-schedule) once layup is complete.
function partDone(p) { return ["Layup Complete", "Polished"].includes(p.layupProgress); }

async function newPart() {
  const id = await allocId("parts");
  if (!id) return;
  const p = {
    id, partName: "", subteam: "AERO", layupType: "MOLD INFUSION",
    layupSchedule: "", moldLocation: "RFS", moldEngineer: "", manufacturingEngineer: "",
    cadProgress: "Not Started", moldProgress: "Not Started", layupProgress: "Not Started",
    weightG: "", layupDeadline: "", comments: "", workOrderId: "", layupStack: [], retro: false,
    createdBy: myEmail(),
  };
  DB.parts.push(p); savePart(p);
  view = { ...view, mode: "detail", id, edit: true }; render();
}
function delPart(id) {
  confirmModal("Delete " + id + " for everyone? Back up first if unsure.", () => {
    del("parts", id);
    DB.parts = DB.parts.filter(p => p.id !== id);
    view = { ...view, mode: "list", id: null }; render();
  });
}

function renderParts() {
  return view.mode === "detail" ? renderPartDetail() : renderPartList();
}

function renderPartList() {
  const D = DB.parts;
  const rows = D
    .filter(p => (!view.fSub || p.subteam === view.fSub))
    .filter(p => { const q = view.q.toLowerCase(); return !q || (p.partName || "").toLowerCase().includes(q) || p.id.toLowerCase().includes(q); })
    .sort((a, b) => (a.layupDeadline || "9999").localeCompare(b.layupDeadline || "9999") || a.id.localeCompare(b.id));
  return `
  <div class="toolbar no-print"><button class="primary" onclick="newPart()">+ New Part</button></div>
  <div class="filters no-print">
    <select onchange="view.fSub=this.value;render()">
      <option value="">All subteams</option>
      ${[...new Set([...SUBTEAMS, ...D.map(p => p.subteam)])].filter(Boolean).map(s => `<option ${view.fSub === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
    <input id="searchbox" placeholder="search part / id…" value="${esc(view.q)}" oninput="searchInput(this)">
    <span class="muted" style="align-self:center">${rows.length} of ${D.length} parts</span>
  </div>
  ${D.length === 0 ? `<div class="card">No parts yet. <b>New Part</b> to start${isLead() ? ", or <b>Load SN5 archive</b> for last season's tracker" : ""}.</div>` : ""}
  <table class="list">
    <tr><th>Part</th><th>Subteam</th><th>Type</th><th>CAD</th><th>Mold</th><th>Layup</th><th>ME / RE</th><th>Deadline</th></tr>
    ${rows.map(p => {
      const dd = daysUntil(p.layupDeadline), late = dd != null && dd < 0 && !partDone(p);
      return `<tr onclick="view={...view,mode:'detail',id:'${p.id}',edit:false};render()">
      <td><b>${esc(p.partName || p.id)}</b>${p.retro ? ' <span class="pill retro">retro</span>' : ""}</td>
      <td>${esc(p.subteam)}</td><td class="tny">${esc(p.layupType)}</td>
      <td>${stagePill(p.cadProgress, STAGE_CAD)}</td>
      <td>${stagePill(p.moldProgress, STAGE_MOLD)}</td>
      <td>${stagePill(p.layupProgress, STAGE_LAYUP)}</td>
      <td class="tny">${esc(p.moldEngineer || "—")} / ${esc(p.manufacturingEngineer || "—")}</td>
      <td class="${late ? "warn" : ""}">${esc(p.layupDeadline || "")}${late ? " ⚠" : ""}</td>
    </tr>`; }).join("")}
  </table>`;
}

function pfld(p, label, key, opts) {
  const v = p[key] ?? "";
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}</div></div>`;
  if (opts) return `<div class="f"><label>${label}</label><select onchange="updPart('${key}',this.value)">${opts.map(o => `<option ${v === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
  return `<div class="f"><label>${label}</label><input value="${esc(v)}" onchange="updPart('${key}',this.value)"></div>`;
}

function renderPartDetail() {
  const p = partById(view.id);
  if (!p) { view.mode = "list"; return renderPartList(); }
  const E = view.edit;
  const linkedWO = p.workOrderId ? recById("workOrders", p.workOrderId)
    : DB.workOrders.find(w => (w.partName || "").toUpperCase() === (p.partName || "").toUpperCase());
  const dd = daysUntil(p.layupDeadline);
  return `
  <div class="toolbar no-print">
    <button onclick="view={...view,mode:'list'};render()">← All parts</button>
    <button class="primary" onclick="view.edit=!view.edit;render()">${E ? "Done editing" : "Edit"}</button>
    ${E && isLead() ? `<button class="danger" onclick="delPart('${p.id}')">Delete</button>` : ""}
  </div>
  <div class="card">
    <h2>${esc(p.partName || "(unnamed part)")} ${p.retro ? '<span class="pill retro">retro record</span>' : ""}</h2>
    <div class="muted">${esc(p.id)}${linkedWO ? " · work order " + chip("workOrders", linkedWO.id, linkedWO.id) : ""}${p.layupDeadline ? " · layup deadline " + esc(p.layupDeadline) + (dd != null ? ` (${dd < 0 ? Math.abs(dd) + " days late" : dd + " days out"})` : "") : ""}${p.updatedAt ? " · saved " + fmtWhen(p.updatedAt) + " by " + esc(p.updatedBy || "?") : ""}</div>
    <h3>Progress</h3>
    <div class="grid">
      ${pfld(p, "CAD", "cadProgress", STAGE_CAD)}
      ${pfld(p, "Mold", "moldProgress", STAGE_MOLD)}
      ${pfld(p, "Layup", "layupProgress", STAGE_LAYUP)}
    </div>
    ${!E ? `<div class="stagerow">${stagePill(p.cadProgress, STAGE_CAD)} ${stagePill(p.moldProgress, STAGE_MOLD)} ${stagePill(p.layupProgress, STAGE_LAYUP)}</div>` : ""}
    <h3>Details</h3>
    <div class="grid">
      ${pfld(p, "Part name", "partName")}${pfld(p, "Subteam", "subteam", SUBTEAMS)}${pfld(p, "Layup type", "layupType", LAYUP_TYPES)}
      ${pfld(p, "Layup schedule (text note)", "layupSchedule")}${pfld(p, "Mold location", "moldLocation")}
      ${pfld(p, "Mold Engineer", "moldEngineer")}${pfld(p, "Manufacturing Engineer", "manufacturingEngineer")}
      ${pfld(p, "Target weight (g)", "weightG")}${pfld(p, "Layup deadline", "layupDeadline")}
      ${pfld(p, "Linked work order id", "workOrderId")}
    </div>
    <h3>Layup stack${linkedWO ? ` <span class="muted" style="text-transform:none">— synced with work order ${esc(linkedWO.id)}</span>` : ""}</h3>
    ${stackViz(p.layupStack)}
    ${E ? stackEditor("parts", p.id) : ""}
    <h3>Comments</h3>
    ${E ? `<textarea onchange="updPart('comments',this.value)">${esc(p.comments)}</textarea>` : `<div>${esc(p.comments) || '<span class="muted">—</span>'}</div>`}
  </div>`;
}

function updPart(key, val) { const p = partById(view.id); p[key] = val; savePart(p, key); if (["cadProgress", "moldProgress", "layupProgress", "layupDeadline"].includes(key)) render(); }
