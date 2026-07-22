"use strict";
/* dashboard.js — the Dashboard (home) tab.
   Read-only. Pulls deadlines and assignments out of the other tabs so the
   first thing you see is "what's due and what's on me", not an empty list you
   have to go dig through six tabs to assemble. Everything is a light-link. */

// Normalize every deadline-bearing record into one shape the dashboard sorts.
function deadlineItems() {
  const items = [];
  DB.parts.forEach(p => items.push({
    coll: "parts", id: p.id, kind: "Part", label: p.partName || p.id,
    who: [p.moldEngineer, p.manufacturingEngineer].filter(Boolean).join(" / "),
    date: p.layupDeadline, done: partDone(p),
    mine: isMine([p.moldEngineer, p.manufacturingEngineer]),
  }));
  DB.projects.forEach(p => items.push({
    coll: "projects", id: p.id, kind: "Project", label: p.title || p.id,
    who: (p.assignees || []).join(" / "),
    date: p.dueDate, done: p.status === "Done",
    mine: isMine(p.assignees || []),
  }));
  DB.workOrders.forEach(w => items.push({
    coll: "workOrders", id: w.id, kind: "WO", label: w.partName || w.id,
    who: [w.moldEngineer, w.manufacturingEngineer].filter(Boolean).join(" / "),
    date: w.dueDate, done: w.status === "Complete",
    mine: isMine([w.moldEngineer, w.manufacturingEngineer]),
  }));
  return items;
}

function itemRow(it) {
  const dd = daysUntil(it.date);
  const when = it.date ? esc(it.date) + (dd != null ? ` <span class="muted">(${dd < 0 ? Math.abs(dd) + "d late" : dd === 0 ? "today" : dd + "d)"}${dd >= 0 ? ")" : ""}</span>` : "") : '<span class="muted">no date</span>';
  return `<tr>
    <td><span class="kind">${it.kind}</span> ${chip(it.coll, it.id, it.label)}</td>
    <td class="tny">${esc(it.who || "—")}</td>
    <td class="${dd != null && dd < 0 ? "warn" : ""}">${when}</td>
  </tr>`;
}
function itemTable(list, emptyMsg) {
  if (!list.length) return `<p class="muted">${emptyMsg}</p>`;
  return `<table class="list dash"><tr><th>Item</th><th>Who</th><th>Deadline</th></tr>${list.map(itemRow).join("")}</table>`;
}

function renderDashboard() {
  const items = deadlineItems();
  const withDate = items.filter(i => !i.done && i.date);
  const mine = items.filter(i => i.mine && !i.done)
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const upcoming = withDate.filter(i => { const d = daysUntil(i.date); return d != null && d >= 0 && d <= 14; })
    .sort((a, b) => a.date.localeCompare(b.date));
  const behind = withDate.filter(i => { const d = daysUntil(i.date); return d != null && d < 0; })
    .sort((a, b) => a.date.localeCompare(b.date));

  const spend = DB.budget.reduce((s, b) => s + num(b.cost), 0);
  const openOrders = DB.budget.filter(b => b.status !== "Reimbursed");
  const openSum = openOrders.reduce((s, b) => s + num(b.cost), 0);
  const counts = [
    ["Parts", DB.parts.length, "parts"], ["Work orders", DB.workOrders.length, "workorders"],
    ["Projects", DB.projects.length, "projects"], ["Purchases", DB.budget.length, "budget"],
  ];

  // Projects you watch that changed since you last opened them.
  const watched = (DB.projects || []).filter(p => typeof projUnread === "function" && projUnread(p))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  return `
  ${watched.length ? `<div class="card" style="border-left:3px solid var(--gold)">
    <h3>Watched — new activity <span class="warn">(${watched.length})</span></h3>
    <table class="list dash"><tr><th>Project</th><th>Status</th><th>Last activity</th></tr>
      ${watched.map(p => `<tr><td>${chip("projects", p.id, p.title || p.id)}</td>
        <td><span class="pill ${projStatusClass(p.status)}">${esc(p.status)}</span></td>
        <td class="tny">${fmtWhen(p.updatedAt)} by ${esc(p.updatedBy || "?")}</td></tr>`).join("")}
    </table>
  </div>` : ""}
  <div class="dashgrid">
    <div class="card">
      <h3>Your open items${mine.length ? ` <span class="muted">(${mine.length})</span>` : ""}</h3>
      ${itemTable(mine, "Nothing assigned to you right now. Nice.")}
    </div>
    <div class="card">
      <h3>Behind schedule${behind.length ? ` <span class="warn">(${behind.length})</span>` : ""}</h3>
      ${itemTable(behind, "Nothing past its deadline. Keep it that way.")}
    </div>
  </div>
  <div class="card">
    <h3>Upcoming team deadlines <span class="muted">(next 14 days)</span></h3>
    ${itemTable(upcoming, "Nothing due in the next two weeks.")}
  </div>
  <div class="dashgrid">
    <div class="card">
      <h3>Budget</h3>
      <div class="bignum">$${spend.toFixed(0)}<span class="muted"> season spend</span></div>
      <p class="muted">${openOrders.length} open purchase${openOrders.length === 1 ? "" : "s"} · $${openSum.toFixed(0)} not yet reimbursed</p>
      <button onclick="setTab('budget')">Open Budget →</button>
    </div>
    <div class="card">
      <h3>At a glance</h3>
      <div class="glance">
        ${counts.map(([label, n, tab]) => `<div class="gitem" onclick="setTab('${tab}')"><div class="gn">${n}</div><div class="gl">${label}</div></div>`).join("")}
      </div>
    </div>
  </div>`;
}
