"use strict";
/* ehsimport.js — bulk-linking the shelf campus EH&S already tagged.
 *
 * Triumvirate walked RFS in early 2024 and put a UC EH&S barcode on every
 * chemical container, logged against sublocations like "Formula Electric at
 * Berkeley - Flammable Cabinet" in the RSS Chemicals system. Those containers
 * exist in RSS and not in our app, and enrolling fifty of them one at a time
 * through the receiving desk is a chore nobody will finish. RSS has no public
 * API, but its web app exports the inventory as an .xlsx — so this file turns
 * that export into lot records: pick the sublocations that are ours, pick the
 * shelf each maps to, and every not-yet-known barcode becomes a container
 * record already wearing its tag.
 *
 * THE FILE IS PARSED IN THE BROWSER, WITH NO LIBRARY. The export is a zip of
 * XML; DecompressionStream("deflate-raw") has been in every browser this app
 * supports since 2023, and the sheet uses inline strings, so ~120 lines of
 * zip walking beat vendoring a spreadsheet library the way the scanner
 * argument never applied here (this runs on a lead's laptop, once a term,
 * not on a phone at a shelf). A re-saved .csv is accepted too, as the
 * fallback for a future RSS export this parser cannot read.
 *
 * IMPORT NEVER DELETES AND NEVER EDITS. A barcode some record already wears
 * is reported and skipped — the tag is the identity, and RSS's copy of a
 * container we already track is not newer truth, it is the same jug. Rows
 * are created only. Lead-only, same as the mold import, because it mints
 * records in bulk.
 */

let EHS_IMP = null;   // { fileName, rows, subs, chosen, bins, err } — modal state

/* ---------- opening it ---------- */

function openEhsImport() {
  if (!isLead()) return;
  EHS_IMP = null;
  openModal(ehsImpHtml());
}

function ehsImpHtml() {
  if (!EHS_IMP) return `<h2>Import the EH&S inventory</h2>
    <p class="muted">Export the chemical inventory from RSS Chemicals (the web app, not the phone app)
      and drop the file here. Containers whose barcode the app already knows are skipped; the rest
      become material records wearing their EH&S tag. Nothing is edited or deleted.</p>
    <div class="field"><label for="ehs-file">The export (.xlsx, or a re-saved .csv)</label>
      <input type="file" id="ehs-file" accept=".xlsx,.csv" onchange="ehsImpFile(this)"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button></div>`;

  if (EHS_IMP.err) return `<h2>Import the EH&S inventory</h2>
    <p class="gate"><span class="gi">!</span><span>${esc(EHS_IMP.err)}</span></p>
    <div class="field"><label for="ehs-file">Try another file</label>
      <input type="file" id="ehs-file" accept=".xlsx,.csv" onchange="ehsImpFile(this)"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button></div>`;

  const subs = [...EHS_IMP.subs.values()];
  const bins = invActiveBins();
  const take = ehsImpTake();
  return `<h2>Import the EH&S inventory</h2>
  <p class="muted tny">${esc(EHS_IMP.fileName)} — ${EHS_IMP.rows.length} tagged containers in
    ${subs.length} sublocation${subs.length === 1 ? "" : "s"}. Tick what is ours, and say which shelf
    each maps to; containers the app already knows are skipped.</p>
  <div class="lblist">
    ${subs.map((s, i) => `<div class="ehsub">
      <label class="chk"><input type="checkbox" ${s.on ? "checked" : ""}
          onchange="ehsImpSub(${i}).on=this.checked;ehsImpRefresh()">
        <b>${esc(s.name)}</b>
        <span class="muted tny">${s.rows.length} container${s.rows.length === 1 ? "" : "s"}${s.linked ? `, ${s.linked} already in Inventory` : ""}</span>
      </label>
      ${s.on ? `<div class="f" style="margin:4px 0 8px 26px"><label>Their shelf is our</label>
        <select onchange="ehsImpSub(${i}).bin=this.value;ehsImpRefresh()">
          <option value="">— no location yet —</option>
          ${bins.map(b => `<option value="${esc(b.id)}" ${s.bin === b.id ? "selected" : ""}>${esc(b.name || b.id)}</option>`).join("")}
        </select></div>` : ""}
    </div>`).join("")}
  </div>
  ${EHS_IMP.dupes ? `<div class="warn">${icon("warning", 14)} ${EHS_IMP.dupes} row${EHS_IMP.dupes === 1 ? "" : "s"} repeated a barcode already in the file — first one wins.</div>` : ""}
  <p class="muted tny">Each container becomes one record: resin and hardeners from the name, everything
    else a consumable; hazard from the H-codes; received and expiry dates carried over. Fix a wrong
    guess on the record afterwards — it is a normal field.</p>
  <div class="foot">
    <button onclick="closeModal()">Cancel</button>
    <button class="primary" ${take.length ? "" : "disabled"} id="ehs-go" onclick="ehsImpSubmit()">Create ${take.length} record${take.length === 1 ? "" : "s"}</button>
  </div>`;
}

