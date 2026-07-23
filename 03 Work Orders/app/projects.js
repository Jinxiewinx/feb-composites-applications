"use strict";
/* projects.js — the Projects tab (jira-style).
   Board or list of projects; create via a modal with real assignee/part
   pickers; each project has its own page with assignees, watchers, a files
   section (uploads), and a rich-text comment thread with image attachments.
   Comments/files append atomically (arrayUnion) so concurrent posts don't
   clobber. "Watched — new activity" is tracked per-browser in localStorage. */

const PROJ_STATUS = ["Backlog", "Active", "Blocked", "Done"];
const PRIORITY = ["Low", "Medium", "High"];
let PROJ_DRAG = null;

function projById(id) { return DB.projects.find(p => p.id === id); }
function saveProj(p, field) { p = p || projById(view.id); if (p) save("projects", p, field); }
function projStatusClass(s) { return { Backlog: "Draft", Active: "InWork", Blocked: "OnHold", Done: "Complete" }[s] || "Draft"; }
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

function openNewProject() {
  pickerInit("pa", assigneeItems(), [myEmail()]);
  pickerInit("pp", partItems(), []);
  openModal(`
    <h2>New project</h2>
    <div class="field"><label>Name</label><input id="np-title" placeholder="What is this project?"></div>
    <div class="row2">
      <div class="field"><label>Status</label><select id="np-status">${PROJ_STATUS.map(s => `<option>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Priority</label><select id="np-priority">${PRIORITY.map(s => `<option ${s === "Medium" ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>Due date</label><input id="np-due" type="date"></div>
    <div class="field"><label>Assignees</label>${pickerField("pa")}</div>
    <div class="field"><label>Related parts</label>${pickerField("pp")}</div>
    <div class="field"><label>Description</label><textarea id="np-desc" placeholder="Details, goals, links…"></textarea></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitNewProject()">Create project</button></div>
  `);
}
async function submitNewProject() {
  const title = document.getElementById("np-title").value.trim();
  if (!title) { toast("Give the project a name.","error"); return; }
  const id = await allocId("projects");
  if (!id) return;
  const assignees = pickerValues("pa");    // honor the picker exactly (don't force creator back in)
  const p = {
    id, title,
    status: document.getElementById("np-status").value,
    priority: document.getElementById("np-priority").value,
    dueDate: document.getElementById("np-due").value,
    description: document.getElementById("np-desc").value,
    assignees,
    // assignees + creator watch by default (creator watches the project they made)
    watchers: [...new Set([myEmail(), ...assignees])].filter(Boolean),
    relatedParts: pickerValues("pp"),
    files: [], comments: [],
    createdBy: myEmail(), retro: false,
  };
  DB.projects.push(p); saveProj(p);
  assignees.filter(e => e !== myEmail()).forEach(e =>
    fb.notify(e, "assigned", signerName() + " assigned you to “" + title + "”", { tab: "projects", id }).catch(() => {}));
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
  return `
  <div class="toolbar no-print">
    <button class="primary" onclick="openNewProject()">+ New Project</button>
    <button onclick="view.projView='${boardMode ? "list" : "board"}';render()">${boardMode ? "List view" : "Board view"}</button>
    <input id="searchbox" placeholder="search title / assignee…" value="${esc(view.q)}" oninput="searchInput(this)" style="margin-left:auto">
  </div>
  ${DB.projects.length === 0 ? `<div class="card">No projects yet. <b>+ New Project</b> to start one.</div>` : boardMode ? renderProjBoard() : renderProjTable()}`;
}
function projMatch(p) { const q = (view.q || "").toLowerCase(); return !q || (p.title || "").toLowerCase().includes(q) || (p.assignees || []).some(e => userName(e).toLowerCase().includes(q) || e.toLowerCase().includes(q)); }

function renderProjBoard() {
  const cols = PROJ_STATUS.map(st => {
    const list = DB.projects.filter(p => p.status === st && projMatch(p))
      .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    return `<div class="col col-${st}" ondragover="event.preventDefault();this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="projDrop('${st}',this)">
      <h4>${st}<span>${list.length}</span></h4>
      ${list.map(projCard).join("")}
    </div>`;
  }).join("");
  return `<div class="board">${cols}</div>`;
}
function projCard(p) {
  const dd = daysUntil(p.dueDate), late = dd != null && dd < 0 && p.status !== "Done";
  const av = (p.assignees || []).slice(0, 4).map(e => avatar(e, 22)).join("");
  const nComments = projComments(p).length, nFiles = (p.files || []).length;
  return `<div class="pcard" draggable="true" ondragstart="projDragStart('${p.id}')" onclick="openRecord('projects','${p.id}')">
    <div class="t">${esc(p.title || p.id)}${projUnread(p) ? ' <span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gold)"></span>' : ""}</div>
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
  if (p && p.status !== status) { p.status = status; saveProj(p, "status"); render(); }
}
function renderProjTable() {
  const order = { Active: 0, Blocked: 1, Backlog: 2, Done: 3 };
  const rows = DB.projects.filter(projMatch).sort((a, b) => (order[a.status] - order[b.status]) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  return `<table class="list">
    <tr><th>Title</th><th>Status</th><th>Priority</th><th>Assignees</th><th>Due</th><th>Activity</th></tr>
    ${rows.map(p => {
      const dd = daysUntil(p.dueDate), late = dd != null && dd < 0 && p.status !== "Done";
      return `<tr onclick="openRecord('projects','${p.id}')">
        <td><b>${esc(p.title || p.id)}</b>${projUnread(p) ? " 🟡" : ""}</td>
        <td><span class="pill ${projStatusClass(p.status)}">${esc(p.status)}</span></td>
        <td class="prio ${esc(p.priority)}">${esc(p.priority || "")}</td>
        <td><span class="avatar-stack">${(p.assignees || []).slice(0, 5).map(e => avatar(e, 22)).join("")}</span></td>
        <td class="${late ? "warn" : ""}">${esc(p.dueDate || "")}${late ? " " + icon("warning", 13) : ""}</td>
        <td class="tny"><span class="cnt">${icon("message", 13)}${projComments(p).length}</span> <span class="cnt">${icon("paperclip", 13)}${(p.files || []).length}</span></td>
      </tr>`;
    }).join("")}
  </table>`;
}

/* ---- project page ---- */
function editProject() {
  const p = projById(view.id);
  pickerInit("ea", assigneeItems(), p.assignees || []);
  pickerInit("ep", partItems(), p.relatedParts || []);
  view.edit = true; render();
}
function saveProjectEdits() {
  const p = projById(view.id);
  const wasAssigned = p.assignees || [];
  p.title = document.getElementById("ep-title").value.trim() || p.title;
  p.status = document.getElementById("ep-status").value;
  p.priority = document.getElementById("ep-priority").value;
  p.dueDate = document.getElementById("ep-due").value;
  p.description = document.getElementById("ep-desc").value;
  p.assignees = pickerValues("ea");
  p.relatedParts = pickerValues("ep");
  // Notify anyone newly assigned.
  p.assignees.filter(e => e !== myEmail() && !wasAssigned.includes(e)).forEach(e =>
    fb.notify(e, "assigned", signerName() + " assigned you to “" + (p.title || p.id) + "”", { tab: "projects", id: p.id }).catch(() => {}));
  // keep watchers ⊇ assignees (assigning someone opts them into updates)
  p.watchers = [...new Set([...(p.watchers || []), ...p.assignees])];
  // Field-scoped writes, NOT a whole-doc save — so a teammate's concurrent
  // comment/file/watcher change (which lands on other fields) can't be clobbered
  // by this edit landing between their write and our Save.
  ["title", "status", "priority", "dueDate", "description", "assignees", "relatedParts", "watchers"]
    .forEach(f => saveProj(p, f));
  view.edit = false; render();
}
function toggleWatch() {
  const p = projById(view.id);
  const me = myEmail();
  p.watchers = (p.watchers || []).includes(me) ? p.watchers.filter(e => e !== me) : [...(p.watchers || []), me];
  saveProj(p, "watchers"); render();
}

function renderProjDetail() {
  const p = projById(view.id);
  if (!p) { view.mode = "list"; return renderProjTable(); }
  markSeen(p.id);
  const E = view.edit;
  const watching = (p.watchers || []).includes(myEmail());
  if (E) {
    return `
    <div class="toolbar no-print">
      <button class="ib" onclick="view={...view,mode:'list',edit:false};render()">${icon("chevronLeft",16)} All projects</button>
      <button class="primary" onclick="saveProjectEdits()">Save</button>
      <button onclick="view.edit=false;render()">Cancel</button>
      ${isLead() ? `<button class="danger" onclick="delProject('${p.id}')">Delete</button>` : ""}
    </div>
    <div class="card">
      <div class="field"><label>Title</label><input id="ep-title" value="${esc(p.title)}"></div>
      <div class="row2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Status</label><select id="ep-status">${PROJ_STATUS.map(s => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label>Priority</label><select id="ep-priority">${PRIORITY.map(s => `<option ${p.priority === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Due date</label><input id="ep-due" type="date" value="${esc(p.dueDate || "")}"></div>
      <div class="field"><label>Assignees</label>${pickerField("ea")}</div>
      <div class="field"><label>Related parts</label>${pickerField("ep")}</div>
      <div class="field"><label>Description</label><textarea id="ep-desc">${esc(p.description || "")}</textarea></div>
    </div>`;
  }
  const partChips = (p.relatedParts || []).map(id => chip("parts", id, (recById("parts", id) || {}).partName || id)).join(" ") || '<span class="muted">none</span>';
  const dd = daysUntil(p.dueDate);
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="view={...view,mode:'list'};render()">${icon("chevronLeft",16)} All projects</button>
    <button class="primary" onclick="editProject()">Edit</button>
    <button onclick="toggleWatch()">${watching ? "★ Watching" : "☆ Watch"}</button>
  </div>
  <div class="card">
    <h2>${esc(p.title || "(untitled project)")}</h2>
    <div class="muted">${esc(p.id)} · <span class="pill ${projStatusClass(p.status)}">${esc(p.status)}</span> · <span class="prio ${esc(p.priority)}">${esc(p.priority || "")} priority</span>${p.dueDate ? ` · due ${esc(p.dueDate)}${dd != null ? ` (${dd < 0 ? Math.abs(dd) + " days late" : dd + " days out"})` : ""}` : ""}</div>
    <h3>Assignees</h3>
    <div class="stagerow">${(p.assignees || []).map(e => `<span class="chip">${avatar(e, 20)} ${esc(userName(e))}</span>`).join("") || '<span class="muted">unassigned</span>'}</div>
    <h3>Watchers <span class="muted" style="text-transform:none">— flagged on their Dashboard when there's new activity (per browser)</span></h3>
    <div class="stagerow">${(p.watchers || []).map(e => `<span class="chip">${avatar(e, 20)} ${esc(userName(e))}</span>`).join("") || '<span class="muted">none</span>'}</div>
    <h3>Related parts</h3>
    <div class="stagerow">${partChips}</div>
    <h3>Description</h3>
    <div>${p.description ? esc(p.description).replace(/\n/g, "<br>") : '<span class="muted">—</span>'}</div>

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
      <div class="rte-toolbar">
        <button title="Bold" onclick="rte('bold')"><b>B</b></button>
        <button title="Italic" onclick="rte('italic')"><i>I</i></button>
        <button title="Underline" onclick="rte('underline')"><u>U</u></button>
        <button title="Bigger" onclick="rte('fontSize','5')">A+</button>
        <button title="Smaller" onclick="rte('fontSize','2')">A−</button>
        <button title="Bullet list" onclick="rte('insertUnorderedList')">• List</button>
        <button title="Attach image" onclick="attachCommentImage()">${icon("paperclip", 15)} Image</button>
      </div>
      <div class="rte" id="comment-editor" contenteditable="true" data-ph="Write a comment…"></div>
      <div style="margin-top:6px"><button class="primary" onclick="postComment('${p.id}')">Comment as ${esc(signerName())}</button></div>
    </div>
  </div>`;
}

function fileItem(f) {
  const isImg = (f.type || "").startsWith("image/");
  const thumb = isImg ? `<div class="thumb" style="background-image:url('${esc(f.url)}')"></div>` : `<div class="thumb">${icon("file", 26)}</div>`;
  return `<div class="fileitem">${thumb}<div class="fn"><a href="${esc(f.url)}" target="_blank" rel="noopener" title="${esc(f.name)}">${esc(f.name)}</a></div></div>`;
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
function rte(cmd, val) { document.execCommand(cmd, false, val); document.getElementById("comment-editor").focus(); }
function attachCommentImage() {
  const p = projById(view.id);
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const rec = await fb.upload(`projects/${p.id}/${Date.now()}-${f.name}`, f);
      document.execCommand("insertHTML", false, `<img src="${rec.url}" alt="${esc(f.name)}">`);
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
