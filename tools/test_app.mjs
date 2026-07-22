#!/usr/bin/env node
/* Functional tests for the FEB composites app (03 Work Orders/app/*.js).
   Loads the classic-script app files into a DOM stub with a fake window.fb, so
   app logic across all tabs is tested without a browser or Firebase. Rules
   enforcement is tested separately against the emulator (test_wo_rules.mjs).
   Run from SN6 Resources/:  node tools/test_app.mjs */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "03 Work Orders", "app");
const woSeed = JSON.parse(readFileSync(join(root, "sn5-work-orders.json"), "utf8"));

/* ---------- DOM + browser stubs ---------- */
let lastToast = "";
const els = {};
function el(id) {
  if (!els[id]) els[id] = {
    id, innerHTML: "", value: "", tagName: "INPUT", files: [],
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
  async allocId(coll) { counters[coll] = (counters[coll] || 0) + 1; const id = `${({workOrders:"WO",parts:"P",projects:"PROJ",budget:"BUY"})[coll]}-SN6-${String(counters[coll]).padStart(3,"0")}`; calls.push(["allocId", coll, id]); return id; },
  async importMany(coll, arr) { calls.push(["importMany", coll, arr.length]); },
  async rosterAll() { return [{ email: "a@b.c", name: "A", role: "member" }]; },
  async rosterSet() { calls.push(["rosterSet"]); },
  async rosterDelete() { calls.push(["rosterDelete"]); },
  async notify(to, type, text, link) { calls.push(["notify", to, type]); },
  async markNotifRead(id) { calls.push(["markNotifRead", id]); },
  async signOut() {}, async refreshRoster() {},
};

/* ---------- load the app (classic scripts, concatenated, one indirect eval) */
const FILES = ["core.js", "workorders.js", "parts.js", "projects.js", "timeline.js", "budget.js", "dashboard.js", "documents.js", "calendar.js", "people.js", "reports.js", "print.js"];
let src = FILES.map(f => readFileSync(join(root, f), "utf8")).join("\n;\n");
src = src.replace(/"use strict";\n/g, "");
// core's top-level lexical bindings → implicit globals so tests can read them.
src = src.replace(/^let (DB|view|rosterCache|pendingRender) = /gm, "$1 = ");
// Same for the const tables the tests assert against — `const` stays lexical
// inside the eval, so it would otherwise be invisible here.
src = src.replace(/^const (STD_STEPS|WO_STATUSES|PROCESSES|BLANK_ROWS|BLANK_FORM_ROWS) = /gm, "$1 = ");
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
await t("retro WO exempt from blockers, no buy-off button", () => { const r = DB.workOrders.find(w => w.retro); view = { ...view, tab: "workorders", mode: "detail", id: r.id, edit: false }; render(); assert(!main.innerHTML.includes("buy off as")); assert(blockerOpenBefore(r, r.steps.length) === null); });
await t("reset steps lead-only + counts buy-offs", async () => { fb.roster = { name: "M", role: "member" }; const wo = woById(view.id); lastToast = ""; resetSteps(wo); assert(lastToast.includes("lead-only")); fb.roster = { name: "Simon", role: "lead" }; });

console.log("parts:");
await t("newPart creates with three stages", async () => { setTab("parts"); calls.length = 0; await newPart(); const p = partById(view.id); assert(p.cadProgress === "Not Started" && p.moldProgress === "Not Started" && p.layupProgress === "Not Started"); assert(calls.some(c => c[0] === "save" && c[1] === "parts")); });
await t("stage pills colored by progress", () => {
  DB.parts = [{ id: "P-SN6-009", partName: "STG", cadProgress: "Mold CAD/CAM Done", moldProgress: "N/A (Flat)", layupProgress: "Not Started" }];
  view = { ...view, tab: "parts", mode: "list", q: "", fSub: "" }; render();
  assert(main.innerHTML.includes("stage st-done"), "CAD done → st-done");
  assert(main.innerHTML.includes("stage st-na"), "N/A mold → st-na");
  assert(main.innerHTML.includes("stage st-0"), "layup not started → st-0");
});
await t("partDone true only when layup complete/polished", () => { assert(!partDone({ layupProgress: "In Layup" })); assert(partDone({ layupProgress: "Polished" })); assert(partDone({ layupProgress: "Layup Complete" })); });
await t("part field edit saves only that field", () => { view = { ...view, tab: "parts", mode: "detail", id: "P-SN6-009", edit: true }; calls.length = 0; updPart("subteam", "AERO"); assert(partById("P-SN6-009").subteam === "AERO"); assert(calls.some(c => c[0] === "save" && c[1] === "parts" && c[3] === "subteam")); });

console.log("projects (modal, board, comments):");
// give the picker some real users + parts to choose from
DB.users = [{ email: "simon@berkeley.edu", name: "Simon Starbuck", role: "lead" }, { email: "nick@berkeley.edu", name: "Nick Jepsen", role: "member" }];
DB.parts = [{ id: "P-SN6-010", partName: "NOSECONE" }];
await t("create modal → submit builds a real project", async () => {
  setTab("projects");
  openNewProject();
  assert(document.getElementById("modal").innerHTML.includes("New project"), "modal open");
  assert(pickerValues("pa").includes("simon@berkeley.edu"), "creator preselected as assignee");
  document.getElementById("np-title").value = "Grounding fix";
  document.getElementById("np-status").value = "Active";
  document.getElementById("np-priority").value = "High";
  document.getElementById("np-due").value = "2026-09-01";
  pickerToggle("pa", "nick@berkeley.edu"); // add Nick
  pickerToggle("pp", "P-SN6-010");         // relate a part
  document.getElementById("np-desc").value = "fix the diffuser ground";
  calls.length = 0;
  await submitNewProject();
  const p = projById(view.id);
  assert(p.title === "Grounding fix" && p.status === "Active" && p.priority === "High" && p.dueDate === "2026-09-01");
  assert(p.assignees.includes("simon@berkeley.edu") && p.assignees.includes("nick@berkeley.edu"), "assignees");
  assert(p.watchers.includes("simon@berkeley.edu"), "creator watches");
  assert(p.relatedParts.includes("P-SN6-010"), "related part");
  assert(view.mode === "detail", "opens the project page");
  assert(document.getElementById("modal").innerHTML === "", "modal closed");
});
await t("modal requires a title", async () => {
  openNewProject(); document.getElementById("np-title").value = "  "; lastToast = "";
  await submitNewProject(); assert(lastToast.includes("name"), lastToast); closeModal();
});
await t("board drag moves status (field-scoped write)", () => {
  const id = view.id; view = { ...view, mode: "list", projView: "board" }; render();
  assert(main.innerHTML.includes('class="board"'), "board renders");
  projDragStart(id); calls.length = 0; projDrop("Done", { classList: { remove() {} } });
  assert(projById(id).status === "Done");
  assert(calls.some(c => c[0] === "save" && c[1] === "projects" && c[3] === "status"), "status field write: " + JSON.stringify(calls));
});
await t("rich-text comment posts via appendTo, sanitized", () => {
  const id = view.id; view = { ...view, mode: "detail", id, edit: false }; render();
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
await t("sanitizeHtml FAILS CLOSED when DOMPurify absent (escapes, no HTML)", () => {
  const saved = window.DOMPurify; window.DOMPurify = undefined;
  const clean = sanitizeHtml("<b>hi</b><script>alert(1)</script>");
  assert(!/<b>/.test(clean) && !/<script/i.test(clean), "must not emit HTML: " + clean);
  assert(clean.includes("&lt;b&gt;"), "escaped, not stripped: " + clean);
  window.DOMPurify = saved;
});
await t("saveProjectEdits writes each field scoped, not whole-doc", () => {
  const id = view.id; view = { ...view, tab: "projects", mode: "detail", id, edit: true };
  pickerInit("ea", assigneeItems(), projById(id).assignees || []);
  pickerInit("ep", partItems(), projById(id).relatedParts || []);
  render();
  el("ep-title").value = "Renamed"; el("ep-status").value = "Blocked"; el("ep-priority").value = "Low";
  el("ep-due").value = "2026-10-01"; el("ep-desc").value = "d";
  calls.length = 0; saveProjectEdits();
  assert(projById(id).title === "Renamed" && projById(id).status === "Blocked");
  const saved = calls.filter(c => c[0] === "save" && c[1] === "projects");
  assert(saved.length >= 6 && saved.every(c => c[3]), "every write must be field-scoped: " + JSON.stringify(saved));
});

console.log("timeline:");
await t("newWeek creates W01 with station fields", () => { setTab("timeline"); calls.length = 0; newWeek(); assert(DB.schedule.length === 1); const w = DB.schedule[0]; assert(w.id === "W01" && "mold1" in w && "waterjet" in w && "notes" in w); });
await t("assignStation writes just that station field", () => { const w = DB.schedule[0]; DB.parts.push({ id: "P-SN6-050", partName: "TESTPART" }); calls.length = 0; assignStation(w.id, "mold1", "P-SN6-050"); assert(w.mold1 === "P-SN6-050"); assert(calls.some(c => c[0] === "save" && c[1] === "schedule" && c[3] === "mold1")); });
await t("cellView links known part, shows text otherwise", () => { assert(cellView("P-SN6-050").includes("chip") && cellView("P-SN6-050").includes("TESTPART")); assert(cellView("RANDOM NAME") === "RANDOM NAME"); });
await t("undated retro weeks sort BELOW dated weeks", () => {
  DB.schedule = [{ id: "W00", weekOf: "", retro: true, notes: "RETRO WK" }, { id: "S1", weekOf: "2026-08-25", notes: "DATED WK" }];
  view = { ...view, tab: "timeline", edit: false }; render();
  const html = main.innerHTML;
  assert(html.indexOf("DATED WK") < html.indexOf("RETRO WK"), "dated week must render above the undated retro week");
  assert(html.includes("sort to the bottom"), "note must match the actual sort direction");
});

console.log("budget:");
await t("newBuy defaults purchaser to me", async () => { setTab("budget"); await newBuy(); assert(buyById(view.id).purchaser === "Simon" && buyById(view.id).status === "Submitted"); });
await t("num parses money strings", () => { assert(num("$41.68") === 41.68 && num("") === 0 && num("1,200") === 1200); });
await t("list totals season + open sums", () => { view = { ...view, tab: "budget", mode: "list" }; DB.budget = [{ id: "B1", cost: "100", status: "Reimbursed" }, { id: "B2", cost: "50", status: "Ordered" }]; render(); assert(main.innerHTML.includes("$150.00")); assert(main.innerHTML.includes("1 open ($50.00)")); });

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

console.log("bug fixes:");
await t("picker starts collapsed, opens on demand", () => {
  pickerInit("tt", [{ value: "a", label: "Apple" }], []);
  assert(!pickerField("tt").includes('class="opts"'), "collapsed: no options list");
  pickerOpen("tt");
  assert(pickerField("tt").includes('class="opts"'), "open: shows options");
});
await t("sidebar brand links home", () => { signInAsLead(); render(); assert(sidebar.innerHTML.includes("setTab('dashboard')")); });
await t("parts layup stack mirrors to linked work order (transaction-safe)", () => {
  DB.parts = [{ id: "P-1", partName: "NOSECONE", workOrderId: "WO-1", layupStack: [] }];
  DB.workOrders = [{ id: "WO-1", partName: "NOSECONE", partId: "P-1", layupStack: [] }];
  calls.length = 0;
  addPly("parts", "P-1"); // prompt stub → "stub"
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
  assert(topbar.innerHTML.includes("🔔") && topbar.innerHTML.includes('class="badge">1'), "one unread badge");
});
await t("openNotifs + gotoNotif marks read + navigates", () => {
  DB.notifications = [{ id: "N1", to: "simon@berkeley.edu", type: "assigned", text: "assigned you", read: false, link: { tab: "projects", id: "PROJ-1" } }];
  openNotifs(); assert(document.getElementById("modal").innerHTML.includes("assigned you"));
  calls.length = 0; gotoNotif("N1");
  assert(calls.some(c => c[0] === "markNotifRead" && c[1] === "N1"));
  assert(view.tab === "projects" && view.id === "PROJ-1");
});

console.log("calendar / people / reports:");
await t("calendar buckets items into the right month", () => {
  const iso = today().slice(0, 7) + "-15";
  DB.parts = [{ id: "P-C", partName: "CALPART", layupDeadline: iso, layupProgress: "Not Started" }];
  DB.projects = []; DB.workOrders = []; DB.schedule = [];
  view = { ...view, tab: "calendar", calMonth: today().slice(0, 7) };
  render();
  assert(main.innerHTML.includes("CALPART"), "part deadline shows on calendar");
  assert(main.innerHTML.includes("table") && main.innerHTML.includes("Sun"), "month grid");
});
await t("people shows a member's live assignments", () => {
  DB.users = [{ email: "nick@b.edu", name: "Nick Jepsen", role: "member" }];
  DB.parts = [{ id: "P-N", partName: "WING", moldEngineer: "Nick", layupProgress: "In Layup" }];
  DB.projects = []; DB.workOrders = [];
  view = { ...view, tab: "people", q: "" }; render();
  assert(main.innerHTML.includes("Nick Jepsen") && main.innerHTML.includes("WING"), "shows Nick + his part");
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

console.log("printed traveler:");
await t("sheet renders every section for a real WO", () => {
  const wo = woSeed.find(w => (w.steps || []).length >= 8);
  const h = woSheetHtml(wo);
  ["Part &amp; assignment", "Layup stack", "Steps &amp; buy-offs", "Bill of materials",
   "Quality checks", "Event log", "Release sign-off"].forEach(s =>
    assert(h.includes(s), "missing section: " + s));
  assert(h.includes(wo.id), "WO id must appear on the sheet");
});
await t("every list leaves blank rows to write in", () => {
  const wo = woSeed.find(w => (w.steps || []).length >= 8);
  const h = woSheetHtml(wo);
  const blanks = (h.match(/<tr class="blank">/g) || []).length;
  const want = BLANK_ROWS.steps + BLANK_ROWS.stack + BLANK_ROWS.bom + BLANK_ROWS.quality + BLANK_ROWS.events;
  assert(blanks === want, `expected ${want} blank rows, got ${blanks}`);
});
await t("blocker steps are flagged without relying on colour", () => {
  const wo = woSeed.find(w => (w.steps || []).some(isBlocker));
  const h = woSheetHtml(wo);
  assert(h.includes('<tr class="blk">'), "blocker row needs the blk class");
  assert(h.includes("Blocker — no sign-off, no moving on"), "blocker must be spelled out in text");
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
  const blanks = (h.match(/<tr class="blank">/g) || []).length;
  assert(blanks > BLANK_ROWS.stack + BLANK_ROWS.bom, "blank forms need more ruling than a filled one");
});
await t("Print button opens the traveler, not window.print()", () => {
  onFbData("workOrders", woSeed.slice());
  const r = DB.workOrders.find(w => w.retro);
  view = { ...view, tab: "workorders", mode: "detail", id: r.id, edit: false }; render();
  assert(main.innerHTML.includes("openPrintPreview"), "detail toolbar should preview the sheet");
  assert(!main.innerHTML.includes('onclick="window.print()"'), "raw window.print() should be gone");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
