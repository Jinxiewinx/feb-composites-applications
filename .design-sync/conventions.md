# FEB Composites Design System

The visual language of Formula Electric at Berkeley's composites tooling: UC Berkeley colors, a Saira/Inter type pairing, and the shop-floor component set from the SN6 work-order app.

**This system is CSS only. There are no importable components.** `window.FEBComposites` is empty by design, and there are no component cards. You build with ordinary HTML elements and the class vocabulary below, styled entirely by `styles.css`. Do not import from the bundle, and do not invent class names: a class not listed here has no styling behind it.

## Setup

No provider and no wrapper component. Load `styles.css` and write markup.

Light is the default. Dark mode is one attribute on the root element, and every token re-points underneath:

```html
<html data-theme="dark">
```

The base layer styles `body` directly (`background: var(--canvas)`, `color: var(--ink)`, 14px/1.5 Inter), so render app content inside `<body>` rather than a wrapper div with its own background. Bare `button`, `input`, `select`, `textarea`, `a`, and `kbd` are already styled with no class at all. A `@media print` block forces black on white regardless of theme, so anything printable stays legible.

## The idiom: element plus modifier class

| Family | Classes |
|---|---|
| Buttons | `<button>` bare is a quiet outlined button; `.primary` (Berkeley Blue), `.gold` (loud CTA), `.danger`, `.link`; `.sm` shrinks any of them. `.btn` gives the base look to a non-button element. |
| Forms | `.field` and `.grid .f` wrap a label plus control; `.filters` and `.toolbar` are flex rows; `.grid` is an auto-fit column grid. |
| Cards | `.card`, with `h2` in the display face and `h3` as a small uppercase section label. |
| Tables | `table.list` is the data table; `th.sortable` for sortable headers; `table.list.dash` for non-interactive rows. |
| Badges | `.pill` + `.ok`/`.warn`/`.bad`/`.retro`/`.now` (gold, for the current week or today — not a status); `.stage` + `.st-mid`/`.st-done`/`.st-na`; `.chip` (accent-tinted, clickable — render it as a `button`, it grows to a 36px tap target on touch); `.kind` (tiny uppercase tag); `.tpill` (training credential capsule — fully rounded, one quiet color, short code like "INF"; rows of them wrap inside `.trwrap`, and `.trrow` is the checkbox row in the grant modal). |
| Status | `.status` + one of `.todo`, `.inprogress`, `.collecting`, `.onhold`, `.done`, `.cancelled`. |
| Progress | `.stage-bar` wrapping `.stage-bar-fill` + `.st-0`/`.st-mid`/`.st-done`. |
| Tiles | `.stat-row` of `.stat-tile`, each holding `.bignum` and `.stat-label`. |
| Kanban | `.col` + `.col-inprogress`/`.col-collecting`/`.col-onhold`/`.col-done`, holding `.pcard` with `.t` and `.meta`. |
| Feedback | `.gate` (+ `.blocked`) for blocking notices; `.toast` + `.ok`/`.err`/`.info`; `.modal-backdrop` > `.modal` > `.foot`. |
| WO hero | `.wo-facts` band of `.wo-fact` slots (`.wf-lab` label + `.wf-num` value, `.late` red) plus `.wf-eng` engineer avatars. |
| WO sections | `.wosec-hd` — per-card section header (gold speed-slash + uppercase label + `.wosec-n` count pill + `.wosec-w` warn word); as a `<summary>` inside `details.wo-fold` it is the always-visible face of a folded section. `.addrow` spaces a trailing add-button. |
| Photos | `.photogrid` of `.phtile` (`.phimg` lazy `<img>` + caption), `.phgrp` group label, `.phmini` 48px step-row thumbs inside `.step-photos`, `.ph-uploading` placeholder. |
| Navigation | `.sidebar` > `.sb-brand`/`.sb-brand-txt`, `.sb-nav` > `.sb-item` (+ `.active`, `.ic`); `.topbar` > `h1`, `.icon-btn` (+ `.badge`). |
| Avatars | `.avatar`, grouped in `.avatar-stack`. |
| Text | `.muted`, `.tny`, `.nocaps` (opt a span out of an uppercase label or `h3`), `.unread-dot` (the gold new-activity pip). |

For your own layout glue, use the tokens rather than literal values: `var(--canvas)`, `var(--card)`, `var(--surface-2)`, `var(--line)`, `var(--ink)`, `var(--muted)`, `var(--accent)`, `var(--blue)`, `var(--gold)`, spacing via `var(--radius)`/`var(--r-md)`/`var(--r-lg)`, and motion via `var(--t)`/`var(--t-fast)`/`var(--ease)`. Status colors come as triads: `--ok`/`--ok-bg`/`--ok-border`, and the same shape for `--bad`, `--retro`, `--purple`. The warning triad is the one asymmetric case: the text color is `--amber`, but the surfaces are `--warn-bg` and `--warn-border`.

## Three things that will bite you

1. **Button modifiers are element-scoped.** The selectors are `button.primary`, `button.gold`, `button.danger`, `button.link`. An `<a class="btn primary">` gets the base button look and nothing else. Use a real `<button>` whenever you want a variant.
2. **`.status` needs its dot.** The first child must be `<span class="dot"></span>`, which the class colors per state. Without it the badge reads as a plain label.
3. **`table.list` does not collapse on its own.** The responsive stacked-card behavior lives in the consuming app, via a media query that hides the header row and reads `data-label` off each cell. Carry that rule across if the table has to work narrow.

## Where the truth lives

Read `_ds/<folder>/styles.css` and its import closure before styling: `tokens/tokens.css` (every token, all three themes), `fonts/fonts.css` (the two self-hosted variable faces), and `_ds_bundle.css` (the component layer). The stylesheets are commented and short. Reading them beats guessing from this summary.

## Idiomatic example

```jsx
<div className="card">
  <h2>Undertray Diffuser</h2>
  <h3>Status</h3>
  <span className="status inprogress"><span className="dot" /> In progress</span>

  <div className="stat-row" style={{ marginTop: 16 }}>
    <div className="stat-tile">
      <div className="bignum">4</div>
      <div className="stat-label">Plies remaining</div>
    </div>
  </div>

  <div className="gate">
    <span className="gi">!</span>
    <div><b>Mold not sealed.</b> Layup cannot start until sealing is signed off.</div>
  </div>

  <div className="toolbar" style={{ marginTop: 16 }}>
    <button className="primary">Sign off</button>
    <button className="sm">Defer</button>
  </div>
</div>
```
