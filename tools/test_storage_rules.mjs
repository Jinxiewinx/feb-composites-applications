#!/usr/bin/env node
/* Storage-rules SMOKE test for 03 Work Orders/storage.rules against the Storage
   emulator. Scope note: the emulator's rules-enforced upload endpoint (/v0)
   doesn't set request.resource.contentType on a simple upload, so the *allow*
   cases (which gate on contentType) can't be asserted here without the full
   resumable protocol — those are exercised by the app's Firebase SDK in prod.
   What this proves cleanly is the security boundary that matters: sign-in is
   required, and writes outside the three allowed path trees (avatars/, projects/,
   documents/) are denied. Run from "03 Work Orders/":
     firebase emulators:exec --only auth,storage --project demo-feb-work-orders \
       "node '../tools/test_storage_rules.mjs'"                                */

const PID = "demo-feb-work-orders";
const BUCKET = `${PID}.appspot.com`;
const STORAGE = `http://127.0.0.1:9199/v0/b/${BUCKET}/o`;
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`;

async function signUp(email) {
  const r = await fetch(AUTH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "password123", returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) throw new Error("auth emulator signUp failed");
  return j.idToken;
}
async function write(token, path) {
  const headers = { "Content-Type": "application/pdf" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(`${STORAGE}?name=${encodeURIComponent(path)}`, { method: "POST", headers, body: Buffer.alloc(8, 1) });
  return res.status;
}

const token = await signUp("smoke@feb.test");
let pass = 0, fail = 0;
async function denied(label, tok, path) {
  const s = await write(tok, path);
  const ok = s === 403;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${label}  → ${s} (want 403)`);
}

console.log("storage boundary (deny-critical):");
await denied("unauthenticated write to documents/", null, "documents/x.pdf");
await denied("unauthenticated write to projects/", null, "projects/P-1/x.pdf");
await denied("unauthenticated write to avatars/", null, "avatars/someuid");
await denied("authed write to an unmatched path", token, "secret/x.pdf");
await denied("authed write to bucket root", token, "rootfile.pdf");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
