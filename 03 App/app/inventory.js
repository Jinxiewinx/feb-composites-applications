"use strict";
/* inventory.js — the Inventory tab: the storage map.
 *
 * WHY A MAP. Storage locations were BIN-class rows inside the Items tab: a
 * name, a stage, and no way to answer the question a shop actually asks,
 * which is "what is on this shelf". This tab opens on the physical shop —
 * one card per location, grouped by site, each showing a live summary of its
 * contents and its problems — and a tap (or a scanned shelf label) opens the
 * location's contents page, where records are created already located, moved
 * in by scanning, and confirmed for CS-011 §7.1's monthly stock walk.
 *
 * WHAT LIVES HERE. The old Items (test panels, jigs, storage locations) and
 * Materials (fabric, resin, consumables) tabs, whose flat lists survive
 * behind the Items/Materials view toggles; their tab ids live on as hidden
 * aliases the way stock's does. Collections, prefixes, labels, scanning and
 * rules are untouched.
 *
 * THE JOIN. invIndex() makes one pass over every physical collection and
 * buckets records by their location field (boards included, since they
 * gained one; parts join through moldLocation, which setLocation writes
 * BIN- ids into — the free-text values it also holds are counted honestly
 * as "legacy" rather than pretended away). The moldUses() idiom, one level
 * up. */

// Map order. The blank is a schema affordance for "not set yet", not a site.
const INV_SITES = SITES.filter(Boolean);
const INV_WALK_STALE_DAYS = 30;

function invBins() { return (DB.items || []).filter(o => o.cls === "BIN"); }
function invActiveBins() { return invBins().filter(b => b.stage !== "Retired"); }

/* ---------- restock rules: what we keep on the shelf, and how little is too
 * little ----------
 *
 * WHY THIS IS NOT A FIELD ON A LOT. lowFlag lives on a container. A container
 * empties, invIndex() drops it from every bucket, invSummaryChips() filters
 * Empty out before it counts anything, and the flag goes with it: being nearly
 * out is a chip, being completely out is silence. That is PP-02 — the SN5
 * sheet where MEKP sat flagged REORDER all season — reproduced exactly. The
 * thing you reorder is a MATERIAL, so the threshold belongs on the material.
 *
 * The seed is CS-011 §5's table, verbatim, including the standard's own
 * reasoning in `why`. §5 calls these "starting values; tune with usage data",
 * which is the whole argument for a lead-editable override rather than a
 * regression over forty data points we will not have until March.
 *
 * unit is the noun the count picker says out loud ("How many boxes"), because
 * "1" meaning one box and "100" meaning a hundred gloves is the ambiguity that
 * makes a count untrustworthy. leadDays is CS-012 §7.4's supplier lead time,
 * and it is what turns "you are low" into "order now to have it by the 4th". */
const RESTOCK_SEED = [
  { matKey: "IN2", label: "IN2 infusion resin", minCount: 1, unit: "kit", supplier: "Easy Composites", leadDays: 42,
    hazard: "flammable", role: "resin",
    why: "Every infusion. One unopened kit is about one peak week, so it is the alarm, not the buffer — CS-011 §5." },
  { matKey: "AT30", label: "AT30 slow hardener", minCount: 1, unit: "kit", supplier: "Easy Composites", leadDays: 42,
    hazard: "flammable", role: "hardener",
    why: "Pairs with IN2; same 6-week Easy Composites lead." },
  { matKey: "WEST-105", label: "West 105 resin", minCount: 1, unit: "tank", supplier: "West System", leadDays: 14,
    hazard: "flammable", role: "resin", why: "Every wet layup. CS-011 §5 wants half a tank plus a can." },
  { matKey: "WEST-206", label: "West 206 hardener", minCount: 1, unit: "can", supplier: "West System", leadDays: 14,
    hazard: "flammable", role: "hardener", why: "Every wet layup." },
  { matKey: "XCR", label: "XCR mold coating", minCount: 1, unit: "kit", supplier: "Easy Composites", leadDays: 42,
    hazard: "flammable", role: "resin",
    why: "Every mold. One kit seals two or three sections and molds queue two a week in peak." },
  { matKey: "VB160", label: "VB160 bagging film", minCount: 1, unit: "roll", supplier: "Easy Composites", leadDays: 42,
    why: "Everything bagged." },
  { matKey: "PEEL-PLY", label: "Peel ply", minCount: 1, unit: "roll", supplier: "Easy Composites", leadDays: 42,
    why: "Everything bagged." },
  { matKey: "FLOW-MESH", label: "Flow mesh", minCount: 1, unit: "roll", supplier: "Easy Composites", leadDays: 42,
    why: "Everything infused." },
  { matKey: "TACKY-TAPE", label: "Tacky tape", minCount: 6, unit: "roll", supplier: "Easy Composites", leadDays: 7,
    why: "Everything bagged, and the team burns it fast: about three rolls a week in peak, one-week lead." },
  { matKey: "GLOVES-NITRILE", label: "Nitrile gloves", minCount: 2, unit: "box per size", supplier: "McMaster", leadDays: 7,
    why: "Everything." },
  { matKey: "MIXING-CUPS", label: "Mixing cups", minCount: 50, unit: "cup", supplier: "McMaster", leadDays: 7, why: "Everything." },
  { matKey: "MIXING-STICKS", label: "Mixing sticks", minCount: 50, unit: "stick", supplier: "McMaster", leadDays: 7, why: "Everything." },
  { matKey: "CARTRIDGE-A-P100", label: "Respirator cartridges (A + P100)", minCount: 2, unit: "set", supplier: "McMaster", leadDays: 7,
    why: "Safety-blocking: no cartridges, no layup." },
  { matKey: "195-TWILL", label: "195 twill cloth", minCount: 10, unit: "yd", supplier: "Sigmatex (sponsor)", leadDays: 30,
    why: "Most stacks." },
];

