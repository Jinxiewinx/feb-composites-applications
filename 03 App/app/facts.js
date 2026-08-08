"use strict";
/* facts.js — the dashboard's fact of the day.
   Two pools in one list: "lore" is the team's own shop wisdom, mined from the
   SN5 documentation (the infusion guides, the SN4 mold post-mortem, the
   safety primer), and "general" is wider composites and racing trivia. Lore
   is weighted double by appending a second copy of the lore entries to the
   pool, so team knowledge shows up most days without the general pool going
   stale. The day index is deterministic (UTC day number modulo pool size):
   everyone sees the same fact all day, no storage anywhere. "Another one"
   just offsets the index for the session. */

/* var, not const: the node test harness evals these files as scripts and
   reaches declarations through globalThis, which lexical bindings never
   join. Functions get there by declaration; these two need var. */
var FACTS = [
  /* ---- team lore (SN5 docs: Composites Info & Safety, the Resin Infusion
     Beginner Guide, SN4 Mold Manufacturing Problems and Solutions, the mold
     sealer and tooling-board-adhesive studies, the forged CF write-ups, the
     mold design documentation and the October 2025 meeting notes) ---- */
  { t: "The 3k in 3k carbon cloth means each tow has 3,000 filaments. 12k cloth packs 12,000 filaments per tow. Tow count, GSM, and weave together describe most cloths.", src: "lore" },
  { t: "Twill weave drapes around curves better than plain weave and has fewer fiber crimps, which can mean slightly better strength and a smoother look. Plain weave holds its fiber orientation better but fights you on complex shapes.", src: "lore" },
  { t: "The team stocks no plain weave carbon at all, even though it is the most common weave in the world. We run twill, some spread tow, and fiberglass.", src: "lore" },
  { t: "A 0/90 weave is weak in the 45 directions and a 45 weave is weak in 0/90. That is why layup stacks alternate orientations instead of stacking everything the same way.", src: "lore" },
  { t: "Epoxy pot life is typically 20 to 60 minutes of working time before the mix starts to gel. Plan the whole layup before you mix, not after.", src: "lore" },
  { t: "Mix epoxy exactly at the specified ratio and mix it thoroughly. Improper mixing leaves soft or uncured spots in the part, and there is no fixing that after cure.", src: "lore" },
  { t: "Mixing a big batch of epoxy and leaving it in the cup can make it heat up fast enough to smoke or melt the cup. Pour large batches into a shallow tray so the heat can dissipate.", src: "lore" },
  { t: "If a cup of mixed resin starts smoking, dilute it with water and let it sit. And never throw resin away until it is fully cured.", src: "lore" },
  { t: "Mix resin slowly. Stirring fast whips air into the mix, and those bubbles end up inside your part.", src: "lore" },
  { t: "Carbon fiber splinters are real and they hurt. Never run a bare hand along the cut edge of dry carbon cloth, the frayed fibers will snag you.", src: "lore" },
  { t: "Cutting or sanding cured carbon needs a dust mask or respirator, and this year it also needs supervision. If you are not cleared to cut, do not cut. We use a dremel with the dust extractor running.", src: "lore" },
  { t: "Nitrile gloves are mandatory around resin and hardener. Repeated minor skin contact with epoxy can build into a real allergic reaction over time.", src: "lore" },
  { t: "Wear clothes you do not care about in the shop. Resin stains are permanent and composites work is messier than you think it will be.", src: "lore" },
  { t: "Breather cloth soaks up excess resin and spreads vacuum pressure evenly, but keep it away from anywhere it can touch bare resin on the part. Breather bonded to a cured part is a miserable problem.", src: "lore" },
  { t: "The smoother you lay peel ply against the reinforcement, the better the final surface finish. Size barely matters, smoothness does.", src: "lore" },
  { t: "Vacuum pressure is not just for pulling air out. The clamping force from the bag is a big part of where the final part's strength comes from.", src: "lore" },
  { t: "For resin infusion, the bag seal is arguably the most important part of the whole layup. Take your time on the tacky tape.", src: "lore" },
  { t: "Resin always takes the path of least resistance to the outlet. Any spot not covered by flow media may simply never get infused, and we have had molds where whole sections got no resin. It's not fun.", src: "lore" },
  { t: "A deliberate break in the flow media near the outlet slows the resin front down, which helps on parts that are not uniform in shape.", src: "lore" },
  { t: "Keep the distance between infusion inlet and outlet feed lines under about half a meter. Farther than that and the infusion can stall or fail outright.", src: "lore" },
  { t: "Never place an infusion inlet or outlet on top of a surface you care about. The area directly underneath can infuse poorly or carry print-through onto the finished part.", src: "lore" },
  { t: "Pleats are folds of vacuum tape placed along each run of tape. They give the bag slack to stretch over the part. Skip them and the bag can rip under vacuum.", src: "lore" },
  { t: "Vacuum tape only adheres when you press on it. Laying it down is half the job, pressing it in is the other half.", src: "lore" },
  { t: "Aim for a 60/40 fiber to resin ratio in the finished part, and mix a little extra to cover what gets lost in the tubes.", src: "lore" },
  { t: "Hardener choice depends on part size. Big infusions want a slow hardener so the resin has time to travel, small parts can take a fast one.", src: "lore" },
  { t: "A large infusion takes 20 to 30 minutes or more to fully wet out. It is supposed to be slow. Do not panic, and do not rush it.", src: "lore" },
  { t: "Weigh your dry stack before layup. That number is how you estimate resin quantities later.", src: "lore" },
  { t: "Leave at least half an inch between your materials and the vacuum tape line, without letting them overlap the tape.", src: "lore" },
  { t: "Never clean a mold with acetone. Its solvent strength can damage the tooling board surface and create bigger imperfections than the ones you were removing.", src: "lore" },
  { t: "The SN4-approved mold cleaning routine is two steps: pressurized air to blow off fine particles, then spot-wiping with isopropyl alcohol on microfiber. Never fibrous cloth, the loose strings pull out and wreck the mold surface.", src: "lore" },
  { t: "Double-sided tape holds tooling board to the CNC bed, but it adds unwanted Z height. The fix from SN4: zero the machine off the top of the mold stock, not the bed.", src: "lore" },
  { t: "Duratec mold sealer earned its retirement three ways: it is expensive, it pools in and hides the etch marks that show where parts end, and sanding straight through it is extremely easy, forcing a whole new coat.", src: "lore" },
  { t: "S120 and water-based polymer sealers buff out with a plain microfiber cloth instead of high-grit sanding, so there is no layer to sand through. Less durable than Duratec, but we never reuse molds anyway.", src: "lore" },
  { t: "For big tooling board stacks, dowels at critical points plus resin only around the dowels gives a stable stock without the resin bill of gluing whole faces. Ure-Bond 90 handles the smaller boards.", src: "lore" },
  { t: "Epoxy adhesives for tooling board have a CTE matched to the board at 47e-6 per Kelvin, which is why they machine seamlessly. The tradeoff is a 12 to 48 hour cure.", src: "lore" },
  { t: "Foam tooling board is fragile. If a section of mold design leaves the foam too thin, it is prone to snapping off. Design in support.", src: "lore" },
  { t: "No overhangs in mold CAD, ever. Our 3-axis CNC physically cannot machine them.", src: "lore" },
  { t: "A wing mold should machine in under 3 hours. If your CAM says longer, rethink the toolpaths.", src: "lore" },
  { t: "SN4's front wing mold taught us about epoxy pooling in crevices. Tight internal corners in a mold design are resin traps.", src: "lore" },
  { t: "Infusions need flange room. SN4 molds ran out of flat space at the edges, so SN5 molds design in generous flanges plus a scribe line along the edges parallel to the ribs.", src: "lore" },
  { t: "Forged carbon fiber is chopped strands mixed with resin and compression molded, which lets it fill complex 3D shapes no sheet fabric could. The target is roughly 60 percent fiber, 40 percent epoxy.", src: "lore" },
  { t: "For forged CF, mix about 25 percent more resin than the fiber mass. The extra gets squeezed out in compression. Too little resin is worse: our first forged part was resin starved and failed its bend test.", src: "lore" },
  { t: "Forged CF mold rule of thumb: the compression stroke should be twice the part depth, with chamfers at every split line so you can wedge the mold apart with a screwdriver.", src: "lore" },
  { t: "Four heavy-duty trigger clamps at 600 lbf each hit the target 75 to 100 psi only on parts of 16 to 25 square inches or less. Bigger forged parts need through bolts, not clamps.", src: "lore" },
  { t: "Wax every surface of a forged CF mold that touches the part or another mold half, including the screw holes and the fastener hardware itself.", src: "lore" },
  { t: "Rohacell PMI foam core is not dissolved by resin, which is exactly why it was picked for the hotwire male mold experiments. Many foams are not so lucky.", src: "lore" },
  { t: "Post curing holds a finished part at elevated temperature to finish polymer cross-linking. Done right it raises the glass transition temperature and stiffness. Ramp slowly, about 1 to 2 degrees C per minute, or you distort the part.", src: "lore" },

  /* ---- general composites and racing ---- */
  { t: "Carbon fiber is strongest along the fiber and weakest across it. A laminate's strength is the stack's design, not the material's.", src: "general" },
  { t: "Full vacuum presses a bag down with about one atmosphere: roughly ten tonnes of force spread over every square meter of part.", src: "general" },
  { t: "The first carbon fiber Formula 1 monocoque was McLaren's MP4/1 in 1981. People predicted it would shatter; it made every metal chassis obsolete instead.", src: "general" },
  { t: "Peel ply leaves a matte, bondable surface when it comes off. Skip it and you sand instead.", src: "general" },
  { t: "Resin fraction drives part weight. A wet layup can end up half resin by weight; infusion lands nearer 35 percent, prepreg around 30.", src: "general" },
  { t: "A cured epoxy softens as it approaches its glass transition temperature. Post-curing exists to push that temperature up.", src: "general" },
  { t: "Carbon fiber conducts electricity and glass fiber does not. On an electric car that difference is why CF panels get grounding checks.", src: "general" },
  { t: "Carbon sanding dust is conductive and drifts. It will short electronics long before it bothers you, so wet-sand or run extraction.", src: "general" },
  { t: "Along the fiber, carbon's coefficient of thermal expansion is nearly zero. The aluminum insert bonded into it is not, and the joint knows.", src: "general" },
  { t: "Carbon fiber starts life as polyacrylonitrile, a textile acrylic, oxidized and then carbonized at over 1,000 degrees Celsius.", src: "general" },
  { t: "Kevlar is tough because it refuses to break cleanly, which is also why it is miserable to cut. The serrated scissors exist for a reason.", src: "general" },
  { t: "A sandwich panel works by holding its skins apart. Doubling the core thickness raises bending stiffness roughly fourfold for almost no added weight.", src: "general" },
  { t: "An ear next to the bag is still the fastest leak detector in the shop. Vacuum leaks whistle.", src: "general" },
  { t: "Forged carbon, chopped tow compression-molded into complex shapes, was pushed into the mainstream by Lamborghini in the 2010s.", src: "general" },
  { t: "Release agent is cheaper than a mold. A release failure usually costs the part and the tool at the same time.", src: "general" },
  { t: "Honeycomb core made of Nomex is aramid paper dipped repeatedly in phenolic resin, then expanded and sliced.", src: "general" },
  { t: "Fiber does the work only if it is straight. A wrinkle in one ply can halve the compressive strength of the laminate under it.", src: "general" },
  { t: "Prepreg lives in a freezer because its resin is already mixed. Out-time is a budget, and every hour on the bench spends some of it.", src: "general" },
  { t: "Styrene-free doesn't mean fume-free. Amine blush, sanding dust and solvent vapor are the reasons the respirator rule has no exceptions.", src: "general" },
];

/* Lore twice, appended after the full list rather than interleaved, so the
   duplicates are never adjacent and "another one" cannot repeat itself. */
var FACT_POOL = FACTS.concat(FACTS.filter(f => f.src === "lore"));

function factOfTheDay(offset) {
  if (!FACT_POOL.length) return null;
  const day = Math.floor(Date.parse(today() + "T00:00:00Z") / 86400000);
  return FACT_POOL[(day + (offset || 0)) % FACT_POOL.length];
}
