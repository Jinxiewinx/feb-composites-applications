/* labels.js — printed identity for physical things.
 *
 * WHY THIS EXISTS
 * The SN5 part tracker had no ID column, so a part's *name string* was its
 * primary key, and the strings didn't even agree between sheets (STERING COVER
 * in one, STEERING COVER in the other). Molds sat in the RFS container for
 * weeks with nobody sure whose they were (PP-10). Seventeen tensile CSVs
 * identify a specimen by a trailing integer in the filename and nothing else.
 *
 * So: every physical thing gets a 4x1 inch label carrying its ID, its name,
 * the fact that actually identifies it (the layup stack for a part, the
 * sealing record for a mold), and a QR that resolves to the record.
 *
 * THE ONE NUMBER THIS FILE IS BUILT AROUND: 29.
 * HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD-SN6-004 is 45 characters. Encoded as
 * BYTES that needs QR version 4 (33 modules). Encoded as ALPHANUMERIC it fits
 * version 3 (29 modules) *and* has room for error-correction level Q, 25%
 * recovery, instead of M's 15%. Same physical size, a whole ECC level better,
 * for free — which on a label that gets resin and mold release on it is the
 * whole argument.
 *
 * That is why every URL here is UPPERCASE. QR alphanumeric mode covers only
 * 0-9 A-Z space $ % * + - . / : — no lowercase, no # ? = & _. One lowercase
 * letter silently costs a version and an ECC level. Scheme and host are
 * case-insensitive per RFC 3986 and our IDs are already uppercase, so nothing
 * is lost. tools/test_qr.mjs asserts getModuleCount() === 29 exactly, so the
 * day someone adds ?utm= or switches to a #hash route, the suite says so.
 *
 * And note: qrcode-generator does NOT auto-detect alphanumeric mode. addData()
 * defaults to Byte. We pass 'Alphanumeric' explicitly, after validating the
 * charset ourselves, because the library's own error for a bad character is
 * literally `undefined`.
 */

/* ---------- the URL ---------- */

const SCAN_HOST = "HTTPS://FEB-COMPOSITES.WEB.APP";
const SCAN_PATH = "/Q/";
// QR alphanumeric charset, ISO/IEC 18004 table 5. Anything outside this drops
// the encoder into byte mode.
const QR_ALNUM = /^[0-9A-Z $%*+\-./:]*$/;

/* THE CHARACTER BUDGET, which is a hard constraint on the ID grammar and not
 * just a property of this file.
 *
 * QR version 3 at ECC Q holds 47 alphanumeric characters. The host is 30 and
 * "/Q/" is 3, so an ID has 14 characters before the code jumps to version 4.
 *
 *   47 - 30 - 3 = 14
 *
 * MOLD-SN6-004 is 12, and every other prefix in the grammar is shorter.
 *
 * THIS USED TO SAY COUPONS COULD NEVER CARRY A QR, and that was a fact about
 * one SPELLING of a coupon rather than about coupons. When a coupon was a
 * substring of a panel — PNL-SN6-006-C03, fifteen characters — it was one over
 * budget, so coupon labels were text-only on 12mm tape. A coupon is now a
 * first-class record in the `rnd` collection: CPN-SN6-042 is eleven characters,
 * shorter than a mold, and it carries a QR like everything else. A study,
 * RDS-SN6-004, is eleven too — it labels the bag or tray the coupons live in,
 * which is a physical object somebody picks up months later.
 *
 * The rule the budget expresses did not move; what changed is which ids satisfy
 * it. tools/test_qr.mjs keeps the 15-character form as a counterfactual, so the
 * cliff stays proven rather than assumed, and still says so the day someone
 * adds a longer prefix instead of every label quietly getting denser.
 */
const QR_ID_BUDGET = 47 - SCAN_HOST.length - SCAN_PATH.length;   // = 14

function scanUrl(id) { return SCAN_HOST + SCAN_PATH + String(id || "").toUpperCase(); }
function fitsQrBudget(id) { return String(id || "").length <= QR_ID_BUDGET; }

/* ---------- QR ---------- */

// Below this the code stops being readable by a phone and starts being
// decoration. 29 modules + 8 of quiet zone = 37; at 14mm that's 0.38mm per
// module, already under the 0.4mm floor. A too-small QR looks perfectly fine
// on screen and simply does not scan in the world, which is why this is a
// throw and not a console.warn.
const QR_MIN_MM = 14;

