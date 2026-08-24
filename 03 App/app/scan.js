"use strict";
/* scan.js — pointing the phone at a label, inside the app.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT
 * The primary way to scan a label is the phone's own camera app: it reads
 * /Q/<ID>, opens q.html, and that page works signed-out with no signal. This
 * file is the other half — scanning while you are already IN the app, so a
 * two-step action can be done with two scans and no typing:
 *
 *     scan the mold  ->  Move  ->  scan the shelf  ->  done
 *
 * That is PP-10's fix. CS-011 §7.3 says the location field "can't yet enforce
 * the storage map... type the real location string consistently until it can";
 * BIN records plus this make it a controlled value picked by pointing a camera
 * at a shelf, which is the version people will actually do with resin on their
 * hands.
 *
 * NO SCANNING LIBRARY IS VENDORED, deliberately. Chrome and Android expose
 * BarcodeDetector natively. Safari does not, and jsQR or zxing would be 200KB+
 * to close that gap for a browser whose own camera app already reads the code
 * perfectly well and lands on q.html. So: feature-detect, and where it is
 * missing fall back to typing the code, which is why the ID is printed on the
 * label in large type in the first place.
 */

function scanSupported() {
  return typeof window !== "undefined" && "BarcodeDetector" in window &&
    typeof navigator !== "undefined" && navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";
}

let SCAN = { stream: null, raf: 0, onCode: null, running: false,
             sticky: false, count: 0, lastId: "", lastAt: 0 };

/* opts: { title, hint, accept(id) -> bool, onCode(id), sticky } */
async function openScan(opts) {
  SCAN.onCode = opts.onCode;
  SCAN.accept = opts.accept || (() => true);
  /* sticky: keep the camera running and take code after code.
     Every original caller was one-shot — scan a thing, open it — so accepting
     a code tore the whole modal down. invMoveHere is not one-shot: its hint
     literally says "scan the label on each thing you are putting on this
     shelf", and it was paying a fresh getUserMedia and a camera warm-up per
     item, which is most of a second each, on a phone, with gloves on. */
  SCAN.sticky = !!opts.sticky;
  SCAN.count = 0;
  SCAN.lastId = "";
  SCAN.lastAt = 0;
  const can = scanSupported();

  openModal(`
    <h2>${esc(opts.title || "Scan a label")}</h2>
    <p class="muted">${esc(opts.hint || "Point the camera at the QR code on the label.")}</p>
    ${can ? `<div class="scanbox"><video id="scan-video" playsinline muted></video><div class="scanret"></div></div>
             <div id="scan-state" class="muted tny" style="margin-top:6px">Starting the camera…</div>` : ""}
    <div class="field"><label for="scan-manual">${can ? "…or type the code" : "Type the code from the label"}</label>
      <input id="scan-manual" ${can ? "" : "autofocus"} placeholder="e.g. MOLD-SN6-004"
             autocapitalize="characters" autocomplete="off" spellcheck="false"
             onkeydown="if(event.key==='Enter')scanManual()"></div>
    ${can ? "" : `<p class="gate"><span class="gi">!</span><span>This browser can't open the camera for scanning.
      Safari can't, Chrome and Android can. Your phone's own camera app reads the code either way — it opens the
      public page for that record.</span></p>`}
    <div class="foot">
      <button onclick="closeScan()">Cancel</button>
      <button class="primary" onclick="scanManual()">Use this code</button>
    </div>
  `);

  if (!can) return;
  try {
    // facingMode "environment" is the back camera. On a laptop there is only
    // one and the constraint is ignored rather than failing.
    SCAN.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }, audio: false,
    });
    const v = document.getElementById("scan-video");
    if (!v) { stopScan(); return; }          // modal closed while we were asking
    v.srcObject = SCAN.stream;
    await v.play();
    setScanState("Looking for a code…");
    SCAN.running = true;
    tickScan(new window.BarcodeDetector({ formats: ["qr_code"] }), v);
  } catch (e) {
    setScanState("Couldn't open the camera. Type the code instead.");
  }
}

function setScanState(s) { const el = document.getElementById("scan-state"); if (el) el.textContent = s; }

async function tickScan(det, video) {
  if (!SCAN.running) return;
  try {
    const hits = await det.detect(video);
    for (const h of hits) {
      const id = idFromScan(h.rawValue);
      /* The detector re-reads the same code on every frame while the label is
         still in view, which does not matter when accepting closes the camera
         and matters enormously when it does not: one label would fire sixty
         moves a second. Ignore a repeat of the code we just took until it has
         been out of frame for a moment. */
      if (id && SCAN.sticky && id === SCAN.lastId && Date.now() - SCAN.lastAt < 2500) continue;
      if (id && SCAN.accept(id)) { acceptScan(id); if (!SCAN.sticky) return; continue; }
      if (id) setScanState(`${id} isn't the right kind of code for this.`);
    }
  } catch { /* a dropped frame is not an error worth reporting */ }
  SCAN.raf = requestAnimationFrame(() => tickScan(det, video));
}

