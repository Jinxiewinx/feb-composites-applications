# SN6 Resources — FEB Composites

I put this together in July 2026, after comp, from everything we did in SN5 — the Drive, the full #composites and #purchasing history, and the manufacturer datasheets for the stuff we actually buy. It's the handoff I wish I'd gotten: what went wrong and why, standards so the answers stop living in people's heads, and a work-order system so we can actually trace what we built. Everything went through staged reviews (G0–G4) against a reviewer agent loaded with our constraints and SN5 history before it landed here.

— Simon

## What's in here

| Folder | Contents | Start with |
|---|---|---|
| `03 App/` | The composites work-order app, live at feb-composites.web.app | `app/README.md` |
| `07 CFD PDF Viewer/` | Desktop/web app for comparing Fluent CFD reports side by side | `README.md` |
| `00 Agent/` | The "simon" reviewer-agent definition. Archival copy; the live one is at `composites_programs/.claude/agents/simon.md` | |
| `01 Pain Points and Improvements/` | The SN5 season review: what went well, 10 major problems with root-cause analyses, traceability to the fixes | the .docx |
| `02 CS Standards/` | 14 numbered composites standards (CS-000 to CS-013), markdown source with built .docx outputs | `CS-INDEX` |
| `04 Datasheets/` | 25 manufacturer TDS/SDS PDFs for the products we actually use | `INDEX.md` |
| `05 Printables/` | Shop reference sheets in `printables.html`: resin ratio and cure table, layup flowcharts, vacuum numbers, mold-prep card, ShopSabre checklist, PPE | print it |
| `06 Design System/` | The app's visual language pulled out into a reusable system: color/type/spacing tokens, a component CSS library, and a living style guide | `styleguide.html` |
| `08 Website/` | The public team website for sponsors and recruits, built on the design system | `README.md` |
| `tools/` | Scripts that build and check the rest: the markdown-to-docx builder, the retro work-order generator, the link auditor, and the app's test suites | |

## The app

`03 App/app/` is the team's shared workspace for a season, running on Firebase with an email allowlist for the roster. It's live at **https://feb-composites.web.app**, updates live for everyone, and works on phones and tablets as well as desktop. Full detail, setup and architecture are in `03 App/app/README.md`; this is the tour.

![Dashboard tab: open items, deadlines, watched tickets and budget at a glance](03%20App/design/dashboard-mockup-20260728.png)

**Tabs:**