function ehsImpRefresh() {
  const m = document.querySelector("#modal .modal");
  if (m) m.innerHTML = ehsImpHtml();
}

// Inline handlers address a sublocation by its render index: names come out
// of RSS carrying whatever punctuation they carry, and quoting them into an
// onchange attribute is a bug farm the index avoids.
function ehsImpSub(i) { return [...EHS_IMP.subs.values()][i]; }

/* The rows the current ticks would actually create. */
function ehsImpTake() {
  if (!EHS_IMP) return [];
  const out = [];
  for (const s of EHS_IMP.subs.values()) {
    if (!s.on) continue;
    for (const r of s.rows) if (!r.linked) out.push({ ...r, bin: s.bin || "" });
  }
  return out;
}

async function ehsImpFile(input) {
  const f = input && input.files && input.files[0];
  if (!f) return;
  try {
    const rows = /\.csv$/i.test(f.name)
      ? ehsMapRows(ehsParseCsv(await f.text()))
      : ehsMapRows(await ehsParseXlsx(await f.arrayBuffer()));
    if (!rows.length) throw new Error("No rows with a Name, a Barcode and a Sublocation in that file. Is it the RSS chemical export?");
    EHS_IMP = ehsImpState(f.name, rows);
  } catch (e) {
    EHS_IMP = { err: "Couldn't read that: " + (e && e.message ? e.message : e), fileName: f.name };
  }
  ehsImpRefresh();
}

function ehsImpState(fileName, rows) {
  // First barcode wins; a repeat inside one export is RSS's data problem,
  // said out loud rather than turned into two records.
  const seen = new Set();
  let dupes = 0;
  const kept = rows.filter(r => {
    const k = ehsKey(r.barcode);
    if (seen.has(k)) { dupes++; return false; }
    seen.add(k);
    return true;
  });
  const subs = new Map();
  for (const r of kept) {
    const key = r.sub || "(no sublocation)";
    if (!subs.has(key)) subs.set(key, {
      key, name: key, rows: [], linked: 0,
      /* Ours by default when the sublocation says so; everything else in the
         export (STAR, CalSol, FSAE...) starts unticked. */
      on: /formula\s+electric/i.test(key),
      bin: ehsGuessBin(key),
    });
    const s = subs.get(key);
    r.linked = !!ehsResolve(r.barcode);
    if (r.linked) s.linked++;
    s.rows.push(r);
  }
  return { fileName, rows: kept, subs, dupes, err: "" };
}

/* Their flammable cabinet is almost certainly our Flammables cabinet. A guess,
   never a mode: it preselects a dropdown the lead is looking at. */
function ehsGuessBin(subName) {
  if (!/flammable/i.test(subName)) return "";
  const bins = invActiveBins();
  const hit = bins.find(b => b.site === "Flammables cabinet") || bins.find(b => /flam/i.test(b.name || ""));
  return hit ? hit.id : "";
}

/* ---------- what a row becomes ---------- */

/* rxGuessClass knows resin and hardener names; everything else a chemical
   export holds is a consumable. FAB cannot come out of a chemical inventory. */
