"use strict";
/* timeline.js — the Timeline tab.
   The SN5 "Timeline" sheet reborn: a station × week production schedule. Each
   week is one row; each manufacturing station is a column you assign a part to.
   One Firestore doc per week, and each station is its own field, so two people
   scheduling different stations in the same week don't clobber each other.
   Read-only cells light-link to the part in the Parts tab. */

// field key -> column label. The 7 part-schedulable stations, then two free-text columns.
const STATIONS = [
  ["mold1", "Mold 1"], ["mold2", "Mold 2"],
  ["infusion1", "Infusion 1"], ["infusion2", "Infusion 2"],
  ["wetlay1", "Wet Layup 1"], ["wetlay2", "Wet Layup 2"],
  ["waterjet", "Waterjet"],
];

function schedById(id) { return DB.schedule.find(w => w.id === id); }
function saveWeek(w, field) { w = w || schedById(view.id); if (w) save("schedule", w, field); }

function newWeek() {
  let max = 0;
  DB.schedule.forEach(w => { const m = String(w.id).match(/^W(\d+)$/); if (m) max = Math.max(max, +m[1]); });
  const id = "W" + String(max + 1).padStart(2, "0");
  const w = { id, weekOf: "", other: "", notes: "", retro: false };
  STATIONS.forEach(([k]) => (w[k] = ""));
  DB.schedule.push(w); saveWeek(w);
  render();
}
function delWeek(id) {
  confirmModal("Delete this week from the schedule for everyone?", () => {
    del("schedule", id);
    DB.schedule = DB.schedule.filter(w => w.id !== id);
    render();
  });
}

// A cell value is a part id when it matches a known part; otherwise it's free
// text (e.g. an imported SN5 part name we couldn't map). Render accordingly.
function cellView(val) {
  if (!val) return "";
  const p = recById("parts", val);
  return p ? chip("parts", p.id, p.partName || p.id) : esc(val);
}
function cellSelect(w, key) {
  const val = w[key] || "";
  const parts = DB.parts.slice().sort((a, b) => (a.partName || a.id).localeCompare(b.partName || b.id));
  const known = !val || recById("parts", val);
  return `<select onchange="assignStation('${w.id}','${key}',this.value)">
    <option value="">—</option>
    ${!known ? `<option value="${esc(val)}" selected>${esc(val)} (text)</option>` : ""}
    ${parts.map(p => `<option value="${esc(p.id)}" ${val === p.id ? "selected" : ""}>${esc(p.partName || p.id)}</option>`).join("")}
  </select>`;
}

function renderTimeline() {
  const E = view.edit;
  const weeks = DB.schedule.slice().sort((a, b) =>
    (a.weekOf || "9999").localeCompare(b.weekOf || "9999") || a.id.localeCompare(b.id));
  const cols = STATIONS.map(([, label]) => `<th>${label}</th>`).join("");
  return `
  <div class="toolbar no-print">
    <button class="primary" onclick="view.edit=!view.edit;render()">${E ? "Done editing" : "Edit schedule"}</button>
    ${E ? `<button onclick="newWeek()">+ Add week</button>` : ""}
    <span class="muted" style="align-self:center">${weeks.length} weeks · assign parts to stations per week</span>
  </div>
  ${weeks.some(w => w.retro && !w.weekOf) ? `<p class="muted" style="margin:0 0 8px">Undated SN5 retro weeks (W00, W01…) sort to the bottom, below any dated SN6 week — that's expected; give a week a date to place it in order.</p>` : ""}
  ${weeks.length === 0 ? `<div class="card">No weeks scheduled yet. <b>Edit schedule</b> → <b>Add week</b>${isLead() ? ", or <b>Load SN5 archive</b> for last season's plan" : ""}.</div>` : `
  <div class="tlwrap"><table class="tl">
    <thead><tr><th>Week of</th>${cols}<th>Other</th><th>Notes</th>${E ? "<th></th>" : ""}</tr></thead>
    <tbody>
      ${weeks.map(w => `<tr ${w.retro ? 'class="retrorow"' : ""}>
        <td class="wk">${E ? `<input type="date" value="${esc(w.weekOf)}" onchange="updWeek('${w.id}','weekOf',this.value)">` : esc(w.weekOf || w.id)}</td>
        ${STATIONS.map(([k]) => `<td>${E ? cellSelect(w, k) : cellView(w[k])}</td>`).join("")}
        <td>${E ? `<input value="${esc(w.other)}" onchange="updWeek('${w.id}','other',this.value)">` : esc(w.other || "")}</td>
        <td>${E ? `<input value="${esc(w.notes)}" onchange="updWeek('${w.id}','notes',this.value)">` : `<b>${esc(w.notes || "")}</b>`}</td>
        ${E ? `<td>${isLead() ? `<button class="danger" onclick="delWeek('${w.id}')">✕</button>` : ""}</td>` : ""}
      </tr>`).join("")}
    </tbody>
  </table></div>`}`;
}

function assignStation(weekId, station, partId) { const w = schedById(weekId); w[station] = partId; saveWeek(w, station); render(); }
function updWeek(weekId, key, val) { const w = schedById(weekId); w[key] = val; saveWeek(w, key); }
