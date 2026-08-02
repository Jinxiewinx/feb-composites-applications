"use strict";
/* gdocs.js — Google Docs, Slides and Sheets attached to the things they are
   about.

   WHY THIS EXISTS. The team writes in Google Docs and presents in Google
   Slides, and shares both by pasting a URL into Slack, where it is findable for
   about a day. #composites, 2026-04-20:

     Arnav:  where do you have the weight of all the aero components
     Simon:  Every weight is in composites master tracker
     Arnav:  can you send link
     Arnav:  too many spreadsheets
     Simon:  https://docs.google.com/spreadsheets/d/1vnBlgBzMf...
     Simon:  That should be it

   The lead hedging on his own link, to a spreadsheet whose URL he had already
   pasted seven months earlier. The ShopSabre training doc was pasted four
   separate times. PP-09 names the general form: "Slack captures events but is
   unsearchable-by-part."

   THE DESIGN CONSTRAINT that shapes everything here: this must never become a
   step someone has to complete before they can use the app. So there is no
   OAuth, no Drive API, no API key, no consent screen, and nothing for a member
   to authorise. Everything below runs off the URL string itself. The worst case
   is identical to pasting a link into Slack, which is what people already do.

   Two things are deliberately NOT here, and both were measured rather than
   assumed (2026-08-01):
   - The Drive Picker and Drive API would give real titles and thumbnails, but
     the app's auth is email/password (fb.js has no GoogleAuthProvider), so they
     would put a second Google sign-in in front of all ~15 members.
   - Google publishes no oEmbed endpoint; docs.google.com/oembed 404s. */

/* Every Google surface we care about, by URL shape. Order matters only in that
   each pattern is anchored enough not to catch another's URLs.

   `embed` is a function rather than a string because Slides published to the
   web use a different id space (/d/e/2PACX-...) and a different viewer. */
const GDOC_KINDS = [
  {
    kind: "doc", label: "Google Doc", short: "DOC", icon: "documents",
    re: /docs\.google\.com\/document\/d\/(?:e\/)?([\w-]+)/i,
    embed: id => `https://docs.google.com/document/d/${id}/preview`,
  },
  {
    kind: "slides", label: "Google Slides", short: "SLIDES", icon: "presentation",
    re: /docs\.google\.com\/presentation\/d\/(?:e\/)?([\w-]+)/i,
    // A published deck (/d/e/2PACX-...) only renders through /embed; a normal
    // one renders through either. /embed works for both, so it is the one used.
    embed: id => `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false`,
  },
  {
    kind: "sheet", label: "Google Sheet", short: "SHEET", icon: "reports",
    re: /docs\.google\.com\/spreadsheets\/d\/(?:e\/)?([\w-]+)/i,
    embed: id => `https://docs.google.com/spreadsheets/d/${id}/preview`,
  },
  {
    kind: "form", label: "Google Form", short: "FORM", icon: "file",
    re: /docs\.google\.com\/forms\/d\/(?:e\/)?([\w-]+)/i,
    embed: null, // a form in a frame inside a work order is a way to submit it twice
  },
  {
    kind: "drive", label: "Drive file", short: "DRIVE", icon: "file",
    re: /drive\.google\.com\/file\/d\/([\w-]+)/i,
    embed: id => `https://drive.google.com/file/d/${id}/preview`,
  },
  {
    kind: "folder", label: "Drive folder", short: "FOLDER", icon: "archive",
    re: /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/i,
    embed: null, // Drive refuses to frame a folder listing
  },
];

/* Parse a pasted URL. Returns null only for something that isn't an https URL
   at all.

   A non-Google https URL comes back as kind "link" rather than being rejected.
   Refusing to store a Notion page or a McMaster part URL would be its own small
   blocker, and the whole point of this feature is not to be one. */
