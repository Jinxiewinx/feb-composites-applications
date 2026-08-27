"use strict";
/* season.js — the blueprint.

   THE SHEET THIS REPLACES. The team has run every season off the Composites
   Master Tracker in Drive: one row per part, thirteen columns, and most of the
   cells empty for months. That emptiness is the point and not a defect. In
   September the team knows it is making a nosecone, an undertray and four
   side panels; it does not yet know the layup schedule, the mold location or
   who is machining what. A row that exists with nothing in it is a commitment
   to build the thing. Filling it in comes later.

   So this tab is the sheet, in the app, and a row is a REAL part record —
   sparse, but real, with a P- id from the moment it exists. There is no
   separate "planned part" collection and no promotion step: `createBlankPart()`
   in parts.js already made every field blank, and "making the real part file"
   is filling those fields in on the Parts tab.

   WHY THIS IS NOT THE PARTS TAB. Parts is a rail plus one open record: the
   working view, for when you are doing something to one part. This is the
   planning view, for when the question is about the season rather than about a
   part — who has nothing assigned, which subteam is behind, what has no
   deadline. Same records, and the two are meant to overlap the way Schedule
   and Work Orders do.

   IT IS A READ NOW, AND THAT IS WHY IT FITS. The tab used to be thirteen
   editable columns. Thirteen controls have a floor of about 1,700px — the
   three stage dropdowns and the sticky name column account for 634px of it
   before a single data column — against roughly 1,300px of content width at a
   1600 viewport. It scrolled sideways at every real width, on every machine,
   always. Reading is what this tab is for; editing already has a better home
   one click away, where the CS-003 evidence gate and both confirms live
   anyway (partStageRow in parts.js). So a row became a line: a name that opens
   the part, the C/M/L rail the Parts index already draws, a status in words,
   and a date. Roughly sixty parts on screen where eighteen used to be.

   THE FEED IS DOWNSTREAM. tracker.js publishes the parts list to a document
   the Master Tracker's Apps Script pulls every 15 minutes, so the sheet still
   updates itself — but it is a mirror, and an edit made there is overwritten
   on the next publish. The tab says so out loud, because somebody will try it
   in week three.

   SEASON_COLS IS DELIBERATELY NOT TRACKER_FIELDS. See the note above it. */

/* The fields a blueprint row is ABOUT, and where each one is edited.

   This stopped being a column list when the table did, but it did not stop
   being useful: it is the manifest of what a blueprint row means, and `where`
   says which fields the line carries and which you open the part to see.
   Keeping it is also what lets the test that a blank part has a home for every
   blueprint field keep working, unchanged, across the redesign.

   Order is the Master Tracker's own, with Part Name first.

   ---------------------------------------------------------------------------
   THIS LIST IS NOT tracker.js's TRACKER_FIELDS, AND MUST NOT BECOME IT.
   TRACKER_FIELDS is the whitelist for a document served over a URL that needs
   no login; its own header calls it a security boundary. If this array were
   derived from it, or if someone widened that one to add a field here, the
   public feed would widen silently along with the UI. They are two lists that
   happen to agree today, and a test pins TRACKER_FIELDS literally so it can
   only change on purpose. Add a field here freely; adding one there is a
   disclosure decision.
   --------------------------------------------------------------------------- */
const SEASON_COLS = [
  { key: "partName", label: "Part", type: "text", where: "grid" },
  { key: "cadProgress", label: "CAD", type: "stage", where: "grid" },
  { key: "moldProgress", label: "Mold", type: "stage", where: "grid" },
  { key: "layupProgress", label: "Layup", type: "stage", where: "grid" },
  { key: "subteam", label: "Subteam", type: "select", where: "grid", opts: () => SUBTEAMS },
  { key: "layupType", label: "Layup type", type: "select", where: "part", opts: () => LAYUP_TYPES },
  { key: "layupSchedule", label: "Schedule", type: "text", where: "part" },
  { key: "moldLocation", label: "Mold loc.", type: "text", where: "part" },
  { key: "moldEngineer", label: "Mold eng.", type: "person", where: "part" },
  { key: "manufacturingEngineer", label: "Mfg eng.", type: "person", where: "part" },
  { key: "weightG", label: "Weight (g)", type: "num", where: "part" },
  { key: "comments", label: "Comments", type: "text", where: "part" },
  { key: "layupDeadline", label: "Deadline", type: "date", where: "grid" },
];