function ehsGuessCls(name) {
  const g = typeof rxGuessClass === "function" ? rxGuessClass(name) : "CON";
  if (g === "RSN:resin") return { cls: "RSN", role: "resin" };
  if (g === "RSN:hardener") return { cls: "RSN", role: "hardener" };
  return { cls: "CON", role: "" };
}

/* H220–H226 are the GHS flammable gas/aerosol/liquid codes. Codes present
   with none of those is a real "not flammable"; NO codes stays blank, because
   unclassified must render as unknown — the same rule the hazard field's own
   schema comment states. */
function ehsHazard(codes) {
  const s = String(codes || "").trim();
  if (!s) return "";
  return /H22[0-6]\b/.test(s.toUpperCase()) ? "flammable" : "not flammable";
}

function ehsDateOnly(v) {
  const m = String(v || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

async function ehsImpSubmit() {
  const take = ehsImpTake();
  if (!take.length) return;
  const btn = document.getElementById("ehs-go");
  if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }

  const batch = "EHS-" + today() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const need = new Map();
  for (const r of take) {
    const c = ehsGuessCls(r.name).cls;
    need.set(c, (need.get(c) || 0) + 1);
  }
  const pool = new Map();
  for (const [c, n] of need) {
    const ids = await allocIds("lots", c, n);
    if (ids.length < n) {
      toast(`Only ${ids.length} of ${n} ${c} IDs came back. Nothing was written — try again when you are back online.`, "error");
      ehsImpRefresh();
      return;
    }
    pool.set(c, ids);
  }

  const made = [];
  for (const r of take) {
    const g = ehsGuessCls(r.name);
    const o = {
      id: pool.get(g.cls).shift(), cls: g.cls,
      name: String(r.name).trim(),
      stage: r.opened ? "Open" : "Sealed",
      ehsBarcode: ehsNorm(r.barcode),
      location: r.bin || "",
      createdBy: myEmail(), rxBatch: batch,
    };
    if (g.role) o.role = g.role;
    if (r.vendor) o.supplier = r.vendor;
    if (r.received) o.receivedOn = r.received;
    if (r.opened) o.openedOn = r.opened;
    if (r.expires) { o.expiresOn = r.expires; o.expirySource = "vendor label"; }
    const hz = ehsHazard(r.hazardCodes);
    if (hz) o.hazard = hz;
    if (g.cls === "CON") { o.count = 1; o.countedAt = today(); }
    made.push(o);
  }

  for (const o of made) (DB.lots = DB.lots || []).push(o);
  try {
    /* The same batched path rxSubmit earned: importMany skips pubSync, so the
       public mirror is published separately or a printed label would scan to
       nothing days later. */
    if (made.length > 8 && fb.importMany) {
      await fb.importMany("lots", made);
      if (fb.publishPub && typeof pubProjection === "function") {
        await fb.publishPub(made.map(o => pubProjection("lots", o)).filter(Boolean));
      }
    } else {
      for (const o of made) save("lots", o);
    }
  } catch (e) {
    toast("Some records may not have saved: " + (e && e.message ? e.message : e), "error");
  }

  EHS_IMP = null;
  closeModal();
  toast(`${made.length} container${made.length === 1 ? "" : "s"} imported from the EH&S inventory.`);
  render();
}

/* ---------- reading the export ---------- */

/* Column names as RSS prints them, lowercased. Matched by name, not position,
   so a column RSS adds or reorders costs nothing. */
const EHS_COLS = {
  name: "name", "substance name": "substance", sublocation: "sub", barcode: "barcode",
  "received date": "received", "opened date": "opened", "expiration date": "expires",
  vendor: "vendor", "hazard codes": "hazardCodes", "physical state": "state",
  cas: "cas", size: "size", unit: "unit", "container id": "containerId",
};

function ehsMapRows(table) {
  if (!table || !table.length) return [];
  const hdr = table[0].map(h => String(h || "").trim().toLowerCase());
  const idx = {};
  hdr.forEach((h, i) => { if (EHS_COLS[h] && !(EHS_COLS[h] in idx)) idx[EHS_COLS[h]] = i; });
  if (idx.name == null || idx.barcode == null || idx.sub == null) return [];
  const out = [];
  for (const row of table.slice(1)) {
    const get = (k) => idx[k] == null ? "" : String(row[idx[k]] || "").trim();
    const r = {
      name: get("name"), sub: get("sub"), barcode: ehsNorm(get("barcode")),
      vendor: get("vendor"), hazardCodes: get("hazardCodes"),
      received: ehsDateOnly(get("received")), opened: ehsDateOnly(get("opened")),
      expires: ehsDateOnly(get("expires")),
    };
    if (r.name && r.barcode && r.sub) out.push(r);
  }
  return out;
}

/* A small honest CSV parser: quotes, escaped quotes, commas and newlines in
   values. Positional, no library, and it only has to read what a spreadsheet
   app writes. */
function ehsParseCsv(text) {
  const rows = [[""]];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const row = rows[rows.length - 1];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { row[row.length - 1] += '"'; i++; }
        else inQ = false;
      } else row[row.length - 1] += ch;
      continue;
    }
    if (ch === '"') { inQ = true; continue; }
    if (ch === ",") { row.push(""); continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (i + 1 < text.length) rows.push([""]);
      continue;
    }
    row[row.length - 1] += ch;
  }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

