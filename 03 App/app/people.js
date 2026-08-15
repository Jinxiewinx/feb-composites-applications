"use strict";
/* people.js — the People tab.
   Team directory: everyone on the roster with their photo, role, email, and
   what they're currently on the hook for (parts / projects / work orders),
   pulled live. Leads can bump a role or remove someone from the roster
   (rosterDel in core.js — same confirmed flow as the topbar Roster screen,
   and the firestore rules enforce lead-only server-side); you set your own
   photo from the topbar. Trainings are granted and revoked here too — the
   catalog (TRAININGS) lives in workorders.js next to the step templates that
   reference it. */

// Records currently assigned to a given person (by email / name match).
function assignmentsFor(email) {
  const name = (userByEmail(email) || {}).name || email;
  const mine = (val) => {
    const vals = Array.isArray(val) ? val : [val];
    return vals.some(v => { v = String(v || "").toLowerCase(); return v === email.toLowerCase() || v === name.toLowerCase() || v === name.toLowerCase().split(" ")[0]; });
  };
  const parts = DB.parts.filter(p => !["Layup Complete", "Polished"].includes(p.layupProgress) && mine([p.moldEngineer, p.manufacturingEngineer]));
  /* Main tickets and issues only — a sub-ticket does not get its own chip here.
     This column answers "what is this person on the hook for", and at that
     altitude "Undertray mold" and its four sub-tickets are one thing, not five.
     Listing both meant the person who broke their work down properly looked
     like the busiest person on the team, which is exactly backwards.

     An issue can never be a sub-ticket, so this reads as "main tickets, and
     issues" and is one condition. The sub-tickets are still one tap away on
     the parent's own page, and still on the board where the planning happens. */
  const projects = DB.projects.filter(p => !p.parentId && !["Done", "Cancelled"].includes(projStatus(p)) && mine(p.assignees || []));
  const wos = DB.workOrders.filter(w => w.status !== "Complete" && mine([w.moldEngineer, w.manufacturingEngineer]));
  return { parts, projects, wos };
}

/* A person's trainings as capsule pills. Deliberately NOT the .pill status
   shape or colors — a green "INF" next to a green "Complete" would read as a
   status. Provenance rides in the tooltip; the per-person modal shows it in
   full for touch. */
function trainingPills(u) {
  const held = Object.keys(u.trainings || {}).filter(id => TRAININGS[id]);
  if (!held.length) return '<span class="muted tny">none yet</span>';
  return held.map(id => {
    const g = u.trainings[id] || {};
    const tip = `${TRAININGS[id]} — granted by ${userName(g.by)}${g.at ? ", " + String(g.at).slice(0, 10) : ""}`;
    return `<span class="tpill" title="${esc(tip)}">${esc(TRAINING_CODES[id] || id)}</span>`;
  }).join("");
}

