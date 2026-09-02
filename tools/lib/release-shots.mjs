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
 *   id     the file name stem: 06 Composites App/design/release-v<version>-<id>.png
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

/* A bench with enough in it to be worth photographing. The standing fixtures
   hold one project, two batches and fifteen coupons, which is the right size
   for testing and slightly thin for a picture whose point is "this is a
   spreadsheet you can actually use" — so the sweep is filled out to a full
   three-temperature run with a couple of blanks and one scrapped coupon still
   in it. What is shown has to be what a real study looks like halfway
   through, not a tidy wall of filled cells that flatters the grid. */
const BENCH = `
  DB.rnd = DB.rnd.filter(o => o.cls === "RDS");
  const cpn = (n, study, label, status, vals, notes) => DB.rnd.push({
    id: "CPN-SN6-" + String(n).padStart(3, "0"), cls: "CPN", study, label, status,
    vals, notes: notes || "", photos: [], createdBy: "starbuck@berkeley.edu" });
  let n = 0;
  const row = (study, stem, i, cure, thk, load, status, notes) =>
    cpn(++n, study, stem + String(i).padStart(2, "0"), status || "Tested",
        load == null ? (thk == null ? { Kcure: cure } : { Kcure: cure, Kthk: thk })
                     : { Kcure: cure, Kthk: thk, Kload: load }, notes);
  row("RDS-SN6-002", "A", 1, 120, 2.09, 588);
  row("RDS-SN6-002", "A", 2, 120, 1.98, 561, "Tested", "dry corner, trimmed back");
  row("RDS-SN6-002", "A", 3, 120, 2.17, 604);
  row("RDS-SN6-002", "A", 4, 120, 2.11, 597);
  row("RDS-SN6-003", "B", 1, 140, 2.22, 641);
  row("RDS-SN6-003", "B", 2, 140, 2.19, 633);
  row("RDS-SN6-003", "B", 3, 140, 2.14, 612);
  row("RDS-SN6-003", "B", 4, 140, 1.62, null, "Scrapped", "bag leaked overnight");
  row("RDS-SN6-003", "B", 5, 160, 2.26, null, "Made");
  row("RDS-SN6-003", "B", 6, 160, null, null, "Made");
  row("RDS-SN6-003", "B", 7, 160, null, null, "Planned");
  /* The folder study keeps its rows: a study with no columns at all, sitting
     next to the swept one, is half of what "one record shape, three uses" is
     claiming — and a Parked folder reading "0 coupons" in a picture argues
     against it. */
  cpn(++n, "RDS-SN6-004", "L01", "Made", {}, "half a metre of 195 twill, RFS shelf 2");
  cpn(++n, "RDS-SN6-004", "L02", "Made", {}, "core offcuts, assorted");
  cpn(++n, "RDS-SN6-004", "L03", "Made", {});
`;

export const RELEASE_SHOTS = [
  {
    id: "ehs-edge-print",
    /* The cabinet, with the AT30 group open, because the whole point of this
       release is what a MEMBER row says: ten jugs that differ only in their
       tag, each now showing the twelve characters printed down the edge of
       the sticker. Tall enough that the open group and several folded ones
       are both in frame — a picture of one open group alone does not show
       that the codes are how you tell the ten apart. */
    vh: 1180,
    js: CABINET + `
      view = { ...view, tab: "inventory", invView: "map", mode: "detail",
               id: "BIN-SN6-950", edit: false, invFlag: "", invLotOpen: { "m:at30": true } };
      render();`,
    title: "The tag on screen now matches the tag on the jug",
    note: "A UC EH&S sticker prints its code in groups of four and reprints the last twelve " +
          "rotated down the right edge, which is the part still readable once the label is " +
          "wrapped round the neck. So that is what a container's row shows. Those twelve are " +
          "also enough to look the jug up: type them into any scan box. If two containers " +
          "share them the app names both rather than opening one.",
  },
];

if (RELEASE_SHOTS.length > 2) {
  throw new Error("release-shots.mjs: two pictures at most — the third one does not get read.");
}