- **Dashboard** — your open items, team deadlines in the next two weeks, anything behind schedule, watched tickets with new activity, and the budget at a glance. Read-only; every row links into the tab it came from.
- **Work Orders** — the manufacturing traveler: layup stack, BOM, step buy-offs stamped with who signed them, blocker enforcement, and a printable hand-fillable sheet. Every printed sheet is exactly two pages — the app measures the content and picks the most generous layout that still fits, so nothing spills onto a third page. Steps also enforce **cure holds**: buying off an infusion or a wet layup asks which resin went in, when it finished and how cold the shop was, and the demould step then stays locked until the hold has run. The enforced hold is FEB's own number and it is longer than the datasheet asks for; both are shown, labelled as what they are, behind a "why 48 h?" link that opens the actual TDS. A lead can override, but only with a typed reason that lands in the work order's event log alongside how many hours short it was. Every cure number lives in one file, `03 App/app/resins.js`: six resin systems, each with the datasheet figure quoted from a PDF that ships with the app, the hold FEB actually enforces, and who signed that hold off. A hold below its datasheet figure, or one with nobody's name against it, is caught by a test rather than trusted.
- **Parts** — the season's Part Tracker: CAD/Mold/Layup progress, subteam, engineers, target weight, layup deadline. On a wide screen it's a split — every part indexed down the left, the selected one beside it — so opening a part doesn't destroy the list and going back doesn't destroy the part. Arrow keys walk the index and `1`/`2`/`3` advance the three stages, so you can work down your own parts without touching the mouse. Each stage is a row of steps you click directly; going forward writes and leaves an undo, while going backwards or skipping steps asks first and says what it would skip. With nothing selected the right pane shows the season instead: how the open parts spread across the three stages, and who owns what's behind.
- **Stock** — a live tooling-board inventory (a full 4×8 sheet and an offcut are the same kind of record, so remnants come back into stock instead of piling up), plus the **mold stack planner**: hand it a mold STL (or just type a rectangular block) and it works out which boards to glue and how to saw them — picks thicknesses that waste the least board, splits tall molds at the ShopSabre's ~6″ cut-depth limit, prints a numbered cut list, and draws the stack exploded so a reviewer can check the fit before signing off. A real Fusion export is often 30+ separate bodies, so it splits them and asks which one you mean. Two things make the sign-off less of an act of faith: a **rotatable 3D view** of the actual mold sitting inside the translucent blocks (the exploded drawing only ever showed it as a dashed outline traced on each layer) — drag to turn it, scroll or pinch to zoom, and the pinch works on a phone at the bench, and **Export stock STL**, which writes the planned blocks back out — one file per machine setup, in millimetres, at the mold's own CAD origin, so it drops onto the model in CAD and CAM can use it as the stock body without anyone re-modelling it by hand. The stack also prints as a proper **engineering drawing set** — a general isometric, a third-angle three-view, and then one dimensioned sheet per layer, because the boards get glued by hand and whoever is holding layer 3 needs to know how far in from each edge of layer 2 it goes. Dimensions read in inches to the nearest 1/16″ with the exact millimetre bracketed beside them, the mold is drawn under the blocks as a silhouette traced off the stored STL, and every sheet marks the same datum corner. Three sample molds ship with the app, so the planner can be tried without exporting anything from Fusion first, and **Load SN5 archive** now also brings in the board rack SN5 left behind — the planner picks thicknesses from what you actually own, so a fresh project has nothing to plan against until that runs.
- **Tickets** — a jira-style tracker merging what used to be separate Projects and Issues: R&D, process fixes, bugs, outreach, anything that isn't a part. Board or list view, assignees, watchers, due dates, sub-tickets, cross-links to parts and work orders, a comment thread with rich text (headings, links, code, tables) and downloadable photo attachments.
- **Timeline** — the production schedule as a station-by-week grid. Weeks are the columns and the seven stations the rows, so "when is the ShopSabre free" is one horizontal scan. Add a week and it lands dated on the Monday after the last one; tap any week's date to move it, and any day you pick snaps to that week's Monday. The two ShopSabre rows carry the reminder that a slot here is the team's plan and not a booking: the machine is reserved on the RFS/RSO site, by whoever is running the job.
- **Weekly Plan** — a day-by-subteam view of the same schedule: what's getting done each day by which car group, plus a per-person weekly task rollup pulled automatically from ticket due dates and manual assignments.
- **Budget** — purchase requests through Submitted, Ordered and Reimbursed, with a season total, an open-orders subtotal, a flag on anything over $50, and a mobile "scan receipt" button that opens the phone camera and attaches the photo to the purchase.
- **Documents** — every reference doc in one place: the manufacturer datasheets, CS standards (rendered from markdown, with the .docx also downloadable) and shop printables, filterable by type. Anyone can upload a doc. It also holds the **team shelf**: the Google Docs, Slides and Sheets people keep asking for (the master tracker, the weekly meeting deck, the ShopSabre training), pinned once so they have an address instead of being re-pasted into Slack every few months. Google documents can also be linked to the thing they are about, on a work order, a part, a ticket, or a given week. Paste a URL and the app works out whether it is a Doc, Slides, a Sheet or a Drive folder, tries to read the real title off the page, and offers an inline preview you can expand. There is no sign-in, no Google permission to grant and nothing to set up: at worst it behaves exactly like the link you would have pasted anyway.
- **Reports** — per-dataset CSV export, plus a one-click printable Monday-meeting status board.
- **People** — the roster with photos, roles, and each person's live assignments across parts, tickets and work orders.