function parseGoogleUrl(raw) {
  const url = String(raw || "").trim();
  if (!/^https:\/\//i.test(url)) return null;
  for (const k of GDOC_KINDS) {
    const m = url.match(k.re);
    if (m) return { kind: k.kind, fileId: m[1], url, openUrl: url, embedUrl: k.embed ? k.embed(m[1]) : "" };
  }
  return { kind: "link", fileId: "", url, openUrl: url, embedUrl: "" };
}
function gdocKind(kind) {
  return GDOC_KINDS.find(k => k.kind === kind)
    || { kind: "link", label: "Link", short: "LINK", icon: "paperclip", embed: null };
}

/* Best-effort title. docs.google.com echoes the requesting origin in
   access-control-allow-origin (measured 2026-08-01), and serves an og:title
   meta tag, so the browser can read the real document name with no auth at all
   for anything link-shared or published.

   It fails for a doc restricted to the team, which is most of them. That is
   fine and expected: this ALWAYS resolves, never rejects, and the caller falls
   back to whatever the person typed. A title is a convenience; the link is the
   feature. Nothing here is allowed to block a save. */
function fetchDocTitle(embedOrUrl) {
  return new Promise(resolve => {
    if (!embedOrUrl || typeof fetch !== "function") return resolve("");
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v || ""); } };
    // Belt and braces: AbortController where it exists, plus a hard timer, so a
    // hung request can never leave the modal waiting.
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    setTimeout(() => { if (ctl) try { ctl.abort(); } catch (e) { /* already done */ } finish(""); }, 3500);
    fetch(embedOrUrl, ctl ? { signal: ctl.signal } : undefined)
      .then(r => (r.ok ? r.text() : ""))
      .then(html => {
        const m = String(html || "").match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
          || String(html || "").match(/<title[^>]*>([^<]+)<\/title>/i);
        let t = m ? m[1].trim() : "";
        // Google suffixes the site name on the <title> fallback.
        t = t.replace(/\s*[-–]\s*Google\s+(Docs|Slides|Sheets|Drive)\s*$/i, "").trim();
        // A sign-in wall renders with its own title; that is not a document name.
        if (/^sign in|^meet google|^google (docs|slides|sheets|drive)$/i.test(t)) t = "";
        finish(t);
      })
      .catch(() => finish(""));
  });
}

/* ---------- the shared row ----------
   One renderer for all five placements (team shelf, tickets, work orders,
   parts, weekly plan), so a document looks the same everywhere it appears.
   Built from .docrow / .doclist / .docview, which the Documents tab already
   defines — no new component, and the design system needs no change. */

// Which previews are currently expanded, by link id. Module-level so it
// survives the re-render that opening one triggers.
const GD_OPEN = new Set();

function toggleDocPreview(id) {
  if (GD_OPEN.has(id)) GD_OPEN.delete(id); else GD_OPEN.add(id);
  render();
}

function docLinkRow(d, opts) {
  const k = gdocKind(d.kind);
  const open = GD_OPEN.has(d.id);
  const canPreview = !!(d.embedUrl || (k.embed && d.fileId));
  const embed = d.embedUrl || (k.embed && d.fileId ? k.embed(d.fileId) : "");
  const rm = opts && opts.onRemove
    ? `<button class="danger ib no-print" title="Remove this link" aria-label="Remove ${esc(d.title || d.url)}" onclick="event.stopPropagation();${opts.onRemove}('${esc(d.id)}')">${icon("trash", 14)}</button>`
    : "";
  return `<div class="doclink">
    <div class="docrow" onclick="${canPreview ? `toggleDocPreview('${esc(d.id)}')` : `window.open('${esc(d.openUrl || d.url)}','_blank','noopener')`}">
      <span class="di">${icon(k.icon, 18)}</span>
      <span class="dl-t">${esc(d.title || d.url)}${d.note ? `<span class="muted tny"> · ${esc(d.note)}</span>` : ""}</span>
      <span class="dsz">${esc(k.short)}
        <a href="${esc(d.openUrl || d.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><button class="sm">Open</button></a>${rm}
        ${canPreview ? `<span class="dl-cv" aria-hidden="true">${icon(open ? "chevronDown" : "chevronRight", 14)}</span>` : ""}
      </span>
    </div>
    ${open && canPreview ? `<div class="dl-prev no-print">
      <iframe class="docview" src="${esc(embed)}" title="${esc(d.title || "Google preview")}" loading="lazy"></iframe>
      <p class="muted tny">Blank? You are probably signed into a different Google account, or you do not have access to this one.
        <a href="${esc(d.openUrl || d.url)}" target="_blank" rel="noopener">Open it in a new tab</a> to find out which.</p>
    </div>` : ""}
  </div>`;
}

/* The list, with the app's own empty-state voice: state the absence, name the
   button that fixes it in bold, and let "yet" carry the sense that empty is
   normal. Matches documents.js / projects.js / stock.js. */
function docLinkList(list, opts) {
  const o = opts || {};
  if (!list || !list.length) {
    return `<div class="muted">${esc(o.empty || "No documents linked yet.")}${o.addLabel ? ` <b>${esc(o.addLabel)}</b> to add one.` : ""}</div>`;
  }
  return `<div class="doclist">${list.map(d => docLinkRow(d, o)).join("")}</div>`;
}

/* ---------- adding one ---------- */

// Where the modal will write when it is submitted. Set by openDocLinkModal.
let GD_TARGET = null;

