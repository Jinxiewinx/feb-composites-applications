"use strict";
/* shop.js — the physical world: molds, items, material lots.
 *
 * WHY THESE EXIST
 * A mold used to exist only as free text inside one work order
 * (`wo.mold.moldId = "MOLD-UT-INLET"`). Two work orders using the same mold
 * held two copies of the truth, and `mold.location` — the field whose own label
 * says "update on every move" — was wrong on one of them the moment anybody
 * moved it. A mold outlives the work orders that use it, gets reused across
 * parts and across seasons, and is the most-moved object in the shop. PP-10 is
 * literally about molds nobody could identify blocking shared storage for
 * weeks. It is the textbook case for an entity.
 *
 * Material lots exist so "which fabric roll and which resin batch went into
 * this panel" has an answer. Today resin is identified by packaging colour
 * ("big tank, blue label") and cloth by gsm alone.
 *
 * Test panels exist so a tensile coupon can name its parent. The SN5 data is
 * seventeen CSVs whose only identity is a trailing integer in the filename.
 *
 * THREE COLLECTIONS, NOT NINE
 * `items` (PNL/JIG/BIN) and `lots` (FAB/RSN/CON) are multi-class: one
 * collection each, discriminated by `cls`. Their fields are near-identical and
 * nine onSnapshot listeners at boot buys nothing.
 *
 * ONE ENGINE, THREE TABS
 * Everything below is driven by the SHOP schema. Three near-identical tabs
 * hand-written three times would drift, and the mobile behaviour would drift
 * with them — which is the failure this file is shaped to avoid. Add a field to
 * the schema and it appears in the list, the detail page, the search and the
 * label with no further code.
 */

/* ---------- the schema ---------- */

const MOLD_STAGE = ["Designed", "Board glued", "Machined", "Sealed", "Ready for layup", "Retired"];
const PNL_STAGE = ["Planned", "Laid up", "Cured", "Cut", "Tested"];
const LOT_STATE = ["Sealed", "Open", "Empty", "Expired"];

/* `f` fields: [key, label, type, opts]
   type: text | date | num | select | rec:<coll> | textarea
   `list` names the columns the table shows, in order. `key` is the one field
   that is bold in the list and largest on the label. */