function seasonCol(key) { return SEASON_COLS.find(c => c.key === key); }

/* ---------- one part's state, in a word ----------
   The chip answers "where is this thing", and it answers in a WORD. The C/M/L
   rail beside it carries the same fact in a form you can scan down a column,
   but the rail is three small coloured marks — and the house rule is that no
   distinction may rest on hue alone, because this gets printed, photocopied,
   and read by people who do not all see red the same way.

   Every colour here comes from stageClass(). Deciding one locally is how the
   chip and the rail would come to disagree about the same part. */
function seasonStatus(p) {
  if (!String(p.partName || "").trim()) return { cls: "st-0", label: "Unnamed" };
  if (typeof partLate === "function" && partLate(p)) {
    const d = daysUntil(p.layupDeadline);
    const n = Math.abs(d == null ? 0 : d);
    return { cls: "st-bad", label: `${n} day${n === 1 ? "" : "s"} late` };
  }
  if (typeof partDone === "function" && partDone(p)) return { cls: "st-done", label: "Done" };
  /* The earliest unfinished stage IS the state of the part: a mold halfway
     machined reads as "Machining" however far CAD got, because the mold is the
     thing in front of the team. N/A is skipped rather than reported — "N/A
     (Flat)" is a statement about the part, not a stage it is sitting at. */
  for (const st of PART_STAGES) {
    const v = p[st.key] || st.vals[0];
    const cls = stageClass(v, st.vals);
    if (cls === "st-done" || cls === "st-na") continue;
    return { cls, label: v };
  }
  return { cls: "st-done", label: "Done" };
}

/* ---------- one line ----------
   The name is a real <button>, not a click handler on the row, for three
   reasons that each cost something to learn elsewhere in this app: it is
   focusable and Enter-able with no keydown code of its own; `data-open` alone
   buys ctrl-click and middle-click a new tab through the delegated handlers in
   core.js; and a stretched ::after makes the whole line the target without
   making the whole line a control a screen reader has to announce.

   The same idiom as .lc-open on a storage-location card. Copying it rather than
   inventing a second one is deliberate — including the coarse-pointer floor,
   which that class needed too and for the same reason. */
function seasonLine(p) {
  const st = seasonStatus(p);
  const late = typeof partLate === "function" && partLate(p);
  const named = !!String(p.partName || "").trim();
  const engs = typeof partEngineers === "function" ? partEngineers(p) : [];
  return `<div class="sline${late ? " late" : ""}${named ? "" : " unnamed"}"
      title="${esc(p.id)}${p.layupType ? " · " + esc(p.layupType) : ""}">
    <button type="button" class="sl-open" data-open="${esc(p.id)}"
      onclick="openRecord('parts','${esc(p.id)}')">${esc(p.partName || p.id)}</button>
    <span class="sl-sub">${esc(p.subteam || "")}</span>
    ${typeof stageRail === "function" ? stageRail(p) : ""}
    <span class="stage ${st.cls} sl-stat">${esc(st.label)}</span>
    <span class="sl-due${late ? " warn" : ""}">${p.layupDeadline
      ? esc(shortDate(p.layupDeadline)) + (late ? " " + icon("warning", 12) : "")
      : `<span class="muted">no date</span>`}</span>
    <span class="sl-who">${engs.map(e => avatar(e.email || e.name, 20)).join("")}</span>
  </div>`;
}

/* ---------- which rows ----------
   This season only, the same rule and the same reason as trackerRow(): the SN5
   archive is a finished season kept on its own reference tab, and a blueprint
   for a season already built is not a blueprint.

   And this season's DELIVERABLES only. An R&D part — a coupon, a test panel, a
   layup trial, a mold shakedown — is a real part with real carbon and a real
   deadline, but it is not a thing the team committed to putting on the car, and
   a blueprint that lists it is overstating what the season is. It stays fully
   visible on Parts, on Work Orders and on the dashboard; this is the one tab it
   is kept off, and the count below says how many so the rows never simply
   vanish.

   inSeason() fuses both tests on purpose — see its note in core.js. Never spell
   out `!p.retro && !isRnd(p)` here or anywhere else.

   NEVER "fix" this by prefixing a part's NAME with "R&D — ". Sync.gs matches
   rows on the Part Name column, so a rename orphans the part's row in Nick's
   Master Tracker and tints it amber forever; partOf() falls back to a name
   match, so it silently unlinks the part from its work order; and nameTier()
   gives one label line only 20 characters, so six characters of prefix pushes
   most names to two lines and deletes the mid row from the printed label. */