![Mold stack planner: an STL turns into an exploded board stack and a numbered cut list](03%20App/design/stock-mockup-20260728.png)

![Parts tab: the index of every part beside the selected one, with each stage a row of steps you click](03%20App/design/parts-detail-mockup-20260731.png)

Cross-links are everywhere — click a chip to jump to the related record. Press ⌘K (Ctrl-K) for global search. It has a light and dark theme (follows system setting, remembered after that), and printing always comes out black-on-white regardless of theme.

Access is roster-gated: creating an account doesn't grant access to anything until a lead adds that email to the roster, enforced server-side by `firestore.rules`, not just hidden buttons. A `member` does day-to-day work everywhere; a `lead` can also delete records, restore from a backup, and manage the roster.

The old single-file `03 App/work-orders.html` stays as an offline backup and archive viewer — it opens any exported JSON with no server at all. Don't delete it.

## The CFD PDF viewer

`07 CFD PDF Viewer/` compares Fluent CFD reports without opening two PDFs side by side and hunting for the same plot in each. Runs as a desktop app (Electron, macOS and Windows builds) or a plain web page — either way it's the same code. Full detail in its own `README.md`.

Load two or more design-point reports and:

- **Pages** scrolls them together, column per report.
- **Panels** pulls one named plot out of every open report, cropped and scaled identically, so the eye does the comparing.
- **Overlay** lays two reports on top of each other — blend, a draggable swipe divider, or a per-pixel difference map (two identical reports read exactly 0.00%, so the number is trustworthy).
- **Summary** tables mesh counts, solver settings, iterations and residuals from every report, with changed values highlighted — often answers the question before you look at a plot.
- **Search** covers plot names and full document text across every open report at once.

It works because Fluent's Chromium export has a consistent layout (panel titles at a fixed point size, a roughly uniform pitch down the page) that the indexer uses to find and name every panel without any manual setup — see that README for how the matching and page-break handling work.

## The rest, briefly

**Pain Points and CS Standards** (`01`, `02`) are where the app's rules come from: 10 root-caused SN5 problems, each mapped to a numbered standard that fixes it (`CS-INDEX` is the lookup, `python3 tools/check_traceability.py` audits the mapping). XCR is the current mold sealer, the RFS ShopSabre is the machining path, and every quantitative claim in a standard cites a datasheet in `04 Datasheets/` or a recorded team measurement — two web-search "facts" turned out to be wrong during this build, both caught by reading the actual PDFs. Every standard ships "Draft, pending Lead signature" until someone actually signs the approval table; four (CS-001, CS-007, CS-008, CS-009) are Outlined rather than fully Drafted, so double check before leaning on those hard.

**Datasheets and Printables** (`04`, `05`) are reference material — 25 manufacturer TDS/SDS PDFs chosen from actual purchase history, and shop-floor cheat sheets meant to be printed.

**Design System** (`06`) is the app's visual language pulled out into something reusable: the color/type/spacing tokens (`tokens.css`), the component styles built on them (`components.css`), and a living style guide (`styleguide.html`) that renders the whole system in light and dark. It was extracted from the app's stylesheet so the next FEB tool, poster, or page can start on-brand instead of reinventing Berkeley Blue and the layup-status colors. Open `styleguide.html` in a browser, or read `06 Design System/README.md` for how to link it into a page. It is also synced to claude.ai/design, so anything designed there comes out in Berkeley Blue with the right type and the right status colors; `.design-sync/` holds the inputs that sync uses and `.design-sync/NOTES.md` explains how to re-run it.

