#!/usr/bin/env node
/* Firestore security-rules tests for firestore.rules, in the style of
   03 App's tools/test_wo_rules.mjs: the Firestore emulator's REST API with
   unsigned JWTs, which the emulator accepts. Run from this folder:
     npm run test:rules
   which expands to
     firebase emulators:exec --only firestore --project demo-feb-cfd \
       "node tools/test_rules.mjs"
   Every match block in firestore.rules has at least one case here. Add the
   case in the same commit as the rule. */

const PID = "demo-feb-cfd";
const BASE = `http://127.0.0.1:8090/v1/projects/${PID}/databases/(default)/documents`;

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString("base64url"); }
function token(email, uid, provider = "password") {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: uid, user_id: uid, aud: PID, iss: `https://securetoken.google.com/${PID}`,
    iat: now, exp: now + 3600, auth_time: now,
    firebase: { sign_in_provider: provider, identities: email ? { email: [email] } : {} },
  };
  if (email) { claims.email = email; claims.email_verified = true; }
  return b64url({ alg: "none", typ: "JWT" }) + "." + b64url(claims) + ".";
}
const AUTH = {
  owner: "Bearer owner", // emulator admin bypass, for seeding
  lead: "Bearer " + token("lead@feb.test", "uid-lead"),
  member: "Bearer " + token("member@feb.test", "uid-member"),
  rando: "Bearer " + token("rando@feb.test", "uid-rando"),
  guest: "Bearer " + token(null, "uid-guest", "anonymous"),
  none: null,
};

async function req(as, method, path, fields, mask) {
  const headers = { "Content-Type": "application/json" };
  if (AUTH[as]) headers.Authorization = AUTH[as];
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

console.log("seed:");
await expect(200, "owner", "PATCH", "/roster/lead@feb.test", { name: S("Lead"), role: S("lead") });
await expect(200, "owner", "PATCH", "/roster/member@feb.test", { name: S("Member"), role: S("member") });
await expect(200, "owner", "PATCH", "/sims/SIM-SN6-001", { id: S("SIM-SN6-001"), createdBy: S("member@feb.test") });
await expect(200, "owner", "PATCH", "/sims/SIM-SN6-002", { id: S("SIM-SN6-002"), createdBy: S("lead@feb.test") });
await expect(200, "owner", "PATCH", "/sims/SIM-SN6-003", { id: S("SIM-SN6-003") }); // predates createdBy
await expect(200, "owner", "PATCH", "/config/release", { version: S("0.0.0") });

console.log("unauthenticated:");
await expect(403, "none", "GET", "/sims/SIM-SN6-001");
await expect(403, "none", "PATCH", "/sims/SIM-SN6-009", { id: S("SIM-SN6-009") });
await expect(403, "none", "GET", "/config/release");

console.log("authenticated but not on roster:");
await expect(403, "rando", "GET", "/sims/SIM-SN6-001");
await expect(403, "rando", "PATCH", "/sims/SIM-SN6-009", { id: S("SIM-SN6-009") });
await expect(403, "rando", "PATCH", "/roster/rando@feb.test", { name: S("Sneaky"), role: S("lead") });

console.log("guest (anonymous): read everything a member reads, write nothing:");
await expect(200, "guest", "GET", "/sims/SIM-SN6-001");
await expect(200, "guest", "GET", "/roster/lead@feb.test");
await expect(200, "guest", "GET", "/config/release");
await expect(403, "guest", "PATCH", "/sims/SIM-SN6-001", { note: S("x") }, ["note"]);
await expect(403, "guest", "PATCH", "/sims/SIM-SN6-009", { id: S("SIM-SN6-009") });
await expect(403, "guest", "DELETE", "/sims/SIM-SN6-001");
await expect(403, "guest", "GET", "/meta/sims");

console.log("member:");
await expect(200, "member", "GET", "/sims/SIM-SN6-001");
await expect(200, "member", "PATCH", "/sims/SIM-SN6-010", { id: S("SIM-SN6-010"), createdBy: S("member@feb.test") });
await expect(200, "member", "PATCH", "/sims/SIM-SN6-010", { note: S("edited") }, ["note"]);
await expect(200, "member", "PATCH", "/geometries/GEO-SN6-001", { id: S("GEO-SN6-001") });
await expect(200, "member", "PATCH", "/studies/STD-SN6-001", { id: S("STD-SN6-001"), createdBy: S("member@feb.test") });
await expect(200, "member", "GET", "/roster/lead@feb.test");
await expect(403, "member", "PATCH", "/roster/friend@feb.test", { name: S("Friend"), role: S("member") });
await expect(403, "member", "DELETE", "/roster/lead@feb.test");
await expect(403, "member", "PATCH", "/config/release", { version: S("9.9.9") });

console.log("delete: your own (undo) or a lead; geometries lead-only:");
await expect(200, "member", "DELETE", "/sims/SIM-SN6-001");   // mine
await expect(403, "member", "DELETE", "/sims/SIM-SN6-002");   // someone else's
await expect(403, "member", "DELETE", "/sims/SIM-SN6-003");   // no createdBy: lead-only
await expect(200, "member", "DELETE", "/studies/STD-SN6-001"); // mine
await expect(403, "member", "DELETE", "/geometries/GEO-SN6-001");
await expect(200, "lead",   "DELETE", "/sims/SIM-SN6-002");
await expect(200, "lead",   "DELETE", "/sims/SIM-SN6-003");
await expect(200, "lead",   "DELETE", "/geometries/GEO-SN6-001");

console.log("roster self-edit (name/avatar only, never role):");
await expect(200, "member", "PATCH", "/roster/member@feb.test", { avatar: S("http://x/a.jpg") }, ["avatar"]);
await expect(200, "member", "PATCH", "/roster/member@feb.test", { name: S("Member Renamed") }, ["name"]);
await expect(403, "member", "PATCH", "/roster/member@feb.test", { role: S("lead") }, ["role"]);
await expect(403, "member", "PATCH", "/roster/lead@feb.test", { avatar: S("http://x/b.jpg") }, ["avatar"]);
await expect(200, "lead",   "PATCH", "/roster/member@feb.test", { avatar: S("http://x/c.jpg") }, ["avatar"]);

console.log("meta counter: increment-only, never deleted:");
await expect(200, "member", "PATCH", "/meta/sims", { next: N(1) });
await expect(200, "member", "PATCH", "/meta/sims", { next: N(5) });
await expect(403, "member", "PATCH", "/meta/sims", { next: N(3) });
await expect(403, "lead",   "DELETE", "/meta/sims");

console.log("lead:");
await expect(200, "lead", "PATCH", "/roster/new@feb.test", { name: S("New"), role: S("member") });
await expect(200, "lead", "DELETE", "/roster/new@feb.test");
await expect(200, "lead", "PATCH", "/config/release", { version: S("0.1.0") });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
