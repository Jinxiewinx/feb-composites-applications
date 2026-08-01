#!/usr/bin/env node
/* Generate a self-contained styleguide.html from the canonical CSS.
   tokens.css + components.css stay the single source of truth; this
   inlines them (plus the two fonts as data URIs) so the style guide
   opens by double-click anywhere and can be published as-is.

   Run: node build.mjs   (from 06 Design System/)
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const b64 = (p) => readFileSync(join(here, p)).toString('base64');

// Canonical CSS. Strip @font-face from tokens.css; we re-declare it
// below with data-URI sources so the output needs no font files.
const tokens = read('tokens.css').replace(/@font-face\s*\{[^}]*\}/g, '').replace(/^\s*[\r\n]/gm, (m, o, s) => o < s.indexOf(':root') ? '' : m);
const components = read('components.css');

const inter = b64('fonts/inter-var.woff2');
const saira = b64('fonts/saira-var.woff2');

const fontFaces = `
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900; font-display: swap; src: url('data:font/woff2;base64,${inter}') format('woff2'); }
@font-face { font-family: 'Saira'; font-style: normal; font-weight: 100 900; font-display: swap; src: url('data:font/woff2;base64,${saira}') format('woff2'); }
`;

// Documentation chrome — the page's own layout, not part of the system.
const chrome = `
  /* ---- style guide page chrome ---- */
  body { background: var(--canvas); }
  .ds-hero {
    position: relative; overflow: hidden; color: #fff;
    background-color: var(--sb-bg);
    background-image:
      repeating-linear-gradient(45deg, var(--carbon) 0 1px, transparent 1px 7px),
      repeating-linear-gradient(-45deg, var(--carbon) 0 1px, transparent 1px 7px);
    padding: 44px max(24px, env(safe-area-inset-left)) 40px;
    border-bottom: 3px solid var(--gold);
  }
  .ds-hero::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
    background: var(--gold); transform: skewX(-12deg); transform-origin: top;
  }
  .ds-hero-in { max-width: 1080px; margin: 0 auto; display: flex; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
  .ds-lockup { flex: 1; min-width: 260px; }
  .ds-eyebrow { font: 700 12px/1 var(--font); text-transform: uppercase; letter-spacing: .18em; color: var(--gold); margin: 0 0 14px; }
  .ds-hero h1 { font-family: var(--font-display); font-weight: 700; font-size: clamp(30px, 6vw, 52px); line-height: 1.02; margin: 0; letter-spacing: .01em; text-wrap: balance; }
  .ds-hero h1 span { color: var(--gold); }
  .ds-hero p { max-width: 60ch; margin: 14px 0 0; color: var(--sb-text); font-size: 15px; line-height: 1.6; }
  .ds-toggle {
    display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
    border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.08);
    color: #fff; border-radius: 999px; padding: 8px 15px; font: 600 13px var(--font);
    transition: background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease);
  }
  .ds-toggle:hover { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.4); }

  .ds-wrap { max-width: 1080px; margin: 0 auto; padding: 0 max(24px, env(safe-area-inset-left)) 80px; }
  .ds-sec { padding-top: 48px; }
  .ds-sec-hd { display: flex; align-items: baseline; gap: 12px; margin: 0 0 4px; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
  .ds-sec-hd h2 { font-family: var(--font-display); font-size: 26px; font-weight: 700; margin: 0; color: var(--ink); letter-spacing: .01em; }
  .ds-sec-hd .ds-n { font: 700 12px var(--font); color: var(--gold); letter-spacing: .1em; }
  .ds-lead { color: var(--muted); max-width: 66ch; margin: 12px 0 0; font-size: 14.5px; line-height: 1.65; }

  .ds-block { margin-top: 26px; }
  .ds-block > h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; margin: 0 0 12px; }

  /* swatches */
  .ds-theme-label { display: inline-block; font: 700 11px var(--font); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 3px 11px; margin: 18px 0 12px; }
  .ds-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .ds-sw { border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; background: var(--card); box-shadow: var(--shadow); }
  .ds-sw .chip { display: block; height: 62px; border-radius: 0; border: none; cursor: default; }
  .ds-sw .lab { padding: 8px 10px; }
  .ds-sw .nm { font: 600 12.5px var(--font); color: var(--ink); }
  .ds-sw .hx { font: 500 11.5px/1.5 var(--font); color: var(--muted); font-variant-numeric: tabular-nums; text-transform: uppercase; }

  /* type specimens */
  .ds-type { display: flex; flex-direction: column; gap: 4px; }
  .ds-type .row { display: flex; align-items: baseline; gap: 18px; border-bottom: 1px dashed var(--line); padding: 12px 0; flex-wrap: wrap; }
  .ds-type .row .spec { color: var(--faint); font: 500 11.5px var(--font); width: 150px; flex: none; font-variant-numeric: tabular-nums; text-transform: uppercase; letter-spacing: .04em; }
  .ds-type .row .samp { min-width: 0; color: var(--ink); }

  /* effect specimens */
  .ds-effects { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
  .ds-fx { background: var(--card); border: 1px solid var(--line); padding: 16px; }
  .ds-fx .box { height: 54px; background: var(--surface-2); border: 1px solid var(--line); margin-bottom: 10px; }
  .ds-fx .cap { font: 500 11.5px var(--font); color: var(--muted); }
  .ds-fx .cap b { color: var(--ink); font-weight: 600; display: block; }

  /* component demos */
  .ds-demo { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow); margin-top: 14px; }
  .ds-demo-stage { padding: 22px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .ds-demo-stage.col { flex-direction: column; align-items: stretch; }
  .ds-demo-cap { border-top: 1px solid var(--line); background: var(--surface-2); padding: 8px 14px; font: 500 12px/1.5 var(--font); color: var(--muted); border-radius: 0 0 var(--r-md) var(--r-md); }
  .ds-demo-cap code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--brand-ink); font-size: 12px; }
  .ds-note { font-size: 12.5px; color: var(--muted); margin: 14px 0 0; }
  .ds-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }

  footer.ds-foot { max-width: 1080px; margin: 0 auto; padding: 30px max(24px, env(safe-area-inset-left)) 60px; color: var(--muted); font-size: 12.5px; border-top: 1px solid var(--line); }
  footer.ds-foot b { color: var(--ink); }
