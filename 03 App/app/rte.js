"use strict";
/* rte.js — the comment/description composer.
 *
 * WHY IT IS SHAPED LIKE THIS.
 * Comments here are meant to be documents: what the layup was, what went wrong,
 * the measurement, the photos. The old composer was a 60px box (two lines) under
 * a toolbar that wrapped to three rows on a phone, so the chrome was twice the
 * size of the writing area.
 *
 * ONE COMMAND REGISTRY, THREE THIN SHELLS. Every formatting action is defined
 * once in COMMANDS. The shells are presentation only:
 *
 *   rteBar()     a six-button row, everywhere. One row, scrolls sideways.
 *   rteBubble()  a selection pill, POINTER:FINE ONLY.
 *   rteInsert()  the "+" menu, also opened by "/" on a fine pointer.
 *
 * The bubble is hidden on touch deliberately. It depends on precise text
 * selection, and selection handles are drawn by the OS at ~10px — no stylesheet
 * can grow them. This app needed a dedicated rule to lift <select> targets from
 * 21px to 40px for gloved hands at RFS; a drag-to-select interface is the wrong
 * primary path for that user. Nothing is unreachable without it: everything the
 * bubble does is also in the bar or the insert menu. The app already makes this
 * exact call twice for hover-revealed affordances (see .tl-del).
 *
 * execCommand IS DEPRECATED AND IS STILL THE RIGHT TOOL for bold/italic/
 * insertHTML. It is the only path that preserves the browser's NATIVE UNDO
 * STACK; a Range-based implementation means writing an undo manager. EditContext
 * is ~70% global with zero Firefox and zero Safari, so it is not an option for
 * an app people open on a phone in a shop. styleWithCSS is forced off at init so
 * Firefox emits <b> rather than <span style>, which matters now that `style` is
 * no longer in the sanitizer allowlist.
 */

/* ---------- the registry ---------- */

// Where a caret was before something async (a file picker, an upload) stole it.
// Captured synchronously, restored before inserting. This is the bug in the old
// attachCommentImage: it awaited the upload and THEN called insertHTML, by which
// time the picker had blurred the editor and the image landed anywhere.
let RTE_RANGE = null;
function rteSaveRange() {
  const s = window.getSelection && window.getSelection();
  RTE_RANGE = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  return RTE_RANGE;
}
function rteRestoreRange(el) {
  if (el) el.focus();
  if (!RTE_RANGE || !window.getSelection) return;
  const s = window.getSelection();
  s.removeAllRanges(); s.addRange(RTE_RANGE);
}
// One insertion seam. Everything that puts markup in goes through here, so the
// tests can assert behaviour instead of naming execCommand.
function insertAtCaret(targetId, html) {
  const el = document.getElementById(targetId);
  if (el) el.focus();
  document.execCommand("insertHTML", false, html);
}
function rteExec(targetId, cmd, val) {
  const el = document.getElementById(targetId);
  if (el) el.focus();          // focus BEFORE the command, or it applies elsewhere
  document.execCommand(cmd, false, val == null ? undefined : val);
}
// Pure builders, no DOM. Testable on their own, and reused by the paste path.
function codeHtml(text) { return `<code>${esc(text || "code")}</code>`; }
function tableHtml(rows, cols) {
  const r = Math.max(1, Math.min(20, rows | 0)), c = Math.max(1, Math.min(12, cols | 0));
  const head = `<thead><tr>${Array(c).fill('<th>&nbsp;</th>').join("")}</tr></thead>`;
  const body = `<tbody>${Array(Math.max(1, r - 1)).fill(`<tr>${Array(c).fill("<td>&nbsp;</td>").join("")}</tr>`).join("")}</tbody>`;
  return `<table>${head}${body}</table>`;
}

