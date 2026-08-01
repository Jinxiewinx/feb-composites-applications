"use strict";
/* projects.js — the Tickets tab (jira-style; Firestore collection stays "projects").
   Two kinds share this collection: "project" (R&D, can have sub-tickets) and
   "issue" (production nonconformance — required work-order link, a resolution
   method, and a documented root cause, all enforced before it can close).
   Board or list of tickets; create via a modal with real assignee/part
   pickers; each ticket has its own page with assignees, watchers, a files
   section (uploads), and a rich-text comment thread with image attachments.
   Comments/files append atomically (arrayUnion) so concurrent posts don't
   clobber. "Watched — new activity" is tracked per-browser in localStorage. */

// Old 4-value enum is migrated to the new 6-value one AT READ TIME ONLY — no
// backfill script, same technique as ticketKind()'s default below. A record
// gets the new enum for real the next time someone edits and saves it.
const PROJ_STATUS = ["To Do", "In Progress", "Collecting Data", "On Hold", "Done", "Cancelled"];
const STATUS_MIGRATE = { Backlog: "To Do", Active: "In Progress", Blocked: "On Hold" };
const STATUS_SLUG = { "To Do": "todo", "In Progress": "inprogress", "Collecting Data": "collecting", "On Hold": "onhold", "Done": "done", "Cancelled": "cancelled" };
const RESOLUTION_METHODS = ["UAI (Use As Is)", "Corrective Action", "Rework", "Scrap", "Other"];
const PRIORITY = ["Low", "Medium", "High"];
let PROJ_DRAG = null;
let NEW_TICKET_PARENT = null; // set by openNewSubTicket(), read+cleared by submitNewProject()

function projById(id) { return DB.projects.find(p => p.id === id); }
function saveProj(p, field) { p = p || projById(view.id); if (p) save("projects", p, field); }
// Read-time migration: old records keep their stored string until edited; every
// call site that displays or compares status should go through this, never p.status.
function projStatus(p) { return STATUS_MIGRATE[p.status] || p.status || "To Do"; }
function projStatusClass(status) { return STATUS_SLUG[status] || "todo"; }
function ticketKind(p) { return p.kind === "issue" ? "issue" : "project"; }
function isIssue(p) { return ticketKind(p) === "issue"; }
function subTickets(p) { return DB.projects.filter(t => t.parentId === p.id); }

/* The ticket a sub-ticket hangs off, or null. Returns the record rather than
   the id, because callers want its title: "part of TKT-014" is barely better
   than nothing when what you needed to know is that it belongs to the
   undertray.

   Everywhere inside this tab a sub-ticket is drawn nested under its parent, so
   the context is free. The flat lists elsewhere — the dashboard's deadline
   tables, the Weekly Plan rollup — had no such thing, and "Machine the plug"
   arrived on its own saying nothing about which mold.

   Tolerates a dangling parentId: a ticket whose parent was deleted still
   renders, it just loses the context line. */
function parentOf(p) {
  if (!p || !p.parentId) return null;
  const par = (DB.projects || []).find(x => x.id === p.parentId);
  return par ? { id: par.id, label: par.title || par.id } : null;
}
/* "part of <parent>", in the app's existing quiet register (.tny .muted, the
   same one the dashboard's who-column and the Parts index use). It answers
   "which one?" and must not compete with the thing actually being listed, so
   it is small, grey, and second.

   `inline` is for flex rows like .task-row, where a block would break the row
   onto its own line; block is the default because in a table cell it wants to
   sit under the title rather than trail off the end of it. */
function parentLine(parent, inline) {
  if (!parent) return "";
  const body = `part of ${chip("projects", parent.id, parent.label)}`;
  return inline
    ? `<span class="tny muted">${body}</span>`
    : `<div class="tny muted">${body}</div>`;
}
// The CS-003 enforcement point: an Issue can't be marked Done without a
// disposition and documented root cause. Cancelled needs neither — it's the
// escape hatch for "turned out not to be a real issue," not a disposition.
function statusGate(p, newStatus) {
  if (newStatus !== "Done" || !isIssue(p)) return null;
  if (!p.resolutionMethod) return "Select a resolution method before closing this issue.";
  if (!(p.whatHappened || "").trim()) return "Document what happened before closing this issue.";
  return null;
}

/* ---- Slack (app → Slack only, one-directional; no backend exists in this
   repo, so this app never accepts inbound Slack traffic) ----
   The webhook URL is fetched from a roster-gated Firestore config doc at
   runtime, never hardcoded — this repo is public source, and a webhook URL
   IS a live credential, unlike the Firebase apiKey (which is safe to publish
   because firestore.rules is the real gate; a raw webhook URL has no such
   second gate once it's out). Cached for the session once fetched. */
