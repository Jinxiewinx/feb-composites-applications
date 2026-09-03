#!/usr/bin/env node
/* Firestore rules tests for the `pub` collection — the public scan nameplate.
 *
 * pub/<ID> is the ONLY document in this database an unauthenticated person can
 * read. That is a deliberate hole in an otherwise closed system, so it gets its
 * own file rather than a few lines bolted onto test_wo_rules.mjs.
 *
 * THE ASSERTION THAT MATTERS MOST is not that `pub` is readable. It is that
 * everything else still is NOT. A rules change that opens a public read is one
 * misplaced brace away from opening the whole database, and the failure is
 * silent: the app keeps working perfectly. So the regression check below reads
 * workOrders, parts, roster and budget as an anonymous caller and requires 403
 * on every one.
 *
 * The second is hasOnly(). pubProjection() in app/labels.js is the first line
 * of defence and the rules are the second, because a refactor that accidentally
 * spread a whole record into the projection would otherwise publish layup
 * stacks and people's names with nothing to stop it.
 *
 * Run from "06 Composites App/":
 *   firebase emulators:exec --only firestore --project demo-feb-work-orders \
 *     "node '../tools/test_pub_rules.mjs'"
 */

const PID = "demo-feb-work-orders";
const BASE = `http://127.0.0.1:8080/v1/projects/${PID}/databases/(default)/documents`;

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString("base64url"); }
function token(email, uid) {
  const now = Math.floor(Date.now() / 1000);
  return b64url({ alg: "none", typ: "JWT" }) + "." + b64url({
    sub: uid, user_id: uid, email, email_verified: true,
    aud: PID, iss: `https://securetoken.google.com/${PID}`,
    iat: now, exp: now + 3600, auth_time: now,
    firebase: { sign_in_provider: "password", identities: { email: [email] } },
  }) + ".";
}
/* A GUEST: Firebase anonymous auth. No email claim at all, and a provider of
   "anonymous" — which is what firestore.rules keys on, deliberately, rather
   than on the absent email. */
function anonToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  return b64url({ alg: "none", typ: "JWT" }) + "." + b64url({
    sub: uid, user_id: uid, email_verified: false,
    aud: PID, iss: `https://securetoken.google.com/${PID}`,
    iat: now, exp: now + 3600, auth_time: now,
    firebase: { sign_in_provider: "anonymous", identities: {} },
  }) + ".";
}
const AUTH = {
  owner: "Bearer owner",                                   // emulator admin, for seeding
  lead: "Bearer " + token("lead@feb.test", "uid-lead"),
  member: "Bearer " + token("member@feb.test", "uid-member"),
  rando: "Bearer " + token("rando@feb.test", "uid-rando"), // signed in, NOT on the roster
  joiner: "Bearer " + token("joiner@feb.test", "uid-joiner"), // signed in, about to self-join (v4.4.0)
  guest: "Bearer " + anonToken("uid-guest"),               // "view as guest"
  none: null,                                              // the phone that scanned the label
};

async function req(as, method, path, fields) {
  const headers = { "Content-Type": "application/json" };
  if (AUTH[as]) headers.Authorization = AUTH[as];
  const res = await fetch(BASE + path, {
    method, headers, body: fields ? JSON.stringify({ fields }) : undefined,
  });
  return res.status;
}
const S = v => ({ stringValue: v });
// meta/<coll>.next is an int, and the rule tests `is int` — a stringValue here
// would be refused for the wrong reason and prove nothing about the guest.
const I = v => ({ integerValue: String(v) });