**The team website** (`08`) is the public site for sponsors and recruits, built from a design handoff on the `06` design system: a scrolling home page plus seven secondary pages, plain HTML and CSS with one JS file, no framework. It links the repo's own design system rather than carrying a copy, so a token change in `06` reaches it with one build. All the photos are placeholders and the application form is not wired yet; `08 Website/README.md` has the list. Not deployed. Run it with `node "08 Website/build.mjs"` then serve `08 Website/site`.

**Open items (need a human):** move the `feb-composites` Firebase project to a team Google account (or add the next lead as an owner) so it survives handoff; confirm the ShopSabre's exact model against CS-005 §5; field-verify the CS-011 storage map at RFS; sign the approval tables.

**Maintenance:** edit standards in `02 CS Standards/src/`, rebuild with `tools/.venv/bin/python tools/build_docx.py --all`. Regenerate retro work orders only if the source data was wrong: `tools/.venv/bin/python tools/gen_retro_wos.py`.

**Tests**, all runnable from here:

```bash
node tools/test_app.mjs      # app logic across every tab, in a DOM stub
node tools/test_designsystem.mjs  # the app's CSS against 06 Design System, no browser
node tools/test_appui.mjs    # layout: 11 tabs x 4 widths x 2 themes, measured
node tools/test_detailui.mjs  # the same, but with records OPEN and their fields full
node tools/test_slicer.mjs   # mold geometry: slicing, islands, containment
node tools/test_packer.mjs   # cut lists: guillotine feasibility, kerf, stock policy
node tools/test_drawings.mjs # mold drawings: renders every sheet and checks it is READABLE
node tools/test_print_mobile.mjs  # the printed sheets on a phone: fit, controls, save
node tools/test_safearea.mjs # the notch, the Dynamic Island, the home indicator
node tools/test_website.mjs  # the public site: design system, reveals, eggs, no-JS, phone
cd "03 App" && firebase emulators:exec --only firestore --project demo-feb-work-orders \
  "node '../tools/test_wo_rules.mjs'"                      # security rules
```

The last two are the odd ones out and worth knowing about. Everything else
asserts on strings and numbers — and a sheet passes all of that while printing a
dimension straight through a dimension line, or running off the side of a phone.
Both render the real thing in headless Chromium and measure what the browser
actually laid out. `test_drawings.mjs` checks eight mold fixtures for legibility:
no label crossed by a solid line, no two labels overlapping, nothing upside down,
nothing under 5.5pt, nothing off the sheet. `test_print_mobile.mjs` boots the
whole app (with `fb.js` stubbed at the route, so no Firebase and no auth) at four
device widths and checks every printable document fits, its controls stay
reachable and thumb-sized, closing gives the app back, and the screen fit never
reaches the paper. Add `--shots` to either for PNGs of whatever failed. Both need
Playwright (`npm i -g playwright && npx playwright install chromium`) and skip
loudly without it — run them before shipping a change to `drawings.js`,
`print.js` or `print.css`.

`test_designsystem.mjs` and `test_appui.mjs` are the newest pair, and they exist
because `06 Design System/` was extracted from the app rather than imported by
it. Two copies of one design, with nothing holding them together, rot quietly:
the app's kanban column and modal had drifted a pixel off the radius token,
`.stage` had lost its background and `.avatar` its fill, and none of that shows
up in a screenshot. The first is the diff, run as a test, and it also checks the
CSS actually parses — which sounds pointless until an unterminated comment eats
the next rule and a fix you just made silently does nothing. The second renders
all eleven tabs at 1920, 1440, 900 and 393 in both themes and measures the
things a picture can only show you: nothing off the side, no tap target under
40px where there is a thumb, no text under 11px, nothing sticky hiding behind
the topbar, every surface actually changing colour in dark mode, and `main`
using the window it was given. That last one is how the wasted 27% of a 1920
monitor got found.