/* One QR as a self-contained inline <svg>.
 *
 * Self-contained matters: print.js sheetFileHtml() copies innerHTML and inlines
 * only CSS, so a saved label sheet on a phone at RFS with no wifi has no
 * vendor/qrcode.min.js next to it. Nothing here may be a <script>, an <image>,
 * or an xlink:href.
 *
 * One merged <path>, not N <rect>s: a 29x29 grid as rects is ~420 elements per
 * label, so a 20-up sheet is 8,400 DOM nodes and a saved file in the megabytes.
 * Run-length-merging horizontal runs gets one label to about 2KB.
 *
 * The quiet zone lives INSIDE the viewBox. Printers clip to the element box, so
 * a quiet zone implemented as a CSS margin disappears in the saved file, and a
 * QR with no quiet zone is the most common home-made-label failure there is.
 */
function qrSvg(text, sizeMm, cls) {
  const t = String(text || "");
  if (!QR_ALNUM.test(t)) {
    throw new Error(`qrSvg: "${t}" has characters outside QR alphanumeric mode. ` +
      `Uppercase it, and drop any # ? = & _ — see the header of labels.js.`);
  }
  if (!(sizeMm >= QR_MIN_MM)) {
    throw new Error(`qrSvg: ${sizeMm}mm is below the ${QR_MIN_MM}mm floor; the code would not scan.`);
  }
  if (typeof qrcode !== "function") throw new Error("qrSvg: vendor/qrcode.min.js not loaded.");

  const q = qrcode(0, "Q");          // 0 = auto version, Q = 25% recovery
  q.addData(t, "Alphanumeric");
  q.make();

  const n = q.getModuleCount();
  const QUIET = 4;                   // modules, per ISO/IEC 18004
  const box = n + QUIET * 2;

  // Merge horizontal runs of dark modules into one path segment each.
  let d = "";
  for (let r = 0; r < n; r++) {
    let run = 0;
    for (let c = 0; c <= n; c++) {
      const dark = c < n && q.isDark(r, c);
      if (dark) { run++; continue; }
      if (run) { d += `M${c - run + QUIET} ${r + QUIET}h${run}v1h-${run}z`; run = 0; }
    }
  }

  // xmlns is not needed for inline SVG (the HTML parser implies it) but IS
  // needed the moment the markup leaves an HTML document: pasted into a data
  // URL, saved as a .svg, or handed to a print shop. 34 bytes to make the code
  // a portable artefact instead of a fragment.
  return `<svg xmlns="http://www.w3.org/2000/svg" class="lbl-qr${cls ? " " + cls : ""}" ` +
    `width="${sizeMm}mm" height="${sizeMm}mm" ` +
    `viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="scan code for ${esc(t)}"><rect width="${box}" height="${box}" fill="#fff"/>` +
    `<path d="${d}" fill="#000"/></svg>`;
}

/* ---------- what the label says ---------- */

/* The public projection: the ONLY fields an unauthenticated scanner may see.
 *
 * Shared with the label renderer on purpose, so the printed label and the
 * public scan card can never disagree about what an object is. It is also the
 * security boundary — Firestore rules cannot filter fields, only whole
 * documents, so this function is what keeps layup stacks and people's names off
 * a public URL. firestore.rules mirrors this list in a hasOnly() clause; if you
 * add a key here, add it there too or the write is rejected.
 *
 * Never add: any human name or email, layupStack/steps/qualityChecks/bom,
 * anything from budget, any firebasestorage.googleapis.com URL (a download URL
 * is a bearer credential and works regardless of storage.rules), or unbounded
 * free text like comments.
 */
/* R&D, asked in a way that survives this file being loaded ALONE.
   test_qr.mjs runs labels.js in a bare sandbox with only `esc` and `qrcode`,
   and its header says that is deliberate: anything more and the QR arithmetic
   starts depending on core.js's whole surface. So this is guarded exactly the
   way pubProjection already guards DB a few lines down. Loaded on its own, a
   label simply cannot know about a flag that lives on records it was not
   given — and the geometry it IS there to check is unaffected. */
function lblIsRnd(coll, o) { return typeof recIsRnd === "function" ? recIsRnd(coll, o) : false; }

/* The R&D bench's four accessors, guarded exactly the way lblIsRnd is and for
   the same reason: tools/test_qr.mjs loads THIS FILE ALONE in a sandbox holding
   only esc() and qrcode(), deliberately, so the geometry it checks cannot drift
   behind a dependency. A label asked to render a coupon in that sandbox simply
   cannot know what study holds it — and the geometry it is there to check does
   not depend on knowing. Unguarded, every one of these is a ReferenceError that
   fails the QR suite rather than the thing the suite is about. */
