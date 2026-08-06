"use strict";
/* molds.js — the merged Molds tab: molds, stack plans and tooling boards as
   one master–detail split.

   WHY ONE TAB. A mold is made FROM boards THROUGH a stack plan; the three
   records describe one physical process, and splitting them across two tabs
   left the connections broken in both directions: a mold's "Cut from board"
   chip landed on a list (boards had no detail page), a scanned BRD- label
   dead-ended the same way, and a stack plan was an island a free-text name
   deep — planning a mold created no mold record at all.

   SHAPE. The Parts tab's split, transcribed rather than abstracted: a
   persistent rail on the left (three groups — Molds, Stack plans, Boards),
   the selected record on the right, the season view when nothing is picked.
   The Boards group lists SIZES, one row per length x width x thickness x
   density with a quantity, because that is how anybody standing in front of
   the rack would describe it. The board documents still exist one per board —
   a BRD- label is stuck to a physical board — and come back on the size pane.
   ↑/↓ or j/k walk the rail, `1` advances the selected mold one named stage
   through the same quickAdvance the detail button uses, `/` searches, esc
   clears. At or below 900px the same markup collapses to list-then-detail via
   `has-sel`, exactly like parts.js — see the responsive block in index.html.

   WHAT LIVES WHERE. The mold pane is renderShopDetail("molds") embedded, plus
   its plan's artifacts when one is linked. The plan pane is renderStackPlan()
   (3D view included — mvMount hooks the plan markup, so the heavy viewer stays
   there rather than being double-mounted into the mold pane). The board pane
   is new, read-only, and is what makes BRD- links land somewhere; the modal
   stays the editor. The cut list keeps its full-width takeover: it is a batch
   print artifact, not a record.

   The old `stock` TABS row survives hidden, so #/stock links, stored
   notification links and every test literal keep resolving; render()
   normalises it to this tab. Collections, prefixes and rules are untouched. */

function moldRecById(id) { return (DB.molds || []).find(m => m.id === id); }

/* ---------- selection ---------- */
function moldsSelected() {
  if (view.mode !== "detail" && view.mode !== "plan") return null;
  const id = String(view.id || "");
  if (id.startsWith("MOLD-")) return { kind: "mold", rec: moldRecById(id) };
  // A size row is what the rail shows. A BRD- id still resolves, because a
  // scanned label and a mold's "cut from board" chip both point at one board,
  // not at a size.
  if (id.startsWith("SZ:")) return { kind: "size", rec: boardGroupByKey(id.slice(3)) };
  if (id.startsWith("BRD-")) return { kind: "board", rec: boardById(id) };
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

  let plans = (DB.stackplans || [])
    .filter(p => has(p))
    .slice().sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));

  /* One row per SIZE, not per board. Sorted thin-to-thick then biggest-first,
     which is how the rack itself is stacked. */
  let boards = groupBoards(DB.stock || []).filter(g => has(g, groupLabel(g)));

  /* The selected record never falls out from under you — same rule as the
     Parts rail, and the reason a filter can't blank the pane you are reading. */
  const sel = moldsSelected();
  if (sel && sel.rec) {
    const lists = { mold: molds, plan: plans, size: boards };
    const l = lists[sel.kind];
    if (l && !l.includes(sel.rec)) l.push(sel.rec);
  }
  return { molds, plans, boards };
}
function moldsFlatRows() {
  const { molds, plans, boards } = moldsRailRows();
  return [...molds, ...plans, ...boards];
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
  // a size of board, however many of them there are
  return `<div class="pitem ${sel ? "sel" : ""}" id="pi-${esc(o.id)}" role="option" aria-selected="${sel}"
      title="${esc(groupLabel(o))} · ${esc(o.density)} lb/ft³" onclick="${open}">
    <span class="pi-name">${esc(groupLabel(o))}</span>
    <span class="pi-due"><span class="tny muted">${o.m2.toFixed(2)} m²</span></span>
    <span class="pi-sub"><span class="tny">${esc(o.density)} lb/ft³</span></span>
    <span class="pi-who"><span class="tny muted">×${esc(o.qty)}</span></span>
  </div>`;
}

function moldsGroupHead(name, bits) {
  return `<div class="pgrouphd"><span class="pg-name">${esc(name)}</span>${
    bits.filter(Boolean).map(b => `<span class="pg-n">${b}</span>`).join("")}</div>`;
}