const COMMANDS = [
  { id: "bold", label: "Bold", short: "<b>B</b>", key: "b", bar: 1, bubble: 1,
    run: t => rteExec(t, "bold"), active: () => rteQuery("bold") },
  { id: "italic", label: "Italic", short: "<i>I</i>", key: "i", bar: 1, bubble: 1,
    run: t => rteExec(t, "italic"), active: () => rteQuery("italic") },
  { id: "h2", label: "Big heading", short: "H2", bar: 0, bubble: 1, insert: 1, icon: "documents",
    run: t => rteBlock(t, "h2") },
  { id: "h3", label: "Heading", short: "H", bar: 1, bubble: 1, insert: 1, icon: "documents",
    run: t => rteBlock(t, "h3") },
  { id: "ul", label: "Bullet list", short: "&bull;", bar: 1, insert: 1, icon: "layers",
    run: t => rteExec(t, "insertUnorderedList") },
  { id: "ol", label: "Numbered list", short: "1.", insert: 1, icon: "layers",
    run: t => rteExec(t, "insertOrderedList") },
  { id: "link", label: "Link", short: "&#128279;", key: "k", bar: 1, bubble: 1, icon: "link",
    run: t => rteLink(t) },
  { id: "quote", label: "Quote", short: "&rdquo;", bubble: 1, insert: 1, icon: "message",
    run: t => rteBlock(t, "blockquote") },
  { id: "code", label: "Code", short: "&lt;/&gt;", bubble: 1, insert: 1, icon: "file",
    run: t => { const s = window.getSelection && window.getSelection(); insertAtCaret(t, codeHtml(s && s.toString())); } },
  { id: "pre", label: "Code block", short: "{ }", insert: 1, icon: "file",
    run: t => insertAtCaret(t, "<pre>&nbsp;</pre>") },
  { id: "table", label: "Table", short: "&#8862;", insert: 1, icon: "reports",
    run: t => insertAtCaret(t, tableHtml(3, 3)) },
  { id: "hr", label: "Divider", short: "&mdash;", insert: 1, icon: "x",
    run: t => insertAtCaret(t, "<hr>") },
  { id: "image", label: "Photo", short: "&#128247;", bar: 1, insert: 1, icon: "image",
    run: t => rtePickImages(t) },
];
function rteQuery(cmd) { try { return document.queryCommandState(cmd); } catch (e) { return false; } }
function cmdById(id) { return COMMANDS.find(c => c.id === id); }
function runCmd(id, targetId) {
  const c = cmdById(id);
  if (!c) return;
  rteCloseInsert();
  c.run(targetId);
  rteSyncBubble();
}
/* formatBlock toggles: applying h3 to an existing h3 should give a paragraph
   back, otherwise the only way out of a heading is to delete the line. */
function rteBlock(targetId, tag) {
  const el = document.getElementById(targetId);
  if (el) el.focus();
  let cur = "";
  try { cur = String(document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, ""); } catch (e) {}
  // The angle-bracket form is the one every engine accepts; a bare "h2" is a
  // silent no-op in Safari and in some Chrome versions, which is exactly the
  // failure mode you never notice because the text is still there.
  document.execCommand("formatBlock", false, "<" + (cur === tag ? "p" : tag) + ">");
}

/* ---------- shell 1: the bar ---------- */

function rteBar(targetId) {
  const btn = c => `<button type="button" title="${esc(c.label)}" aria-label="${esc(c.label)}"
    onmousedown="event.preventDefault()" onclick="runCmd('${c.id}','${targetId}')">${c.short}</button>`;
  return `<div class="rte-toolbar" role="toolbar" aria-label="Formatting">
    ${COMMANDS.filter(c => c.bar).map(btn).join("")}
    <button type="button" class="rte-more" title="Insert" aria-label="Insert something"
      onmousedown="event.preventDefault()" onclick="rteOpenInsert('${targetId}',this)">+</button>
  </div>`;
}

/* ---------- shell 2: the bubble (fine pointer only) ---------- */

function rteBubbleHtml() {
  return `<div id="rte-bubble" class="rte-bubble no-print" hidden></div>`;
}
/* Anchored to the selection, absolutely positioned inside the composer wrapper
   rather than fixed to the viewport: when the composer is in a modal the
   SCROLL CONTAINER is #modal .backdrop, not the page, so a fixed pill would
   not travel with the text it belongs to. The backdrop is also overflow:auto,
   i.e. a clipping box — the app has been bitten by exactly that before. */
function rteSyncBubble() {
  const bub = document.getElementById("rte-bubble");
  if (!bub) return;
  const sel = window.getSelection && window.getSelection();
  const ed = document.querySelector(".rte:focus") || (RTE_ACTIVE && document.getElementById(RTE_ACTIVE));
  if (!sel || !sel.rangeCount || sel.isCollapsed || !ed || !ed.contains(sel.anchorNode)) { bub.hidden = true; return; }
  const wrap = bub.offsetParent || bub.parentElement;
  if (!wrap) return;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  if (!r.width && !r.height) { bub.hidden = true; return; }
  const w = wrap.getBoundingClientRect();
  bub.innerHTML = COMMANDS.filter(c => c.bubble).map(c =>
    `<button type="button" title="${esc(c.label)}" class="${c.active && c.active() ? "on" : ""}"
      onmousedown="event.preventDefault()" onclick="runCmd('${c.id}','${esc(RTE_ACTIVE || "")}')">${c.short}</button>`).join("");
  bub.hidden = false;
  /* Above the selection, flipped below when there is no room. The floor is the
     TOP OF THE EDITOR, not 0: the wrapper starts at the toolbar, so clamping to
     0 would park the pill on top of the buttons and swallow their clicks. A
     selection on the first line therefore gets the flipped-below position. */
  const bh = bub.offsetHeight || 34;
  const edTop = ed.getBoundingClientRect().top - w.top;
  let top = r.top - w.top - bh - 8;
  if (top < edTop) top = r.bottom - w.top + 8;
  let left = r.left - w.left + r.width / 2 - (bub.offsetWidth || 160) / 2;
  left = Math.max(4, Math.min(left, w.width - (bub.offsetWidth || 160) - 4));
  bub.style.top = top + "px";
  bub.style.left = left + "px";
}