function lblStudyOf(o) { return typeof rdStudyOf === "function" ? rdStudyOf(o) : null; }
function lblStudyName(o) { const s = lblStudyOf(o); return s ? (s.name || s.id || "") : ""; }
function lblEff(o, k) { return typeof rdEff === "function" ? rdEff(o, k) : (o[k] ?? ""); }
function lblStudyMat(s, k) { return s && s.defaults ? (s.defaults[k] ?? "") : ""; }
function lblCouponCount(s) { return typeof rdCouponsDeep === "function" ? rdCouponsDeep(s.id).length : 0; }
/* A NAME, not an email. The R&D records store `createdBy` and `by` as email
   addresses because that is what myEmail() returns and what the rules check,
   but "ANA@BERKELEY.EDU" on a 7pt line is both uglier and less useful than
   "ANA RIVERA" to somebody holding the bag. Guarded like the rest: with core.js
   absent this degrades to the raw value rather than throwing.

   This is a printed, team-facing label. The PUBLIC nameplate is pubProjection,
   which carries no person at all — see the never-add list on it. */
function lblWho(v) {
  const s = String(v || "");
  return typeof userName === "function" && s.includes("@") ? userName(s) : s;
}

function pubProjection(coll, o) {
  if (!o || !o.id) return null;
  const cls = labelClass(coll, o);
  if (!cls) return null;                       // tickets, budget, docs: not physical
  return {
    id: o.id,
    cls,
    name: o.partName || o.name || o.label || "",
    status: pubStatus(coll, o),
    /* Resolve a BIN- id to the shelf's NAME: the public nameplate a scanned
       mold shows should say "Resin shelf A", not "BIN-SN6-002". Falls back to
       the raw value for legacy free text or an unknown id. */
    location: (() => {
      const v = o.location || o.moldLocation || "";
      if (String(v).startsWith("BIN-")) {
        const b = (typeof DB === "object" && (DB.items || []).find(x => x.id === v)) || null;
        return b && b.name ? b.name : v;
      }
      return v;
    })(),
    wo: o.workOrderId || o.wo || (coll === "workOrders" ? o.id : "") || "",
    rev: o.revision || o.rev || "",
    /* R&D rides `note` rather than a new key, and that is a DEPLOYMENT decision
       rather than a tidiness one. `note` is already in firestore.rules'
       hasOnly() list and has been the empty string on every document ever
       written, so this ships with the app and nothing else has to be true at the
       same time.
       A new key would need the rules deployed FIRST, and getting that order
       wrong is silent and total: pubProjection() emits every key on every write,
       so one key the deployed rules do not accept rejects EVERY nameplate in the
       app, not just R&D ones — and pubSync() reduces that to a console.warn on
       purpose ("a mirror failure must never surface as a save failure"). The
       symptom is nothing at all, for as long as it takes somebody to scan a
       label and notice a stale answer.
       A fixed sentence, not user text, so the "no unbounded free text" rule
       above still holds. */
    note: lblIsRnd(coll, o) ? "R&D build — a real part, not a season deliverable." : "",
    updatedAt: o.updatedAt || ""
  };
}

// The class word. Mandatory on every label and always larger than the code,
// because "PART P-SN6-007" and "TICKET PROJ-SN6-007" can never be confused at
// 7pt on a greasy label while the bare codes can.
function labelClass(coll, o) {
  const byColl = { workOrders: "WORK ORDER", parts: "PART", stock: "BOARD", molds: "MOLD" };
  if (coll === "items" || coll === "lots") {
    // The class word is what stops "PART P-SN6-007" being read as
    // "TICKET PROJ-SN6-007" on a greasy label, so a record with no cls gets no
    // label rather than a blank one.
    const words = { PNL: "TEST PANEL", JIG: "JIG", BIN: "STORAGE", FAB: "FABRIC", RSN: "RESIN", CON: "CONSUMABLE" };
    return words[o.cls] || (o.cls ? String(o.cls).toUpperCase() : null);
  }
  /* The R&D bench. A STUDY is physical after all — it is the bag, the tray or
     the box the coupons live in, and that is the thing somebody picks up off a
     shelf in March wondering what it was. The first cut of this returned null
     for a study on the grounds that "a folder is not a physical object", which
     was wrong about how coupons are actually stored.

     Same no-cls-no-label rule as items and lots, for the same reason: the class
     word is what stops CPN being read as CON at 7pt with mould release on it,
     and COUPON versus CONSUMABLE are not confusable where the codes are. */
  if (coll === "rnd") {
    const words = { RDS: "STUDY", CPN: "COUPON" };
    return words[o.cls] || null;
  }
  return byColl[coll] || null;
}

