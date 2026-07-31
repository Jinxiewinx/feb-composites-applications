# Session state

Rolling handoff file, per working rule 2 in `CLAUDE.md`. If a session got cut off
by a usage limit, read this first. Update it as work proceeds, not just when
stopping.

Keep it short. Durable state only: decisions made, work in flight, open
questions. Not a transcript.

---

Last updated: 2026-07-25
Status: **Mold Stack Planner phase 1 built, not yet committed.** Branch
`mold-sheet-stacking-app`. Board inventory + STL slicer + exploded stack view.
Tests: 90 app, 27 slicer, 73 rules — all passing. Design doc:
`~/.gstack/projects/Jinxiewinx-feb-composites-applications/simonstarbuck-chisinau-design-20260724-190934.md`.
Plan: `~/.claude/plans/b-polymorphic-hippo.md`.
(Prior motorsport UI revamp + dark mode + PWA logo COMPLETE and deployed — see below.)

## Printing on a phone (`print.js`, `print.css`)

Reported from real use: printing a work order "kind of breaks the UI" on mobile.
It did. A sheet is 8.5in — **816 CSS px** — because *this is exactly what prints*
is the whole promise of the preview. On a 390px phone the browser blew the layout
viewport out to 816px to contain it, so the traveler's Initial and Date columns
sat off the right edge with no way to reach them, and the app went with it.

Two halves:

- **Fit, don't reflow.** `--pv-zoom` shrinks the sheet to the screen (never
  enlarges it). Reflowing would make the preview a different document from the
  paper, which is worse than not having a preview. It is `zoom` and not
  `transform: scale()` on purpose — zoom shrinks the element's LAYOUT box, so the
  overflow actually goes away and the scroll height comes out right; a transform
  leaves an 816px box behind it and a tall gap underneath. **`@media print`
  forces `zoom: 1`**, or the sheet prints at whatever fraction the screen needed.
- **Save to the device.** A "Save" button writes the mounted sheet as a
  self-contained HTML file — markup plus the stylesheet inlined, preview chrome
  stripped. Not a PDF: a PDF needs a library and this app ships no external
  scripts. Print still reaches a real PDF, because both iOS and Android offer
  *Save as PDF* in their own print dialog.

Smaller things that were also part of "breaks the UI": the toolbar wrapped onto
three rows and ate a tenth of the screen (phones now show Close / Save / Print
and nothing else — the title, caption and B&W proof are desk furniture), and tap
targets were sized by a **width** breakpoint, which left an iPad's controls 19px
tall. They key on `(pointer: coarse)` now.

`tools/test_print_mobile.mjs` is the guard: it boots the real app at four device
widths, opens all three printable documents, and checks fit, reachability, tap
size, close-restores-the-app, and that the screen fit never reaches the paper —
plus that the saved file is genuinely self-contained. Shared Playwright plumbing
for it and the drawings test lives in `tools/lib/browser.mjs`.

## 3D viewer: pinch to zoom on a phone (`meshview.js`)

Reported from real use: pinch did nothing on mobile. It was never implemented —
the viewer tracked a SINGLE drag point, so a second finger overwrote the first
and a pinch came out as an orbit. Zoom was bound to `wheel` only, and a
touchscreen pinch fires no wheel event (a **trackpad** pinch arrives as a
ctrl-wheel, which is why the desktop path never noticed). The canvas already
sets `touch-action: none`, so the browser's own pinch was suppressed as well —
between the two, the gesture did nothing at all.

Now `mvGesture()`: a pure pointer state machine, one finger orbits, two pinch,
with the camera work left to the thin glue in `mvBindEvents`. Same split the
rest of the file argues for, and here it earns it — the defect was in the
gesture logic, so the gesture logic is what the node tests can now reach.

Two things only a real phone shows, both pinned by tests:

- Lifting one of two fingers must **re-anchor** the orbit on the finger left
  behind. Measuring the next move from the finger that went away flings the
  model by the whole gap between them.
- **`pointercancel` must be handled like `pointerup`.** The browser cancels
  whenever it takes a gesture over; a pointer never cleaned up stays "down" for
  the life of the viewer and the model spins on the next unrelated touch.

`clampDistance()` is now the single place the zoom limits live, so the wheel and
a pinch cannot disagree about how far the camera may go.

Verified with real multi-touch (CDP `Input.dispatchTouchEvent`, mobile context):
spread 911→455 and pinch 455→1822 with yaw unchanged; on the old code the
distance never moved and yaw span 1.2 rad instead.

## Mold Stack Planner — engineering drawing set (`drawings.js`)