const SHOP = {
  molds: {
    tab: "molds", label: "Molds", icon: "layers", coll: "molds", cls: null, prefix: "MOLD",
    noun: "mold", nounPlural: "molds",
    stage: { key: "stage", vals: MOLD_STAGE },
    list: ["name", "stage", "location", "uses", "board"],
    f: [
      ["name", "Name", "text"],
      ["stage", "Stage", "select", MOLD_STAGE],
      ["location", "Home location", "rec:BIN"],
      ["board", "Cut from board", "rec:stock"],
      ["wo", "Work order", "rec:workOrders"],
      ["density", "Board density (lb/ft³)", "select", ["30", "45", "60"]],
      ["layers", "Board layers", "text"],
      ["sealingType", "Sealing system", "select", ["XCR", "S120", "Resin", "Other"]],
      ["sealedDate", "Sealed on", "date"],
      ["sealedBy", "Sealed by", "text"],
      // The number nobody currently tracks, and the reason molds get run past
      // their release life. It is on the printed label for the same reason.
      ["uses", "Parts pulled", "num"],
      ["rev", "Revision", "text"],
      ["legacyNames", "Also known as", "text"],
    ],
  },
  items: {
    tab: "items", label: "Items", icon: "parts", coll: "items", prefix: null,
    noun: "item", nounPlural: "items",
    classes: [
      { cls: "PNL", label: "Test panel", stage: PNL_STAGE },
      { cls: "JIG", label: "Jig / fixture", stage: ["In use", "Stored", "Retired"] },
      { cls: "BIN", label: "Storage location", stage: ["Active", "Retired"] },
    ],
    stage: { key: "stage", vals: null },   // per class
    list: ["name", "cls", "stage", "location", "laidOn"],
    f: [
      ["name", "Name", "text"],
      ["stage", "Stage", "select", null],
      ["location", "Location", "rec:BIN"],
      /* BIN-only (see SHOP_FIELDS_BY_CLASS): the storage-map fields. `site`
         is CS-011 §7.3's vocabulary as a dropdown; `locKind` and `flam` feed
         the §6 chemical-storage warnings; walkedAt/By are stamped by the
         Confirm-contents button and editable here so a lead can correct one. */
      ["site", "Site", "select", ["", "RFS container", "Jacobs basement", "Flammables cabinet", "Dry sealed bin", "General Box", "Other"]],
      ["locKind", "Type", "select", ["", "shelf", "rack", "cabinet", "bin", "box", "fridge"]],
      ["flam", "Rated for flammables", "select", ["", "Yes"]],
      ["walkedAt", "Contents last confirmed", "date"],
      ["walkedBy", "Confirmed by", "text"],
      ["stack", "Layup stack", "text"],           // PNL: the PP-09 answer
      ["session", "Laid in session", "text"],
      ["laidOn", "Laid up on", "date"],
      ["thicknessMm", "Thickness (mm)", "num"],
      ["coupons", "Coupon range", "text"],        // e.g. C01-C12
      ["wo", "Work order", "rec:workOrders"],
      ["fabricLots", "Fabric lot(s)", "rec:FAB"],
      ["resinLot", "Resin lot", "rec:RSN"],
      ["hardenerLot", "Hardener lot", "rec:RSN"],
      // "partial" belongs here: workorders.js's readLotFields() has produced it
      // since lot capture shipped, but this select never offered it, so editing
      // a panel silently destroyed the honest half-scanned state.
      ["lotSource", "Lot record", "select", ["scanned", "inferred", "recalled", "partial", "unknown"]],
    ],
  },
  lots: {
    tab: "lots", label: "Materials", icon: "documents", coll: "lots", prefix: null,
    noun: "lot", nounPlural: "material lots",
    classes: [
      { cls: "FAB", label: "Fabric roll / offcut", stage: LOT_STATE },
      { cls: "RSN", label: "Resin / hardener", stage: LOT_STATE },
      { cls: "CON", label: "Consumable", stage: LOT_STATE },
    ],
    stage: { key: "stage", vals: null },
    list: ["name", "cls", "stage", "vendorLot", "location"],
    f: [
      ["name", "Material", "text"],
      ["stage", "State", "select", null],
      ["role", "Role", "select", ["", "resin", "hardener"]],
      ["ratio", "Mix ratio", "text"],
      ["vendorLot", "Vendor lot number", "text"],
      ["supplier", "Supplier", "text"],
      ["receivedOn", "Received", "date"],
      ["openedOn", "Opened", "date"],
      ["expiresOn", "Expires", "date"],
      ["location", "Home location", "rec:BIN"],
      ["parentId", "Cut from roll", "rec:FAB"],   // an offcut is a roll with a parent
      ["qty", "Quantity left", "text"],
      /* `hazard` drives the §6 chemical chips on the storage map; `lowFlag`
         is an honest manual "running low" toggle — qty is free text, so a
         numeric min-stock would be pretending precision we don't have. */
      ["hazard", "Hazard", "select", ["", "flammable"]],
      ["lowFlag", "Running low", "select", ["", "Yes — reorder"]],
    ],
  },
};

function shopSpec(tab) { return Object.values(SHOP).find(s => s.tab === tab); }
function shopById(coll, id) { return (DB[coll] || []).find(o => o.id === id); }
/* The one-class case is expressed as a one-entry list so every call site below
   is uniform. `label` is the SINGULAR noun because it is what the "+ …" button
   reads; the tab keeps the plural. */
