"use strict";
/* documents.js — the Documents tab.
   A read-only library of the team's reference docs, bundled into the app by
   tools/gen_docs_manifest.py (docs/manifest.json). Datasheets (PDF) open in an
   in-app viewer; our CS standards / pain-points render in-app from markdown;
   printables open as HTML. */

let DOCS_MANIFEST = null;   // null=unloaded, []=loaded
let DOCS_LOADING = false;
let openDoc = null;         // { title, kind, src, docx }
const MD_CACHE = {};

function loadManifest() {
  if (DOCS_LOADING) return;
  DOCS_LOADING = true;
  fetch("docs/manifest.json")
    .then(r => r.json())
    .then(m => { DOCS_MANIFEST = Array.isArray(m) ? m : []; render(); })
    .catch(() => { DOCS_MANIFEST = []; render(); });
}

function openDocument(src) {
  openDoc = (DOCS_MANIFEST || []).find(d => d.src === src) || null;
  if (openDoc && openDoc.kind === "md" && !MD_CACHE[openDoc.src]) {
    fetch(openDoc.src).then(r => r.text()).then(t => { MD_CACHE[openDoc.src] = mdToHtml(t); render(); }).catch(() => { MD_CACHE[openDoc.src] = "<p class='muted'>Could not load.</p>"; render(); });
  }
  render();
}
function closeDocument() { openDoc = null; render(); }
function fmtKB(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.round(n / 1024) + " KB"; }

// Bundled manifest docs + live uploaded docs (DB.documents), unified shape.
function allDocs() {
  const bundled = (DOCS_MANIFEST || []).map(d => ({ ...d, uploaded: false }));
  const up = (DB.documents || []).map(d => ({
    category: d.category || "Uploads", title: d.title || d.name, kind: d.kind,
    src: d.url, size: d.size, uploaded: true, id: d.id, by: d.by,
  }));
  return bundled.concat(up);
}
function renderDocuments() {
  if (DOCS_MANIFEST === null) { loadManifest(); return `<div class="card">Loading documents…</div>`; }
  if (openDoc) return renderDocViewer();

  const q = (view.q || "").toLowerCase();
  const all = allDocs();
  const docs = all.filter(d => !q || d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q));
  const cats = ["Datasheets", "Standards", "Guides", "Uploads", ...new Set(all.map(d => d.category))]
    .filter((c, i, a) => a.indexOf(c) === i);
  return `
  <div class="toolbar no-print"><button class="primary" onclick="uploadDocument()">+ Upload document</button></div>
  <div class="filters no-print">
    <input id="searchbox" placeholder="search documents…" value="${esc(view.q || "")}" oninput="searchInput(this)">
    <span class="muted" style="align-self:center">${docs.length} of ${all.length} documents</span>
  </div>
  ${all.length === 0 ? `<div class="card">No documents yet — <b>Upload document</b>, or run <code>python3 tools/gen_docs_manifest.py</code> to bundle the datasheets/standards.</div>` : ""}
  ${cats.map(cat => {
    const list = docs.filter(d => d.category === cat);
    if (!list.length) return "";
    return `<div class="card">
      <h3>${esc(cat)} <span class="muted">(${list.length})</span></h3>
      <div class="doclist">
        ${list.map(d => `<div class="docrow" onclick="openDocFromRow('${esc(d.src)}','${d.uploaded ? "up" : ""}')">
          <span class="di">${icon(d.kind === "html" ? "print" : (d.kind || "").startsWith("image") ? "image" : "file", 18)}</span>
          <span>${esc(d.title)}${d.uploaded ? ` <span class="muted tny">· ${esc(d.by || "")}</span>` : ""}</span>
          <span class="dsz">${(d.kind || "file").toUpperCase()} · ${fmtKB(d.size || 0)}${d.uploaded && isLead() ? ` <button class="danger ib" title="Delete" onclick="event.stopPropagation();delDocument('${d.id}')">${icon("trash", 14)}</button>` : ""}</span>
        </div>`).join("")}
      </div>
    </div>`;
  }).join("")}`;
}

