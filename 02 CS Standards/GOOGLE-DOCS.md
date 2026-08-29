# The standards on Google Docs

As of 2026-08-29 the CS standards live as Google Docs in Simon's Drive, in a
folder at his My Drive root, and **that is where the team edits them from now
on** (his call, this date). Uploaded from the Rev-current markdown via Drive's
markdown import; figures are embedded in each Doc (Drive fetched them from the
live app host at import time), so the Docs are self-contained.

Folder: **CS Standards** — https://drive.google.com/drive/folders/1tkD4LdUlk4jq5bMKYQegSa1wYk52CcfL

| Doc | Rev at upload | Google Doc ID |
|---|---|---|
| CS-000 Documentation Standards, Template & Revision Process | C | `16g5b2bcmUCexiGwLyuJv8TEOzykkgBPUBCD9giBzp2I` |
| CS-001 Part, Mold & Material Labeling | F | `12uwnWFodClF54yFZiQGgdK6F6bTLR1oe4ltuz9SP_bs` |
| CS-002 Layup Schedule Specification & Recording | E | `1t5EDifUg5PAIQMeR-CzS9tNYfM1IbwljpZNwJm8W7Rk` |
| CS-003 Mold Design & Manufacturing | D | `1FELIY-aslzxwLrPD6pOb9rO8qLLsJRApfONW1Ui78cg` |
| CS-004 Mold Sealing, Release & Surface Prep | D | `1RYhnOSXdk2_-WAXyBwTbYOFyX31v6gCp1GLDWsHBHas` |
| CS-005 CNC Machining of Tooling Board (ShopSabre) | E | `1kNS7fH0AD9whatG-EU-FeMoaBtn_rZXAOsvLtjIVqvg` |
| CS-006 Resin Infusion | C | `1NtSU5CwJldi0EliTt_xNMR2lxpSZIiA7oOvjBZ_Cg2g` |
| CS-007 Wet Layup & Vacuum Bagging | C | `1hgShdFtwsymUSJan8t0CsctQyrwpb-yeKY9QI2NflNU` |
| CS-008 Resins, Mixing & Cure Schedules | D | `106nqf71qjTlfP0i_OxVPWJB9wGgha-zdph7pFgGLk6o` |
| CS-009 Trimming, Sanding & Finishing | C | `1UJauiuBFoOnOXSuT6kLlFBtyrFfB6ag03pCXgjAfPBw` |
| CS-010 CF Grounding & Electrical Bonding | C | `1lSWJ1pglxJ3jd5s9wi__YNuYmLWmoyx3nSwoJIzCePY` |
| CS-011 Inventory, Storage & Transport | D | `1eaeARRmKyrUNzX2t6wy74rgYMZLp5UnxNsF06Mw1EOw` |
| CS-012 Purchasing & Reimbursement | F | `15tG_DB032LMWDuAETWABhMbsZzgF4pUJxzAeDhgOg-M` |
| CS-013 Work Orders & Part Traceability | F | `1ldS32TSC_wRVzUND2Hplfg3P1ddBprFRkgXEkQ46qcQ` |
| CS-INDEX — Composites Standards Master List | G | `1EfvSzxUHV6Rxpg2g9K5mP4-qUioCvh8pnKKktl7qn8o` |
| CS-Template | — | `1cyg5az-SOovY0j8PCEbCBbVxhzWHEdK8B8uvfiJPldw` |

## What this changes

The Docs are the **editing surface**. The markdown in `src/` is still what
builds everything the app serves: the in-app PDFs, the QR-linked copies under
`docs/standards/`, the .docx files, and what `check_traceability.py` audits.
So after edits land in a Doc, a session syncs them back: read the Doc (Drive
connector, IDs above), apply the change to `src/*.md` with a revision bump per
CS-000 §7.2, rebuild (`build_docx.py --all`, `gen_docs_manifest.py`), and push.
Until a sync happens, the Doc is ahead of the app copies, which is fine for
prose and wrong for numbers; sync promptly when a number changes.

Figures are embedded pixels in the Docs, not live links. When a figure's SVG
is re-rendered, re-import the affected standard (or swap the image in the Doc
by hand) or the Doc keeps the old drawing.