function pubStatus(coll, o) {
  if (coll === "parts") return o.layupProgress || o.moldProgress || "";
  return o.status || o.stage || "";
}
// The stage word on a scanned mold is the single most useful fact after its
// name: "Ready for layup" versus "Machined" is the whole question someone is
// standing in front of it asking.

/* ---------- one label ---------- */

/* 101.6 x 25.4 mm (Avery 5161), which is also a 24mm tape label to within
 * 1.4mm — so one layout drives both the sheet path we have today and the
 * thermal path after the printer arrives. The fallback is the same design on
 * worse stock, not a degraded design.
 *
 * THE NAME LEADS (2026-08-13). The label's primary use is being READ; the QR
 * is secondary (Simon's words). The old layout put the 16pt ID first and gave
 * the name whatever was left of one shared line — about 13 characters, so
 * "FLAMMABLES CABINET" printed as "FLAMMABLES CA…". Now the name is the top
 * row at the largest size that fits, wrapping to two lines when it must
 * (nameTier below), and the ID is a 9.5pt row of its own beneath it.
 *
 * Vertical budget: 25.4mm less 2mm margin top and bottom = 21.4mm. One-line
 * name: 5.4 (14pt) + 4.0 (id) + 3.6 (key) + 2.9 + 2.9 = 18.8mm. Two-line
 * name: the mid row merges into the footer (Simon's pick: drop the least
 * useful row rather than shrink everything), 10.1 (2 x 13pt) + 4.0 + 3.6 +
 * 2.9 = 20.6mm. Still no room for a masthead bar; FEB stays a 6.5pt tag.
 *
 * The key row is the one this whole system exists for. On a part or panel it
 * is the layup stack in CS-002 shorthand ("6X 195 TWILL + .125 NOMEX"), which
 * is the literal question PP-09 records nobody being able to answer. On a
 * mold it is the sealing record. Bold at 8.5pt for that reason, and it is
 * never the row that gets merged away.
 */

/* Which size/line-count the name prints at. Pure and deterministic (char
 * count, not measurement) for the same reason labelLines uppercases in JS:
 * the width must not lie at layout time. Thresholds assume the NARROW text
 * track — the 5522 stock's 27mm QR leaves ~68mm — so both stocks fit; at
 * ~0.236mm per pt per Arial-Bold-uppercase glyph that is 20 chars at 14pt,
 * 22/line at 13pt, 26/line at 11pt, 32/line at 9pt, 36/line at 8pt. Beyond
 * two 8pt lines (72 chars) the clamp ellipsis finally wins — nothing the
 * team names comes close (worst real name: 55). */
function nameTier(name) {
  const n = String(name || "").length;
  if (n <= 20) return { cls: "n1", merge: false };   // 14pt, one line
  if (n <= 44) return { cls: "n2a", merge: true };   // 13pt, two lines
  if (n <= 52) return { cls: "n2b", merge: true };   // 11pt, two lines
  if (n <= 64) return { cls: "n2c", merge: true };   // 9pt, two lines
  return { cls: "n2d", merge: true };                // 8pt, two lines, may clip
}

