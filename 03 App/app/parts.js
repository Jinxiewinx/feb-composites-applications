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
function stagePill(val, enumArr) {
  val = val || enumArr[0];
  return `<span class="stage ${stageClass(val, enumArr)}">${esc(val)}</span>`;
}
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
function partEngineers(p) {
  return [["moldEngineer", "ME"], ["manufacturingEngineer", "RE"]]
    .map(([key, role]) => ({ role, key, name: String(p[key] || "").trim(), email: partEngineerEmail(p, key) }))
    .filter(e => e.name && !(typeof notAPerson === "function" && notAPerson(e.name)));
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
};
const PART_SORT_LABELS = { layupDeadline: "Deadline", partName: "Part", subteam: "Subteam", layupType: "Type", cadProgress: "CAD", moldProgress: "Mold", layupProgress: "Layup" };
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
  return rows.slice().sort((a, b) => { const av = get(a), bv = get(b); return av < bv ? -mul : av > bv ? mul : 0; });
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
          ${Object.keys(PART_SORT_LABELS).map(k => `<option value="${k}" ${sortKey === k ? "selected" : ""}>Sort: ${PART_SORT_LABELS[k]}</option>`).join("")}
        </select>
        <button class="sm sortdir" title="Reverse sort order" onclick="togglePartSortDir()">${view.sortDir === "desc" ? "▼" : "▲"}</button>
      </div>
      ${view.fEng ? `<div class="pfilternote">Showing <b>${esc(view.fEng)}</b>'s parts <button class="sm" onclick="filterByEngineer('${esc(view.fEng)}')">clear</button></div>` : ""}
    </div>
    <div class="plist" role="listbox" aria-label="Parts">
      ${rows.map(p => partIndexItem(p, mixedRetro)).join("") || `<div class="pempty muted">${
        D.length ? "No parts match these filters." : "No parts yet — <b>New Part</b> to start."}</div>`}
    </div>
    <div class="keyhint no-print muted tny"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>/</kbd> search</span><span><kbd>e</kbd> edit</span><span><kbd>esc</kbd> back</span></div>
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
    <div class="card">
      <h2>Parts this season</h2>
      <div class="muted">${s.open} open · ${s.done} finished · ${s.total} tracked. Pick a part to open it.</div>
      <div class="stat-row" style="margin-top:14px">
        <div class="stat-tile"><div class="bignum">${s.open}</div><div class="stat-label">Open parts</div></div>
        <div class="stat-tile"><div class="bignum ${s.late ? "warn" : ""}">${s.late}</div><div class="stat-label">Behind deadline</div></div>
        <div class="stat-tile"><div class="bignum">${s.mine}</div><div class="stat-label">On you</div></div>
        <div class="stat-tile"><div class="bignum">${s.done}</div><div class="stat-label">Finished</div></div>
      </div>
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
      <h3>Behind deadline${late.length ? ` <span class="muted" style="text-transform:none">— ${late.length}</span>` : ""}</h3>
      ${late.length ? late.slice(0, 8).map(miniRow).join("") : '<span class="muted">Nothing overdue.</span>'}
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

/* Progress, rendered ONCE, and still rendered in edit mode — the old page drew
   it read-only in the grid and again as pills+bars below, then hid the bars the
   moment you started editing, i.e. removed the at-a-glance read exactly when
   you were changing it. Here the pill and the bar are the display and the
   select sits beside them, so the two can't drift. */
function partStageRow(p, st) {
  const v = p[st.key] || st.vals[0];
  const cls = stageClass(v, st.vals);
  return `<div class="pstage">
    <div class="ps-label">${st.label}</div>
    <div class="ps-val">${stagePill(v, st.vals)}
      ${cls === "st-na" ? "" : `<span class="ps-bar"><i class="${cls}" style="width:${stagePct(v, st.vals)}%"></i></span>`}</div>
    ${view.edit ? `<div class="ps-edit"><select onchange="updPart('${st.key}',this.value)">${
      st.vals.map(o => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>` : ""}
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
function postPartComment(id) {
  const box = document.getElementById("pcomment");
  const text = String((box && box.value) || "").trim();
  if (!text) { toast("Write a comment first.", "error"); return; }
  const p = partById(id);
  if (!p) return;
  const c = { id: "C" + Date.now(), author: signerName(), email: myEmail(), ts: new Date().toISOString(), text };
  p.commentLog = (p.commentLog || []).concat([c]);           // optimistic
  saveField("parts", p, "commentLog", arr => (arr || []).concat([c]));
  if (box) box.value = "";
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
  <section class="mddetail" aria-label="Part detail">
    <div class="toolbar no-print">
      <button class="ib mdback" onclick="clearPartSelection()">${icon("chevronLeft", 16)} All parts</button>
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

      <h3 id="pt-notes">Notes${comments.length ? ` <span class="muted" style="text-transform:none">— ${comments.length} comment${comments.length === 1 ? "" : "s"}</span>` : ""}</h3>
      <div class="pnote">
        <div class="lg-label tny">Part note <span class="muted" style="text-transform:none">— the free-text field from the tracker</span></div>
        ${E ? `<textarea onchange="updPart('comments',this.value)">${esc(p.comments)}</textarea>`
             : `<div class="notebody">${p.comments ? esc(p.comments).replace(/\n/g, "<br>") : '<span class="muted">—</span>'}</div>`}
      </div>
      ${comments.map(c => `<div class="comment">
        ${avatar(c.email || c.author, 28)}
        <div class="cbody"><div class="chead"><b>${esc(c.author || userName(c.email))}</b> · ${fmtWhen(c.ts)}</div>
        <div class="ctext">${esc(c.text).replace(/\n/g, "<br>")}</div></div>
      </div>`).join("")}
      <div class="no-print" style="margin-top:10px">
        <textarea id="pcomment" placeholder="Add a comment — it keeps your name and the time…"></textarea>
        <div style="margin-top:6px"><button class="primary" onclick="postPartComment('${esc(p.id)}')">Comment as ${esc(signerName())}</button></div>
      </div>
    </div>
  </section>`;
}

/* ---------- the tab ----------
   One markup for every width. `has-sel` is the only state the ≤900 collapse
   needs: with it the index hides and the detail is the page; without it the
   detail hides and the index is the page. Above 900 both are always visible. */
function renderParts() {
  const sel = selectedPart();
  return `<div class="mdsplit ${sel ? "has-sel" : ""}">
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
