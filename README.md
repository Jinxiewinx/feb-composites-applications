# SN6 Resources — FEB Composites

I put this together in July 2026, after comp, from everything we did in SN5 — the Drive, the full #composites and #purchasing history, and the manufacturer datasheets for the stuff we actually buy. It's the handoff I wish I'd gotten: what went wrong and why, standards so the answers stop living in people's heads, and a work-order system so we can actually trace what we built. Everything went through staged reviews (G0–G4) against a reviewer agent loaded with our constraints and SN5 history before it landed here.

— Simon

## What's in here

| Folder | Contents | Start with |
|---|---|---|
| `00 Agent/` | The "simon" reviewer-agent definition. Archival copy; the live one is at `composites_programs/.claude/agents/simon.md` | |
| `01 Pain Points and Improvements/` | The SN5 season review: what went well, 10 major problems with root-cause analyses (5-why / fishbone), a minor-issues table, and traceability to the fixes | the .docx |
| `02 CS Standards/` | 14 numbered composites standards (CS-000 to CS-013) with revision tracking, approvals, changelogs and photo placeholders. The markdown in `src/` is the source of truth; the .docx files are built outputs | `CS-INDEX` |
| `03 Work Orders/` | The composites app, live at feb-composites.web.app, plus the retro SN5 archive that seeds it (26 work orders, 33 parts, a timeline) | `app/README.md` |
| `04 Datasheets/` | 25 manufacturer TDS/SDS PDFs for the products we actually use, chosen from purchase history rather than the stale inventory sheet | `INDEX.md` |
| `05 Printables/` | Shop reference sheets in `printables.html`: resin ratio and cure table, infusion and wet-layup flowcharts, vacuum numbers, mold-prep card, ShopSabre checklist, PPE, process blockers | print it |
| `tools/` | Scripts that build and check the rest: the markdown-to-docx builder, the retro work-order generator, the link auditor, and the app's test suites | |

## The app

`03 Work Orders/app/` is a shared workspace for work orders, parts, projects, budget and the season timeline, running on Firebase with an email allowlist for the roster. It is live at **https://feb-composites.web.app**.

Work orders print as a hand-fillable shop traveler rather than a screenshot of the screen: ruled boxes for every field, an initial-and-date cell on every step, blockers called out in heavy rule and hatching, and blank rows at the end of each list so plies, steps and BOM lines can be added at the bench. Print on a work order opens a preview of the exact sheet. Print blank traveler gives you empty forms with the standard step list already on them, a stack to take to RFS. It's all designed for a black-and-white laser, so nothing depends on colour.

Every sheet is two pages, always. The writing space does the adjusting: the app renders the sheet, measures it, and picks the most generous layout that still fits, so a sparse work order comes out with plenty of room to write and a dense one comes out tighter. Nothing spills onto a third page that then gets separated from the first two. Step titles no longer carry CS standard numbers either, since they made the sheet dense and the standards are in the Documents tab.

Setup, deploy and architecture are in `03 Work Orders/app/README.md`. The `work-orders.html` file in the same folder is the original single-file version, kept as an offline viewer.

## How the pieces connect

Problem, root cause, fix, and where the fix lives:

| PP | Problem (SN5) | Owning fix |
|---|---|---|
| PP-01 | Duratec mold sealing | CS-004 (XCR is the standard; the Duratec story is kept as the why) |
| PP-02 | Customs delay blocked infusions | CS-011 min-stock math and CS-012 order calendar |
| PP-03 | Clamshell mold CAD error, lost a machine week | CS-003 §7.2 design review, enforced as a work-order blocker step |
| PP-04 | Dashboard remade 3+ times | CS-002 frozen spec and work-order cross-team sign-off |
| PP-05 | Catch-can grounding drift (6 months) | CS-010 decision point, criterion-before-work as a blocker |
| PP-06 | Machine-slot scramble / Jacobs crackdown | CS-005 ShopSabre reservation discipline and work-order time estimates |
| PP-07 | UT stack undefined 3 weeks pre-layup | CS-002 "stack frozen before mold machining" blocker |
| PP-08 | Purchasing bottlenecked on the lead | CS-012 documented flow, distributed purchasers |
| PP-09 | Tribal knowledge, zero versioned docs | CS-000 versioned docs, and the work-order system itself |
| PP-10 | Storage conflicts, lost molds | CS-011 storage map, CS-001 labels, live mold location on the work order |

`python3 tools/check_traceability.py` verifies every link above still resolves. Run it whenever you restructure things.

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

`SESSION-STATE.md` is a rolling handoff file for picking work back up mid-stream. Start there if a session got cut off.

One quirk worth knowing: the git root is this folder rather than `03 Work Orders/`, because the scripts in `tools/` resolve their paths relative to here. `firebase deploy` still has to run from inside `03 Work Orders/`.
