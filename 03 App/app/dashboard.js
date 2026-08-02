"use strict";
/* dashboard.js — the Dashboard (home) tab.
   Read-only. Pulls deadlines and assignments out of the other tabs so the
   first thing you see is "what's due and what's on me", not an empty list you
   have to go dig through six tabs to assemble. Everything is a light-link. */

// Who to show in a "Who" column. Ticket assignees are stored as emails, so a
// raw join printed "simon@berkeley.edu / nico@berkeley.edu" right beside a Part
// row reading "Justin" — userName() is what every other surface already uses.
// The SN5 import also left literal stage values ("N/A (Flat)") in 7 parts'
// moldEngineer cells; those are not people and shouldn't read as one.
function notAPerson(v) { return !v || /^n\/?a\b/i.test(String(v).trim()); }
function whoLabel(vals) {
  return (Array.isArray(vals) ? vals : [vals])
    .filter(v => !notAPerson(v))
    .map(v => (String(v).includes("@") ? userName(v) : v))
    .join(" / ");
}

// Normalize every deadline-bearing record into one shape the dashboard sorts.
function deadlineItems() {
  const items = [];
  DB.parts.forEach(p => items.push({
    coll: "parts", id: p.id, kind: "Part", label: p.partName || p.id,
    who: whoLabel([p.moldEngineer, p.manufacturingEngineer]),
    date: p.layupDeadline, done: partDone(p),
    mine: isMine([p.moldEngineer, p.manufacturingEngineer]),
  }));
  DB.projects.forEach(p => items.push({
    // projStatus()/ticketKind() migrate the old 4-value status and default an
    // absent kind, same as everywhere else a ticket is read — going around
    // them here would show a stale "Backlog" or the wrong kind on this list.
    // This list is peer to "Part"/"WO" tags, so a non-issue ticket reads as the
    // generic "Ticket" here — Issues still stand out as "Issue" since that
    // visibility is the whole point of the kind. Inside the Tickets tab itself
    // (board/table/detail), keep showing "Project"/"Issue" — that distinction
    // is what those views are for.
    coll: "projects", id: p.id,
    // A sub-ticket says so. Everywhere else a ticket appears it is nested under
    // its parent, which supplies the context; these dashboard lists are flat,
    // so "Machine the plug" arrived with nothing saying what it belonged to.
    kind: isIssue(p) ? "Issue" : (p.parentId ? "Sub-ticket" : "Ticket"),
    label: p.title || p.id,
    parent: parentOf(p),
    who: whoLabel(p.assignees || []),
    date: p.dueDate, done: projStatus(p) === "Done",
    mine: isMine(p.assignees || []),
  }));
  DB.workOrders.forEach(w => items.push({
    coll: "workOrders", id: w.id, kind: "WO", label: w.partName || w.id,
    who: whoLabel([w.moldEngineer, w.manufacturingEngineer]),
    date: w.dueDate, done: w.status === "Complete",
    mine: isMine([w.moldEngineer, w.manufacturingEngineer]),
  }));
  return items;
}

/* ---------- one row per physical thing ----------
   A part and its work order are the same object seen twice: the part is the
   spec, the work order is the traveler. deadlineItems() emits both, so the
   undertray arrived as "PART UT DIFFUSER" and "WO UT DIFFUSER" — two rows, two
   owners, two dates, counted twice in every total on this page.

   On the SN5 data that is not a rounding error. 25 parts carry a layup
   deadline and 26 work orders carry a due date: 51 dated records describing
   29 physical objects. 22 parts have exactly one same-named work order and no
   name is ambiguous. So "Behind schedule" was overstating by roughly 40%, in
   the second-largest type on the landing page.

   THE WORK ORDER WINS, for three reasons in order: it is where the work is
   (steps, buy-offs, the blocker, the cure), its dueDate is the manufacturing
   commitment rather than the planning date, and it is the record you actually
   want to open. The EARLIER of the two dates is shown, so merging can never
   under-report lateness, and both owners are kept because the mold engineer
   and the manufacturing engineer are often different people and dropping one
   loses whoever is actually late.

   Pairing goes through linkedCounterpart() (core.js) rather than a second rule
   written here: it already tries the explicit id fields and falls back to a
   case-insensitive partName match that returns a counterpart ONLY when exactly
   one matches. Both explicit fields are empty on all 59 SN5 records, so the
   fallback is the path that runs — and an ambiguous name yields null, which
   leaves both rows standing. Guessing a merge is worse than showing two rows,
   because a wrong merge silently deletes somebody's deadline.

   A part with NO work order is never merged away. That is not noise: work
   happening with no traveler is PP-09, and it is worth seeing. */