function labelHtml(coll, o, opts) {
  opts = opts || {};
  const p = pubProjection(coll, o);
  if (!p) return "";
  const L = labelLines(coll, o, p);
  const t = nameTier(L.name);
  // No QR when the caller says so, or when the ID is too long to stay at
  // version 3 (coupons). Silently dropping to a denser code would be worse:
  // the label would look identical and scan worse.
  const qr = (opts.noQr || !fitsQrBudget(o.id)) ? "" : qrSvg(scanUrl(o.id), opts.qrMm || 21.4);
  const foot = t.merge ? [L.mid, L.foot].filter(Boolean).join(" · ") : L.foot;

  return `<div class="lbl" data-id="${esc(o.id)}" data-cls="${esc(p.cls)}">
    <div class="lbl-txt">
      <div class="lbl-name ${t.cls}">${esc(L.name)}</div>
      ${/* R&D goes on the ID row and nowhere else. The vertical budget above is
            spent, so this had to cost zero millimetres — and it does: the tag is
            smaller than the row it sits in, so the row cannot grow (the sums are
            in print.css beside .lbl-rnd).
            The ID row is also the only row on this label whose CONTENT IS
            LENGTH-CAPPED — 14 characters, enforced by fitsQrBudget — so it is
            the one place a mark can be put and proven never to truncate. The
            name clamps, the key row and the footer ellipsis, and the mid row is
            deleted outright whenever the name needs two lines.
            Deliberately NOT a class word: labelClass()'s list maps one-to-one
            onto id prefixes and already contains TEST PANEL for PNL, so "R&D
            PART" would immediately raise "is an R&D test panel an R&D part or a
            test panel?". R&D is an adjective on a class, so it prints as its own
            tag. */""}
      <div class="lbl-rid"><span>${esc(o.id)}</span>${lblIsRnd(coll, o) ? '<span class="lbl-rnd">R&amp;D</span>' : ""}</div>
      <div class="lbl-r2">${esc(L.key)}</div>
      ${t.merge ? "" : `<div class="lbl-r3">${esc(L.mid)}</div>`}
      <div class="lbl-r4"><span>${esc(foot)}</span><span class="lbl-feb">FEB</span></div>
    </div>
    <div class="lbl-code">${qr}</div>
  </div>`;
}

/* The stack, in the ~40 characters line 3 affords.
 *
 * `stackNote` on the retro SN5 work orders is prose, not a stack: it reads
 * `tracker shorthand: "195 88 .125 NOMEX" — ply order/orientations not recorded
 * (retro)`. Printed whole it fills the most valuable line on the label with the
 * word "shorthand" and truncates before the part anyone needs. The useful
 * content is the quoted fragment, so take that when it is there.
 *
 * Failing that, build from the real plies and collapse runs: five plies of
 * 195 twill print as "5X 195 TWILL", which is the CS-002 shorthand the team
 * already writes by hand.
 */
function stackLine(o) {
  const quoted = String(o.stackNote || "").match(/"([^"]+)"/);
  if (quoted) return quoted[1].toUpperCase();

  const plies = (o.layupStack || []).map(l => String(l.material || "").trim()).filter(Boolean);
  if (plies.length) {
    const runs = [];
    for (const m of plies) {
      const last = runs[runs.length - 1];
      if (last && last.m === m) last.n++; else runs.push({ m, n: 1 });
    }
    return runs.map(r => (r.n > 1 ? `${r.n}X ` : "") + r.m).join(" + ").toUpperCase();
  }
  return String(o.stackNote || "").toUpperCase();
}

