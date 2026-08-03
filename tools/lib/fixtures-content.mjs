/* fixtures-content.mjs — the populated states lib/fixtures.mjs leaves empty.
 *
 * WHY THIS EXISTS
 * lib/fixtures.mjs fills the collections that had no SN5 archive, but every
 * record it writes carries `comments: []`, `files: []`, no `docs` and no
 * `noteLog`. So the layout audit measured an app in which nobody had ever
 * commented, linked a Drive doc, or attached a file — and passed, on a phone,
 * at 393px, on every tab. Simon reported the real thing: open a work order that
 * has comments and documents on a phone and the page runs off the side, the
 * browser zooms out to fit it, and text clips.
 *
 * An empty thread cannot overflow. That is the whole bug in the harness.
 *
 * WHAT IS IN HERE, AND WHY EACH PIECE
 * Nothing here is lorem ipsum and nothing is gratuitously long. Every item is
 * a shape that has actually been pasted into a team tool:
 *
 *   - a bare Drive URL on its own line, because that is how a link gets shared
 *     when someone is standing at the bench. ~120 characters, zero spaces:
 *     the single most common cause of a page that will not stop scrolling.
 *   - a CAD filename in the team's own convention. Underscores are not break
 *     opportunities, so `SN6_Undertray_...REV-C.SLDPRT` is one word to the
 *     line breaker.
 *   - one very long single-paragraph message, no newlines, because that is
 *     what a status update looks like when it is typed on a phone. This is the
 *     "long messages split over many lines makes elements overly tall" half of
 *     the report.
 *   - a pasted table and a code block, both of which the composer can produce
 *     and both of which are intrinsically wider than a phone.
 *   - a document title long enough to need truncating, with a note after it,
 *     because docLinkRow puts both in one flex row with a button group.
 *   - enough docs and files that the lists have to wrap rather than fit.
 *
 * Applied on top of lib/fixtures.mjs, not instead of it: this patches records
 * that are already there so the ids in a failure message still mean something.
 */

const stamp = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString();

/* The three worst tokens, named so a failure can say which one spilled. */
export const LONG_URL =
  "https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefghij/view?usp=sharing&ts=68a1f2c9";
export const LONG_FILENAME =
  "SN6_Undertray_Diffuser_MoldHalf_A_REV-C_2026-08-01_release-to-CAM_FINAL_v2.SLDPRT";
export const LONG_WORD = "polyoxymethylene-reinforced-toolingboard-substrate-adhesion-failure";

/* One paragraph, no line breaks, 600-odd characters. Typed at RFS on a phone. */
const WALL_OF_TEXT =
  "Ran the leak check on the diffuser tool this afternoon and it held 27 inHg for the full ten " +
  "minutes with the pump off, which is the first time that tool has passed first try, so I think " +
  "the sealant tape change was the fix and not the extra bag pleat, but I did both at once so " +
  "somebody should try one at a time on the side pod tool before we write it into CS-006 as the " +
  "way we do it, and separately the vacuum gauge on the small pump reads about 1.5 inHg low " +
  "against the big one so if your numbers look off by a couple of points that is probably why " +
  "and not your bag.";

const doc = (n, over) => ({
  id: "GD-FIX-" + n,
  url: "https://docs.google.com/document/d/1fixture" + n + "/edit",
  openUrl: "https://docs.google.com/document/d/1fixture" + n + "/edit",
  embedUrl: "https://docs.google.com/document/d/1fixture" + n + "/preview",
  kind: "doc", fileId: "1fixture" + n,
  title: "Fixture document " + n, note: "", by: "starbuck@berkeley.edu", ts: stamp(-3),
  ...over,
});

/* Every doc list gets the same three: a long title with a note (the row that
   has to truncate), a short one (the row that must NOT look truncated beside
   it), and a Drive link whose title fell back to the raw URL, which is what
   docLinkRow renders when nobody typed a title. */
