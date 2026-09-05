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

**The CFD app is at cfd-v0.3.1: Dashboard, saved views, composites shell, splash, mobile**
(2026-09-03). Decisions that must not be re-asked: open access with no
sign-in; shared library in Storage; 07 untouched; the viewer canvas stays
dark in both themes (DECISIONS #5); charts are the CFD app's own (#6); the
thumbnail plot is `stat-car-0` with a first-contour fallback; trend x-axis
is the design point parsed from the name. Records backfill dp/results/
meta/thumb on first open, so no migration script exists or is needed. The
three placeholder collections in `firestore.rules` still wait on Simon's
talk with the team. The bucket's CORS is applied by gsutil, not by deploy.
`.claude/launch.json` serves app/ on :8792 for the browser pane, which
refuses sub-path navigation, so the server root is app/ itself.

**The standards' editing surface is now Google Docs** (2026-08-29, Simon's
call): folder "CS Standards" at the root of his My Drive, one Doc per
standard plus INDEX and template, figures embedded. IDs and the sync-back
rule live in `02 CS Standards/GOOGLE-DOCS.md`: Docs are where edits happen,
`src/` markdown is still what builds the app copies, so Doc edits get synced
back with a rev bump and rebuilt. Uploaded via Drive markdown import, which
fetches and embeds the figure PNGs from the live host; docx-as-base64 does
not fit through tool calls.

**The CS standards engineering pass is MERGED to main** (2026-08-28, Simon
reviewed the branch and asked for the merge). What landed: 13 SVG figures +
`tools/render_figures.mjs`, the figure pipeline (build_docx.py images,
gen_docs_manifest.py resource-path + figure copying, documents.js mdToHtml
image support + mdfig CSS), every standard +1 revision letter with CS-INDEX at
Rev F, CS-000 defining shall/should/may, CS-007/CS-009 out of outline, and the
em-dash sweep. No process rule or number changed; the history rows say so.
Hosting deploy carries the refreshed docs/ copies live. Approval tables still
need real signatures.


**v4.0.0 IS TAGGED, PUSHED AND LIVE** (2026-08-28) — the R&D bench and the boot
gate. Major by the rubric twice over: a new top-level area, and the app no
longer opens by itself. **`firestore.rules` was deployed separately and first**,
alone, before hosting; the diff was purely additive (one `match /rnd/{id}`
block, 24 insertions, no existing collection touched), so an old client under
the new rules was never at risk. Hosting verified by fetching `core.js` and
`rnd.js` off the host — `APP_VERSION = "4.0.0"`, zero `SPLASH_FLOOR`, `rnd.js`
200.

**Nobody has been told, and per Simon that is fine** — he is not posting much in
`#composites`, so the printed note is his to use or ignore, and this is no
longer tracked here as an outstanding action. The one thing that still does
something: `⋯ → Announce this release`, pressed by a lead standing in v4.0.0,
gives anyone on an older build a reload prompt. Untouched for v3.0.0 through
v4.0.0; that one press covers the newest only.

**The R&D bench**: a new `rnd` collection, multi-class on `cls` like items and
lots — `RDS-SN6-###` a study, `CPN-SN6-###` a coupon. Twelfth visible tab, last
in Build. Shipped: studies (folder / swept test / project-of-batches, all one
record shape), per-study columns tagged input or result, the grid with
bulk-create and undo, fill-down paste, and Compare. Round two added, on Simon's
ask: delete a study (cascade + undo), labels for BOTH studies and coupons,
photos on studies and coupons, export as CSV / clipboard TSV / printable report,
and Duplicate-as-template.

**A STUDY IS PHYSICAL AND CARRIES A LABEL.** The first cut had `labelClass`
return null for `RDS` on the grounds that a folder is not an object; that was
wrong about how coupons are stored. A study labels the bag, tray or box. Both
prefixes are 11 characters and carry a QR — the header of `labels.js` used to
say a coupon never could, which was a fact about the old `PNL-…-C03` spelling
and not about coupons. `test_qr.mjs` keeps the 15-character form as a
counterfactual so the 14-character cliff stays proven.

