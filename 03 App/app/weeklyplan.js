"use strict";
/* weeklyplan.js — the Weekly Plan tab.
   A second view over the `schedule` collection Timeline already owns —
   Timeline is station x week; this is day x subteam, plus a per-person weekly
   task rollup pulling from both tickets (DB.projects, via their optional
   subteam/dueDate) and manual (non-ticket) assignments stored on the same
   week doc. Deliberately doesn't touch Timeline's station grid or its data.

   Assumes schedule.weekOf is the MONDAY of that production week — every day
   in the grid is derived as weekOf + 0..6 days. If that assumption is ever
   wrong for a real week, the grid dates will be off; there's no other signal
   in a week doc to derive a different start-of-week from. */

const DOW_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function weekDates(weekOf) {
  if (!weekOf) return [];
  const base = new Date(weekOf + "T00:00:00");
  if (isNaN(base.getTime())) return [];
  return DOW_SHORT.map((_, i) => {
    const d = new Date(base); d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
function weekById(id) { return DB.schedule.find(w => w.id === id); }
// Only dated weeks make sense on a day/date grid — undated retro weeks (see
// timeline.js) have nothing to derive dates from, so they're not offered here.
function weekPlanWeeks() { return DB.schedule.filter(w => w.weekOf).slice().sort((a, b) => a.weekOf.localeCompare(b.weekOf)); }

// Tickets due within a week's date range, excluding ones no longer live.
function ticketsForWeek(dates) {
  if (!dates.length) return [];
  const start = dates[0], end = dates[dates.length - 1];
  return DB.projects.filter(p => p.dueDate && p.dueDate >= start && p.dueDate <= end && !["Done", "Cancelled"].includes(projStatus(p)));
}

function addManualAssignment(weekId, day, subteam, person, task, hours) {
  const w = weekById(weekId); if (!w) return;
  const entry = { id: "A" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), day, subteam, person, task, hours: hours || "", createdBy: myEmail(), ts: new Date().toISOString() };
  w.assignments = (w.assignments || []).concat([entry]); // optimistic
  fb.appendTo("schedule", weekId, "assignments", entry).catch(() => save("schedule", w, "assignments"));
  render();
}
// Removing (unlike adding) can't use arrayUnion, so this goes through the
// same transaction-safe re-apply-the-delta pattern as stackEdit()'s ply
// removal — a full-array overwrite here could race a concurrent add.
function removeManualAssignment(weekId, assignmentId) {
  const w = weekById(weekId); if (!w) return;
  w.assignments = (w.assignments || []).filter(a => a.id !== assignmentId); // optimistic
  saveField("schedule", w, "assignments", arr => (arr || []).filter(a => a.id !== assignmentId));
  render();
}

function openAssignModal(weekId, day, subteam) {
  pickerInit("wpPerson", assigneeItems(), []);
  openModal(`
    <h2>Assign — ${esc(day)} · ${esc(subteam)}</h2>
    <div class="field"><label>Person</label>${pickerField("wpPerson")}</div>
    <div class="field"><label>Task</label><input id="wp-task" placeholder="What are they doing?"></div>
    <div class="field"><label>Hours (optional)</label><input id="wp-hours" type="number" min="0" step="0.5"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitAssignment('${weekId}','${day}','${subteam}')">Assign</button></div>
  `);
}
function submitAssignment(weekId, day, subteam) {
  const people = pickerValues("wpPerson");
  const task = document.getElementById("wp-task").value.trim();
  const hours = document.getElementById("wp-hours").value;
  if (!people.length) { toast("Pick a person.", "error"); return; }
  if (!task) { toast("Say what they're doing.", "error"); return; }
  people.forEach(person => addManualAssignment(weekId, day, subteam, person, task, hours));
  closeModal();
}

// Tickets + manual assignments for one person, bounded to this week's date
// range — a distinct, week-scoped contract from assignmentsFor()/isMine()
// (people.js/dashboard.js), which are unbounded "what's open right now"
// views used elsewhere. Don't fold this into those; they have a different job.
function personWeekTasks(email, week) {
  const dates = weekDates(week.weekOf);
  if (!dates.length) return { tickets: [], manual: [] };
  const start = dates[0], end = dates[dates.length - 1];
  const tickets = DB.projects.filter(p => p.dueDate && p.dueDate >= start && p.dueDate <= end
    && !["Done", "Cancelled"].includes(projStatus(p)) && (p.assignees || []).includes(email));
  const manual = (week.assignments || []).filter(a => a.person === email);
  return { tickets, manual };
}

function renderWeekPlan() {
  const weeks = weekPlanWeeks();
  if (!weeks.length) {
    return `<div class="card">No dated weeks yet. Add one from <button onclick="setTab('timeline')">Timeline</button> first — Weekly Plan is a second view over the same schedule.</div>`;
  }
  const weekId = (view.wpWeek && weekById(view.wpWeek) && weekById(view.wpWeek).weekOf) ? view.wpWeek : weeks[weeks.length - 1].id;
  const week = weekById(weekId);
  const dates = weekDates(week.weekOf);
  const weekTickets = ticketsForWeek(dates);
  const unscheduled = DB.projects.filter(p => !p.dueDate && !["Done", "Cancelled"].includes(projStatus(p)));
  const noSubteam = weekTickets.filter(p => !p.subteam);

  const rows = dates.map((date, i) => {
    const day = DOW_SHORT[i];
    const cols = SUBTEAMS.map(sub => {
      const dayTickets = weekTickets.filter(p => p.dueDate === date && p.subteam === sub);
      const manual = (week.assignments || []).filter(a => a.day === day && a.subteam === sub);
      return `<td>
        ${dayTickets.map(p => `<div class="wp-item">${chip("projects", p.id, p.title || p.id)}</div>`).join("")}
        ${manual.map(a => `<div class="wp-item">${esc(userName(a.person))} — ${esc(a.task)}${a.hours ? ` (${esc(String(a.hours))}h)` : ""} <button class="ib no-print" title="Remove" onclick="removeManualAssignment('${week.id}','${a.id}')">${icon("trash", 12)}</button></div>`).join("")}
        <button class="sm no-print" onclick="openAssignModal('${week.id}','${day}','${sub}')">+ Assign</button>
      </td>`;
    }).join("");
    return `<tr><td class="wk">${esc(day)}<div class="muted tny">${esc(date)}</div></td>${cols}</tr>`;
  }).join("");

  const rollupRows = usersSorted().map(u => {
    const { tickets, manual } = personWeekTasks(u.email, week);
    if (!tickets.length && !manual.length) return "";
    return `<tr><td>${avatar(u.email, 20)} ${esc(u.name || u.email)}</td><td>
      ${tickets.map(p => chip("projects", p.id, p.title || p.id)).join(" ")}
      ${manual.map(a => `<span class="chip">${esc(a.task)}${a.hours ? ` (${esc(String(a.hours))}h)` : ""}</span>`).join(" ")}
    </td></tr>`;
  }).join("");

  return `
  <div class="toolbar no-print">
    <select onchange="view.wpWeek=this.value;render()">
      ${weeks.map(w => `<option value="${w.id}" ${w.id === week.id ? "selected" : ""}>${esc(w.weekOf)} (${esc(w.id)})</option>`).join("")}
    </select>
  </div>
  <div class="card">
    <h3>Week of ${esc(week.weekOf)}</h3>
    <div class="tlwrap"><table class="wp">
      <thead><tr><th>Day</th>${SUBTEAMS.map(s => `<th>${esc(s)}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${noSubteam.length ? `<h3>No subteam set</h3><div class="stagerow">${noSubteam.map(p => chip("projects", p.id, p.title || p.id)).join(" ")}</div>` : ""}
    ${unscheduled.length ? `<h3>Unscheduled <span class="muted" style="text-transform:none">(no due date)</span></h3><div class="stagerow">${unscheduled.map(p => chip("projects", p.id, p.title || p.id)).join(" ")}</div>` : ""}
  </div>
  <div class="card">
    <h3>Per-person this week</h3>
    <table class="list dash"><tr><th>Person</th><th>Tasks</th></tr>${rollupRows || `<tr><td colspan="2" class="muted">Nobody has anything scheduled this week yet.</td></tr>`}</table>
  </div>`;
}
