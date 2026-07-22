"use strict";
/* workorders.js — the Work Orders tab.
   Same behavior as the original single-purpose app: list, detail, step
   buy-offs stamped with the signed-in user, blocker enforcement, printing.
   Now one tab among several; data goes through core's generic save()/del()
   into the workOrders collection. */

const WO_STATUSES = ["Draft", "Released", "InWork", "Complete", "OnHold"];
const PROCESSES = ["MoldInfusion", "GlassInfusion", "MoldWetLay", "FoamWrapped", "Other"];
const BLOCKER_WORDS = ["frozen", "design review", "drop test", "acceptance criterion"];

const STD_STEPS = {
  MoldInfusion: [
    ["Stack frozen (CS-002 §7.2)", "CS-002"], ["Mold design review (CS-003 §7.2)", "CS-003"],
    ["Glue mold stock (CS-003 §7.3)", "CS-003"], ["Machine mold (CS-005)", "CS-005"],
    ["Seal + release mold (CS-004)", "CS-004"], ["Dry stack + bag (CS-006 §7.2–7.3)", "CS-006"],
    ["Drop test ≤1 inHg/10 min (CS-006 §7.4)", "CS-006"], ["Infuse (CS-006 §7.5)", "CS-006"],
    ["Cure + demould (CS-006 §7.6)", "CS-006"], ["Trim + finish (CS-009)", "CS-009"]],
  GlassInfusion: [
    ["Stack frozen (CS-002 §7.2)", "CS-002"], ["Prepare plate + release (CS-004)", "CS-004"],
    ["Dry stack + bag (CS-006 §7.2–7.3)", "CS-006"], ["Drop test ≤1 inHg/10 min (CS-006 §7.4)", "CS-006"],
    ["Infuse (CS-006 §7.5)", "CS-006"], ["Cure + demould (CS-006 §7.6)", "CS-006"],
    ["Cut to DXF — confirm rev (CS-009)", "CS-009"], ["Finish (CS-009)", "CS-009"]],
  MoldWetLay: [
    ["Stack frozen (CS-002 §7.2)", "CS-002"], ["Mold design review (CS-003 §7.2)", "CS-003"],
    ["Glue + machine mold (CS-003/005)", "CS-003"], ["Seal + release mold (CS-004)", "CS-004"],
    ["Wet layup + bag (CS-007)", "CS-007"], ["Cure + demould (CS-007)", "CS-007"],
    ["Trim + finish (CS-009)", "CS-009"]],
  FoamWrapped: [
    ["Stack frozen (CS-002 §7.2)", "CS-002"], ["Shape foam core (CS-003)", "CS-003"],
    ["Wet layup over core (CS-007 §7.6)", "CS-007"], ["Cure (CS-007)", "CS-007"],
    ["Trim + finish (CS-009)", "CS-009"]],
  Other: [["Define acceptance criterion (CS-010 §7.1 pattern: target + method BEFORE work)", "CS-010"],
          ["Execute", "CS-013"], ["Verify against criterion", "CS-013"]],
};

function woById(id) { return DB.workOrders.find(w => w.id === id); }
function saveWO(w, field) { w = w || woById(view.id); if (w) save("workOrders", w, field); }

async function newWO() {
  const id = await allocId("workOrders");
  if (!id) return;
  const wo = {
    id, partName: "", subteam: "AERO", revision: "A", status: "Draft",
    processType: "MoldInfusion", moldEngineer: "", manufacturingEngineer: "",
    createdDate: today(), dueDate: "", partId: "",
    mold: { moldId: "", layers: "", density: "", sealingType: "XCR (CS-004)", location: "" },
    layupStack: [], stackNote: "", bom: [], standardsRefs: [],
    steps: STD_STEPS.MoldInfusion.map((s, i) => ({ seq: i + 1, title: s[0], csRef: s[1], status: "open", buyoff: { name: "", date: "" }, notes: "", photoRefs: [] })),
    qualityChecks: [{ criterion: "mass", target: "", actual: "", pass: null }],
    weightTargetG: null, weightActualG: null, timeline: [], notes: "", retro: false,
    createdBy: myEmail(),
  };
  DB.workOrders.push(wo); saveWO(wo);
  view = { ...view, mode: "detail", id, edit: true }; render();
}

