"use strict";
/* workorders.js — the Work Orders tab.
   Same behavior as the original single-purpose app: list, detail, step
   buy-offs stamped with the signed-in user, blocker enforcement, printing.
   Now one tab among several; data goes through core's generic save()/del()
   into the workOrders collection. */

const WO_STATUSES = ["Draft", "Released", "InWork", "Complete", "OnHold"];
const PROCESSES = ["MoldInfusion", "GlassInfusion", "MoldWetLay", "FoamWrapped", "Other"];
const BLOCKER_WORDS = ["frozen", "design review", "drop test", "acceptance criterion"];

/* The training catalog. Ids are referenced from step templates below and from
   the engineer gating map, so they are stable code keys; labels are display
   only. Grants live per-person on roster docs (see fb.rosterGrant). Unlike
   BLOCKER_WORDS there is deliberately NO title fallback: a training gate that
   matched on titles would newly block every record already in Firestore, so
   the gate exists exactly where a template's rule object put it. */
const TRAININGS = {
  moldDesign: "Mold design",
  cnc: "ShopSabre CNC",
  wetLayup: "Wet layup",
  infusion: "Resin infusion",
  foamCore: "Foam core",
  forgedCarbon: "Forged carbon fiber",
};
// Short codes for the capsule pills; long names go in tooltips.
const TRAINING_CODES = {
  moldDesign: "MOLD", cnc: "CNC", wetLayup: "WL",
  infusion: "INF", foamCore: "CORE", forgedCarbon: "FCF",
};
// Which training a manufacturing engineer needs, by process. Mold engineer is
// always gated by moldDesign.
const MFG_ENG_TRAINING = {
  MoldInfusion: "infusion", GlassInfusion: "infusion",
  MoldWetLay: "wetLayup", FoamWrapped: "wetLayup", Other: null,
};

/* ---------- engineer fields ----------
   One field renderer for both parts and work orders. The name string stays
   authoritative (20+ read sites, travellers, reports — none change); the input
   gains a datalist of people who hold the relevant training, and picking or
   typing a roster name also sets the *Email sidecar so the face is exact.
   Unqualified or off-roster names still save — assignment is planning, the
   buy-off is the enforced record — they just carry a quiet warning. */
