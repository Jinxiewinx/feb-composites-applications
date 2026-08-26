# SN6 Resources — FEB Composites

I put this together in July 2026, after comp, from everything we did in SN5 — the Drive, the full #composites and #purchasing history, and the manufacturer datasheets for the stuff we actually buy. It's the handoff I wish I'd gotten: what went wrong and why, standards so the answers stop living in people's heads, and a work-order system so we can actually trace what we built. Everything went through staged reviews (G0–G4) against a reviewer agent loaded with our constraints and SN5 history before it landed here.

— Simon

New lead? Start with [HANDOFF.md](HANDOFF.md). It explains how to run and care
for everything in here.

## What's in here

| Folder | Contents | Start with |
|---|---|---|
| `03 App/` | The composites work-order app, live at feb-composites.web.app | `app/README.md` |
| `07 CFD PDF Viewer/` | Desktop/web app for comparing Fluent CFD reports side by side | `README.md` |
| `00 Agent/` | The "simon" reviewer-agent definition. Archival copy; the live one is at `composites_programs/.claude/agents/simon.md` | |
| `01 Pain Points and Improvements/` | The SN5 season review: what went well, 10 major problems with root-cause analyses, traceability to the fixes | the .docx |
| `02 CS Standards/` | 14 numbered composites standards (CS-000 to CS-013). The markdown in `src/` is the canonical text; the .docx files are built output | `CS-INDEX` |
| `04 Datasheets/` | 25 manufacturer TDS/SDS PDFs for the products we actually use | `INDEX.md` |
| `05 Printables/` | Shop reference sheets meant to be printed: resin ratios, flowcharts, checklists | `README.md` |
| `06 Design System/` | The app's visual language as a reusable system: tokens, component CSS, a living style guide | `styleguide.html` |
| `08 Website/` | The public team website for sponsors and recruits, built on the design system. Not deployed yet | `README.md` |
| `tools/` | Everything that builds and checks the rest: the docx builder, the generators, the servers, and 19 test suites | `README.md` |

## Getting started

[SETUP.md](SETUP.md) is the full walkthrough for a new machine, macOS or
Windows: what to install, how to verify it, how to run the suite, how to
deploy, and the platform traps that cost a day each if you meet them cold.

The short version. You need Node for the app tooling, Playwright for the
browser tests, the Firebase CLI and a JDK for the rules tests and deploys, and
Python 3 only if you are editing the standards. Three commands cover most days,
all run from this folder:

```bash
node tools/serve_populated.mjs --port 8791   # the app locally, seeded, no Firebase
node tools/test_app.mjs                      # the core logic suite
node tools/test_designsystem.mjs             # CSS drift check, ~1 second
```

The live app needs no setup at all: it is at https://feb-composites.web.app,
and access is controlled by the roster inside it.

## The app

`03 App/app/` is the team's shared workspace for a season, running on Firebase
with an email allowlist for the roster. It updates live for everyone and works
on phones and tablets as well as desktop. The full manual and setup live in
`03 App/app/README.md`, and the architecture behind it in
`03 App/app/DESIGN-NOTES.md`; this is the short tour.