/* Lead overrides, config/restock. Same trust shape as config/resins: roster
   reads, lead writes, no rules change needed. A row keyed by an unknown
   matKey is an ADDITION, not an error — the shop buys things CS-011 never
   listed. Fetched once per session; a missing doc never clobbers a seed. */
window.RESTOCK_OVERRIDES = null;
let restockFetched = false;
function loadRestockRules() {
  if (restockFetched || !window.fb || fb.state !== "ready" || !fb.getConfig) return;
  restockFetched = true;
  fb.getConfig("restock").then(d => { if (d) { window.RESTOCK_OVERRIDES = d; render(); } }).catch(() => {});
}

/* The one choke point. Overrides merge per matKey so a lead can move a single
   threshold without restating the table, and minCount is validated at READ
   time — a doc hand-edited in the Firestore console cannot set a negative or
   non-numeric minimum and silently switch a rule off. Same defensive read as
   resinById(). */
function restockRules() {
  const over = window.RESTOCK_OVERRIDES;
  const rows = Array.isArray(over && over.rules) ? over.rules : [];
  const byKey = new Map(RESTOCK_SEED.map(r => [r.matKey, r]));
  for (const o of rows) {
    if (!o || !o.matKey) continue;
    const base = byKey.get(o.matKey) || { matKey: o.matKey, label: o.matKey };
    const n = Number(o.minCount);
    const clean = { ...base, ...o };
    if (!Number.isFinite(n) || n < 0) clean.minCount = base.minCount;
    else clean.minCount = n;
    byKey.set(o.matKey, clean);
  }
  return [...byKey.values()];
}
function restockRuleFor(matKey) {
  if (!matKey) return null;
  return restockRules().find(r => r.matKey === matKey) || null;
}

/* ---------- the index: location id -> contents ---------- */
function invEmptyBucket() {
  return { molds: [], boards: [], panels: [], jigs: [], fabric: [], resin: [], consumables: [], parts: [] };
}
function invIndex() {
  const by = new Map();
  const un = invEmptyBucket();          // unhoused: no location at all
  const legacyParts = [];               // parts whose moldLocation is free text
  const put = (locId, kind, rec) => {
    if (!locId) { un[kind].push(rec); return; }
    if (!by.has(locId)) by.set(locId, invEmptyBucket());
    by.get(locId)[kind].push(rec);
  };
  (DB.molds || []).forEach(m => { if (m.stage !== "Retired") put(m.location, "molds", m); });
  (DB.stock || []).forEach(b => put(b.location, "boards", b));
  (DB.items || []).forEach(o => {
    if (o.cls === "PNL") put(o.location, "panels", o);
    if (o.cls === "JIG") put(o.location, "jigs", o);
  });
  (DB.lots || []).forEach(o => {
    if (o.stage === "Empty") return;    // an empty jug isn't ON a shelf in any useful sense
    if (o.cls === "FAB") put(o.location, "fabric", o);
    if (o.cls === "RSN") put(o.location, "resin", o);
    if (o.cls === "CON") put(o.location, "consumables", o);
  });
  (DB.parts || []).forEach(p => {
    const loc = String(p.moldLocation || "");
    if (!loc) return;                   // parts default to nothing useful; don't count as unhoused
    if (loc.startsWith("BIN-")) put(loc, "parts", p);
    else legacyParts.push(p);
  });
  return { by, un, legacyParts };
}
function invBucketCount(b) { return Object.values(b).reduce((n, arr) => n + arr.length, 0); }

