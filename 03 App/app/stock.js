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

/* ---------- list ---------- */
function renderStock() {
  if (view.mode === "plan") return renderStackPlan();
  if (view.mode === "cuts") return renderCutList();
  const D = DB.stock || [];
  const q = (view.q || "").toLowerCase();
  const rows = D
    .filter(b => !view.fSub || b.kind === view.fSub)
    .filter(b => !q || (b.label || "").toLowerCase().includes(q) || b.id.toLowerCase().includes(q))
    .sort((a, b) => (toMm(a.thk) - toMm(b.thk)) || a.id.localeCompare(b.id));

  const buckets = {};
  D.forEach(b => { buckets[thkKey(b)] = (buckets[thkKey(b)] || 0) + boardAreaM2(b); });

  const plans = (DB.stackplans || []).slice().sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));

  return `
  <div class="toolbar no-print">
    <button class="primary" onclick="newBoard()">+ Add board</button>
    <button onclick="uploadMold()">${icon("parts", 15)} Plan a mold</button>
    ${(DB.stackplans||[]).length ? `<button onclick="view={...view,mode:'cuts',cutSel:''};render()">${icon("print", 15)} Cut list</button>` : ""}
  </div>
  ${plans.length ? `<div class="card">
    <h3>Mold stack plans <span class="muted">(${plans.length})</span></h3>
    <table class="list">
      <tr><th>Mold</th><th>Layers</th><th>Blocks</th><th>By</th><th>When</th></tr>
      ${plans.map(p => `<tr onclick="view={...view,mode:'plan',id:'${esc(p.id)}'};render()">
        <td><b>${esc(p.name)}</b>${(p.warnings || []).length ? ` ${icon("warning", 13)}` : ""}</td>
        <td>${p.layers.length}</td>
        <td>${p.layers.reduce((n, L) => n + L.blanks.length, 0)}</td>
        <td class="tny">${esc(p.by || "")}</td>
        <td class="tny">${fmtWhen(p.ts)}</td>
      </tr>`).join("")}
    </table>
  </div>` : ""}
  <div class="filters no-print">
    <select onchange="view.fSub=this.value;render()">
      <option value="">All stock</option>
      <option value="sheet" ${view.fSub === "sheet" ? "selected" : ""}>Full sheets</option>
      <option value="remnant" ${view.fSub === "remnant" ? "selected" : ""}>Offcuts</option>
    </select>
    <input id="searchbox" placeholder="search label / id…" value="${esc(view.q || "")}" oninput="searchInput(this)">
    <span class="muted" style="align-self:center">${rows.length} of ${D.length} boards</span>
  </div>
  ${D.length === 0 ? `<div class="card">No board stock recorded yet. <b>Add board</b> for each sheet and offcut on the rack at RFS — that list is what the stack planner cuts from${isLead() ? ", or <b>Load SN5 archive</b> to start from the rack SN5 left behind" : ""}.</div>` : `
  <div class="card">
    <h3>On hand</h3>
    <div class="grid">
      ${Object.keys(buckets).sort().map(k => `<div class="f"><label>${esc(k)}</label><div class="ro">${buckets[k].toFixed(2)} m²</div></div>`).join("")}
    </div>
  </div>`}
  <table class="list">
    <tr><th>Board</th><th>Length</th><th>Width</th><th>Thickness</th><th>Density</th><th>Qty</th><th>Kind</th><th></th></tr>
    ${rows.map(b => `<tr onclick="editBoard('${esc(b.id)}')">
      <td><b>${esc(b.label || b.id)}</b>${b.origin ? ` <span class="muted tny">· from ${esc(b.origin)}</span>` : ""}</td>
      <td>${fmtDim(b.len)}</td>
      <td>${fmtDim(b.wid)}</td>
      <td>${fmtDim(b.thk)}</td>
      <td>${esc(b.density)} lb/ft³</td>
      <td>${esc(b.qty || 1)}</td>
      <td><span class="pill ${b.kind === "remnant" ? "retro" : ""}">${b.kind === "remnant" ? "offcut" : "sheet"}</span></td>
      <td>${isLead() ? `<button class="danger ib" title="Delete" onclick="event.stopPropagation();delBoard('${esc(b.id)}')">${icon("trash", 14)}</button>` : ""}</td>
    </tr>`).join("")}
  </table>`;
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
    <div class="field"><label>Kind</label><select id="bd-kind">
      <option value="sheet" ${e.kind !== "remnant" ? "selected" : ""}>Full sheet</option>
      <option value="remnant" ${e.kind === "remnant" ? "selected" : ""}>Offcut</option>
    </select></div>
    <div class="field"><label>Quantity</label><input id="bd-qty" value="${esc(e.qty || 1)}"></div>
    <div class="field"><label>From (offcuts only)</label><input id="bd-origin" value="${esc(e.origin || "")}" placeholder="work order or mold it came off"></div>
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
  const kind = val("bd-kind") === "remnant" ? "remnant" : "sheet";
  return {
    ...out, qty, kind,
    label: String(val("bd-label")).trim(),
    density: Number(val("bd-density")) || 30,
    origin: String(val("bd-origin")).trim(),
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
  const r = (msg.thicknesses && msg.thicknesses.length)
    ? sliceMold(tris, msg.thicknesses, msg.opts || {})
    : planMold(tris, msg.available, msg.opts || {});
  let meshStl = null;
  try { meshStl = meshStlForStorage(displayTris); } catch (e) { meshStl = null; }
  return {
    layers: r.layers, sections: (r.sections || []).map(s => ({ index: s.index, height: s.height, count: s.layers.length })),
    bounds: r.bounds, warnings: r.warnings, composition: r.composition || msg.thicknesses,
    considered: r.considered || 0, triangleCount: tris.length, meshStl,
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

function uploadMold() {
  const avail = stockThicknessesMm();
  openModal(`
    <h2>Plan a mold</h2>
    <div class="field"><label>Name</label><input id="ml-name" placeholder="e.g. UT nose plug"></div>
    <div class="field"><label>Start from</label><select id="ml-src" onchange="moldSrcChanged()">
      <option value="box">dimensions (X &times; Y &times; Z)</option>
      <option value="stl">an STL file &mdash; beta</option>
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
  const stl = document.getElementById("ml-src").value === "stl";
  const a = document.getElementById("ml-stl"), b = document.getElementById("ml-box");
  if (a) a.style.display = stl ? "" : "none";
  if (b) b.style.display = stl ? "none" : "";
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
  const isBox = val("ml-src") !== "stl";
  const auto = val("ml-mode") !== "manual";

  let thkMm = null;
  if (!auto) {
    const tUnit = val("ml-thk-u") === "mm" ? "mm" : "in";
    const list = String(val("ml-thk")).split(/[, ]+/).filter(Boolean).map(Number);
    if (!list.length || list.some(n => !Number.isFinite(n) || n <= 0)) {
      toast("List the board thicknesses bottom to top, e.g. 2, 2, 1.", "error"); return;
    }
    thkMm = list.map(v => toMm({ value: v, unit: tUnit }));
  }
  const available = stockThicknessesMm();
  if (auto && !available.length) { toast("Add some board stock first — the planner picks thicknesses from what you actually have.", "error"); return; }

  const prog = document.getElementById("ml-progress");
  const setProg = m => { if (prog) prog.textContent = m; };

  let msg, sourceName, sourceBytes = 0;
  if (isBox) {
    const dim = (k) => parseDim(val("ml-b" + k), val(`ml-b${k}-u`));
    const L = dim("l"), W = dim("w"), H = dim("h");
    for (const [r, label] of [[L, "Length"], [W, "Width"], [H, "Height"]]) {
      if (r.err) { toast(`${label} ${r.err}.`, "error"); return; }
    }
    msg = { cmd: "slice", box: { len: toMm(L.dim), wid: toMm(W.dim), hgt: toMm(H.dim) }, thicknesses: thkMm, available, opts: {} };
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
      thicknesses: thkMm, available, opts: {},
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
      unit: isBox ? "mm" : (val("ml-unit") === "in" ? "in" : "mm"),
      thicknessesMm: result.composition || thkMm, bounds: result.bounds,
      layers: result.layers, sections: result.sections || [],
      warnings: result.warnings || [], considered: result.considered || 0,
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
    (DB.stackplans = DB.stackplans || []).push(plan);
    save("stackplans", plan);
    closeModal();
    view = { ...view, tab: "stock", mode: "plan", id };
    render();
    toast(notes.length ? notes[0] : "Mold sliced.");
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
    id: b.id, label: b.label, kind: b.kind,
    len: toMm(b.len), wid: toMm(b.wid), thk: toMm(b.thk),
    density: Number(b.density) || 30, qty: b.qty || 1,
  })).filter(b => Number.isFinite(b.len) && Number.isFinite(b.wid) && Number.isFinite(b.thk));
}
function renderCutList() {
  const plans = (DB.stackplans || []).filter(p => !view.cutSel || view.cutSel === p.id);
  const blanks = blanksFromPlans(plans);
  const boards = boardsForPacking();
  const back = `<div class="toolbar no-print"><button class="ib" onclick="view={...view,mode:'list'};render()">${icon("chevronLeft", 16)} All stock</button>
    <select onchange="view.cutSel=this.value;render()">
      <option value="">Every planned mold (${(DB.stackplans || []).length})</option>
      ${(DB.stackplans || []).map(p => `<option value="${esc(p.id)}" ${view.cutSel === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>
    <button onclick="printCutList()">${icon("print", 15)} Print</button></div>`;
  if (!blanks.length) return back + `<div class="card">Nothing to cut yet — plan a mold first.</div>`;
  if (!boards.length) return back + `<div class="card">No board stock recorded, so there is nothing to cut from. Add boards first.</div>`;

  const res = packAll(blanks, boards, {});
  const util = utilisation(res.plans);
  return back + `
  <div class="card">
    <h2>Cut list</h2>
    <div class="muted">${blanks.length} blanks from ${plans.length} mold${plans.length > 1 ? "s" : ""} · ${res.boardsUsed} board${res.boardsUsed === 1 ? "" : "s"} opened · ${(util * 100).toFixed(0)}% of opened board used · kerf ${KERF_MM}mm</div>
    ${res.shortfall.length ? `<div class="warn">${icon("warning", 14)} <b>Short ${res.shortfall.length} blank${res.shortfall.length > 1 ? "s" : ""}.</b> Nothing on the rack fits these — order board before starting:
      <ul>${res.shortfall.map(s => `<li>${esc(s.id)} — ${mmIn(s.w)} &times; ${mmIn(s.h)} at ${mmIn(s.thickness)} thick</li>`).join("")}</ul></div>` : ""}
  </div>
  ${res.plans.map((pl, i) => `<div class="card">
    <h3>Board ${i + 1} — ${esc(pl.board.src.id)}${pl.board.src.label ? " · " + esc(pl.board.src.label) : ""} <span class="pill ${pl.board.kind === "remnant" ? "retro" : ""}">${pl.board.kind === "remnant" ? "offcut" : "sheet"}</span></h3>
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

function renderStackPlan() {
  const p = planById(view.id);
  if (!p) { view.mode = "list"; return renderStock(); }
  const h = p.bounds ? (p.bounds.z1 - p.bounds.z0) : 0;
  const nSec = sectionCount(p);
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="view={...view,mode:'list',id:null};render()">${icon("chevronLeft", 16)} All stock</button>
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
  </div>`;
}
