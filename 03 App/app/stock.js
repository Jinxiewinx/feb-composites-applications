"use strict";
/* stock.js — the Stock tab: polyurethane tooling-board inventory.
   CS-011 wants a live board record and never had one; the Master Tracker sheet
   went stale in SN5 and nobody trusted it. This is that record, plus the input
   the mold stack planner needs.

   A full 4x8 sheet and a 19x30 offcut are the SAME KIND OF OBJECT here — both
   are just a board with dimensions. That's deliberate: it means remnants come
   back into inventory for free instead of needing their own system.

   UNITS: dimensions are stored AS ENTERED with a unit tag, never normalised on
   write. Storing canonical mm and redisplaying in inches drifts on every edit
   (48 -> 1219.2 -> 47.99999 -> saved). toMm() is the ONLY conversion point;
   everything downstream (slicer, stack planner) reads through it. */

const DENSITIES = [30, 60];          // lb/ft^3 — CS-003 §5. 60 seals better (CS-004).
const UNITS = ["in", "mm"];
const MAX_DIM_MM = 10000;            // 10 m. Anything larger is a typo or a unit mistake.

/* ---------- units: one conversion point ---------- */
function toMm(d) {
  if (!d || typeof d.value !== "number") return NaN;
  return d.unit === "mm" ? d.value : d.value * 25.4;
}
function fmtDim(d) {
  if (!d || typeof d.value !== "number") return "—";
  // Trim trailing zeros so 48.00 reads as 48 but 47.5 keeps its half.
  const n = Math.round(d.value * 1000) / 1000;
  return `${n}${d.unit === "mm" ? " mm" : "″"}`;
}
/* Parse one dimension field. Returns { dim } or { err } — never throws, never
   returns a half-valid dim, because a bad board silently entering inventory is
   how the stale Master Tracker happened. */
function parseDim(raw, unit) {
  const s = String(raw ?? "").trim();
  if (!s) return { err: "is required" };
  const v = Number(s);
  if (!Number.isFinite(v)) return { err: "must be a number" };
  if (v <= 0) return { err: "must be greater than zero" };
  const dim = { value: v, unit: UNITS.includes(unit) ? unit : "in" };
  if (toMm(dim) > MAX_DIM_MM) return { err: "is over 10 m — check the units" };
  return { dim };
}

function boardById(id) { return (DB.stock || []).find(b => b.id === id); }
function boardAreaM2(b) {
  const l = toMm(b.len), w = toMm(b.wid);
  if (!Number.isFinite(l) || !Number.isFinite(w)) return 0;
  return (l * w) / 1e6 * (b.qty || 1);
}
// Group key for the summary: boards of the same thickness+density are
// interchangeable stock, which is exactly the bucket the packer will use.
function thkKey(b) { return `${Math.round(toMm(b.thk) * 10) / 10}mm · ${b.density} lb`; }

/* ---------- boards, grouped by size ----------
   Simon: "we don't need each of them being their own item as we really only
   care about xyz and density." So the rack READS as one row per size with a
   quantity, which is how anybody standing in front of it would describe it.

   The documents still exist one per board, and that is deliberate: a BRD- id
   carries a printed QR label that is physically stuck to a physical board, and
   `mold.board` points at one. Merging two docs of the same size would orphan
   every label already on the rack. So this is a display-time grouping, and the
   individual boards, with their labels and locations, come back when a size row
   is opened. */
function boardSizeKey(b) {
  const l = toMm(b.len), w = toMm(b.wid), t = toMm(b.thk);
  if (![l, w, t].every(Number.isFinite)) return "?";
  const r = v => Math.round(v * 10) / 10;
  // Face dimensions are sorted, because tooling board has no grain and the
  // packer turns blanks freely — a 48x96 and a 96x48 are the same stock.
  return `${r(Math.max(l, w))}x${r(Math.min(l, w))}x${r(t)}|${Number(b.density) || 30}`;
}
function groupBoards(list) {
  const m = new Map();
  for (const b of (list || [])) {
    const key = boardSizeKey(b);
    if (!m.has(key)) {
      const l = toMm(b.len), w = toMm(b.wid);
      m.set(key, {
        key, id: "SZ:" + key, lenMm: Math.max(l, w), widMm: Math.min(l, w),
        thkMm: toMm(b.thk), density: Number(b.density) || 30, qty: 0, m2: 0, members: [],
      });
    }
    const g = m.get(key);
    g.qty += b.qty || 1;
    g.m2 += boardAreaM2(b);
    g.members.push(b);
  }
  return [...m.values()].sort((a, b) => (a.thkMm - b.thkMm)
    || (b.lenMm * b.widMm - a.lenMm * a.widMm) || a.key.localeCompare(b.key));
}
function boardGroupByKey(key) {
  return groupBoards(DB.stock || []).find(g => g.key === key) || null;
}
// mm is the geometry, inches is what the shop reads. Both, always.
function fmtMm(mm) {
  if (!Number.isFinite(mm)) return "—";
  return `${Math.round(mm / 25.4 * 100) / 100}″`;
}
function groupLabel(g) {
  return `${fmtMm(g.lenMm)} × ${fmtMm(g.widMm)} × ${fmtMm(g.thkMm)}`;
}

/* ---------- create / edit ---------- */
function boardModal(b) {
  const e = b || {};
  const dimRow = (key, label, d) => `
    <div class="field"><label>${label}</label>
      <input id="bd-${key}" value="${esc(d ? d.value : "")}" placeholder="0">
      <select id="bd-${key}-u">${UNITS.map(u => `<option ${(d ? d.unit : "in") === u ? "selected" : ""}>${u}</option>`).join("")}</select>
    </div>`;
  openModal(`
    <h2>${b ? "Edit board" : "Add board"}</h2>
    <div class="field"><label>Label (optional)</label><input id="bd-label" value="${esc(e.label || "")}" placeholder="e.g. rack A, top shelf"></div>
    ${dimRow("len", "Length", e.len)}
    ${dimRow("wid", "Width", e.wid)}
    ${dimRow("thk", "Thickness", e.thk)}
    <div class="field"><label>Density</label><select id="bd-density">${DENSITIES.map(d => `<option ${String(e.density || 30) === String(d) ? "selected" : ""}>${d}</option>`).join("")}</select></div>
    <div class="field"><label>Quantity</label><input id="bd-qty" value="${esc(e.qty || 1)}"></div>
    <div class="field"><label>Stored at</label><select id="bd-location">
      <option value="">—</option>
      ${(DB.items || []).filter(b2 => b2.cls === "BIN" && b2.stage !== "Retired").map(b2 =>
        `<option value="${esc(b2.id)}" ${e.location === b2.id ? "selected" : ""}>${esc(b2.name || b2.id)}</option>`).join("")}
    </select></div>
    <div class="field"><label>Where it came from</label><input id="bd-origin" value="${esc(e.origin || "")}" placeholder="work order or mold it came off, if it is a leftover"></div>
    <div class="field"><label>Unit cost ($, per sheet)</label><input id="bd-unitcost" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(e.unitCost ?? "")}" placeholder="leave blank if unknown"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitBoard(${b ? `'${esc(b.id)}'` : "null"})">${b ? "Save" : "Add"}</button></div>
  `);
}
function newBoard() { boardModal(null); }
function editBoard(id) { const b = boardById(id); if (b) boardModal(b); }

