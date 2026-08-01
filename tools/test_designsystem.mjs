/* test_designsystem.mjs — the app and 06 Design System must not drift apart.
 *
 * WHY THIS EXISTS
 * 06 Design System/ was extracted FROM the app's stylesheet, not imported by
 * it. That leaves two copies of the same design with nothing holding them
 * together, and copies rot: by the time anyone looked, the app's kanban column
 * and modal had drifted 1px off the radius token, .stage had lost its
 * background, and .avatar had lost its fill. None of that is visible in a
 * screenshot. All of it is visible to a diff.
 *
 * So this is the diff, run as a test. It needs no browser and no Firebase, so
 * it can run on every change in about a second.
 *
 *   node tools/test_designsystem.mjs
 *   node tools/test_designsystem.mjs -v      also list what it compared
 *
 * If a check here fails, the fix is nearly always in the app: 06 is the
 * published copy other things now read (the website, claude.ai/design), so it
 * is the one that should stay stable. The exception is a genuinely new
 * component, which belongs in components.css AND in
 * .design-sync/conventions.md — see the rule at the end of
 * 06 Design System/README.md.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERBOSE = process.argv.includes("-v");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; if (VERBOSE) console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "\n         " + detail : ""}`); }
};

const appHtml = readFileSync(join(ROOT, "03 App", "app", "index.html"), "utf8");
const tokensCss = readFileSync(join(ROOT, "06 Design System", "tokens.css"), "utf8");
const compCss = readFileSync(join(ROOT, "06 Design System", "components.css"), "utf8");

const styleStart = appHtml.indexOf("<style>");
const styleEnd = appHtml.indexOf("</style>");
const appCss = appHtml.slice(styleStart + 7, styleEnd);

/* ---------------------------------------------------------------- syntax --
   A stylesheet is not a program: an unbalanced comment or brace does not
   error, it silently swallows every rule until the parser resynchronises.
   That is how a "fixed" tap-target rule can be in the file, look right in
   review, and do nothing. Cheap to check, and it fails loudly. */

function commentSpans(css) {
  const spans = [];
  let i = 0;
  while (true) {
    const a = css.indexOf("/*", i);
    if (a < 0) break;
    const b = css.indexOf("*/", a + 2);
    if (b < 0) return { spans, unterminated: a };
    spans.push([a, b + 2]);
    i = b + 2;
  }
  return { spans, unterminated: -1 };
}

/* CSS with every comment blanked out, so brace counting and rule parsing
   below can't be fooled by a brace inside prose. */
function stripComments(css) {
  const { spans } = commentSpans(css);
  let out = css;
  for (const [a, b] of spans.reverse()) out = out.slice(0, a) + " ".repeat(b - a) + out.slice(b);
  return out;
}

for (const [label, css] of [["app", appCss], ["tokens.css", tokensCss], ["components.css", compCss]]) {
  const { unterminated } = commentSpans(css);
  ok(`${label}: comments terminate`, unterminated < 0,
    unterminated < 0 ? "" : `unterminated /* at offset ${unterminated}: ${css.slice(unterminated, unterminated + 60).replace(/\n/g, " ")}`);

  const bare = stripComments(css);
  /* Prose that escaped its comment is the specific failure: a line of English
     sitting where a selector should be. It shows up as a "declaration" with no
     colon inside a block, or as stray text with no braces around it. Counting
     braces catches the structural half. */
  const open = (bare.match(/\{/g) || []).length, close = (bare.match(/\}/g) || []).length;
  ok(`${label}: braces balance`, open === close, `${open} { vs ${close} }`);

  /* A line ending in "*/" that has no matching "/*" before it means a comment
     was closed twice — which is what leaks prose into the parser. */
  const doubles = bare.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /\*\//.test(l));
  ok(`${label}: no orphan comment ends`, doubles.length === 0,
    doubles.slice(0, 2).map(([n, l]) => `line ${n}: ${l.trim().slice(0, 60)}`).join("; "));
}

