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
    // Included, never filtered: an R&D layup that misses its date is really
    // late. `rnd` rides along so the row can say so.
    rnd: isRnd(p),
  }));
  // Issues only. Project tickets are shelved (see the TABS row in core.js),
  // and a deadline for a record nobody can navigate to is a deadline nobody
  // can act on. projStatus() still migrates the old 4-value status, same as
  // everywhere else a ticket is read.
  DB.projects.filter(isIssue).forEach(p => items.push({
    coll: "projects", id: p.id,
    kind: "Issue",
    label: p.title || p.id,
    who: whoLabel(p.assignees || []),
    date: p.dueDate, done: projStatus(p) === "Done",
    mine: isMine(p.assignees || []),
  }));
  DB.workOrders.forEach(w => items.push({
    coll: "workOrders", id: w.id, kind: "WO", label: w.partName || w.id,
    who: whoLabel([w.moldEngineer, w.manufacturingEngineer]),
    date: w.dueDate, done: w.status === "Complete",
    mine: isMine([w.moldEngineer, w.manufacturingEngineer]),
    rnd: woIsRnd(w),
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
    /* Belt and braces. woIsRnd() already derives the run's programme from this
       very part, so the two agree in every case that can actually merge — but
       if they ever disagreed, a badge going missing on a merged row is the
       failure that matters, and OR is the direction that cannot lose it. */
    row.rnd = row.rnd || it.rnd;
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
  /* Same argument again, one type down. Every issue REQUIRES a workOrderId
     (v1.0.0 put issues on the run they hold up), so an issue row was always a
     second line for a run already on this list — the exact double-count the
     part/work-order merge above exists to undo, and the reason that one was
     worth 40% of "behind schedule".

     Also: an issue filed from a work order carries no due date, so today it
     sinks into the "No date" fold where nobody looks. Folded into its run it
     surfaces on a row that HAS a date, which is strictly more visible.

     Snapshotted before the loop and absorbed by identity for the two reasons
     the part pass documents. The row it merges into may already have adopted
     the part's coll and id up there — byWoId still holds the same object, so
     the lookup keeps working, and the flag belongs on it either way because it
     is the same physical run. */
  const issueItems = items.filter(i => i.coll === "projects");
  issueItems.forEach(it => {
    const iss = recById("projects", it.id);
    const row = iss && iss.workOrderId ? byWoId.get(iss.workOrderId) : null;
    if (!row || row === it || absorbed.has(row)) return;   // orphan, itself, or already merged away
    absorbed.add(it);
    if (it.date && (!row.date || it.date < row.date)) row.date = it.date;
    row.mine = row.mine || it.mine;
    // Only what is still open: a disposed issue is history, and a flag counting
    // it would never go back down.
    if (!it.done && projStatus(iss) !== "Cancelled") row.issues = (row.issues || 0) + 1;
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

/* ---------- what can I actually do right now? ----------
   THE QUESTION THE DASHBOARD NEVER ANSWERED. Everything on the old board was a
   count of things that EXIST: late items, blocked runs, open issues. None of it
   answered "what should I go and do", and the difference matters most for the
   half of the roster who cannot yet do most of it.

   buyoff() is a ladder of gates in a fixed order — sequence, then identity,
   then evidence, then the clock, then CS-013 — and any list that promises a
   signature has to walk the same ladder in the same order or the dashboard
   sends people to a button that refuses them. So this walks it, and reports
   which rung a step is standing on rather than a yes/no.

   The `typeof x === "function"` guards are the idiom this file already uses:
   tools/lib/appload.mjs loads each app file as its own vm.Script, so a helper
   from workorders.js may genuinely not be there yet when this parses. */
function signableSteps(email) {
  email = String(email || (typeof myEmail === "function" ? myEmail() : "")).toLowerCase();
  const lead = typeof isLead === "function" && isLead();
  const out = [];
  (DB.workOrders || []).forEach(w => {
    if (w.retro || w.status === "Complete") return;   // history signs nothing
    const steps = w.steps || [];
    /* The same definition of "next" as woFlags() and blockedNow(). Three
       surfaces disagreeing about which step is live is a bug report, not a
       nuance, so it is copied deliberately rather than re-derived. */
    const next = steps.findIndex(s =>
      typeof stepState === "function" && stepState(s) !== "done" && stepState(s) !== "failed");
    if (next < 0) return;
    const s = steps[next];

    // 1. SEQUENCE. Looks strictly BEFORE next — so when the next step IS the
    //    blocker this is null, and that is the most valuable item on the page:
    //    sign it and the whole run moves.
    const blocker = typeof blockerOpenBefore === "function" ? blockerOpenBefore(w, next) : null;

    // 2. IDENTITY. Rule field only; an untagged step is ungated by design.
    const tr = typeof stepTraining === "function" ? stepTraining(s) : null;
    const trained = !tr || !!s.trainingOverride
      || (typeof hasTraining === "function" && hasTraining(email, tr));

    // 3. EVIDENCE. NOT a hard bar — pressing the button is how you find out
    //    what is missing and get the control that fixes it. So it demotes.
    const ev = typeof stepEvidence === "function" ? stepEvidence(w, next) : { missing: [] };

    // 4. THE CLOCK. A member gets a toast; a LEAD gets openHoldOverride(). So
    //    whether this gate stops you is genuinely role-dependent, in the data.
    const h = typeof holdState === "function" ? holdState(w, next) : null;
    const curing = h && !h.ready && !h.overridden ? h : null;

    // 5. CS-013. A design review signed by whoever made the thing is not a
    //    review. Inverted rather than filtered: it ranks DOWN for the creator
    //    and UP for everyone else, which is a distinction nothing on screen
    //    has ever drawn.
    const selfReview = /design review/i.test(s.title || "")
      && !!email && email === String(w.createdBy || "").toLowerCase();

    const qualified = (tr && typeof qualifiedFor === "function") ? qualifiedFor(tr) : [];
    out.push({
      wo: w, step: s, i: next, tr, blocker, curing, selfReview,
      missing: ev.missing || [],
      isBlockerStep: typeof isBlocker === "function" && isBlocker(s),
      mine: typeof isMine === "function" && isMine([w.moldEngineer, w.manufacturingEngineer]),
      // Scarce: almost nobody else can do it, so it is much more yours.
      scarce: !!tr && qualified.length > 0 && qualified.length <= 2,
      qualified,
      // How much this ONE signature unlocks. It is why a blocker outranks a
      // late deadline, so it is a number rather than a feeling.
      releases: Math.max(0, steps.length - next - 1),
      state:
        blocker ? "blocked"                    // not yours: the blocker is the item
        : curing && !lead ? "curing"           // nothing to do but know when
        : curing ? "overridable"               // a lead CAN act on this one
        : !trained ? "untrained"
        : (ev.missing || []).length ? "needs-evidence"
        : "ready",
    });
  });
  return out;
}

/* Waiting on YOU: ready, or one errand short, and either carrying your name or
   held by a training almost nobody has. Everything else that is ready is real
   work and belongs to the team — it ranks below, never in the hero. */
function waitingOnMe(email) {
  return signableSteps(email).filter(s =>
    (s.state === "ready" || s.state === "needs-evidence") && (s.mine || s.scarce) && !s.selfReview);
}
function readyForAnyone(email) {
  return signableSteps(email).filter(s => s.state === "ready" && !s.mine && !s.scarce);
}

/* THE ANSWER FOR A FIRST-YEAR. A member with no trainings has an empty
   "waiting on you" forever, which is the worst possible first impression of a
   board built to answer "what do I do next". Turn the gate into the next
   action: which training would unlock the most work that is ready RIGHT NOW,
   and who on the roster can teach it. */
function trainingGaps(email) {
  const need = new Map();
  signableSteps(email).forEach(s => {
    if (s.state !== "untrained") return;
    need.set(s.tr, (need.get(s.tr) || 0) + 1);
  });
  return [...need].map(([id, n]) => ({
    id, n,
    name: (typeof trainingById === "function" ? trainingById(id).name : id),
    who: (typeof qualifiedFor === "function" ? qualifiedFor(id) : []),
  })).sort((a, b) => b.n - a.n);
}

/* Ranking, used in ONE place: inside "waiting on you", where every item is the
   same kind of thing and an order is defensible. The lanes themselves are
   deliberately not scored against each other — "is this blocker more urgent
   than that deadline" is a question with no honest answer, and inventing one
   is how a board starts lying quietly.

   Small integers, added, so a lead can reproduce the order in their head. A
   score nobody can argue with is a score nobody trusts. */
/* The TIER is what kind of stop this is; the bonuses only order things within
   a tier. For that to be true rather than merely intended, the tiers have to be
   spaced further apart than every bonus added together — otherwise a late,
   scarce, mine, releases-everything purchase approval outranks a live blocker,
   and the ordering silently stops meaning what the names say.

   45 is the most the bonuses can add (15 + 12 + 8 + 10), so the tiers sit 50
   apart. A test pins the relationship, because getting it wrong is invisible:
   the board still renders, in a slightly wrong order, forever. */
const ACT_BASE = {
  blockerAtNext: 250,   // your signature IS the gate; signing it moves the run
  signoffReady: 200,
  needsEvidence: 150,   // yours to sign, but go and take the photo first
  overridable: 100,     // a cure that is ready and waiting on a lead
  approval: 50,         // over $50, awaiting sign-off (lead only)
  unassigned: 0,        // open, dated, nobody's name on it
};
/* The most a deadline can be worth. Capped at all because the SN5 archive is
   full of records three hundred days past their date, and uncapped any one of
   them would sit permanently above a run that is stopping the shop today.
   Capped at THIS because of the tier arithmetic above. */
const ACT_LATE_CAP = 15;
function actScore(a) {
  let s = ACT_BASE[a.base] || 0;
  const dd = typeof daysUntil === "function" ? daysUntil(a.date) : null;
  if (dd != null && dd < 0) s += Math.min(ACT_LATE_CAP, -dd);
  if (a.mine) s += 12;              // yours beats the team's, never by a whole tier
  if (a.scarce) s += 8;
  if (a.releases) s += Math.min(10, a.releases);
  if (a.rnd) s -= 4;                // real work, not a season deliverable
  if (a.selfReview) s -= 40;        // CS-013: your own review is not yours to sign
  return s;
}
function actSort(a, b) {
  return (b.score || 0) - (a.score || 0) || dashSort(a, b);
}

/* Which board to draw. A third value beyond lead/member, because a guest is not
   a member with less — a work queue filtered to nothing is a blank apology, and
   a guest gets a different page rather than an emptier one. */
function dashRole() {
  if (window.fb && fb.guest) return "guest";
  return (typeof isLead === "function" && isLead()) ? "lead" : "member";
}

/* ---------- one list, grouped ----------
   One list, bucketed FIRST-MATCH-WINS so an item appears exactly once, and
   ordered by what you would act on first. */
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
const KIND_RANK = { WO: 0, Part: 1, Issue: 2 };
function dashSort(a, b) {
  return (a.date || "9999").localeCompare(b.date || "9999")
    || (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9)
    || String(a.label).localeCompare(String(b.label));
}
/* The count is the biggest type in the group, and it is a real control: it
   scrolls nothing, it is the heading. .bnum, not .bignum: the board carries
   its own numeral class, and .bignum is one of the shared selectors the
   theme-proof audit samples for light/dark difference, which a constant-dark
   page must stay out of. */
function groupHead(label, n, cls) {
  return `<div class="dgrouphd">
    <span class="bnum ${cls || ""}">${n}</span>
    <span class="dg-label">${esc(label)}</span>
  </div>`;
}

/* ---------- rows ----------
   One stacked-row renderer for every module. The old dashboard drew 3-column
   tables, which is what broke the rail: a table's min-content width is the sum
   of its columns', and a 3-col table with a pill, a kind tag and a raw email
   cannot fit a 304px box (the "new activity" overflow). Stacked rows have one
   min-content: the longest word, and .srow-meta ellipsises. */
function dashRow(it) {
  const dd = daysUntil(it.date);
  const paren = dd < 0 ? Math.abs(dd) + "d late" : dd === 0 ? "today" : dd + "d";
  const when = it.date
    ? `<span class="${dd != null && dd < 0 ? "warn" : ""}">${esc(it.date)}${dd != null ? ` (${paren})` : ""}</span>`
    : "no date";
  return `<div class="srow">
    <span class="sr-main"><span class="kind">${it.kind}</span> ${chip(it.coll, it.id, it.label)}${rndBadge(it.rnd)}${
      // The run is held up by something. Not a count of everything ever filed:
      // undisposed issues are what stop it closing.
      it.issues ? ` <span class="warn tny" title="${it.issues} open issue${it.issues > 1 ? "s" : ""}">⚑ ${it.issues}</span>` : ""}</span>
    <span class="srow-meta">${esc(it.who || "—")} · ${when}</span>
  </div>`;
}

/* ---------- the page ----------
   Round four: mission control, on the app's ordinary light surfaces (Simon
   liked the board, not the navy). One grid (.dboard, NOT .board, which is
   the Tickets kanban's class) holding the whole team state as flat
   children, so the phone re-orders it with grid-template-areas alone. The
   alert strip leads because "what is late, blocked, unassigned or curing" is
   the lead's one-second read; the work list keeps round three's proven
   bucket behavior unchanged underneath. Round one died of addition and
   round two of loose packing; the guards stay: <=5 visible rows a module,
   one numeral scale, one header treatment. */
function renderDashboard() {
  const items = mergedDeadlineItems();
  const open = items.filter(i => !i.done);
  const mine = open.filter(i => i.mine).sort(dashSort);
  const team = open.filter(i => !i.mine).sort(dashSort);

  const blocked = blockedNow();
  const curing = curingNow();
  const watched = (DB.projects || []).filter(p => isIssue(p) && typeof projUnread === "function" && projUnread(p))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  const showTeam = view.dashTeam == null ? !mine.length : !!view.dashTeam;
  const list = showTeam ? mine.concat(team).sort(dashSort) : mine;
  const teamLate = team.filter(i => { const d = daysUntil(i.date); return d != null && d < 0; }).length;
  /* Strip numbers are TEAM-WIDE regardless of the list toggle: the strip is
     the lead's read of the whole program, the list below is the member's. */
  const late = open.filter(i => { const d = daysUntil(i.date); return d != null && d < 0; });
  const unassigned = open.filter(i => !i.who);

  const raceday = window.SEASON && SEASON.compDate === today();
  return `<div class="dboard${raceday ? " raceday" : ""}">
    ${dashAlerts(late.length, blocked.length, unassigned.length, curing)}
    <div class="bmod b-work" id="dash-list">
      <div class="bmod-hd"><span>${showTeam ? "Everything open" : "Your work"}</span><span class="gh-n">${list.length} open</span></div>
      ${showTeam && !mine.length ? `<p class="muted tny">Nothing is assigned to you, so this is the whole team's.</p>` : ""}
      ${list.length ? dashGroups(list) : `<p class="muted">Nothing open. Either the season hasn't started or you're all caught up.</p>`}
      ${team.length ? `<button class="dg-more" onclick="view={...view,dashTeam:${showTeam ? "false" : "true"}};render()">${
        showTeam ? (mine.length ? "Show only my work" : "Hide the team's work")
                 : `Everything else — ${team.length} open, ${teamLate} late`
      }</button>` : ""}
    </div>
    ${dashShopStatus(blocked, curing)}
    ${dashShopRef()}
    ${dashSeason()}
    ${dashWeek()}
    ${dashFeed(watched)}
    ${dashCount(items, open)}
    ${dashBudget()}
    ${dashLaunch()}
    ${dashFact()}
  </div>`;
}

/* ---------- fact of the day ----------
   factOfTheDay (facts.js) is deterministic by UTC day, so the whole team
   sees the same fact all day with no storage anywhere; "another one" offsets
   the index for this session only. On the configured competition date the
   module stops being a fact and says the only thing that matters. */
function dashFact() {
  if (typeof factOfTheDay !== "function") return "";
  if (window.SEASON && SEASON.compDate === today()) {
    return `<div class="bmod b-fact">
      <div class="bmod-hd"><span>Race day</span></div>
      <p class="fq">It's race day. Everything on this board already happened. Go run the car.</p>
    </div>`;
  }
  const f = factOfTheDay(view.factN);
  if (!f) return "";
  return `<div class="bmod b-fact">
    <div class="bmod-hd"><span>Shop knowledge</span><span class="gh-n">${f.src === "lore" ? "team lore" : "the wider world"}</span></div>
    <p class="fq">${esc(f.t)}</p>
    <div class="fmeta"><button class="dg-more" onclick="view={...view,factN:(view.factN||0)+1};render()">Another one</button></div>
  </div>`;
}

/* ---------- launchpad ----------
   One tile per place people actually go: filtered jumps into the tabs (the
   flags each tab already owns — setTab clears wo* flags, so those are set
   AFTER the switch), the bundled document shelves with real counts from the
   manifest, and whatever Google links the team pinned in Documents. External
   links are <a> so a long-press/middle-click works like the web. */
function dashLaunch() {
  const tile = (go, label, meta) => `<button class="b-tile" onclick="${go}">
    <span class="tl">${label}</span>${meta ? `<span class="tm">${meta}</span>` : ""}</button>`;
  const ext = (url, label, meta) => `<a class="b-tile" href="${esc(url)}" target="_blank" rel="noopener">
    <span class="tl">${esc(label)}</span>${meta ? `<span class="tm">${esc(meta)}</span>` : ""}</a>`;
  const shelf = (DB.documents || []).filter(d => d.pinned && d.url).slice(0, 4);
  return `<div class="bmod b-launch">
    <div class="bmod-hd"><span>Launchpad</span></div>
    <div class="lgrid">
      ${tile("setTab('workorders');view.woIssues=true;render()", "Open issues", "runs with one open")}
      ${tile("setTab('workorders');view.woLate=true;render()", "Late WOs", "past due only")}
      ${tile("view.invFlag='reorder';setTab('inventory')", "Reorder list", "low + expired")}
      ${tile("view.schedView='week';setTab('timeline')", "Week plan", "goals by person")}
      ${tile("setTab('reports')", "Reports", "counts + CSV")}
      ${tile("setTab('people')", "People", "who is on what")}
      ${/* The Datasheets and Standards tiles lived here until 2026-08-18, when
            those categories were unlisted from the Documents tab. A launchpad
            tile counting documents nobody can browse to is worse than no tile.
            The manifest load they used to trigger went with them; Documents
            loads it itself when opened. */""}
      ${tile("setTab('documents')", "Documents", "shelf + uploads")}
      ${shelf.map(d => ext(d.url, d.title || d.id, "pinned · opens in Google")).join("")}
    </div>
  </div>`;
}

/* ---------- countdown & streaks ----------
   The pit-wall column: T-minus to the configured competition, the next
   milestone, and three all-season counters. Every number here is
   denominator-free on purpose (a documented round-two decision: there is no
   completion history and no budget cap, so no meter gets a target it would
   have to invent). "Days since a deadline was missed" uses only due dates
   and open/closed, both real: an open item past due zeroes it; otherwise the
   most recent past due date among ALL items was met by definition. */
function dashCount(items, open) {
  const s = window.SEASON;
  const lead = typeof isLead === "function" && isLead();

  let head;
  if (s && s.compDate) {
    // No day count here: the alert strip prints it, larger, above this module,
    // and its tile scrolls HERE. Printing it twice made the scroll land on a
    // copy of the thing you just clicked. What this owns is what the strip
    // cannot say — which milestone is next, and how the season has gone.
    const next = (s.milestones || [])
      .filter(m => m.date && daysUntil(m.date) != null && daysUntil(m.date) >= 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
    head = `<div class="srow-meta"><b>${esc(s.compName || "competition")}</b> · ${esc(s.compDate)}</div>
    ${next ? `<div class="srow-meta">next: ${esc(next.label)} · ${esc(next.date)} (${daysUntil(next.date)}d)</div>` : ""}`;
  } else {
    head = `<p class="muted tny">No competition date set.</p>
    ${lead ? `<button class="dg-more" onclick="editSeason()">Set the season</button>` : ""}`;
  }

  const lateNow = open.filter(i => { const d = daysUntil(i.date); return d != null && d < 0; }).length;
  let missRow;
  if (lateNow) {
    missRow = { n: 0, cls: "bad", label: `days clean, ${lateNow} late right now` };
  } else {
    const pastDue = items.filter(i => { const d = daysUntil(i.date); return d != null && d < 0; })
      .map(i => daysUntil(i.date)).sort((a, b) => b - a);
    missRow = pastDue.length
      ? { n: -pastDue[0], cls: "ok", label: "days since a deadline was missed" }
      : { n: "—", cls: "", label: "no deadlines missed yet" };
  }
  const layups = (DB.parts || []).filter(p => typeof partDone === "function" && partDone(p)).length;
  const signed = (DB.workOrders || []).reduce((n, w) =>
    n + (w.steps || []).filter(st => typeof isSigned === "function" && isSigned(st)).length, 0);
  const streak = (r) => `<div class="b-streak"><span class="sn ${r.cls || ""}">${r.n}</span><span class="sl">${r.label}</span></div>`;

  return `<div class="bmod b-count" id="b-count">
    <div class="bmod-hd"><span>Countdown</span>${s && s.compDate && lead
      ? `<button class="icon-btn" title="Edit season" aria-label="Edit season" onclick="editSeason()">✎</button>` : ""}</div>
    ${head}
    ${streak(missRow)}
    ${streak({ n: layups, cls: "", label: `layup${layups === 1 ? "" : "s"} banked all season` })}
    ${streak({ n: signed, cls: "", label: `step sign-off${signed === 1 ? "" : "s"} all season` })}
  </div>`;
}

/* Lead-only editor for config/season. Milestones as date-label lines rather
   than a row editor: a season has a handful, and a lead sets them twice a
   year. Writing goes through fb.setConfig, which stamps updatedAt/By. */
function editSeason() {
  const s = window.SEASON || {};
  openModal(`
    <h2>Season settings</h2>
    <div class="field"><label>Competition name</label><input id="sea-name" value="${esc(s.compName || "")}" placeholder="FSAE Michigan"></div>
    <div class="field"><label>Competition date</label><input id="sea-date" type="date" value="${esc(s.compDate || "")}"></div>
    <div class="field"><label>Season start (optional)</label><input id="sea-start" type="date" value="${esc(s.seasonStart || "")}"></div>
    <div class="field"><label>Milestones — one per line: YYYY-MM-DD Label</label>
      <textarea id="sea-ms" rows="4" placeholder="2027-01-20 All molds cut">${esc((s.milestones || []).map(m => `${m.date} ${m.label}`).join("\n"))}</textarea></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitSeason()">Save</button></div>
  `);
}
async function submitSeason() {
  const milestones = document.getElementById("sea-ms").value.split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(l => { const m = l.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/); return m ? { date: m[1], label: m[2] } : null; })
    .filter(Boolean);
  const data = {
    compName: document.getElementById("sea-name").value.trim(),
    compDate: document.getElementById("sea-date").value,
    seasonStart: document.getElementById("sea-start").value,
    milestones,
  };
  try {
    await fb.setConfig("season", data);
    window.SEASON = data;
    closeModal(); render(); toast("Season saved.");
  } catch (e) { toast("Save failed: " + e.message, "error"); }
}

/* The alert strip: the lead's one-second read, team-wide, bare numerals on
   the board itself. Red/amber only when nonzero; when everything is quiet a
   green all-clear cell leads, because "the program is fine" is real
   information at a Monday meeting. The T-minus readout holds the strip's
   right end once a season is configured. */
function dashAlerts(nLate, nBlocked, nUnassigned, curing) {
  const toList = "document.getElementById('dash-list').scrollIntoView({block:'start'})";
  const toShop = "var el=document.getElementById('dash-status');if(el)el.scrollIntoView({block:'start'})";
  const cell = (n, label, cls, go, sub) => `<button class="b-alert" onclick="${go}">
    <span class="bnum ${n ? cls : ""}">${n}</span><span class="bl">${label}${sub || ""}</span>
  </button>`;
  const allClear = !nLate && !nBlocked && !nUnassigned && !curing.length;
  let tminus = "";
  if (window.SEASON && SEASON.compDate) {
    const dd = daysUntil(SEASON.compDate);
    tminus = `<button class="b-tminus" onclick="var el=document.getElementById('b-count');if(el)el.scrollIntoView({block:'start'})">
      <span class="bnum">${dd == null ? "?" : Math.abs(dd)}</span>
      <span class="bl">${dd != null && dd < 0 ? "days since" : "days to"} <b>${esc(SEASON.compName || "competition")}</b></span>
    </button>`;
  }
  return `<div class="b-alerts">
    ${allClear ? `<div class="b-alert"><span class="bnum ok">✓</span><span class="bl">All clear</span></div>` : ""}
    ${cell(nLate, "Late", "bad", toList)}
    ${cell(nBlocked, "Blocked", "bad", nBlocked ? toShop : "setTab('workorders')")}
    ${cell(nUnassigned, "Unassigned", "warn", toList)}
    ${cell(curing.length, "Curing", "warn", nBlocked || curing.length ? toShop : "setTab('workorders')",
      curing.length ? ` · ready ${esc(curing[0].hold.readyAt)}` : "")}
    ${tminus}
  </div>`;
}

/* Money: the unreimbursed sum, and the $50 approval rule finally surfaced —
   needsApproval() existed in budget.js all season and nothing showed it. */
function dashBudget() {
  const openOrders = DB.budget.filter(b => b.status !== "Reimbursed");
  const openSum = openOrders.reduce((s, b) => s + num(b.cost), 0);
  const approvals = typeof needsApproval === "function" ? DB.budget.filter(needsApproval) : [];
  return `<div class="bmod b-budget">
    <div class="bmod-hd"><span>Money</span>${openOrders.length ? `<span class="gh-n">${openOrders.length} open purchase${openOrders.length === 1 ? "" : "s"}</span>` : ""}</div>
    <button class="b-money" onclick="setTab('budget')">
      <span class="bnum">$${openSum.toFixed(0)}</span><span class="bl">unreimbursed</span>
    </button>
    ${approvals.length ? `<div class="srow"><span class="sr-main">
      <button class="chip" onclick="setTab('budget')">${approvals.length} over $50 awaiting sign-off</button></span></div>` : ""}
    ${(() => {
      // Bought vs actually used: the consumed sum comes from WO BOM lines
      // logged at the bench, so this number only exists where someone told
      // the truth at a buy-off. Absent until then, never $0.
      const consumed = (DB.workOrders || []).reduce((s, w) =>
        s + (w.bom || []).reduce((a, l) => a + (typeof l.costAtConsumption === "number" ? l.costAtConsumption : 0), 0), 0);
      return consumed > 0 ? `<div class="srow"><span class="sr-main muted">$${consumed.toFixed(0)} of materials consumed across runs</span></div>` : "";
    })()}
  </div>`;
}

/* Shop status: what is stopping work RIGHT NOW. Blocked gates (red) and cure
   clocks (amber, clock time never a countdown — see curingNow), and nothing
   else.

   It used to also carry the Inventory tab's warning arithmetic, which made one
   module answer two unrelated questions: "can the shop work" is a thing on a
   clock that someone must act on today, and "is the store tidy" is a monthly
   habit. They now sit apart — see dashShopRef — because the strip above counts
   blocked and curing, so this module's job is the DETAIL behind those counts,
   and four inventory chips buried under them were the reason nobody read it.

   The flagship is still the empty state: a clean shop renders ONE line, because
   "the shop is fine" is real information at a Monday meeting, and never a
   missing box. That also lets this module sit high in the grid without
   violating the rule that nothing which renders empty on the team's own archive
   sits above the fold — blockedNow and curingNow are both structurally empty on
   the SN5 records, and this line is what stands in their place. */
function dashShopStatus(blocked, curing) {
  const rows = [];
  const dot = c => `<span class="sdot ${c}"></span>`;
  blocked.forEach(b => rows.push(`<div class="srow">${dot("bad")}<span class="sr-main">
    ${chip("workOrders", b.wo.id, b.wo.partName || b.wo.id)} <b>${esc(stripCS(b.step.title))}</b> unsigned</span>
    <span class="srow-meta">step ${b.step.seq}${b.wo.moldEngineer ? " · " + esc(b.wo.moldEngineer) : ""}</span></div>`));
  curing.forEach(c => rows.push(`<div class="srow">${dot("warn")}<span class="sr-main">
    ${chip("workOrders", c.wo.id, c.wo.partName || c.wo.id)} <span class="cure-at">ready ${esc(c.hold.readyAt)}</span></span>
    <span class="srow-meta">${c.hold.resin ? esc(c.hold.resin.label) : "resin not recorded"}${
      typeof holdIsCold === "function" && holdIsCold(c.hold) ? " · shop is cold, it will run long" : ""}</span></div>`));

  const body = rows.length
    ? rows.join("")
    : `<div class="srow">${dot("ok")}<span class="sr-main">All clear — nothing blocked or curing</span></div>`;
  return `<div class="bmod b-shop" id="dash-status">
    <div class="bmod-hd"><span>Shop status</span>${rows.length ? `<span class="gh-n">${rows.length}</span>` : ""}</div>
    ${body}
  </div>`;
}

/* The store, and the habits that keep it honest: expired lots, the CS-011 §6
   chemical-storage rule, what is running low, what has no shelf, and how long
   since anyone walked the stock. Reference, not an alarm — every row here is a
   count that links into Inventory, and none of it changes what can be built
   this afternoon. That is why it sits at the bottom of every breakpoint.

   Returns "" when there is nothing to say. Unlike Shop status it has no
   defensible empty state — "0 expired, 0 low, 0 unhoused" is a row of zeroes,
   not the news that the store is fine — so it collapses instead, which is safe
   precisely because of where it sits. */
function dashShopRef() {
  const rows = [];
  const dot = c => `<span class="sdot ${c}"></span>`;
  let footer = "";
  if (typeof invIndex === "function") {
    const idx = invIndex();
    const lots = (DB.lots || []).filter(o => o.stage !== "Empty");
    const expired = lots.filter(lotExpired).length;
    const low = lots.filter(lotIsLow).length;
    let chem = 0;
    invActiveBins().forEach(b => {
      chem += invLocWarnings(b, idx.by.get(b.id) || invEmptyBucket())
        .filter(w => w.cls === "bad" && !/expired/.test(w.text)).length;
    });
    const unhoused = invBucketCount(idx.un);
    const inv = (n, cls, label, go) => { if (n) rows.push(`<div class="srow">${dot(cls)}<span class="sr-main">
      <button class="chip" onclick="${go}">${n} ${label}</button></span></div>`); };
    inv(expired, "bad", `expired lot${expired === 1 ? "" : "s"}`, "view.invFlag='reorder';setTab('inventory')");
    inv(chem, "bad", `chemical storage warning${chem === 1 ? "" : "s"}`, "setTab('inventory')");
    inv(low, "warn", "running low", "view.invFlag='reorder';setTab('inventory')");
    inv(unhoused, "warn", "unhoused (no location)", "setTab('inventory')");
    const bins = invActiveBins();
    if (bins.length) {
      const ages = bins.map(b => invDaysSince(b.walkedAt));
      const overdue = ages.some(a => a == null || a > INV_WALK_STALE_DAYS);
      const oldest = ages.every(a => a != null) ? Math.max(...ages) : null;
      footer = `<div class="srow-meta gmod-foot">${overdue ? "stock walk overdue" : `walked ${oldest}d ago`}${
        (DB.stackplans || []).some(p => !p.moldId) ? ` · ${(DB.stackplans || []).filter(p => !p.moldId).length} stack plans unlinked` : ""}</div>`;
    }
  }

  if (!rows.length && !footer) return "";
  return `<div class="bmod b-ref" id="dash-ref">
    <div class="bmod-hd"><span>Stock &amp; housekeeping</span>${rows.length ? `<span class="gh-n">${rows.length}</span>` : ""}</div>
    ${rows.join("")}${footer}
  </div>`;
}

/* ---------- the activity feed ----------
   Every synced doc carries updatedAt/updatedBy and every comment a ts, and
   until now the only surface reading any of it was the watched-tickets card.
   One merged stream instead: record touches, comments, and step buy-offs
   across tickets, parts, work orders and molds. Newest first, ONE event per
   record per calendar day (a save-then-comment is one line of news, not
   two), capped. Notifications stay out: they are per-user and the bell owns
   them. Watched tickets with unread activity still pin to the top wearing
   the gold dot — that is a personal signal, not program news. */
function dashFeedEvents() {
  const ev = [];
  const push = (ts, who, verb, coll, id, label) => { if (ts) ev.push({ ts: String(ts), who, verb, coll, id, label }); };
  (DB.projects || []).filter(isIssue).forEach(p => {
    push(p.updatedAt, p.updatedBy, "updated", "projects", p.id, p.title || p.id);
    (p.comments || []).forEach(c => push(c.ts, c.email || c.author, "commented on", "projects", p.id, p.title || p.id));
  });
  (DB.parts || []).forEach(p => {
    push(p.updatedAt, p.updatedBy, "updated", "parts", p.id, p.partName || p.id);
    (p.commentLog || []).forEach(c => push(c.ts, c.email || c.author, "commented on", "parts", p.id, p.partName || p.id));
  });
  (DB.workOrders || []).forEach(w => {
    if (w.retro) return;   // the SN5 archive documents, it is not news
    push(w.updatedAt, w.updatedBy, "updated", "workOrders", w.id, w.partName || w.id);
    (w.noteLog || []).forEach(c => push(c.ts, c.email || c.author, "commented on", "workOrders", w.id, w.partName || w.id));
    (w.steps || []).forEach(s => {
      if (s.buyoff && s.buyoff.name && s.buyoff.date && !/not recorded/i.test(s.buyoff.name))
        push(s.buyoff.date, s.buyoff.name, "signed a step on", "workOrders", w.id, w.partName || w.id);
    });
  });
  (DB.molds || []).forEach(m => push(m.updatedAt, m.updatedBy, "updated", "molds", m.id, m.name || m.id));
  ev.sort((a, b) => b.ts.localeCompare(a.ts));
  const seen = new Set();
  return ev.filter(e => {
    const k = e.coll + "|" + e.id + "|" + e.ts.slice(0, 10);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}
function dashFeed(watched) {
  const wShown = watched.slice(0, 3);
  const wIds = new Set(wShown.map(p => p.id));
  const events = dashFeedEvents()
    .filter(e => !(e.coll === "projects" && wIds.has(e.id)))
    .slice(0, 8 - wShown.length);
  if (!wShown.length && !events.length) return "";
  return `<div class="bmod b-activity">
    <div class="bmod-hd"><span>${wShown.length ? '<span class="unread-dot"></span> ' : ""}Activity</span><span class="gh-n">latest across the app</span></div>
    ${wShown.map(p => `<div class="srow">
      <span class="sr-main"><span class="kind">Issue</span> ${chip("projects", p.id, p.title || p.id)}</span>
      <span class="srow-meta"><span class="status ${projStatusClass(projStatus(p))}"><span class="dot"></span>${esc(projStatus(p))}</span>
        ${fmtWhen(p.updatedAt)} by ${esc(whoLabel(p.updatedBy) || "?")}</span>
    </div>`).join("")}
    ${events.map(e => `<div class="srow">
      <span class="sr-main">${chip(e.coll, e.id, e.label)}</span>
      <span class="srow-meta">${e.verb} by ${esc(whoLabel(e.who) || "?")} · ${fmtWhen(e.ts)}</span>
    </div>`).join("")}
    ${watched.length > wShown.length ? `<button class="dg-more" onclick="setTab('workorders');view.woIssues=true;render()">All watched — ${watched.length}</button>` : ""}
  </div>`;
}

/* This week at RFS: the booked stations only. Seven rows of the word "open"
   is an empty grid with a heading — the count in the header carries the free
   stations, which is what the phone CSS always did and desktop now matches. */
function dashWeek() {
  if (typeof weekPlanWeeks !== "function" || typeof STATIONS === "undefined") return "";
  const week = weekPlanWeeks().find(w => weekContains(w, today()));
  if (!week) return "";
  const booked = STATIONS.filter(([k]) => String(week[k] || "").trim());
  const open = `onclick="view.schedView='stations';setTab('timeline')"`;
  if (!booked.length) {
    return `<div class="bmod b-week">
      <div class="bmod-hd"><span>This week at RFS</span><span class="gh-n">wk of ${esc(week.weekOf)}</span></div>
      <button class="dg-more" ${open}>Nothing booked yet — open the schedule</button>
    </div>`;
  }
  return `<div class="bmod b-week">
    <div class="bmod-hd"><span>This week at RFS</span><span class="gh-n">${booked.length} of ${STATIONS.length} booked</span></div>
    ${booked.map(([k, label]) => {
      const v = String(week[k]).trim();
      const part = recById("parts", v);
      return `<div class="srow"><span class="sr-main"><span class="stn-l">${esc(label)}</span>
        ${part ? chip("parts", part.id, part.partName || part.id) : esc(v)}</span></div>`;
    }).join("")}
    <button class="dg-more" ${open}>Open the schedule</button>
  </div>`;
}

/* The build-progress panel, the page's centerpiece and the graphic Simon asked
   to keep: the parts stage bars (all-parts denominator, counts printed as words
   for colourblind safety — both documented decisions from round two) plus the
   molds pipeline via the same moldsStageBar() the Molds tab renders.

   It used to be called "Season". The Season TAB took that word — it is the
   blueprint, the plan for what gets made — and this panel is how far through
   BUILDING it the team is, which is a different question. The class stays
   .b-season so the grid areas and every CSS rule keep working; only the word
   somebody reads changed. */
function dashSeason() {
  const parts = DB.parts || [];
  if (!parts.length || typeof PART_STAGES === "undefined") return "";
  const liveMolds = (DB.molds || []).filter(m => m.stage !== "Retired");
  return `<section class="bmod b-season">
    <div class="bmod-hd"><span>Build progress</span><span class="gh-n">all ${parts.length} parts${liveMolds.length ? ` · ${liveMolds.length} molds` : ""}</span></div>
    ${PART_STAGES.map(st => {
      const b = stageBreakdown(st.key, st.vals, parts);
      const tot = b["st-0"] + b["st-mid"] + b["st-done"] + b["st-na"] || 1;
      const seg = (cls, n, lbl) => n ? `<span class="sb-seg ${cls}" style="width:${(n / tot) * 100}%" title="${n} ${lbl}"></span>` : "";
      return `<div class="stagebreak">
        <div class="sb-label">${esc(st.label)}</div>
        <div class="sb-bar">${seg("st-0", b["st-0"], "not started")}${seg("st-mid", b["st-mid"], "under way")}${seg("st-done", b["st-done"], "done")}${seg("st-na", b["st-na"], "not applicable")}</div>
        <div class="sb-nums tny"><span class="done">${b["st-done"]} done</span>${b["st-mid"] ? ` · <span class="mid">${b["st-mid"]} under way</span>` : ""}${b["st-0"] ? ` · <span class="muted">${b["st-0"]} to start</span>` : ""}${b["st-na"] ? ` · <span class="na">${b["st-na"]} n/a</span>` : ""}</div>
      </div>`;
    }).join("")}
    ${liveMolds.length && typeof moldsStageBar === "function" ? `<div class="ds-molds">${moldsStageBar(liveMolds)}</div>` : ""}
    <div class="ds-links"><button class="dg-more" onclick="setTab('parts')">Parts</button><button class="dg-more" onclick="setTab('molds')">Molds</button></div>
  </section>`;
}

/* The list: one row per thing, each in exactly one bucket. Late and This week
   render open (Late keeps the big-numeral heading — THE number on the page);
   the quieter buckets fold behind a disclosure with the count in the summary,
   so a single "Later" item stops costing a 48px band. */
function dashGroups(list) {
  const byBucket = new Map();
  list.forEach(it => {
    const k = bucketOf(it);
    if (!byBucket.has(k)) byBucket.set(k, []);
    byBucket.get(k).push(it);
  });
  return `<div>${DASH_BUCKETS.map(b => {
    const rows = byBucket.get(b.id);
    if (!rows || !rows.length) return "";
    const head = groupHead(b.label, rows.length, b.id === "late" ? "bad" : "");
    const body = rows.map(dashRow).join("");
    if (b.id === "late" || b.id === "week") return head + body;
    return `<details class="dg-fold"><summary>${head}</summary>${body}</details>`;
  }).join("")}</div>`;
}
