/* The deck's content, and the only place it lives.

   Three design directions render this same object, so a claim can't drift
   between them, and every number here has a `src` naming the file it came from.
   If a number has no `src`, it does not go on a slide.

   Rules the copy follows, because the audience is the person who ran this shop
   for a season:
     - Titles are claims, not labels. "Every buy-off carries a name" over
       "Work Orders".
     - Nothing explains composites. No slide says what a layup is, what infusion
       is, or why traceability matters. They know.
     - No number appears that isn't in `sources` below.
     - The limits slide is not a formality. It goes in unprompted.
*/

export const meta = {
  title: "FEB Composites — the SN6 workspace",
  subtitle: "What it does, how it's built, and what I need from you",
  presenter: "[Your name]",           // fill in before presenting
  date: "[Meeting date]",
  liveUrl: "feb-composites.web.app",
  footer: "FEB Composites · SN6",
};

/* Every quantitative claim in the deck, with the file that proves it. Printed
   into 06 Pitch/README.md so the next person can re-verify without re-deriving. */
export const sources = {
  standards14: ["14 composites standards, CS-000 to CS-013", "02 CS Standards/src/"],
  painPoints10: ["10 root-caused SN5 pain points", "01 Pain Points and Improvements/src/pain-points.md"],
  datasheets25: ["25 manufacturer TDS/SDS PDFs", "04 Datasheets/INDEX.md"],
  docsBundled42: ["42 reference docs bundled in the app", "03 App/app/docs/manifest.json"],
  appLines: ["8,900 lines of app source (js + index.html + print.css)", "03 App/app/"],
  vendorDeps: ["1 vendored dependency: DOMPurify, SRI-pinned, self-hosted", "03 App/app/vendor/purify.min.js"],
  archiveCounts: ["SN5 archive: 26 work orders, 33 parts, 11 schedule weeks, 8 boards", "03 App/app/sn5-*.json"],
  testAppLines: ["1,917-line app test across every tab in a DOM stub", "tools/test_app.mjs"],
  testDrawings: ["8 mold fixtures, every drawing sheet checked for legibility", "tools/test_drawings.mjs"],
  testPrintWidths: ["4 device widths, every printable document", "tools/test_print_mobile.mjs"],
  rulesLines: ["83 lines of server-side Firestore rules", "03 App/firestore.rules"],
  cutDepth: ["ShopSabre bed 5 x 10 ft, ~6 in max cut depth", "00 Agent/simon.md, CS-005"],
  weeklyCapacity: ["~2 molds + 2 infusions per week", "00 Agent/simon.md"],
  seasonSpend: ["SN5 ran ~$5.3k through one person's personal card", "00 Agent/simon.md"],
  approvalThreshold: ["Purchases over $50 need approval", "00 Agent/simon.md, CS-012"],
  customsWeight: ["~109 lb Easy Composites order held in customs for weeks", "pain-points.md PP-02"],
  expedite: ["ACP rods: $120 of parts, ~$400 expedited shipping", "pain-points.md PP-02"],
  outlinedStandards: ["CS-001, CS-007, CS-008, CS-009 are Outlined, not Drafted", "02 CS Standards/CS-INDEX.md"],
  hostingCost: ["Firebase Blaze, effectively $0, with a $1-5 billing cap", "03 App/app/README.md"],
};

/* The ask. Owners are blank on purpose — they get filled in live, in the room,
   which is the only reason the meeting is happening. */
export const asks = [
  { what: "Adopt it for SN6", detail: "Roster everyone in week 1. It is the system of record or it is a side project.", owner: "Lead", when: "Week 1" },
  { what: "Move the Firebase project", detail: "feb-composites sits on a personal Google account. It has to move to a team account, or it is one graduation away from gone.", owner: "Lead", when: "Before SN6 kickoff" },
  { what: "Sign the CS approval tables", detail: "All 14 standards ship “Draft, pending Lead signature”. Unsigned, they are suggestions.", owner: "Lead", when: "Sept" },
  { what: "Field-verify CS-011 at RFS", detail: "The storage map was written from records, not from standing in the room.", owner: "A member", when: "Sept" },
];

