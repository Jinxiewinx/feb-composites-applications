/* fixtures.mjs — demo records for the collections that have no SN5 archive.
 *
 * WHY THIS EXISTS
 * loadArchive() in core.js seeds four collections: workOrders, parts, schedule
 * and stock. That leaves Tickets, Budget, Weekly Plan and People rendering
 * their empty states, so a screenshot sweep photographed five of eleven tabs
 * saying "nothing here yet" and called it an audit. An empty tab hides exactly
 * the problems a layout audit is looking for: density, wrapping, overflow, how
 * a status colour reads next to the one below it.
 *
 * These are fixtures, not seeds. Nothing here is written to Firestore and
 * nothing ships in the app. They exist so tools/shoot_ui.mjs and
 * tools/test_appui.mjs can drive a full-looking app, and they are deliberately
 * FEB-shaped (real subteams, real stations, real part names) so a reviewer
 * reads the layout instead of tripping over lorem ipsum.
 *
 * Dates are computed from today rather than hardcoded. A fixture with a frozen
 * due date drifts into "179 days late" over a season and every screenshot grows
 * a red badge that isn't a real finding.
 */

const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const stamp = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

/* The roster. Five people is the number that makes an avatar stack overlap,
   a People table scroll on a phone, and a "who is on this" row wrap. */
export const USERS = [
  { email: "starbuck@berkeley.edu", name: "Simon Starbuck", role: "lead" },
  { email: "njepsen@berkeley.edu", name: "Nick Jepsen", role: "lead" },
  { email: "arivera@berkeley.edu", name: "Ana Rivera", role: "member" },
  { email: "dchen@berkeley.edu", name: "Dana Chen", role: "member" },
  { email: "mokafor@berkeley.edu", name: "Miles Okafor", role: "member" },
];

/* Tickets. One per status so the kanban board renders all six columns with
   cards in them — an empty column and a full one are different layout
   problems and the board has to survive both. Titles are long enough to wrap
   in a 176px column, which is where the board actually breaks. */
