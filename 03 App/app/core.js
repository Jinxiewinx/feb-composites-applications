"use strict";
/* core.js — shell for the FEB composites app.
   Holds everything shared across tabs: the in-memory store synced from fb.js,
   the tab router, auth/roster screens, and small helpers every tab reuses.
   Each tab lives in its own classic script (workorders.js, parts.js, …) and
   defines one renderX() that returns HTML for #main. All scripts share global
   scope so inline on* handlers resolve — that's why this isn't a module. */

/* ---------- shared store ---------- */
// One array per Firestore collection, kept in sync by fb.js → onFbData().
// `users` is the live roster (email, name, role, avatar) for pickers/avatars.
let DB = { workOrders: [], parts: [], projects: [], schedule: [], budget: [], documents: [], stock: [], stackplans: [], notifications: [], users: [] };
let view = {
  tab: "dashboard", mode: "list", id: null, edit: false,
  q: "", fStatus: "", fSub: "", authMode: "in", sortKey: null, sortDir: null,
};
let rosterCache = null;
let pendingRender = false;

/* ---------- sync hooks (called by fb.js) ---------- */
window.onFbChange = function () { render(); };
window.onFbData = function (coll, arr) {
  DB[coll] = arr;
  // Don't yank the DOM out from under someone mid-edit: another member's (or
  // our own echoed) update re-renders once focus leaves the field.
  const ae = document.activeElement;
  if (ae && ["INPUT", "TEXTAREA", "SELECT"].includes(ae.tagName) && ae.closest("#main")) {
    pendingRender = true;
  } else {
    render();
  }
};
document.addEventListener("focusout", function () {
  setTimeout(function () {
    if (!pendingRender) return;
    const ae = document.activeElement;
    if (ae && ["INPUT", "TEXTAREA", "SELECT"].includes(ae.tagName) && ae.closest("#main")) return;
    pendingRender = false; render();
  }, 0);
});

/* ---------- generic data helpers ---------- */
// Pass the field you changed and only that field is written, so concurrent or
// stale-cache edits to other fields of the same record can't clobber it.
function save(coll, obj, field) {
  if (obj) fb.save(coll, obj, field).catch(e => toast("Save failed: " + e.message,"error"));
}
// Concurrency-safe edit of one array/object field: apply `mutator` to the
// fresh server value inside a transaction so simultaneous edits to *other*
// items in the same field don't clobber each other. `obj` already carries the
// optimistic local change, so if the transaction can't run (offline) we fall
// back to a plain field write. Use this for buy-offs and any in-place array
// item edit; use fb.appendTo for pure append (project updates).
function saveField(coll, obj, field, mutator) {
  if (!obj) return;
  fb.mutateField(coll, obj.id, field, mutator).catch(() => fb.save(coll, obj, field).catch(e => toast("Save failed: " + e.message,"error")));
}
function del(coll, id) { return fb.del(coll, id).catch(e => toast("Delete failed: " + e.message,"error")); }
// Every caller reads its whole form BEFORE awaiting this, because the offline
// fallback below opens a modal, and openModal() replaces whatever modal was on
// screen — including the create form the caller is still reading fields from.
async function allocId(coll) {
  try { return await fb.allocId(coll); }
  catch (e) {
    const ok = await confirmAsync("Couldn't reach the shared ID counter (offline?). Assign a local ID now — it could collide with one made on another laptop. Continue?",
      { ok: "Use a local ID", danger: false });
    if (!ok) return null;
    return localId(coll);
  }
}
// Offline fallback only — normal path is the shared counter in fb.allocId().
function localId(coll) {
  const prefix = { workOrders: "WO", parts: "P", projects: "PROJ", budget: "BUY" }[coll] || coll.toUpperCase();
  let max = 0;
  (DB[coll] || []).forEach(o => { const m = String(o.id).match(/-SN6-(\d+)$/); if (m) max = Math.max(max, +m[1]); });
  return `${prefix}-SN6-${String(max + 1).padStart(3, "0")}`;
}
function recById(coll, id) { return (DB[coll] || []).find(o => o.id === id); }

/* ---------- SVG icon system ----------
   Lucide-style stroke icons as inline SVG, so nothing depends on an icon font
   or emoji. icon(name, size) returns a self-contained <svg>. Unknown names fall
   back to a dot so a typo is visible, not blank. */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  workorders: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 12h6M9 16h6"/>',
  parts: '<path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  projects: '<rect x="3" y="4" width="5" height="16" rx="1.2"/><rect x="9.5" y="4" width="5" height="10" rx="1.2"/><rect x="16" y="4" width="5" height="13" rx="1.2"/>',
  timeline: '<path d="M3 5h11M3 12h18M3 19h8"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  budget: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  documents: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  reports: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="5" width="3" height="13" rx="1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  paperclip: '<path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.48-8.49"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  roster: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  archive: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="m21 15-4.5-4.5L5 21"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  // Added for Google Docs/Slides links. There was no chain, no arrow-out-of-box
  // and no slide glyph, which is why the rich-text editor's Link button still
  // falls back to a raw emoji.
  link: '<path d="M9.5 14.5a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1 1"/><path d="M14.5 9.5a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1-1"/>',
  externalLink: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
  presentation: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M12 16v4M8.5 21l3.5-2 3.5 2"/>',
  _fallback: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
};
function icon(name, size) {
  size = size || 18;
  const p = ICONS[name] || ICONS._fallback;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
// The FEB "speed slash" mark (two offset parallelograms), reproduced as SVG so
// it stays crisp anywhere. Blue upper, gold lower. Used in the sidebar brand,
// the drawer, and (rasterised) the PWA icons.
function febMark(size) {
  size = size || 26;
  return `<svg class="feb-mark" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path d="M40 18 H86 L60 52 H14 Z" fill="#2f6be4"/>
    <path d="M40 50 H86 L60 84 H14 Z" fill="#fdb515"/>
  </svg>`;
}

/* ---------- small helpers ---------- */
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function today() { return new Date().toISOString().slice(0, 10); }
function isLead() { return !!(window.fb && fb.roster && fb.roster.role === "lead"); }
function signerName() {
  if (!window.fb) return "?";
  return (fb.roster && fb.roster.name) || (fb.user && fb.user.name) || "?";
}
function myEmail() { return (window.fb && fb.user && fb.user.email) || ""; }

/* ---------- users & avatars ---------- */
function usersSorted() { return (DB.users || []).slice().sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)); }
function userByEmail(email) { return (DB.users || []).find(u => u.email === email); }
function userName(email) { const u = userByEmail(email); return (u && u.name) || email || "?"; }
function initials(name) { return String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?"; }
// Stable color from a string, so a person's initials-avatar is always the same hue.
function hueOf(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
// Avatar as an HTML string: photo if the roster entry has one, else initials on color.
function avatar(emailOrUser, size) {
  size = size || 26;
  const u = typeof emailOrUser === "string" ? (userByEmail(emailOrUser) || { email: emailOrUser, name: emailOrUser }) : emailOrUser;
  const title = esc(u.name || u.email || "");
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (u.avatar) return `<span class="avatar" style="${st}" title="${title}"><img src="${esc(u.avatar)}" alt="${title}"></span>`;
  return `<span class="avatar init" style="${st};background:hsl(${hueOf(u.email || u.name || "?")} 55% 45%)" title="${title}">${esc(initials(u.name || u.email))}</span>`;
}
// Let the signed-in user set their own photo (rules allow avatar/name self-edit).
function setMyAvatar() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const rec = await fb.upload(`avatars/${fb.user.uid}`, f, { maxDim: 256 });
      await fb.rosterUpdateSelf({ avatar: rec.url });
      render();
    } catch (e) { toast("Avatar upload failed: " + e.message,"error"); }
  };
  inp.click();
}
// Match a record's person field to the signed-in user. Engineer/assignee
// fields are free text, so the only unambiguous matches are exact email or
// exact full name; we also count a field that is *exactly* your first name
// (SN5 fields use bare first names like "Nico"/"Nick"). We deliberately do NOT
// match two full names that merely share a first name — that over-matched
// everyone named "Nick" onto each other's deadlines. Residual ambiguity: if
// two teammates share a first name and a field uses just that name, both match;
// type full names to disambiguate.
function isMine(nameOrList) {
  const me = signerName().toLowerCase().trim();
  const mail = myEmail().toLowerCase().trim();
  const myFirst = me.split(" ")[0];
  const vals = Array.isArray(nameOrList) ? nameOrList : [nameOrList];
  return vals.some(v => {
    v = String(v || "").toLowerCase().trim();
    if (!v) return false;
    return v === mail || v === me || v === myFirst;
  });
}
function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso + (iso.length <= 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return null;
  return Math.round((d - new Date(today() + "T00:00:00")) / 86400000);
}
function fmtWhen(iso) { return iso ? esc(String(iso).slice(0, 16).replace("T", " ")) : ""; }

