"use strict";
/* molds.js — the Molds tab: molds and their stack plans as one master–detail
   split.

   WHY ONE TAB FOR MOLDS AND PLANS. A stack plan is a mold's file, not a record
   beside it — Simon: "you can condense molds and stock plans, they function the
   same... there should only be an option to make a mold." So the mold carries
   currentPlanId, plans are reached through their mold, and one + Mold button
   opens the planner (which can also just record a mold with no geometry, for
   an SN5 tool being catalogued). The one exception on the rail is a plan whose
   mold is missing, which has nothing to be reached through and would otherwise
   be invisible.

   WHY BOARDS ARE NOT HERE. They used to be, as a third rail group. A board is
   a thing on a shelf, though, and Inventory is where the shelves are — it had
   already been bucketing DB.stock by location for its storage map and its
   contents pages. Only the list sat here. It now lives in Inventory beside
   Items list and Materials list (see the Boards section of stock.js); Molds
   keeps one number, the m² on hand, as a tile that opens it. A mold's "cut
   from board" chip and a scanned BRD- label still resolve — moldsOrBoardsFor
   in core.js routes them to Inventory, so nothing dead-ends the way it did
   before boards had a detail page at all.

   SHAPE. The Parts tab's split, transcribed rather than abstracted: a
   persistent rail on the left, the selected record on the right, the season
   view when nothing is picked. ↑/↓ or j/k walk the rail, `1` advances the
   selected mold one named stage through the same quickAdvance the detail
   button uses, `/` searches, esc clears. At or below 900px the same markup
   collapses to list-then-detail via `has-sel`, exactly like parts.js — see the
   responsive block in index.html.

   WHAT LIVES WHERE. The mold pane is renderShopDetail("molds") embedded, plus
   its plan's artifacts when one is linked. The plan pane is renderStackPlan(),
   reached for a plan with no mold to be shown through. The cut list keeps its
   full-width takeover: it is a batch print artifact, not a record.

   The old `stock` TABS row survives hidden, so #/stock links, stored
   notification links and every test literal keep resolving. Collections,
   prefixes and rules are untouched. */

function moldRecById(id) { return (DB.molds || []).find(m => m.id === id); }

/* ---------- selection ---------- */
function moldsSelected() {
  if (view.mode !== "detail" && view.mode !== "plan") return null;
  const id = String(view.id || "");
  if (id.startsWith("MOLD-")) return { kind: "mold", rec: moldRecById(id) };
  // Boards are Inventory's now — moldsOrBoardsFor sends a BRD- or SZ: id
  // there, so one arriving here is stale and falls through to the overview.
  if (id.startsWith("STK-")) return { kind: "plan", rec: planById(id) };
  return null;
}
function selectMoldsRec(id) {
  view = { ...view, mode: "detail", id, edit: false };
  render();
  const el = document.getElementById("pi-" + id);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
}
function clearMoldsSelection() { view = { ...view, mode: "list", id: null, edit: false }; render(); }

/* ---------- the rail rows ----------
   One flat, ordered array of everything the rail shows, so keyboard walking
   and rendering can never disagree about what is next. Group headers are
   drawn by the body renderer and are not rows. */
function moldStagePct(m) {
  const i = MOLD_STAGE.indexOf(m.stage);
  if (i <= 0) return 0;
  return Math.round((i / (MOLD_STAGE.length - 2)) * 100);   // Retired is off the track
}
function moldStageMarkClass(m) {
  const cls = shopStageClass(SHOP.molds, m);
  return cls === "Cancelled" ? "st-na" : cls === "Complete" ? "st-done" : cls === "Draft" ? "st-0" : "st-mid";
}
function moldsRailRows() {
  const q = (view.q || "").toLowerCase();
  const has = (o, extra) => !q || (JSON.stringify(o) + " " + (extra || "")).toLowerCase().includes(q);

  let molds = (DB.molds || [])
    .filter(m => view.fRetired ? true : m.stage !== "Retired")
    .filter(m => !view.fStatus || m.stage === view.fStatus)
    .filter(m => has(m))
    .sort((a, b) => (MOLD_STAGE.indexOf(a.stage) - MOLD_STAGE.indexOf(b.stage)) || String(a.name || a.id).localeCompare(String(b.name || b.id)));

  /* Stack plans are NOT a rail group any more. A plan is a mold's file, not a
     record in its own right — Simon: "there should only be an option to make a
     mold." An orphaned plan (made before molds were created automatically) is
     the one exception: it has no mold to be reached through, so it still shows
     until somebody adopts it. */
  let plans = (DB.stackplans || [])
    .filter(p => !p.moldId || !moldRecById(p.moldId))
    .filter(p => has(p))
    .slice().sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));

  /* The selected record never falls out from under you — same rule as the
     Parts rail, and the reason a filter can't blank the pane you are reading. */
  const sel = moldsSelected();
  if (sel && sel.rec) {
    const lists = { mold: molds, plan: plans };
    const l = lists[sel.kind];
    if (l && !l.includes(sel.rec)) l.push(sel.rec);
  }
  return { molds, plans };
}
function moldsFlatRows() {
  const { molds, plans } = moldsRailRows();
  return [...molds, ...plans];
}