function mergedDeadlineItems() {
  const items = deadlineItems();
  const wos = items.filter(i => i.coll === "workOrders");
  const byWoId = new Map(wos.map(i => [i.id, i]));
  /* Identity, not coll+id. A merged row can ADOPT the part's coll and id (see
     below), and a set keyed on those would then match the survivor and filter
     it out along with the row it absorbed — silently dropping the work
     entirely. The object reference cannot be confused that way. */
  const absorbed = new Set();
  /* Snapshot the part rows BEFORE the loop. The merge can rewrite a surviving
     row's coll and id to the part's (below), and iterating the live array meant
     that rewritten row then matched the "is a part" guard on a later turn,
     looked itself up, found itself in byWoId, and absorbed itself — leaving
     nothing. Only shows up when the work order is Complete, which is every work
     order in the SN5 archive. */
  const partItems = items.filter(i => i.coll === "parts");
  partItems.forEach(it => {
    const part = recById("parts", it.id);
    const wo = part && typeof linkedCounterpart === "function" ? linkedCounterpart("parts", part) : null;
    const row = wo && byWoId.get(wo.id);
    if (!row || row === it) return;         // no match, ambiguous name, or itself
    absorbed.add(it);
    // Earliest date wins, so a merge can only ever report MORE urgency.
    if (it.date && (!row.date || it.date < row.date)) row.date = it.date;
    const who = [row.who, it.who].filter(Boolean).join(" / ");
    row.who = [...new Set(who.split(" / ").filter(Boolean))].join(" / ");
    row.mine = row.mine || it.mine;
    row.partId = it.id;                     // so the row can still link to the part
    /* The work order usually wins, but not when it is closed and the part is
       not: a Complete traveler beside a part still in layup means the work that
       REMAINS is the part's, so that is the record worth opening. Every SN5
       work order is Complete, so without this the whole archive links you to
       finished paperwork.
       Read before the write below — row.done is about to become false, and
       testing it afterwards is how this silently did nothing the first time. */
    if (row.done && !it.done) { row.coll = "parts"; row.id = it.id; row.kind = it.kind; row.label = it.label; }
    row.done = row.done && it.done;         // not finished until both are
  });
  return items.filter(i => !absorbed.has(i));
}

/* ---------- what is stopping work ----------
   A work-order blocker that nobody sees until they open the work order is a
   gate, not a signal — it cannot warn a Monday meeting. The scan already
   existed in reports.js, on the wrong page; this is the same one, narrowed to
   blockers that are actually in the way (nothing later has been signed past
   them) rather than every unsigned blocker on the sheet.

   Retro records return nothing, as everywhere else: a historical record
   documents, it does not enforce. That does mean this is empty on the SN5
   archive — which is exactly why it is a conditional section under a tile that
   can honestly read 0, rather than the hero of the page. */
function blockedNow() {
  const out = [];
  (DB.workOrders || []).forEach(w => {
    if (w.retro || w.status === "Complete") return;
    const steps = w.steps || [];
    const next = steps.findIndex(s => typeof stepState === "function" && stepState(s) !== "done" && stepState(s) !== "failed");
    if (next < 0) return;
    steps.forEach((s, i) => {
      if (i > next) return;
      if (typeof isBlocker !== "function" || !isBlocker(s) || (typeof isSigned === "function" && isSigned(s))) return;
      out.push({ wo: w, step: s, i });
    });
  });
  return out;
}
/* Cure holds, as a CLOCK TIME and never a countdown.
   syncHoldTick() arms a 60-second setInterval whenever it finds `#main .step
   .gate`, and render() rebuilds #main wholesale — so a live countdown here
   would tear the landing page down under your thumb every minute, losing scroll
   and any expanded list. An absolute "ready 14:20" never goes stale, needs no
   timer, and is what you actually set a phone alarm from. The live countdown
   stays inside the work order, where the interval was designed to run. */