/* ---------- sub-day time ----------
   daysUntil() rounds to whole days and midnight-anchors, so it answers 0 for a
   six-hour cure and 1 for a cure that finishes at 00:30 tonight. A cure hold
   needs the actual remaining time, which is what these two do. They are the
   app's only sub-day arithmetic; everything else here is a date-only due date.

   msLeft is signed: negative means the wait is over, which is what callers
   test. Returns null rather than 0 for a missing or unparseable start, so
   "never started" and "finished" can't be confused. */
function msLeft(startIso, hours) {
  if (!startIso || !(hours > 0)) return null;
  const t = new Date(startIso).getTime();
  if (isNaN(t)) return null;
  return t + hours * 3600000 - Date.now();
}
/* Reads at the bench, so: hours down to the last hour, then minutes, and no
   decimal anything. Matches the register the rest of the app uses for deltas
   ("2d late", "3 days out") without inventing a fourth phrasing. */
function fmtLeft(ms) {
  if (ms == null) return "";
  if (ms <= 0) return "ready";
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return mins + " min left";
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h >= 10 || m === 0) return Math.round(mins / 60) + " h left";
  return h + " h " + m + " min left";
}
// Same clock, written as a wall time someone can plan around: "Mon 3 Aug, 14:20".
function fmtReadyAt(startIso, hours) {
  if (!startIso || !(hours > 0)) return "";
  const d = new Date(new Date(startIso).getTime() + hours * 3600000);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
// Clickable chip that jumps to another tab's detail view (light cross-links).
function chip(coll, id, label) {
  if (!id) return "";
  const tab = { workOrders: "workorders", parts: "parts", projects: "projects", budget: "budget" }[coll] || coll;
  const known = recById(coll, id);
  return `<span class="chip" onclick="event.stopPropagation();openRecord('${tab}','${esc(id)}')">${esc(label || id)}${known ? "" : " ?"}</span>`;
}
function openRecord(tab, id) { view = { ...view, tab, mode: "detail", id, edit: false }; closeDrawer(); render(); }

/* ---------- shared layup-stack viz + editor (parts + work orders) ---------- */
function plyClass(m) {
  m = (m || "").toLowerCase();
  if (m.includes("spread")) return "spread";
  if (m.includes("mesh") || m.includes("copper")) return "mesh";
  if (m.includes("core") || m.includes("nomex") || m.includes("foam") || m.includes("rohacell") || m.includes("honeycomb")) return "core";
  if (m.includes("twill") || m.includes("carbon") || m.includes("cf") || /\b\d{2,3}\b/.test(m)) return "cf";
  return "other";
}
function stackViz(stack) {
  return `<div class="stackviz">${(stack || []).map((p, i) =>
    `<div class="plybar ${plyClass(p.material)}">P${i + 1} · ${esc(p.material)} · ${esc(p.orientation || "")} · ${esc(p.coverage || "")} ${p.notes ? "· " + esc(p.notes) : ""}</div>`).join("") || '<span class="muted">no plies recorded</span>'}
  </div>`;
}
// Editor buttons for a record's layupStack. `coll` = "parts" | "workOrders".
function stackEditor(coll, id) {
  return `<button onclick="addPly('${coll}','${id}')">+ ply</button> <button onclick="popPly('${coll}','${id}')">− last ply</button>`;
}
// A real form, not two chained prompt() dialogs. The old version also took
// `prompt(...) || ""`, so cancelling out of it still appended a blank ply — and
// then mirrored that blank ply onto the linked work order.
function addPly(coll, id) {
  const o = recById(coll, id); if (!o) return;
  openModal(`
    <h2>Add ply</h2>
    <div class="field"><label>Material <span class="req">*required</span></label>
      <input id="ply-material" autofocus placeholder="e.g. 195 twill, Cu mesh, Rohacell 31 3mm"></div>
    <div class="row2">
      <div class="field"><label>Orientation</label><input id="ply-orientation" placeholder="0/90, ±45, n/a"></div>
      <div class="field"><label>Coverage</label><input id="ply-coverage" value="full"></div>
    </div>
    <div class="field"><label>Notes</label><input id="ply-notes" placeholder="optional"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="submitPly('${esc(coll)}','${esc(id)}')">Add ply</button></div>`);
}
function submitPly(coll, id) {
  const o = recById(coll, id);
  if (!o) { toast("That record is gone — someone else deleted it.", "error"); closeModal(); render(); return; }
  const val = k => ((document.getElementById(k) || {}).value || "").trim();
  const material = val("ply-material");
  if (!material) { toast("A ply needs a material.", "error"); return; }
  const ply = { material, orientation: val("ply-orientation"), coverage: val("ply-coverage") || "full", notes: val("ply-notes") };
  o.layupStack = (o.layupStack || []).concat([ply]); // optimistic
  closeModal();
  stackEdit(coll, o, s => { s = s || []; s.push(ply); return s; });
}
function popPly(coll, id) {
  const o = recById(coll, id); if (!o || !(o.layupStack || []).length) return;
  o.layupStack = o.layupStack.slice(0, -1); // optimistic
  stackEdit(coll, o, s => { if (s && s.length) s.pop(); return s; });
}
// Apply a stack edit transaction-safely (mutator re-applies the delta on fresh
// server data, so two people adding plies at once don't clobber), and mirror
// the SAME delta to the linked counterpart so a part and its WO share a stack.
function stackEdit(coll, o, mutator) {
  saveField(coll, o, "layupStack", mutator);
  const other = linkedCounterpart(coll, o);
  if (other) {
    const otherColl = coll === "parts" ? "workOrders" : "parts";
    other.layupStack = JSON.parse(JSON.stringify(o.layupStack)); // optimistic local mirror
    saveField(otherColl, other, "layupStack", mutator);
  }
  render();
}
// The linked counterpart — but ONLY when the link is unambiguous, so a stack
// edit can never overwrite the wrong record:
//   - an explicit id link is honored only if the counterpart doesn't point elsewhere;
//   - a name match is honored only if EXACTLY ONE record has that name
//     (duplicate part names — a real FEB pattern — resolve to no mirror).
function linkedCounterpart(coll, o) {
  const otherColl = coll === "parts" ? "workOrders" : "parts";
  const idField = coll === "parts" ? "workOrderId" : "partId";
  const backField = coll === "parts" ? "partId" : "workOrderId";
  if (o[idField]) {
    const c = recById(otherColl, o[idField]);
    return (c && (!c[backField] || c[backField] === o.id)) ? c : null;
  }
  if (!o.partName) return null;
  const matches = DB[otherColl].filter(c => (c.partName || "").toUpperCase() === o.partName.toUpperCase());
  return matches.length === 1 ? matches[0] : null;
}

// Preserve the search caret across the full re-render each keystroke triggers.
function searchInput(inp) {
  view.q = inp.value; render();
  const s = document.getElementById("searchbox");
  if (s) { s.focus(); const n = s.value.length; s.setSelectionRange(n, n); }
}

/* Trigger a download of an in-memory blob. One place, because three callers
   (backup JSON, report CSVs, stock STLs) were otherwise each going to build
   their own anchor-and-revoke dance. */
function downloadBlob(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- backup / restore (lead-only import) ---------- */
function exportAll() {
  const blob = new Blob([JSON.stringify(DB, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "feb-composites-" + today() + ".json";
  a.click(); URL.revokeObjectURL(a.href);
}
function importJSON(input) {
  const file = input.files[0]; if (!file) return;
  file.text().then(async t => {
    try {
      const data = JSON.parse(t);
      // Accept either a full backup {coll:[…]} or a flat array into the active tab.
      const byColl = Array.isArray(data) ? { [activeColl()]: data } : data;
      let total = 0;
      for (const coll of Object.keys(byColl)) {
        if (!DB[coll] || !Array.isArray(byColl[coll])) continue;
        total += byColl[coll].length;
      }
      input.value = "";
      confirmModal("Import " + total + " records into the team database (overwrites matching ids for everyone)?", async () => {
        try {
          for (const coll of Object.keys(byColl)) {
            if (DB[coll] && Array.isArray(byColl[coll]) && byColl[coll].length) await fb.importMany(coll, byColl[coll]);
          }
          toast("Imported " + total + " records.");
        } catch (e) { toast("Import failed: " + e.message, "error"); }
      }, { ok: "Import", danger: false });
    } catch (e) { toast("Import failed: " + e.message, "error"); input.value = ""; }
  });
}

// Lead-only: seed all SN5 retro archives (work orders, parts, timeline, and the
// board rack SN5 left behind — the stack planner can't pick thicknesses from an
// empty rack, so a fresh project has nothing to plan against until this runs).
async function loadArchive() {
  const sources = [
    ["workOrders", "sn5-work-orders.json"],
    ["parts", "sn5-parts.json"],
    ["schedule", "sn5-schedule.json"],
    ["stock", "sn5-stock.json"],
  ];
  let report = [];
  for (const [coll, fname] of sources) {
    let seed;
    try { seed = await (await fetch(fname)).json(); }
    catch (e) { report.push(fname + ": not found"); continue; }
    if (!Array.isArray(seed)) { report.push(fname + ": not an array"); continue; }
    const missing = seed.filter(o => !recById(coll, o.id));
    if (missing.length) {
      try { await fb.importMany(coll, missing); report.push(coll + ": +" + missing.length); }
      catch (e) { report.push(coll + ": FAILED " + e.message); }
    } else { report.push(coll + ": already loaded"); }
  }
  toast("SN5 archive — " + report.join(" · "), "info");
}

/* ---------- auth screens ---------- */
async function doSignIn() {
  const email = document.getElementById("li-email").value, pass = document.getElementById("li-pass").value;
  try { await fb.signIn(email, pass); } catch (e) { toast("Sign-in failed: " + e.message,"error"); }
}
async function doSignUp() {
  const name = document.getElementById("li-name").value.trim();
  const email = document.getElementById("li-email").value, pass = document.getElementById("li-pass").value;
  if (!name) { toast("Enter your name — it goes on your buy-offs and assignments.","error"); return; }
  try { await fb.signUp(name, email, pass); } catch (e) { toast("Sign-up failed: " + e.message,"error"); }
}
async function doReset() {
  const email = document.getElementById("li-email").value.trim();
  if (!email) { toast("Type your email first, then hit Forgot password.","error"); return; }
  try { await fb.resetPassword(email); toast("Reset email sent to " + email + "."); }
  catch (e) { toast("Reset failed: " + e.message,"error"); }
}
async function recheckRoster() {
  await fb.refreshRoster();
  if (fb.state === "pending") toast("Still not on the roster — ping the composites lead.","info");
}
function renderLogin() {
  const up = view.authMode === "up";
  return `<div class="card login">
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:6px">${febMark(34)}<h2 style="margin:0">FEB <span style="color:var(--gold)">Composites</span></h2></div>
    <p class="muted">Team database. ${up ? "Create your account with your Berkeley email. The lead has to add you to the roster before you can see anything." : "Sign in with your team account."}</p>
    ${up ? `<div class="f"><label>Name (goes on your buy-offs)</label><input id="li-name" autocomplete="name"></div>` : ""}
    <div class="f"><label>Email</label><input id="li-email" type="email" autocomplete="username"></div>
    <div class="f"><label>Password</label><input id="li-pass" type="password" autocomplete="${up ? "new-password" : "current-password"}" onkeydown="if(event.key==='Enter')${up ? "doSignUp()" : "doSignIn()"}"></div>
    <div class="row">
      <button class="primary" onclick="${up ? "doSignUp()" : "doSignIn()"}">${up ? "Create account" : "Sign in"}</button>
      <button onclick="view.authMode='${up ? "in" : "up"}';render()">${up ? "Have an account? Sign in" : "New here? Create account"}</button>
      ${up ? "" : `<button onclick="doReset()">Forgot password</button>`}
    </div>
  </div>`;
}
function renderPending() {
  return `<div class="card login">
    <h2>Almost in</h2>
    ${fb.rosterCheckFailed ? `<p><b>Couldn't reach the database</b> — this looks like a network problem, not a roster problem. Get on better wifi and hit Check again.</p>` : ""}
    <p>Signed in as <b>${esc(fb.user.email)}</b>, but you're not on the roster yet, so the database won't talk to you. Ask the composites lead to add <b>${esc(fb.user.email)}</b> (Roster button in their header).</p>
    <div class="row">
      <button class="primary" onclick="recheckRoster()">Check again</button>
      <button onclick="fb.signOut()">Sign out</button>
    </div>
  </div>`;
}

/* ---------- roster (lead only; rules enforce it server-side) ---------- */
async function openRoster() {
  try { rosterCache = await fb.rosterAll(); }
  catch (e) { toast("Roster load failed: " + e.message,"error"); return; }
  view = { ...view, mode: "roster" }; render();
}
async function rosterAdd() {
  const email = document.getElementById("r-email").value.trim().toLowerCase();
  const name = document.getElementById("r-name").value.trim();
  const role = document.getElementById("r-role").value;
  if (!email || !email.includes("@") || !name) { toast("Need an email and a name.","error"); return; }
  try { await fb.rosterSet(email, name, role); rosterCache = await fb.rosterAll(); render(); }
  catch (e) { toast("Add failed: " + e.message,"error"); }
}
function rosterDel(email) {
  const self = fb.user && email === fb.user.email;
  confirmModal(self
    ? "That's YOU. Removing yourself locks you (and possibly everyone) out of roster admin. Really remove?"
    : "Remove " + email + " from the roster? They keep their account but lose all access.", async () => {
    try { await fb.rosterDelete(email); rosterCache = await fb.rosterAll(); render(); }
    catch (e) { toast("Remove failed: " + e.message, "error"); }
  });
}
function renderRoster() {
  const rows = rosterCache || [];
  return `
  <div class="toolbar no-print"><button class="ib" onclick="view={...view,mode:'list'};render()">${icon("chevronLeft",16)} Back</button></div>
  <div class="card">
    <h2>Roster</h2>
    <p class="muted">Who can use this database. Anyone can create an account, but nothing works until their email is on this list. Remove people when they leave — accounts stick around, access shouldn't.</p>
    <table class="sub"><thead><tr><th>Email</th><th>Name</th><th>Role</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.email)}</td><td>${esc(r.name)}</td><td>${esc(r.role)}</td>
        <td><button class="danger" onclick="rosterDel('${esc(r.email)}')">remove</button></td></tr>`).join("")}
    </tbody></table>
    <h3>Add member</h3>
    <div class="grid" style="max-width:640px">
      <div class="f"><label>Email</label><input id="r-email" type="email"></div>
      <div class="f"><label>Name</label><input id="r-name"></div>
      <div class="f"><label>Role</label><select id="r-role"><option value="member">member</option><option value="lead">lead</option></select></div>
    </div>
    <p><button class="primary" onclick="rosterAdd()">Add to roster</button></p>
  </div>`;
}

/* ---------- modal system ---------- */
function openModal(html) {
  const m = document.getElementById("modal");
  m.innerHTML = `<div class="backdrop" onclick="if(event.target===this)closeModal()"><div class="modal" role="dialog">${html}</div></div>`;
  m.classList.add("open");
  document.addEventListener("keydown", escClose);
  // Prefer an explicit [autofocus] over "first field in the DOM". The new-ticket
  // form leads with the Kind <select>, so the plain first-field rule parked the
  // caret there and you had to click into Title before you could type.
  const first = m.querySelector("[autofocus]") || m.querySelector("input,select,textarea,[contenteditable]");
  if (first && first.focus) first.focus();
}
function closeModal() {
  const m = document.getElementById("modal");
  m.innerHTML = ""; m.classList.remove("open");
  document.removeEventListener("keydown", escClose);
  // Escape, the backdrop and Cancel all land here, so this is the one place that
  // can tell confirmAsync() "the user walked away" — without it the promise
  // would hang and its caller would never continue.
  const d = window.__confirmDismissCb; window.__confirmDismissCb = null;
  if (d) d();
}
function escClose(e) { if (e.key === "Escape") closeModal(); }

/* ---------- toasts + styled confirm ---------- */
function toast(msg, type) {
  let host = document.getElementById("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast " + (type === "error" ? "err" : type === "info" ? "info" : "ok");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.classList.add("hide"); setTimeout(() => el.remove(), 300); }, type === "error" ? 4200 : 2600);
}
// Styled replacement for window.confirm — calls onConfirm() if the user
// proceeds, opts.onCancel if they dismiss it any way at all (Cancel, Escape,
// backdrop click). The Confirm button clears BOTH callbacks before closing, so
// closeModal()'s dismiss path can't fire on the way to a confirmation.
function confirmModal(msg, onConfirm, opts) {
  opts = opts || {};
  window.__confirmCb = onConfirm;
  window.__confirmDismissCb = opts.onCancel || null;
  openModal(`
    <h2>${esc(opts.title || "Please confirm")}</h2>
    <p style="margin:0 0 4px">${esc(msg)}</p>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="${opts.danger === false ? "primary" : "danger"}" onclick="var cb=window.__confirmCb;window.__confirmCb=null;window.__confirmDismissCb=null;closeModal();if(cb)cb()">${esc(opts.ok || "Confirm")}</button>
    </div>`);
}
// Awaitable confirmModal, for the two places that still used the native blocking
// confirm() — which on an iPad at the bench is a jarring system sheet, and looks
// nothing like the rest of the app.
function confirmAsync(msg, opts) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    confirmModal(msg, () => finish(true), { ...(opts || {}), onCancel: () => finish(false) });
  });
}

