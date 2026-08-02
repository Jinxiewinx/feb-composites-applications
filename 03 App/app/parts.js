"use strict";
/* parts.js — the Parts tab, as a master–detail split.
   The SN5 "Composites Part Tracker" reborn: the team tracks a part through
   three parallel stages (CAD → Mold → Layup), each its own progress enum, not
   one lifecycle status.

   SHAPE. Above 900px the tab is one screen with two panes: a persistent index
   on the left and the selected part on the right. Nothing is ever destroyed —
   opening a part doesn't throw away the list, and going back doesn't throw
   away the part. ↑/↓ (or j/k) walk the index without the mouse. At or below
   900px the same markup collapses to the old one-page-at-a-time behaviour
   (index, tap, detail, back) purely in CSS, so a phone never gets a squeezed
   two-pane layout — see the responsive block at the end of index.html.

   view.mode stays the single source of truth ("detail" = a part is selected),
   so openRecord("parts", id) from a chip, ⌘K search, the Dashboard, People or
   the Timeline lands here correctly with no special case. */

const SUBTEAMS = ["AERO", "BERGO", "AUTO-MECH"];
const LAYUP_TYPES = ["MOLD INFUSION", "GLASS INFUSION", "MOLD WET LAY", "FOAM WRAPPED"];
// Ordered so the last value = fully done (drives the progress color).
const STAGE_CAD = ["Not Started", "Part CAD Done", "Mold CAD/CAM Done"];
const STAGE_MOLD = ["N/A (Flat)", "Not Started", "Machining", "Machine Complete", "Sealed", "Ready For Layup"];
const STAGE_LAYUP = ["Not Started", "In Layup", "Layup Complete", "Polished"];
// One table so a stage is described once: the list rail, the detail rows, the
// sort keys and the overview all read this instead of repeating three cases.
const PART_STAGES = [
  { key: "cadProgress", label: "CAD", short: "C", vals: STAGE_CAD },
  { key: "moldProgress", label: "Mold", short: "M", vals: STAGE_MOLD },
  { key: "layupProgress", label: "Layup", short: "L", vals: STAGE_LAYUP },
];

function partById(id) { return DB.parts.find(p => p.id === id); }
function savePart(p, field) { p = p || partById(view.id); if (p) save("parts", p, field); }

/* ---------- stage semantics ----------
   The colour of a stage is decided by what the VALUE MEANS, never by where it
   happens to sit in its array. STAGE_MOLD starts with "N/A (Flat)", so
   "Not Started" is at index 1 there — the old `i <= 0 ? st-0 : st-mid` painted
   every not-started mold amber, i.e. reported work in progress that nobody had
   begun. Two explicit predicates, and only then a position check for "done". */
function stageIsNA(val) { return /^n\/?a\b/i.test(String(val || "").trim()); }
function stageIsNotStarted(val) { return /^not started$/i.test(String(val || "").trim()); }
function stageClass(val, enumArr) {
  val = val || enumArr[0];
  if (stageIsNA(val)) return "st-na";
  if (stageIsNotStarted(val)) return "st-0";
  const i = enumArr.indexOf(val);
  if (i < 0) return "st-0";                      // unknown legacy string: don't claim progress
  if (i >= enumArr.length - 1) return "st-done";
  return "st-mid";
}
// How far along, 0–100. Measured over the values that represent real work, so
// the "N/A (Flat)" entry in STAGE_MOLD doesn't shift every mold up one step.
function stagePct(val, enumArr) {
  const real = enumArr.filter(v => !stageIsNA(v));
  const i = real.indexOf(val || enumArr[0]);
  if (i <= 0) return 0;
  return Math.round((i / (real.length - 1)) * 100);
}
// The values that represent real work, in order. "N/A (Flat)" is a statement
// about the part, not a step along the mold, so it is never on the track — it
// is how you leave the track altogether.
function stageTrack(enumArr) { return enumArr.filter(v => !stageIsNA(v)); }
function partStageByKey(key) { return PART_STAGES.find(s => s.key === key); }
/* The index rail: all three stages in one 3-segment mark, ~92px wide.
   The old list drew every stage TWICE (a saturated pill AND a 64px bar), 6
   marks per row, 36 on screen — nothing emphasised, so nothing read. Here the
   colour carries the state (grey = not started, amber = under way, green =
   done, violet = doesn't apply) and the fill carries how far, and the exact
   stage names are one keystroke away in the detail pane. */
function stageRail(p) {
  return `<span class="prog3">${PART_STAGES.map(s => {
    const v = p[s.key] || s.vals[0];
    const cls = stageClass(v, s.vals);
    return `<span class="sg ${cls}" title="${esc(s.label)}: ${esc(v)}"><b>${s.short}</b>${
      cls === "st-na" ? "" : `<i style="width:${stagePct(v, s.vals)}%"></i>`}</span>`;
  }).join("")}</span>`;
}
// A part counts as "done" (not behind-schedule) once layup is complete.
function partDone(p) { return ["Layup Complete", "Polished"].includes(p.layupProgress); }
function partLate(p) { const d = daysUntil(p.layupDeadline); return d != null && d < 0 && !partDone(p); }

/* ---------- evidence on a stage ----------
   A stage is NOT a buy-off, and the difference decides how hard this bites.
   A work-order step is signed: it records a name, an email and a timestamp, and
   the gate there is a wall. A stage is progress — one click, no signature, and
   an undo bar underneath it. So exactly one value carries a requirement, and it
   is the one that is a claim about an artifact rather than about work done:

     CAD → "Mold CAD/CAM Done"   the mold CAD has to exist somewhere findable

   "Machining", "Sealed", "Layup Complete" are all statements about a physical
   object that anybody standing in the shop can check, and gating them would
   turn the fastest interaction in the app into a form. This one is a statement
   about a file, and a file either exists or it does not.

   WHAT COUNTS. The part's own documents or files, or its work order's — the two
   are twins (see linkedCounterpart), the mold CAD is one artifact, and refusing
   a part because the drawing is attached to its work order instead would just
   teach people to attach it twice. A Drive link counts as much as an upload:
   native CAD uploads now (see cadOk() in storage.rules), but for a model
   somebody else has to OPEN, the Drive copy is still the useful one. */
const PART_STAGE_NEEDS = { cadProgress: { "Mold CAD/CAM Done": "cad" } };
const PART_EVIDENCE = {
  cad: {
    label: "the mold CAD, linked or attached",
    why: "“Mold CAD/CAM Done” is a claim that a file exists. If nobody can find it, the claim is the only thing that does.",
    fix: "Attach the STEP or SLDPRT under Files, or link it from Drive under Documents — on this part or on its work order.",
    has: (p) => {
      const holds = r => !!(r && (((r.docs || []).length) || ((r.files || []).length)));
      return holds(p) || holds(linkedCounterpart("parts", p));
    },
  },
};
function partStageNeed(key, val) { return (PART_STAGE_NEEDS[key] || {})[val] || null; }
/* { missing: [key] }. Retro records document rather than enforce, matching every
   other gate in this app; an override already granted clears it, because it was
   granted in writing and the writing is in the part's own note log. */
