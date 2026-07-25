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
    <button onclick="uploadMold()">${icon("parts", 15)} Slice a mold</button>
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
  ${D.length === 0 ? `<div class="card">No board stock recorded yet. <b>Add board</b> for each sheet and offcut on the rack at RFS — that list is what the stack planner cuts from.</div>` : `
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
function runSlice(buffer, unit, thicknesses, opts, onProgress) {
  if (typeof Worker === "undefined") {
    return new Promise((resolve, reject) => {
      try {
        const parsed = parseSTL(buffer);
        resolve(sliceMold(scaleTris(parsed.tris, unit), thicknesses, opts || {}));
      } catch (e) { reject(e); }
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
      if (m.type === "done") return finish(resolve, m.result);
      if (m.type === "error") {
        const err = new Error(m.message);
        err.region = m.region;
        return finish(reject, err);
      }
    };
    // Fires on an uncaught throw AND is our only signal if the worker dies.
    w.onerror = () => finish(reject, new Error("The slicer stopped unexpectedly. The mesh may be too large for this browser — try a coarser STL export."));
    w.postMessage({ cmd: "slice", buffer, unit, thicknesses, opts: opts || {} });
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

function uploadMold() {
  openModal(`
    <h2>Slice a mold</h2>
    <div class="field"><label>Name</label><input id="ml-name" placeholder="e.g. UT nose plug"></div>
    <div class="field"><label>Mold STL</label><input id="ml-file" type="file" accept=".stl,model/stl,application/sla"></div>
    <div class="field"><label>STL units</label><select id="ml-unit">
      <option value="mm">millimetres</option><option value="in">inches</option>
    </select><span class="muted tny">An STL carries no units. Getting this wrong is a 25.4&times; mistake.</span></div>
    <div class="field"><label>Board thicknesses, bottom to top</label>
      <input id="ml-thk" placeholder="e.g. 2, 2, 1">
      <select id="ml-thk-u">${UNITS.map(u => `<option ${u === "in" ? "selected" : ""}>${u}</option>`).join("")}</select>
    </div>
    <div id="ml-progress" class="muted tny"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitMold()">Slice</button></div>
  `);
}

async function submitMold() {
  const val = k => (document.getElementById(k) || {}).value || "";
  const name = String(val("ml-name")).trim();
  const fileEl = document.getElementById("ml-file");
  const f = fileEl && fileEl.files && fileEl.files[0];
  if (!f) { toast("Pick an STL first.", "error"); return; }
  if (f.size > MAX_STL_BYTES) { toast(`That STL is ${Math.round(f.size / 1e6)} MB. Export it at a coarser tolerance — the limit is ${MAX_STL_BYTES / 1e6} MB.`, "error"); return; }

  const unit = val("ml-unit") === "in" ? "in" : "mm";
  const tUnit = val("ml-thk-u") === "mm" ? "mm" : "in";
  const thicknesses = String(val("ml-thk")).split(/[, ]+/).filter(Boolean).map(Number);
  if (!thicknesses.length || thicknesses.some(n => !Number.isFinite(n) || n <= 0)) {
    toast("List the board thicknesses bottom to top, e.g. 2, 2, 1.", "error"); return;
  }
  const thkMm = thicknesses.map(v => toMm({ value: v, unit: tUnit }));

  const prog = document.getElementById("ml-progress");
  const setProg = m => { if (prog) prog.textContent = m; };
  setProg("Reading the file…");
  try {
    const buffer = await f.arrayBuffer();
    setProg("Slicing…");
    const result = await runSlice(buffer, unit, thkMm, {}, v => setProg(`Slicing… ${Math.round(v * 100)}%`));
    const id = await allocId("stackplans");
    if (!id) return;
    const raw = {
      id, name: name || f.name, source: f.name, sourceBytes: f.size,
      unit, thicknessesMm: thkMm, bounds: result.bounds,
      layers: result.layers, warnings: result.warnings || [],
      triangleCount: result.triangleCount || 0,
      by: myEmail(), ts: new Date().toISOString(),
    };
    const { plan, notes } = fitPlanForStorage(raw);
    plan.notes = notes;
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
    del("stackplans", id);
    DB.stackplans = (DB.stackplans || []).filter(p => p.id !== id);
    view = { ...view, mode: "list", id: null };
    render();
  });
}

function renderStackPlan() {
  const p = planById(view.id);
  if (!p) { view.mode = "list"; return renderStock(); }
  const h = p.bounds ? (p.bounds.z1 - p.bounds.z0) : 0;
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="view={...view,mode:'list',id:null};render()">${icon("chevronLeft", 16)} All stock</button>
    ${isLead() ? `<button class="danger" onclick="delStackPlan('${esc(p.id)}')">Delete</button>` : ""}
  </div>
  <div class="card">
    <h2>${esc(p.name)}</h2>
    <div class="muted">${esc(p.id)} · ${p.layers.length} layers · mold ${mmIn(h)} tall · from ${esc(p.source)}${p.triangleCount ? ` (${p.triangleCount.toLocaleString()} triangles)` : ""} · ${esc(p.by || "")} ${fmtWhen(p.ts)}</div>
    ${(p.warnings || []).map(w => `<div class="warn">${icon("warning", 14)} ${esc(w)}</div>`).join("")}
    ${(p.notes || []).map(n => `<div class="muted tny">${esc(n)}</div>`).join("")}
    <h3>Stack</h3>
    ${stackSvg(p)}
    <p class="muted tny">Dashed outline is the mold at the top of each layer. Check it sits inside every block before initialling the CS-003 §7.2 review step.</p>
    <h3>Blanks to cut</h3>
    ${stackTable(p)}
  </div>`;
}
