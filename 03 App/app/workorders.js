"use strict";
/* workorders.js — the Work Orders tab.
   Same behavior as the original single-purpose app: list, detail, step
   buy-offs stamped with the signed-in user, blocker enforcement, printing.
   Now one tab among several; data goes through core's generic save()/del()
   into the workOrders collection. */

const WO_STATUSES = ["Draft", "Released", "InWork", "Complete", "OnHold"];
const PROCESSES = ["MoldInfusion", "GlassInfusion", "MoldWetLay", "FoamWrapped", "Other"];
const BLOCKER_WORDS = ["frozen", "design review", "drop test", "acceptance criterion"];

/* Step titles are what someone reads at the bench with gloves on, so they stay
   short and plain. Standard numbers used to be baked into every title; they made
   the printed sheet dense and hard to scan, and the standards themselves live in
   the Documents tab.

   The second slot on each entry is the step's RULE — what the app enforces
   about it. It was a vestigial one-element array left over from when the CS ref
   lived there; the rule goes in an object instead of back into the title, and
   tools/test_app.mjs asserts no title ever contains "CS-" again.

     { kind: "blocker" }             nobody signs a later step until this is signed
     { kind: "hold", from: "resin" } a wait, as long as the recorded resin needs
     { kind: "hold", hours: 4 }      a wait of a fixed length (nothing uses this
                                     yet; Ure-Bond's 4 h clamp is the next one)

   BLOCKER_WORDS still matches on titles as well, and has to: the 26 retro work
   orders and every record already in Firestore predate the rule field, so
   title-matching is the only thing enforcing on them. New templates carry both
   and the two agree. */
const STD_STEPS = {
  MoldInfusion: [
    ["Stack frozen", { kind: "blocker" }], ["Mold design review", { kind: "blocker" }],
    ["Glue mold stock"], ["Machine mold"],
    ["Seal and release mold"], ["Dry stack and bag"],
    ["Drop test, 1 inHg or less over 10 min", { kind: "blocker" }], ["Infuse", { kind: "startsHold" }],
    ["Cure and demould", { kind: "hold", from: "resin" }], ["Trim and finish"]],
  GlassInfusion: [
    ["Stack frozen", { kind: "blocker" }], ["Prepare plate and release"],
    ["Dry stack and bag"], ["Drop test, 1 inHg or less over 10 min", { kind: "blocker" }],
    ["Infuse", { kind: "startsHold" }], ["Cure and demould", { kind: "hold", from: "resin" }],
    ["Cut to DXF, confirm revision"], ["Finish"]],
  MoldWetLay: [
    ["Stack frozen", { kind: "blocker" }], ["Mold design review", { kind: "blocker" }],
    ["Glue and machine mold"], ["Seal and release mold"],
    ["Wet layup and bag", { kind: "startsHold" }], ["Cure and demould", { kind: "hold", from: "resin" }],
    ["Trim and finish"]],
  FoamWrapped: [
    ["Stack frozen", { kind: "blocker" }], ["Shape foam core"],
    ["Wet layup over core", { kind: "startsHold" }], ["Cure", { kind: "hold", from: "resin" }],
    ["Trim and finish"]],
  Other: [["Define acceptance criterion: target and method, set before work starts", { kind: "blocker" }],
          ["Execute"], ["Verify against criterion"]],
};
// One place that turns a template row into a stored step, so newWO() and
// resetSteps() can't drift apart on what a fresh step looks like.
function stepFromTemplate(row, i) {
  const s = { seq: i + 1, title: row[0], status: "open", buyoff: { name: "", date: "" }, notes: "", photoRefs: [] };
  if (row[1]) s.rule = row[1];
  return s;
}

/* Retro work orders and anything already saved carry standard numbers, both in
   step titles ("Stack frozen (CS-002 §7.2)") and loose in notes and event-log
   text. Strip them at render time so legacy records read like new ones without
   rewriting stored data. Applied to every free-text field that reaches paper. */