![Dashboard: the mission-control board on the app's white surfaces, alert strip leading](03%20App/design/dashboard-mockup-20260826.png)

Eleven tabs, grouped in the sidebar by who is asking (Dashboard and Season up
top, then Build, Planning, and Team):

- **Dashboard:** the board, and the page you land on. It shares the app's white-card surfaces but reads as the shop's status board: a dense module grid, bare Saira numerals, and the sidebar's gold speed slash on every module header. The alert strip leads with the lead's one-second read (late, blocked, unassigned, curing, and T-minus to the competition a lead configures in one modal), then the bucketed work list, shop status with severity dots, the season bars, this week's stations, a cross-app activity feed built from the updatedAt every record already carried, countdown and streaks, money including the $50 approval rule, a launchpad of filtered jumps plus the pinned docs, and a fact of the day drawn from the team's own SN5 documentation. Read-only; every element links into the tab it came from; on a phone it reorders to today-first.
- **Season:** the blueprint, and the tab that replaced the Composites Master Tracker spreadsheet. One row per part the team means to make, thirteen columns, and most of the cells empty — which is the point: in September the team knows it is building a nosecone and four side panels, not what their layup schedules are. A row that exists with nothing in it is a commitment to build the thing, and it **is** a real part record from the moment it exists, so there is no promotion step — "making the real part file" just means filling the row in. Every cell edits in place; the three stage columns are colour-coded by what the value means and still go through the evidence gate and the skip-ahead confirm; the part name stays pinned while the other twelve columns scroll. This season only, and the Google Sheet is downstream now — the app publishes to it every 15 minutes, so an edit made there is overwritten on the next publish.
- **Work Orders:** the manufacturing traveler, as a split view like Parts and Molds. The rail indexes every run grouped by the part it builds, so the tab reads as the part → run → mold hierarchy; each row carries how far through its buy-offs it is, and whether it is blocked or curing. Parts nobody has started show up too, with the button that starts one. Group, sort and filter are yours to set. The pane keeps the whole record in one scroll, Steps first because that is the bench action, but each section is its own card now, headed by a gold-slashed label carrying the same count and attention word the jump bar shows. A hero band under the title answers the five questions people come for: status as a colored dropdown (no edit mode needed), a steps progress bar, due date, mass actual against target, and the engineers' faces. Blockers and cure holds finally look different (a blocker is a person, amber; a hold is the clock, slate), signed steps compress to one line with their history a tap away, and the next step to act on wears a gold NOW badge and the page's only loud buy-off button. Photos are a first-class record: every step row has a camera button and a thumb strip, a Photos section collects everything on the record grouped by step, and declining "sign without a photo?" opens the camera and finishes the buy-off once the photo lands. Reference blocks (BOM, event log) fold behind counted summaries; quality and files fold only when empty; the note thread lives in its own card. Layup stack, BOM, step buy-offs stamped with who signed, blocker steps, and enforced cure holds backed by the datasheets in `resins.js`. Prints to a hand-fillable sheet that is always exactly two pages. **Issues** are a section of the run they hold up: raise one from the section or from a step's flag button, dispose it inline, and the run cannot be set Complete until every issue has a resolution method and a documented root cause — the same CS-003 gate whether you close it on the page, from a step, or in the closeout modal that a refused Complete opens. The rail's `issues` chip filters to the runs still carrying one. Deleting a run is one path that takes everything that only existed because of it — the issues it holds up, the photos and CAD uploaded to it, and the work-order link on any part, mold or test panel that named it — and a lead can tick as many runs off the rail as they like and clear a season in one pass. (Until v1.0.0 issues shared a Tickets tab with project tracking; that tab is shelved — see `03 App/app/SHELVED.md`.)
- **Parts:** the season tracker as a split view: every part down the left, the selected one beside it, each stage a row of steps you click. Arrow keys walk the list; `1`/`2`/`3` advance the stages.
- **Molds:** a split view of every mold, the rail grouped by the stage each one is at so it reads as the pipeline it is. A mold carries stage, home location, sealing record and parts pulled, plus its mold file — the stack plan it is cut from, with the plans it superseded still openable and marked as such. The mold file is genuinely part of the mold: the rotatable 3D view of the mold sitting inside its stock, the exploded stack and the blanks table are all on the mold's own page rather than a click away on a separate plan record. Only a plan with no mold to be reached through gets a row of its own. One "+ Mold" button covers planning from an STL, from typed dimensions, or recording a mold that has no CAD yet. With nothing selected the pane adds "Needs a hand": molds with no home location, molds machined with no stack plan on file, plans carrying a slicer warning nobody has read, and plans with no mold. Board grade is typed rather than picked from a list, because the rack has always held sheets outside the 30/60 pcf catalogue, and it is a range rather than a single number: leave the maximum blank and the mold is held to one grade as before, or give a range and any board inside it may supply any blank. The price of that is that a mold no longer has one density, so the highest grade actually cut is called out on the cut list, on the molds list and in the title block of every drawing sheet — the densest board in a glued stack sets the ShopSabre feed rate for all of it. The drawing set is a general view (assembled stock with the mold hatched inside it and waterline section contours, plus a mold-only inset), a third-angle three-view, and one placement sheet per board. The planner takes a mold STL, picks boards, splits at the ShopSabre depth limit, prints a numbered cut list, and creates the mold record at "Designed". Blanks are sawn to whole half-inch increments so a person with a tape can cut them, which also puts every cut position on an eighth-inch mark. The cut list opens the board that costs least, scoring the material spent, the option value destroyed (a big board is the only thing that can hold a big blank, so spending one on small blanks is charged for) and what it costs to lift the boards stacked on top of it — a small charge, deliberately too small to buy a worse nest, that earns its place among the near-equal candidates a density range creates. When the sawdust settles, "Mark these boards cut" executes the list: cut boards leave the rack, every reusable offcut goes back on it as a new board row with its provenance, and one Undo restores the exact rack.
- **Inventory:** the storage map, and the shop's answer to "where is the 195 twill". One card per shelf, rack and bin, grouped by site, each showing what is on it and what is wrong with it — expired lots, resin and hardener together, flammables outside the rated cabinet. Search matches a shelf on what is ON it, so a material name leaves the shelves that have some; cards sort so that what is wrong comes first, clicking anywhere on a card opens that shelf, and the monthly stock walk is one click from the card. Every location shows on the map — an empty shelf is a quieter card, not a hidden one — and new shelves are added here rather than from the items list. Beside the map are three flat lists: items, materials, and **boards** — the tooling rack, one line per physical board led by the board id that its printed label carries, so two identical sheets stacked on each other stay separately trackable, grouped by grade because that is the axis the packer will not substitute across unless a mold says it may, and measured in volume rather than area because a mold is cut out of a solid and eats thickness. One control groups by grade, thickness or shelf and sorts by rack order, size, id or newest — rack order being where a board sits in its own pile, the same number the planner spends when it picks one. Every board takes free notes, for the soft corner or the bumpy face. **Receiving** is a page rather than a dialog: a spreadsheet-shaped sheet where a mixed order goes onto many different shelves in one pass, quantity fans out by class as you type (three rolls become three labelled records, a box of tape becomes one with a count), and the CS-011 §6 chemical checks run before anything is written. **Running out** is measured per material rather than per jug — which is what finally makes "we are completely out of MEKP" something the app can say — and turns into a Restock purchase that cancels its own reorder row when the delivery lands. Everything exports to CSV or straight onto the clipboard for a Google Sheet.
- **Schedule:** the production schedule, two views behind a toggle: the season as a station-by-week grid ("when is the ShopSabre free" is one horizontal scan) and the week by day, subteam and person.
- **Budget:** purchases through Submitted, Ordered and Reimbursed, with a receipt-scan button on phones.
- **Documents:** datasheets, CS standards and printables in one filterable shelf, plus pinned Google Docs. Paste a Drive URL anywhere in the app and it resolves the title and offers a preview, with no Google sign-in.
- **Reports:** CSV exports, the Monday status board as a grid of linked cards that prints clean, and the bulk label builder.
- **People:** the roster with roles, each person's live assignments, and their trainings (mold design, ShopSabre CNC, wet layup, resin infusion, foam core, forged CF) shown as capsule pills. Leads certify a whole training session in one modal, correct or revoke per person, and filter the roster by "qualified for". Trainings gate work: a work-order step tagged with a training refuses an untrained signer (a lead can override with a written reason that lands in the event log), and the mold / manufacturing engineer fields suggest qualified people and warn, without blocking, when the assignee isn't trained for the process.

![Inventory: the storage map, one card per shelf with contents and warnings](03%20App/design/inventory-mockup-20260825.png)

![Receiving: one line per thing in the box, each landing on whichever shelf it actually goes to](03%20App/design/receiving-mockup-20260825.png)

![Parts: the index of every part beside the selected one, each stage a row of steps](03%20App/design/parts-mockup-20260826.png)

![Molds: a mold, its stage, and its mold file on one screen](03%20App/design/molds-mockup-20260825.png)

Cross-links are everywhere; click a chip to jump to the related record. ⌘K
searches everything. Light and dark themes follow the system setting, and
printing always comes out black-on-white. Access is enforced server-side by
`firestore.rules`: creating an account grants nothing until a lead adds the
email to the roster.

### Labels and scanning

Every physical thing gets a 4 × 1 inch label: the ID, the fact that actually
identifies it, and a QR code that resolves back to the record. Label buttons
sit on work orders, parts, stock, and molds; the bulk builder under Reports
prints onto Avery sheets with a start-cell picker and a 100 mm calibration bar,
because browsers silently apply "fit to page" and polyester sheets cost real
money.

![Labels: a printed Avery sheet with IDs, key facts and QR codes](03%20App/design/labels-mockup-20260825.png)

Pointing a plain phone camera at a label opens a public nameplate that says
what the object is, what stage it is at and where it lives, with no account
and no app install. Names, costs and files stay behind the roster, enforced by
a separate mirror collection. There is a Scan button inside the app too, so a
two-step move is scan the mold, tap Move, scan the shelf. The cure buy-off
also captures which fabric roll and which resin and hardener lots went in, and
"I don't know" is a recorded answer, because a confident wrong lot is worse
than an honest gap.

![Scanning: the public nameplate a phone camera opens, no sign-in](03%20App/design/scan-mockup-20260825.png)

The old single-file `03 App/work-orders.html` stays as an offline backup and
archive viewer. It opens any exported JSON with no server at all. Don't delete
it.

## The CFD PDF viewer

`07 CFD PDF Viewer/` compares Fluent CFD reports without opening two PDFs side
by side and hunting for the same plot in each. It runs as a desktop app
(Electron, macOS and Windows) or a plain web page; either way it is the same
code. Full detail in its own `README.md`, including a two-command way to try
it on the sample reports that ship in the folder.

![The Panels view: the same named plot pulled from every open report](07%20CFD%20PDF%20Viewer/design/cfd-panels-mockup-20260803.png)

Load two or more design-point reports and: **Pages** scrolls them together,
column per report. **Panels** pulls one named plot out of every report,
cropped and scaled identically. **Overlay** lays two reports on top of each
other with a blend, a swipe divider, or a per-pixel difference map. **Summary**
tables the mesh counts, solver settings and residuals with changed values
highlighted, which often answers the question before you look at a plot.
**Search** covers plot names and full text across every open report.

It works because Fluent's export has a consistent layout that the indexer uses
to find and name every panel with no manual setup.

## The rest, briefly

**Pain Points and CS Standards** (`01`, `02`) are where the app's rules come
from: 10 root-caused SN5 problems, each mapped to a numbered standard that
fixes it. `CS-INDEX` is the lookup and `python3 tools/check_traceability.py`
audits the mapping. XCR is the current mold sealer, the RFS ShopSabre is the
machining path, and every quantitative claim cites a datasheet in
`04 Datasheets/` or a recorded team measurement. Every standard ships "Draft,
pending Lead signature" until someone signs the approval table. Three
(CS-007, CS-008, CS-009) are Outlined rather than fully Drafted, so double
check before leaning on those.

**Datasheets and Printables** (`04`, `05`) are reference material: manufacturer
TDS/SDS PDFs chosen from actual purchase history, and shop-floor sheets meant
to be printed.

**Design System** (`06`) is the app's visual language pulled out into something
reusable: tokens, component styles, and a living style guide in light and
dark. The app remains the source of truth; `tools/test_designsystem.mjs` keeps
the two from drifting apart. It also syncs to claude.ai/design.

![The style guide: tokens and components, light theme](06%20Design%20System/styleguide-light-mockup-20260825.png)

**The team website** (`08`) is the public site for sponsors and recruits,
plain HTML and CSS on the `06` design system, no framework. Photos are
placeholders, the application form is not wired, and it has never been
deployed; its README has the list. Run it with `node "08 Website/build.mjs"`
then serve `08 Website/site`.

![The public site's home page](08%20Website/design/website-home-mockup-20260803.png)

**Open items (need a human):** move the `feb-composites` Firebase project to a
team Google account (or add the next lead as an owner) so it survives handoff;
confirm the ShopSabre's exact model against CS-005 §5; field-verify the CS-011
storage map at RFS; sign the approval tables. HANDOFF.md carries the full
list.

**Maintenance:** edit standards in `02 CS Standards/src/`, rebuild with
`tools/.venv/bin/python tools/build_docx.py --all`, then
`python3 tools/gen_docs_manifest.py` and `python3 tools/check_traceability.py`.
Regenerate retro work orders only if the source data was wrong.

## Tests

The full inventory, what each suite covers, which need Playwright or the
Firebase emulator, and the hard-won lessons behind the browser tests all live
in [`tools/README.md`](tools/README.md). The short version:

```bash
node tools/test_app.mjs           # app logic, no browser, run this first
node tools/test_designsystem.mjs  # CSS drift between app and 06, ~1s
node tools/test_appui.mjs         # every tab, four widths, two themes, measured
node tools/test_detailui.mjs      # the same with records open and fields full
```

plus suites for the mold slicer and packer, the drawings, printing on phones,
labels and QR codes, scanning, the public scan page, the sanitizer, safe-area
insets, the website, and the three Firebase rules files. Before shipping
anything visual, run the matching browser suite and look at the screenshots it
can write with `--shots`; the tests measure, but only eyes catch "unreadable".

To regenerate the annotated screenshots in this and the other READMEs after a
UI change:

```bash
node tools/make_mockups.mjs
```

One quirk worth knowing: the git root is this folder rather than `03 App/`,
because the scripts in `tools/` resolve their paths relative to here.
`firebase deploy` still has to run from inside `03 App/`.