`;

// Swatch data — literal values so BOTH themes show regardless of the
// current toggle state.
const light = [
  ['--blue','#003262','Berkeley Blue'],['--gold','#FDB515','California Gold'],
  ['--brand-blue','#2f6be4','Interface Blue'],['--brand-ink','#003a75','Brand Ink'],
  ['--canvas','#eef1f6','Canvas'],['--card','#ffffff','Card / Surface'],
  ['--surface-2','#f4f7fb','Surface 2'],['--line','#dde3ec','Line'],
  ['--ink','#141d2b','Ink'],['--muted','#515f74','Muted'],
  ['--ok','#0d7a55','OK'],['--amber','#a25c00','Amber'],
  ['--bad','#cf3430','Bad'],['--purple','#6a3fb0','Purple / Collecting'],['--retro','#5a45b0','Retro / N/A'],
];
const dark = [
  ['--sb-bg','#071a30','Sidebar'],['--gold','#FDB515','California Gold'],
  ['--accent','#5b8cff','Interface Blue'],['--brand-ink','#6f9dff','Brand Ink'],
  ['--canvas','#0b0f16','Canvas'],['--card','#141c28','Card / Surface'],
  ['--surface-2','#1a2431','Surface 2'],['--line','#26313f','Line'],
  ['--ink','#e7edf5','Ink'],['--muted','#9aa8bd','Muted'],
  ['--ok','#34c88f','OK'],['--amber','#e0a53a','Amber'],
  ['--bad','#ff6f62','Bad'],['--purple','#a385e6','Purple / Collecting'],['--retro','#a99bf0','Retro / N/A'],
];
const swatches = (rows) => `<div class="ds-swatches">` + rows.map(([v,hex,nm]) =>
  `<div class="ds-sw"><span class="chip" style="background:${hex}"></span><div class="lab"><div class="nm">${nm}</div><div class="hx">${hex}</div><div class="hx">${v}</div></div></div>`
).join('') + `</div>`;

const demo = (cap, inner, col) =>
  `<div class="ds-demo"><div class="ds-demo-stage${col?' col':''}">${inner}</div><div class="ds-demo-cap">${cap}</div></div>`;

const body = `
<header class="ds-hero">
  <div class="ds-hero-in">
    <div class="ds-lockup">
      <p class="ds-eyebrow">Formula Electric at Berkeley</p>
      <h1>Composites<br><span>Design System</span></h1>
      <p>The visual language behind the FEB Composites app: Berkeley Blue and California Gold, condensed Saira display type over Inter, and a shop-floor component set built for the bench, the tablet, and the printed traveler. Every token and component on this page is the live system.</p>
    </div>
    <button class="ds-toggle" id="themeToggle" type="button" aria-label="Toggle light and dark theme">
      <span id="themeIcon">◐</span> <span id="themeName">Dark</span>
    </button>
  </div>