**NOT shipped**: materials inheritance exists in the model (`rdEff`,
`RD_INHERITS`, study `defaults`) and is exported and printed on labels, but
there is still no UI to SET a study's defaults — they can only arrive via a
fixture or a duplicate. That is the next obvious gap. Also declined by Simon
for now, so do not build them speculatively: std-dev/CV in Compare, computed
stress from specimen dimensions, and linking a study to a part or mold.

Three things here are load-bearing:

- **A cell edit NEVER calls `render()`** (`rdUpd`, `rdVal`). Receiving's
  invariant: `onchange` fires while Tab already carries focus, and a repaint
  destroys the field mid-hop. Only a column-shape change repaints.
- **The guest cascade does not reach this grid.** `render()` closes ~130 inputs
  by clearing `view.edit`, but the grid has no Edit button and is always
  editing, so `rdCell` renders `.ro` itself. Free everywhere else; not here.
- **A project's sheet rolls its batches up** (`rdSheetRows`). The first build
  counted deep in the index and direct in the sheet, so opening a project said
  "no coupons yet" under a row claiming twelve.

**DO NOT FUSE THE TWO MEANINGS OF "R&D".** `parts.rnd` is a real part with a
full traveler; the `rnd` collection is coupons with none. New section in
DESIGN-NOTES, and a test that reads `rnd.js` and fails if it ever tests `retro`.
The `onlyRnd` chip on the Parts rail is untouched.

Written down before it bites: **if `DB.rnd` passes ~2,000, take `rnd` out of
`COLLECTIONS` and give the tab a per-study query.** It is the twelfth
whole-collection listener and coupons will be the most numerous record type in
the app within a month.

**The boot splash is a GATE** and no longer takes itself down: five real
milestones (app code, sign-in, roster, first data, fonts) fill a gold
start-light gantry, the caption names whatever is outstanding, and the app waits
behind the sheet until somebody presses Continue. Both floors are gone —
`SPLASH_FLOOR`, `SPLASH_FLOOR_FIRST` and `splashFloor()` no longer exist —
because a gate has nothing to budget. Exit is a `clip-path` wipe along the ply
bias instead of `sp-lift`'s translate, which read as the window minimising.

Three things about it that are load-bearing and easy to undo by accident:

- **`splashAuth()` marks `data` as "not needed" (state 2) when auth resolves to
  `signedout` or `pending`.** `startSync()` never runs on those paths, so
  without it the gate hangs forever in front of exactly the people who need the
  sign-in card. There is a test named for this.
- **`hideSplash(true)` must keep working.** `tools/lib/browser.mjs` calls it to
  photograph the app, and eight visual suites go through that one line.
- **`splashFail()` returns early when nothing is outstanding.** The 12s backstop
  fires on healthy boots now — waiting at an armed gate is normal — and without
  the guard it printed "Something is not responding" under five gold lamps.

A failed lamp is a **hollow amber ring, not a filled amber dot**: the first build
had it filled, and amber against gold at 15px was invisible in a screenshot. It
differs by shape on purpose.

The two long-standing test failures are now GONE: the `parentId` one was fixed
by the session that cut v3.2.0, and the four `test_detailui` wasm failures were
a missing `.wasm` MIME entry in the test server (fixed here). All suites green.

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
**Symbology is settled** (2026-08-29, photo of a physical tag): RSS stickers
are **Data Matrix**, not QR and not linear, and `data_matrix` was already in
both the native and the zxing format lists, so nothing was broken — the guess
in `scan.js` was. Serial is 24 chars printed in groups of four, with the last
twelve repeated up the tag's edge. Across the three samples we hold
(`…228D47` from the real export, `…243EF0` off the photo, `…243F1C` in the
tests) the shape is `CA` + sixteen `0` + six hex, and only those six move.
The linear formats stay until someone walks the shelves — one sheet of tags
is not a survey.

