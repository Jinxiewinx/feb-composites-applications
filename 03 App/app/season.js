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
   is filling those fields in, here or on the Parts tab. That also means a
   blueprint row is immediately linkable, schedulable and countable, which a
   placeholder in a second collection would not have been.

   WHY THIS IS NOT THE PARTS TAB. Parts is a rail plus one open record: the
   working view, for when you are doing something to one part. This is the
   planning view, for when the question is about the season rather than about a
   part — who has nothing assigned, which subteam is behind, what has no
   deadline. Same records, and the two are meant to overlap the way Schedule
   and Work Orders do.

   THE FEED IS DOWNSTREAM NOW. tracker.js publishes the parts list to a
   document the Master Tracker's Apps Script pulls every 15 minutes, so the
   sheet still updates itself — but it is a mirror, and an edit made there is
   overwritten on the next publish. The tab says so out loud, because somebody
   will try it in week three.

   SEASON_COLS IS DELIBERATELY NOT TRACKER_FIELDS. See the note above it. */

/* The columns, in the Master Tracker's own order with ONE move: Part Name goes
   first so it can be the sticky column. The sheet has it fourth, which works on
   paper and does not work in a scroller — scroll right past column five and you
   no longer know whose row you are editing, which is the entire failure the
   sticky column exists to prevent. Everything after it keeps the sheet's order.

   ---------------------------------------------------------------------------
   THIS LIST IS NOT tracker.js's TRACKER_FIELDS, AND MUST NOT BECOME IT.
   TRACKER_FIELDS is the whitelist for a document served over a URL that needs
   no login; its own header calls it a security boundary. If this array were
   derived from it, or if someone widened that one to add a column here, the
   public feed would widen silently along with the UI. They are two lists that
   happen to agree today, and a test pins TRACKER_FIELDS literally so it can
   only change on purpose. Add a column here freely; adding one there is a
   disclosure decision.
   --------------------------------------------------------------------------- */
const SEASON_COLS = [
  { key: "partName", label: "Part", head: "sticky", type: "text", ph: "name it" },
  { key: "cadProgress", label: "CAD", type: "stage" },
  { key: "moldProgress", label: "Mold", type: "stage" },
  { key: "layupProgress", label: "Layup", type: "stage" },
  { key: "subteam", label: "Subteam", type: "select", opts: () => SUBTEAMS },
  { key: "layupType", label: "Layup type", type: "select", opts: () => LAYUP_TYPES },
  { key: "layupSchedule", label: "Schedule", type: "text" },
  { key: "moldLocation", label: "Mold loc.", type: "text" },
  { key: "moldEngineer", label: "Mold eng.", type: "person" },
  { key: "manufacturingEngineer", label: "Mfg eng.", type: "person" },
  { key: "weightG", label: "Weight (g)", type: "num" },
  { key: "comments", label: "Comments", type: "text" },
  { key: "layupDeadline", label: "Deadline", type: "date" },
];

function seasonCol(key) { return SEASON_COLS.find(c => c.key === key); }
function seasonCellId(id, key) { return `sq-${id}-${key}`; }

/* ---------- writes ----------
   One field, no render. updPart() cannot be reused: it reads partById(view.id)
   — the ONE open record — and re-renders the page. In a table every row is a
   different part, and a render on change destroys the cell Tab is moving into,
   which is the lesson the BOM grid in parts.js already records.

   So nothing on screen moves at all: the control already shows what the user
   typed, and the record now agrees with it. Stages are the exception and go
   through seasonStage, which DOES render — a gate or a confirm is exactly when
   the table should stop being typed into. save() debounces the Google Sheet
   republish by four seconds, so a row's worth of edits is one publish. */
function seasonUpd(id, key, val) {
  const p = partById(id);
  if (!p) return;
  p[key] = val;
  save("parts", p, key);
}

/* A stage is never a plain field write. setPartStage() carries the evidence
   gate (CS-003 wants a photo or a signed step before some values), the
   skip-ahead confirm and the move-back confirm — all three are the reason the
   stage means anything, and all three would be bypassed by seasonUpd.

   It re-renders when it acts, which is right here: a gate opening a modal or a
   confirm is exactly when the table SHOULD stop being typed into. When it
   refuses, the select is left showing the value the user picked, so put it
   back. */
function seasonStage(id, key, sel) {
  const p = partById(id);
  const r = setPartStage(id, key, sel.value);
  if (r) {
    // Refused, or waiting on a confirm. The select is showing what the user
    // picked; the record is not, so put the control back to the truth.
    const st = partStageByKey(key);
    sel.value = (p && p[key]) || (st ? st.vals[0] : "");
    return;
  }
  render();
}

/* One click, one row, and the cursor in the name — laying out a season means
   typing twenty names, not opening twenty modals. */
async function seasonAddRow() {
  const p = await createBlankPart();
  if (!p) return;
  render();
  const el = document.getElementById(seasonCellId(p.id, "partName"));
  if (el && el.focus) { el.focus(); if (el.select) el.select(); }
}

/* ---------- which rows ----------
   This season only, the same rule and the same reason as trackerRow(): the SN5
   archive is a finished season kept on its own reference tab, and a blueprint
   for a season already built is not a blueprint. */
function seasonRows() {
  let rows = (DB.parts || []).filter(p => !p.retro);
  if (view.seasonSub) rows = rows.filter(p => p.subteam === view.seasonSub);
  const q = (view.seasonQ || "").toLowerCase().trim();
  if (q) rows = rows.filter(p => `${p.partName || ""} ${p.id}`.toLowerCase().includes(q));
  return seasonSorted(rows);
}

