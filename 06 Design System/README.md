# FEB Composites Design System

The visual language of the FEB Composites app, pulled out of the app into a
reusable, documented system. UC Berkeley colors (Berkeley Blue + California
Gold), the Saira/Inter type pairing, a full light and dark token set, and the
shop-floor component library, all in one place so the next app, poster, or tool
looks like it belongs to the same team.

It was extracted from the SN6 app's stylesheet (`03 App/app/index.html`). The
app is still the source of truth for anything that hasn't been lifted into
`components.css` yet.

## Files

| File | What it is |
|------|-----------|
| `tokens.css` | Every design token: color (light + dark + print), type, radius, shadow, motion. The single source of truth. |
| `components.css` | Reusable components built on the tokens: buttons, forms, cards, tables, badges, status, gates, kanban, sidebar, topbar, and more. |
| `fonts/` | The two self-hosted variable faces (Inter, Saira). |
| `styleguide.html` | Living style guide. Self-contained, opens by double-click, renders the whole system with a light/dark toggle. |
| `styleguide.artifact.html` | Same page with the outer HTML wrappers removed, for publishing as a claude.ai Artifact. |
| `build.mjs` | Regenerates both style-guide files from the canonical CSS. |

## Using it in a page

```html
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="components.css">
```

Then write markup with the documented classes:

```html
<button class="primary">Save work order</button>
<span class="status done"><span class="dot"></span> Done</span>
<div class="card"><h2>Undertray Diffuser</h2> ... </div>
```

Everything reads from CSS custom properties, so nothing hardcodes a color or a
radius. Change a token in `tokens.css` and every component follows.

## Theming

Light is the default. Set `data-theme="dark"` on `<html>` for dark mode; the
token block re-points and every component follows with no per-component work.
Set it before first paint to avoid a flash:

```html
<script>
  var t = localStorage.getItem('feb-theme') ||
    (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
</script>
```

A `@media print` block in `tokens.css` forces black-on-white on paper
regardless of the on-screen theme, so a work order printed in dark mode still
comes out legible.

## Token reference

Brand: `--blue` (Berkeley Blue), `--gold` (California Gold), `--brand-blue` /
`--accent` (interface blue), `--brand-ink` (headings).

Surfaces: `--canvas`, `--card` / `--surface`, `--surface-2`, `--fill`,
`--hover`, `--line`, `--border-2`.

Text: `--ink`, `--muted`, `--faint`.

Status triads (`--x` text, `--x-bg` background, `--x-border` border):
`--ok` (success), `--amber` / `--warn` (warning), `--bad` (error),
`--purple` (collecting), `--retro` (retro / not applicable).

Radius: `--radius` 6px, `--r-md` 9px, `--r-lg` 14px. Shadow: `--shadow`,
`--shadow-md`, `--shadow-lg`. Motion: `--t` .17s, `--t-fast` .12s, `--ease`.
Type: `--font` (Inter), `--font-display` (Saira).

## Responsive note

`table.list` is designed to collapse into stacked cards on narrow screens. The
app does this with a media query that hides the header row and reads a
`data-label` attribute off each cell for the per-row labels. That collapse rule
lives in the app; if you reuse `table.list` on a small screen, carry that rule
across too.

## Regenerating the style guide

`styleguide.html` and `styleguide.artifact.html` are generated. After editing
`tokens.css` or `components.css`:

```bash
node build.mjs
```

The script inlines the canonical CSS and both fonts (as data URIs) so the style
guide stays a single portable file with no dependency on the font directory.