The plan page had two views and both answered the same question — *does the mold
fit inside the blocks?* Nobody had answered the one the person GLUING has: the
boards go on by hand, so you stand at a table with a tape and need to know how
far in from each edge of layer 2 layer 3 lands. That number only existed as an
absolute X/Y in the mold's CAD frame, which you cannot measure against a board.

**Drawings** button on a plan → the traveler's own print-preview shell, with
sheet 1 a general assembled isometric, sheet 2 a third-angle three-view, then one
dimensioned placement sheet per layer (so 2 + N sheets, not three pages).

Decisions worth not rediscovering:

- **Dimensions are inches to the nearest 1/16 with the exact mm bracketed.** A
  value not on a 1/16 gets a `≈` — otherwise the fraction gets read as the truth.
  `mmIn()` in stackview.js stays as it is for the on-screen tables.
- **Per-side insets off the board below, PLUS an absolute datum table.** A board
  sawn oversize makes every edge-relative number wrong in the same direction, and
  the datum is how you catch it. Datum = the near-left corner of the stack
  footprint, marked identically on every sheet.
- **Mold silhouette is rasterise-and-trace**, not silhouette edges and not a full
  wireframe. Project, fill cells, walk the boundary, then stitch with slicer.js's
  own `stitchContours` (grid segments share endpoints exactly) and thin with its
  `simplify`. Cannot fail on a rough export, only come out coarse. No mesh (old
  plans, failed upload) falls back to the stored layer contours and every sheet
  says so, because a stepped profile must not pass for the real surface.
- **All furniture is drawn in PAGE coordinates.** Views expose X()/Y(); text is
  at a fixed pt size. Scaling labels with the geometry is the failure this avoids
  structurally.
- Sheets reuse `.ws-page` so `@page`, the print swap and the B&W proof toggle all
  apply — but never `.ws-foot`, which is `position:fixed` in print and would
  stamp every sheet's footer onto every page.
- Long insets are left to the table rather than drawn: on a two-block layer over
  one wide base the far-edge inset is a correct number and a dimension line
  straight across the sheet through the other block.

### Lettering and the legibility test

First round shipped sheets whose labels sat on top of the lines they belonged
to. Screenshots did not catch it — you only see what you happen to look at, on
the fixtures you happen to render, and it stops working the moment nobody looks.

**`tools/test_drawings.mjs`** is the answer and is the thing to keep. It renders
the real sheets in headless Chromium across eight fixtures and then interrogates
the laid-out DOM: no label crossed by a **solid** line, no two labels
overlapping, nothing upside down, nothing under 5.5pt, nothing off the sheet.
It found 45–122 findings per fixture on the first run and is now green.

Things it taught, that are easy to reintroduce:

- Text boxes must be tested as **oriented quads**, not AABBs. Half the labels on
  a sheet are rotated, and the AABB of a 30°-rotated string covers a large empty
  triangle — testing that reports a collision for every rule nearby, and a
  checker people learn to ignore is worse than no checker.
- **Solid geometry crossing a label fails; dashed does not.** That is ASME
  Y14.5, not a threshold picked to go green: dimension and object lines are
  never drawn through text, hidden and centre lines are broken by it.
- Under `rotate(-90)`, `text-anchor="start"` runs the string **upward**. Hanging
  a tight label off the high end with "start" walks it back across the feature.
- Two constraints fight on the isometric dimensions: not upside down, and on the
  far side of their own dimension line. Fix the writing direction for
  readability and move the **anchor** to satisfy the other — choosing the
  direction to fix the second breaks the first, and the "upside-down" check
  exists because that is exactly what happened.
- Every label carries a white halo (`paint-order="stroke"`), which is what CAD
  does. The strict check still stands: the halo covers the layouts eight
  fixtures cannot anticipate, it is not permission to place labels badly.

**Lettering is osifont**, the ISO 3098 face (what FreeCAD uses), subset to 9 KB
and self-hosted — see `03 App/app/fonts/osifont-LICENSE.md`. Bundled rather than
named in a font stack because a fallback changes text metrics, and changed
metrics is precisely how a label ends up on a line: the test can only speak for
what the shop sees if the shop gets the same glyphs. It has **no U+2033 ″**, so
the inch mark is a plain ASCII quote.

## Mold Stack Planner — phase 2 (auto boards, sections, cut list)

**SN5 consumed ~20 sheets**, so the optimizer is worth building — a 20% saving
is 4 sheets. Offcuts ARE stored, down to about 4x10in. Mostly 30 pcf. And "you
can only cut all the way across" is a HARD constraint, not a preference.

Built on top of phase 1: the planner now picks board thicknesses itself from
what the rack holds, sections anything over the 6in cut depth, accepts a typed
rectangular block as well as an STL, and emits a guillotine cut list.

### What the two real SN5 molds taught us

