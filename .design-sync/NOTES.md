# design-sync notes — FEB Composites Design System

Repo-specific gotchas for future syncs. Read this before re-running.

## Shape: tokens-only, off the standard path

`/design-sync` is built for React component libraries. This design system is plain
CSS: `05 Design System/{tokens.css, components.css, fonts/}`, no JavaScript, no
`dist/`, no React anywhere in the repo. The converter has a first-class
tokens-only path (`[ZERO_MATCH] no component exports — treating as tokens-only
DS`) that it takes when there are no PascalCase exports and `cfg.cssEntry` is
set. That is the path this sync runs on.

Consequences, all expected:

- `_ds_bundle.js` is empty. `window.FEBComposites` has no exports.
- No `components/` directory, no preview cards, nothing to grade.
- The render check runs against zero previews and reports `0/0`.
- What the design agent gets is the styling layer plus the README, so the
  conventions header in `conventions.md` is doing nearly all the work. Keep it
  accurate; it is the only place the class vocabulary is written down for it.

## Staging step

`stage-pkg.mjs` mirrors the canonical CSS into an npm-package-shaped tree under
`.design-sync/.cache/node_modules/feb-composites-design-system/`, because the
converter reads its inputs from a package directory under a node_modules root.
It is a copy, regenerated every run. `05 Design System/` stays the source of
truth. `cfg.buildCmd` points at it, so a re-sync picks it up automatically.

Two things the staging script has to do that are not obvious:

- **React must be installed** in that node_modules root even though the DS ships
  no JavaScript. The converter vendors react/react-dom into `_vendor/` for the
  preview runtime and hard-fails without it. Install with
  `npm i react react-dom` inside `.design-sync/.cache/`.
- **`@font-face` gets split out of `tokens.css`** into a separate `fonts.css`,
  pointed at by `cfg.extraFonts`. The converter copies `tokens.css` verbatim
  into `ds-bundle/tokens/` but harvests fonts only from the `cssEntry` and
  `extraFonts` stylesheets. A face left in `tokens.css` keeps its
  `url('fonts/…')` and resolves one directory too deep, so both brand faces
  silently fall back to system fonts. `05 Design System/build.mjs` already does
  the same split for the style guide.

`cfg.extraFonts` paths resolve relative to the staged package, not the git root.
An absolute-ish repo path prints `! extraFonts: … not found — skipped` and the
fonts vanish with no other error. Watch for the `fonts: 2 @font-face rule(s) →
fonts/` line in the build log; if it is missing, the fonts did not ship.

## Playwright

Chromium build 1208 was already in `~/Library/Caches/ms-playwright/`, which pins
the playwright version: 1.58.0 is the release whose `browsers.json` matches.
Latest (1.62.1) wants build 1234 and fails with `Executable doesn't exist`.
Installing `playwright@1.58.0` into `.ds-sync/` avoided a ~200MB download. If the
cache changes, re-derive the match rather than assuming 1.58.0.

## Known render warns

None. Zero previews exist, so the render check has nothing to flag. A future
sync that reports render warns means components were added, which would be a
genuine shape change worth stopping on.

## Never hand-write `_ds_sync.json`

Its hashes come from a recipe that cannot be reproduced without the CLI
(`keyRecipe 7`, `auxSha`, `bundleSha12`). A wrong hash is worse than a stale
one: stale simply makes the next real sync detect a mismatch and re-upload,
whereas wrong makes it skip a file that needed pushing. Leave it alone and let
a CLI sync regenerate it. The same reasoning covers the generated tail of the
remote README (its property count is converter output) — leave it byte-identical
rather than hand-editing it to numbers you would be guessing at.

## Re-sync risks

- **The class vocabulary in `conventions.md` is hand-maintained.** It is
  validated against the built CSS on every sync (every `.class` and `--token`
  named in it must appear in `_ds_bundle.css` / `tokens/tokens.css`), but
  nothing detects a class added to `components.css` and never documented. After
  editing `components.css`, diff its selector list against the header's table.
- **`05 Design System/README.md` says the app is still the source of truth for
  anything not yet lifted into `components.css`.** Styles still living in
  `06 Composites App/app/index.html` are invisible to this sync. If the app grows a pattern
  worth reusing, lift it into `components.css` first, then re-sync.
- **If the team ever builds a React frontend**, the whole calculus changes: real
  components could ship as importable exports with preview cards, and this
  tokens-only setup would be the thing to replace. Until then, a React wrapper
  library would be code with no consumer, drifting against `components.css`.
- The staged package pins `version: 1.0.0`. It is not read from anything real,
  so it never changes and never invalidates anything.
- **Documented but unstyled is invisible.** The header validator checks that
  every class it names exists in the built CSS, and `05 Design System/README.md`
  tells the design agent "a class not listed here has no styling behind it" —
  which makes the converse trap silent: listed, but equally unstyled. The
  2026-08-25 sync found 25 such classes (Receiving, Export, Storage map, Search
  results, the WO fold classes, `table.sub`), all living only in the app's own
  stylesheet. They are marked app-only in `conventions.md`; lifting them is
  ~73 selectors and a real decision, not a tidy-up.
