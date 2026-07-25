# SN5 Pain Points & Improvements

| | |
|---|---|
| **Doc ID** | FEB-COMP-PP-001 |
| **Title** | SN5 Composites Season Review: Pain Points, Root Causes & Improvements |
| **Revision** | A |
| **Effective date** | 2026-07-12 |
| **Prepared by** | Simon Starbuck (drafted w/ Claude from the SN5 Drive + full #composites/#purchasing Slack history) |
| **Reviewed by** | simon (reviewer agent) — G1 review round |
| **Approved by** | _________________ (SN6 Composites Lead) |

**Revision history**

| Rev | Date | Author | Description |
|---|---|---|---|
| A | 2026-07-12 | Claude | Initial issue from SN5 season research |

---

## 1. Purpose and scope

This is the SN5 season review from a **scheduling, project-management, and time-management** angle — what went well, what went wrong, and why. Every major problem gets a root-cause analysis (5-why or fishbone) and a **fix with a named owner**. Where the fix IS one of the other SN6 Resources deliverables (a CS standard or a work-order feature), that link is spelled out. The whole point: SN6 shouldn't have to re-learn these lessons the expensive way.

Evidence base: the SN5 Composites Drive snapshot (docs, Master Tracker, meeting notes) and the complete #composites and #purchasing Slack history. Citations use the form *(#channel, YYYY-MM-DD)* for Slack and *(doc name, date)* for Drive documents so any claim can be spot-checked. Where current practice has already moved on (e.g., XCR coating resin, the ShopSabre reservation system), the problem is kept as a case study and the improvement documents the now-standard solution so it survives leadership turnover.

**Interim note on work-order-system dependencies.** Seven improvements below reference the work-order (WO) system (deliverable 3). Until it is adopted, each of those PPs lists a manual interim mitigation — a paper/spreadsheet version of the same blocker — so the fixes don't wait on software adoption. The schedule-killers (PP-03 mold review, PP-07 stack freeze) work fine as a printed checklist and a line in the weekly summary.

## 2. What went well (keep doing this)

- **The weekly operating rhythm worked.** Monday meeting → weekly summary tagging the subteam with per-day RFS assignments (named people, named tasks, times) → per-day threads for status, photos, and blockers. Accountability came from visibility, not nagging. This rhythm produced a car that passed mech tech and scored high in design; the aero judge specifically praised the manufacturing focus (post-comp recap, #composites, 2026-06-21).
- **Mold Engineer / Manufacturing Engineer (ME/RE) ownership.** Introduced in the 12/19 winter master plan; every part had a named mold owner and layup owner. Ambiguity about "whose part is this" mostly disappeared.
- **The Master Tracker gave real high-level visibility** — part status, layup type, stack shorthand, deadlines, weights vs targets. (Its gaps at the *per-part work* level are PP-09 and the reason for the work-order system.)
- **The 2-molds + 2-infusions per week timeline grid** was an honest capacity model, and the "mold lifetime = 2 weeks" cadence held for most of the season.
- **Sponsor pipeline** (Airtech, Sigmatex, Dragonplate, ACP, Coastal Enterprises) meaningfully offset the dominant material costs; ACP's Nomex donation and Coastal's tooling board mattered.
- **R&D before production.** Test mold, dogbone/Instron campaigns, hotwire and forged-CF projects, and grounding trials ran in fall *before* parts season — several (XCR-adjacent sealing work, grounding method) paid off directly, ending in a diffuser validated at <1 Ω continuous everywhere.
- **1:1s each semester** kept members engaged and surfaced availability honestly.

## 3. Major pain points with root-cause analysis

### PP-01 — Mold sealing with Duratec (SOLVED — now XCR; keep the lesson)

**Problem.** Duratec was the SN4/early-SN5 primary mold sealer: expensive, pooled in crevices and hid etch/scribe marks, required high-grit sanding, and was easy to sand straight through — forcing re-coats that burned days of mold time per incident. Documented in *SN4 Mold Manufacturing Problems and Solutions* (2025-10-12), both 10/8/25 meeting-notes docs, and *SN5 Mold Sealer Alternatives* (2025-10-19).

**Root cause (5-why).**
1. Why did molds lose days to sealing? → Duratec re-coats after sand-through, and pooled sealer obscuring datums.
2. Why sand-through? → Duratec demands high-grit sanding to finish, on soft tooling board where thickness control is hard for students.
3. Why was a sanding-critical sealer chosen? → It was inherited practice from prior seasons; nobody owned a materials-selection decision.
4. Why did nobody own it? → No process standard existed for mold sealing; product choice lived in tribal memory.
5. Root cause: **no documented, owned materials-selection standard for mold surface prep.**

**Improvement (implemented).** We now standardize on **XCR coating resin (Easy Composites)**: paint it on, no post-sanding, better surface finish and geometric accuracy. → **CS-004 Mold Sealing, Release & Surface Prep** captures XCR as the standard, with TDS/SDS references, application procedure, and the Duratec history as the "why" — so the reasoning survives turnover instead of the cycle restarting.

### PP-02 — Supply-chain single point of failure: the customs delay

**Problem.** The ~109 lb Easy Composites order placed in early October 2025 sat in customs for weeks with **no ETA**, blocking AI-plate infusions and the early layup calendar. Rush replacements elsewhere cost real money (ACP rods later in the season: $120 of parts, ~$400 expedited shipping).

**Root cause (5-why).**
1. Why did layups stall? → Consumables/resin hadn't arrived.
2. Why was there no buffer stock? → Orders were placed when stock ran out, not at reorder points.
3. Why no reorder points? → The Inventory sheet was a season-start snapshot with a "Running Low" flag nobody actioned (MEKP sat flagged "REORDER").
4. Why was inventory not maintained? → No owner, no cadence, and the sheet lived apart from the purchasing workflow.
5. Root cause: **no minimum-stock / lead-time-aware purchasing process; a UK supplier with multi-week + customs lead time treated like a next-day vendor.**

**Improvement.** → **CS-011 Inventory, Storage & Transport** (min-stock triggers on the ~15 items that block layups; a monthly 15-minute stock walk with an owner) and → **CS-012 Purchasing & Reimbursement** (lead-time table per supplier — Easy Composites ordered ≥6 weeks before need with customs margin; second-source list; order calendar tied to the build timeline).

### PP-03 — Clamshell mold CAD error: a week of machine slots lost

**Problem.** February 2026: the clamshell mold CAD had a raised middle section that made it (and cascading nosecone work) wrong as machined — molds had to be fixed or re-glued, and Tue–Thu machining slots were cancelled in the tightest machining month. Nosecone section 5 also needed remachining.

**Root cause (5-why).**
1. Why was a wrong mold machined? → The CAD error wasn't caught before CAM and machining.
2. Why not caught? → No second set of eyes was required between "mold CAD done" and "glue stock / machine".
3. Why no review step? → The tracker recorded *status* ("Mold CAD/CAM Done") but nothing *blocking* — nothing forced a check before committing board and machine time.
4. Why nothing blocking? → Part progress was tracked at milestone level, not step level with sign-offs.
5. Root cause: **no design-review buy-off between mold CAD and cutting foam.**

**Improvement.** → **Work-order system**: every WO carries a mandatory "Mold design review" step with a named buy-off (someone other than the mold's author) before stock is glued; → **CS-003 Mold Design & Manufacturing** provides the 10-minute review checklist (datums, flanges, scribe lines, max-Z, overhangs, section splits, machining time estimate). This dovetails with existing ShopSabre practice: Larry already reviews all CAM before it runs (#composites, spring 2026) — our check goes one step upstream, at CAD. *Interim:* the CS-003 checklist printed at RFS; "mold design reviewed by ___" required in the weekly summary thread before a machining slot is booked.

### PP-04 — Dashboard remade 3+ times

**Problem.** The dashboard was laid up, then remade repeatedly across the spring (remakes discussed in #composites on 2026-01-28 and ~2026-03-25; "can we plan on doing another dash sorry 💔 same thickness (1/8")" — Theo, #composites, 2026-04-07; the final remake slipped past reveal) — mostly thickness/DXF churn between composites and Bergo/dash stakeholders.

**Root cause (fishbone).**

| Category | Causes |
|---|---|
| Method | No frozen spec (thickness, DXF rev) signed by both subteams before layup; flat-panel layups felt "cheap" so remakes were tolerated |
| Communication | Requirements arrived via Slack messages to whoever was around; no single requirements record |
| Measurement | No acceptance check against a written spec at part completion — "wrong" discovered at fit-up |
| People | Requester and manufacturer in different subteams with no shared artifact to point at |

Dominant cause: **no interface freeze + acceptance criteria per part.**

**Improvement.** → **Work-order system**: the WO *is* the shared artifact — requirements (thickness, DXF revision, mass target) recorded at creation, `qualityChecks` filled at completion, cross-subteam sign-off on release; → **CS-002 Layup Schedule Specification & Recording** requires the stack + laminate thickness to be written and frozen before cutting cloth. A remake then requires a new WO revision — visible, counted, and priced (a flat panel is still a day of two people + materials). *Interim:* one pinned Slack message per cross-team part stating thickness/DXF rev/mass target, thumbs-up from both leads before layup.

### PP-05 — Catch-can grounding: six months without acceptance criteria

**Problem.** From November 2025 to May 2026, powertrain + composites iterated on grounding a CF-wrapped aluminum catch can. Measurements bounced (40 Ω measured vs <5 Ω needed — #composites, 2026-05-25), methods were improvised ("does it need to be 5 Ω uniformly at every point… How is the measurement done?" — asked in *May*, six months in), and cans punctured during sanding (#composites thread, 2026-05-27). **The actual resolution was a design pivot: the team abandoned CF-wrapping the can entirely and switched to epoxy + copper conductive paths** — a materials/geometry decision, not a procedure tweak. Meanwhile the diffuser grounding — where the method and target were defined up front — validated at <1 Ω continuous (#composites, 2026-06-21) and became a comp highlight.

**Root cause (5-why).**
1. Why did it drag Nov→May? → Each iteration failed a target that kept shifting.
2. Why did the target shift? → Acceptance criteria (Ω threshold, measurement method, probe points) were never written down at the start.
3. Why not written down? → The work never had a container — it lived across Slack threads between two subteams; no WO, no owner of "done".
4. Why no container? → Small/odd jobs bypassed the tracker, which only listed major parts.
5. Root cause: **work items without a written definition-of-done and a home for measurements.**

**Improvement.** → **CS-010 CF Grounding & Electrical Bonding** encodes the validated diffuser method (copper mesh in the stack, measurement procedure, ≤5 Ω criterion and probe pattern) as the standard **and opens with a decision point: is CF-wrapping the right conductive path for this geometry at all?** (Thin-walled/tapered metal substrates → epoxy + copper paths, the catch-can lesson — CF grounding is not a universal hammer.) → **Work-order system**: *every* job, including small cross-team ones, gets a WO with `qualityChecks` (criterion / target / actual / pass) defined at creation — the timeline field makes six months of drift visible in one glance. *Interim:* any grounding job gets its Ω target, probe pattern, and measurement method written in the kickoff Slack message before work starts.

### PP-06 — Machine time: the daily scramble (superseded by ShopSabre — keep the discipline)

**Problem.** Machining ran on the Jacobs Shopbot's daily reservation scramble (ShopbotBot morning pings, 3-slot caps, trading slots with other teams), until 2/23/26 when Jacobs staff pulled members aside for block-reserving — a real relationship risk — right in the bodywork machining crunch. Cross-team contention (accumulator plates, Formula Slug) squeezed slots further.

**Root cause (fishbone).**

| Category | Causes |
|---|---|
| Machine access | Shared campus machine with per-person daily slots; composites demand is bursty (mold weeks need many consecutive hours) |
| Method | Reservation tactics (block-booking via multiple members) instead of capacity planning; machining demand not forecast from the timeline |
| Planning | Mold CAM completion and machine booking not linked — CAM done ≠ slot booked |
| External | Other teams' legitimate demand; Jacobs policy limits |

Dominant cause: **bursty demand pushed through a per-person slot system with no forward capacity plan.**

**Improvement (partially implemented).** We now have a **reservation system for the RFS ShopSabre (booked via the RFS/RSO website, training + hands-on sign-off required, Larry reviews all CAM) and is moving toward using only that machine** — composites largely controls its own queue. The remaining risks: one machine, one queue, same bursty demand — plus known booking-system bugs (multi-day and short-block reservations failing, reported to Joey, #composites, 2026-03). → **CS-005 CNC Machining of Tooling Board** documents the reservation process, the certified-operator list, and books machine time *when mold CAM starts, not when it finishes*, using per-mold time estimates (the UT CAM list showed 0:17–6:16 per mold — #composites, 2026-04-23 — estimable); → **Work-order system** carries machining-time estimates and scheduled dates per mold so the weekly meeting sees next week's machine load before it's a crisis. *Interim:* a "machine hours needed next 2 weeks" line in every weekly summary.

### PP-07 — The undertray crunch: stack undefined three weeks before layup

**Problem.** The undertray — the biggest composites assembly of the season — had its layup stack still undefined on 4/14 ("UT Layup Stack for strength + grounding… Can we try to have idea by Saturday?" — weekly summary, #composites, 2026-04-14) with layups starting the same month, compressing UT manufacturing into late April–May against reveal (planned 4/4 on the Timeline sheet; actual 4/16), mech tech (5/5), and comp. The final push needed the lead camping at RFS for a week (#composites, 2026-05-13).

**Root cause (5-why).**
1. Why was UT compressed into the deadline window? → Molds/layups couldn't start until design decisions (stack, grounding scheme) landed late.
2. Why did the stack land late? → It depended on materials-testing results and grounding R&D that had no deadline tied to the manufacturing timeline.
3. Why no linkage? → The timeline tracked *manufacturing* weeks; upstream engineering decisions had no dates in it.
4. Why? → No "stack frozen" deadline existed as a scheduled prerequisite for mold/layup work.
5. Root cause: **engineering-decision deadlines weren't scheduled as prerequisites of manufacturing tasks.**

**Improvement.** → **CS-002** defines a hard blocker: **stack frozen before mold machining starts** (not before layup — mold geometry can depend on stack thickness); → **Work-order system**: WOs encode prerequisite steps ("Stack frozen", "Design review buy-off") that block downstream steps, so the weekly meeting sees "UT blocked on stack decision, due W-6" in February, not April. *Interim:* the season timeline gets one extra column — "stack freeze date" per part — reviewed at the Monday meeting like any other deadline.

### PP-08 — Purchasing and reimbursement bottlenecked on one person

**Problem.** Nearly the entire ~$5.3k budget flowed through the lead's personal card (Budget sheet: purchaser ≈ Simon for ~all rows), with slow reimbursements ("5301 outstanding" at one point) and hard end-of-year chase deadlines. Rush shipping blowouts (ACP: $400 shipping on a $120 part) happened when needs surfaced late.

**Root cause (5-why).**
1. Why did one person front $5k? → Orders were placed by whoever felt responsible — the lead — as needs surfaced.
2. Why did needs surface late? → Purchasing wasn't scheduled from the build timeline (see PP-02) and members didn't know the request path.
3. Why didn't members order? → The approval flow (#purchasing, >$50 approval, reimbursement steps) was tribal knowledge; fronting money is scary for students.
4. Why tribal? → No written purchasing procedure existed for the subteam.
5. Root cause: **undocumented purchasing process defaulting all financial risk and labor onto the lead.**

**Improvement.** → **CS-012 Purchasing & Reimbursement**: the request path (who can request, who approves at what threshold, how reimbursement works and how long it takes), an **order calendar** derived from the season timeline (bulk consumables in September, big Easy Composites order ≥6 weeks pre-need), and a distributed-purchaser norm (2–3 authorized purchasers so no single card is the team's float).

### PP-09 — Tribal knowledge: no versioned records of what was actually built

**Problem.** "What layup stack was used for seat last year and what problems arose?" — asked in March, answerable only by whoever remembered. No SN5 document carried a version number, changelog, or approver. The tracker's stack shorthand ("6X 195 + CORE") captured intent, not what was actually laid; step-level history (who did what, what went wrong, what was measured) lived in Slack threads that are effectively write-only memory. This is the meta-pain behind PP-03/04/05.

**Root cause (fishbone).**

| Category | Causes |
|---|---|
| Method | Docs written ad hoc per project; no template, no revision control, no approver; two quality tiers (formal deliverables vs empty stubs) |
| Tools | Tracker tracks parts at milestone level; Slack captures events but is unsearchable-by-part; photos scattered in threads |
| People | Annual turnover guarantees memory loss; writing docs isn't anyone's job |
| Incentives | During crunch, documentation always loses to manufacturing |

Dominant cause: **no system where recording work is a byproduct of doing work, and no standard for the documents that do get written.**

**Improvement.** This is what deliverables 2 and 3 *are*: → **CS-000 Documentation Standards** (template with revision table, approvers, doc IDs) makes every future doc versioned by construction; → **Work-order system** makes the per-part record (stack as laid, steps, buy-offs, measurements, photos, incidents) a byproduct of running the job — the SN6 answer to "what stack did the seat use" is `WO-SN5-007`, printed or on screen in ten seconds. *Interim:* the printable WO template alone (one sheet per part, filled by pen at RFS, photographed into the part's Drive folder) delivers most of the value with zero software adoption.

### PP-10 — Storage and transport friction

**Problem.** Composites parts stored in the etch locker got an eviction notice ("please refrain… keep them in Jacobs basement. Would you be able to get them moved by tonight?" — Ansh, #composites, 2026-04-20); molds stacked in front of the knaack and screw boxes blocked other subteams for weeks ("its been really difficult to get access" — Evan, #composites, 2026-05-24); mold transport RFS↔Jacobs was flagged in SN4 lessons (*SN4 Problems*, 2025-10-12) and never solved; chemicals ended up in a food fridge (#composites, 2026-02-17).

**Root cause (5-why).**
1. Why did parts/molds end up in the wrong places? → No designated home per item class, so things landed wherever the last trip ended.
2. Why no designated homes? → Storage locations (RFS container, knaack, Jacobs basement, chemical boxes) were never mapped to item classes in writing.
3. Why not written? → Storage was nobody's owned domain; it only became visible when another team complained.
4. Why reactive? → No location field maintained per mold/part after the tracker's initial fill.
5. Root cause: **no storage map with owners, and no live location tracking for heavy/shared-space items.**

**Improvement.** → **CS-011** includes the storage map (item class → home, incl. chemical segregation rules) and the transport reality (what fits in whose car; when to book a truck — the Budget sheet shows a $158.01 U-Haul rental was already needed in SN5); → **CS-001 Labeling** so every mold/part carries its ID and home location on the object itself; → **Work-order system**: `mold.location` is a live field updated at each move, so "where is the seat mold" is a lookup, not a Slack ask. *Interim:* a taped label on every mold (part, owner, home) costs nothing and starts now.

## 4. Minor issues (procedure-level fixes, no full RCA)

| Issue | Evidence | Resolved by |
|---|---|---|
| Z-zeroing failures ("plunged into the part") | Feb 2026 incidents | CS-005 §7.4: zero once per job from the top of the stock; the ShopSabre's ATC auto-measures tool lengths (verify tool table matches the rack; re-measure manually swapped bits); split deep toolpaths |
| Infusion air leaks near end of pull ("hopefully it will turn out okay") | 2/14, 5/1 layups | CS-006: leak-down (drop) test with a numeric pass threshold before resin mix |
| Vacuum-bag bridging / no pleats on complex curvature | Infusion guide + failed layups | CS-006/CS-007: pleat placement step with photo placeholder |
| Foam fragility, thin mold sections snapping | Mold Design doc | CS-003: minimum section thickness rule + support strategy |
| 3D-printed FCF molds deform ≥50 psi; clamp force relaxes | Forged CF doc | CS-003 appendix: printed-mold pressure limits, through-bolt + backup-plate practice |
| FCF resin starvation → brittle part (failed bend test) | Forged CF doc | CS-008: fiber/resin ratio table incl. forged CF mix math |
| Sanding punctures thin laminates (catch cans) | 5/27 thread | CS-009: minimum-thickness awareness + inspection during trim/sand |
| Mold cleanliness (never acetone, never fibrous cloth) | SN4 doc | CS-004: 2-step clean regimen (compressed air → IPA microfiber) |
| Board gluing resin-intensive | SN4 doc | CS-003: Ure-Bond 90 / dowel method with TDS reference |

## 5. Traceability

| PP | Root cause (one line) | Improvement | Owner deliverable |
|---|---|---|---|
| PP-01 | No owned materials-selection standard for sealing | XCR as documented standard w/ rationale | CS-004 |
| PP-02 | No lead-time-aware purchasing / min-stock | Reorder triggers + supplier lead-time table | CS-011, CS-012 |
| PP-03 | Nothing between mold CAD and cutting foam | Design-review buy-off step | WO system + CS-003 |
| PP-04 | No frozen spec / acceptance criteria per part | WO as shared artifact w/ qualityChecks | WO system + CS-002 |
| PP-05 | No definition-of-done for odd jobs (+ wrong material path held too long) | Grounding standard w/ CF-vs-alternative decision point; qualityChecks at WO creation | CS-010 + WO system |
| PP-06 | Bursty demand, no forward capacity plan | ShopSabre reservation discipline + booking at CAM start | CS-005 + WO system |
| PP-07 | Engineering decisions unscheduled as prerequisites | "Stack frozen before mold machining" blocker | CS-002 + WO system |
| PP-08 | Undocumented purchasing → lead is the bank | Written flow + order calendar + multiple purchasers | CS-012 |
| PP-09 | Recording work isn't a byproduct of work | Versioned doc system + per-part work orders | CS-000 + WO system |
| PP-10 | No storage map or live locations | Storage map + live mold.location field | CS-011 + WO system |

## 6. Appendix — Scenario replays (effectiveness test results)

Each SN5 incident replayed step-by-step against the finished system (2026-07-12). CAUGHT = the incident could not have occurred as it did; MITIGATED = it could still occur, but smaller/visible/recoverable; MISSED = the system does not address it.

| Scenario | Replay against the new system | Result |
|---|---|---|
| Clamshell CAD error (Feb 2026) | The WO's "Mold design review" blocker step holds up gluing and slot-booking until a non-author walks the CS-003 §7.2 checklist. Item 1 — overlay mold CAD on the current part CAD — is precisely the check that exposes a raised middle section, in a 10-minute review instead of a lost machining week. The app blocks downstream buy-offs until it's signed, and the row is shaded on printed copies. | **CAUGHT** |
| Catch-can grounding drift (Nov 2025→May 2026) | CS-010 §7.1 forces two decisions at WO creation, before any layup: (1) the geometry test — a thin-walled tapered metal can is the named "bad fit" case, routing the job to epoxy + copper paths on day one instead of month six; (2) the acceptance criterion (Ω, probe pattern, method) written down. The May questions ("uniform at every point? how is it measured?") are answered before work starts, and the WO timeline makes any drift visible at the Monday board. | **CAUGHT** |
| Easy Composites customs delay (Oct 2025) | CS-012 §7.4 places the fall EC order in September with ≥6-week margin; CS-011's min-stock alarm (opened kit + 1 unopened) trips a reorder while ~a peak-week of resin remains. A comparable customs hold (~4 weeks) is absorbed by margin + buffer. A pathological hold (>6 weeks, "no ETA") could still bite — the residual backstop is CS-012's second-source note, which is only an outline item today. | **MITIGATED** |
| Dashboard remake #2 (Mar–Apr 2026) | CS-002 §7.2 requires the requesting subteam's lead to co-sign the frozen spec (thickness, DXF rev, mass) on the WO; a change after freeze is a visible WO revision. Remake #1 (a genuine design change) can still happen — the system prices it, not prevents it. Remakes #2–3, driven by the spec living in nobody's head, lose their cause: there is one signed artifact both teams point at, and each remake is counted where the Monday meeting sees it. | **MITIGATED** |

Adjudication note: the simon reviewer agent independently adjudicated all four replays at the G4 review (2026-07-12), verifying each against the cited standards' actual text, and **agreed with all four verdicts** (clamshell CAUGHT, catch-can CAUGHT, customs MITIGATED, dashboard MITIGATED).
