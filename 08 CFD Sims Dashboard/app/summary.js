/* summary.js — the numbers, side by side, before you look at a single plot.

   Half of "compare these two reports" is not visual at all. It is: did the mesh
   change, did it converge, what did drag and lift actually come out at. All of
   that is sitting in the text layer of the setup pages, so pulling it into one
   table answers the question in a glance and tells you whether the plots are
   even worth comparing.

   Extraction is regex over the page text. That is fragile in general, but these
   PDFs come out of one exporter with a fixed layout, and a field that fails to
   match shows as a dash rather than a wrong number. */

import { S, el, esc } from "./core.js";

// Regexes live in extract.js so upload-time extraction and this table agree.
import { FIELDS, residuals, reportDefs } from "./extract.js";

function docText(d) { return d.index.text.map(t => t.text).join("  "); }

function numeric(a, b) {
  const na = parseFloat(String(a).replace(/,/g, "")), nb = parseFloat(String(b).replace(/,/g, ""));
  if (!isFinite(na) || !isFinite(nb) || na === 0) return null;
  return ((nb - na) / Math.abs(na)) * 100;
}

export function renderSummary(main) {
  const docs = S.docs.filter(d => d.index);
  const wrap = el("div", "summary");
  main.appendChild(wrap);

  if (docs.length < 2) {
    wrap.appendChild(el("p", "none", "Open a second report to compare the numbers."));
    return;
  }

  const texts = docs.map(docText);

  const table = (title, rows) => {
    wrap.appendChild(el("h2", "", esc(title)));
    const t = el("table");
    t.innerHTML = `<thead><tr><th>Field</th>${docs.map(d =>
      `<th><span style="color:${d.color}">■</span> ${esc(d.name)}</th>`).join("")}</tr></thead>`;
    const body = el("tbody");
    let any = false;
    for (const [label, get] of rows) {
      const vals = texts.map(get);
      if (vals.every(v => v == null)) continue;
      any = true;
      const changed = new Set(vals.map(v => String(v))).size > 1;
      const tr = el("tr", changed ? "changed" : "");
      tr.innerHTML = `<td class="k">${esc(label)}</td>` + vals.map((v, i) => {
        let extra = "";
        if (changed && i > 0) {
          const pct = numeric(vals[0], v);
          if (pct != null && Math.abs(pct) >= 0.005) extra = `<span class="delta">${pct > 0 ? "+" : ""}${pct.toFixed(2)}%</span>`;
        }
        return `<td class="v">${v == null ? "<span class='none'>—</span>" : esc(v)}${extra}</td>`;
      }).join("");
      body.appendChild(tr);
    }
    t.appendChild(body);
    if (any) wrap.appendChild(t);
    else wrap.lastElementChild.remove();
  };

  for (const [group, rows] of FIELDS) table(group, rows);

  // Residuals get their own table because which ones exist depends on the
  // turbulence model, so the row list has to come from the documents.
  const resNames = [...new Set(texts.flatMap(t => Object.keys(residuals(t))))];
  if (resNames.length) {
    table("Final residuals", resNames.map(n => [n, t => residuals(t)[n] ?? null]));
  }

  // Panel inventory: the fastest way to see the reports are even comparable.
  wrap.appendChild(el("h2", "", "Plot inventory"));
  const inv = el("table");
  const names = docs.map(d => new Set(d.index.panels.map(p => p.name)));
  const union = [...new Set(docs.flatMap(d => d.index.panels.map(p => p.name)))];
  const shared = union.filter(n => names.every(s => s.has(n)));
  inv.innerHTML = `<thead><tr><th>Field</th>${docs.map(d => `<th>${esc(d.name)}</th>`).join("")}</tr></thead>
    <tbody>
      <tr><td class="k">Pages</td>${docs.map(d => `<td class="v">${d.index.numPages}</td>`).join("")}</tr>
      <tr><td class="k">Named plots</td>${docs.map(d => `<td class="v">${d.index.panels.length}</td>`).join("")}</tr>
      <tr class="${shared.length === union.length ? "" : "changed"}">
        <td class="k">In both</td><td class="v" colspan="${docs.length}">${shared.length} of ${union.length}
        ${shared.length === union.length ? "(every plot lines up)" : "(" + esc(union.filter(n => !shared.includes(n)).slice(0, 8).join(", ")) + " not in all)"}</td></tr>
    </tbody>`;
  wrap.appendChild(inv);

  const defs = reportDefs(texts[0]);
  if (defs.length) {
    wrap.appendChild(el("h2", "", "Report definitions"));
    wrap.appendChild(el("p", "none", esc(defs.join(", "))));
  }
}