/* ---------- warnings (CS-011 §6, plus freshness) ---------- */
function lotExpired(o) {
  return !!(o.expiresOn && o.expiresOn < new Date().toISOString().slice(0, 10) && o.stage !== "Empty");
}
function invDaysSince(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000);
  return Number.isFinite(d) ? d : null;
}
function invLocWarnings(bin, bucket) {
  const out = [];
  const lots = [...bucket.resin, ...bucket.fabric, ...bucket.consumables];
  const expired = lots.filter(lotExpired).length;
  if (expired) out.push({ text: `${expired} expired`, cls: "bad" });
  /* §6: resin and hardener on different shelves. Role is recorded on RSN lots. */
  const roles = new Set(bucket.resin.map(o => String(o.role || "").toLowerCase()).filter(Boolean));
  if (roles.has("resin") && roles.has("hardener")) out.push({ text: "resin + hardener together", cls: "bad" });
  /* §6: flammables live in the rated cabinet. */
  const flams = lots.filter(o => o.hazard === "flammable").length;
  if (flams && bin.flam !== "Yes") out.push({ text: `${flams} flammable — not a rated location`, cls: "bad" });
  const low = lots.filter(o => o.lowFlag).length;
  if (low) out.push({ text: `${low} running low`, cls: "warn" });
  return out;
}

/* ---------- selection ---------- */
function invSelected() {
  if (view.mode !== "detail") return null;
  const id = String(view.id || "");
  if (id.startsWith("BIN-")) return { kind: "bin", rec: shopById("items", id) };
  if (/^(PNL|JIG)-/.test(id)) return { kind: "item", rec: shopById("items", id) };
  if (/^(FAB|RSN|CON)-/.test(id)) return { kind: "lot", rec: shopById("lots", id) };
  return null;
}
function selectInvRec(id) { view = { ...view, mode: "detail", id, edit: false }; render(); }
function clearInvSelection() { view = { ...view, mode: "list", id: null, edit: false }; render(); }

/* ---------- the map ---------- */
function invSummaryChips(idx) {
  const allLots = (DB.lots || []).filter(o => o.stage !== "Empty");
  const lowExpired = allLots.filter(o => o.lowFlag || lotExpired(o)).length;
  const unhoused = invBucketCount(idx.un);
  let chem = 0;
  invActiveBins().forEach(b => { chem += invLocWarnings(b, idx.by.get(b.id) || invEmptyBucket()).filter(w => w.cls === "bad").length; });
  const ages = invActiveBins().map(b => invDaysSince(b.walkedAt)).filter(d => d != null);
  const oldest = invActiveBins().some(b => !b.walkedAt) ? null : (ages.length ? Math.max(...ages) : null);
  const chip = (n, label, cls, on, js) =>
    `<button class="psum-chip ${cls || ""} ${on ? "on" : ""}" onclick="${js}"><b>${n}</b> ${esc(label)}</button>`;
  return `<div class="psum no-print">
    ${chip(lowExpired, "low / expired", lowExpired ? "bad" : "", view.invFlag === "reorder", "view.invFlag=view.invFlag==='reorder'?'':'reorder';render()")}
    ${chip(unhoused, "unhoused", unhoused ? "bad" : "", false, "selectInvRec('NOWHERE')")}
    ${chip(chem, "chemical warnings", chem ? "bad" : "", false, "void 0")}
    ${oldest == null ? `<span class="psum-chip">walk overdue</span>` : `<span class="psum-chip">walked ${oldest}d ago</span>`}
  </div>`;
}

