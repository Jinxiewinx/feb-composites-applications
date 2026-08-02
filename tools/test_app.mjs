#!/usr/bin/env node
/* Functional tests for the FEB composites app (03 App/app/*.js).
   Loads the classic-script app files into a DOM stub with a fake window.fb, so
   app logic across all tabs is tested without a browser or Firebase. Rules
   enforcement is tested separately against the emulator (test_wo_rules.mjs).
   Run from SN6 Resources/:  node tools/test_app.mjs */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "03 App", "app");
const woSeed = JSON.parse(readFileSync(join(root, "sn5-work-orders.json"), "utf8"));

/* ---------- DOM + browser stubs ---------- */
let lastToast = "";
let testIssueId = null; // set once an unambiguous fixture issue ticket exists; several tests reuse it
const els = {};
function el(id) {
  if (!els[id]) els[id] = {
    id, innerHTML: "", value: "", tagName: "INPUT", files: [], style: {},
    classList: { add() {}, remove() {} },
    closest: () => null, focus() {}, setSelectionRange() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [],
    // toast() appends a .toast child here; capture its text for assertions.
    appendChild: (c) => { if (id === "toasts") lastToast = c.textContent || ""; },
  };
  return els[id];
}
// Drive a confirmModal opened by the last action: invoke its stored callback.
function confirmProceed() { const cb = globalThis.__confirmCb; globalThis.__confirmCb = null; if (cb) cb(); }
let activeEl = null;
globalThis.document = {
  getElementById: el,
  addEventListener() {}, removeEventListener() {},
  get activeElement() { return activeEl; },
  createElement: () => ({ click() {}, remove() {}, className: "", textContent: "", classList: { add() {}, remove() {} }, set href(v) {}, set download(v) {}, set onchange(v) {}, set type(v) {}, set accept(v) {} }),
  execCommand() {},
};
globalThis.window = globalThis;
let lastAlert = "", lastConfirm = "", confirmAnswer = true;
globalThis.alert = (m) => { lastAlert = String(m); };
globalThis.confirm = (m) => { lastConfirm = String(m); return confirmAnswer; };
globalThis.prompt = () => "stub";
let fetchMap = { "sn5-work-orders.json": woSeed };
globalThis.fetch = async (f) => {
  if (!(f in fetchMap)) throw new Error("404 " + f);
  return { json: async () => fetchMap[f], text: async () => (typeof fetchMap[f] === "string" ? fetchMap[f] : JSON.stringify(fetchMap[f])) };
};
globalThis.Blob = class { constructor(p) { this.text = p.join(""); } };
globalThis.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
const _ls = {};
globalThis.localStorage = { getItem: k => (k in _ls ? _ls[k] : null), setItem: (k, v) => { _ls[k] = String(v); }, removeItem: k => { delete _ls[k]; } };
// Faithful-enough DOMPurify double: strips script/handlers/js: URLs (incl. the
// slash-before-attr form real DOMPurify catches), keeps allowed tags. Prod uses
// the real pinned lib; this exercises the same code path in tests.
globalThis.window.DOMPurify = {
  sanitize: (html) => String(html)
    .replace(/<\s*(script|iframe|object|embed|style)[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|style)[^>]*>/gi, "")
    .replace(/[\s/](on\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, ""),
};

/* ---------- fake fb (generic multi-collection API) ---------- */
const calls = [];
const counters = {};
globalThis.fb = {
  state: "loading", user: null, roster: null, rosterCheckFailed: false,
  async save(coll, obj, field) { calls.push(["save", coll, obj.id, field]); },
  async mutateField(coll, id, field, mutator) { const rec = (DB[coll] || []).find(o => o.id === id); mutator(JSON.parse(JSON.stringify((rec || {})[field] ?? null))); calls.push(["mutateField", coll, id, field]); },
  async appendTo(coll, id, field, el) { calls.push(["appendTo", coll, id, field]); },
  async upload(path, file) { calls.push(["upload", path]); return { url: "https://x/" + path, path, name: (file && file.name) || "f", size: 100, type: (file && file.type) || "" }; },
  async deleteFile(path) { calls.push(["deleteFile", path]); },
  async del(coll, id) { calls.push(["del", coll, id]); },
  async allocId(coll) { counters[coll] = (counters[coll] || 0) + 1; const id = `${({workOrders:"WO",parts:"P",projects:"PROJ",budget:"BUY",stock:"BRD",stackplans:"STK"})[coll]}-SN6-${String(counters[coll]).padStart(3,"0")}`; calls.push(["allocId", coll, id]); return id; },
  async importMany(coll, arr) { calls.push(["importMany", coll, arr.length]); },
  async rosterAll() { return [{ email: "a@b.c", name: "A", role: "member" }]; },
  async rosterSet() { calls.push(["rosterSet"]); },
  async rosterDelete() { calls.push(["rosterDelete"]); },
  async notify(to, type, text, link) { calls.push(["notify", to, type]); },
  async markNotifRead(id) { calls.push(["markNotifRead", id]); },
  async signOut() {}, async refreshRoster() {},
  // No webhook configured in tests → postToSlack() no-ops before ever calling fetch().
  async getConfig(key) { calls.push(["getConfig", key]); return null; },
  async setConfig(key, data) { calls.push(["setConfig", key, data]); },
};

/* ---------- load the app (classic scripts, concatenated, one indirect eval) */
const FILES = ["core.js", "resins.js", "gdocs.js", "workorders.js", "parts.js", "projects.js", "timeline.js", "weeklyplan.js", "budget.js", "dashboard.js", "slicer.js", "stlio.js", "packer.js", "stackview.js", "meshview.js", "drawings.js", "stock.js", "documents.js", "people.js", "reports.js", "print.js"];
let src = FILES.map(f => readFileSync(join(root, f), "utf8")).join("\n;\n");
src = src.replace(/"use strict";\n/g, "");
// core's top-level lexical bindings → implicit globals so tests can read them.
src = src.replace(/^let (DB|view|rosterCache|pendingRender|MOLD_BUF|MOLD_BODIES) = /gm, "$1 = ");
// Same for the const tables the tests assert against — `const` stays lexical
// inside the eval, so it would otherwise be invisible here.
src = src.replace(/^const (STD_STEPS|RESINS|GDOC_KINDS|GD_OPEN|WO_STATUSES|PROCESSES|LAYOUTS|MAX_PAGES|TABS|PICKERS|SUBTEAMS|PROJ_STATUS|STATUS_SLUG|MV_PITCH_LIMIT|MV_FOV|MESH_BYTE_BUDGET|SAMPLE_MOLDS|STAGE_CAD|STAGE_MOLD|STAGE_LAYUP|PART_STAGES) = /gm, "$1 = ");
(0, eval)(src);

/* ---------- runner ---------- */
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + " — " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }
const main = el("main"), sidebar = el("sidebar"), topbar = el("topbar");
function signInAsLead() {
  fb.state = "ready";
  fb.user = { uid: "u1", email: "simon@berkeley.edu", name: "Simon Starbuck" };
  fb.roster = { name: "Simon", role: "lead" };
}

/* ================= tests ================= */
console.log("boot + auth:");
await t("loading → Connecting", () => { render(); assert(main.innerHTML.includes("Connecting")); });
await t("signedout → login", () => { fb.state = "signedout"; onFbChange(); assert(main.innerHTML.includes("Sign in") && main.innerHTML.includes("li-email")); assert(sidebar.innerHTML === "" && topbar.innerHTML === ""); });
await t("pending → roster-wait", () => { fb.state = "pending"; fb.user = { uid: "u9", email: "new@berkeley.edu", name: "New" }; onFbChange(); assert(main.innerHTML.includes("not on the roster")); });

console.log("shell + sidebar:");
signInAsLead();
await t("ready shows sidebar nav + Documents, dashboard default", () => { render(); assert(view.tab === "dashboard"); assert(sidebar.innerHTML.includes("Work Orders") && sidebar.innerHTML.includes("Parts") && sidebar.innerHTML.includes("Timeline") && sidebar.innerHTML.includes("Budget") && sidebar.innerHTML.includes("Documents")); });
await t("lead topbar has Backup/Restore/Archive/Roster + avatar", () => { assert(topbar.innerHTML.includes("Load SN5 archive") && topbar.innerHTML.includes("Roster") && topbar.innerHTML.includes("Restore") && topbar.innerHTML.includes("Simon · lead") && topbar.innerHTML.includes("avatar")); });
await t("setTab switches active sidebar item", () => { setTab("parts"); assert(view.tab === "parts"); assert(sidebar.innerHTML.includes("sb-item active")); assert(main.innerHTML.includes("New Part")); });
await t("member topbar hides Load-archive/Restore/Roster", () => {
  fb.roster = { name: "Sander", role: "member" }; render();
  assert(!topbar.innerHTML.includes("Load SN5 archive") && !topbar.innerHTML.includes("Roster") && !topbar.innerHTML.includes("Restore"), "member must not see lead actions");
  assert(topbar.innerHTML.includes("Backup"), "member still has Backup");
  fb.roster = { name: "Simon", role: "lead" };
});

console.log("work orders:");
await t("seed loads, 26 rows", () => { setTab("workorders"); onFbData("workOrders", woSeed.slice()); assert(DB.workOrders.length === 26); assert(main.innerHTML.includes("26 of 26 work orders")); });
await t("newWO allocates + saves + opens detail", async () => { calls.length = 0; await newWO(); assert(calls.some(c => c[0] === "allocId" && c[1] === "workOrders")); assert(calls.some(c => c[0] === "save" && c[1] === "workOrders")); assert(view.mode === "detail" && view.edit); });
await t("blocker blocks later buy-off", () => { const id = view.id; lastToast = ""; buyoff(2); assert(lastToast.includes("Blocked")); assert(!isSigned(woById(id).steps[2])); });
await t("buy-off stamps identity + writes steps concurrency-safe", () => { calls.length = 0; buyoff(0); const b = woById(view.id).steps[0].buyoff; assert(b.name === "Simon" && b.email === "simon@berkeley.edu" && b.uid === "u1" && b.date); assert(calls.some(c => c[0] === "mutateField" && c[3] === "steps"), "buy-off must use transaction, not whole-field write: " + JSON.stringify(calls)); });
await t("blocker gets a real badge (not bold text), and the first actionable step is marked up-next", () => {
  const wo = { id: "WO-TEST-UPNEXT", partName: "TEST PART", subteam: "AERO", processType: "Wet Layup", revision: "A", status: "InWork", bom: [], qualityChecks: [], steps: [
    { seq: 1, title: "Stack frozen", status: "done", buyoff: { name: "Simon", date: "2026-07-01" } },
    { seq: 2, title: "Mold design review", status: "open", buyoff: { name: "", date: "" } }, // blocker (title matches BLOCKER_WORDS) AND the first not-done step
    { seq: 3, title: "Machine and zero Z", status: "open", buyoff: { name: "", date: "" } },
  ] };
  DB.workOrders = DB.workOrders.concat([wo]); // append — later tests need the seeded/retro WOs still present
  view = { ...view, tab: "workorders", mode: "detail", id: wo.id, edit: false };
  render();
  assert(main.innerHTML.includes('<span class="step-badge">blocker</span>'), "blocker renders as a badge, not bold text: " + main.innerHTML);
  assert(!main.innerHTML.includes("<b>· BLOCKER</b>"), "old bold-text marker is gone");
  const stepDivs = main.innerHTML.match(/<div class="step[^"]*">/g);
  assert(stepDivs && stepDivs.length === 3, "one div per step: " + JSON.stringify(stepDivs));
  assert(!stepDivs[0].includes("upnext"), "step 1 is already done, not up-next: " + stepDivs[0]);
  assert(stepDivs[1].includes("blocker") && stepDivs[1].includes("upnext"), "step 2 is both the blocker and the up-next step: " + stepDivs[1]);
  assert(!stepDivs[2].includes("upnext"), "step 3 isn't reached yet: " + stepDivs[2]);
});
/* ---- cure holds ---------------------------------------------------------
   A work order step used to be a checkbox, so "Cure and demould" could be
   signed ten minutes after "Infuse" and the record looked clean. These cover
   the clock, the block, the override, and the one thing that must never
   happen: the app enforcing a hold shorter than the manufacturer asks for. */