function seasonRows() {
  let rows = (DB.parts || []).filter(inSeason);
  if (view.seasonSub) rows = rows.filter(p => p.subteam === view.seasonSub);
  const q = (view.seasonQ || "").toLowerCase().trim();
  if (q) rows = rows.filter(p => `${p.partName || ""} ${p.id}`.toLowerCase().includes(q));
  return seasonSorted(rows);
}

/* Sorting reuses PART_SORT_COLS for the keys it already knows — its stage
   comparators sort by position in the enum rather than alphabetically, which is
   the difference between "Machining" sitting between "Not Started" and "Sealed"
   and sitting after both. The rest are added here.

   The extras outlive the columns they were written for, on purpose. They are
   cheap, seasonSortVal still exercises them, and a field that comes back onto
   the line later should not also need its comparator written again.

   Tie-break copied from sortedPartRows: deadline, then id, always ascending, so
   two rows that compare equal never swap places between renders. */
const SEASON_SORT_EXTRA = {
  layupSchedule: p => String(p.layupSchedule || "").toLowerCase(),
  moldLocation: p => String(p.moldLocation || "").toLowerCase(),
  moldEngineer: p => String(p.moldEngineer || "").toLowerCase(),
  manufacturingEngineer: p => String(p.manufacturingEngineer || "").toLowerCase(),
  comments: p => String(p.comments || "").toLowerCase(),
  // Unweighed sorts last either way, rather than reading as zero grams.
  weightG: p => { const n = parseFloat(p.weightActualG || p.weightG); return isNaN(n) ? Infinity : n; },
  /* Not a stored field: the derived word the chip shows, ordered worst first so
     "what is in trouble" is one choice from the menu rather than a scan. */
  status: p => ["st-bad", "st-0", "st-mid", "st-na", "st-done"].indexOf(seasonStatus(p).cls),
};
/* Only what is on screen is offered. A sort by a value you cannot see teaches
   nothing: you get a reordered list and no way to tell why it reordered. */
const SEASON_SORT_LABELS = {
  layupDeadline: "Sort: Deadline", status: "Sort: Status", partName: "Sort: Part",
  subteam: "Sort: Subteam", cadProgress: "Sort: CAD", moldProgress: "Sort: Mold",
  layupProgress: "Sort: Layup", group: "Group: subteam",
};
function seasonSortVal(p, key) {
  if (SEASON_SORT_EXTRA[key]) return SEASON_SORT_EXTRA[key](p);
  const f = typeof PART_SORT_COLS === "object" && PART_SORT_COLS[key];
  if (f) return f(p);
  return String(p[key] ?? "").toLowerCase();
}
function seasonSorted(rows) {
  const key = view.seasonSort;
  const dir = view.seasonDir === "desc" ? -1 : 1;
  const out = rows.slice();
  out.sort((a, b) => {
    if (key) {
      const av = seasonSortVal(a, key), bv = seasonSortVal(b, key);
      if (av !== bv) return (av > bv ? 1 : -1) * dir;
    }
    const ad = a.layupDeadline || "9999", bd = b.layupDeadline || "9999";
    if (ad !== bd) return ad.localeCompare(bd);
    return cmpId(a.id, b.id);
  });
  return out;
}
function seasonSortBy(key) {
  if (view.seasonSort === key) view.seasonDir = view.seasonDir === "desc" ? "asc" : "desc";
  else { view.seasonSort = key; view.seasonDir = "asc"; }
  render();
}
function toggleSeasonSortDir() { view.seasonDir = view.seasonDir === "desc" ? "asc" : "desc"; render(); }
function resetSeasonFilters() {
  view = { ...view, seasonSub: "", seasonQ: "", seasonSort: null, seasonDir: null };
  render();
}

/* One header per run of a subteam, when "Group: subteam" is chosen.

   Counted over the rows this tab shows, NOT over DB.parts. partGroupHead() in
   parts.js looks like this and is not interchangeable with it: its denominator
   is every part, retro and R&D included, so reusing it here would print "3 of
   31 laid up" above a heading listing four. That is the same shape as the bug
   where the blueprint photographed empty because every fixture was retro and
   nothing asserted on a count that was always zero. */