function partStageEvidence(p, key, val) {
  const out = { missing: [] };
  const need = partStageNeed(key, val);
  if (!need || !p || p.retro) return out;
  if ((p.stageOverrides || {})[key]) return out;
  const rule = PART_EVIDENCE[need];
  if (rule && !rule.has(p)) out.missing.push(need);
  return out;
}

/* ---------- moving a stage ----------
   Advancing a stage is the commonest thing anyone does in this tab, and it used
   to cost four interactions: select, press Edit, open a <select>, pick. The
   stepper below makes it one click on the step you want — but a click is now a
   write to a database the whole team shares, so the writes are graded:

     forward by one   → applies immediately, with a toast and an undo bar
     forward by more  → asks first, naming the steps it would skip
     backwards        → asks first (it erases recorded work)
     → N/A (Flat)     → asks first (it says the part has no mold at all)

   The undo bar is not the toast: the toast disappears on its own, the bar stays
   until you undo it or dismiss it, because "I fat-fingered that a minute ago"
   is the real failure mode on a shop floor. */
let PART_UNDO = null;
function setPartStage(id, key, val, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const p = partById(id), st = partStageByKey(key);
  if (!p || !st) return null;
  const cur = p[key] || st.vals[0];
  if (cur === val) return null;                       // clicking where you already are does nothing
  const name = p.partName || p.id;
  const track = stageTrack(st.vals);
  const wasNA = stageIsNA(cur);
  // From N/A the track hasn't been joined yet, so the first real step is one
  // move away, not two: -1 makes track[0] adjacent, exactly like any other step.
  const from = wasNA ? -1 : track.indexOf(cur);
  const to = track.indexOf(val);
  const apply = () => applyPartStage(p, st, val);
  /* Before every other question. The skip-ahead and move-back confirms are
     about whether you meant it; this is about whether it is true, and there is
     no point asking someone to confirm a move the app is going to refuse. */
  if (partStageEvidence(p, key, val).missing.length) { openPartEvidenceModal(p.id, key, val); return "blocked-evidence"; }
  if (stageIsNA(val)) {
    confirmModal(`Mark ${name} as flat — no ${st.label.toLowerCase()} at all? Its recorded “${cur}” is dropped for everyone.`,
      apply, { ok: "Mark flat" });
    return "confirm-na";
  }
  if (!wasNA && to < from) {
    confirmModal(`Move ${name} ${st.label} back from “${cur}” to “${val}”? Everyone on the team sees this.`,
      apply, { ok: "Move back", danger: false });
    return "confirm-back";
  }
  // The hole the reviewer found in C: one forward click could jump several
  // steps with nothing but a toast to mention it. Say which steps it skips.
  if (to - from > 1) {
    const skipped = track.slice(Math.max(0, from + 1), to).map(s => `“${s}”`);
    confirmModal(`Move ${name} ${st.label} straight to “${val}”? That marks ${skipped.join(" and ")} done without anyone recording ${skipped.length === 1 ? "it" : "them"}.`,
      apply, { ok: "Skip ahead", danger: false });
    return "confirm-jump";
  }
  apply();
  return "applied";
}
/* What is missing, why, and the shortest way to fix it — with the buttons that
   do the fixing, so the gate does not just say no. Same shape as the work
   order's evidence modal. */
function openPartEvidenceModal(id, key, val) {
  const p = partById(id), st = partStageByKey(key);
  if (!p || !st) return;
  const ev = partStageEvidence(p, key, val);
  const wo = linkedCounterpart("parts", p);
  openModal(`
    <h2>Not yet — ${esc(val)}</h2>
    <p class="muted">${esc(p.partName || p.id)} · ${esc(st.label)}</p>
    ${ev.missing.map(k => {
      const r = PART_EVIDENCE[k];
      return `<p class="gate blocked"><span class="gi">✕</span><span><b>Needs ${esc(r.label)}.</b> ${esc(r.why)}<br>
        <span class="muted">${esc(r.fix)}</span></span></p>`;
    }).join("")}
    ${wo ? `<p class="muted tny">Checked on this part and on work order ${esc(wo.id)} — either one counts.</p>` : ""}
    <div class="foot">
      <button onclick="closeModal()">Close</button>
      <button class="primary" onclick="closeModal();openDocLinkModal({ coll: 'parts', id: '${esc(id)}' })">Link it from Drive</button>
      <button onclick="closeModal();addRecordFiles('parts','${esc(id)}','parts')">Attach a file</button>
      ${isLead() ? `<button class="danger" onclick="openPartStageOverride('${esc(id)}','${esc(key)}','${esc(val)}')">Set it anyway</button>` : ""}
    </div>
  `);
}
/* A lead can set it anyway, for a sentence. A part has no event log, but it has
   an append-only authored note thread — which IS its event log, and is already
   the thing anyone reads to find out what happened to this part. The note goes
   there rather than into a store invented for it. */
function openPartStageOverride(id, key, val) {
  const p = partById(id), st = partStageByKey(key);
  if (!p || !st) return;
  openModal(`
    <h2>Set ${esc(st.label)} to “${esc(val)}” anyway?</h2>
    <p class="gate"><span class="gi">⚠</span><span>This goes in the part's notes with your name and the time, where the next person will read it.</span></p>
    <div class="field"><label for="pev-why">Where is the CAD, or why isn't there one?</label>
      <textarea id="pev-why" autofocus rows="3" placeholder="e.g. flat plate, cut straight from the DXF — there is no mold"></textarea>
    </div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="danger" onclick="submitPartStageOverride('${esc(id)}','${esc(key)}','${esc(val)}')">Set it anyway</button>
    </div>
  `);
}
function submitPartStageOverride(id, key, val) {
  const el = document.getElementById("pev-why");
  const why = (el ? el.value : "").trim();
  if (!why) { toast("An override needs a reason. That's the whole point of it.", "error"); return; }
  const p = partById(id), st = partStageByKey(key);
  if (!p || !st) { closeModal(); return; }
  closeModal();
  const need = partStageNeed(key, val);
  p.stageOverrides = { ...(p.stageOverrides || {}), [key]: { by: signerName(), email: myEmail(), at: new Date().toISOString(), missing: need, reason: why } };
  savePart(p, "stageOverrides");
  const text = `${st.label} set to “${val}” without ${(PART_EVIDENCE[need] || {}).label || "evidence"}. Reason: ${why}`;
  const c = { id: "C" + Date.now(), author: signerName(), email: myEmail(), ts: new Date().toISOString(), text, html: `<p>${esc(text)}</p>` };
  p.commentLog = (p.commentLog || []).concat([c]);
  saveField("parts", p, "commentLog", arr => (arr || []).concat([c]));
  applyPartStage(p, st, val);
}