function invCard(bin, bucket) {
  const warns = invLocWarnings(bin, bucket);
  const n = invBucketCount(bucket);
  const parts = [
    [bucket.molds.length, "molds"], [bucket.boards.length, "boards"],
    [bucket.panels.length, "panels"], [bucket.jigs.length, "jigs"],
    [bucket.fabric.length, "fabric"], [bucket.resin.length, "resin"],
    [bucket.consumables.length, "consumables"], [bucket.parts.length, "parts"],
  ].filter(([c]) => c);
  const age = invDaysSince(bin.walkedAt);
  return `<button class="loccard" onclick="selectInvRec('${esc(bin.id)}')" title="${esc(bin.id)}">
    <div class="lc-hd"><span class="lc-name">${esc(bin.name || bin.id)}</span>
      ${bin.locKind ? `<span class="kind">${esc(bin.locKind)}</span>` : ""}
      ${bin.flam === "Yes" ? `<span class="kind lc-flam" title="Rated for flammables">◆ flam</span>` : ""}</div>
    <div class="lc-body">${n ? parts.map(([c, l]) => `<span>${c} ${l}</span>`).join(" · ") : '<span class="muted">empty</span>'}</div>
    ${warns.map(w => `<div class="lc-warn ${w.cls}">${icon("warning", 12)} ${esc(w.text)}</div>`).join("")}
    <div class="lc-foot tny muted">${age == null ? "contents never confirmed" : `walked ${age}d ago${age > INV_WALK_STALE_DAYS ? " ⚠" : ""}`}</div>
  </button>`;
}

function invNowhereCard(idx) {
  const n = invBucketCount(idx.un);
  const legacy = idx.legacyParts.length;
  if (!n && !legacy) return "";
  const bits = Object.entries(idx.un).filter(([, arr]) => arr.length).map(([k, arr]) => `${arr.length} ${k}`);
  return `<button class="loccard lc-nowhere" onclick="selectInvRec('NOWHERE')">
    <div class="lc-hd"><span class="lc-name">${icon("warning", 14)} No location</span></div>
    <div class="lc-body">${bits.join(" · ") || '<span class="muted">nothing</span>'}</div>
    ${legacy ? `<div class="lc-foot tny muted">+ ${legacy} part${legacy === 1 ? "" : "s"} with free-text locations</div>` : ""}
    <div class="lc-foot tny muted">house these</div>
  </button>`;
}

function renderInvMap() {
  const idx = invIndex();
  const bins = invActiveBins();
  const bySite = new Map();
  bins.forEach(b => {
    const s = b.site || "Unassigned";
    if (!bySite.has(s)) bySite.set(s, []);
    bySite.get(s).push(b);
  });
  const siteOrder = [...INV_SITES.filter(s => bySite.has(s)), ...[...bySite.keys()].filter(s => !INV_SITES.includes(s))];

  return `
  ${invToolbar("map")}
  ${invSummaryChips(idx)}
  ${invIncomingHtml()}
  ${bins.length ? siteOrder.map(s => `
    <div class="inv-site"><div class="pgrouphd"><span class="pg-name">${esc(s)}</span><span class="pg-n">${bySite.get(s).length} location${bySite.get(s).length === 1 ? "" : "s"}</span></div>
      <div class="locgrid">${bySite.get(s).map(b => invCard(b, idx.by.get(b.id) || invEmptyBucket())).join("")}${s === siteOrder[siteOrder.length - 1] ? invNowhereCard(idx) : ""}</div>
    </div>`).join("")
    : `<div class="card">No storage locations yet. <b>+ Location</b> for each shelf, rack and bin (CS-011 §7.3 names them),
       print its label from the record, and stick it on the front edge. Then everything else in the shop can say where it lives.
       ${invNowhereCard(idx) ? "" : ""}</div>${invNowhereCard(idx) ? `<div class="locgrid">${invNowhereCard(idx)}</div>` : ""}`}`;
}

function invToolbar(active) {
  const seg = (id, label) => `<button class="ib ${active === id ? "primary" : ""}" ${active === id ? "" : `onclick="view.invView='${id}';view.mode='list';view.id=null;render()"`}>${label}</button>`;
  return `<div class="toolbar no-print">
    ${seg("map", "Storage map")}${seg("items", "Items list")}${seg("lots", "Materials list")}
    <span style="flex:1"></span>
    <button class="primary ib" onclick="newShopRec('items','BIN')">+ Location</button>
    <button class="ib" onclick="invReceive('')">${icon("plus", 15)} Receive a delivery</button>
    <button class="ib" onclick="openLabelBuilder('items')">${icon("print", 15)} Labels</button>
  </div>`;
}

