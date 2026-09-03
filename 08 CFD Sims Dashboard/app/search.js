/* search.js — find a plot, or find a number.

   Two kinds of hit, deliberately kept in one box:

   - panel names, which is the common case ("where's stat-car-3"). Matching is
     subsequence-based so "swc" finds "stat-wing-crop" and "vc0" finds
     "velo-car-0", because the names are terse and typing them exactly is
     tedious.
   - full document text, which covers the setup pages: mesh counts, boundary
     conditions, solver settings. Useful for "which of these ran k-omega".

   Selecting a panel hit moves every report to that panel at once. That is the
   point: search is how you drive the comparison, not a side feature. */

import { S, $, el, esc, panelRows, selectPanel } from "./core.js";

/* Ordered-subsequence match, with a score that prefers tight, early hits. */
function fuzzy(needle, hay) {
  const n = needle.toLowerCase(), h = hay.toLowerCase();
  if (!n) return { hit: true, score: 0, marks: [] };
  let i = 0, score = 0, last = -1;
  const marks = [];
  for (const ch of n) {
    const at = h.indexOf(ch, i);
    if (at < 0) return { hit: false };
    if (last >= 0) score += at - last - 1;      // gaps cost
    if (at === 0 || /[^a-z0-9]/.test(h[at - 1])) score -= 3;  // word starts are good
    marks.push(at);
    last = at; i = at + 1;
  }
  return { hit: true, score: score + last * 0.1, marks };
}
function highlight(text, marks) {
  if (!marks || !marks.length) return esc(text);
  let out = "", prev = 0;
  for (const m of marks) {
    out += esc(text.slice(prev, m)) + "<mark>" + esc(text[m]) + "</mark>";
    prev = m + 1;
  }
  return out + esc(text.slice(prev));
}

export function focusSearch() { const i = $("#search"); i.focus(); i.select(); }

export function renderSearch() {
  const box = $("#search");
  const out = $("#results");
  const count = $("#searchcount");
  if (box.value !== S.query) box.value = S.query;

  box.oninput = () => { S.query = box.value; renderSearch(); };
  box.onkeydown = e => {
    if (e.key === "Escape") { S.query = ""; box.value = ""; renderSearch(); box.blur(); }
    if (e.key === "Enter") { const f = out.querySelector(".rrow"); if (f) f.click(); }
  };

  const rows = panelRows();
  out.innerHTML = "";

  if (!rows.length) {
    count.textContent = "";
    out.innerHTML = `<div class="rsnip">Open a report to search its plots.</div>`;
    return;
  }

  const q = S.query.trim();
  const scored = rows
    .map(r => ({ r, m: fuzzy(q, r.name) }))
    .filter(x => x.m.hit)
    .sort((a, b) => a.m.score - b.m.score);

  count.textContent = q ? `${scored.length} of ${rows.length}` : `${rows.length} plots`;

  let section = null;
  for (const { r, m } of scored.slice(0, 300)) {
    if (r.section !== section) {
      section = r.section;
      out.appendChild(el("div", "rgroup", esc(section || "Other")));
    }
    const missing = r.cells.filter(c => !c).length;
    const row = el("div", "rrow" + (r.id === S.panelId ? " active" : ""));
    row.innerHTML = `<span class="nm">${highlight(r.name, q ? m.marks : [])}</span>
      ${missing ? `<span class="missing">missing in ${missing}</span>` : ""}
      <span class="pg">p${(r.cells.find(Boolean) || {}).page ?? ""}</span>`;
    row.onclick = () => { selectPanel(r.id); renderSearch(); };
    out.appendChild(row);
  }

  // Full text, only once the query is specific enough to be worth the noise.
  if (q.length >= 3) {
    const hits = [];
    for (const d of S.docs.filter(x => x.index)) {
      for (const pg of d.index.text) {
        const at = pg.text.toLowerCase().indexOf(q.toLowerCase());
        if (at < 0) continue;
        hits.push({ doc: d, page: pg.page, snippet: pg.text.slice(Math.max(0, at - 45), at + 75) });
        if (hits.length > 40) break;
      }
    }
    if (hits.length) {
      out.appendChild(el("div", "rgroup", "In the text"));
      for (const h of hits.slice(0, 25)) {
        const row = el("div", "rrow");
        row.innerHTML = `<span class="nm" style="color:var(--muted)">${esc(h.snippet.trim())}</span>
          <span class="pg">${esc(h.doc.name)} p${h.page}</span>`;
        row.onclick = () => {
          // Jump to the nearest panel at or above that page, so the page view
          // lands somewhere meaningful rather than at a raw offset.
          const cands = h.doc.index.panels.filter(p => p.page <= h.page);
          const p = cands[cands.length - 1] || h.doc.index.panels[0];
          if (p) selectPanel(p.id);
        };
        out.appendChild(row);
      }
    }
  }

  if (!out.children.length) out.innerHTML = `<div class="rsnip">Nothing matches “${esc(q)}”.</div>`;
}