function uploadDocument() {
  const cats = ["Datasheets", "Standards", "Guides", "Uploads"];
  openModal(`
    <h2>Upload document</h2>
    <div class="field"><label>Title</label><input id="ud-title" placeholder="Document name"></div>
    <div class="field"><label>Category</label><select id="ud-cat">${cats.map(c => `<option ${c === "Uploads" ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    <div class="field"><label>File</label><input id="ud-file" type="file" accept="application/pdf,image/*,.doc,.docx,.txt,.csv"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitDocument()">Upload</button></div>
  `);
}
async function submitDocument() {
  const title = document.getElementById("ud-title").value.trim();
  const cat = document.getElementById("ud-cat").value;
  const f = document.getElementById("ud-file").files[0];
  if (!f) { toast("Pick a file first.", "error"); return; }
  const id = await allocId("documents");
  if (!id) return;
  try {
    const rec = await fb.upload(`documents/${id}-${f.name}`, f);
    const kind = rec.type === "application/pdf" ? "pdf" : (rec.type || "").startsWith("image/") ? "image" : "file";
    const d = { id, title: title || f.name, category: cat, kind, url: rec.url, path: rec.path, size: rec.size, by: myEmail(), ts: new Date().toISOString() };
    DB.documents.push(d); save("documents", d);
    closeModal(); toast("Document uploaded.");
  } catch (e) { toast("Upload failed: " + e.message, "error"); }
}
function delDocument(id) {
  confirmModal("Delete this document for everyone?", () => {
    const d = (DB.documents || []).find(x => x.id === id);
    del("documents", id);
    if (d && d.path) fb.deleteFile(d.path);
    DB.documents = DB.documents.filter(x => x.id !== id);
    render();
  });
}
// Uploaded docs carry a full URL as src; bundled ones a relative path.
function openDocFromRow(src, up) {
  if (up) {
    const d = (DB.documents || []).find(x => x.url === src);
    openDoc = d ? { title: d.title, kind: d.kind, src: d.url } : null;
    render();
  } else openDocument(src);
}

function renderDocViewer() {
  const d = openDoc;
  const dl = d.docx ? ` · <a href="${esc(d.docx)}" download>download .docx</a>` : "";
  let body;
  if (d.kind === "pdf" || d.kind === "html") {
    body = `<iframe class="docview" src="${esc(d.src)}" title="${esc(d.title)}"></iframe>`;
  } else if (d.kind === "image") {
    body = `<div class="card" style="text-align:center"><img src="${esc(d.src)}" alt="${esc(d.title)}" style="max-width:100%;border-radius:6px"></div>`;
  } else if (d.kind === "md") {
    body = `<div class="md-body card">${MD_CACHE[d.src] || "Loading…"}</div>`;
  } else {
    body = `<div class="card">This file type doesn't preview in-browser. <a href="${esc(d.src)}" target="_blank" rel="noopener" download>Download it</a>.</div>`;
  }
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="closeDocument()">${icon("chevronLeft",16)} All documents</button>
    <a href="${esc(d.src)}" target="_blank" rel="noopener"><button>Open in new tab</button></a>
    <span class="muted" style="align-self:center">${esc(d.title)}${dl}</span>
  </div>
  ${body}`;
}

/* ---------- minimal, safe markdown → HTML (for our CS docs) ---------- */
function mdInline(s) {
  s = esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) =>
      /^(https?:|\/|#|mailto:)/i.test(u.trim()) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>` : esc(t));
  return s;
}
function mdToHtml(md) {
  const lines = String(md).replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0, inList = null;
  function closeList() { if (inList) { out.push(`</${inList}>`); inList = null; } }
  while (i < lines.length) {
    let line = lines[i];
    // table: header row + separator row of ---
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeList();
      const cell = r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const head = cell(line);
      out.push('<table><thead><tr>' + head.map(h => `<th>${mdInline(h)}</th>`).join("") + "</tr></thead><tbody>");
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        out.push("<tr>" + cell(lines[i]).map(c => `<td>${mdInline(c)}</td>`).join("") + "</tr>");
        i++;
      }
      out.push("</tbody></table>");
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${mdInline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*>\s?/.test(line)) { closeList(); out.push(`<blockquote>${mdInline(line.replace(/^\s*>\s?/, ""))}</blockquote>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { closeList(); out.push("<hr>"); i++; continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const want = ul ? "ul" : "ol";
      if (inList && inList !== want) closeList();
      if (!inList) { inList = want; out.push(`<${want}>`); }
      out.push(`<li>${mdInline((ul || ol)[1])}</li>`); i++; continue;
    }
    if (/^\s*$/.test(line)) { closeList(); i++; continue; }
    closeList(); out.push(`<p>${mdInline(line)}</p>`); i++;
  }
  closeList();
  return out.join("\n");
}