// Per-class content. Everything is already uppercase on the label, so these
// build plain strings and the CSS does no text-transform (transform would lie
// about the width at layout time and overflow: hidden would clip the wrong
// amount).
function labelLines(coll, o, p) {
  const j = (...a) => a.filter(x => x !== "" && x != null).join(" · ");
  const up = s => String(s || "").toUpperCase();

  if (coll === "molds") {
    return {
      name: up(o.name || o.partName),
      key: j(o.sealedDate ? `SEALED ${o.sealedDate}` : "", o.sealedBy ? up(o.sealedBy) : "",
             o.uses != null ? `USES ${String(o.uses).padStart(2, "0")}` : "", o.rev ? `REV ${up(o.rev)}` : ""),
      mid: j(o.density ? `${canonDensity(o.density) ?? o.density} PCF` : "", up(o.layers), up(o.sealingType)),
      // Short because it competes with board and location for one 7pt line, and
      // the full rule lives in CS-001. "40MM" is the number someone needs while
      // holding a roll of tacky tape; the reasoning is not.
      foot: j(up(o.board), up(o.location), "KEEP-OUT 40MM")
    };
  }
  if (coll === "parts" || (coll === "items" && (o.cls === "CP" || o.cls === "PNL"))) {
    return {
      name: up(o.partName || o.name),
      key: up(o.layupSchedule || o.stack || ""),                 // the PP-09 answer
      mid: j(up(o.layupType || o.process), up(o.mold || o.moldRef), up(o.workOrderId || o.wo)),
      foot: j(o.laidOn ? `LAID ${o.laidOn}` : "", up(o.by), o.weightG ? `${o.weightG}G` : "", up(o.subteam))
    };
  }
  if (coll === "rnd") {
    /* A STUDY labels the bag. What you need while holding it in March is what
       the test was and how many pieces should be inside — a count that does not
       match what is in the bag is itself information. */
    if (o.cls === "RDS") {
      const n = lblCouponCount(o);
      return {
        name: up(o.name),
        key: j(up(lblStudyMat(o, "stack")), n ? `${n} COUPON${n === 1 ? "" : "S"}` : ""),
        mid: j(up(lblStudyMat(o, "fabricLots")), up(lblStudyMat(o, "resinLot"))),
        foot: j(o.createdOn ? `MADE ${o.createdOn}` : "", up(lblWho(o.createdBy)), up(o.status)),
      };
    }
    /* A COUPON leads with its STUDY, not its own number. In a tray of forty
       from three studies, "C03" identifies nothing — and nameTier drops to two
       lines past 20 characters, which is exactly what a study name plus a
       coupon number costs and what that ladder is there for. */
    return {
      name: up(j(lblStudyName(o), o.label)),
      key: up(lblEff(o, "stack")),                      // the PP-09 answer, same as a panel
      mid: j(up(lblEff(o, "fabricLots")), up(lblEff(o, "resinLot"))),
      foot: j(o.laidOn ? `LAID ${o.laidOn}` : "", up(lblWho(lblEff(o, "by"))), up(o.status)),
    };
  }
  if (coll === "lots") {
    return {
      name: up(o.name || o.material),
      key: j(up(o.ratio), up(o.role)),
      mid: j(o.vendorLot ? `LOT ${up(o.vendorLot)}` : "", o.openedOn ? `OPENED ${o.openedOn}` : ""),
      foot: j(o.receivedOn ? `RECD ${o.receivedOn}` : "", o.expiresOn ? `EXP ${o.expiresOn}` : "", up(o.location))
    };
  }
  if (coll === "items" && o.cls === "BIN") {
    /* The front-edge shelf label CS-001 §7.10 asks for. Before this branch a
       BIN fell through to the board layout and printed mostly blank lines. */
    return {
      name: up(o.name),
      key: "STORAGE",
      mid: j(up(o.site), up(o.locKind), o.flam === "Yes" ? "FLAMMABLES OK" : ""),
      foot: o.walkedAt ? `CONTENTS CONFIRMED ${o.walkedAt}` : "SCAN TO SEE CONTENTS"
    };
  }
  if (coll === "workOrders") {
    return {
      name: up(o.partName),
      key: stackLine(o),
      // humanProcess() turns MoldInfusion into "Mold infusion". Without it the
      // label prints the raw enum, which is how the seed data reads.
      mid: j(up(typeof humanProcess === "function" ? humanProcess(o.processType) : o.processType),
             up(o.mold && o.mold.moldId), o.revision ? `REV ${up(o.revision)}` : ""),
      foot: j(o.createdDate ? `OPENED ${o.createdDate}` : "", up(o.subteam), up(o.status))
    };
  }
  // stock (BRD) and anything else: dimensions are the identity. A real board
  // stores each dimension as {value, unit} (stock.js stores as-entered); the
  // raw object printed "[object Object]" on the label, which the old flat-
  // number test fixture could not see. Formatted here rather than through
  // stock.js's fmtDim, because test_labels mounts this file without stock.js.
  const dim = d => d == null ? ""
    : typeof d === "object" ? `${Math.round((d.value || 0) * 1000) / 1000}${d.unit === "mm" ? "MM" : "″"}`
    : String(d);
  return {
    name: up(o.label || o.name || p.cls),
    key: o.density ? `${canonDensity(o.density) ?? o.density} PCF` : "",
    mid: j(o.len && o.wid ? `${dim(o.len)} X ${dim(o.wid)} X ${dim(o.thk) || "?"}` : "", o.qty ? `QTY ${o.qty}` : ""),
    foot: j(up(o.origin || o.originLegacy), up(o.location || o.label))
  };
}

/* ---------- a sheet of them ---------- */

/* Avery 5161: 1 x 4 in, 20 per sheet, 2 columns x 10 rows.
 * Avery 5522 WeatherProof polyester: 1-1/3 x 4 in, 14 per sheet, 2 x 7.
 *
 * Deliberately does NOT use print.js's fitSheetHtml(), LAYOUTS or MAX_PAGES.
 * Those exist to squeeze a work order into two pages via a nine-rung layout
 * ladder and mean nothing for a fixed grid. This calls mountSheet() directly,
 * the same way drawings.js does for multi-page drawings.
 */
const LABEL_GRIDS = {
  "5161": { cols: 2, rows: 10, w: 4, h: 1, left: 0.15625, top: 0.5, pitchX: 4.1875, pitchY: 1, name: "Avery 5161 · 1 x 4 in · 20 up" },
  "5522": { cols: 2, rows: 7, w: 4, h: 1 + 1 / 3, left: 0.15625, top: 0.5, pitchX: 4.1875, pitchY: 1 + 1 / 3, name: "Avery 5522 WeatherProof · 1-1/3 x 4 in · 14 up" }
};

