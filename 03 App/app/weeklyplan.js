"use strict";
/* weeklyplan.js — the Weekly Plan tab.
   Two sections, deliberately unrelated to each other:

   1. Weekly Goals — one row per person, not per subteam. Subteam describes
      what a *part* is for, not who's building it (composites builds every
      part regardless of subteam), so it has no place organizing who's doing
      what this week. Each person gets a checklist: tickets due this week
      (auto-pulled from DB.projects, exactly like before) plus goals typed in
      at the Monday meeting (freeform, with an optional link to a ticket).
      Checking off a ticket-linked row is LOCAL to this week's plan — it does
      not touch the ticket's real status in the Tickets tab.

   2. Car Groups — literal carpools, not work teams. A driver sets up one car
      for a specific day/time with a fixed seat count, then adds people until
      it's full. Ad-hoc every week; nothing carries over.

   Both live on the same `schedule/{weekId}` doc Timeline already owns, in
   their own fields (goals, doneTickets, cars) — deliberately doesn't touch
   Timeline's station grid or its fields. */

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
// True when `iso` falls inside this week's Mon–Sun span.
function weekContains(w, iso) {
  const dates = weekDates(w.weekOf);
  return !!dates.length && iso >= dates[0] && iso <= dates[dates.length - 1];
}
// Which week to show when you land on the tab. This used to be
// `weeks[weeks.length - 1]` — the LAST week on the schedule — so on 2026-07-30
// it opened the week of 08-03 and you were always looking at a future week.
// Now: the week containing today, else the next one starting after today, else
// the most recent past week.
function defaultWeekId(weeks) {
  if (!weeks.length) return null;
  const t = today();
  const cur = weeks.find(w => weekContains(w, t));
  if (cur) return cur.id;
  const next = weeks.find(w => w.weekOf > t);
  return (next || weeks[weeks.length - 1]).id;
}

/* ============================= Section 1: Weekly Goals ============================= */

// Tickets due within a week's date range, assigned to this person, still open.
function personTicketsThisWeek(email, week) {
  const dates = weekDates(week.weekOf);
  if (!dates.length) return [];
  const start = dates[0], end = dates[dates.length - 1];
  return DB.projects.filter(p => p.dueDate && p.dueDate >= start && p.dueDate <= end
    && !["Done", "Cancelled"].includes(projStatus(p)) && (p.assignees || []).includes(email));
}
function isTicketDoneThisWeek(week, email, ticketId) {
  return (week.doneTickets || []).some(d => d.person === email && d.ticketId === ticketId);
}
// Local-only completion tracking for an auto ticket row — never writes to the
// ticket itself. Add is a plain append (arrayUnion-safe); remove needs the
// same transaction-safe filtered-rewrite pattern as everything else here,
// since a raw overwrite could race a concurrent add from someone else.
function toggleTicketDoneThisWeek(weekId, email, ticketId, done) {
  const w = weekById(weekId); if (!w) return;
  if (done) {
    const entry = { person: email, ticketId };
    w.doneTickets = (w.doneTickets || []).concat([entry]); // optimistic
    fb.appendTo("schedule", weekId, "doneTickets", entry).catch(() => save("schedule", w, "doneTickets"));
  } else {
    w.doneTickets = (w.doneTickets || []).filter(d => !(d.person === email && d.ticketId === ticketId)); // optimistic
    saveField("schedule", w, "doneTickets", arr => (arr || []).filter(d => !(d.person === email && d.ticketId === ticketId)));
  }
  render();
}