function recProcess(rec) {
  if (rec.processType) return rec.processType;
  return { "MOLD INFUSION": "MoldInfusion", "GLASS INFUSION": "GlassInfusion",
    "MOLD WET LAY": "MoldWetLay", "FOAM WRAPPED": "FoamWrapped" }[rec.layupType] || "Other";
}
function engTrainingFor(rec, key) {
  return key === "moldEngineer" ? "moldDesign" : MFG_ENG_TRAINING[recProcess(rec)] || null;
}
function engWarnHtml(rec, key) {
  const v = String(rec[key] || "").trim();
  if (!v || (typeof notAPerson === "function" && notAPerson(v))) return "";
  const tr = engTrainingFor(rec, key);
  if (!tr) return "";
  const email = partEngineerEmail(rec, key);
  if (!email) return ` <span class="tny muted">not matched to the roster</span>`;
  if (!hasTraining(email, tr)) return ` <span class="warn tny">not ${esc(TRAININGS[tr] || tr)}-trained</span>`;
  return "";
}
function engFld(coll, rec, label, key) {
  const v = rec[key] ?? "";
  const warn = engWarnHtml(rec, key);
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}${warn}</div></div>`;
  const tr = engTrainingFor(rec, key);
  const dl = `dl-${coll}-${key}`;
  const q = tr ? qualifiedFor(tr) : usersSorted();
  return `<div class="f"><label>${label}</label>
    <input list="${dl}" value="${esc(v)}" onchange="setEngineer('${coll}','${esc(rec.id)}','${key}',this.value)">
    <datalist id="${dl}">${q.map(u => `<option value="${esc(u.name || u.email)}">`).join("")}</datalist>
    ${warn}</div>`;
}
function setEngineer(coll, id, key, val) {
  const rec = recById(coll, id);
  if (!rec) return;
  val = String(val || "");
  rec[key] = val;
  const nm = val.trim().toLowerCase();
  const u = nm ? (DB.users || []).find(u => (u.name || "").toLowerCase() === nm || u.email.toLowerCase() === nm) : null;
  rec[key + "Email"] = u ? u.email : "";
  save(coll, rec, key);
  save(coll, rec, key + "Email");
  render();
}

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

   `needs` sits in the SAME object and says what has to EXIST before the step can
   be signed. A buy-off used to record who and when but never what: "Stack
   frozen" could be signed on a work order whose layup stack was empty, and
   "Mold design review" with the CAD nowhere in the app. The signature was the
   record, and the record was a name. See stepEvidence().

   BLOCKER_WORDS still matches on titles as well, and has to: the 26 retro work
   orders and every record already in Firestore predate the rule field, so
   title-matching is the only thing enforcing on them. New templates carry both
   and the two agree. */
const STD_STEPS = {
  MoldInfusion: [
    ["Stack frozen", { kind: "blocker", needs: ["stack"] }], ["Mold design review", { kind: "blocker", needs: ["file"], training: "moldDesign" }],
    ["Glue mold stock", { training: "cnc" }], ["Machine mold", { needs: ["note"], training: "cnc" }],
    ["Seal and release mold"], ["Dry stack and bag", { training: "infusion" }],
    ["Drop test, 1 inHg or less over 10 min", { kind: "blocker", needs: ["note"], training: "infusion" }], ["Infuse", { kind: "startsHold", training: "infusion" }],
    ["Cure and demould", { kind: "hold", from: "resin" }], ["Trim and finish"]],
  GlassInfusion: [
    ["Stack frozen", { kind: "blocker", needs: ["stack"] }], ["Prepare plate and release"],
    ["Dry stack and bag", { training: "infusion" }], ["Drop test, 1 inHg or less over 10 min", { kind: "blocker", needs: ["note"], training: "infusion" }],
    ["Infuse", { kind: "startsHold", training: "infusion" }], ["Cure and demould", { kind: "hold", from: "resin" }],
    ["Cut to DXF, confirm revision"], ["Finish"]],
  MoldWetLay: [
    ["Stack frozen", { kind: "blocker", needs: ["stack"] }], ["Mold design review", { kind: "blocker", needs: ["file"], training: "moldDesign" }],
    ["Glue and machine mold", { needs: ["note"], training: "cnc" }], ["Seal and release mold"],
    ["Wet layup and bag", { kind: "startsHold", training: "wetLayup" }], ["Cure and demould", { kind: "hold", from: "resin" }],
    ["Trim and finish"]],
  FoamWrapped: [
    ["Stack frozen", { kind: "blocker", needs: ["stack"] }], ["Shape foam core", { training: "foamCore" }],
    ["Wet layup over core", { kind: "startsHold", training: "wetLayup" }], ["Cure", { kind: "hold", from: "resin" }],
    ["Trim and finish"]],
  Other: [["Define acceptance criterion: target and method, set before work starts", { kind: "blocker", needs: ["note"] }],
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
// The training a step's signer needs, or null. Rule-field only, no title
// fallback (see the TRAININGS comment): untagged steps stay ungated.
function stepTraining(s) { const r = stepRule(s); return (r && r.training) || null; }
function startsHold(s) { return !!(stepRule(s) && s.rule.kind === "startsHold"); }

/* ---------- evidence on a buy-off ----------
   What a signature has to come with. Three checks, each a pure function of the
   work order and the step, so they are testable with no DOM and so the same
   answer drives the disabled button, the modal and the gate inside buyoff().

   A PHOTO IS SUGGESTED, NEVER REQUIRED. Simon's call, and the right one: half
   these steps happen in a dark corner of RFS at eleven at night, and a hard
   photo requirement is how you teach people to sign the traveller the next
   morning from memory instead. It is a line of advice in the modal and nothing
   more. */
const EVIDENCE = {
  stack: {
    label: "a layup stack",
    why: "Freezing a stack that doesn't exist yet is the signature this app was built to stop.",
    fix: "Add plies in the Layup stack section above.",
    has: (wo) => (wo.layupStack || []).length > 0,
  },
  file: {
    // A link counts. The CAD genuinely lives in Drive, and demanding an upload
    // when the file is already linked on this work order just teaches people to
    // upload it twice.
    label: "the CAD, attached or linked",
    why: "A design review with no drawing anywhere is a signature on nothing.",
    fix: "Attach the STEP or SLDPRT under Files, or link it under Documents.",
    has: (wo) => (wo.files || []).length > 0 || (wo.docs || []).length > 0,
  },
  note: {
    label: "a note on this step",
    why: "When it was done, on which machine, and what the numbers were. Nobody remembers in March.",
    fix: "Write it in the step's note field.",
    has: (wo, s) => !!(String((s && s.notes) || "").trim() || String((s && s.noteHtml) || "").replace(/<[^>]*>/g, "").trim()),
  },
};
function stepNeeds(s) { return (stepRule(s) && s.rule.needs) || []; }
function stepHasPhoto(s) {
  return /<img/i.test(String((s && s.noteHtml) || "")) || ((s && s.photoRefs) || []).length > 0;
}
/* { missing: [key], suggested: ["photo"] }. Retro records return nothing
   missing, exactly like every other gate in this file: a historical record
   documents what happened, it does not enforce it after the fact. An override
   already granted clears the requirement too — it was granted in writing. */
function stepEvidence(wo, i) {
  const s = (wo.steps || [])[i];
  const out = { missing: [], suggested: [] };
  if (!s || wo.retro || s.evidenceOverride) return out;
  const needs = stepNeeds(s);
  needs.forEach(k => { const rule = EVIDENCE[k]; if (rule && !rule.has(wo, s)) out.missing.push(k); });
  /* Only steps that want a written note want a photo. Those are the physical
     ones — machining, the drop test — where a photo IS the measurement. Asking
     for a photo of "Stack frozen" would be asking for a photo of a decision,
     and a prompt that fires where it makes no sense is how people learn to
     dismiss the one that does. */
  if (needs.includes("note") && !stepHasPhoto(s)) out.suggested.push("photo");
  return out;
}
function evidenceLabels(keys) { return keys.map(k => (EVIDENCE[k] || {}).label || k); }

/* ---------- photos ----------
   Photos are the documentation this record exists to hold: what the bag
   looked like before pull is a fact nobody can reconstruct in March. Three
   pools already exist and stay where they are written — a step's photoRefs,
   image-typed record files, and <img>s inside step notes and the note log.
   woAllPhotos() is the one read that unifies them for the Photos section;
   uploads go to the step's own photoRefs so a photo travels with its step
   through the same saveField("steps") concurrency machinery as a buy-off.

   photoRefs entries were never written before 2026-08 (every seed row is []),
   so the object shape below is the shape; `filename` mirrors `name` only for
   the legacy `p.filename || p` reader. Bare-string legacy entries are still
   tolerated on read. */
function woPhotoEntry(up) {
  return { id: "P" + Date.now() + Math.random().toString(36).slice(2, 5),
    name: up.name, filename: up.name, url: up.url, path: up.path,
    type: up.type, size: up.size, by: myEmail(), ts: new Date().toISOString(), caption: "" };
}
function htmlImgSrcs(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/<img[^>]+src=["']([^"']+)["']/gi))
    if (!m[1].startsWith("data:")) out.push(m[1]);
  return out;
}
// [{url, name, caption?, by?, ts?, stepIndex?, stepTitle?, source}], deduped
// by url with the first pool winning (a step photo pasted into a note counts
// once, as the step's).
function woAllPhotos(wo) {
  const out = [], seen = new Set();
  const push = (p) => { if (p.url && !seen.has(p.url)) { seen.add(p.url); out.push(p); } };
  (wo.steps || []).forEach((s, i) => {
    (s.photoRefs || []).forEach(p => {
      if (typeof p === "string") push({ url: p, name: p, stepIndex: i, stepTitle: stripCS(s.title), source: "step" });
      else push({ url: p.url || "", name: p.name || p.filename || "photo", caption: p.caption || "",
        by: p.by, ts: p.ts, stepIndex: i, stepTitle: stripCS(s.title), source: "step" });
    });
    htmlImgSrcs(s.noteHtml).forEach(u => push({ url: u, name: "step note photo", stepIndex: i, stepTitle: stripCS(s.title), source: "note" }));
  });
  (wo.files || []).forEach(f => {
    if ((f.type || "").startsWith("image/")) push({ url: f.url, name: f.name || "photo", by: f.by, ts: f.ts, source: "file" });
  });
  (wo.noteLog || []).forEach(c => {
    htmlImgSrcs(c.html).forEach(u => push({ url: u, name: "note photo", by: c.email || c.author, ts: c.ts, source: "note" }));
  });
  return out;
}
/* Capture, one tap from the step row — view mode included, because the bench
   is not in edit mode. No `capture` attribute on purpose: with it, iOS and
   Android drop the photo-library option, and half the photos worth attaching
   were taken minutes ago. */
function addStepPhotos(woId, i, opts) {
  const w = woById(woId);
  if (!w || !w.steps || !w.steps[i]) return;
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
  inp.onchange = async () => {
    const files = Array.from(inp.files || []);
    if (!files.length) return;
    const slot = document.querySelector && document.querySelector(`[data-photo-slot="step"][data-wo="${woId}"][data-step="${i}"]`);
    let ghost = null;
    if (slot && slot.appendChild) { ghost = document.createElement("span"); ghost.className = "ph-uploading"; ghost.textContent = "uploading…"; slot.appendChild(ghost); }
    const entries = [];
    for (const f of files) {
      try {
        const up = await fb.upload(`projects/${woId}/${Date.now()}-${f.name}`, f);
        entries.push(woPhotoEntry(up));
      } catch (e) { toast("Upload failed: " + e.message, "error"); }
    }
    if (ghost) ghost.remove();
    if (entries.length) {
      w.steps[i].photoRefs = (w.steps[i].photoRefs || []).concat(entries);
      saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], photoRefs: (steps[i].photoRefs || []).concat(entries) }; return steps; });
      render();
    }
    if (opts && opts.then) opts.then();
  };
  inp.click();
}
function setStepPhotoCaption(woId, i, photoId, caption) {
  const w = woById(woId);
  if (!w || !w.steps || !w.steps[i]) return;
  const apply = refs => (refs || []).map(p => (p && p.id === photoId ? { ...p, caption } : p));
  w.steps[i].photoRefs = apply(w.steps[i].photoRefs);
  saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], photoRefs: apply(steps[i].photoRefs) }; return steps; });
}

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
/* ---------- what the rail says about a run ----------
   Three pure functions, no DOM, so the rail, the overview pane and the tests
   all read the same answer. They sit here beside stepState() rather than down
   among the renderers because they are facts about a work order, not markup. */
function woProgress(w) {
  const steps = (w && w.steps) || [];
  let done = 0, failed = 0;
  steps.forEach(s => { const st = stepState(s); if (st === "done") done++; else if (st === "failed") failed++; });
  return { done, failed, total: steps.length, pct: steps.length ? done / steps.length : 0 };
}
/* Blocked and curing are asked ONLY about the step you would act on next — the
   same definition dashboard.js's blockedNow() uses (`if (i > next) return`).
   Two answers to "is this blocked" that disagreed between the rail and the
   Dashboard would be a bug report, not a nuance.

   Retro and Complete records flag nothing: they are history, and history is not
   waiting on anybody. */
function woFlags(w) {
  const none = { blocked: null, curing: null };
  if (!w || w.retro || w.status === "Complete") return none;
  const steps = w.steps || [];
  const next = steps.findIndex(s => stepState(s) !== "done" && stepState(s) !== "failed");
  if (next < 0) return none;
  const hold = holdState(w, next);
  return {
    blocked: blockerOpenBefore(w, next),
    curing: hold && !hold.ready && !hold.overridden ? hold : null,
  };
}
// isWoLate, not woLate: view.woLate is the filter flag, and one word meaning
// both a predicate and a toggle is how the next person loses an hour.
function isWoLate(w) {
  const d = daysUntil(w && w.dueDate);
  return d != null && d < 0 && w.status !== "Complete";
}

/* ---------- which part a run belongs to ----------
   partOf() (core.js) scans DB.parts, and grouping by part would call it once
   per row per comparison — O(n log n) scans of the whole collection. Resolve
   every run once into a map instead, rebuilt at the top of woIndexRows().

   Deliberately NOT a cache with an invalidation key: the edges change whenever
   somebody confirms a name guess, and a map that went stale on that would
   regroup the rail wrongly with nothing on screen to explain it. Rebuilding is
   26 x 33 comparisons, which is free. */
let WO_PART_MAP = new Map();
function buildWOPartMap() {
  WO_PART_MAP = new Map();
  (DB.workOrders || []).forEach(w => { const r = partOf(w); WO_PART_MAP.set(w.id, r ? r.part : null); });
  return WO_PART_MAP;
}
// Falls back to a direct resolve so a test (or the keyboard handler) can call
// this without having rendered the rail first.
function woPart(w) {
  if (!w) return null;
  if (WO_PART_MAP.has(w.id)) return WO_PART_MAP.get(w.id);
  const r = partOf(w);
  return r ? r.part : null;
}
// "~~unlinked" sorts after every real part name, so the runs with no parent
// land in one block at the bottom rather than scattered under an empty heading.
function woPartSortKey(w) { const p = woPart(w); return p ? (p.partName || p.id).toLowerCase() : "~~unlinked"; }

/* ---------- grouping and sorting the rail ----------
   Parts gets away with a single `group` sentinel because it groups by exactly
   one thing. A run has several parents worth grouping under, so the modes are a
   table: a key present in WO_GROUPS draws headers, anything else is a flat sort. */
const WO_GROUPS = {
  gpart: w => { const p = woPart(w); return p ? p.id : ""; },
  gstatus: w => w.status || "",
  gsub: w => w.subteam || "",
  gproc: w => w.processType || "",
};
const WO_SORT_COLS = {
  gpart: woPartSortKey,
  // Enum order, never alphabetical — Draft/Released/InWork/Complete is progress
  // order and sorted as text it is nonsense. Same rule as PART_SORT_COLS.
  gstatus: w => WO_STATUSES.indexOf(w.status),
  gsub: w => (w.subteam || "~").toLowerCase(),
  gproc: w => (w.processType || "~").toLowerCase(),
  dueDate: w => w.dueDate || "9999",
  id: w => w.id,
  partName: w => (w.partName || "").toLowerCase(),
  status: w => WO_STATUSES.indexOf(w.status),
  progress: w => woProgress(w).pct,
};
const WO_SORT_LABELS = {
  gpart: "Group: part", gstatus: "Group: status", gsub: "Group: subteam", gproc: "Group: process",
  dueDate: "Sort: Due", id: "Sort: ID", partName: "Sort: Part", status: "Sort: Status", progress: "Sort: Progress",
};
function woSortKey() { return WO_SORT_COLS[view.sortKey] ? view.sortKey : "gpart"; }
function sortWOsBy(key) {
  if (view.sortKey === key) view.sortDir = view.sortDir === "desc" ? "asc" : "desc";
  else { view.sortKey = key; view.sortDir = "asc"; }
  render();
}
function toggleWOSortDir() { view.sortDir = view.sortDir === "desc" ? "asc" : "desc"; render(); }
function sortedWORows(rows) {
  const get = WO_SORT_COLS[woSortKey()];
  const mul = view.sortDir === "desc" ? -1 : 1;
  // Ties break on due date then id, always ascending. This is what stops rows
  // shuffling between renders when a whole group shares a sort value.
  return rows.slice().sort((a, b) => {
    const av = get(a), bv = get(b);
    if (av < bv) return -mul;
    if (av > bv) return mul;
    return (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.id.localeCompare(b.id);
  });
}

/* ---------- the index rows ----------
   Work orders only. Group headers are NOT in here and must never be: keyboard
   navigation walks this array, and a header in it would let j/k set view.id to
   a part name and silently drop the detail pane back to the overview. */
function woIndexRows() {
  buildWOPartMap();
  const D = DB.workOrders || [];
  const q = (view.q || "").toLowerCase();
  /* Unlike Parts, this rail does NOT hide finished records by default.
     A part is a thing that has to exist by a deadline, so once it is made it
     drops off the list. A work order is the traveler for one run — reading back
     what was done is half of what the tab is for, and the entire SN5 archive is
     Complete, so a done-hiding default lands on an empty rail and reads as a
     broken tab. Open/done are both one chip away instead. */
  let rows = D
    .filter(w => (!view.woOpen || w.status !== "Complete"))
    .filter(w => (!view.woDone || w.status === "Complete"))
    .filter(w => (!view.fStatus || w.status === view.fStatus))
    .filter(w => (!view.fSub || w.subteam === view.fSub))
    .filter(w => (!view.woLate || isWoLate(w)))
    .filter(w => (!view.woMine || isMine([w.moldEngineer, w.manufacturingEngineer])))
    .filter(w => !q || w.id.toLowerCase().includes(q) || (w.partName || "").toLowerCase().includes(q));
  // The open run never falls out from under you — a filter that would hide what
  // you are reading keeps it in place instead. This is the whole point of a
  // persistent rail, and without it typing in the search box blanks the pane.
  const sel = selectedWO();
  if (sel && !rows.includes(sel)) rows = rows.concat([sel]);
  return sortedWORows(rows);
}

function woSummary() {
  const D = DB.workOrders || [];
  const open = D.filter(w => w.status !== "Complete");
  let curing = 0, blocked = 0;
  D.forEach(w => { const f = woFlags(w); if (f.curing) curing++; if (f.blocked) blocked++; });
  return {
    total: D.length, open: open.length, done: D.length - open.length,
    late: D.filter(isWoLate).length,
    mine: open.filter(w => isMine([w.moldEngineer, w.manufacturingEngineer])).length,
    curing, blocked,
  };
}
function resetWOFilters() { view = { ...view, woOpen: false, woLate: false, woMine: false, woDone: false, fStatus: "", fSub: "", q: "" }; render(); }

/* ---------- selection ----------
   view.mode === "detail" stays the switch, exactly as it was when this tab was
   a full-page swap. A dozen tests set it directly, and print.js's ⌘P mount
   reads it — a different selection model would break both in ways whose symptom
   points somewhere else entirely. */
function selectedWO() { return view.mode === "detail" ? woById(view.id) : null; }
function selectWO(id) {
  view = { ...view, mode: "detail", id, edit: false };
  render();
  const el = document.getElementById("pi-" + id);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
}
function clearWOSelection() { view = { ...view, mode: "list", edit: false }; render(); }

/* Arriving from a lineage bar, the Dashboard or a scanned label goes through
   openRecord(), which sets view.mode/id without ever calling selectWO() — so
   the rail would render with the selected row forty rows below the fold. Called
   from render(), same guarded idiom as syncTimelineScroll(). */
function syncWORailScroll() {
  if (typeof document.querySelector !== "function") return;
  if (view.tab !== "workorders" || view.mode !== "detail" || !view.id) return;
  const el = document.getElementById("pi-" + view.id);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
}

function renderWorkOrders() {
  const sel = selectedWO();
  return `<div class="mdsplit wosplit ${sel ? "has-sel" : ""}">
    ${renderWOIndex()}${sel ? renderWODetail() : renderWOOverview()}
  </div>`;
}

/* One rail row. Four fixed slots, same grammar as Parts and Molds, so the
   ≤900 collapse and the tablet-band rules apply without knowing what a work
   order is. */
function woIndexItem(w, opts) {
  opts = opts || {};
  const sel = view.mode === "detail" && view.id === w.id;
  const done = w.status === "Complete";
  const pr = woProgress(w);
  const fl = woFlags(w);
  const late = isWoLate(w);
  const engs = [w.moldEngineer, w.manufacturingEngineer].filter(Boolean);
  // Grouped by part, the header already said the part name — repeating it down
  // twelve rows is a column of the same word. Lead with the id instead.
  const name = opts.hidePart
    ? `${esc(w.id)}<span class="tny muted"> rev ${esc(w.revision || "A")}</span>`
    : `${esc(w.partName || w.id)}<span class="tny muted"> ${esc(w.id.replace(/^WO-/, ""))}</span>`;
  // At most ONE flag. Blocked beats curing: one of them is something to fix and
  // the other is something to wait for.
  const flag = fl.blocked ? `<span class="wflag blocked">blocked</span>`
    : fl.curing ? `<span class="wflag curing">curing</span>` : "";
  return `<div class="pitem ${sel ? "sel" : ""} ${done ? "isdone" : ""}" id="pi-${esc(w.id)}"
      role="option" aria-selected="${sel}" title="${esc(w.id)} · ${esc(w.processType || "")} · ${esc(w.status || "")}"
      onclick="selectWO('${esc(w.id)}')">
    <span class="pi-name">${name}${w.retro ? ' <span class="pill retro tny">retro</span>' : ""}</span>
    <span class="pi-due ${late ? "warn" : ""}">${w.dueDate ? shortDate(w.dueDate) + (late ? " " + icon("warning", 12) : "") : ""}</span>
    <span class="pi-sub">${woProgBar(pr)}${flag || `<span class="tny">${esc(opts.hidePart ? (w.processType || "") : (w.subteam || ""))}</span>`}</span>
    <span class="pi-who">${engs.map(e => avatar(e, 20)).join("")}</span>
  </div>`;
}
/* The one number the flat table never had: how far through its buy-offs this
   run is. A bar plus the fraction, because a bar alone can't tell 4/9 from
   40/90 and the fraction alone doesn't scan down a column. */
function woProgBar(pr) {
  const pct = Math.round(pr.pct * 100);
  return `<span class="wprog" title="${pr.done} of ${pr.total} steps signed">
    <span class="wp-bar"><i style="width:${pct}%"></i></span><b>${pr.done}/${pr.total}</b></span>`;
}

function woGroupHead(label, rows, extra) {
  const late = rows.filter(isWoLate).length;
  return `<div class="pgrouphd">
    <span class="pg-name">${label}</span>
    <span class="pg-n">${rows.length} ${rows.length === 1 ? "run" : "runs"}</span>
    ${late ? `<span class="pg-n pg-late">${icon("warning", 12)} ${late} late</span>` : ""}
    ${extra || ""}
  </div>`;
}

/* The rail body. Headers are drawn HERE and nowhere else — see woIndexRows().

   Grouped by part, this also emits a header for every part with no runs at all,
   carrying the button that starts one. Those headers have no rows under them
   and are not in woIndexRows(), so the keyboard never lands on one; they are
   the visible answer to "what haven't we started yet", which is the question
   the flat table could not answer without leaving the tab. */
function woIndexBody(rows) {
  const key = woSortKey();
  const grouping = WO_GROUPS[key];
  if (!grouping) return rows.map(w => woIndexItem(w)).join("");

  if (key === "gpart") {
    const groups = new Map();               // partId ("" = unlinked) -> rows
    rows.forEach(w => {
      const g = grouping(w);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(w);
    });
    const entries = [];
    groups.forEach((rs, pid) => {
      if (!pid) return;                     // the unlinked block is appended last
      const p = recById("parts", pid);
      entries.push({ sort: ((p && (p.partName || p.id)) || "").toLowerCase(), pid, p, rows: rs });
    });
    // Parts nobody has started. Interleaved alphabetically rather than dumped in
    // a block at the end, because the point is to see the gap where a run should
    // be, next to the parts that have one.
    (DB.parts || []).forEach(p => {
      if (groups.has(p.id)) return;
      if (partRuns(p).length) return;       // has runs, just filtered out of view
      entries.push({ sort: (p.partName || p.id).toLowerCase(), pid: p.id, p, rows: [], empty: true });
    });
    entries.sort((a, b) => a.sort.localeCompare(b.sort));
    let out = entries.map(e => {
      const label = `<span class="pg-open" onclick="event.stopPropagation();openRecord('parts','${esc(e.pid)}')"
        role="button" tabindex="0" title="Open ${esc((e.p && (e.p.partName || e.p.id)) || e.pid)} in Parts">${esc((e.p && (e.p.partName || e.p.id)) || e.pid)}</span>`;
      if (e.empty) {
        return `<div class="pgrouphd norows">
          <span class="pg-name">${label}</span>
          <span class="pg-n">no run yet</span>
          <button class="sm pg-start no-print" onclick="newRunForPart('${esc(e.pid)}')">+ Start run</button>
        </div>`;
      }
      return woGroupHead(label, e.rows) + e.rows.map(w => woIndexItem(w, { hidePart: true })).join("");
    }).join("");
    const loose = groups.get("") || [];
    if (loose.length) {
      // Named, not left as an empty heading: 0 of 33 SN5 parts carry an id link,
      // so this block is the visible to-do list for the archive.
      out += woGroupHead(`<span class="pg-name">Not linked to a part</span>`, loose)
        + loose.map(w => woIndexItem(w)).join("");
    }
    return out;
  }

  let out = "", run = null;
  rows.forEach(w => {
    const g = grouping(w);
    if (g !== run) {
      run = g;
      out += woGroupHead(esc(g || "None"), rows.filter(r => grouping(r) === g));
    }
    out += woIndexItem(w);
  });
  return out;
}

function renderWOIndex() {
  const D = DB.workOrders || [];
  const rows = woIndexRows();
  const s = woSummary();
  const subs = [...new Set(D.map(w => w.subteam))].filter(Boolean).sort();
  const key = woSortKey();
  return `
  <aside class="mdindex" aria-label="Work orders index">
    <div class="pindex-head no-print">
      <div class="toolbar">
        <button class="primary ib" onclick="newWO()">${icon("plus", 15)} New WO</button>
        <button class="sm" onclick="openBlankTraveler()">Blank traveler</button>
        <span class="muted tny" style="margin-left:auto">${rows.length} of ${D.length} work orders</span>
      </div>
      <div class="psum">
        ${summaryChip("open", s.open, !!view.woOpen, "view.woOpen=!view.woOpen;view.woDone=false;render()")}
        ${summaryChip("late", s.late, !!view.woLate, "view.woLate=!view.woLate;view.woMine=false;render()", s.late ? "bad" : "")}
        ${summaryChip("mine", s.mine, !!view.woMine, "view.woMine=!view.woMine;view.woLate=false;render()")}
        ${summaryChip("done", s.done, !!view.woDone, "view.woDone=!view.woDone;view.woOpen=false;render()")}
      </div>
      <div class="pfilters">
        <input id="searchbox" placeholder="search id / part…" value="${esc(view.q)}" oninput="searchInput(this)">
        <select title="Status" onchange="view.fStatus=this.value;render()">
          <option value="">All statuses</option>
          ${WO_STATUSES.map(st => `<option ${view.fStatus === st ? "selected" : ""}>${esc(st)}</option>`).join("")}
        </select>
        <select title="Subteam" onchange="view.fSub=this.value;render()">
          <option value="">All subteams</option>
          ${subs.map(st => `<option ${view.fSub === st ? "selected" : ""}>${esc(st)}</option>`).join("")}
        </select>
        <select title="Group or sort by" onchange="sortWOsBy(this.value)">
          ${Object.keys(WO_SORT_LABELS).map(k => `<option value="${k}" ${key === k ? "selected" : ""}>${esc(WO_SORT_LABELS[k])}</option>`).join("")}
        </select>
        <button class="sm sortdir" title="Reverse order" onclick="toggleWOSortDir()">${view.sortDir === "desc" ? "▼" : "▲"}</button>
      </div>
    </div>
    <div class="plist" role="listbox" aria-label="Work orders">
      ${rows.length || (key === "gpart" && (DB.parts || []).length) ? woIndexBody(rows) : `<div class="pempty muted">${
        D.length ? "No work orders match these filters." : `No work orders yet — <b>New WO</b> to start${isLead() ? ", or <b>Load SN5 archive</b> for the retro records" : ""}.`}</div>`}
      <div class="plistfade" aria-hidden="true"></div>
    </div>
    <div class="keyhint no-print muted tny"><span><kbd>↑</kbd><kbd>↓</kbd> move</span>${
      selectedWO() ? "<span><kbd>1</kbd>–<kbd>6</kbd> jump</span>" : ""
    }<span><kbd>/</kbd> search</span><span><kbd>e</kbd> edit</span><span><kbd>esc</kbd> back</span></div>
  </aside>`;
}

/* The blank traveler used to be a naked <select> sitting in the list toolbar.
   There is no room for one in a 320px rail, and it was the only control on the
   tab that did something without a record selected. */
function openBlankTraveler() {
  openModal(`<h3>Print a blank traveler</h3>
    <p class="muted">A paper form with the standard steps for one process and nothing filled in.</p>
    <div class="f"><label>Process</label>
      <select id="blankproc">${PROCESSES.map(p => `<option>${esc(p)}</option>`).join("")}</select></div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="(function(){var v=document.getElementById('blankproc').value;closeModal();printBlankWO(v);})()">Print</button>
    </div>`);
}

/* ---------- right pane when nothing is selected ----------
   The rail answers "which run"; this answers "what is the state of the build".
   At ≤900 it is never shown, because there the rail owns the screen. */
function renderWOOverview() {
  const D = DB.workOrders || [];
  const s = woSummary();
  const tile = (n, label, cls) => `<div class="stat-tile"><div class="bignum ${cls || ""}">${n}</div><div class="stat-label">${esc(label)}</div></div>`;
  const open = D.filter(w => w.status !== "Complete");
  const curing = [], blocked = [];
  open.forEach(w => { const f = woFlags(w); if (f.curing) curing.push({ w, h: f.curing }); if (f.blocked) blocked.push({ w, b: f.blocked }); });
  const late = D.filter(isWoLate).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const mine = open.filter(w => isMine([w.moldEngineer, w.manufacturingEngineer]));
  const noRun = (DB.parts || []).filter(p => !partRuns(p).length);
  const mini = (w, right) => `<div class="pmini" onclick="selectWO('${esc(w.id)}')">
    <span class="pm-name">${esc(w.partName || w.id)}</span>
    ${woProgBar(woProgress(w))}
    <span class="pm-due">${right || (w.dueDate ? shortDate(w.dueDate) : "no date")}</span></div>`;
  return `
  <section class="mddetail" aria-label="Work orders overview">
    <div class="stat-row">
      ${tile(s.open, "Open runs")}${tile(s.late, "Behind due date", s.late ? "warn" : "")}${tile(s.curing, "Curing")}${tile(s.blocked, "Blocked", s.blocked ? "warn" : "")}
    </div>
    <div class="card">
      <h2>Runs in flight</h2>
      <div class="muted">${s.open} open · ${s.done} complete · ${D.filter(w => w.retro).length} retro records. Pick a run on the left.</div>
      ${curing.length ? `<h3>Waiting on a cure</h3>${curing.map(({ w, h }) =>
        /* An absolute clock time, never a countdown. The 60-second tick that
           keeps a countdown honest is armed only by the Steps section (see
           syncHoldTick), so a countdown painted here would be wrong a minute
           later with nothing to correct it. dashboard.js:162 made the same
           call for the same reason. */
        mini(w, "ready " + esc(h.readyAt))).join("")}` : ""}
      ${blocked.length ? `<h3>Blocked right now</h3>${blocked.map(({ w, b }) =>
        mini(w, esc(stripCS(b.title)))).join("")}` : ""}
      ${late.length ? `<h3>Behind due date</h3>${late.slice(0, 8).map(w => mini(w)).join("")}
        ${!view.woLate ? `<button class="sm no-print" onclick="view.woLate=true;view.woMine=false;render()">Show only these</button>` : ""}` : ""}
      ${mine.length ? `<h3>On you</h3>${mine.slice(0, 8).map(w => mini(w)).join("")}` : ""}
    </div>
    ${/* Only when the rail is NOT already showing them. Grouped by part (the
          default) every one of these has its own header on the left with the
          same button on it, and the pane repeating the list beside it is the
          same twelve rows twice on one screen. Grouped any other way the rail
          drops them, and this is the only place they appear. */""}
    ${noRun.length && woSortKey() !== "gpart" ? `<div class="card">
      <h3>Parts with no run yet</h3>
      <div class="muted tny">Nothing has been started for these. Starting a run copies the part's plan onto it.</div>
      ${noRun.slice(0, 12).map(p => `<div class="pmini">
        <span class="pm-name">${esc(p.partName || p.id)}</span>
        <span class="tny muted">${esc(p.subteam || "")}</span>
        <button class="sm no-print" onclick="event.stopPropagation();newRunForPart('${esc(p.id)}')">+ Start run</button>
      </div>`).join("")}
    </div>` : ""}
    <div class="card no-print">
      <h3>Paper</h3>
      <div class="muted">A blank form to take to the bench when the job is ahead of the record.</div>
      <div style="margin-top:8px"><button onclick="openBlankTraveler()">Print blank traveler</button></div>
    </div>
  </section>`;
}

function fld(wo, label, key, type) {
  const v = wo[key] ?? "";
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}</div></div>`;
  if (type === "select-status") return `<div class="f"><label>${label}</label><select onchange="updWO('${key}',this.value)">${WO_STATUSES.map(s => `<option ${v === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>`;
  if (type === "select-process") return `<div class="f"><label>${label}</label><select onchange="updWO('${key}',this.value)">${PROCESSES.map(s => `<option ${v === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>`;
  return `<div class="f"><label>${label}</label><input value="${esc(v)}" onchange="updWO('${key}',this.value)"></div>`;
}

/* ---------- the detail pane ----------
   A work order carries more than any other record here: eleven header fields, a
   mold block, the layup stack, a BOM, the steps and their buy-offs, quality
   checks, documents, files, an event log, free notes and a comment thread. As a
   full-width page that was one very long scroll with an anchor jumpbar bolted on
   top; beside a rail it would be the same scroll in three quarters of the width.

   So the pane is ordered rather than paginated: the whole record is ONE scroll,
   with Steps at the top because that is the bench action, and the bar above it
   jumps you down to a section instead of swapping which one exists.

   This was briefly one-section-at-a-time, and Simon asked for the scroll back.
   The reason is sound: on a traveler you read across sections constantly (the
   stack while signing "Stack frozen", the BOM while checking what went in), and
   a tab makes you leave one to see the other. What the bar keeps from that
   attempt is the part worth keeping — a count per section, and a dot when
   something in it needs attention, both visible without going there.

   The sections are a table rather than six inline blocks so the jump bar and
   the body cannot disagree about what exists or what order it is in. */
const WO_SECTIONS = [
  { id: "steps", label: "Steps", anchor: "wo-steps",
    badge: w => { const p = woProgress(w); return p.total ? `${p.done}/${p.total}` : ""; },
    warn: w => { const f = woFlags(w); return !!(f.blocked || f.curing); },
    warnWord: w => (woFlags(w).blocked ? "blocked" : "curing"),
    body: (w, E) => woSecSteps(w, E) },
  { id: "overview", label: "Overview", anchor: "wo-overview", badge: () => "", body: (w, E) => woSecOverview(w, E) },
  { id: "stack", label: "Stack & BOM", anchor: "wo-stack",
    badge: w => String((w.layupStack || []).length || ""),
    body: (w, E) => woSecStack(w, E) },
  { id: "photos", label: "Photos", anchor: "wo-photos",
    badge: w => String(woAllPhotos(w).length || ""),
    body: (w, E) => woSecPhotos(w, E) },
  { id: "quality", label: "Quality", anchor: "wo-quality",
    badge: w => String((w.qualityChecks || []).length || ""),
    warn: w => (w.qualityChecks || []).some(q => q.pass === false) || undisposedIssuesForWO(w.id).length > 0,
    warnWord: w => { const nf = (w.qualityChecks || []).filter(q => q.pass === false).length; return nf ? `${nf} failed` : "open issue"; },
    // Reference-shaped when empty: nothing to read, nothing wrong. Edit mode
    // keeps it open so "+ check" is on screen.
    foldWhen: (w, E) => !E && !(w.qualityChecks || []).length && !issuesForWO(w.id).length,
    body: (w, E) => woSecQuality(w, E) },
  { id: "files", label: "Files & docs", anchor: "wo-docs",
    badge: w => String(((w.docs || []).length + (w.files || []).length) || ""),
    foldWhen: (w, E) => !E && !(w.docs || []).length && !(w.files || []).length,
    body: (w, E) => woSecFiles(w, E) },
  { id: "notes", label: "Notes & log", anchor: "wo-log",
    badge: w => String((w.noteLog || []).length || ""),
    body: (w, E) => woSecNotes(w, E) },
];

/* One card per section — the card gap is the zone boundary Simon asked for
   ("distinct zones, quiet inside"). The header replaces the bare h3: same
   label the jump bar uses, the same badge()/warn() answers (one source of
   truth, they cannot disagree), and the attention dot always paired with a
   word because hue is never the only carrier. Sections that are pure
   reference while empty render as a closed <details> whose summary IS the
   header — everything stays one tap away, and woJump() opens it before
   scrolling. The anchor id lives on the header now, not on an h3 inside. */
function woSectionCard(s, wo, E) {
  const n = s.badge ? s.badge(wo) : "";
  const warn = !!(s.warn && s.warn(wo));
  const word = warn ? (s.warnWord ? s.warnWord(wo) : "attention") : "";
  const hd = tag => `<${tag} class="wosec-hd${warn ? " warn" : ""}" id="${esc(s.anchor)}">
      <span>${esc(s.label)}</span>
      ${n ? `<span class="wosec-n">${esc(n)}</span>` : ""}
      ${warn ? `<span class="secnav-dot" aria-hidden="true"></span><span class="wosec-w">${esc(word)}</span>` : ""}
    </${tag}>`;
  if (s.foldWhen && s.foldWhen(wo, E)) {
    return `<details class="card wosec wo-fold">${hd("summary")}${s.body(wo, E)}</details>`;
  }
  return `<div class="card wosec">${hd("div")}${s.body(wo, E)}</div>`;
}
/* Scroll, rather than an <a href="#wo-steps">. The app keeps a deep link in the
   URL hash (syncUrl writes #/WO-SN6-004), and an anchor would overwrite it with
   #wo-steps — so the address bar would stop naming the record you are reading
   and a copied link would land on the tab instead of the run. The old jumpbar
   did use anchors and did exactly that.

   scroll-margin-top on #main [id^="wo-"] (index.html) is what keeps the heading
   clear of the topbar and this bar. */
function woJump(anchor) {
  // A folded section's header is its <summary>, always visible — but a jump
  // to it means "show me", so open the fold before scrolling.
  const el = document.getElementById && document.getElementById(anchor);
  if (el && el.closest) { const d = el.closest("details"); if (d && !d.open) d.open = true; }
  secJump(anchor);
}

/* The part this run belongs to, for the header chip and for stackDrift().
   Deliberately the ORIGINAL loose lookup and not woPart()/partOf(): partOf
   refuses when two parts share a name, and the drift comparison has always
   accepted the looser match. Changing which part a stack is compared against is
   not a layout change. */
function woDetailPart(wo) {
  return wo.partId ? recById("parts", wo.partId)
    : DB.parts.find(p => (p.partName || "").toUpperCase() === (wo.partName || "").toUpperCase());
}

function renderWODetail() {
  const wo = woById(view.id);
  // Falls back to the OVERVIEW pane. renderWOList() no longer exists, and a
  // dangling reference here throws inside render() and blanks the page.
  if (!wo) { view.mode = "list"; return renderWOOverview(); }
  const E = view.edit;
  const linkedPart = woDetailPart(wo);
  const undisposed = undisposedIssuesForWO(wo.id);
  const fl = woFlags(wo);
  return `
  <section class="mddetail" aria-label="Work order detail" data-lbgroup="workOrders:${esc(wo.id)}">
  <div class="toolbar no-print">
    <button class="ib" onclick="clearWOSelection()">${icon("chevronLeft", 16)} All work orders</button>
    <button class="primary" onclick="view.edit=!view.edit;render()">${E ? "Done editing" : "Edit"}</button>
    <button onclick="openPrintPreview('${wo.id}')">Print</button>
    ${labelBtn("workOrders", wo.id)}
    <button onclick="createIssueFromWO('${wo.id}')">⚠ Create issue</button>
    ${E && isLead() ? `<button onclick="resetSteps(woById('${wo.id}'))">Reset steps to standard</button>
    <button class="danger" onclick="delWO('${wo.id}')">Delete</button>` : ""}
    <span class="mdnav no-print">
      <button class="sm" title="Previous work order (↑)" onclick="moveWOSelection(-1)">${icon("chevronLeft", 14)}</button>
      <button class="sm" title="Next work order (↓)" onclick="moveWOSelection(1)">${icon("chevronRight", 14)}</button>
    </span>
  </div>
  ${lineageBar("workOrders", wo.id)}
  ${/* Everything in here is true of the whole record, so it renders whichever
        section is open. A gate you can navigate away from is a gate that gets
        walked past. */""}
  <div class="card wohead">
    <h2>${esc(wo.id)} · ${esc(wo.partName || "(unnamed)")} ${wo.retro ? '<span class="pill retro">retro record</span>' : ""}</h2>
    ${/* The facts band replaces the old middle-dot run-on line: the answers
          someone actually comes for (can I work it, how far along, when is it
          due, is it on mass, whose is it) each get their own labeled slot.
          Status is the colored select — the statusdrop pattern Budget and
          tickets already use — so changing it needs no edit mode; updWO()
          still carries the CS-003 completion gate. */""}
    <div class="wo-facts">
      <span class="statusdrop ${esc(wo.status)}"><select aria-label="Status" onchange="updWO('status',this.value)">
        ${WO_STATUSES.map(s => `<option ${wo.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select></span>
      ${(() => { const p = woProgress(wo); return p.total ? woProgBar(p) : ""; })()}
      ${wo.dueDate ? `<span class="wo-fact"><span class="wf-lab">Due</span><b class="wf-num ${isWoLate(wo) ? "late" : ""}">${esc(wo.dueDate)}</b>${isWoLate(wo) ? '<span class="warn tny">late</span>' : ""}</span>` : ""}
      ${wo.weightTargetG || wo.weightActualG ? `<span class="wo-fact"><span class="wf-lab">Mass</span><b class="wf-num ${wo.weightActualG && wo.weightTargetG && +wo.weightActualG > +wo.weightTargetG ? "late" : ""}">${esc(wo.weightActualG || "—")}</b><span class="tny muted">/ ${esc(wo.weightTargetG || "—")} g</span></span>` : ""}
      ${(() => {
        const engs = [["moldEngineer", "Mold engineer"], ["manufacturingEngineer", "Manufacturing engineer"]]
          .map(([k, role]) => {
            const nm = String(wo[k] || "").trim();
            if (!nm || (typeof notAPerson === "function" && notAPerson(nm))) return "";
            const email = partEngineerEmail(wo, k);
            return `<span class="wf-eng" title="${esc(role)} — ${esc(nm)}">${avatar(email || nm, 24)}</span>`;
          }).filter(Boolean).join("");
        return engs ? `<span class="wo-fact">${engs}</span>` : "";
      })()}
    </div>
    <div class="muted tny">Rev ${esc(wo.revision)} · ${esc(wo.processType || "")}${linkedPart ? " · part " + chip("parts", linkedPart.id, linkedPart.id) : ""}${wo.updatedAt ? ` · last saved ${fmtWhen(wo.updatedAt)} by ${esc(wo.updatedBy || "?")}` : ""}</div>
    ${undisposed.length ? `<div class="gate blocked"><span class="gi">✕</span><div><b>Can't complete this work order</b> — ${undisposed.length} linked issue${undisposed.length > 1 ? "s" : ""} (${undisposed.map(i => chip("projects", i.id, i.id)).join(", ")}) isn't disposed yet. You don't have to resolve ${undisposed.length > 1 ? "them" : "it"} right now, but ${undisposed.length > 1 ? "they need" : "it needs"} a resolution method before this WO can close.</div></div>` : ""}
    ${fl.blocked ? `<p class="gate blocked"><span class="gi">✕</span><span>Blocked by an unsigned blocker: <b>${esc(stripCS(fl.blocked.title))}</b>. <button class="link no-print" onclick="woJump('wo-steps')">Go to steps</button></span></p>` : ""}
    ${fl.curing ? `<p class="gate"><span class="gi">⚠</span><span>Curing until <b>${esc(fl.curing.readyAt)}</b>${fl.curing.resin ? ` · ${esc(fl.curing.resin.label)}` : ""}. <button class="link no-print" onclick="woJump('wo-steps')">Go to steps</button></span></p>` : ""}
    ${E ? `<div class="editnote no-print">${icon("edit", 14)} Editing — every change saves as you make it.</div>` : ""}
  </div>
  ${/* A jump bar, not a switch: every section below is rendered, this scrolls
        to one. Carries the count and the attention dot so you can see there are
        five plies, or that a quality check failed, without going there. */""}
  <nav class="secnav no-print" aria-label="Jump to a section of this work order">
    ${WO_SECTIONS.map((s, i) => {
      const n = s.badge ? s.badge(wo) : "";
      const warn = s.warn && s.warn(wo);
      return `<button type="button" class="secnav-btn ${n ? "" : "empty"} ${warn ? "warn" : ""}"
        id="wosec-${esc(s.id)}" title="${esc(s.label)} (${i + 1})"
        onclick="woJump('${esc(s.anchor)}')">${esc(s.label)}${n ? `<span class="secnav-n">${esc(n)}</span>` : ""}${warn ? '<span class="secnav-dot" aria-hidden="true"></span>' : ""}</button>`;
    }).join("")}
  </nav>
  ${WO_SECTIONS.map(s => woSectionCard(s, wo, E)).join("")}
  </section>`;
}

function woSecOverview(wo, E) {
  const moldRows = wo.mold ? `
    <h3>Mold</h3><div class="grid">
      ${mf(wo, "Mold ID", "moldId")}${mf(wo, "Layers", "layers")}${mf(wo, "Density (lb/ft³)", "density")}
      ${mf(wo, "Sealing", "sealingType")}${mf(wo, "Location (update on every move)", "location")}
    </div>` : "";
  return `
    <div class="grid">
      ${fld(wo, "Part name", "partName")}${fld(wo, "Subteam", "subteam")}${fld(wo, "Status", "status", "select-status")}
      ${fld(wo, "Process", "processType", "select-process")}${engFld("workOrders", wo, "Mold Engineer", "moldEngineer")}
      ${engFld("workOrders", wo, "Manufacturing Engineer", "manufacturingEngineer")}${fld(wo, "Created", "createdDate")}${fld(wo, "Due", "dueDate")}
      ${fld(wo, "Revision", "revision")}${fld(wo, "Mass target (g)", "weightTargetG")}${fld(wo, "Mass actual (g)", "weightActualG")}
    </div>
    ${moldRows}`;
}

/* Stack and BOM share a section because both answer "what goes into this part"
   and neither is long enough to own a tab of its own. */
function woSecStack(wo, E) {
  const linkedPart = woDetailPart(wo);
  const stack = (() => {
    // The run's stack is what it actually laid. Say plainly whether that is
    // still the part's plan or has diverged from it, and make the difference
    // one click away rather than something you reconstruct by eye.
    const drift = linkedPart ? stackDrift(linkedPart, wo) : { rows: {}, n: 0 };
    const diverged = wo.stackSource === "asbuilt" && drift.n > 0;
    const src = !linkedPart ? ""
      : diverged
        ? ` <span class="muted nocaps">· as built on this run</span>`
        : ` <span class="muted nocaps">· follows the plan on ${esc(linkedPart.id)}</span>`;
    return `<h3>Layup stack${src} ${wo.stackNote ? `<span class="muted nocaps">· ${esc(wo.stackNote)}</span>` : ""}</h3>
    ${diverged ? `<div class="stack-diff no-print">${icon("warning", 14)}
      <span>${drift.n} ${drift.n === 1 ? "ply differs" : "plies differ"} from ${esc(linkedPart.partName || linkedPart.id)}'s plan.</span>
      <button class="link" onclick="openStackCompare('${esc(wo.id)}')">Compare</button></div>` : ""}
    ${stackFrozen(wo) ? `<div class="tny muted no-print">Stack frozen — the bench is working to this. Editing the part's plan will not move it.</div>` : ""}
    ${plyTable("workOrders", wo, { edit: E, drift: diverged ? drift.rows : {} })}`;
  })();
  return `
    ${stack}
    <h3 id="wo-bom">BOM</h3>
    <table class="sub"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Source</th><th>Est. cost</th></tr></thead><tbody>
      ${(wo.bom || []).map((b, i) => E
        ? `<tr><td><input value="${esc(b.item)}" onchange="ub(${i},'item',this.value)"></td><td><input value="${esc(b.qty)}" onchange="ub(${i},'qty',this.value)"></td><td><input value="${esc(b.unit)}" onchange="ub(${i},'unit',this.value)"></td><td><input value="${esc(b.source)}" onchange="ub(${i},'source',this.value)"></td><td><input value="${esc(b.estCost)}" onchange="ub(${i},'estCost',this.value)"></td></tr>`
        : `<tr><td>${esc(b.item)}</td><td>${esc(b.qty)}</td><td>${esc(b.unit)}</td><td>${esc(b.source)}</td><td>${esc(b.estCost)}</td></tr>`).join("")}
    </tbody></table>
    ${E ? `<button onclick="woById('${wo.id}').bom.push({item:'',qty:'',unit:'',source:'',estCost:''});saveWO(woById('${wo.id}'),'bom');render()">+ BOM line</button>` : ""}`;
}

function woSecSteps(wo, E) {
  return `
    <div class="tny muted no-print">Shaded steps are blockers: no sign-off, no moving on. A hold waits on the clock instead.</div>
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
      const ev = stepEvidence(wo, i);
      const needsEv = state !== "done" && state !== "failed" && ev.missing.length;
      const isNow = i === nextIdx;
      /* Blocker and hold finally look different, because they are: a blocker
         is a person withholding a signature (amber, in-work-shaped), a hold
         is the clock (slate — the parked color — with a clock glyph). They
         used to share one amber wash. */
      const rowCls = `step ${blocker ? "is-blocker" : ""} ${held ? "is-held" : ""} ${state === "done" ? "done" : ""} ${state === "failed" ? "failed" : ""} ${isNow ? "upnext" : ""}`;
      const titleLine = `<div class="step-title">${esc(stripCS(s.title))}
        ${isNow ? '<span class="step-badge now">now</span>' : ""}
        ${blocker ? '<span class="step-badge">blocker</span>' : ""}
        ${hold && state !== "done" ? ` <span class="step-badge hold">◷ hold ${hold.hours} h</span>` : ""}
        ${/frozen/i.test(s.title) ? `<button class="link no-print" onclick="woJump('wo-stack')">View stack</button>` : ""}</div>`;
      // What a signed row can tuck away: everything historical. Open rows
      // keep it all inline — that is what you act on.
      const metas = `
          ${s.trainingOverride ? `<div class="meta">Signed without ${esc(TRAININGS[s.trainingOverride.training] || s.trainingOverride.training)} training by ${esc(s.trainingOverride.by)}. See the event log.</div>` : ""}
          ${s.evidenceOverride ? `<div class="meta">Signed without ${esc(evidenceLabels(s.evidenceOverride.missing || []).join(" and "))} by ${esc(s.evidenceOverride.by)}. See the event log.</div>` : ""}
          ${hold && hold.overridden ? `<div class="meta">Hold overridden by ${esc(hold.override.by)}, ${esc(String(hold.override.hoursShort))} h short. See the event log.</div>` : ""}
          ${startsHold(s) && s.cure ? `<div class="meta">${esc(cureSummary(s.cure))}</div>` : ""}
          ${s.notes ? `<div class="meta">${esc(s.notes)}</div>` : ""}
          ${stepPhotoStrip(wo, i, s)}`;
      const hasExtras = !!(s.trainingOverride || s.evidenceOverride || (hold && hold.overridden) ||
        (startsHold(s) && s.cure) || String(s.notes || "").trim() || (s.photoRefs || []).length);
      /* A signed run of ten steps used to dominate the page. Done rows fold
         their history behind a one-line <details> summary saying what is in
         there — everything stays in the DOM, one tap away. Edit mode keeps
         it all inline: editing is when you need the note input on screen. */
      const foldDone = state === "done" && !E && hasExtras;
      const doneSummary = [
        (s.photoRefs || []).length ? `${(s.photoRefs || []).length} photo${(s.photoRefs || []).length > 1 ? "s" : ""}` : "",
        String(s.notes || "").trim() ? "note" : "",
        startsHold(s) && s.cure ? "cure record" : "",
        (s.trainingOverride || s.evidenceOverride || (hold && hold.overridden)) ? "override" : "",
      ].filter(Boolean).join(" · ");
      return `<div class="${rowCls}">
        <div class="num">${s.seq}</div>
        <div class="body">
          ${titleLine}
          ${/* Said on the row, not only in the modal you get after pressing a
                disabled button — the point is to know what to go and do BEFORE
                you walk over to sign. One line, no citation, same register as
                the hold banner. */""}
          ${needsEv ? `<p class="gate"><span class="gi">⚠</span><span>Needs ${esc(evidenceLabels(ev.missing).join(" and "))} before it can be signed.</span></p>` : ""}
          ${(() => { /* Personal, not a record truth like the evidence line: said
                quietly on the row so you know before you walk over to sign,
                never as a disabled button. */
            const tr = stepTraining(s);
            return tr && state !== "done" && state !== "failed" && !wo.retro && !s.trainingOverride && !hasTraining(myEmail(), tr)
              ? `<div class="meta no-print">Needs ${esc(TRAININGS[tr] || tr)} training to sign.</div>` : ""; })()}
          ${held ? holdBanner(hold, i) : ""}
          ${foldDone
            ? `<details class="step-more"><summary class="step-disclose">${esc(doneSummary)}</summary>${metas}</details>`
            : metas}
          <!-- Deliberately still a one-line control at rest. This is filled in
               at the bench, on a phone, with gloves on; a bubble menu and a
               slash menu there would be worse than what was here. The button
               beside it opens the full composer in a modal for the case the
               placeholder used to describe — its old text was literally
               "notes / photo filenames", i.e. the workaround for attaching a
               photo was to TYPE THE FILENAME. -->
          ${E ? `<div class="meta no-print stepnote"><input placeholder="notes" value="${esc(s.notes)}" onchange="us(${i},'notes',this.value)">
            <button class="ib sm" title="Write a longer note, with photos" aria-label="Write a longer note for step ${s.seq}" onclick="openStepNote('${wo.id}',${i})">${icon("image", 14)}</button></div>` : ""}
        </div>
        <div class="buyoff">
          ${state === "failed"
            ? `<span class="warn">✗ ${esc(s.status)}</span>`
            : state === "done"
              ? (isSigned(s)
                ? `<span class="ok">✔ ${avatar(s.buyoff.email || s.buyoff.name, 18)} ${esc(s.buyoff.name)} ${esc(s.buyoff.date || "")}</span>`
                : `<span class="muted">done, buy-off not recorded (retro)</span>`)
              : (wo.retro ? `<span class="muted">${esc(s.status || "open")}</span>`
                : held && !isLead()
                  ? `<button disabled title="curing — ${esc(fmtLeft(hold.msLeft))}">buy off as ${esc(signerName())}</button>`
                  : /* Not disabled when evidence is missing: pressing it is how
                       you find out WHAT is missing and get the button that
                       fixes it. A dead grey button with a tooltip nobody on a
                       phone can hover is the version of this that fails. The
                       up-next row's button is the section's one primary. */
                    `<button ${isNow ? 'class="primary"' : ""} onclick="buyoff(${i})" ${blocked ? "disabled title='blocked by unfinished blocker: " + esc(blocked.title) + "'" : ""}>buy off as ${esc(signerName())}</button>`)}
        </div>
      </div>`;
      }).join("");
    })()}`;
}

function woSecQuality(wo, E) {
  const issues = issuesForWO(wo.id);
  return `
    ${issues.length ? `<h3>Issues</h3>
    <div class="stagerow">${issues.map(i => chip("projects", i.id, (i.resolutionMethod ? "✓ " : "") + (i.title || i.id))).join(" ")}</div>` : ""}
    <h3>Quality checks / acceptance criteria</h3>
    <table class="sub"><thead><tr><th>Criterion</th><th>Target (set at creation!)</th><th>Actual</th><th>Pass</th></tr></thead><tbody>
      ${(wo.qualityChecks || []).map((q, i) => E
        ? `<tr><td><input value="${esc(q.criterion)}" onchange="uq(${i},'criterion',this.value)"></td><td><input value="${esc(q.target)}" onchange="uq(${i},'target',this.value)"></td><td><input value="${esc(q.actual)}" onchange="uq(${i},'actual',this.value)"></td><td><select onchange="uq(${i},'pass',this.value==='true'?true:this.value==='false'?false:null)"><option ${q.pass == null ? "selected" : ""}>—</option><option value="true" ${q.pass === true ? "selected" : ""}>pass</option><option value="false" ${q.pass === false ? "selected" : ""}>FAIL</option></select></td></tr>`
        : `<tr><td>${esc(q.criterion)}</td><td>${esc(q.target)}</td><td>${esc(q.actual)}</td><td>${q.pass === true ? '<span class="ok">pass</span>' : q.pass === false ? '<span class="warn">FAIL</span>' : "—"}</td></tr>`).join("")}
    </tbody></table>
    ${E ? `<button onclick="woById('${wo.id}').qualityChecks.push({criterion:'',target:'',actual:'',pass:null});saveWO(woById('${wo.id}'),'qualityChecks');render()">+ check</button>` : ""}`;
}

/* The Photos section: every photo on the record, wherever it was written
   (step photoRefs, image files, note <img>s — woAllPhotos), grouped by step
   because that is the review question ("show me the bag before pull"). Tiles
   are real <img loading="lazy"> with data-lb-src, so the existing lightbox
   collects them and the arrows walk the whole record. Record-level adds go
   to wo.files through the same picker every record uses. */
function addWOPhotos(id) { addRecordFiles("workOrders", id, null, "image/*"); }
function phTile(p, wo, E) {
  const label = p.caption || p.name;
  const tip = [p.name, p.by ? "by " + userName(p.by) : "", p.ts ? String(p.ts).slice(0, 10) : ""].filter(Boolean).join(" · ");
  return `<figure class="phtile">
    <img class="phimg" loading="lazy" src="${esc(p.url)}" data-lb-src="${esc(p.url)}" data-lb-name="${esc(p.name)}" alt="${esc(label)}" title="${esc(tip)}">
    ${E && p.source === "step" && p.id
      ? `<input class="phcap" placeholder="caption" value="${esc(p.caption || "")}" onchange="setStepPhotoCaption('${esc(wo.id)}',${p.stepIndex},'${esc(p.id)}',this.value)">`
      : `<figcaption class="tny muted">${esc(label)}</figcaption>`}
  </figure>`;
}
function woSecPhotos(wo, E) {
  const all = woAllPhotos(wo).map(p => {
    // phTile edits captions by photoRefs id; carry it through the aggregate.
    if (p.source === "step" && p.stepIndex != null) {
      const ref = ((wo.steps[p.stepIndex] || {}).photoRefs || []).find(r => r && r.url === p.url);
      if (ref && ref.id) p.id = ref.id;
    }
    return p;
  });
  if (!all.length) {
    return `<p class="muted">Photos are the record — what did the bag look like before pull? Nobody remembers in March.</p>
      <div class="no-print addrow"><button class="primary" onclick="addWOPhotos('${wo.id}')">+ Add photos</button></div>`;
  }
  const bySteps = new Map();
  for (const p of all) {
    const k = p.stepIndex != null ? p.stepIndex : -1;
    if (!bySteps.has(k)) bySteps.set(k, []);
    bySteps.get(k).push(p);
  }
  const groups = [...bySteps.keys()].sort((a, b) => (a === -1 ? 1 : b === -1 ? -1 : a - b));
  return `
    ${groups.map(k => `
      <div class="tny muted phgrp">${k === -1 ? "General" : `Step ${k + 1} · ${esc(bySteps.get(k)[0].stepTitle || "")}`}</div>
      <div class="photogrid">${bySteps.get(k).map(p => phTile(p, wo, E)).join("")}</div>`).join("")}
    <div class="no-print addrow"><button onclick="addWOPhotos('${wo.id}')">+ Add photos</button></div>`;
}
/* The per-step strip: the photos live where the work happened. View mode and
   edit mode both get the camera — the bench is not in edit mode, and a photo
   is documentation, not editing. */
function stepPhotoStrip(wo, i, s) {
  const refs = s.photoRefs || [];
  const shown = refs.slice(0, 5);
  return `<div class="step-photos" data-photo-slot="step" data-wo="${esc(wo.id)}" data-step="${i}">
    ${shown.map(p => {
      const url = typeof p === "string" ? p : p.url;
      const name = typeof p === "string" ? p : (p.caption || p.name || "photo");
      return url ? `<img class="phmini" loading="lazy" src="${esc(url)}" data-lb-src="${esc(url)}" data-lb-name="${esc(name)}" alt="${esc(name)}">` : "";
    }).join("")}
    ${refs.length > 5 ? `<button class="sm no-print" onclick="woJump('wo-photos')">+${refs.length - 5} more</button>` : ""}
    <button class="ib sm no-print" title="Add photos to this step" aria-label="Add photos to step ${s.seq}" onclick="addStepPhotos('${esc(wo.id)}',${i})">${icon("image", 14)}</button>
  </div>`;
}

/* Documents and Files are one section because EVIDENCE.file.has() accepts
   either — split across two tabs, the design-review gate would look
   unsatisfiable from whichever one you happened to be looking at. */
function woSecFiles(wo, E) {
  return `
    <!-- The mold drawing, the CAM notes, the DRB deck: the documents that
         explain this job. They used to be a Slack paste, which meant they were
         findable for a day (PP-09). -->
    <h3>Documents</h3>
    ${docLinkList(wo.docs, { onRemove: `rmWoDoc`, empty: "No documents linked yet.", addLabel: "+ Link a document" })}
    <div class="no-print addrow"><button onclick="openDocLinkModal({ coll: 'workOrders', id: '${wo.id}' })">+ Link a document</button></div>
    <!-- Files: a work order could link a Google Doc but not hold a file, so the
         mold CAD lived wherever somebody last pasted it. The design review
         buy-off now wants it here (or linked above — either satisfies the
         check; the CAD really does live in Drive). -->
    <h3 id="wo-files">Files</h3>
    <div class="filegrid">
      ${(wo.files || []).map(fileItem).join("") || '<span class="muted">No files yet.</span>'}
    </div>
    <div class="no-print addrow"><button onclick="addRecordFiles('workOrders','${wo.id}')">+ Add files</button></div>`;
}

function woSecNotes(wo, E) {
  return `
    <h3>Event log</h3>
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
    ${/* Click the text to write. `notes` stays a plain string because print.js
          prints it onto the paper traveler; the markup lives beside it in
          notesHtml. See richField(). */""}
    ${richField("workOrders", wo.id, "notes", {
      plain: true, label: "Notes",
      empty: "Anything about this job that isn't a step.",
      upload: name => `projects/${wo.id}/${Date.now()}-${name}`,
    })}
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
    })()}`;
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
    ${lotFieldsHtml(prior)}
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
  const cure = { resin: id, startedAt, ...readLotFields() };
  if (tempRaw !== "" && tempRaw != null && !isNaN(Number(tempRaw))) cure.tempC = Number(tempRaw);
  closeModal();
  signStep(i, { cure });
}

/* ---------- which lots went in ----------
 *
 * This lives in the cure modal and nowhere else, on purpose. That modal is
 * already the one moment somebody is standing at the part having just mixed
 * resin, and it already asks what went in and when. A separate prompt would be
 * a second interruption at the same instant, and the second one is the one
 * people learn to dismiss.
 *
 * THE DESIGN IS DEFAULT-AND-CONFIRM, NOT SELECT.
 * What actually happens at 11pm is that nothing gets scanned: the roll is
 * already unrolled, the jug is "the one that was open", and the phone is across
 * the room because their hands are covered in resin. So each field is
 * pre-filled with the most recently opened lot of that class and asks for one
 * confirmation. Right by default about 90% of the time beats blank 100% of the
 * time, and it costs one tap instead of three scans.
 *
 * "I don't know" IS A VALID ANSWER and records lotSource: "unknown". A gate
 * that can only be satisfied by a lie gets satisfied by a lie — the same
 * principle as the "not recorded (retro)" sentinel in the SN5 work orders and
 * CS-013 §8's ban on fabricated buy-offs. An honest `unknown` is worth more
 * than a confident wrong lot, and it is the second-order failure that matters:
 * with two jugs on the bench, scanning the NEAREST one produces a precise,
 * confident, wrong record.
 */
const LOT_FIELDS = [
  ["lotFabric", "Fabric", "FAB"],
  ["lotResin", "Resin", "RSN"],
  ["lotHardener", "Hardener", "RSN"],
];

// The lot most recently opened for a class: the one that is physically on the
// bench, assuming CS-011's "one open container per material" rule is kept.
function defaultLot(cls, role) {
  const cand = (DB.lots || [])
    .filter(l => l.cls === cls && l.stage === "Open")
    .filter(l => !role || !l.role || l.role === role)
    .sort((a, b) => String(b.openedOn || "").localeCompare(String(a.openedOn || "")));
  return cand.length ? cand[0].id : "";
}

function lotFieldsHtml(prior) {
  const any = (DB.lots || []).length;
  if (!any) {
    return `<p class="gate"><span class="gi">!</span><span>No material lots exist yet, so this layup
      can't record which roll and which jug went in. Add them under <b>Inventory</b> and label the
      containers; then this asks one question instead of nobody being able to answer it in March.</span></p>`;
  }
  return `<h3 style="margin-bottom:2px">Which lots went in</h3>
    <p class="muted tny" style="margin-top:0">Pre-filled with whatever is currently open. Change it if it's wrong,
    and say so if you don't know — an honest "not recorded" is worth more than a confident guess.</p>
    ${LOT_FIELDS.map(([key, label, cls]) => {
      const role = key === "lotResin" ? "resin" : key === "lotHardener" ? "hardener" : "";
      const cur = prior[key] != null ? prior[key] : defaultLot(cls, role);
      const opts = (DB.lots || []).filter(l => l.cls === cls && (!role || !l.role || l.role === role));
      return `<div class="field"><label for="${key}">${esc(label)}</label>
        <div style="display:flex;gap:8px">
          <select id="${key}" style="flex:1 1 auto;min-width:0">
            ${opts.map(l => `<option value="${esc(l.id)}" ${l.id === cur ? "selected" : ""}>${esc(l.name || l.id)}${l.vendorLot ? " · lot " + esc(l.vendorLot) : ""}</option>`).join("")}
            <option value="unknown" ${cur === "unknown" ? "selected" : ""}>I don't know / not recorded</option>
          </select>
          ${typeof scanSupported === "function" && scanSupported()
            ? `<button type="button" class="sm ib" title="Scan the container's label" onclick="scanLotInto('${key}','${cls}')">${icon("scan", 15)}</button>` : ""}
        </div></div>`;
    }).join("")}`;
}

/* Scanned beats remembered, and the record says which it was. lotSource is a
   first-class field precisely so an inferred lot is distinguishable from a
   verified one rather than both looking equally authoritative in March. */
const LOT_SCANNED = {};
function scanLotInto(key, cls) {
  openScan({
    title: "Scan the container",
    hint: "Point the camera at the label on the roll or jug.",
    accept: id => String(id).startsWith(cls + "-"),
    onCode: id => {
      const sel = document.getElementById(key);
      if (sel && [...sel.options].some(o => o.value === id)) { sel.value = id; LOT_SCANNED[key] = true; }
      else toast(`${id} isn't in Inventory yet.`, "error");
    },
  });
}