/* Read the modal into a validated board. Returns null (and toasts) on the first
   bad field, so the user fixes one thing at a time instead of hunting. */
function readBoardForm() {
  const val = k => (document.getElementById(k) || {}).value || "";
  const out = {};
  for (const [key, label] of [["len", "Length"], ["wid", "Width"], ["thk", "Thickness"]]) {
    const r = parseDim(val("bd-" + key), val(`bd-${key}-u`));
    if (r.err) { toast(`${label} ${r.err}.`, "error"); return null; }
    out[key] = r.dim;
  }
  const qty = Number(String(val("bd-qty")).trim() || "1");
  if (!Number.isFinite(qty) || qty < 1 || Math.floor(qty) !== qty) { toast("Quantity must be a whole number, 1 or more.", "error"); return null; }
  // Optional. Blank stays blank — a board with no cost is un-costed, not free.
  const rawCost = String(val("bd-unitcost")).trim();
  const unitCost = rawCost === "" ? "" : Math.round(Number(rawCost) * 100) / 100;
  if (rawCost !== "" && (!Number.isFinite(unitCost) || unitCost < 0)) { toast("Unit cost needs to be a plain number of dollars.", "error"); return null; }
  return {
    ...out, qty, unitCost,
    label: String(val("bd-label")).trim(),
    density: Number(val("bd-density")) || 30,
    origin: String(val("bd-origin")).trim(),
    location: String(val("bd-location")).trim(),
  };
}
async function submitBoard(id) {
  const f = readBoardForm();
  if (!f) return;
  let b;
  if (id) {
    b = boardById(id);
    if (!b) { toast("That board is gone — someone else deleted it.", "error"); closeModal(); render(); return; }
    Object.assign(b, f);
  } else {
    const newId = await allocId("stock");
    if (!newId) return;
    b = { id: newId, ...f, createdBy: myEmail(), ts: new Date().toISOString() };
    (DB.stock = DB.stock || []).push(b);
  }
  save("stock", b);
  closeModal(); render();
  toast(id ? "Board updated." : "Board added.");
}
function delBoard(id) {
  confirmModal("Remove this board from inventory?", () => {
    del("stock", id);
    DB.stock = (DB.stock || []).filter(b => b.id !== id);
    render();
  });
}

/* ==========================================================================
   Mold stack plans — upload an STL, slice it, prove the mold fits the blocks.
   ========================================================================== */

/* Refuse absurd meshes BEFORE handing them to a Worker. An out-of-memory kill
   inside a Worker is a silent death: the worker just stops and no error event
   ever arrives, so the user sits watching a progress bar forever. A guard plus
   an onerror handler is the difference between "too big, export coarser" and
   an app that hangs. */
const MAX_STL_BYTES = 64 * 1024 * 1024;
const SLICE_TIMEOUT_MS = 120000;
/* Firestore caps a document at 1 MiB. Contours are the only unbounded part of
   a plan, so they get thinned until the record fits — see fitPlanForStorage. */
const PLAN_BYTE_BUDGET = 900000;

/* Run the slicer. Uses a Worker in the browser so the tab stays alive; falls
   back to a direct call where Worker is absent (the node test harness), which
   is the same code either way because slicer.js is pure. */
/* Same job, no Worker: used by the node test harness, and it keeps the two
   paths honest because slicer.js is pure either way. */
function runSliceInline(msg) {
  let tris, displayTris;
  if (msg.box) {
    tris = boxTris(msg.box.len, msg.box.wid, msg.box.hgt);
    // Closed solid for the viewer; boxTris is 4 open walls (see the worker).
    displayTris = blankTris({ x0: 0, y0: 0, x1: msg.box.len, y1: msg.box.wid }, 0, msg.box.hgt);
  } else {
    const bodies = splitBodies(scaleTris(parseSTL(msg.buffer).tris, msg.unit));
    if (msg.cmd === "bodies") {
      return {
        type: "bodies", triangleCount: 0,
        bodies: bodies.map((b, i) => ({
          index: i, triangles: b.tris.length,
          w: b.bounds.x1 - b.bounds.x0, d: b.bounds.y1 - b.bounds.y0, h: b.bounds.z1 - b.bounds.z0,
        })),
      };
    }
    tris = (bodies[msg.bodyIndex || 0] || {}).tris;
    if (!tris) throw new Error("That body is not in this file.");
    displayTris = tris;
  }
  // Same injection as the Worker path, so the two cannot drift.
  const opts = { ...(msg.opts || {}) };
  if (msg.supply) opts.supply = msg.supply;
  if (msg.boards && msg.boards.length) {
    opts.score = layers => moldCost(layers, msg.boards, { density: msg.density }).cost;
  }
  const r = (msg.thicknesses && msg.thicknesses.length)
    ? sliceMold(tris, msg.thicknesses, opts)
    : planMold(tris, msg.available, opts);
  let meshStl = null;
  try { meshStl = meshStlForStorage(displayTris); } catch (e) { meshStl = null; }
  return {
    layers: r.layers, sections: (r.sections || []).map(s => ({ index: s.index, height: s.height, count: s.layers.length })),
    bounds: r.bounds, warnings: r.warnings, composition: r.composition || msg.thicknesses,
    considered: r.considered || 0, alternatives: r.alternatives || [], cost: r.cost || 0,
    usedRack: !!(msg.boards && msg.boards.length),
    triangleCount: tris.length, meshStl,
  };
}

