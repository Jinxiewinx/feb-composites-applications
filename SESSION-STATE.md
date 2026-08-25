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

**Live matches main.** The Molds/Inventory pass, the stat-tile states and the
Inventory/Receiving follow-ups are all on main and deployed, each verified by
curling the changed file off the live host rather than trusting the CLI.

- Density is free entry through `canonDensity()` in `core.js`, not a `<select>`.
  Board and plan density stay numbers, mold density stays a string,
  deliberately: the coercion produces a byte-identical `SZ:` key for everything
  already stored, so there is no migration. `packer.js` is untouched and does
  not need to be — both its inputs canonicalise first.
- Boards render under Inventory as a fourth segment. `ID_TO_COLL` is **not**
  changed — changing it breaks `consumePendingLink`, `invMoveHere` and
  `test_route`. `moldsOrBoardsFor()` splits on the id instead, so `stock` stays
  one collection with two homes.
- The 3D viewer lives on the mold, not the plan. `planIsOrphan()` is now the
  single definition of orphan; three contradictory ones existed.
- `.bignum` now carries `.bad`/`.warn`/`.ok` states in both the app CSS and
  `components.css`, mirroring the dashboard's `.bnum` so one word means one
  colour everywhere. The style guide was rebuilt and the design sync ran.
- **Every storage location is a card on the map**, empty ones included — the
  collapsed `.locempty` strip is gone. It hid the shelves you most need
  reminding you own, and it was the one place on that page where clicking the
  row did nothing. `+ Location` moved off the items list onto the map; the
  `newOn` flag in a SHOP class spec is what suppresses a class's + button on a
  list and names where it lives instead.
- The receiving desk's HOW MANY readout shares one line with its input.
  It must stay short — "1 of 3", not "1 record of 3" — because the column is
  deliberately narrow to protect the material-name width, and `test_receiving_ui`
  fails below a 150px name input at 1201px. Widening that column is what breaks
  it; the space came out of an oversized count input instead.

**Open finding, reported not done: 25 documented classes have no rules behind
them.** Validating `conventions.md` against the built CSS turned up the whole
Receiving, Export, Storage map and Search results families, plus the WO fold
classes and `table.sub` — all documented to the design agent, all living only
in the app's own stylesheet. Lifting them into `components.css` is roughly 73
selectors and a real decision (the Receiving grid is explicitly app plumbing),
so it was reported rather than done. `conventions.md` now marks them app-only.

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

- Decide on the 25 app-only classes above: lift them into `components.css` or
  drop them from `conventions.md`.
- Port the traveler to the offline single-file `work-orders.html`, which still
  has the old print CSS.
- `reports.js` "Print status board" still calls raw `window.print()`.
- `05 Printables/printables.html` is open to redesign. Simon said there is no
  house style to conform to.
- Sweep `02 CS Standards/src/` for AI writing patterns — but these are
  versioned documents with approval tables, so a prose edit means a revision
  bump under CS-000. **Ask before touching them.**
- Per-record history/audit trail (Phase 5 of the inventory plan), deliberately
  deferred. Nothing depends on it and an empty array is a valid start.

---

## Constraints — don't relitigate

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

**`tools/test_app.mjs` concatenates the app's classic scripts into one indirect
`eval`.** Adding a new app file means adding it to `FILES` too, or the harness
silently cannot see it. Top-level `const` stays lexical and is invisible to the
tests, which is why a named list gets rewritten into implicit globals.

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

**2026-08-25 (latest) — storage map, and the receiving count column.** Adding a
location moved from the items list to the map, where the shelves are. Empty
shelves stopped collapsing into a text strip: they are quieter cards now, so
every location is visible and clickable anywhere, which the strip was not. The
HOW MANY readout was wrapping to three lines and reads "1 of 12" on one line.

**2026-08-25 (later) — stat-tile states, and a design sync.** Simon asked why
the warn colour never showed: `.bignum` set its own colour and won on source
order, so tiles had been passing a state class for a year and staying navy.
Fixed in both copies of the CSS with the dashboard's existing vocabulary. The
sync to claude.ai/design then found the remote stale by far more than this
change and pushed three files. See **Now** for the app-only-classes finding it
turned up.

**2026-08-25 — Molds/Inventory targeted pass.** Four commits, from Simon's
report that selecting the clamshell and asking for the rotate feature "shifts
me to the plans with no mold section". Density became a typed field, boards
moved into Inventory, the 3D viewer moved onto the mold, and the rail now
groups molds by stage. `mvSweep()` closes a GL-context leak.

**2026-08-24 — mold-drawing-revamp merged, everything deployed.** Merged to
main as `1b227b9`; the only conflicts were additive lists in
`tools/test_app.mjs` and `tools/README.md`. This machine gained a JDK and the
firebase CLI, so the emulator gate finally ran, and rules then hosting deployed
in that order. Verified live off the host: `receiving.js` and `tracker.js`
serve the new code, `docs/manifest.json` has 1 entry, and the two TDS PDFs
`resins.js` cites answer 200.

**2026-08-23 — inventory rebuilt around getting a shop typed in.** Five commits
on main. Receiving became a page rather than a modal — a mixed delivery is
rolls and jugs and consumables across three shelves, which the old one-shelf
modal could not express. The class cell now writes `cls` AND `role`, which is
what finally lets the CS-011 §6 resin/hardener check fire at all. Reorder moved
off the jug and onto the material, because the old model literally could not
express "we are completely out". Export as CSV/TSV, since a team that doubts it
can get its data out keeps a shadow spreadsheet.
