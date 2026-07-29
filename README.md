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
| `tools/` | Scripts that build and check the rest: the markdown-to-docx builder, the retro work-order generator, the link auditor, and the app's test suites | |

## The app

`03 App/app/` is the team's shared workspace for a season, running on Firebase with an email allowlist for the roster. It's live at **https://feb-composites.web.app**, updates live for everyone, and works on phones and tablets as well as desktop. Full detail, setup and architecture are in `03 App/app/README.md`; this is the tour.

![Dashboard tab: open items, deadlines, watched tickets and budget at a glance](03%20App/design/dashboard-mockup-20260728.png)

**Tabs:**

- **Dashboard** — your open items, team deadlines in the next two weeks, anything behind schedule, watched tickets with new activity, and the budget at a glance. Read-only; every row links into the tab it came from.
- **Work Orders** — the manufacturing traveler: layup stack, BOM, step buy-offs stamped with who signed them, blocker enforcement, and a printable hand-fillable sheet. Every printed sheet is exactly two pages — the app measures the content and picks the most generous layout that still fits, so nothing spills onto a third page.
- **Parts** — the season's Part Tracker: CAD/Mold/Layup progress, subteam, engineers, target weight, layup deadline.
- **Stock** — a live tooling-board inventory (a full 4×8 sheet and an offcut are the same kind of record, so remnants come back into stock instead of piling up), plus the **mold stack planner**: hand it a mold STL (or just type a rectangular block) and it works out which boards to glue and how to saw them — picks thicknesses that waste the least board, splits tall molds at the ShopSabre's ~6″ cut-depth limit, prints a numbered cut list, and draws the stack exploded so a reviewer can check the fit before signing off. A real Fusion export is often 30+ separate bodies, so it splits them and asks which one you mean.
- **Tickets** — a jira-style tracker merging what used to be separate Projects and Issues: R&D, process fixes, bugs, outreach, anything that isn't a part. Board or list view, assignees, watchers, due dates, sub-tickets, cross-links to parts and work orders, a comment thread with rich text (headings, links, code, tables) and downloadable photo attachments.
- **Timeline** — the production schedule as a station-by-week grid.
- **Weekly Plan** — a day-by-subteam view of the same schedule: what's getting done each day by which car group, plus a per-person weekly task rollup pulled automatically from ticket due dates and manual assignments.
- **Budget** — purchase requests through Submitted, Ordered and Reimbursed, with a season total, an open-orders subtotal, a flag on anything over $50, and a mobile "scan receipt" button that opens the phone camera and attaches the photo to the purchase.
- **Documents** — every reference doc in one place: the manufacturer datasheets, CS standards (rendered from markdown, with the .docx also downloadable) and shop printables, filterable by type. Anyone can upload a doc.
- **Reports** — per-dataset CSV export, plus a one-click printable Monday-meeting status board.
- **People** — the roster with photos, roles, and each person's live assignments across parts, tickets and work orders.

![Mold stack planner: an STL turns into an exploded board stack and a numbered cut list](03%20App/design/stock-mockup-20260728.png)

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

**Open items (need a human):** move the `feb-composites` Firebase project to a team Google account (or add the next lead as an owner) so it survives handoff; confirm the ShopSabre's exact model against CS-005 §5; field-verify the CS-011 storage map at RFS; sign the approval tables.

**Maintenance:** edit standards in `02 CS Standards/src/`, rebuild with `tools/.venv/bin/python tools/build_docx.py --all`. Regenerate retro work orders only if the source data was wrong: `tools/.venv/bin/python tools/gen_retro_wos.py`.

**Tests**, all runnable from here:

```bash
node tools/test_app.mjs      # app logic across every tab, in a DOM stub
node tools/test_slicer.mjs   # mold geometry: slicing, islands, containment
node tools/test_packer.mjs   # cut lists: guillotine feasibility, kerf, stock policy
cd "03 App" && firebase emulators:exec --only firestore --project demo-feb-work-orders \
  "node '../tools/test_wo_rules.mjs'"                      # security rules
```

To drive the app locally, serve it with `python3 tools/nocache_server.py 8126` rather than `python3 -m http.server` — the latter sends no cache headers and will happily serve a stale script while you debug code that isn't running.

One quirk worth knowing: the git root is this folder rather than `03 App/`, because the scripts in `tools/` resolve their paths relative to here. `firebase deploy` still has to run from inside `03 App/`.