function runSlice(msg, onProgress) {
  if (typeof Worker === "undefined") {
    return new Promise((resolve, reject) => {
      try { resolve(runSliceInline(msg)); } catch (e) { reject(e); }
    });
  }
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker("slicer.worker.js"); }
    catch (e) { reject(new Error("Couldn't start the slicer. If you opened this from a file:// path, serve it over http instead.")); return; }
    const timer = setTimeout(() => { w.terminate(); reject(new Error("Slicing took over two minutes and was stopped. Try exporting the STL at a coarser tolerance.")); }, SLICE_TIMEOUT_MS);
    const finish = (fn, arg) => { clearTimeout(timer); w.terminate(); fn(arg); };
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "progress") { if (onProgress) onProgress(m.value); return; }
      if (m.type === "bodies") return finish(resolve, m);
      // meshStl rides alongside `result` (it's transferred, not cloned) — fold
      // it in so both the Worker and inline paths hand back one shape.
      if (m.type === "done") return finish(resolve, { ...m.result, meshStl: m.meshStl || null });
      if (m.type === "error") {
        const err = new Error(m.message);
        err.region = m.region;
        return finish(reject, err);
      }
    };
    // Fires on an uncaught throw AND is our only signal if the worker dies.
    w.onerror = () => finish(reject, new Error("The slicer stopped unexpectedly. The mesh may be too large for this browser — try a coarser STL export."));
    w.postMessage(msg);
  });
}

/* Thin contours until the record fits Firestore, and say so if detail is lost.
   Blanks and layer geometry are never dropped — they are what the shop cuts —
   so this always converges instead of failing to save. */
function fitPlanForStorage(plan) {
  const size = p => JSON.stringify(p).length;
  const notes = [];
  if (size(plan) <= PLAN_BYTE_BUDGET) return { plan, notes };
  for (const eps of [0.5, 1, 2, 5]) {
    plan.layers.forEach(L => L.islands.forEach(is => { is.contour = simplify(is.contour, eps); }));
    if (size(plan) <= PLAN_BYTE_BUDGET) {
      notes.push(`Outlines were simplified to ${eps}mm so the plan fits storage. Blank sizes are unaffected.`);
      return { plan, notes };
    }
  }
  plan.layers.forEach(L => L.islands.forEach(is => { is.contour = []; }));
  notes.push("Outlines were too detailed to store, so the view shows blocks only. Blank sizes are unaffected.");
  return { plan, notes };
}

/* Distinct thicknesses actually on the rack, in mm — what the planner is
   allowed to choose from. No point offering a 3in stack we do not own. */
function stockThicknessesMm(density) {
  const d = density == null ? null : Number(density);
  const set = new Map();
  for (const b of (DB.stock || [])) {
    if (d != null && Number(b.density) !== d) continue;
    const mm = toMm(b.thk);
    if (Number.isFinite(mm) && mm > 0) set.set(Math.round(mm * 10) / 10, true);
  }
  return [...set.keys()].sort((a, b) => a - b);
}

/* Sample molds served alongside the app (03 App/app/samples/, built by
   tools/gen_sample_molds.mjs). Meeting the planner shouldn't require exporting
   something from Fusion first, and these are also the fastest way to reproduce a
   report — each one covers a different path. */
const SAMPLE_MOLDS = [
  { file: "nosecone-plug.stl", label: "Nosecone plug — 22 × 13 × 4.6in, one section" },
  { file: "undertray-diffuser.stl", label: "Undertray diffuser — 9.4in tall, splits into 2 sections" },
  { file: "clamshell-assembly.stl", label: "Clamshell assembly — 3 separate bodies in one file" },
];
/* Fetch a sample straight into MOLD_BUF, which is where a picked file would
   have landed — so submitMold() needs no special case for it. */
async function loadSampleMold(file) {
  if (!file) { MOLD_BUF = null; MOLD_BODIES = null; return; }
  const prog = document.getElementById("ml-progress");
  if (prog) prog.textContent = "Loading sample…";
  try {
    const buf = await (await fetch("samples/" + file)).arrayBuffer();
    MOLD_BUF = { buffer: buf, name: file, size: buf.byteLength, key: "sample:" + file };
    MOLD_BODIES = null;
    // Samples are written in millimetres; say so rather than leaving the 25.4x
    // trap open on a file the user didn't export and can't check.
    const u = document.getElementById("ml-unit");
    if (u) u.value = "mm";
    if (prog) prog.textContent = `${file} loaded (${Math.round(buf.byteLength / 1024)} KB) — hit Plan.`;
  } catch (e) {
    MOLD_BUF = null;
    if (prog) prog.textContent = "";
    toast("Couldn't load that sample.", "error");
  }
}

/* One way in. Simon: "there should only be an option to make a mold." This is
   the + Mold button, the Re-plan button, and nothing else. `existing` is set
   when re-planning, which prefills the name and density and, on submit, points
   that mold at the new plan instead of creating another one. */
