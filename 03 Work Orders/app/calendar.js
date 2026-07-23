"use strict";
/* calendar.js — the Calendar tab.
   A month grid overlaying every deadline (parts, projects, work orders) plus
   production-timeline milestones, so the season's crunch is visible at a glance.
   Read-only; click an item to jump to it. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function calItems() {
  const items = [];
  DB.parts.forEach(p => { if (p.layupDeadline) items.push({ date: p.layupDeadline, tab: "parts", id: p.id, label: p.partName || p.id, kind: "Part" }); });
  DB.projects.forEach(p => { if (p.dueDate) items.push({ date: p.dueDate, tab: "projects", id: p.id, label: p.title || p.id, kind: "Project" }); });
  DB.workOrders.forEach(w => { if (w.dueDate) items.push({ date: w.dueDate, tab: "workorders", id: w.id, label: w.partName || w.id, kind: "WO" }); });
  DB.schedule.forEach(w => { if (w.weekOf && w.notes) items.push({ date: w.weekOf, tab: "timeline", id: w.id, label: w.notes, kind: "Milestone" }); });
  return items;
}
function curMonth() { return view.calMonth || today().slice(0, 7); } // YYYY-MM
function shiftMonth(delta) {
  const [y, m] = curMonth().split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  view.calMonth = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  render();
}

function renderCalendar() {
  const ym = curMonth();
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDay = {};
  calItems().forEach(it => { if (it.date.slice(0, 7) === ym) (byDay[it.date] = byDay[it.date] || []).push(it); });

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const kindClass = { Part: "st-mid", Project: "InWork", WO: "Draft", Milestone: "retro" };
  const td = today();
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="shiftMonth(-1)">${icon("chevronLeft", 16)} Prev</button>
    <b style="align-self:center;min-width:150px;text-align:center">${MONTHS[m - 1]} ${y}</b>
    <button class="ib" onclick="shiftMonth(1)">Next ${icon("chevronRight", 16)}</button>
    <button onclick="view.calMonth='${today().slice(0, 7)}';render()">Today</button>
    <span class="muted" style="align-self:center;margin-left:auto">${Object.values(byDay).reduce((s, a) => s + a.length, 0)} deadlines this month</span>
  </div>
  <table class="cal">
    <thead><tr>${DOW.map(d => `<th>${d}</th>`).join("")}</tr></thead>
    <tbody>
      ${Array.from({ length: cells.length / 7 }, (_, w) => `<tr>${cells.slice(w * 7, w * 7 + 7).map(d => {
        if (!d) return `<td class="empty"></td>`;
        const iso = `${ym}-${String(d).padStart(2, "0")}`;
        const items = byDay[iso] || [];
        return `<td class="${iso === td ? "istoday" : ""}" onclick="calDay('${iso}')">
          <div class="daynum">${d}</div>
          ${items.map(it => `<div class="calitem ${kindClass[it.kind] || ""}" title="${esc(it.kind)}: ${esc(it.label)}" onclick="${it.tab === "timeline" ? "setTab('timeline')" : `openRecord('${it.tab}','${esc(it.id)}')`}">${esc(it.label)}</div>`).join("")}
        </td>`;
      }).join("")}</tr>`).join("")}
    </tbody>
  </table>`;
}

// On phones the calendar shows events as dots and the day cell is tappable; this
// lists that day's items so each is reachable. On desktop the per-item links do
// the navigating, so a cell tap is a no-op (items handle their own clicks).
function calDay(iso) {
  if (window.innerWidth > 640) return;
  const items = calItems().filter(it => it.date === iso)
    .sort((a, b) => a.kind.localeCompare(b.kind));
  openModal(`
    <h2 style="font-size:16px">${esc(iso)}</h2>
    ${items.length ? items.map(it => `<div class="gsr" onclick="closeModal();${it.tab === "timeline" ? "setTab('timeline')" : `openRecord('${it.tab}','${esc(it.id)}')`}">
      <span><span class="kind">${esc(it.kind)}</span>${esc(it.label)}</span></div>`).join("")
      : `<p class="muted" style="padding:6px 2px">Nothing due this day.</p>`}`);
}