**Reload banner fixed and live** (2026-09-02, b2217b2): v4.2.0 went out
before anyone pressed Announce, so config/release still said 4.1.1 and every
screen showed "v4.1.1 is out, you are running v4.2.0, reload". The banner now
fires only when the announced version is numerically NEWER than the running
one (`versionNewer()` in core.js). Not a release cut. **Still Simon's press:
⋯ → Announce this release, standing in v4.2.0.**

**v4.2.0 IS PUSHED AND LIVE** (2026-08-29) — Budget's two status tracks and
the Charged to field, on Simon's ask. The one thing not to re-litigate: `status`
and `reimb` are two fields, not one enum, because "Ordered" was a fact about
goods and "Reimbursed" a fact about money, and a member routinely has the part
on the shelf weeks before the treasurer pays them back. Legacy records are read
through `buyStatus()` / `reimbStatus()` and are never rewritten in place;
`Ordered → Purchased` and old `Reimbursed → Arrived + Reimbursed`. The $50
approval gate moved onto the money track (`reimb === "Submitted"`), which is why
marking goods bought no longer clears it. `chargedTo` is free text, blank or
"Composites" meaning ours, and off-budget purchases stay in the list, the owed
list and the $50 rule while leaving the season total and every goal bar.

**v4.1.0 AND v4.1.1 ARE TAGGED, PUSHED AND LIVE** (2026-08-29). v4.1.0 acted on that photo (the two sessions crossed; this half merged on
top). `invEhsShort` no longer shows the last six: it shows **the twelve
characters reprinted down the tag's edge, in the label's four-character
groups**, because a row is read while comparing it against a sticker and
`…243EF0` is printed nowhere on one. **v4.1.1 then settled the visual half of
that argument against real data rather than opinion.** Simon's RSS export holds
**627 real tags, all 24 characters, all distinct — and positions 0-18 are
identical in every one of them.** Only the last five vary; across FEB's own 50
containers, only the last THREE. So a flat twelve-character strip is nine dead
glyphs in front of the ones that matter, which is what shipping it proved. The
four candidates (edge-12 flat, last-6, edge-12 with the final group emphasised,
whole-code with it emphasised) were rendered side by side against those 50 real
codes; the third won and is what ships. **The last group is at full weight, the
rest dimmed to 0.5** — dimmed rather than dropped, because comparing against the
sticker needs every printed character and only scanning a column needs the
anchor. Emphasising the last GROUP, not the last three characters, keeps it a
property of the label's grammar rather than of this one export. The reasoning
for all of it sits above `invEhsShort`; do not re-litigate it from first
principles.

The row assertions in `test_app` now match the dim/bold markup, not a flat
string. **They used to pass against the tooltip** (`title=` carries the whole
printed code, so `includes("0000 0024 3EF0")` was green no matter what the row
showed). Mutation-checked: breaking the split fails exactly one test. New in `core.js`:
`ehsPrinted`, `ehsTailText`, `ehsShape` (advisory, never a gate) and
**`ehsResolveTyped`**, which accepts those twelve edge characters as a lookup
anywhere a code is typed — floor of 12 so the nine-character pre-2024 codes
keep meaning themselves, and an ambiguous tail returns `{ambiguous:[…]}`
carrying **no id**, because opening the wrong jug is worse than typing four
more characters. `ehsConflict` runs through it, so an edge strip typed onto a
second record is refused like the whole code. The reconciliation sheet gained
a `printed` column beside the unpunctuated `ehsBarcode`, and flags off-length
tags.
The receiving grid stacks to cards below **1320px** (was 1200) — the eighth
column pushed the table's minimum to ~1300; do not claw it back by shaving
measured columns. No rules deploy anywhere (lots/items have no field
whitelist). Any new writer of ehsBarcode must call ehsNorm; comparisons go
through ehsKey (dash-blind).