function openAddGoalModal(weekId, email) {
  const tickets = DB.projects.filter(p => !["Done", "Cancelled"].includes(projStatus(p)))
    .slice().sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id));
  openModal(`
    <h2>Add goal — ${esc(userName(email))}</h2>
    <div class="field"><label>Task</label><input id="wg-text" autofocus placeholder="What's the goal?"></div>
    <div class="field"><label>Due date</label><input id="wg-due" type="date"></div>
    <div class="field"><label>Linked ticket (optional)</label>
      <select id="wg-ticket"><option value="">— none —</option>
        ${tickets.map(t => `<option value="${esc(t.id)}">${esc(t.title || t.id)}</option>`).join("")}
      </select>
    </div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitGoal('${weekId}','${esc(email)}')">Add goal</button></div>
  `);
}
function submitGoal(weekId, email) {
  const text = document.getElementById("wg-text").value.trim();
  const dueDate = document.getElementById("wg-due").value;
  const ticketId = document.getElementById("wg-ticket").value;
  if (!text) { toast("Say what the goal is.", "error"); return; }
  const w = weekById(weekId); if (!w) return;
  const entry = { id: "G" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), person: email, text, dueDate, ticketId: ticketId || "", done: false, createdBy: myEmail(), ts: new Date().toISOString() };
  w.goals = (w.goals || []).concat([entry]); // optimistic
  fb.appendTo("schedule", weekId, "goals", entry).catch(() => save("schedule", w, "goals"));
  closeModal();
  render();
}
function toggleGoalDone(weekId, goalId, done) {
  const w = weekById(weekId); if (!w) return;
  w.goals = (w.goals || []).map(g => g.id === goalId ? { ...g, done } : g); // optimistic
  saveField("schedule", w, "goals", arr => (arr || []).map(g => g.id === goalId ? { ...g, done } : g));
  render();
}
function removeGoal(weekId, goalId) {
  const w = weekById(weekId); if (!w) return;
  w.goals = (w.goals || []).filter(g => g.id !== goalId); // optimistic
  saveField("schedule", w, "goals", arr => (arr || []).filter(g => g.id !== goalId));
  render();
}

function dueDatePill(dueDate) {
  if (!dueDate) return "";
  const d = daysUntil(dueDate);
  const cls = d != null && d < 0 ? "late" : d != null && d <= 2 ? "soon" : "";
  const label = d != null && d < 0 ? Math.abs(d) + "d late" : "due " + dueDate;
  return `<span class="due-pill ${cls}">${esc(label)}</span>`;
}

// One person's goal checklist: auto ticket rows first, then their manual goals.
function personGoalsHtml(u, week) {
  const tickets = personTicketsThisWeek(u.email, week);
  const goals = (week.goals || []).filter(g => g.person === u.email);
  if (!tickets.length && !goals.length) {
    return `<div class="muted tny" style="margin-left:30px">Nothing yet this week.</div>
      <button class="btn sm no-print" style="margin-left:30px;margin-top:6px" onclick="openAddGoalModal('${week.id}','${esc(u.email)}')">+ Add goal</button>`;
  }
  const ticketRows = tickets.map(t => {
    const done = isTicketDoneThisWeek(week, u.email, t.id);
    return `<div class="task-row ${done ? "done" : ""}">
      <input type="checkbox" ${done ? "checked" : ""} onchange="toggleTicketDoneThisWeek('${week.id}','${esc(u.email)}','${esc(t.id)}',this.checked)">
      ${chip("projects", t.id, t.title || t.id)}
      ${dueDatePill(t.dueDate)}
    </div>`;
  }).join("");
  const goalRows = goals.map(g => `<div class="task-row ${g.done ? "done" : ""}">
    <input type="checkbox" ${g.done ? "checked" : ""} onchange="toggleGoalDone('${week.id}','${g.id}',this.checked)">
    <span class="tsk-text">${esc(g.text)}</span>
    ${g.ticketId && recById("projects", g.ticketId) ? `<span class="chip tny">linked: ${chip("projects", g.ticketId, g.ticketId)}</span>` : ""}
    ${dueDatePill(g.dueDate)}
    <button class="ib no-print" title="Remove" onclick="removeGoal('${week.id}','${g.id}')">${icon("trash", 12)}</button>
  </div>`).join("");
  return `<div style="margin-left:30px;display:flex;flex-direction:column;gap:6px">
    ${ticketRows}${goalRows}
    <button class="btn sm no-print" style="align-self:flex-start;margin-top:2px" onclick="openAddGoalModal('${week.id}','${esc(u.email)}')">+ Add goal</button>
  </div>`;
}

/* ============================= Section 2: Car Groups ============================= */