function applyPartStage(p, st, val) {
  const from = p[st.key];
  p[st.key] = val;
  savePart(p, st.key);                                 // single field, named
  PART_UNDO = { id: p.id, key: st.key, from, to: val, label: st.label, name: p.partName || p.id };
  toast(`${p.partName || p.id} · ${st.label} → ${val}`);
  render();
}
function undoPartStage() {
  const u = PART_UNDO; PART_UNDO = null;
  if (!u) { render(); return; }
  const p = partById(u.id);
  if (!p) { toast("That part is gone — nothing to undo.", "error"); render(); return; }
  p[u.key] = u.from;
  savePart(p, u.key);
  toast(`Undone — ${u.name} ${u.label} back to ${u.from || "not set"}`);
  render();
}
function dismissPartUndo() { PART_UNDO = null; render(); }
function partUndoBar() {
  const u = PART_UNDO;
  if (!u) return "";
  return `<div class="undobar no-print">
    <span class="ub-i">${icon("check", 15)}</span>
    <span class="ub-t"><b>${esc(u.name)}</b> ${esc(u.label)} → <b>${esc(u.to)}</b>${u.from ? ` (was ${esc(u.from)})` : ""} — saved for everyone.</span>
    <button class="sm" onclick="undoPartStage()">Undo</button>
    <button class="sm" title="Dismiss" aria-label="Dismiss" onclick="dismissPartUndo()">${icon("x", 14)}</button>
  </div>`;
}
// Keyboard: advance one stage of the selected part by exactly one step. Routed
// through setPartStage so the same rules apply — from N/A the first press joins
// the track at "Not Started" rather than jumping into the middle of it.
function advancePartStage(n) {
  const p = selectedPart();
  if (!p) { toast("Open a part first — ↑/↓ to pick one.", "error"); return null; }
  const st = PART_STAGES[n];
  if (!st) return null;
  const track = stageTrack(st.vals);
  const cur = p[st.key] || st.vals[0];
  const i = stageIsNA(cur) ? -1 : track.indexOf(cur);
  const next = track[i + 1];
  if (!next) { toast(`${p.partName || p.id} · ${st.label} is already “${cur}”.`, "info"); return null; }
  return setPartStage(p.id, st.key, next);
}

/* ---------- people on a part ----------
   moldEngineer / manufacturingEngineer are free text and stay authoritative.
   The optional *Email fields (new, default empty) let a part name a roster
   account exactly; without one we fall back to the same name match People and
   the Dashboard already use, so all 33 SN5 records get a face today. */
function partEngineerEmail(p, key) {
  const explicit = p[key + "Email"];
  if (explicit) return explicit;
  const nm = String(p[key] || "").trim().toLowerCase();
  if (!nm || (typeof notAPerson === "function" && notAPerson(nm))) return "";
  const u = (DB.users || []).find(u => {
    const n = (u.name || "").toLowerCase();
    return u.email.toLowerCase() === nm || n === nm || n.split(" ")[0] === nm;
  });
  return u ? u.email : "";
}
/* One person often holds both roles — "Justin / Justin" was half the SN5
   tracker. Two identical faces in a row reads as two people at a glance, which
   is worse than saying nothing, so the same name collapses to one chip that
   carries both roles ("ME+RE"). Matched case-insensitively: the tracker has
   "Justin" and "justin" for the same person. */
function partEngineers(p) {
  const out = [];
  for (const [key, role] of [["moldEngineer", "ME"], ["manufacturingEngineer", "RE"]]) {
    const name = String(p[key] || "").trim();
    if (!name || (typeof notAPerson === "function" && notAPerson(name))) continue;
    const same = out.find(e => e.name.toLowerCase() === name.toLowerCase());
    if (same) { same.role += "+" + role; continue; }
    out.push({ role, key, name, email: partEngineerEmail(p, key) });
  }
  return out;
}
// Avatar + name, and clicking it filters the index to that person's parts —
// "ME/RE" stops being dead text and becomes the fastest way to see your work.
function engineerChip(e) {
  const on = (view.fEng || "").toLowerCase() === e.name.toLowerCase();
  return `<span class="chip engchip ${on ? "on" : ""}" title="${esc(e.role)} — show only ${esc(e.name)}'s parts"
    onclick="event.stopPropagation();filterByEngineer('${esc(e.name)}')">${avatar(e.email || e.name, 18)}${esc(e.name)}</span>`;
}
function filterByEngineer(name) {
  view.fEng = (view.fEng || "").toLowerCase() === String(name).toLowerCase() ? "" : name;
  render();
}
function partHasEngineer(p, name) {
  const n = String(name || "").toLowerCase();
  return [p.moldEngineer, p.manufacturingEngineer].some(v => String(v || "").toLowerCase() === n);
}