/* ---------- one location's contents ---------- */
function invRow(coll, o, pill) {
  const tab = tabForId(o.id) || "inventory";
  return `<div class="pmini invrow" onclick="openRecord('${esc(tab)}','${esc(o.id)}')">
    <span class="pm-name">${esc(o.name || o.partName || o.label || o.id)}</span>
    <span class="tny muted">${esc(o.id)}</span>
    ${/* Prices ride along on the shelf view so browsing the map teaches what
          things cost — the anti-tribal-knowledge surface Simon picked. */""}
    ${typeof o.unitCost === "number" ? `<span class="tny muted">${esc(shopMoneyText(o, "unitCost"))}</span>` : ""}
    ${pill || ""}
    <button class="sm no-print" onclick="event.stopPropagation();quickMove('${esc(coll)}','${esc(o.id)}')">Move</button>
  </div>`;
}
function invLotPill(o) {
  if (lotExpired(o)) return `<span class="pill OnHold">expired</span>`;
  if (o.lowFlag) return `<span class="pill OnHold">low</span>`;
  return `<span class="pill ${o.stage === "Open" ? "InWork" : "Draft"}">${esc(o.stage || "—")}</span>`;
}
function invGroup(title, rows) {
  if (!rows) return "";
  return `<h3>${esc(title)}</h3>${rows || '<span class="muted tny">nothing</span>'}`;
}

function renderInvContents(bin) {
  /* view.edit flips to the plain record editor for the location itself; the
     shop detail's own Done button flips back here. */
  if (view.edit) return `<section class="mddetail">${renderShopDetail("items", { embedded: true, back: "clearInvSelection", move: null, backLabel: "Storage map" })}</section>`;
  const idx = invIndex();
  const nowhere = bin === "NOWHERE";
  const b = nowhere ? { id: "NOWHERE", name: "No location", stage: "" } : bin;
  const bucket = nowhere ? idx.un : (idx.by.get(b.id) || invEmptyBucket());
  const warns = nowhere ? [] : invLocWarnings(b, bucket);
  const age = nowhere ? null : invDaysSince(b.walkedAt);
  const addBtn = (cls, label) => `<button class="sm" onclick="newShopRec('${cls === "PNL" || cls === "JIG" ? "items" : "lots"}','${cls}',{location:'${esc(b.id)}'})">+ ${label}</button>`;
  const flag = view.invFlag === "reorder";
  const lotRows = arr => arr.filter(o => !flag || o.lowFlag || lotExpired(o)).map(o => invRow("lots", o, invLotPill(o))).join("");

  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="clearInvSelection()">${icon("chevronLeft", 16)} Storage map</button>
    ${nowhere ? "" : `<button class="primary ib" onclick="view.edit=true;render()">${icon("edit", 15)} Edit location</button>`}
    ${nowhere ? "" : labelBtn("items", b.id)}
    ${nowhere ? "" : `<button class="ib" onclick="invMoveHere('${esc(b.id)}')">${icon("search", 15)} Move here (scan)</button>`}
    ${nowhere ? "" : `<button class="ib" onclick="invReceive('${esc(b.id)}')">${icon("plus", 15)} Receive delivery</button>`}
    ${nowhere ? "" : `<button class="ib" onclick="invConfirmContents('${esc(b.id)}')">${icon("check", 15)} Confirm contents</button>`}
  </div>
  <div class="card">
    <h2>${esc(b.name || b.id)}</h2>
    <div class="muted">${nowhere ? "Everything that has no recorded location. House these." : `${esc(b.id)}${b.site ? " · " + esc(b.site) : ""}${b.locKind ? " · " + esc(b.locKind) : ""}${b.flam === "Yes" ? " · rated for flammables" : ""}${age != null ? ` · contents confirmed ${age}d ago${b.walkedBy ? " by " + esc(b.walkedBy) : ""}` : " · contents never confirmed"}`}</div>
    ${warns.map(w => `<div class="warn">${icon("warning", 14)} ${esc(w.text)}${w.text.includes("resin + hardener") ? " — CS-011 §6 wants them on separate shelves" : ""}</div>`).join("")}
    ${invBucketCount(bucket) === 0 ? `<p class="muted">Nothing recorded here yet.</p>` : ""}
    ${invGroup("Molds", bucket.molds.map(o => invRow("molds", o, `<span class="pill ${shopStageClass(shopSpec("molds"), o)}">${esc(o.stage || "—")}</span>`)).join(""))}
    ${invGroup("Tooling boards", bucket.boards.map(o => invRow("stock", o, `<span class="tny muted">${fmtDim(o.len)} × ${fmtDim(o.wid)} × ${fmtDim(o.thk)}</span>`)).join(""))}
    ${invGroup("Test panels", bucket.panels.map(o => invRow("items", o, `<span class="pill">${esc(o.stage || "—")}</span>`)).join(""))}
    ${invGroup("Jigs", bucket.jigs.map(o => invRow("items", o, `<span class="pill">${esc(o.stage || "—")}</span>`)).join(""))}
    ${invGroup("Resin / hardener", lotRows(bucket.resin))}
    ${invGroup("Fabric", lotRows(bucket.fabric))}
    ${invGroup("Consumables", lotRows(bucket.consumables))}
    ${invGroup("Parts stored here", bucket.parts.map(o => invRow("parts", o, "")).join(""))}
    ${nowhere && idx.legacyParts.length ? invGroup("Parts with free-text locations (legacy)",
      idx.legacyParts.map(p => `<div class="pmini" onclick="openRecord('parts','${esc(p.id)}')">
        <span class="pm-name">${esc(p.partName || p.id)}</span><span class="tny muted">"${esc(p.moldLocation)}"</span></div>`).join("")) : ""}
    ${nowhere ? "" : `<div class="no-print" style="margin-top:12px"><div class="lg-label tny">Add here</div>
      ${addBtn("PNL", "Test panel")}${addBtn("JIG", "Jig")}${addBtn("FAB", "Fabric")}${addBtn("RSN", "Resin / hardener")}${addBtn("CON", "Consumable")}</div>`}
  </div>`;
}

/* Standing at the shelf with a pile of things: scan each thing, it moves HERE.
   The inverse of quickMove, for restocking. */
function invMoveHere(binId) {
  openScan({
    title: "Move things here",
    hint: "Scan the label on each thing you are putting on this shelf. The camera stays open.",
    sticky: true,
    accept: id => /^(MOLD|PNL|JIG|FAB|RSN|CON|BRD|P)-/.test(String(id)),
    onCode: id => {
      const tab = tabForId(id);
      const coll = tab ? (TABS.find(t => t.id === tab) || {}).coll : null;
      if (!coll || !recById(coll, id)) { toast(`Don't recognise ${id}.`, "error"); return; }
      setLocation(coll, id, binId);
    },
  });
}