**v3.2.0 IS TAGGED, PUSHED AND LIVE** (2026-08-28) — the EH&S/inventory
release: chemicals under their UC stickers, iPhone scanning, grouped
containers, the materials table, Select… mass delete, co-storage allowed.
Minor by the rubric. release.mjs verified the deploy and shot the two
pictures against the live build; the #composites note and the two PNGs
(design/release-v3.2.0-*.png) are printed in the release output — **posting
it and pressing ⋯ → "Announce this release" are Simon's, still pending**, as
they were for v3.0.0/v3.1.0 (that one press announces the newest version
only; older ones live in CHANGELOG.md).

**v3.1.0 went out 2026-08-27**, v3.0.0 an hour earlier the same day. Neither was
ever announced, and the v3.2.0 note above now covers all three — one press
announces the newest only, and v3.0.0's and v3.1.0's items live in CHANGELOG.md,
so the #composites note is where they get said out loud.

Durable from that work, and the reason it is kept here rather than dropped with
the rest: `.sline` and `.shead` share ONE declaration of eight fixed grid tracks
on the Season blueprint. **Do not reach for `columns:` on `.seasongrid` a third
time** — it is what made the fields land in a different place on every line.

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

- **Fusion add-in feasibility study, Stage 1 done** (2026-09-04): spikes S1,
  S2, S3, S6 have results in `10 Fusion Add-in/spikes/README.md`. Next is
  Stage 2, `FEASIBILITY.md` plus the S4 palette and S5 REST add-ins, then
  Stage 3 builds `FEBPlanStock/`. Decisions in `FEASIBILITY-PLAN.md` are
  settled; do not re-ask. Three facts that shape the build and are not in the
  code: `STLExportOptions.unitType` reads inches but writes mm when left at
  its default, so the add-in sets millimetres explicitly (or meshes through
  `MeshCalculator`, which S2 did); parametric mode needs a base feature for
  temporary bodies and names must be set after `finishEdit()`; the
  `fusion360://` deep link opens nothing, so the mold card links to
  `dataFile.fusionWebURL` instead. Windows repeats of every spike still need a
  member with Fusion installed.
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
- `04 Printables/printables.html` is open to redesign. Simon said there is no
  house style to conform to.
- Per-record history/audit trail (Phase 5 of the inventory plan), deliberately
  deferred. Nothing depends on it and an empty array is a valid start.
- **The one label test that needs the printer in hand.** Everything about the
  roll path is proven in a browser except whether iOS lets a custom page length
  through on CONTINUOUS stock, or forces a fixed size. If it forces one, switch
  the default media to `dk1201` (die-cut, already built) and the label wraps one
  tier earlier; nothing else changes. Test it from the shop PC first — Chrome
  plus the Brother driver gives exact custom lengths and isolates the question
  to iOS.

---

## Constraints — don't relitigate

**The roll printer must be AirPrint, and that is not a preference.** A browser
cannot open a raw TCP socket, so port 9100 is unavailable; and the app is
served over HTTPS, so `fetch`ing a plain-HTTP LAN printer is blocked as mixed
content. Every "just POST to the printer" design dies on one of those two, and
a cheaper Bluetooth-only label maker cannot be driven from the app at all. The
reasoning is in `06 Composites App/app/DESIGN-NOTES.md`; what is here is the shopping
constraint, because it is invisible from the code.