/* ---------- HTML sanitizer (comment rich text) ----------
   DOMPurify (pinned + SRI in index.html) is the sanitizer. It's a shared,
   persistent surface (every teammate sees stored comments), so we FAIL CLOSED:
   if DOMPurify isn't loaded (CDN blocked / offline / test harness), we do NOT
   fall back to a weaker regex scrubber — we escape to plain text, dropping
   formatting but guaranteeing no HTML executes. `img`/`a` URLs are https-only
   (uploaded images already come back as https Storage URLs); no data: URLs,
   which closes the data:image/svg-in-href navigation vector. */
function sanitizeHtml(html) {
  if (window.DOMPurify && window.DOMPurify.sanitize) {
    return window.DOMPurify.sanitize(String(html || ""), {
      // h3/code/table family added for the comment/description editor's
      // Heading/Code/Table buttons — a fixed, small addition, not an open door
      // (no script-bearing tags, no event-handler attributes below).
      ALLOWED_TAGS: ["b", "i", "u", "strong", "em", "span", "br", "p", "ul", "ol", "li", "a", "img", "div", "font", "h3", "code", "table", "thead", "tbody", "tr", "th", "td"],
      // "download" is a normal, non-executable attribute (still https-only via
      // ALLOWED_URI_REGEXP below) — lets an attached image/file link force a
      // save instead of just navigating to it in a new tab.
      ALLOWED_ATTR: ["style", "href", "src", "alt", "size", "color", "download"],
      ALLOWED_URI_REGEXP: /^https?:/i,
    });
  }
  return esc(html); // fail closed: no real sanitizer → no HTML, just text
}
function richTextAvailable() { return !!(window.DOMPurify && window.DOMPurify.sanitize); }