function seasonGroupHead(name, rows) {
  const late = rows.filter(p => typeof partLate === "function" && partLate(p)).length;
  const done = rows.filter(p => typeof partDone === "function" && partDone(p)).length;
  return `<div class="pgrouphd">
    <span class="pg-name">${esc(name || "No subteam")}</span>
    <span class="pg-n">${done}/${rows.length} laid up</span>
    ${late ? `<span class="pg-n pg-late">${icon("warning", 12)} ${late} late</span>` : ""}
  </div>`;
}

/* Rows in, sections out. Grouped, each subteam gets its own flow container, so
   a heading can never be stranded at the foot of one column with its rows in
   the next — which is the one thing a multi-column layout will do to you if you
   let a single flow carry both. */
function seasonBody(rows, grouped) {
  if (!grouped) return `<div class="seasongrid">${rows.map(seasonLine).join("")}</div>`;
  let out = "", run = null, bucket = [];
  const flush = () => {
    if (!bucket.length) return;
    out += `<section class="sgroup">${seasonGroupHead(run, bucket)}
      <div class="seasongrid">${bucket.map(seasonLine).join("")}</div></section>`;
    bucket = [];
  };
  rows.forEach(p => {
    const g = p.subteam || "";
    if (g !== run) { flush(); run = g; }
    bucket.push(p);
  });
  flush();
  return out;
}

/* ---------- laying out a season ----------
   The tab is a read, and this is the one thing on it that still writes —
   because what it writes is not work anybody signs for. A part with nothing in
   it but a name carries no buy-off, no signature and no claim that anything has
   been done. It is a commitment to build the thing, which is what a blueprint
   row has always been.

   It exists at all because "+ Row" did, and the reason "+ Row" existed has not
   gone away: laying out a season means typing twenty names, and twenty names
   must not cost twenty round trips through a detail page. So the bulk form is
   what the in-place row became — one textarea, one id block, one action, and
   twenty names is now cheaper than it ever was in the table.

   allocIds() is the whole point of doing it this way. It takes the ids in one
   transaction (the rules cap a counter write at +50, so twenty is a single
   write) instead of twenty, which is the difference between a list that commits
   and one that dies half written on the shop wifi at RFS. */
function openSeasonLayout() {
  openModal(`<h2>Lay out the season</h2>
    <p class="muted">One part per line. A name is enough to start — the stack, the mold and
      the runs come later, on each part's own page.</p>
    <div class="f"><label>Parts</label>
      <textarea id="sl-names" rows="10" autofocus placeholder="Nosecone
Undertray
Side panel L
Side panel R"></textarea></div>
    <p class="muted tny">Blank lines are skipped, and so is a name already on this season's
      blueprint — running it twice does not give you the season twice.</p>
    <div class="row">
      <button class="primary" onclick="submitSeasonLayout()">Create the parts</button>
      <button onclick="closeModal()">Cancel</button>
    </div>`);
}

async function submitSeasonLayout() {
  /* Read the whole form BEFORE awaiting anything. allocIds' offline fallback
     opens a modal, and openModal() replaces whatever is on screen — including
     the form these names are still sitting in. The same rule as every other
     create path here; it is written on allocId itself. */
  const raw = String((document.getElementById("sl-names") || {}).value || "");
  const have = new Set((DB.parts || []).filter(inSeason)
    .map(p => String(p.partName || "").trim().toLowerCase()).filter(Boolean));
  const names = [];
  for (const line of raw.split("\n")) {
    const n = line.trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (have.has(k)) continue;      // already on the blueprint, so running twice is safe
    have.add(k);                    // and a name repeated inside one paste is one part
    names.push(n);
  }
  if (!names.length) { toast("No new names in there.", "info"); return; }

  const ids = await allocIds("parts", null, names.length);
  if (ids.length < names.length) {
    toast(`Only ${ids.length} of ${names.length} IDs came back. Nothing was written — try again when you are back online.`, "error");
    return;
  }
  const made = names.map((n, i) => {
    const p = seasonBlankPart(ids[i]);
    p.partName = n;
    return p;
  });
  /* One save() per part rather than importMany(), deliberately. save() is what
     drives pubSync and trackerSync, so every new row reaches the public
     nameplate and the Master Tracker feed with no second write path to keep
     correct — and the feed republish is debounced, so twenty parts is still one
     publish. A season is laid out once; this is not the path worth optimising. */
  for (const p of made) { (DB.parts = DB.parts || []).push(p); save("parts", p); }
  closeModal();
  render();
  toast(`${made.length} part${made.length === 1 ? "" : "s"} on the blueprint. Open one to give it a stack, a mold and its runs.`);
}