/* ---------------------------------------------------------------- tokens --
   Every custom property in a given block, by name. Compared block for block,
   because a token that is correct in light and wrong in dark is exactly the
   kind of bug nobody sees until someone flips the theme at 11pm. */

function tokenBlock(css, selector) {
  const bare = stripComments(css);
  const i = bare.indexOf(selector);
  if (i < 0) return null;
  const open = bare.indexOf("{", i);
  let depth = 0, end = open;
  for (let k = open; k < bare.length; k++) {
    if (bare[k] === "{") depth++;
    else if (bare[k] === "}") { depth--; if (!depth) { end = k; break; } }
  }
  const body = bare.slice(open + 1, end);
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim().replace(/\s+/g, " ");
  return out;
}

/* The app's own layout measurements. They are correctly app-side: the design
   system has no shell to inset and no topbar to measure, and 06's README does
   not claim otherwise. Listed explicitly so a FIFTH one added later has to be
   justified here rather than slipping in. */
const APP_ONLY = ["--sa-t", "--sa-r", "--sa-b", "--sa-l", "--topbar-h"];

const BLOCKS = [
  [":root {", "light"],
  [':root[data-theme="dark"]', "dark"],
];

for (const [sel, label] of BLOCKS) {
  const ds = tokenBlock(tokensCss, sel);
  const app = tokenBlock(appCss, sel);
  ok(`tokens/${label}: both blocks exist`, !!ds && !!app);
  if (!ds || !app) continue;

  const missing = Object.keys(ds).filter(k => !(k in app));
  ok(`tokens/${label}: app has every token`, missing.length === 0, missing.join(", "));

  const extra = Object.keys(app).filter(k => !(k in ds) && !APP_ONLY.includes(k));
  ok(`tokens/${label}: no undeclared app tokens`, extra.length === 0,
    extra.map(k => `${k}: ${app[k]}`).join(", "));

  const differ = Object.keys(ds).filter(k => k in app && ds[k] !== app[k]);
  ok(`tokens/${label}: values match`, differ.length === 0,
    differ.map(k => `${k} — 06: ${ds[k]} / app: ${app[k]}`).join("; "));
}