/* ---------- multi-select picker (assignees / parts) ----------
   State lives per picker id so search doesn't lose selection; only the picker
   subtree re-renders on keystroke/toggle so focus stays put. */
const PICKERS = {};
function pickerInit(id, items, selected) { PICKERS[id] = { items: items || [], sel: (selected || []).slice(), q: "", open: false }; }
function pickerValues(id) { return (PICKERS[id] ? PICKERS[id].sel : []).slice(); }
function pickerBody(id) {
  const p = PICKERS[id]; if (!p) return "";
  const q = p.q.toLowerCase();
  const opts = p.items.filter(it => !q || (it.label + " " + (it.sublabel || "")).toLowerCase().includes(q));
  const tok = p.sel.map(v => {
    const it = p.items.find(x => x.value === v) || { value: v, label: v };
    return `<span class="tok">${it.avatarEmail ? avatar(it.avatarEmail, 18) : ""}${esc(it.label)}<button onclick="event.stopPropagation();pickerToggle('${id}','${esc(v)}')">×</button></span>`;
  }).join("") || `<span class="muted" style="padding:2px 4px">click to add…</span>`;
  // Collapsed by default: the chosen area is a button that opens the list.
  return `<div class="chosen" onclick="pickerToggleOpen('${id}')">${tok}<span class="pk-caret ${p.open ? "open" : ""}">${icon("chevronDown", 15)}</span></div>
    ${p.open ? `<input class="psearch" placeholder="search…" value="${esc(p.q)}" oninput="pickerSearch('${id}',this.value)" onkeydown="if(event.key==='Escape')pickerClose('${id}')">
    <div class="opts" id="pk-opts-${id}">${pickerOpts(id, opts)}</div>` : ""}`;
}
function pickerOpen(id) { const p = PICKERS[id]; if (!p) return; p.open = true; const el = document.getElementById("pk-" + id); if (el) { el.innerHTML = pickerBody(id); const s = el.querySelector(".psearch"); if (s) s.focus(); } }
function pickerClose(id) { const p = PICKERS[id]; if (!p) return; p.open = false; p.q = ""; const el = document.getElementById("pk-" + id); if (el) el.innerHTML = pickerBody(id); }
// Clicking the chosen row toggled it open every time, even when already open,
// so a second click never closed it — this is the actual click target; open()
// and close() stay as explicit setters (Escape, the search input's blur path).
function pickerToggleOpen(id) { const p = PICKERS[id]; if (!p) return; if (p.open) pickerClose(id); else pickerOpen(id); }
function pickerOpts(id, opts) {
  const p = PICKERS[id];
  return opts.map(it => `<div class="opt ${p.sel.includes(it.value) ? "sel" : ""}" onclick="pickerToggle('${id}','${esc(it.value)}')">
    ${it.avatarEmail ? avatar(it.avatarEmail, 22) : ""}<span>${esc(it.label)}${it.sublabel ? ` <span class="muted">${esc(it.sublabel)}</span>` : ""}</span>
    ${p.sel.includes(it.value) ? '<span style="margin-left:auto;color:var(--ok)">✓</span>' : ""}
  </div>`).join("") || `<div class="opt muted">no matches</div>`;
}
function pickerToggle(id, v) {
  const p = PICKERS[id]; if (!p) return;
  const i = p.sel.indexOf(v);
  if (i >= 0) p.sel.splice(i, 1); else p.sel.push(v);
  const el = document.getElementById("pk-" + id); if (el) el.innerHTML = pickerBody(id);
}
function pickerSearch(id, q) {
  const p = PICKERS[id]; if (!p) return;
  p.q = q;
  const box = document.getElementById("pk-opts-" + id);
  const qq = q.toLowerCase();
  if (box) box.innerHTML = pickerOpts(id, p.items.filter(it => !qq || (it.label + " " + (it.sublabel || "")).toLowerCase().includes(qq)));
}
function pickerField(id) { return `<div class="picker" id="pk-${id}">${pickerBody(id)}</div>`; }