`Clamshell Mold With Mating Surface.stl` — one body, 889 x 533 x 61.6mm, i.e.
exactly 35.00 x 21.00 x 2.43in. Designed in inches, exported in mm. This is the
mold that hit the 889.00 stitching bug.

`Undertray Mold.stl` — **31 separate bodies** scattered over 8.7m of assembly
space. Taking the whole file's bounding box plans a nine-metre void. Individual
bodies are sane (43x45x8in, 70x54x10in, 52x46x10.6in) and FOUR of the eight
largest exceed the 6in cut depth. Multi-body handling is not optional, and the
6in rule is confirmed by real data rather than theory.

### The big design correction

**Monotonicity was only ever an OPTIMISATION.** It let us slice once per layer
(union over a slab == section at its bottom, given positive draft). Real molds
break it: undertray body #1 flares 85mm outward above its base, body #3 flares
680mm — in every one of the six axis orientations. Refusing them was wrong.

A blank only has to CONTAIN the mold, and that is computable exactly with no
draft assumption, because we only ever need boxes: clip every triangle to the
slab, take the XY box of what survives, merge overlapping boxes (`slabBoxes`).
No sampling, no polygon booleans, same clip the containment test already used.
Occupancy is rasterised on a grid of cell = merge inflation so merging is not
O(n^2); a grid merges slightly MORE eagerly, which is the safe direction.

So now: blanks come from the exact path, contours are cosmetic (best-effort, for
the drawn outline), and bad draft is a CS-003 §7.1.4 design-review WARNING
instead of a refusal.

### Other things worth not rediscovering

- **Thin boards always win on volume alone** — each layer only covers its own
  slab, so subdividing can never use more board. Without a counterweight the
  planner picks the thinnest stack every time and hands the shop 8 glue joints
  at a 4h clamp each. `LAYER_PENALTY_MM3` (~2% of a sheet) is what an extra
  glue joint must save to be worth it. Tune it once somebody has glued a few.
- **The packer models cuts as a binary tree, not placements.** Guillotine
  feasibility is then structural rather than checked afterwards. The span of the
  SECOND cut at each node depends on whether the FIRST happened — if the
  leftover was thinner than the blade there is no cut and the piece in hand is
  still the full rectangle. Get that wrong and you print a notch, which a saw
  cannot make.
- **Kerf is not optional in the test either.** The cut-replay simulation must
  separate pieces by the blade width; modelling them as touching makes every
  downstream boundary drift and spans stop matching.
- **Boards are tried smallest-first** so offcuts get spent before fresh sheets.
- Density is NOT interchangeable (CS-004), so a 1in 30lb blank will report a
  shortfall rather than quietly come off a 1in 60lb board.

### Still open

- Remnant write-back into stock (the packer already returns reusable offcuts).
- Work-order attachment + the CS-003 §7.2 blocker wiring.
- Elastic margin band / strip-sharing quantisation — the design doc's best idea,
  still unimplemented; margins are currently a fixed 1in.
- `@berkeley.edu` fixtures in `tools/test_app.mjs` on a public repo.

## Mold Stack Planner — phase 1 (built, uncommitted)

New **Stock** tab. Two jobs: a live tooling-board inventory (CS-011 wants one and
never had one), and slicing a mold STL into a layer stack so CS-003 §7.2
checklist item 7 — "stack plan drawn", a BLOCKER step — stops being hand-drawn.

Phase 2 (the guillotine cut-plan optimizer across a batch of molds) is
deliberately NOT built. Its value is unvalidated until someone measures how many
sheets SN5 actually consumed. See "Open questions" below.

New files: `app/stock.js`, `app/slicer.js`, `app/slicer.worker.js`,
`app/stackview.js`, `tools/test_slicer.mjs`, `tools/nocache_server.py`.
Touched: `app/core.js` (DB + TABS row), `app/fb.js` (COLLECTIONS + ID_PREFIX),
`app/index.html`, `firestore.rules`, `tools/test_app.mjs`, `tools/test_wo_rules.mjs`.

### Decisions that cost something to rediscover

**Dimensions are stored AS ENTERED with a unit tag** (`{value:48, unit:"in"}`),
never normalised on write. Storing canonical mm and redisplaying in inches drifts
on every edit: 48 → 1219.2 → 47.99999 → saved. `toMm()` is the only conversion
point. There is a test for exactly this round-trip.

**Derived geometry is persisted, not the STL.** The reviewer needs the plan, not
the mesh. This also dodges a live bug: `.stl` has no browser MIME type, so
`fb.js` falls through to `application/octet-stream`, which the `storage.rules`
content-type allowlist rejects — an STL upload would fail as a permissions error
on a normal file pick. `storage.rules` is untouched as a result.

