/* extract.js — numbers out of a report's text layer. No DOM, node-testable.

   The Fluent export prints its results once, verbatim, in the Report
   Definitions block (page 8 of DP_22):
     total-lift -486.6432 N total-cl -1.986299 total-drag 179.6394 N total-cd 0.733222
     ut-cl -0.7857225 ut-lift -192.502 N ... fwing-... rwing-...
   Lift is negative for downforce, Fluent's convention, kept as printed: the
   dashboard flips the sign for display and says so. Field order differs
   between `total` and the elements, so every value is keyed by its name.

   Regex over text is fragile in general; these PDFs come out of one exporter
   with one layout, and a field that fails to match is simply absent rather
   than a wrong number. */

export function cap(text, re) {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/* The summary table's fields. Kept here so upload-time extraction and the
   Summary view read the same regexes. */
export const FIELDS = [
  ["Report", [
    ["Design point", t => cap(t, /^\s*(DP\s*\d+)/)],
    ["Analyst", t => cap(t, /Analyst\s+(\S+)/)],
    ["Date", t => cap(t, /Date\s+(\d{1,2}\/\d{1,2}\/\d{4}[^A-Za-z]*[AP]M)/)],
  ]],
  ["Mesh", [
    ["Cells", t => cap(t, /Cells\s+Faces\s+Nodes\s+(\d+)/)],
    ["Faces", t => cap(t, /Cells\s+Faces\s+Nodes\s+\d+\s+(\d+)/)],
    ["Nodes", t => cap(t, /Cells\s+Faces\s+Nodes\s+\d+\s+\d+\s+(\d+)/)],
    ["Min orthogonal quality", t => cap(t, /Min Orthogonal Quality[^\d]*([\d.eE+-]+)/)],
    ["Max aspect ratio", t => cap(t, /Max Aspect Ratio[^\d]*[\d.eE+-]+\s+([\d.eE+-]+)/)],
  ]],
  ["Solver", [
    ["Version", t => cap(t, /Version\s+([\d.\-]+)/)],
    // Anchored on "Application <solver> Settings", because the table of
    // contents also contains the bare word "Settings" and a loose match walks
    // off and swallows the whole TOC.
    ["Solver", t => cap(t, /Application\s+(\S+)\s+Settings/)],
    ["Settings", t => cap(t, /Application\s+\S+\s+Settings\s+(.+?)\s+Version\s/)],
    ["Viscous model", t => cap(t, /Viscous\s+(.+?)\s+(?:Material Properties|Cell Zone)/)],
    ["Time", t => cap(t, /Time\s+(Steady|Transient)/)],
  ]],
  ["Run", [
    ["Iterations", t => cap(t, /Iterations:\s*(\d+)/)],
    /* Freestream velocity is a named expression, not a boundary-condition
       number: the inlet reads "Velocity Magnitude  inletv". Reading the literal
       next to "Velocity Magnitude" picks up the gauge pressure instead, so go to
       the Named Expressions table and take inletv's evaluated value. */
    ["Inlet velocity", t => {
      const m = t.match(/\binletv\s+[\d.eE+-]+\s+([\d.eE+-]+)\s*\[\s*m\s*s\^-1\s*\]/);
      return m ? m[1] + " m/s" : null;
    }],
    ["Wheel speed", t => {
      const m = t.match(/\bwheelspeed\s+.*?\s([\d.eE+-]+)\s*\[\s*s\^-1/);
      return m ? m[1] + " rad/s" : null;
    }],
  ]],
];

/* Residual convergence: "continuity 0.0156 ..." style rows on Solution Status. */
export function residuals(text) {
  const out = {};
  const names = ["continuity", "x-velocity", "y-velocity", "z-velocity", "k", "omega", "epsilon"];
  for (const n of names) {
    const m = text.match(new RegExp("\\b" + n + "\\s+([\\d.eE+-]+)"));
    if (m) out[n] = m[1];
  }
  return out;
}

/* The Report Definitions window: from that heading to the Plots section.
   Bounded on purpose. Past "Plots" the same names reappear as "-rplot" axis
   titles followed by tick numbers (50 100 150 200), which would parse as
   values. */
function defsWindow(text) {
  /* The table of contents on page 1 also says "Report Definitions 8 Plots 9",
     which is a window five characters wide. Take the widest window of all
     occurrences, which is the real block. */
  let best = "";
  const re = /Report Definitions(.+?)(?:\bPlots\b|$)/gs;
  let m;
  while ((m = re.exec(text))) if (m[1].length > best.length) best = m[1];
  return best;
}

/* Which report definitions exist, by name. */
export function reportDefs(text) {
  const w = defsWindow(text);
  return [...new Set(w.match(/[a-z]+-[a-z]+(?:-rplot)?/g) || [])].slice(0, 24);
}

/* The values. Returns { total: {lift, drag, cl, cd}, fwing: {...}, ... } with
   only the keys that matched; an empty object when the block is absent.
   Numbers are as printed (lift negative = downforce). */
const QTY = new Set(["lift", "drag", "cl", "cd"]);
export function resultsFrom(text) {
  const w = defsWindow(text);
  const out = {};
  const re = /\b([a-z]+(?:-[a-z0-9]+)*?)-(lift|drag|cl|cd)\s+(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s|$)/g;
  let m;
  while ((m = re.exec(w))) {
    const [, part, qty, num] = m;
    if (!QTY.has(qty) || /rplot/.test(part)) continue;
    const v = Number(num);
    if (!Number.isFinite(v)) continue;
    (out[part] ||= {})[qty] = v;
  }
  return out;
}

/* Design point number: the name first ("DP_22", "DP 22", "dp22", "DP-22b"),
   then the PDF's own first token. null when neither says. */
export function dpFrom(name, text) {
  const n = String(name || "").match(/\bDP[\s_-]?(\d{1,4})(?!\d)/i);
  if (n) return Number(n[1]);
  const t = String(text || "").match(/^\s*DP\s*(\d{1,4})\b/);
  return t ? Number(t[1]) : null;
}

/* The handful of setup fields the card and the trends need. Strings, as the
   summary shows them. */
export function metaFrom(text) {
  const get = (group, label) => {
    const g = FIELDS.find(f => f[0] === group); const row = g && g[1].find(r => r[0] === label);
    return row ? row[1](text) : null;
  };
  const out = {};
  const put = (k, v) => { if (v != null) out[k] = v; };
  put("analyst", get("Report", "Analyst"));
  put("date", get("Report", "Date"));
  const cells = get("Mesh", "Cells"); if (cells) out.cells = Number(cells);
  const it = get("Run", "Iterations"); if (it) out.iterations = Number(it);
  put("inletV", get("Run", "Inlet velocity"));
  put("viscous", get("Solver", "Viscous model"));
  return out;
}

/* Downforce and drag for display: positive newtons, from total.lift and
   total.drag, plus L/D. Missing pieces stay null. */
export function headline(results) {
  const t = results && results.total;
  if (!t) return { downforce: null, drag: null, ld: null, cl: null, cd: null };
  const downforce = typeof t.lift === "number" ? -t.lift : null;
  const drag = typeof t.drag === "number" ? t.drag : null;
  const ld = downforce != null && drag ? downforce / drag : null;
  return { downforce, drag, ld, cl: t.cl ?? null, cd: t.cd ?? null };
}
