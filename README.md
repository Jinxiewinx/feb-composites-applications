# SN6 Resources — FEB Composites

I put this together in July 2026, after comp, from everything we did in SN5 — the Drive, the full #composites and #purchasing history, and the manufacturer datasheets for the stuff we actually buy. It's the handoff I wish I'd gotten: what went wrong and why, standards so the answers stop living in people's heads, and a work-order system so we can actually trace what we built. Everything went through staged reviews (G0–G4) against a reviewer agent loaded with our constraints and SN5 history before it landed here.

— Simon

## What's in here

| Folder | Contents | Start with |
|---|---|---|
| `00 Agent/` | The "simon" reviewer-agent definition. Archival copy; the live one is at `composites_programs/.claude/agents/simon.md` | |
| `01 Pain Points and Improvements/` | The SN5 season review: what went well, 10 major problems with root-cause analyses (5-why / fishbone), a minor-issues table, and traceability to the fixes | the .docx |
| `02 CS Standards/` | 14 numbered composites standards (CS-000 to CS-013) with revision tracking, approvals, changelogs and photo placeholders. The markdown in `src/` is the source of truth; the .docx files are built outputs | `CS-INDEX` |
| `03 App/` | The composites app, live at feb-composites.web.app: work orders, parts, projects, budget, timeline, board stock and the mold stack planner. Plus the retro SN5 archive that seeds it (26 work orders, 33 parts, a timeline) | `app/README.md` |
| `04 Datasheets/` | 25 manufacturer TDS/SDS PDFs for the products we actually use, chosen from purchase history rather than the stale inventory sheet | `INDEX.md` |
| `05 Printables/` | Shop reference sheets in `printables.html`: resin ratio and cure table, infusion and wet-layup flowcharts, vacuum numbers, mold-prep card, ShopSabre checklist, PPE, process blockers | print it |
| `07 CFD PDF Viewer/` | Desktop app for comparing Fluent CFD reports: load two or more, scroll them together, put the same plot side by side, and overlay them to see what moved | `README.md` |
| `tools/` | Scripts that build and check the rest: the markdown-to-docx builder, the retro work-order generator, the link auditor, and the app's test suites | |

## The app

`03 App/app/` is a shared workspace for work orders, parts, projects, budget, the season timeline, board stock and mold planning, running on Firebase with an email allowlist for the roster. It is live at **https://feb-composites.web.app**.

The folder was called `03 Work Orders/` until work orders stopped being most of what it did.

Work orders print as a hand-fillable shop traveler rather than a screenshot of the screen: ruled boxes for every field, an initial-and-date cell on every step, blockers called out in heavy rule and hatching, and blank rows at the end of each list so plies, steps and BOM lines can be added at the bench. Print on a work order opens a preview of the exact sheet. Print blank traveler gives you empty forms with the standard step list already on them, a stack to take to RFS. It's all designed for a black-and-white laser, so nothing depends on colour.

Every sheet is two pages, always. The writing space does the adjusting: the app renders the sheet, measures it, and picks the most generous layout that still fits, so a sparse work order comes out with plenty of room to write and a dense one comes out tighter. Nothing spills onto a third page that then gets separated from the first two. Step titles no longer carry CS standard numbers either, since they made the sheet dense and the standards are in the Documents tab.

### Stock and the mold stack planner

The **Stock** tab is a live tooling-board inventory — CS-011 asked for one and we never had one, which is how the Master Tracker sheet went stale. A full 4×8 sheet and a 19×30 offcut are the same kind of record here, so remnants come back into stock instead of quietly becoming a pile.

On top of that it plans molds. Give it a mold STL, or just type a rectangular block, and it works out which boards to glue and how to saw them:

- **It picks the thicknesses**, from what the rack actually holds. It tries every combination that reaches the mold height, slices each, and keeps the one that wastes least board — with a penalty per extra layer, because every glue joint is a 4-hour clamp (CS-003 §7.3).
- **It cakes the layers.** Each layer's blank is only as big as the mold needs at that height, so a tapered plug comes out as a stepped stack rather than a solid block. Separated features get their own blocks.
- **It splits past 6 inches.** CS-005 §5 caps the ShopSabre at ~6″ of cut depth, so anything taller is sectioned at board boundaries, with a reminder to design the dowels in CAD rather than improvise them at the bed (CS-003 §7.1.6).
- **It prints a cut list.** Numbered cuts per board, in the order you make them, every one running edge to edge because that is all a saw can do. Offcuts get opened before fresh sheets. Anything the rack cannot supply comes out as a purchase list instead of a surprise.
- **It draws the stack** exploded, with the mold outlined inside each block, so the CS-003 §7.2 reviewer can see the fit before initialling — that checklist item was hand-drawn until now.

A real Fusion export is often an assembly rather than one solid (the SN5 undertray file is 31 separate bodies), so it splits bodies and asks which one you mean.