**The slicer is PURE and lives off the main thread.** `render()` in core.js is
fully synchronous and nothing else in the app ever blocks, so slicing inline
freezes the tab with no spinner to borrow. `slicer.worker.js` is a thin
`importScripts('slicer.js')` wrapper. Purity is why `tools/test_slicer.mjs` can
run the geometry under node with nothing stubbed.

**Geometry model — do not "simplify" these, both were bugs caught in review:**

- Layer footprint is the union over the whole slab, NOT a section at one height.
  A plane at the top of a layer undersizes the blank by thickness × tan(wall
  angle), which exceeds the entire margin band. Because CS-003 §7.1.4 requires
  positive draft, the solid grows downward, so the union equals the section at
  the layer's BOTTOM exactly — one slice, no polygon booleans.
- Monotonicity is asserted on 2D OUTER contours only. A bounding box cannot see
  an interior hole, so blind bottom dowel holes (which CS-003 §7.1.6 *requires*
  on split sections) must not be rejected. A "vertical ray crosses twice" test is
  NOT equivalent — that is vertical convexity and it passes a blind hole where
  monotonicity genuinely fails.
- Island merging iterates on GROUP boxes, never island boxes. A U of three rails
  plus a central boss: the rails merge into one huge group box, the boss never
  merges, and the boss's blank ends up entirely INSIDE the rails' blank. Two
  solid blocks in the same place. `test_slicer.mjs` guards this both ways — it
  also asserts the old island-level rule really does collide, so the guard can't
  go vacuous.

**Contour stitching welds on a RADIUS, never an exact grid cell.** Endpoints are
bucketed on a `WELD_TOL_MM` grid for speed, but matching searches the 3x3
neighbourhood and confirms by real distance. Requiring an exact cell match looks
correct and is not: two points a millionth of a millimetre apart land in
different cells whenever they straddle a cell boundary, and a perfectly good mesh
then reports "the outline does not close". Real molds hit this constantly,
because designers put corners on round numbers and round numbers are exactly
where grid boundaries sit. Found in production on a mold with a corner at
889.005mm (35.000in). `test_slicer.mjs` has a REGRESSION test pinning it, plus a
counter-test that a genuine 5mm hole is still refused — the fix must not become
"join anything". The error now quantifies the gap, which is what distinguishes a
too-tight tolerance from a broken mesh.

**Weld tolerance is a floor that RELAXES, and it is not the dedupe tolerance.**
0.05mm floor, doubling to a 1mm cap (`stitchRelaxed`), and the last attempt is
clamped to the cap or the real limit would be 0.8mm. A hard 0.01mm refused a real
mold whose triangles were 0.012mm apart — ordinary tessellation noise, not a
defect. Loosening is safe because contours only feed a bounding box, the
monotonicity check and a drawn outline: blanks carry a 25.4mm margin and CS-003
§7.1.5 forbids any machined section under 15mm, so a 1mm weld is 15x below the
smallest feature that may exist. Past the cap it is a genuine hole and we refuse.
`DEDUPE_TOL_MM` (1e-4) is deliberately separate — it only collapses the doubled
hit from a vertex sitting exactly on the slice plane, and tying it to a relaxed
weld would start eating whole segments on a fine mesh, losing real geometry to
fix a joining problem. A stack that needed relaxing emits a warning.

**The containment test is the spine.** Clip each triangle to the slab and check
the clipped POLYGON (not its bounding box) against the blank set, run against raw
STL triangles. Both naive versions are wrong: vertex-in-slab is unsound (a
triangle can cross with no vertex inside), and all-vertices-of-overlapping-
triangles false-fails on drafted walls. Clip the OPEN slab — material exactly on
a boundary plane belongs to the neighbouring layer.

**Two silent-failure gaps, both closed.** Worker OOM (size guard + `onerror` +
timeout) and the Firestore 1 MB document ceiling (`fitPlanForStorage` thins
contours until it fits, never dropping blanks, and says when detail was lost).

**Explode gap scales with the mold** (`isoGap`, 0.45 × footprint). A fixed gap
turned a 490mm board into overlapping diamonds. Layer labels are drawn in a final
pass or the next layer paints over them.

### Verified in a real browser, not just asserted

Served with `python3 tools/nocache_server.py 8126` (new — `python3 -m
http.server` sends no cache headers and will serve a stale slicer.js; same class
of bug that already bit this project). Stubbed `window.fb` per the pattern below,
then: stock tab renders with mixed in/mm boards; a 24-triangle plug sliced
through the real Worker into 4 layers, blanks shrinking 490.8 → 371.3 mm;
exploded view correct in light AND dark mode; an overhung mold refused with
"Look near X 115, Y -115 on layer 2".

### Open questions for Simon (these gate phase 2)