function readLotFields() {
  if (!(DB.lots || []).length) return {};
  const out = {};
  let anyKnown = false, anyScanned = false, anyUnknown = false;
  for (const [key] of LOT_FIELDS) {
    const el = document.getElementById(key);
    const v = el ? el.value : "";
    if (!v || v === "unknown") { anyUnknown = true; continue; }
    out[key] = v;
    anyKnown = true;
    if (LOT_SCANNED[key]) anyScanned = true;
  }
  for (const k of Object.keys(LOT_SCANNED)) delete LOT_SCANNED[k];
  out.lotSource = !anyKnown ? "unknown" : anyScanned ? "scanned" : anyUnknown ? "partial" : "recalled";
  return out;
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
    <div class="field"><label>FEB holds it</label><div class="ro">${r.febHoldH} h — longer than the datasheet asks for, on purpose.${r.overridden ? " (set from the app by a lead, not the code table)" : ""}</div></div>
    ${r.febBy ? `<div class="field"><label>Signed off by</label><div class="ro">${esc(r.febBy)}</div></div>` : ""}
    ${h.tempC != null ? `<div class="field"><label>Shop temperature recorded</label><div class="ro">${esc(String(h.tempC))} °C${holdIsCold(h) ? ` — below the ${r.refTempC} °C the datasheet number is quoted at` : ""}</div></div>` : ""}
    <div class="foot">
      ${typeof openEditResinHold === "function" && isLead() ? `<button onclick="closeModal();openEditResinHold('${esc(r.id)}')">Change this hold…</button>` : ""}
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

/* What's missing, why it matters, and the shortest path to fixing it. Modelled
   on openHoldOverride(): naming the thing and putting the fix one tap away is
   what stops a gate being worked around outside the app, which is worse than no
   gate at all because then it isn't written down anywhere. */
function openEvidenceModal(i) {
  const w = woById(view.id);
  const s = w.steps[i];
  const ev = stepEvidence(w, i);
  const rows = ev.missing.map(k => {
    const r = EVIDENCE[k];
    return `<p class="gate blocked"><span class="gi">✕</span><span><b>Needs ${esc(r.label)}.</b> ${esc(r.why)}<br>
      <span class="muted">${esc(r.fix)}</span></span></p>`;
  }).join("");
  openModal(`
    <h2>Can't sign off yet</h2>
    <p class="muted">${esc(stripCS(s.title))} — step ${s.seq} of ${esc(w.id)}.</p>
    ${rows}
    <div class="foot">
      <button onclick="closeModal()">Close</button>
      ${ev.missing.includes("note") ? `<button class="primary" onclick="closeModal();openStepNote('${w.id}',${i})">Write the note</button>` : ""}
      ${ev.missing.includes("file") ? `<button class="primary" onclick="closeModal();addRecordFiles('workOrders','${w.id}')">Add the file</button>` : ""}
      ${isLead() ? `<button class="danger" onclick="openEvidenceOverride(${i})">Sign without it</button>` : ""}
    </div>
  `);
}
/* A lead can sign anyway, and it costs a sentence. Same bargain as the cure
   hold: a gate nobody can ever pass gets worked around, and an unlogged
   exception is worth nothing to whoever reads this record in March. */
function openEvidenceOverride(i) {
  const w = woById(view.id);
  const ev = stepEvidence(w, i);
  const what = evidenceLabels(ev.missing).join(" and ");
  openModal(`
    <h2>Sign without ${esc(what)}?</h2>
    <p class="gate"><span class="gi">⚠</span><span>This goes in the event log with your name, the time, and what was missing.</span></p>
    <div class="field"><label for="ev-why">Why is this being signed without it?</label>
      <textarea id="ev-why" autofocus rows="3" placeholder="Where the evidence actually is, or why it doesn't exist"></textarea>
    </div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="danger" onclick="submitEvidenceOverride(${i})">Sign it anyway</button>
    </div>
  `);
}
function submitEvidenceOverride(i) {
  const el = document.getElementById("ev-why");
  const why = (el ? el.value : "").trim();
  if (!why) { toast("An override needs a reason. That's the whole point of it.", "error"); return; }
  const w = woById(view.id);
  const ev = stepEvidence(w, i);
  const what = evidenceLabels(ev.missing).join(" and ");
  closeModal();
  const ov = { by: signerName(), email: myEmail(), at: new Date().toISOString(), missing: ev.missing.slice(), reason: why };
  w.timeline = w.timeline || [];
  w.timeline.push({
    date: today(),
    note: `“${stripCS(w.steps[i].title)}” signed by ${ov.by} without ${what}. Reason: ${why}`,
  });
  saveWO(w, "timeline");
  signStep(i, { evidenceOverride: ov });
}

/* Who may sign, before what the signature needs. The gate names the training,
   shows who on the roster holds it, and for a lead puts the override one tap
   away — same bargain as evidence and cure holds. Leads are NOT implicitly
   qualified: an untrained lead signing leaves a reasoned record, not a silent
   pass. Retro WOs and untagged steps never get here. */
function openTrainingGate(i, tr) {
  const w = woById(view.id);
  const s = w.steps[i];
  const q = qualifiedFor(tr);
  const who = q.length
    ? `<p class="muted" style="margin-bottom:4px">Any of these people can sign this step:</p>
       <div class="trwrap">${q.map(u => `<span class="chip">${avatar(u, 20)} ${esc(u.name || u.email)}</span>`).join("")}</div>`
    : `<p class="muted">Nobody on the roster holds this training yet — a lead can grant it on the People tab.</p>`;
  openModal(`
    <h2>Not yet — this step needs ${esc(TRAININGS[tr] || tr)} training</h2>
    <p class="muted">${esc(stripCS(s.title))} — step ${s.seq} of ${esc(w.id)}.</p>
    <p class="gate blocked"><span class="gi">✕</span><span><b>You're not recorded as ${esc(TRAININGS[tr] || tr)}-trained.</b>
      Trainings are granted by a lead on the People tab.</span></p>
    ${who}
    <div class="foot">
      <button onclick="closeModal()">Close</button>
      ${isLead() ? `<button class="danger" onclick="openTrainingOverride(${i},'${tr}')">Sign without it</button>` : ""}
    </div>
  `);
}
function openTrainingOverride(i, tr) {
  openModal(`
    <h2>Sign without ${esc(TRAININGS[tr] || tr)} training?</h2>
    <p class="gate"><span class="gi">⚠</span><span>This goes in the event log with your name, the time, and the missing training.</span></p>
    <div class="field"><label for="tr-why">Why is this being signed by someone untrained?</label>
      <textarea id="tr-why" autofocus rows="3" placeholder="Who supervised, or why the training doesn't apply here"></textarea>
    </div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="danger" onclick="submitTrainingOverride(${i},'${tr}')">Sign it anyway</button>
    </div>
  `);
}
function submitTrainingOverride(i, tr) {
  const el = document.getElementById("tr-why");
  const why = (el ? el.value : "").trim();
  if (!why) { toast("An override needs a reason. That's the whole point of it.", "error"); return; }
  const w = woById(view.id);
  closeModal();
  const ov = { by: signerName(), email: myEmail(), at: new Date().toISOString(), training: tr, reason: why };
  w.timeline = w.timeline || [];
  w.timeline.push({
    date: today(),
    note: `“${stripCS(w.steps[i].title)}” signed by ${ov.by} without ${TRAININGS[tr] || tr} training. Reason: ${why}`,
  });
  saveWO(w, "timeline");
  // Merge the override onto the step, then rejoin the normal pipeline so the
  // evidence, photo, and cure gates still apply to this signature.
  Object.assign(w.steps[i], { trainingOverride: ov });
  saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], trainingOverride: ov }; return steps; });
  buyoff(i);
}

