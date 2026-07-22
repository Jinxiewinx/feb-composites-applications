# SN6 Resources — FEB Composites

I put this together in July 2026, after comp, from everything we did in SN5 — the Drive, the full #composites and #purchasing history, and the manufacturer datasheets for the stuff we actually buy. It's the handoff I wish I'd gotten: what went wrong and why, standards so the answers stop living in people's heads, and a work-order system so we can actually trace what we built. Everything went through staged reviews (G0–G4) against a reviewer agent loaded with our constraints and SN5 history before it landed here.

— Simon

## About this repository

This repo holds the **applications** side of SN6 Resources: the composites app
(`03 Work Orders/`) and the scripts and test suites that build and check it
(`tools/`). It is live at **https://feb-composites.web.app**.

The document side of the program — pain points, CS standards, datasheets,
printables, the reviewer-agent definition — lives in the team Drive, not here.
Those folders appear in the table below because it describes the whole program;
on GitHub you will only find the two above. The datasheets and standards the app
itself serves are the exception: they are tracked, under
`03 Work Orders/app/docs/`.

Working notes: `SESSION-STATE.md` is a rolling handoff file, so an interrupted
session can be resumed without re-deriving decisions. Start there if you are
picking work back up.

### Printing a work order

Work orders print as a **hand-fillable shop traveler**, not as a screenshot of
the app: ruled boxes for every field, an initial-and-date cell on each step,
blockers called out in heavy rule and hatching, and blank rows at the end of
every list so steps, plies and BOM lines can be added at the bench. The app
fills in what it knows and leaves the rest writable.

- **Print** on any work order opens a preview of the exact sheet, with a B&W
  proof toggle. ⌘P on a work order gives the same document.
- **Print blank traveler** on the work-order list produces empty forms for a
  chosen process, with the standard step list already printed — a stack to take
  to RFS.
- Built by `03 Work Orders/app/print.js` + `print.css`. The sheet styles are
  deliberately not scoped to `@media print`, so `tools/print-preview.html`
  renders exactly what comes out of the printer. Serve it over HTTP:
  `python3 -m http.server 8777` from this folder, then open
  `http://localhost:8777/tools/print-preview.html`.
- Designed for a **black-and-white laser**. Colour is enhancement only; nothing
  depends on it.

The git root is `SN6 Resources/` rather than the app folder because the `tools/`
scripts resolve their paths relative to it — see the comments in `.gitignore`.
Note that `firebase deploy` still runs from inside `03 Work Orders/`.

## What's here

| Folder | Contents | Start with |
|---|---|---|
| `00 Agent/` | The "simon" reviewer-agent definition (archival copy; live copy at `composites_programs/.claude/agents/simon.md`) | — |
| `01 Pain Points and Improvements/` | The SN5 season review: what went well, 10 major problems with root-cause analyses (5-why / fishbone), minor-issues table, traceability to fixes | the .docx |
| `02 CS Standards/` | 14 numbered composites standards (CS-000–CS-013) with revision tracking, approvals, changelogs, photo placeholders. Markdown in `src/` is the source of truth; .docx are built outputs | `CS-INDEX` |
| `03 Work Orders/` | The composites app. `app/` — hosted multi-user version, **live at feb-composites.web.app**: a six-tab workspace (Dashboard, Work Orders, Parts, Projects, Timeline, Budget) on email/password accounts + roster allowlist + a live shared Firestore DB (Firebase free tier; deploy guide in `app/README.md`). `work-orders.html` is the original zero-install single-file work-order tool, kept as the offline backup/archive viewer. Retro SN5 archives (26 work orders, 33 parts, timeline) seed it | `app/README.md` |
| `04 Datasheets/` | 25 manufacturer TDS/SDS PDFs for the products we actually use (per purchase history — not the stale inventory sheet) + index | `INDEX.md` |
| `05 Printables/` | Shop reference sheets (`printables.html` — print it, one sheet per page): resin ratio/cure table, infusion + wet-layup flowcharts, vacuum numbers, mold-prep card, ShopSabre checklist, PPE, process blockers | print it |
| `tools/` | `build_docx.py` (md→docx builder; venv at `tools/.venv`), `build_docx.sh` (pandoc fallback), `gen_retro_wos.py` (retro-WO generator), `check_traceability.py` (link audit) | — |