let SLACK_CFG_CACHE;
async function slackWebhookUrl() {
  if (SLACK_CFG_CACHE === undefined) {
    const cfg = await fb.getConfig("slack").catch(() => null);
    SLACK_CFG_CACHE = (cfg && cfg.webhookUrl) || "";
  }
  return SLACK_CFG_CACHE;
}
// A failed or unconfigured Slack push must never block the real ticket action
// it's reporting on — best-effort, always swallows its own errors.
async function postToSlack(text) {
  const url = await slackWebhookUrl();
  if (!url) return;
  try {
    // text/plain (not application/json) avoids the CORS preflight a browser-
    // origin POST would otherwise trigger against Slack's webhook endpoint.
    await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ text }) });
  } catch (e) { /* best-effort */ }
}
// Plain Slack mrkdwn text, NOT HTML — esc() (HTML-entity escaping) would leak
// literal "&amp;" etc. into the message, since Slack doesn't decode HTML.
function slackIssueCreatedMsg(p) {
  const who = (p.assignees || []).map(userName).join(", ") || "unassigned";
  return `🆕 New issue *${p.title || p.id}* on ${p.workOrderId || "?"} — ${who}. (${p.id})`;
}
function slackIssueResolvedMsg(p) {
  return `✅ Issue *${p.title || p.id}* resolved — ${p.resolutionMethod || "?"}, by ${signerName()}. (${p.id})`;
}
// Called after any status write that might have just closed an Issue, so all
// three status-change paths (quick dropdown, board drag, full edit form)
// report the same event exactly once, from one place.
function announceIfResolved(p, prevStatus) {
  if (isIssue(p) && projStatus(p) === "Done" && prevStatus !== "Done") postToSlack(slackIssueResolvedMsg(p));
}
// Legacy: earlier projects stored a plain updates[]; show them as comments.
function projComments(p) {
  const legacy = (p.updates || []).map(u => ({ author: u.author, email: u.email, ts: u.ts, html: esc(u.text || "") }));
  return legacy.concat(p.comments || []).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
function projActivity(p) { return p.updatedAt || ""; }

/* ---- per-browser "seen" tracking for watcher unread dots ---- */
function loadSeen() { try { return JSON.parse(localStorage.getItem("feb-proj-seen") || "{}"); } catch (e) { return {}; } }
function markSeen(id) { const s = loadSeen(); const p = projById(id); s[id] = (p && projActivity(p)) || new Date().toISOString(); try { localStorage.setItem("feb-proj-seen", JSON.stringify(s)); } catch (e) {} }
function projUnread(p) { const s = loadSeen(); return (p.watchers || []).includes(myEmail()) && projActivity(p) && projActivity(p) > (s[p.id] || ""); }
function unreadWatched() { return (DB.projects || []).filter(projUnread).length; }

/* ---- create (modal) ---- */
function assigneeItems() { return usersSorted().map(u => ({ value: u.email, label: u.name || u.email, sublabel: u.role, avatarEmail: u.email })); }
function partItems() { return DB.parts.slice().sort((a, b) => (a.partName || a.id).localeCompare(b.partName || b.id)).map(p => ({ value: p.id, label: p.partName || p.id, sublabel: p.id })); }
function ticketItems(excludeId) { return DB.projects.filter(t => t.id !== excludeId).sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id)).map(t => ({ value: t.id, label: t.title || t.id, sublabel: isIssue(t) ? "Issue" : "Project" })); }
function workOrderItems() { return DB.workOrders.slice().sort((a, b) => a.id.localeCompare(b.id)).map(w => ({ value: w.id, label: w.partName || w.id, sublabel: w.id })); }
function woSelectOptions(selected) {
  const sorted = DB.workOrders.slice().sort((a, b) => a.id.localeCompare(b.id));
  return `<option value="" ${selected ? "" : "selected"} disabled>— choose a work order —</option>` +
    sorted.map(w => `<option value="${esc(w.id)}" ${w.id === selected ? "selected" : ""}>${esc(w.id)} — ${esc(w.partName || "")}</option>`).join("");
}