async function buyoff(i) {
  const w = woById(view.id);
  const blocked = blockerOpenBefore(w, i);
  if (blocked) { toast("Blocked by unfinished blocker: " + blocked.title, "error"); return; }
  // Who may sign, before what the signature needs: identity is the cheapest
  // check, and failing it after someone typed an evidence note wastes the note.
  const tr = stepTraining(w.steps[i]);
  if (tr && !w.retro && !hasTraining(myEmail(), tr) && !w.steps[i].trainingOverride) {
    openTrainingGate(i, tr);
    return;
  }
  // What the signature has to come with. Before the cure path, because a cure
  // modal that collects a resin and a time and THEN refuses to sign has wasted
  // the one moment somebody was standing at the part with the answer.
  const ev = stepEvidence(w, i);
  if (ev.missing.length) { openEvidenceModal(i); return; }
  // Suggested, not required — and Cancel now IS the camera: it opens the
  // picker for this step, and when the photo lands the buy-off resumes on
  // its own. One gesture covers "sign it, with the photo it deserves".
  if (ev.suggested.includes("photo") && !(await confirmAsync(
      "No photo on this step. A photo of what you signed for is the difference between a record and a name.",
      { title: "Sign without a photo?", ok: "Sign it anyway", danger: false }))) {
    addStepPhotos(w.id, i, { then: () => buyoff(i) });
    return;
  }
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

/* ---------- keyboard ----------
   Same contract as partsKeydown() and moldsKeydown(): a pure function that
   returns the name of the action it took (or null), so a test can drive it
   without constructing a KeyboardEvent.

   All three handlers are bound to document at once, so the view.tab guard has
   to come first — right after the modifier check. */
function woNeighborId(dir) {
  const rows = woIndexRows();
  if (!rows.length) return null;
  const i = rows.findIndex(w => w.id === view.id);
  if (i < 0) return rows[dir > 0 ? 0 : rows.length - 1].id;
  return rows[Math.min(rows.length - 1, Math.max(0, i + dir))].id;
}
function moveWOSelection(dir) { const id = woNeighborId(dir); if (id) selectWO(id); }

function woKeydown(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (typeof view === "undefined" || view.tab !== "workorders") return null;
  const modal = document.getElementById("modal");
  if (modal && typeof modal.className === "string" && modal.className.includes("open")) return null;
  const t = e.target || {};
  const tag = String(t.tagName || "").toUpperCase();
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  const k = e.key;
  if (typing) {
    // Escape gets you out of the search box; nothing else is stolen from a
    // field you are typing in.
    if (k === "Escape" && t.blur) { t.blur(); return "blur"; }
    return null;
  }
  if (k === "ArrowDown" || k === "j") { if (e.preventDefault) e.preventDefault(); moveWOSelection(1); return "next"; }
  if (k === "ArrowUp" || k === "k") { if (e.preventDefault) e.preventDefault(); moveWOSelection(-1); return "prev"; }
  if (k === "Enter" && view.mode !== "detail") { const id = woNeighborId(1); if (id) { selectWO(id); return "open"; } return null; }
  if (k === "Escape" && view.mode === "detail") { clearWOSelection(); return "clear"; }
  if (k === "/") {
    if (e.preventDefault) e.preventDefault();
    const s = document.getElementById("searchbox");
    if (s && s.focus) s.focus();
    return "search";
  }
  if (k === "e" && view.mode === "detail") { view.edit = !view.edit; render(); return "edit"; }
  /* 1-7 scroll to a section of the open record. Digits are free here in a way
     they are not on Parts, which spends 1/2/3 advancing stages: a work order
     has no stage enum to advance. There is no ←/→ any more, because with the
     whole record in one scroll there is no "current section" for them to step
     from — that was a switch, and this is a jump. */
  if (view.mode === "detail" && /^[1-7]$/.test(k) && WO_SECTIONS[+k - 1]) {
    if (e.preventDefault) e.preventDefault();
    woJump(WO_SECTIONS[+k - 1].anchor);
    return "section";
  }
  return null;
}
document.addEventListener("keydown", woKeydown);
