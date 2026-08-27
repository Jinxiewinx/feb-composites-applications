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

/* A plausible SN6 season: three subteams, every stage represented, some late,
   some undated, one still unnamed. Values are the real enums from parts.js. */
const SEASON = `
  const mk = (name, sub, cad, mold, layup, due) => ({
    id: "P-SN6-" + String(900 + (DB.parts.length % 90)).padStart(3, "0") + "-" + DB.parts.length,
    partName: name, subteam: sub, layupType: "MOLD INFUSION",
    cadProgress: cad, moldProgress: mold, layupProgress: layup,
    layupDeadline: due, retro: false, rnd: false,
    moldEngineer: "", manufacturingEngineer: "", layupStack: [], commentLog: [],
  });
  const D = (n) => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10); };
  DB.parts.push(
    mk("NOSECONE INNER",     "AERO",      "Mold CAD/CAM Done", "Sealed",          "In Layup",       D(-4)),
    mk("UNDERTRAY MAIN",     "AERO",      "Mold CAD/CAM Done", "Machine Complete","Not Started",    D(3)),
    mk("UNDERTRAY DIFFUSER", "AERO",      "Mold CAD/CAM Done", "Machining",       "Not Started",    D(9)),
    mk("SIDEPOD LEFT",       "AERO",      "Part CAD Done",     "Not Started",     "Not Started",    D(16)),
    mk("SIDEPOD RIGHT",      "AERO",      "Part CAD Done",     "Not Started",     "Not Started",    D(16)),
    mk("FRONT WING MAIN",    "AERO",      "Mold CAD/CAM Done", "Ready For Layup", "Layup Complete", D(-21)),
    mk("FRONT WING FLAP",    "AERO",      "Mold CAD/CAM Done", "Sealed",          "In Layup",       D(-2)),
    mk("REAR WING MAIN",     "AERO",      "Part CAD Done",     "Machining",       "Not Started",    D(24)),
    mk("REAR WING ENDPLATE", "AERO",      "Not Started",       "Not Started",     "Not Started",    ""),
    mk("FLOOR PAN",          "AUTO-MECH", "Mold CAD/CAM Done", "N/A (Flat)",      "Layup Complete", D(-30)),
    mk("FIREWALL",           "AUTO-MECH", "Part CAD Done",     "N/A (Flat)",      "Not Started",    D(11)),
    mk("SEAT PAN",           "AUTO-MECH", "Mold CAD/CAM Done", "Sealed",          "Polished",       D(-45)),
    mk("BATTERY BOX LID",    "AUTO-MECH", "Mold CAD/CAM Done", "Machine Complete","Not Started",    D(6)),
    mk("BATTERY BOX SHELL",  "AUTO-MECH", "Part CAD Done",     "Machining",       "Not Started",    D(13)),
    mk("IMPACT ATTENUATOR",  "AUTO-MECH", "Mold CAD/CAM Done", "Ready For Layup", "In Layup",       D(1)),
    mk("STEERING SHROUD",    "AUTO-MECH", "Not Started",       "Not Started",     "Not Started",    ""),
    mk("MONOCOQUE UPPER",    "BERGO",     "Mold CAD/CAM Done", "Sealed",          "In Layup",       D(-7)),
    mk("MONOCOQUE LOWER",    "BERGO",     "Mold CAD/CAM Done", "Sealed",          "Layup Complete", D(-14)),
    mk("BULKHEAD FRONT",     "BERGO",     "Mold CAD/CAM Done", "Machine Complete","Not Started",    D(5)),
    mk("BULKHEAD REAR",      "BERGO",     "Part CAD Done",     "Machining",       "Not Started",    D(19)),
    mk("SUSPENSION A-ARM",   "BERGO",     "Part CAD Done",     "N/A (Flat)",      "Not Started",    D(27)),
    mk("PEDAL BOX",          "BERGO",     "Not Started",       "Not Started",     "Not Started",    D(34)),
  );
`;

export const RELEASE_SHOTS = [
  {
    id: "pit-board",
    /* Tall, because the program column stacks its bars and facts now instead of
       stringing them across the page. 1000 clipped it mid-sentence. */
    vh: 1180,
    js: `setTab("dashboard");`,
    title: "The dashboard asks four questions",
    note: "Stopped, Waiting on you, Due this week, On the clock — and a lane that has nothing to " +
          "say says so, rather than leaving a hole where a card used to be. “Waiting on you” is the " +
          "one to look at first: it lists only the steps you can actually sign, and when a training " +
          "is what is stopping you it names the training and who can teach it.",
  },
  {
    id: "blueprint",
    vh: 790,
    js: SEASON + `
      view = { ...view, tab: "season", mode: "list", id: null, seasonSub: "",
               seasonQ: "", seasonSort: null, seasonDir: null };
      render();`,
    title: "The blueprint is a read, and the season fits on one screen",
    note: "One line per part instead of thirteen columns you had to scroll sideways through. " +
          "Name, subteam, the C/M/L marks, where it has got to in a word, and the deadline — with " +
          "late ones spined in red and parts nobody has named yet still visible rather than blank. " +
          "Click a name to open the part; that is where you change anything now, next to the gate " +
          "and the confirms that were always there.",
  },
];

if (RELEASE_SHOTS.length > 2) {
  throw new Error("release-shots.mjs: two pictures at most — the third one does not get read.");
}