/* ---------- the .xlsx itself ----------
 *
 * An .xlsx is a zip; the RSS export keeps every cell as an inline string in
 * xl/worksheets/sheet1.xml (no sharedStrings), but both cell forms are read
 * anyway. The zip walk reads the end-of-central-directory record, then each
 * central entry, then inflates the one member it wants through
 * DecompressionStream — the stdlib zip reader browsers never shipped.
 */

async function ehsParseXlsx(buf) {
  if (typeof DecompressionStream !== "function") throw new Error("This browser can't unpack .xlsx — re-save it as CSV and import that.");
  const sheet = await ehsZipRead(buf, /^xl\/worksheets\/sheet1\.xml$/);
  if (!sheet) throw new Error("No worksheet inside that file. Is it really an .xlsx?");
  let shared = [];
  const sst = await ehsZipRead(buf, /^xl\/sharedStrings\.xml$/);
  if (sst) {
    const sdoc = new DOMParser().parseFromString(sst, "application/xml");
    shared = [...sdoc.getElementsByTagName("si")].map(si => si.textContent || "");
  }
  const doc = new DOMParser().parseFromString(sheet, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The worksheet XML would not parse.");
  const out = [];
  for (const rowEl of doc.getElementsByTagName("row")) {
    const row = [];
    for (const c of rowEl.getElementsByTagName("c")) {
      const ref = c.getAttribute("r") || "";
      const colLetters = (ref.match(/^[A-Z]+/) || [""])[0];
      let col = 0;
      for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);
      const t = c.getAttribute("t");
      let v = "";
      if (t === "inlineStr") {
        v = [...c.getElementsByTagName("t")].map(x => x.textContent || "").join("");
      } else {
        const ve = c.getElementsByTagName("v")[0];
        v = ve ? ve.textContent || "" : "";
        if (t === "s") v = shared[Number(v)] ?? "";
      }
      row[(col || row.length + 1) - 1] = v;
    }
    // Sparse cells stay empty strings, not holes, so column indexes hold.
    for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = "";
    out.push(row);
  }
  return out;
}

/* Find one member by name and return its text. Only what this file needs from
   the zip format: EOCD, central directory, local header, stored or deflated. */
async function ehsZipRead(buf, nameRe) {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  // EOCD signature 0x06054b50, somewhere in the last 64KB + 22 bytes.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65558); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a zip file (no end-of-directory record).");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);          // central directory offset
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!nameRe.test(name)) continue;
    // The LOCAL header's own name/extra lengths decide where the data starts.
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = b.subarray(start, start + csize);
    if (method === 0) return new TextDecoder().decode(raw);
    if (method !== 8) throw new Error("Zip member uses a compression this reader does not (" + method + ").");
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([raw]).stream().pipeThrough(ds);
    return await new Response(stream).text();
  }
  return null;
}