export const PROJECTS = [
  {
    id: "TKT-0031", kind: "project", title: "Redesign the undertray mold for a flatter draft angle",
    status: "In Progress", priority: "High", dueDate: iso(9), subteam: "AERO",
    description: "The SN5 mold fought the bag at the diffuser lip. Open the draft and re-cut.",
    assignees: ["arivera@berkeley.edu", "dchen@berkeley.edu"],
    watchers: ["starbuck@berkeley.edu", "arivera@berkeley.edu"],
    relatedParts: ["P-SN5-005"], relatedTickets: [], relatedWorkOrders: [],
    files: [], comments: [], retro: false,
  },
  {
    id: "TKT-0032", kind: "issue", title: "Clamshell mating surface sits 2mm proud",
    status: "Collecting Data", priority: "High", dueDate: iso(3), subteam: "AERO",
    description: "Measured on three parts. Need the CMM trace before we cut anything.",
    assignees: ["mokafor@berkeley.edu"], watchers: ["starbuck@berkeley.edu"],
    relatedParts: [], relatedTickets: ["TKT-0031"], relatedWorkOrders: [],
    files: [], comments: [], whatHappened: "Found at trial fit on 2 of 3 clamshells.", retro: false,
  },
  {
    id: "TKT-0033", kind: "project", title: "Write the mold-sealing SOP for CS-004",
    status: "To Do", priority: "Medium", dueDate: iso(16), subteam: "BERGO",
    description: "Duratec is out, XCR is in. The standard still names the old product.",
    assignees: ["njepsen@berkeley.edu"], watchers: ["njepsen@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
  {
    id: "TKT-0034", kind: "project", title: "Source a second infusion pump before the undertray week",
    status: "On Hold", priority: "Low", dueDate: iso(-4), subteam: "BERGO",
    description: "Blocked on the purchasing freeze. Revisit after the sponsor cheque clears.",
    assignees: ["dchen@berkeley.edu"], watchers: ["starbuck@berkeley.edu", "dchen@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
  {
    id: "TKT-0035", kind: "project", title: "Ground the catch can and verify under 5 ohms",
    status: "Done", priority: "Medium", dueDate: iso(-11), subteam: "AUTO-MECH",
    description: "Copper mesh over the aluminium, same method the diffuser passed with.",
    assignees: ["arivera@berkeley.edu"], watchers: ["arivera@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
  {
    id: "TKT-0036", kind: "issue", title: "Etch locker double-booked with the Jacobs basement move",
    status: "Cancelled", priority: "Low", dueDate: iso(-20), subteam: "AERO",
    description: "Resolved itself when the basement shelf opened up. Closing.",
    assignees: [], watchers: ["starbuck@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
  /* Sub-tickets, both under TKT-0031 (which is DB.projects[0], the record the
     populated-content suites open). One open and one done-but-late, so the
     children table renders its done/total count AND a late warn in the same
     fixture. The browser suites had zero parentId coverage before these. */
  {
    id: "TKT-0037", kind: "project", parentId: "TKT-0031",
    title: "Machine the plug from the new surface model",
    status: "To Do", priority: "High", dueDate: iso(5), subteam: "AERO",
    description: "Blocked until the draft-angle cut lands in CAD.",
    assignees: ["mokafor@berkeley.edu"], watchers: ["arivera@berkeley.edu", "mokafor@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
  {
    id: "TKT-0038", kind: "project", parentId: "TKT-0031",
    title: "Compare draft angles against the SN5 bag failure photos",
    status: "Done", priority: "Medium", dueDate: iso(-2), subteam: "AERO",
    description: "Annotated photo set is in the parent's files.",
    assignees: ["dchen@berkeley.edu"], watchers: ["dchen@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
];

/* Budget. Spans all three statuses, and TKT-shaped costs: one over $50 and
   still Submitted, so the "needs approval" pill renders somewhere. */
export const BUDGET = [
  {
    id: "BUY-0012", item: "Airtech Wrightlon 4600 release film, 100 yd", purchaser: "Ana Rivera",
    purpose: "Manufacturing", status: "Submitted", cost: "184.50", dateOrdered: iso(-1),
    source: "Composite Envisions", notes: "", retro: false, createdBy: "arivera@berkeley.edu",
    receiptUrl: "", receiptPath: "",
  },
  {
    id: "BUY-0013", item: "Infusion spiral tubing, 50 ft", purchaser: "Dana Chen",
    purpose: "Manufacturing", status: "Ordered", cost: "42.10", dateOrdered: iso(-6),
    source: "Fibre Glast", notes: "Shipped, tracking in #purchasing.", retro: false,
    createdBy: "dchen@berkeley.edu", receiptUrl: "", receiptPath: "",
  },
  {
    id: "BUY-0014", item: "Renshape 5169 tooling board, 2 sheets", purchaser: "Nick Jepsen",
    purpose: "Tooling", status: "Ordered", cost: "1290.00", dateOrdered: iso(-13),
    source: "Freeman Supply", notes: "Long lead. Confirm before the mold week.", retro: false,
    createdBy: "njepsen@berkeley.edu", receiptUrl: "", receiptPath: "",
  },
  {
    id: "BUY-0015", item: "Nitrile gloves, box of 100", purchaser: "Miles Okafor",
    purpose: "Restock", status: "Reimbursed", cost: "18.99", dateOrdered: iso(-24),
    source: "McMaster-Carr", notes: "", retro: false, createdBy: "mokafor@berkeley.edu",
    receiptUrl: "", receiptPath: "",
  },
  {
    id: "BUY-0016", item: "Vacuum bag sealant tape, 6 rolls", purchaser: "Simon Starbuck",
    purpose: "Manufacturing", status: "Reimbursed", cost: "96.00", dateOrdered: iso(-31),
    source: "Airtech", notes: "", retro: false, createdBy: "starbuck@berkeley.edu",
    receiptUrl: "", receiptPath: "",
  },
];

/* Notifications drive the topbar bell's unread count, which is a positioned
   badge over an icon button and therefore its own little layout risk. */
export const NOTIFICATIONS = [
  { id: "N1", to: "starbuck@berkeley.edu", text: "Ana Rivera mentioned you on TKT-0031", link: "projects:TKT-0031", read: false, ts: stamp(-0.05) },
  { id: "N2", to: "starbuck@berkeley.edu", text: "TKT-0032 moved to Collecting Data", link: "projects:TKT-0032", read: false, ts: stamp(-0.3) },
  { id: "N3", to: "starbuck@berkeley.edu", text: "Dana Chen assigned you TKT-0034", link: "projects:TKT-0034", read: true, ts: stamp(-2) },
];

/* Weekly Plan writes goals / doneTickets / cars onto the SAME schedule docs
   Timeline uses, so these are patched onto the archive rather than replacing
   it. Applied to whichever week is current, or the first week if the archive
   is undated (which the SN5 seed entirely is).
   Returned as a function because the caller supplies the week id. */
export const weekPlanPatch = (weekId) => ({
  goals: [
    { id: "G1", person: "arivera@berkeley.edu", text: "Finish CAM for the undertray mold", done: true, due: iso(2) },
    { id: "G2", person: "arivera@berkeley.edu", text: "Order the missing tooling board", done: false, due: iso(1) },
    { id: "G3", person: "njepsen@berkeley.edu", text: "Write the mold-sealing SOP for CS-004", done: false, due: iso(3) },
    { id: "G4", person: "dchen@berkeley.edu", text: "Bag-and-leak-check the clamshell tool", done: false, due: iso(-1) },
    { id: "G5", person: "mokafor@berkeley.edu", text: "Trim and grind the catch can", done: true, due: iso(-2) },
  ],
  doneTickets: [],
  cars: [
    {
      id: "CAR1", driver: "arivera@berkeley.edu", day: "Sat", time: "9:00 AM", capacity: 4,
      passengers: ["dchen@berkeley.edu", "mokafor@berkeley.edu", "njepsen@berkeley.edu"],
    },
    { id: "CAR2", driver: "njepsen@berkeley.edu", day: "Sun", time: "10:00 AM", capacity: 3, passengers: [] },
  ],
  weekId,
});

/* The JS a page runs to install all of the above, given an already-booted app.
   Kept as a string because both consumers inject it with page.evaluate(), and
   because it must run AFTER the archive fetch so the schedule patch has a week
   to attach to. */
/* Molds, items and lots (2026-08-03). Three tabs photograph as empty states
   without these, and an empty tab is the one state a density audit learns
   nothing from. Content is deliberately hostile where it can be: a mold name
   long enough to clip, a stack string at full CS-002 length, an item with
   nothing but an id. */
export const MOLDS = [
  { id: "MOLD-SN6-001", name: "UT INLET L/H", stage: "Ready for layup", location: "BIN-SN6-001",
    board: "BRD-SN5-002", density: "30", layers: "2 x 3in", sealingType: "XCR",
    sealedDate: "2026-09-14", sealedBy: "RJB", uses: 3, rev: "A" },
  { id: "MOLD-SN6-002", name: "UNDERTRAY LEFT SIDE POD OUTBOARD SKIN LOWER SECTION TWO",
    stage: "Machined", density: "60", uses: 0, rev: "A" },
  { id: "MOLD-SN6-003", name: "NOSECONE", stage: "Board glued", uses: 0 },
  { id: "MOLD-SN6-004", stage: "Designed" },
];
export const ITEMS = [
  { id: "PNL-SN6-001", cls: "PNL", name: "CORE COMPARISON PANEL", stage: "Cured",
    stack: "6X 195 TWILL + .125 NOMEX + 88 SPREAD-TOW", laidOn: "2026-09-22",
    coupons: "C01-C12", thicknessMm: 1.9, resinLot: "RSN-SN6-001", lotSource: "scanned" },
  { id: "PNL-SN6-002", cls: "PNL", name: "GLASS INFUSION TRIAL", stage: "Planned" },
  { id: "BIN-SN6-001", cls: "BIN", name: "RFS CONTAINER SHELF A", stage: "Active" },
  { id: "BIN-SN6-002", cls: "BIN", name: "JACOBS BASEMENT SHELF B3", stage: "Active" },
  { id: "JIG-SN6-001", cls: "JIG", name: "NOSECONE TRIM JIG", stage: "Stored", location: "BIN-SN6-002" },
];
export const LOTS = [
  { id: "RSN-SN6-001", cls: "RSN", name: "IN2 INFUSION RESIN", role: "resin", stage: "Open",
    ratio: "100 : 30 BY WEIGHT", vendorLot: "24C-0918", supplier: "Easy Composites",
    receivedOn: "2026-08-28", openedOn: "2026-09-02", expiresOn: "2027-08-28",
    location: "BIN-SN6-001", qty: "2.1 kg" },
  { id: "RSN-SN6-002", cls: "RSN", name: "AT30 SLOW HARDENER", role: "hardener", stage: "Open",
    vendorLot: "24C-0919", supplier: "Easy Composites", location: "BIN-SN6-001" },
  { id: "FAB-SN6-001", cls: "FAB", name: "195 TWILL SIGMATEX", stage: "Open", qty: "12 m",
    supplier: "Sigmatex", location: "BIN-SN6-001" },
  { id: "FAB-SN6-002", cls: "FAB", name: "195 TWILL OFFCUT", stage: "Open",
    parentId: "FAB-SN6-001", qty: "0.8 m" },
  { id: "CON-SN6-001", cls: "CON", name: "TACKY TAPE", stage: "Sealed", supplier: "Easy Composites" },
];

export const APPLY_FIXTURES = `
(() => {
  const U = ${JSON.stringify(USERS)};
  window.onFbData("users", U);
  /* Recent updatedAt/updatedBy stamps on a handful of tickets so the
     dashboard's activity feed photographs alive; hours-ago, so they read as
     today whatever day the suites run. */
  const PR = ${JSON.stringify(PROJECTS)};
  PR.slice(0, 5).forEach((p, i) => {
    p.updatedAt = new Date(Date.now() - (i + 1) * 5400000).toISOString();
    p.updatedBy = U[(i + 1) % U.length].email;
  });
  window.onFbData("projects", PR);
  window.onFbData("budget", ${JSON.stringify(BUDGET)});
  window.onFbData("notifications", ${JSON.stringify(NOTIFICATIONS)});
  window.onFbData("molds", ${JSON.stringify(MOLDS)});
  window.onFbData("items", ${JSON.stringify(ITEMS)});
  window.onFbData("lots", ${JSON.stringify(LOTS)});
  /* Season config for the dashboard countdown. Relative dates, so the module
     photographs alive on any day the suites run; the loader in core.js never
     overwrites a planted value with a missing doc. */
  const dd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  window.SEASON = { compName: "FSAE Michigan", compDate: dd(124), seasonStart: dd(-45),
    milestones: [{ label: "All molds cut", date: dd(38) }, { label: "Rolling chassis", date: dd(80) }] };
  /* Two LIVE work orders. The SN5 archive is all retro, so without these the
     dashboard's Blocked and Curing alerts and the Shop status rows are zero
     on every screenshot, and the "nothing empty above the fold" rule from
     the round-two design history has nothing to stand on. One is stopped at
     an unsigned blocker gate; one is mid-cure, started two hours ago. */
  window.onFbData("workOrders", (DB.workOrders || []).concat([
    { id: "WO-SN6-001", partName: "NOSECONE OUTER", subteam: "Aero", status: "InWork",
      moldEngineer: "Dana Chen", manufacturingEngineer: "Miles Okafor", dueDate: dd(6),
      steps: [
        { seq: 1, title: "Mold sealed and release verified", status: "open", buyoff: { name: "", date: "" }, rule: { kind: "blocker" } },
        { seq: 2, title: "Layup per stack plan", status: "open", buyoff: { name: "", date: "" } },
      ] },
    { id: "WO-SN6-002", partName: "UT DIFFUSER REBUILD", subteam: "Aero", status: "InWork",
      moldEngineer: "Priya Patel", manufacturingEngineer: "Dana Chen", dueDate: dd(4),
      steps: [
        { seq: 1, title: "Infuse", status: "done", buyoff: { name: "Dana Chen", date: dd(0) },
          rule: { kind: "startsHold" },
          cure: { resin: (typeof RESINS !== "undefined" && RESINS[0]) ? RESINS[0].id : "", startedAt: new Date(Date.now() - 2 * 3600000).toISOString() },
          /* Step photos, so the Photos section, the per-step thumb strip and
             the done-row fold all photograph populated. Inline SVGs — the
             suite runs offline. */
          photoRefs: [
            { id: "PFIX1", name: "bag-before-pull.jpg", filename: "bag-before-pull.jpg", by: "dana@feb.test", ts: new Date().toISOString(), caption: "bag before pull",
              url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='%23335'/%3E%3C/svg%3E" },
            { id: "PFIX2", name: "flow-front.jpg", filename: "flow-front.jpg", by: "dana@feb.test", ts: new Date().toISOString(), caption: "",
              url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='%23533'/%3E%3C/svg%3E" },
          ] },
        { seq: 2, title: "Cure and demould", status: "open", buyoff: { name: "", date: "" }, rule: { kind: "hold", from: "resin" } },
      ],
      files: [{ id: "FFIX1", name: "trimmed-part.jpg", type: "image/jpeg", by: "dana@feb.test", ts: new Date().toISOString(),
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='%23353'/%3E%3C/svg%3E" }] },
  ]));
  /* One stack plan and a board that fits it, so the cut list and the
     mark-cut confirm photograph as transactions instead of empty states
     (no fixture carried a stackplan before). */
  window.onFbData("stackplans", (DB.stackplans || []).concat([
    { id: "STK-SN6-001", name: "NOSECONE PLUG", density: 30,
      layers: [
        { thickness: 50.8, blanks: [{ x0: 0, x1: 610, y0: 0, y1: 406 }] },
        { thickness: 50.8, blanks: [{ x0: 0, x1: 508, y0: 0, y1: 305 }] },
      ] },
  ]));
  window.onFbData("stock", (DB.stock || []).concat([
    { id: "BRD-SN6-901", label: "2IN 30LB SHEET", density: 30, qty: 2,
      len: { value: 48, unit: "in" }, wid: { value: 24, unit: "in" }, thk: { value: 2, unit: "in" },
      origin: "Fixture rack", location: "BIN-SN6-001" },
  ]));
  /* Pinned team shelf links, for the launchpad and the Documents shelf. */
  window.onFbData("documents", (DB.documents || []).concat([
    { id: "DOC-SN6-001", title: "SN6 master tracker", kind: "sheet", url: "https://docs.google.com/spreadsheets/d/fixture", pinned: true },
    { id: "DOC-SN6-002", title: "Monday meeting deck", kind: "slides", url: "https://docs.google.com/presentation/d/fixture", pinned: true },
  ]));
  /* Date the archive weeks. The SN5 seed ships every week with weekOf:"" —
     honest for retro data, useless for a screenshot, because an undated week
     can never be "this week" and half the tab's states never render. Walk them
     backwards from the Monday of the current week so one week IS current. */
  const sched = (DB.schedule || []).slice().sort((a, b) => a.id.localeCompare(b.id));
  if (sched.length) {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // Monday of this week
    const cur = Math.min(sched.length - 1, Math.max(0, sched.length - 3));
    sched.forEach((w, i) => {
      const wd = new Date(d);
      wd.setDate(wd.getDate() + (i - cur) * 7);
      w.weekOf = wd.toISOString().slice(0, 10);
    });
    Object.assign(sched[cur], ${JSON.stringify(weekPlanPatch(""))}, { weekId: sched[cur].id });
    window.onFbData("schedule", sched);
  }
})();
`;