function renderPeople() {
  const users = usersSorted();
  const rows = users.filter(u => {
    const q = (view.q || "").toLowerCase();
    if (q && !(u.name || "").toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    return !view.fTrain || (u.trainings && u.trainings[view.fTrain]);
  });
  return `
  <div class="filters no-print">
    <input id="searchbox" placeholder="search name / email…" value="${esc(view.q)}" oninput="searchInput(this)">
    <select onchange="view.fTrain=this.value;render()" title="Show only people who hold a training">
      <option value="">qualified for…</option>
      ${Object.keys(TRAININGS).map(id => `<option value="${id}" ${view.fTrain === id ? "selected" : ""}>${esc(TRAININGS[id])}</option>`).join("")}
    </select>
    ${isLead() ? `<button onclick="openTrainingSession()">＋ Record training session</button>` : ""}
    <span class="muted" style="align-self:center">${users.length} people on the roster</span>
  </div>
  ${rows.length === 0 ? `<div class="card">${view.fTrain ? "Nobody holds " + esc(TRAININGS[view.fTrain] || "") + " yet." : "No one on the roster yet."}</div>` : `
  <table class="list dash">
    <tr><th>Person</th><th>Role</th><th>Trainings</th><th>Assignments</th></tr>
    ${rows.map(u => {
      const a = assignmentsFor(u.email);
      const me = u.email === myEmail();
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">${avatar(u.email, 26)}
          <div><div class="pname">${esc(u.name || u.email)}${me ? ' <span class="muted tny">(you)</span>' : ""}</div>
          <div class="muted tny">${esc(u.email)}</div></div></div></td>
        <td>${isLead() && !me
          ? `<select onchange="setRole('${esc(u.email)}',this.value)"><option ${u.role === "member" ? "selected" : ""}>member</option><option ${u.role === "lead" ? "selected" : ""}>lead</option></select>
             <button class="sm danger no-print" onclick="rosterDel('${esc(u.email)}')">Remove</button>`
          : `<span class="pill">${esc(u.role || "member")}</span>`}
          ${me ? ` <button class="sm" onclick="setMyAvatar()">Set photo</button>` : ""}</td>
        <td><div class="trwrap">${trainingPills(u)}
          ${isLead() ? `<button class="ib sm no-print" title="Edit ${esc(u.name || u.email)}'s trainings" aria-label="Edit ${esc(u.name || u.email)}'s trainings" onclick="openPersonTrainings('${esc(u.email)}')">${icon("edit", 13)}</button>` : ""}</div></td>
        <td>${a.parts.length + a.projects.length + a.wos.length === 0 ? '<span class="muted tny">no open assignments</span>' : `
          ${a.projects.map(p => chip("projects", p.id, p.title || p.id)).join(" ")}
          ${a.parts.map(p => chip("parts", p.id, p.partName || p.id)).join(" ")}
          ${a.wos.map(w => chip("workOrders", w.id, w.id)).join(" ")}`}</td>
      </tr>`;
    }).join("")}
  </table>`}`;
}

/* ---------- granting trainings (leads) ----------
   Two surfaces for one write path. The session modal is the real event — one
   training, several people certified at once after a training night. The
   per-person modal is for corrections and revokes. Both go through
   fb.rosterGrant/rosterRevoke (dot-path writes on the roster doc; the rules
   already reject a member writing trainings on their own doc). */
function openPersonTrainings(email) {
  const u = userByEmail(email);
  if (!u) return;
  const rows = Object.keys(TRAININGS).map(id => {
    const g = (u.trainings || {})[id];
    return `<label class="trrow">
      <input type="checkbox" ${g ? "checked" : ""} onchange="togglePersonTraining('${esc(email)}','${id}',this.checked)">
      <span><b>${esc(TRAININGS[id])}</b> <span class="tpill">${esc(TRAINING_CODES[id] || id)}</span>
        ${g ? `<br><span class="muted tny">granted by ${esc(userName(g.by))}${g.at ? ", " + esc(String(g.at).slice(0, 10)) : ""}</span>` : ""}</span>
    </label>`;
  }).join("");
  openModal(`
    <h2>${esc(u.name || email)} — trainings</h2>
    <p class="muted">Each change saves as you make it. Unchecking revokes.</p>
    ${rows}
    <div class="foot"><button onclick="closeModal()">Done</button></div>
  `);
}
async function togglePersonTraining(email, id, on) {
  try {
    if (on) await fb.rosterGrant(email, id);
    else await fb.rosterRevoke(email, id);
    toast(`${userName(email)} ${on ? "certified for" : "no longer holds"} ${TRAININGS[id] || id}.`);
  } catch (e) { toast("Couldn't update training: " + e.message, "error"); render(); }
}
function openTrainingSession() {
  pickerInit("ts", usersSorted().map(u => ({ value: u.email, label: u.name || u.email, sublabel: u.email, avatarEmail: u.email })), []);
  openModal(`
    <h2>Record a training session</h2>
    <p class="muted">One training, everyone who was there. Each person's record notes who granted it and when.</p>
    <div class="field"><label for="ts-training">Training</label>
      <select id="ts-training">${Object.keys(TRAININGS).map(id => `<option value="${id}">${esc(TRAININGS[id])}</option>`).join("")}</select></div>
    <div class="field"><label>Who was trained</label>${pickerField("ts")}</div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="saveTrainingSession()">Certify</button>
    </div>
  `);
}
async function saveTrainingSession() {
  const sel = document.getElementById("ts-training");
  const id = sel ? sel.value : "";
  const people = pickerValues("ts");
  if (!id || !people.length) { toast("Pick the training and at least one person.", "error"); return; }
  closeModal();
  try {
    for (const email of people) await fb.rosterGrant(email, id);
    toast(`${people.length} ${people.length === 1 ? "person" : "people"} certified for ${TRAININGS[id] || id}.`);
  } catch (e) { toast("Couldn't record the session: " + e.message, "error"); }
}

function setRole(email, role) {
  const u = userByEmail(email);
  fb.rosterSet(email, (u && u.name) || email, role).then(() => toast(userName(email) + " is now " + role + ".")).catch(e => toast("Couldn't change role: " + e.message, "error"));
}
