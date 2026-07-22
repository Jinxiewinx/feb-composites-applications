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
let DB = { workOrders: [], parts: [], projects: [], schedule: [], budget: [], documents: [], notifications: [], users: [] };
let view = {
  tab: "dashboard", mode: "list", id: null, edit: false,
  q: "", fStatus: "", fSub: "", authMode: "in",
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
async function allocId(coll) {
  try { return await fb.allocId(coll); }
  catch (e) {
    if (!confirm("Couldn't reach the shared ID counter (offline?). Assign a local ID now — it could collide with one made on another laptop. Continue?")) return null;
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
// Clickable chip that jumps to another tab's detail view (light cross-links).
function chip(coll, id, label) {
  if (!id) return "";
  const tab = { workOrders: "workorders", parts: "parts", projects: "projects", budget: "budget" }[coll] || coll;
  const known = recById(coll, id);
  return `<span class="chip" onclick="event.stopPropagation();openRecord('${tab}','${esc(id)}')">${esc(label || id)}${known ? "" : " ?"}</span>`;
}
function openRecord(tab, id) { view = { ...view, tab, mode: "detail", id, edit: false }; render(); }

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
function addPly(coll, id) {
  const o = recById(coll, id); if (!o) return;
  const ply = { material: prompt("Ply material (e.g. 195 twill, Cu mesh, Rohacell 31 3mm):") || "", orientation: prompt("Orientation (0/90, ±45, n/a):") || "", coverage: "full", notes: "" };
  o.layupStack = (o.layupStack || []).concat([ply]); // optimistic
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

// Lead-only: seed all SN5 retro archives (work orders, parts, timeline).
async function loadArchive() {
  const sources = [
    ["workOrders", "sn5-work-orders.json"],
    ["parts", "sn5-parts.json"],
    ["schedule", "sn5-schedule.json"],
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
    <h2>FEB <span style="color:var(--gold)">Composites</span></h2>
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
  <div class="toolbar no-print"><button onclick="view={...view,mode:'list'};render()">← Back</button></div>
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
  const first = m.querySelector("input,select,textarea,[contenteditable]");
  if (first && first.focus) first.focus();
}
function closeModal() {
  const m = document.getElementById("modal");
  m.innerHTML = ""; m.classList.remove("open");
  document.removeEventListener("keydown", escClose);
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
// Styled replacement for window.confirm — calls onConfirm() if the user proceeds.
function confirmModal(msg, onConfirm, opts) {
  opts = opts || {};
  window.__confirmCb = onConfirm;
  openModal(`
    <h2>${esc(opts.title || "Please confirm")}</h2>
    <p style="margin:0 0 4px">${esc(msg)}</p>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="${opts.danger === false ? "primary" : "danger"}" onclick="var cb=window.__confirmCb;window.__confirmCb=null;closeModal();if(cb)cb()">${esc(opts.ok || "Confirm")}</button>
    </div>`);
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
      ALLOWED_TAGS: ["b", "i", "u", "strong", "em", "span", "br", "p", "ul", "ol", "li", "a", "img", "div", "font"],
      ALLOWED_ATTR: ["style", "href", "src", "alt", "size", "color"],
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
  return `<div class="chosen" onclick="pickerOpen('${id}')">${tok}<span class="pk-caret">${p.open ? "▴" : "▾"}</span></div>
    ${p.open ? `<input class="psearch" placeholder="search…" value="${esc(p.q)}" oninput="pickerSearch('${id}',this.value)" onkeydown="if(event.key==='Escape')pickerClose('${id}')">
    <div class="opts" id="pk-opts-${id}">${pickerOpts(id, opts)}</div>` : ""}`;
}
function pickerOpen(id) { const p = PICKERS[id]; if (!p) return; p.open = true; const el = document.getElementById("pk-" + id); if (el) { el.innerHTML = pickerBody(id); const s = el.querySelector(".psearch"); if (s) s.focus(); } }
function pickerClose(id) { const p = PICKERS[id]; if (!p) return; p.open = false; p.q = ""; const el = document.getElementById("pk-" + id); if (el) el.innerHTML = pickerBody(id); }
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
// Order = sidebar order. render() is resolved at click time, after every tab
// script has loaded. Add a tab by adding a row here + its renderX().
const TABS = [
  { id: "dashboard", label: "Dashboard", ic: "▚", coll: null, render: () => renderDashboard() },
  { id: "workorders", label: "Work Orders", ic: "▤", coll: "workOrders", render: () => renderWorkOrders() },
  { id: "parts", label: "Parts", ic: "◧", coll: "parts", render: () => renderParts() },
  { id: "projects", label: "Projects", ic: "▦", coll: "projects", render: () => renderProjects() },
  { id: "timeline", label: "Timeline", ic: "▧", coll: "schedule", render: () => renderTimeline() },
  { id: "calendar", label: "Calendar", ic: "◷", coll: null, render: () => renderCalendar() },
  { id: "budget", label: "Budget", ic: "$", coll: "budget", render: () => renderBudget() },
  { id: "people", label: "People", ic: "◑", coll: null, render: () => renderPeople() },
  { id: "documents", label: "Documents", ic: "▣", coll: null, render: () => renderDocuments() },
  { id: "reports", label: "Reports", ic: "▥", coll: null, render: () => renderReports() },
];
function activeColl() { const t = TABS.find(t => t.id === view.tab); return t ? t.coll : null; }
function setTab(id) {
  view = { ...view, tab: id, mode: "list", id: null, edit: false, q: "", fStatus: "", fSub: "" };
  render();
}
function tabLabel() { const t = TABS.find(t => t.id === view.tab); return t ? t.label : ""; }
function renderSidebar() {
  const el = document.getElementById("sidebar");
  if (!el) return;
  const st = window.fb ? fb.state : "loading";
  if (st !== "ready") { el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="sb-brand" onclick="setTab('dashboard')" style="cursor:pointer" title="Home">FEB <span>Composites</span></div>
    <div class="sb-nav">
      ${TABS.map(t => `<button class="sb-item ${view.tab === t.id ? "active" : ""}" onclick="setTab('${t.id}')">
        <span class="ic">${t.ic}</span>${t.label}${t.id === "projects" && watchedUnreadCount() ? '<span class="dot"></span>' : ""}
      </button>`).join("")}
    </div>`;
}
function renderTopbar() {
  const el = document.getElementById("topbar");
  if (!el) return;
  const st = window.fb ? fb.state : "loading";
  if (st !== "ready") { el.innerHTML = ""; return; }
  const unread = (DB.notifications || []).filter(n => !n.read).length;
  el.innerHTML = `
    <h1>${esc(view.mode === "roster" ? "Roster" : tabLabel())}</h1>
    <div class="actions">
      <button class="icon-btn" title="Search (⌘K)" onclick="openSearch()">🔍</button>
      <button class="icon-btn bell" title="Notifications" onclick="openNotifs()">🔔${unread ? `<span class="badge">${unread}</span>` : ""}</button>
      <button onclick="exportAll()">Backup</button>
      ${isLead() ? `<button onclick="document.getElementById('importfile').click()">Restore</button>
      <button onclick="loadArchive()">Load SN5 archive</button>
      <button onclick="openRoster()">Roster</button>` : ""}
      <button class="avatar-btn" title="Change your photo" onclick="setMyAvatar()">${avatar(myEmail(), 30)}</button>
      <span class="muted">${esc(signerName())}${isLead() ? " · lead" : ""}</span>
      <button onclick="fb.signOut()">Sign out</button>
    </div>`;
}

/* ---------- global search (⌘K command palette) ---------- */
function searchAll(q) {
  q = (q || "").toLowerCase().trim();
  if (!q) return [];
  const out = [];
  const add = (tab, id, label, sub) => out.push({ tab, id, label, sub });
  DB.workOrders.forEach(w => { if ((w.id + " " + (w.partName || "")).toLowerCase().includes(q)) add("workorders", w.id, w.partName || w.id, "Work order " + w.id); });
  DB.parts.forEach(p => { if ((p.id + " " + (p.partName || "")).toLowerCase().includes(q)) add("parts", p.id, p.partName || p.id, "Part " + p.id); });
  DB.projects.forEach(p => { if ((p.title || "" + p.id).toLowerCase().includes(q)) add("projects", p.id, p.title || p.id, "Project"); });
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
}

// ⌘K / Ctrl-K opens global search (only once signed in).
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    if (window.fb && fb.state === "ready") { e.preventDefault(); openSearch(); }
  }
});