function moldsRailItem(kind, o) {
  const selId = (view.mode === "detail" || view.mode === "plan") ? view.id : null;
  const sel = selId === o.id;
  const open = `selectMoldsRec('${esc(o.id)}')`;
  if (kind === "mold") {
    const done = o.stage === "Retired";
    return `<div class="pitem ${sel ? "sel" : ""} ${done ? "isdone" : ""}" id="pi-${esc(o.id)}" role="option" aria-selected="${sel}"
        title="${esc(o.id)} · ${esc(o.stage || "")}" onclick="${open}">
      <span class="pi-name">${esc(o.name || o.id)}</span>
      <span class="pi-due">${o.location ? `<span class="tny muted">${esc(((n => n.length > 18 ? n.slice(0, 17) + "…" : n)((shopById("items", o.location) || {}).name || String(o.location))))}</span>` : ""}</span>
      <span class="pi-sub"><span class="prog3"><span class="sg ${moldStageMarkClass(o)}" title="${esc(o.stage || "")}"><b>M</b><i style="width:${moldStagePct(o)}%"></i></span></span><span class="tny">${esc(o.stage || "")}</span></span>
      <span class="pi-who">${Number(o.uses) ? `<span class="tny muted">${esc(o.uses)} uses</span>` : ""}</span>
    </div>`;
  }
  if (kind === "plan") {
    const blocks = (o.layers || []).reduce((n, L) => n + (L.blanks || []).length, 0);
    return `<div class="pitem ${sel ? "sel" : ""}" id="pi-${esc(o.id)}" role="option" aria-selected="${sel}"
        title="${esc(o.id)}" onclick="${open}">
      <span class="pi-name">${esc(o.name || o.id)}${(o.warnings || []).length ? ` ${icon("warning", 12)}` : ""}</span>
      <span class="pi-due"><span class="tny muted">${fmtWhen(o.ts)}</span></span>
      <span class="pi-sub"><span class="tny">${(o.layers || []).length} layers · ${blocks} blocks</span></span>
      <span class="pi-who">${o.moldId ? `<span class="tny muted">${esc(o.moldId)}</span>` : `<span class="tny muted">no mold</span>`}</span>
    </div>`;
  }
  return "";
}

function moldsGroupHead(name, bits) {
  return `<div class="pgrouphd"><span class="pg-name">${esc(name)}</span>${
    bits.filter(Boolean).map(b => `<span class="pg-n">${b}</span>`).join("")}</div>`;
}