/* The stock walk, one tap per shelf: "I looked, this list is true". CS-011
   §7.1 wants a monthly walk and §8 scores it; walkedAt is the record. */
function invConfirmContents(binId) {
  const b = shopById("items", binId);
  if (!b) return;
  b.walkedAt = new Date().toISOString().slice(0, 10);
  b.walkedBy = signerName();
  save("items", b, "walkedAt");
  save("items", b, "walkedBy");
  toast(`${b.name || b.id} confirmed — thanks for walking it.`);
  render();
}

/* ---------- the tab ---------- */
function renderInventory() {
  const sel = invSelected();
  if (view.mode === "detail" && view.id === "NOWHERE") return renderInvContents("NOWHERE");
  if (sel && sel.kind === "bin" && sel.rec) return renderInvContents(sel.rec);
  if (sel && sel.rec) {
    const tab = sel.kind === "lot" ? "lots" : "items";
    return `<section class="mddetail">${renderShopDetail(tab, { embedded: true, back: "clearInvSelection", move: null, backLabel: "Storage map" })}</section>`;
  }
  if (sel && !sel.rec) { view.mode = "list"; view.id = null; }
  const v = view.invView === "items" || view.invView === "lots" ? view.invView : "map";
  if (v === "items") return invToolbar("items") + renderShopList("items");
  if (v === "lots") return invToolbar("lots") + renderShopList("lots");
  return renderInvMap();
}

function invKeydown(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (typeof view === "undefined" || view.tab !== "inventory") return null;
  const t = e.target || {};
  const tag = String(t.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) {
    if (e.key === "Escape" && t.blur) { t.blur(); return "blur"; }
    return null;
  }
  if (e.key === "Escape" && view.mode === "detail") { clearInvSelection(); return "clear"; }
  if (e.key === "/") {
    if (e.preventDefault) e.preventDefault();
    const s = document.getElementById("searchbox");
    if (s && s.focus) s.focus();
    return "search";
  }
  return null;
}
document.addEventListener("keydown", invKeydown);

