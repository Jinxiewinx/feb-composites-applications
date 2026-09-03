/* library.js — the shared report library. The ONLY file that talks to Firebase.

   No auth anywhere in here, on purpose: the library is open to anyone with
   the link (Simon, 2026-09-02). What bounds an open, billed bucket is the
   rules (../firestore.rules, ../storage.rules): one PDF per record, 60 MB,
   a fixed record shape. This file keeps to that shape and does the one thing
   the rules cannot, which is refusing to upload a file whose hash is already
   in the library.

   Records are small on purpose (DECISIONS.md #3): the page and panel index is
   recomputed from the PDF on open, never stored. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getFirestore, connectFirestoreEmulator, collection, doc, onSnapshot, setDoc, updateDoc,
  deleteDoc, getDocs, query, where, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  getStorage, connectStorageEmulator, ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const cfg = window.FIREBASE_CONFIG;
if (!cfg || !cfg.projectId) throw new Error("FIREBASE_CONFIG missing: edit firebase-config.js");

const app = initializeApp(cfg);
const db = getFirestore(app);
const storage = getStorage(app);

// Local dev: talk to the emulators on this app's offset ports (firebase.json).
// Set useEmulators: false in firebase-config.js to test localhost against prod.
const onLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
export const usingEmulators = cfg.useEmulators === true || (cfg.useEmulators !== false && onLocalhost);
if (usingEmulators) {
  connectFirestoreEmulator(db, "127.0.0.1", 8090);
  connectStorageEmulator(storage, "127.0.0.1", 9198);
}

export const MAX_BYTES = 60 * 1024 * 1024;   // mirrors storage.rules and firestore.rules
const COLL = "reports";
const VIEWS = "views";

/* Every reader gets the whole library, newest first, live. A few hundred
   records at ~300 bytes each is one cheap listener. */
export function watchReports(cb, onError) {
  const q = query(collection(db, COLL), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => normalise(d.data())));
  }, err => { console.error("library", err); onError?.(err); });
}
function normalise(r) {
  const t = r.createdAt;
  return { ...r, note: r.note || "", createdAt: t && typeof t.toDate === "function" ? t.toDate().toISOString() : (t || null) };
}

export async function findByHash(sha256) {
  const snap = await getDocs(query(collection(db, COLL), where("sha256", "==", sha256)));
  return snap.empty ? null : normalise(snap.docs[0].data());
}

export async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* Ids are made here rather than from a counter: a counter needs a transaction
   on meta/, and that rule assumes a roster member. Eight base32 characters
   is 40 bits; a collision inside one team's library is not a real event. */
const B32 = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export function newId() {
  const a = crypto.getRandomValues(new Uint8Array(8));
  return "RPT-" + [...a].map(v => B32[v % B32.length]).join("");
}

/* Upload a PDF the app has already read into memory (so the same bytes feed
   the hash, the upload and the viewer without a second read). `meta` carries
   the page and panel counts from the indexer. Returns the record; if the hash
   is already in the library, returns THAT record with `existing: true` and
   uploads nothing. Storage first, then Firestore: a record never points at a
   file that is not there. */
export async function upload(bytes, name, meta = {}, onProgress) {
  /* meta: { pages, panels, dp, results, meta } from the indexer and extract.js. */
  if (bytes.byteLength >= MAX_BYTES) throw new Error(`Over the ${Math.round(MAX_BYTES / 1048576)} MB library limit`);
  const sha256 = await sha256Hex(bytes);
  const dup = await findByHash(sha256);
  if (dup) return { ...dup, existing: true };
  const id = newId();
  const path = `${COLL}/${id}/report.pdf`;
  const task = uploadBytesResumable(sRef(storage, path), bytes, { contentType: "application/pdf" });
  await new Promise((res, rej) => task.on("state_changed",
    s => onProgress?.(s.bytesTransferred / s.totalBytes), rej, res));
  const rec = {
    id, name: cleanName(name), path, size: bytes.byteLength, sha256,
    pages: meta.pages | 0, panels: meta.panels | 0, createdAt: serverTimestamp(),
    dp: Number.isInteger(meta.dp) ? meta.dp : null,
    results: meta.results && typeof meta.results === "object" ? meta.results : {},
    meta: meta.meta && typeof meta.meta === "object" ? meta.meta : {},
  };
  await setDoc(doc(db, COLL, id), rec);
  return { ...rec, createdAt: new Date().toISOString() };
}
export function cleanName(name) {
  const n = String(name || "report").replace(/\.pdf$/i, "").trim();
  return (n || "report").slice(0, 120);
}

/* Fetch the PDF bytes for a record. getDownloadURL carries a token that
   bypasses rules, and the bucket's CORS (../cors.json) is what lets fetch()
   read it from the hosting origin. */
export async function fetchBytes(rec) {
  const url = await getDownloadURL(sRef(storage, rec.path));
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " fetching " + rec.name);
  return new Uint8Array(await res.arrayBuffer());
}

/* Whatever a record is missing: dp, results, meta, thumb. The rules let
   anyone write those four and nothing else, so an old record catches up the
   first time anyone opens it. */
export async function patch(id, fields) {
  const allowed = {};
  for (const k of ["dp", "results", "meta", "thumb"]) if (k in fields) allowed[k] = fields[k];
  if (Object.keys(allowed).length) await updateDoc(doc(db, COLL, id), allowed);
}

/* The card thumbnail, next to the report in the bucket. Returns the thumb
   field for the record. */
export async function uploadThumb(id, blob, panel) {
  const path = `${COLL}/${id}/thumb.png`;
  const r = sRef(storage, path);
  const task = uploadBytesResumable(r, blob, { contentType: "image/png" });
  await new Promise((res, rej) => task.on("state_changed", null, rej, res));
  const url = await getDownloadURL(r);
  return { path, url, panel: String(panel || "").slice(0, 120) };
}

export async function rename(id, name) {
  await updateDoc(doc(db, COLL, id), { name: cleanName(name) });
}
export async function setNote(id, note) {
  await updateDoc(doc(db, COLL, id), { note: String(note || "").slice(0, 500) });
}
/* Files first, then the record; a missing file counts as already gone. */
export async function remove(rec) {
  for (const path of [rec.path, rec.thumb && rec.thumb.path].filter(Boolean)) {
    try { await deleteObject(sRef(storage, path)); }
    catch (e) { if (e?.code !== "storage/object-not-found") throw e; }
  }
  await deleteDoc(doc(db, COLL, rec.id));
}

/* ---------- saved views ----------
   A view is a name for a viewer URL query: which reports, which tab, which
   plot, which overlay. The report ids ride alongside so the Dashboard can
   say "DP_22 vs DP_23" without parsing the query. */
export function watchViews(cb, onError) {
  const q = query(collection(db, VIEWS), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => cb(snap.docs.map(d => normalise(d.data()))),
    err => { console.error("views", err); onError?.(err); });
}
export async function saveView(name, queryString, reportIds) {
  const id = "VW-" + newId().slice(4);
  const rec = { id, name: String(name).slice(0, 80), query: String(queryString).slice(0, 600),
    reports: reportIds.slice(0, 12), createdAt: serverTimestamp() };
  await setDoc(doc(db, VIEWS, id), rec);
  return { ...rec, createdAt: new Date().toISOString() };
}
export async function renameView(id, name) { await updateDoc(doc(db, VIEWS, id), { name: String(name).slice(0, 80) }); }
export async function removeView(id) { await deleteDoc(doc(db, VIEWS, id)); }
