# Session state

Rolling handoff file, per working rule 2 in `CLAUDE.md`. If a session got cut off
by a usage limit, read this first. Update it as work proceeds, not just when
stopping.

Keep it short. Durable state only: decisions made, work in flight, open
questions. Not a transcript.

---

Last updated: 2026-07-22
Status: responsive UI/UX for the composites app COMPLETE and pushed (chunks 1–4).
Clean stopping point. Plan file: `~/.claude/plans/dapper-strolling-pine.md`.

## Composites app responsive work (in flight)

Making `03 Work Orders/app/` work on phones/tablets without changing desktop.
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

The git root is this folder, not `03 Work Orders/`. The scripts in `tools/`
resolve `Path(__file__).parent.parent / "03 Work Orders"`, so they only run from
one level up. `firebase deploy` still runs from inside `03 Work Orders/`.

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