export const DOCS = [
  doc(1, {
    title: "SN6 Undertray Mold Design Review — diffuser half A, revision C, released to CAM",
    note: "every mold offset and the draft angle argument lives in section 4",
  }),
  doc(2, { title: "CAM notes", note: "" }),
  doc(3, { kind: "drive", title: LONG_URL, url: LONG_URL, openUrl: LONG_URL, embedUrl: "", note: "" }),
];

/* Files. icon-192.png is served by the app itself, so the image thumb renders a
   real bitmap rather than a broken-image box that hides a sizing bug. */
export const FILES = [
  { name: LONG_FILENAME, url: "icon-192.png", path: "projects/fix/1", size: 4_100_000, type: "application/octet-stream" },
  { name: "bag.png", url: "icon-192.png", path: "projects/fix/2", size: 220_000, type: "image/png" },
  { name: "leak-check-27inHg-2026-08-01-diffuser-tool-half-A.jpg", url: "icon-192.png", path: "projects/fix/3", size: 1_900_000, type: "image/jpeg" },
  { name: "CS-006-markup.pdf", url: "icon-192.png", path: "projects/fix/4", size: 88_000, type: "application/pdf" },
];

/* The thread. Seven comments, each one a different way a thread breaks:
   bare URL, wall of text, table, code, long filename, an image, and a short
   one so the tall rows have something to be measured against. */
export const THREAD = [
  {
    id: "cfx1", author: "Ana Rivera", email: "arivera@berkeley.edu", ts: stamp(-6.4),
    html: "<p>Mold drawing is here: <a href=\"" + LONG_URL + "\">" + LONG_URL + "</a></p>",
  },
  {
    id: "cfx2", author: "Simon Starbuck", email: "starbuck@berkeley.edu", ts: stamp(-5.2),
    html: "<p>" + WALL_OF_TEXT + "</p>",
  },
  {
    id: "cfx3", author: "Dana Chen", email: "dchen@berkeley.edu", ts: stamp(-4.1),
    html: "<p>Pull test numbers from Saturday:</p><table><thead><tr>" +
      "<th>Coupon</th><th>Peak load (N)</th><th>Width (mm)</th><th>Thickness (mm)</th>" +
      "<th>Strength (MPa)</th><th>Failure mode</th></tr></thead><tbody>" +
      "<tr><td>UT-A-01</td><td>4820</td><td>25.1</td><td>2.03</td><td>94.6</td><td>interlaminar</td></tr>" +
      "<tr><td>UT-A-02</td><td>5110</td><td>25.0</td><td>1.98</td><td>103.2</td><td>fiber</td></tr>" +
      "<tr><td>UT-A-03</td><td>3990</td><td>24.9</td><td>2.11</td><td>75.9</td><td>" + LONG_WORD + "</td></tr>" +
      "</tbody></table>",
  },
  {
    id: "cfx4", author: "Miles Okafor", email: "mokafor@berkeley.edu", ts: stamp(-3.6),
    html: "<p>Post ran with:</p><pre><code>" +
      "shopsabre-post --stock 5169 --tool 0.25in-ballnose --stepover 0.08 --feed 120ipm " +
      "--out /Volumes/FEB/SN6/undertray/" + LONG_FILENAME.replace(/SLDPRT$/, "nc") +
      "</code></pre>",
  },
  {
    id: "cfx5", author: "Nick Jepsen", email: "njepsen@berkeley.edu", ts: stamp(-2.4),
    html: "<p>Latest CAD is <code>" + LONG_FILENAME + "</code> in the Drive, superseding rev B.</p>",
  },
  {
    id: "cfx6", author: "Ana Rivera", email: "arivera@berkeley.edu", ts: stamp(-1.3),
    html: "<p>Bag at 27 inHg:</p><p><img src=\"icon-192.png\" alt=\"bagged diffuser tool\"></p>",
  },
  { id: "cfx7", author: "Dana Chen", email: "dchen@berkeley.edu", ts: stamp(-0.4), html: "<p>Nice.</p>" },
];

/* The always-there rich fields (work order notes, part note, ticket
   description). Same hostile shapes, different storage: `notes` is plain and
   `notesHtml` carries the markup, which is the two-key trick richField() uses.
   Both are set so whichever path renders, it renders something long. */