/* Sorting reuses PART_SORT_COLS for the six keys it already knows — its stage
   comparators sort by position in the enum rather than alphabetically, which is
   the difference between "Machining" sitting between "Not Started" and "Sealed"
   and sitting after both. The rest are added here.

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
function resetSeasonFilters() {
  view = { ...view, seasonSub: "", seasonQ: "", seasonSort: null, seasonDir: null };
  render();
}

/* ---------- one cell ----------
   Every control writes on `change`, not on `input`: a keystroke-by-keystroke
   save on thirteen columns would be a write per character and a feed republish
   per row. Blur or Enter is when a person has finished saying the thing. */
function seasonCell(p, col) {
  const id = seasonCellId(p.id, col.key);
  const v = p[col.key] ?? "";
  const go = `seasonUpd('${esc(p.id)}','${col.key}',this.value)`;

  if (col.type === "stage") {
    const st = partStageByKey(col.key);
    const cur = v || st.vals[0];
    /* The wrapper carries the class and the id, because that is the shape every
       .statusdrop colour rule in the stylesheet is written against — the
       control is .statusdrop.<state> select, never a classed select. */
    return `<span id="${id}" class="statusdrop ${stageClass(cur, st.vals)}">
      <select onchange="seasonStage('${esc(p.id)}','${col.key}',this)">
        ${st.vals.map(o => `<option ${cur === o ? "selected" : ""}>${esc(o)}</option>`).join("")}
      </select></span>`;
  }
  if (col.type === "select") {
    const opts = col.opts();
    return `<select id="${id}" onchange="${go}">
      ${opts.map(o => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}
      ${v && !opts.includes(v) ? `<option selected>${esc(v)}</option>` : ""}
    </select>`;
  }
  if (col.type === "person") {
    /* Names, not emails. partEngineers(), partHasEngineer() and trackerRow()
       all treat these as free text and fall back to a name match, so an email
       here would break the engineer filter, the avatar row and the sheet.

       The blank option and the keep-what-is-there option both matter: the SN5
       tracker carries bare first names that are on nobody's roster, and without
       the second option opening this tab would silently blank the cell the
       first time anyone touched the row. */
    const people = typeof usersSorted === "function" ? usersSorted() : [];
    const names = people.map(u => u.name || u.email);
    return `<select id="${id}" onchange="${go}">
      <option value="" ${v ? "" : "selected"}>—</option>
      ${names.map(n => `<option ${v === n ? "selected" : ""}>${esc(n)}</option>`).join("")}
      ${v && !names.includes(v) ? `<option selected>${esc(v)}</option>` : ""}
    </select>`;
  }
  if (col.type === "date") return `<input id="${id}" type="date" value="${esc(v)}" onchange="${go}">`;
  if (col.type === "num") return `<input id="${id}" inputmode="decimal" value="${esc(v)}" onchange="${go}">`;
  return `<input id="${id}" value="${esc(v)}"${col.ph ? ` placeholder="${esc(col.ph)}"` : ""} onchange="${go}">`;
}

function seasonHead(col) {
  const on = view.seasonSort === col.key;
  const arrow = on ? (view.seasonDir === "desc" ? " ▾" : " ▴") : "";
  return `<th class="sortable${col.head === "sticky" ? " mtxperson" : ""}"
    onclick="seasonSortBy('${col.key}')" title="Sort by ${esc(col.label)}">${esc(col.label)}${arrow}</th>`;
}

function renderSeason() {
  const rows = seasonRows();
  const all = (DB.parts || []).filter(p => !p.retro);
  const named = all.filter(p => String(p.partName || "").trim()).length;
  return `
  <div class="toolbar no-print">
    <button class="primary" onclick="seasonAddRow()">+ Row</button>
    <span class="muted tny" style="margin-left:auto">${rows.length} of ${all.length} parts${
      named < all.length ? ` · ${all.length - named} unnamed` : ""}</span>
  </div>
  <div class="filters no-print">
    <input id="searchbox" placeholder="search name / id…" value="${esc(view.seasonQ || "")}" oninput="view.seasonQ=this.value;render()">
    <select title="Subteam" onchange="view.seasonSub=this.value;render()">
      <option value="">All subteams</option>
      ${SUBTEAMS.map(s => `<option ${view.seasonSub === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
    </select>
    <button class="sm sortdir" title="Clear filters" onclick="resetSeasonFilters()">✕</button>
  </div>
  <div class="card">
    ${/* .mtxwrap owns the sideways scroll and makes column one sticky — the same
          recipe the People matrix uses. It is also load-bearing for the UI
          suite, which fails any horizontal overflow of <main> and exempts only
          what is inside a scroller. Thirteen columns outside it fails at every
          width. */""}
    <div class="mtxwrap">
      <table class="list dash mtx season">
        <tr>${SEASON_COLS.map(seasonHead).join("")}</tr>
        ${rows.map(p => `<tr data-id="${esc(p.id)}">
          ${SEASON_COLS.map(c => `<td>${seasonCell(p, c)}</td>`).join("")}
        </tr>`).join("")}
      </table>
    </div>
    ${rows.length ? "" : `<p class="muted">${all.length
      ? "Nothing matches these filters."
      : "No parts yet. <b>+ Row</b> for each thing the team means to make — a name is enough to start."}</p>`}
  </div>
  <p class="muted tny no-print">A row here is a real part: open it on <button class="link" onclick="setTab('parts')">Parts</button>
    to give it a stack, a mold and its runs. The Composites Master Tracker sheet is a mirror this app publishes to
    every 15 minutes — edits made there are overwritten on the next publish, so make them here.</p>`;
}
