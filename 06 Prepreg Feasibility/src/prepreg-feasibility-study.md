# PFS-001 Prepreg Feasibility Study: SN6 Wing Endplates

| | |
|---|---|
| **Doc ID** | PFS-001 |
| **Title** | Prepreg Feasibility Study: SN6 Wing Endplates |
| **Revision** | A |
| **Status** | Draft, pending Lead signature |
| **Effective date** | 2026-07-31 |
| **Supersedes** | Nothing. This is a study, not a standard. It proposes revisiting the SN5-era "no prepreg, no oven" working constraint; it changes no released CS standard until the go/no-go blocker in §14 passes. |

**Approvals**

| Role | Name | Date |
|---|---|---|
| Author | Simon Starbuck (drafted with Claude, SN6 Resources) | 2026-07-31 |
| Reviewer | | |
| Approver (Composites Lead) | | |

**Revision history**

| Rev | Date | Author | Description of change |
|---|---|---|---|
| A | 2026-07-31 | Claude | Initial issue: candidate systems, cocure viability, facilities questions, sponsorship plan, BOM, test timeline, go/no-go criteria |
| B | (planned Dec 2026) | | Record measured panel results and the go/no-go decision |

---

## 1. Purpose

The SN5 endplates were the heaviest simple parts we made. The rear wing endplates (P-SN5-008) weighed **2272 g** as flat glass-infusion panels over 0.25 in Nomex, built 7-ply per WO-SN5-008; the front endplates (WO-SN5-014) were the same process at 5 plies. Flat plates should not weigh this much. This study evaluates prepreg carbon fiber skins, cocured to our donated Nomex core under vacuum bag only and cured in an oven, as the SN6 endplate process. It answers three questions: can we cocure Nomex with prepreg without an autoclave, what resources (freezer, oven) do we need and where do they come from, and what does it cost with and without sponsorship. It ends in a BOM (§11) and a dated test plan with a go/no-go blocker (§12, §14).

## 2. Scope

Flat sandwich panels only: SN6 wing endplates and, if the pilot passes, other flat plates. Curved parts, wing skins, and monocoque work are Outlook (§15) and out of scope. This study deliberately revisits the SN5 handoff constraint "NO pre-preg, NO autoclave, NO cure oven" using the escape clause written into it: "expired donations would be accepted if offered." Nothing in this document authorizes a purchase or a layup; the blockers in §12 do that.

## 3. References

