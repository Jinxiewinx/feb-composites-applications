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

You need Node for the app tooling, Python 3 for the document pipeline (the
virtualenv at `tools/.venv` already exists), the Firebase CLI for deploys and
the rules tests, and Playwright for the browser tests
(`npm i -g playwright && npx playwright install chromium`).

Three commands cover most days, all run from this folder:

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
on phones and tablets as well as desktop. The full manual, setup and
architecture live in `03 App/app/README.md`; this is the short tour.

![Dashboard: your open items, what is blocked, deadlines and budget at a glance](03%20App/design/dashboard-mockup-20260803.png)

Fourteen tabs, in the order they appear:

- **Dashboard:** your open items, what is blocked, the deadline list, this week and the money. Read-only; every row links into the tab it came from.
- **Work Orders:** the manufacturing traveler: layup stack, BOM, step buy-offs stamped with who signed, blocker steps, and enforced cure holds backed by the datasheets in `resins.js`. Prints to a hand-fillable sheet that is always exactly two pages.
- **Parts:** the season tracker as a split view: every part down the left, the selected one beside it, each stage a row of steps you click. Arrow keys walk the list; `1`/`2`/`3` advance the stages.
- **Stock:** tooling-board inventory plus the mold stack planner: hand it a mold STL and it picks boards, splits at the ShopSabre depth limit, prints a numbered cut list and a dimensioned drawing set, and exports the stock back out as STL for CAM.
- **Molds:** a mold is a record: stage, home location, sealing record, and how many parts have been pulled off it, with the work orders and parts that used it as a live join.
- **Materials:** fabric rolls and their offcuts, resin and hardener lots, consumables. Lot numbers, received/opened/expiry dates, mix ratios, locations.
- **Items:** test panels, jigs and bins. A panel carries its layup stack, its coupon range and which lots went in.
- **Tickets:** a jira-style tracker for everything that is not a part: R&D, process fixes, bugs, outreach. Board or list, assignees, watchers, sub-tickets, rich-text comments with photos.
- **Timeline:** the production schedule as a station-by-week grid, so "when is the ShopSabre free" is one horizontal scan.
- **Weekly Plan:** the same schedule by day and subteam, plus a per-person task rollup.
- **Budget:** purchases through Submitted, Ordered and Reimbursed, with a receipt-scan button on phones.
- **Documents:** datasheets, CS standards and printables in one filterable shelf, plus pinned Google Docs. Paste a Drive URL anywhere in the app and it resolves the title and offers a preview, with no Google sign-in.
- **Reports:** CSV exports, a printable Monday status board, and the bulk label builder.
- **People:** the roster with roles and each person's live assignments.

![Parts: the index of every part beside the selected one, each stage a row of steps](03%20App/design/parts-mockup-20260803.png)

![Stock: tooling-board inventory and the mold stack planner](03%20App/design/stock-mockup-20260803.png)

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

![Labels: a printed Avery sheet with IDs, key facts and QR codes](03%20App/design/labels-mockup-20260803.png)

Pointing a plain phone camera at a label opens a public nameplate that says
what the object is, what stage it is at and where it lives, with no account
and no app install. Names, costs and files stay behind the roster, enforced by
a separate mirror collection. There is a Scan button inside the app too, so a
two-step move is scan the mold, tap Move, scan the shelf. The cure buy-off
also captures which fabric roll and which resin and hardener lots went in, and
"I don't know" is a recorded answer, because a confident wrong lot is worse
than an honest gap.

![Scanning: the public nameplate a phone camera opens, no sign-in](03%20App/design/scan-mockup-20260803.png)

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

![The style guide: tokens and components, light theme](06%20Design%20System/styleguide-light-mockup-20260803.png)

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