function renderMoldsRail() {
  const { molds, plans, boards } = moldsRailRows();
  const allMolds = DB.molds || [];
  const retired = allMolds.filter(m => m.stage === "Retired").length;
  const ready = allMolds.filter(m => m.stage === "Ready for layup").length;
  const noHome = allMolds.filter(m => m.stage !== "Retired" && !m.location).length;
  const planWarn = (DB.stackplans || []).filter(p => (p.warnings || []).length).length;
  const m2 = (DB.stock || []).reduce((n, b) => n + boardAreaM2(b), 0);
  const total = molds.length + plans.length + boards.length;
  const sel = moldsSelected();

  return `
  <aside class="mdindex" aria-label="Molds index">
    <div class="pindex-head no-print">
      <div class="toolbar">
        <button class="primary ib" onclick="newShopRec('molds')">+ Mold</button>
        <button class="ib" onclick="newBoard()">+ Board</button>
        <button class="ib" onclick="uploadMold()">${icon("parts", 15)} Plan a mold</button>
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
        <input id="searchbox" placeholder="search molds / boards / id…" value="${esc(view.q || "")}" oninput="searchInput(this)">
        <select title="Mold stage" onchange="view.fStatus=this.value;render()">
          <option value="">All stages</option>
          ${MOLD_STAGE.map(s => `<option ${view.fStatus === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="plist" role="listbox" aria-label="Molds, plans and boards">
      ${total === 0 ? `<div class="pempty muted">${
        (DB.molds || []).length + (DB.stock || []).length ? "Nothing matches these filters."
        : "Nothing here yet — <b>+ Mold</b>, <b>+ Board</b>, or import the SN5 molds with <b>Find molds in work orders</b> under Reports."}</div>` : ""}
      ${molds.length || (DB.molds || []).length ? moldsGroupHead("Molds", [
        `${ready} ready`, noHome ? `${noHome} no home` : "", `${molds.length} shown`]) : ""}
      ${molds.filter(m => !view.fNoHome || !m.location).map(m => moldsRailItem("mold", m)).join("")}
      ${plans.length ? moldsGroupHead("Stack plans", [
        `${plans.length}`, planWarn ? `${icon("warning", 12)} ${planWarn}` : ""]) : ""}
      ${plans.map(p => moldsRailItem("plan", p)).join("")}
      ${boards.length || (DB.stock || []).length ? moldsGroupHead("Boards", [
        `${boards.reduce((n, g) => n + g.qty, 0)} boards`, `${boards.length} sizes`, `${m2.toFixed(1)} m²`]) : ""}
      ${boards.map(g => moldsRailItem("size", g)).join("")}
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

  const buckets = {};
  (DB.stock || []).forEach(b => { buckets[thkKey(b)] = (buckets[thkKey(b)] || 0) + boardAreaM2(b); });

  const tile = (n, label, cls) => `<div class="stat-tile"><div class="bignum ${cls || ""}">${n}</div><div class="stat-label">${esc(label)}</div></div>`;

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
      ${tile(live.length, "Molds")}${tile(ready, "Ready for layup")}${tile(noHome, "No home location", noHome ? "warn" : "")}${tile(m2.toFixed(1), "m² board on hand")}
    </div>
    <div class="card">
      <h2>Mold making this season</h2>
      <div class="muted">${live.length} live mold${live.length === 1 ? "" : "s"} · ${(DB.stackplans || []).length} stack plan${(DB.stackplans || []).length === 1 ? "" : "s"} · ${(DB.stock || []).length} board${(DB.stock || []).length === 1 ? "" : "s"} on the rack. Pick anything on the left to open it.</div>
      ${stageBar}
      ${shortLine}
    </div>
    <div class="card">
      <h3>Board on hand</h3>
      ${Object.keys(buckets).length ? `<div class="grid">
        ${Object.keys(buckets).sort().map(k => `<div class="f"><label>${esc(k)}</label><div class="ro">${buckets[k].toFixed(2)} m²</div></div>`).join("")}
      </div>` : `<span class="muted">No board stock recorded yet. <b>+ Board</b> for each sheet and offcut on the rack at RFS${isLead() ? ", or <b>Load SN5 archive</b> to start from the rack SN5 left behind" : ""}.</span>`}
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

/* ---------- size pane ----------
   What the rail now opens: a size of board, and however many of them are on
   the rack. The individual documents are still here, at the bottom, because a
   BRD- id is what a printed label carries and what `mold.board` points at —
   but you have to want them. Simon: "we really only care about xyz and
   density." */
function moldsSizePane(g) {
  if (!g) { view.mode = "list"; view.id = null; return moldsOverview(); }
  const ids = new Set(g.members.map(b => b.id));
  const usedBy = (DB.molds || []).filter(m => ids.has(m.board));
  const where = [...new Set(g.members.map(b => b.location).filter(Boolean))];
  return `
  <section class="mddetail" aria-label="Board size detail">
    <div class="toolbar no-print">
      <button class="ib" onclick="clearMoldsSelection()">${icon("chevronLeft", 16)} All molds</button>
      <button class="primary ib" onclick="newBoard()">+ Board this size</button>
      <span class="mdnav no-print">
        <button class="sm" title="Previous (↑)" onclick="moveMoldsSelection(-1)">${icon("chevronLeft", 14)}</button>
        <button class="sm" title="Next (↓)" onclick="moveMoldsSelection(1)">${icon("chevronRight", 14)}</button>
      </span>
    </div>
    <div class="card">
      <h2>${esc(groupLabel(g))}</h2>
      <div class="muted">${esc(g.density)} lb/ft³ · ${esc(g.qty)} on the rack · ${g.m2.toFixed(2)} m² of face</div>
      <div class="grid">
        <div class="f"><label>Length</label><div class="ro">${fmtMm(g.lenMm)} <span class="muted tny">(${Math.round(g.lenMm * 10) / 10} mm)</span></div></div>
        <div class="f"><label>Width</label><div class="ro">${fmtMm(g.widMm)} <span class="muted tny">(${Math.round(g.widMm * 10) / 10} mm)</span></div></div>
        <div class="f"><label>Thickness</label><div class="ro">${fmtMm(g.thkMm)} <span class="muted tny">(${Math.round(g.thkMm * 10) / 10} mm)</span></div></div>
        <div class="f"><label>Density</label><div class="ro">${esc(g.density)} lb/ft³</div></div>
        <div class="f"><label>Quantity</label><div class="ro">${esc(g.qty)}</div></div>
        <div class="f"><label>Stored at</label><div class="ro">${where.length ? where.map(l => shopRefChip(String(l))).join(" ") : "—"}</div></div>
      </div>
      ${usedBy.length ? `<h3>Molds cut from boards this size</h3>
        <div class="stagerow">${usedBy.map(m => `<span class="chip" onclick="selectMoldsRec('${esc(m.id)}')">${esc(m.name || m.id)}</span>`).join("")}</div>` : ""}
      <h3>The boards themselves</h3>
      <div class="muted tny">One record each, because a BRD- label is stuck to a physical board and a mold points at the one it was cut from.</div>
      <table class="list">
        <tr><th>Board</th><th>Qty</th><th>Where</th><th></th></tr>
        ${g.members.map(b => `<tr>
          <td onclick="selectMoldsRec('${esc(b.id)}')"><b>${esc(b.label || b.id)}</b> <span class="muted tny">${esc(b.id)}</span>${
            b.origin ? ` <span class="muted tny">· from ${esc(b.origin)}</span>` : ""}</td>
          <td>${esc(b.qty || 1)}</td>
          <td class="tny">${b.location ? shopRefChip(String(b.location)) : "—"}</td>
          <td>${labelBtn("stock", b.id)}<button class="ib sm" onclick="editBoard('${esc(b.id)}')">${icon("edit", 14)}</button>${
            isLead() ? `<button class="danger ib sm" onclick="delBoard('${esc(b.id)}')">${icon("trash", 14)}</button>` : ""}</td>
        </tr>`).join("")}
      </table>
    </div>
  </section>`;
}

/* ---------- board pane ----------
   The detail page boards never had. Read-only on purpose: the modal is already
   the editor and two editable surfaces for one record is how fields fight. */
function moldsBoardPane(b) {
  if (!b) { view.mode = "list"; view.id = null; return moldsOverview(); }
  const usedBy = (DB.molds || []).filter(m => m.board === b.id);
  return `
  <section class="mddetail" aria-label="Board detail">
    <div class="toolbar no-print">
      <button class="ib" onclick="clearMoldsSelection()">${icon("chevronLeft", 16)} All molds</button>
      <button class="primary ib" onclick="editBoard('${esc(b.id)}')">${icon("edit", 15)} Edit</button>
      ${labelBtn("stock", b.id)}
      ${isLead() ? `<button class="danger" onclick="delBoard('${esc(b.id)}')">Delete</button>` : ""}
      <span class="mdnav no-print">
        <button class="sm" title="Previous (↑)" onclick="moveMoldsSelection(-1)">${icon("chevronLeft", 14)}</button>
        <button class="sm" title="Next (↓)" onclick="moveMoldsSelection(1)">${icon("chevronRight", 14)}</button>
      </span>
    </div>
    <div class="card" data-lbgroup="stock:${esc(b.id)}">
      <h2>${esc(b.label || b.id)}</h2>
      <div class="muted">${esc(b.id)}${
        b.ts ? " · added " + fmtWhen(b.ts) : ""}${b.createdBy ? " by " + esc(b.createdBy) : ""}</div>
      <h3>Details</h3>
      <div class="grid">
        <div class="f"><label>Length</label><div class="ro">${fmtDim(b.len)}</div></div>
        <div class="f"><label>Width</label><div class="ro">${fmtDim(b.wid)}</div></div>
        <div class="f"><label>Thickness</label><div class="ro">${fmtDim(b.thk)}</div></div>
        <div class="f"><label>Density</label><div class="ro">${esc(b.density)} lb/ft³</div></div>
        <div class="f"><label>Quantity</label><div class="ro">${esc(b.qty || 1)}</div></div>
        <div class="f"><label>Area</label><div class="ro">${boardAreaM2(b).toFixed(2)} m²</div></div>
        <div class="f"><label>Stored at</label><div class="ro">${b.location ? shopRefChip(String(b.location)) : "—"}</div></div>
        ${b.origin ? `<div class="f"><label>From</label><div class="ro">${esc(b.origin)}</div></div>` : ""}
      </div>
      ${usedBy.length ? `<h3>Molds cut from this board</h3>
        <div class="stagerow">${usedBy.map(m => `<span class="chip" onclick="selectMoldsRec('${esc(m.id)}')">${esc(m.name || m.id)}</span>`).join("")}</div>` : ""}
    </div>
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
  const ownerLine = owner ? `<div class="card no-print"><b>Mold:</b> <span class="chip" onclick="selectMoldsRec('${esc(owner.id)}')">${esc(owner.name || owner.id)}</span>
    <span class="muted tny">· stage ${esc(owner.stage || "—")}</span></div>` : "";
  return `<section class="mddetail" aria-label="Stack plan">${ownerLine}${adopt}${renderStackPlan()}</section>`;
}

async function createMoldFromPlan(planId) {
  const p = planById(planId);
  if (!p || p.moldId) return;
  const id = await allocId("molds");
  if (!id) return;
  const m = {
    id, name: p.name || p.id, stage: "Designed",
    density: String(p.density || ""), layers: (p.thicknessesMm || []).length ? `${p.thicknessesMm.length} layers` : "",
    createdBy: myEmail(),
  };
  DB.molds.push(m);
  save("molds", m);
  p.moldId = id;
  save("stackplans", p, "moldId");
  toast(`${m.name} created at “Designed” and linked to this plan.`);
  selectMoldsRec(id);
}
function linkPlanToMold(planId, moldId) {
  const p = planById(planId);
  if (!p || !moldRecById(moldId)) return;
  p.moldId = moldId;
  save("stackplans", p, "moldId");
  toast(`Plan linked to ${moldId}.`);
  render();
}

/* ---------- mold pane extras ----------
   The plan artifacts a linked mold shows inline: the exploded stack, the
   blanks table, and the Drawings / STL export actions. Newest linked plan is
   current; older ones are listed as superseded. Rendered by shop.js's detail
   through the hook below, so Materials and Items stay untouched. */
function moldPlanSection(m) {
  const plans = (DB.stackplans || []).filter(p => p.moldId === m.id)
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  if (!plans.length) return "";
  const p = plans[0];
  const nSec = sectionCount(p);
  return `<h3>Stack plan</h3>
    <div class="muted tny">${esc(p.id)} · ${(p.layers || []).length} layers · planned ${fmtWhen(p.ts)}${plans.length > 1 ? ` · supersedes ${plans.slice(1).map(x => esc(x.id)).join(", ")}` : ""}</div>
    <div class="toolbar no-print">
      <button class="ib" onclick="selectMoldsRec('${esc(p.id)}')">${icon("parts", 15)} Open plan &amp; 3D view</button>
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
  else if (sel.kind === "size") pane = moldsSizePane(sel.rec);
  else if (sel.kind === "board") pane = moldsBoardPane(sel.rec);
  else if (sel.kind === "plan") pane = moldsPlanPane(sel.rec);
  else pane = `<section class="mddetail" aria-label="Mold detail">${renderShopDetail("molds", { embedded: true })}</section>`;
  const undo = typeof shopUndoBar === "function" ? shopUndoBar() : "";
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