/* ---------- incoming: bought, not yet on a shelf ----------
 *
 * Simon's ruling: a purchase means BOUGHT, not received, and it says nothing
 * about where things went. The on-order record is the budget line itself, so
 * Incoming is a QUERY over DB.budget, never a second copy of the fact — and
 * the reconciliation runs from the created records' buyRef (the truth: the
 * lot exists), not from the line's best-effort lotRefs back-link, so a save
 * that half-landed self-heals at render instead of ghosting forever. */

const INV_STALE_ORDER_DAYS = 14;

function invReceivedKeys() {
  const set = new Set();
  for (const coll of ["lots", "stock", "items"]) {
    for (const r of DB[coll] || []) {
      const br = r.buyRef;
      if (br && br.buyId && br.lineId) set.add(br.buyId + "|" + br.lineId);
    }
  }
  return set;
}

function invIncoming() {
  const recd = invReceivedKeys();
  const out = [];
  for (const b of DB.budget || []) {
    for (const l of b.lines || []) {
      if (!l.lineId || !String(l.desc || "").trim()) continue;
      if (recd.has(b.id + "|" + l.lineId)) continue;
      const age = b.dateOrdered ? invDaysSince(b.dateOrdered) : null;
      out.push({ buy: b, line: l, age, stale: age != null && age > INV_STALE_ORDER_DAYS });
    }
  }
  return out.sort((a, b2) => (b2.age || 0) - (a.age || 0));
}

/* The strip earns its place only when something is actually in the mail —
   empty states shrink the page, they don't pad it. */
function invIncomingHtml() {
  const inc = invIncoming();
  if (!inc.length) return "";
  return `<div class="card">
    <h3>Incoming <span class="muted nocaps tny">bought, not yet on a shelf · ${inc.length}</span></h3>
    ${inc.map(({ buy, line, age, stale }) => {
      const each = buyLineEach(line);
      const n = parseLooseMoney(line.qty);
      return `<div class="pmini invrow">
        <span class="pm-name">${esc(line.desc)}${n != null && n !== 1 ? ` ×${esc(line.qty)}` : ""}</span>
        ${each != null ? `<span class="tny muted">${esc(fmtMoney(each))} ea</span>` : ""}
        <span class="chip" onclick="openRecord('budget','${esc(buy.id)}')">${esc(buy.id)}</span>
        ${buy.source ? `<span class="tny muted">${esc(buy.source)}</span>` : ""}
        <span class="tny muted">${age == null ? "" : `ordered ${age}d ago${stale ? " ⚠" : ""}`}</span>
        <button class="sm no-print" onclick="invReceiveLine('${esc(buy.id)}','${esc(line.lineId)}')">Arrived ▸</button>
      </div>`;
    }).join("")}
  </div>`;
}

function invReceiveLine(buyId, lineId) {
  const b = recById("budget", buyId);
  const l = b && (b.lines || []).find(x => x.lineId === lineId);
  if (!l) return;
  invReceive("", { buyId, lineId, name: l.desc || "", unitCost: buyLineEach(l), qty: l.qty || "" });
}

/* ---------- receive a delivery ----------
 * An Easy Composites order lands as rolls + jugs + consumables at once, and
 * stocking it used to be N trips through the class picker. Pick the shelf
 * once, one line per thing, and every record is born located and dated; the
 * batch then offers its labels in one sheet. Ids are allocated serially on
 * purpose — the shared counter is the whole point of allocId. */