</header>

<div class="ds-wrap">

  <section class="ds-sec" id="brand">
    <div class="ds-sec-hd"><span class="ds-n">01</span><h2>Brand</h2></div>
    <p class="ds-lead">UC Berkeley's colors, worn with a motorsport edge. Berkeley Blue is the ground and the primary action; California Gold is the single accent, spent sparingly on the call-to-action and the active state. The signature move is the gold "speed slash" and the carbon-fiber crosshatch on the navy sidebar.</p>
    <div class="ds-block">
      ${demo(`<code>.sidebar</code> with <code>.sb-item.active</code> — the gold speed-slash marks the current tab`, `
        <nav class="sidebar" style="width:216px;border-radius:var(--r-md);overflow:hidden;padding-bottom:8px">
          <div class="sb-brand"><span class="sb-brand-txt">FEB <span>Composites</span></span></div>
          <div class="sb-nav">
            <button class="sb-item active"><span class="ic">◧</span> Dashboard</button>
            <button class="sb-item"><span class="ic">▤</span> Work Orders</button>
            <button class="sb-item"><span class="ic">◈</span> Parts</button>
            <button class="sb-item"><span class="ic">▦</span> Stock</button>
            <button class="sb-item"><span class="ic">◷</span> Timeline</button>
          </div>
        </nav>`, true)}
    </div>
  </section>

  <section class="ds-sec" id="color">
    <div class="ds-sec-hd"><span class="ds-n">02</span><h2>Color</h2></div>
    <p class="ds-lead">One token set, re-pointed for dark mode so every component themes for free. Status colors (OK, amber, bad, purple, retro) are semantic and separate from the brand accent; each ships as a text / background / border triad. Neutrals carry a slight blue bias, chosen to sit under the navy chrome.</p>
    <span class="ds-theme-label">Light</span>
    ${swatches(light)}
    <span class="ds-theme-label">Dark</span>
    ${swatches(dark)}
  </section>

  <section class="ds-sec" id="type">
    <div class="ds-sec-hd"><span class="ds-n">03</span><h2>Typography</h2></div>
    <p class="ds-lead">Two variable faces, self-hosted so the app keeps its type offline at the field station. <b>Saira</b> is the condensed display face for headings, big numbers, and the wordmark. <b>Inter</b> carries everything read at length. Labels are uppercase with letter-spacing.</p>
    <div class="ds-block ds-type">
      <div class="row"><span class="spec">Saira · display</span><span class="samp" style="font-family:var(--font-display);font-weight:700;font-size:40px;letter-spacing:.01em">Layup Schedule</span></div>
      <div class="row"><span class="spec">Saira · card h2 · 20</span><span class="samp" style="font-family:var(--font-display);font-weight:600;font-size:20px">Undertray Diffuser</span></div>
      <div class="row"><span class="spec">Saira · bignum · 32</span><span class="samp bignum">128</span></div>
      <div class="row"><span class="spec">Inter · body · 14</span><span class="samp" style="font-size:14px;max-width:56ch;line-height:1.5">Resin infusion over CNC-machined tooling board, vacuum bagged and cured to the schedule recorded on the work order.</span></div>
      <div class="row"><span class="spec">Inter · label · 11 caps</span><span class="samp" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Mold Status</span></div>
      <div class="row"><span class="spec">Inter · tny · 12 muted</span><span class="samp tny">Updated 2 hours ago</span></div>
    </div>
  </section>

  <section class="ds-sec" id="effects">
    <div class="ds-sec-hd"><span class="ds-n">04</span><h2>Radius · Shadow · Motion</h2></div>
    <p class="ds-lead">Three radii, three elevations, and one easing curve. Controls take the 6px radius, cards 9px, large containers 14px. Motion is quick (120–170ms) on a custom ease, and every transition collapses under <code>prefers-reduced-motion</code>.</p>
    <div class="ds-block ds-effects">
      <div class="ds-fx"><div class="box" style="border-radius:var(--radius)"></div><div class="cap"><b>--radius</b>6px · controls</div></div>
      <div class="ds-fx"><div class="box" style="border-radius:var(--r-md)"></div><div class="cap"><b>--r-md</b>9px · cards</div></div>
      <div class="ds-fx"><div class="box" style="border-radius:var(--r-lg)"></div><div class="cap"><b>--r-lg</b>14px · containers</div></div>
      <div class="ds-fx"><div class="box" style="box-shadow:var(--shadow);background:var(--card)"></div><div class="cap"><b>--shadow</b>resting card</div></div>
      <div class="ds-fx"><div class="box" style="box-shadow:var(--shadow-md);background:var(--card)"></div><div class="cap"><b>--shadow-md</b>lifted / hover</div></div>
      <div class="ds-fx"><div class="box" style="box-shadow:var(--shadow-lg);background:var(--card)"></div><div class="cap"><b>--shadow-lg</b>modal / popover</div></div>
    </div>
    <p class="ds-note">Ease <code>--ease: cubic-bezier(.2,.6,.2,1)</code> · standard <code>--t: .17s</code> · fast <code>--t-fast: .12s</code></p>
  </section>

  <section class="ds-sec" id="components">
    <div class="ds-sec-hd"><span class="ds-n">05</span><h2>Components</h2></div>
    <p class="ds-lead">Built entirely on the tokens above. Hover any control to see the motion; toggle the theme to see every piece re-point at once.</p>

    <div class="ds-block"><h3>Buttons</h3>
      ${demo(`<code>button</code> · <code>.primary</code> · <code>.gold</code> · <code>.danger</code> · <code>.link</code> · add <code>.sm</code> to shrink`, `
        <button>Default</button>
        <button class="primary">Primary</button>
        <button class="gold">Call to action</button>
        <button class="danger">Delete</button>
        <button class="link">Text link</button>
        <button class="primary sm">Small</button>`)}
    </div>

    <div class="ds-block"><h3>Forms</h3>
      ${demo(`<code>.field</code> label + input · <code>select</code> · <code>textarea</code> · <code>.grid</code> lays them out`, `
        <div style="width:100%" class="grid">
          <div class="field"><label>Part name</label><input value="Undertray diffuser"></div>
          <div class="field"><label>Process</label><select><option>Resin infusion</option><option>Wet layup</option></select></div>
          <div class="field" style="grid-column:1/-1"><label>Notes</label><textarea>Ground to &lt;5 Ω on the diffuser.</textarea></div>
        </div>`, true)}
    </div>

    <div class="ds-block"><h3>Status &amp; badges</h3>
      ${demo(`<code>.status</code> — the six-state work enum, dot + label`, `
        <span class="status todo"><span class="dot"></span> To do</span>
        <span class="status inprogress"><span class="dot"></span> In progress</span>
        <span class="status collecting"><span class="dot"></span> Collecting</span>
        <span class="status onhold"><span class="dot"></span> On hold</span>
        <span class="status done"><span class="dot"></span> Done</span>
        <span class="status cancelled"><span class="dot"></span> Cancelled</span>`)}
      <div class="ds-cols">
        ${demo(`<code>.pill</code> · states via <code>.ok .warn .bad .retro</code>`, `
          <span class="pill">Draft</span><span class="pill warn">In work</span>
          <span class="pill ok">Complete</span><span class="pill bad">On hold</span><span class="pill retro">Retro</span>`)}
        ${demo(`<code>.stage</code> · <code>.chip</code> · <code>.kind</code>`, `
          <span class="stage st-done">Cured</span><span class="stage st-mid">Bagging</span><span class="stage st-na">N/A</span>
          <span class="chip">Nick J.</span><span class="kind">UT</span>`)}
      </div>
    </div>

    <div class="ds-block"><h3>Cards</h3>
      ${demo(`<code>.card</code> with <code>h2</code> (display) and uppercase <code>h3</code> section labels`, `
        <div class="card" style="width:100%;margin:0">
          <h2>Rear Wing Endplate</h2>
          <div class="tny">RW-EP-02 · Aerodynamics</div>
          <h3>Layup</h3>
          <p style="margin:0">3-ply 2×2 twill, [0/45/0], resin infused over the machined tooling-board mold.</p>
          <h3>Status</h3>
          <span class="status inprogress"><span class="dot"></span> In progress</span>
        </div>`, true)}
    </div>

    <div class="ds-block"><h3>Table</h3>
      ${demo(`<code>table.list</code> — uppercase header on an inset surface, hoverable rows; collapses to cards on narrow screens`, `
        <div style="width:100%;overflow-x:auto">
        <table class="list">
          <tr><th class="sortable">Part</th><th>Process</th><th>Status</th><th>Due</th></tr>
          <tr><td>Undertray diffuser</td><td>Infusion</td><td><span class="pill ok">Complete</span></td><td>Aug 2</td></tr>
          <tr><td>Nosecone</td><td>Wet layup</td><td><span class="pill warn">In work</span></td><td>Aug 9</td></tr>
          <tr><td>RW endplate</td><td>Infusion</td><td><span class="pill">Draft</span></td><td>Aug 16</td></tr>
        </table></div>`, true)}
    </div>

    <div class="ds-block"><h3>Data tiles</h3>
      ${demo(`<code>.stat-tile</code> + <code>.bignum</code> in a <code>.stat-row</code>`, `
        <div class="stat-row" style="width:100%">
          <div class="stat-tile"><div class="bignum">33</div><div class="stat-label">Parts tracked</div></div>
          <div class="stat-tile"><div class="bignum">18</div><div class="stat-label">Molds machined</div></div>
          <div class="stat-tile"><div class="bignum">6</div><div class="stat-label">On hold</div></div>
          <div class="stat-tile"><div class="bignum">&lt;5Ω</div><div class="stat-label">Ground target</div></div>
        </div>`, true)}
    </div>

    <div class="ds-block"><h3>Gate</h3>
      ${demo(`<code>.gate</code> (amber warning) · <code>.gate.blocked</code> (red, work stopped)`, `
        <div style="width:100%;display:flex;flex-direction:column;gap:10px">
          <div class="gate"><span class="gi">!</span><div>Mold sealer and release agent must be logged before <b>first layup</b> (CS-004).</div></div>
          <div class="gate blocked"><span class="gi">✕</span><div><b>Blocked:</b> ShopSabre reservation required before machining this mold.</div></div>
        </div>`, true)}
    </div>

    <div class="ds-block"><h3>Kanban</h3>
      ${demo(`<code>.col</code> tracks with a status accent strip · <code>.pcard</code> lift on hover`, `
        <div style="width:100%;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:start">
          <div class="col col-inprogress"><h4>In progress <span>2</span></h4>
            <div class="pcard"><div class="t">Undertray inlet</div><div class="meta">Aug 2 · <span class="prio" style="color:var(--bad);font-weight:700">High</span></div></div>
            <div class="pcard"><div class="t">Side pod L</div><div class="meta">Aug 5</div></div>
          </div>
          <div class="col col-onhold"><h4>On hold <span>1</span></h4>
            <div class="pcard"><div class="t">Catch can</div><div class="meta">copper mesh TBD</div></div>
          </div>
          <div class="col col-done"><h4>Done <span>1</span></h4>
            <div class="pcard"><div class="t">Diffuser</div><div class="meta">grounded ✓</div></div>
          </div>
        </div>`, true)}
    </div>

    <div class="ds-block"><h3>Feedback &amp; misc</h3>
      <div class="ds-cols">
        ${demo(`<code>.toast</code> — <code>.ok</code> · <code>.err</code> · <code>.info</code>`, `
          <div style="display:flex;flex-direction:column;gap:8px;width:100%">
            <div class="toast ok">Work order saved</div>
            <div class="toast err">Ground resistance out of spec</div>
            <div class="toast info">Loaded SN5 archive</div>
          </div>`)}
        ${demo(`<code>.avatar-stack</code> · <code>kbd</code> · <code>.icon-btn</code> with <code>.badge</code>`, `
          <span class="avatar-stack">
            <span class="avatar" style="width:30px;height:30px;background:var(--blue)">NJ</span>
            <span class="avatar" style="width:30px;height:30px;background:var(--purple)">SS</span>
            <span class="avatar" style="width:30px;height:30px;background:var(--ok)">+4</span>
          </span>
          <span><kbd>⌘</kbd> <kbd>K</kbd></span>
          <button class="icon-btn" style="font-size:18px">◔<span class="badge">3</span></button>`)}
      </div>
    </div>

  </section>