// "ticket" is only the right word before a Kind is picked (or for a sub-ticket,
// which has no Kind at all) — once Kind is Project/Issue, the modal chrome
// should say that, not a generic umbrella word. Kept in one place so the
// initial render and ticketKindChanged() can never drift apart.
function kindNoun(kind) { return kind === "issue" ? "issue" : "project"; }
function openNewProject(parentId) {
  NEW_TICKET_PARENT = parentId || null;
  const forSub = !!NEW_TICKET_PARENT;
  pickerInit("pa", assigneeItems(), [myEmail()]);
  pickerInit("pp", partItems(), []);
  pickerInit("rt", ticketItems(), []);
  pickerInit("rwo", workOrderItems(), []);
  openModal(`
    <h2 id="np-heading">${forSub ? "New sub-ticket" : "New " + kindNoun("project")}</h2>
    ${forSub ? "" : `
    <div class="field"><label>Kind</label>
      <select id="np-kind" onchange="ticketKindChanged()">
        <option value="project">Project — R&amp;D, can have sub-tickets</option>
        <option value="issue">Issue — production nonconformance, links to a work order</option>
      </select>
    </div>`}
    <div class="field"><label>Title</label><input id="np-title" autofocus placeholder="What is this ${forSub ? "sub-task" : kindNoun("project") + "?"}"></div>
    <div class="row2">
      <div class="field"><label>Status</label><select id="np-status">${PROJ_STATUS.map(s => `<option>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Priority</label><select id="np-priority">${PRIORITY.map(s => `<option ${s === "Medium" ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>Due date</label><input id="np-due" type="date"></div>
    <div class="field"><label>Subteam <span class="muted nocaps">— for Weekly Plan</span></label>
      <select id="np-subteam"><option value="">Unassigned</option>${SUBTEAMS.map(s => `<option>${s}</option>`).join("")}</select></div>
    <div class="field"><label>Assignees</label>${pickerField("pa")}</div>
    <div id="np-issue-fields" style="display:none">
      <div class="field"><label>Work order <span class="req">*required</span></label><select id="np-wo">${woSelectOptions("")}</select></div>
      <div class="field"><label>What happened</label><textarea id="np-whathappened" placeholder="Root cause / what went wrong… (needed before this can close)"></textarea></div>
    </div>
    <!-- Cross-links and a written description are almost never filled in at the
         moment someone is logging a task, and four more fields pushed Create
         below the fold. Collapsed by default; all of it is editable on the
         ticket page afterwards. The fields still exist in the DOM, so
         submitNewProject() reads them exactly as before whether or not this was
         ever opened. -->
    <details class="moredetails">
      <summary>More details — links and description</summary>
      <div id="np-project-fields">
        <div class="field"><label>Related parts</label>${pickerField("pp")}</div>
      </div>
      <div class="field"><label>Related tickets</label>${pickerField("rt")}</div>
      <div class="field"><label>Related work orders</label>${pickerField("rwo")}</div>
      <div class="field"><label>Description</label>${rteField("np-desc-editor")}</div>
    </details>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button id="np-submit-btn" class="primary" onclick="submitNewProject()">Create ${forSub ? "sub-ticket" : kindNoun("project")}</button></div>
  `);
}
// The same rich-text toolbar the comment box uses, pointed at a description
// field — one more call site, not a new component. targetId lets rte() know
// which contenteditable div a toolbar click applies to.
// Shared by rteField() (ticket description) and the comment editor, so the
// two toolbars can't drift out of sync — a button added to one is added to
// both. Image attach is comment-only (see the comment section below) since
// that's the one thing the two editors don't have in common.
function rteToolbarButtons(targetId) {
  return `
    <button type="button" title="Bold" onclick="rte('bold',null,'${targetId}')"><b>B</b></button>
    <button type="button" title="Italic" onclick="rte('italic',null,'${targetId}')"><i>I</i></button>
    <button type="button" title="Underline" onclick="rte('underline',null,'${targetId}')"><u>U</u></button>
    <button type="button" title="Heading" onclick="rte('formatBlock','h3','${targetId}')">H</button>
    <button type="button" title="Bigger" onclick="rte('fontSize','5','${targetId}')">A+</button>
    <button type="button" title="Smaller" onclick="rte('fontSize','2','${targetId}')">A−</button>
    <button type="button" title="Bullet list" onclick="rte('insertUnorderedList',null,'${targetId}')">• List</button>
    <button type="button" title="Link" onclick="rteLink('${targetId}')">🔗</button>
    <button type="button" title="Code" onclick="rteCode('${targetId}')">&lt;/&gt;</button>
    <button type="button" title="Table" onclick="rteTable('${targetId}')">⊞</button>`;
}
function rteField(targetId, html) {
  return `<div class="rte-toolbar">${rteToolbarButtons(targetId)}</div>
  <div class="rte" id="${targetId}" contenteditable="true" data-ph="Details, goals, links…">${sanitizeHtml(html || "")}</div>`;
}
// Reject anything but a plain http(s) URL BEFORE execCommand ever runs —
// sanitizeHtml() stripping a bad scheme afterward isn't enough defense in
// depth for a link the editor already inserted and displayed as if it were fine.
function isSafeLinkUrl(url) { return /^https?:\/\//i.test(String(url || "").trim()); }
function rteLink(targetId) {
  const el = document.getElementById(targetId); if (el) el.focus();
  const url = prompt("Link URL (https://…)");
  if (url == null) return; // cancelled
  if (!isSafeLinkUrl(url)) { toast("Links must start with http:// or https://.", "error"); return; }
  document.execCommand("createLink", false, url.trim());
  // createLink doesn't let us set target/rel directly — the freshly-inserted
  // <a> is the current selection's anchor; force it to open safely.
  const sel = window.getSelection && window.getSelection();
  const a = sel && sel.anchorNode && sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest("a");
  if (a) { a.target = "_blank"; a.rel = "noopener"; }
}
// No native execCommand for inline code — wrap the current selection manually.
function rteCode(targetId) {
  const el = document.getElementById(targetId); if (el) el.focus();
  const sel = window.getSelection && window.getSelection();
  const text = (sel && sel.toString()) || "code";
  document.execCommand("insertHTML", false, `<code>${esc(text)}</code>`);
}
// Fixed 2x2 template only — no size prompt, keeps the sanitizer allowlist
// narrow and predictable rather than accepting arbitrary row/col growth.
function rteTable(targetId) {
  const el = document.getElementById(targetId); if (el) el.focus();
  document.execCommand("insertHTML", false, "<table><tr><td> </td><td> </td></tr><tr><td> </td><td> </td></tr></table>");
}
function openNewSubTicket(parentId) { openNewProject(parentId); }
function ticketKindChanged() {
  const kind = document.getElementById("np-kind").value;
  const isIss = kind === "issue";
  document.getElementById("np-issue-fields").style.display = isIss ? "" : "none";
  document.getElementById("np-project-fields").style.display = isIss ? "none" : "";
  const noun = kindNoun(kind);
  document.getElementById("np-heading").textContent = "New " + noun;
  document.getElementById("np-title").placeholder = "What is this " + noun + "?";
  document.getElementById("np-submit-btn").textContent = "Create " + noun;
}
async function submitNewProject() {
  const title = document.getElementById("np-title").value.trim();
  if (!title) { toast("Give the project a name.","error"); return; }
  const parentId = NEW_TICKET_PARENT;
  const kindEl = document.getElementById("np-kind");
  const kind = parentId ? "project" : (kindEl && kindEl.value === "issue" ? "issue" : "project");
  let workOrderId = "";
  if (kind === "issue") {
    const woEl = document.getElementById("np-wo");
    workOrderId = woEl ? woEl.value : "";
    if (!workOrderId) { toast("An issue needs a work order.", "error"); return; }
  }
  NEW_TICKET_PARENT = null;
  // Read the WHOLE form before the await. allocId()'s offline fallback opens a
  // confirm modal, and openModal() replaces this form's markup — so any field
  // still unread at that point comes back null and throws.
  const assignees = pickerValues("pa");    // honor the picker exactly (don't force creator back in)
  const whEl = document.getElementById("np-whathappened");
  const form = {
    status: document.getElementById("np-status").value,
    priority: document.getElementById("np-priority").value,
    dueDate: document.getElementById("np-due").value,
    subteam: document.getElementById("np-subteam").value,
    description: sanitizeHtml(document.getElementById("np-desc-editor").innerHTML || ""),
    relatedParts: kind === "issue" ? [] : pickerValues("pp"),
    relatedTickets: pickerValues("rt"),
    relatedWorkOrders: pickerValues("rwo"),
    whatHappened: whEl ? whEl.value : "",
  };
  const id = await allocId("projects");
  if (!id) return;
  const p = {
    id, title, kind,
    status: form.status,
    priority: form.priority,
    dueDate: form.dueDate,
    subteam: form.subteam,
    description: form.description,
    assignees,
    // assignees + creator watch by default (creator watches the ticket they made)
    watchers: [...new Set([myEmail(), ...assignees])].filter(Boolean),
    relatedParts: form.relatedParts,
    relatedTickets: form.relatedTickets,
    relatedWorkOrders: form.relatedWorkOrders,
    files: [], comments: [],
    createdBy: myEmail(), retro: false,
  };
  if (parentId) p.parentId = parentId;
  if (kind === "issue") {
    p.workOrderId = workOrderId;
    p.resolutionMethod = "";
    p.whatHappened = form.whatHappened;
  }
  DB.projects.push(p); saveProj(p);
  assignees.filter(e => e !== myEmail()).forEach(e =>
    fb.notify(e, "assigned", signerName() + " assigned you to “" + title + "”", { tab: "projects", id }).catch(() => {}));
  if (kind === "issue") postToSlack(slackIssueCreatedMsg(p));
  closeModal();
  markSeen(id);
  view = { ...view, tab: "projects", mode: "detail", id, edit: false }; render();
}
function delProject(id) {
  confirmModal("Delete " + id + " for everyone? Back up first if unsure.", () => {
    del("projects", id);
    DB.projects = DB.projects.filter(p => p.id !== id);
    view = { ...view, mode: "list", id: null }; render();
  });
}

/* ---- board / list ---- */
function renderProjects() {
  if (view.mode === "detail") return renderProjDetail();
  const boardMode = view.projView !== "list";
  const kf = view.tkFilter || "";
  return `
  <div class="toolbar no-print">
    <button class="primary" onclick="openNewProject()">+ New ticket</button>
    <div class="kindfilter">
      <span class="${kf ? "" : "on"}" onclick="view.tkFilter='';render()">All</span>
      <span class="${kf === "project" ? "on" : ""}" onclick="view.tkFilter='project';render()">Projects</span>
      <span class="${kf === "issue" ? "on" : ""}" onclick="view.tkFilter='issue';render()">Issues</span>
    </div>
    <button onclick="view.projView='${boardMode ? "list" : "board"}';render()">${boardMode ? "List view" : "Board view"}</button>
    <input id="searchbox" placeholder="search title / assignee…" value="${esc(view.q)}" oninput="searchInput(this)" style="margin-left:auto">
  </div>
  ${DB.projects.length === 0 ? `<div class="card">No tickets yet. <b>+ New ticket</b> to start one.</div>` : boardMode ? renderProjBoard() : renderProjTable()}`;
}
// Sub-tickets only appear nested under their parent, never as their own top-level row.
function topLevel(p) { return !p.parentId; }
function projMatch(p) {
  const q = (view.q || "").toLowerCase();
  const kf = view.tkFilter || "";
  if (kf && ticketKind(p) !== kf) return false;
  return !q || (p.title || "").toLowerCase().includes(q) || (p.assignees || []).some(e => userName(e).toLowerCase().includes(q) || e.toLowerCase().includes(q));
}

function renderProjBoard() {
  const cols = PROJ_STATUS.map(st => {
    const list = DB.projects.filter(p => topLevel(p) && projStatus(p) === st && projMatch(p))
      .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    return `<div class="col col-${STATUS_SLUG[st]}" ondragover="event.preventDefault();this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="projDrop('${st}',this)">
      <h4>${st}<span>${list.length}</span></h4>
      ${list.map(projCard).join("")}
    </div>`;
  }).join("");
  // .boardwrap scrolls sideways so all six statuses stay on one row at desktop
  // width instead of wrapping Done and Cancelled under To Do.
  return `<div class="boardwrap"><div class="board">${cols}</div></div>`;
}
function projCard(p) {
  const dd = daysUntil(p.dueDate), late = dd != null && dd < 0 && projStatus(p) !== "Done";
  const av = (p.assignees || []).slice(0, 4).map(e => avatar(e, 22)).join("");
  const nComments = projComments(p).length, nFiles = (p.files || []).length;
  return `<div class="pcard" draggable="true" ondragstart="projDragStart('${p.id}')" onclick="openRecord('projects','${p.id}')">
    <div class="t"><span class="kindbadge ${ticketKind(p)}">${isIssue(p) ? "Issue" : "Project"}</span> ${esc(p.title || p.id)}${projUnread(p) ? ' <span class="unread-dot" title="New activity"></span>' : ""}</div>
    <div class="meta">
      <span class="prio ${esc(p.priority)}">${esc(p.priority || "")}</span>
      ${p.dueDate ? `<span class="${late ? "warn" : ""}">${esc(p.dueDate)}${late ? " " + icon("warning", 13) : ""}</span>` : ""}
      <span class="right">${nComments ? `<span class="cnt">${icon("message", 14)}${nComments}</span>` : ""}${nFiles ? `<span class="cnt">${icon("paperclip", 14)}${nFiles}</span>` : ""}<span class="avatar-stack">${av}</span></span>
    </div>
  </div>`;
}
function projDragStart(id) { PROJ_DRAG = id; }
function projDrop(status, el) {
  el.classList.remove("dragover");
  const p = projById(PROJ_DRAG); PROJ_DRAG = null;
  if (!p || projStatus(p) === status) return;
  const blocked = statusGate(p, status);
  if (blocked) { toast(blocked, "error"); render(); return; }
  const prevStatus = projStatus(p);
  p.status = status; saveProj(p, "status"); announceIfResolved(p, prevStatus); render();
}
function renderProjTable() {
  const order = { "In Progress": 0, "On Hold": 1, "Collecting Data": 2, "To Do": 3, "Done": 4, "Cancelled": 5 };
  const rows = DB.projects.filter(p => topLevel(p) && projMatch(p))
    .sort((a, b) => (order[projStatus(a)] - order[projStatus(b)]) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  return `<table class="list">
    <tr><th>Ticket</th><th>Status</th><th>Priority</th><th>Assignees</th><th>Linked to</th><th>Activity</th></tr>
    ${rows.map(p => {
      const dd = daysUntil(p.dueDate), late = dd != null && dd < 0 && projStatus(p) !== "Done";
      const st = projStatus(p);
      const linked = isIssue(p) ? (p.workOrderId ? `<span class="chip">${esc(p.workOrderId)}</span>` : "—")
        : (subTickets(p).length ? `<span class="chip">${subTickets(p).length} sub-ticket${subTickets(p).length === 1 ? "" : "s"}</span>` : "—");
      return `<tr onclick="openRecord('projects','${p.id}')">
        <td><span class="kindbadge ${ticketKind(p)}">${isIssue(p) ? "Issue" : "Project"}</span> <b>${esc(p.title || p.id)}</b>${projUnread(p) ? " 🟡" : ""}</td>
        <td><span class="status ${projStatusClass(st)}"><span class="dot"></span>${esc(st)}</span></td>
        <td class="prio ${esc(p.priority)}">${esc(p.priority || "")}</td>
        <td><span class="avatar-stack">${(p.assignees || []).slice(0, 5).map(e => avatar(e, 22)).join("")}</span></td>
        <td class="tny">${linked}</td>
        <td class="${late ? "warn" : ""}">${p.dueDate ? esc(p.dueDate) + (late ? " " + icon("warning", 13) : "") : `<span class="cnt">${icon("message", 13)}${projComments(p).length}</span>`}</td>
      </tr>`;
    }).join("")}
  </table>`;
}

/* ---- ticket page ---- */
function editProject() {
  const p = projById(view.id);
  pickerInit("ea", assigneeItems(), p.assignees || []);
  pickerInit("ep", partItems(), p.relatedParts || []);
  pickerInit("ert", ticketItems(p.id), p.relatedTickets || []);
  pickerInit("erwo", workOrderItems(), p.relatedWorkOrders || []);
  view.edit = true; render();
}
function saveProjectEdits() {
  const p = projById(view.id);
  const newStatus = document.getElementById("ep-status").value;
  // Stage issue-only fields first so the gate check sees the values about to be
  // saved, not the stale ones already on p.
  if (isIssue(p)) {
    const woEl = document.getElementById("ep-wo");
    if (woEl && !woEl.value) { toast("An issue needs a work order.", "error"); return; }
    if (woEl) p.workOrderId = woEl.value;
    p.resolutionMethod = document.getElementById("ep-resolution").value;
    p.whatHappened = document.getElementById("ep-whathappened").value;
  }
  const blocked = statusGate(p, newStatus);
  if (blocked) { toast(blocked, "error"); return; }
  const prevStatus = projStatus(p);
  const wasAssigned = p.assignees || [];
  p.title = document.getElementById("ep-title").value.trim() || p.title;
  p.status = newStatus;
  p.priority = document.getElementById("ep-priority").value;
  p.dueDate = document.getElementById("ep-due").value;
  p.subteam = document.getElementById("ep-subteam").value;
  p.description = sanitizeHtml(document.getElementById("ep-desc-editor").innerHTML || "");
  p.assignees = pickerValues("ea");
  p.relatedTickets = pickerValues("ert");
  p.relatedWorkOrders = pickerValues("erwo");
  if (!isIssue(p)) p.relatedParts = pickerValues("ep");
  // Notify anyone newly assigned.
  p.assignees.filter(e => e !== myEmail() && !wasAssigned.includes(e)).forEach(e =>
    fb.notify(e, "assigned", signerName() + " assigned you to “" + (p.title || p.id) + "”", { tab: "projects", id: p.id }).catch(() => {}));
  // keep watchers ⊇ assignees (assigning someone opts them into updates)
  p.watchers = [...new Set([...(p.watchers || []), ...p.assignees])];
  // Field-scoped writes, NOT a whole-doc save — so a teammate's concurrent
  // comment/file/watcher change (which lands on other fields) can't be clobbered
  // by this edit landing between their write and our Save.
  const fields = ["title", "status", "priority", "dueDate", "subteam", "description", "assignees", "relatedTickets", "relatedWorkOrders", "watchers"];
  fields.push(isIssue(p) ? "workOrderId" : "relatedParts");
  if (isIssue(p)) fields.push("resolutionMethod", "whatHappened");
  fields.forEach(f => saveProj(p, f));
  announceIfResolved(p, prevStatus);
  view.edit = false; render();
}
function toggleWatch() {
  const p = projById(view.id);
  const me = myEmail();
  p.watchers = (p.watchers || []).includes(me) ? p.watchers.filter(e => e !== me) : [...(p.watchers || []), me];
  saveProj(p, "watchers"); render();
}
// Quick status change from the top-of-page dropdown — the same gate applies
// whether status changes here or via the full edit form or a board drag.
function setTicketStatus(id, val) {
  const p = projById(id);
  if (!p || projStatus(p) === val) return;
  const blocked = statusGate(p, val);
  if (blocked) { toast(blocked, "error"); render(); return; }
  const prevStatus = projStatus(p);
  p.status = val; saveProj(p, "status"); announceIfResolved(p, prevStatus); render();
}

function renderProjDetail() {
  const p = projById(view.id);
  if (!p) { view.mode = "list"; return renderProjTable(); }
  markSeen(p.id);
  const E = view.edit;
  const watching = (p.watchers || []).includes(myEmail());
  const kindLabel = isIssue(p) ? "Issue" : "Project";
  if (E) {
    return `
    <div class="toolbar no-print">
      <button class="ib" onclick="view={...view,mode:'list',edit:false};render()">${icon("chevronLeft",16)} All tickets</button>
      <span class="kindbadge ${ticketKind(p)}">${kindLabel}</span>
      <button class="primary" onclick="saveProjectEdits()">Save</button>
      <button onclick="view.edit=false;render()">Cancel</button>
      ${isLead() ? `<button class="danger" onclick="delProject('${p.id}')">Delete</button>` : ""}
    </div>
    <div class="card">
      <div class="field"><label>Title</label><input id="ep-title" value="${esc(p.title)}"></div>
      <div class="row2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Status</label><select id="ep-status">${PROJ_STATUS.map(s => `<option ${projStatus(p) === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label>Priority</label><select id="ep-priority">${PRIORITY.map(s => `<option ${p.priority === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Due date</label><input id="ep-due" type="date" value="${esc(p.dueDate || "")}"></div>
      <div class="field"><label>Subteam <span class="muted nocaps">— for Weekly Plan</span></label>
        <select id="ep-subteam"><option value="" ${p.subteam ? "" : "selected"}>Unassigned</option>${SUBTEAMS.map(s => `<option ${p.subteam === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Assignees</label>${pickerField("ea")}</div>
      ${isIssue(p) ? `
      <div class="field"><label>Work order <span class="req">*required</span></label><select id="ep-wo">${woSelectOptions(p.workOrderId)}</select></div>
      <div class="field"><label>What happened <span class="req">*required to close</span></label><textarea id="ep-whathappened">${esc(p.whatHappened || "")}</textarea></div>
      <div class="field"><label>Resolution method <span class="req">*required to close</span></label>
        <select id="ep-resolution"><option value="" ${p.resolutionMethod ? "" : "selected"}>— not yet disposed —</option>${RESOLUTION_METHODS.map(m => `<option ${p.resolutionMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
      ` : `<div class="field"><label>Related parts</label>${pickerField("ep")}</div>`}
      <div class="field"><label>Related tickets</label>${pickerField("ert")}</div>
      <div class="field"><label>Related work orders</label>${pickerField("erwo")}</div>
      <div class="field"><label>Description</label>${rteField("ep-desc-editor", p.description)}</div>
    </div>`;
  }
  const partChips = (p.relatedParts || []).map(id => chip("parts", id, (recById("parts", id) || {}).partName || id)).join(" ") || '<span class="muted">none</span>';
  const ticketChips = (p.relatedTickets || []).map(id => chip("projects", id, (recById("projects", id) || {}).title || id)).join(" ") || "";
  const woChips = (p.relatedWorkOrders || []).map(id => chip("workOrders", id, id)).join(" ") || "";
  const dd = daysUntil(p.dueDate);
  const st = projStatus(p);
  const gateMsg = isIssue(p) && st !== "Done" ? statusGate(p, "Done") : null;
  const kids = !isIssue(p) && !p.parentId ? subTickets(p) : [];
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="view={...view,mode:'list'};render()">${icon("chevronLeft",16)} All tickets</button>
    <span class="kindbadge ${ticketKind(p)}">${kindLabel}</span>
    <div class="statusdrop ${projStatusClass(st)}"><select onchange="setTicketStatus('${p.id}',this.value)">${PROJ_STATUS.map(s => `<option ${st === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    <button class="primary" onclick="editProject()">Edit</button>
    <button onclick="toggleWatch()">${watching ? "★ Watching" : "☆ Watch"}</button>
  </div>
  <div class="card">
    <h2>${esc(p.title || "(untitled ticket)")}</h2>
    <div class="muted">${esc(p.id)} · <span class="prio ${esc(p.priority)}">${esc(p.priority || "")} priority</span>${p.dueDate ? ` · due ${esc(p.dueDate)}${dd != null ? ` (${dd < 0 ? Math.abs(dd) + " days late" : dd + " days out"})` : ""}` : ""}</div>

    ${isIssue(p) ? `
    <h3>Work order <span class="muted nocaps">— required</span></h3>
    <div class="stagerow">${p.workOrderId ? chip("workOrders", p.workOrderId, p.workOrderId) : '<span class="warn">none set</span>'}</div>
    <h3>What happened <span class="muted nocaps">— required before this can close</span></h3>
    <div>${p.whatHappened ? esc(p.whatHappened).replace(/\n/g, "<br>") : '<span class="muted">—</span>'}</div>
    <h3>Resolution method</h3>
    <div>${p.resolutionMethod ? esc(p.resolutionMethod) : '<span class="muted">— not yet disposed —</span>'}</div>
    ${gateMsg ? `<div class="gate"><span class="gi">⚠</span><div><b>Can't close yet</b> — ${gateMsg}</div></div>` : ""}
    ` : ""}

    <h3>Assignees</h3>
    <div class="stagerow">${(p.assignees || []).map(e => `<span class="chip">${avatar(e, 20)} ${esc(userName(e))}</span>`).join("") || '<span class="muted">unassigned</span>'}</div>
    <h3>Watchers <span class="muted nocaps">— flagged on their Dashboard when there's new activity (per browser)</span></h3>
    <div class="stagerow">${(p.watchers || []).map(e => `<span class="chip">${avatar(e, 20)} ${esc(userName(e))}</span>`).join("") || '<span class="muted">none</span>'}</div>
    ${isIssue(p) ? "" : `<h3>Related parts</h3><div class="stagerow">${partChips}</div>`}
    ${(ticketChips || woChips) ? `<h3>Linked</h3><div class="linkrow">${ticketChips}${woChips}</div>` : ""}

    ${!isIssue(p) && !p.parentId ? `
    <h3>Sub-tickets <span class="muted nocaps">${kids.length ? `— ${kids.filter(k => projStatus(k) === "Done").length} of ${kids.length} done, tracked independently` : ""}</span></h3>
    ${kids.length ? kids.map(k => `<div class="subticket" onclick="openRecord('projects','${k.id}')">
      <span class="status ${projStatusClass(projStatus(k))}"><span class="dot"></span>${esc(projStatus(k))}</span>
      <span class="stt">${esc(k.title || k.id)}</span>
      <span class="avatar-stack">${(k.assignees || []).slice(0, 3).map(e => avatar(e, 20)).join("")}</span>
    </div>`).join("") : '<span class="muted">No sub-tickets yet.</span>'}
    <div class="no-print" style="margin-top:6px"><button class="sm" onclick="openNewSubTicket('${p.id}')">+ Add sub-ticket</button></div>
    ` : ""}

    <h3>Description</h3>
    <div>${p.description ? sanitizeHtml(p.description) : '<span class="muted">—</span>'}</div>

    <h3>Files</h3>
    <div class="filegrid">
      ${(p.files || []).map(fileItem).join("") || '<span class="muted">No files yet.</span>'}
    </div>
    <div class="no-print" style="margin-top:8px"><button onclick="addProjectFiles()">+ Add files</button></div>

    <h3>Comments</h3>
    ${projComments(p).map(c => `<div class="comment">
      ${avatar(c.email || c.author, 30)}
      <div class="cbody">
        <div class="chead"><b>${esc(c.author || userName(c.email))}</b> · ${fmtWhen(c.ts)}</div>
        <div class="ctext">${sanitizeHtml(c.html || "")}</div>
      </div>
    </div>`).join("") || '<span class="muted">No comments yet.</span>'}
    <div class="no-print" style="margin-top:10px">
      <div class="rte-toolbar">${rteToolbarButtons("comment-editor")}
        <button type="button" title="Attach image" onclick="attachCommentImage()">${icon("paperclip", 15)} Image</button>
      </div>
      <div class="rte" id="comment-editor" contenteditable="true" data-ph="Write a comment…"></div>
      <div style="margin-top:6px"><button class="primary" onclick="postComment('${p.id}')">Comment as ${esc(signerName())}</button></div>
    </div>
  </div>`;
}

function fileItem(f) {
  const isImg = (f.type || "").startsWith("image/");
  const thumb = isImg ? `<div class="thumb" style="background-image:url('${esc(f.url)}')"></div>` : `<div class="thumb">${icon("file", 26)}</div>`;
  return `<div class="fileitem">${thumb}<div class="fn"><a href="${esc(f.url)}" download="${esc(f.name)}" target="_blank" rel="noopener" title="${esc(f.name)}">${esc(f.name)}</a></div></div>`;
}
function addProjectFiles() {
  const p = projById(view.id);
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*,application/pdf,.doc,.docx,.txt,.csv";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const rec = await fb.upload(`projects/${p.id}/${Date.now()}-${f.name}`, f);
      const entry = { id: "F" + Date.now(), name: rec.name, url: rec.url, type: rec.type, size: rec.size, by: myEmail(), ts: new Date().toISOString(), path: rec.path };
      p.files = (p.files || []).concat([entry]);
      await fb.appendTo("projects", p.id, "files", entry).catch(() => saveProj(p, "files"));
      render();
    } catch (e) { toast("Upload failed: " + e.message,"error"); }
  };
  inp.click();
}

/* ---- rich-text comment editor ---- */
function rte(cmd, val, targetId) { document.execCommand(cmd, false, val); document.getElementById(targetId || "comment-editor").focus(); }
// A bare <img> has no click-to-download affordance — wrap it in a link, same
// as fileItem()'s anchor, so an inline comment image behaves like every other
// attachment instead of being a dead end you can only right-click.
function imgAttachHtml(url, name) {
  return `<a href="${url}" download="${esc(name)}" target="_blank" rel="noopener"><img src="${url}" alt="${esc(name)}"></a>`;
}
function attachCommentImage() {
  const p = projById(view.id);
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const rec = await fb.upload(`projects/${p.id}/${Date.now()}-${f.name}`, f);
      document.execCommand("insertHTML", false, imgAttachHtml(rec.url, f.name));
      // an attached image is also a file on the project
      const entry = { id: "F" + Date.now(), name: rec.name, url: rec.url, type: rec.type, size: rec.size, by: myEmail(), ts: new Date().toISOString(), path: rec.path };
      p.files = (p.files || []).concat([entry]);
      await fb.appendTo("projects", p.id, "files", entry).catch(() => saveProj(p, "files"));
    } catch (e) { toast("Image upload failed: " + e.message,"error"); }
  };
  inp.click();
}
// Match @tokens in comment text to roster users. Uses EXACT token equality (not
// substring), so "@Nicole" doesn't also ping "Nico" — the same over-match trap
// isMine() was fixed for. A bare first name still matches everyone who shares it
// (genuinely ambiguous); use @email to disambiguate.
function mentionsIn(text) {
  const tokens = new Set((String(text).match(/@[\w.\-]+(?:@[\w.\-]+)?/g) || []).map(t => t.slice(1).toLowerCase()));
  if (!tokens.size) return [];
  return (DB.users || []).filter(u => {
    const email = u.email.toLowerCase();
    const first = (u.name || "").toLowerCase().split(" ")[0];
    const full = (u.name || "").toLowerCase().replace(/\s+/g, "");
    return tokens.has(email) || (first && tokens.has(first)) || (full && tokens.has(full));
  }).map(u => u.email);
}
function postComment(id) {
  const ed = document.getElementById("comment-editor");
  const html = sanitizeHtml(ed.innerHTML || "");
  const text = ed.textContent || "";
  if (!text.trim() && !/<img/i.test(html)) { toast("Write a comment first.", "error"); return; }
  const p = projById(id);
  const c = { id: "C" + Date.now(), author: signerName(), email: myEmail(), ts: new Date().toISOString(), html };
  p.comments = (p.comments || []).concat([c]); // optimistic
  fb.appendTo("projects", id, "comments", c).catch(() => saveProj(p, "comments"));
  // @mentions → add as watcher + notify.
  const mentioned = mentionsIn(text).filter(e => e !== myEmail());
  if (mentioned.length) {
    p.watchers = [...new Set([...(p.watchers || []), ...mentioned])];
    saveProj(p, "watchers");
    mentioned.forEach(e => fb.notify(e, "mention", signerName() + " mentioned you on “" + (p.title || p.id) + "”", { tab: "projects", id }).catch(() => {}));
  }
  ed.innerHTML = ""; render();
}
