#!/usr/bin/env node
/* Firestore security-rules tests for 03 Work Orders/firestore.rules.
   Runs against the Firestore emulator via its REST API, with unsigned JWTs
   (the emulator accepts them — same trick @firebase/rules-unit-testing uses).
   Run from "03 Work Orders/":
     firebase emulators:exec --only firestore --project demo-feb-work-orders \
       "node '../tools/test_wo_rules.mjs'"                                    */

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
  owner: "Bearer owner", // emulator admin bypass, for seeding
  lead: "Bearer " + token("lead@feb.test", "uid-lead"),
  member: "Bearer " + token("member@feb.test", "uid-member"),
  rando: "Bearer " + token("rando@feb.test", "uid-rando"),
  none: null,
};

async function req(as, method, path, fields, mask) {
  const headers = { "Content-Type": "application/json" };
  if (AUTH[as]) headers.Authorization = AUTH[as];
  // A mask makes PATCH a partial update (like updateDoc) instead of a full
  // replace, so roster self-edit tests only touch the field they send.
  const qs = mask ? "?" + mask.map(f => "updateMask.fieldPaths=" + f).join("&") : "";
  const res = await fetch(BASE + path + qs, {
    method, headers, body: fields ? JSON.stringify({ fields }) : undefined,
  });
  return res.status;
}
const S = (v) => ({ stringValue: v });
const N = (v) => ({ integerValue: String(v) });

let pass = 0, fail = 0;
async function expect(status, as, method, path, fields, mask) {
  const got = await req(as, method, path, fields, mask);
  const ok = got === status;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${as.padEnd(6)} ${method.padEnd(6)} ${path}  → ${got} (want ${status})`);
}

// seed roster as admin
await expect(200, "owner", "PATCH", "/roster/lead@feb.test", { name: S("Lead"), role: S("lead") });
await expect(200, "owner", "PATCH", "/roster/member@feb.test", { name: S("Member"), role: S("member") });

console.log("unauthenticated:");
await expect(403, "none", "GET", "/workOrders/WO-T-001");
await expect(403, "none", "PATCH", "/workOrders/WO-T-001", { id: S("WO-T-001") });

console.log("authenticated but not on roster:");
await expect(403, "rando", "GET", "/workOrders/WO-T-001");
await expect(403, "rando", "PATCH", "/workOrders/WO-T-001", { id: S("WO-T-001") });
await expect(403, "rando", "GET", "/roster/rando@feb.test");
await expect(403, "rando", "PATCH", "/roster/rando@feb.test", { name: S("Sneaky"), role: S("lead") });

console.log("member:");
await expect(200, "member", "PATCH", "/workOrders/WO-T-001", { id: S("WO-T-001"), partName: S("test part") });
await expect(200, "member", "GET", "/workOrders/WO-T-001");
await expect(200, "member", "PATCH", "/workOrders/WO-T-001", { id: S("WO-T-001"), partName: S("edited") });
await expect(200, "member", "GET", "/roster/lead@feb.test");
await expect(403, "member", "DELETE", "/workOrders/WO-T-001");
await expect(403, "member", "PATCH", "/roster/friend@feb.test", { name: S("Friend"), role: S("member") });
await expect(403, "member", "DELETE", "/roster/lead@feb.test");

console.log("new collections (member CRUD, lead-only delete):");
for (const coll of ["parts", "projects", "schedule", "budget"]) {
  await expect(200, "member", "PATCH", `/${coll}/X-001`, { id: S("X-001"), name: S("t") });
  await expect(200, "member", "GET", `/${coll}/X-001`);
  await expect(403, "member", "DELETE", `/${coll}/X-001`);
  await expect(403, "rando", "GET", `/${coll}/X-001`);
  await expect(200, "lead", "DELETE", `/${coll}/X-001`);
}

console.log("documents (member upload/edit, lead-only delete):");
await expect(200, "member", "PATCH", "/documents/D1", { id: S("D1"), title: S("guide") });
await expect(200, "member", "PATCH", "/documents/D1", { id: S("D1"), title: S("guide v2") });
await expect(200, "member", "GET", "/documents/D1");
await expect(403, "rando", "GET", "/documents/D1");
await expect(403, "member", "DELETE", "/documents/D1");
await expect(200, "lead", "DELETE", "/documents/D1");

console.log("notifications (create by roster, read scoped to `to`):");
await expect(200, "owner", "PATCH", "/notifications/NL", { to: S("lead@feb.test"), text: S("for lead") });
await expect(200, "owner", "PATCH", "/notifications/NM", { to: S("member@feb.test"), text: S("for member") });
await expect(200, "member", "PATCH", "/notifications/NX", { to: S("lead@feb.test"), from: S("member@feb.test"), text: S("member creates a ping from self") });
await expect(403, "member", "PATCH", "/notifications/NF", { to: S("lead@feb.test"), from: S("someone@else.test"), text: S("forged from") }); // can't forge `from`
await expect(200, "member", "GET", "/notifications/NM");           // my own
await expect(403, "member", "GET", "/notifications/NL");           // addressed to someone else
await expect(200, "member", "PATCH", "/notifications/NM", { to: S("member@feb.test"), read: { booleanValue: true } }, ["read"]); // mark my own read
await expect(403, "member", "PATCH", "/notifications/NL", { read: { booleanValue: true } }, ["read"]); // can't touch others'
await expect(403, "rando", "GET", "/notifications/NM");

console.log("per-collection counters (increment-only):");
await expect(200, "member", "PATCH", "/meta/parts", { next: N(2) });      // create
await expect(200, "member", "PATCH", "/meta/parts", { next: N(3) });      // increment ok
await expect(403, "member", "PATCH", "/meta/parts", { next: N(99) });     // jump blocked
await expect(403, "member", "PATCH", "/meta/parts", { next: N(1) });      // rewind blocked
await expect(200, "member", "PATCH", "/meta/workOrders", { next: N(2) }); // independent counter

console.log("roster self-edit (avatar/name only, never role):");
await expect(200, "member", "PATCH", "/roster/member@feb.test", { avatar: S("http://x/a.jpg") }, ["avatar"]); // own avatar ok
await expect(200, "member", "PATCH", "/roster/member@feb.test", { name: S("Member Renamed") }, ["name"]);   // own name ok
await expect(403, "member", "PATCH", "/roster/member@feb.test", { role: S("lead") }, ["role"]);             // self-promote blocked
await expect(403, "member", "PATCH", "/roster/lead@feb.test", { avatar: S("http://x/b.jpg") }, ["avatar"]); // someone else's doc blocked
await expect(200, "lead", "PATCH", "/roster/member@feb.test", { avatar: S("http://x/c.jpg") }, ["avatar"]); // lead can edit anyone

console.log("lead:");
await expect(200, "lead", "PATCH", "/roster/new@feb.test", { name: S("New"), role: S("member") });
await expect(200, "lead", "DELETE", "/roster/new@feb.test");
await expect(200, "lead", "DELETE", "/workOrders/WO-T-001");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