`test_detailui.mjs` is the fourth, and it exists because `test_appui.mjs`
passed clean on a bug Simon could see on his phone. That test audits eleven tabs
and never opens a record, and every fixture in `tools/lib/fixtures.mjs` carries
`comments: []`, no `docs` and no `files` — so it was measuring an app in which
nobody had ever commented, linked a Drive doc or attached a file. An empty
thread cannot overflow. This one fills those fields from
`tools/lib/fixtures-content.mjs` (a bare 120-character Drive URL, an
underscore-joined CAD filename, a 600-character one-paragraph update typed at
RFS, a pasted six-column table, a code block) and opens every detail page plus
six overlay states — the lightbox, three modals, the composer with a draft in
it, the drawer — at 320, 393, 430 and 1440.

Two things it does that are worth copying. It asserts that the populated content
actually reached the page, and that an overlay actually opened, because a check
that measures the wrong thing reports green: the first run passed six overlay
views having opened none of them. And it distinguishes a hard cut from a
designed one — `overflow: hidden` with no `text-overflow: ellipsis` is a defect,
an ellipsis is a decision.

It also has the clearest lesson in this repo about the limits of measuring. The
first round of fixes turned every number green, and three reviewer agents
looking at the screenshots opened with the same finding: the tables were
unreadable. `overflow-wrap: anywhere` gives a table cell a min-content width of
one character, so instead of overflowing into the scroller that already exists
for it, every column had collapsed to its narrowest form — a pasted pull-test
table rendered its header as C / o / u / p / o / n down the page. No overflow,
nothing clipped, nothing off-screen, and you could not read a row across. Run
`--shots` and look at them.

`test_safearea.mjs` is the third of that family and the least obvious. The app
sets `viewport-fit=cover` and runs standalone with a translucent status bar on
purpose, so it draws edge to edge and the navy topbar meets the Dynamic Island
like a native app — which means **every element at a screen edge owns its own
inset**, and getting one wrong hides a button under the island. `env()` can't be
faked in a headless browser, so the app reads `--sa-t/-r/-b/-l` instead, and the
test overrides those four to real iPhone 15 Pro values and measures what the
browser laid out: portrait, landscape, and landscape-on-a-Pro-Max (932px — wider
than the 900px breakpoint, which is the combination that catches insets left
inside a media query). It also checks the island lands on *chrome* rather than on
a table row, and that nothing sticky pins itself behind the topbar.

There's a third thing in that family which is deliberately **not** a test:

```bash
node tools/shoot_ui.mjs --out .ui-shots --tab all   # PNGs of every tab, 4 widths x 2 themes
```

It renders the real app with real SN5 data and writes images. It asserts nothing,
because the failure it exists for can't be written down as a number — the Parts
tab passed every string assertion in `test_app.mjs` while drawing each of its
three progress stages twice, and colouring un-started molds as if they were
half-finished. Nobody had looked at it. Pair it with
`.claude/agents/ui-reviewer.md`, a read-only reviewer that scores a screen on
eight axes and only passes at no-axis-below-3, average ≥4 — the same bar
`00 Agent/simon.md` applies to documents. Because `shoot_ui.mjs` resolves the app
relative to itself rather than the cwd, running it inside a git worktree
photographs that worktree, which is how four competing designs for the Parts tab
were shot under identical conditions and judged frame for frame.

To drive the app locally with a database in it, use `node
tools/serve_populated.mjs --port 8791`: the real app on a real port, Firebase
stubbed out, seeded from the SN5 archive and the same populated fixtures the
tests use. Nothing is saved, so reloading resets it. Open it in Chrome's device
toolbar at iPhone 15 rather than a narrow desktop window — half the responsive
rules key off `pointer: coarse`, and only the device toolbar sets that.

For the app as it really is, serve it with `python3 tools/nocache_server.py 8126` rather than `python3 -m http.server` — the latter sends no cache headers and will happily serve a stale script while you debug code that isn't running.

One quirk worth knowing: the git root is this folder rather than `03 App/`, because the scripts in `tools/` resolve their paths relative to here. `firebase deploy` still has to run from inside `03 App/`.
