# Session state

Rolling handoff. If a session got cut off, read this first. Update it as work
proceeds, not just when stopping.

**This file has a budget: 400 lines.** It holds durable state only — what is
unshipped, what is broken, what must not be undone, what is next. It is not a
transcript and not a changelog; `git log` is both of those. Before adding
anything, read `.claude/SESSION-STATE-POLICY.md`: it holds the five-part keep
test and the per-section caps, and it exists because this file once reached
3,183 lines and nobody could find anything in it.

Everything dropped in the 2026-08-25 cleanup is recoverable:

```bash
git log -p --follow -- SESSION-STATE.md
```

---

## Now

**INVENTORY ROUND 2 IS COMPLETE** (plan: the snoopy-dragon plan file on
Simon's Mac; approved 2026-08-28 with three review additions). Landed so far:
grouped lot display (groupLots keyed matKey-else-name; group rows fold via a
CLASS, not <details> — print must paint; members show EH&S short codes),
section headers with counts + per-kind accents on the location page, the
Materials list grouped by default with a Grouped/Flat toggle (flat when
searching), map cards clickable anywhere (container onclick backstop + the
buttons stopPropagation — the old "no stopPropagation" test was rewritten
deliberately), the resin+hardener warning REMOVED code-only (CS-011 §6
still says otherwise on purpose — Simon revises the standard himself at
Rev D; do not edit it from a session), and the iOS keyboard zoom fix
(viewport maximum-scale=1 + 16px coarse-pointer inputs). Landed since: B mass
delete (Select… on Items/Materials lists, view.shopPick, open to every
member; firestore.rules items/lots delete moved from isLead()||mine() to
onRoster() — RULES DEPLOYED; stock keeps the undo shape; occupied BINs are
never deleted; cure/panel refs keep deleted ids as text on purpose —
history is not rewritten; budget lines drop deleted lotRefs). Landed:
C scan-into-field (scanEhsInto on the detail "ehs" field type; rxScanEhs on
the receiving cell appends sticky-scanned tags; sticky+onUnknown is now a
supported openScan combination, debounced with a "u:" key) and E the
materials table (materials.js: MATERIALS aliases→matKey, docs/manifest paths
test-enforced via materialsTableProblems, ratio/shelf-life ONLY where read
from a bundled TDS and cited in src — IN2/AT30 100:30 by weight + 12mo,
WEST-209 3:1, WEST-206 5:1, XCR 12mo ratio-blank; matForName fills blank
matKey in receiving + EH&S import; matstrip on lot detail; lite ratio/TDS on
group rows; "Link materials" backfill on the Materials list fills blank
matKeys and missing expiries from shelf life, stamped "shelf-life table").
The whole round-2 plan is DONE. Simon still needs to press Link materials
once, signed in, to backfill the 50 imported containers. A flaky test was
fixed in passing: the dashboard "part of" assert now matches the chip
markup, not the phrase — a Team-lore fact contains the words.

**EH&S (RSS Chemicals) barcodes: ALL FOUR PHASES BUILT.** Phases 1–2 (the
`ehsBarcode` field + one-tag-one-container, the scanner reading UC tags via
`scanResolve`, the receiving desk's tag column) are live and were verified
off the host. Phase 3: iPhones camera-scan through `scan-fallback.js`, a
lazy-loaded BarcodeDetector polyfill over vendored zxing-wasm 3.1.3
(`app/vendor/zxing/`, 1.0MB wasm fetched only when a scan opens on a
detector-less browser; load failure is sticky per session and degrades to the
typed box). Phase 4: **EH&S import** on the Inventory toolbar (lead-only)
parses the RSS web export — .xlsx read natively via a zip walker +
DecompressionStream in `ehsimport.js`, CSV fallback — groups by sublocation
(FEB's ticked by default, per Simon 2026-08-28: import only Formula Electric
stuff), maps each to one of our BINs (flammable sublocations guess the
Flammables-cabinet shelf), skips barcodes any record already wears, creates
the rest (class/role from rxGuessClass, hazard from H22x codes, blank codes
stay unknown, CON gets count 1, batch-tagged `rxBatch: EHS-<date>-…`,
importMany + publishPub over 8 records). The Export modal gained an "EH&S
reconciliation" sheet (`invExportEhs`), attention rows first. Simon's real
export (628 containers, 17 sublocations) parses clean in Chromium: FEB's 50
containers → 3 RSN resin, 16 RSN hardener, 31 CON, 15 flammable. **Nothing
imported into production yet — Simon runs the import himself** (needs a
lead sign-in; the file is `~/Downloads/Chemical Export Aug 28 2026.xlsx`).
Still open: a photo of a physical tag to confirm which symbologies the
stickers actually use (scanner currently enables QR + code_128/39/93 +
data_matrix; barcodes are 24-char strings like CA0000000000000000228D47).
The receiving grid stacks to cards below **1320px** (was 1200) — the eighth
column pushed the table's minimum to ~1300; do not claw it back by shaving
measured columns. No rules deploy anywhere (lots/items have no field
whitelist). Any new writer of ehsBarcode must call ehsNorm; comparisons go
through ehsKey (dash-blind).

**v3.1.0 IS TAGGED, PUSHED AND LIVE**, serving from `feb-composites.web.app`
and verified by fetching `core.js` off the host. v3.0.0 went out an hour
earlier the same day — Major by CHANGELOG's own rubric, since Season editing
moved off the tab and the dashboard became a different page.

v3.1.0 is Simon's correction to v3.0.0's Season: the compactness was right, the
two-abreast flow was not. `.sline` and `.shead` now share ONE declaration of
eight fixed grid tracks, so the lines are columnated rather than each sizing its
own auto tracks. Two fields came back onto the line with the width — `layupType`
and `moldLocation` are `where: "grid"` in SEASON_COLS again. **Do not reach for
`columns:` on `.seasongrid` a third time**: it is what made the fields land in a
different place on every line.

**Nobody has been told about either one.** `config/release` is untouched, so
there is no reload banner and no What's New panel — anyone still on v2.2.2 stays
there until a lead opens the app and presses `⋯ → Announce this release`. That
one press covers both releases; the panel shows v3.1.0's WHATS_NEW, so v3.0.0's
five items (guest mode, the pit board, the cut sheets, the splash) are now only
in CHANGELOG.md — worth saying out loud in the #composites note, which the
script prints and never posts. Re-run `node tools/release.mjs 3.1.0 --dry` to
reprint it. Both are still outstanding and both are Simon's call.

The plan for the five-item pass is at
`C:\Users\simon\.claude\plans\lets-now-develop-a-staged-elephant.md`.

**GUEST MODE IS ON, AND THE APP IS PUBLICLY READABLE.** Anonymous sign-in is
enabled on the project and `autodeleteAnonymousUsers` is on, so a visit no
longer mints a permanent Auth record. Anyone with the URL can press "View as
guest" and read the whole app — parts, runs, molds, stock, budget, the roster.
That is the agreed design, not an accident, and it is the one thing in this repo
that cannot be walked back quietly: anything read in the meantime is read.

Verified against PRODUCTION with a real anonymous token, not against the
emulator: every collection reads 200, every write and delete is 403, storage
upload is 403, and the three client layers refuse independently (core.js toasts,
fb.js throws `guest/read-only`, the rules refuse the transport). All eleven tabs
render with no console errors and nothing editable.

**Turning it off again is the same switch**, Authentication → Sign-in method →
Anonymous. The rules can stay as they are: `guest()` matches nothing when the
provider is disabled, so the predicate is inert rather than wrong.

**The deploy order was load-bearing and stays that way.** Rules alone first,
then hosting. An old client under new rules is fine; a new client under old
rules is a guest refused every collection, which looks exactly like the app
being broken. Note the CLI selector for storage is `storage`, NOT
`storage:rules` — the latter is parsed as a deploy target and fails with
"Could not find rules for the following storage targets: rules".

**Guest read costs eleven full-collection snapshots per visitor.** The whole
database, per person, from a public URL, on Blaze. Simon's call was to ship and
watch the bill. If it moves, the fix is a lazy per-tab sync for guests rather
than the boot-time `COLLECTIONS.forEach`; App Check is the real answer and is
its own project.

**The one thing in the plan that is a rules deploy is guest mode, and it is
deliberately last.** Rules go alone and first; everything else in this pass is
hosting only.

**Guest read discloses team email addresses, and no roster rule prevents it.**
`createdBy` and `updatedBy` are stamped on every record, and every buy-off,
override and comment carries an `email`. Closing `roster/` would have cost names
and photos and withheld nothing. Accepted deliberately; the alternative is a
curated public mirror of every collection, which is the `pub/` pattern at ten
times the size.

**A dashboard lane cannot ship without an empty state, and that is enforced.**
`laneShell()` is the only thing that renders a lane and `emptyFn` is a required
parameter — it throws without one. That is the whole fix for round four's five
collapsible areas, and weakening the signature to an optional argument brings
the holes straight back.

**Nothing is scored across lanes, on purpose.** `actScore` runs inside "waiting
on you" only. Its tiers sit 50 apart because every bonus added together is 45:
make the bonuses bigger, or the tiers closer, and a low tier quietly outranks
the one above it. `test_app.mjs` pins that relationship rather than a symptom.

**`min == max` is asserted byte-identical to the pre-range packer.** That test
in `test_packer.mjs` is the rollback story for the whole density-range feature —
a mold planned at one grade must pack exactly as it did before ranges existed.
Do not let it drift.

**Adding a method to `fb` means adding it to seven dev shims too.** `fb.js` is
the real one, but `tools/serve_populated.mjs`, `tools/lib/browser.mjs`,
`test_appui`, `test_detailui`, `test_safearea`, `shoot_ui` and `make_mockups`
each define their own `window.fb`, and a missing method is a TypeError in every
local run and screenshot while production is fine. Grep `window.fb = {` for the
list. The shims must also MATCH: `allocIdBlock` minted its ids from the counter
key rather than `ID_PREFIX[coll]`, which is the same string for every caller
that passes a `cls` — so it was wrong for years and invisible until the
blueprint asked for a block of parts and got `parts-SN6-001`.

**`test_safearea` is RED ON PURPOSE — it found a real app bug.** At
landscape-max (932x430, 59px side insets) two step-action buttons on
`wo-detail` sit past the safe area, which ends at x=873:

    "Add photos to step 1"      rect 876,389,910,429
    "Report an issue on step 1" rect 916,389,945,429

The second extends to 945 — beyond the 932px viewport edge entirely. On an
iPhone held sideways the camera and flag buttons on a work-order step are under
the rounded corner. The test is correct; the CSS is not. Left failing so it
stays visible. Fixing it is an app change on the detail screen and needs Simon.

---

## Open questions for Simon

**Two things need a human with a real device; automation cannot settle either.**

1. **Tab through the Budget grid by hand.** The Tab-moves-field-to-field
   behaviour from `9fffc9e` is UNVERIFIED. A synthetic Tab does no focus
   traversal in the harness, and the control case lands on `document.body` too,
   so a real regression and a harness artifact are indistinguishable there. The
   in-place update *is* confirmed working.
2. **Does the wide-table scrollbar show on iOS?** A wide table scrolls sideways
   in its own box and the only cue is a styled 6px scrollbar. Headless Chromium
   draws an overlay scrollbar that takes no space and never appears in a
   screenshot. If it is invisible on a real phone, a wide table has no scroll
   cue at all. The edge-fade shadow is not the answer here — a table's header
   tint and zebra rows paint over it, so it rendered as two grey smudges.

**Two one-time actions only a lead can do**, both still pending (they are also
items in `HANDOFF.md`):

- Press **Tracker feed** on the Reports tab to mint the token and publish the
  first snapshot. Until then the feed URL 404s rather than erroring, because
  there is no token and no document yet.
- Paste `Sync.gs` into the spreadsheet's Apps Script and install the trigger.

Nothing else is blocking. The full traveler runs about 3 pages for a complete
work order, 2 for a blank — that is the cost of generous fill-in space. Say if
it should be tightened.

---

## Next up (not started)

- The dashboard and guest mode — see **Now**, and the plan file it names.
- Decide the four app-only families (Receiving, Export, Storage map, Search
  results, plus `table.sub`): lift them into `components.css` or drop them from
  `conventions.md`. 24 classes, roughly 73 selectors, and a real call rather
  than a chore — the Receiving grid is app plumbing by its own comment, so
  "lift everything" is not obviously right. `conventions.md` marks them
  app-only meanwhile, so nothing is misleading while it waits. The Season
  blueprint's own family joined that list rather than resolving it.
- Port the traveler to the offline single-file `work-orders.html`, which still
  has the old print CSS.
- `reports.js` "Print status board" still calls raw `window.print()`. It is now
  the only printable in the app that does — the cut list was the other one.
- `05 Printables/printables.html` is open to redesign. Simon said there is no
  house style to conform to.
- Sweep `02 CS Standards/src/` for AI writing patterns — but these are
  versioned documents with approval tables, so a prose edit means a revision
  bump under CS-000. **Ask before touching them.**
- Per-record history/audit trail (Phase 5 of the inventory plan), deliberately
  deferred. Nothing depends on it and an empty array is a valid start.

---

## Constraints — don't relitigate

**The shelved `projects` TABS row is hidden but is NOT an alias.** The four
hidden rows under it (`stock`, `items`, `lots`, `weekplan`) are normalised
away in `render()` so their own render never runs. `projects` still renders
itself, because the issue detail page lives there and is reached only by chip
and by `#/PROJ-` link. Adding a normalisation line for it kills every link to
every issue, silently. `03 App/app/SHELVED.md` is the full record.


Each of these cost something to learn and would be easy to undo by accident.
Anything already explained in a README is deliberately not repeated here; see
`README.md`, `SETUP.md`, `tools/README.md`, `03 App/app/README.md`,
`HANDOFF.md` and `.design-sync/NOTES.md`.

### Deploying

**Rules deploy alone and FIRST, then hosting.** An old client under new rules
is fine; a new client under old rules fails every allocation. `--only hosting`
must stay meaning only hosting — `firestore.rules` and `storage.rules` can lock
the team out of their own data.

**The rules suites target the DEMO project.** They need Java and the firebase
CLI, but no login and no network, so a fresh machine or CI can run them without
touching the real `feb-composites` project.

**Verify a deploy off the live host, not from the CLI.** "Deploy complete" is
not a check; fetch a changed file and confirm the new code is actually in it.

### Data model and rules

**The Firebase `apiKey` in `firebase-config.js` is public web config by
design.** The repo is public, Simon's call, and scanned clean. Security lives
in `firestore.rules`, not in hiding that key.

**The tracker snapshot stores one compact JSON *string* per part.** The binding
constraint is Firestore index entries — 7.5 KiB each, 20,000 per document — not
the 1 MiB document limit. An array of maps would blow the entry count.

**Unauthenticated Firestore REST honours `firestore.rules`.** Verified live: an
anonymous GET of `pub/<id>` returns 404 while `parts/<id>` returns 403. That is
the whole reason the sheet sync works with no server, no service account and
no OAuth.

### Printing

**`print.css` is deliberately not inside `@media print`.** The sheet renders
identically on screen and on paper, which is what makes the preview trustworthy
and lets the design be reviewed from a screenshot. Tidying it into a print-only
block breaks the entire review loop.

**Label CSS lives in `print.css`, never `index.html`.** `downloadSheet()`
fetches `print.css` and inlines it, so anything in `index.html` vanishes from
every saved sheet — and a saved sheet on a phone at RFS with no wifi is the
case that matters.

**`labelSheetHtml()` must never reuse `fitSheetHtml()`, `LAYOUTS` or
`MAX_PAGES`.** Those exist to squeeze a work order onto two pages via a ladder
of candidate row counts, measured most-generous-first; they mean nothing for a
fixed label grid. Do not replace the ladder with fixed row counts either — the
point is that a sparse work order gets room to write and a dense one still
lands on two pages.

**`.dwg-tabwrap`'s `flex: 1 1 auto` is scoped to `.dwg-cols >` on purpose.**
It exists to take the width left beside the fixed key and inset inside a flex
ROW. `.dwg-page` is a flex COLUMN, so unscoped it made a full-width table grow
vertically and pushed the cut schedule's two tables to opposite ends of the
sheet. Widen the selector and the tables drift apart again.

**Every distinction must survive grayscale.** Shop travelers print on a
black-and-white laser first, so blockers use hatching plus heavy rules plus the
literal word BLOCKER, never colour alone. Berkeley blue and gold are
enhancement only.

**Page numbering is hand-written (`Page ___ of ___`).** Chrome has no `@page`
margin-box counters, so there is no honest way to print it.

### The CFD viewer (07)

**Pages stack into one continuous strip of PDF points, and a panel is a window
into that strip.** Panels sit on a uniform 502.5 pt pitch and flow across page
breaks, so nothing may assume a panel lives on one page.

**Layout is in content space, not paper space.** Pages lay out with their print
margins removed, so a plot spanning a page break is one continuous image and
the crop stops mistaking the seam's white band for a title gap. Paper-space
`absY` survives as `paperAbsY`.

**Do not "simplify" the Electron shell to `loadFile`.** This app is ES modules
because pdf.js ships as one and pulls a module worker with it, which forces an
HTTP origin. The custom `app://` protocol is what lets the desktop and browser
builds run identical code with nothing conditional between them.

**Panels crop through one shared box across every report being compared**
(`jointCrop` in `render.js`). Cropping each report to its own content would
offset them and the difference view would report that offset as change
everywhere. The guard is that two identical reports still diff to exactly 0
pixels.

### The test harness

**App files load per-file from `index.html`'s `<script>` tags** via
`tools/lib/appload.mjs`, each as its own `vm.Script` with its real path. There is
no `FILES` list to forget and no regex allowlist. Coverage attributes by file as
a result. The gotcha: top-level `const`/`let` are global-LEXICAL, so bare `DB`
works and `globalThis.DB` is `undefined`.

**Never assert sanitizer allowlist policy in `test_app.mjs`** — it cannot see
it. `tools/test_sanitize.mjs` runs the real vendored DOMPurify in Chromium. The
old stub ignored the allowlist entirely, which meant zero real coverage and hid
two live bugs.

**The design-system drift test compares only selectors present in BOTH copies.**
A rule missing from one file is skipped, not reported — which is how `.bignum`
carried state classes that did nothing for a year. There is now an explicit
state-modifier check alongside the rule-by-rule diff; keep it, because the diff
alone cannot see an absence.

**A backtick inside a JS template literal ends the literal.** It has bitten
`documents.js`, `projects.js` and the `AUDIT` string in `test_detailui.mjs` —
every time it was prose in a comment quoting code. Write those comments without
backticks. `AUDIT` says "no backticks below this line" for this reason.

**Playwright suites skip and still exit 0** when Chromium is missing. Read the
output; never trust the exit code alone. (Also in `SETUP.md`.)

### App behaviour

**`formatBlock` needs the angle-bracket form (`"<h2>"`)** or it is a silent
no-op in Safari. An empty contenteditable holds a bare text node with no block,
so editors are seeded with `<p><br></p>` or formatBlock has nothing to convert.

**`proseHtml()` decorates AFTER sanitising**, adding `.tblwrap` and `.cgal`,
because `class` is not allowlisted and authors therefore cannot ask for either.

**Retro records store the literal `"not recorded (retro)"`.** `pv()` maps it to
empty so it never reaches paper looking like data.

**Standard references are off the printed sheet.** `stripCS()` in
`workorders.js` removes them at render time from legacy and retro records,
covering titles, notes and event-log text. Stored data is untouched, so the
archive keeps its original wording.

**Storage-backed features (avatar, file upload) need the Firebase Blaze plan.**
They are built and tested against the emulator.

---

## Recent log

Five sessions, newest first. Older entries live in `git log`, not here.

**2026-08-28 (latest) — the mold's stage became a stepper.** Simon asked for
the Parts progress-bubble idiom on molds: the detail card now sets stage on a
tappable `.pstage` stepper (all six values, Retired dashed and off the track),
with setPartStage's grading — one step forward instant with the undo bar,
skips/backs/Retire ask first. The Edit-mode `<select>` and the next-stage
button are gone for molds only; Materials/Items detail is unchanged, and the
embedded detail no longer doubles the undo bar. Deployed to hosting,
unreleased — it can ride in the next version's What's New.

**2026-08-27 — the splash waits, the blueprint became a read, and the
cut list reached paper.** A floor and a Continue affordance on the boot splash;
the Season tab's thirteen editable columns became one line per part that opens
the part; and cut sheets now ride on a mold's drawing set and print as their own
batch document. The last of those replaced the only printable that bypassed
`mountSheet`. Nothing deployed.

**2026-08-26 — v2.0.0: the season plan comes into the app.** A
Season tab replaces the Composites Master Tracker sheet: one editable row per
part, blueprint-sparse by design, and a row IS a part. The dashboard stopped
saying things twice — shop status split, T-minus once, issues folded into the
run they hold up. Details leads on a part in edit mode, and issue photos work
after creation.

**2026-08-25 (latest) — v1.0.0: the tracker becomes a work tracker.** The
Tickets tab is shelved behind `hidden: true` with its data and links intact;
issues moved onto the work order as their own section, resolving through the
one existing CS-003 gate. The app gained a version, a What's New panel, a
`config/release` reload banner and `tools/release.mjs`. Also: a boot splash
that lays up the mark's two plies, and "Load SN5 archive" off the toolbar.

**2026-08-25 (latest) — storage map, and the receiving count column.** Adding a
location moved from the items list to the map, where the shelves are. Empty
shelves stopped collapsing into a text strip: they are quieter cards now, so
every location is visible and clickable anywhere, which the strip was not. The
HOW MANY readout was wrapping to three lines and reads "1 of 12" on one line.