- **How many sheets did the SN5 mold set actually consume?** This decides whether
  the optimizer is worth ~10 weeks. 6 sheets → a 20% saving is one sheet. 40 →
  it pays for itself. Purchase history / #purchasing has it.
- **Do 30 and 60 lb/ft³ boards mix within one stack?** CS-004 says 60 seals
  better and the mold surface is machined into the top. Changes the data model.
- **Are offcuts physically stored and labelled?** The remnant ledger describes
  boards someone has to find. If they're scattered, the ledger is fiction. This
  is the question most likely to quietly kill phase 2.
- Which saw, who runs it, smallest piece safe to cut (sets the minimum blank).
- Is "cut all the way across first" a hard rule or a habit?
- Default margin: 1″ or 2″? Currently 1″ min, 2″ max.

Revamp verified: light+dark across all 10 tabs + WO detail + login + mobile drawer;
WCAG AA contrast on all token pairs in both themes (faint nudged to clear 4.5:1 —
5.16 light / 5.57 dark); zero horizontal overflow both themes; PWA manifest +
icons resolve; 73 logic tests pass. PWA icons live at icon-192/512/maskable +
apple-touch, from the FEB mark rasterised by ImageMagick (pre-baked coords, no
gradients/transforms, so magick renders exactly). Fonts/icons get a 1-year
immutable cache header; manifest stays no-cache.
NOTE not machine-verified: the print traveler in dark mode — the @media print
token reset (forces --ink #000 / --surface #fff for both :root and
[data-theme=dark]) is deterministic CSS and print.css was untouched, but nobody
ran a real print. Spot-check on a printer if in doubt.

## UI revamp (in flight) — decisions

Direction: **motorsport energy** + **full dark mode** (auto-follow system +
toggle), Simon's picks. FEB logo is the two-parallelogram blue+gold "speed slash"
mark from ev.studentorg.berkeley.edu; reproduced as SVG (`febMark()` in core.js)
rather than the raster, so it's crisp everywhere. Brand: Berkeley navy #003262
base, electric blue #2f6be4 accent, gold #FDB515 energy.