/* A scanned value is a whole URL (HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD-SN6-004)
   but a typed one is usually the bare code, and somebody will paste either.
   Accept both, plus the lowercase and the separator-stripped forms, because a
   code read off a scuffed label gets retyped by hand. */
function idFromScan(raw) {
  let v = String(raw || "").trim().toUpperCase();
  const m = v.match(/\/Q\/([0-9A-Z-]+)/);
  if (m) v = m[1];
  v = v.replace(/^HTTPS?:\/\/[^/]+\//, "").replace(/[^0-9A-Z-]/g, "");
  return /^[A-Z]+-SN\d-\d+/.test(v) ? v : "";
}

function acceptScan(id) {
  const fn = SCAN.onCode;
  if (SCAN.sticky) {
    SCAN.lastId = id;
    SCAN.lastAt = Date.now();
    SCAN.count++;
    if (fn) fn(id);
    // Said after the callback, so a caller that refuses the code can overwrite
    // this with its own reason rather than being contradicted by it.
    setScanState(`${id} — ${SCAN.count} scanned. Keep going, or Done.`);
    return;
  }
  closeScan();
  if (fn) fn(id);
}

function scanManual() {
  const el = document.getElementById("scan-manual");
  const id = idFromScan(el ? el.value : "");
  if (SCAN.sticky && el) el.value = "";   // ready for the next one
  if (!id) { toast("That doesn't look like a code from a label.", "error"); return; }
  if (!SCAN.accept(id)) { toast(`${id} isn't the right kind of code for this.`, "error"); return; }
  acceptScan(id);
}

function stopScan() {
  SCAN.running = false;
  if (SCAN.raf) cancelAnimationFrame(SCAN.raf);
  SCAN.raf = 0;
  // Releasing every track is what turns the phone's camera light off. Leaving
  // it on after the modal closes reads as the app spying on you.
  if (SCAN.stream) { SCAN.stream.getTracks().forEach(t => t.stop()); SCAN.stream = null; }
}
function closeScan() { stopScan(); closeModal(); }

/* ---------- what a scan is FOR ---------- */

/* Jump to whatever was scanned. The global entry point, from the topbar. */
function scanToOpen() {
  openScan({
    title: "Scan",
    hint: "Point the camera at any label to open that record.",
    onCode: id => {
      const tab = tabForId(id);
      const coll = tab ? (TABS.find(t => t.id === tab) || {}).coll : null;
      if (!tab || !coll) { toast(`Don't recognise ${id}.`, "error"); return; }
      if (!recById(coll, id)) { view = { ...view, tab, mode: "list", id: null, q: id }; render(); syncUrl();
        toast(`No record ${id} here — searching for it.`, "error"); return; }
      openRecord(tab, id);
    },
  });
}

/* Move something to a storage location by scanning the shelf.
 *
 * The whole point is that neither end is typed. Scan the mold, tap Move, scan
 * the shelf. A BIN record is a shelf with a label on it, so the location field
 * becomes a controlled value instead of the freeform string CS-011 §7.3
 * complains about. */
function quickMove(coll, id) {
  const o = recById(coll, id);
  if (!o) return;
  const bins = (DB.items || []).filter(b => b.cls === "BIN" && b.stage !== "Retired");

  openModal(`
    <h2>Move ${esc(o.name || id)}</h2>
    <p class="muted">Where is it now? Scanning the shelf's own label is faster than typing, and it is the
    thing that makes "where is the seat mold" a lookup instead of a Slack ask.</p>
    <div class="field"><label for="qm-bin">Location</label>
      <select id="qm-bin" autofocus>
        <option value="">—</option>
        ${bins.map(b => `<option value="${esc(b.id)}" ${o.location === b.id ? "selected" : ""}>${esc(b.name || b.id)}</option>`).join("")}
      </select></div>
    ${bins.length ? "" : `<p class="gate"><span class="gi">!</span><span>No storage locations exist yet.
      Add them on the Inventory tab with <b>+ Location</b>, print their labels, and stick one on each shelf.</span></p>`}
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button onclick="quickMoveScan('${esc(coll)}','${esc(id)}')">${icon("search", 15)} Scan the shelf</button>
      <button class="primary" onclick="quickMoveSave('${esc(coll)}','${esc(id)}')">Move it</button>
    </div>
  `);
}
function quickMoveScan(coll, id) {
  openScan({
    title: "Scan the shelf",
    hint: "Point the camera at the storage label where it is going.",
    accept: sid => String(sid).startsWith("BIN-"),
    onCode: sid => setLocation(coll, id, sid),
  });
}
function quickMoveSave(coll, id) {
  const sel = document.getElementById("qm-bin");
  setLocation(coll, id, sel ? sel.value : "");
  closeModal();
}
function setLocation(coll, id, binId) {
  const o = recById(coll, id);
  if (!o) return;
  const field = coll === "parts" ? "moldLocation" : "location";
  o[field] = binId;
  save(coll, o, field);
  const bin = recById("items", binId);
  toast(binId ? `Moved to ${bin ? (bin.name || binId) : binId}.` : "Location cleared.");
  render();
}

/* Advance one stage, with an undo. Going forward is the common case and should
   cost one tap; the app's Parts tab already works this way, and this keeps the
   two consistent rather than inventing a second idiom for the same action. */
let SHOP_UNDO = null;

function quickAdvance(coll, id) {
  const o = recById(coll, id);
  if (!o) return;
  const spec = Object.values(SHOP).find(s => s.coll === coll);
  if (!spec) return;
  const stages = shopClassOf(spec, o).stage || [];
  const i = stages.indexOf(o.stage);
  if (i < 0 || i >= stages.length - 1) { toast("Already at the last stage.", "info"); return; }
  const from = o.stage, to = stages[i + 1];
  o.stage = to;
  save(coll, o, "stage");
  /* One tap, three facts. openedOn and emptiedOn are date fields nobody was
     ever going to type by hand, and "when was this opened" is exactly what a
     shelf-life question needs. The stage transition already knows. */
  const prev = { openedOn: o.openedOn || "", emptiedOn: o.emptiedOn || "", qty: o.qty || "", count: o.count };
  if (coll === "lots") {
    if (to === "Open" && !o.openedOn) { o.openedOn = today(); save(coll, o, "openedOn"); }
    if (to === "Empty") {
      if (!o.emptiedOn) { o.emptiedOn = today(); save(coll, o, "emptiedOn"); }
      if (o.qty !== "Empty") { o.qty = "Empty"; save(coll, o, "qty"); }
      if (o.cls === "CON" && Number(o.count) > 0) { o.count = 0; save(coll, o, "count"); }
    }
  }
  /* Undo BAR, not just a toast, and the same one the Parts tab uses. A toast
     disappears on its own; "I fat-fingered that a minute ago" needs something
     that is still there a minute later. Deliberately the same idiom rather than
     a second one for the same action. */
  SHOP_UNDO = { coll, id, from, to, name: o.name || id, prev };
  toast(`${o.name || id} → ${to}`);
  render();
}
function undoShopStage() {
  const u = SHOP_UNDO; SHOP_UNDO = null;
  if (!u) { render(); return; }
  const o = recById(u.coll, u.id);
  if (!o) { toast("That record is gone — nothing to undo.", "error"); render(); return; }
  o.stage = u.from;
  save(u.coll, o, "stage");
  // Put back everything the advance stamped, not just the stage.
  if (u.prev) for (const k of ["openedOn", "emptiedOn", "qty", "count"]) {
    if (o[k] !== u.prev[k]) { o[k] = u.prev[k]; save(u.coll, o, k); }
  }
  toast(`Undone — ${u.name} back to ${u.from}`);
  render();
}
function dismissShopUndo() { SHOP_UNDO = null; render(); }
function shopUndoBar() {
  const u = SHOP_UNDO;
  if (!u) return "";
  /* Gluing a stack is the one moment offcuts exist and are known — the saw is
     still out and the remnant is in someone's hand. A dismissible offer on the
     undo bar, never a gate: a prompt that fires where it makes no sense is the
     one people learn to dismiss (same reasoning as lot capture). */
  const offcut = u.coll === "molds" && u.to === "Board glued"
    ? `<button class="sm" onclick="logOffcutFromMold('${esc(u.id)}')">Log offcuts</button>` : "";
  return `<div class="undobar no-print">
    <span class="ub-i">${icon("check", 15)}</span>
    <span class="ub-t"><b>${esc(u.name)}</b> → <b>${esc(u.to)}</b> (was ${esc(u.from)}) — saved for everyone.</span>
    ${offcut}
    <button class="sm" onclick="undoShopStage()">Undo</button>
    <button class="sm ib" onclick="dismissShopUndo()">${icon("x", 14)}</button>
  </div>`;
}
/* Pre-filled leftover-board entry: origin = the mold it came off. A leftover
   is not a separate kind of thing, just a smaller board, so the only thing
   worth prefilling is where it came from. boardModal has no preset parameter,
   so the field is set after it opens — same pattern quickMoveScan uses. */
function logOffcutFromMold(moldId) {
  if (typeof boardModal !== "function") return;
  boardModal(null);
  const origin = document.getElementById("bd-origin");
  if (origin) origin.value = moldId;
}