function curingNow() {
  const out = [];
  (DB.workOrders || []).forEach(w => {
    if (w.retro) return;
    (w.steps || []).forEach((s, i) => {
      const h = typeof holdState === "function" ? holdState(w, i) : null;
      if (!h || h.ready || h.overridden) return;
      out.push({ wo: w, step: s, hold: h });
    });
  });
  return out.sort((a, b) => (a.hold.msLeft || 0) - (b.hold.msLeft || 0));
}

function itemRow(it) {
  const dd = daysUntil(it.date);
  // Each branch supplies exactly one closing paren — the old version baked a
  // ")" into the future-date branch AND appended a trailing one whenever
  // dd >= 0, double-closing it ("(3d))"), while the late branch got none at all.
  const paren = dd < 0 ? Math.abs(dd) + "d late" : dd === 0 ? "today" : dd + "d";
  const when = it.date ? esc(it.date) + (dd != null ? ` <span class="muted">(${paren})</span>` : "") : '<span class="muted">no date</span>';
  return `<tr>
    <td><span class="kind">${it.kind}</span> ${chip(it.coll, it.id, it.label)}${parentLine(it.parent)}</td>
    <td class="tny">${esc(it.who || "—")}</td>
    <td class="${dd != null && dd < 0 ? "warn" : ""}">${when}</td>
  </tr>`;
}
function itemTable(list, emptyMsg) {
  if (!list.length) return `<p class="muted">${emptyMsg}</p>`;
  return `<table class="list dash"><tr><th>Item</th><th>Who</th><th>Deadline</th></tr>${list.map(itemRow).join("")}</table>`;
}

/* ---------- one list, grouped ----------
   The page used to draw deadlineItems() three times — "Your open items",
   "Behind schedule", "Upcoming 14 days" — with the same three columns and
   filters that overlap by construction. Your own late part appeared in two of
   them; if it was also due this week, three. Reading the page meant diffing
   three tables to work out they were the same two rows.

   One list instead, bucketed FIRST-MATCH-WINS so an item appears exactly once,
   and ordered by what you would act on first. */
const DASH_BUCKETS = [
  { id: "late", label: "Late", test: (dd) => dd != null && dd < 0 },
  { id: "week", label: "This week", test: (dd) => dd != null && dd >= 0 && dd <= 7 },
  { id: "soon", label: "Next two weeks", test: (dd) => dd != null && dd > 7 && dd <= 14 },
  { id: "later", label: "Later", test: (dd) => dd != null && dd > 14 },
  { id: "nodate", label: "No date", test: (dd) => dd == null },
];
function bucketOf(it) {
  const dd = daysUntil(it.date);
  return (DASH_BUCKETS.find(b => b.test(dd)) || DASH_BUCKETS[DASH_BUCKETS.length - 1]).id;
}
const KIND_RANK = { WO: 0, Part: 1, Issue: 2, "Sub-ticket": 3, Ticket: 4 };
function dashSort(a, b) {
  return (a.date || "9999").localeCompare(b.date || "9999")
    || (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9)
    || String(a.label).localeCompare(String(b.label));
}
/* The count is the biggest type in the group, and it is a real control: it
   scrolls nothing, it is the heading. `.bignum` at its published 32px, which
   the page never used because .stat-tile clamps it to 22. */
function groupHead(label, n, cls) {
  return `<div class="dgrouphd">
    <span class="bignum ${cls || ""}">${n}</span>
    <span class="dg-label">${esc(label)}</span>
  </div>`;
}


/* ---------- the page ----------
   ORDER IS THE ARGUMENT HERE. Two things decided it.

   Nothing that renders empty on the team's own archive may sit above the fold.
   All 26 seeded work orders are retro and all 11 seeded weeks are undated, so
   "what is blocked", "what is curing" and "what is booked this week" are all
   blank until a live SN6 season starts. Each of them is therefore a CONDITIONAL
   section, and the always-populated things — a count, and the list — carry the
   top of the page. A tile can honestly read 0; a 250px empty section at the top
   of a landing page just reads as a broken app.

   And the fold is 683px on a phone once the topbar and the safe areas are paid
   for, which is about five stacked rows. So the phone gets the two numbers, what
   is stopping work, and the start of the list; everything else is below it or
   behind a media query. */