/* The print block re-points the palette for paper. It has to say the same
   thing in both files or a work order prints differently depending on which
   copy of the design you are looking at. */
{
  const printOf = (css) => {
    const bare = stripComments(css);
    const i = bare.indexOf("@media print");
    if (i < 0) return null;
    const seg = bare.slice(i, i + 1400);
    const out = {};
    for (const m of seg.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
  };
  const ds = printOf(tokensCss), app = printOf(appCss);
  ok("tokens/print: both blocks exist", !!ds && !!app);
  if (ds && app) {
    const differ = Object.keys(ds).filter(k => ds[k] !== app[k]);
    ok("tokens/print: values match", differ.length === 0,
      differ.map(k => `${k} — 06: ${ds[k]} / app: ${app[k] ?? "(absent)"}`).join("; "));
  }
}

/* ------------------------------------------------------------ components --
   Only top-level rules. A rule inside @media is a responsive override, and
   06 has no responsive layer to compare one against — flattening the media
   queries makes the app's phone rules look like drift against the desktop
   design, which they are not. */

function topLevelRules(css) {
  const bare = stripComments(css);
  const rules = new Map();
  let i = 0;
  while (i < bare.length) {
    const brace = bare.indexOf("{", i);
    if (brace < 0) break;
    const sel = bare.slice(i, brace).trim().replace(/\s+/g, " ");
    let depth = 0, end = brace;
    for (let k = brace; k < bare.length; k++) {
      if (bare[k] === "{") depth++;
      else if (bare[k] === "}") { depth--; if (!depth) { end = k; break; } }
    }
    if (sel.startsWith("@")) { i = end + 1; continue; }   // skip at-rules whole
    const decls = {};
    for (const d of bare.slice(brace + 1, end).split(";")) {
      const c = d.indexOf(":");
      if (c > 0) decls[d.slice(0, c).trim()] = d.slice(c + 1).trim().replace(/\s+/g, " ");
    }
    /* MERGED, not replaced. A selector can appear more than once — the app
       declares .chip, .col and .pcard in its component block and again in the
       polish block below it — and the cascade means the effective style is
       the union, later properties winning. Keeping only the last occurrence
       reported the polish block's three declarations as the whole rule and
       claimed the app had dropped everything else. */
    if (sel && Object.keys(decls).length) rules.set(sel, { ...(rules.get(sel) || {}), ...decls });
    i = end + 1;
  }
  return rules;
}

const dsRules = topLevelRules(compCss);
const appRules = topLevelRules(appCss);

/* 06 writes the class on its own; the app qualifies it with the element it is
   always used on. Same component, different selector text, so they have to be
   paired by hand. Anything not listed is compared by exact selector. */
const ALIASES = {
  ".sidebar": "nav.sidebar",
  ".topbar": "header.topbar",
  ".topbar h1": "header.topbar h1",
  ".modal-backdrop": "#modal .backdrop",
  ".modal": "#modal .modal",
  ".modal h2": "#modal .modal h2",
  ".modal .foot": "#modal .modal .foot",
};

/* Properties worth comparing. The full declaration set is too strict to be
   useful: the app legitimately adds layout (position, z-index, flex) that a
   portable component has no business specifying, and 06 legitimately adds
   transitions the app puts in its own polish block. What must agree is the
   LOOK — the things a designer would notice on a screenshot. */
const VISUAL = ["background", "background-color", "border", "border-radius", "color",
  "box-shadow", "font-size", "font-weight", "font-family", "padding", "text-transform",
  "letter-spacing"];

const drift = [];
let compared = 0;
for (const [dsSel, dsDecls] of dsRules) {
  const appSel = ALIASES[dsSel] || dsSel;
  const appDecls = appRules.get(appSel);
  if (!appDecls) continue;         // not lifted into the app under this name
  compared++;
  for (const prop of VISUAL) {
    if (!(prop in dsDecls)) continue;
    /* Absent in the app is drift too, and the quiet kind. When 06 styles a
       bare `input` and the app does not, the control renders as a browser
       default — plain in light mode, and a pale grey box on a near-black page
       in dark. Comparing only properties present in BOTH files misses exactly
       that, which is how it went unnoticed until someone looked at a
       screenshot. Layout properties are exempt: `padding` on a portable
       component is advice, not contract, and the app legitimately overrides it
       per context. */
    if (!(prop in appDecls)) {
      if (prop === "padding") continue;
      drift.push(`${appSel} { ${prop} } — 06: ${dsDecls[prop]} / app: not set`);
      continue;
    }
    /* The app wraps a value in max()/calc() with a --sa-* inset where 06 has
       a plain number. That is not drift: 06 has no notch to clear and says so
       by omission, and the app's four safe-area tokens are already an
       allowed-extras case above. Same value, one of them device-aware. */
    if (/var\(--sa-/.test(appDecls[prop])) continue;
    if (dsDecls[prop] !== appDecls[prop]) {
      drift.push(`${appSel} { ${prop} } — 06: ${dsDecls[prop]} / app: ${appDecls[prop]}`);
    }
  }
}
ok(`components: ${compared} shared rules look the same`, drift.length === 0,
  drift.join("\n         "));

/* Selectors 06 publishes that the app has under neither name. Not a failure —
   the app is allowed to not use a component — but worth printing under -v so
   the two files' shapes stay visible to whoever is reading. */
if (VERBOSE) {
  const absent = [...dsRules.keys()].filter(s => !appRules.has(ALIASES[s] || s));
  console.log(`\n  ${absent.length} of ${dsRules.size} published selectors are not in the app under the same name:`);
  absent.forEach(s => console.log(`    ${s}`));
}

/* ------------------------------------------------------------- literals --
   A hardcoded value that a token already spells is the drift mechanism
   itself: it looks identical today and stops tracking the moment the token
   moves. Checked for the two families where a token unambiguously exists. */
{
  const bare = stripComments(appCss);
  const afterRoot = bare.slice(bare.indexOf("}", bare.indexOf(":root")) + 1);

  const RADII = { "6px": "--radius", "9px": "--r-md", "14px": "--r-lg" };
  const badRadius = [];
  for (const m of afterRoot.matchAll(/border-radius:\s*([^;]+);/g)) {
    const v = m[1].trim();
    if (RADII[v]) badRadius.push(`${v} should be var(${RADII[v]})`);
  }
  ok("literals: no radius duplicates a token", badRadius.length === 0,
    [...new Set(badRadius)].join(", "));

  /* Colours. Only the exact token values, case-insensitively — a near miss is
     a design decision, an exact match is a missed variable. #fff and #000 are
     excluded: they are used as foreground ON brand fills, where no token
     exists (there is no --on-brand), and inventing one changes the published
     system. */
  const light = tokenBlock(tokensCss, ":root {") || {};
  const byValue = {};
  for (const [k, v] of Object.entries(light)) {
    if (/^#[0-9a-f]{3,8}$/i.test(v) && !/^#(fff|ffffff|000|000000)$/i.test(v)) byValue[v.toLowerCase()] = k;
  }
  const badColor = [];
  /* Skip custom-property DECLARATIONS. The @media print block re-points
     --brand-ink to #003262 by design; that is the token being defined, not a
     literal standing in for it, and flagging it would ask the file to define
     a token in terms of itself. */
  for (const line of afterRoot.split(/[;\n]/)) {
    if (/^\s*--[\w-]+\s*:/.test(line)) continue;
    for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const hit = byValue[m[0].toLowerCase()];
      if (hit) badColor.push(`${m[0]} should be var(${hit})`);
    }
  }
  ok("literals: no colour duplicates a token", badColor.length === 0,
    [...new Set(badColor)].join(", "));
}

/* ------------------------------------------------------------- phantoms --
   A class in the markup that no stylesheet defines. It is invisible in every
   other way: no error, no warning, the element just renders unstyled and the
   distinction it was meant to draw silently does not exist. Found because a
   screenshot review noticed the Weekly Plan's "car is full" pill looked
   identical to the "seats left" one — .pill-amber and .pill-slate had never
   been defined anywhere.

   Only static class attributes are scanned. A class assembled at runtime
   (`class="${x ? "a" : "b"}"`) is skipped rather than guessed at, so this
   under-reports and never cries wolf. */
{
  const appDir = join(ROOT, "03 App", "app");
  const files = readdirSync(appDir).filter(f => f.endsWith(".js"));
  const defined = new Set();
  for (const css of [appCss, compCss, readFileSync(join(appDir, "print.css"), "utf8")]) {
    for (const m of stripComments(css).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]);
  }
  /* Set by JS rather than written in a class attribute, so they never appear
     in a stylesheet's selector list by the name the code uses. */
  const RUNTIME = new Set(["no-print"]);
  const phantom = new Map();
  for (const f of files) {
    const src = readFileSync(join(appDir, f), "utf8");
    for (const m of src.matchAll(/class="([^"$<>]*)"/g)) {
      for (const cls of m[1].split(/\s+/).filter(Boolean)) {
        if (!defined.has(cls) && !RUNTIME.has(cls)) {
          if (!phantom.has(cls)) phantom.set(cls, f);
        }
      }
    }
  }
  ok(`markup: every class is defined somewhere`, phantom.size === 0,
    [...phantom].map(([c, f]) => `.${c} (${f})`).join(", "));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