/* Browsers silently apply "Fit to page" scaling, which shifts every label on
 * the sheet by a few millimetres and ruins registration on $30 polyester. A
 * 100mm bar someone can put a steel rule against is ten seconds and catches it.
 */
function calibrationCellHtml() {
  return `<div class="lbl lbl-cal">
    <div class="lbl-calbar"><span class="lbl-caltick"></span><span class="lbl-caltick"></span><span class="lbl-caltick"></span>
      <span class="lbl-caltick"></span><span class="lbl-caltick"></span><span class="lbl-caltick"></span>
      <span class="lbl-caltick"></span><span class="lbl-caltick"></span><span class="lbl-caltick"></span><span class="lbl-caltick"></span></div>
    <div class="lbl-calnote">MEASURE ME — must be exactly 100 mm.<br>If not, set printer scaling to 100% / Actual Size.</div>
  </div>`;
}

/* recs: [{coll, o}]. skip: leave N cells blank at the start so a part-used
 * sheet gets consumed instead of binned. calibrate: burn one cell on the ruler.
 */
function labelSheetHtml(recs, opts) {
  opts = opts || {};
  const g = LABEL_GRIDS[opts.grid || "5161"];
  const per = g.cols * g.rows;
  const qrMm = opts.grid === "5522" ? 27 : 21.4;

  const cells = [];
  for (let i = 0; i < (opts.skip || 0); i++) cells.push("");
  if (opts.calibrate !== false) cells.push(calibrationCellHtml());
  for (const r of recs) cells.push(labelHtml(r.coll, r.o, { qrMm }));

  const pages = [];
  for (let i = 0; i < cells.length; i += per) {
    const slice = cells.slice(i, i + per);
    const inner = slice.map((html, k) => {
      const col = k % g.cols, row = Math.floor(k / g.cols);
      const x = g.left + col * g.pitchX, y = g.top + row * g.pitchY;
      return `<div class="label-cell" style="left:${x}in;top:${y}in;width:${g.w}in;height:${g.h}in">${html}</div>`;
    }).join("");
    pages.push(`<div class="ws-page label-sheet" data-grid="${esc(opts.grid || "5161")}">${inner}</div>`);
  }
  // Same .wsheet wrapper print.js uses, so the --hair/--heavy/--shade vars and
  // the box-sizing reset apply here too. .labels only adds the grid geometry.
  return `<div class="wsheet labels">${pages.join("")}</div>`;
}

function openLabelPreview(recs, opts) {
  const html = labelSheetHtml(recs, opts);
  const g = LABEL_GRIDS[(opts && opts.grid) || "5161"];
  mountSheet(html, true, `${recs.length} label${recs.length === 1 ? "" : "s"} · ${g.name}`, `labels-${today()}`);
  /* mountSheet() puts the sheet in #printroot but does NOT reveal it: the
     screen-side switch is `body.previewing #app { display: none }`, and every
     caller adds that class itself (print.js:409 and :422, drawings.js:1188).
     Without this line the sheet mounts correctly, every DOM assertion passes,
     and the user sees the page they were already on. */
  document.body.classList.add("previewing");
}

// One button, four call sites (work orders, parts, stock, molds), so the markup
// can't drift between them.
function labelBtn(coll, id) {
  return `<button class="ib" onclick="printOneLabel('${esc(coll)}','${esc(id)}')" title="Print a 4x1 label">${icon("print", 15)} Label</button>`;
}

function printOneLabel(coll, id) {
  const o = recById(coll, id);
  if (!o) { toast("Record not found.", "error"); return; }
  openLabelPreview([{ coll, o }]);
}

/* ---------- batch: a sheet of labels for a set of records ----------
 *
 * The start-position picker is the feature that pays here. Avery 5161 is 20 up,
 * so printing three labels onto a fresh sheet throws away seventeen. Being able
 * to say "start at cell 8" means a part-used sheet gets finished instead of
 * binned, which roughly halves the real cost per label on the paper path.
 */

// Which collections can produce a label at all, in the order a person would
// think of them. Tickets and budget are absent on purpose: they are not
// physical objects, which is also what keeps PROJ- codes off a label sheet
// where they could be misread as P-.
const LABELABLE = [
  ["molds", "Molds"],
  ["parts", "Parts"],
  ["workOrders", "Work orders"],
  ["stock", "Tooling board"],
  ["items", "Panels & items"],
  ["lots", "Material lots"],
  ["rnd", "R&D studies & coupons"],
];