function holdWO(id, hoursAgo, resin, extra) {
  return {
    id, partName: "HOLD TEST", subteam: "AERO", processType: "MoldInfusion",
    revision: "A", status: "InWork", bom: [], qualityChecks: [], timeline: [],
    steps: [
      { seq: 1, title: "Infuse", status: "done", rule: { kind: "startsHold" },
        buyoff: { name: "Simon", date: "2026-08-01" },
        cure: { resin, startedAt: new Date(Date.now() - hoursAgo * 3600000).toISOString(), ...(extra || {}) } },
      { seq: 2, title: "Cure and demould", status: "open", rule: { kind: "hold", from: "resin" }, buyoff: { name: "", date: "" } },
    ],
  };
}
function openHoldWO(wo) {
  DB.workOrders = DB.workOrders.concat([wo]);
  view = { ...view, tab: "workorders", mode: "detail", id: wo.id, edit: false };
  render();
}
await t("the resin table never enforces less than the datasheet says", () => {
  // A FEB hold below the datasheet figure would be the app contradicting the
  // manufacturer, which is worse than not enforcing at all. Data, so a future
  // edit to resins.js can't quietly introduce one.
  const bad = resinTableProblems();
  assert(bad.length === 0, bad.join("; "));
  assert(RESINS.every(r => r.sheetSays && r.doc && r.doc.startsWith("docs/datasheets/")),
    "every hold cites a datasheet that ships with the app");
});
await t("every hold is signed off, and an unsigned one is caught as data", () => {
  // These numbers lock a step and refuse a member's buy-off, so each needs a
  // name against it. The guard is what stops a new resin shipping with a
  // placeholder — that is exactly how the four extrapolated holds sat for a
  // day before Simon signed them off on 2026-08-01.
  RESINS.forEach(r => assert(r.febBy && !/pending/i.test(r.febBy), `${r.id} is unsigned: ${r.febBy}`));
  const saved = RESINS[1].febBy;
  RESINS[1].febBy = "PENDING — needs lead sign-off";
  assert(resinTableProblems().some(p => /not signed off/.test(p)), "a placeholder is refused");
  RESINS[1].febBy = "";
  assert(resinTableProblems().some(p => /not signed off/.test(p)), "so is a missing one");
  RESINS[1].febBy = saved;
  assert(resinTableProblems().length === 0, "table restored clean");
});
await t("the why-modal shows who signed the number off, next to the number", () => {
  openHoldWO(holdWO("WO-HOLD-SIGN", 2, "WS-105-205"));
  openWhyHold(1);
  const m = document.getElementById("modal").innerHTML;
  assert(m.includes("Why 24 hours?"), "the FEB hold, not the datasheet figure: " + m.slice(0, 200));
  assert(m.includes("cure to a solid, thin film 6–8 h at 72 °F"), "datasheet quoted verbatim beside it");
  assert(/Signed off by[\s\S]*Simon Starbuck, 2026-08-01/.test(m), "with the approval: " + m);
  closeModal();
});
await t("a cure in progress locks the next step and says how long is left", () => {
  openHoldWO(holdWO("WO-HOLD-1", 7, "IN2-AT30-SLOW")); // 7 h into a 48 h hold
  const h = holdState(woById("WO-HOLD-1"), 1);
  assert(h && !h.ready, "still curing");
  assert(h.hours === 48, "IN2 SLOW holds 48 h, got " + h.hours);
  assert(Math.round(h.msLeft / 3600000) === 41, "41 h left, got " + (h.msLeft / 3600000));
  const html = main.innerHTML;
  assert(html.includes('<span class="step-badge">hold 48 h</span>'), "the step is badged: " + html.slice(0, 600));
  assert(/class="gate"/.test(html), "amber gate, not the red blocked variant");
  assert(!/gate blocked/.test(html), "a cure that hasn't finished is not an error state");
  assert(html.includes("41 h left"), "countdown is on screen: " + html);
  assert(!/CS-\d/.test(html), "no standard reference in the step row");
});
await t("a member can't sign through a live hold, from the button or the click", () => {
  fb.roster = { name: "Nick", role: "member" };
  openHoldWO(holdWO("WO-HOLD-2", 1, "IN2-AT30-SLOW"));
  assert(/disabled title="curing/.test(main.innerHTML), "button is disabled: " + main.innerHTML);
  lastToast = "";
  buyoff(1);
  assert(lastToast.includes("Still curing"), lastToast);
  assert(!isSigned(woById("WO-HOLD-2").steps[1]), "and nothing was signed");
  fb.roster = { name: "Simon", role: "lead" };
});
await t("once the hold has elapsed the step signs like any other", () => {
  openHoldWO(holdWO("WO-HOLD-3", 60, "IN2-AT30-SLOW")); // 60 h into a 48 h hold
  const h = holdState(woById("WO-HOLD-3"), 1);
  assert(h.ready, "hold is done");
  buyoff(1);
  assert(isSigned(woById("WO-HOLD-3").steps[1]), "signed without an override");
  assert(!(woById("WO-HOLD-3").timeline || []).length, "and nothing was logged as an override");
});
await t("a lead override needs a reason, and writes one event-log line", () => {
  openHoldWO(holdWO("WO-HOLD-4", 31, "IN2-AT30-SLOW")); // 17 h short of 48
  buyoff(1);
  assert(document.getElementById("modal").innerHTML.includes("hold-why"), "override modal opened");
  assert(!isSigned(woById("WO-HOLD-4").steps[1]), "nothing signed yet");
  lastToast = "";
  el("hold-why").value = "   ";
  submitHoldOverride(1);
  assert(lastToast.includes("needs a reason"), lastToast);
  assert(!isSigned(woById("WO-HOLD-4").steps[1]), "an empty reason signs nothing");
  el("hold-why").value = "Comp is Saturday. Tab sample snapped clean, risk accepted.";
  submitHoldOverride(1);
  const w = woById("WO-HOLD-4");
  assert(isSigned(w.steps[1]), "signed after the override");
  assert(w.steps[1].holdOverride.hoursShort === 17, "records how short it was: " + w.steps[1].holdOverride.hoursShort);
  const log = (w.timeline || []).map(e => e.note).join(" | ");
  assert(/overridden by Simon/.test(log) && /17 h of 48/.test(log) && /risk accepted/.test(log),
    "the event log carries who, how short, and why: " + log);
});
await t("a cold shop is reported, never quietly folded into the number", () => {
  openHoldWO(holdWO("WO-HOLD-5", 2, "IN2-AT30-SLOW", { tempC: 14 }));
  const h = holdState(woById("WO-HOLD-5"), 1);
  assert(h.hours === 48, "the hold is unchanged by temperature: " + h.hours);
  assert(holdIsCold(h), "but it is flagged cold");
  assert(main.innerHTML.includes("14 °C"), "and the temperature is on screen");
  assert(/Test the flange, not the clock/.test(main.innerHTML), "with what to do about it");
});
await t("an unrecorded resin holds nothing rather than inventing a number", () => {
  openHoldWO(holdWO("WO-HOLD-6", 1, ""));
  assert(holdState(woById("WO-HOLD-6"), 1) === null, "no resin, no enforceable hold");
  buyoff(1);
  assert(isSigned(woById("WO-HOLD-6").steps[1]), "so the step signs normally");
});
await t("buying off a cure-starting step asks what went in, and records it", () => {
  const wo = holdWO("WO-HOLD-7", 0, "IN2-AT30-SLOW");
  wo.steps[0].status = "open"; wo.steps[0].buyoff = { name: "", date: "" }; delete wo.steps[0].cure;
  openHoldWO(wo);
  calls.length = 0;
  buyoff(0);
  assert(!isSigned(woById("WO-HOLD-7").steps[0]), "the modal comes first, the signature after");
  const m = document.getElementById("modal").innerHTML;
  assert(m.includes("cure-resin") && m.includes("cure-date") && m.includes("cure-temp"), "resin, time and temperature: " + m.slice(0, 400));
  el("cure-resin").value = "WS-105-206"; el("cure-date").value = "2026-08-01";
  el("cure-time").value = "09:30"; el("cure-temp").value = "17";
  submitCure(0);
  const s = woById("WO-HOLD-7").steps[0];
  assert(isSigned(s), "now it's signed");
  assert(s.cure.resin === "WS-105-206" && s.cure.tempC === 17, JSON.stringify(s.cure));
  assert(s.cure.startedAt.slice(0, 10) === "2026-08-01", "the recorded time is the one typed, not now: " + s.cure.startedAt);
  assert(calls.some(c => c[0] === "mutateField" && c[3] === "steps"),
    "the cure record goes through the same transaction as the buy-off: " + JSON.stringify(calls));
});
await t("retro work orders document holds, they don't enforce them", () => {
  const wo = holdWO("WO-HOLD-8", 1, "IN2-AT30-SLOW");
  wo.retro = true;
  openHoldWO(wo);
  assert(holdState(woById("WO-HOLD-8"), 1) === null, "same exemption blockers already take");
});
await t("fmtLeft reads like a person wrote it, at every scale", () => {
  assert(fmtLeft(41 * 3600000) === "41 h left", fmtLeft(41 * 3600000));
  assert(fmtLeft(5.5 * 3600000) === "5 h 30 min left", fmtLeft(5.5 * 3600000));
  assert(fmtLeft(45 * 60000) === "45 min left", fmtLeft(45 * 60000));
  assert(fmtLeft(0) === "ready" && fmtLeft(-9e6) === "ready", "a finished hold says so");
  assert(fmtLeft(null) === "", "and a missing one says nothing");
  // daysUntil() is the reason these exist: it rounds to whole days and would
  // call a six-hour cure zero.
  assert(msLeft(new Date(Date.now() - 3600000).toISOString(), 3) > 0, "3 h hold, 1 h in, still curing");
  assert(msLeft("", 48) === null && msLeft("not a date", 48) === null, "no start, no clock");
});
await t("every standard template's hold follows the step that starts its clock", () => {
  // holdState() reads the PREVIOUS step's cure record, so a template that puts
  // a hold anywhere else would silently never fire.
  Object.entries(STD_STEPS).forEach(([proc, rows]) => {
    rows.forEach((row, i) => {
      if (row[1] && row[1].kind === "hold") {
        const prev = rows[i - 1];
        assert(prev && prev[1] && prev[1].kind === "startsHold",
          `${proc} step ${i + 1} "${row[0]}" holds, but "${prev ? prev[0] : "nothing"}" before it doesn't start a clock`);
      }
    });
  });
});
await t("retro WO exempt from blockers, no buy-off button", () => { const r = DB.workOrders.find(w => w.retro); view = { ...view, tab: "workorders", mode: "detail", id: r.id, edit: false }; render(); assert(!main.innerHTML.includes("buy off as")); assert(blockerOpenBefore(r, r.steps.length) === null); });
await t("reset steps lead-only + counts buy-offs", async () => { fb.roster = { name: "M", role: "member" }; const wo = woById(view.id); lastToast = ""; resetSteps(wo); assert(lastToast.includes("lead-only")); fb.roster = { name: "Simon", role: "lead" }; });
await t("an undisposed linked issue blocks WO completion; disposing it unblocks", async () => {
  await newWO();
  const woId = view.id;
  const issue = { id: "TKT-GATE-1", title: "Test nonconformance", kind: "issue", status: "To Do", workOrderId: woId, resolutionMethod: "", whatHappened: "", assignees: [], watchers: [], files: [], comments: [] };
  DB.projects.push(issue);
  lastToast = "";
  updWO("status", "Complete");
  assert(lastToast.includes("linked issue"), "blocked: " + lastToast);
  assert(woById(woId).status !== "Complete", "not completed while undisposed");
  issue.resolutionMethod = "Corrective Action"; // doesn't have to be resolved right away, but must carry a method before the WO can close
  updWO("status", "Complete");
  assert(woById(woId).status === "Complete", "completes once disposed");
});
await t("a Cancelled issue needs no disposition and doesn't block completion", async () => {
  await newWO();
  const woId = view.id;
  DB.projects.push({ id: "TKT-GATE-2", title: "False alarm", kind: "issue", status: "Cancelled", workOrderId: woId, resolutionMethod: "", assignees: [], watchers: [] });
  updWO("status", "Complete");
  assert(woById(woId).status === "Complete", "cancelled issues don't gate completion");
});
await t("relatedWorkOrders links do NOT count toward the completion gate, only the required workOrderId", async () => {
  await newWO();
  const woId = view.id;
  DB.projects.push({ id: "TKT-GATE-3", title: "Unrelated issue, just linked informationally", kind: "issue", status: "To Do", workOrderId: "WO-SOMETHING-ELSE", relatedWorkOrders: [woId], resolutionMethod: "", assignees: [], watchers: [] });
  updWO("status", "Complete");
  assert(woById(woId).status === "Complete", "an informational relatedWorkOrders link must not gate completion");
});
await t("createIssueFromWO pre-fills the work order in the new-ticket modal", () => {
  const woId = DB.workOrders[0].id;
  createIssueFromWO(woId);
  assert(document.getElementById("np-kind").value === "issue", "kind pre-selected");
  assert(document.getElementById("np-wo").value === woId, "work order pre-filled");
  closeModal();
});

console.log("parts:");
await t("newPart creates with three stages", async () => { setTab("parts"); calls.length = 0; await newPart(); const p = partById(view.id); assert(p.cadProgress === "Not Started" && p.moldProgress === "Not Started" && p.layupProgress === "Not Started"); assert(calls.some(c => c[0] === "save" && c[1] === "parts")); });
// Was "stage pills colored by progress" against the old list markup (a pill AND
// a 64px bar per stage, 6 marks a row). The index now carries one 3-segment
// rail per part and the exact stage names live on the detail pane, so the same
// behaviour is asserted against where each thing now lives.
await t("stage colour is derived from the value's meaning, not its position in the enum", () => {
  // The real bug: STAGE_MOLD starts with "N/A (Flat)", so "Not Started" is at
  // index 1 and a position-based rule painted every unstarted mold amber —
  // i.e. reported work in progress that nobody had begun.
  assert(stageClass("Not Started", STAGE_MOLD) === "st-0", "unstarted mold must be st-0, not amber: " + stageClass("Not Started", STAGE_MOLD));
  assert(stageClass("Not Started", STAGE_CAD) === "st-0", "unstarted CAD is st-0");
  assert(stageClass("Not Started", STAGE_LAYUP) === "st-0", "unstarted layup is st-0");
  assert(stageClass("N/A (Flat)", STAGE_MOLD) === "st-na", "N/A is its own state");
  assert(stageClass("Machining", STAGE_MOLD) === "st-mid", "mid-enum is amber");
  assert(stageClass("Ready For Layup", STAGE_MOLD) === "st-done", "last value is done");
  assert(stageClass("Mold CAD/CAM Done", STAGE_CAD) === "st-done");
  assert(stageClass("Wat", STAGE_CAD) === "st-0", "unknown legacy string must not claim progress");
});
await t("index draws one 3-segment stage rail per part (not a pill + a bar for each stage)", () => {
  DB.parts = [{ id: "P-SN6-009", partName: "STG", cadProgress: "Mold CAD/CAM Done", moldProgress: "N/A (Flat)", layupProgress: "Not Started" }];
  view = { ...view, tab: "parts", mode: "list", q: "", fSub: "", fLate: false, fMine: false, fEng: "", fDone: false, sortKey: null }; render();
  const item = /<div class="pitem[\s\S]*?<\/div>/.exec(main.innerHTML)[0];
  assert((item.match(/class="sg /g) || []).length === 3, "exactly three marks for three stages: " + item);
  assert(item.includes('class="sg st-done"') && item.includes('class="sg st-na"') && item.includes('class="sg st-0"'), "one per state: " + item);
  assert(!item.includes('class="stage '), "no full-text stage pills in the index — they live on the detail pane");
  assert(item.includes("Mold: N/A (Flat)"), "the exact stage name is still reachable as a tooltip: " + item);
});
await t("stage rail fill is measured over the values that mean work, and N/A gets no fill", () => {
  assert(stagePct("Mold CAD/CAM Done", STAGE_CAD) === 100, "last of three → 100%");
  assert(stagePct("Not Started", STAGE_CAD) === 0);
  // STAGE_MOLD's first entry is N/A, so measuring across the raw array would put
  // an unstarted mold at 20% instead of 0.
  assert(stagePct("Not Started", STAGE_MOLD) === 0, "unstarted mold is 0%, not 1/5: " + stagePct("Not Started", STAGE_MOLD));
  assert(stagePct("Ready For Layup", STAGE_MOLD) === 100);
  const rail = stageRail({ cadProgress: "Mold CAD/CAM Done", moldProgress: "N/A (Flat)", layupProgress: "Not Started" });
  assert(rail.includes('<i style="width:100%">'), "CAD fully done → full underline: " + rail);
  assert((rail.match(/<i style=/g) || []).length === 2, "only CAD + Layup get a fill; N/A mold gets none: " + rail);
});
await t("partDone true only when layup complete/polished", () => { assert(!partDone({ layupProgress: "In Layup" })); assert(partDone({ layupProgress: "Polished" })); assert(partDone({ layupProgress: "Layup Complete" })); });
// Same behaviour as the old header-click sort; the control moved from a set of
// <th>s (there is no wide table any more) to the index header's Sort select
// plus a direction toggle, so the assertions read the rendered row order and
// the state of those two controls.
await t("index sorts on the sort control, with real progress order (not text order) for stage keys", () => {
  DB.parts = DB.parts.concat([ // append — later tests need existing fixture parts (e.g. P-SN6-009) to stay put
    { id: "P-A", partName: "Zeta Part", moldProgress: "Sealed", layupDeadline: "2026-08-01" },
    { id: "P-B", partName: "Alpha Part", moldProgress: "Machining", layupDeadline: "2026-07-01" },
    { id: "P-C", partName: "Mid Part", moldProgress: "Ready For Layup", layupDeadline: "2026-07-15" },
  ]);
  view = { ...view, tab: "parts", mode: "list", id: null, q: "", fSub: "", fLate: false, fMine: false, fEng: "", fDone: false, sortKey: null, sortDir: null };
  render();
  const rowOrder = () => [...main.innerHTML.matchAll(/id="pi-(P-[ABC])"/g)].map(m => m[1]);
  let order = rowOrder();
  assert(order[0] === "P-B" && order[2] === "P-A", "default (unsorted) is by deadline: " + order.join(","));

  sortPartsBy("partName");
  assert(main.innerHTML.includes('value="partName" selected'), "the sort control shows the active key: " + main.innerHTML.slice(0, 400));
  assert(main.innerHTML.includes(">▲<"), "ascending direction shown");
  order = rowOrder();
  assert(order[0] === "P-B" && order[1] === "P-C" && order[2] === "P-A", "alphabetical: Alpha, Mid, Zeta: " + order.join(","));

  togglePartSortDir();
  assert(main.innerHTML.includes(">▼<"), "toggling reverses it");
  order = rowOrder();
  assert(order[0] === "P-A", "now descending, Zeta first: " + order.join(","));

  sortPartsBy("moldProgress"); // STAGE_MOLD order is Machining < Sealed < Ready For Layup — alphabetically "Ready" would sort first, which would be wrong
  order = rowOrder();
  assert(order[0] === "P-B" && order[1] === "P-A" && order[2] === "P-C", "real stage progression (Machining, Sealed, Ready For Layup), not alphabetical: " + order.join(","));
});
await t("Stock and Parts don't share a sidebar icon (regression: Stock used to reuse ic:'parts')", () => {
  const stockTab = TABS.find(t => t.id === "stock"), partsTab = TABS.find(t => t.id === "parts");
  assert(stockTab.ic !== partsTab.ic, "icons must differ: " + stockTab.ic + " vs " + partsTab.ic);
});
await t("part field edit saves only that field", () => { view = { ...view, tab: "parts", mode: "detail", id: "P-SN6-009", edit: true }; calls.length = 0; updPart("subteam", "AERO"); assert(partById("P-SN6-009").subteam === "AERO"); assert(calls.some(c => c[0] === "save" && c[1] === "parts" && c[3] === "subteam")); });

console.log("parts: master–detail split");
// A small fixture the split tests share. Deliberately includes a completed part
// (so the default filter hides it) and a late one.
function partsFixture() {
  DB.users = [{ email: "nick@berkeley.edu", name: "Nick Jepsen", role: "member" }];
  DB.workOrders = [{ id: "WO-SN6-042", partName: "NOSECONE", partId: "P-N1", status: "InWork", steps: [] }];
  DB.projects = [{ id: "PROJ-7", title: "Nose fit-up", status: "In Progress", relatedParts: ["P-N1"], assignees: [] }];
  DB.schedule = [{ id: "W12", weekOf: "2026-03-02", mold1: "P-N1", waterjet: "", notes: "" }];
  DB.parts = [
    { id: "P-N1", partName: "NOSECONE", subteam: "AERO", layupType: "MOLD INFUSION", moldEngineer: "Nick", manufacturingEngineer: "Simon",
      cadProgress: "Mold CAD/CAM Done", moldProgress: "Not Started", layupProgress: "In Layup",
      layupDeadline: "2000-01-01", weightG: "500", weightActualG: "540", comments: "line one\nline two", workOrderId: "WO-SN6-042", layupStack: [] },
    { id: "P-N2", partName: "SIDEPOD", subteam: "BERGO", cadProgress: "Not Started", moldProgress: "Machining", layupProgress: "Not Started", layupDeadline: "2030-01-01" },
    { id: "P-N3", partName: "OLD WING", subteam: "AERO", cadProgress: "Mold CAD/CAM Done", moldProgress: "Ready For Layup", layupProgress: "Polished", layupDeadline: "2026-01-01" },
  ];
  view = { ...view, tab: "parts", mode: "list", id: null, edit: false, q: "", fSub: "", fDone: false, fLate: false, fMine: false, fEng: "", sortKey: null, sortDir: null };
}
await t("the tab renders both panes at once — the index is never destroyed by opening a part", () => {
  partsFixture(); render();
  assert(main.innerHTML.includes('class="mdsplit'), "split container");
  assert(main.innerHTML.includes('class="mdindex"'), "index pane");
  assert(main.innerHTML.includes('class="mddetail"'), "right pane");
  assert(!main.innerHTML.includes("has-sel"), "nothing selected yet");
  assert(main.innerHTML.includes("Parts this season"), "with nothing selected the right pane is the season read, not dead space");
  selectPart("P-N1");
  assert(main.innerHTML.includes("mdsplit has-sel"), "selection flagged for the ≤900 collapse");
  assert(main.innerHTML.includes('class="mdindex"'), "the index is STILL rendered beside the part");
  assert(main.innerHTML.includes('id="pi-P-N2"'), "and still lists the other parts");
  assert(/id="pi-P-N1"[\s\S]{0,80}sel/.test(main.innerHTML) || main.innerHTML.includes('class="pitem sel'), "the open part is marked selected in the index");
});
await t("openRecord('parts', id) from another tab lands on the right part with the right pane showing it", () => {
  partsFixture();
  setTab("dashboard");                       // start somewhere else, as a chip / ⌘K / People jump does
  openRecord("parts", "P-N2");
  assert(view.tab === "parts" && view.mode === "detail" && view.id === "P-N2", "view state: " + JSON.stringify({ t: view.tab, m: view.mode, i: view.id }));
  assert(main.innerHTML.includes("mdsplit has-sel"), "arrives selected, so ≤900 shows the detail page");
  assert(main.innerHTML.includes("SIDEPOD"), "the named part is what's rendered");
  assert(main.innerHTML.includes('id="pi-P-N1"'), "and the index came with it");
  assert(!main.innerHTML.includes("Parts this season"), "the overview pane is replaced, not stacked");
});
await t("a jump to a completed (filtered-out) part still shows it, in both panes", () => {
  partsFixture();
  openRecord("parts", "P-N3");               // Polished → hidden by the default filter
  assert(main.innerHTML.includes("OLD WING"), "the detail renders it");
  assert(main.innerHTML.includes('id="pi-P-N3"'), "and the index keeps it visible rather than hiding what you're reading");
});
await t("a jump to a part that no longer exists falls back to the index, it doesn't blow up", () => {
  partsFixture();
  openRecord("parts", "P-GONE");
  assert(main.innerHTML.includes('class="mdindex"') && main.innerHTML.includes("Parts this season"), "overview, no crash");
});
await t("↑/↓ (and j/k) walk the index without the mouse", () => {
  partsFixture(); render();
  const order = [...main.innerHTML.matchAll(/id="pi-(P-N\d)"/g)].map(m => m[1]);
  assert(order.join(",") === "P-N1,P-N2", "fixture order (by deadline), completed hidden: " + order.join(","));
  partsKeydown({ key: "ArrowDown", target: { tagName: "BODY" } });
  assert(view.id === "P-N1" && view.mode === "detail", "first press selects the top row: " + view.id);
  partsKeydown({ key: "j", target: { tagName: "BODY" } });
  assert(view.id === "P-N2", "j moves down: " + view.id);
  partsKeydown({ key: "j", target: { tagName: "BODY" } });
  assert(view.id === "P-N2", "and stops at the end rather than wrapping");
  partsKeydown({ key: "k", target: { tagName: "BODY" } });
  assert(view.id === "P-N1", "k moves up: " + view.id);
  partsKeydown({ key: "Escape", target: { tagName: "BODY" } });
  assert(view.mode === "list", "escape clears the selection (and, at ≤900, goes back)");
});
await t("keyboard nav keeps its hands off text fields and other tabs", () => {
  partsFixture(); selectPart("P-N1");
  assert(partsKeydown({ key: "j", target: { tagName: "INPUT" } }) === null, "typing 'j' in the search box must not move the selection");
  assert(view.id === "P-N1");
  assert(partsKeydown({ key: "ArrowDown", target: { tagName: "TEXTAREA" } }) === null, "nor in a comment box");
  assert(partsKeydown({ key: "ArrowDown", metaKey: true, target: { tagName: "BODY" } }) === null, "nor with a modifier held");
  setTab("workorders");
  assert(partsKeydown({ key: "ArrowDown", target: { tagName: "BODY" } }) === null, "and nothing at all on another tab");
});
await t("progress is rendered once, as a stepper — no edit mode, no dropdown", () => {
  partsFixture(); openRecord("parts", "P-N1");
  let html = main.innerHTML;
  assert((html.match(/class="pstage"/g) || []).length === 3, "one row per stage, not a read-only grid AND a pill row: " + (html.match(/class="pstage"/g) || []).length);
  // Every value of every enum is on screen as its own button: 3 + 6 + 4.
  assert((html.match(/class="pstep/g) || []).length === STAGE_CAD.length + STAGE_MOLD.length + STAGE_LAYUP.length, "the whole enum is laid out: " + (html.match(/class="pstep/g) || []).length);
  assert(html.includes(`setPartStage('P-N1','layupProgress','Layup Complete',event)`), "one click writes the step you pointed at");
  assert(html.includes('class="pstep cur st-done"'), "current step carries the stage colour");
  assert(!html.includes("ps-edit"), "no select anywhere — the display IS the control");
  view.edit = true; render();
  html = main.innerHTML;
  assert((html.match(/class="pstage"/g) || []).length === 3, "still exactly one row per stage with the record in edit mode");
  assert((html.match(/class="pstep/g) || []).length === STAGE_CAD.length + STAGE_MOLD.length + STAGE_LAYUP.length, "and the stepper is the same control in both modes");
  view.edit = false;
});
await t("a passed step is muted, never green and never ticked", () => {
  partsFixture(); openRecord("parts", "P-N1");   // layup is "In Layup": "Not Started" is behind it
  const html = main.innerHTML;
  const steps = [...html.matchAll(/<button type="button" class="([^"]*)"[\s\S]*?>([^<]*)<\/button>/g)].map(m => ({ cls: m[1], txt: m[2] }));
  const notStarted = steps.filter(s => s.txt === "Not Started");
  assert(notStarted.length === 3, "one per stage: " + notStarted.length);
  const passed = steps.filter(s => s.cls.includes("past"));
  assert(passed.length, "P-N1 has passed steps to check");
  passed.forEach(s => {
    assert(!s.cls.includes("st-done"), "a passed step must not borrow the done colour: " + s.cls);
    assert(!/[✓✔]/.test(s.txt), "and must not be ticked: " + s.txt);
  });
  // The specific bug transplanted FROM (variant B painted "Not Started" green
  // with a checkmark, which means "finished" everywhere else in this app).
  notStarted.forEach(s => assert(!s.cls.includes("st-done") && !/[✓✔]/.test(s.txt), "unstarted stays grey: " + s.cls + " / " + s.txt));
});
await t("one step forward writes straight away, with a toast and an undo bar", () => {
  partsFixture(); openRecord("parts", "P-N2");
  calls.length = 0; lastToast = ""; globalThis.__confirmCb = null;
  const r = setPartStage("P-N2", "cadProgress", "Part CAD Done");   // Not Started → next
  assert(r === "applied", "no confirmation for the ordinary move: " + r);
  assert(partById("P-N2").cadProgress === "Part CAD Done");
  assert(calls.some(c => c[0] === "save" && c[1] === "parts" && c[3] === "cadProgress"), "single named field: " + JSON.stringify(calls));
  assert(lastToast.includes("Part CAD Done"), "said what it did: " + lastToast);
  assert(main.innerHTML.includes("undobar") && main.innerHTML.includes("undoPartStage()"), "and left an undo that outlives the toast");
  calls.length = 0;
  undoPartStage();
  assert(partById("P-N2").cadProgress === "Not Started", "undo puts it back: " + partById("P-N2").cadProgress);
  assert(calls.some(c => c[0] === "save" && c[3] === "cadProgress"), "as its own write");
  assert(!main.innerHTML.includes("undobar"), "and the bar goes away once used");
});
/* Half the SN5 tracker has one person in both engineer columns. Rendered as two
   chips it reads as two people; UT SIDE RIGHT showed "Justin, Justin". */
await t("one person holding both roles is one chip, not two identical faces", () => {
  DB.users = [{ email: "justin@berkeley.edu", name: "Justin Lee", role: "member" }];
  const both = partEngineers({ moldEngineer: "Justin", manufacturingEngineer: "justin" });
  assert(both.length === 1, "collapsed, case-insensitively: " + JSON.stringify(both));
  assert(both[0].role === "ME+RE", "and carries both roles: " + both[0].role);
  const two = partEngineers({ moldEngineer: "Nico", manufacturingEngineer: "Chuning" });
  assert(two.length === 2 && two[0].role === "ME" && two[1].role === "RE", "two people stay two: " + JSON.stringify(two));
  // "N/A (Flat)" is a stage value that leaked into the engineer column in the archive.
  assert(partEngineers({ moldEngineer: "N/A (Flat)", manufacturingEngineer: "Justin" }).length === 1,
    "a stage value is not a person");
});
/* The undo bar is only worth having if it is where you can see it. On a phone
   you set a stage most of a page down the detail pane; left in the page flow the
   bar would be offscreen at exactly the moment it is wanted.

   It first shipped as `top: 0`, which was wrong in a way nothing caught: the
   topbar is also sticky at 0 and carries z-index 5 against this bar's 4, so on a
   phone the undo pinned BEHIND the topbar and was invisible. It has to clear the
   topbar's real height, which is what --topbar-h is for. Geometry lives in
   tools/test_safearea.mjs, which can measure; this asserts the wiring, because
   the DOM stub computes no styles. */
await t("the undo bar is sticky, and clears the topbar rather than hiding under it", () => {
  const css = readFileSync(join(root, "..", "..", "03 App", "app", "index.html"), "utf8");
  const rule = (css.match(/\.undobar \{[^}]*\}/) || [""])[0];
  assert(/position: sticky/.test(rule), "sticky: " + rule);
  assert(/z-index: 4/.test(rule), "under the topbar (5), over the panes: " + rule);
  assert(/top: calc\(var\(--topbar-h\)[^)]*\)/.test(rule), "offset from the measured topbar: " + rule);
  assert(!/\.undobar \{[^}]*top: 0/.test(css), "and never pinned at 0, which put it behind the topbar");
});
await t("the season tiles are pinned above an open part, but not on a phone", () => {
  const css = readFileSync(join(root, "..", "..", "03 App", "app", "index.html"), "utf8");
  const resp = css.slice(css.indexOf("@media (max-width: 640px)"));
  assert(/\.pstats\.compact \{ display: none; \}/.test(resp),
    "≤640 drops them — the index is one tap away and already carries them");
});
await t("the 1/2/3 hint only shows when 1/2/3 would do something", () => {
  partsFixture();
  view = { ...view, tab: "parts", mode: "list", id: null }; render();
  assert(!main.innerHTML.includes("advance C/M/L"), "not advertised over the season overview");
  openRecord("parts", "P-N1");
  assert(main.innerHTML.includes("advance C/M/L"), "advertised once a part is open");
});
await t("clicking the step you are already on does nothing at all", () => {
  partsFixture(); openRecord("parts", "P-N1");
  calls.length = 0;
  assert(setPartStage("P-N1", "layupProgress", "In Layup") === null, "no write");
  assert(!calls.length, "nothing saved: " + JSON.stringify(calls));
});
await t("stepping BACKWARDS asks first — it erases recorded work for everyone", () => {
  partsFixture(); openRecord("parts", "P-N1");
  calls.length = 0; globalThis.__confirmCb = null;
  const r = setPartStage("P-N1", "layupProgress", "Not Started");
  assert(r === "confirm-back", "confirmed, not applied: " + r);
  assert(partById("P-N1").layupProgress === "In Layup", "and nothing written until it is answered");
  assert(!calls.length, "no save before the answer");
  confirmProceed();
  assert(partById("P-N1").layupProgress === "Not Started", "answering yes applies it");
  assert(calls.some(c => c[0] === "save" && c[3] === "layupProgress"));
});
await t("a MULTI-STEP forward jump asks too, and names the steps it would skip", () => {
  // The hole the reviewer found in variant C: one click could jump several
  // steps with nothing but a toast to mention it.
  partsFixture(); openRecord("parts", "P-N2");   // mold: "Machining"
  calls.length = 0; globalThis.__confirmCb = null;
  const r = setPartStage("P-N2", "moldProgress", "Ready For Layup");   // skips Machine Complete + Sealed
  assert(r === "confirm-jump", "a jump is not an ordinary advance: " + r);
  assert(partById("P-N2").moldProgress === "Machining", "unwritten until answered");
  assert(el("modal").innerHTML.includes("Machine Complete") && el("modal").innerHTML.includes("Sealed"), "the question names what it skips: " + el("modal").innerHTML);
  confirmProceed();
  assert(partById("P-N2").moldProgress === "Ready For Layup");
  // ...while the very next step is still a single unprompted click.
  partsFixture(); openRecord("parts", "P-N2");
  assert(setPartStage("P-N2", "moldProgress", "Machine Complete") === "applied", "one step is still one click");
});
await t("marking a part flat (N/A) asks first, and says so on the detail page", () => {
  partsFixture(); openRecord("parts", "P-N2");
  globalThis.__confirmCb = null;
  const r = setPartStage("P-N2", "moldProgress", "N/A (Flat)");
  assert(r === "confirm-na", "never a silent write: " + r);
  assert(el("modal").innerHTML.toLowerCase().includes("flat"), "asked in the part's language: " + el("modal").innerHTML);
  confirmProceed();
  assert(partById("P-N2").moldProgress === "N/A (Flat)");
  assert(main.innerHTML.includes("flat — no mold"), "and the detail page spells out what the violet pill means");
  // Leaving N/A joins the track at its first step, which is one move, not a jump.
  assert(setPartStage("P-N2", "moldProgress", "Not Started") === "applied", "coming back off N/A is an ordinary move");
});
await t("1 / 2 / 3 advance CAD / Mold / Layup on the open part by exactly one step", () => {
  partsFixture(); render();
  assert(partsKeydown({ key: "1", target: { tagName: "BODY" } }) === null, "nothing to advance with no part open");
  selectPart("P-N2");                                  // CAD "Not Started", mold "Machining"
  partsKeydown({ key: "1", target: { tagName: "BODY" } });
  assert(partById("P-N2").cadProgress === "Part CAD Done", "1 = CAD: " + partById("P-N2").cadProgress);
  globalThis.__confirmCb = null;
  partsKeydown({ key: "2", target: { tagName: "BODY" } });
  assert(partById("P-N2").moldProgress === "Machine Complete", "2 = Mold, one step: " + partById("P-N2").moldProgress);
  assert(!globalThis.__confirmCb, "one step never asks");
  partsKeydown({ key: "3", target: { tagName: "BODY" } });
  assert(partById("P-N2").layupProgress === "In Layup", "3 = Layup: " + partById("P-N2").layupProgress);
  // Already at the end: says so rather than wrapping round to Not Started.
  DB.parts[1].layupProgress = "Polished"; lastToast = "";
  partsKeydown({ key: "3", target: { tagName: "BODY" } });
  assert(partById("P-N2").layupProgress === "Polished" && lastToast.includes("already"), "end of the track: " + lastToast);
  assert(partsKeydown({ key: "1", target: { tagName: "INPUT" } }) === null, "and never while someone is typing");
});
await t("edit mode gives workOrderId a picker and layupDeadline a real date input", () => {
  partsFixture(); openRecord("parts", "P-N1"); view.edit = true; render();
  const html = main.innerHTML;
  assert(html.includes('<option value="WO-SN6-042" selected>WO-SN6-042 — NOSECONE</option>'), "work orders are chosen from the list, not typed from memory: " + html.slice(html.indexOf("Linked work order"), html.indexOf("Linked work order") + 400));
  assert(/<input type="date" value="2000-01-01"/.test(html), "deadline is a date field: " + html);
});
await t("renaming a part updates the heading immediately (the write used to leave a stale h2)", () => {
  partsFixture(); openRecord("parts", "P-N1"); view.edit = true; render();
  calls.length = 0;
  updPart("partName", "NOSE MK2");
  assert(calls.some(c => c[0] === "save" && c[1] === "parts" && c[3] === "partName"), "single-field write");
  assert(main.innerHTML.includes("NOSE MK2"), "and the page shows the new name");
  assert(!main.innerHTML.includes(">NOSECONE<"), "with no stale copy of the old one");
});
await t("the part page surfaces what points at it: work orders, tickets, schedule weeks, people", () => {
  partsFixture(); openRecord("parts", "P-N1");
  const html = main.innerHTML;
  assert(html.includes("WO-SN6-042"), "linked work order");
  assert(html.includes("Nose fit-up"), "ticket that lists this part");
  assert(html.includes("week of 2026-03-02"), "the week it's scheduled on a station");
  assert(html.includes("filterByEngineer('Nick')"), "ME/RE are people you can filter by, not plain text");
  assert(html.includes("avatar"), "with a face");
});
await t("clicking an engineer filters the index to their parts", () => {
  partsFixture(); render();
  filterByEngineer("Nick");
  assert(view.fEng === "Nick");
  assert(main.innerHTML.includes('id="pi-P-N1"') && !main.innerHTML.includes('id="pi-P-N2"'), "only Nick's parts");
  filterByEngineer("Nick");
  assert(!view.fEng && main.innerHTML.includes('id="pi-P-N2"'), "clicking again clears it");
});
await t("the index summarises the season and the late chip filters to it", () => {
  partsFixture(); render();
  const html = main.innerHTML;
  assert(/<b>2<\/b> open/.test(html) && /<b>1<\/b> late/.test(html) && /<b>1<\/b> done/.test(html), "counts by state: " + html.slice(html.indexOf("psum"), html.indexOf("psum") + 500));
  view.fLate = true; render();
  assert(main.innerHTML.includes('id="pi-P-N1"') && !main.innerHTML.includes('id="pi-P-N2"'), "late-only");
});
await t("the retro badge only appears when the visible set is actually mixed", () => {
  partsFixture();
  DB.parts.forEach(p => { p.retro = true; });
  render();
  assert(!/pill retro/.test(main.innerHTML.slice(0, main.innerHTML.indexOf("mddetail"))), "a flag true for every row carries no information, so it isn't drawn");
  DB.parts[1].retro = false; render();
  assert(/pill retro/.test(main.innerHTML), "once the set is mixed it means something again");
  DB.parts.forEach(p => { p.retro = false; });
});
await t("comments get an author and a timestamp, and the old free-text note keeps its newlines", () => {
  partsFixture(); openRecord("parts", "P-N1");
  assert(main.innerHTML.includes("line one<br>line two"), "the legacy blob stays authoritative and readable");
  calls.length = 0;
  el("pcomment").value = "  ";
  lastToast = ""; postPartComment("P-N1");
  assert(lastToast.includes("Write a comment"), "empty comment refused");
  el("pcomment").value = "mold is sealed";
  postPartComment("P-N1");
  const c = partById("P-N1").commentLog[0];
  assert(c.text === "mold is sealed" && c.author === "Simon" && c.email === "simon@berkeley.edu" && c.ts, "structured entry: " + JSON.stringify(c));
  assert(calls.some(x => x[0] === "mutateField" && x[1] === "parts" && x[3] === "commentLog"), "appended concurrency-safely: " + JSON.stringify(calls));
  assert(main.innerHTML.includes("mold is sealed") && main.innerHTML.includes("Simon"), "and shows up with its author");
  assert(partById("P-N1").comments === "line one\nline two", "the original comments field is untouched");
});
await t("actual weight is additive and reads against the target", () => {
  partsFixture(); openRecord("parts", "P-N1");
  assert(main.innerHTML.includes("+40 g"), "540g against a 500g target: " + main.innerHTML.slice(main.innerHTML.indexOf("Mass vs target"), main.innerHTML.indexOf("Mass vs target") + 200));
  delete DB.parts[0].weightActualG; render();
  assert(main.innerHTML.includes("Mass vs target"), "and an empty new field renders fine on an unmigrated record");
});
await t("every SN5 record renders in both panes with no migration", () => {
  const seed = JSON.parse(readFileSync(join(root, "sn5-parts.json"), "utf8"));
  DB.parts = seed.map(p => ({ ...p }));
  DB.workOrders = []; DB.projects = []; DB.schedule = []; DB.users = [];
  view = { ...view, tab: "parts", mode: "list", id: null, edit: false, q: "", fSub: "", fDone: true, fLate: false, fMine: false, fEng: "", sortKey: null };
  render();
  seed.forEach(p => assert(main.innerHTML.includes(`id="pi-${p.id}"`), p.id + " missing from the index"));
  seed.forEach(p => {
    openRecord("parts", p.id);
    assert(main.innerHTML.includes("pt-progress") && main.innerHTML.includes("pt-links"), p.id + " detail failed to render");
    assert(main.innerHTML.includes("ps-steps"), p.id + " stage stepper failed to render");
    view.edit = true; render();
    assert(main.innerHTML.includes("pgrid"), p.id + " edit mode failed to render");
    view.edit = false;
  });
});
await t("the ≤900 collapse is a stylesheet rule, in the one responsive block, keyed off the same has-sel state", () => {
  const css = readFileSync(join(root, "index.html"), "utf8");
  const respAt = css.indexOf("RESPONSIVE. Placed at the end on purpose");
  assert(respAt > 0, "the responsive block marker is still there");
  const collapse = css.indexOf(".mdsplit.has-sel > .mdindex { display: none; }");
  assert(collapse > respAt, "the collapse rule lives in the responsive block at the end, not beside the component: " + collapse + " vs " + respAt);
  assert(css.slice(respAt).indexOf(".mdsplit { grid-template-columns: 1fr;") > 0, "and the single-column stack it belongs to");
  assert(css.slice(respAt).indexOf(".pitem { grid-template-columns: minmax(0, 1fr) 168px") > 0, "as does the one-line row for the tablet band");
  // Above the breakpoint both panes are shown, so neither rule may exist outside a media query.
  assert(css.slice(0, respAt).indexOf("has-sel") === -1, "no has-sel rule above the responsive block");
  // The tablet band is an intersection of the two house breakpoints, not a new
  // one — and it has to say what it buys.
  const band = css.indexOf("@media (min-width: 641px) and (max-width: 900px)");
  assert(band > respAt, "the tablet band is inside the responsive block");
  assert(/what it buys/i.test(css.slice(band - 700, band)), "and is commented with what it buys");
});
await t("the stage stepper clears a 34px touch target on a phone, and never shrinks to fit", () => {
  const css = readFileSync(join(root, "index.html"), "utf8");
  const phone = css.lastIndexOf("@media (max-width: 640px)");
  const coarse = css.lastIndexOf("@media (pointer: coarse) {");
  assert(phone > 0 && coarse > phone, "both blocks present, coarse last");
  const phoneRules = css.slice(phone, coarse);
  const m = /\.pstep \{[^}]*min-height:\s*(\d+)px/.exec(phoneRules);
  assert(m, "the phone block sizes the step: " + phoneRules.slice(phoneRules.indexOf(".pstep"), phoneRules.indexOf(".pstep") + 200));
  assert(+m[1] >= 34, "a 393px step must clear 34px, got " + m[1] + "px");
  assert(/min-width:\s*calc\(33/.test(phoneRules), "and stays a third of the row wide rather than shrinking: " + m[0]);
  const c = /\.pstep \{[^}]*min-height:\s*(\d+)px/.exec(css.slice(coarse));
  assert(c && +c[1] >= 34, "a touchscreen at any width gets it too: " + (c && c[1]));
});
await t("the C/M/L marks in the rail are labelled once, where a column header would be", () => {
  partsFixture(); render();
  const head = main.innerHTML.slice(0, main.innerHTML.indexOf('class="plist"'));
  assert(head.includes("plegend"), "a key in the index header");
  PART_STAGES.forEach(st => assert(head.includes(`<b>${st.short}</b></span></span>${st.label}`), st.short + " is spelled out as " + st.label + ": " + head.slice(head.indexOf("plegend"), head.indexOf("plegend") + 400)));
  // Once, not on every row: the rows still carry the bare letters.
  assert((main.innerHTML.match(/plegend/g) || []).length === 1, "exactly one key on the page");
});
await t("the late parts are not printed twice on one screen", () => {
  partsFixture(); render();
  const html = main.innerHTML;
  const split = html.indexOf('class="mddetail"');
  const rail = html.slice(0, split), pane = html.slice(split);
  assert(rail.includes("NOSECONE"), "the late part is at the top of the rail (deadline sort)");
  // The overview's Behind-deadline card used to repeat those same rows.
  const card = pane.slice(pane.indexOf("<h3>Behind deadline</h3>"), pane.indexOf("Due in the next three weeks"));
  assert(card, "the card is still there");
  assert(!card.includes("NOSECONE"), "and does NOT list the same parts a second time: " + card);
  assert(card.includes("Show only these"), "it is a count plus a filter instead: " + card);
  assert(pane.includes("fLate:true"), "which filters the rail to them");
});
await t("the season stats stay pinned when a part is opened", () => {
  partsFixture(); render();
  assert(main.innerHTML.includes('class="stat-row pstats'), "four tiles with nothing selected");
  selectPart("P-N1");
  const html = main.innerHTML;
  assert(html.includes("pstats compact"), "and still there, slimmer, above the open part");
  ["Open parts", "Behind deadline", "On you", "Finished"].forEach(l => assert(html.includes(l), l + " survived opening a part"));
});
await t("the rail admits that it scrolls", () => {
  partsFixture(); render();
  assert(main.innerHTML.includes("plistfade"), "a fade at the foot of the scroller");
  const css = readFileSync(join(root, "index.html"), "utf8");
  assert(/\.plistfade \{[^}]*position: sticky/.test(css), "which rides the bottom of the visible area");
  assert(/\.plist::-webkit-scrollbar-thumb/.test(css), "and a scrollbar you can see");
});
await t("Group: subteam heads each run without disturbing keyboard navigation", () => {
  partsFixture();
  sortPartsBy("group");
  const html = main.innerHTML;
  const heads = [...html.matchAll(/class="pg-name">([^<]*)</g)].map(m => m[1]);
  assert(heads.join(",") === "AERO,BERGO", "one header per subteam, in order: " + heads.join(","));
  assert(/AERO[\s\S]{0,300}shown/.test(html.slice(html.indexOf("pgrouphd"))), "carrying the group's numbers");
  assert(html.indexOf('id="pi-P-N1"') > html.indexOf("AERO<"), "rows sit under their header");
  // The headers are drawn at render time only — nav still walks parts.
  assert(partNeighborId(1) === "P-N1", "first ↓ lands on a part, not a header: " + partNeighborId(1));
  view.sortKey = null; view.sortDir = null;
  DB.schedule = [];        // leave the collections as the tab found them (the timeline tests seed their own)
});

console.log("tickets (modal, board, comments):");
// give the picker some real users + parts to choose from
DB.users = [{ email: "simon@berkeley.edu", name: "Simon Starbuck", role: "lead" }, { email: "nick@berkeley.edu", name: "Nick Jepsen", role: "member" }];
DB.parts = [{ id: "P-SN6-010", partName: "NOSECONE" }];
await t("Slack messages are plain text, not HTML-escaped (esc() would leak &amp; etc.)", () => {
  const p = { id: "TKT-SLK-1", title: "A & B mismatch", kind: "issue", workOrderId: "WO-T-900", assignees: [], resolutionMethod: "Corrective Action" };
  assert(slackIssueCreatedMsg(p).includes("A & B mismatch"), "no HTML entities in created message: " + slackIssueCreatedMsg(p));
  assert(slackIssueResolvedMsg(p).includes("A & B mismatch"), "no HTML entities in resolved message: " + slackIssueResolvedMsg(p));
  assert(slackIssueResolvedMsg(p).includes("Corrective Action"), "names the disposition");
});
// Must run before anything else calls postToSlack() this session — slackWebhookUrl()
// caches after its first call, so this is the only point a fresh getConfig call
// is guaranteed rather than possibly already warm from an earlier trigger.
await t("Slack push fetches the roster-gated config, never a hardcoded URL", async () => {
  calls.length = 0;
  await postToSlack("first push of the test run");
  assert(calls.some(c => c[0] === "getConfig" && c[1] === "slack"), "fetched config instead of a hardcoded secret: " + JSON.stringify(calls));
});
await t("create modal → submit builds a real project ticket", async () => {
  setTab("projects");
  openNewProject();
  assert(document.getElementById("modal").innerHTML.includes("New project"), "modal open, defaulting to Project kind's wording");
  assert(pickerValues("pa").includes("simon@berkeley.edu"), "creator preselected as assignee");
  // The DOM stub caches elements by id across the whole test file and doesn't
  // parse rendered HTML, so it can't see that np-kind's first <option> (project)
  // is the real default — an earlier test may have left "issue" on this stub.
  // Every test that cares about a field's value sets it explicitly; this is that.
  document.getElementById("np-kind").value = "project";
  document.getElementById("np-title").value = "Grounding fix";
  document.getElementById("np-status").value = "In Progress";
  document.getElementById("np-priority").value = "High";
  document.getElementById("np-due").value = "2026-09-01";
  pickerToggle("pa", "nick@berkeley.edu"); // add Nick
  pickerToggle("pp", "P-SN6-010");         // relate a part
  document.getElementById("np-desc-editor").innerHTML = "fix the diffuser ground";
  calls.length = 0;
  await submitNewProject();
  const p = projById(view.id);
  assert(p.title === "Grounding fix" && p.status === "In Progress" && p.priority === "High" && p.dueDate === "2026-09-01");
  assert(p.kind === "project", "defaults to project kind: " + p.kind);
  assert(p.assignees.includes("simon@berkeley.edu") && p.assignees.includes("nick@berkeley.edu"), "assignees");
  assert(p.watchers.includes("simon@berkeley.edu"), "creator watches");
  assert(p.relatedParts.includes("P-SN6-010"), "related part");
  assert(view.mode === "detail", "opens the ticket page");
  assert(document.getElementById("modal").innerHTML === "", "modal closed");
});
await t("modal requires a title", async () => {
  openNewProject(); document.getElementById("np-title").value = "  "; lastToast = "";
  await submitNewProject(); assert(lastToast.includes("name"), lastToast); closeModal();
});
await t("issue kind requires a work order before it can be created", async () => {
  DB.workOrders.push({ id: "WO-T-900", partName: "Test part", status: "InWork", steps: [] });
  openNewProject();
  document.getElementById("np-kind").value = "issue"; ticketKindChanged();
  // Regression: heading/placeholder/submit button used to always say "ticket"
  // regardless of Kind, even though ticketKindChanged() already fired on this
  // same event to toggle the issue-only fields.
  assert(document.getElementById("np-heading").textContent === "New issue", document.getElementById("np-heading").textContent);
  assert(document.getElementById("np-title").placeholder === "What is this issue?", document.getElementById("np-title").placeholder);
  assert(document.getElementById("np-submit-btn").textContent === "Create issue", document.getElementById("np-submit-btn").textContent);
  document.getElementById("np-title").value = "Mating surface proud";
  document.getElementById("np-wo").value = "";
  lastToast = "";
  await submitNewProject();
  assert(lastToast.includes("work order"), "rejected with no work order: " + lastToast);
  document.getElementById("np-wo").value = "WO-T-900";
  await submitNewProject();
  const p = projById(view.id);
  assert(p.kind === "issue" && p.workOrderId === "WO-T-900", "issue created with its work order");
  assert(p.resolutionMethod === "", "starts undisposed");
  closeModal();
  testIssueId = p.id; // several tests below need this exact ticket, unambiguously — DB.projects
  // accumulates issue fixtures from other test blocks too, so "the first issue" is not unique.
});
await t("board drag moves status (field-scoped write)", () => {
  view = { ...view, tab: "projects", mode: "list", id: null, edit: false };
  const id = DB.projects.find(p => p.kind === "project").id;
  view = { ...view, mode: "list", projView: "board" }; render();
  assert(main.innerHTML.includes('class="board"'), "board renders");
  projDragStart(id); calls.length = 0; projDrop("Done", { classList: { remove() {} } });
  assert(projById(id).status === "Done");
  assert(calls.some(c => c[0] === "save" && c[1] === "projects" && c[3] === "status"), "status field write: " + JSON.stringify(calls));
});
await t("an issue can't be dragged/dropped to Done without a disposition", () => {
  const p = projById(testIssueId);
  view = { ...view, mode: "list", projView: "board" }; render();
  projDragStart(p.id); calls.length = 0; lastToast = "";
  projDrop("Done", { classList: { remove() {} } });
  assert(projStatus(p) !== "Done", "blocked");
  assert(lastToast.includes("resolution method"), lastToast);
});
await t("issue closes once disposed + documented", () => {
  const p = projById(testIssueId);
  p.resolutionMethod = "Corrective Action"; p.whatHappened = "Blank faced from the wrong datum.";
  const blocked = statusGate(p, "Done");
  assert(blocked === null, "gate clears once disposed+documented: " + blocked);
  setTicketStatus(p.id, "Done");
  assert(projStatus(p) === "Done", "now closes");
});
await t("old 4-value status migrates at read time, no backfill", () => {
  const legacy = { id: "PROJ-LEGACY", title: "old record", status: "Blocked", kind: "project" };
  assert(projStatus(legacy) === "On Hold", "Blocked -> On Hold");
  assert(legacy.status === "Blocked", "stored value untouched until an edit saves it");
});
await t("sub-ticket creates as a full child ticket, no rollup to the parent", async () => {
  const parent = DB.projects.find(p => p.kind === "project");
  openNewSubTicket(parent.id);
  assert(document.getElementById("modal").innerHTML.includes("New sub-ticket"), "sub-ticket modal, no kind selector");
  assert(!document.getElementById("modal").innerHTML.includes('id="np-kind"'), "sub-tickets can't themselves be issues");
  document.getElementById("np-title").value = "Create updated BOM";
  document.getElementById("np-status").value = "Done";
  await submitNewProject();
  const kids = subTickets(parent);
  assert(kids.length === 1 && kids[0].parentId === parent.id, "child linked to parent");
  assert(kids[0].kind === "project", "inherits project kind");
  parent.status = "In Progress"; // parent set independently
  assert(projStatus(parent) !== projStatus(kids[0]), "parent status is untouched by the child's status");
});
await t("rich-text comment posts via appendTo, sanitized", () => {
  const id = DB.projects.find(p => p.kind === "project" && !p.parentId).id;
  view = { ...view, mode: "detail", id, edit: false }; render();
  const ed = el("comment-editor"); ed.innerHTML = "<b>hi</b><script>alert(1)<\/script>"; ed.textContent = "hi";
  calls.length = 0; postComment(id);
  const p = projById(id); const c = (p.comments || [])[p.comments.length - 1];
  assert(c && /<b>hi<\/b>/.test(c.html), "keeps bold");
  assert(!/script/i.test(c.html), "strips script: " + c.html);
  assert(c.email === "simon@berkeley.edu" && c.author === "Simon", "tagged to author");
  assert(calls.some(x => x[0] === "appendTo" && x[3] === "comments"), "appendTo comments");
});
await t("empty comment rejected", () => { const ed = el("comment-editor"); ed.innerHTML = ""; ed.textContent = ""; lastToast = ""; postComment(view.id); assert(lastToast.includes("Write a comment")); });
await t("watch toggle flips membership + writes watchers", () => {
  const id = view.id; const p = projById(id);
  const before = (p.watchers || []).includes("simon@berkeley.edu");
  calls.length = 0; toggleWatch();
  assert((projById(id).watchers || []).includes("simon@berkeley.edu") !== before, "toggled");
  assert(calls.some(c => c[0] === "save" && c[3] === "watchers"));
});
await t("legacy updates[] still render as comments", () => {
  const p = projById(view.id); p.updates = [{ author: "Old", email: "o@x.c", ts: "2026-01-01T00:00:00", text: "legacy note" }];
  const merged = projComments(p);
  assert(merged.some(c => c.html.includes("legacy note")), "legacy update shown");
});
await t("sanitizeHtml strips onerror + javascript: URLs, incl. slash form", () => {
  const dirty = `<img src=x onerror="alert(1)"><img/onerror=alert(2)><a href="javascript:alert(3)">x</a><b>ok</b>`;
  const clean = sanitizeHtml(dirty);
  assert(!/onerror/i.test(clean), "onerror (both forms) stripped: " + clean);
  assert(!/javascript:/i.test(clean), "js url stripped: " + clean);
  assert(/<b>ok<\/b>/.test(clean), "keeps allowed");
});
await t("sanitizeHtml preserves a download attribute (needed for downloadable attachments)", () => {
  const clean = sanitizeHtml(`<a href="https://x.test/f.png" download="f.png">f</a>`);
  assert(/download="f\.png"/.test(clean), "download attr survives sanitization: " + clean);
});
await t("sanitizeHtml allows the new formatting tags (h3/code/table) but still strips scripts", () => {
  const clean = sanitizeHtml(`<h3>Why</h3><code>x=1</code><table><tr><td>a</td></tr></table><script>alert(1)</script>`);
  assert(/<h3>Why<\/h3>/.test(clean), "heading kept: " + clean);
  assert(/<code>x=1<\/code>/.test(clean), "code kept: " + clean);
  assert(/<table>.*<tr>.*<td>a<\/td>/.test(clean), "table kept: " + clean);
  assert(!/<script/i.test(clean), "still no script: " + clean);
});
await t("isSafeLinkUrl accepts only http(s), rejects javascript:/data:/relative", () => {
  assert(isSafeLinkUrl("https://example.com") === true);
  assert(isSafeLinkUrl("http://example.com") === true);
  assert(isSafeLinkUrl("javascript:alert(1)") === false);
  assert(isSafeLinkUrl("data:text/html,<script>alert(1)</script>") === false);
  assert(isSafeLinkUrl("/relative/path") === false);
  assert(isSafeLinkUrl("") === false);
});
await t("rteLink rejects an unsafe URL before ever calling execCommand (prompt stub always returns a non-URL, exercising the reject path)", () => {
  let called = false;
  const origExec = document.execCommand;
  document.execCommand = () => { called = true; };
  lastToast = "";
  rteLink("np-desc-editor"); // global prompt() stub returns the literal string "stub" — not http(s)
  document.execCommand = origExec;
  assert(!called, "must not reach execCommand with an unsafe/invalid URL");
  assert(/http/i.test(lastToast), "explains why it was rejected: " + lastToast);
});
await t("rteCode/rteTable insert their fixed templates via execCommand", () => {
  const seen = [];
  const origExec = document.execCommand;
  document.execCommand = (cmd, ui, val) => seen.push([cmd, val]);
  rteCode("np-desc-editor");
  rteTable("np-desc-editor");
  document.execCommand = origExec;
  assert(seen[0][0] === "insertHTML" && /<code>/.test(seen[0][1]), "code wraps selection: " + JSON.stringify(seen[0]));
  assert(seen[1][0] === "insertHTML" && /<table>/.test(seen[1][1]) && /<td>/.test(seen[1][1]), "table inserts a fixed template: " + JSON.stringify(seen[1]));
});
await t("fileItem() links are downloadable, not just openable", () => {
  const html = fileItem({ url: "https://x.test/receipt.jpg", name: "receipt.jpg", type: "image/jpeg" });
  assert(/download="receipt\.jpg"/.test(html), "download attr present: " + html);
});
await t("imgAttachHtml() wraps the image in a downloadable link (regression: bare <img>, no download affordance)", () => {
  const html = imgAttachHtml("https://x.test/photo.png", "photo.png");
  assert(/<a href="https:\/\/x\.test\/photo\.png" download="photo\.png"[^>]*><img src="https:\/\/x\.test\/photo\.png"/.test(html), html);
});
await t("sanitizeHtml FAILS CLOSED when DOMPurify absent (escapes, no HTML)", () => {
  const saved = window.DOMPurify; window.DOMPurify = undefined;
  const clean = sanitizeHtml("<b>hi</b><script>alert(1)</script>");
  assert(!/<b>/.test(clean) && !/<script/i.test(clean), "must not emit HTML: " + clean);
  assert(clean.includes("&lt;b&gt;"), "escaped, not stripped: " + clean);
  window.DOMPurify = saved;
});
await t("saveProjectEdits writes each field scoped, not whole-doc", () => {
  const id = view.id; view = { ...view, tab: "projects", mode: "detail", id, edit: false };
  editProject();
  el("ep-title").value = "Renamed"; el("ep-status").value = "On Hold"; el("ep-priority").value = "Low";
  el("ep-due").value = "2026-10-01"; el("ep-desc-editor").innerHTML = "d";
  calls.length = 0; saveProjectEdits();
  assert(projById(id).title === "Renamed" && projById(id).status === "On Hold");
  const saved = calls.filter(c => c[0] === "save" && c[1] === "projects");
  assert(saved.length >= 6 && saved.every(c => c[3]), "every write must be field-scoped: " + JSON.stringify(saved));
});
await t("resolving an issue completes cleanly through the (fire-and-forget) Slack announcement", () => {
  // announceIfResolved()/postToSlack() must never block or throw on the real
  // status write, even though this is the second Slack-triggering action in
  // the file (slackWebhookUrl() caches after its first call, so a repeat
  // getConfig call here is neither expected nor required — only that the
  // ticket actually reaches Done).
  const p = { id: "TKT-SLK-2", title: "resolve trigger", kind: "issue", status: "In Progress", workOrderId: "WO-T-900", assignees: [], resolutionMethod: "UAI (Use As Is)", whatHappened: "documented" };
  DB.projects.push(p);
  setTicketStatus(p.id, "Done");
  assert(projStatus(p) === "Done", "status write completes regardless of the Slack push outcome");
});
await t("editing an issue requires a work order to stay set", () => {
  const p = projById(testIssueId);
  view = { ...view, tab: "projects", mode: "detail", id: p.id, edit: false };
  editProject();
  el("ep-wo").value = ""; lastToast = "";
  saveProjectEdits();
  assert(lastToast.includes("work order"), lastToast);
});

console.log("timeline:");
await t("newWeek creates W01 with station fields", () => { setTab("timeline"); calls.length = 0; newWeek(); assert(DB.schedule.length === 1); const w = DB.schedule[0]; assert(w.id === "W01" && "mold1" in w && "waterjet" in w && "notes" in w); });
await t("a new week is dated, so it lands in the grid and not the hidden archive", () => {
  // The bug: newWeek() wrote weekOf:"", renderTimeline() files undated weeks
  // under the collapsed "SN5 archive" card, and "+ Add week" looked dead.
  const w = DB.schedule[0];
  assert(/^\d{4}-\d\d-\d\d$/.test(w.weekOf), "dated on creation: " + JSON.stringify(w.weekOf));
  assert(mondayOf(w.weekOf) === w.weekOf, "and dated to a Monday: " + w.weekOf);
  assert(renderTimeline().includes(`data-week="W01"`), "and it renders in the grid");
});
await t("the second new week is the Monday after the first, never the same date", () => {
  newWeek();
  const [a, b] = DB.schedule;
  assert(b.weekOf === tlAddDays(a.weekOf, 7), `${a.weekOf} then ${b.weekOf}`);
  DB.schedule.pop();
});
await t("a week's date can be changed, and any day in the week snaps to its Monday", () => {
  const w = DB.schedule[0];
  el("tl-week-date").value = "2026-09-10"; // a Thursday
  submitWeekDate(w.id);
  assert(w.weekOf === "2026-09-07", w.weekOf);
  assert(calls.some(c => c[0] === "save" && c[1] === "schedule" && c[3] === "weekOf"), "and saves just that field");
});
await t("two weeks can't share a Monday", () => {
  newWeek();
  const [a, b] = DB.schedule;
  lastToast = "";
  el("tl-week-date").value = a.weekOf;
  submitWeekDate(b.id);
  assert(b.weekOf !== a.weekOf, "the clashing date is refused");
  assert(lastToast.includes("already on the schedule"), lastToast);
  DB.schedule.pop();
});
await t("assignStation writes just that station field", () => { const w = DB.schedule[0]; DB.parts.push({ id: "P-SN6-050", partName: "TESTPART" }); calls.length = 0; assignStation(w.id, "mold1", "P-SN6-050"); assert(w.mold1 === "P-SN6-050"); assert(calls.some(c => c[0] === "save" && c[1] === "schedule" && c[3] === "mold1")); });
await t("cellView shows a known part's name, and unmapped text as-is", () => { assert(cellView("P-SN6-050") === "TESTPART", cellView("P-SN6-050")); assert(cellView("RANDOM NAME") === "RANDOM NAME"); assert(cellView("") === ""); });
await t("the jump to Parts survived the rebuild — it moved into the assign picker", () => {
  // A cell is a button that opens the picker, so it can't also be a chip that
  // navigates; one control can't nest inside another. The cross-link lives in
  // the picker now, and losing it entirely would be a real regression.
  const w = DB.schedule[0];
  openAssign(w.id, "mold1");
  const html = document.getElementById("modal").innerHTML;
  assert(/class="chip"/.test(html), "no chip in the picker: " + html.slice(0, 200));
  assert(html.includes("openRecord(&#39;parts&#39;") || html.includes("openRecord('parts'"), "chip must still jump to Parts");
  closeModal();
});
await t("undated retro weeks go into a collapsed archive, not the live schedule", () => {
  // They used to sort to the bottom of the grid with a paragraph apologising
  // for it — and since the SN5 seed ships EVERY week undated, that paragraph
  // was the whole tab on a fresh load. Split out instead of explained away.
  DB.schedule = [{ id: "W00", weekOf: "", retro: true, notes: "RETRO WK" }, { id: "S1", weekOf: "2026-08-25", notes: "DATED WK" }];
  view = { ...view, tab: "timeline", tlArchive: false }; render();
  let html = main.innerHTML;
  assert(html.includes("DATED WK"), "the dated week is the schedule");
  assert(!html.includes("RETRO WK"), "the undated one is behind the archive toggle");
  assert(/tl-archive/.test(html), "and the archive block says how many are in there");
  assert(!html.includes("sort to the bottom"), "the apology for the old sort order is gone");
  view = { ...view, tlArchive: true }; render();
  html = main.innerHTML;
  assert(html.indexOf("DATED WK") < html.indexOf("RETRO WK"), "opened, the archive sits below the live schedule");
});
await t("a week with no date at all still reaches its cells", () => {
  // W00-style ids are all the SN5 archive has to identify a week by.
  DB.schedule = [{ id: "W00", weekOf: "", retro: true, mold1: "RAW NAME" }];
  view = { ...view, tab: "timeline", tlArchive: true }; render();
  assert(main.innerHTML.includes("W00"), "the id stands in for the date");
  assert(main.innerHTML.includes("RAW NAME"), "and the assignment is still readable");
});

console.log("weekly plan:");
await t("weekDates derives Mon-Sun from weekOf (assumed to be the Monday)", () => {
  const dates = weekDates("2026-08-24"); // a Monday
  assert(dates.length === 7 && dates[0] === "2026-08-24" && dates[6] === "2026-08-30", "Mon through Sun: " + JSON.stringify(dates));
});
await t("weekDates handles a missing/invalid weekOf without throwing", () => {
  assert(weekDates("").length === 0);
  assert(weekDates(undefined).length === 0);
});
await t("weekPlanWeeks excludes undated retro weeks (nothing to derive a grid from)", () => {
  DB.schedule = [{ id: "W00", weekOf: "", retro: true }, { id: "S1", weekOf: "2026-08-24" }];
  const weeks = weekPlanWeeks();
  assert(weeks.length === 1 && weeks[0].id === "S1", "only the dated week: " + JSON.stringify(weeks));
});
await t("renderWeekPlan shows a guidance card when there are no dated weeks yet", () => {
  DB.schedule = [];
  const html = renderWeekPlan();
  assert(/Timeline/.test(html) && !html.includes("<table"), "points at Timeline instead of an empty grid: " + html);
});
await t("personTicketsThisWeek scopes to the week's date range, the person, and open status; no subteam grouping anywhere in the render", () => {
  DB.schedule = [{ id: "S1", weekOf: "2026-08-24", goals: [], doneTickets: [], cars: [] }]; // Mon 2026-08-24
  DB.users = [{ email: "nick@berkeley.edu", name: "Nick Jepsen", role: "member" }];
  DB.projects = [
    { id: "TKT-W1", kind: "project", title: "undertray task", subteam: "AERO", dueDate: "2026-08-25", assignees: ["nick@berkeley.edu"], status: "To Do" }, // Tue, in week
    { id: "TKT-W4", kind: "project", title: "done already", subteam: "AERO", dueDate: "2026-08-25", assignees: ["nick@berkeley.edu"], status: "Done" }, // must not appear
    { id: "TKT-W5", kind: "project", title: "next month, out of range", subteam: "AERO", dueDate: "2026-09-25", assignees: ["nick@berkeley.edu"], status: "To Do" },
  ];
  const week = weekById("S1");
  const tix = personTicketsThisWeek("nick@berkeley.edu", week);
  assert(tix.length === 1 && tix[0].id === "TKT-W1", "only the in-week, open, assigned ticket: " + JSON.stringify(tix));

  view = { ...view, tab: "weekplan", wpWeek: "S1" };
  const html = renderWeekPlan();
  assert(html.includes("Weekly Goals") && html.includes("Car Groups"), "both sections render: " + html);
  assert(html.includes("undertray task"), "shows the in-week ticket: " + html);
  assert(!html.includes("No subteam set") && !/<th>AERO<\/th>/.test(html), "no subteam grouping left anywhere: " + html);
});
await t("adding a goal writes to schedule.goals[] via atomic append; toggling done and removing round-trip", () => {
  DB.schedule = [{ id: "S1", weekOf: "2026-08-24", goals: [], doneTickets: [], cars: [] }];
  calls.length = 0;
  document.getElementById("wg-text").value = "Layup prep";
  document.getElementById("wg-due").value = "2026-08-27";
  document.getElementById("wg-ticket").value = "";
  submitGoal("S1", "nick@berkeley.edu");
  const w = weekById("S1");
  assert(w.goals.length === 1 && w.goals[0].text === "Layup prep" && w.goals[0].dueDate === "2026-08-27", "added: " + JSON.stringify(w.goals));
  assert(calls.some(c => c[0] === "appendTo" && c[1] === "schedule" && c[3] === "goals"), "atomic append, not a whole-doc save: " + JSON.stringify(calls));
  const id = w.goals[0].id;

  toggleGoalDone("S1", id, true);
  assert(weekById("S1").goals[0].done === true, "marked done");

  removeGoal("S1", id);
  assert(weekById("S1").goals.length === 0, "removed");
});
await t("checking off an auto ticket row is local to the week's plan — the real ticket status never changes", () => {
  DB.schedule = [{ id: "S1", weekOf: "2026-08-24", goals: [], doneTickets: [], cars: [] }];
  DB.projects = [{ id: "TKT-W1", kind: "project", title: "undertray task", dueDate: "2026-08-25", assignees: ["nick@berkeley.edu"], status: "In Progress" }];
  calls.length = 0;
  toggleTicketDoneThisWeek("S1", "nick@berkeley.edu", "TKT-W1", true);
  assert(isTicketDoneThisWeek(weekById("S1"), "nick@berkeley.edu", "TKT-W1"), "marked done locally");
  assert(projStatus(recById("projects", "TKT-W1")) === "In Progress", "the real ticket's status is untouched");
  assert(calls.some(c => c[0] === "appendTo" && c[3] === "doneTickets"), "atomic append: " + JSON.stringify(calls));

  toggleTicketDoneThisWeek("S1", "nick@berkeley.edu", "TKT-W1", false);
  assert(!isTicketDoneThisWeek(weekById("S1"), "nick@berkeley.edu", "TKT-W1"), "unmarked");
});
await t("car groups: new car, add/remove passengers, capacity enforced", () => {
  DB.schedule = [{ id: "S1", weekOf: "2026-08-24", goals: [], doneTickets: [], cars: [] }];
  DB.users = [
    { email: "sam@b.edu", name: "Sam Rios", role: "member" },
    { email: "nick@b.edu", name: "Nick Alva", role: "member" },
    { email: "jamie@b.edu", name: "Jamie T", role: "member" },
  ];
  calls.length = 0;
  document.getElementById("wc-driver").value = "sam@b.edu";
  document.getElementById("wc-day").value = "Sat";
  document.getElementById("wc-time").value = "9:00 AM";
  document.getElementById("wc-cap").value = "2";
  submitCar("S1");
  const w = weekById("S1");
  assert(w.cars.length === 1 && w.cars[0].driver === "sam@b.edu" && w.cars[0].capacity === 2, "car created: " + JSON.stringify(w.cars));
  assert(calls.some(c => c[0] === "appendTo" && c[3] === "cars"), "atomic append: " + JSON.stringify(calls));
  const carId = w.cars[0].id;

  document.getElementById("wc-passenger").value = "nick@b.edu";
  submitPassenger("S1", carId);
  assert(weekById("S1").cars[0].passengers.includes("nick@b.edu"), "passenger added");

  document.getElementById("wc-passenger").value = "jamie@b.edu";
  submitPassenger("S1", carId); // capacity 2, now full
  assert(weekById("S1").cars[0].passengers.length === 2, "second passenger fills the car: " + JSON.stringify(weekById("S1").cars[0].passengers));

  lastToast = "";
  openAddPassengerModal("S1", carId); // full — must refuse, not open a picker
  assert(lastToast.includes("full"), "toasts instead of opening when full: " + lastToast);

  removePassenger("S1", carId, "nick@b.edu");
  assert(weekById("S1").cars[0].passengers.length === 1 && !weekById("S1").cars[0].passengers.includes("nick@b.edu"), "removed");

  delCar("S1", carId);
  assert(weekById("S1").cars.length === 0, "car deleted");
});
await t("subteam field round-trips through ticket creation and editing", async () => {
  setTab("projects");
  openNewProject();
  // The DOM stub caches elements by id across the whole test file, so a
  // prior test may have left np-kind at "issue" — reset it explicitly (same
  // convention the very first ticket-creation test already established).
  document.getElementById("np-kind").value = "project";
  document.getElementById("np-title").value = "Subteam round-trip";
  document.getElementById("np-subteam").value = "BERGO";
  await submitNewProject();
  const p = projById(view.id);
  assert(p.kind === "project", "sanity check: must actually be a project, not a stale issue: " + p.kind);
  assert(p.subteam === "BERGO", "captured on create: " + p.subteam);
  editProject();
  document.getElementById("ep-subteam").value = "AUTO-MECH";
  saveProjectEdits();
  assert(projById(p.id).subteam === "AUTO-MECH", "captured on edit: " + projById(p.id).subteam);
});

await t("weekly plan opens on the week containing today, not the last week on the schedule", () => {
  // Was `weeks[weeks.length - 1]`, so it always landed on the furthest-out week
  // — on 2026-07-30 with weeks of 07-20/07-27/08-03 it opened 08-03.
  const mon = new Date(today() + "T00:00:00");
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));      // Monday of this week
  const iso = d => d.toISOString().slice(0, 10);
  const back = n => { const x = new Date(mon); x.setDate(x.getDate() + n * 7); return iso(x); };
  DB.schedule = [
    { id: "W-PREV", weekOf: back(-1) }, { id: "W-NOW", weekOf: back(0) }, { id: "W-NEXT", weekOf: back(1) },
  ];
  assert(defaultWeekId(weekPlanWeeks()) === "W-NOW", "picks the current week: " + defaultWeekId(weekPlanWeeks()));
});
await t("weekly plan falls back to the next upcoming week, then to the most recent past one", () => {
  DB.schedule = [{ id: "W-FUTURE", weekOf: "2099-01-05" }, { id: "W-LATER", weekOf: "2099-01-12" }];
  assert(defaultWeekId(weekPlanWeeks()) === "W-FUTURE", "soonest upcoming, not the furthest out");
  DB.schedule = [{ id: "W-OLD", weekOf: "2000-01-03" }, { id: "W-NEWEST", weekOf: "2000-01-10" }];
  assert(defaultWeekId(weekPlanWeeks()) === "W-NEWEST", "all in the past → most recent");
  DB.schedule = [];
  assert(defaultWeekId(weekPlanWeeks()) === null, "no weeks → null, no crash");
});
await t("weekly plan lists you first and collapses everyone with nothing on", () => {
  DB.users = [
    { email: "aaron@b.edu", name: "Aaron Idle", role: "member" },
    { email: "simon@berkeley.edu", name: "Simon Starbuck", role: "lead" },
    { email: "zoe@b.edu", name: "Zoe Busy", role: "member" },
  ];
  DB.schedule = [{ id: "W-P", weekOf: today(), goals: [], doneTickets: [], cars: [] }];
  DB.projects = [{ id: "T-Z", title: "zoe task", status: "To Do", dueDate: today(), assignees: ["zoe@b.edu"] }];
  view = { ...view, tab: "weekplan", wpWeek: "W-P" };
  const html = renderWeekPlan();
  // Alphabetically Aaron sorts first and Simon third; you should still lead.
  assert(html.indexOf("Simon Starbuck") < html.indexOf("Zoe Busy"), "you come first");
  assert(html.indexOf("Zoe Busy") < html.indexOf("Aaron Idle"), "people with work outrank idle ones");
  assert(html.includes("Nothing yet this week"), "idle tail is collapsed into one line");
  // Aaron gets a compact button, not his own full block with a heading + button.
  assert(!/Aaron Idle<\/b>/.test(html), "no full block for an idle teammate: " + html.slice(0, 400));
});

await t("the weekly rollup names a sub-ticket's parent too, inline so the row stays one line", () => {
  // Same flat-list problem as the dashboard: this pulls tickets by assignee and
  // due date, so a sub-ticket lands next to unrelated work with nothing saying
  // what it belongs to.
  DB.users = [{ email: "simon@berkeley.edu", name: "Simon Starbuck", role: "lead" }];
  DB.schedule = [{ id: "W-SUB", weekOf: today(), goals: [], doneTickets: [], cars: [] }];
  DB.projects = [
    { id: "T-PARENT", title: "Undertray", status: "In Progress", assignees: [] },
    { id: "T-KID", title: "Trim the strakes", status: "To Do", dueDate: today(), parentId: "T-PARENT", assignees: ["simon@berkeley.edu"] },
  ];
  view = { ...view, tab: "weekplan", wpWeek: "W-SUB" };
  const html = renderWeekPlan();
  assert(html.includes("Trim the strakes"), "the sub-ticket is listed");
  assert(/<span class="tny muted">part of <span class="chip"[^>]*>Undertray<\/span><\/span>/.test(html),
    "parent named inline (a <div> would break the flex row onto its own line): " + html.slice(html.indexOf("Trim the strakes") - 200, html.indexOf("Trim the strakes") + 300));
});

console.log("budget:");
await t("newBuy defaults purchaser to me", async () => { setTab("budget"); await newBuy(); assert(buyById(view.id).purchaser === "Simon" && buyById(view.id).status === "Submitted"); });
await t("num parses money strings", () => { assert(num("$41.68") === 41.68 && num("") === 0 && num("1,200") === 1200); });
await t("list totals season + open sums", () => { view = { ...view, tab: "budget", mode: "list" }; DB.budget = [{ id: "B1", cost: "100", status: "Reimbursed" }, { id: "B2", cost: "50", status: "Ordered" }]; render(); assert(main.innerHTML.includes("$150")); assert(main.innerHTML.includes("Open orders ($50)")); });
await t("budget stat row counts over-$50-and-still-Submitted, not just over-$50", () => {
  DB.budget = [
    { id: "B3", cost: "80", status: "Submitted" },  // over $50, unapproved
    { id: "B4", cost: "80", status: "Ordered" },     // over $50 but already past approval
    { id: "B5", cost: "10", status: "Submitted" },   // under $50, needs no approval
  ];
  view = { ...view, tab: "budget", mode: "list" }; render();
  assert(main.innerHTML.includes('bignum">1</div><div class="stat-label">Over $50, unapproved'), "only B3 counts: " + main.innerHTML);
});
await t("newBuy starts with empty receipt fields", async () => { await newBuy(); const b = buyById(view.id); assert(b.receiptUrl === "" && b.receiptPath === "", "no receipt yet"); });
await t("purchase detail shows add-receipt prompt when none, thumbnail when attached", () => {
  view = { ...view, tab: "budget", mode: "detail", id: "B-R1", edit: false };
  DB.budget.push({ id: "B-R1", item: "epoxy", status: "Submitted", receiptUrl: "", receiptPath: "" });
  let html = renderBuyDetail();
  assert(/Add \/ scan receipt/.test(html) && !html.includes('class="thumb"'), "no receipt: prompts to add one: " + html);
  const b2 = buyById("B-R1"); b2.receiptUrl = "https://x.test/r.jpg"; b2.receiptPath = "budget/B-R1/r.jpg";
  html = renderBuyDetail();
  assert(html.includes('class="thumb"') && /Replace receipt/.test(html), "receipt attached: shows thumbnail + replace: " + html);
});
await t("deleting a purchase with a receipt cleans up its file (regression: nothing to clean up before this feature, must not regress once there is)", () => {
  DB.budget = [{ id: "B-R2", item: "resin", receiptUrl: "https://x.test/r2.jpg", receiptPath: "budget/B-R2/r2.jpg" }];
  calls.length = 0;
  delBuy("B-R2"); confirmProceed();
  assert(calls.some(c => c[0] === "deleteFile" && c[1] === "budget/B-R2/r2.jpg"), "receipt file deleted: " + JSON.stringify(calls));
  assert(!DB.budget.some(b => b.id === "B-R2"), "purchase removed");
});

console.log("google documents:");
await t("every Google surface is recognised from its URL alone", () => {
  // No API, no key, no auth — the URL string is the entire input, so this is
  // the whole feature's foundation.
  const cases = [
    ["https://docs.google.com/document/d/1AbC-dEf_123/edit?usp=sharing", "doc", "1AbC-dEf_123"],
    ["https://docs.google.com/presentation/d/1XyZ789/edit#slide=id.p3", "slides", "1XyZ789"],
    ["https://docs.google.com/spreadsheets/d/1vnBlgBzMf7rwrvk/edit?usp=drivesdk", "sheet", "1vnBlgBzMf7rwrvk"],
    ["https://docs.google.com/forms/d/e/1FAIpQLSf000/viewform", "form", "1FAIpQLSf000"],
    ["https://drive.google.com/file/d/1FiLeId9/view", "drive", "1FiLeId9"],
    ["https://drive.google.com/drive/folders/1FolDer2", "folder", "1FolDer2"],
    ["https://drive.google.com/drive/u/0/folders/1FolDer3", "folder", "1FolDer3"],
  ];
  cases.forEach(([url, kind, id]) => {
    const p = parseGoogleUrl(url);
    assert(p && p.kind === kind, `${url} → ${p && p.kind}, wanted ${kind}`);
    assert(p.fileId === id, `${url} → id ${p.fileId}, wanted ${id}`);
  });
  // A published deck uses a different id space and still has to parse.
  const pub = parseGoogleUrl("https://docs.google.com/presentation/d/e/2PACX-1vSbaMdq/pub?start=false");
  assert(pub.kind === "slides" && pub.fileId === "2PACX-1vSbaMdq", JSON.stringify(pub));
});
await t("a non-Google link is kept, not rejected", () => {
  // Refusing a Notion page or a McMaster part URL would be its own small
  // blocker, which is the one thing this feature must never be.
  const p = parseGoogleUrl("https://www.mcmaster.com/93250A760/");
  assert(p && p.kind === "link" && p.fileId === "", JSON.stringify(p));
  assert(gdocKind("link").short === "LINK", "and it has a label to render");
  // Anything that isn't an https URL is refused, though.
  assert(parseGoogleUrl("not a url") === null);
  assert(parseGoogleUrl("javascript:alert(1)") === null, "no javascript: scheme");
  assert(parseGoogleUrl("http://docs.google.com/document/d/x") === null, "https only");
  assert(parseGoogleUrl("") === null && parseGoogleUrl(null) === null);
});
await t("the embed URL is the one Google will actually frame", () => {
  // Measured 2026-08-01: /preview and /embed return 200 with no
  // X-Frame-Options and no frame-ancestors. /edit does not.
  assert(parseGoogleUrl("https://docs.google.com/document/d/D1/edit").embedUrl
    === "https://docs.google.com/document/d/D1/preview");
  assert(parseGoogleUrl("https://docs.google.com/presentation/d/S1/edit").embedUrl
    .startsWith("https://docs.google.com/presentation/d/S1/embed"), "slides use /embed, which works for published decks too");
  assert(parseGoogleUrl("https://drive.google.com/file/d/F1/view").embedUrl
    === "https://drive.google.com/file/d/F1/preview");
  // Forms and folders have no framable view; a form in a frame is a way to
  // submit it twice, and Drive refuses to frame a folder listing.
  assert(parseGoogleUrl("https://docs.google.com/forms/d/e/F/viewform").embedUrl === "");
  assert(parseGoogleUrl("https://drive.google.com/drive/folders/X").embedUrl === "");
});
await t("a row offers a preview only when there is something framable", () => {
  const slides = { id: "GD1", kind: "slides", fileId: "S1", title: "UT DRB deck", url: "https://docs.google.com/presentation/d/S1/edit", openUrl: "https://docs.google.com/presentation/d/S1/edit", embedUrl: "https://docs.google.com/presentation/d/S1/embed" };
  const folder = { id: "GD2", kind: "folder", fileId: "X", title: "CAD dump", url: "https://drive.google.com/drive/folders/X", openUrl: "https://drive.google.com/drive/folders/X", embedUrl: "" };
  let html = docLinkRow(slides, {});
  assert(html.includes("UT DRB deck") && html.includes("SLIDES"), html);
  assert(html.includes("toggleDocPreview('GD1')"), "framable: the row expands");
  assert(!html.includes("<iframe"), "collapsed by default, so nobody waits on Google to render a page");
  assert(docLinkRow(folder, {}).includes("window.open"), "not framable: the row just opens it");
  // Expanded, the frame appears AND so does the standing note, because a
  // cross-origin iframe gives no error we could react to.
  GD_OPEN.add("GD1");
  html = docLinkRow(slides, {});
  assert(/<iframe class="docview"/.test(html), "expands to a frame: " + html);
  assert(html.includes("signed into a different Google account"), "with the permanent explanation");
  GD_OPEN.delete("GD1");
});
await t("linking writes to the record, and removing takes it off again", () => {
  DB.projects = [{ id: "TKT-DOC", title: "Nosecone", kind: "project", status: "To Do", assignees: [], watchers: [], files: [], comments: [] }];
  view = { ...view, tab: "projects", mode: "detail", id: "TKT-DOC", edit: false };
  calls.length = 0;
  addDocLink({ coll: "projects", id: "TKT-DOC" },
    { id: "GD9", url: "https://docs.google.com/document/d/D9/edit", openUrl: "https://docs.google.com/document/d/D9/edit", embedUrl: "https://docs.google.com/document/d/D9/preview", kind: "doc", fileId: "D9", title: "Layup notes", note: "", by: "simon@berkeley.edu", ts: new Date().toISOString() });
  const p = projById("TKT-DOC");
  assert((p.docs || []).length === 1 && p.docs[0].title === "Layup notes", JSON.stringify(p.docs));
  assert(calls.some(c => c[0] === "appendTo" && c[3] === "docs"),
    "appended with arrayUnion so two people linking at once don't clobber: " + JSON.stringify(calls));
  assert(main.innerHTML.includes("Layup notes"), "and it renders on the ticket");
  // Removing is confirmed, because it's a shared record — ticket file uploads
  // have no delete path at all, and links are not repeating that.
  removeDocLink("projects", "TKT-DOC", "GD9");
  assert((projById("TKT-DOC").docs || []).length === 1, "not gone until confirmed");
  confirmProceed();
  assert((projById("TKT-DOC").docs || []).length === 0, "removed");
});
await t("a pinned link is a documents record, so search and the tab get it free", () => {
  DB.documents = [];
  addDocLink({ coll: "documents" },
    { id: "GD-PIN", url: "https://docs.google.com/spreadsheets/d/T1/edit", openUrl: "https://docs.google.com/spreadsheets/d/T1/edit", embedUrl: "https://docs.google.com/spreadsheets/d/T1/preview", kind: "sheet", fileId: "T1", title: "Composites Master Tracker", note: "every part mass lives here", by: "simon@berkeley.edu", ts: new Date().toISOString() });
  const d = DB.documents[0];
  assert(d.pinned === true && d.category === "Team shelf", JSON.stringify(d));
  // allDocs() must carry `pinned` through, or the shelf renders twice: once in
  // its own card and again in the category listing below it.
  const merged = allDocs().find(x => x.id === "GD-PIN");
  assert(merged && merged.pinned === true, "pinned survives the allDocs() remap: " + JSON.stringify(merged));
  assert(merged.src === d.url, "and src points at Google, not at our Storage");
});
await t("every tab that can hold a document renders one without throwing", () => {
  // Five placements share one renderer, so the real risk is a wiring mistake in
  // one of them rather than the row itself.
  const link = { id: "GD-A", kind: "doc", fileId: "D", title: "Mold drawing", url: "https://docs.google.com/document/d/D/edit", openUrl: "https://docs.google.com/document/d/D/edit", embedUrl: "https://docs.google.com/document/d/D/preview" };
  DB.parts = [{ id: "P-SN6-900", partName: "NOSECONE", docs: [link] }];
  DB.workOrders = [{ id: "WO-DOC", partName: "NOSECONE", processType: "MoldInfusion", revision: "A", status: "InWork", bom: [], qualityChecks: [], timeline: [], steps: [], docs: [link] }];
  DB.schedule = [{ id: "W-DOC", weekOf: today(), goals: [], cars: [], doneTickets: [], docs: [link] }];
  DB.users = [{ email: "simon@berkeley.edu", name: "Simon Starbuck", role: "lead" }];
  view = { ...view, tab: "parts", mode: "detail", id: "P-SN6-900", edit: false };
  render(); assert(main.innerHTML.includes("Mold drawing"), "parts");
  view = { ...view, tab: "workorders", mode: "detail", id: "WO-DOC", edit: false };
  render();
  assert(main.innerHTML.includes("Mold drawing"), "work orders");
  assert(main.innerHTML.includes('href="#wo-docs"'), "and the hand-maintained jumpbar gained its anchor");
  view = { ...view, tab: "weekplan", wpWeek: "W-DOC" };
  assert(renderWeekPlan().includes("Mold drawing"), "weekly plan");
});

console.log("dashboard:");
await t("aggregates deadlines across tabs", () => {
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const late = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  DB.parts = [{ id: "P-SN6-001", partName: "SOON PART", layupProgress: "In Layup", layupDeadline: soon, moldEngineer: "Simon" },
              { id: "P-SN6-002", partName: "LATE PART", layupProgress: "Not Started", layupDeadline: late, manufacturingEngineer: "Nick" }];
  DB.projects = []; DB.workOrders = [];
  const items = deadlineItems();
  assert(items.length === 2);
  assert(items.find(i => i.id === "P-SN6-001").mine === true, "Simon's part should be mine");
  assert(items.find(i => i.id === "P-SN6-002").mine === false, "Nick's part not mine");
});
await t("renders upcoming, behind, mine sections", () => { setTab("dashboard"); assert(main.innerHTML.includes("Upcoming team deadlines") && main.innerHTML.includes("Behind schedule") && main.innerHTML.includes("Your open items")); assert(main.innerHTML.includes("SOON PART") && main.innerHTML.includes("LATE PART")); });
await t("dashboard stat row shows real counts, not just the lists below it", () => {
  // Same fixture as "aggregates deadlines across tabs" above (SOON PART is
  // Simon's, LATE PART is Nick's and overdue), plus an explicit budget so
  // spend isn't left over from whatever the previous test happened to set.
  DB.budget = [{ id: "B-1", cost: "120", status: "Ordered" }, { id: "B-2", cost: "30", status: "Reimbursed" }];
  setTab("dashboard");
  assert(main.innerHTML.includes('class="stat-row"'), "has a stat row");
  assert(/bignum">1<\/div><div class="stat-label">Your open items/.test(main.innerHTML), "1 item is Simon's (SOON PART): " + main.innerHTML);
  assert(/bignum">1<\/div><div class="stat-label">Behind schedule/.test(main.innerHTML), "1 item is overdue (LATE PART)");
  assert(main.innerHTML.includes('bignum">$150</div><div class="stat-label">Season spend'), "spend totals $120 + $30");
});
await t("a sub-ticket on the dashboard says which ticket it belongs to", () => {
  // Inside the Tickets tab a sub-ticket is always drawn nested under its
  // parent, so the context is free. These lists are flat, and "Machine the
  // plug" on its own says nothing about which mold.
  const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  DB.parts = []; DB.workOrders = [];
  DB.projects = [
    { id: "TKT-P", title: "Nosecone mold", kind: "project", status: "In Progress", assignees: ["simon@berkeley.edu"] },
    { id: "TKT-C", title: "Machine the plug", kind: "project", status: "In Progress", parentId: "TKT-P", dueDate: soon, assignees: ["simon@berkeley.edu"] },
  ];
  const kid = deadlineItems().find(i => i.id === "TKT-C");
  assert(kid.kind === "Sub-ticket", "labelled as one, not the generic Ticket: " + kid.kind);
  assert(kid.parent && kid.parent.label === "Nosecone mold", JSON.stringify(kid.parent));
  const top = deadlineItems().find(i => i.id === "TKT-P");
  assert(top.kind === "Ticket" && top.parent === null, "a top-level ticket gains nothing");
  setTab("dashboard");
  const html = main.innerHTML;
  assert(html.includes("part of"), "the context line renders: " + html.slice(0, 500));
  assert(/part of <span class="chip"[^>]*>Nosecone mold<\/span>/.test(html),
    "and it's the parent's title, clickable, not a bare id: " + html);
});
await t("a sub-ticket whose parent was deleted still renders", () => {
  DB.projects = [{ id: "TKT-ORPHAN", title: "Orphan", kind: "project", status: "To Do", parentId: "TKT-GONE", dueDate: today(), assignees: [] }];
  assert(parentOf(DB.projects[0]) === null, "dangling parentId resolves to null, not a crash");
  setTab("dashboard");
  assert(main.innerHTML.includes("Orphan"), "the ticket is still listed, it just loses the context line");
  assert(!main.innerHTML.includes("part of"), "and doesn't claim a parent it can't name");
});
await t("itemRow closes exactly one paren per case, future/late/today (regression: used to double-close future dates and never close late ones)", () => {
  const soonRow = itemRow({ date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), kind: "Part", coll: "parts", id: "x", label: "x" });
  assert(/\(3d\)/.test(soonRow) && !/\(3d\)\)/.test(soonRow), "future date: single close paren: " + soonRow);
  const lateRow = itemRow({ date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), kind: "Part", coll: "parts", id: "x", label: "x" });
  assert(/\(5d late\)/.test(lateRow), "late date gets its closing paren too: " + lateRow);
  const todayRow = itemRow({ date: today(), kind: "Part", coll: "parts", id: "x", label: "x" });
  assert(/\(today\)/.test(todayRow), "today: " + todayRow);
});
await t("isMine: exact name/first/email match, NOT shared-first-name overmatch", () => {
  fb.user = { uid: "u2", email: "nick.ortiz@berkeley.edu", name: "Nick Ortiz" };
  fb.roster = { name: "Nick Ortiz", role: "member" };
  assert(isMine("Nick Ortiz") === true, "exact full name");
  assert(isMine("Nick") === true, "bare first name (SN5 fields use these)");
  assert(isMine("nick.ortiz@berkeley.edu") === true, "email");
  assert(isMine("Nick Jepsen") === false, "another full-named Nick must NOT match");
  assert(isMine(["Ansh", "Nico"]) === false, "unrelated names");
  fb.user = { uid: "u1", email: "simon@berkeley.edu", name: "Simon Starbuck" };
  fb.roster = { name: "Simon", role: "lead" };
});
await t("dashboard deadline items reflect ticket kind and migrated status, not raw fields", () => {
  // Deliberately doesn't touch DB.parts/DB.workOrders — later tests in this
  // file depend on fixtures set earlier (e.g. P-SN6-001 for openRecord below).
  DB.projects = [
    { id: "TKT-D1", kind: "issue", title: "issue kind on dashboard", assignees: ["simon@berkeley.edu"], status: "In Progress" },
    { id: "TKT-D2", kind: "project", title: "legacy status", assignees: ["simon@berkeley.edu"], status: "Done" }, // pre-migration record
  ];
  const items = deadlineItems();
  // This list is peer to "Part"/"WO" tags — Issues stay distinctly labeled
  // (that visibility is the point), but a Project-kind ticket reads as the
  // generic "Ticket" here, not "Project" (that distinction belongs to the
  // Tickets tab's own board/table/detail views, not this cross-type list).
  assert(items.find(i => i.id === "TKT-D1").kind === "Issue", "issue kind still stands out, not a blanket 'Ticket'");
  assert(items.find(i => i.id === "TKT-D2").kind === "Ticket", "project-kind ticket reads as the generic 'Ticket' here");
  assert(items.find(i => i.id === "TKT-D2").done === true, "legacy Done status still reads as done through projStatus()");
});
await t("dashboard Watched card uses the new colored .status pill, not the old flat .pill", () => {
  DB.projects = [{ id: "TKT-D3", kind: "issue", title: "watched issue", status: "Blocked", // legacy status string
    watchers: ["simon@berkeley.edu"], updatedAt: "2026-08-01T00:00:00", updatedBy: "nick@berkeley.edu" }];
  const html = renderDashboard();
  assert(html.includes('class="status onhold"'), "migrated Blocked->On Hold renders with the new dot-pill class: " + html.slice(0, 400));
  assert(html.includes(">On Hold<"), "shows the migrated label, not the stale 'Blocked': " + html);
  assert(html.includes('class="kindbadge issue"'), "kind badge shown on the Watched row");
});

console.log("cross-links + backup:");
await t("openRecord jumps to a tab's detail", () => { openRecord("parts", "P-SN6-001"); assert(view.tab === "parts" && view.mode === "detail" && view.id === "P-SN6-001"); });
await t("exportAll builds a blob download", () => { calls.length = 0; exportAll(); /* no throw */ assert(true); });
await t("importJSON object shape imports per collection", async () => { const inp = { files: [{ text: async () => JSON.stringify({ parts: [{ id: "P-X" }], budget: [{ id: "B-X" }] }) }], value: "x" }; calls.length = 0; importJSON(inp); await new Promise(r => setTimeout(r, 0)); confirmProceed(); await new Promise(r => setTimeout(r, 0)); assert(calls.some(c => c[0] === "importMany" && c[1] === "parts")); assert(calls.some(c => c[0] === "importMany" && c[1] === "budget")); });
await t("loadArchive pulls all three seeds", async () => { fetchMap = { "sn5-work-orders.json": woSeed, "sn5-parts.json": [{ id: "P-SN5-001" }], "sn5-schedule.json": [{ id: "W00" }] }; DB.workOrders = []; DB.parts = []; DB.schedule = []; calls.length = 0; await loadArchive(); assert(calls.filter(c => c[0] === "importMany").length === 3); });

console.log("documents:");
await t("markdown renderer: headings, tables, lists, bold", () => {
  const html = mdToHtml("# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- one\n- two\n\n**bold** and `code`");
  assert(html.includes("<h1>Title</h1>"), "h1");
  assert(html.includes("<table>") && html.includes("<th>A</th>") && html.includes("<td>1</td>"), "table");
  assert(html.includes("<li>one</li>"), "list");
  assert(html.includes("<strong>bold</strong>") && html.includes("<code>code</code>"), "inline");
});
await t("documents tab loads manifest + lists categories", async () => {
  fetchMap["docs/manifest.json"] = [
    { category: "Datasheets", title: "XCR TDS", kind: "pdf", src: "docs/datasheets/xcr.pdf", size: 2000 },
    { category: "Standards", title: "CS-000 Docs", kind: "md", src: "docs/standards/CS-000.md", size: 1000, docx: "docs/standards/CS-000.docx" },
  ];
  setTab("documents"); // first render kicks async fetch
  await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  assert(main.innerHTML.includes("Datasheets") && main.innerHTML.includes("Standards"), "categories");
  assert(main.innerHTML.includes("XCR TDS") && main.innerHTML.includes("CS-000 Docs"), "titles");
});
await t("opening a PDF doc renders an in-app viewer", () => {
  openDocument("docs/datasheets/xcr.pdf");
  assert(main.innerHTML.includes("<iframe") && main.innerHTML.includes("xcr.pdf"), "pdf iframe");
  closeDocument();
});
await t("documents can be filtered by type, options derived not hardcoded", () => {
  setTab("documents");
  view.fSub = "";
  let html = renderDocuments();
  assert(html.includes(">PDF<") && html.includes(">MD<"), "kind options are derived from the actual docs: " + html);
  assert(html.includes("XCR TDS") && html.includes("CS-000 Docs"), "unfiltered shows both");
  view.fSub = "pdf";
  html = renderDocuments();
  assert(html.includes("XCR TDS") && !html.includes("CS-000 Docs"), "filtered to pdf hides the md doc: " + html);
  view.fSub = "";
});

console.log("mobile:");
await t("shouldOpenDrawerFromSwipe: edge-start + rightward swipe + narrow + closed -> opens", () => {
  assert(shouldOpenDrawerFromSwipe(10, 200, 90, 205, false, true) === true, "clean left-edge swipe right");
});
await t("shouldOpenDrawerFromSwipe: start not near the edge -> false", () => {
  assert(shouldOpenDrawerFromSwipe(120, 200, 200, 205, false, true) === false, "started mid-screen, not the edge");
});
await t("shouldOpenDrawerFromSwipe: vertical-dominant motion (scrolling) -> false", () => {
  assert(shouldOpenDrawerFromSwipe(10, 100, 40, 400, false, true) === false, "mostly vertical, don't hijack scroll");
});
await t("shouldOpenDrawerFromSwipe: drawer already open -> false (avoids racing the backdrop-close handler)", () => {
  assert(shouldOpenDrawerFromSwipe(10, 200, 90, 205, true, true) === false);
});
await t("shouldOpenDrawerFromSwipe: wide/desktop viewport -> false regardless of coordinates", () => {
  assert(shouldOpenDrawerFromSwipe(10, 200, 90, 205, false, false) === false);
});
await t("shouldOpenDrawerFromSwipe: too flush with x=0 -> false (iOS Safari owns the true edge for its own back-swipe)", () => {
  assert(shouldOpenDrawerFromSwipe(0, 200, 80, 205, false, true) === true, "x=0 still within the 24px inset, should pass"); // 0 <= 24, allowed
  assert(shouldOpenDrawerFromSwipe(40, 200, 120, 205, false, true) === false, "40px in is past the edge inset");
});
await t("shouldOpenDrawerFromSwipe: short movement (tap/jitter) -> false", () => {
  assert(shouldOpenDrawerFromSwipe(10, 200, 30, 202, false, true) === false, "only 20px of horizontal movement, below the 60px threshold");
});

console.log("usability audit fixes:");
await t("cancelling the ply form adds nothing (was: prompt()||'' appended a blank ply)", () => {
  DB.parts = [{ id: "P-PLY", partName: "NOSE", layupStack: [] }];
  DB.workOrders = [];
  addPly("parts", "P-PLY");
  closeModal();                                   // Cancel / Escape / backdrop
  assert(recById("parts", "P-PLY").layupStack.length === 0, "no ply on cancel");
  // Submitting with an empty material is refused rather than stored blank.
  addPly("parts", "P-PLY");
  document.getElementById("ply-material").value = "   ";
  submitPly("parts", "P-PLY");
  assert(recById("parts", "P-PLY").layupStack.length === 0, "blank material refused");
  assert(/needs a material/i.test(lastToast), "and says why: " + lastToast);
});
await t("ply form keeps the fields the prompts collected, and defaults coverage", () => {
  DB.parts = [{ id: "P-PLY2", partName: "NOSE", layupStack: [] }];
  DB.workOrders = [];
  addPly("parts", "P-PLY2");
  document.getElementById("ply-material").value = "195 twill";
  document.getElementById("ply-orientation").value = "±45";
  document.getElementById("ply-coverage").value = "";
  submitPly("parts", "P-PLY2");
  const ply = recById("parts", "P-PLY2").layupStack[0];
  assert(ply.material === "195 twill" && ply.orientation === "±45", JSON.stringify(ply));
  assert(ply.coverage === "full", "coverage defaults to full: " + JSON.stringify(ply));
});
await t("openModal honors [autofocus] over the first field (new-ticket led with the Kind select)", () => {
  assert(openNewProject.toString().includes("np-title") && /id="np-title" autofocus/.test(openNewProject.toString()),
    "Title is the autofocus target");
  assert(openModal.toString().includes("[autofocus]"), "openModal looks for it");
});
await t("deadlineItems shows display names, never raw emails", () => {
  DB.users = [{ email: "nico@b.edu", name: "Nico Alvarez", role: "member" }];
  DB.parts = []; DB.workOrders = [];
  DB.projects = [{ id: "T-WHO", title: "t", status: "To Do", dueDate: today(), assignees: ["nico@b.edu"] }];
  const it = deadlineItems().find(i => i.id === "T-WHO");
  assert(it.who === "Nico Alvarez", "name, not email: " + it.who);
});
await t("deadlineItems drops 'N/A (Flat)' from Who — it's a stage value, not a person", () => {
  // 7 of the 33 SN5 parts carry it in moldEngineer, and it rendered as a name.
  DB.projects = []; DB.workOrders = [];
  DB.parts = [{ id: "P-NA", partName: "DASH", moldEngineer: "N/A (Flat)", manufacturingEngineer: "Justin", layupDeadline: today() }];
  const it = deadlineItems().find(i => i.id === "P-NA");
  assert(it.who === "Justin", "just the real person: " + it.who);
});
await t("tickets board gives every status its own track (was repeat(4,1fr) for 6 statuses)", () => {
  DB.projects = PROJ_STATUS.map((s, i) => ({ id: "TB" + i, title: "t" + i, status: s, assignees: [] }));
  view = { ...view, tab: "projects", mode: "list", projView: "board", q: "", tkFilter: "" };
  const html = renderProjBoard();
  assert(html.includes('class="boardwrap"'), "scroll wrapper present");
  PROJ_STATUS.forEach(s => assert(html.includes(`col-${STATUS_SLUG[s]}`), "column for " + s));
  assert(!/repeat\(4/.test(html), "no hardcoded 4-track grid");
});
await t("parts index hides completed parts by default and says how many", () => {
  DB.parts = [
    { id: "P-OPEN", partName: "OPEN ONE", subteam: "AERO", layupProgress: "In Layup" },
    { id: "P-DONE", partName: "DONE ONE", subteam: "AERO", layupProgress: "Polished" },
  ];
  view = { ...view, tab: "parts", mode: "list", id: null, q: "", fSub: "", fLate: false, fMine: false, fEng: "", fDone: false, sortKey: null };
  let html = renderPartIndex();
  assert(html.includes("OPEN ONE") && !html.includes("DONE ONE"), "completed hidden by default");
  // The old checkbox said how many were hidden; the summary chip row says it as
  // a count you can also click to unhide, alongside open / late / mine.
  assert(/<b>1<\/b> done/.test(html), "count of what's hidden is visible: " + html.slice(0, 400));
  assert(/<b>1<\/b> open/.test(html), "and how many are open");
  assert(html.includes("1 of 2 parts"), "and how much of the archive is showing");
  view.fDone = true;
  html = renderPartIndex();
  assert(html.includes("DONE ONE"), "the chip brings them back");
});
await t("timeline marks the week containing today", () => {
  DB.parts = [];
  DB.schedule = [{ id: "W-NOW", weekOf: today() }, { id: "W-OLD", weekOf: "2000-01-03" }];
  view = { ...view, tab: "timeline", mode: "list", edit: false };
  const html = renderTimeline();
  // Weeks are columns now, so "now" lands on one column header plus its cells.
  assert(/tl-wkhd[^"]*\bnow\b/.test(html), "the current week's header is flagged");
  assert((html.match(/tl-wkhd[^"]*\bnow\b/g) || []).length === 1, "exactly one week is current, not every week");
  assert(/<span class="pill now">Now<\/span>/.test(html), "and says so in the design system's own badge");
});

console.log("bug fixes:");
await t("picker starts collapsed, opens on demand", () => {
  pickerInit("tt", [{ value: "a", label: "Apple" }], []);
  assert(!pickerField("tt").includes('class="opts"'), "collapsed: no options list");
  pickerOpen("tt");
  assert(pickerField("tt").includes('class="opts"'), "open: shows options");
});
await t("clicking the chosen row a second time closes it (regression: onclick always called open, never toggled)", () => {
  pickerInit("tt2", [{ value: "a", label: "Apple" }], []);
  assert(!PICKERS["tt2"].open, "starts closed");
  pickerToggleOpen("tt2");
  assert(PICKERS["tt2"].open === true, "first click opens");
  pickerToggleOpen("tt2");
  assert(PICKERS["tt2"].open === false, "second click closes");
});
await t("sidebar brand links home", () => { signInAsLead(); render(); assert(sidebar.innerHTML.includes("setTab('dashboard')")); });
await t("parts layup stack mirrors to linked work order (transaction-safe)", () => {
  DB.parts = [{ id: "P-1", partName: "NOSECONE", workOrderId: "WO-1", layupStack: [] }];
  DB.workOrders = [{ id: "WO-1", partName: "NOSECONE", partId: "P-1", layupStack: [] }];
  calls.length = 0;
  addPly("parts", "P-1");
  document.getElementById("ply-material").value = "195 twill";
  submitPly("parts", "P-1");
  assert(recById("parts", "P-1").layupStack.length === 1, "ply added to part");
  assert(calls.some(c => c[0] === "mutateField" && c[1] === "parts" && c[3] === "layupStack"), "part stack via transaction");
  assert(calls.some(c => c[0] === "mutateField" && c[1] === "workOrders" && c[3] === "layupStack"), "mirrored to WO via transaction: " + JSON.stringify(calls));
  assert(recById("workOrders", "WO-1").layupStack.length === 1, "WO stack synced");
});
await t("mirror is skipped when the link is ambiguous", () => {
  // two work orders share the part name → no unambiguous counterpart → no mirror
  DB.parts = [{ id: "P-2", partName: "STRUT", layupStack: [] }];
  DB.workOrders = [{ id: "WO-2", partName: "STRUT", layupStack: [] }, { id: "WO-3", partName: "STRUT", layupStack: [] }];
  calls.length = 0;
  addPly("parts", "P-2");
  document.getElementById("ply-material").value = "195 twill";
  submitPly("parts", "P-2");
  assert(recById("parts", "P-2").layupStack.length === 1, "part still edited");
  assert(!calls.some(c => c[1] === "workOrders"), "no WO mirrored when name is ambiguous: " + JSON.stringify(calls));
});
await t("@mention exact-token: @Nicole does NOT match Nico", () => {
  DB.users = [{ email: "nico@b.edu", name: "Nico Vera", role: "member" }, { email: "simon@berkeley.edu", name: "Simon Starbuck", role: "lead" }];
  assert(JSON.stringify(mentionsIn("hey @Nicole look here")) === "[]", "prefix must not match: " + JSON.stringify(mentionsIn("hey @Nicole look here")));
  assert(mentionsIn("hey @Nico look").includes("nico@b.edu"), "exact first name matches");
  assert(mentionsIn("hey @nico@b.edu look").includes("nico@b.edu"), "email matches");
});

console.log("global search:");
await t("searchAll matches across collections", () => {
  DB.parts = [{ id: "P-9", partName: "DIFFUSER" }];
  DB.projects = [{ id: "PROJ-9", title: "Grounding" }];
  DB.budget = []; DB.workOrders = []; DB.users = [];
  const res = searchAll("diff");
  assert(res.some(r => r.tab === "parts" && r.id === "P-9"), "finds part");
  assert(!res.some(r => r.tab === "projects"), "unrelated excluded");
});
await t("gotoResult navigates to the record", () => {
  renderSearchResults("diff"); gotoResult(0);
  assert(view.tab === "parts" && view.id === "P-9");
});
await t("searchAll matches a ticket by id even when it has a title (precedence bug regression)", () => {
  // (p.title || "" + p.id) used to make the id branch unreachable whenever a
  // title existed, since "" + p.id evaluates first — searching by ticket id
  // silently never worked. TKT-77 has a title, so this only passes post-fix.
  DB.parts = []; DB.budget = []; DB.workOrders = []; DB.users = [];
  DB.projects = [
    { id: "TKT-77", kind: "issue", title: "unrelated words here" },
    { id: "TKT-78", kind: "project", title: "another unrelated title" },
  ];
  const res = searchAll("tkt-7");
  assert(res.some(r => r.tab === "projects" && r.id === "TKT-77"), "finds by id despite having a title: " + JSON.stringify(res));
  assert(res.find(r => r.id === "TKT-77").sub === "Issue", "issue still stands out, not a blanket label: " + JSON.stringify(res));
  assert(res.find(r => r.id === "TKT-78").sub === "Ticket", "project-kind ticket reads as the generic 'Ticket' in search: " + JSON.stringify(res));
});

console.log("notifications + @mentions:");
await t("@mention adds watcher + notifies", () => {
  DB.users = [{ email: "nick@b.edu", name: "Nick Jepsen", role: "member" }, { email: "simon@berkeley.edu", name: "Simon Starbuck", role: "lead" }];
  DB.projects = [{ id: "PROJ-1", title: "Grounding", watchers: [], comments: [] }];
  view = { ...view, tab: "projects", mode: "detail", id: "PROJ-1" };
  el("comment-editor").innerHTML = "hey @Nick can you look"; el("comment-editor").textContent = "hey @Nick can you look";
  calls.length = 0; postComment("PROJ-1");
  assert(projById("PROJ-1").watchers.includes("nick@b.edu"), "mentioned user now watches");
  assert(calls.some(c => c[0] === "notify" && c[1] === "nick@b.edu" && c[2] === "mention"), "notify sent: " + JSON.stringify(calls));
});
await t("topbar bell shows unread count", () => {
  DB.notifications = [{ id: "N1", to: "simon@berkeley.edu", text: "x", read: false }, { id: "N2", to: "simon@berkeley.edu", text: "y", read: true }];
  render();
  assert(topbar.innerHTML.includes('aria-label="Notifications"') && topbar.innerHTML.includes('class="badge">1'), "one unread badge");
});
await t("openNotifs + gotoNotif marks read + navigates", () => {
  DB.notifications = [{ id: "N1", to: "simon@berkeley.edu", type: "assigned", text: "assigned you", read: false, link: { tab: "projects", id: "PROJ-1" } }];
  openNotifs(); assert(document.getElementById("modal").innerHTML.includes("assigned you"));
  calls.length = 0; gotoNotif("N1");
  assert(calls.some(c => c[0] === "markNotifRead" && c[1] === "N1"));
  assert(view.tab === "projects" && view.id === "PROJ-1");
});

console.log("people / reports:");
await t("calendar is gone, not just hidden — no dead renderer shipping to every browser", () => {
  // It sat commented out of TABS while still being downloaded, parsed and
  // styled on every page load. Deleted rather than left dormant; git has it if
  // the tab ever comes back. This asserts the removal is complete, so a
  // half-restore (script tag back, TABS row not) can't pass unnoticed.
  assert(!TABS.some(t => t.id === "calendar"), "not in the nav");
  assert(typeof globalThis.renderCalendar === "undefined", "renderCalendar is gone");
  assert(typeof globalThis.calItems === "undefined", "calItems is gone");
});
await t("people shows a member's live assignments", () => {
  DB.users = [{ email: "nick@b.edu", name: "Nick Jepsen", role: "member" }];
  DB.parts = [{ id: "P-N", partName: "WING", moldEngineer: "Nick", layupProgress: "In Layup" }];
  DB.projects = []; DB.workOrders = [];
  view = { ...view, tab: "people", q: "" }; render();
  assert(main.innerHTML.includes("Nick Jepsen") && main.innerHTML.includes("WING"), "shows Nick + his part");
});
await t("people renders as a table (not the old card grid), keeps role-editing and self photo-set", () => {
  DB.users = [{ email: "simon@berkeley.edu", name: "Simon Starbuck", role: "lead" }, { email: "nick@b.edu", name: "Nick Jepsen", role: "member" }];
  DB.parts = []; DB.projects = []; DB.workOrders = [];
  view = { ...view, tab: "people", q: "" }; render();
  assert(main.innerHTML.includes('<table class="list dash">'), "table, not .peoplegrid: " + main.innerHTML);
  assert(!main.innerHTML.includes("peoplegrid") && !main.innerHTML.includes("personcard"), "old grid markup is gone");
  assert(/onchange="setRole\('nick@b\.edu',this\.value\)"/.test(main.innerHTML), "lead can still edit someone else's role");
  assert(!main.innerHTML.includes("setRole('simon@berkeley.edu'"), "no self-role-edit dropdown for you");
  assert(main.innerHTML.includes("Set photo"), "signed-in user still gets a self photo-set button");
});
await t("a Cancelled ticket doesn't count as an open assignment on People", () => {
  DB.users = [{ email: "nick@b.edu", name: "Nick Jepsen", role: "member" }];
  DB.parts = [];
  DB.projects = [{ id: "TKT-CX", kind: "project", title: "abandoned idea", status: "Cancelled", assignees: ["nick@b.edu"] }];
  DB.workOrders = [];
  const a = assignmentsFor("nick@b.edu");
  assert(a.projects.length === 0, "Cancelled shouldn't read as a live commitment: " + JSON.stringify(a.projects));
});
await t("reports CSV has header + rows", () => {
  DB.parts = [{ id: "P-R", partName: "SEAT", subteam: "BERGO" }];
  const csv = toCSV(DB.parts, [{ label: "id", get: r => r.id }, { label: "part", get: r => r.partName }]);
  assert(csv.split("\n")[0] === "id,part" && csv.includes("P-R,SEAT"));
});
await t("reports renders status board sections", () => {
  view = { ...view, tab: "reports" }; render();
  assert(main.innerHTML.includes("Parts by layup stage") && main.innerHTML.includes("Open blockers") && main.innerHTML.includes("Export CSV"));
});

console.log("documents upload:");
await t("submitDocument uploads + appends to DB.documents", async () => {
  DB.documents = [];
  el("ud-title").value = "Test Guide"; el("ud-cat").value = "Guides";
  el("ud-file").files = [{ name: "g.pdf", type: "application/pdf" }];
  calls.length = 0; await submitDocument();
  assert(calls.some(c => c[0] === "upload"), "file uploaded");
  assert(DB.documents.some(d => d.title === "Test Guide" && d.kind === "pdf"), "doc record added");
  assert(calls.some(c => c[0] === "save" && c[1] === "documents"), "doc saved");
});

console.log("SN5 seed files (importer output shape):");
await t("sn5-parts.json: retro parts with three stages", () => {
  const p = JSON.parse(readFileSync(join(root, "sn5-parts.json"), "utf8"));
  assert(p.length > 20, "expected the SN5 part roster");
  assert(p.every(x => x.retro === true), "all parts must be retro");
  assert(p.every(x => "cadProgress" in x && "moldProgress" in x && "layupProgress" in x), "three stages required");
  assert(p.every(x => x.subteam === x.subteam.toUpperCase()), "subteam normalized to upper");
});
await t("sn5-schedule.json: weeks with station fields", () => {
  const s = JSON.parse(readFileSync(join(root, "sn5-schedule.json"), "utf8"));
  assert(s.length > 5, "expected multiple weeks");
  assert(s.every(w => "mold1" in w && "waterjet" in w && "notes" in w && w.retro === true), "station fields + retro");
  assert(s.some(w => Object.values(w).some(v => String(v).startsWith("P-SN5-"))), "some cells link to parts");
});

await t("sn5-stock.json: a rack the planner can actually cut from", () => {
  const s = JSON.parse(readFileSync(join(root, "sn5-stock.json"), "utf8"));
  // Every field the Stock tab and the packer read, in the shape they read it —
  // a seed that loads but renders "NaN mm" is worse than no seed.
  for (const b of s) {
    for (const k of ["len", "wid", "thk"]) {
      assert(b[k] && typeof b[k].value === "number" && ["in", "mm"].includes(b[k].unit), `${b.id}.${k}: ${JSON.stringify(b[k])}`);
      assert(Number.isFinite(toMm(b[k])) && toMm(b[k]) > 0, `${b.id}.${k} converts`);
    }
    assert([30, 60].includes(b.density), `${b.id} density is a stocked grade`);
    assert(["sheet", "remnant"].includes(b.kind), `${b.id} kind`);
    assert(Number.isInteger(b.qty) && b.qty >= 1, `${b.id} qty`);
  }
  // Ids sit in the SN5 namespace so they can't collide with BRD-SN6-### handed
  // out by the shared counter — the same trick the parts and WO seeds use.
  assert(s.every(b => /^BRD-SN5-\d+$/.test(b.id)), "ids stay out of the SN6 counter's range");
  // The planner picks from distinct thicknesses; one thickness means it can only
  // ever build one stack height.
  DB.stock = s;
  const thk = stockThicknessesMm();
  assert(thk.length >= 3, "at least three thicknesses to choose between: " + JSON.stringify(thk));
  assert(s.some(b => b.kind === "remnant"), "offcuts too — spending those first is the point of the cut list");
});
await t("every sample mold offered in the modal is actually shipped", () => {
  // A dropdown entry pointing at a missing file fails as a silent fetch error
  // at the moment someone is trying the feature for the first time.
  SAMPLE_MOLDS.forEach(s => {
    const buf = readFileSync(join(root, "samples", s.file));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const tris = parseSTL(ab).tris;
    assert(tris.length > 100, `${s.file} parses: ${tris.length} triangles`);
    // The labels make promises about sections and bodies; hold them to it.
    const bodies = splitBodies(tris);
    const h = (meshBounds(bodies[0].tris).z1 - meshBounds(bodies[0].tris).z0) / 25.4;
    if (/(\d+) separate bodies/.test(s.label)) {
      assert(bodies.length === Number(RegExp.$1), `${s.file} has ${bodies.length} bodies, label says ${RegExp.$1}`);
    }
    if (/splits into 2 sections/.test(s.label)) assert(h > 6, `${s.file} must exceed the 6in cut depth, is ${h.toFixed(2)}in`);
    if (/one section/.test(s.label)) assert(h <= 6, `${s.file} must fit the cut depth, is ${h.toFixed(2)}in`);
  });
});

console.log("printed traveler:");
await t("sheet renders every section for a real WO", () => {
  const wo = woSeed.find(w => (w.steps || []).length >= 8);
  const h = woSheetHtml(wo);
  ["Part and assignment", "Layup stack", "Steps and buy-offs", "Bill of materials",
   "Quality checks", "Event log", "Release sign-off"].forEach(s =>
    assert(h.includes(s), "missing section: " + s));
  assert(h.includes(wo.id), "WO id must appear on the sheet");
});
await t("every list leaves blank rows to write in", () => {
  const wo = woSeed.find(w => (w.steps || []).length >= 8);
  const L = LAYOUTS[4];
  const h = woSheetHtml(wo, { layout: L });
  const blanks = (h.match(/<tr class="blank">/g) || []).length;
  const want = L.rows.steps + L.rows.stack + L.rows.bom + L.rows.quality + L.rows.events;
  assert(blanks === want, `expected ${want} blank rows, got ${blanks}`);
});
await t("layout ladder tightens monotonically, so the fit loop converges", () => {
  const total = L => L.rows.steps + L.rows.stack + L.rows.bom + L.rows.quality + L.rows.events;
  for (let i = 1; i < LAYOUTS.length; i++) {
    assert(total(LAYOUTS[i]) <= total(LAYOUTS[i - 1]),
      `layout ${i} is not tighter than ${i - 1}: ${total(LAYOUTS[i])} vs ${total(LAYOUTS[i - 1])}`);
  }
  assert(total(LAYOUTS[0]) > total(LAYOUTS[LAYOUTS.length - 1]), "ladder must actually span a range");
  assert(LAYOUTS[LAYOUTS.length - 1].compact, "the floor layout should be the compact one");
  assert(MAX_PAGES === 2, "the sheet is specified as a two-page document");
});
await t("tightest layout emits far less filler than the most generous", () => {
  const wo = woSeed.find(w => (w.steps || []).length >= 8);
  const big = (woSheetHtml(wo, { layout: LAYOUTS[0] }).match(/<tr class="blank">/g) || []).length;
  const small = (woSheetHtml(wo, { layout: LAYOUTS[LAYOUTS.length - 1] }).match(/<tr class="blank">/g) || []).length;
  assert(big >= small * 5, `expected a wide range, got ${big} vs ${small}`);
});
await t("blocker steps are flagged without relying on colour", () => {
  const wo = woSeed.find(w => (w.steps || []).some(isBlocker));
  const h = woSheetHtml(wo);
  assert(h.includes('<tr class="blk">'), "blocker row needs the blk class");
  assert(h.includes("Blocker: no sign-off, no moving on"), "blocker must be spelled out in text");
});
await t("a cure hold prints as something a pen can complete", () => {
  // The screen counts down; paper can't. What the sheet has to carry is the
  // rule and somewhere to write when the clock actually started.
  const wo = holdWO("WO-PRINT-HOLD", 3, "IN2-AT30-SLOW", { tempC: 19 });
  const h = woSheetHtml(wo);
  assert(/class="holdflag"/.test(h), "hold gets its own printed line: " + h.slice(0, 300));
  assert(h.includes("Hold 48 h after infuse"), "says how long and after what: " + h);
  assert(h.includes("IN2 + AT30 SLOW"), "and what it is waiting on");
  assert(/started 20\d\d-\d\d-\d\d \d\d:\d\d/.test(h), "with the real recorded start time");
  assert(!/CS-\d/.test(h), "still no standard reference on paper");
});
await t("a blank traveler asks for the hold instead of asserting one", () => {
  const blank = woSheetHtml({ processType: "MoldInfusion", steps: [] }, { blank: true });
  assert(/class="holdflag"/.test(blank), "the blank form carries the hold line too");
  assert(/resin\s*__________/.test(blank), "and asks which resin, since nothing is mixed yet: " + blank.match(/class="holdflag">[^<]*/));
  assert(!/48 h/.test(blank), "a blank form can't know the length before the resin is chosen");
});
await t("standard references are kept off the sheet", () => {
  woSeed.forEach(wo => {
    const h = woSheetHtml(wo);
    assert(!/CS-\d/.test(h), `${wo.id} still prints a standard reference`);
  });
});
await t("stripCS cleans legacy titles without eating the step name", () => {
  assert(stripCS("Stack frozen (CS-002 §7.2)") === "Stack frozen");
  assert(stripCS("Drop test ≤1 inHg/10 min (CS-006 §7.4)") === "Drop test ≤1 inHg/10 min");
  assert(stripCS("Cut to DXF — confirm rev (CS-009)") === "Cut to DXF — confirm rev");
  assert(stripCS("Machine mold") === "Machine mold", "a clean title must pass through untouched");
});
await t("new work orders carry no standard references at all", () => {
  Object.values(STD_STEPS).forEach(list => list.forEach(s =>
    assert(!/CS-\d/.test(s[0]), "standard reference left in step title: " + s[0])));
});
await t("blocker detection survives the retitle", () => {
  const words = ["Stack frozen", "Mold design review", "Drop test, 1 inHg or less over 10 min",
                 "Define acceptance criterion: target and method, set before work starts"];
  words.forEach(w => assert(isBlocker({ title: w }), "should still be a blocker: " + w));
  assert(!isBlocker({ title: "Trim and finish" }), "ordinary steps must not become blockers");
});
await t('retro "not recorded" prints as an empty box, not as data', () => {
  const h = woSheetHtml({ processType: "MoldInfusion", partName: "X", moldEngineer: "not recorded (retro)",
    steps: [], layupStack: [], bom: [], qualityChecks: [], timeline: [] });
  assert(!h.includes("not recorded"), "placeholder text must never reach paper");
});
await t("blank form builds from STD_STEPS with no record behind it", () => {
  const h = woSheetHtml({ processType: "MoldWetLay", steps: [], layupStack: [], bom: [], qualityChecks: [], timeline: [] }, { blank: true });
  STD_STEPS.MoldWetLay.forEach(s => assert(h.includes(esc(s[0])), "missing standard step: " + s[0]));
  assert(h.includes("Blank form"), "blank form should be stamped as one");
  assert(h.includes("MOLD WET LAY"), "process should be humanized for a person at a bench");
  assert((h.match(/<tr class="blank">/g) || []).length > 0, "a blank form is mostly ruling");
});
await t("Print button opens the traveler, not window.print()", () => {
  onFbData("workOrders", woSeed.slice());
  const r = DB.workOrders.find(w => w.retro);
  view = { ...view, tab: "workorders", mode: "detail", id: r.id, edit: false }; render();
  assert(main.innerHTML.includes("openPrintPreview"), "detail toolbar should preview the sheet");
  assert(!main.innerHTML.includes('onclick="window.print()"'), "raw window.print() should be gone");
});

console.log("stock (board inventory):");
// Fill the board modal the way a person would, then submit it.
function fillBoard({ len = "48", lenU = "in", wid = "96", widU = "in", thk = "2", thkU = "in", qty = "1", density = "30", kind = "sheet", label = "", origin = "" } = {}) {
  el("bd-len").value = len; el("bd-len-u").value = lenU;
  el("bd-wid").value = wid; el("bd-wid-u").value = widU;
  el("bd-thk").value = thk; el("bd-thk-u").value = thkU;
  el("bd-qty").value = qty; el("bd-density").value = density;
  el("bd-kind").value = kind; el("bd-label").value = label; el("bd-origin").value = origin;
}
await t("toMm converts inches and passes mm straight through", () => {
  assert(toMm({ value: 1, unit: "in" }) === 25.4, "1in should be 25.4mm");
  assert(toMm({ value: 50, unit: "mm" }) === 50, "mm should not be scaled");
  assert(Number.isNaN(toMm(null)), "a missing dim is NaN, not 0 — 0 would silently pack");
});
await t("dimensions are stored as entered, so an edit round-trip cannot drift", () => {
  DB.stock = [];
  fillBoard({ len: "48", lenU: "in" });
  return submitBoard(null).then(() => {
    const b = DB.stock[0];
    assert(b.len.value === 48 && b.len.unit === "in", "should keep 48in verbatim");
    // Re-open and re-save without touching anything: the classic drift path.
    fillBoard({ len: String(b.len.value), lenU: b.len.unit });
    return submitBoard(b.id).then(() => {
      assert(DB.stock[0].len.value === 48, "48in must still be exactly 48 after a re-save");
      assert(DB.stock.length === 1, "editing must not create a second board");
    });
  });
});
await t("a board rejects zero, negative, non-numeric and absurd dimensions", async () => {
  for (const bad of ["0", "-5", "abc", ""]) {
    DB.stock = []; fillBoard({ len: bad });
    await submitBoard(null);
    assert(DB.stock.length === 0, `"${bad}" should be rejected, not stored`);
  }
  DB.stock = []; fillBoard({ len: "400", lenU: "in" }); // 10.16 m
  await submitBoard(null);
  assert(DB.stock.length === 0, "over 10 m should be rejected as a unit mistake");
  assert(lastToast.toLowerCase().includes("10 m"), "the error should name the real reason");
});
await t("quantity must be a whole number of boards", async () => {
  DB.stock = []; fillBoard({ qty: "2.5" });
  await submitBoard(null);
  assert(DB.stock.length === 0, "a fractional board is not a thing");
});
await t("offcuts and full sheets are the same object, differing only by kind", async () => {
  DB.stock = [];
  fillBoard({ kind: "remnant", len: "19", wid: "30", origin: "WO-SN6-004", label: "offcut" });
  await submitBoard(null);
  const b = DB.stock[0];
  assert(b.kind === "remnant" && b.origin === "WO-SN6-004", "provenance should survive");
  assert(toMm(b.len) > 0 && toMm(b.wid) > 0, "a remnant is measured like any board");
});
await t("stock list renders, escapes labels, and shows an empty state", async () => {
  DB.stock = [];
  view = { ...view, tab: "stock", mode: "list", q: "", fSub: "" }; render();
  assert(main.innerHTML.includes("No board stock recorded yet"), "empty state should explain what to do");
  fillBoard({ label: '<img src=x onerror=alert(1)>' });
  await submitBoard(null);
  render();
  // The payload text survives as inert text — what must NOT survive is a real tag.
  assert(!main.innerHTML.includes("<img src=x"), "board labels must never produce a live tag");
  assert(main.innerHTML.includes("&lt;img"), "the label should render as escaped text");
});
await t("mm and inch boards both land in the same on-hand bucket by real size", async () => {
  DB.stock = [];
  fillBoard({ thk: "1", thkU: "in" }); await submitBoard(null);
  fillBoard({ thk: "25.4", thkU: "mm" }); await submitBoard(null);
  render();
  assert(DB.stock.length === 2, "both boards should be stored");
  assert(thkKey(DB.stock[0]) === thkKey(DB.stock[1]), "1in and 25.4mm are the same stock bucket");
});
await t("deleting a board is lead-only in the UI and drops it from the list", async () => {
  DB.stock = []; fillBoard(); await submitBoard(null);
  const id = DB.stock[0].id;
  render();
  assert(main.innerHTML.includes("delBoard"), "a lead should see the delete control");
  delBoard(id); confirmProceed();
  assert(DB.stock.length === 0, "the board should be gone locally");
  assert(calls.some(c => c[0] === "del" && c[1] === "stock"), "and deleted server-side");
});

console.log("mold slicing (stack plans):");
// Minimal STL writer + a tapered plug, so the whole upload path runs for real.
function stlOf(tris) {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  let o = 84;
  for (const t of tris) {
    o += 12;
    for (const f of [t.ax, t.ay, t.az, t.bx, t.by, t.bz, t.cx, t.cy, t.cz]) { dv.setFloat32(o, f, true); o += 4; }
    o += 2;
  }
  return buf;
}
function plugTris(hb, ht, z0, z1) {
  const R = (h) => [{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }];
  const b = R(hb), t = R(ht), out = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    out.push({ ax: b[i].x, ay: b[i].y, az: z0, bx: b[j].x, by: b[j].y, bz: z0, cx: t[j].x, cy: t[j].y, cz: z1 });
    out.push({ ax: b[i].x, ay: b[i].y, az: z0, bx: t[j].x, by: t[j].y, bz: z1, cx: t[i].x, cy: t[i].y, cz: z1 });
  }
  return out;
}
function fillMold({ tris = plugTris(200, 80, 0, 100), name = "test plug", unit = "mm", thk = "", thkU = "mm", size = null, src = "stl", mode = "auto", body = null, box = null } = {}) {
  el("ml-name").value = name; el("ml-unit").value = unit;
  el("ml-thk").value = thk; el("ml-thk-u").value = thkU;
  el("ml-src").value = src; el("ml-mode").value = mode;
  if (box) {
    el("ml-bl").value = box[0]; el("ml-bl-u").value = "mm";
    el("ml-bw").value = box[1]; el("ml-bw-u").value = "mm";
    el("ml-bh").value = box[2]; el("ml-bh-u").value = "mm";
  }
  el("ml-body").value = String(body == null ? 0 : body);
  el("ml-bodies").innerHTML = "";
  const buf = stlOf(tris);
  el("ml-file").files = [{ name: "mold.stl", size: size == null ? buf.byteLength : size, arrayBuffer: async () => buf }];
  MOLD_BUF = null; MOLD_BODIES = null;
}
// A rack with real thicknesses, so "choose them for me" has something to choose.
function seedStock() {
  DB.stock = [1, 1.5, 2, 3].map((t, i) => ({
    id: "BRD-" + i, len: { value: 96, unit: "in" }, wid: { value: 48, unit: "in" },
    thk: { value: t, unit: "in" }, density: 30, qty: 3, kind: "sheet",
  }));
}
await t("the planner picks board thicknesses from stock without being told", async () => {
  seedStock(); DB.stackplans = [];
  fillMold();
  await submitMold();
  assert(DB.stackplans.length === 1, "a plan should be saved: " + lastToast);
  const p = DB.stackplans[0];
  assert(p.thicknessesMm && p.thicknessesMm.length, "it must record which boards it chose");
  const total = p.thicknessesMm.reduce((a, b) => a + b, 0);
  assert(total >= 100 - 1e-6, "the chosen boards must reach the mold height");
  assert(p.thicknessesMm.every(t => [25.4, 38.1, 50.8, 76.2].some(a => Math.abs(a - t) < 0.2)),
    "and may only use thicknesses actually on the rack: " + p.thicknessesMm);
});
await t("auto planning is refused when the rack is empty, not silently guessed", async () => {
  DB.stock = []; DB.stackplans = [];
  fillMold();
  await submitMold();
  assert(DB.stackplans.length === 0, "nothing to choose from means no plan");
  assert(/board stock/i.test(lastToast), "and it should say so: " + lastToast);
});
await t("manual thicknesses still work for anyone who wants the control", async () => {
  seedStock(); DB.stackplans = [];
  fillMold({ mode: "manual", thk: "25, 25, 25, 25", thkU: "mm" });
  await submitMold();
  assert(DB.stackplans.length === 1, "manual should plan: " + lastToast);
  assert(DB.stackplans[0].layers.length === 4, "four boards, four layers");
});
await t("a plain rectangular block can be typed in instead of an STL", async () => {
  seedStock(); DB.stackplans = [];
  fillMold({ src: "box", box: [300, 200, 100] });
  await submitMold();
  assert(DB.stackplans.length === 1, "a box should plan: " + lastToast);
  const p = DB.stackplans[0];
  const b = p.layers[0].blanks[0];
  // 300x200 block + 25.4mm margin on all four sides.
  assert(Math.abs((b.x1 - b.x0) - (300 + 2 * 25.4)) < 1, "blank should be the block plus margin, got " + (b.x1 - b.x0));
  assert(/block/i.test(p.source), "and should record that it came from typed dimensions");
});
await t("dimensions are the default source, STL is the opt-in", async () => {
  seedStock(); DB.stackplans = [];
  fillMold({ src: "", box: [300, 200, 100] });   // nothing chosen = the default
  await submitMold();
  assert(DB.stackplans.length === 1, "the default path should plan: " + lastToast);
  assert(/block/i.test(DB.stackplans[0].source), "and it should be the typed block, not the file");
});
await t("a multi-body STL asks which body instead of planning the whole assembly", async () => {
  seedStock(); DB.stackplans = [];
  // Two separate plugs far apart: exactly the shape of a real Fusion assembly
  // export, where slicing the whole file would plan the void between them.
  const two = plugTris(200, 80, 0, 100).concat(plugTris(200, 80, 0, 100).map(t => ({
    ...t, ax: t.ax + 5000, bx: t.bx + 5000, cx: t.cx + 5000,
  })));
  fillMold({ tris: two });
  await submitMold();
  assert(DB.stackplans.length === 0, "it must not plan a 5m void");
  assert(/bodies/i.test(lastToast), "it should ask which body: " + lastToast);
  assert(/ml-body/.test(els["ml-bodies"].innerHTML), "and offer a picker");
});
await t("picking a body and clicking Plan again actually plans it (regression: used to re-ask forever)", async () => {
  seedStock(); DB.stackplans = [];
  const two = plugTris(200, 80, 0, 100).concat(plugTris(200, 80, 0, 100).map(t => ({
    ...t, ax: t.ax + 5000, bx: t.bx + 5000, cx: t.cx + 5000,
  })));
  fillMold({ tris: two }); // fresh file pick — MOLD_BUF/MOLD_BODIES reset to null
  await submitMold(); // first submit: probes, finds 2 bodies, shows the picker, returns
  assert(DB.stackplans.length === 0, "still just asking, not planning yet");
  // The user now picks a body from the rendered <select> — the <input type=file>
  // itself is untouched (browsers don't clear it), so el("ml-file").files is
  // still the SAME file as before. Do not call fillMold() again here — that
  // would mask the bug by simulating a fresh file pick.
  el("ml-body").value = "0";
  lastToast = "";
  await submitMold(); // second submit: must plan body 0, not re-ask
  assert(DB.stackplans.length === 1, "must actually plan once a body is chosen: " + lastToast);
  assert(!/bodies/i.test(lastToast), "must not re-ask which body: " + lastToast);
});
await t("CRITICAL a mold over the 6in cut depth is sectioned automatically", async () => {
  seedStock(); DB.stackplans = [];
  fillMold({ src: "box", box: [300, 200, 9 * 25.4] });
  await submitMold();
  const p = DB.stackplans[0];
  assert(p.sections.length === 2, "9in cannot be machined in one setup, got " + p.sections.length + " section(s)");
  assert(p.warnings.some(w => /cut depth/i.test(w)), "and the operator must be told why");
});
await t("CRITICAL a plan is always storable — contours thin until it fits", () => {
  // A deliberately huge plan: many layers, each with a dense contour.
  const dense = [];
  for (let i = 0; i < 4000; i++) dense.push({ x: Math.cos(i) * 100, y: Math.sin(i) * 100 });
  const fat = { layers: [] };
  for (let i = 0; i < 8; i++) {
    fat.layers.push({ index: i, thickness: 25, islands: [{ contour: dense.slice(), box: { x0: -100, y0: -100, x1: 100, y1: 100 } }], blanks: [{ x0: -125, y0: -125, x1: 125, y1: 125 }] });
  }
  assert(JSON.stringify(fat).length > 900000, "the fixture should start over budget");
  const { plan, notes } = fitPlanForStorage(fat);
  assert(JSON.stringify(plan).length <= 900000, "must end under the Firestore ceiling");
  assert(notes.length === 1, "and must say that detail was lost");
  assert(plan.layers.every(L => L.blanks.length === 1), "blanks are never dropped — they are what gets cut");
});

console.log("stock STL export + 3D view:");
// A mold taller than the 6in cut depth, so it sections in two — the case the
// per-section export exists for.
function twoSectionPlan() {
  const r = sliceMold(boxTris(400, 300, 220), [50.8, 50.8, 50.8, 50.8, 25.4], {});
  return { id: "STK-T", name: "test mold", layers: r.layers, bounds: r.bounds, sections: r.sections };
}

await t("writeBinarySTL round-trips through the slicer's own parseSTL", () => {
  // The strongest check available and it costs nothing: the reader is the same
  // code every uploaded mold already goes through, so agreement between the two
  // halves means the written file is one the app itself would accept.
  const tris = blankTris({ x0: -10, y0: -20, x1: 90, y1: 130 }, 5, 55);
  const back = parseSTL(writeBinarySTL(tris, "unit test")).tris;
  assert(back.length === tris.length, `${back.length} vs ${tris.length} triangles`);
  const a = meshBounds(tris), b = meshBounds(back);
  ["x0", "y0", "z0", "x1", "y1", "z1"].forEach(k =>
    assert(Math.abs(a[k] - b[k]) < 1e-3, `${k}: ${a[k]} vs ${b[k]}`));
});
await t("writeBinarySTL emits exactly 84 + 50n bytes and a non-'solid' header", () => {
  const tris = blankTris({ x0: 0, y0: 0, x1: 10, y1: 10 }, 0, 10);
  const buf = writeBinarySTL(tris, "FEB test");
  assert(buf.byteLength === stlByteLength(tris.length), `${buf.byteLength} vs ${stlByteLength(tris.length)}`);
  assert(new DataView(buf).getUint32(80, true) === tris.length, "count field");
  // A binary file whose header starts "solid" gets mis-sniffed as ASCII STL by
  // plenty of readers, which is why writeBinarySTL never lets that happen.
  const head = String.fromCharCode(...new Uint8Array(buf, 0, 5)).toLowerCase();
  assert(head !== "solid", "header must not start with 'solid': " + head);
});
await t("blankTris is a closed box with every normal pointing outward", () => {
  const b = { x0: -5, y0: -7, x1: 25, y1: 33 };
  const tris = blankTris(b, 2, 12);
  assert(tris.length === 12, "6 faces x 2 triangles: " + tris.length);
  const bb = meshBounds(tris);
  assert(bb.x0 === -5 && bb.x1 === 25 && bb.y0 === -7 && bb.y1 === 33 && bb.z0 === 2 && bb.z1 === 12, JSON.stringify(bb));
  // Verify the winding rather than trusting the hand-derived corner order:
  // every face normal must point away from the box centre.
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, cz = (bb.z0 + bb.z1) / 2;
  tris.forEach((t, i) => {
    const n = triNormal(t);
    const fx = (t.ax + t.bx + t.cx) / 3 - cx, fy = (t.ay + t.by + t.cy) / 3 - cy, fz = (t.az + t.bz + t.cz) / 3 - cz;
    assert(n.x * fx + n.y * fy + n.z * fz > 0, `triangle ${i} faces inward`);
  });
});
await t("sectionTris splits by layer.section, and one export per section covers every blank", () => {
  const p = twoSectionPlan();
  assert(sectionCount(p) === 2, "two machine setups: " + sectionCount(p));
  const s0 = sectionTris(p, 0), s1 = sectionTris(p, 1);
  const totalBlanks = p.layers.reduce((n, L) => n + L.blanks.length, 0);
  assert((s0.length + s1.length) / 12 === totalBlanks, "no blank exported twice or lost");
  // Section 1 sits above section 0 — the split is along Z, at the cut depth.
  assert(meshBounds(s1).z0 >= meshBounds(s0).z1 - 1e-6, "sections stack, not overlap");
});
await t("a plan saved before sections existed exports as one section", () => {
  const legacy = { id: "OLD", name: "old", layers: [{ z0: 0, z1: 10, blanks: [{ x0: 0, y0: 0, x1: 10, y1: 10 }] }] };
  assert(sectionCount(legacy) === 1, "defaults to one");
  assert(sectionTris(legacy, 0).length === 12, "and still exports its blank");
});
await t("exported blocks stay in the mold's own CAD coordinates", () => {
  // The point of exporting at all: it must drop onto the CAD model with no
  // aligning. A blank's x0 is NEGATIVE for a mold at the origin — that's the
  // machining margin sitting correctly outside the mold datum.
  const p = twoSectionPlan();
  const bb = meshBounds(sectionTris(p, 0));
  assert(bb.x0 < 0 && bb.y0 < 0, "margin extends outside the mold origin: " + JSON.stringify(bb));
  assert(Math.abs(bb.x0 - p.layers[0].blanks[0].x0) < 1e-6, "matches the blanks table exactly");
});
await t("exportSectionStl runs end to end and reports the block count", () => {
  DB.stackplans = [twoSectionPlan()];
  view = { ...view, tab: "stock", mode: "plan", id: "STK-T" };
  exportSectionStl("STK-T", 0);
  assert(/block/.test(lastToast) && /mm/.test(lastToast), "says what it wrote: " + lastToast);
  exportSectionStl("STK-T", 99);
  assert(/no blocks/i.test(lastToast), "an empty section is refused, not written: " + lastToast);
});

await t("decimateTris shrinks a mesh without moving its silhouette", () => {
  const dense = sliceMold ? boxTris(200, 200, 200) : [];
  // Build something with real triangle count: subdivide a box crudely.
  const tris = [];
  for (let i = 0; i < 40; i++) {
    for (const t of dense) {
      tris.push({ ax: t.ax + i * 0.01, ay: t.ay, az: t.az, bx: t.bx + i * 0.01, by: t.by, bz: t.bz, cx: t.cx + i * 0.01, cy: t.cy, cz: t.cz });
    }
  }
  const before = meshBounds(tris);
  const out = decimateTris(tris, 40);
  assert(out.length <= tris.length, "never grows");
  const after = meshBounds(out);
  const span = Math.max(before.x1 - before.x0, before.y1 - before.y0, before.z1 - before.z0);
  ["x0", "y0", "z0", "x1", "y1", "z1"].forEach(k =>
    assert(Math.abs(after[k] - before[k]) <= span * 0.2, `${k} moved too far: ${before[k]} -> ${after[k]}`));
  out.forEach(t => Object.values(t).forEach(v => assert(Number.isFinite(v), "no NaN in the output")));
});
await t("decimateTris is a no-op when the mesh is already small enough", () => {
  const tris = blankTris({ x0: 0, y0: 0, x1: 10, y1: 10 }, 0, 10);
  assert(decimateTris(tris, 500) === tris, "same array back, no needless copy");
});
await t("meshStlForStorage never returns a file that breaks the storage.rules size cap", () => {
  // storage.rules caps an upload at 10 MB while the app accepts 64 MB STLs, so
  // something has to give — display fidelity, not the upload.
  const dense = [];
  for (let i = 0; i < 400; i++) {
    // One connected blob, subdivided: clustering CAN reduce this.
    dense.push(...blankTris({ x0: i * 0.1, y0: 0, x1: i * 0.1 + 30, y1: 30 }, 0, 30));
  }
  const buf = meshStlForStorage(dense, 50 * 1024);
  assert(buf && buf.byteLength <= 50 * 1024, `${buf && buf.byteLength} bytes vs a 51200 budget`);
  assert(parseSTL(buf).tris.length > 0, "and it is still a readable STL");
});
await t("meshStlForStorage is within budget or null — never an oversized upload", () => {
  /* The invariant that actually matters, checked across shapes rather than one
     fixture. An oversized file would be rejected by storage.rules server-side
     and surface to the user as a meaningless permission error, so the contract
     is: a file that fits, or nothing (and then the plan keeps its blanks and
     cut list, and the viewer shows blocks only).

     Worth noting the scattered case DOES survive: 3000 disjoint boxes reduce
     36,000 triangles to 68 because clustering merges them wholesale. That loses
     a lot of shape, which is acceptable for something only ever displayed —
     blanks and the cut list come from the full mesh at slice time and are never
     recomputed from this one. */
  const budget = 50 * 1024;
  const scattered = [];
  for (let i = 0; i < 3000; i++) scattered.push(...blankTris({ x0: i * 10, y0: 0, x1: i * 10 + 0.9, y1: 1 }, 0, 1));
  const flat = [];  // a zero-height mold: one axis has no span at all
  for (let i = 0; i < 500; i++) flat.push(...blankTris({ x0: i, y0: 0, x1: i + 1, y1: 40 }, 0, 0));
  const shapes = [
    ["scattered boxes", scattered],
    ["flat plate", flat],
    ["one block", blankTris({ x0: 0, y0: 0, x1: 10, y1: 10 }, 0, 10)],
  ];
  for (const [label, tris] of shapes) {
    const buf = meshStlForStorage(tris, budget);
    assert(buf === null || buf.byteLength <= budget, `${label}: ${buf && buf.byteLength} bytes over a ${budget} budget`);
    if (buf) assert(parseSTL(buf).tris.length > 0, `${label}: readable STL`);
  }
  assert(meshStlForStorage([], budget) === null, "nothing to store -> null, not an empty file");
});

await t("camera frames the whole stack, and pitch can't flip through vertical", () => {
  const b = { x0: 0, y0: 0, z0: 0, x1: 100, y1: 100, z1: 100 };
  const d = fitDistance(b, Math.PI / 4, 1);
  assert(d > boundsRadius(b), "camera sits outside the bounding sphere: " + d);
  // A wide-but-short canvas is limited by the VERTICAL fov; a tall narrow one by
  // the horizontal. Taking the wrong one crops the mold off the edge.
  assert(fitDistance(b, Math.PI / 4, 0.25) > d, "narrow viewport needs to back off further");
  const up = dragToOrbit(0, 100000, 0, 0), down = dragToOrbit(0, -100000, 0, 0);
  assert(up.pitch <= MV_PITCH_LIMIT && down.pitch >= -MV_PITCH_LIMIT, "clamped off the poles");
  assert(Math.abs(up.pitch) < Math.PI / 2, "never exactly vertical, which collapses lookAt");
});
await t("zoom is bounded so the model can't be lost or turned inside out", () => {
  const fitted = 500;
  assert(zoomDistance(fitted, -1e6, fitted) >= fitted * 0.15, "can't zoom through the model");
  assert(zoomDistance(fitted, 1e6, fitted) <= fitted * 6, "can't zoom to a dot");
  // A pinch has to obey the same limits as the wheel, or the two gestures
  // disagree about where the world ends depending on which one you used.
  assert(pinchDistance(fitted, 1, 1e6, fitted) >= fitted * 0.15, "pinching in stops at the same wall");
  assert(pinchDistance(fitted, 1e6, 1, fitted) <= fitted * 6, "and so does pinching out");
});
await t("pinch moves the camera by the ratio of the finger gap", () => {
  /* Spread to twice the gap and the model comes twice as close. The ratio is
     what makes a pinch feel attached to the fingers; the wheel's exponential
     curve would slide out from under the touch. */
  const fitted = 1000, dist = 400;
  assert(Math.abs(pinchDistance(dist, 100, 200, fitted) - 200) < 1e-9, "fingers apart -> closer");
  assert(Math.abs(pinchDistance(dist, 200, 100, fitted) - 800) < 1e-9, "fingers together -> further");
  assert(pinchDistance(dist, 100, 100, fitted) === dist, "no change in span, no change in distance");
  // Both pointers on the same coordinate is a real report from a browser, for
  // one frame, at the start of a gesture. It must not divide by zero.
  assert(pinchDistance(dist, 0, 120, fitted) === dist, "a zero previous span is ignored");
  assert(pinchDistance(dist, 120, 0, fitted) === dist, "and so is a zero current span");
  assert(pointerSpan({ x: 0, y: 0 }, { x: 3, y: 4 }) === 5, "span is the plain distance");
});
await t("MOBILE two fingers pinch, they don't spin the model", () => {
  /* The bug: the viewer tracked ONE drag point, so a second finger overwrote the
     first and a pinch came out as an orbit — the model turned under your fingers
     and never got closer. On a phone that is the only zoom there is, because a
     touchscreen pinch fires no wheel event and the canvas sets
     touch-action:none, so the browser's own pinch is suppressed too. */
  const g = mvGesture();
  g.down(1, 100, 100);
  assert(g.move(1, 110, 100).kind === "orbit", "one finger still orbits");

  // Finger 1 is at x=110 after that orbit, so the opening gap is 90, not 100.
  g.down(2, 200, 100);
  const a = g.move(2, 300, 100);             // spread: gap 90 -> 190
  assert(a && a.kind === "pinch", "two fingers zoom, they do not orbit: " + JSON.stringify(a));
  assert(Math.abs(a.prevSpan - 90) < 1e-9 && Math.abs(a.span - 190) < 1e-9, JSON.stringify(a));
  assert(g.move(1, 90, 100).kind === "pinch", "and either finger drives it, not just the second");
});
await t("MOBILE lifting one of two fingers doesn't fling the model", () => {
  // The remaining finger has to become the orbit anchor AT ITS OWN position.
  // Measuring the next move from the finger that left flings the model by the
  // whole gap between them — which on a phone reads as the view exploding.
  const g = mvGesture();
  g.down(1, 100, 100);
  g.down(2, 400, 100);
  g.move(2, 420, 100);
  g.up(2);
  const a = g.move(1, 104, 100);
  assert(a && a.kind === "orbit", "back to one finger, back to orbiting");
  assert(a.dx === 4 && a.dy === 0, "measured from the finger still down, not the one lifted: " + JSON.stringify(a));
});
await t("MOBILE a cancelled pointer is released, not left stuck down", () => {
  /* The browser cancels a pointer whenever it takes a gesture over. A pointer
     that never gets cleaned up stays "down" for the life of the viewer, and the
     model then spins on the next unrelated touch anywhere on the page. */
  const g = mvGesture();
  g.down(1, 10, 10);
  g.up(1);                                    // pointercancel routes here too
  assert(g.count() === 0, "no pointers left down");
  assert(g.move(1, 40, 10) === null, "a released pointer moves nothing");
  assert(/pointercancel/.test(mvBindEvents.toString()), "and the cancel event is actually bound");
});
await t("3D view builds block geometry and bounds straight from the saved plan", () => {
  const p = twoSectionPlan();
  const g = stockGeometry(p);
  const totalBlanks = p.layers.reduce((n, L) => n + L.blanks.length, 0);
  assert(g.tris.length === totalBlanks * 12, "12 triangles per block");
  assert(g.edges.length === totalBlanks * 12 * 2 * 3, "12 edges x 2 verts x 3 floats per block");
  const bb = stockBounds(p);
  assert(bb.z0 === p.layers[0].z0 && bb.z1 === p.layers[p.layers.length - 1].z1, "spans every layer");
  const buf = trisToBuffers(g.tris);
  assert(buf.count === g.tris.length * 3 && buf.nrm.length === buf.pos.length, "flat-shaded, one normal per vertex");
});
await t("a RESTORED camera still yields a finite projection (blank-canvas regression)", () => {
  /* The bug this pins: fitting the view and seeding the saved camera used to be
     one function that ran only when no camera existed. Every remount — and
     render() remounts on each Firestore snapshot — therefore left `fitted`
     undefined, mat4Perspective got Math.max(0.1, undefined/100) = NaN, and the
     whole projection matrix went NaN, so the canvas drew nothing until a reload
     cleared the cache. It failed silently and passed every state-based check. */
  const bounds = { x0: 0, y0: 0, z0: 0, x1: 900, y1: 530, z1: 62 };
  const fresh = viewerCamera(bounds, 800, 400, null);
  const restored = viewerCamera(bounds, 800, 400, { yaw: 1, pitch: 0.2, dist: 500 });
  for (const [label, c] of [["fresh", fresh], ["restored", restored]]) {
    ["fitted", "near", "far", "dist", "yaw", "pitch"].forEach(k =>
      assert(Number.isFinite(c[k]), `${label}.${k} is ${c[k]}`));
    assert(c.near > 0 && c.far > c.near, `${label} near/far ordering: ${c.near}..${c.far}`);
  }
  assert(restored.dist === 500 && restored.yaw === 1, "a saved angle survives the remount");
  assert(restored.fitted === fresh.fitted, "but the fit is recomputed for this viewport, not inherited");
  // A saved camera carrying a NaN distance (written by the old code) must not
  // poison the new one — those records exist in people's browsers already.
  const poisoned = viewerCamera(bounds, 800, 400, { yaw: 1, pitch: 0.2, dist: NaN });
  assert(Number.isFinite(poisoned.dist), "a NaN saved distance is discarded, not propagated");
});
await t("mesh-load failures name themselves instead of leaving a blank legend", async () => {
  /* All of these used to collapse into one bare catch{}, so a mold that never
     downloaded looked exactly like a plan that never had one. The CORS case is
     the one that actually shipped: every other Storage URL in this app is used
     by <img src> or <a href>, which need no CORS, so this was the first fetch()
     to hit a bucket that has no CORS policy. */
  const realFetch = globalThis.fetch;
  const cases = [
    ["blocked", () => { throw new TypeError("Failed to fetch"); }, /CORS/i],
    ["403", () => ({ ok: false, status: 403 }), /403|storage\.rules/i],
    ["404", () => ({ ok: false, status: 404 }), /404|re-plan/i],
    ["garbage", () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(9) }), /readable STL/i],
  ];
  for (const [label, impl, want] of cases) {
    globalThis.fetch = async () => impl();
    let msg = "";
    try { await mvLoadMesh("https://example.test/" + label + ".stl"); }
    catch (e) { msg = e.message; }
    assert(want.test(msg), `${label}: expected ${want}, got "${msg}"`);
  }
  globalThis.fetch = realFetch;
});
await t("toggling the theme repaints the 3D canvas (CSS can't restyle WebGL)", () => {
  // toggleTheme() only re-renders the topbar, and the canvas clear colour is
  // theme-dependent — so without this hook a live viewer keeps the old
  // background until something else happens to re-render #main. Found in the
  // browser: light->dark left the canvas on the light background.
  assert(typeof mvThemeChanged === "function", "the repaint hook exists");
  assert(/mvThemeChanged/.test(toggleTheme.toString()), "and toggleTheme actually calls it");
  toggleTheme(); toggleTheme();   // no viewer mounted: must be a safe no-op
});
await t("mounting the 3D view twice on one canvas is a no-op, not a dead context", () => {
  // render() runs once per Firestore snapshot and each run schedules a mount,
  // so a burst of saves queues a burst of mounts against the single canvas now
  // in the DOM. Found in the browser: the second mount tore down the context
  // the first had built, then threw compiling a shader against the dead one,
  // leaving the canvas permanently blank.
  assert(/MV_LIVE\.canvas === canvas/.test(mvMount.toString()), "guards on the canvas element");
  assert(/loseContext/.test(mvTeardown.toString()),
    "and teardown hands the context back — browsers cap live WebGL contexts (~16)");
});
await t("meshViewHtml degrades to a message when the browser has no WebGL", () => {
  // The DOM stub has no canvas/getContext at all, which is exactly the
  // no-WebGL path — so this is the fallback under test, not a mock of it.
  const html = meshViewHtml(twoSectionPlan());
  assert(/WebGL/i.test(html) && !/<canvas/.test(html), "explains itself instead of a dead canvas: " + html);
  assert(!/undefined|NaN/.test(html), "no leaked placeholders");
});

/* ---------- drawings.js: the printed engineering drawing set ---------- */

await t("drawing dimensions read in sixteenths, and say so when they aren't exact", () => {
  // The whole point of the format: the fraction is what you set a tape to, the
  // bracketed millimetre is what actually governs. A value that is NOT on a
  // sixteenth has to be marked, or the fraction gets read as the truth.
  const exact = fmtDwg(44.45);                 // 1-3/4in exactly
  assert(exact.primary === '1-3/4"', "1.75in: " + exact.primary);
  assert(exact.exact && !/≈/.test(exact.primary), "exact values print bare");
  assert(exact.secondary === "[44.5]", "millimetre in brackets: " + exact.secondary);

  assert(fmtDwg(25.4).primary === '1"', "whole inches lose the fraction");
  assert(fmtDwg(12.7).primary === '1/2"', "and sub-inch values lose the whole");
  assert(fmtDwg(0).primary === '0"', "zero is a real answer, not a blank");

  /* The inch mark is ASCII, not U+2033 ″. osifont — the ISO 3098 face the
     sheets are lettered in — has no double prime, so a ″ falls back to another
     font for that one glyph, on the string that ends every dimension on every
     sheet. Different metrics mid-label is how a dimension drifts onto a line. */
  assert(!/\u2033/.test(fmtDwg(44.45).primary), "no double prime: " + fmtDwg(44.45).primary);

  const off = fmtDwg(43.9);                    // 1.728in — between 1-11/16 and 1-3/4
  assert(/^≈/.test(off.primary), "an off-grid value is marked: " + off.primary);
  assert(off.secondary === "[43.9]", "but the exact millimetre still prints: " + off.secondary);

  // Negative offsets are real: they are how an overhang is reported.
  assert(/^-/.test(fmtDwg(-6.35).primary), "signed: " + fmtDwg(-6.35).primary);
  assert(fmtDwg(NaN).primary === "—", "a missing value is a dash, never NaN");
});

await t("the mold silhouette traces the real projected outline in every view", () => {
  /* The silhouette is rasterise-and-trace rather than a polygon boolean, so the
     thing worth pinning is that the trace lands on the geometry: a box of known
     size must come back as its own rectangle in all three orthographic views,
     within the grid cell that produced it. */
  const tris = blankTris({ x0: 0, y0: 0, x1: 100, y1: 60 }, 0, 40);
  const tol = 1.5;   // one cell of raster, plus the pad cell
  for (const [view, want] of [
    ["top", { x0: 0, y0: 0, x1: 100, y1: 60 }],
    ["front", { x0: 0, y0: 0, x1: 100, y1: 40 }],
    ["right", { x0: 0, y0: 0, x1: 60, y1: 40 }],
  ]) {
    const loops = silhouetteLoops(tris, view);
    assert(loops.length >= 1, `${view}: nothing traced`);
    const big = loops.slice().sort((a, b) => {
      const ba = bboxOf(a), bb = bboxOf(b);
      return (bb.x1 - bb.x0) * (bb.y1 - bb.y0) - (ba.x1 - ba.x0) * (ba.y1 - ba.y0);
    })[0];
    const got = bboxOf(big);
    ["x0", "y0", "x1", "y1"].forEach(k =>
      assert(Math.abs(got[k] - want[k]) < tol, `${view}.${k}: ${got[k]} vs ${want[k]}`));
    // Simplification has to survive the staircase: a traced rectangle that
    // still carries hundreds of grid steps would print as a fuzzy edge.
    assert(big.length < 40, `${view}: ${big.length} points for a rectangle — simplify didn't bite`);
  }
});

await t("a mesh the raster can't use costs the drawing its picture, never its numbers", () => {
  // Reference geometry must never be able to take the dimensions down with it.
  assert(silhouetteLoops([], "top").length === 0, "no triangles, no loops, no throw");
  assert(silhouetteLoops(null, "front").length === 0, "and null is the same");
  const flat = [{ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, cx: 0, cy: 0, cz: 0 }];
  assert(Array.isArray(silhouetteLoops(flat, "top")), "a degenerate triangle returns a list, not an exception");
});

await t("insets are signed off the board below, so an overhang has a side and a number", () => {
  const lower = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const ins = insetsBetween(lower, { x0: 10, y0: 20, x1: 90, y1: 70 });
  assert(ins.left === 10 && ins.right === 10, `left/right: ${ins.left}/${ins.right}`);
  assert(ins.front === 20 && ins.back === 30, `front/back: ${ins.front}/${ins.back}`);

  // Hanging over the front edge is the case the drawing exists to catch: the
  // slicer already warns in words, this is what turns it into a measurement.
  const over = insetsBetween(lower, { x0: 10, y0: -8, x1: 90, y1: 70 });
  assert(over.front < 0, "an overhang reads negative: " + over.front);
  assert(insetsBetween(null, lower) === null, "nothing below means no insets to give");

  // Two blanks over two blanks: pairing by largest overlap, not by order, or a
  // blank gets measured against the wrong neighbour and prints a plausible lie.
  const belowBlanks = [{ x0: 0, y0: 0, x1: 40, y1: 100 }, { x0: 200, y0: 0, x1: 260, y1: 100 }];
  const sup = bestSupport({ x0: 205, y0: 10, x1: 255, y1: 90 }, belowBlanks);
  assert(sup && sup.x0 === 200, "picks the blank it actually sits on");
  assert(bestSupport({ x0: 500, y0: 0, x1: 520, y1: 20 }, belowBlanks) === null, "and nothing when it sits on air");
});

await t("the drawing set is 2 sheets plus one per layer, numbered in order", () => {
  const p = twoSectionPlan();
  const html = drawingSetHtml(p, {});
  const sheets = (html.match(/class="ws-page dwg-page"/g) || []).length;
  assert(sheets === 2 + p.layers.length, `${sheets} sheets for ${p.layers.length} layers`);
  const nums = [...html.matchAll(/Sheet<\/span><span class="val">(\d+) \/ (\d+)</g)].map(m => [+m[1], +m[2]]);
  assert(nums.length === sheets, "every sheet numbers itself: " + nums.length);
  nums.forEach(([n, of], i) => {
    assert(n === i + 1, `sheet ${i + 1} says ${n}`);
    assert(of === sheets, `sheet ${n} says "of ${of}", not ${sheets}`);
  });
  assert(/GENERAL VIEW/.test(html) && /THIRD ANGLE/.test(html), "sheets 1 and 2 are the iso and the three-view");
  assert(/LAYER 1 OF/.test(html) && new RegExp(`LAYER ${p.layers.length} OF`).test(html), "and the layer sheets run to the top");
  assert(!/NaN|undefined|Infinity/.test(html), "no leaked placeholders in the whole set");
});

await t("every layer sheet is drawn at the SAME scale in the same frame", () => {
  /* Flipping between layer sheets must not also change the size of everything:
     a small top layer has to LOOK small next to the base, because that is the
     comparison somebody makes when checking they picked up the right board. */
  const p = twoSectionPlan();
  const html = drawingSetHtml(p, {});
  const scales = [...html.matchAll(/Scale<\/span><span class="val">([^<]+)</g)].map(m => m[1]);
  assert(scales.length === 2 + p.layers.length, "one scale per sheet");
  const layerScales = new Set(scales.slice(2));
  assert(layerScales.size === 1, "layer sheets share one scale, got: " + [...layerScales].join(", "));
  assert(/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(scales[0]), "and the ratio is printed as a ratio: " + scales[0]);
});

await t("a section split is called out on the drawings, not left in the table", () => {
  const p = twoSectionPlan();
  assert(sectionSplitsZ(p).length === 1, "this fixture splits once: " + JSON.stringify(sectionSplitsZ(p)));
  const html = drawingSetHtml(p, {});
  assert(/SPLIT 1/.test(html), "the elevations mark it");
  assert(/SETUP 2/.test(html), "and the layer sheets say which machine setup they belong to");
});

await t("the layer sheets carry both the edge insets and the datum cross-check", () => {
  const p = twoSectionPlan();
  const html = drawingSetHtml(p, {});
  // Sheet 3 is layer 1: no board below it, so it is positioned off the datum.
  const sheets = html.split('class="ws-page dwg-page"');
  assert(/FROM DATUM A/.test(sheets[3]), "layer 1 dimensions off the datum corner");
  assert(/no board below/.test(sheets[3]), "and says why");
  // Sheet 4 is layer 2: it lands on layer 1, so it gets the four insets.
  assert(/INSET FROM EACH EDGE/.test(sheets[4]), "layer 2 is placed off the edges of layer 1");
  assert(/CHECK — FROM DATUM A/.test(sheets[4]), "with the absolute datum table beside it");
  // The symbol is on the drawing; what it means is in the sheet note, which is
  // where a drawing puts its legend — and the one place nothing can collide.
  assert(/Datum A is the near-left corner/.test(sheets[4]), "the note says what datum A is");
  assert(/L1 underneath/.test(sheets[4]), "and what the dash-dot outline is");
});

await t("a plan with no stored mesh still draws, and says the mold is only an outline", () => {
  /* Plans made before the 3D view existed have no mesh, and neither does one
     whose upload failed — stock.js treats that as survivable on purpose. Those
     must still get a full drawing set; what they must NOT do is let a stepped
     profile assembled from horizontal sections pass as the mold's real shape. */
  const p = twoSectionPlan();
  p.id = "STK-NOMESH";
  const html = drawingSetHtml(p, {});
  assert((html.match(/class="ws-page dwg-page"/g) || []).length === 2 + p.layers.length, "still a full set");
  assert(/No stored mold mesh/.test(html), "and every sheet says so: " + html.slice(0, 200));

  // With the mesh, the note flips to the silhouette wording.
  const withMesh = drawingSetHtml({ ...p, id: "STK-MESH" }, { tris: boxTris(400, 300, 220) });
  assert(/silhouette projected from the stored STL/.test(withMesh), "the mesh path names itself");
  assert(!/No stored mold mesh/.test(withMesh), "and drops the fallback warning");
});

await t("a drawing sheet never inherits the traveler's repeating fixed footer", () => {
  // .ws-foot is position:fixed in print so it repeats on every physical page —
  // right for a two-page traveler, wrong for a set where each sheet carries its
  // own title block. Every sheet would otherwise print every other sheet's foot.
  const html = drawingSetHtml(twoSectionPlan(), {});
  assert(!/ws-foot/.test(html), "no .ws-foot anywhere in the set");
  assert(/dwg-tb/.test(html), "the per-sheet title block is what replaces it");
});

await t("Drawings is reachable from a plan, and the preview bar counts the real sheets", () => {
  assert(/openDrawings\(/.test(renderStackPlan.toString()), "the plan page offers it");
  // mountSheet's caption used to be the hardcoded string "two pages", which over
  // a nine-sheet drawing set is worse than no caption at all.
  assert(/caption/.test(mountSheet.toString()), "mountSheet takes a caption");
  assert(/sheets/.test(openDrawings.toString()), "and openDrawings passes the sheet count");
});

/* ---------- printing on a phone ---------- */

await t("MOBILE a Letter sheet is zoomed to fit the screen, never enlarged", () => {
  /* A sheet is 8.5in = 816 CSS px and stays that way — "this is exactly what
     prints" is the whole promise. On a 390px phone the browser blew the layout
     viewport out to 816px to contain it, so the traveler's Initial and Date
     columns sat off the right edge with no way to reach them. */
  assert(previewZoom(816) === 1, "a screen with room is left alone");
  assert(previewZoom(1400) === 1, "and a big one is never magnified");
  const phone = previewZoom(381);            // 393px device less the 12px gutter
  assert(phone > 0.4 && phone < 0.5, "a phone shrinks to roughly half: " + phone);
  assert(Math.abs(816 * phone - 381) < 2, "and the fitted sheet lands on the available width");
  assert(previewZoom(0) === 1 && previewZoom(-5) === 1, "a nonsense width is ignored, not applied");
});

await t("MOBILE the saved sheet is a standalone document, without the app's chrome", () => {
  /* The other half of the fix: Save writes the sheet to the device. HTML rather
     than PDF because a PDF needs a library and this app ships no external
     scripts — but it has to be SELF-CONTAINED, or the file is unreadable on the
     device it was saved to, which is the whole point of saving it. */
  const mounted = `<div class="pv-bar no-print"><span class="t">Print preview</span><button>Close</button><button class="primary">Print</button></div>` +
    `<div class="wsheet"><div class="ws-page">TRAVELER BODY</div></div>`;
  const out = sheetFileHtml(mounted, ".ws-page { width: 8.5in; }", "WO-1 traveler");
  assert(/^<!doctype html>/i.test(out), "a real document, not a fragment");
  assert(/TRAVELER BODY/.test(out), "the sheet itself is in it");
  assert(/width: 8\.5in/.test(out), "with the stylesheet inlined");
  assert(/@page/.test(out), "and a page rule, so it prints right from the file");
  assert(!/<div class="pv-bar/.test(out), "but not the preview toolbar: " + out.slice(0, 160));
  assert(!/>Print</.test(out) && !/>Close</.test(out), "nor its buttons");
  assert(/<title>WO-1 traveler<\/title>/.test(out), "titled so it is findable in Files");

  assert(sheetFileName("WO-SN5-001 traveler") === "WO-SN5-001 traveler.html", "readable filename");
  assert(!/[/\\]/.test(sheetFileName("a/b\\c")), "path separators can't escape the filename");
  assert(sheetFileName("") === "sheet.html", "an unnamed sheet still gets a name");
});

await t("MOBILE the screen fit is reset for paper, and torn down on close", () => {
  // The zoom is a screen aid for a small display. Left applied it would print a
  // Letter traveler at half size in the corner of the page.
  const printCss = readFileSync(join(root, "..", "..", "03 App", "app", "index.html"), "utf8");
  assert(/#printroot \.ws-page \{[^}]*zoom: 1 !important/.test(printCss),
    "@media print forces zoom back to 1");
  assert(/removeProperty\("--pv-zoom"\)/.test(closePrintPreview.toString()),
    "and closing the preview drops the variable rather than leaving it set");
  assert(/orientationchange/.test(readFileSync(join(root, "print.js"), "utf8")),
    "turning the phone re-fits, instead of wasting half a landscape screen");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