function stripCS(s) {
  return String(s || "")
    // whole parenthesised or bracketed reference, including any section number
    .replace(/\s*[([]\s*CS-\d+[^)\]]*[)\]]/g, "")
    // bare reference mid-sentence, with an optional § clause after it
    .replace(/\s*\bCS-\d+(?:\s*§\s*[\d.–—-]+)?/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function woById(id) { return DB.workOrders.find(w => w.id === id); }
function saveWO(w, field) { w = w || woById(view.id); if (w) save("workOrders", w, field); }

async function newWO() {
  const id = await allocId("workOrders");
  if (!id) return;
  const wo = {
    id, partName: "", subteam: "AERO", revision: "A", status: "Draft",
    processType: "MoldInfusion", moldEngineer: "", manufacturingEngineer: "",
    createdDate: today(), dueDate: "", partId: "",
    mold: { moldId: "", layers: "", density: "", sealingType: "XCR", location: "" },
    layupStack: [], stackNote: "", bom: [], standardsRefs: [],
    steps: STD_STEPS.MoldInfusion.map(stepFromTemplate),
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
    (signed ? " This erases " + signed + " recorded buy-off(s) from the team database. There is no undo." : ""), () => {
    wo.steps = (STD_STEPS[wo.processType] || STD_STEPS.Other).map(stepFromTemplate);
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

/* Two ways to be a blocker, and both have to keep working. The rule field is
   how new templates say it. The title match is how every record already saved
   says it, including all 26 retro work orders — those predate the field, so
   dropping the title path would silently stop enforcing on the entire existing
   database. */
function stepRule(s) { return (s && s.rule) || null; }
function isBlocker(step) {
  if (stepRule(step) && step.rule.kind === "blocker") return true;
  const t = String(step.title || "").toLowerCase();
  return BLOCKER_WORDS.some(g => t.includes(g));
}
function isHoldStep(s) { return !!(stepRule(s) && s.rule.kind === "hold"); }
function startsHold(s) { return !!(stepRule(s) && s.rule.kind === "startsHold"); }

/* ---------- cure holds ----------
   A hold step waits on the clock started by the step before it. That is a
   deliberate non-generalisation: in all four templates the cure directly
   follows the thing that starts it (Infuse, Wet layup and bag, Wet layup over
   core), so a `dependsOn` graph would be four pointers all saying "the previous
   one". If a template ever needs to skip a step, this is where to add it.

   Returns null when there is nothing to enforce, which covers: not a hold step,
   a retro record, and a hold whose clock was never started (nobody has signed
   the step before it, so the existing blocker/sequence rules are what stop you
   — not this). */
function holdState(wo, idx) {
  const s = (wo.steps || [])[idx];
  if (!s || !isHoldStep(s)) return null;
  if (wo.retro) return null; // historical records document, they don't enforce
  const prev = (wo.steps || [])[idx - 1];
  const cure = prev && prev.cure;
  if (!cure || !cure.startedAt) return null;
  const resin = resinById(cure.resin);
  const hours = resinHoldHours(cure.resin);
  if (!(hours > 0)) return null; // unknown resin: nothing defensible to enforce
  const left = msLeft(cure.startedAt, hours);
  return {
    resin, resinId: cure.resin, hours,
    startedAt: cure.startedAt, tempC: cure.tempC ?? null,
    readyAt: fmtReadyAt(cure.startedAt, hours),
    msLeft: left, ready: left == null || left <= 0,
    overridden: !!s.holdOverride, override: s.holdOverride || null,
  };
}
// Is the shop colder than the temperature this hold's number is quoted at?
// Reported, never used to change the number — see the plan and CS-008 §7.5.
function holdIsCold(h) {
  return !!(h && h.tempC != null && h.resin && h.tempC < h.resin.refTempC);
}

/* The waiting notice. Amber `.gate` with ⚠, not the red `.gate.blocked`: the
   app's glyph convention is ! advisory, ⚠ can't-yet, ✕ hard blocked, and a cure
   that hasn't finished is the process working, not something gone wrong.

   No standard reference and no datasheet figure in here on purpose. Every step
   row carrying a citation is what made the old sheet unreadable; the numbers
   and the PDF are one tap away behind "why". */
function holdBanner(h, i) {
  const cold = holdIsCold(h);
  return `<p class="gate"><span class="gi">⚠</span><span>
    Curing until <b>${esc(h.readyAt)}</b> · ${esc(fmtLeft(h.msLeft))}<br>
    ${h.resin ? esc(h.resin.label) : "resin not recorded"}${h.tempC != null ? ` · ${esc(String(h.tempC))} °C` : ""}
    ${cold ? `<br>Colder than this number assumes, so it will run long. Test the flange, not the clock.` : ""}
    ${h.resin ? ` <button class="link no-print" onclick="openWhyHold(${i})">why ${h.resin.febHoldH} h?</button>` : ""}
  </span></p>`;
}
// One line on the step that started the clock, so the record reads back without
// opening anything: what was mixed, when, and how cold the shop was.
function cureSummary(c) {
  const r = resinById(c.resin);
  return (r ? r.label : c.resin || "resin not recorded")
    + " · finished " + fmtWhen(c.startedAt)
    + (c.tempC != null ? " · " + c.tempC + " °C" : "");
}

/* A countdown painted once is wrong a minute later, and a work order left open
   on the bench laptop is the normal case. One interval, armed only while a hold
   banner is actually on screen, and it stops itself the moment one isn't.
   Guarded for the DOM stub in tools/test_app.mjs, same idiom as core.js's
   syncChromeMetrics(). */
let HOLD_TICK = null;
function syncHoldTick() {
  if (typeof document.querySelector !== "function" || typeof setInterval !== "function") return;
  const live = !!document.querySelector("#main .step .gate");
  if (live && !HOLD_TICK) HOLD_TICK = setInterval(() => render(), 60000);
  else if (!live && HOLD_TICK) { clearInterval(HOLD_TICK); HOLD_TICK = null; }
}
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
// Issues required-linked to this WO (workOrderId, not the informational
// relatedWorkOrders list) — same in-memory filter every other tab uses, no
// Firestore query/index needed. isIssue()/projStatus() live in projects.js;
// script load order doesn't matter here since these only run at call time,
// well after every classic script has finished loading.
function issuesForWO(woId) { return (DB.projects || []).filter(p => isIssue(p) && p.workOrderId === woId); }
// Cancelled issues need no disposition — they turned out not to be real.
function undisposedIssuesForWO(woId) { return issuesForWO(woId).filter(p => projStatus(p) !== "Cancelled" && !p.resolutionMethod); }
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
      ${mf(wo, "Sealing", "sealingType")}${mf(wo, "Location (update on every move)", "location")}
    </div>` : "";
  const issues = issuesForWO(wo.id);
  const undisposed = undisposedIssuesForWO(wo.id);
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="view={...view,mode:'list'};render()">${icon("chevronLeft",16)} All work orders</button>
    <button class="primary" onclick="view.edit=!view.edit;render()">${E ? "Done editing" : "Edit"}</button>
    <button onclick="openPrintPreview('${wo.id}')">Print</button>
    <button onclick="createIssueFromWO('${wo.id}')">⚠ Create issue</button>
    ${E && isLead() ? `<button onclick="resetSteps(woById('${wo.id}'))">Reset steps to standard</button>
    <button class="danger" onclick="delWO('${wo.id}')">Delete</button>` : ""}
  </div>
  <!-- Buying off a step is the bench action, and it sits below Overview, Mold,
       Layup stack and BOM — a long scroll on a phone with gloves on. Plain
       anchors, so no state and nothing to keep in sync. -->
  <nav class="jumpbar no-print" aria-label="Jump to section">
    <a href="#wo-overview">Overview</a><a href="#wo-stack">Stack</a><a href="#wo-bom">BOM</a>
    <a href="#wo-steps"><b>Steps</b></a><a href="#wo-quality">Quality</a><a href="#wo-docs">Docs</a><a href="#wo-log">Log</a>
  </nav>
  <div class="card">
    <h2>${esc(wo.id)} · ${esc(wo.partName || "(unnamed)")} ${wo.retro ? '<span class="pill retro">retro record</span>' : ""}</h2>
    <div class="muted">Rev ${esc(wo.revision)} · <span class="pill ${esc(wo.status)}">${esc(wo.status)}</span>${linkedPart ? " · part " + chip("parts", linkedPart.id, linkedPart.id) : ""}${wo.updatedAt ? ` · last saved ${fmtWhen(wo.updatedAt)} by ${esc(wo.updatedBy || "?")}` : ""}</div>
    ${undisposed.length ? `<div class="gate blocked"><span class="gi">✕</span><div><b>Can't complete this work order</b> — ${undisposed.length} linked issue${undisposed.length > 1 ? "s" : ""} (${undisposed.map(i => chip("projects", i.id, i.id)).join(", ")}) isn't disposed yet. You don't have to resolve ${undisposed.length > 1 ? "them" : "it"} right now, but ${undisposed.length > 1 ? "they need" : "it needs"} a resolution method before this WO can close.</div></div>` : ""}
    ${issues.length ? `
    <h3>Issues</h3>
    <div class="stagerow">${issues.map(i => chip("projects", i.id, (i.resolutionMethod ? "✓ " : "") + (i.title || i.id))).join(" ")}</div>
    ` : ""}
    <h3 id="wo-overview">Overview</h3>
    <div class="grid">
      ${fld(wo, "Part name", "partName")}${fld(wo, "Subteam", "subteam")}${fld(wo, "Status", "status", "select-status")}
      ${fld(wo, "Process", "processType", "select-process")}${fld(wo, "Mold Engineer", "moldEngineer")}
      ${fld(wo, "Manufacturing Engineer", "manufacturingEngineer")}${fld(wo, "Created", "createdDate")}${fld(wo, "Due", "dueDate")}
      ${fld(wo, "Revision", "revision")}${fld(wo, "Mass target (g)", "weightTargetG")}${fld(wo, "Mass actual (g)", "weightActualG")}
    </div>
    ${moldRows}
    <h3 id="wo-stack">Layup stack${linkedPart ? ` <span class="muted" style="text-transform:none">· synced with part ${esc(linkedPart.id)}</span>` : ""} ${wo.stackNote ? `<span class="muted" style="text-transform:none">· ${esc(wo.stackNote)}</span>` : ""}</h3>
    ${stackViz(wo.layupStack)}
    ${E ? stackEditor("workOrders", wo.id) : ""}
    <h3 id="wo-bom">BOM</h3>
    <table class="sub"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Source</th><th>Est. cost</th></tr></thead><tbody>
      ${(wo.bom || []).map((b, i) => E
        ? `<tr><td><input value="${esc(b.item)}" onchange="ub(${i},'item',this.value)"></td><td><input value="${esc(b.qty)}" onchange="ub(${i},'qty',this.value)"></td><td><input value="${esc(b.unit)}" onchange="ub(${i},'unit',this.value)"></td><td><input value="${esc(b.source)}" onchange="ub(${i},'source',this.value)"></td><td><input value="${esc(b.estCost)}" onchange="ub(${i},'estCost',this.value)"></td></tr>`
        : `<tr><td>${esc(b.item)}</td><td>${esc(b.qty)}</td><td>${esc(b.unit)}</td><td>${esc(b.source)}</td><td>${esc(b.estCost)}</td></tr>`).join("")}
    </tbody></table>
    ${E ? `<button onclick="woById('${wo.id}').bom.push({item:'',qty:'',unit:'',source:'',estCost:''});saveWO(woById('${wo.id}'),'bom');render()">+ BOM line</button>` : ""}
    <h3 id="wo-steps">Steps and buy-offs (shaded: no sign-off, no moving on. A hold waits on the clock instead)</h3>
    ${(() => {
      // The first not-done, not-failed step is the one to act on right now —
      // computed from existing state (open/done/failed), not a new status
      // value: a real "in progress" status would ripple into printing,
      // CS-013, and the retro-WO convention, well beyond a styling pass.
      // Retro records are historical, nothing on them is "next".
      const nextIdx = wo.retro ? -1 : (wo.steps || []).findIndex(s => stepState(s) !== "done" && stepState(s) !== "failed");
      return (wo.steps || []).map((s, i) => {
      const blocker = isBlocker(s);
      const state = stepState(s);
      const blocked = blockerOpenBefore(wo, i);
      const hold = holdState(wo, i);
      // Waiting on a clock reads like waiting on a signature, because to the
      // person standing there it is the same thing: this step is not yours yet.
      const held = !!hold && !hold.ready && !hold.overridden && state !== "done" && state !== "failed";
      return `<div class="step ${blocker || held ? "blocker" : ""} ${state === "done" ? "done" : ""} ${state === "failed" ? "failed" : ""} ${i === nextIdx ? "upnext" : ""}">
        <div class="num">${s.seq}</div>
        <div class="body">
          <div>${esc(stripCS(s.title))} ${blocker ? '<span class="step-badge">blocker</span>' : ""}${hold && state !== "done" ? ` <span class="step-badge">hold ${hold.hours} h</span>` : ""}</div>
          ${held ? holdBanner(hold, i) : ""}
          ${hold && hold.overridden ? `<div class="meta">Hold overridden by ${esc(hold.override.by)}, ${esc(String(hold.override.hoursShort))} h short. See the event log.</div>` : ""}
          ${startsHold(s) && s.cure ? `<div class="meta">${esc(cureSummary(s.cure))}</div>` : ""}
          ${s.notes ? `<div class="meta">${esc(s.notes)}</div>` : ""}
          <!-- Deliberately still a one-line control at rest. This is filled in
               at the bench, on a phone, with gloves on; a bubble menu and a
               slash menu there would be worse than what was here. The button
               beside it opens the full composer in a modal for the case the
               placeholder used to describe — its old text was literally
               "notes / photo filenames", i.e. the workaround for attaching a
               photo was to TYPE THE FILENAME. -->
          ${E ? `<div class="meta no-print stepnote"><input placeholder="notes" value="${esc(s.notes)}" onchange="us(${i},'notes',this.value)">
            <button class="ib sm" title="Write a longer note, with photos" aria-label="Write a longer note for step ${s.seq}" onclick="openStepNote('${wo.id}',${i})">${icon("image", 14)}</button></div>` : ""}
          ${(s.photoRefs || []).length ? `<div class="meta">photos: ${s.photoRefs.map(p => esc(p.filename || p)).join(", ")}</div>` : ""}
        </div>
        <div class="buyoff">
          ${state === "failed"
            ? `<span class="warn">✗ ${esc(s.status)}</span>`
            : state === "done"
              ? (isSigned(s)
                ? `<span class="ok">✔ ${esc(s.buyoff.name)} ${esc(s.buyoff.date || "")}</span>`
                : `<span class="muted">done, buy-off not recorded (retro)</span>`)
              : (wo.retro ? `<span class="muted">${esc(s.status || "open")}</span>`
                : held && !isLead()
                  ? `<button disabled title="curing — ${esc(fmtLeft(hold.msLeft))}">buy off as ${esc(signerName())}</button>`
                  : `<button onclick="buyoff(${i})" ${blocked ? "disabled title='blocked by unfinished blocker: " + esc(blocked.title) + "'" : ""}>buy off as ${esc(signerName())}</button>`)}
        </div>
      </div>`;
      }).join("");
    })()}
    <h3 id="wo-quality">Quality checks / acceptance criteria</h3>
    <table class="sub"><thead><tr><th>Criterion</th><th>Target (set at creation!)</th><th>Actual</th><th>Pass</th></tr></thead><tbody>
      ${(wo.qualityChecks || []).map((q, i) => E
        ? `<tr><td><input value="${esc(q.criterion)}" onchange="uq(${i},'criterion',this.value)"></td><td><input value="${esc(q.target)}" onchange="uq(${i},'target',this.value)"></td><td><input value="${esc(q.actual)}" onchange="uq(${i},'actual',this.value)"></td><td><select onchange="uq(${i},'pass',this.value==='true'?true:this.value==='false'?false:null)"><option ${q.pass == null ? "selected" : ""}>—</option><option value="true" ${q.pass === true ? "selected" : ""}>pass</option><option value="false" ${q.pass === false ? "selected" : ""}>FAIL</option></select></td></tr>`
        : `<tr><td>${esc(q.criterion)}</td><td>${esc(q.target)}</td><td>${esc(q.actual)}</td><td>${q.pass === true ? '<span class="ok">pass</span>' : q.pass === false ? '<span class="warn">FAIL</span>' : "—"}</td></tr>`).join("")}
    </tbody></table>
    ${E ? `<button onclick="woById('${wo.id}').qualityChecks.push({criterion:'',target:'',actual:'',pass:null});saveWO(woById('${wo.id}'),'qualityChecks');render()">+ check</button>` : ""}
    <!-- The mold drawing, the CAM notes, the DRB deck: the documents that
         explain this job. They used to be a Slack paste, which meant they were
         findable for a day (PP-09). Placed after Quality and before the log so
         a phone reaches Steps first. -->
    <h3 id="wo-docs">Documents</h3>
    ${docLinkList(wo.docs, { onRemove: `rmWoDoc`, empty: "No documents linked yet.", addLabel: "+ Link a document" })}
    <div class="no-print" style="margin-top:8px"><button onclick="openDocLinkModal({ coll: 'workOrders', id: '${wo.id}' })">+ Link a document</button></div>
    <h3 id="wo-log">Event log</h3>
    <table class="sub"><thead><tr><th style="width:110px">Date</th><th>Event</th></tr></thead><tbody>
      ${(wo.timeline || []).map((t, i) => E
        ? `<tr><td><input value="${esc(t.date)}" onchange="ut(${i},'date',this.value)"></td><td><input value="${esc(t.note)}" onchange="ut(${i},'note',this.value)"></td></tr>`
        : `<tr><td>${esc(t.date)}</td><td>${esc(t.note)}</td></tr>`).join("")}
    </tbody></table>
    ${E ? `<button onclick="woById('${wo.id}').timeline.push({date:'',note:''});saveWO(woById('${wo.id}'),'timeline');render()">+ event</button>` : ""}
    <!-- The old free-text notes blob had no author and no timestamp, and any
         edit silently replaced whatever was there. It stays, authoritative and
         editable, because it is what somebody typed; the log beside it is
         append-only and signed, so "who decided this and when" has an answer. -->
    <h3>Notes</h3>
    ${E ? `<textarea onchange="updWO('notes',this.value)">${esc(wo.notes)}</textarea>` : `<div class="prose">${esc(wo.notes) || '<span class="muted">—</span>'}</div>`}
    ${threadHtml("workOrders", wo.id, (wo.noteLog || []), { noun: "Note", empty: "No notes yet. Anything worth telling the next person goes here." })}
    ${(() => {
      rteSetUpload(name => `projects/${wo.id}/${Date.now()}-${name}`);
      const draft = loadDraft("wonote", wo.id);
      return composerHtml({
        targetId: "wo-note",
        html: sanitizeHtml(draft),
        placeholder: "Add a note — what happened, what you measured, a photo…",
        oninput: `draftInput('wonote','${wo.id}',this)`,
        onpost: `postWoNote('${wo.id}')`,
        oncancel: `closeComposer('wo-note')`,
        postLabel: "Add note as " + signerName(),
      });
    })()}
  </div>`;
}

/* field update helpers (operate on current WO; each saves only its field) */
function updWO(key, val) {
  const w = woById(view.id);
  // The CS-003 enforcement point at the Work Order level: intercepting this
  // generic field-write is the actual hook (there's no dedicated "Mark
  // Complete" button — status is just one editable field, same shape as the
  // existing step-blocker check below).
  if (key === "status" && val === "Complete") {
    const undisposed = undisposedIssuesForWO(w.id);
    if (undisposed.length) {
      toast(`Can't complete this work order — ${undisposed.length} linked issue${undisposed.length > 1 ? "s" : ""} (${undisposed.map(i => i.id).join(", ")}) ${undisposed.length > 1 ? "aren't" : "isn't"} disposed yet.`, "error");
      render(); return;
    }
  }
  w[key] = val; saveWO(w, key);
}
// Reuses the Tickets "new ticket" modal wholesale, pre-selected to Issue and
// pre-filled with this work order — same modal, same fields, no duplication.
function createIssueFromWO(woId) {
  openNewProject();
  document.getElementById("np-kind").value = "issue";
  ticketKindChanged();
  document.getElementById("np-wo").value = woId;
}
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
/* ---------- the cure modals ----------
   Buying off the step that starts a cure asks what went in and when, because
   that is the one moment somebody is standing at the part with the answer. The
   time defaults to now and is editable: people write the traveller up after the
   fact, and a start time that lies makes the hold lie. */
function openCureModal(i) {
  const w = woById(view.id);
  const s = w.steps[i];
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const prior = s.cure || {};
  openModal(`
    <h2>Buy off: ${esc(stripCS(s.title))}</h2>
    <p class="muted">What went in, and when it finished. This starts the cure hold on the next step.</p>
    <div class="field"><label for="cure-resin">Resin mixed</label>
      <select id="cure-resin" autofocus onchange="cureModalPreview()">
        ${RESINS.map(r => `<option value="${esc(r.id)}" ${prior.resin === r.id ? "selected" : ""}>${esc(r.label)} — ${esc(r.use)}</option>`).join("")}
        <option value="" ${prior.resin === "" ? "selected" : ""}>Something else / not recorded</option>
      </select>
    </div>
    <div class="field row2">
      <div><label for="cure-date">Finished on</label><input id="cure-date" type="date" value="${esc((prior.startedAt || "").slice(0, 10) || today())}" onchange="cureModalPreview()"></div>
      <div><label for="cure-time">at</label><input id="cure-time" type="time" value="${esc((prior.startedAt || "").slice(11, 16) || hhmm)}" onchange="cureModalPreview()"></div>
    </div>
    <div class="field"><label for="cure-temp">Shop temperature, °C (optional)</label>
      <input id="cure-temp" type="number" inputmode="numeric" placeholder="e.g. 18" value="${prior.tempC ?? ""}" onchange="cureModalPreview()">
    </div>
    <div id="cure-preview"></div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="submitCure(${i})">Sign as ${esc(signerName())}</button>
    </div>
  `);
  cureModalPreview();
}
/* Live line under the form. It exists so nobody discovers the length of the
   hold they just started by coming back the next morning and finding the step
   still locked. */
function cureModalPreview() {
  const box = document.getElementById("cure-preview");
  if (!box) return;
  const id = (document.getElementById("cure-resin") || {}).value || "";
  const r = resinById(id);
  const tempRaw = (document.getElementById("cure-temp") || {}).value;
  const temp = tempRaw === "" || tempRaw == null ? null : Number(tempRaw);
  if (!r) {
    box.innerHTML = `<p class="gate"><span class="gi">!</span><span>No resin recorded means no cure hold on the next step. Write what you used into the step notes so the record is still honest.</span></p>`;
    return;
  }
  const cold = temp != null && !isNaN(temp) && temp < r.refTempC;
  box.innerHTML = `
    <p class="gate"><span class="gi">${cold ? "⚠" : "!"}</span><span>
      Sets a <b>${r.febHoldH} h</b> hold on the next step.
      ${cold ? `At ${esc(String(temp))} °C the shop is below the ${r.refTempC} °C this number is quoted at, so the part will cure slower than the clock suggests. Fingernail-test the flange before you trust it.`
             : `The datasheet asks for ${esc(r.sheetSays)}.`}
    </span></p>`;
}
function submitCure(i) {
  const id = (document.getElementById("cure-resin") || {}).value || "";
  const date = (document.getElementById("cure-date") || {}).value || today();
  const time = (document.getElementById("cure-time") || {}).value || "00:00";
  const tempRaw = (document.getElementById("cure-temp") || {}).value;
  const startedAt = new Date(date + "T" + time).toISOString();
  const cure = { resin: id, startedAt };
  if (tempRaw !== "" && tempRaw != null && !isNaN(Number(tempRaw))) cure.tempC = Number(tempRaw);
  closeModal();
  signStep(i, { cure });
}

/* Why this many hours. The step row deliberately carries no standard reference
   and no datasheet figure — that was making every row a wall of citation — so
   the traceability CS-000 §8 wants lives one tap in, next to the button that
   opens the actual PDF. */
function openWhyHold(i) {
  const w = woById(view.id);
  const h = holdState(w, i);
  if (!h || !h.resin) return;
  const r = h.resin;
  openModal(`
    <h2>Why ${r.febHoldH} hours?</h2>
    <div class="field"><label>Resin</label><div class="ro">${esc(r.label)}</div></div>
    <div class="field"><label>Datasheet</label><div class="ro">${esc(r.sheetSays)}</div></div>
    <div class="field"><label>FEB holds it</label><div class="ro">${r.febHoldH} h — longer than the datasheet asks for, on purpose.</div></div>
    ${r.febBy ? `<div class="field"><label>Signed off by</label><div class="ro">${esc(r.febBy)}</div></div>` : ""}
    ${h.tempC != null ? `<div class="field"><label>Shop temperature recorded</label><div class="ro">${esc(String(h.tempC))} °C${holdIsCold(h) ? ` — below the ${r.refTempC} °C the datasheet number is quoted at` : ""}</div></div>` : ""}
    <div class="foot">
      <button onclick="closeModal()">Close</button>
      <button class="primary" onclick="closeModal();openDatasheet('${esc(r.doc)}')">Open the datasheet</button>
    </div>
  `);
}
/* Documents owns the PDF viewer, and its manifest is fetched lazily the first
   time that tab renders. Jumping straight to openDocument() from here finds an
   empty manifest and shows nothing, so: switch tabs first, let the load happen,
   then open. */
function openDatasheet(src) {
  setTab("documents");
  // Documents fetches its manifest lazily on first render of that tab. setTab()
  // triggers that render, but the fetch resolves a tick later, so poll briefly
  // rather than calling openDocument() into an empty manifest and showing
  // nothing. Bounded, so a failed fetch gives up instead of spinning.
  if (typeof loadManifest === "function") loadManifest();
  const tryOpen = (n) => {
    if (typeof DOCS_MANIFEST !== "undefined" && (DOCS_MANIFEST || []).length) { openDocument(src); return; }
    if (n > 0) setTimeout(() => tryOpen(n - 1), 120);
  };
  tryOpen(12);
}

/* Overriding a hold is a lead call, and it costs a sentence. An unlogged
   override is worth nothing to the next person reading the record, and a hold
   nobody can ever pass just gets worked around outside the app — which is
   worse, because then it isn't written down anywhere. */
function openHoldOverride(i) {
  const w = woById(view.id);
  const h = holdState(w, i);
  if (!h) return;
  const short = Math.max(1, Math.ceil(h.msLeft / 3600000));
  openModal(`
    <h2>Demould early?</h2>
    <p class="gate"><span class="gi">✕</span><span><b>${short} h of a ${h.hours} h hold remain.</b> ${h.resin ? esc(h.resin.label) : ""}${holdIsCold(h) ? ` — and at ${esc(String(h.tempC))} °C it is curing slower than that clock, not faster` : ""}.</span></p>
    <div class="field"><label for="hold-why">Why are you demoulding early?</label>
      <textarea id="hold-why" autofocus rows="3" placeholder="What you checked, and who accepted the risk"></textarea>
    </div>
    <p class="muted">This goes in the event log with your name, the time, and how short it was.</p>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="danger" onclick="submitHoldOverride(${i})">Override anyway</button>
    </div>
  `);
}
function submitHoldOverride(i) {
  const el = document.getElementById("hold-why");
  const why = (el ? el.value : "").trim();
  if (!why) { toast("An override needs a reason. That's the whole point of it.", "error"); return; }
  const w = woById(view.id);
  const h = holdState(w, i);
  if (!h) { closeModal(); return; }
  const short = Math.max(1, Math.ceil(h.msLeft / 3600000));
  closeModal();
  const ov = { by: signerName(), email: myEmail(), at: new Date().toISOString(), hoursShort: short, reason: why };
  // The event log is where a WO records things that happened to it, so the
  // override lands there rather than in a store invented for it.
  w.timeline = w.timeline || [];
  w.timeline.push({
    date: today(),
    note: `Cure hold overridden by ${ov.by} with ${short} h of ${h.hours} remaining. Reason: ${why}`,
  });
  saveWO(w, "timeline");
  signStep(i, { holdOverride: ov });
}

async function buyoff(i) {
  const w = woById(view.id);
  const blocked = blockerOpenBefore(w, i);
  if (blocked) { toast("Blocked by unfinished blocker: " + blocked.title, "error"); return; }
  // CS-013: a design review signed by whoever made the thing isn't a review.
  if (w.steps[i].title.toLowerCase().includes("design review") && myEmail() &&
      myEmail() === w.createdBy &&
      !await confirmAsync("You created this work order. A design review should be signed off by someone else. Sign it anyway?",
        { title: "Self-review", ok: "Sign it anyway" })) return;
  // Starting a cure: ask what and when before signing. signStep() does the write.
  if (startsHold(w.steps[i]) && !w.retro) { openCureModal(i); return; }
  /* A hold is re-checked here and not just at render, so a step that came ready
     while the page sat open signs without a refresh. The countdown on screen
     can be a minute stale; this cannot. */
  const h = holdState(w, i);
  if (h && !h.ready && !h.overridden) {
    if (!isLead()) {
      toast(`Still curing — ${fmtLeft(h.msLeft)}. A lead can override if it really can't wait.`, "error");
      return;
    }
    openHoldOverride(i);
    return;
  }
  signStep(i);
}

/* The actual write, shared by the plain path and by both modals. Extra fields
   are merged onto the step in the same transactional re-apply as the buy-off,
   so a teammate signing a different step at the same moment can't erase them
   and a cure record can't land without its signature. */
function signStep(i, extra) {
  const w = woById(view.id);
  const bo = {
    name: signerName(), email: fb.user.email, uid: fb.user.uid,
    date: today(), time: new Date().toISOString(),
  };
  const patch = { buyoff: bo, status: "done", ...(extra || {}) };
  Object.assign(w.steps[i], patch); // optimistic local
  // Concurrency-safe: re-apply just this step on fresh server data so a
  // teammate buying off a different step at the same moment can't erase it.
  saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], ...patch }; return steps; });
  render();
}
function rmWoDoc(linkId) { removeDocLink("workOrders", view.id, linkId); }