| Ref | Document | Where |
|---|---|---|
| R1 | SN5 endplate records | P-SN5-008 (2272 g), WO-SN5-008, WO-SN5-014 (work-order app) |
| R2 | ACP Composites 5.8 oz carbon RTS prepreg, 2x2 twill 3K | acpcomposites.com/shop/carbon-fiber/carbon-prepregs/5-8-oz-carbon-fiber-2x2-twill-weave-rts-prepreg |
| R3 | ACP expired RTS prepreg (clearance) | acpcomposites.com/shop/carbon-fiber/carbon-prepregs/5-8-oz-carbon-fiber-rts-prepreg-2x2-twill-weave-expired |
| R4 | XPREG XC110 out-of-autoclave prepreg TDS | media.easycomposites.co.uk/datasheets/EC-TDS-XC110-Out-of-Autoclave-Component-Prepreg.pdf |
| R5 | XPREG XC110 Complete Processing Guide | media.easycomposites.eu/datasheets/XPREG XC110 Complete Processing Guide.pdf |
| R6 | XA120 prepreg adhesive film (honeycomb/foam bonding) | easycomposites.us/xa120-prepreg-adhesive-film |
| R7 | Toray TC275-1 / TC275-1E product data sheets (industry OOA benchmark) | toraytac.com data sheets, Thermoset UD tapes and prepregs |
| R8 | Core crush of Nomex honeycomb during cocure with vacuum bag (literature) | researchgate.net/publication/289542225 |
| R9 | Optimal internal honeycomb pressure study, EPFL | sciencedirect.com/science/article/abs/pii/S0266353810000291 |
| R10 | VBO co-bonding of prepreg skins to aramid honeycomb, Parts I and II | sciencedirect.com/science/article/abs/pii/S1359835X14003777 and S1359835X14003819 |
| R11 | Curing prepreg in a domestic oven (Easy Composites article) | easycomposites.co.uk/learning/prepreg-carbon-fibre-in-a-domestic-oven |
| R12 | Oven options for prepreg curing (Explore Composites survey) | explorecomposites.com/articles/tools-and-equipment/oven-options-for-pre-preg-curing/ |
| R13 | ACP Nomex donation and quote | quote Q04397 (#purchasing) |
| R14 | CS-006 (drop test practice), CS-011 (storage rules), CS-012 (purchasing/sponsor asks) | this series |
| R15 | Chemicals-in-food-fridge incident | pain-points list, #composites 2026-02-17 |
| R16 | Stretchlon 800 high-temp bag film pricing | fibreglast.com/products/stretchlon-800-bagging-film-1688; also stocked by ACP |

Datasheet PDFs for R4/R5/R6/R7 belong in `04 Datasheets/` with INDEX rows citing PFS-001. Until each PDF is collected, the URL above is the citation of record.

## 4. Definitions

- **Prepreg** — cloth pre-impregnated with a controlled amount of partially-cured (B-staged) resin. No mixing, no infusion. Consolidates under vacuum and cures with heat.
- **OOA / VBO** — out of autoclave / vacuum bag only. Prepregs designed to cure with atmospheric pressure through a vacuum bag plus oven heat, no autoclave.
- **Out-life** — cumulative time the material can sit at room temperature before it no longer cures to spec. The clock runs every time the roll is out of the freezer.
- **Freezer life** — storage life sealed at -18 °C.
- **RTS** — ACP's "room temperature storage" prepreg line: no freezer required, long out-life (R2).
- **Cocure** — skins and core bonded in the same cure cycle that hardens the skins. **Co-bond**: one cured skin, one wet. **Secondary bond**: both skins pre-cured, then bonded. This study pilots cocure, the fewest-steps option.
- **Core crush** — lateral collapse of honeycomb cells (worst at chamfered edges) during cure, driven by the pressure difference between bag and cell interior (R8).
- **Edge potting** — filling the cut cell edges at the panel perimeter with thickened epoxy so trimmed edges seal and take fastener or handling loads.
- **Thermal survey** — logging thermocouples in an empty oven to prove it actually holds the setpoint, within tolerance, everywhere the part will sit, before any part goes in.

## 5. SN5 baseline, and why infusion overbuilt the endplates

The SN5 endplates were glass infusion around 0.25 in Nomex on a flat plate (R1): stack frozen, dry stack and bag, drop test, infuse, cure, cut to DXF. Two things made them heavy:

1. **Ply count.** Glass is roughly a third the stiffness of carbon per ply, so getting acceptable panel stiffness took 7 plies on the RW endplates where a carbon skin needs 2 per side.
2. **Uncontrolled resin content.** Infusion resin fraction depends on mesh, vacuum quality, and when the line is clipped. Prepreg fixes resin content at the factory (typically 36 to 42 percent by weight, R2/R4), so the panel weighs what the stack math says it should.

The measured result was 2272 g for the RW endplate set (R1). The target of this pilot is the same panels at least 30 percent lighter (§14).

## 6. Candidate material systems

Two realistic paths, plus an industry benchmark for context. Full comparison:

| | Path A: ACP RTS prepreg | Path B: XPREG XC110 | Benchmark: Toray TC275-1/-1E |
|---|---|---|---|
| Cloth | 5.8 oz (198 gsm) 2x2 twill 3K carbon (R2) | 210 gsm 2x2 twill 3K carbon (R4) | UD/fabric aerospace OOA (R7) |
| Cure | 4 h at 132 °C, or 1 h at 154 °C, vacuum bag + oven (R2) | 85 to 120 °C window, vacuum bag + oven; ramp/dwell table per R4/R5 | 135 °C VBO (or 177 °C post-cure) |
| Storage | **Room temperature.** No freezer needed (R2) | Freezer at -18 °C, 12 months sealed; out-life about 30 days at 20 °C (R4) | Freezer; out time 14 to 28 days |
| Cost | Roll pricing roughly $700 to $3,399 retail; **expired clearance rolls $546 to $1,522** (R3) | From about $46.49 per yard, 1.25 m wide roll (easycomposites.us) | Not a purchase path |
| Sponsor fit | **Existing sponsor** (Nomex donation, R13). Expired-roll donation is a near-zero-cost ask for them | Existing supplier, not a sponsor. UK shipping carries the PP-02 customs-delay risk | None |
| Oven demand | 132 °C minimum: pushes toward a real oven (the Larry question, §9) | 85 °C entry point: achievable in a dedicated domestic oven or DIY box (R11, R12) | Autoclave-adjacent facilities |

**The coupling to understand:** Path A deletes the freezer question but raises the oven bar to 132 °C. Path B lowers the oven bar to 85 °C but needs the CalSol freezer (or about $200 of chest freezer, §11) and accepts the 30-day out-life clock against a student schedule. The path decision is a blocker in §12 and depends on the ACP response and the oven answer, in that order.

## 7. Cocure viability with Nomex core, vacuum bag only

Short answer: viable, with known controls. The literature findings that matter to us:

- VBO cocuring and co-bonding of prepreg skins onto aramid (Nomex) honeycomb is a studied, workable process, not an exotic one (R10).
- Core crush is driven by the pressure difference across the cell walls during heated cure, and it concentrates at chamfered or ramped core edges (R8). **Endplates are flat panels with square-cut cores. The classic crush driver is absent.**
- An EPFL study found the best skin/core results with initial internal core pressure around **40 to 70 kPa absolute** (a partially vented core rather than hard vacuum in the cells), trading skin-to-core adhesion against skin porosity (R9). Practical translation for us: do not gun for maximum vacuum on the cocure panel by reflex; the cure recipe for Panel 2 will state its bag level and we validate it by sectioning.
- The skin-to-core joint needs resin fillets at every cell wall. Dedicated prepregs are formulated self-adhesive; the conservative route is a layer of **XA120 adhesive film (150 gsm)** between skin and core, which exists exactly for oven-cure honeycomb bonding (R6). Panel 2 runs with film; if a with/without coupon shows the film is unnecessary for our system, drop it and save 300 g/m² of panel.
- Trimmed perimeters expose open cells. Edge potting with thickened epoxy after trim (same practice as SN5 inserts) seals them.

Carry-over practice from infusion: the CS-006 drop test still applies to the prepreg bag (leak-down ≤2 inHg in 10 min from the target level, R14). The target level itself is set by the Panel 2 recipe, not automatically ≥25 inHg, because of the core pressure point above.

> Never put a bagged Nomex panel through a cure with an unverified oven or an unlogged cycle. A cure that runs hot crushes core and scraps donated material; a cure that runs cold leaves the skins soft with no visual warning. The thermal survey and cure log are blockers (§12), not paperwork.

## 8. Weight estimate

Estimates only. Every number below is superseded by measured panel weights the day Panel 3 exists (§12). Inputs: cloth areal weights from R2/R4, resin fractions from R2/R4, Nomex 0.25 in at 3.0 lb/ft³ nominal (about 305 g/m², ACP product line, R13 SKUs), XA120 at 150 g/m² (R6), SN5 measured endplate mass from R1.

| Panel, per m² | Build | Estimate |
|---|---|---|
| SN5 glass infusion sandwich | 7 plies glass, infused (about 45 percent resin), 0.25 in Nomex | about 2.8 to 3.2 kg/m² |
| Prepreg carbon sandwich | 2 plies 198/210 gsm per side (about 38 percent resin), XA120 both sides, 0.25 in Nomex | about 1.7 to 1.9 kg/m² |
| Prepreg, film deleted | Same skins, self-adhesive fillets prove out | about 1.4 to 1.6 kg/m² |

That is a **35 to 45 percent panel-level saving**, or roughly 800 to 1000 g off the 2272 g RW endplate set (R1), before any geometry change. The saving comes from carbon stiffness cutting ply count and factory-set resin content, not from magic: per-ply cured mass of prepreg carbon and infused glass are actually similar. The go/no-go criterion (§14) uses the measured number, not this table.

## 9. Facilities and storage: the two Larry questions

Both are open action items with owners and dates (§12). Neither is assumed answered anywhere in this study.

**9.1 CalSol freezer (Path B only).** Ask Larry whether composites can share freezer space with CalSol at RFS for sealed prepreg rolls. Discipline rules, non-negotiable, written to survive the 2026-02-17 chemicals-in-a-food-fridge incident (R15) and CS-011 storage practice:

- Prepreg only enters a freezer **sealed in its moisture-proof bag**, labeled with material, date in, and cumulative out-time.
- **Never a food fridge.** If the CalSol unit stores anything anyone eats, the answer is no and we buy a dedicated chest freezer (§11).
- An out-time log rides with the roll: date/time out, date/time back in, running total against the 30-day out-life (R4).
- Rolls come out cold and thaw **sealed** to room temperature before the bag opens, so condensation lands on the bag and not the material (R5).

**9.2 Oven.** Ask Larry what oven exists at RFS or what footprint and circuit a small cure oven could get. Three costed options:

| Option | Cost | Reaches 132 °C (Path A)? | Notes |
|---|---|---|---|
| Existing RFS oven, if one exists | $0 | Ask | Best case; needs a thermal survey like anything else |
| Dedicated used domestic oven | about $50 to 150 | Yes, typical domestic ovens exceed 250 °C | Legitimate for small parts per R11. Marked NEVER FOOD AGAIN, thermocouple-logged |
| DIY insulated PID box | about $200 to 400 | Design choice | Mineral wool + PID + SSR + K-type sensors (R12); sized to the largest endplate |

Every option ends the same way: an **empty-oven thermal survey blocker** (§12) with a two-channel logger showing ramp of about 2 °C/min and dwell inside the TDS band of the chosen system before any panel cures.

## 10. Sponsorship and outreach

**ACP Composites (primary ask).** Existing sponsor; donated our Nomex and quoted Q04397 (R13). The ask: donate or discount an **expired RTS prepreg roll** from their clearance stock (R3). This is precisely the "expired donations would be accepted if offered" clause from the SN5 handoff, and it costs ACP near nothing on clearance material. Secondary line in the same email: Stretchlon 800 high-temp bag film, which they stock (R16). Route per CS-012: batched through the lead, contacts via PM. Draft email in the Appendix. Owner and date in §12.

**Airtech (secondary ask).** Already a consumables sponsor. Ask: high-temperature bagging consumables (Stretchlon 800 or equivalent 200 °C film, high-temp sealant tape, release film, breather). Note VB160, our infusion film, is rated 160 °C: workable for Path B cures, marginal for Path A at 132 °C dwell with margin, so high-temp film is the correct ask either way.

> PP-08 rule applies to everything in this study: no expedited shipping on any prepreg order. The SN5 lesson was $120 of parts under $400 of rush freight. The timeline in §12 has the slack; use it.

## 11. Bill of materials (pilot: 3 test panels + 1 SN6 endplate set)

Two cost columns: retail (no sponsorship materializes) and sponsored (ACP donates expired roll, Airtech covers high-temp consumables). Sources: R2/R3/R6/R16 and Aircraft Spruce vacuum-bagging pages for tape/breather pricing.

| Item | Spec | Qty | Source | Retail | Sponsored | Notes |
|---|---|---|---|---|---|---|
| Prepreg carbon | Path A: ACP 198 gsm RTS 2x2 twill (expired ok) or Path B: XC110 210 gsm | about 10 yd² | ACP / Easy Composites | Path A: $546 to 1,522 per expired roll (R3); Path B: about $465 | **$0** (ACP expired-roll donation) | The headline ask. 10 yd² covers 3 panels + endplate set + scrap |
| Adhesive film | XA120, 150 gsm | about 3 yd² | Easy Composites | about $75 (R6) | about $75 | Dropped if the film-delete coupon passes (§7) |
| Nomex core | 0.25 in aramid honeycomb | 2 sheets | ACP | $0 | **$0** | Already donated (R13), on hand |
| High-temp bag film | Stretchlon 800 or 200 °C equivalent | 1 roll | Airtech / Fibre Glast | about $222 (R16) | **$0** (Airtech ask) | VB160 (160 °C) is not enough margin for Path A |
| High-temp sealant tape | 400 °F rated | 2 rolls | Airtech / Aircraft Spruce | about $25 | **$0** (Airtech ask) | Infusion tacky tape is not rated for cure temps |
| Release film + breather | High-temp release, 4.5 to 10 oz breather | pilot lot | Airtech / Aircraft Spruce | about $40 | **$0** (Airtech ask) | |
| Thermocouple logger | 2-channel K-type with logging | 1 | commodity | $30 to 60 | $30 to 60 | The cure log is a quality record (§14) |
| Cure oven | per §9.2 | 1 | RFS or built | $0 to 400 | $0 to 400 | Larry conversation decides the row |
| Freezer | 5 cu ft chest, garage-rated | Path B only | retail | $180 to 250 | **$0 if CalSol shares** | Path A deletes this row entirely |
| **Total** | | | | **about $400 to 900, plus oven $0 to 400** | **about $105 to 535** | Sponsored path fits the ≤$500 criterion (§14) |

## 12. Test plan and timeline

Anchor: go/no-go decision before fall semester ends (instruction ends about Dec 11, 2026). Blockers are hold points; nothing downstream of a blocker starts until it clears with a written record.

| By | Milestone | Owner | Blocker |
|---|---|---|---|
| Aug 14 | ACP email sent (reference Q04397; ask: expired RTS roll + Stretchlon 800). Airtech email sent (high-temp consumables) | Lead | |
| Aug 21 | Larry conversation closed **with written answers**: CalSol freezer yes/no + conditions, oven answer | Lead | |
| Sep 4 | Material path chosen (A or B) from ACP response + oven answer; donation confirmed or order placed, standard shipping only | Lead | **Blocker: no order before the path decision** |
| Sep 25 | Oven commissioned. Empty-oven thermal survey passed: logged ramp about 2 °C/min, dwell inside chosen system's TDS band at all sensor positions | RE (pilot) | **Blocker: no cure before survey passes** |
| Oct 9 | Panel 1: flat monolithic prepreg panel (4-ply). Visual + cure-log review against TDS | RE (pilot) | |
| Oct 30 | Panel 2: cocure over 0.25 in Nomex with XA120, plus film-delete coupon. Section cuts: continuous fillets, no core crush | RE (pilot) | |
| Nov 20 | Panel 3 pair: SN5-equivalent glass infusion panel (WO-SN5-014 stack) vs prepreg sandwich, same area. Weigh per area; 3-point bend comparison | RE (pilot) | |
| Nov 25 | Results compiled before Thanksgiving: measured weight delta, stiffness ratio, cost actuals | RE (pilot) | |
| Dec 4 | **Go/no-go review with Composites Lead against §14. Decision recorded in this doc as Rev B** | Lead | **Blocker** |
| Dec 11 | If GO: CS-014 (Prepreg Layup and Oven Cure) scoped, SN6 endplate work order drafted for spring build | Lead | |

Out-life note baked into this schedule: on Path B the 30-day clock (R4) means the roll lives in the freezer, panels are cut cold, and material thaws sealed per §9.1. On Path A the RTS material makes the whole schedule slack-tolerant, which is a real argument for Path A beyond the freezer question.

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Out-life clock vs student schedules (Path B) | Roll expires mid-semester | 30-day budget in the out-time log (§9.1); cut cold, return fast; Path A immune |
| Oven temperature uniformity | Under/over-cure, core crush | Thermal survey blocker + logged cures (§9.2, §12) |
| Core crush on Panel 2 | Scrapped donated core | Flat square-cut panels (R8), core pressure guidance (R9), section-cut inspection before any endplate layup |
| Expired-material property uncertainty | Weak skins from donated roll | Panel 1 and 3 are the coupon test; bend comparison against glass baseline before any car part |
| Customs delay on Easy Composites order (Path B) | PP-02 repeat, weeks lost | Order by Sep 4 blocker date; 3 weeks of schedule slack before Panel 1 |
| Rush-shipping temptation | PP-08 repeat | Standing rule in §10; timeline slack exists for this reason |
| Freezer sharing falls through | Path B storage gap | $180 to 250 chest freezer line item already in the BOM (§11) |
| Sponsorship falls through entirely | Cost doubles | Retail BOM column is the worst case: about $400 to 900 plus oven, still a viable pilot at team scale |

## 14. Go/no-go criteria (blocker, decided Dec 4)

GO requires all of the following, each with a record:

1. Measured cocured panel is **at least 30 percent lighter per m²** than the SN5-equivalent glass panel (Panel 3 pair, same area, same scale).
2. 3-point-bend stiffness of the prepreg sandwich **at or above** the glass baseline panel.
3. **No visible core crush** on Panel 2, and section cuts show **continuous resin fillets** at cell walls.
4. Cure log for every panel shows ramp and dwell **inside the TDS band** of the chosen system.
5. Total out-of-pocket spend for the pilot **at or under $500** (sponsored path, §11).

Any criterion failed: NO-GO for SN6 endplates, record why in Rev B, and the fallback is carbon infusion on the existing process (still likely lighter than SN5 glass, but that is a separate study).

## 15. Outlook: what a GO unlocks

- **CS-014 Prepreg Layup and Oven Cure** gets written from the pilot records (next free CS number; reserve it at GO, not before).
- **SN6 wing skins in prepreg**: the biggest composite mass after the endplates, and the natural second part family. Curved parts add one hard question this study did not answer: whether Coastal tooling board molds survive 120 to 132 °C cure cycles. That is its own small study before any curved prepreg part.
- The oven and freezer become **permanent team capability**, and elevated post-cure stops being "aspirational" for the infusion side too (CS-006 §8 note).
- The ACP relationship deepens from core donor to process sponsor, which compounds: expired-roll clearance stock exists continuously (R3), not as a one-off.

## Appendix A: draft sponsorship email (ACP)

Subject: Formula Electric at Berkeley, prepreg pilot ask (existing Nomex sponsor)

Hi [ACP contact],

Thanks again for the Nomex honeycomb donation this season (quote Q04397); it flew on the SN5 car in the wings and floor. For the SN6 car we are piloting prepreg skins cocured to that same core, to cut our endplate weight by roughly a third.

The ask: would ACP donate or discount one roll of 5.8 oz RTS prepreg from your expired clearance stock? Expired material is genuinely fine for us: we coupon-test before anything structural, and your RTS line's room-temperature storage is what makes prepreg feasible for a student shop in the first place. If it is easier, a roll of Stretchlon 800 in the same box would cover our high-temperature bagging.

We would document the build and are glad to feature ACP in our sponsor material, at comp, and in the team's published process standards.

[Lead name], Composites Lead, Formula Electric at Berkeley

## Appendix B: what "prepreg" changes day-to-day, in one table

| | SN5 infusion | Prepreg pilot |
|---|---|---|
| Resin | Mixed in shop, IN2/AT30, pot-life pressure | Factory-set, no mixing, no pot life |
| Layup | Dry cloth, mesh, lines, trap | Sticky plies, debulk, no lines or trap |
| Cure | Ambient, 14 days to full properties | Oven, hours, logged |
| Storage | Cloth in dry bin | Path A: shelf. Path B: freezer + out-time log |
| Failure mode | Race-tracking, dry spots, leaks | Under-cure, core crush, out-life expiry |
| Skill floor | High (one shot, timed) | Lower per layup, higher per setup |