</div>

<footer class="ds-foot">
  <b>FEB Composites Design System.</b> Generated from <code>tokens.css</code> + <code>components.css</code> by <code>build.mjs</code>. Fonts (Inter, Saira) are self-hosted variable faces, inlined here. Extracted from the SN6 composites app; the app remains the source of truth for anything not yet lifted into <code>components.css</code>.
</footer>

<script>
  (function(){
    var root = document.documentElement;
    var btn = document.getElementById('themeToggle');
    var name = document.getElementById('themeName');
    function label(){ var d = root.getAttribute('data-theme') === 'dark'; name.textContent = d ? 'Light' : 'Dark'; }
    label();
    btn.addEventListener('click', function(){
      var d = root.getAttribute('data-theme') === 'dark';
      root.setAttribute('data-theme', d ? 'light' : 'dark');
      label();
    });
  })();
</script>
`;

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>FEB Composites — Design System</title>
<style>
${fontFaces}
/* ===== tokens.css ===== */
${tokens}
/* ===== components.css ===== */
${components}
/* ===== page chrome ===== */
${chrome}
</style>
</head>
<body>
${body}
</body>
</html>
`;

writeFileSync(join(here, 'styleguide.html'), html);
console.log('Wrote styleguide.html (' + (html.length/1024).toFixed(0) + ' KB)');

// Artifact fragment: same page with no <!doctype>/<html>/<head>/<body> so it
// can be published as a claude.ai Artifact (the host supplies that skeleton and
// stamps data-theme on the root, which our tokens already key off).
const fragment = `<style>
${fontFaces}
/* ===== tokens.css ===== */
${tokens}
/* ===== components.css ===== */
${components}
/* ===== page chrome ===== */
${chrome}
</style>
${body}
`;
writeFileSync(join(here, 'styleguide.artifact.html'), fragment);
console.log('Wrote styleguide.artifact.html (' + (fragment.length/1024).toFixed(0) + ' KB)');