## How the pieces connect

**Problem → root cause → fix → where the fix lives:**

| PP | Problem (SN5) | Owning fix |
|---|---|---|
| PP-01 | Duratec mold sealing | CS-004 (XCR is the standard; Duratec story kept as the why) |
| PP-02 | Customs delay blocked infusions | CS-011 min-stock math + CS-012 order calendar |
| PP-03 | Clamshell mold CAD error → lost machine week | CS-003 §7.2 design review, enforced as a WO blocker step |
| PP-04 | Dashboard remade 3+× | CS-002 frozen spec + WO cross-team sign-off |
| PP-05 | Catch-can grounding drift (6 months) | CS-010 decision point + criterion-before-work as a WO blocker |
| PP-06 | Machine-slot scramble / Jacobs crackdown | CS-005 ShopSabre reservation discipline + WO time estimates |
| PP-07 | UT stack undefined 3 weeks pre-layup | CS-002 "stack frozen before mold machining" blocker |
| PP-08 | Purchasing bottlenecked on the lead | CS-012 documented flow + distributed purchasers |
| PP-09 | Tribal knowledge, zero versioned docs | CS-000 (versioned docs) + the WO system itself |
| PP-10 | Storage conflicts, lost molds | CS-011 storage map + CS-001 labels + live WO mold.location |

`python3 tools/check_traceability.py` verifies every link above still resolves — run it whenever you restructure things.

## Ground rules baked in everywhere

- **Current practice, not SN5 archaeology.** XCR is the mold sealer (Duratec is history); the RFS ShopSabre (5×10 bed, vacuum hold-down, auto tool changer, own reservation system) is the machining path; the Master Tracker inventory sheet is stale — purchase history and #purchasing are ground truth for what we use.
- **Every number has a source.** Anything quantitative in a standard cites a TDS/SDS in `04 Datasheets/` or a recorded team measurement. We caught two web-search "facts" being flat wrong during this build (XCR mix ratio, IN2 pot life) by reading the actual PDFs — that's the whole argument for keeping the datasheet folder.
- **Retro honesty.** The 26 SN5 work orders back-fill only what the record supports; everything else says "not recorded (retro)". No made-up buy-offs, no invented measurements.
- **Nothing is "Released" until it's signed.** Every standard ships as "Draft — pending Lead signature"; the approval tables are ready for a pen.
- **Four standards are Outlined, not fully Drafted:** CS-001 (labeling), CS-007 (wet layup), CS-008 (resin table), CS-009 (trim/sand) — all sections there and every number TDS-verified, but procedure depth is stubbed. Finish them before leaning on them hard; CS-INDEX's depth column is the authority.

## First week (suggested)

1. Open `03 Work Orders/work-orders.html`, hit **Load SN5 archive**, and look at WO-SN5-022 (clamshell) and WO-SN5-026 (catch can) — the two case studies.
2. Read the pain-points .docx (~30 min).
3. Skim CS-INDEX, then read the two standards you'll hit first (probably CS-004 and CS-005).
4. Sign what you agree with (Status → Released, per CS-000 §7.1); revise what you don't — that's the system working, not a problem. If you clicked around the app, **Export JSON before closing the tab** — browser storage is a cache, not a record.
5. Upload `01`/`02`/`04`/`05` to the team Drive; keep `work-orders.html` somewhere everyone can open it.

## Open items (need a human)

- **The app is deployed and live** at feb-composites.web.app (Firebase project `feb-composites`). Move the project to a team Google account, or add Nick as an owner, so it survives handoff (Firebase console → Project settings → Users and permissions). Setup/deploy runbook: `03 Work Orders/app/README.md`.
- Confirm the ShopSabre's exact model/options on the machine placard and sanity-check the specs in CS-005 §5 against it.
- Field-verify the CS-011 storage map locations at RFS.
- Sign the approval tables.

## Maintenance

Edit the markdown in `src/`, then rebuild: `tools/.venv/bin/python tools/build_docx.py --all` (fallback: `tools/build_docx.sh`). Regenerate retro WOs only if the source data was wrong: `tools/.venv/bin/python tools/gen_retro_wos.py` — it rewrites both `data/sn5-work-orders.json` and the seed embedded in `work-orders.html` (safe to re-run).