function uploadMold(existing) {
  const avail = stockThicknessesMm();
  const e = existing || {};
  const dens = Number(e.density) || 30;
  openModal(`
    <h2>${existing ? "Re-plan " + esc(e.name || e.id) : "New mold"}</h2>
    <div class="field"><label>Name</label><input id="ml-name" value="${esc(e.name || "")}" placeholder="e.g. UT nose plug"></div>
    <div class="field"><label>Board density (lb/ft³)</label><select id="ml-density">${DENSITIES.map(d => `<option ${d === dens ? "selected" : ""}>${d}</option>`).join("")}</select>
      <span class="muted tny">Cut lists pack blanks onto boards of this density.</span></div>
    <div class="field"><label>Start from</label><select id="ml-src" onchange="moldSrcChanged()">
      <option value="box">dimensions (X &times; Y &times; Z)</option>
      <option value="stl">an STL file &mdash; beta</option>
      ${existing ? "" : `<option value="none">nothing yet &mdash; just record the mold</option>`}
    </select></div>
    <div id="ml-box">
      <div class="field"><label>Length (X)</label><input id="ml-bl" placeholder="0"><select id="ml-bl-u">${UNITS.map(u => `<option ${u === "in" ? "selected" : ""}>${u}</option>`).join("")}</select></div>
      <div class="field"><label>Width (Y)</label><input id="ml-bw" placeholder="0"><select id="ml-bw-u">${UNITS.map(u => `<option ${u === "in" ? "selected" : ""}>${u}</option>`).join("")}</select></div>
      <div class="field"><label>Height (Z)</label><input id="ml-bh" placeholder="0"><select id="ml-bh-u">${UNITS.map(u => `<option ${u === "in" ? "selected" : ""}>${u}</option>`).join("")}</select></div>
    </div>
    <div id="ml-stl" style="display:none">
      <div class="field"><label>Mold STL</label><input id="ml-file" type="file" accept=".stl,model/stl,application/sla"></div>
      <div class="field"><label>…or try a sample</label>
        <select id="ml-sample" onchange="loadSampleMold(this.value)">
          <option value="">— none —</option>
          ${SAMPLE_MOLDS.map(s => `<option value="${esc(s.file)}">${esc(s.label)}</option>`).join("")}
        </select>
        <span class="muted tny">Shipped with the app, so you can see the planner work without exporting anything first.</span></div>
      <div class="field"><label>STL units</label><select id="ml-unit">
        <option value="mm">millimetres</option><option value="in">inches</option>
      </select><span class="muted tny">An STL carries no units. Getting this wrong is a 25.4&times; mistake.</span></div>
      <div class="field"><label></label><span class="muted tny"><b>Beta.</b> Real exports still turn up surprises &mdash; assemblies holding many bodies, rough meshes, odd draft. Check the stack view before anyone cuts, and fall back to dimensions if it looks wrong.</span></div>
    </div>
    <div class="field"><label>Boards</label><select id="ml-mode" onchange="moldModeChanged()">
      <option value="auto">choose them for me, from stock</option>
      <option value="manual">I'll pick the thicknesses</option>
    </select></div>
    <div class="field" id="ml-avail"><label></label><span class="muted tny">${avail.length
      ? `Available on the rack: ${avail.map(t => (Math.round(t / 25.4 * 100) / 100) + "″").join(", ")}`
      : `<b>No board stock recorded yet</b> — add boards first, or the planner has nothing to choose from.`}</span></div>
    <div class="field" id="ml-manual" style="display:none"><label>Thicknesses, bottom to top</label>
      <input id="ml-thk" placeholder="e.g. 2, 2, 1">
      <select id="ml-thk-u">${UNITS.map(u => `<option ${u === "in" ? "selected" : ""}>${u}</option>`).join("")}</select>
    </div>
    <div id="ml-bodies"></div>
    <div id="ml-progress" class="muted tny"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitMold()">Plan</button></div>
  `);
}
function moldSrcChanged() {
  const v = (document.getElementById("ml-src") || {}).value;
  const stl = v === "stl", none = v === "none";
  const a = document.getElementById("ml-stl"), b = document.getElementById("ml-box");
  if (a) a.style.display = stl ? "" : "none";
  if (b) b.style.display = (stl || none) ? "none" : "";
  // Nothing to slice means nothing to choose boards for.
  for (const id of ["ml-mode", "ml-avail", "ml-manual"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = none ? "none" : (id === "ml-manual"
      ? ((document.getElementById("ml-mode") || {}).value === "manual" ? "" : "none") : "");
  }
}
function moldModeChanged() {
  const m = document.getElementById("ml-manual");
  if (m) m.style.display = document.getElementById("ml-mode").value === "manual" ? "" : "none";
}

let MOLD_BUF = null;     // last STL read, so picking a body doesn't re-read the file
/* null = this file has not been probed for separate bodies yet. Explicit state
   rather than "is the picker in the DOM?" — control flow that depends on an
   element existing is invisible to tests and breaks the moment markup moves. */
let MOLD_BODIES = null;

async function submitMold() {
  const val = k => (document.getElementById(k) || {}).value || "";
  const name = String(val("ml-name")).trim();
  /* "nothing yet" records the mold and stops. An SN5 mold being catalogued has
     no STL, and reports.js's importer needs a mold to exist without geometry —
     but as a branch here, not as a second button on the rail. */
  if (val("ml-src") === "none") {
    if (!name) { toast("Give the mold a name.", "error"); return; }
    const id = await allocId("molds");
    if (!id) return;
    const m = { id, name, stage: "Designed", density: String(Number(val("ml-density")) || 30), createdBy: myEmail() };
    (DB.molds = DB.molds || []).push(m);
    save("molds", m);
    closeModal();
    view = { ...view, tab: "molds", mode: "detail", id };
    render();
    toast(`${name} recorded at “Designed”. Plan its stack whenever the CAD is ready.`);
    return;
  }
  const isBox = val("ml-src") !== "stl";
  const auto = val("ml-mode") !== "manual";
  const density = Number(val("ml-density")) || 30;

  let thkMm = null;
  if (!auto) {
    const tUnit = val("ml-thk-u") === "mm" ? "mm" : "in";
    const list = String(val("ml-thk")).split(/[, ]+/).filter(Boolean).map(Number);
    if (!list.length || list.some(n => !Number.isFinite(n) || n <= 0)) {
      toast("List the board thicknesses bottom to top, e.g. 2, 2, 1.", "error"); return;
    }
    thkMm = list.map(v => toMm({ value: v, unit: tUnit }));
  }
  const available = stockThicknessesMm(density);
  /* The rack itself, not just the distinct thicknesses on it. Two things need
     it: compositionCandidates must not propose four 3in layers against one 3in
     sheet, and moldCost scores a candidate by actually packing it. Filtered to
     the chosen density because CS-004 says the grades are not interchangeable.
     Empty (nobody has entered stock yet) means neither is applied and planning
     falls back to the volume heuristic. */
  const rack = boardsForPacking().filter(b => b.density === density);
  const supply = {};
  for (const b of rack) {
    const k = Math.round(b.thk * 10) / 10;
    supply[k] = (supply[k] || 0) + (b.qty || 1);
  }
  if (auto && !available.length) { toast(`No ${density} lb board stock on the rack — the planner picks thicknesses from what you actually have. Add boards, or pick the other density.`, "error"); return; }

  const prog = document.getElementById("ml-progress");
  const setProg = m => { if (prog) prog.textContent = m; };

  let msg, sourceName, sourceBytes = 0;
  if (isBox) {
    const dim = (k) => parseDim(val("ml-b" + k), val(`ml-b${k}-u`));
    const L = dim("l"), W = dim("w"), H = dim("h");
    for (const [r, label] of [[L, "Length"], [W, "Width"], [H, "Height"]]) {
      if (r.err) { toast(`${label} ${r.err}.`, "error"); return; }
    }
    msg = { cmd: "slice", box: { len: toMm(L.dim), wid: toMm(W.dim), hgt: toMm(H.dim) }, thicknesses: thkMm, available, boards: rack, supply, density, opts: {} };
    sourceName = `block ${fmtDim(L.dim)} x ${fmtDim(W.dim)} x ${fmtDim(H.dim)}`;
  } else {
    const fileEl = document.getElementById("ml-file");
    const f = fileEl && fileEl.files && fileEl.files[0];
    if (!f && !MOLD_BUF) { toast("Pick an STL first.", "error"); return; }
    if (f) {
      // The <input type="file"> is never cleared, so f is still truthy on the
      // second "Plan" click after picking a body — without this key check,
      // MOLD_BODIES got reset to null on every submit, re-triggering the
      // "pick one" prompt forever instead of ever reaching bodyIndex below.
      const key = f.name + ":" + f.size;
      if (!MOLD_BUF || MOLD_BUF.key !== key) {
        if (f.size > MAX_STL_BYTES) { toast(`That STL is ${Math.round(f.size / 1e6)} MB. Export it at a coarser tolerance — the limit is ${MAX_STL_BYTES / 1e6} MB.`, "error"); return; }
        setProg("Reading the file…");
        MOLD_BUF = { buffer: await f.arrayBuffer(), name: f.name, size: f.size, key };
        MOLD_BODIES = null;   // genuinely a new file — re-probe
      }
    }
    const unit = val("ml-unit") === "in" ? "in" : "mm";
    /* A real export is often an assembly. Ask which body BEFORE planning, or
       we would slice the bounding box of everything and plan a void. */
    if (MOLD_BODIES === null) {
      setProg("Looking for separate bodies…");
      const info = await runSlice({ cmd: "bodies", buffer: MOLD_BUF.buffer, unit, cacheKey: MOLD_BUF.key });
      MOLD_BODIES = info.bodies || [];
      if (MOLD_BODIES.length > 1) {
        const host = document.getElementById("ml-bodies");
        if (host) host.innerHTML = `<div class="field"><label>Which body?</label><select id="ml-body">
          ${MOLD_BODIES.map(b => `<option value="${b.index}">#${b.index + 1} — ${(b.w / 25.4).toFixed(1)} &times; ${(b.d / 25.4).toFixed(1)} &times; ${(b.h / 25.4).toFixed(1)} in (${b.triangles.toLocaleString()} tris)</option>`).join("")}
        </select></div><div class="muted tny">This file holds ${MOLD_BODIES.length} separate bodies — an assembly export, not one mold. Plan them one at a time.</div>`;
        setProg("");
        toast(`${MOLD_BODIES.length} bodies in that file — pick one, then Plan again.`, "info");
        return;
      }
      const host = document.getElementById("ml-bodies");
      if (host) host.innerHTML = `<input type="hidden" id="ml-body" value="0">`;
    }
    msg = {
      cmd: "slice", buffer: MOLD_BUF.buffer, unit, cacheKey: MOLD_BUF.key,
      bodyIndex: Number((document.getElementById("ml-body") || {}).value || 0),
      thicknesses: thkMm, available, boards: rack, supply, density, opts: {},
    };
    sourceName = MOLD_BUF.name; sourceBytes = MOLD_BUF.size;
  }

  try {
    setProg("Planning…");
    const result = await runSlice(msg, v => setProg(`Planning… ${Math.round(v * 100)}%`));
    const id = await allocId("stackplans");
    if (!id) return;
    const raw = {
      id, name: name || sourceName, source: sourceName, sourceBytes,
      density,
      unit: isBox ? "mm" : (val("ml-unit") === "in" ? "in" : "mm"),
      thicknessesMm: result.composition || thkMm, bounds: result.bounds,
      layers: result.layers, sections: result.sections || [],
      warnings: result.warnings || [], considered: result.considered || 0,
      alternatives: result.alternatives || [], usedRack: !!result.usedRack, cost: result.cost || 0,
      triangleCount: result.triangleCount || 0,
      by: myEmail(), ts: new Date().toISOString(),
    };
    const { plan, notes } = fitPlanForStorage(raw);
    plan.notes = notes;
    /* Park the mold mesh in Storage so the 3D view survives a reload. That
       reload is the whole point: CS-003 §7.2 has someone who did NOT design the
       mold sign off on the fit, and they open the plan later, on their own
       laptop. Firestore can't hold it (1 MiB doc cap, and contours already
       compete for that), so it goes to Storage as a binary STL — which
       slicer.js's parseSTL reads straight back.

       Deliberately non-fatal. A plan whose mesh failed to upload still has its
       blanks, its cut list and its exploded SVG; the viewer just says it has no
       mesh. Losing the cut list because a photo-sized upload timed out on shop
       wifi would be a far worse trade. */
    if (result.meshStl) {
      try {
        setProg("Saving the 3D view…");
        const file = new Blob([result.meshStl], { type: "model/stl" });
        file.name = `${id}-mesh.stl`;
        const rec = await fb.upload(`stackplans/${id}/mesh.stl`, file);
        plan.meshPath = rec.path;
        plan.meshUrl = rec.url;
      } catch (e) {
        notes.push("The 3D view couldn't be saved, so this plan shows blocks only. The blanks and cut list are unaffected.");
      }
    }
    /* The plan is born attached to a mold record, at "Designed". Before this,
       a stack plan was an island a free-text name deep, and the mold record —
       the thing CS-003 §7.2's sign-off wants to hang off — only appeared after
       machining, back-filled. The mold is created first so the plan can carry
       the link before its one save. Non-fatal: if the id allocation fails
       (offline against an exhausted local counter), the plan still saves and
       the pane offers "Create mold from this plan" later. */
    let moldId = "";
    try {
      /* Re-planning an existing mold points it at the new plan and keeps the
         old one on planHistory; otherwise a fresh mold is born here, at
         "Designed", so the CS-003 §7.2 sign-off has a record to hang off. */
      const existing = MOLD_REPLAN ? moldRecById(MOLD_REPLAN) : null;
      if (existing) {
        moldId = existing.id;
        plan.moldId = moldId;
        setCurrentPlan(existing, plan.id);
      } else {
        moldId = (await allocId("molds")) || "";
        if (moldId) {
          const m = {
            id: moldId, name: plan.name, stage: "Designed",
            density: String(density),
            layers: (plan.thicknessesMm || []).length ? `${plan.thicknessesMm.length} layers` : "",
            createdBy: myEmail(),
          };
          (DB.molds = DB.molds || []).push(m);
          save("molds", m);
          plan.moldId = moldId;
          setCurrentPlan(m, plan.id);
        }
      }
    } catch (e) { moldId = ""; }
    MOLD_REPLAN = "";
    (DB.stackplans = DB.stackplans || []).push(plan);
    save("stackplans", plan);
    closeModal();
    view = moldId
      ? { ...view, tab: "molds", mode: "detail", id: moldId }
      : { ...view, tab: "molds", mode: "detail", id };
    render();
    toast(notes.length ? notes[0] : (moldId ? `Mold sliced — ${plan.name} created at “Designed”.` : "Mold sliced."));
  } catch (e) {
    setProg("");
    toast(e.message || "Slicing failed.", "error");
    if (e.region) toast(`Look near X ${e.region.x.toFixed(0)}, Y ${e.region.y.toFixed(0)} on layer ${e.region.layer}.`, "error");
  }
}

function planById(id) { return (DB.stackplans || []).find(p => p.id === id); }
function delStackPlan(id) {
  confirmModal("Delete this stack plan for everyone?", () => {
    const p = planById(id);
    del("stackplans", id);
    // Take the stored mesh with it, same as delBuy/delDocument do for their
    // uploads. Plans accumulate over a season; orphaned meshes would too.
    if (p && p.meshPath) fb.deleteFile(p.meshPath);
    DB.stackplans = (DB.stackplans || []).filter(x => x.id !== id);
    view = { ...view, mode: "list", id: null };
    render();
  });
}

/* ---------- the cut list ----------
   This is the batch view, and batching is the whole point: caking one mold by
   eye is already decent, the win is packing several molds' blanks into one pool
   of board and spending the offcut pile first. */
function blanksFromPlans(plans) {
  const out = [];
  plans.forEach(p => (p.layers || []).forEach((L, i) => (L.blanks || []).forEach((b, k) => out.push({
    id: `${p.name} L${i + 1}${L.blanks.length > 1 ? String.fromCharCode(97 + k) : ""}`,
    planId: p.id, w: b.x1 - b.x0, h: b.y1 - b.y0,
    thickness: L.thickness, density: p.density || 30,
  }))));
  return out;
}
function boardsForPacking() {
  return (DB.stock || []).map(b => ({
    id: b.id, label: b.label,
    len: toMm(b.len), wid: toMm(b.wid), thk: toMm(b.thk),
    density: Number(b.density) || 30, qty: b.qty || 1,
  })).filter(b => Number.isFinite(b.len) && Number.isFinite(b.wid) && Number.isFinite(b.thk));
}
function renderCutList() {
  const plans = (DB.stackplans || []).filter(p => !view.cutSel || view.cutSel === p.id);
  const blanks = blanksFromPlans(plans);
  const boards = boardsForPacking();
  const res = blanks.length && boards.length ? packAll(blanks, boards, {}) : null;
  const back = (typeof cutsUndoBar === "function" ? cutsUndoBar() : "") +
    `<div class="toolbar no-print"><button class="ib" onclick="view={...view,mode:'list'};render()">${icon("chevronLeft", 16)} All stock</button>
    <select onchange="view.cutSel=this.value;render()">
      <option value="">Every planned mold (${(DB.stackplans || []).length})</option>
      ${(DB.stackplans || []).map(p => `<option value="${esc(p.id)}" ${view.cutSel === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>
    <button onclick="printCutList()">${icon("print", 15)} Print</button>
    ${res && res.plans.length ? `<button class="primary" style="margin-left:auto" onclick="openCommitCutsModal()">Mark these boards cut…</button>` : ""}</div>`;
  if (!blanks.length) return back + `<div class="card">Nothing to cut yet — plan a mold first.</div>`;
  if (!boards.length) return back + `<div class="card">No board stock recorded, so there is nothing to cut from. Add boards first.</div>`;

  const util = utilisation(res.plans);
  return back + `
  <div class="card">
    <h2>Cut list</h2>
    <div class="muted">${blanks.length} blanks from ${plans.length} mold${plans.length > 1 ? "s" : ""} · ${res.boardsUsed} board${res.boardsUsed === 1 ? "" : "s"} opened · ${(util * 100).toFixed(0)}% of opened board used · kerf ${KERF_MM}mm</div>
    ${res.shortfall.length ? `<div class="warn">${icon("warning", 14)} <b>Short ${res.shortfall.length} blank${res.shortfall.length > 1 ? "s" : ""}.</b> Nothing on the rack fits these — order board before starting:
      <ul>${res.shortfall.map(s => `<li>${esc(s.id)} — ${mmIn(s.w)} &times; ${mmIn(s.h)} at ${mmIn(s.thickness)} thick</li>`).join("")}</ul></div>` : ""}
  </div>
  ${res.plans.map((pl, i) => `<div class="card">
    <h3>Board ${i + 1} — ${esc(pl.board.src.id)}${pl.board.src.label ? " · " + esc(pl.board.src.label) : ""}</h3>
    <div class="muted tny">${mmIn(pl.board.w)} &times; ${mmIn(pl.board.h)} &times; ${mmIn(pl.thickness)} · ${pl.density} lb/ft³</div>
    ${cutDiagram(pl)}
    <table class="list">
      <tr><th>#</th><th>Cut</th></tr>
      ${cutSequence(pl).map(c => `<tr><td><b>${c.n}</b></td><td>${esc(c.text)}</td></tr>`).join("")}
    </table>
    <div class="muted tny">Yields: ${pl.placed.map(p => esc(p.part.id) + (p.rotated ? " (turned 90°)" : "")).join(", ")}${pl.leftover.length ? ` · keeps ${pl.leftover.length} reusable offcut${pl.leftover.length > 1 ? "s" : ""}` : ""}</div>
  </div>`).join("")}`;
}
/* Top-down view of one board. Black and white only — this gets printed on the
   laser at RFS, same rule as the traveler. */
function cutDiagram(pl) {
  const W = 640, s = W / pl.board.w, H = Math.max(60, pl.board.h * s);
  return `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" width="100%" role="img" aria-label="Cutting layout for this board" style="max-height:340px">
    <rect x="0" y="0" width="${W}" height="${H.toFixed(0)}" fill="none" stroke="currentColor" stroke-width="1.5"/>
    ${pl.placed.map(p => `<rect x="${(p.x * s).toFixed(1)}" y="${((pl.board.h - p.y - p.h) * s).toFixed(1)}" width="${(p.w * s).toFixed(1)}" height="${(p.h * s).toFixed(1)}"
      fill="none" stroke="currentColor" stroke-width="1.6"/>
      <text x="${((p.x + p.w / 2) * s).toFixed(1)}" y="${((pl.board.h - p.y - p.h / 2) * s).toFixed(1)}" font-size="10" text-anchor="middle" fill="currentColor">${esc(p.part.id)}</text>`).join("")}
    ${pl.cuts.map((c, i) => c.axis === "x"
      ? `<line x1="${(c.at * s).toFixed(1)}" y1="${((pl.board.h - c.to) * s).toFixed(1)}" x2="${(c.at * s).toFixed(1)}" y2="${((pl.board.h - c.from) * s).toFixed(1)}" stroke="currentColor" stroke-width="0.8" stroke-dasharray="4 3"/>`
      : `<line x1="${(c.from * s).toFixed(1)}" y1="${((pl.board.h - c.at) * s).toFixed(1)}" x2="${(c.to * s).toFixed(1)}" y2="${((pl.board.h - c.at) * s).toFixed(1)}" stroke="currentColor" stroke-width="0.8" stroke-dasharray="4 3"/>`).join("")}
  </svg>`;
}
/* ---------- marking the cut done ----------
   The approved phase-2 piece: the list stops being advice and becomes a
   transaction. Cut boards leave the rack (qty down, row deleted at zero) and
   every leftover the packer kept (already tagged with its boardId and
   filtered to >= MIN_REMNANT_MM) goes back on it as a new, smaller board
   row — a remnant is not a separate kind of thing, origin carries the
   provenance.

   Two hard rules, both learned elsewhere in this file's history:
   - The proposal is SNAPSHOTTED by the button handler, never read from the
     render path: renderCutList() re-runs packAll on every render and a
     Firestore snapshot can re-render at any moment, so the thing confirmed
     must be frozen the moment the modal opens.
   - The commit re-checks the rack before writing and aborts whole if a
     board vanished or thinned under the snapshot — a partial write of a
     stale plan would silently eat somebody's stock. */
let CUT_PROPOSAL = null;
let CUTS_UNDO = null;

function openCommitCutsModal() {
  const plans = (DB.stackplans || []).filter(p => !view.cutSel || view.cutSel === p.id);
  const res = packAll(blanksFromPlans(plans), boardsForPacking(), {});
  if (!res.plans.length) { toast("Nothing to cut.", "info"); return; }
  CUT_PROPOSAL = res.plans.map(pl => ({
    boardId: pl.board.src.id, label: pl.board.src.label || "",
    w: pl.board.w, h: pl.board.h, thickness: pl.thickness, density: pl.density,
    yields: pl.placed.map(p => p.part.id),
    leftovers: pl.leftover.map(o => ({ w: o.w, h: o.h })),
  }));
  const nOff = CUT_PROPOSAL.reduce((s, p) => s + p.leftovers.length, 0);
  openModal(`
    <h2>Mark these boards cut?</h2>
    <p class="muted tny">${CUT_PROPOSAL.length} board${CUT_PROPOSAL.length === 1 ? " leaves" : "s leave"} the rack;
      ${nOff ? `${nOff} reusable offcut${nOff === 1 ? "" : "s"} go${nOff === 1 ? "es" : ""} back on it as new stock.` : "nothing reusable comes back."}
      Untick anything you did not actually cut.</p>
    ${CUT_PROPOSAL.map((p, i) => `<label class="cutrow"><input type="checkbox" id="cc-${i}" checked>
      <span><b>${esc(p.boardId)}</b>${p.label ? " · " + esc(p.label) : ""} — ${mmIn(p.w)} &times; ${mmIn(p.h)} &times; ${mmIn(p.thickness)}
        <span class="muted tny">yields ${p.yields.map(esc).join(", ")}${p.leftovers.length ? ` · keeps ${p.leftovers.length} offcut${p.leftovers.length === 1 ? "" : "s"}` : ""}</span></span>
    </label>`).join("")}
    <div class="foot">
      <button onclick="CUT_PROPOSAL=null;closeModal()">Cancel</button>
      <button class="primary" onclick="submitCommitCuts()">Mark cut</button>
    </div>
  `);
}

async function submitCommitCuts() {
  const prop = CUT_PROPOSAL || [];
  /* Checkboxes read BEFORE any await: an offline allocId opens its own modal
     over this one, and the form must already be read by then. */
  const checked = prop.filter((p, i) => { const el = document.getElementById("cc-" + i); return el ? !!el.checked : true; });
  if (!checked.length) { toast("Nothing ticked — nothing marked.", "info"); return; }
  const perBoard = new Map();
  checked.forEach(p => perBoard.set(p.boardId, (perBoard.get(p.boardId) || 0) + 1));
  for (const [id, k] of perBoard) {
    const b = boardById(id);
    if (!b || (b.qty || 1) < k) { toast("The rack changed under this plan — re-check the cut list.", "error"); return; }
  }
  const undo = { decremented: [], created: [], nBoards: 0, nOff: 0 };
  for (const [id, k] of perBoard) {
    const b = boardById(id);
    undo.nBoards += k;
    if ((b.qty || 1) - k >= 1) {
      b.qty = (b.qty || 1) - k;
      save("stock", b, "qty");
      undo.decremented.push({ id, by: k, deleted: null });
    } else {
      // Keep the full row so undo can put it back exactly as it was.
      undo.decremented.push({ id, by: k, deleted: { ...b } });
      del("stock", id);
      DB.stock = (DB.stock || []).filter(x => x.id !== id);
    }
  }
  for (const p of checked) {
    const parent = undo.decremented.find(d => d.id === p.boardId);
    const live = boardById(p.boardId);
    const loc = (parent && parent.deleted ? parent.deleted.location : live && live.location) || "";
    for (const o of p.leftovers) {
      const nid = await allocId("stock");
      if (!nid) continue;                        // offline and declined: skip this offcut, keep the rest honest
      const row = {
        id: nid, label: `offcut of ${p.boardId}`,
        // mm, as the packer measured them — never round-tripped through the
        // entry units (the header rule of this file).
        len: { value: Math.round(o.w), unit: "mm" }, wid: { value: Math.round(o.h), unit: "mm" },
        thk: { value: p.thickness, unit: "mm" }, qty: 1, density: p.density,
        origin: `cut ${today()} from ${p.boardId}`, location: loc,
        createdBy: myEmail(), ts: new Date().toISOString(),
      };
      (DB.stock = DB.stock || []).push(row);
      save("stock", row);
      undo.created.push(nid);
      undo.nOff++;
    }
  }
  CUTS_UNDO = undo; CUT_PROPOSAL = null;
  closeModal();
  toast(`${undo.nBoards} board${undo.nBoards === 1 ? "" : "s"} marked cut${undo.nOff ? ` — ${undo.nOff} offcut${undo.nOff === 1 ? "" : "s"} added` : ""}.`);
  view = { ...view, mode: "list" };
  render();
}

/* The first multi-record undo in the app: the memento holds every decrement
   (with the full row when the decrement deleted it) and every created offcut
   id, so one press restores the exact rack. Same single-slot semantics as
   PART_UNDO and SHOP_UNDO: the next commit replaces it. */
function undoCuts() {
  const u = CUTS_UNDO; CUTS_UNDO = null;
  if (!u) { render(); return; }
  u.created.forEach(id => { del("stock", id); DB.stock = (DB.stock || []).filter(x => x.id !== id); });
  u.decremented.forEach(d => {
    if (d.deleted) {
      const row = { ...d.deleted };
      (DB.stock = DB.stock || []).push(row);
      save("stock", row);
    } else {
      const b = boardById(d.id);
      if (b) { b.qty = (b.qty || 1) + d.by; save("stock", b, "qty"); }
    }
  });
  toast("Undone — boards back on the rack.");
  render();
}
function dismissCutsUndo() { CUTS_UNDO = null; render(); }
function cutsUndoBar() {
  const u = CUTS_UNDO;
  if (!u) return "";
  return `<div class="undobar no-print">
    <span class="ub-i">${icon("check", 15)}</span>
    <span class="ub-t"><b>${u.nBoards} board${u.nBoards === 1 ? "" : "s"} marked cut</b>${u.nOff ? ` · ${u.nOff} offcut${u.nOff === 1 ? "" : "s"} added` : ""} — saved for everyone.</span>
    <button class="sm" onclick="undoCuts()">Undo</button>
    <button class="sm ib" onclick="dismissCutsUndo()">${icon("x", 14)}</button>
  </div>`;
}

function printCutList() {
  const host = printRoot();
  if (!host) { toast("Nothing to print.", "error"); return; }
  host.innerHTML = `<div class="sheet"><h1>Cut list</h1>${renderCutList().replace(/<div class="toolbar[\s\S]*?<\/div>/, "")}</div>`;
  document.body.classList.add("sheet");
  window.print();
  setTimeout(() => { document.body.classList.remove("sheet"); host.innerHTML = ""; }, 100);
}

/* Write the planned blocks of one section out as a binary STL, in the mold's own
   CAD coordinates and in millimetres — so it lands on the model in CAD with
   nothing to align, and CAM can use it as the stock body directly.

   One file per SECTION, not per mold: a mold past the ShopSabre's 6in cut depth
   is already split by sectionize() into separate machine setups, and a single
   stock solid taller than the machine can cut is not something CAM can use. */
function exportSectionStl(planId, sectionIndex) {
  const p = planById(planId);
  if (!p) { toast("That plan is gone.", "error"); return; }
  const tris = sectionTris(p, sectionIndex);
  if (!tris.length) { toast("That section has no blocks in it.", "error"); return; }
  const many = sectionCount(p) > 1;
  const header = `FEB ${p.id}${many ? ` section ${sectionIndex + 1}` : ""} stock - millimetres`;
  const safe = String(p.name || p.id).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || p.id;
  downloadBlob(`${safe}-stock${many ? `-S${sectionIndex + 1}` : ""}.stl`,
    new Blob([writeBinarySTL(tris, header)], { type: "model/stl" }));
  toast(`${tris.length / 12} block${tris.length === 12 ? "" : "s"} exported in mm, at the mold's own origin.`);
}

/* Why these boards and not the other ones.

   The planner trades board against glue joints at a fixed rate — a joint is
   worth a quarter of a sheet — and that number is a judgement call, not
   physics. Printed here with the runners-up beside it, because an exchange rate
   nobody can see is one nobody can argue with, and one nobody can argue with
   never gets tuned. CS-003 §7.3 is a 4h clamp per glue-up, so the cost being
   priced is real hours.

   Note this is scored as if this were the only mold being cut. The cut list
   packs every planned mold's blanks together and is the authority on how much
   board actually gets opened; the two will differ. Subtracting other plans'
   commitments here would make replanning order-dependent and make this page
   change when somebody edits a different mold. */
function whyTheseBoards(p) {
  const alts = p.alternatives || [];
  const inch = c => c.map(t => (Math.round(t / 25.4 * 100) / 100) + "″").join(" + ");
  const joints = Math.max(0, (p.layers || []).length - 1);
  if (!p.usedRack) {
    return `<h3>Why these boards</h3>
      <p class="muted tny">Scored on board volume only — there was no board stock recorded when this was planned, so the planner could not check what the rack actually holds. Add boards and re-plan for a real answer.</p>`;
  }
  if (!alts.length) return "";
  return `<h3>Why these boards</h3>
    <p class="muted tny">${esc(inch(p.thicknessesMm || []))} — ${joints} glue joint${joints === 1 ? "" : "s"},
      ${joints * 4}h of clamp time under CS-003 §7.3. Scored against the boards on the rack, pricing one glue joint
      at a quarter of a 4×8 sheet. Runners-up:</p>
    <table class="list">
      <tr><th>Stack</th><th>Glue joints</th><th>Cost</th></tr>
      ${alts.map(a => `<tr>
        <td>${esc(inch(a.composition || []))}</td>
        <td>${esc(a.joints)}</td>
        <td class="tny">${a.cost > (p.cost || 0) ? "+" : ""}${(((a.cost - (p.cost || 0)) / (p.cost || 1)) * 100).toFixed(0)}%</td>
      </tr>`).join("")}
    </table>
    <p class="muted tny">Costed as if this were the only mold being cut. The cut list packs every planned mold together and is the authority on how much board actually gets opened.</p>`;
}

function renderStackPlan() {
  const p = planById(view.id);
  if (!p) { view.mode = "list"; view.id = null; return moldsOverview(); }
  const h = p.bounds ? (p.bounds.z1 - p.bounds.z0) : 0;
  const nSec = sectionCount(p);
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="view={...view,mode:'list',id:null};render()">${icon("chevronLeft", 16)} All molds</button>
    <button class="ib" onclick="openDrawings('${esc(p.id)}')">${icon("print", 15)} Drawings</button>
    ${nSec === 1
      ? `<button class="ib" onclick="exportSectionStl('${esc(p.id)}',0)">${icon("download", 15)} Export stock STL</button>`
      : `<span class="muted tny" style="align-self:center">Export stock STL:</span>` +
        Array.from({ length: nSec }, (_, i) =>
          `<button class="ib" onclick="exportSectionStl('${esc(p.id)}',${i})">${icon("download", 15)} Section ${i + 1}</button>`).join("")}
    ${isLead() ? `<button class="danger" onclick="delStackPlan('${esc(p.id)}')">Delete</button>` : ""}
  </div>
  <div class="card">
    <h2>${esc(p.name)}</h2>
    <div class="muted">${esc(p.id)} · ${p.layers.length} layers · mold ${mmIn(h)} tall · from ${esc(p.source)}${p.triangleCount ? ` (${p.triangleCount.toLocaleString()} triangles)` : ""} · ${esc(p.by || "")} ${fmtWhen(p.ts)}</div>
    ${(p.warnings || []).map(w => `<div class="warn">${icon("warning", 14)} ${esc(w)}</div>`).join("")}
    ${(p.notes || []).map(n => `<div class="muted tny">${esc(n)}</div>`).join("")}
    <h3>Mold in stock <span class="muted" style="text-transform:none">— drag to rotate, scroll or pinch to zoom</span></h3>
    ${meshViewHtml(p)}
    <h3>Stack</h3>
    ${stackSvg(p)}
    <p class="muted tny">Dashed outline is the mold at the top of each layer. Check it sits inside every block before initialling the CS-003 §7.2 review step.</p>
    <h3>Blanks to cut</h3>
    ${stackTable(p)}
    ${whyTheseBoards(p)}
  </div>`;
}
