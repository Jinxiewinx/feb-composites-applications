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
 * Run from "03 App/":
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
const AUTH = {
  owner: "Bearer owner",                                   // emulator admin, for seeding
  lead: "Bearer " + token("lead@feb.test", "uid-lead"),
  member: "Bearer " + token("member@feb.test", "uid-member"),
  rando: "Bearer " + token("rando@feb.test", "uid-rando"), // signed in, NOT on the roster
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

console.log("\ndeleting the feed is a lead's call:");
await expect(403, "member", "DELETE", `/tracker/${TOKEN}`, null, "unlike pub, this is not member-deletable");
await expect(200, "lead", "DELETE", `/tracker/${TOKEN}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