/* createBlankPart() allocates its own id and writes immediately, which is right
   for one part off a button and wrong for twenty off a block. This is that same
   record with the id handed in and the write left to the caller. Two literals
   is a real risk — it is exactly what createBlankPart's own header warns about
   — so a test asserts the two shapes agree field for field. */
function seasonBlankPart(id) {
  return {
    id, partName: "", subteam: "AERO", layupType: "MOLD INFUSION",
    layupSchedule: "", moldLocation: "RFS", moldEngineer: "", manufacturingEngineer: "",
    cadProgress: "Not Started", moldProgress: "Not Started", layupProgress: "Not Started",
    weightG: "", weightActualG: "", layupDeadline: "", comments: "", commentLog: [],
    workOrderId: "", layupStack: [], retro: false, rnd: false,
    createdBy: myEmail(),
  };
}

/* ---------- the tab ---------- */
function renderSeason() {
  const rows = seasonRows();
  /* THE DENOMINATOR MUST APPLY THE SAME TEST AS THE ROWS. Filter seasonRows()
     and not this and the toolbar reports parts it is not showing — the quiet
     sibling of the release where the blueprint photographed empty because every
     fixture was retro and nothing asserted on a count that was always zero. */
  const all = (DB.parts || []).filter(inSeason);
  const named = all.filter(p => String(p.partName || "").trim()).length;
  const rnd = (DB.parts || []).filter(p => !p.retro && isRnd(p)).length;
  const sortKey = view.seasonSort || "layupDeadline";

  return `
  <div class="toolbar no-print">
    <button class="primary"${gx("Sign in to lay out the season.")} onclick="openSeasonLayout()">Lay out the season</button>
    ${/* R&D is stated, not silently subtracted. A row that disappears with
          nothing on screen to explain it reads as data loss; a count that names
          it and offers the way to it reads as a decision. */""}
    <span class="muted tny" style="margin-left:auto">${rows.length} of ${all.length} parts${
      named < all.length ? ` · ${all.length - named} unnamed` : ""}${
      rnd ? ` · <button class="link sm" title="R&D parts are real work, kept off the blueprint. Show them on Parts." onclick="view={...view,onlyRnd:true};setTab('parts')">${rnd} R&amp;D</button>` : ""}</span>
  </div>
  <div class="filters no-print">
    <input id="searchbox" placeholder="search name / id…" value="${esc(view.seasonQ || "")}" oninput="view.seasonQ=this.value;render()">
    <select title="Subteam" onchange="view.seasonSub=this.value;render()">
      <option value="">All subteams</option>
      ${SUBTEAMS.map(s => `<option ${view.seasonSub === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
    </select>
    <select title="Sort by" onchange="seasonSortBy(this.value)">
      ${Object.keys(SEASON_SORT_LABELS).map(k => `<option value="${k}" ${sortKey === k ? "selected" : ""}>${esc(SEASON_SORT_LABELS[k])}</option>`).join("")}
    </select>
    <button class="sm sortdir" title="Reverse sort order" onclick="toggleSeasonSortDir()">${view.seasonDir === "desc" ? "▼" : "▲"}</button>
    <button class="sm sortdir" title="Clear filters" onclick="resetSeasonFilters()">✕</button>
  </div>
  <div class="card">
    ${/* A wrapping multi-column flow, NOT a scroller. Down-then-across is the
          reading order of a sorted list, and a flow that wraps cannot overflow
          sideways at all — which is what the UI suite fails on, and what the
          thirteen-column table did at every width it was ever opened at. */""}
    ${rows.length ? seasonBody(rows, sortKey === "group") : `<p class="muted">${all.length
      ? "Nothing matches these filters."
      : "No parts yet. <b>Lay out the season</b> — a list of names is enough to start."}</p>`}
  </div>
  <p class="muted tny no-print">A line here is a real part: open it on <button class="link" onclick="setTab('parts')">Parts</button>
    to give it a stack, a mold and its runs, and to change anything — the blueprint itself is a read.
    The Composites Master Tracker sheet is a mirror this app publishes to every 15 minutes,
    so edits made there are overwritten on the next publish.</p>`;
}