function openDocLinkModal(target) {
  GD_TARGET = target || null;
  const shelf = target && target.coll === "documents";
  openModal(`
    <h2>${shelf ? "Pin a document" : "Link a document"}</h2>
    <p class="muted">Paste a Google Docs, Slides, Sheets or Drive link. ${shelf
      ? "Pinned documents show at the top of this tab for everyone."
      : "It will show on this record for everyone."}</p>
    <div class="field"><label for="gd-url">Link</label>
      <input id="gd-url" autofocus placeholder="https://docs.google.com/..." oninput="gdUrlChanged()">
    </div>
    <div id="gd-kind"></div>
    <div class="field"><label for="gd-title">Title</label>
      <input id="gd-title" placeholder="What is it called?">
      <div id="gd-title-note" class="muted tny"></div>
    </div>
    <div class="field"><label for="gd-note">Note <span class="muted nocaps">— optional, why anyone would open it</span></label>
      <input id="gd-note" placeholder="e.g. every part mass lives here">
    </div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="submitDocLink()">${shelf ? "Pin it" : "Link it"}</button>
    </div>
  `);
}

/* Runs on every keystroke: names the kind as soon as the URL is recognisable,
   then tries for the real title once. Deliberately does not clear a title the
   person typed themselves. */
let GD_TRIED = "";
function gdUrlChanged() {
  const el = document.getElementById("gd-url");
  const box = document.getElementById("gd-kind");
  if (!el || !box) return;
  const p = parseGoogleUrl(el.value);
  if (!p) {
    box.innerHTML = el.value.trim()
      ? `<p class="gate"><span class="gi">!</span><span>That does not look like a link. It needs to start with <code>https://</code>.</span></p>` : "";
    return;
  }
  const k = gdocKind(p.kind);
  box.innerHTML = `<p class="muted tny">${icon("check", 13)} ${esc(k.label)}${p.kind === "link" ? " (not a Google document, still fine to link)" : ""}</p>`;
  if (p.fileId && GD_TRIED !== p.fileId) {
    GD_TRIED = p.fileId;
    const note = document.getElementById("gd-title-note");
    if (note) note.textContent = "Looking up the name…";
    fetchDocTitle(p.embedUrl || p.url).then(t => {
      const ti = document.getElementById("gd-title"), n = document.getElementById("gd-title-note");
      if (!ti || !n) return;                       // modal closed while we waited
      if (t && !ti.value.trim()) { ti.value = t; n.textContent = "Found automatically. Edit it if it is wrong."; }
      else n.textContent = t ? "" : "Could not read the name (that is normal for a team-only document). Type one.";
    });
  }
}

function submitDocLink() {
  const url = (document.getElementById("gd-url") || {}).value || "";
  const p = parseGoogleUrl(url);
  if (!p) { toast("That needs to be a link starting with https://.", "error"); return; }
  const title = ((document.getElementById("gd-title") || {}).value || "").trim();
  const note = ((document.getElementById("gd-note") || {}).value || "").trim();
  const t = GD_TARGET; GD_TARGET = null; GD_TRIED = "";
  closeModal();
  if (!t) return;
  const rec = {
    id: "GD" + Date.now(), url: p.url, openUrl: p.openUrl, embedUrl: p.embedUrl,
    kind: p.kind, fileId: p.fileId,
    title: title || p.url, note, by: myEmail(), ts: new Date().toISOString(),
  };
  addDocLink(t, rec);
}

/* One writer for all five placements. The shelf is a `documents` record so it
   inherits that collection's rules, its place in allDocs(), and global search;
   everything else is a `docs` array on the record it belongs to, appended
   through arrayUnion so two people linking at once don't clobber each other —
   the same concurrency shape ticket files already use. */
function addDocLink(target, rec) {
  if (target.coll === "documents") {
    const d = { ...rec, category: "Team shelf", pinned: true };
    DB.documents.push(d);
    save("documents", d);
    render();
    toast("Pinned. It is on the Documents tab for everyone.");
    return;
  }
  const r = recById(target.coll, target.id);
  if (!r) { toast("That record is gone.", "error"); return; }
  r.docs = (r.docs || []).concat([rec]);
  if (fb.appendTo) fb.appendTo(target.coll, target.id, "docs", rec).catch(() => save(target.coll, r, "docs"));
  else save(target.coll, r, "docs");
  render();
  toast("Linked for everyone.");
}

/* Removing one. Ticket file uploads have no delete path at all, which means
   "attached the wrong thing" has no remedy there; links are not going to repeat
   that. Confirmed because it is a shared record, same as delDocument(). */
function removeDocLink(coll, id, linkId) {
  const r = recById(coll, id);
  if (!r) return;
  const d = (r.docs || []).find(x => x.id === linkId);
  confirmModal(`Remove ${d && d.title ? `"${d.title}"` : "this link"} from this record for everyone? The document itself is untouched.`, () => {
    r.docs = (r.docs || []).filter(x => x.id !== linkId);
    save(coll, r, "docs");
    render();
  });
}