export const RICH_HTML =
  "<p>" + WALL_OF_TEXT + "</p>" +
  "<p>Drawing: <a href=\"" + LONG_URL + "\">" + LONG_URL + "</a></p>" +
  "<ul><li>Sealant tape swapped to AT-200Y</li><li>Extra pleat at the diffuser lip</li>" +
  "<li>Gauge on the small pump reads " + LONG_WORD + " low</li></ul>";
export const RICH_PLAIN =
  WALL_OF_TEXT + "\n\nDrawing: " + LONG_URL + "\nCAD: " + LONG_FILENAME;

/* The JS a page runs to patch all of the above onto an already-booted, already
   fixtured app. String, for the same reason APPLY_FIXTURES is one: both
   consumers inject it with page.evaluate(), and it has to run after the archive
   fetch and after APPLY_FIXTURES.

   Every collection gets it on its FIRST record only. Patching all of them would
   make a list view the worst case too, which is a different (and already
   covered) test; here the question is what one populated detail page does. */
export const APPLY_CONTENT = `
(() => {
  const DOCS = ${JSON.stringify(DOCS)};
  const FILES = ${JSON.stringify(FILES)};
  const THREAD = ${JSON.stringify(THREAD)};
  const RICH_HTML = ${JSON.stringify(RICH_HTML)};
  const RICH_PLAIN = ${JSON.stringify(RICH_PLAIN)};
  const clone = (x) => JSON.parse(JSON.stringify(x));

  const wo = (DB.workOrders || [])[0];
  if (wo) {
    wo.noteLog = clone(THREAD);
    wo.docs = clone(DOCS);
    wo.files = clone(FILES);
    wo.notes = RICH_PLAIN;
    wo.notesHtml = RICH_HTML;
    /* A step note and a quality-check row are the other two places a long
       string lands on this page, and both sit in a table cell. */
    if ((wo.steps || []).length) {
      wo.steps[0].notes = ${JSON.stringify(WALL_OF_TEXT.slice(0, 220))};
      wo.steps[0].photoRefs = FILES.map(f => ({ filename: f.name }));
    }
    if ((wo.qualityChecks || []).length) {
      wo.qualityChecks[0].actual = ${JSON.stringify(LONG_FILENAME)};
    }
    if ((wo.timeline || []).length) {
      wo.timeline[0].note = ${JSON.stringify(WALL_OF_TEXT.slice(0, 180))};
    }
    if ((wo.bom || []).length) { wo.bom[0].source = ${JSON.stringify(LONG_URL)}; }
    window.onFbData("workOrders", DB.workOrders);
  }

  const pt = (DB.parts || [])[0];
  if (pt) {
    pt.commentLog = clone(THREAD);
    pt.docs = clone(DOCS);
    pt.files = clone(FILES);
    pt.comments = RICH_PLAIN;
    pt.commentsHtml = RICH_HTML;
    window.onFbData("parts", DB.parts);
  }

  const pj = (DB.projects || [])[0];
  if (pj) {
    pj.comments = clone(THREAD);
    pj.docs = clone(DOCS);
    pj.files = clone(FILES);
    pj.description = RICH_HTML;
    window.onFbData("projects", DB.projects);
  }

  const wk = (DB.schedule || []).find(w => w.goals) || (DB.schedule || [])[0];
  if (wk) {
    wk.docs = clone(DOCS);
    window.onFbData("schedule", DB.schedule);
  }

  /* The team shelf is its own collection, not a docs array, so it has to be
     written rather than patched. Without it the Documents tab renders its empty
     state and every measurement on that tab is taken of nothing. */
  DB.documents = clone(DOCS).map((d, i) => ({
    ...d, id: "DOCFIX" + i, category: "Team shelf", pinned: i === 0,
  }));
  window.onFbData("documents", DB.documents);

  const bg = (DB.budget || [])[0];
  if (bg) {
    bg.notes = RICH_PLAIN;
    bg.notesHtml = RICH_HTML;
    window.onFbData("budget", DB.budget);
  }
})();
`;