/* ---------- tabs + top-level render ---------- */
/* Order = sidebar order. render() is resolved at click time, after every tab
   script has loaded. Add a tab by adding a row here + its renderX().

   Grouped by what you are doing, roughly in the order a job moves:
     overview          Dashboard
     the build         Work Orders -> Parts -> Stock   (jobs, what they make,
                                                        what they are made from)
     planning          Projects -> Timeline -> Calendar
     money             Budget
     reference         Documents -> Reports
     admin             People                          (rarely opened, so last) */
const TABS = [
  { id: "dashboard", label: "Dashboard", ic: "dashboard", coll: null, render: () => renderDashboard() },
  { id: "workorders", label: "Work Orders", ic: "workorders", coll: "workOrders", render: () => renderWorkOrders() },
  { id: "parts", label: "Parts", ic: "parts", coll: "parts", render: () => renderParts() },
  { id: "stock", label: "Stock", ic: "layers", coll: "stock", render: () => renderStock() },
  { id: "projects", label: "Tickets", ic: "projects", coll: "projects", render: () => renderProjects() },
  { id: "timeline", label: "Timeline", ic: "timeline", coll: "schedule", render: () => renderTimeline() },
  { id: "weekplan", label: "Weekly Plan", ic: "calendar", coll: "schedule", render: () => renderWeekPlan() },
  { id: "budget", label: "Budget", ic: "budget", coll: "budget", render: () => renderBudget() },
  { id: "documents", label: "Documents", ic: "documents", coll: null, render: () => renderDocuments() },
  { id: "reports", label: "Reports", ic: "reports", coll: null, render: () => renderReports() },
  { id: "people", label: "People", ic: "people", coll: null, render: () => renderPeople() },
];
function activeColl() { const t = TABS.find(t => t.id === view.tab); return t ? t.coll : null; }
function setTab(id) {
  view = { ...view, tab: id, mode: "list", id: null, edit: false, q: "", fStatus: "", fSub: "", sortKey: null, sortDir: null, tlArchive: false, tlPast: false };
  closeDrawer();
  render();
}
function tabLabel() { const t = TABS.find(t => t.id === view.tab); return t ? t.label : ""; }
function renderSidebar() {
  const el = document.getElementById("sidebar");
  if (!el) return;
  const st = window.fb ? fb.state : "loading";
  if (st !== "ready") { el.innerHTML = ""; return; }
  const rail = railOn();
  el.innerHTML = `
    <div class="sb-brand" onclick="setTab('dashboard')" title="Home">${febMark(26)}<span class="sb-brand-txt">FEB <span>Composites</span></span></div>
    <div class="sb-nav">
      ${TABS.map(t => `<button class="sb-item ${view.tab === t.id ? "active" : ""}" title="${esc(t.label)}" onclick="setTab('${t.id}')">
        <span class="ic">${icon(t.ic, 19)}</span><span class="sb-label">${t.label}</span>${t.id === "projects" && watchedUnreadCount() ? '<span class="dot"></span>' : ""}
      </button>`).join("")}
    </div>
    <button class="sb-toggle no-print" title="${rail ? "Expand the sidebar" : "Collapse the sidebar to icons"}"
      aria-label="${rail ? "Expand the sidebar" : "Collapse the sidebar to icons"}" aria-pressed="${rail}" onclick="toggleRail()">
      <span class="ic">${icon(rail ? "chevronRight" : "chevronLeft", 18)}</span><span class="sb-label">Collapse</span>
    </button>`;
}
function renderTopbar() {
  const el = document.getElementById("topbar");
  if (!el) return;
  const st = window.fb ? fb.state : "loading";
  if (st !== "ready") { el.innerHTML = ""; return; }
  const unread = (DB.notifications || []).filter(n => !n.read).length;
  el.innerHTML = `
    <button class="hamburger no-print" title="Menu" aria-label="Menu" onclick="toggleDrawer()">${icon("menu", 22)}</button>
    <h1>${esc(view.mode === "roster" ? "Roster" : tabLabel())}</h1>
    <div class="actions">
      <button class="icon-btn" title="Search (⌘K)" aria-label="Search" onclick="openSearch()">${icon("search", 19)}</button>
      <button class="icon-btn" title="Notifications" aria-label="Notifications" onclick="openNotifs()">${icon("bell", 19)}${unread ? `<span class="badge">${unread}</span>` : ""}</button>
      ${themeToggleBtn()}
      <span class="tb-desktop">
        <button onclick="exportAll()">Backup</button>
        ${isLead() ? `<button onclick="document.getElementById('importfile').click()">Restore</button>
        <button onclick="loadArchive()">Load SN5 archive</button>
        <button onclick="openRoster()">Roster</button>` : ""}
        <button class="avatar-btn" title="Change your photo" onclick="setMyAvatar()">${avatar(myEmail(), 30)}</button>
        <span class="muted">${esc(signerName())}${isLead() ? " · lead" : ""}</span>
        <button onclick="fb.signOut()">Sign out</button>
      </span>
      <button class="icon-btn tb-morebtn" title="More" aria-label="More" onclick="openMoreMenu()">${icon("more", 20)}</button>
    </div>`;
}
// Small-screen overflow for the account/admin actions that don't fit the topbar.
// Reuses the same global handlers the desktop buttons call.
function openMoreMenu() {
  const lead = isLead();
  openModal(`
    <div style="display:flex;align-items:center;gap:10px;margin:0 0 16px">
      ${avatar(myEmail(), 40)}
      <div><div style="font-weight:600">${esc(signerName())}</div>
        <div class="muted tny">${esc(myEmail())}${lead ? " · lead" : ""}</div></div>
    </div>
    <div class="menu-actions">
      <button onclick="toggleTheme();closeModal()">${icon(currentTheme() === "dark" ? "sun" : "moon", 18)}${currentTheme() === "dark" ? "Light theme" : "Dark theme"}</button>
      <button onclick="closeModal();setMyAvatar()">${icon("edit", 18)}Change photo</button>
      <button onclick="closeModal();exportAll()">${icon("download", 18)}Backup database</button>
      ${lead ? `<button onclick="closeModal();document.getElementById('importfile').click()">${icon("upload", 18)}Restore from backup</button>
      <button onclick="closeModal();loadArchive()">${icon("archive", 18)}Load SN5 archive</button>
      <button onclick="closeModal();openRoster()">${icon("roster", 18)}Roster</button>` : ""}
      <button class="danger" onclick="closeModal();fb.signOut()">${icon("logout", 18)}Sign out</button>
    </div>`);
}
/* ---------- mobile drawer ---------- */
// Guard document.body: the DOM-stub test harness has no body element.
function toggleDrawer() { if (document.body) document.body.classList.toggle("drawer-open"); }
function closeDrawer() { if (document.body) document.body.classList.remove("drawer-open"); }