let pass = 0, fail = 0;
async function expect(status, as, method, path, fields, why) {
  const got = await req(as, method, path, fields);
  const ok = got === status;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${as.padEnd(6)} ${method.padEnd(6)} ${path.padEnd(34)} → ${got} (want ${status})${why ? "   " + why : ""}`);
}

// The exact shape pubProjection() produces. Keep in step with labels.js and the
// hasOnly() list in firestore.rules; those three are one contract.
const NAMEPLATE = {
  id: S("MOLD-SN6-004"), cls: S("MOLD"), name: S("UT INLET"),
  status: S("Sealed"), location: S("RFS container"), wo: S("WO-SN6-031"),
  rev: S("A"), note: S(""), updatedAt: S("2026-09-14"),
};

/* ---------- seed ---------- */
await expect(200, "owner", "PATCH", "/roster/lead@feb.test", { name: S("Lead"), role: S("lead") });
await expect(200, "owner", "PATCH", "/roster/member@feb.test", { name: S("Member"), role: S("member") });
await expect(200, "owner", "PATCH", "/pub/MOLD-SN6-004", NAMEPLATE);
await expect(200, "owner", "PATCH", "/workOrders/WO-SN6-031", { id: S("WO-SN6-031"), partName: S("UT INLET") });
await expect(200, "owner", "PATCH", "/parts/P-SN6-007", { id: S("P-SN6-007"), partName: S("UT INLET") });
await expect(200, "owner", "PATCH", "/budget/BUY-SN6-001", { id: S("BUY-SN6-001"), cost: S("412") });
/* Four config keys, seeded so the guest allowlist below is tested against
   documents that EXIST. Without them an allowed read returns 404 and a denied
   one returns 403 — which happens to prove the rule, and proves it by accident.
   Seeded, a pass is a real read and a real refusal. */
await expect(200, "owner", "PATCH", "/config/season", { compName: S("FSAE Michigan"), compDate: S("2027-05-12") });
await expect(200, "owner", "PATCH", "/config/release", { version: S("2.2.2") });
await expect(200, "owner", "PATCH", "/config/slack", { webhookUrl: S("https://hooks.example/T/B/XXX") });
await expect(200, "owner", "PATCH", "/config/tracker", { token: S("0123456789abcdef0123456789abcdef") });

console.log("\nthe hole, which is supposed to be there:");
await expect(200, "none", "GET", "/pub/MOLD-SN6-004", null, "a scanned label resolves with no account");
await expect(200, "rando", "GET", "/pub/MOLD-SN6-004", null, "and for a signed-in non-member too");

console.log("\nand nothing around it — this is the regression check:");
/* If a rules edit ever widens the public read beyond `pub`, the app keeps
   working perfectly and nobody notices. These four lines are the only thing
   that would say so. */
await expect(403, "none", "GET", "/workOrders/WO-SN6-031", null, "layup stacks, steps, buy-offs");
await expect(403, "none", "GET", "/parts/P-SN6-007");
await expect(403, "none", "GET", "/roster/lead@feb.test", null, "everybody's email address");
await expect(403, "none", "GET", "/budget/BUY-SN6-001", null, "supplier pricing");
await expect(403, "rando", "GET", "/workOrders/WO-SN6-031", null, "signed in is not the same as rostered");

console.log("\nthe collection cannot be enumerated:");
/* `get` not `read`. Someone holding one ID gets that one document; nobody gets
   to dump the collection and learn how many molds exist, what the season's part
   list is, or which IDs are worth trying. */
await expect(403, "none", "GET", "/pub");
await expect(403, "rando", "GET", "/pub");
await expect(200, "member", "GET", "/pub", null, "a roster member may list");

console.log("\nwriting the mirror:");
await expect(200, "member", "PATCH", "/pub/P-SN6-007",
  { ...NAMEPLATE, id: S("P-SN6-007"), cls: S("PART") }, "any member, because any member can save a record");
await expect(403, "none", "PATCH", "/pub/P-SN6-099", { ...NAMEPLATE, id: S("P-SN6-099") },
  "the public may read, never write");
await expect(403, "rando", "PATCH", "/pub/P-SN6-099", { ...NAMEPLATE, id: S("P-SN6-099") });

console.log("\nthe id must match the document it is stored under:");
/* Otherwise a nameplate could claim to be a different record than the one the
   scanner asked for, which is the one thing a label must never do. */
await expect(403, "member", "PATCH", "/pub/P-SN6-050", { ...NAMEPLATE, id: S("SOMETHING-ELSE") });

console.log("\nhasOnly(): the second line of defence behind pubProjection():");
/* Each of these is a field that has appeared on a real record and must never
   reach a public URL. They are rejected by the SERVER, so a bug in
   pubProjection() cannot publish them. */
for (const [field, value, what] of [
  ["layupStack", S("6X 195 twill + .125 Nomex"), "the team's actual laminate"],
  ["updatedBy", S("simon@berkeley.edu"), "an email address"],
  ["buyoff", S("Simon Starbuck"), "who signed a step"],
  ["files", S("https://firebasestorage.googleapis.com/v0/b/x/o/y?token=SECRET"), "a storage bearer token"],
  ["cost", S("412.50"), "money"],
  ["comments", S("porosity on the flange"), "unbounded free text"],
]) {
  await expect(403, "member", "PATCH", "/pub/P-SN6-060", { ...NAMEPLATE, id: S("P-SN6-060"), [field]: value }, what);
}

console.log("\ndeleting the mirror:");
/* Deliberately looser than every other collection here, where delete is
   lead-only. A public nameplate outliving its record is worse than a member
   being able to remove one, and fb.del() has to clean up on the same path any
   member can delete a record on. */
await expect(200, "member", "DELETE", "/pub/P-SN6-007", null, "a member may, unlike everywhere else");
await expect(403, "none", "DELETE", "/pub/MOLD-SN6-004");
await expect(403, "rando", "DELETE", "/pub/MOLD-SN6-004");

/* ================= tracker/<token> — the Google Sheet mirror feed =========== */

/* The second deliberate hole, and a wider one: pub/<ID> hands out one
   nameplate, this hands out the entire season's part list plus engineer names
   and comment text. What protects it is that the document id is a 32-char
   secret rather than a guessable path, so these tests are mostly about proving
   the secret cannot be discovered from inside. */

const TOKEN = "3f9c1a7b2e4d6058a1b3c5d7e9f02468";
const ROWS = {
  rows: { arrayValue: { values: [
    { stringValue: JSON.stringify({ id: "P-SN6-001", partName: "UT INLET" }) },
  ] } },
  count: { integerValue: "1" },
  updatedAt: S("2026-08-15T18:00:00.000Z"),
};

console.log("\nthe tracker feed, which the spreadsheet fetches with no credentials:");
await expect(200, "member", "PATCH", `/tracker/${TOKEN}`, ROWS, "any member's part edit refreshes it");
await expect(200, "none", "GET", `/tracker/${TOKEN}`, null, "Apps Script pulls with no auth header at all");

console.log("\nbut the token cannot be discovered by listing:");
/* `list: if false`, denied to EVERYONE including leads — not because members
   are untrusted (they can read config/tracker anyway) but so that a stolen
   session or a future bug widening config still cannot enumerate its way to
   the URL. This is the assertion that keeps the secret a secret. */
await expect(403, "none", "GET", "/tracker");
await expect(403, "rando", "GET", "/tracker");
await expect(403, "member", "GET", "/tracker", null, "even a roster member may not enumerate");
await expect(403, "lead", "GET", "/tracker", null, "and neither may a lead");

console.log("\nthe public may read the feed, never write it:");
await expect(403, "none", "PATCH", `/tracker/${TOKEN}`, ROWS);
await expect(403, "rando", "PATCH", `/tracker/${TOKEN}`, ROWS, "signed in is not rostered");

console.log("\nhasOnly() behind trackerSnapshot():");
/* The projection in app/tracker.js builds the row field by field precisely so
   a whole record cannot be spread into it. These prove the server refuses
   anyway. `updatedBy` matters most: importMany() would add it automatically,
   which is why fb.publishTracker() must never use importMany. */
for (const [field, value, what] of [
  ["updatedBy", S("simon@berkeley.edu"), "the stamp importMany would have added"],
  ["commentLog", S("Simon: this is blocked on Nick"), "the threaded comment log"],
  ["layupStack", S("6X 195 twill + .125 Nomex"), "the team's actual laminate"],
  ["files", S("https://firebasestorage.googleapis.com/v0/b/x/o/y?token=SECRET"), "a storage bearer token"],
]) {
  await expect(403, "member", "PATCH", `/tracker/${TOKEN}`, { ...ROWS, [field]: value }, what);
}

console.log("\nand the feed cannot grow without bound:");
/* rows.size() <= 500. A runaway import must not be able to publish a document
   so large the spreadsheet can never fetch it. */
await expect(403, "member", "PATCH", `/tracker/${TOKEN}`, {
  ...ROWS,
  rows: { arrayValue: { values: Array.from({ length: 501 }, (_, i) => ({ stringValue: `{"id":"P-${i}"}` })) } },
}, "501 rows is refused");

console.log("\nand nothing else opened up alongside it:");
/* Same regression check as above, re-run after the tracker block, because the
   whole risk of adding a second public hole is that it widens the first. */
await expect(403, "none", "GET", "/parts/P-SN6-007", null, "still closed");
await expect(403, "none", "GET", "/config/tracker", null, "the token's home is roster-only");

/* ---------- the guest ----------
   THE OTHER TWO NEGATIVE IDENTITIES STAY NEGATIVE, and that is the first thing
   to check. A caller with no token at all is not a guest — it is the phone that
   scanned a label, and the public scan page's contract is that it reads exactly
   two documents by id. A signed-in caller with an email who is not on the
   roster is not a guest either; that is the "pending" screen. Every 403 above
   is still a 403, which is why this section ADDS to that file rather than
   revising it. */
console.log("\n-- guest (anonymous auth): reads everything, writes nothing --");
await expect(200, "guest", "GET", "/workOrders/WO-SN6-031", null, "the whole app is readable");
await expect(200, "guest", "GET", "/parts/P-SN6-007");
await expect(200, "guest", "GET", "/budget/BUY-SN6-001", null, "money included — Simon's call");
await expect(200, "guest", "GET", "/roster/lead@feb.test", null,
  "and the roster, so buy-offs show names rather than initials");

/* Not one write, anywhere. onRoster() fails for a guest on its email clause, so
   every create/update/delete clause in the file refuses without ever having
   heard of guest() — which is the point of putting guest() in read only. */
await expect(403, "guest", "PATCH", "/workOrders/WO-SN6-031", { id: S("WO-SN6-031") }, "no write");
await expect(403, "guest", "PATCH", "/parts/P-SN6-007", { id: S("P-SN6-007") });
await expect(403, "guest", "PATCH", "/roster/lead@feb.test", { name: S("Hacked") },
  "and certainly not the roster");
await expect(403, "guest", "DELETE", "/parts/P-SN6-007");
await expect(403, "guest", "PATCH", "/meta/parts", { next: I(99) },
  "nor the id counter — a guest cannot mint an id to hang a record on");

/* The two live credentials in config/. Opening this collection to a guest would
   hand out a Slack webhook and the token that IS the security on /tracker. */
await expect(200, "guest", "GET", "/config/season", null, "the countdown renders");
await expect(200, "guest", "GET", "/config/release");
await expect(403, "guest", "GET", "/config/slack", null, "but not a live webhook URL");
await expect(403, "guest", "GET", "/config/tracker", null,
  "and NOT the feed token, which is the whole security on /tracker/{token}");
await expect(403, "guest", "GET", "/notifications/N1", null, "notifications are addressed to somebody");
await expect(403, "guest", "GET", "/pub", null, "and pub still cannot be enumerated by anyone");

console.log("\ndeleting the feed is a lead's call:");
await expect(403, "member", "DELETE", `/tracker/${TOKEN}`, null, "unlike pub, this is not member-deletable");
await expect(200, "lead", "DELETE", `/tracker/${TOKEN}`);


/* ---------- self-join (v4.4.0) ----------
   Anyone signs up and lands on the roster as a member by writing their OWN
   doc with exactly the four sign-up fields. Everything a lead used to do to
   roles stays lead-only. */
const T = v => ({ timestampValue: v });
const JOIN = { name: S("Joiner"), role: S("member"), addedBy: S("self"), addedAt: T("2026-09-03T00:00:00Z") };
console.log("\nself-join: a new account puts itself on the roster, as a member, and nothing more:");
await expect(403, "joiner", "PATCH", "/roster/joiner@feb.test", { ...JOIN, role: S("lead") }, "cannot make itself a lead");
await expect(403, "joiner", "PATCH", "/roster/joiner@feb.test", { ...JOIN, avatar: S("x") }, "cannot ride extra fields in");
await expect(403, "joiner", "PATCH", "/roster/somebody@feb.test", JOIN, "cannot create anyone else's doc");
await expect(403, "guest", "PATCH", "/roster/guest@feb.test", JOIN, "a guest has no email to join with");
await expect(200, "joiner", "PATCH", "/roster/joiner@feb.test", JOIN, "own doc, member, four fields: in");
await expect(200, "joiner", "GET", "/parts/P-SN6-007", null, "and the database talks to them now");
await expect(403, "joiner", "PATCH", "/roster/joiner@feb.test", { role: S("lead") }, "promotion is still not self-service");
await expect(200, "joiner", "PATCH", "/roster/joiner@feb.test?updateMask.fieldPaths=name", { name: S("Renamed") }, "but the display name is theirs to change");
await expect(200, "lead", "PATCH", "/roster/joiner@feb.test?updateMask.fieldPaths=role", { role: S("lead") }, "a lead makes leads");
await expect(403, "member", "DELETE", "/roster/joiner@feb.test", null, "and only a lead removes");
await expect(200, "lead", "DELETE", "/roster/joiner@feb.test");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