function openNewCarModal(weekId) {
  const users = usersSorted();
  openModal(`
    <h2>New car</h2>
    <div class="field"><label>Driver</label><select id="wc-driver">${users.map(u => `<option value="${esc(u.email)}">${esc(u.name || u.email)}</option>`).join("")}</select></div>
    <div class="field"><label>Day</label><select id="wc-day">${DOW_SHORT.map(d => `<option>${d}</option>`).join("")}</select></div>
    <div class="field"><label>Departure time</label><input id="wc-time" autofocus placeholder="e.g. 9:00 AM"></div>
    <div class="field"><label>Seats</label><input id="wc-cap" type="number" min="1" step="1" value="4"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitCar('${weekId}')">Create car</button></div>
  `);
}
function submitCar(weekId) {
  const driver = document.getElementById("wc-driver").value;
  const day = document.getElementById("wc-day").value;
  const time = document.getElementById("wc-time").value.trim();
  const capacity = Math.max(1, parseInt(document.getElementById("wc-cap").value, 10) || 1);
  if (!time) { toast("Set a departure time.", "error"); return; }
  const w = weekById(weekId); if (!w) return;
  const car = { id: "C" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), driver, day, time, capacity, passengers: [], createdBy: myEmail(), ts: new Date().toISOString() };
  w.cars = (w.cars || []).concat([car]); // optimistic
  fb.appendTo("schedule", weekId, "cars", car).catch(() => save("schedule", w, "cars"));
  closeModal();
  render();
}
function delCar(weekId, carId) {
  const w = weekById(weekId); if (!w) return;
  w.cars = (w.cars || []).filter(c => c.id !== carId); // optimistic
  saveField("schedule", w, "cars", arr => (arr || []).filter(c => c.id !== carId));
  render();
}
function openAddPassengerModal(weekId, carId) {
  const w = weekById(weekId); const car = w && (w.cars || []).find(c => c.id === carId); if (!car) return;
  const openSeats = car.capacity - car.passengers.length;
  if (openSeats <= 0) { toast("This car is full.", "error"); return; }
  const already = new Set([car.driver, ...car.passengers]);
  const candidates = usersSorted().filter(u => !already.has(u.email));
  if (!candidates.length) { toast("Everyone on the roster is already in this car.", "error"); return; }
  openModal(`
    <h2>Add passenger — ${openSeats} seat${openSeats === 1 ? "" : "s"} open</h2>
    <div class="field"><label>Person</label><select id="wc-passenger">${candidates.map(u => `<option value="${esc(u.email)}">${esc(u.name || u.email)}</option>`).join("")}</select></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitPassenger('${weekId}','${carId}')">Add</button></div>
  `);
}
function submitPassenger(weekId, carId) {
  const email = document.getElementById("wc-passenger").value;
  const w = weekById(weekId); const car = w && (w.cars || []).find(c => c.id === carId); if (!w || !car) return;
  if (car.passengers.length >= car.capacity) { toast("This car is full.", "error"); return; }
  if (car.driver === email || car.passengers.includes(email)) { toast("Already in this car.", "error"); return; }
  w.cars = w.cars.map(c => c.id === carId ? { ...c, passengers: [...c.passengers, email] } : c); // optimistic
  saveField("schedule", w, "cars", arr => (arr || []).map(c => c.id === carId && !c.passengers.includes(email) ? { ...c, passengers: [...c.passengers, email] } : c));
  closeModal();
  render();
}
function removePassenger(weekId, carId, email) {
  const w = weekById(weekId); if (!w) return;
  w.cars = (w.cars || []).map(c => c.id === carId ? { ...c, passengers: c.passengers.filter(p => p !== email) } : c); // optimistic
  saveField("schedule", w, "cars", arr => (arr || []).map(c => c.id === carId ? { ...c, passengers: c.passengers.filter(p => p !== email) } : c));
  render();
}