function shopClasses(spec) {
  return spec.classes || [{ cls: spec.prefix, label: capFirst(spec.noun), stage: spec.stage.vals }];
}
function capFirst(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
function shopClassOf(spec, o) {
  const c = shopClasses(spec);
  return c.find(x => x.cls === (o.cls || spec.prefix)) || c[0];
}
function shopClassLabel(spec, cls) {
  const c = shopClasses(spec).find(x => x.cls === cls);
  return c ? c.label : cls;
}

/* ---------- create / delete ---------- */

async function newShopRec(tab, cls, preset) {
  const spec = shopSpec(tab);
  if (!spec) return;
  const use = cls || shopClasses(spec)[0].cls;
  // Multi-class collections need the class to allocate against the right
  // counter; single-class ones pass null and use ID_PREFIX.
  const id = await allocId(spec.coll, spec.classes ? use : null);
  if (!id) return;
  // `preset` is how "Add here" on the storage map births a record already
  // located: {location: "BIN-…"} spread in before the first save.
  const o = { id, name: "", stage: shopClasses(spec).find(c => c.cls === use).stage[0], createdBy: myEmail(), ...(preset || {}) };
  if (spec.classes) o.cls = use;
  DB[spec.coll].push(o);
  save(spec.coll, o);
  view = { ...view, tab, mode: "detail", id, edit: true };
  render(); syncUrl();
}

function delShopRec(tab, id) {
  const spec = shopSpec(tab);
  confirmModal(`Delete ${id} for everyone? Back up first if unsure.`, () => {
    del(spec.coll, id);
    DB[spec.coll] = DB[spec.coll].filter(o => o.id !== id);
    view = { ...view, mode: "list", id: null };
    render(); syncUrl();
  });
}

function updShop(tab, key, val) {
  const spec = shopSpec(tab);
  const o = shopById(spec.coll, view.id);
  if (!o) return;
  /* A record's id carries its class prefix, and scanning trusts the prefix:
     quickMoveScan accepts only BIN-. A JIG turned into a BIN would keep its
     JIG- id and be a shelf no scan can target. Kind changes touching BIN are
     refused; recreate the record instead. Other class flips (PNL<->JIG,
     FAB<->CON) keep working — their stale prefix routes to the same tab. */
  if (key === "cls" && (val === "BIN" || o.cls === "BIN") && val !== o.cls) {
    toast("A storage location's id is what its scan label points at — make a new record instead of converting this one.", "error");
    render();
    return;
  }
  o[key] = val;
  save(spec.coll, o, key);
  // Stage and class drive the pill and the available stages, so both need a
  // repaint; everything else is a plain field and does not.
  if (key === "stage" || key === "cls") render();
}

/* ---------- list ---------- */

function renderShop(tab) {
  return view.mode === "detail" ? renderShopDetail(tab) : renderShopList(tab);
}

function shopStageClass(spec, o) {
  const c = shopClassOf(spec, o);
  const i = (c.stage || []).indexOf(o.stage);
  if (o.stage === "Retired" || o.stage === "Empty" || o.stage === "Expired") return "Cancelled";
  if (i < 0) return "Draft";
  if (i === 0) return "Draft";
  if (i >= (c.stage || []).length - 1) return "Complete";
  return "InWork";
}

function renderShopList(tab) {
  const spec = shopSpec(tab);
  const D = DB[spec.coll] || [];
  const q = (view.q || "").toLowerCase();
  const rows = D
    .filter(o => !view.fSub || (o.cls || spec.prefix) === view.fSub)
    .filter(o => !view.fStatus || o.stage === view.fStatus)
    .filter(o => !q || JSON.stringify(o).toLowerCase().includes(q))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const classes = shopClasses(spec);
  const stages = [...new Set(classes.flatMap(c => c.stage || []))];

  /* Stat tiles answer the question the tab exists for. For molds that is "how
     many are ready to lay up on" and "how many are somewhere nobody wrote
     down", which is PP-10 restated as a number. */
  const tiles = tab === "molds"
    ? [
        [D.length, "Molds"],
        [D.filter(o => o.stage === "Ready for layup").length, "Ready for layup"],
        [D.filter(o => !o.location).length, "No home location"],
      ]
    : [
        [D.length, spec.label],
        ...classes.map(c => [D.filter(o => (o.cls || spec.prefix) === c.cls).length, c.label]),
      ].slice(0, 4);

  return `
  <div class="stat-row">
    ${tiles.map(([n, lab]) => `<div class="stat-tile"><div class="bignum">${n}</div><div class="stat-label">${esc(lab)}</div></div>`).join("")}
  </div>
  <div class="toolbar no-print">
    ${classes.map(c => `<button class="${c === classes[0] ? "primary" : ""}" onclick="newShopRec('${tab}','${c.cls}')">+ ${esc(c.label)}</button>`).join("")}
    ${D.length ? `<button class="ib" onclick="openLabelBuilder('${spec.coll}')">${icon("print", 15)} Labels</button>` : ""}
  </div>
  <div class="filters no-print">
    ${spec.classes ? `<select onchange="view.fSub=this.value;render()">
      <option value="">All kinds</option>
      ${classes.map(c => `<option value="${c.cls}" ${view.fSub === c.cls ? "selected" : ""}>${esc(c.label)}</option>`).join("")}
    </select>` : ""}
    <select onchange="view.fStatus=this.value;render()">
      <option value="">All stages</option>
      ${stages.map(s => `<option ${view.fStatus === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
    </select>
    <input id="searchbox" placeholder="search ${esc(spec.nounPlural)} / id…" value="${esc(view.q || "")}" oninput="searchInput(this)">
  </div>
  ${!D.length ? `<div class="card">No ${esc(spec.nounPlural)} yet. ${spec.coll === "molds"
      ? `Add one, or import the SN5 molds from their work orders with <b>Find molds in work orders</b> under Reports.`
      : `Use the buttons above to add one.`}</div>` : ""}
  ${rows.length ? `<table class="list">
    <tr>${spec.list.map(k => `<th>${esc(shopColLabel(spec, k))}</th>`).join("")}</tr>
    ${rows.map(o => `<tr onclick="openRecord('${tab}','${esc(o.id)}')">
      ${spec.list.map((k, i) => `<td>${i === 0
        ? `<b>${esc(o.name || o.id)}</b><div class="muted tny">${esc(o.id)}</div>`
        : shopCell(spec, o, k)}</td>`).join("")}
    </tr>`).join("")}
  </table>` : (D.length ? `<div class="card">Nothing matches that filter.</div>` : "")}`;
}

function shopColLabel(spec, key) {
  if (key === "cls") return "Kind";
  const f = spec.f.find(f => f[0] === key);
  return f ? f[1] : key;
}
function shopCell(spec, o, key) {
  if (key === "cls") return `<span class="kind">${esc(shopClassLabel(spec, o.cls || spec.prefix))}</span>`;
  if (key === "stage") return `<span class="pill ${shopStageClass(spec, o)}">${esc(o.stage || "—")}</span>`;
  const v = o[key];
  if (v == null || v === "") return '<span class="muted">—</span>';
  if (Array.isArray(v)) return esc(v.join(", "));
  // A reference renders as a chip so it is followable, the way the rest of the
  // app cross-links.
  const f = spec.f.find(f => f[0] === key);
  if (f && String(f[2]).startsWith("rec:")) return shopRefChip(String(v));
  return esc(String(v));
}

/* A reference to another record. Uses the same tab-from-prefix map the scan
   router uses, so a chip and a scanned QR land in exactly the same place. */
function shopRefChip(id) {
  const tab = typeof tabForId === "function" ? tabForId(id) : null;
  if (!tab) return esc(id);
  const coll = (TABS.find(t => t.id === tab) || {}).coll;
  const rec = coll ? shopById(coll, id) : null;
  const label = rec ? (rec.name || rec.partName || rec.label || id) : id;
  return `<span class="chip" onclick="event.stopPropagation();openRecord('${tab}','${esc(id)}')">${esc(label)}</span>`;
}

/* ---------- detail ---------- */

/* `opts.embedded` renders the same card inside the merged Molds tab's right
   pane: the back button clears the selection instead of popping the nav trail,
   and prev/next walk the rail. The DEFAULT output is byte-identical to before
   the option existed — Materials and Items call this bare, have no test
   coverage, and must not move. */
/* `opts.embedded` renders inside a merged tab's pane. `back` and `move` name
   the host's selection callbacks (defaults are the Molds tab's, so existing
   calls are unchanged); `move: null` drops the prev/next arrows for hosts
   without a walkable rail, like the storage map. */
function renderShopDetail(tab, opts) {
  const spec = shopSpec(tab);
  const emb = !!(opts && opts.embedded);
  const back = (opts && opts.back) || "clearMoldsSelection";
  const move = opts && "move" in opts ? opts.move : "moveMoldsSelection";
  const backLabel = (opts && opts.backLabel) || navBackLabel(spec);
  const o = shopById(spec.coll, view.id);
  if (!o) { view.mode = "list"; return renderShopList(tab); }
  const E = view.edit;
  const c = shopClassOf(spec, o);

  return `
  <div class="toolbar no-print">
    ${emb
      ? `<button class="ib" onclick="${back}()">${icon("chevronLeft", 16)} ${esc(backLabel)}</button>`
      : `<button class="ib" onclick="navBack({tab:'${tab}',mode:'list',id:null})">${icon("chevronLeft", 16)} ${esc(navBackLabel(spec))}</button>`}
    <button class="primary ib" onclick="view.edit=!view.edit;render()">${icon(E ? "check" : "edit", 15)} ${E ? "Done" : "Edit"}</button>
    ${labelBtn(spec.coll, o.id)}
    ${/* Visible to a lead WITHOUT pressing Edit first. It used to hide behind
          edit mode, and the observable result was "you can retire an item but
          not delete it" — the button existed and nobody could find it. Still
          lead-only (firestore.rules enforces that server-side) and still
          behind a confirm. The board detail page works the same way. */""}
    ${isLead() ? `<button class="danger" onclick="delShopRec('${tab}','${esc(o.id)}')">Delete</button>` : ""}
    ${emb && move ? `<span class="mdnav no-print">
      <button class="sm" title="Previous (↑)" onclick="${move}(-1)">${icon("chevronLeft", 14)}</button>
      <button class="sm" title="Next (↓)" onclick="${move}(1)">${icon("chevronRight", 14)}</button>
    </span>` : ""}
  </div>
  ${/* The two bench actions, above the fold and outside edit mode. Someone
        standing at a shelf with gloves on should not have to press Edit, find
        a field and open a dropdown to say "it moved" or "that's done". */""}
  <div class="toolbar no-print">
    <button class="ib" onclick="quickMove('${esc(spec.coll)}','${esc(o.id)}')">${icon("layers", 15)} Move</button>
    ${shopNextStage(spec, o) ? `<button class="ib" onclick="quickAdvance('${esc(spec.coll)}','${esc(o.id)}')">${icon("check", 15)} ${esc(shopNextStage(spec, o))}</button>` : ""}
  </div>
  ${typeof shopUndoBar === "function" ? shopUndoBar() : ""}
  <div class="card" data-lbgroup="${esc(spec.coll)}:${esc(o.id)}">
    <h2>${esc(o.name || "(unnamed " + spec.noun + ")")}</h2>
    <div class="muted">${esc(o.id)} · <span class="pill ${shopStageClass(spec, o)}">${esc(o.stage || "—")}</span>${
      spec.classes ? " · " + esc(c.label) : ""}${
      o.updatedAt ? " · saved " + fmtWhen(o.updatedAt) + " by " + esc(o.updatedBy || "?") : ""}</div>
    ${E ? `<div class="editnote no-print">${icon("edit", 14)} Editing — every change saves as you make it.</div>` : ""}

    ${spec.classes && E ? `<h3>Kind</h3><div class="grid"><div class="f"><label>Kind</label>
      <select onchange="updShop('${tab}','cls',this.value)">
        ${shopClasses(spec).map(x => `<option value="${x.cls}" ${x.cls === c.cls ? "selected" : ""}>${esc(x.label)}</option>`).join("")}
      </select></div></div>` : ""}

    <h3>Details</h3>
    <div class="grid">${spec.f.map(f => shopFld(spec, tab, o, f, c)).join("")}</div>

    ${tab === "molds" && typeof moldPlanSection === "function" ? moldPlanSection(o) : ""}
    ${tab === "molds" ? moldUses(o) : ""}

    <h3>Notes</h3>
    ${richField(spec.coll, o.id, "notes", {
      plain: true, label: "Notes",
      empty: `Anything the next person needs to know about this ${esc(spec.noun)}.`,
      upload: name => `${spec.coll}/${o.id}/${Date.now()}-${name}`,
    })}
  </div>`;
}

function navBackLabel(spec) { return "All " + spec.nounPlural; }

// The next stage, or "" at the end. Named on the button rather than a generic
// "Advance", so the tap is a decision you can see before you make it.
function shopNextStage(spec, o) {
  const stages = shopClassOf(spec, o).stage || [];
  const i = stages.indexOf(o.stage);
  return i >= 0 && i < stages.length - 1 ? stages[i + 1] : "";
}

/* What this mold has made. A read-only join rather than a stored list, so it
   cannot go stale: it is every work order and part pointing here. */
function moldUses(m) {
  const wos = (DB.workOrders || []).filter(w => w.moldRef === m.id || (w.mold && w.mold.moldId === m.id));
  const parts = (DB.parts || []).filter(p => p.mold === m.id);
  if (!wos.length && !parts.length) return "";
  return `<h3>Used by</h3>
    <div class="stagerow">${[
      ...wos.map(w => `<span class="chip" onclick="openRecord('workorders','${esc(w.id)}')">${esc(w.id)} ${esc(w.partName || "")}</span>`),
      ...parts.map(p => `<span class="chip" onclick="openRecord('parts','${esc(p.id)}')">${esc(p.id)} ${esc(p.partName || "")}</span>`),
    ].join("")}</div>`;
}

function shopFld(spec, tab, o, f, c) {
  const [key, label, type, opts] = f;
  // Fields that only make sense for one class stay hidden for the others: a
  // storage bin has no layup stack, and a fabric roll has no mix ratio.
  if (!shopFieldApplies(spec, c.cls, key)) return "";
  let v = o[key] ?? "";
  if (Array.isArray(v)) v = v.join(", ");

  if (!view.edit) {
    const shown = key === "stage" ? `<span class="pill ${shopStageClass(spec, o)}">${esc(o.stage || "—")}</span>`
      : String(type).startsWith("rec:") && v ? shopRefChip(String(v))
      : esc(v) || "—";
    return `<div class="f"><label>${esc(label)}</label><div class="ro">${shown}</div></div>`;
  }

  if (type === "select") {
    const list = key === "stage" ? (c.stage || []) : (opts || []);
    return `<div class="f"><label>${esc(label)}</label>
      <select onchange="updShop('${tab}','${key}',this.value)">
        ${list.map(x => `<option ${String(v) === String(x) ? "selected" : ""}>${esc(x)}</option>`).join("")}
      </select></div>`;
  }
  if (String(type).startsWith("rec:")) {
    return `<div class="f"><label>${esc(label)}</label>
      <select onchange="updShop('${tab}','${key}',this.value)">
        <option value="">—</option>
        ${shopRefOptions(String(type).slice(4), String(v)).join("")}
      </select></div>`;
  }
  const inputType = type === "date" ? "date" : type === "num" ? "number" : "text";
  return `<div class="f"><label>${esc(label)}</label>
    <input type="${inputType}" value="${esc(v)}" onchange="updShop('${tab}','${key}',this.value)"></div>`;
}

/* Candidates for a reference field. `what` is either a collection name or a
   class prefix inside a multi-class collection. */
function shopRefOptions(what, cur) {
  let recs = [];
  if (DB[what]) recs = DB[what];
  else {
    for (const coll of ["items", "lots", "molds"]) {
      recs = recs.concat((DB[coll] || []).filter(o => o.cls === what));
    }
  }
  return recs
    .slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(o => `<option value="${esc(o.id)}" ${o.id === cur ? "selected" : ""}>${esc(o.name || o.partName || o.label || o.id)} · ${esc(o.id)}</option>`);
}

/* Which fields belong to which class. Kept as one table rather than scattered
   conditionals so the answer to "why is this field missing" is in one place. */
const SHOP_FIELDS_BY_CLASS = {
  PNL: ["name", "stage", "location", "stack", "session", "laidOn", "thicknessMm", "coupons", "wo", "fabricLots", "resinLot", "hardenerLot", "lotSource"],
  JIG: ["name", "stage", "location", "wo"],
  BIN: ["name", "stage", "site", "locKind", "flam", "walkedAt", "walkedBy"],
  FAB: ["name", "stage", "vendorLot", "supplier", "receivedOn", "openedOn", "location", "parentId", "qty", "lowFlag"],
  RSN: ["name", "stage", "role", "ratio", "vendorLot", "supplier", "receivedOn", "openedOn", "expiresOn", "location", "qty", "hazard", "lowFlag"],
  CON: ["name", "stage", "vendorLot", "supplier", "receivedOn", "openedOn", "location", "qty", "hazard", "lowFlag"],
};
function shopFieldApplies(spec, cls, key) {
  const allowed = SHOP_FIELDS_BY_CLASS[cls];
  return allowed ? allowed.includes(key) : true;
}

/* ---------- migration: molds out of the work orders that mention them ----------
 *
 * `wo.mold.moldId` is free text, so "MOLD-UT-INLET" and "UT INLET MOLD" are the
 * same mold and no algorithm should be allowed to decide that. This proposes
 * and a human confirms; nothing is merged automatically. Lead-only because it
 * creates records.
 *
 * wo.mold is NOT deleted. print.js does `const mold = wo.mold || {}` and
 * travelers already in the RFS binder reference the embedded values; removing
 * it would rewrite printed history. A new `wo.moldRef` points at the record.
 */
function findMoldsInWorkOrders() {
  if (!isLead()) return;
  const seen = new Map();
  for (const w of DB.workOrders || []) {
    const raw = String((w.mold && w.mold.moldId) || "").trim();
    if (!raw) continue;
    const norm = raw.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    if (!seen.has(norm)) seen.set(norm, { raw, norm, wos: [], mold: w.mold || {} });
    seen.get(norm).wos.push(w);
  }
  const found = [...seen.values()].filter(g => !(DB.molds || []).some(m => (m.legacyNames || []).includes(g.raw)));
  if (!found.length) { toast("No unimported mold names found in work orders."); return; }

  MOLD_IMPORT = found.map(g => ({ ...g, take: true }));
  openModal(moldImportHtml());
}

let MOLD_IMPORT = [];

function moldImportHtml() {
  const n = MOLD_IMPORT.filter(g => g.take).length;
  return `<h3>Molds found in work orders</h3>
  <p class="muted">These are the free-text mold names on existing work orders. Untick anything that is
  the same physical mold under a different name, then fix the duplicate by hand afterwards — no
  algorithm should decide that two spellings are one mold.</p>
  <div class="lblist">
    ${MOLD_IMPORT.map((g, i) => `<label class="chk">
      <input type="checkbox" ${g.take ? "checked" : ""} onchange="MOLD_IMPORT[${i}].take=this.checked;moldImportRefresh()">
      <b>${esc(g.raw)}</b> <span class="muted">${g.wos.length} work order${g.wos.length === 1 ? "" : "s"}</span>
    </label>`).join("")}
  </div>
  <div class="foot">
    <button onclick="closeModal()">Cancel</button>
    <button class="primary" ${n ? "" : "disabled"} onclick="runMoldImport()">Create ${n} mold${n === 1 ? "" : "s"}</button>
  </div>`;
}
function moldImportRefresh() {
  const m = document.querySelector("#modal .modal");
  if (m) m.innerHTML = moldImportHtml();
}

async function runMoldImport() {
  const take = MOLD_IMPORT.filter(g => g.take);
  closeModal();
  let made = 0;
  for (const g of take) {
    const id = await allocId("molds");
    if (!id) break;
    const w = g.wos[0];
    const m = {
      id,
      name: g.raw.replace(/^MOLD[-\s]*/i, "").replace(/[-_]+/g, " ").trim() || g.raw,
      legacyNames: [g.raw],
      stage: g.mold.sealingType ? "Sealed" : "Machined",
      location: g.mold.location || "",
      density: g.mold.density || "",
      layers: g.mold.layers || "",
      sealingType: g.mold.sealingType || "",
      wo: w ? w.id : "",
      uses: g.wos.length,
      rev: "A",
      createdBy: myEmail(),
      retro: true,
    };
    DB.molds.push(m);
    save("molds", m);
    // Point every work order that named this mold at the new record. The
    // embedded wo.mold stays exactly as it was.
    for (const w2 of g.wos) { w2.moldRef = id; save("workOrders", w2, "moldRef"); }
    made++;
  }
  toast(`${made} mold${made === 1 ? "" : "s"} created from work orders.`);
  view = { ...view, tab: "molds", mode: "list", id: null };
  render(); syncUrl();
}

/* ---------- migration: the missing part <-> work order edge ----------
 *
 * sn5-parts.json has 0 of 33 rows carrying a workOrderId. The two lists are
 * joined only by partName string equality, and the strings do not even agree
 * between the original spreadsheet's own sheets. The traceability gap is not
 * missing ids, it is missing EDGES, and this is twenty lines that turn two
 * disconnected lists into a graph.
 *
 * The ambiguity that matters is DUPLICATE PART NAMES: two parts called STRUT
 * and one work order, and there is no way to know whose run it was. That case
 * is still refused — a wrong edge is worse than no edge, and duplicate part
 * names are a real FEB pattern (partOf() in core.js refuses it too).
 *
 * One part matching SEVERAL work orders is NOT ambiguous any more, and used to
 * be thrown away. Under a one-to-many model that is just a part with several
 * runs — a remake after a failed infusion is the ordinary case. All of them get
 * linked and the newest becomes the current run.
 */
async function backfillPartWorkOrderLinks() {
  if (!isLead()) return;
  const byName = {};
  for (const w of DB.workOrders || []) {
    const k = String(w.partName || "").trim().toUpperCase();
    if (!k) continue;
    (byName[k] = byName[k] || []).push(w);
  }
  // A name is only safe to match on if exactly one PART answers to it.
  const partsByName = {};
  for (const p of DB.parts || []) {
    const k = String(p.partName || "").trim().toUpperCase();
    if (!k) continue;
    (partsByName[k] = partsByName[k] || []).push(p);
  }
  const todo = [];
  let refused = 0, extraRuns = 0;
  for (const p of DB.parts || []) {
    const k = String(p.partName || "").trim().toUpperCase();
    const hits = (byName[k] || []).filter(w => !w.partId);
    if (!hits.length) continue;
    if ((partsByName[k] || []).length > 1) { refused += hits.length; continue; }
    // Newest first, so the pointer lands on the current run.
    hits.sort((a, b) => String(b.createdDate || "").localeCompare(String(a.createdDate || "")) ||
      String(b.id).localeCompare(String(a.id)));
    todo.push([p, hits]);
    if (hits.length > 1) extraRuns += hits.length - 1;
  }
  if (!todo.length) {
    toast(refused ? `Nothing safe to link — ${refused} work order${refused === 1 ? "" : "s"} match a duplicated part name.`
      : "Every part that can be matched already is.");
    return;
  }

  const nWo = todo.reduce((n, [, hits]) => n + hits.length, 0);
  const ok = await confirmAsync(
    `Link ${nWo} work order${nWo === 1 ? "" : "s"} to ${todo.length} part${todo.length === 1 ? "" : "s"} with the same name?\n\n` +
    (extraRuns ? `${extraRuns} of them are extra runs on a part that already has one — a remake is a second run, so they all get linked and the newest becomes current.\n\n` : "") +
    (refused ? `${refused} work order${refused === 1 ? " is" : "s are"} left alone because two or more parts share that name — a wrong link is worse than no link.\n\n` : "") +
    `Nothing is overwritten: work orders that already name a part are skipped.`,
    { ok: "Link them", danger: false });
  if (!ok) return;

  for (const [p, hits] of todo) {
    for (const w of hits) { w.partId = p.id; save("workOrders", w, "partId"); }
    if (!p.workOrderId) { p.workOrderId = hits[0].id; save("parts", p, "workOrderId"); }
  }
  toast(`${nWo} work order${nWo === 1 ? "" : "s"} linked across ${todo.length} part${todo.length === 1 ? "" : "s"}.`);
  render();
}