Token architecture (index.html `<style>`): OLD var names (--blue --canvas --card
--line --ink --muted --bad --ok --amber --accent --accent-soft --radius --shadow)
kept as ALIASES so every existing component themes for free; NEW names
(--surface-2 --hover --fill, status -bg/-border, --brand-ink, --shadow-md, motion,
fonts) drive the revamp. Dark theme = `:root[data-theme="dark"]` re-points the
shared tokens. `--brand-ink` exists because navy text (#003262) is invisible on
dark — it's navy in light, bright blue in dark; all `color: var(--blue)` text uses
were swapped to it. No-FOUC inline `<head>` script sets data-theme before paint
(localStorage `feb-theme`, else system). `applyTheme`/`toggleTheme` in core.js.

PRINT SAFETY (critical): `@media print` resets all themeable tokens to light
(black-on-white) at the top of the block, because print.css reads var(--ink) and
the fallback path reads var(--surface) — without the reset, printing in dark mode
gave white-on-white. Verify the traveler after any token change.

Fonts self-hosted in `app/fonts/` (Inter + Saira, variable woff2, one file each,
~84KB total) — offline-safe, no CDN. Inter = body/UI, Saira = display (h1, card
h2, .bignum) for the technical/motorsport feel.

Icon system: `icon(name,size)` in core.js returns inline Lucide-style SVG; ICONS
dict. Replaced ALL 10 nav glyphs, topbar emoji (search/bell/menu/more), theme
sun/moon, picker caret, and the ⋯-menu action icons. Motifs: gold skewed "slash"
on the active nav item (`.sb-item.active::before`), subtle carbon-weave
(repeating-linear-gradient at --carbon ~4%) on the navy sidebar.

Test fix: `tools/test_app.mjs` bell assertion checked for the 🔔 emoji; now checks
`aria-label="Notifications"` + the badge. 73 pass.

## Where things stand

## Composites app responsive work (in flight)

Making `03 App/app/` work on phones/tablets without changing desktop.
Simon picked two forks: mobile nav is a **slide-in drawer** (hamburger), and wide
list tables become **stacked cards** on narrow screens. Breakpoints: phone ≤640,
tablet ≤900; `max-width` queries so desktop is the untouched default.

Testing without a backend: serve `app/` on a local port, open in Chrome, then
inject a stub `window.fb = {state:'ready', user, roster, save:()=>…}` plus the SN5
seeds into `DB` and call `render()`. Everything is global scope so this gives a
fully populated signed-in UI with no Firebase. `window.__seed()` in the page does
it. Guard against horizontal overflow with
`document.documentElement.scrollWidth <= innerWidth+1` per tab per width.

Gotcha already hit: `closeDrawer()`/`toggleDrawer()` touch `document.body.classList`,
which is undefined in the DOM-stub test harness (`tools/test_app.mjs`), so they
must guard `if (document.body)`. Without it 19 tests threw. Back to 73 passing.

Chunk 1 (done, pushed): breakpoint system replacing the old lone 760px rule;
sidebar becomes a fixed off-canvas drawer slid in by `body.drawer-open` with a
`#drawer-backdrop`; topbar gets a `.hamburger` (≤900) and, on phones (≤640),
folds the secondary actions (`.tb-desktop`) into a `⋯` sheet via `openMoreMenu()`.
Drawer reuses the existing `.sidebar` markup, no duplication. Verified in-browser
at 390 and 1300px: drawer opens/closes, overflow menu lists lead actions, desktop
unchanged.

Chunk 2 (done, pushed): stacked list tables. `labelListTables()` in core.js runs
at the end of render(), copying each `table.list` header cell's text onto every
body cell's `data-label`. CSS (≤640) hides the header row, makes each `<tr>` a
card and each `<td>` a `Label  value` flex line via `::before { content:
attr(data-label) }`; first cell is the card title. `table.sub` gets
`display:block; overflow-x:auto` to scroll instead of blowing out. Zero edits to
tab renderers. Verified: all 10 tabs no h-overflow at mobile width; work orders
and parts stack cleanly (stage badges, status pills as values); desktop
unchanged (td stays table-cell, ::before content none).

Chunk 3 (done, pushed): board / calendar / modal / touch. Projects board stacks
to one status section per row (≤640 `.board { grid-template-columns: 1fr }`).
Calendar events become 8px colored dots (pointer-events:none) and each day cell
gets `onclick="calDay(iso)"`; calDay opens a modal listing that day's items
(no-op above 640 so desktop keeps its per-item links). Modal `.row2` collapses to
one column, inputs go 16px (iOS zoom), and `@media (pointer:coarse)` bumps tap
targets. Verified at 500px: board single-column, calendar dots + day modal, no
overflow on any of the 10 tabs, WO detail clean, new-project modal single-column;
at 1300px board is 4-col, calendar shows full labels, hamburger hidden.

IMPORTANT CSS architecture decision: ALL responsive rules live in one block at the
END of index.html's <style> (right before @media print). Reason: at equal
specificity the later rule wins, and several base rules (`.board`, `table.cal`,
`#modal .row2`) are defined *after* where the media block first sat, so the early
placement lost on source order (board stayed 2-col at ≤640). Moving every
screen-width override to the end makes them deterministically beat the bases. Do
not scatter responsive rules back up next to the components — keep them in the
end block.

Local testing gotcha: `python3 -m http.server` sends no cache headers, so the
browser served a stale calendar.js (calDay undefined) after edits. Use the
no-cache server at `scratchpad/nocache_server.py` on port 8126 (adds
`Cache-Control: no-store`) for browser testing. Same cache class as the prod
firebase.json no-cache headers.

Chunk 4 (done, pushed): tablet fix + full visual sweep. The 8-column Parts table
overflowed at 768px (tablet) because tables only stacked at ≤640. Since the
sidebar already becomes a drawer at ≤900, moved the table-stacking rules up to
the ≤900 block so tables card-stack across the whole compact range; phone-only
chrome (topbar ⋯ fold, calendar dots, board 1-col, 16px inputs) stays ≤640. Also
switched the stacked-card cell from `display:flex; justify-content:space-between`
to `display:block` with a floated label in a 92px gutter, so a value made of
several spans (a date plus a "(179d late)" tag) stays grouped and right-aligned
instead of being spread apart. Swept all 10 tabs + WO/parts/project detail views
at 400/768/1300px: zero horizontal overflow anywhere, desktop byte-identical
(table/table-cell, no ::before). 73 logic tests pass.

Net result: the composites app is responsive end to end. Drawer nav + card tables
≤900; phone chrome ≤640; desktop unchanged >900. All in index.html's end-of-style
responsive block + core.js labelListTables() + calendar.js calDay().

## Where things stand

The composites app is live at feb-composites.web.app and the whole SN6 Resources
handoff is on GitHub at Jinxiewinx/feb-composites-applications (public, `main`).
As of 2026-07-21 the repo holds all of `00` through `05` plus `tools/`, not just
the app.

Most recent work: the printed work-order traveler. Printing a work order now
produces a purpose-built hand-fillable form instead of a screenshot of the app.
Finished and pushed. `tools/test_app.mjs` is at 67 passing.

## Decisions made (don't relitigate)

### Repo

The git root is this folder, not `03 App/`. The scripts in `tools/`
resolve `Path(__file__).parent.parent / "03 App"`, so they only run from
one level up. `firebase deploy` still runs from inside `03 App/`.

Push over HTTPS, never SSH. The machine's SSH key authenticates as
`starbuckgold`, but the repo belongs to `Jinxiewinx`, which is the `gh` CLI
account. `ssh -T git@github.com` reporting success is misleading here.

The repo is public, Simon's call. Scanned clean: no credentials, no
`@berkeley.edu` addresses, no member names in the seed data. The Firebase
`apiKey` in `app/firebase-config.js` is a public web config by design, since
security lives in `firestore.rules`.

### Printed traveler

The print document is its own DOM, built by `app/print.js` into `#printroot`,
rather than the screen view restyled. `@media print` only chooses which of `#app`
and `#printroot` is visible, keyed off `body.sheet`.

`print.css` is deliberately not inside `@media print`. The sheet renders
identically on screen and on paper, which is what makes the preview trustworthy
and lets the design be reviewed from a screenshot. Don't tidy it into a
print-only block; that breaks the whole review loop.

Shop-traveler styling, black-and-white laser first. Every distinction has to
survive grayscale, so blockers use hatching plus heavy rules plus the literal
word BLOCKER, never colour alone. Berkeley blue and gold are enhancement only.

The sheet is capped at two pages, and the writing space is what flexes. `LAYOUTS`
in `print.js` is a ladder of row counts and note-block heights, most generous
first; `fitSheetHtml` renders each candidate into `#printroot.measuring`,
measures it, and takes the first that fits `MAX_PAGES`. Don't replace this with
fixed row counts: the whole point is that a sparse work order gets room to write
and a dense one still lands on two pages. `FIT_SAFETY` (0.93) discounts the
measured capacity because `break-inside: avoid` breaks earlier than a naive
height division.

Verified across the whole archive: `tools/print-preview.html` has an Audit all
button that runs all 26 seed work orders plus a blank of each process through the
real fit loop. As of 2026-07-21 all 31 fit, worst case 2.00 pages, one work order
(WO-SN5-006) reaching the compact floor. Re-run it after any layout change.

Standard references are off the printed sheet and out of new work orders.
`STD_STEPS` titles no longer carry them, and `stripCS()` in `workorders.js`
removes them at render time from legacy and retro records, covering titles, notes
and event-log text. Stored data is untouched, so the archive keeps its original
wording.

Retro records store the literal string `"not recorded (retro)"`. `pv()` maps that
to empty so it never reaches paper looking like data. Blank forms build their
steps from `STD_STEPS`, so a blank is a real procedure rather than empty ruling.

Page numbering is hand-written (`Page ___ of ___`). Chrome doesn't support
`@page` margin-box counters, so there's no honest way to print it.

### CFD PDF viewer (07)

Done as of 2026-07-21, all six phases. Indexing, page view with synced scrolling,
panel compare, overlay, summary, and the Electron shell with a verified macOS
build.

The model that everything rests on: pages are stacked into one continuous strip
of PDF points, and a panel is a window into that strip. Panels sit on a uniform
502.5 pt pitch and flow across page breaks, so nothing may assume a panel lives
on one page. Panels match across reports by name, with position as the fallback.

Panel titles are found by font height (26.8125 pt in this exporter, matched with
a tolerance band) plus a left-margin test. That yields 59 named panels: 36
contours, 6 vectors, 17 plots. `test/test_indexer.mjs` pins all of it against the
real DP_22.pdf, so a change to the Fluent export breaks the test first.

Verified in the browser, not just asserted: two identical reports diff to exactly
0 pixels of 2,809,400, and the Ghostscript-perturbed variant from
`tools/make-test-variant.mjs` diffs to 5.62%. Sync, unlock and re-sync were
checked by scripted scrolling.

Note this app uses ES modules, unlike the composites app's classic scripts.
pdf.js ships as a module and pulls a module worker with it, so that was forced.
It also means the folder has to be served over HTTP rather than opened from
file://. The Electron shell handles that by serving the app over a custom app://
protocol, which is why the desktop and browser builds run identical code with
nothing conditional between them. Don't "simplify" it to loadFile; the module
worker will stop loading.

The macOS build is verified end to end: electron-builder produces a 115 MB .dmg
and .zip, and `npm run smoke` drives the packaged app over the DevTools protocol
and confirms it indexes a report in the window. It is unsigned, so first launch
needs right-click then Open. The Windows target is configured but unbuilt, since
cross-building from macOS needs Wine.

DP_22.pdf is bundled into the packaged app on purpose, so the demo button works
on first launch. Without it the packaged app 404s on the sample, which is how
that was caught.

Bug-fix round after Simon's first real use, 2026-07-21:

Panel height is measured from where the next panel or section heading begins, not
from the median pitch. A page break inside a panel pushes the plot down, and 28
of 58 panels then need more room than the pitch; assuming it cropped them. Capped
at 1.6x pitch so a panel at a section boundary (one raw extent is 1053 pt of
mostly whitespace) does not become a huge empty pane.

Panels and Overlay crop to content through one shared box computed across every
report being compared (`jointCrop` in render.js). Cropping each report to its own
content would offset them and the difference view would report that offset as
change everywhere. The guard test is that two identical reports still diff to
exactly 0; verified across five panels.

`.panelcell canvas` must not have a max-width. The canvas carries inline width
and height, so a max-width clamped the width while the height stood and every
plot stretched vertically on zoom.

Zoom is per column and mirrors across columns only when tracking is on, matching
the scroll lock. Pinch arrives as a wheel event with ctrlKey; the per-event delta
is clamped because a mouse wheel sends 120 where a trackpad sends single digits,
and unclamped that was a 3.3x jump per notch.

The window is frameless, so the toolbar is the drag region (`-webkit-app-region`)
and every control in it opts out, with an 84 px left inset on macOS for the
traffic lights. Verified by computed style in both the dev and packaged builds.

Second bug-fix round, 2026-07-22:

Content-space layout. Pages now lay out with their print margins removed
(`measureMargins` in render.js, `withContentSpace` in indexer.js), so a plot that
spans a page break is one continuous image and the panel crop stops mistaking the
seam's white band for the title gap. This is the core model change. Paper-space
`absY` is kept as `paperAbsY`; everything reading geometry now reads content
space. `pagesForRange` composites in content space, skipping each page's top/
bottom margin. `measureMargins` needs a canvas so it runs in the browser after
the (node-testable, text-only) `indexDocument`; the node test feeds synthetic
margins to `withContentSpace` instead.

Delete button: pdf.js 6 has no `PDFDocumentProxy.destroy()`. The old
`d.pdf.destroy()` threw before the list filter ran, so nothing was removed. Now
teardown goes through the loading task (`doc.task`), guarded, and the filter runs
regardless.

Zoom streaks were the diagonal `.placeholder` hatch flashing on every rebuild.
Fixed by rescaling the existing canvases in place (`rescaleStrip`) and keeping the
old bitmap until a debounced sharp re-raster lands, plus a flat placeholder.

Overlay diff: reading the two cropped canvases directly instead of drawing both
onto one scratch canvas and reading it back twice. The round-trip added a couple
of LSB differences on a GPU-backed canvas, so identical reports read "0.00%
differ" instead of identical. Render + jointCrop were already bit-exact.

Overlay now defaults to swipe.

Build gotcha: after editing app/, `open`ing dist/ runs the OLD app if a prior
instance is still alive; and `asar extract-file | node` truncates, which looked
like a stale build when it was not. Use full `asar extract` to verify, and kill
every running instance before relaunching. Verified content-space runs in the
packaged app via CDP (contentHeight 41288).

## Open questions for Simon

Nothing blocking.

The full traveler runs about 3 pages for a complete work order, 2 for a blank.
That's the cost of the generous fill-in space. Say if it should be tightened.

## Notes for whoever picks this up

The visual review harness is `tools/print-preview.html`. It needs a real HTTP
origin, since the seed JSON fetch is blocked on `file://`. Run
`python3 -m http.server 8777` from this folder, then open
`http://localhost:8777/tools/print-preview.html`. It has toggles for blank form,
B&W proof, margin guides and page breaks, plus a readout of approximate page
count and horizontal overflow.

Test harness gotcha: `tools/test_app.mjs` concatenates the app's classic scripts
into one indirect `eval`. Top-level `const` stays lexical and is invisible to the
tests, so the harness rewrites a named list
(`STD_STEPS|WO_STATUSES|PROCESSES|BLANK_ROWS|BLANK_FORM_ROWS`) into implicit
globals. Adding a new app file means adding it to `FILES` too, or the harness
silently won't see it.

`firebase.json`'s no-cache header now covers `css` as well as `html|js|json`. It
previously didn't, which would have served `print.css` stale for an hour. Same
class of cache bug that bit Simon during initial setup.

Storage-backed features (avatar and file upload) still need the Firebase Blaze
plan. They're built and tested against the emulator. Emulator hosting port is
5050, because macOS AirPlay squats on 5000.

## Next up (not started)

- Port the traveler to the offline single-file `work-orders.html`, which still
  has the old print CSS.
- `reports.js` "Print status board" still calls raw `window.print()`.
- `05 Printables/printables.html` is open to redesign. Simon said it isn't a
  house style to conform to.
- The CS standards in `02 CS Standards/src/` haven't been swept for AI writing
  patterns. They're versioned documents with approval tables, so a prose edit
  means a revision bump under CS-000. Ask before touching them.