function renderDashboard() {
  const items = mergedDeadlineItems();
  const open = items.filter(i => !i.done);
  const mine = open.filter(i => i.mine).sort(dashSort);
  const team = open.filter(i => !i.mine).sort(dashSort);
  const late = open.filter(i => { const d = daysUntil(i.date); return d != null && d < 0; });

  const blocked = blockedNow();
  const curing = curingNow();
  const watched = (DB.projects || []).filter(p => typeof projUnread === "function" && projUnread(p))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  const openOrders = DB.budget.filter(b => b.status !== "Reimbursed");
  const openSum = openOrders.reduce((s, b) => s + num(b.cost), 0);

  /* Nothing assigned to you falls through to the team's work rather than an
     empty card. A member with a quiet week is the common case, and "Nothing is
     assigned to you" above three more empty sections is a page that looks
     broken — the answer to "what should I do" is then the team's list, which is
     what a person with nothing on them actually wants to see. */
  const showTeam = view.dashTeam == null ? !mine.length : !!view.dashTeam;
  const list = showTeam ? mine.concat(team).sort(dashSort) : mine;
  const teamLate = team.filter(i => { const d = daysUntil(i.date); return d != null && d < 0; }).length;

  return `
  ${dashTiles(mine.length, blocked.length)}
  ${blocked.length ? dashBlocked(blocked) : ""}
  ${curing.length ? dashCuring(curing) : ""}
  ${watched.length ? dashWatched(watched) : ""}
  ${dashWeek()}
  <div class="card dashlist">
    <h2>${showTeam ? "Everything open" : "Your work"}</h2>
    ${showTeam && !mine.length ? `<p class="muted tny">Nothing is assigned to you, so this is the whole team's.</p>` : ""}
    ${list.length ? dashGroups(list) : `<p class="muted">Nothing open. Either the season hasn't started or you're all caught up.</p>`}
    ${team.length ? `<button class="dg-more" onclick="view={...view,dashTeam:${showTeam ? "false" : "true"}};render()">${
      showTeam ? (mine.length ? "Show only my work" : "Hide the team's work")
               : `Everything else — ${team.length} open, ${teamLate} late`
    }</button>` : ""}
  </div>
  ${dashParts()}
  <div class="dashfoot">
    <button class="df-cell" onclick="setTab('budget')">
      <span class="df-n">$${openSum.toFixed(0)}</span>
      <span class="df-l">unreimbursed · ${openOrders.length} open purchase${openOrders.length === 1 ? "" : "s"}</span>
    </button>
    <button class="df-cell" onclick="setTab('parts')">
      <span class="df-n">${DB.parts.filter(partDone).length}<span class="df-of">/${DB.parts.length}</span></span>
      <span class="df-l">parts laid up</span>
    </button>
    <button class="df-cell" onclick="setTab('workorders')">
      <span class="df-n">${late.length}</span>
      <span class="df-l">past deadline</span>
    </button>
  </div>`;
}

/* Two numbers, as real buttons in real cards.
   They were .stat-tile, which clamps .bignum from its published 32px down to
   22 and sits on --surface-2 at about 3% contrast against the canvas — so the
   page opened with three barely-there boxes. .card gives the shadow, the line
   and the full 32px; <button> gives the 40px touch floor, keyboard focus, and
   membership of the tap-target assertion that .stat-tile never had.

   "Season spend" is gone. A running total with no cap, no target and no trend
   prompts no decision: nobody does anything different at $4,400 than at $4,312.
   Blocked replaces it — the freshest data in the app, signed in the shop. */
function dashTiles(nMine, nBlocked) {
  return `<div class="stat-row dashtiles">
    <button class="card" onclick="document.getElementById('dash-list').scrollIntoView({block:'start'})">
      <span class="bignum">${nMine}</span>
      <span class="stat-label">Assigned to you</span>
    </button>
    <button class="card" onclick="${nBlocked ? "document.getElementById('dash-blocked').scrollIntoView({block:'start'})" : "setTab('workorders')"}">
      <span class="bignum ${nBlocked ? "bad" : ""}">${nBlocked}</span>
      <span class="stat-label">Blocked</span>
    </button>
  </div>`;
}

/* .gate.blocked, the app's existing "you cannot proceed" bar. Deliberately NOT
   `.step .gate` — that selector is what syncHoldTick() watches to arm a
   60-second re-render, and arming it on the landing page would rebuild #main
   under your thumb every minute. */
function dashBlocked(blocked) {
  return `<div class="card dashblocked" id="dash-blocked">
    <h3>Blocked <span class="muted nocaps">— nothing moves on these until someone signs</span></h3>
    ${blocked.map(b => `<p class="gate blocked"><span class="gi">✕</span><span>
      ${chip("workOrders", b.wo.id, b.wo.partName || b.wo.id)}
      <b>${esc(stripCS(b.step.title))}</b> is unsigned.
      <span class="muted">Step ${b.step.seq} of ${esc(b.wo.id)}${b.wo.moldEngineer ? " · " + esc(b.wo.moldEngineer) : ""}</span>
    </span></p>`).join("")}
  </div>`;
}

// A clock time, never a countdown — see curingNow().
function dashCuring(curing) {
  return `<div class="card dashcuring">
    <h3>Curing <span class="muted nocaps">— don't drive out for these before they're ready</span></h3>
    ${curing.map(c => `<div class="curerow">
      ${chip("workOrders", c.wo.id, c.wo.partName || c.wo.id)}
      <span class="cure-at">ready ${esc(c.hold.readyAt)}</span>
      <span class="tny muted">${c.hold.resin ? esc(c.hold.resin.label) : "resin not recorded"}${
        typeof holdIsCold === "function" && holdIsCold(c.hold) ? " · shop is cold, it will run long" : ""}</span>
    </div>`).join("")}
  </div>`;
}

function dashWatched(watched) {
  return `<div class="card dashwatched">
    <h3><span class="unread-dot"></span> New activity <span class="muted nocaps">— tickets you watch</span></h3>
    <table class="list dash"><tr><th>Ticket</th><th>Status</th><th>Last activity</th></tr>
      ${watched.map(p => `<tr><td><span class="kind">${isIssue(p) ? "Issue" : "Ticket"}</span> ${chip("projects", p.id, p.title || p.id)}${parentLine(parentOf(p))}</td>
        <td><span class="status ${projStatusClass(projStatus(p))}"><span class="dot"></span>${esc(projStatus(p))}</span></td>
        <td class="tny">${fmtWhen(p.updatedAt)} by ${esc(p.updatedBy || "?")}</td></tr>`).join("")}
    </table>
  </div>`;
}

/* This week at RFS. The Monday-meeting artifact: seven stations, what is booked
   in each. Renders only when a dated week contains today, so it is never an
   empty box — all 11 archive weeks are undated, and a hero that is blank on the
   team's own data is the anti-pattern this page is being rebuilt to remove.
   On a phone the grid collapses to the booked stations only (CSS), because
   seven rows of mostly "open" is six screens of nothing. */
function dashWeek() {
  if (typeof weekPlanWeeks !== "function" || typeof STATIONS === "undefined") return "";
  const week = weekPlanWeeks().find(w => weekContains(w, today()));
  if (!week) return "";
  const booked = STATIONS.filter(([k]) => String(week[k] || "").trim());
  // Seven rows of the word "open" is not a schedule, it is an empty grid with a
  // heading. When nothing is booked the honest render is one line that says so
  // and offers the fix.
  if (!booked.length) {
    return `<div class="card dashweek">
      <h3>This week at RFS <span class="muted nocaps">— week of ${esc(week.weekOf)}</span></h3>
      <button class="dg-more" onclick="setTab('timeline')">Nothing booked yet — open the schedule</button>
    </div>`;
  }
  return `<div class="card dashweek">
    <h3>This week at RFS <span class="muted nocaps">— week of ${esc(week.weekOf)} · ${booked.length} of ${STATIONS.length} stations booked</span></h3>
    <div class="stationgrid">
      ${STATIONS.map(([k, label]) => {
        const v = String(week[k] || "").trim();
        const part = v ? recById("parts", v) : null;
        return `<div class="stn ${v ? "on" : "off"}">
          <span class="stn-l">${esc(label)}</span>
          <span class="stn-v">${v ? (part ? chip("parts", part.id, part.partName || part.id) : esc(v)) : '<span class="muted">open</span>'}</span>
        </div>`;
      }).join("")}
    </div>
    <button class="dg-more" onclick="setTab('timeline')">Open the schedule</button>
  </div>`;
}

/* The car, part by part. 33 cells, one per part, each one a link into the
   record — an index that happens to be coloured, not a chart. At this many
   parts it draws every unit, so it states no percentage and no projection: one
   part is 3% and the nose cone and a bracket are the same 3%, which a
   continuous bar would hide.

   Desktop only. At 393px the cells land at ~26px, and eight neighbours 4px away
   are eight different parts, so a missed tap opens the wrong record — and the
   blanket `button { min-height: 40px }` would silently stretch each square into
   a 26x40 rectangle that passes the tap-target check and looks broken. Same
   call, and the same reason, as .pstats.compact being hidden on a phone. */
function dashParts() {
  const parts = DB.parts || [];
  if (!parts.length) return "";
  const st = typeof partStageByKey === "function" ? partStageByKey("layupProgress") : null;
  if (!st) return "";
  const b = { "st-0": 0, "st-mid": 0, "st-done": 0, "st-na": 0 };
  const cells = parts.slice()
    .sort((a, c) => (a.layupDeadline || "9999").localeCompare(c.layupDeadline || "9999") || a.id.localeCompare(c.id))
    .map(p => {
      const v = p[st.key] || st.vals[0];
      const cls = stageClass(v, st.vals);
      b[cls]++;
      const name = p.partName || p.id;
      return `<button class="ucell ${cls}" title="${esc(name)} — ${esc(v)}" aria-label="${esc(name)}, layup ${esc(v)}"
        onclick="openRecord('parts','${esc(p.id)}')">${
        cls === "st-done" ? '<svg class="uglyph" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.4 L4.2 7.6 L8 3.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : cls === "st-na" ? '<svg class="uglyph" viewBox="0 0 10 10" aria-hidden="true"><line x1="2.6" y1="7.4" x2="7.4" y2="2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
        : cls === "st-mid" ? `<i style="width:${stagePct(v, st.vals)}%"></i>` : ""}</button>`;
    }).join("");
  return `<div class="card dashcar">
    <h3>The car, part by part <span class="muted nocaps">— ${parts.length} parts, pick one to open it</span></h3>
    <div class="unitgrid">${cells}</div>
    <div class="sb-nums tny">
      <span class="muted">${b["st-0"]} not started</span> ·
      <span class="mid">${b["st-mid"]} under way</span> ·
      <span class="done">${b["st-done"]} laid up</span>${b["st-na"] ? ` · <span class="na">${b["st-na"]} n/a</span>` : ""}
      <span class="muted">— ${parts.length} parts, not ${parts.length} equal jobs.</span>
    </div>
  </div>`;
}

/* The list. One row per thing, each thing in exactly one bucket. */
function dashGroups(list) {
  const byBucket = new Map();
  list.forEach(it => {
    const k = bucketOf(it);
    if (!byBucket.has(k)) byBucket.set(k, []);
    byBucket.get(k).push(it);
  });
  return `<div id="dash-list">${DASH_BUCKETS.map(b => {
    const rows = byBucket.get(b.id);
    if (!rows || !rows.length) return "";
    /* Undated work is real but it is not news, and there is a lot of it — the
       SN5 import alone carries eight parts with no deadline and no owner. It
       goes last and it goes folded, so it stops being the tallest thing on a
       page whose subject is what happens next. <details> rather than a view
       flag: nothing here needs to survive a render, and the disclosure
       triangle is a control every browser already gets right. */
    const head = groupHead(b.label, rows.length, b.id === "late" ? "bad" : "");
    const table = `<table class="list dash"><tr><th>Item</th><th>Who</th><th>Deadline</th></tr>${rows.map(itemRow).join("")}</table>`;
    if (b.id !== "nodate") return head + table;
    return `<details class="dg-fold"><summary>${head}</summary>${table}</details>`;
  }).join("")}</div>`;
}