let LB = { coll: "parts", picked: {}, skip: 0, grid: "5161", cal: true };

function openLabelBuilder(coll) {
  LB = { coll: coll || "parts", picked: {}, skip: 0, grid: "5161", cal: true };
  openModal(labelBuilderHtml());
}

function labelBuilderHtml() {
  const avail = LABELABLE.filter(([c]) => (DB[c] || []).length);
  if (!avail.length) return `<h3>Labels</h3><p class="muted">Nothing to label yet.</p>
    <div class="foot"><button onclick="closeModal()">Close</button></div>`;
  if (!avail.some(([c]) => c === LB.coll)) LB.coll = avail[0][0];

  const rows = (DB[LB.coll] || []).slice()
    .sort((a, b) => cmpId(a.id, b.id));
  const n = Object.values(LB.picked).filter(Boolean).length;
  const per = LABEL_GRIDS[LB.grid].cols * LABEL_GRIDS[LB.grid].rows;
  const used = n + LB.skip + (LB.cal ? 1 : 0);

  return `<h3>Print labels</h3>
  <div class="field"><label>What</label>
    <select onchange="LB.coll=this.value;LB.picked={};lbRefresh()">
      ${avail.map(([c, lab]) => `<option value="${c}" ${c === LB.coll ? "selected" : ""}>${esc(lab)} (${(DB[c] || []).length})</option>`).join("")}
    </select></div>
  <div class="field"><label>Stock</label>
    <select onchange="LB.grid=this.value;lbRefresh()">
      ${Object.entries(LABEL_GRIDS).map(([k, g]) => `<option value="${k}" ${k === LB.grid ? "selected" : ""}>${esc(g.name)}</option>`).join("")}
    </select></div>
  <div class="field"><label>Start at cell</label>
    <input type="number" min="1" max="${per}" value="${LB.skip + 1}"
      onchange="LB.skip=Math.max(0,Math.min(${per - 1},(parseInt(this.value,10)||1)-1));lbRefresh()">
    <div class="muted tny">Leave blank cells at the top so a part-used sheet gets finished instead of binned.</div>
  </div>
  <label class="chk"><input type="checkbox" ${LB.cal ? "checked" : ""} onchange="LB.cal=this.checked;lbRefresh()">
    Include the 100 mm calibration bar <span class="muted tny">(catches the browser's silent "Fit to page" scaling)</span></label>
  <div class="lbpick">
    <div class="toolbar no-print" style="margin:6px 0">
      <button class="sm" onclick="lbAll(true)">Select all</button>
      <button class="sm" onclick="lbAll(false)">None</button>
      <span class="muted" style="margin-left:auto;align-self:center">${n} selected · ${Math.ceil(Math.max(used, 1) / per)} sheet${used > per ? "s" : ""}</span>
    </div>
    <div class="lblist">${rows.map(o => `<label class="chk"><input type="checkbox" ${LB.picked[o.id] ? "checked" : ""}
      onchange="LB.picked['${esc(o.id)}']=this.checked;lbRefresh()"> <b>${esc(o.id)}</b>
      <span class="muted">${esc(o.partName || o.name || o.label || "")}</span>${rndBadge(recIsRnd(LB.coll, o))}</label>`).join("")}</div>
  </div>
  <div class="foot">
    <button onclick="closeModal()">Cancel</button>
    <button class="primary" ${n ? "" : "disabled"} onclick="lbPrint()">Preview ${n || ""} label${n === 1 ? "" : "s"}</button>
  </div>`;
}

// Re-render in place. The modal is rebuilt rather than diffed, which is what
// every other picker in the app does; the list is short enough that it is free.
function lbRefresh() {
  const m = document.querySelector("#modal .modal");
  if (m) m.innerHTML = labelBuilderHtml();
}
function lbAll(on) {
  (DB[LB.coll] || []).forEach(o => { LB.picked[o.id] = on; });
  lbRefresh();
}
function lbPrint() {
  const recs = (DB[LB.coll] || [])
    .filter(o => LB.picked[o.id])
    .sort((a, b) => cmpId(a.id, b.id))
    .map(o => ({ coll: LB.coll, o }));
  if (!recs.length) return;
  closeModal();
  openLabelPreview(recs, { skip: LB.skip, grid: LB.grid, calibrate: LB.cal });
}
