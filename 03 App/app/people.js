"use strict";
/* people.js — the People tab.
   Team directory: everyone on the roster with their photo, role, email, and
   what they're currently on the hook for (parts / projects / work orders),
   pulled live. Leads can bump a role; you set your own photo from the topbar. */

// Records currently assigned to a given person (by email / name match).
function assignmentsFor(email) {
  const name = (userByEmail(email) || {}).name || email;
  const mine = (val) => {
    const vals = Array.isArray(val) ? val : [val];
    return vals.some(v => { v = String(v || "").toLowerCase(); return v === email.toLowerCase() || v === name.toLowerCase() || v === name.toLowerCase().split(" ")[0]; });
  };
  const parts = DB.parts.filter(p => !["Layup Complete", "Polished"].includes(p.layupProgress) && mine([p.moldEngineer, p.manufacturingEngineer]));
  const projects = DB.projects.filter(p => p.status !== "Done" && mine(p.assignees || []));
  const wos = DB.workOrders.filter(w => w.status !== "Complete" && mine([w.moldEngineer, w.manufacturingEngineer]));
  return { parts, projects, wos };
}

function renderPeople() {
  const users = usersSorted();
  return `
  <div class="filters no-print">
    <input id="searchbox" placeholder="search name / email…" value="${esc(view.q)}" oninput="searchInput(this)">
    <span class="muted" style="align-self:center">${users.length} people on the roster</span>
  </div>
  <div class="peoplegrid">
    ${users.filter(u => { const q = (view.q || "").toLowerCase(); return !q || (u.name || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q); }).map(u => {
      const a = assignmentsFor(u.email);
      const me = u.email === myEmail();
      return `<div class="card personcard">
        <div class="phead">${avatar(u.email, 44)}
          <div><div class="pname">${esc(u.name || u.email)}${me ? ' <span class="muted tny">(you)</span>' : ""}</div>
          <div class="muted tny">${esc(u.email)} · ${esc(u.role || "member")}</div></div>
          ${isLead() && !me ? `<select class="prole" onchange="setRole('${esc(u.email)}',this.value)"><option ${u.role === "member" ? "selected" : ""}>member</option><option ${u.role === "lead" ? "selected" : ""}>lead</option></select>` : ""}
          ${me ? `<button onclick="setMyAvatar()">Set photo</button>` : ""}
        </div>
        <div class="passign">
          ${a.parts.length + a.projects.length + a.wos.length === 0 ? '<span class="muted tny">no open assignments</span>' : `
          ${a.projects.map(p => chip("projects", p.id, p.title || p.id)).join(" ")}
          ${a.parts.map(p => chip("parts", p.id, p.partName || p.id)).join(" ")}
          ${a.wos.map(w => chip("workOrders", w.id, w.id)).join(" ")}`}
        </div>
      </div>`;
    }).join("") || '<div class="card">No one on the roster yet.</div>'}
  </div>`;
}

function setRole(email, role) {
  const u = userByEmail(email);
  fb.rosterSet(email, (u && u.name) || email, role).then(() => toast(userName(email) + " is now " + role + ".")).catch(e => toast("Couldn't change role: " + e.message, "error"));
}