/* ---------- shell 3: the insert menu ---------- */

let RTE_ACTIVE = null;      // id of the editor the floating shells belong to
function rteOpenInsert(targetId, anchorEl) {
  const menu = document.getElementById("rte-insert");
  if (!menu) return;
  RTE_ACTIVE = targetId;
  rteSaveRange();
  menu.innerHTML = COMMANDS.filter(c => c.insert).map((c, i) =>
    `<div class="opt${i === 0 ? " sel" : ""}" role="option" onmousedown="event.preventDefault()"
      onclick="rteInsertPick('${c.id}')">${icon(c.icon || "file", 15)}<span>${esc(c.label)}</span></div>`).join("");
  menu.hidden = false;
  const wrap = menu.offsetParent || menu.parentElement;
  const a = (anchorEl || document.getElementById(targetId)).getBoundingClientRect();
  const w = wrap.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(a.left - w.left, w.width - (menu.offsetWidth || 220) - 4)) + "px";
  const below = a.bottom - w.top + 6;
  menu.style.top = (below + (menu.offsetHeight || 240) > w.height ? Math.max(4, a.top - w.top - (menu.offsetHeight || 240) - 6) : below) + "px";
}
function rteCloseInsert() { const m = document.getElementById("rte-insert"); if (m) m.hidden = true; }
function rteInsertPick(id) {
  const t = RTE_ACTIVE;
  rteCloseInsert();
  const el = document.getElementById(t);
  rteRestoreRange(el);
  // Typed "/" opens the menu; the slash itself must not survive the insert.
  if (RTE_SLASH) { rteDeleteSlash(el); RTE_SLASH = false; }
  runCmd(id, t);
}
function rteInsertHtml() { return `<div id="rte-insert" class="rte-insert no-print" role="listbox" hidden></div>`; }

/* "/" opens the insert menu, but ONLY at the start of an empty block. This team
   types CS-003 §7.2, 1/4in, 2/2 twill and sn5-parts/… all day; a slash that
   opens a menu mid-sentence would fire constantly and be hated. */
let RTE_SLASH = false;
function rteMaybeSlash(e, targetId) {
  if (e.key !== "/" || matchMedia("(pointer: coarse)").matches) return;
  const sel = window.getSelection && window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
  const node = sel.anchorNode;
  const before = node && node.nodeType === 3 ? node.textContent.slice(0, sel.anchorOffset) : "";
  if (before.trim() !== "") return;                 // not at the start of a block
  setTimeout(() => { RTE_SLASH = true; rteOpenInsert(targetId, document.getElementById(targetId)); }, 0);
}
function rteDeleteSlash(el) {
  const sel = window.getSelection && window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const n = sel.anchorNode;
  if (n && n.nodeType === 3 && n.textContent.slice(sel.anchorOffset - 1, sel.anchorOffset) === "/") {
    const r = document.createRange();
    r.setStart(n, sel.anchorOffset - 1); r.setEnd(n, sel.anchorOffset);
    r.deleteContents();
  }
}

/* ---------- markdown input rules ----------
   Typing "## " gives a heading and the "## " disappears. The two people here who
   know markdown keep their muscle memory; the other thirteen never see a hash.
   Six rules, run on the text before the caret at the moment a space is typed. */
