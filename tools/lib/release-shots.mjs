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
 * Iterate on framing without cutting a release:
 *   node tools/shoot_release.mjs --version 2.2.0
 */

export const RELEASE_SHOTS = [
  {
    id: "rnd-parts",
    vh: 1000,
    js: `view = { ...view, tab: "parts", mode: "list", id: null, q: "", fSub: "",
                 fLate: false, fMine: false, fDone: false, fRnd: false }; render();`,
    title: "Trials and coupons live here now, and they say so",
    note: "An R&D part is a real part — real carbon, a real cost, a real deadline — that is not " +
          "something we promised to put on the car. It sits in this list like anything else, marked " +
          "with a black R&D capsule, and the chip at the top counts them and filters to them.",
  },
  {
    id: "rnd-season",
    vh: 950,
    js: `view = { ...view, tab: "season", mode: "list", id: null, seasonSub: "",
                 seasonQ: "", seasonSort: null, seasonDir: null }; render();`,
    title: "And they are off the blueprint, without disappearing",
    note: "The Season tab is the list of things that have to be on the car, so R&D work is not on it. " +
          "The count says how many are being held back and takes you to them, because a row that " +
          "vanishes with nothing on screen to explain it reads as data loss.",
  },
];

if (RELEASE_SHOTS.length > 2) {
  throw new Error("release-shots.mjs: two pictures at most — the third one does not get read.");
}