/* Append-only, authored note log on a work order — the same shape as a ticket
   comment, so threadHtml/commentHtml render it and edit/remove work on it for
   free. saveField, not a whole-field write, so two people adding notes from the
   bench at the same time do not clobber each other. */
function postWoNote(id) {
  const box = document.getElementById("wo-note");
  const html = sanitizeHtml((box && box.innerHTML) || "");
  const text = String((box && box.textContent) || "").trim();
  if (!text && !/<img/i.test(html)) { toast("Write the note first.", "error"); return; }
  const w = woById(id);
  if (!w) return;
  const c = { id: "C" + Date.now(), author: signerName(), email: myEmail(), ts: new Date().toISOString(), html };
  w.noteLog = (w.noteLog || []).concat([c]);
  saveField("workOrders", w, "noteLog", arr => (arr || []).concat([c]));
  if (box) box.innerHTML = "";
  clearDraft("wonote", id);
  closeComposer("wo-note");
  render();
}
/* A step note long enough to want a photo gets the full composer, in a modal —
   which is also the right shape on a phone, where #modal already solves the
   safe-area padding and keeps the save button above the keyboard. */
function openStepNote(woId, i) {
  const w = woById(woId);
  if (!w || !w.steps || !w.steps[i]) return;
  const s = w.steps[i];
  rteSetUpload(name => `projects/${woId}/${Date.now()}-${name}`);
  openModal(`
    <h2>${esc(stripCS(s.title))}</h2>
    <p class="muted">Step ${s.seq} of ${esc(woId)}. Photos, measurements, anything the next person needs.</p>
    ${composerHtml({
      targetId: "step-note",
      html: sanitizeHtml(s.noteHtml || esc(s.notes || "")),
      alwaysOpen: true,
      placeholder: "What happened at this step…",
      onpost: `saveStepNote('${woId}',${i})`,
      oncancel: `closeModal()`,
      postLabel: "Save note",
      hint: "",
    })}
  `);
}
function saveStepNote(woId, i) {
  const box = document.getElementById("step-note");
  const html = sanitizeHtml((box && box.innerHTML) || "");
  const text = String((box && box.textContent) || "").trim();
  const w = woById(woId);
  if (!w) return;
  closeModal();
  // Both fields: `notes` is what the printed traveler and the one-line input
  // read, `noteHtml` is the long form. Keeping them in step means the paper
  // sheet never goes blank because someone used the rich editor.
  w.steps[i].notes = text;
  w.steps[i].noteHtml = html;
  saveField("workOrders", w, "steps", arr => {
    arr[i] = { ...arr[i], notes: text, noteHtml: html };
    return arr;
  });
  render();
}