function carCardHtml(week, car) {
  const openSeats = car.capacity - car.passengers.length;
  const fillCls = openSeats <= 0 ? "pill-amber" : "pill-slate";
  return `<div class="carcard">
    <div class="carcard-hd">
      ${avatar(car.driver, 22)}
      <b>${esc(userName(car.driver))}'s car</b>
      <span class="chip">${esc(car.day)} · ${esc(car.time)}</span>
      <span class="pill ${fillCls}" style="margin-left:auto">${car.passengers.length} of ${car.capacity} spot${car.capacity === 1 ? "" : "s"} filled</span>
      <button class="ib no-print" title="Delete car" onclick="delCar('${week.id}','${car.id}')">${icon("trash", 12)}</button>
    </div>
    <div class="carcard-seats">
      ${car.passengers.map(p => `<span title="${esc(userName(p))}">${avatar(p, 26)}</span><button class="ib no-print" title="Remove" onclick="removePassenger('${week.id}','${car.id}','${esc(p)}')">${icon("x", 11)}</button>`).join("")}
      ${Array.from({ length: openSeats }).map(() => `<span class="seat-open">+</span>`).join("")}
      <button class="btn sm no-print" style="margin-left:auto" ${openSeats <= 0 ? "disabled" : ""} onclick="openAddPassengerModal('${week.id}','${car.id}')">+ Add passenger</button>
    </div>
  </div>`;
}

/* ============================= Render ============================= */

function renderWeekPlan() {
  const weeks = weekPlanWeeks();
  if (!weeks.length) {
    return `<div class="card">No dated weeks yet. Add one from <button onclick="setTab('timeline')">Timeline</button> first — Weekly Plan is a second view over the same schedule.</div>`;
  }
  const weekId = (view.wpWeek && weekById(view.wpWeek) && weekById(view.wpWeek).weekOf) ? view.wpWeek : defaultWeekId(weeks);
  const week = weekById(weekId);
  const cars = week.cars || [];

  // Ordered by what you actually came here for: you, then everyone with
  // something on this week, then the idle tail. Alphabetical order buried the
  // signed-in user behind however many teammates sort ahead of them, and gave a
  // full-height "Nothing yet this week." block to each of them.
  const hasWork = u => personTicketsThisWeek(u.email, week).length > 0
    || (week.goals || []).some(g => g.person === u.email);
  const all = usersSorted();
  const me = all.filter(u => u.email === myEmail());
  const rest = all.filter(u => u.email !== myEmail());
  const active = rest.filter(hasWork);
  const idle = rest.filter(u => !hasWork(u));
  const shown = me.concat(active);

  return `
  <div class="toolbar no-print">
    <select onchange="view.wpWeek=this.value;render()">
      ${weeks.map(w => `<option value="${w.id}" ${w.id === week.id ? "selected" : ""}>${esc(w.weekOf)} (${esc(w.id)})${weekContains(w, today()) ? " · this week" : ""}</option>`).join("")}
    </select>
  </div>
  <div class="card">
    <h3>Weekly Goals — week of ${esc(week.weekOf)}</h3>
    <div style="display:flex;flex-direction:column;gap:16px">
      ${shown.map((u, i) => `<div ${i > 0 ? 'style="border-top:1px solid var(--line);padding-top:14px"' : ""}>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">${avatar(u.email, 22)}<b>${esc(u.name || u.email)}</b>${u.email === myEmail() ? ' <span class="muted tny">(you)</span>' : ""}</div>
        ${personGoalsHtml(u, week)}
      </div>`).join("")}
      ${idle.length ? `<div ${shown.length ? 'style="border-top:1px solid var(--line);padding-top:14px"' : ""}>
        <div class="muted tny" style="margin-bottom:8px">Nothing yet this week</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          ${idle.map(u => `<button class="btn sm no-print" title="Add a goal for ${esc(u.name || u.email)}" onclick="openAddGoalModal('${week.id}','${esc(u.email)}')">${avatar(u.email, 18)} ${esc(u.name || u.email)} +</button>`).join("")}
        </div>
      </div>` : ""}
    </div>
  </div>
  <div class="card">
    <h3>Car Groups</h3>
    <div class="toolbar no-print"><button class="primary" onclick="openNewCarModal('${week.id}')">+ New car</button></div>
    ${cars.length ? `<div style="display:flex;flex-direction:column;gap:12px">${cars.map(c => carCardHtml(week, c)).join("")}</div>`
      : `<p class="muted">No cars set up for this week yet.</p>`}
  </div>`;
}
