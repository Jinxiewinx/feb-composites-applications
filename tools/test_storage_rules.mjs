#!/usr/bin/env node
/* Storage-rules SMOKE test for 03 App/storage.rules against the Storage
   emulator. Scope note: the emulator's rules-enforced upload endpoint (/v0)
   doesn't set request.resource.contentType on a simple upload, so the *allow*
   cases (which gate on contentType) can't be asserted here without the full
   resumable protocol — those are exercised by the app's Firebase SDK in prod.
   What this proves cleanly is the security boundary that matters: sign-in is
   required, and writes outside the six allowed path trees (avatars/, projects/,
   parts/, documents/, budget/, stackplans/) are denied. Run from "03 App/":
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
await denied("unauthenticated write to budget/", null, "budget/BUY-1/receipt.jpg");
await denied("unauthenticated write to stackplans/", null, "stackplans/STK-1/mesh.stl");
// Added with the rich composer on parts: there was no parts/ rule at all, and
// the file ends in "no rule = deny", so a photo in a part comment failed
// silently at upload. The tree exists now, and must still be roster-gated.
await denied("unauthenticated write to parts/", null, "parts/P-SN6-001/photo.jpg");
// The mold mesh behind the Stock tab's 3D view. Its rule accepts only
// model/stl and application/octet-stream, so this PDF-typed write must be
// refused even though the path itself is allowed — the one contentType case
// this endpoint CAN assert, since here the wrong type is what's being tested
// rather than the right one (see the scope note at the top).
await denied("authed write of a non-STL content type to stackplans/", token, "stackplans/STK-1/mesh.stl");
await denied("authed write to an unmatched path", token, "secret/x.pdf");
/* cadOk() (August 2026) widened projects/ and parts/ to take native CAD by
   FILENAME as well as content type. The thing to prove is that naming a file
   .step does not by itself open a door: the extension only ever relaxes the
   type check INSIDE the two trees that were already writable, never the path
   check that decides which trees exist at all. */
await denied("a .step name does not open an unmatched path", token, "secret/mold.step");
await denied("a .step name does not open the bucket root", token, "mold.step");
await denied("a .step name does not open someone else's avatar", token, "avatars/not-my-uid.step");
await denied("CAD by name is still denied where the tree itself is denied", token, "cad/MOLD.STEP");
await denied("authed write to bucket root", token, "rootfile.pdf");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