// Lead-only: this erases every recorded buy-off on the WO, for the whole team.
function resetSteps(wo) {
  if (!isLead()) { toast("Resetting steps wipes recorded buy-offs, so it's lead-only. Ask the lead.", "error"); return; }
  const signed = (wo.steps || []).filter(isSigned).length;
  confirmModal("Replace steps with the standard list for " + wo.processType + "?" +
    (signed ? " This ERASES " + signed + " recorded buy-off(s) from the team database — there is no undo." : ""), () => {
    wo.steps = (STD_STEPS[wo.processType] || STD_STEPS.Other).map((s, i) =>
      ({ seq: i + 1, title: s[0], csRef: s[1], status: "open", buyoff: { name: "", date: "" }, notes: "", photoRefs: [] }));
    saveWO(wo, "steps"); render();
  });
}

function delWO(id) {
  confirmModal("Delete " + id + " from the team database for everyone? Back up first if unsure.", () => {
    del("workOrders", id);
    DB.workOrders = DB.workOrders.filter(w => w.id !== id);
    view = { ...view, mode: "list", id: null }; render();
  });
}

function isBlocker(step) { const t = step.title.toLowerCase(); return BLOCKER_WORDS.some(g => t.includes(g)); }
function isSigned(s) { return !!(s.buyoff && s.buyoff.name && !/not recorded/i.test(s.buyoff.name)); }
function stepState(s) {
  const st = (s.status || "").toLowerCase();
  if (st.includes("fail") || st.includes("skip")) return "failed";
  if (isSigned(s) || st.startsWith("done")) return "done";
  return "open";
}
function blockerOpenBefore(wo, idx) {
  if (wo.retro) return null; // historical records: blockers are documentation, not enforcement
  for (let i = 0; i < idx; i++) {
    const s = wo.steps[i];
    if (isBlocker(s) && !isSigned(s)) return wo.steps[i];
  }
  return null;
}
function renderWorkOrders() {
  return view.mode === "detail" ? renderWODetail() : renderWOList();
}