const INPUT_RULES = [
  [/^#\s$/, t => rteBlock(t, "h2")],
  [/^##\s$/, t => rteBlock(t, "h2")],
  [/^###\s$/, t => rteBlock(t, "h3")],
  [/^[-*]\s$/, t => rteExec(t, "insertUnorderedList")],
  [/^1\.\s$/, t => rteExec(t, "insertOrderedList")],
  [/^>\s$/, t => rteBlock(t, "blockquote")],
];
function rteInputRules(e, targetId) {
  if (e.key !== " " ) return;
  const sel = window.getSelection && window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
  const n = sel.anchorNode;
  if (!n || n.nodeType !== 3) return;
  const before = n.textContent.slice(0, sel.anchorOffset) + " ";
  for (const [re, run] of INPUT_RULES) {
    if (!re.test(before)) continue;
    e.preventDefault();
    const r = document.createRange();
    r.setStart(n, sel.anchorOffset - (before.length - 1)); r.setEnd(n, sel.anchorOffset);
    r.deleteContents();
    run(targetId);
    return;
  }
}

/* ---------- links ---------- */

// Kept as a seam so a modal can replace the native prompt later without the
// validation moving. Rejects before anything is inserted: a sanitizer stripping
// a bad scheme afterwards is not enough for a link the editor already showed
// you as if it were fine.
function isSafeLinkUrl(url) { return /^https?:\/\//i.test(String(url || "").trim()); }
function promptForUrl() { return prompt("Link URL (https://…)"); }
function rteLink(targetId) {
  const el = document.getElementById(targetId);
  if (el) el.focus();
  rteSaveRange();
  const url = promptForUrl();
  if (url == null) return;
  if (!isSafeLinkUrl(url)) { toast("Links must start with http:// or https://.", "error"); return; }
  rteRestoreRange(el);
  const sel = window.getSelection && window.getSelection();
  const clean = url.trim();
  // A collapsed selection makes createLink a no-op in most browsers, so insert
  // the URL as its own link rather than silently doing nothing.
  if (!sel || sel.isCollapsed) insertAtCaret(targetId, `<a href="${esc(clean)}">${esc(clean)}</a>`);
  else document.execCommand("createLink", false, clean);
  // target/rel are set by the sanitizer hook, not here — see core.js.
}

/* ---------- images: pick, paste, drop ---------- */

let RTE_PENDING = 0;            // uploads in flight; Post is disabled while > 0
function rteBusy() { return RTE_PENDING > 0; }
function rteSetBusy(d) {
  RTE_PENDING = Math.max(0, RTE_PENDING + d);
  document.querySelectorAll("[data-rte-post]").forEach(b => {
    b.disabled = rteBusy();
    if (rteBusy()) { b.dataset.label = b.dataset.label || b.textContent; b.textContent = `Uploading ${RTE_PENDING} image${RTE_PENDING === 1 ? "" : "s"}…`; }
    else if (b.dataset.label) { b.textContent = b.dataset.label; }
  });
}
/* Where uploads go. Set by the surface that owns the composer, so the same
   composer serves tickets, parts and work orders without knowing about any of
   them. storage.rules scopes each tree. */
let RTE_UPLOAD = null;          // { path: (name) => "projects/TKT-1/123-a.png" }
function rteSetUpload(fn) { RTE_UPLOAD = fn; }

function rtePickImages(targetId) {
  const el = document.getElementById(targetId);
  if (el) el.focus();
  rteSaveRange();               // the picker is about to blur us
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
  inp.onchange = () => rteUploadFiles(targetId, Array.from(inp.files || []));
  inp.click();
}
/* One path for the picker, paste and drop. Inserts a placeholder at the saved
   caret FIRST so the text does not jump when the real image lands, then swaps
   the src in place. */
async function rteUploadFiles(targetId, files) {
  const imgs = (files || []).filter(f => f.type && f.type.startsWith("image/"));
  if (!imgs.length) return;
  const el = document.getElementById(targetId);
  rteRestoreRange(el);
  for (const f of imgs) {
    const id = "up" + Date.now() + Math.random().toString(36).slice(2, 6);
    insertAtCaret(targetId, `<img src="${esc(RTE_PLACEHOLDER)}" alt="Uploading ${esc(f.name)}" data-up="${id}">`);
    rteSaveRange();
    rteSetBusy(+1);
    try {
      if (!RTE_UPLOAD) throw new Error("no upload target set");
      const rec = await fb.upload(RTE_UPLOAD(f.name), f);
      const node = el && el.querySelector(`img[data-up="${id}"]`);
      if (node) { node.src = rec.url; node.alt = f.name; node.removeAttribute("data-up"); }
    } catch (err) {
      const node = el && el.querySelector(`img[data-up="${id}"]`);
      if (node) node.replaceWith(document.createTextNode(`[couldn't upload ${f.name}] `));
      toast("Image upload failed: " + err.message, "error");
    } finally { rteSetBusy(-1); }
  }
}
// A 1x1 transparent gif, so the placeholder needs no network round trip. It is
// a data: URL, which the sanitizer strips — deliberately: a placeholder can
// never be accidentally posted.
const RTE_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/* ---------- paste ----------
   Nobody types a 2000-word report into a contenteditable. Paste is how long
   comments actually arrive, so it is the highest-leverage surface here. */
function rtePaste(e, targetId) {
  const dt = e.clipboardData;
  if (!dt) return;
  const files = Array.from(dt.files || []).filter(f => f.type && f.type.startsWith("image/"));
  if (files.length) { e.preventDefault(); rteSaveRange(); rteUploadFiles(targetId, files); return; }
  // Shift+paste is the universal escape hatch to plain text.
  if (e.shiftKey) { e.preventDefault(); insertAtCaret(targetId, esc(dt.getData("text/plain") || "")); return; }
  const html = dt.getData("text/html");
  if (html) { e.preventDefault(); insertAtCaret(targetId, sanitizeHtml(normalizePastedHtml(html))); return; }
  const text = dt.getData("text/plain") || "";
  if (looksLikeMarkdown(text) && typeof mdToHtml === "function") {
    e.preventDefault(); insertAtCaret(targetId, sanitizeHtml(mdToHtml(text)));
  }
  // otherwise fall through to the browser's own plain-text insert
}
function looksLikeMarkdown(t) {
  return /^#{1,4}\s|\n#{1,4}\s|^\s*[-*]\s|\n\s*[-*]\s|\|\s*-{3,}\s*\||\*\*[^*]+\*\*/.test(String(t || ""));
}
function rteDrop(e, targetId) {
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f => f.type && f.type.startsWith("image/"));
  if (!files.length) return;
  e.preventDefault();
  const el = document.getElementById(targetId);
  if (el) { el.classList.remove("dragover"); el.focus(); }
  // Drop puts the caret where the pointer is in most browsers; capture it.
  rteSaveRange();
  rteUploadFiles(targetId, files);
}

/* Recover semantics BEFORE the sanitizer drops `style`.
   Google Docs is the case that matters: it wraps everything in
   <b id="docs-internal-guid-…"> and expresses ALL formatting as inline styles —
   bold is <span style="font-weight:700">, not <strong>. So stripping `style`
   correctly destroys formatting that was never in the tags. Widening the
   allowlist would not fix that; this is the only thing that does. */
function normalizePastedHtml(html) {
  if (typeof DOMParser !== "function") return String(html || "");
  let doc;
  try { doc = new DOMParser().parseFromString(String(html || ""), "text/html"); }
  catch (e) { return String(html || ""); }
  const body = doc.body;
  if (!body) return String(html || "");

  // Google's wrapper is a <b> that means nothing; left alone it bolds the lot.
  body.querySelectorAll('b[id^="docs-internal-guid"]').forEach(b => b.replaceWith(...b.childNodes));

  body.querySelectorAll("[style]").forEach(el => {
    const st = el.getAttribute("style") || "";
    const weight = /font-weight\s*:\s*(\d+|bold)/i.exec(st);
    const italic = /font-style\s*:\s*italic/i.test(st);
    const under = /text-decoration[^;]*underline/i.test(st);
    let inner = el;
    const wrap = tag => { const w = doc.createElement(tag); inner.replaceWith(w); w.appendChild(inner); inner = w; };
    if (weight && (weight[1] === "bold" || parseInt(weight[1], 10) >= 600)) wrap("strong");
    if (italic) wrap("em");
    if (under) wrap("u");
    el.removeAttribute("style");
  });

  // Clamp headings into the range .prose actually styles, the way Notion does.
  body.querySelectorAll("h5, h6").forEach(h => { const n = doc.createElement("h4"); n.innerHTML = h.innerHTML; h.replaceWith(n); });
  // Office/Docs noise that carries no meaning.
  body.querySelectorAll("meta, link, style, o\\:p, xml").forEach(n => n.remove());
  body.querySelectorAll("[class], [id]").forEach(n => { n.removeAttribute("class"); n.removeAttribute("id"); });
  // A style-only span is now an empty wrapper.
  body.querySelectorAll("span").forEach(s => { if (!s.attributes.length) s.replaceWith(...s.childNodes); });
  body.querySelectorAll("p").forEach(p => { if (!p.textContent.trim() && !p.querySelector("img")) p.remove(); });
  return body.innerHTML;
}

/* ---------- the composer ---------- */

// Collapsed until clicked. At rest it is a 44px invitation rather than an
// unlabelled 60px rectangle under a three-row toolbar; expanded it is the
// biggest thing on the page.
function composerHtml(o) {
  const t = o.targetId;
  if (!o.alwaysOpen && !composerOpen(t)) {
    return `<button type="button" class="composer-stub no-print" onclick="openComposer('${t}')">
      ${icon("edit", 16)} <span>${esc(o.placeholder || "Write a comment…")}</span>
    </button>`;
  }
  return `<div class="composer open no-print">
    ${rteBar(t)}
    <div class="rte prose" id="${t}" contenteditable="true" data-ph="${esc(o.placeholder || "Write a comment…")}"
      oninput="${o.oninput || ""}" onpaste="rtePaste(event,'${t}')"
      ondragover="event.preventDefault();this.classList.add('dragover')"
      ondragleave="this.classList.remove('dragover')" ondrop="rteDrop(event,'${t}')"
      onkeydown="rteKeys(event,'${t}')" onkeyup="rteSyncBubble()" onmouseup="rteSyncBubble()"
      onfocus="RTE_ACTIVE='${t}'">${rteSeed(o.html)}</div>
    ${rteBubbleHtml()}${rteInsertHtml()}
    <div class="composer-foot">
      <button class="primary" data-rte-post onclick="${o.onpost}">${esc(o.postLabel || "Comment")}</button>
      ${o.oncancel ? `<button onclick="${o.oncancel}">Cancel</button>` : ""}
      ${/* The keyboard shortcut is split into its own span so a phone can drop
            it. "⌘↵ to post" on a device with no Cmd key is an instruction that
            cannot be followed, and it was the longest thing in a hint that had
            no room to begin with. Hidden by the pointer:coarse block. */""}
      <span class="muted tny composer-hint">${esc(o.hint || "Paste photos, tables and text straight in.")}${o.hint ? "" : ` <span class="kbdhint">⌘↵ to post.</span>`}</span>
    </div>
  </div>`;
}
const COMPOSER_OPEN = new Set();
function composerOpen(t) { return COMPOSER_OPEN.has(t); }
function openComposer(t) { COMPOSER_OPEN.add(t); render(); setTimeout(() => { const el = document.getElementById(t); if (el) el.focus(); }, 0); }
function closeComposer(t) { COMPOSER_OPEN.delete(t); rteCloseInsert(); render(); }

function rteKeys(e, targetId) {
  if (e.key === "Escape") {
    const menu = document.getElementById("rte-insert");
    const menuWasOpen = !!(menu && !menu.hidden);
    rteCloseInsert();
    // Escape out of the insert menu first; a second press leaves the field.
    // Only rich FIELDS close on Escape — a comment composer holding an unposted
    // draft has a Cancel button and a saved draft, and closing it on a stray
    // keypress is how you lose an 800-word report.
    if (!menuWasOpen && typeof FIELD_EDIT === "object" && FIELD_EDIT && targetId === fieldTargetId(FIELD_EDIT)) cancelFieldEdit();
    return;
  }
  /* ⌘/Ctrl+Enter posts. The hint under every composer has promised this since
     the redesign and it never worked: commentKeys() was written for it and then
     never wired to anything. Done here, once, by clicking the composer's own
     post button — so it works for comments, notes and rich fields alike, and it
     respects the disable rteSetBusy() puts on that button while an image is
     still uploading. */
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    const el = document.getElementById(targetId);
    const shell = el && el.closest && el.closest(".composer");
    const btn = shell && shell.querySelector("[data-rte-post]");
    if (btn && !btn.disabled) { e.preventDefault(); btn.click(); return; }
  }
  rteMaybeSlash(e, targetId);
  rteInputRules(e, targetId);
  const c = COMMANDS.find(x => x.key && x.key === e.key.toLowerCase());
  if (c && (e.metaKey || e.ctrlKey) && c.id === "link") { e.preventDefault(); runCmd(c.id, targetId); }
}
// Force tag-based output so `.prose` can style it — Firefox otherwise emits
// <span style="font-weight:bold">, and `style` is no longer allowlisted.
function rteInit() {
  try {
    document.execCommand("styleWithCSS", false, false);
    // Enter should make a <p>, not a <div>: .prose styles paragraphs, and a
    // <div> soup is also what defeats a `> *` measure cap.
    document.execCommand("defaultParagraphSeparator", false, "p");
  } catch (e) {}
}
/* An empty contenteditable holds a bare text node with no block wrapper, and
   formatBlock has nothing to convert — so "## " silently did nothing while
   "- " (which inserts its own list) worked. Seeding one empty paragraph means
   there is always a block to format. */
function rteSeed(html) { return String(html || "").trim() ? html : "<p><br></p>"; }

/* ---------- editing and removing a comment ----------
   There was no edit and no delete anywhere in this app: a posted comment was
   permanent for everyone, including its author. Fine for a one-line remark,
   not fine for an 800-word report with a typo in the cure temperature.

   No subcollection. The comments array stays, and edits go through
   saveField -> fb.mutateField, which reads the CURRENT server value inside a
   transaction and re-applies the change — so a concurrent arrayUnion append
   from someone else is not clobbered, and the loser retries on fresh data.
   parts.js has been writing its comment log this way in production all along.

   Delete is SOFT. This is an engineering record: a resolved nonconformance
   thread that someone can silently vaporise is a QA problem, and keeping the
   element also keeps arrayUnion's identity semantics from surprising anyone
   later. The body is dropped on render; the fact that something was here, and
   who removed it, stays. */
const COMMENT_FIELD = { projects: "comments", parts: "commentLog", workOrders: "noteLog", schedule: "noteLog" };
function commentsOf(coll, rec) { return (rec && rec[COMMENT_FIELD[coll] || "comments"]) || []; }
function canEditComment(c) { return !!(c && (c.email === myEmail() || isLead())); }

let EDITING = null;             // { coll, id, cid } while a comment is open for edit
function editComment(coll, id, cid) { EDITING = { coll, id, cid }; render(); }
function cancelEditComment() { EDITING = null; rteCloseInsert(); render(); }
function editingThis(coll, id, cid) {
  return !!(EDITING && EDITING.coll === coll && EDITING.id === id && EDITING.cid === cid);
}
function saveEditComment(coll, id, cid) {
  const ed = document.getElementById("edit-" + cid);
  if (!ed) return;
  const html = sanitizeHtml(ed.innerHTML || "");
  if (!(ed.textContent || "").trim() && !/<img/i.test(html)) { toast("An empty comment isn't an edit — remove it instead.", "error"); return; }
  const rec = recById(coll, id);
  if (!rec) return;
  const field = COMMENT_FIELD[coll] || "comments";
  const at = new Date().toISOString();
  const patch = arr => (arr || []).map(c => c.id === cid ? { ...c, html, editedAt: at, editedBy: myEmail() } : c);
  rec[field] = patch(rec[field]);            // optimistic
  saveField(coll, rec, field, patch);
  EDITING = null;
  render();
}
function removeComment(coll, id, cid) {
  const rec = recById(coll, id);
  if (!rec) return;
  const field = COMMENT_FIELD[coll] || "comments";
  confirmModal("Remove this comment for everyone? The thread keeps a note that something was removed and who removed it.", () => {
    const at = new Date().toISOString();
    const patch = arr => (arr || []).map(c => c.id === cid
      ? { id: c.id, author: c.author, email: c.email, ts: c.ts, deleted: true, deletedBy: myEmail(), deletedAt: at }
      : c);
    rec[field] = patch(rec[field]);
    saveField(coll, rec, field, patch);
    render();
  });
}

/* One renderer for a thread, so tickets, parts, work orders and weeks all show
   the same thing and gain edit/delete at the same moment. */
function commentHtml(coll, id, c) {
  const who = esc(c.author || userName(c.email));
  if (c.deleted) {
    return `<div class="comment deleted" id="c-${esc(c.id || "")}">
      <div class="chead"><b>${who}</b><time>${fmtWhen(c.ts)}</time></div>
      <div class="muted tny">Removed by ${esc(userName(c.deletedBy) || c.deletedBy || "?")}${c.deletedAt ? " · " + fmtWhen(c.deletedAt) : ""}.</div>
    </div>`;
  }
  if (editingThis(coll, id, c.id)) {
    return `<div class="comment" id="c-${esc(c.id || "")}">
      <div class="chead">${avatar(c.email || c.author, 26)}<b>${who}</b><time>editing</time></div>
      ${composerHtml({
        targetId: "edit-" + c.id,
        html: sanitizeHtml(c.html || esc(c.text || "")),
        alwaysOpen: true,
        placeholder: "Edit this comment…",
        onpost: `saveEditComment('${coll}','${id}','${c.id}')`,
        oncancel: `cancelEditComment()`,
        postLabel: "Save changes",
        hint: "Editing is recorded — the comment will show that it was edited.",
      })}
    </div>`;
  }
  const body = c.html ? proseHtml(c.html) : esc(c.text || "").replace(/\n/g, "<br>");
  return `<div class="comment" id="c-${esc(c.id || "")}">
    <div class="chead">
      ${avatar(c.email || c.author, 26)}<b>${who}</b>
      ${c.editedAt ? `<span class="muted tny" title="Edited ${esc(fmtWhen(c.editedAt))}">edited</span>` : ""}
      <time>${fmtWhen(c.ts)}</time>
      ${canEditComment(c) ? `<span class="cacts no-print">
        <button class="ib sm" title="Edit" aria-label="Edit this comment" onclick="editComment('${coll}','${id}','${c.id}')">${icon("edit", 14)}</button>
        <button class="ib sm danger" title="Remove" aria-label="Remove this comment" onclick="removeComment('${coll}','${id}','${c.id}')">${icon("trash", 14)}</button>
      </span>` : ""}
    </div>
    <div class="prose">${body}</div>
  </div>`;
}
function threadHtml(coll, id, list, opts) {
  const o = opts || {};
  const rows = (list || []).map(c => commentHtml(coll, id, c)).join("");
  return `<h3 id="tk-comments">${list.length || ""} ${esc(o.noun || "Comment")}${list.length === 1 ? "" : "s"}</h3>
    ${rows || `<span class="muted">${esc(o.empty || "No comments yet.")}</span>`}`;
}

/* ---------- the always-there field ----------
   Simon's framing, and it is the right one: A DESCRIPTION IS JUST A COMMENT
   THAT IS ALWAYS THERE. The app had drifted into contradicting itself — a
   comment on a ticket took photos, tables and a pasted Google Doc, while the
   ticket's own Description took the same markup but was reachable only by
   pressing Edit at the top of the page and finding it in a form. Four other
   fields (a work order's notes, the part note, an issue's root cause, a
   purchase's notes) were bare textareas with no photos and no formatting at all.

   So: same composer, opened by clicking the text. No form, no edit mode.

   TWO STORAGE SHAPES, because the existing data has two.
     plain: false   the value IS sanitized html (ticket description)
     plain: true    the value is a plain string that something else still reads
                    — print.js prints wo.notes onto the paper traveler, and
                    statusGate() refuses to close an issue on whatHappened being
                    empty. Those keep working: the markup goes in <field>Html and
                    the plain key is kept in sync from textContent, which is the
                    same two-field trick saveStepNote() has been using in
                    production. Nothing needs backfilling — a record with no
                    <field>Html renders through the old escape-and-<br> path,
                    exactly as it does today. */
let FIELD_EDIT = null;                 // { coll, id, field, plain, orig }
function fieldTargetId(f) { return f ? "rf-" + f.coll + "-" + f.field : ""; }
function editingField(coll, id, field) {
  return !!(FIELD_EDIT && FIELD_EDIT.coll === coll && FIELD_EDIT.id === id && FIELD_EDIT.field === field);
}
// What to put in the editor and what to show at rest — one function, so the two
// can never disagree about which of the two keys wins.
function richFieldHtml(rec, field, plain) {
  if (!rec) return "";
  if (!plain) return sanitizeHtml(rec[field] || "");
  const rich = rec[field + "Html"];
  if (rich) return sanitizeHtml(rich);
  return esc(rec[field] || "").replace(/\n/g, "<br>");
}
function startFieldEdit(coll, id, field, plain) {
  const rec = recById(coll, id);
  FIELD_EDIT = { coll, id, field, plain: !!plain, orig: richFieldHtml(rec, field, !!plain) };
  render();
  setTimeout(() => { const el = document.getElementById(fieldTargetId(FIELD_EDIT)); if (el && el.focus) el.focus(); }, 0);
}
/* Clicking a link, a photo or a chip inside the text must do THAT, not drop you
   into an editor. The lightbox binds `.prose img` by delegation and does not
   stop propagation, so without this a photo in a description would open the
   viewer and the editor at the same time. */
function richFieldClick(e, coll, id, field, plain) {
  const t = e && e.target;
  if (t && t.closest && t.closest("a, img, button, .chip")) return;
  startFieldEdit(coll, id, field, plain);
}
/* rteSeed() puts <p><br></p> into an empty editor so formatBlock has a block to
   work on, so a never-touched empty field does NOT compare equal to the empty
   string it was opened with. Both sides are normalised, or opening and closing
   an empty description would ask you to confirm throwing away nothing. */
function fieldBlank(html) { return !String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/g, "") && !/<img/i.test(html || ""); }
function fieldDirty() {
  if (!FIELD_EDIT) return false;
  const el = document.getElementById(fieldTargetId(FIELD_EDIT));
  if (!el) return false;
  const now = sanitizeHtml(el.innerHTML || ""), was = FIELD_EDIT.orig || "";
  if (fieldBlank(now) && fieldBlank(was)) return false;
  return now !== was;
}
function cancelFieldEdit() {
  if (!FIELD_EDIT) return;
  const done = () => { FIELD_EDIT = null; rteCloseInsert(); render(); };
  // Only ask when there is something to lose. A field opened and closed
  // untouched — which is most of them — should just close.
  if (fieldDirty()) confirmModal("Throw away these changes?", done, { ok: "Discard" });
  else done();
}
function saveFieldEdit(coll, id, field, plain) {
  const el = document.getElementById(fieldTargetId(FIELD_EDIT || { coll, field }));
  if (!el) return;
  const rec = recById(coll, id);
  if (!rec) return;
  const html = sanitizeHtml(el.innerHTML || "");
  const text = String(el.textContent || "").trim();
  // An emptied field is a legitimate edit here, unlike an emptied comment —
  // "there is no description" is a thing someone means. But an editor holding
  // only <p><br></p> (what rteSeed puts there) is empty, not markup.
  const blank = !text && !/<img/i.test(html);
  if (plain) {
    rec[field] = text;
    rec[field + "Html"] = blank ? "" : html;
    save(coll, rec, field);
    save(coll, rec, field + "Html");
  } else {
    rec[field] = blank ? "" : html;
    save(coll, rec, field);
  }
  FIELD_EDIT = null;
  rteCloseInsert();
  render();
}
/* The rendered field. At rest it is the text itself, clickable; open it is the
   full composer, alwaysOpen — a collapsed stub would be wrong here, because you
   clicked the words to change the words. */
function richField(coll, id, field, opts) {
  const o = opts || {};
  const plain = !!o.plain;
  const rec = recById(coll, id);
  if (editingField(coll, id, field)) {
    if (o.upload) rteSetUpload(o.upload);
    return `<div class="richfield editing">${composerHtml({
      targetId: fieldTargetId(FIELD_EDIT),
      html: richFieldHtml(rec, field, plain),
      alwaysOpen: true,
      placeholder: o.placeholder || "Write something…",
      onpost: `saveFieldEdit('${coll}','${id}','${field}',${plain})`,
      oncancel: `cancelFieldEdit()`,
      postLabel: o.postLabel || "Save",
      hint: o.hint || "Paste photos, tables and text straight in. ⌘↵ to save, esc to cancel.",
    })}</div>`;
  }
  const body = richFieldHtml(rec, field, plain);
  const label = esc(o.label || field);
  return `<div class="richfield prose" role="button" tabindex="0" title="Click to edit"
    aria-label="${label} — click to edit"
    onclick="richFieldClick(event,'${coll}','${id}','${field}',${plain})"
    onkeydown="if(event.key==='Enter'){event.preventDefault();startFieldEdit('${coll}','${id}','${field}',${plain})}"
    >${body ? proseHtml(body)
      : `<span class="rf-empty">${icon("edit", 15)} ${esc(o.empty || o.placeholder || "Write something…")}</span>`}</div>`;
}