/* ---------- swipe from the left edge opens the drawer ----------
   The decision is a pure function so it's testable without a real TouchEvent
   (the DOM-stub harness has none, and document.addEventListener is a no-op
   there anyway — this glue only ever runs in a real browser). Discrete
   open-only trigger at gesture-end, not a live drag-follows-finger transform:
   the existing CSS transition already handles the slide, and a v1 doesn't
   need to re-architect that into a per-frame transform. */
function isNarrowViewport() { return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(max-width: 900px)").matches; }
function shouldOpenDrawerFromSwipe(startX, startY, endX, endY, drawerOpen, narrowViewport) {
  if (drawerOpen || !narrowViewport) return false;
  if (startX > 24) return false; // a narrow edge zone (0-24px), not the whole screen
  const dx = endX - startX, dy = endY - startY;
  if (dx < 60) return false; // a real rightward swipe, not a tap or jitter
  if (Math.abs(dy) > Math.abs(dx)) return false; // vertical-dominant = scrolling, not this gesture
  return true;
}
let SWIPE_START = null;
document.addEventListener("touchstart", (e) => {
  const t = e.touches && e.touches[0]; if (!t) { SWIPE_START = null; return; }
  SWIPE_START = { x: t.clientX, y: t.clientY };
}, { passive: true });
document.addEventListener("touchend", (e) => {
  const start = SWIPE_START; SWIPE_START = null;
  if (!start) return;
  const t = e.changedTouches && e.changedTouches[0]; if (!t) return;
  const drawerOpen = !!(document.body && document.body.classList.contains("drawer-open"));
  if (shouldOpenDrawerFromSwipe(start.x, start.y, t.clientX, t.clientY, drawerOpen, isNarrowViewport())) toggleDrawer();
}, { passive: true });

/* ---------- theme (light / dark) ----------
   The no-FOUC <head> script set data-theme before paint; this just flips and
   persists it. Guards the DOM-stub test harness. */
function currentTheme() {
  const el = document.documentElement;
  return (el && el.getAttribute && el.getAttribute("data-theme") === "dark") ? "dark" : "light";
}
function applyTheme(t) {
  const el = document.documentElement;
  if (el && el.setAttribute) el.setAttribute("data-theme", t);
  try { localStorage.setItem("feb-theme", t); } catch (e) {}
}
function toggleTheme() {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
  renderTopbar();
  // A WebGL canvas isn't restyled by CSS variables — it has to repaint itself.
  if (typeof mvThemeChanged === "function") mvThemeChanged();
}
function themeToggleBtn() {
  const dark = currentTheme() === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return `<button class="icon-btn" title="${label}" aria-label="${label}" onclick="toggleTheme()">${icon(dark ? "sun" : "moon", 18)}</button>`;
}

/* ---------- sidebar rail ----------
   Collapse the 216px sidebar to a 56px icon rail and hand the 160px back to
   the content. Remembered the same way and in the same place as the theme,
   because it is the same kind of choice: a persistent preference about the
   chrome, not app state, so it does not belong in `view`.

   Applied to <body> rather than to the nav: main's width is what actually
   changes, and the two have no common ancestor below #app. Set before first
   paint by the same inline script in index.html that sets the theme, so the
   sidebar does not visibly snap shut a moment after load. */
function railOn() {
  try { return localStorage.getItem("feb-rail") === "1"; } catch (e) { return false; }
}
function toggleRail() {
  const on = !railOn();
  try { localStorage.setItem("feb-rail", on ? "1" : "0"); } catch (e) {}
  /* <html>, not <body>: the no-FOUC script in index.html runs inside <head>
     where <body> does not exist yet, and the sidebar snapping shut a beat
     after load is exactly what that script exists to prevent. Guarded because
     tools/test_app.mjs runs against a DOM stub with no documentElement. */
  const de = document.documentElement;
  if (de && de.classList) de.classList.toggle("rail", on);
  renderSidebar();
  /* The content pane just changed width without the window changing size, so
     anything that measured its own box is now wrong — the meshview canvas
     (which listens for exactly this event, meshview.js:532) and the topbar
     overflow check. Dispatching the real event rather than calling into each
     of them keeps this from needing a list of who cares. */
  if (typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("resize"));
}

/* ---------- global search (⌘K command palette) ---------- */
function searchAll(q) {
  q = (q || "").toLowerCase().trim();
  if (!q) return [];
  const out = [];
  const add = (tab, id, label, sub) => out.push({ tab, id, label, sub });
  DB.workOrders.forEach(w => { if ((w.id + " " + (w.partName || "")).toLowerCase().includes(q)) add("workorders", w.id, w.partName || w.id, "Work order " + w.id); });
  DB.parts.forEach(p => { if ((p.id + " " + (p.partName || "")).toLowerCase().includes(q)) add("parts", p.id, p.partName || p.id, "Part " + p.id); });
  // (p.title || "" + p.id) was a precedence bug: "" + p.id runs first, so the
  // id branch was unreachable whenever a title existed — search never matched
  // by ticket id. Matches the id+label pattern already used for work orders/parts.
  DB.projects.forEach(p => { if ((p.id + " " + (p.title || "")).toLowerCase().includes(q)) add("projects", p.id, p.title || p.id, isIssue(p) ? "Issue" : "Ticket"); });
  DB.budget.forEach(b => { if ((b.item || "").toLowerCase().includes(q)) add("budget", b.id, b.item || b.id, "Purchase"); });
  DB.users.forEach(u => { if (((u.name || "") + " " + u.email).toLowerCase().includes(q)) add("people", u.email, u.name || u.email, "Person"); });
  (typeof allDocs === "function" ? allDocs() : []).forEach(d => { if ((d.title || "").toLowerCase().includes(q)) out.push({ tab: "documents", docSrc: d.src, uploaded: d.uploaded, label: d.title, sub: "Document · " + d.category }); });
  return out.slice(0, 40);
}
function openSearch() {
  openModal(`
    <input id="gsearch" class="gsearch" placeholder="Search parts, work orders, projects, people, docs…" oninput="renderSearchResults(this.value)" onkeydown="if(event.key==='Escape')closeModal()">
    <div id="gsearch-results" class="gsearch-results"></div>`);
}
function renderSearchResults(q) {
  const box = document.getElementById("gsearch-results"); if (!box) return;
  const res = searchAll(q);
  box.innerHTML = !q.trim() ? `<div class="muted" style="padding:10px">Type to search across every tab.</div>`
    : res.length ? res.map((r, i) => `<div class="gsr" onclick="gotoResult(${i})">
        <span>${esc(r.label)}</span><span class="muted tny">${esc(r.sub)}</span></div>`).join("")
      : `<div class="muted" style="padding:10px">No matches.</div>`;
  window.__searchRes = res;
}
function gotoResult(i) {
  const r = (window.__searchRes || [])[i]; if (!r) return;
  closeModal();
  if (r.tab === "documents") { setTab("documents"); if (typeof openDocFromRow === "function" && r.docSrc) openDocFromRow(r.docSrc, r.uploaded ? "up" : ""); }
  else if (r.tab === "people") { setTab("people"); }
  else openRecord(r.tab, r.id);
}

/* ---------- notifications ---------- */
function openNotifs() {
  const ns = (DB.notifications || []).slice().sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  openModal(`
    <h2>Notifications</h2>
    ${ns.length ? ns.map(n => `<div class="notif ${n.read ? "" : "unread"}" onclick="gotoNotif('${n.id}')">
      <div>${esc(n.text)}</div>
      <div class="muted tny">${esc(n.type || "")} · ${fmtWhen(n.ts)}${n.from ? " · " + esc(userName(n.from)) : ""}</div>
    </div>`).join("") : '<p class="muted">No notifications.</p>'}
    ${ns.some(n => !n.read) ? `<div class="foot"><button onclick="markAllNotifsRead()">Mark all read</button></div>` : ""}`);
}
function gotoNotif(id) {
  const n = (DB.notifications || []).find(x => x.id === id);
  if (n && !n.read) fb.markNotifRead(id).catch(() => {});
  closeModal();
  if (n && n.link && n.link.tab) { if (n.link.id) openRecord(n.link.tab, n.link.id); else setTab(n.link.tab); }
}
function markAllNotifsRead() {
  (DB.notifications || []).filter(n => !n.read).forEach(n => fb.markNotifRead(n.id).catch(() => {}));
  closeModal();
}
// Overridden meaningfully in dashboard.js once watchers exist; safe default here.
function watchedUnreadCount() { return typeof unreadWatched === "function" ? unreadWatched() : 0; }
function render() {
  renderSidebar();
  renderTopbar();
  const el = document.getElementById("main");
  const st = window.fb ? fb.state : "loading";
  if (st === "loading") { el.innerHTML = `<div class="card">Connecting…</div>`; return; }
  if (st === "signedout") { el.innerHTML = renderLogin(); return; }
  if (st === "pending") { el.innerHTML = renderPending(); return; }
  if (view.mode === "roster") { el.innerHTML = renderRoster(); return; }
  const tab = TABS.find(t => t.id === view.tab) || TABS[0];
  el.innerHTML = tab.render();
  labelListTables();
  /* Timeline scrolls sideways along the season, and innerHTML above just reset
     that to zero — so without this every edit throws you back to the first
     week. Optional-function guard because tools/test_app.mjs loads the tab
     files in whatever order its FILES list gives, and because this is the only
     tab that has anything to restore. */
  if (typeof syncTimelineScroll === "function") syncTimelineScroll();
  if (typeof syncHoldTick === "function") syncHoldTick();
  syncChromeMetrics();
}

/* Publish the topbar's real height as --topbar-h.

   Everything sticky below the topbar has to clear it, and its height is not a
   constant anyone can write down: it grows by env(safe-area-inset-top) on a
   notched phone, and its content wraps differently by width and by role. The
   old hardcoded `top: 52px` / `top: 62px` were right for a MacBook and wrong
   for an iPhone, where the jumpbar, the parts rail and the undo bar all pinned
   underneath the bar they were supposed to sit below.

   Measured rather than computed, because the only honest source for "how tall
   did that actually come out" is the box the browser laid out. Guarded at every
   step: tools/test_app.mjs runs the whole app against a DOM stub that has no
   documentElement and no getBoundingClientRect, and a missing guard here is the
   same omission that once broke 19 tests in toggleDrawer(). */
function syncChromeMetrics() {
  const root = document.documentElement;
  if (!root || !root.style) return;
  const tb = document.getElementById("topbar");
  const box = tb && tb.getBoundingClientRect ? tb.getBoundingClientRect() : null;
  // An empty topbar is display:none and measures 0; leaving the previous value
  // in place beats pinning things to the top of the window on the login screen.
  if (!box || !(box.height > 0)) return;
  root.style.setProperty("--topbar-h", Math.round(box.height) + "px");

  /* Fold the account row into the ⋯ menu when it genuinely doesn't fit, rather
     than at a width someone guessed.

     A lead's topbar carries Backup + Restore + Load SN5 archive + Roster +
     avatar + name + Sign out. Whether that fits depends on the width, on the
     role, on the name's length AND on the safe-area inset — a landscape iPhone
     spends 59px of its right edge on the island, which is enough to push Sign
     out off the screen at 932px even though the breakpoint says "desktop".
     A media query can read the width but not the inset, so no threshold can be
     correct here; measuring can.

     Measured in the EXPANDED state and only then collapsed, so this settles in
     one pass instead of oscillating: with the class on, the bar always fits. */
  const body = document.body;
  if (!body || !body.classList || tb.scrollWidth == null) return;
  body.classList.remove("tb-overflow");
  if (tb.scrollWidth > tb.clientWidth + 1) body.classList.add("tb-overflow");
}

// Copy each `table.list` header cell's text onto every body cell's data-label.
// The stacked-card mobile layout (index.html, <=640px) reveals these as row
// labels via a ::before; on desktop they're inert. Keeps the responsive table
// generic so no tab renderer has to emit data-label itself. The list tables all
// share the shape: first <tr> is <th> headers, matching <td> cells follow.
function labelListTables() {
  const main = document.getElementById("main");
  if (!main || !main.querySelectorAll) return;
  main.querySelectorAll("table.list").forEach(tbl => {
    const rows = tbl.rows;
    if (!rows || rows.length < 2) return;
    const headers = [...rows[0].cells].map(c => (c.textContent || "").trim());
    for (let i = 1; i < rows.length; i++) {
      [...rows[i].cells].forEach((cell, ci) => {
        if (headers[ci]) cell.setAttribute("data-label", headers[ci]);
      });
    }
  });
}

// ⌘K / Ctrl-K opens global search (only once signed in).
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    if (window.fb && fb.state === "ready") { e.preventDefault(); openSearch(); }
  }
  // Escape closes the mobile drawer (modal Escape is handled separately while a
  // modal is open, so this only fires for the drawer).
  if (e.key === "Escape" && document.body.classList.contains("drawer-open")) closeDrawer();
});

/* Re-measure the chrome when its height can have changed. Rotating a phone is
   the case that matters: portrait and landscape have different safe-area insets
   (the island moves from the top edge to a side one), so the topbar's height
   changes without a single re-render. */
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("resize", syncChromeMetrics);
  window.addEventListener("orientationchange", syncChromeMetrics);
}