async function newPart() {
  const id = await allocId("parts");
  if (!id) return;
  const p = {
    id, partName: "", subteam: "AERO", layupType: "MOLD INFUSION",
    layupSchedule: "", moldLocation: "RFS", moldEngineer: "", manufacturingEngineer: "",
    cadProgress: "Not Started", moldProgress: "Not Started", layupProgress: "Not Started",
    weightG: "", weightActualG: "", layupDeadline: "", comments: "", commentLog: [],
    workOrderId: "", layupStack: [], retro: false,
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

/* ---------- selection ---------- */
// Selected == view.mode "detail" with a part that exists. Same condition the
// ≤900 CSS keys off, so wide and narrow can never disagree about what's shown.
function selectedPart() { return view.mode === "detail" ? partById(view.id) : null; }
function selectPart(id) {
  view = { ...view, mode: "detail", id, edit: false };
  render();
  const el = document.getElementById("pi-" + id);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
}
function clearPartSelection() { view = { ...view, mode: "list", edit: false }; render(); }

/* ---------- sorting ----------
   Progress columns sort by the part's index in its own stage enum (real
   progress order), not alphabetically — "Machining" vs "Sealed" vs "Ready For
   Layup" would be nonsense sorted as text. */
const PART_SORT_COLS = {
  partName: p => (p.partName || p.id || "").toLowerCase(),
  subteam: p => (p.subteam || "").toLowerCase(),
  layupType: p => (p.layupType || "").toLowerCase(),
  cadProgress: p => STAGE_CAD.indexOf(p.cadProgress || STAGE_CAD[0]),
  moldProgress: p => STAGE_MOLD.indexOf(p.moldProgress || STAGE_MOLD[0]),
  layupProgress: p => STAGE_LAYUP.indexOf(p.layupProgress || STAGE_LAYUP[0]),
  layupDeadline: p => p.layupDeadline || "9999",
  // Same key as "subteam", but the rail draws a header per run of it — a
  // subteam lead reading their own block wants the block totals, not a column.
  group: p => (p.subteam || "~").toLowerCase(),
};
const PART_SORT_LABELS = { layupDeadline: "Sort: Deadline", partName: "Sort: Part", subteam: "Sort: Subteam", layupType: "Sort: Type", cadProgress: "Sort: CAD", moldProgress: "Sort: Mold", layupProgress: "Sort: Layup", group: "Group: subteam" };
function sortPartsBy(key) {
  if (view.sortKey === key) view.sortDir = view.sortDir === "desc" ? "asc" : "desc";
  else { view.sortKey = key; view.sortDir = "asc"; }
  render();
}
function togglePartSortDir() { view.sortDir = view.sortDir === "desc" ? "asc" : "desc"; render(); }
function sortedPartRows(rows) {
  const get = PART_SORT_COLS[view.sortKey];
  if (!get) return rows;
  const mul = view.sortDir === "desc" ? -1 : 1;
  // Ties break on deadline then id, always ascending: inside a subteam group
  // (or a run of equal progress) the useful order is "what's due first", and a
  // stable one keeps rows from shuffling between renders.
  return rows.slice().sort((a, b) => {
    const av = get(a), bv = get(b);
    if (av < bv) return -mul;
    if (av > bv) return mul;
    return (a.layupDeadline || "9999").localeCompare(b.layupDeadline || "9999") || a.id.localeCompare(b.id);
  });
}

/* ---------- the index rows ---------- */
function partIndexRows() {
  const D = DB.parts;
  const showDone = !!view.fDone;
  const q = (view.q || "").toLowerCase();
  let rows = D
    .filter(p => showDone || !partDone(p))
    .filter(p => (!view.fSub || p.subteam === view.fSub))
    .filter(p => (!view.fLate || partLate(p)))
    .filter(p => (!view.fMine || isMine([p.moldEngineer, p.manufacturingEngineer])))
    .filter(p => (!view.fEng || partHasEngineer(p, view.fEng)))
    .filter(p => !q || (p.partName || "").toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  // The selected part never falls out from under you — a filter that would hide
  // what you are reading keeps it in place instead (this is the whole point of
  // a persistent index).
  const sel = selectedPart();
  if (sel && !rows.includes(sel)) rows = rows.concat([sel]);
  return view.sortKey ? sortedPartRows(rows)
    : rows.slice().sort((a, b) => (a.layupDeadline || "9999").localeCompare(b.layupDeadline || "9999") || a.id.localeCompare(b.id));
}

const PART_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "2026-03-29" → "29 Mar". The index is 320px wide; a full ISO date there costs
// more than it says, and the exact value is on the detail pane anyway.
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return esc(iso || "");
  return `${+m[3]} ${PART_MONTHS[+m[2] - 1] || m[2]}`;
}

function partIndexItem(p, mixedRetro) {
  const sel = view.mode === "detail" && view.id === p.id;
  const late = partLate(p);
  const engs = partEngineers(p);
  return `<div class="pitem ${sel ? "sel" : ""} ${partDone(p) ? "isdone" : ""}" id="pi-${esc(p.id)}"
      role="option" aria-selected="${sel}" title="${esc(p.id)} · ${esc(p.layupType || "")}"
      onclick="selectPart('${esc(p.id)}')">
    <span class="pi-name">${esc(p.partName || p.id)}${mixedRetro && p.retro ? ' <span class="pill retro tny">retro</span>' : ""}</span>
    <span class="pi-due ${late ? "warn" : ""}">${p.layupDeadline ? shortDate(p.layupDeadline) + (late ? " " + icon("warning", 12) : "") : ""}</span>
    <span class="pi-sub">${stageRail(p)}<span class="tny">${esc(p.subteam || "")}</span></span>
    <span class="pi-who">${engs.map(e => avatar(e.email || e.name, 20)).join("") || ""}</span>
  </div>`;
}

/* The rail body. Normally just rows; with "Group: subteam" chosen it puts one
   header before each run, carrying the numbers a subteam lead actually asks for
   (how many of ours are laid up, how many am I looking at, how many are late).
   The headers are drawn here and nowhere else, so keyboard navigation — which
   walks partIndexRows() — never has to step over one. */
function partGroupHead(name, rows) {
  const all = DB.parts.filter(p => (p.subteam || "") === name);
  const done = all.filter(partDone).length;
  const late = rows.filter(partLate).length;
  return `<div class="pgrouphd">
    <span class="pg-name">${esc(name || "No subteam")}</span>
    <span class="pg-n">${done}/${all.length} laid up</span>
    <span class="pg-n">${rows.length} shown</span>
    ${late ? `<span class="pg-n pg-late">${icon("warning", 12)} ${late} late</span>` : ""}
  </div>`;
}
function partIndexBody(rows, mixedRetro) {
  const grouped = view.sortKey === "group";
  let out = "", run = null;
  rows.forEach(p => {
    if (grouped) {
      const g = p.subteam || "";
      if (g !== run) {
        run = g;
        out += partGroupHead(g, rows.filter(r => (r.subteam || "") === g));
      }
    }
    out += partIndexItem(p, mixedRetro);
  });
  return out;
}

/* ---------- season-level read ----------
   Finding 5: the old list had no counts and nothing surfaced what was late.
   These two live in the index header (every width) and, in more detail, in the
   right pane when nothing is selected. */
function partSummary() {
  const D = DB.parts;
  const open = D.filter(p => !partDone(p));
  return {
    total: D.length,
    open: open.length,
    done: D.length - open.length,
    late: D.filter(partLate).length,
    mine: open.filter(p => isMine([p.moldEngineer, p.manufacturingEngineer])).length,
  };
}
// Open parts only, for all three stages — a breakdown that counted finished
// parts in CAD but not in Layup would read as three different denominators.
function stageBreakdown(key, vals) {
  const buckets = { "st-0": 0, "st-mid": 0, "st-done": 0, "st-na": 0 };
  DB.parts.filter(p => !partDone(p)).forEach(p => { buckets[stageClass(p[key] || vals[0], vals)]++; });
  return buckets;
}
function summaryChip(label, n, on, onclick, cls) {
  return `<button class="psum-chip ${on ? "on" : ""} ${cls || ""}" onclick="${onclick}"><b>${n}</b> ${esc(label)}</button>`;
}
/* The four season numbers. They used to live only in the overview pane, so
   opening a part threw the season away and a lead had to press Esc to get it
   back. Now they are pinned above BOTH panes: same four tiles, same order,
   slimmer when a part is open. */
function partStatRow(compact) {
  const s = partSummary();
  const tile = (n, label, cls) => `<div class="stat-tile"><div class="bignum ${cls || ""}">${n}</div><div class="stat-label">${esc(label)}</div></div>`;
  return `<div class="stat-row pstats${compact ? " compact" : ""}">
    ${tile(s.open, "Open parts")}${tile(s.late, "Behind deadline", s.late ? "warn" : "")}${tile(s.mine, "On you")}${tile(s.done, "Finished")}
  </div>`;
}

function renderPartIndex() {
  const D = DB.parts;
  const rows = partIndexRows();
  const s = partSummary();
  const mixedRetro = rows.some(p => p.retro) && rows.some(p => !p.retro);
  const sortKey = view.sortKey || "layupDeadline";
  return `
  <aside class="mdindex" aria-label="Parts index">
    <div class="pindex-head no-print">
      <div class="toolbar">
        <button class="primary ib" onclick="newPart()">${icon("plus", 15)} New Part</button>
        <span class="muted tny" style="margin-left:auto">${rows.length} of ${D.length} parts</span>
      </div>
      <div class="psum">
        ${summaryChip("open", s.open, !view.fLate && !view.fMine && !view.fDone, "resetPartFilters()")}
        ${summaryChip("late", s.late, !!view.fLate, "view.fLate=!view.fLate;view.fMine=false;render()", s.late ? "bad" : "")}
        ${summaryChip("mine", s.mine, !!view.fMine, "view.fMine=!view.fMine;view.fLate=false;render()")}
        ${summaryChip("done", s.done, !!view.fDone, "view.fDone=!view.fDone;render()")}
      </div>
      <div class="pfilters">
        <input id="searchbox" placeholder="search part / id…" value="${esc(view.q)}" oninput="searchInput(this)">
        <select title="Subteam" onchange="view.fSub=this.value;render()">
          <option value="">All subteams</option>
          ${[...new Set([...SUBTEAMS, ...D.map(p => p.subteam)])].filter(Boolean).map(s2 => `<option ${view.fSub === s2 ? "selected" : ""}>${esc(s2)}</option>`).join("")}
        </select>
        <select title="Sort by" onchange="sortPartsBy(this.value)">
          ${Object.keys(PART_SORT_LABELS).map(k => `<option value="${k}" ${sortKey === k ? "selected" : ""}>${esc(PART_SORT_LABELS[k])}</option>`).join("")}
        </select>
        <button class="sm sortdir" title="Reverse sort order" onclick="togglePartSortDir()">${view.sortDir === "desc" ? "▼" : "▲"}</button>
      </div>
      ${view.fEng ? `<div class="pfilternote">Showing <b>${esc(view.fEng)}</b>'s parts <button class="sm" onclick="filterByEngineer('${esc(view.fEng)}')">clear</button></div>` : ""}
      ${/* Finding 3: C/M/L were three unlabelled letters on every row. Say what
            they stand for ONCE, at the top of the column they head, the way a
            table header does — this team turns over every year, and learnable
            is not the same as guessable. */""}
      <div class="plegend tny muted">Progress ${PART_STAGES.map(st =>
        `<span class="pl-k"><span class="prog3"><span class="sg"><b>${st.short}</b></span></span>${esc(st.label)}</span>`).join("")}</div>
    </div>
    <div class="plist" role="listbox" aria-label="Parts">
      ${rows.length ? partIndexBody(rows, mixedRetro) : `<div class="pempty muted">${
        D.length ? "No parts match these filters." : "No parts yet — <b>New Part</b> to start."}</div>`}
      ${/* Finding 6: at 33 parts the rail cut a row in half at the container
            edge with nothing to say it scrolled. A sticky fade at the foot of
            the scroller says "there is more" without costing a row. */""}
      <div class="plistfade" aria-hidden="true"></div>
    </div>
    ${/* 1/2/3 only do anything with a part open — advertising them while the
          right pane is the season overview just earns you an error toast. The
          hint appears when the key works. */""}
    <div class="keyhint no-print muted tny"><span><kbd>↑</kbd><kbd>↓</kbd> move</span>${
      selectedPart() ? "<span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> advance C/M/L</span>" : ""
    }<span><kbd>/</kbd> search</span><span><kbd>e</kbd> edit</span><span><kbd>esc</kbd> back</span></div>
  </aside>`;
}

/* ---------- right pane when nothing is selected ----------
   Finding 14: half the page used to be dead space. On a wide screen this is
   the season read the list never had; at ≤900 it is simply not shown, because
   there the index owns the whole screen. */
function renderPartOverview() {
  const s = partSummary();
  const late = DB.parts.filter(partLate).sort((a, b) => (a.layupDeadline || "").localeCompare(b.layupDeadline || ""));
  const mine = DB.parts.filter(p => !partDone(p) && isMine([p.moldEngineer, p.manufacturingEngineer]));
  const soon = DB.parts.filter(p => !partDone(p) && !partLate(p) && daysUntil(p.layupDeadline) != null && daysUntil(p.layupDeadline) <= 21)
    .sort((a, b) => (a.layupDeadline || "").localeCompare(b.layupDeadline || ""));
  const miniRow = p => `<div class="pmini" onclick="selectPart('${esc(p.id)}')">
    <span class="pm-name">${esc(p.partName || p.id)}</span>${stageRail(p)}
    <span class="pm-due ${partLate(p) ? "warn" : ""}">${p.layupDeadline ? shortDate(p.layupDeadline) : "no date"}</span></div>`;
  return `
  <section class="mddetail" aria-label="Parts overview">
    ${partStatRow()}
    <div class="card">
      <h2>Parts this season</h2>
      <div class="muted">${s.open} open · ${s.done} finished · ${s.total} tracked. Pick a part to open it.</div>
      <h3>Where the open parts stand</h3>
      ${PART_STAGES.map(st => {
        const b = stageBreakdown(st.key, st.vals);
        const tot = b["st-0"] + b["st-mid"] + b["st-done"] + b["st-na"] || 1;
        const seg = (cls, n, lbl) => n ? `<span class="sb-seg ${cls}" style="width:${(n / tot) * 100}%" title="${n} ${lbl}"></span>` : "";
        return `<div class="stagebreak">
          <div class="sb-label">${st.label}</div>
          <div class="sb-bar">${seg("st-0", b["st-0"], "not started")}${seg("st-mid", b["st-mid"], "under way")}${seg("st-done", b["st-done"], "done")}${seg("st-na", b["st-na"], "not applicable")}</div>
          <div class="sb-nums tny"><span class="muted">${b["st-0"]} not started</span> · <span class="mid">${b["st-mid"]} under way</span> · <span class="done">${b["st-done"]} done</span>${b["st-na"] ? ` · <span class="na">${b["st-na"]} n/a</span>` : ""}</div>
        </div>`;
      }).join("")}
    </div>
    <div class="card">
      <h3>Behind deadline</h3>
      ${/* The index already sorts late-first, so listing the same four parts
            again here printed them twice on one screen. A count and a filter
            says the same thing once. */
        late.length ? `<div class="pbehind">
          <b class="bignum warn">${late.length}</b>
          <span>part${late.length === 1 ? " is" : "s are"} past ${late.length === 1 ? "its" : "their"} layup deadline${
            late[0].layupDeadline ? `, the oldest since ${esc(late[0].layupDeadline)}` : ""}. They sort to the top of the index.</span>
          <button class="sm" onclick="view={...view,fLate:true,fMine:false,fDone:false};render()">Show only these</button>
        </div>` : '<span class="muted">Nothing overdue.</span>'}
      <h3>Due in the next three weeks</h3>
      ${soon.length ? soon.slice(0, 8).map(miniRow).join("") : '<span class="muted">Nothing coming up.</span>'}
      <h3>On you</h3>
      ${mine.length ? mine.map(miniRow).join("") : '<span class="muted">No open parts are assigned to you.</span>'}
    </div>
  </section>`;
}

/* ---------- detail fields ---------- */
function pfld(p, label, key, opts, type) {
  const v = p[key] ?? "";
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}</div></div>`;
  if (opts) return `<div class="f"><label>${label}</label><select onchange="updPart('${key}',this.value)">${opts.map(o => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
  // Finding 10: this was a raw text box you had to know "WO-SN5-017" to fill.
  // Tickets have had a real work-order picker all along (projects.js) — same
  // list, same sort, one call.
  if (type === "wo") return `<div class="f"><label>${label}</label><select onchange="updPart('${key}',this.value)">
    <option value="" ${v ? "" : "selected"}>— no work order —</option>
    ${DB.workOrders.slice().sort((a, b) => a.id.localeCompare(b.id)).map(w =>
      `<option value="${esc(w.id)}" ${w.id === v ? "selected" : ""}>${esc(w.id)} — ${esc(w.partName || "")}</option>`).join("")}
    ${v && !recById("workOrders", v) ? `<option value="${esc(v)}" selected>${esc(v)} (not found)</option>` : ""}
  </select></div>`;
  return `<div class="f"><label>${label}</label><input ${type ? `type="${type}"` : ""} value="${esc(v)}" onchange="updPart('${key}',this.value)"></div>`;
}

/* Progress, rendered ONCE, as the control itself — the whole enum laid out as
   tappable steps, current filled and the rest outlined. There is no edit mode
   here and no <select> to open: the display IS the control, so the two can't
   drift, and the state is legible while you change it.

   The colour of the current step is stageClass()'s, unchanged: grey for not
   started, amber under way, green done, violet not applicable. A step you have
   already passed is a muted fill and NOTHING else — no green, no tick. Green +
   a tick means "finished" everywhere else in this app, and a ticked green "Not
   Started" would be a fresh instance of exactly the colour bug this project set
   out to remove. */
function partStageRow(p, st) {
  const cur = p[st.key] || st.vals[0];
  const curCls = stageClass(cur, st.vals);
  const track = stageTrack(st.vals);
  const at = stageIsNA(cur) ? -1 : track.indexOf(cur);
  const step = v => {
    const isCur = v === cur;
    const na = stageIsNA(v);
    const past = !isCur && !na && at >= 0 && track.indexOf(v) < at;
    const cls = ["pstep", isCur ? "cur " + stageClass(v, st.vals) : "", past ? "past" : "", na ? "na" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${cls}"${isCur ? ' aria-current="step"' : ""}
      title="${isCur ? esc(st.label) + " is " + esc(v) : "Set " + esc(st.label) + " to " + esc(v)}"
      onclick="setPartStage('${esc(p.id)}','${st.key}','${esc(v)}',event)">${esc(v)}</button>`;
  };
  /* Say what a step wants BEFORE it is clicked. The step stays enabled — the
     click is how you find out what is missing and get the buttons that fix it,
     and a disabled control with a tooltip is unreachable on the phone this is
     used from. */
  const gated = st.vals.filter(v => partStageEvidence(p, st.key, v).missing.length);
  const ovr = (p.stageOverrides || {})[st.key];
  return `<div class="pstage">
    <div class="ps-label">${st.label}</div>
    <div class="ps-steps" role="group" aria-label="${esc(st.label)} progress">${st.vals.map(step).join("")}</div>
    ${curCls === "st-na" ? `<div class="ps-cap tny muted">flat — no mold</div>` : ""}
    ${gated.length ? `<div class="ps-cap tny muted">“${esc(gated[0])}” needs ${esc((PART_EVIDENCE[partStageNeed(st.key, gated[0])] || {}).label || "evidence")} first.</div>` : ""}
    ${ovr ? `<div class="ps-cap tny muted">Set without evidence by ${esc(userName(ovr.email) || ovr.by)}. The reason is in the notes.</div>` : ""}
  </div>`;
}

/* ---------- inbound links (finding 12) ----------
   Tickets link to parts, work orders link to parts, the schedule puts parts on
   stations. None of it was visible from the part. All in-memory filters, same
   as every other tab — no query, no index. */
function partWorkOrders(p) {
  return (DB.workOrders || []).filter(w => w.partId === p.id ||
    (p.workOrderId && w.id === p.workOrderId) ||
    (p.partName && (w.partName || "").toUpperCase() === p.partName.toUpperCase()));
}
function partTickets(p) { return (DB.projects || []).filter(t => (t.relatedParts || []).includes(p.id)); }
function partScheduleWeeks(p) {
  return (DB.schedule || []).filter(w => Object.keys(w).some(k => k !== "id" && w[k] === p.id));
}

/* ---------- comments (finding 13) ----------
   The old field was one mutable blob: no author, no timestamp, and newlines
   dropped on render. `comments` stays exactly as it is and stays authoritative
   — it is the SN5 note someone typed. `commentLog` is new, optional and
   append-only, so a thread can exist without rewriting a single record. */
/* Rich now, like every other comment surface. `html` is written alongside the
   old `text`, never instead of it: records posted before this keep rendering
   through the plain path in commentHtml(), so there is no migration and nothing
   to backfill. Still saveField/mutateField, which test_app.mjs asserts. */
function postPartComment(id) {
  const box = document.getElementById("pcomment");
  const html = sanitizeHtml((box && box.innerHTML) || "");
  const text = String((box && box.textContent) || "").trim();
  if (!text && !/<img/i.test(html)) { toast("Write a comment first.", "error"); return; }
  const p = partById(id);
  if (!p) return;
  const c = { id: "C" + Date.now(), author: signerName(), email: myEmail(), ts: new Date().toISOString(), text, html };
  p.commentLog = (p.commentLog || []).concat([c]);           // optimistic
  saveField("parts", p, "commentLog", arr => (arr || []).concat([c]));
  if (box) box.innerHTML = "";
  clearDraft("comment", id);
  closeComposer("pcomment");
  render();
}

function renderPartDetail() {
  const p = selectedPart();
  if (!p) return renderPartOverview();
  const E = view.edit;
  const linkedWO = linkedCounterpart("parts", p);
  const dd = daysUntil(p.layupDeadline);
  const late = partLate(p);
  const wos = partWorkOrders(p);
  const tickets = partTickets(p);
  const weeks = partScheduleWeeks(p);
  const engs = partEngineers(p);
  const comments = (p.commentLog || []).slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return `
  <section class="mddetail" aria-label="Part detail" data-lbgroup="parts:${esc(p.id)}">
    <div class="toolbar no-print">
      <button class="ib" onclick="clearPartSelection()">${icon("chevronLeft", 16)} All parts</button>
      <button class="primary ib" onclick="view.edit=!view.edit;render()">${icon(E ? "check" : "edit", 15)} ${E ? "Done" : "Edit"}</button>
      ${E && isLead() ? `<button class="danger" onclick="delPart('${esc(p.id)}')">Delete</button>` : ""}
      <span class="mdnav no-print">
        <button class="sm" title="Previous part (↑)" onclick="movePartSelection(-1)">${icon("chevronLeft", 14)}</button>
        <button class="sm" title="Next part (↓)" onclick="movePartSelection(1)">${icon("chevronRight", 14)}</button>
      </span>
    </div>
    <nav class="jumpbar no-print" aria-label="Jump to section">
      <a href="#pt-progress"><b>Progress</b></a><a href="#pt-details">Details</a><a href="#pt-stack">Stack</a>
      <a href="#pt-links">Links</a><a href="#pt-notes">Notes</a>
    </nav>
    ${/* Finding 5: the season used to vanish the moment a part was opened, so a
          lead had to press Esc to see it and Enter to get back. Pinned. */""}
    ${partStatRow(true)}
    <div class="card">
      <h2>${esc(p.partName || "(unnamed part)")} ${p.retro ? '<span class="pill retro">retro record</span>' : ""}</h2>
      <div class="muted">${esc(p.id)}${p.subteam ? " · " + esc(p.subteam) : ""}${p.layupType ? " · " + esc(p.layupType) : ""}${
        linkedWO ? " · work order " + chip("workOrders", linkedWO.id, linkedWO.id) : ""}${
        p.updatedAt ? " · saved " + fmtWhen(p.updatedAt) + " by " + esc(p.updatedBy || "?") : ""}</div>
      ${p.layupDeadline ? `<div class="pdue ${late ? "late" : ""}">${icon(late ? "warning" : "calendar", 15)}
        <b>Layup deadline ${esc(p.layupDeadline)}</b>
        <span class="muted">${dd != null ? (dd < 0 ? Math.abs(dd) + " days late" : dd === 0 ? "today" : dd + " days out") : ""}</span></div>` : ""}
      ${E ? `<div class="editnote no-print">${icon("edit", 14)} Editing — every change saves as you make it.</div>` : ""}

      <h3 id="pt-progress">Progress</h3>
      <div class="pstages">${PART_STAGES.map(st => partStageRow(p, st)).join("")}</div>

      <h3 id="pt-details">Details</h3>
      <div class="grid pgrid">
        ${pfld(p, "Part name", "partName")}${pfld(p, "Subteam", "subteam", SUBTEAMS)}${pfld(p, "Layup type", "layupType", LAYUP_TYPES)}
        ${pfld(p, "Layup deadline", "layupDeadline", null, "date")}${pfld(p, "Mold location", "moldLocation")}${
          // An SN5 record has no workOrderId — the link is inferred from the part
          // name. Say so, rather than printing "—" next to a header that clearly
          // shows a work order.
          !E && !p.workOrderId && linkedWO
            ? `<div class="f"><label>Linked work order</label><div class="ro">${chip("workOrders", linkedWO.id, linkedWO.id)} <span class="muted tny">matched by name</span></div></div>`
            : pfld(p, "Linked work order", "workOrderId", null, "wo")}
        ${pfld(p, "Mold Engineer", "moldEngineer")}${pfld(p, "Manufacturing Engineer", "manufacturingEngineer")}${pfld(p, "Layup schedule (text note)", "layupSchedule")}
        ${pfld(p, "Target weight (g)", "weightG")}${pfld(p, "Actual weight (g)", "weightActualG")}
        ${(() => {
          // Derived, so it is never an input; and absent entirely on the many
          // SN5 records that carry no weight at all, rather than a third dash.
          if (!String(p.weightG || "").trim() && !String(p.weightActualG || "").trim()) return "";
          const t = parseFloat(p.weightG), a = parseFloat(p.weightActualG);
          if (isNaN(t) || isNaN(a)) return `<div class="f"><label>Mass vs target</label><div class="ro muted">—</div></div>`;
          const d = a - t;
          return `<div class="f"><label>Mass vs target</label><div class="ro ${d > 0 ? "warn" : "ok"}">${d > 0 ? "+" : ""}${Math.round(d * 10) / 10} g</div></div>`;
        })()}
      </div>
      ${engs.length ? `<div class="pengrow"><div class="lg-label tny">On this part</div>
        <div class="linkrow">${engs.map(engineerChip).join("")}</div></div>` : ""}

      <h3 id="pt-stack">Layup stack${linkedWO ? ` <span class="muted" style="text-transform:none">— synced with work order ${esc(linkedWO.id)}</span>` : ""}</h3>
      ${stackViz(p.layupStack)}
      ${E ? stackEditor("parts", p.id) : ""}

      <h3 id="pt-links">Linked${wos.length + tickets.length + weeks.length ? ` <span class="muted" style="text-transform:none">— ${wos.length + tickets.length + weeks.length}</span>` : ""}</h3>
      <div class="linkgrid">
        <div><div class="lg-label tny">Work orders</div><div class="linkrow">${
          wos.map(w => chip("workOrders", w.id, w.id + (w.status ? " · " + w.status : ""))).join("") || '<span class="muted tny">none</span>'}</div></div>
        <div><div class="lg-label tny">Tickets</div><div class="linkrow">${
          tickets.map(t => chip("projects", t.id, t.title || t.id)).join("") || '<span class="muted tny">none</span>'}</div></div>
        <div><div class="lg-label tny">Scheduled weeks</div><div class="linkrow">${
          weeks.map(w => `<span class="chip" onclick="view={...view,tab:'timeline',mode:'list'};render()">week of ${esc(w.weekOf || w.id)}</span>`).join("") || '<span class="muted tny">none</span>'}</div></div>
      </div>
      <!-- Documents sit under the link grid rather than inside it: a chip row
           can hold five work-order ids, but a document row needs its title, its
           type and somewhere to put the Open button. -->
      <div class="pengrow">
        <div class="lg-label tny">Documents</div>
        ${docLinkList(p.docs, { onRemove: `rmPartDoc`, empty: "None linked yet.", addLabel: "+ Link a document" })}
        <div class="no-print" style="margin-top:6px"><button class="sm" onclick="openDocLinkModal({ coll: 'parts', id: '${p.id}' })">+ Link a document</button></div>
      </div>
      <!-- Files, new alongside Documents: a part could link a Drive doc but not
           hold a file, so a PDF mold drawing had nowhere to live except a
           comment. Uploads go to the parts/ storage tree, which storage.rules
           already has — no rules change. -->
      <div class="pengrow">
        <div class="lg-label tny">Files</div>
        <div class="filegrid">
          ${(p.files || []).map(fileItem).join("") || '<span class="muted tny">None yet.</span>'}
        </div>
        <div class="no-print" style="margin-top:6px"><button class="sm" onclick="addRecordFiles('parts','${p.id}','parts')">+ Add files</button></div>
      </div>

      <h3 id="pt-notes">Notes${comments.length ? ` <span class="muted" style="text-transform:none">— ${comments.length} comment${comments.length === 1 ? "" : "s"}</span>` : ""}</h3>
      <div class="pnote">
        <div class="lg-label tny">Part note <span class="muted" style="text-transform:none">— the free-text field from the tracker</span></div>
        ${richField("parts", p.id, "comments", {
          plain: true, label: "Part note",
          empty: "What anyone picking this part up needs to know.",
          upload: name => `parts/${p.id}/${Date.now()}-${name}`,
        })}
      </div>
      ${threadHtml("parts", p.id, comments, { empty: "No comments yet." })}
      ${(() => {
        rteSetUpload(name => `parts/${p.id}/${Date.now()}-${name}`);
        const draft = loadDraft("comment", p.id);
        return composerHtml({
          targetId: "pcomment",
          html: sanitizeHtml(draft),
          placeholder: "What happened on this part…",
          oninput: `draftInput('comment','${esc(p.id)}',this)`,
          onpost: `postPartComment('${esc(p.id)}')`,
          oncancel: `closeComposer('pcomment')`,
          postLabel: "Comment as " + signerName(),
        });
      })()}
    </div>
  </section>`;
}

/* ---------- the tab ----------
   One markup for every width. `has-sel` is the only state the ≤900 collapse
   needs: with it the index hides and the detail is the page; without it the
   detail hides and the index is the page. Above 900 both are always visible. */
function renderParts() {
  const sel = selectedPart();
  return `${partUndoBar()}<div class="mdsplit ${sel ? "has-sel" : ""}">
    ${renderPartIndex()}
    ${sel ? renderPartDetail() : renderPartOverview()}
  </div>`;
}

/* ---------- keyboard ----------
   The thing a persistent index buys that nothing else does: walking the season
   without touching the mouse. Pure function first so it is testable without a
   real KeyboardEvent (the DOM stub has none). */
function partNeighborId(dir) {
  const rows = partIndexRows();
  if (!rows.length) return null;
  const i = rows.findIndex(p => p.id === view.id);
  if (i < 0) return rows[dir > 0 ? 0 : rows.length - 1].id;
  const n = Math.min(rows.length - 1, Math.max(0, i + dir));
  return rows[n].id;
}
function movePartSelection(dir) {
  const id = partNeighborId(dir);
  if (id) selectPart(id);
}
// Returns the action name it took (or null), so a test can drive it directly.
function partsKeydown(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (typeof view === "undefined" || view.tab !== "parts" || view.mode === "roster") return null;
  const modal = document.getElementById("modal");
  if (modal && typeof modal.className === "string" && modal.className.includes("open")) return null;
  const t = e.target || {};
  const tag = String(t.tagName || "").toUpperCase();
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  const k = e.key;
  if (typing) {
    // Escape gets you out of the search box and back to the list; nothing else
    // is stolen from a field you're typing in.
    if (k === "Escape" && t.blur) { t.blur(); return "blur"; }
    return null;
  }
  if (k === "ArrowDown" || k === "j") { if (e.preventDefault) e.preventDefault(); movePartSelection(1); return "next"; }
  if (k === "ArrowUp" || k === "k") { if (e.preventDefault) e.preventDefault(); movePartSelection(-1); return "prev"; }
  if (k === "Enter" && view.mode !== "detail") { const id = partNeighborId(1); if (id) { selectPart(id); return "open"; } return null; }
  if (k === "Escape" && view.mode === "detail") { clearPartSelection(); return "clear"; }
  if (k === "/") {
    if (e.preventDefault) e.preventDefault();
    const s = document.getElementById("searchbox");
    if (s && s.focus) s.focus();
    return "search";
  }
  if (k === "e" && view.mode === "detail") { view.edit = !view.edit; render(); return "edit"; }
  // 1/2/3 advance CAD/Mold/Layup on the open part by exactly one step. With
  // j/k to walk the rail, working through a morning's parts is two keystrokes
  // each and never leaves the keyboard. Same rules as clicking the stepper: a
  // one-step move writes, anything else asks first.
  if ((k === "1" || k === "2" || k === "3") && view.mode === "detail") {
    if (e.preventDefault) e.preventDefault();
    advancePartStage(+k - 1);
    return "stage";
  }
  return null;
}
document.addEventListener("keydown", partsKeydown);

function resetPartFilters() { view = { ...view, fLate: false, fMine: false, fDone: false, fEng: "", fSub: "", q: "" }; render(); }

/* Every write is single-field, and the whole tab re-renders afterwards: the old
   version only re-rendered for four keys, so renaming a part left a stale <h2>
   above the input you had just typed into (finding 9). */
function updPart(key, val) {
  const p = partById(view.id);
  if (!p) return;
  p[key] = val;
  savePart(p, key);
  render();
}
function rmPartDoc(linkId) { removeDocLink("parts", view.id, linkId); }
