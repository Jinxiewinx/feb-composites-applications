/* release-shots.mjs — the one or two pictures that go out with THIS release.
 *
 * Rewritten every release, exactly like WHATS_NEW in core.js, and for exactly
 * the same reason. release.mjs's own header records what happens otherwise:
 * v2.1.0 shipped a #composites note built from commit subjects and opened with
 * "Write down what v2.0.0 actually was" in front of the whole team. A shot list
 * picked from what CHANGED fails the same way — it photographs the biggest
 * diff, which is almost never the thing worth showing. So this is hand-written,
 * and release.mjs CHECKS that it moved since the last tag and refuses to ship if
 * it did not.
 *
 * TWO IS THE CAP, enforced below. Three pictures in a Slack post is a blog
 * entry and nobody reads the third.
 *
 * Only Major and Minor releases carry pictures. A patch is "fixes and copy,
 * nothing new to learn" (CHANGELOG.md), so there is nothing to photograph and
 * release.mjs skips this entirely.
 *
 * Each shot is the same shape make_mockups.mjs's SHOTS table uses:
 *   id     the file name stem: 03 App/design/release-v<version>-<id>.png
 *   js     run in the booted, fixture-seeded app to get to the view
 *   vh     viewport height of the raw capture (1440 wide)
 *   title  the caption, in the voice of somebody telling the team what changed
 *   note   one or two sentences under it. What it MEANS, not what it is.
 *
 * A SHOT MAY SEED ITS OWN DATA, and the blueprint one below does — the same
 * thing make_mockups does for the inventory map, which builds its own shelves.
 * The standing fixtures hold four season parts, which is the right size for
 * testing and the wrong size for a picture whose whole point is how many lines
 * now fit: four rows under a caption about sixty argues against the caption.
 * What is seeded has to be what the team would actually see — a real spread of
 * subteams, stages and dates — not a wall of filler that flatters the layout.
 *
 * Iterate on framing without cutting a release:
 *   node tools/shoot_release.mjs --version 3.0.0
 */

/* The Flammables Cabinet as it actually stands after the EH&S import: the
   real material names and container counts from the RSS export, each with a
   plausible UC tag. Seeded fresh because the standing fixtures hold five
   lots, and a picture about fifty containers folding into eight lines needs
   the fifty. */
const CABINET = `
  DB.items.push({ id: "BIN-SN6-950", cls: "BIN", name: "Flammables Cabinet", stage: "Active",
    site: "Flammables cabinet", locKind: "cabinet", flam: "Yes",
    walkedAt: new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10), walkedBy: "Simon Starbuck" });
  let tag = 0x243E80;
  const jug = (name, cls, role, matKey, n, open) => {
    for (let i = 0; i < n; i++) DB.lots.push({
      id: (cls === "RSN" ? "RSN" : "CON") + "-SN6-" + (700 + DB.lots.length),
      cls, name, role, matKey, stage: i < open ? "Open" : "Sealed",
      location: "BIN-SN6-950", receivedOn: "2025-12-06",
      ehsBarcode: "CA00000000000000" + (tag++).toString(16).toUpperCase().padStart(8, "0"),
    });
  };
  jug("IN2 Epoxy Infusion Resin",        "RSN", "resin",    "IN2",      3, 1);
  jug("AT30 SLOW EPOXY HARDENER",        "RSN", "hardener", "AT30",    10, 2);
  jug("WEST SYSTEM 209 Extra Slow Hardener", "RSN", "hardener", "WEST-209", 4, 0);
  jug("Acetone",                         "CON", "",         "ACETONE",  1, 1);
  jug("91% Isopropyl Alcohol",           "CON", "",         "IPA-91",   3, 0);
  jug("3M Bondo lightweight body filler","CON", "",         "BONDO",    5, 0);
  jug("Vacuum pump oil",                 "CON", "",         "PUMP-OIL", 3, 1);
  jug("frekote 700-nc",                  "CON", "",         "FREKOTE",  1, 1);
  jug("REXCO FORMULA FIVE Mold Release Wax", "CON", "",     "F5-WAX",   1, 0);
`;

export const RELEASE_SHOTS = [
  {
    id: "flam-cabinet",
    /* Tall enough for the header card, both chemical sections with the AT30
       group open, and a few singleton rows — the fold and the tag codes are
       the whole story, so both have to be in frame. */
    vh: 1150,
    js: CABINET + `
      view = { ...view, tab: "inventory", invView: "map", mode: "detail", id: "BIN-SN6-950",
               edit: false, invFlag: "", invLotOpen: { "m:at30": true } };
      render();`,
    title: "The Flammables Cabinet, grouped",
    note: "Every chemical EH&S tagged is in the app now, and identical containers fold into one " +
          "line — ten AT30 jugs is one row with the count, the open/sealed split and the mix " +
          "ratio on it. Opened, each jug shows its own UC tag code, which is how you tell jug " +
          "six from jug seven while holding one. Scan the sticker with the in-app camera " +
          "(iPhones included now) and the record opens.",
  },
  {
    id: "materials-grouped",
    vh: 900,
    js: CABINET + `
      view = { ...view, tab: "inventory", invView: "lots", mode: "list", id: null,
               q: "", fSub: "", fStatus: "", lotsFlat: false, invLotOpen: {} };
      render();`,
    title: "Materials, by material",
    note: "The Materials list counts containers AND kinds, one card per class. A material knows " +
          "its paperwork now — mix ratio and the TDS button sit right on the line, read from the " +
          "datasheets in Documents. Select… deletes many records in one confirmed go, and " +
          "anyone can.",
  },
];

if (RELEASE_SHOTS.length > 2) {
  throw new Error("release-shots.mjs: two pictures at most — the third one does not get read.");
}