function renderMoldsRail() {
  const { molds, plans } = moldsRailRows();
  const allMolds = DB.molds || [];
  const retired = allMolds.filter(m => m.stage === "Retired").length;
  const ready = allMolds.filter(m => m.stage === "Ready for layup").length;
  const noHome = allMolds.filter(m => m.stage !== "Retired" && !m.location).length;
  const planWarn = (DB.stackplans || []).filter(p => (p.warnings || []).length).length;
  const total = molds.length + plans.length;
  const sel = moldsSelected();

  return `
  <aside class="mdindex" aria-label="Molds index">
    <div class="pindex-head no-print">
      <div class="toolbar">
        <button class="primary ib" onclick="uploadMold()">+ Mold</button>
      </div>
      <div class="toolbar">
        ${(DB.stackplans || []).length ? `<button class="ib" onclick="view={...view,mode:'cuts',cutSel:''};render()">${icon("print", 15)} Cut list</button>` : ""}
        ${(allMolds.length + (DB.stock || []).length) ? `<button class="ib" onclick="openLabelBuilder('molds')">${icon("print", 15)} Labels</button>` : ""}
      </div>
      <div class="psum">
        ${retired ? `<button class="psum-chip ${view.fRetired ? "on" : ""}" onclick="view.fRetired=!view.fRetired;render()"><b>${retired}</b> retired</button>` : ""}
        ${noHome ? `<button class="psum-chip ${view.fStatus === "" && view.fNoHome ? "on" : ""} bad" title="Molds with no home location"
          onclick="view.fNoHome=!view.fNoHome;render()"><b>${noHome}</b> no home</button>` : ""}
      </div>
      <div class="pfilters">
        <input id="searchbox" placeholder="search molds / plans / id…" value="${esc(view.q || "")}" oninput="searchInput(this)">
        <select title="Mold stage" onchange="view.fStatus=this.value;render()">
          <option value="">All stages</option>
          ${MOLD_STAGE.map(s => `<option ${view.fStatus === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="plist" role="listbox" aria-label="Molds and plans">
      ${total === 0 ? `<div class="pempty muted">${
        (DB.molds || []).length ? "Nothing matches these filters."
        : "Nothing here yet — <b>+ Mold</b>, or import the SN5 molds with <b>Find molds in work orders</b> under Reports."}</div>` : ""}
      ${molds.length || (DB.molds || []).length ? moldsGroupHead("Molds", [
        `${ready} ready`, noHome ? `${noHome} no home` : "", `${molds.length} shown`]) : ""}
      ${molds.filter(m => !view.fNoHome || !m.location).map(m => moldsRailItem("mold", m)).join("")}
      ${plans.length ? moldsGroupHead("Plans with no mold", [
        `${plans.length}`, planWarn ? `${icon("warning", 12)} ${planWarn}` : ""]) : ""}
      ${plans.map(p => moldsRailItem("plan", p)).join("")}
      <div class="plistfade" aria-hidden="true"></div>
    </div>
    <div class="keyhint no-print muted tny"><span><kbd>↑</kbd><kbd>↓</kbd> move</span>${
      sel && sel.kind === "mold" ? "<span><kbd>1</kbd> advance stage</span>" : ""
    }<span><kbd>/</kbd> search</span>${sel && sel.kind === "mold" ? "<span><kbd>e</kbd> edit</span>" : ""}<span><kbd>esc</kbd> back</span></div>
  </aside>`;
}

/* ---------- the season view (nothing selected) ---------- */
/* One stagebreak bar for the live molds, MOLD_STAGE order with Retired off
   the track. Two callers: the Molds season pane and the Dashboard's Season
   panel. Extracted rather than duplicated so the two can never disagree. */
function moldsStageBar(liveMolds) {
  const live = liveMolds || (DB.molds || []).filter(m => m.stage !== "Retired");
  const counts = MOLD_STAGE.slice(0, -1).map(s => live.filter(m => m.stage === s).length);
  const tot = counts.reduce((a, b) => a + b, 0) || 1;
  const segCls = i => i === 0 ? "st-0" : i >= MOLD_STAGE.length - 2 ? "st-done" : "st-mid";
  return `<div class="stagebreak">
    <div class="sb-label">Molds</div>
    <div class="sb-bar">${counts.map((n, i) => n ? `<span class="sb-seg ${segCls(i)}" style="width:${(n / tot) * 100}%" title="${n} ${esc(MOLD_STAGE[i])}"></span>` : "").join("")}</div>
    <div class="sb-nums tny">${counts.map((n, i) => n ? `<span class="${i === 0 ? "muted" : i >= MOLD_STAGE.length - 2 ? "done" : "mid"}">${n} ${esc(MOLD_STAGE[i].toLowerCase())}</span>` : "").filter(Boolean).join(" · ") || '<span class="muted">no live molds</span>'}</div>
  </div>`;
}

function moldsOverview() {
  const molds = DB.molds || [];
  const live = molds.filter(m => m.stage !== "Retired");
  const ready = live.filter(m => m.stage === "Ready for layup").length;
  const noHome = live.filter(m => !m.location).length;
  const m2 = (DB.stock || []).reduce((n, b) => n + boardAreaM2(b), 0);

  const tile = (n, label, cls) => `<div class="stat-tile"><div class="bignum ${cls || ""}">${n}</div><div class="stat-label">${esc(label)}</div></div>`;
  /* The one board number Molds still carries. The rack itself is Inventory's
     now, but "have we got board" is a mold-making question, so the headline
     stays here and the tile is the way through to the list. */
  const boardTile = `<div class="stat-tile" role="button" tabindex="0" title="Open the rack in Inventory"
      onclick="view={...view,tab:'inventory',invView:'boards',mode:'list',id:null,q:''};render();syncUrl()">
    <div class="bignum">${m2.toFixed(1)}</div><div class="stat-label">m² board on hand ▸</div></div>`;

  // Where the live molds stand, MOLD_STAGE order — the parts-tab bar idiom.
  // Shared with the Dashboard's Season panel, so it lives in its own function.
  const stageBar = moldsStageBar(live);

  /* Enough board for what is planned? The same math as the cut list's header,
     summarised to one sentence — the full per-board diagrams stay behind the
     Cut list button. */
  let shortLine = "";
  const blanks = (typeof blanksFromPlans === "function" && (DB.stackplans || []).length) ? blanksFromPlans(DB.stackplans) : [];
  if (blanks.length) {
    const res = packAll(blanks, boardsForPacking(), {});
    shortLine = res.shortfall.length
      ? `<div class="warn">${icon("warning", 14)} <b>Short ${res.shortfall.length} blank${res.shortfall.length === 1 ? "" : "s"}</b> across the planned molds — nothing on the rack fits them. Open the cut list for the sizes.</div>`
      : `<div class="muted">Every planned blank fits the rack: ${blanks.length} blanks across ${res.boardsUsed} board${res.boardsUsed === 1 ? "" : "s"}.</div>`;
  }

  // Plans that predate the auto-created mold record, offered for adoption.
  const unlinked = (DB.stackplans || []).filter(p => !p.moldId);

  return `
  <section class="mddetail" aria-label="Molds overview">
    <div class="stat-row">
      ${tile(live.length, "Molds")}${tile(ready, "Ready for layup")}${tile(noHome, "No home location", noHome ? "warn" : "")}${boardTile}
    </div>
    <div class="card">
      <h2>Mold making this season</h2>
      <div class="muted">${live.length} live mold${live.length === 1 ? "" : "s"} · ${(DB.stackplans || []).length} stack plan${(DB.stackplans || []).length === 1 ? "" : "s"}. Pick anything on the left to open it.</div>
      ${stageBar}
      ${shortLine}
    </div>
    ${unlinked.length && isLead() ? `<div class="card">
      <h3>Plans with no mold record</h3>
      <div class="muted tny">Made before planning started creating the mold record automatically. Link each to the mold it became, or create one from it.</div>
      ${unlinked.map(p => `<div class="pmini" onclick="selectMoldsRec('${esc(p.id)}')">
        <span class="pm-name">${esc(p.name || p.id)}</span>
        <span class="pm-due muted tny">${fmtWhen(p.ts)}</span></div>`).join("")}
    </div>` : ""}
  </section>`;
}

/* ---------- plan pane ----------
   renderStackPlan() unchanged underneath; this wraps it as the right-hand pane
   and, for a plan that predates auto-created molds, offers the two adoption
   actions. The 3D viewer stays here — mvMount hooks this markup after render,
   and mounting it twice (here AND inside the mold pane) is the double-mount
   class of bug meshview.js documents. */
function moldsPlanPane(p) {
  if (!p) { view.mode = "list"; view.id = null; return moldsOverview(); }
  const owner = p.moldId ? moldRecById(p.moldId) : null;
  const adopt = !p.moldId && isLead() ? `<div class="card no-print">
    <b>No mold record is linked to this plan.</b>
    <div class="muted tny">Plans made before 2026-08 predate the automatic mold record.</div>
    <div class="toolbar" style="margin-top:6px">
      <button class="ib" onclick="createMoldFromPlan('${esc(p.id)}')">Create mold from this plan</button>
      <select onchange="if(this.value)linkPlanToMold('${esc(p.id)}',this.value)">
        <option value="">Link to an existing mold…</option>
        ${(DB.molds || []).map(m => `<option value="${esc(m.id)}">${esc(m.name || m.id)} · ${esc(m.id)}</option>`).join("")}
      </select>
    </div>
  </div>` : "";
  const cur = owner ? currentPlanFor(owner) : null;
  const superseded = cur && cur.id !== p.id;
  const ownerLine = owner ? `<div class="card no-print"><b>Mold:</b> <span class="chip" onclick="selectMoldsRec('${esc(owner.id)}')">${esc(owner.name || owner.id)}</span>
    <span class="muted tny">· stage ${esc(owner.stage || "—")}</span>
    ${superseded ? `<div class="warn" style="margin-top:6px">${icon("warning", 14)}
      <b>Superseded</b> by ${esc(cur.name || cur.id)}, planned ${fmtWhen(cur.ts)}. Do not cut from this one.
      ${isLead() ? `<button class="sm" style="margin-left:8px" onclick="makeCurrentPlan('${esc(owner.id)}','${esc(p.id)}')">Make this the current plan</button>` : ""}
    </div>` : ""}</div>` : "";
  return `<section class="mddetail" aria-label="Stack plan">${ownerLine}${adopt}${renderStackPlan()}</section>`;
}

async function createMoldFromPlan(planId) {
  const p = planById(planId);
  if (!p || p.moldId) return;
  const id = await allocId("molds");
  if (!id) return;
  const m = {
    id, name: p.name || p.id, stage: "Designed",
    density: String(canonDensity(p.density) ?? ""), layers: (p.thicknessesMm || []).length ? `${p.thicknessesMm.length} layers` : "",
    createdBy: myEmail(),
  };
  DB.molds.push(m);
  save("molds", m);
  p.moldId = id;
  save("stackplans", p, "moldId");
  setCurrentPlan(m, p.id);
  toast(`${m.name} created at “Designed” and linked to this plan.`);
  selectMoldsRec(id);
}
/* Re-plan an existing mold. The old plan is never deleted — it goes onto
   planHistory and stays openable, because somebody may already have cut from
   it and the drawings on the shop wall have its id on them. */
let MOLD_REPLAN = "";
function replanMold(moldId) {
  const m = moldRecById(moldId);
  if (!m) return;
  MOLD_REPLAN = moldId;
  uploadMold(m);
}
/* Point a mold at a plan, pushing whatever it pointed at before onto the
   history. The one place currentPlanId is written, so the invariant "the
   previous current is always in planHistory" holds by construction. */
function setCurrentPlan(mold, planId) {
  if (!mold || !planId) return;
  const prev = mold.currentPlanId;
  mold.currentPlanId = planId;
  if (prev && prev !== planId) {
    mold.planHistory = [{ id: prev, ts: new Date().toISOString(), by: myEmail() }]
      .concat((mold.planHistory || []).filter(h => h.id !== prev))
      .slice(0, 10);
  }
  save("molds", mold, "currentPlanId", "planHistory");
}
function makeCurrentPlan(moldId, planId) {
  const m = moldRecById(moldId);
  if (!m || !planById(planId)) return;
  setCurrentPlan(m, planId);
  toast(`${planById(planId).name || planId} is now the current plan.`);
  render();
}
function linkPlanToMold(planId, moldId) {
  const p = planById(planId);
  if (!p || !moldRecById(moldId)) return;
  p.moldId = moldId;
  save("stackplans", p, "moldId");
  setCurrentPlan(moldRecById(moldId), p.id);
  toast(`Plan linked to ${moldId}.`);
  render();
}

/* ---------- mold pane extras ----------
   The plan artifacts a linked mold shows inline: the exploded stack, the
   blanks table, and the Drawings / STL export actions. Newest linked plan is
   current; older ones are listed as superseded. Rendered by shop.js's detail
   through the hook below, so Materials and Items stay untouched. */
function moldPlanSection(m) {
  const plans = plansForMold(m);
  if (!plans.length) {
    return isLead() ? `<h3>Mold file</h3>
      <div class="muted tny">No stack plan yet — this mold was recorded by hand or imported.</div>
      <div class="toolbar no-print"><button class="ib" onclick="replanMold('${esc(m.id)}')">${icon("parts", 15)} Plan the stack</button></div>` : "";
  }
  const p = plans[0];
  const nSec = sectionCount(p);
  return `<h3>Mold file</h3>
    <div class="muted tny">${esc(p.id)} · ${(p.layers || []).length} layers · planned ${fmtWhen(p.ts)}</div>
    ${plans.length > 1 ? `<div class="muted tny">Earlier: ${plans.slice(1).map(x =>
      `<span class="chip tny" onclick="selectMoldsRec('${esc(x.id)}')">${esc(x.name || x.id)} · ${fmtWhen(x.ts)}</span>`).join(" ")}</div>` : ""}
    <div class="toolbar no-print">
      <button class="ib" onclick="selectMoldsRec('${esc(p.id)}')">${icon("parts", 15)} Open plan &amp; 3D view</button>
      ${isLead() ? `<button class="ib" onclick="replanMold('${esc(m.id)}')">${icon("edit", 15)} Re-plan</button>` : ""}
      <button class="ib" onclick="openDrawings('${esc(p.id)}')">${icon("print", 15)} Drawings</button>
      ${nSec === 1 ? `<button class="ib" onclick="exportSectionStl('${esc(p.id)}',0)">${icon("download", 15)} Stock STL</button>`
        : Array.from({ length: nSec }, (_, i) => `<button class="ib" onclick="exportSectionStl('${esc(p.id)}',${i})">${icon("download", 15)} STL S${i + 1}</button>`).join("")}
    </div>
    ${stackSvg(p)}
    ${stackTable(p)}`;
}

/* ---------- the tab ---------- */
function renderMoldsTab() {
  if (view.mode === "cuts") return renderCutList();
  const sel = moldsSelected();
  let pane;
  if (!sel) pane = moldsOverview();
  else if (sel.kind === "plan") pane = moldsPlanPane(sel.rec);
  else pane = `<section class="mddetail" aria-label="Mold detail">${renderShopDetail("molds", { embedded: true })}</section>`;
  const undo = (typeof shopUndoBar === "function" ? shopUndoBar() : "")
    + (typeof cutsUndoBar === "function" ? cutsUndoBar() : "");
  return `${undo}<div class="mdsplit ${sel ? "has-sel" : ""}">${renderMoldsRail()}${pane}</div>`;
}

/* ---------- keyboard ----------
   Same contract as partsKeydown: pure decisions, returns the action name so
   the node harness can drive it without a real KeyboardEvent. */
function moldsNeighborId(dir) {
  const rows = moldsFlatRows();
  if (!rows.length) return null;
  const i = rows.findIndex(r => r.id === view.id);
  if (i < 0) return rows[dir > 0 ? 0 : rows.length - 1].id;
  return rows[Math.min(rows.length - 1, Math.max(0, i + dir))].id;
}
function moveMoldsSelection(dir) {
  const id = moldsNeighborId(dir);
  if (id) selectMoldsRec(id);
}
function moldsKeydown(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (typeof view === "undefined" || view.tab !== "molds") return null;
  if (view.mode === "cuts") return null;
  const modal = document.getElementById("modal");
  if (modal && typeof modal.className === "string" && modal.className.includes("open")) return null;
  const t = e.target || {};
  const tag = String(t.tagName || "").toUpperCase();
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  const k = e.key;
  if (typing) {
    if (k === "Escape" && t.blur) { t.blur(); return "blur"; }
    return null;
  }
  if (k === "ArrowDown" || k === "j") { if (e.preventDefault) e.preventDefault(); moveMoldsSelection(1); return "next"; }
  if (k === "ArrowUp" || k === "k") { if (e.preventDefault) e.preventDefault(); moveMoldsSelection(-1); return "prev"; }
  if (k === "Enter" && view.mode !== "detail") { const id = moldsNeighborId(1); if (id) { selectMoldsRec(id); return "open"; } return null; }
  if (k === "Escape" && (view.mode === "detail" || view.mode === "plan")) { clearMoldsSelection(); return "clear"; }
  if (k === "/") {
    if (e.preventDefault) e.preventDefault();
    const s = document.getElementById("searchbox");
    if (s && s.focus) s.focus();
    return "search";
  }
  const sel = moldsSelected();
  if (k === "e" && sel && sel.kind === "mold") { view.edit = !view.edit; render(); return "edit"; }
  if (k === "1" && sel && sel.kind === "mold") {
    if (e.preventDefault) e.preventDefault();
    if (typeof quickAdvance === "function" && shopNextStage(SHOP.molds, sel.rec)) quickAdvance("molds", sel.rec.id);
    else toast(`${sel.rec.name || sel.rec.id} is already “${sel.rec.stage}”.`, "info");
    return "stage";
  }
  return null;
}
document.addEventListener("keydown", moldsKeydown);