**The laminated-tape option was checked and rejected on print height, not on
price.** A Brother PT-P750W ($155) takes 24 mm TZe laminated tape — IPA-proof,
−80 to +150 °C — and does support AirPrint, so it was a real candidate. Its
**maximum print height is 18 mm** against the 21.4 mm the current label needs
(25.4 less 2 mm margin top and bottom), so it cannot print this label without a
tighter redesign and a QR dropped from 21.4 to ~17.5 mm. Tape is also 3–4× the
cost per label. Simon chose the QL-810W direct-thermal path 2026-08-28 knowing
the labels fade in UV, blacken with heat and smear under solvent — they are for
shelves, bins and lots indoors, and anything that meets a post-cure oven or an
IPA wipe keeps Avery 5522 polyester off the sheet printer. Do not "fix" this by
switching to tape without redoing the vertical budget.

**The shelved `projects` TABS row is hidden but is NOT an alias.** The four
hidden rows under it (`stock`, `items`, `lots`, `weekplan`) are normalised
away in `render()` so their own render never runs. `projects` still renders
itself, because the issue detail page lives there and is reached only by chip
and by `#/PROJ-` link. Adding a normalisation line for it kills every link to
every issue, silently. `06 Composites App/app/SHELVED.md` is the full record.


Each of these cost something to learn and would be easy to undo by accident.
Anything already explained in a README is deliberately not repeated here; see
`README.md`, `SETUP.md`, `tools/README.md`, `06 Composites App/app/README.md`,
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

**Accounts are self-serve (v4.4.0).** Sign-up is name + username + password;
a username is the synthetic address `<u>@members.feb-composites.app`
(`USER_DOMAIN`, `loginEmailFor`, `userHandle` in core.js), so every email-keyed
path is unchanged and old email accounts still sign in. `firestore.rules`
lets an account create only its own roster doc, as member, with the four
sign-up fields; leads keep roles and removal. **Deployed rules** on
2026-09-03, purely additive on `/roster` create. Removal is a nudge now:
a removed person can rejoin, so a real lock is disabling the Auth user in
the console. Username accounts have no password reset; recovery is delete
the Auth user, sign up again with the same username.

**Seasons and `archived` (v4.3.0).** A record's season is read off its id;
the current one is `config/season.code` (Season settings, fallback SN6).
`inSeason()` now also requires this season and not archived. Rails default to
this season with archived hidden; chips swap in SN5 / archived. New ids for a
later season mint on `<key>@<code>` counters, SN6 keys unchanged. Nothing is
deleted to roll a season over. Simon's ask, 2026-09-03: archive, never delete.

**`render()` snapshots and restores every `.plist` rail's scrollTop** (v4.2.1),
keyed by aria-label. Anything new that scrolls inside `<main>` and must survive
a re-render should be a `.plist` or get the same treatment.

**Storage-backed features (avatar, file upload) need the Firebase Blaze plan.**
They are built and tested against the emulator.

---

## Recent log

Five sessions, newest first. Older entries live in `git log`, not here.

**2026-09-03 (latest) — composites app v4.2.1 then v4.3.0:** rails keep
their scroll across re-renders (the multi-select and select-a-part scroll bugs
Simon reported); Parts got Select… bulk actions. Then archive-not-delete for
parts, work orders and R&D studies, season read off ids with a season code in
Season settings, rails defaulting to this season. Pushed and deployed.

**2026-09-03 — CFD app through cfd-v0.3.0:** Dashboard, saved views,
composites shell, then always-dark icon rail (0.2.1), then the boot splash
and a one-report-at-a-time phone layout (0.3.0), then the splash made a
Continue gate like the composites app's (0.3.1).

**2026-09-02 — CFD viewer live, folders renumbered.** The 07 viewer
is hosted at feb-cfd.web.app with a shared library, tagged cfd-v0.1.0. `03 App/`
is `06 Composites App/`; every tracked path reference, the parent CLAUDE.md,
the simon agent and the memory index were rewritten in one pass. Brief,
decisions, and empty `app/`, `ingest/`, `design/` under
`08 CFD Sims Dashboard/`. Repo renamed to `feb-engineering-apps`.

**2026-08-28 — the mold's stage became a stepper.** Simon asked for
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