let INV_RX_N = 0;
let INV_RX_FROM = null;   // {buyId, lineId, unitCost, qty} when receiving a purchase line
function invRxRow(preset) {
  const i = INV_RX_N++;
  const p = preset || {};
  return `<div class="grid" data-rx-row style="grid-template-columns: 1fr 2fr 1fr; gap: 6px">
    <select id="rx-cls-${i}">
      <option value="FAB" ${p.cls === "FAB" ? "selected" : ""}>Fabric</option><option value="RSN" ${p.cls === "RSN" ? "selected" : ""}>Resin / hardener</option><option value="CON" ${p.cls !== "FAB" && p.cls !== "RSN" ? "selected" : ""}>Consumable</option>
    </select>
    <input id="rx-name-${i}" placeholder="what is it" value="${esc(p.name || "")}">
    <input id="rx-lot-${i}" placeholder="vendor lot #">
  </div>`;
}
function invReceive(binId, from) {
  INV_RX_N = 0;
  INV_RX_FROM = from || null;
  const bins = invActiveBins();
  openModal(`
    <h2>Receive a delivery</h2>
    <p class="muted tny">One line per thing in the box. Everything lands on the shelf you pick, dated today, sealed.</p>
    ${from ? `<p class="muted tny">Receiving <b>${esc(from.name)}</b> from ${esc(from.buyId)} — the record lands${typeof from.unitCost === "number" ? ` priced at ${esc(fmtMoney(from.unitCost))} each` : ""} and linked back to the purchase.</p>` : ""}
    <div class="field"><label>Onto</label><select id="rx-bin">
      <option value="">—</option>
      ${bins.map(b => `<option value="${esc(b.id)}" ${binId === b.id ? "selected" : ""}>${esc(b.name || b.id)}</option>`).join("")}
    </select></div>
    <div id="rx-rows">${from ? invRxRow({ name: from.name, cls: "CON" }) : invRxRow() + invRxRow() + invRxRow()}</div>
    ${from ? "" : `<div class="no-print" style="margin: 6px 0"><button class="sm" onclick="document.getElementById('rx-rows').insertAdjacentHTML('beforeend', invRxRow())">+ another line</button></div>`}
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="invReceiveSubmit()">Add them</button>
    </div>`);
}
async function invReceiveSubmit() {
  const val = k => (document.getElementById(k) || {}).value || "";
  const loc = val("rx-bin");
  if (!loc) { toast("Pick the shelf the delivery goes onto.", "error"); return; }
  const rows = [];
  for (let i = 0; i < INV_RX_N; i++) {
    const name = String(val("rx-name-" + i)).trim();
    if (!name) continue;
    rows.push({ cls: val("rx-cls-" + i) || "CON", name, vendorLot: String(val("rx-lot-" + i)).trim() });
  }
  if (!rows.length) { toast("Nothing to add — name at least one thing.", "error"); return; }
  const from = INV_RX_FROM;
  INV_RX_FROM = null;
  const today = new Date().toISOString().slice(0, 10);
  const made = [];
  for (const r of rows) {
    const id = await allocId("lots", r.cls);
    if (!id) break;
    const o = { id, cls: r.cls, name: r.name, vendorLot: r.vendorLot, stage: "Sealed",
      receivedOn: today, location: loc, createdBy: myEmail() };
    if (from) {
      /* The graduation: the record is born knowing what it cost and which
         purchase bought it. Lot first, back-link second — a lot whose buyRef
         points at a line is recoverable by the Incoming reconciler even if
         the line update below never lands; the reverse is fiction. */
      o.buyRef = { buyId: from.buyId, lineId: from.lineId };
      if (typeof from.unitCost === "number") { o.unitCost = from.unitCost; o.costUnit = "ea"; }
      if (from.qty) o.qty = String(from.qty);
    }
    (DB.lots = DB.lots || []).push(o);
    save("lots", o);
    made.push(o);
  }
  if (from && made.length) {
    const bb = recById("budget", from.buyId);
    if (bb) {
      const ids = made.map(o => o.id);
      const bl = (bb.lines || []).find(x => x.lineId === from.lineId);
      if (bl) { bl.lotRefs = [...(bl.lotRefs || []), ...ids]; bl.receivedOn = today; }
      saveField("budget", bb, "lines", arr => (arr || []).map(x =>
        x.lineId === from.lineId ? { ...x, lotRefs: [...(x.lotRefs || []), ...ids], receivedOn: today } : x));
    }
  }
  closeModal();
  toast(`${made.length} record${made.length === 1 ? "" : "s"} received onto ${(shopById("items", loc) || {}).name || loc}.`);
  view = { ...view, tab: "inventory", mode: "detail", id: loc, edit: false };
  render();
  // The batch's labels, one sheet, while the box is still open. Non-fatal:
  // the records are already saved, and a preview that cannot draw its QRs
  // must not read as a failed delivery.
  if (made.length && typeof openLabelPreview === "function") {
    try { openLabelPreview(made.map(o => ({ coll: "lots", o }))); } catch (e) { /* labels print later */ }
  }
}