The geometry is deliberately conservative: a blank is computed to *contain* the mold, verified by clipping every triangle of the mesh against every blank. A mold with bad draft still gets a correct plan plus a CS-003 §7.1.4 warning, rather than being refused.

Setup, deploy and architecture are in `03 App/app/README.md`. The `work-orders.html` file in the same folder is the original single-file version, kept as an offline viewer.

## How the pieces connect

Problem, root cause, fix, and where the fix lives:

| PP | Problem (SN5) | Owning fix |
|---|---|---|
| PP-01 | Duratec mold sealing | The mold-sealing standard, which makes XCR the default and keeps the Duratec story as the why |
| PP-02 | Customs delay blocked infusions | Minimum-stock math in the inventory standard, plus the ordering calendar |
| PP-03 | Clamshell mold CAD error, lost a machine week | A mold design review, enforced as a blocker step on the work order |
| PP-04 | Dashboard remade 3+ times | A frozen layup spec, plus cross-team sign-off on the work order |
| PP-05 | Catch-can grounding drift (6 months) | A named decision point, with the acceptance criterion set before the work starts as a blocker |
| PP-06 | Machine-slot scramble / Jacobs crackdown | ShopSabre reservation discipline, plus time estimates on the work order |
| PP-07 | UT stack undefined 3 weeks pre-layup | The "stack frozen before mold machining" blocker |
| PP-08 | Purchasing bottlenecked on the lead | A documented purchasing flow with more than one purchaser |
| PP-09 | Tribal knowledge, zero versioned docs | Versioned documentation, and the work-order system itself |
| PP-10 | Storage conflicts, lost molds | The storage map, part and mold labeling, and a live mold location on the work order |

Each row maps to a numbered standard in `02 CS Standards/`; `CS-INDEX` is the lookup. `python3 tools/check_traceability.py` audits that mapping at the source, in `01 Pain Points and Improvements/src/pain-points.md`, along with the standards and their datasheet citations. Run it whenever you restructure things.

## Ground rules baked in everywhere

**Current practice, not SN5 archaeology.** XCR is the mold sealer and Duratec is history. The RFS ShopSabre (5×10 bed, vacuum hold-down, auto tool changer, its own reservation system) is the machining path. The Master Tracker inventory sheet is stale, so purchase history and #purchasing are ground truth for what we actually use.

**Every number has a source.** Anything quantitative in a standard cites a TDS/SDS in `04 Datasheets/` or a recorded team measurement. Two web-search "facts" turned out to be flat wrong during this build, the XCR mix ratio and the IN2 pot life, both caught by reading the actual PDFs. That's the whole argument for keeping the datasheet folder.

**Retro honesty.** The 26 SN5 work orders back-fill only what the record supports. Everything else says "not recorded (retro)". No made-up buy-offs, no invented measurements.

**Nothing is "Released" until it's signed.** Every standard ships as "Draft, pending Lead signature", and the approval tables are ready for a pen.

**Four standards are Outlined, not fully Drafted:** CS-001 (labeling), CS-007 (wet layup), CS-008 (resin table) and CS-009 (trim/sand). All sections are there and every number is TDS-verified, but the procedure depth is stubbed. Finish them before leaning on them hard. The depth column in CS-INDEX is the authority.

## Open items (need a human)

- The app is live at feb-composites.web.app on the Firebase project `feb-composites`. Move it to a team Google account, or add Nick as an owner, so it survives handoff (Firebase console, Project settings, Users and permissions).
- Confirm the ShopSabre's exact model and options on the machine placard, and sanity-check the specs in CS-005 §5 against it.
- Field-verify the CS-011 storage map locations at RFS.
- Sign the approval tables.

## Maintenance

Edit the markdown in `src/`, then rebuild with `tools/.venv/bin/python tools/build_docx.py --all` (fallback: `tools/build_docx.sh`). Regenerate the retro work orders only if the source data was wrong: `tools/.venv/bin/python tools/gen_retro_wos.py` rewrites both `data/sn5-work-orders.json` and the seed embedded in `work-orders.html`, and is safe to re-run.

Tests, all runnable from here:

```bash
node tools/test_app.mjs      # app logic across every tab, in a DOM stub
node tools/test_slicer.mjs   # mold geometry: slicing, islands, containment
node tools/test_packer.mjs   # cut lists: guillotine feasibility, kerf, stock policy
cd "03 App" && firebase emulators:exec --only firestore --project demo-feb-work-orders \
  "node '../tools/test_wo_rules.mjs'"                      # security rules
```

To drive the app locally, serve it with `python3 tools/nocache_server.py 8126` rather than `python3 -m http.server` — the latter sends no cache headers and will happily serve a stale script while you debug code that isn't running.

`SESSION-STATE.md` is a rolling handoff file for picking work back up mid-stream. Start there if a session got cut off.

One quirk worth knowing: the git root is this folder rather than `03 App/`, because the scripts in `tools/` resolve their paths relative to here. `firebase deploy` still has to run from inside `03 App/`.