function renderWOList() {
  const D = DB.workOrders;
  const rows = D
    .filter(w => (!view.fStatus || w.status === view.fStatus))
    .filter(w => (!view.fSub || w.subteam === view.fSub))
    .filter(w => { const q = view.q.toLowerCase(); return !q || w.id.toLowerCase().includes(q) || (w.partName || "").toLowerCase().includes(q); })
    .sort((a, b) => a.id.localeCompare(b.id));
  const subs = [...new Set(D.map(w => w.subteam))].sort();
  return `
  <div class="toolbar no-print">
    <button class="primary" onclick="newWO()">+ New Work Order</button>
    <button onclick="printBlankWO(document.getElementById('blankproc').value)">Print blank traveler</button>
    <select id="blankproc" title="process for the blank form">${PROCESSES.map(p => `<option>${p}</option>`).join("")}</select>
  </div>
  <div class="filters no-print">
    <select onchange="view.fStatus=this.value;render()">
      <option value="">All statuses</option>
      ${WO_STATUSES.map(s => `<option ${view.fStatus === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
    <select onchange="view.fSub=this.value;render()">
      <option value="">All subteams</option>
      ${subs.map(s => `<option ${view.fSub === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
    <input id="searchbox" placeholder="search id / part…" value="${esc(view.q)}" oninput="searchInput(this)">
    <span class="muted" style="align-self:center">${rows.length} of ${D.length} work orders</span>
  </div>
  ${D.length === 0 ? `<div class="card">No work orders yet. <b>New Work Order</b> to start${isLead() ? ", or <b>Load SN5 archive</b> for the retro records" : ""}.</div>` : ""}
  <table class="list">
    <tr><th>ID</th><th>Part</th><th>Subteam</th><th>Process</th><th>ME / RE</th><th>Due</th><th>Status</th></tr>
    ${rows.map(w => `<tr onclick="view={...view,mode:'detail',id:'${w.id}',edit:false};render()">
      <td><b>${esc(w.id)}</b>${w.retro ? ' <span class="pill retro">retro</span>' : ""}</td>
      <td>${esc(w.partName)}</td><td>${esc(w.subteam)}</td><td>${esc(w.processType)}</td>
      <td>${esc(w.moldEngineer || "—")} / ${esc(w.manufacturingEngineer || "—")}</td>
      <td>${esc(w.dueDate || "")}</td><td><span class="pill ${esc(w.status)}">${esc(w.status)}</span></td>
    </tr>`).join("")}
  </table>`;
}

function fld(wo, label, key, type) {
  const v = wo[key] ?? "";
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}</div></div>`;
  if (type === "select-status") return `<div class="f"><label>${label}</label><select onchange="updWO('${key}',this.value)">${WO_STATUSES.map(s => `<option ${v === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>`;
  if (type === "select-process") return `<div class="f"><label>${label}</label><select onchange="updWO('${key}',this.value)">${PROCESSES.map(s => `<option ${v === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>`;
  return `<div class="f"><label>${label}</label><input value="${esc(v)}" onchange="updWO('${key}',this.value)"></div>`;
}

function renderWODetail() {
  const wo = woById(view.id);
  if (!wo) { view.mode = "list"; return renderWOList(); }
  const E = view.edit;
  // Light link: this WO's part in the Parts tab (by explicit partId or name match).
  const linkedPart = wo.partId ? recById("parts", wo.partId)
    : DB.parts.find(p => (p.partName || "").toUpperCase() === (wo.partName || "").toUpperCase());
  const moldRows = wo.mold ? `
    <h3>Mold</h3><div class="grid">
      ${mf(wo, "Mold ID", "moldId")}${mf(wo, "Layers", "layers")}${mf(wo, "Density (lb/ft³)", "density")}
      ${mf(wo, "Sealing", "sealingType")}${mf(wo, "Location (live — update on every move)", "location")}
    </div>` : "";
  return `
  <div class="toolbar no-print">
    <button onclick="view={...view,mode:'list'};render()">← All work orders</button>
    <button class="primary" onclick="view.edit=!view.edit;render()">${E ? "Done editing" : "Edit"}</button>
    <button onclick="openPrintPreview('${wo.id}')">Print</button>
    ${E && isLead() ? `<button onclick="resetSteps(woById('${wo.id}'))">Reset steps to standard</button>
    <button class="danger" onclick="delWO('${wo.id}')">Delete</button>` : ""}
  </div>
  <div class="card">
    <h2>${esc(wo.id)} — ${esc(wo.partName || "(unnamed)")} ${wo.retro ? '<span class="pill retro">retro record</span>' : ""}</h2>
    <div class="muted">Rev ${esc(wo.revision)} · <span class="pill ${esc(wo.status)}">${esc(wo.status)}</span>${linkedPart ? " · part " + chip("parts", linkedPart.id, linkedPart.id) : ""}${wo.updatedAt ? ` · last saved ${fmtWhen(wo.updatedAt)} by ${esc(wo.updatedBy || "?")}` : ""}</div>
    <h3>Overview</h3>
    <div class="grid">
      ${fld(wo, "Part name", "partName")}${fld(wo, "Subteam", "subteam")}${fld(wo, "Status", "status", "select-status")}
      ${fld(wo, "Process", "processType", "select-process")}${fld(wo, "Mold Engineer", "moldEngineer")}
      ${fld(wo, "Manufacturing Engineer", "manufacturingEngineer")}${fld(wo, "Created", "createdDate")}${fld(wo, "Due", "dueDate")}
      ${fld(wo, "Revision", "revision")}${fld(wo, "Mass target (g)", "weightTargetG")}${fld(wo, "Mass actual (g)", "weightActualG")}
    </div>
    ${moldRows}
    <h3>Layup stack (CS-002)${linkedPart ? ` <span class="muted" style="text-transform:none">— synced with part ${esc(linkedPart.id)}</span>` : ""} ${wo.stackNote ? `<span class="muted" style="text-transform:none">— ${esc(wo.stackNote)}</span>` : ""}</h3>
    ${stackViz(wo.layupStack)}
    ${E ? stackEditor("workOrders", wo.id) : ""}
    <h3>BOM</h3>
    <table class="sub"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Source</th><th>Est. cost</th></tr></thead><tbody>
      ${(wo.bom || []).map((b, i) => E
        ? `<tr><td><input value="${esc(b.item)}" onchange="ub(${i},'item',this.value)"></td><td><input value="${esc(b.qty)}" onchange="ub(${i},'qty',this.value)"></td><td><input value="${esc(b.unit)}" onchange="ub(${i},'unit',this.value)"></td><td><input value="${esc(b.source)}" onchange="ub(${i},'source',this.value)"></td><td><input value="${esc(b.estCost)}" onchange="ub(${i},'estCost',this.value)"></td></tr>`
        : `<tr><td>${esc(b.item)}</td><td>${esc(b.qty)}</td><td>${esc(b.unit)}</td><td>${esc(b.source)}</td><td>${esc(b.estCost)}</td></tr>`).join("")}
    </tbody></table>
    ${E ? `<button onclick="woById('${wo.id}').bom.push({item:'',qty:'',unit:'',source:'',estCost:''});saveWO(woById('${wo.id}'),'bom');render()">+ BOM line</button>` : ""}
    <h3>Steps & buy-offs (blockers shaded — no sign-off, no moving on)</h3>
    ${(wo.steps || []).map((s, i) => {
      const blocker = isBlocker(s);
      const state = stepState(s);
      const blocked = blockerOpenBefore(wo, i);
      return `<div class="step ${blocker ? "blocker" : ""} ${state === "done" ? "done" : ""} ${state === "failed" ? "failed" : ""}">
        <div class="num">${s.seq}</div>
        <div class="body">
          <div>${esc(s.title)} <span class="muted">[${esc(s.csRef || "")}]</span> ${blocker ? "<b>· BLOCKER</b>" : ""}</div>
          ${s.notes ? `<div class="meta">${esc(s.notes)}</div>` : ""}
          ${E ? `<div class="meta no-print"><input style="width:90%" placeholder="notes / photo filenames" value="${esc(s.notes)}" onchange="us(${i},'notes',this.value)"></div>` : ""}
          ${(s.photoRefs || []).length ? `<div class="meta">photos: ${s.photoRefs.map(p => esc(p.filename || p)).join(", ")}</div>` : ""}
        </div>
        <div class="buyoff">
          ${state === "failed"
            ? `<span class="warn">✗ ${esc(s.status)}</span>`
            : state === "done"
              ? (isSigned(s)
                ? `<span class="ok">✔ ${esc(s.buyoff.name)} ${esc(s.buyoff.date || "")}</span>`
                : `<span class="muted">done — buy-off not recorded (retro)</span>`)
              : (wo.retro ? `<span class="muted">${esc(s.status || "open")}</span>`
                : `<button onclick="buyoff(${i})" ${blocked ? "disabled title='blocked by unfinished blocker: " + esc(blocked.title) + "'" : ""}>buy off as ${esc(signerName())}</button>`)}
        </div>
      </div>`;
    }).join("")}
    <h3>Quality checks / acceptance criteria</h3>
    <table class="sub"><thead><tr><th>Criterion</th><th>Target (set at creation!)</th><th>Actual</th><th>Pass</th></tr></thead><tbody>
      ${(wo.qualityChecks || []).map((q, i) => E
        ? `<tr><td><input value="${esc(q.criterion)}" onchange="uq(${i},'criterion',this.value)"></td><td><input value="${esc(q.target)}" onchange="uq(${i},'target',this.value)"></td><td><input value="${esc(q.actual)}" onchange="uq(${i},'actual',this.value)"></td><td><select onchange="uq(${i},'pass',this.value==='true'?true:this.value==='false'?false:null)"><option ${q.pass == null ? "selected" : ""}>—</option><option value="true" ${q.pass === true ? "selected" : ""}>pass</option><option value="false" ${q.pass === false ? "selected" : ""}>FAIL</option></select></td></tr>`
        : `<tr><td>${esc(q.criterion)}</td><td>${esc(q.target)}</td><td>${esc(q.actual)}</td><td>${q.pass === true ? '<span class="ok">pass</span>' : q.pass === false ? '<span class="warn">FAIL</span>' : "—"}</td></tr>`).join("")}
    </tbody></table>
    ${E ? `<button onclick="woById('${wo.id}').qualityChecks.push({criterion:'',target:'',actual:'',pass:null});saveWO(woById('${wo.id}'),'qualityChecks');render()">+ check</button>` : ""}
    <h3>Event log</h3>
    <table class="sub"><thead><tr><th style="width:110px">Date</th><th>Event</th></tr></thead><tbody>
      ${(wo.timeline || []).map((t, i) => E
        ? `<tr><td><input value="${esc(t.date)}" onchange="ut(${i},'date',this.value)"></td><td><input value="${esc(t.note)}" onchange="ut(${i},'note',this.value)"></td></tr>`
        : `<tr><td>${esc(t.date)}</td><td>${esc(t.note)}</td></tr>`).join("")}
    </tbody></table>
    ${E ? `<button onclick="woById('${wo.id}').timeline.push({date:'',note:''});saveWO(woById('${wo.id}'),'timeline');render()">+ event</button>` : ""}
    <h3>Notes</h3>
    ${E ? `<textarea onchange="updWO('notes',this.value)">${esc(wo.notes)}</textarea>` : `<div>${esc(wo.notes) || '<span class="muted">—</span>'}</div>`}
  </div>`;
}

/* field update helpers (operate on current WO; each saves only its field) */
function updWO(key, val) { const w = woById(view.id); w[key] = val; saveWO(w, key); }
function mf(wo, label, key) {
  const v = (wo.mold || {})[key] ?? "";
  return view.edit
    ? `<div class="f"><label>${label}</label><input value="${esc(v)}" onchange="woById(view.id).mold['${key}']=this.value;saveWO(woById(view.id),'mold')"></div>`
    : `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}</div></div>`;
}
function ub(i, k, v) { woById(view.id).bom[i][k] = v; saveWO(woById(view.id), "bom"); }
function uq(i, k, v) { woById(view.id).qualityChecks[i][k] = v; saveWO(woById(view.id), "qualityChecks"); render(); }
function ut(i, k, v) { woById(view.id).timeline[i][k] = v; saveWO(woById(view.id), "timeline"); }
function us(i, k, v) { const w = woById(view.id); w.steps[i][k] = v; saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], [k]: v }; return steps; }); }
function buyoff(i) {
  const w = woById(view.id);
  const blocked = blockerOpenBefore(w, i);
  if (blocked) { toast("Blocked by unfinished blocker: " + blocked.title, "error"); return; }
  // CS-013: a design review signed by whoever made the thing isn't a review.
  if (w.steps[i].title.toLowerCase().includes("design review") && myEmail() &&
      myEmail() === w.createdBy &&
      !confirm("You created this WO — a design review should be bought off by someone else (CS-013). Sign it anyway?")) return;
  const bo = {
    name: signerName(), email: fb.user.email, uid: fb.user.uid,
    date: today(), time: new Date().toISOString(),
  };
  w.steps[i].buyoff = bo; w.steps[i].status = "done"; // optimistic local
  // Concurrency-safe: re-apply just this step on fresh server data so a
  // teammate buying off a different step at the same moment can't erase it.
  saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], buyoff: bo, status: "done" }; return steps; });
  render();
}
