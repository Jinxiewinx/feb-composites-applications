# CS-INDEX — Composites Standards Master List

| | |
|---|---|
| **Doc ID** | CS-INDEX |
| **Revision** | F |
| **Effective date** | 2026-08-28 |
| **Maintained by** | Composites Lead (update at the moment any standard changes status, CS-000 §7) |

Depth key: **Drafted** means full procedure, follow it as written (pending approver signature). **Outlined** means all sections present, procedure steps stubbed; complete before first use in anger.

| Doc ID | Title | Rev | Status | Depth | Motivating pain point(s) |
|---|---|---|---|---|---|
| CS-000 | Documentation Standards, Template & Revision Process | C | Draft, pending signature | Drafted | PP-09 |
| CS-001 | Part, Mold & Material Labeling | E | Draft, pending signature | Drafted | PP-09, PP-10 |
| CS-002 | Layup Schedule Specification & Recording | D | Draft, pending signature | Drafted | PP-04, PP-07 |
| CS-003 | Mold Design & Manufacturing | D | Draft, pending signature | Drafted | PP-03; SN4 lessons |
| CS-004 | Mold Sealing, Release & Surface Prep | D | Draft, pending signature | Drafted | PP-01 |
| CS-005 | CNC Machining of Tooling Board (ShopSabre) | E | Draft, pending signature | Drafted | PP-06; Z-plunge incidents |
| CS-006 | Resin Infusion | C | Draft, pending signature | Drafted | Leak-risk minors; G0 review findings |
| CS-007 | Wet Layup & Vacuum Bagging | C | Draft, pending signature | Drafted (photos at first SN6 use) | Clamp/bagging minors |
| CS-008 | Resins, Mixing & Cure Schedules | D | Draft, pending signature | Drafted | FCF resin starvation; exotherm safety; cure holds |
| CS-009 | Trimming, Sanding & Finishing of Cured Composites | C | Draft, pending signature | Drafted (photos at first SN6 use) | Catch-can puncture; PPE |
| CS-010 | CF Grounding & Electrical Bonding | C | Draft, pending signature | Drafted | PP-05 |
| CS-011 | Inventory, Storage & Transport | D | Draft, pending signature | Drafted (storage-map locations to field-verify) | PP-02, PP-10 |
| CS-012 | Purchasing & Reimbursement (Composites) | D | Draft, pending signature | Drafted (re-verify tiers/names each fall) | PP-02, PP-08 |
| CS-013 | Work Orders & Part Traceability | E | Draft, pending signature | Drafted | PP-09; bridges to the WO system |

Notes: every standard flips to Released only when the SN6 Composites Lead signs its approval table (CS-000 §7.1); the doc header and this index change together. Next free number: **CS-014**. 2026-07-28: every doc above got a language pass (fewer em dashes, less decorative bold) plus targeted accuracy fixes, most substantively CS-013 (now describes the live Firebase app, not the retired offline `work-orders.html`), CS-005 (a dated web cross-check + a sharpened certified-operator caveat), and CS-011 (a note tying it to the app's Stock tab). 2026-08-01: CS-008 → Rev C, adding the FEB hold column to the resin table and §5.1 explaining it; the work-order app now blocks a demould step until that hold elapses, and the standard had been stating only the datasheet figures. 2026-08-27: CS-013 and CS-001 → Rev D together, for the R&D build — a part that is real carbon on a real deadline but is not a season deliverable. CS-013 §4 defines it and §7.1 says when to mark it; CS-001 §4 and §7.6 place the mark on the label's ID line and state outright that it is **not** a class word, so the class-word list is unchanged and TEST PANEL keeps its single meaning. An R&D record enforces exactly like any other — it is the opposite of a retro record in that respect — and the ID never carries the distinction, so a build can be moved into the season without a relabel. 2026-08-28: every standard took an engineering pass at Simon's request, and the series gained drawn figures. CS-000 Rev C defines the normative verbs (shall/should/may) the whole series now reads by and records where figures live (`src/figures/`, SVG source, PNG rendered by `tools/render_figures.mjs`). Twelve standards carry a figure; CS-007 and CS-009 came out of outline into full procedures (their numbers were already in Rev B, only unpacked), and CS-008's §7 dropped a stale "(outline)" label. No process rule changed anywhere: the pass was structure, language and figures, which is why every history row says so.