const S = (n) => `shots/${n}.png`;

/* Acts, then slides. `shot` is a file in 06 Pitch/shots/; `notes` is what gets
   said out loud, and is deliberately longer than what is on the slide. */
export const acts = [
  {
    id: "cover",
    slides: [
      {
        kind: "title",
        title: "FEB Composites",
        subtitle: "The SN6 workspace — what it does, how it's built, and what I need from you",
        footnote: "Live at feb-composites.web.app",
        notes: "Keep this short. Name, why you're the one presenting it, and that the whole thing already runs — you'll be clicking into the live app twice. Say up front that the last slide is a list of four decisions you need from them, so they know where this is going and don't spend the walkthrough wondering.",
      },
    ],
  },

  {
    id: "act1",
    label: "What SN5 cost",
    slides: [
      {
        kind: "statement",
        title: "The roster turns over every year. The knowledge doesn't transfer with it.",
        body: [
          "Most of what we know how to do is taught by standing next to someone.",
          "When they graduate it goes with them, and the next person re-derives it — usually by repeating the mistake.",
        ],
        notes: "Do not belabour this. One sentence out loud: they have lived it. The point of the slide is to name the mechanism — verbal training plus annual turnover — so the next slide's three failures read as one root cause rather than three unlucky incidents.",
      },
      {
        kind: "three-up",
        title: "Three things that cost us a season, all the same root cause",
        items: [
          { tag: "PP-01", head: "Duratec", body: "Days of mold time per incident, re-coating after sand-through. Nobody owned the sealer choice, so it was inherited rather than decided." },
          { tag: "PP-02", head: "Customs", body: "A ~109 lb Easy Composites order sat with no ETA and blocked the early layup calendar. Rush replacements elsewhere: $120 of ACP rods, ~$400 to expedite." },
          { tag: "PP-09", head: "“What stack did we use?”", body: "Asked in March about last year's seat. Answerable only by whoever remembered. The tracker recorded intent, not what was actually laid." },
        ],
        notes: "PP-09 is the one to land on. The first two cost time and money; the third is why they recurred. Slack is write-only memory. If they push back that PP-02 was bad luck — the 5-why in pain-points.md gets to 'a UK supplier with multi-week customs lead time treated like a next-day vendor', which is a process gap, not luck.",
      },
      {
        kind: "statement",
        title: "10 pain points, root-caused, each mapped to a standard that fixes it",
        body: [
          "14 numbered standards, CS-000 through CS-013. CS-INDEX is the lookup.",
          "tools/check_traceability.py audits that every pain point still points at a live standard, so the mapping can't quietly rot.",
          "The app is where those standards stop being a document and start being a step somebody has to sign.",
        ],
        notes: "This is the only standards slide before the ask. Do not tour them. The sentence that matters is the last one: a standard nobody reads is a PDF; a standard wired into a buy-off step is a gate. That is the bridge into the rest of the deck.",
      },
    ],
  },

  {
    id: "act2",
    label: "What it is",
    slides: [
      {
        kind: "shot-hero",
        title: "One shared workspace for the season, live for everyone at once",
        body: ["Runs in a browser, on a laptop or a phone at the bench.", "Free to run: Firebase Blaze with a $1–5 billing cap as the backstop."],
        shot: S("05-dashboard"),
        notes: "Dashboard is read-only on purpose — every row is a link into the tab it came from. Say the URL out loud. If someone opens it on their phone right now, they will hit the login and see nothing, which is the next slide.",
      },
      {
        kind: "shot-left",
        title: "An account gets you nothing until a lead adds your email",
        body: [
          "Enforced in firestore.rules, server-side — not by hiding buttons.",
          "Roster self-edits are limited to name and avatar, so nobody can promote themselves to lead.",
          "A member does the day-to-day work. A lead can also delete, restore from backup, and manage the roster.",
        ],
        shot: S("06-people"),
        notes: "Worth being precise here because it is the question a lead actually asks: what stops a first-year deleting the season? Answer: deletes are lead-only and it is checked on the server, so it holds even if someone opens the console. Do not oversell it — see the limits slide; anyone on the roster can still edit any record.",
      },
      {
        kind: "tabs-map",
        title: "Eleven tabs. The rest of this is four of them.",
        tabs: [
          "Dashboard", "Work Orders", "Parts", "Stock", "Tickets", "Timeline",
          "Weekly Plan", "Budget", "Documents", "Reports", "People",
        ],
        highlight: ["Parts", "Stock", "Work Orders", "Budget"],
        body: ["Cross-links everywhere — click a chip to jump to the related record. ⌘K for global search."],
        notes: "This slide exists so nobody spends the walkthrough wondering what they haven't been shown. Say it plainly: you are going to follow one part end to end rather than tour tabs, and the four highlighted are where that path goes.",
      },
    ],
  },

  {
    id: "act3",
    label: "One part, end to end",
    slides: [
      {
        kind: "shot-left",
        title: "CAD, mold and layup move independently, so the tracker shows three bars, not one percentage",
        body: ["Subteam, engineers, target weight, layup deadline.", "A part's layup stack and its work order's stack stay in sync — edit either."],
        shot: S("07-parts"),
        notes: "The SN5 Part Tracker collapsed a part to one number and it was always wrong, because mold can be done while layup hasn't started. Three stages is the fix. This screen is the real SN5 tracker data, 33 parts.",
      },
      {
        kind: "shot-left",
        title: "A full sheet and an offcut are the same kind of record",
        body: [
          "So remnants come back into stock instead of piling up under the bench.",
          "The planner picks thicknesses from what is actually on the rack — there is no point offering a stack we don't own.",
        ],
        shot: S("09-stock"),
        notes: "This is the small design decision that makes the rest work. If offcuts are a different kind of thing, nobody records them, and the planner ends up planning against fiction. Load SN5 archive brings in the rack SN5 left behind, so a fresh project has something to plan against on day one.",
      },
      {
        kind: "shot-left",
        title: "A real Fusion export is an assembly. It asks which body you mean.",
        body: ["Rather than slicing the bounding box of everything and planning a void.", "Three sample molds ship with the app, so the planner works before anyone exports anything."],
        shot: S("10-body-picker"),
        notes: "Small thing, but it is the difference between a demo and a tool. The sample shown holds three bodies. Mention the units line on that form — an STL carries no units, and getting it wrong is a 25.4x mistake, so the app makes you say.",
      },
      {
        kind: "shot-hero",
        title: "Hand it a mold. It works out which boards to glue and how to saw them.",
        body: [
          "Thicknesses chosen to waste the least board, from the rack you actually have.",
          "Tall molds split at the ShopSabre's ~6in cut depth, into one machine setup per section.",
        ],
        shot: S("11-plan"),
        notes: "This is the centrepiece — switch to the live app here if the room is with you. The 3D view is the mold sitting inside the translucent blocks. Before this existed the reviewer only ever saw a dashed outline traced on each layer, and signing that off was an act of faith. Drag to rotate; pinch works on a phone at the bench.",
        demo: true,
      },
      {
        kind: "shot-hero",
        title: "A numbered cut list, and blocks exported back out as CAM stock",
        body: [
          "Export stock STL writes one file per machine setup, in millimetres, at the mold's own CAD origin.",
          "It drops onto the model in CAD with nothing to align, so CAM uses it as the stock body directly. Marked beta.",
        ],
        shot: S("11b-cutlist"),
        notes: "The origin detail is the whole value: an export that lands anywhere else means someone re-models the stock by hand, which is what we were trying to avoid. Beta is honest — say it. It has not been through a full machining cycle yet.",
      },
      {
        kind: "shot-hero",
        title: "The boards get glued by hand, so it prints a dimensioned sheet per layer",
        body: [
          "Whoever is holding layer 3 needs to know how far in from each edge of layer 2 it goes.",
          "Inches to the nearest 1/16in with the exact millimetre bracketed. Every sheet marks the same datum corner.",
        ],
        shot: S("13-drawings"),
        notes: "Per-side insets off the board below, PLUS an absolute datum table — because a board sawn oversize makes every edge-relative number wrong in the same direction, and the datum is how you catch it. A value not on a 1/16 gets an approximately-equals sign, so the fraction never gets read as the truth. The mold silhouette is traced off the stored STL, not drawn.",
      },
    ],
  },

  {
    id: "act4",
    label: "The traveler",
    slides: [
      {
        kind: "shot-left",
        title: "The traveler carries the stack, the BOM and the standard each step answers to",
        body: ["Stack frozen at a revision — any change past that point needs a new one.", "Every step cites the CS clause it comes from."],
        shot: S("16-wo-detail"),
        notes: "This is a live SN6 record, not the retro archive. Point at the frozen-stack line: PP-04 was a part remade three or more times because no frozen thickness or DXF was shared between subteams. Freezing it at a revision is the fix.",
      },
      {
        kind: "shot-hero",
        title: "Every buy-off carries the name of the person who signed it, and blockers hold the line",
        body: [
          "Stack freeze, mold design review and drop test are blockers: later steps stay locked until they're signed.",
          "The enforcement is the point. Documentation that doesn't stop anything doesn't change anything.",
        ],
        shot: S("16b-buyoffs"),
        notes: "Be straight about the boundary here rather than waiting to be asked — it records who was signed in, it does not prove they were the one holding the part, and any roster member can still edit the record afterwards. It closes 'nobody knows who did this', not 'somebody falsified this'. That distinction is on the limits slide too.",
      },
      {
        kind: "shot-hero",
        title: "It prints on exactly two pages, every time",
        body: [
          "The app renders the sheet, measures it, and walks down a ladder of tighter layouts until it fits.",
          "Blank travelers for the bench. Always black-on-white, whatever theme you're in.",
        ],
        shot: S("17-print-traveler"),
        notes: "A third page means the back of the sheet is somewhere else and the buy-off columns get lost. Worth one line on why this was hard: a sheet is 8.5in — 816 CSS pixels — so on a phone the browser blew the viewport out to contain it and parked the Initial and Date columns off the right edge. It fits the sheet to the screen now, and forces full size when it actually prints.",
      },
    ],
  },

  {
    id: "act5",
    label: "Running the season",
    slides: [
      {
        kind: "shot-left",
        title: "Everything that isn't a part lives in Tickets",
        body: ["R&D, process fixes, bugs, outreach. Board or list, assignees, watchers, sub-tickets.", "Cross-linked to the parts and work orders they touch."],
        shot: S("18-tickets-board"),
        notes: "This replaced two separate things that were the same thing — Projects and Issues. Comments take real formatting and photo attachments, which matters because most of what goes wrong is easier to photograph than describe.",
      },
      {
        kind: "shot-left",
        title: "The weekly plan pulls each person's tasks from their ticket due dates",
        body: ["Plus carpools — who's driving to RFS, when, and how many seats are left.", "Logistics stop living in one person's head, or in a thread that scrolls away."],
        shot: S("18b-weeklyplan"),
        notes: "Carpools sound trivial and are not: RFS is a drive, and a layup that misses its slot because the ride fell through costs the same as one that fails. This is a second view over the same schedule as the Timeline tab, not a separate plan to keep in sync.",
      },
      {
        kind: "shot-left",
        title: "Purchases run Submitted, Ordered, Reimbursed — with a receipt attached from the phone",
        body: [
          "Anything over $50 is flagged for approval, per CS-012.",
          "SN5 ran about $5.3k through one person's personal card. This is the record that makes reimbursement someone else's job too.",
        ],
        shot: S("19-budget"),
        notes: "The scan-receipt button opens the phone camera directly and attaches the photo to the purchase — no OCR, nothing clever, just the photo taken where the receipt is. This slide usually gets the most nodding from whoever has been fronting the money.",
      },
      {
        kind: "two-up",
        title: "42 reference docs in the app, and a status board that prints in one click",
        left: { head: "Documents", body: "25 manufacturer datasheets, the CS standards rendered from source, and the shop printables. Filterable. Anyone can upload.", shot: S("20-documents") },
        right: { head: "Reports", body: "CSV export per dataset, plus the Monday-meeting status board as a single printable page.", shot: S("20b-reports") },
        notes: "The datasheets being in the app rather than a Drive folder is the difference between checking a mix ratio and guessing it. Reports exists so the Monday meeting stops being someone rebuilding a summary by hand every week.",
      },
    ],
  },

  {
    id: "act6",
    label: "Why it survives handoff",
    slides: [
      {
        kind: "stats",
        title: "Built so it still runs in two years without anyone maintaining it",
        stats: [
          { n: "0", label: "build steps", sub: "No framework, no bundler. Open the file, it runs." },
          { n: "1", label: "dependency", sub: "DOMPurify, SRI-pinned and self-hosted after shop wifi silently degraded it from a CDN." },
          { n: "8,900", label: "lines of app source", sub: "Small enough that the next lead can read it." },
        ],
        body: ["The 3D viewer is hand-rolled WebGL with nothing behind it. Fonts are self-hosted. Nothing phones out."],
        notes: "The argument is not that vanilla JS is better. It is that a student team cannot carry a dependency tree that rots — a framework upgrade nobody is around to do is how these tools die two seasons later. The old single-file work-orders.html is still in the repo as an offline archive viewer: it opens any exported JSON with no server at all.",
      },
      {
        kind: "stats",
        title: "The two tests worth knowing about render the real thing and measure it",
        stats: [
          { n: "8", label: "mold fixtures", sub: "Every drawing sheet rendered in headless Chromium and checked for legibility: no label crossed by a line, nothing under 5.5pt, nothing off the sheet." },
          { n: "4", label: "device widths", sub: "The whole app booted at each, every printable opened, fit and tap targets measured." },
          { n: "1,917", label: "lines of app test", sub: "Across every tab, plus the Firestore rules under the emulator." },
        ],
        body: ["Everything else asserts on strings and numbers — and a sheet passes all of that while printing a dimension straight through a dimension line."],
        notes: "That last line is the justification. String assertions cannot catch a drawing that is unreadable or a sheet that runs off a phone, and both of those shipped once. These two render in a real browser and measure what the layout actually did.",
      },
    ],
  },

  {
    id: "act7",
    label: "Limits and the ask",
    slides: [
      {
        kind: "limits",
        title: "What it does not do",
        items: [
          { head: "Buy-offs are not tamper-proof", body: "They record who was signed in. Any roster member can still edit any record, and there is no in-app version history. Monthly JSON exports to Drive are the audit trail." },
          { head: "Notifications are in-app only", body: "Watcher unread state lives in one browser. It does not sync between devices and it does not email." },
          { head: "Four standards are outlined, not drafted", body: "CS-001, CS-007, CS-008 and CS-009. Don't lean on those the way you'd lean on the other ten." },
          { head: "STL export is beta", body: "Real exports still turn up surprises. Check the stack view before anyone cuts." },
        ],
        notes: "Say this slide slowly and do not soften it. A lead who finds a limitation themselves after adopting it stops trusting everything else you said. Every one of these is written in the repo's own README already — you are reading it out, not confessing.",
      },
      {
        kind: "ask",
        title: "Four decisions",
        asks,
        footnote: "feb-composites.web.app",
        notes: "Stop talking after this. The second one is the one that actually matters and is the easiest to defer: the Firebase project is on a personal Google account, so it is one graduation away from being unreachable. Ask for a name and a date on each, in the room. If you only get one, get that one.",
      },
    ],
  },
];

export const slides = acts.flatMap(a => a.slides.map(s => ({ ...s, act: a.label || null })));
