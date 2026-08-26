/* fb.js — Firebase glue for the FEB composites app.
   This is the ONLY file that talks to Firebase. It exposes window.fb so the
   classic-script app (core.js + per-tab files) and their inline handlers can
   stay in global scope. Auth: email/password. Data: Firestore. Access: roster
   allowlist (see ../firestore.rules — the rules are the real enforcement; UI
   checks are UX).

   The app is multi-collection: work orders, parts, projects, the production
   schedule, and budget each live in their own Firestore collection. Everything
   here is generic over a collection name; nothing is work-order-specific. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, connectAuthEmulator, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updateProfile,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  connectFirestoreEmulator, collection, doc, onSnapshot, setDoc, updateDoc,
  deleteDoc, getDoc, getDocs, runTransaction, serverTimestamp, writeBatch, arrayUnion,
  query, where, deleteField,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  getStorage, connectStorageEmulator, ref as sRef, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const cfg = window.FIREBASE_CONFIG;
if (!cfg || !cfg.projectId) {
  document.getElementById("main").innerHTML =
    '<div class="card"><h2>Not configured</h2><p>Edit <code>firebase-config.js</code> and set your project config. Note the console gives you <code>const firebaseConfig = {…}</code>, but this app reads <code>window.FIREBASE_CONFIG</code> — the assignment must start with <code>window.FIREBASE_CONFIG =</code> (see README step 5).</p></div>';
  throw new Error("FIREBASE_CONFIG missing");
}

const app = initializeApp(cfg);
const auth = getAuth(app);
// Persistent cache = the app keeps working on RFS wifi dropouts; writes queue
// and sync when the connection comes back. This replaces the old localStorage.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
});
const storage = getStorage(app);

// Local dev: `firebase emulators:start` serves on localhost → talk to emulators.
// Set useEmulators: false in firebase-config.js to test localhost against prod.
const onLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
if (cfg.useEmulators === true || (cfg.useEmulators !== false && onLocalhost)) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

/* Shrink an image client-side before upload so attachments stay small (a 4 MB
   phone photo becomes ~150 KB).

   This used to re-encode EVERYTHING to JPEG q0.85 at 1600px, which is the right
   trade for a photo of a mold and the wrong one for the other half of what gets
   attached here. A screenshot of a drawing or a spreadsheet is thin dark lines
   on white — the exact worst case for JPEG — and it came out with ringing on
   every line and mush on the dimension text. Worse, a canvas starts
   transparent and JPEG has no alpha, so any PNG with transparency (an exported
   plot, a diagram, a logo) was composited onto BLACK and arrived as a dark
   slab.

   So: PNG stays PNG and gets a larger budget, because a screenshot is only
   useful if you can read it. Everything else is a photo and gets JPEG over an
   opaque white fill. Both candidates are encoded when the source is a PNG and
   the smaller one wins, so a photo someone happened to save as PNG doesn't
   cost 4 MB for nothing. */
async function downscaleImage(file, maxDim, opts = {}) {
  const bmp = await createImageBitmap(file);
  const isPng = (file.type || "") === "image/png";
  // A screenshot is only worth keeping if the small text in it survives; 1600
  // is below the native width of a Retina capture.
  const cap = isPng ? (opts.maxDimPng || 2400) : maxDim;
  const scale = Math.min(1, cap / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);

  const draw = (opaque) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    // Only for the JPEG path: without it the encoder fills alpha with black.
    if (opaque) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(bmp, 0, 0, w, h);
    return canvas;
  };
  const encode = (canvas, type, q) => new Promise(res => canvas.toBlob(res, type, q));

  const jpeg = await encode(draw(true), "image/jpeg", 0.85);
  if (!isPng) { if (bmp.close) bmp.close(); return jpeg || file; }

  const png = await encode(draw(false), "image/png");
  if (bmp.close) bmp.close();
  // Keep the PNG unless it is dramatically bigger — a little extra weight is
  // worth legible text, but a photo saved as PNG can be 10x and isn't.
  if (png && (!jpeg || png.size <= jpeg.size * 2.5)) return png;
  return jpeg || png || file;
}

// The data collections the app syncs. Add one here + a rules block + a counter
// prefix below to introduce a new record type. `roster` and `meta` are infra,
// not in this list.
const COLLECTIONS = ["workOrders", "parts", "projects", "schedule", "budget", "documents", "stock", "stackplans", "molds", "items", "lots"];
/* Id prefix per collection for allocId(). schedule ids are week keys, not
   counter-allocated, so it has no prefix.

   `items` and `lots` have no entry because they are MULTI-CLASS: one collection
   holding several kinds of object, each with its own prefix and its own counter
   (PNL/JIG/BIN, FAB/RSN/CON). Callers pass the class to allocId() and it wins
   over this map. Three collections rather than nine because their fields are
   near-identical and nine onSnapshot listeners at boot buys nothing. */
const ID_PREFIX = { workOrders: "WO", parts: "P", projects: "PROJ", budget: "BUY", documents: "DOC", stock: "BRD", stackplans: "STK", molds: "MOLD" };

/* ---- the public mirror ----

   `pub/<ID>` is the only thing in this database an unauthenticated person can
   read, and it exists because someone holding a labelled mold needs to know
   what it is without an account — a Jacobs staffer working out whose mold is
   blocking the container, a mech tech at comp, a member whose phone is not
   signed in. It is a MIRROR built from a whitelist, never the record itself.

   It has to be a mirror because FIRESTORE RULES CANNOT FILTER FIELDS. `allow
   read` is all-or-nothing per document, so any rule that let a scanner see
   workOrders/WO-SN6-118.id would also hand them layupStack, every
   steps[].buyoff.name and every comment. The projection is the security
   boundary, and it lives in pubProjection() in labels.js so that the printed
   label and the public card can never disagree about what an object is.

   `pub` is deliberately NOT in COLLECTIONS below: it is write-only from the
   app's point of view, and listing it would open a full-collection snapshot at
   boot for no benefit. */
function pubSync(coll, obj) {
  try {
    if (typeof pubProjection !== "function") return;   // labels.js not loaded
    const p = pubProjection(coll, obj);
    if (!p) return;                                     // not a physical thing
    setDoc(doc(db, "pub", p.id), p).catch(pubWarn);
  } catch (e) { pubWarn(e); }
}

/* A mirror failure must never surface as a save failure. Toasting "save failed"
   when the record saved perfectly well is worse than a stale nameplate, so this
   only warns. The drift that buys is paid for by the lead-only "Rebuild scan
   mirror" action in reports.js, which also covers the two cases save() cannot
   see: records that predate this feature, and records changed through
   mutateField() or appendTo(), which bypass save() entirely. */
function pubWarn(e) { console.warn("pub mirror not updated (the record itself saved fine):", e && e.message || e); }

/* The Google Sheet mirror feed. Only parts have a tracker tab, so only parts
   trigger it. The debounce, the projection and the size guard all live in
   tracker.js; this is just the hook, kept here so save() has one obvious place
   where every downstream mirror is fired.

   Guarded the same way pubSync() guards pubProjection: tracker.js is a classic
   script and its top-level declarations become globals, but the test harness
   and any future page that loads fb.js without it must still save records. */
function trackerSync(coll) {
  if (coll !== "parts") return;
  if (typeof trackerQueue !== "function") return;   // tracker.js not loaded
  try { trackerQueue(); } catch (e) { pubWarn(e); }
}

/* Bulk republish, for the lead-only "Rebuild scan mirror" action.

   Deliberately NOT importMany(): that stamps every document with `updatedAt`
   and `updatedBy: <email>`, and `updatedBy` is (a) rejected by the hasOnly()
   clause on /pub, so the whole batch would fail, and (b) precisely the kind of
   thing that must never appear on a public URL. The mirror is written exactly
   as the projection produces it and with nothing added. */
async function pubPublish(recs) {
  for (let i = 0; i < recs.length; i += 400) {
    const batch = writeBatch(db);
    for (const p of recs.slice(i, i + 400)) batch.set(doc(db, "pub", p.id), p);
    await batch.commit();
  }
}

const unsubs = {}; // collection name -> onSnapshot unsub

const fb = {
  state: "loading", // loading | signedout | pending (no roster entry) | ready
  user: null,       // { uid, email, name }
  roster: null,     // this user's roster entry { name, role }
  rosterCheckFailed: false, // network died mid-check → pending screen says so

  /* ---- auth ---- */
  async signIn(email, pass) {
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
  },
  async signUp(name, email, pass) {
    const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
    if (name) await updateProfile(cred.user, { displayName: name.trim() });
  },
  async resetPassword(email) {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  },
  async signOut() { await signOut(auth); },

  // Pending screen "check again" button: re-read my roster entry.
  async refreshRoster() { await resolveUser(auth.currentUser); },

  /* ---- generic records ----
     With `field` set, only that field is written (updateDoc) — concurrent or
     stale-cache edits to *other* fields of the same record can't be clobbered.
     Without it (record creation), the whole doc is written. */
  async save(coll, obj, field) {
    const stamp = { updatedAt: serverTimestamp(), updatedBy: fb.user ? fb.user.email : "?" };
    const ref = doc(db, coll, obj.id);
    if (field) {
      const val = JSON.parse(JSON.stringify(obj[field] ?? null)); // strip undefined etc.
      await updateDoc(ref, { [field]: val, ...stamp });
      pubSync(coll, obj);
      trackerSync(coll);
      return;
    }
    const clean = JSON.parse(JSON.stringify(obj));
    delete clean.updatedAt; delete clean.updatedBy;
    await setDoc(ref, { ...clean, ...stamp });
    pubSync(coll, obj);
    trackerSync(coll);
  },
  async del(coll, id) {
    await deleteDoc(doc(db, coll, id));
    // A public nameplate outliving its record is worse than a missed delete.
    deleteDoc(doc(db, "pub", id)).catch(pubWarn);
    // The tracker feed is a whole-table snapshot, so a deleted part only
    // leaves the spreadsheet once the snapshot is rewritten without it.
    trackerSync(coll);
  },

  /* Delete many records at once. `items` is [{ coll, id }], mixed collections
     welcome — a work order and the issues that hang off it go in one call.

     Chunked at 400 because a Firestore batch caps at 500, which is the same
     number importMany and pubPublish already chunk at.

     The `pub` mirrors go in their OWN batch, and its failure is swallowed. That
     is deliberate and matches del(): /pub is a looser collection with its own
     rule, and a nameplate that outlives its record is bad, but it is not worth
     failing the real delete over — whereas putting it in the main batch would
     mean one rules hiccup abandons every record delete in the chunk. */
  async delMany(items) {
    const list = (items || []).filter(x => x && x.coll && x.id);
    if (!list.length) return;
    for (let i = 0; i < list.length; i += 400) {
      const batch = writeBatch(db);
      for (const it of list.slice(i, i + 400)) batch.delete(doc(db, it.coll, it.id));
      await batch.commit();
    }
    for (let i = 0; i < list.length; i += 400) {
      try {
        const batch = writeBatch(db);
        for (const it of list.slice(i, i + 400)) batch.delete(doc(db, "pub", it.id));
        await batch.commit();
      } catch (e) { pubWarn(e); }
    }
    [...new Set(list.map(x => x.coll))].forEach(c => trackerSync(c));
  },

  /* deleteFile swallows every error, because "already gone" is the usual one and
     is the desired state anyway. A bulk delete needs to know the difference, so
     this counts instead of guessing — the caller can then say how many uploads
     it could NOT remove rather than claiming a clean sweep. */
  async deleteFiles(paths) {
    let ok = 0; const failed = [];
    for (const p of (paths || [])) {
      if (!p) continue;
      try { await deleteObject(sRef(storage, p)); ok++; }
      catch (e) {
        // A missing object is the outcome we wanted, not a failure.
        if (e && (e.code === "storage/object-not-found")) ok++; else failed.push(p);
      }
    }
    return { ok, failed };
  },

  // Concurrency-safe edit of one field via a transaction: reads the CURRENT
  // server value, applies mutator(freshValue) → newValue, writes it. Two people
  // buying off different steps of the same WO both land (the loser retries on
  // fresh data) instead of one silently clobbering the other. Needs a
  // connection — callers fall back to save() when offline.
  async mutateField(coll, id, field, mutator) {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, coll, id);
      const snap = await tx.get(ref);
      const cur = snap.exists() ? snap.data()[field] : undefined;
      const next = mutator(JSON.parse(JSON.stringify(cur ?? null)));
      tx.update(ref, { [field]: next, updatedAt: serverTimestamp(), updatedBy: fb.user ? fb.user.email : "?" });
    });
  },
  // Atomic append to an array field (project update log). arrayUnion merges
  // concurrent appends server-side — no read, no clobber.
  async appendTo(coll, id, field, el) {
    await updateDoc(doc(db, coll, id), {
      [field]: arrayUnion(JSON.parse(JSON.stringify(el))),
      updatedAt: serverTimestamp(), updatedBy: fb.user ? fb.user.email : "?",
    });
  },

  /* PREFIX-SN6-### from a shared counter so two laptops can't mint the same id.
     Transactions need a connection; the caller handles offline.

     `cls` is for the multi-class collections (items, lots): pass "PNL" or "FAB"
     and you get PNL-SN6-007 counted separately from JIG-SN6-002. Without a
     per-class counter you would get PNL-SN6-001 followed by JIG-SN6-002, which
     reads as broken even though it is not.

     THE TRAP, and the reason counterKey is written this way: the counter key
     must NOT change for any existing collection. `cls || coll` keeps every
     existing call byte-identical, so meta/workOrders stays meta/workOrders.
     Re-keying it would reset the counter to 1 and start minting duplicate WO
     ids over the top of real records. */
  async allocId(coll, cls) {
    const prefix = cls || ID_PREFIX[coll] || coll.toUpperCase();
    const counterKey = cls || coll;
    return runTransaction(db, async (tx) => {
      const ref = doc(db, "meta", counterKey);
      const snap = await tx.get(ref);
      const n = (snap.exists() && snap.data().next) || 1;
      tx.set(ref, { next: n + 1 }, { merge: true });
      return `${prefix}-SN6-${String(n).padStart(3, "0")}`;
    });
  },

  /* N ids from ONE transaction, for a batch create.

     Same counter, same prefix, same padding as allocId — and the same trap
     from the comment above: counterKey stays `cls || coll`, byte-identical,
     because re-keying resets a live counter to 1 and starts minting duplicate
     ids over real records.

     The rules cap this at 50 per write. Asking for more is a caller bug, not a
     retry case, so it throws here rather than letting the rules refuse it with
     a PERMISSION_DENIED nobody can interpret.

     A reserved block that is never written leaves a gap in the sequence. That
     is fine and deliberate: ids are opaque handles, nothing counts or sums
     them, and cmpId() sorts by the number so a gap is invisible. */
  async allocIdBlock(coll, cls, n) {
    if (!(n > 0)) return [];
    if (n > 50) throw new Error("id block too large: " + n);
    const prefix = cls || ID_PREFIX[coll] || coll.toUpperCase();
    const counterKey = cls || coll;
    return runTransaction(db, async (tx) => {
      const ref = doc(db, "meta", counterKey);
      const snap = await tx.get(ref);
      const first = (snap.exists() && snap.data().next) || 1;
      tx.set(ref, { next: first + n }, { merge: true });
      const out = [];
      for (let i = 0; i < n; i++) out.push(`${prefix}-SN6-${String(first + i).padStart(3, "0")}`);
      return out;
    });
  },

  // Republish every public scan nameplate. See pubPublish() above for why this
  // is not importMany().
  async publishPub(recs) { await pubPublish(recs); },

  /* Write the Google Sheet mirror feed to tracker/<token>.

     Deliberately NOT importMany() and NOT stamped, for the same reason
     pubPublish() is not: importMany() adds updatedAt and updatedBy:<email>,
     and updatedBy is (a) rejected by the hasOnly() clause on /tracker so the
     whole write would fail, and (b) precisely the kind of thing that must
     never appear on a URL that needs no login. The snapshot is written exactly
     as tracker.js builds it, with nothing added. */
  async publishTracker(token, snap) {
    await setDoc(doc(db, "tracker", token), snap);
  },

  // Bulk write (seed load / JSON import). Overwrites by id; chunked under the
  // 500-writes-per-batch limit.
  async importMany(coll, arr) {
    for (let i = 0; i < arr.length; i += 400) {
      const batch = writeBatch(db);
      arr.slice(i, i + 400).forEach((obj) => {
        const clean = JSON.parse(JSON.stringify(obj));
        delete clean.updatedAt; delete clean.updatedBy;
        batch.set(doc(db, coll, obj.id), {
          ...clean, updatedAt: serverTimestamp(),
          updatedBy: fb.user ? fb.user.email : "?",
        });
      });
      await batch.commit();
    }
  },

  /* ---- files (Firebase Storage) ----
     Images are downscaled client-side first. Returns a file record to store on
     the owning doc (project files[], avatar url, etc.). Paths are namespaced so
     storage.rules can scope them. */
  async upload(path, file, opts = {}) {
    let blob = file;
    if (file.type && file.type.startsWith("image/")) {
      blob = await downscaleImage(file, opts.maxDim || 1600).catch(() => file);
    }
    const r = sRef(storage, path);
    await uploadBytes(r, blob, { contentType: blob.type || file.type || "application/octet-stream" });
    const url = await getDownloadURL(r);
    return { url, path, name: file.name || "file", size: blob.size || 0, type: blob.type || file.type || "" };
  },
  async deleteFile(path) { try { await deleteObject(sRef(storage, path)); } catch (e) { /* already gone */ } },

  /* ---- callable functions ----
     The functions SDK loads lazily on first use: exactly one feature calls a
     function (receipt parsing), so its ~30 KB never rides in the boot path.
     Throws to the caller — the UI's job is to degrade to the manual editor,
     not this file's job to pretend it worked. */
  async call(name, data) {
    const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js");
    const res = await httpsCallable(getFunctions(app, "us-central1"), name)(data);
    return res.data;
  },

  /* ---- roster ---- */
  async rosterAll() {
    const snap = await getDocs(collection(db, "roster"));
    return snap.docs
      .map((d) => ({ email: d.id, ...d.data() }))
      .sort((a, b) => a.email.localeCompare(b.email));
  },
  // Lead-only per rules. merge:true so a member's self-set avatar/name survive.
  async rosterSet(email, name, role) {
    email = email.trim().toLowerCase();
    await setDoc(doc(db, "roster", email), {
      name: name.trim(), role,
      addedBy: fb.user ? fb.user.email : "?",
      addedAt: serverTimestamp(),
    }, { merge: true });
  },
  async rosterDelete(email) { await deleteDoc(doc(db, "roster", email)); },
  /* Trainings live on the roster doc as trainings.<id> = {by, at}. Lead-only
     per rules (member self-edit is restricted to avatar/name, so a member
     granting themselves a training is rejected server-side). Dot-path writes
     so a grant can't clobber the rest of the map. */
  async rosterGrant(email, trainingId) {
    await updateDoc(doc(db, "roster", email.trim().toLowerCase()), {
      ["trainings." + trainingId]: { by: fb.user ? fb.user.email : "?", at: new Date().toISOString() },
    });
  },
  async rosterRevoke(email, trainingId) {
    await updateDoc(doc(db, "roster", email.trim().toLowerCase()), {
      ["trainings." + trainingId]: deleteField(),
    });
  },
  // Any member editing their OWN roster doc — rules allow avatar/name only.
  async rosterUpdateSelf(fields) {
    await updateDoc(doc(db, "roster", fb.user.email), fields);
  },

  /* ---- notifications (per-user; read scoped to `to` by rules) ---- */
  async notify(toEmail, type, text, link) {
    if (!toEmail || toEmail === fb.user.email) return; // don't notify yourself
    const id = "N" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await setDoc(doc(db, "notifications", id), {
      id, to: toEmail, type, text, link: link || null,
      from: fb.user.email, ts: serverTimestamp(), read: false,
    });
  },
  async markNotifRead(id) { await updateDoc(doc(db, "notifications", id), { read: true }); },

  /* ---- config (small roster-readable, lead-only-writable settings docs) ----
     Live outside COLLECTIONS: these are single keyed docs (e.g. "slack"), not
     an array collection every tab syncs. The Slack incoming-webhook URL is the
     first user — it must never be hardcoded in source (this repo is public),
     so it's read from here at runtime by anyone on the roster instead. */
  async getConfig(key) {
    const snap = await getDoc(doc(db, "config", key));
    return snap.exists() ? snap.data() : null;
  },
  /* getConfig is a one-shot read, which is right for season/slack/tracker —
     they are read once at boot and acted on. config/release is different: the
     whole point is that a session already running finds out a new version
     shipped, and a session that has been open on a bench tablet all afternoon
     is exactly the one that needs telling. One document, one listener. */
  watchConfig(key, cb) {
    return onSnapshot(doc(db, "config", key), s => cb(s.exists() ? s.data() : null),
      () => { /* a config the roster can't read is not worth a console error */ });
  },
  async setConfig(key, data) {
    await setDoc(doc(db, "config", key), {
      ...data, updatedAt: serverTimestamp(), updatedBy: fb.user ? fb.user.email : "?",
    }, { merge: true });
  },
};
window.fb = fb;

function notify() { if (window.onFbChange) window.onFbChange(fb.state); }

function startSync() {
  COLLECTIONS.forEach((name) => {
    if (unsubs[name]) return;
    unsubs[name] = onSnapshot(collection(db, name), (snap) => {
      const arr = snap.docs.map((d) => {
        const o = d.data();
        if (o.updatedAt && o.updatedAt.toDate) o.updatedAt = o.updatedAt.toDate().toISOString();
        return o;
      });
      if (window.onFbData) window.onFbData(name, arr);
    }, (err) => {
      console.error(name + " sync error", err);
      if (err.code === "permission-denied") { fb.state = "pending"; stopSync(); notify(); }
    });
  });
  // Live roster → DB.users (avatars, names) for pickers/comments everywhere,
  // and keep the current user's own roster entry fresh (e.g. after a photo set).
  if (!unsubs.__roster) {
    unsubs.__roster = onSnapshot(collection(db, "roster"), (snap) => {
      const arr = snap.docs.map((d) => ({ email: d.id, ...d.data() }));
      const mine = arr.find((u) => u.email === (fb.user && fb.user.email));
      if (mine) fb.roster = mine;
      if (window.onFbData) window.onFbData("users", arr);
    }, () => { /* roster read denied only for non-roster users, already handled */ });
  }
  // My notifications only — a filtered query (rules scope reads to `to == me`),
  // so this can't be part of the whole-collection COLLECTIONS loop.
  if (!unsubs.__notifs && fb.user) {
    unsubs.__notifs = onSnapshot(query(collection(db, "notifications"), where("to", "==", fb.user.email)), (snap) => {
      const arr = snap.docs.map((d) => {
        const o = d.data();
        if (o.ts && o.ts.toDate) o.ts = o.ts.toDate().toISOString();
        return o;
      });
      if (window.onFbData) window.onFbData("notifications", arr);
    }, (err) => console.error("notifications sync", err));
  }
}
function stopSync() {
  Object.keys(unsubs).forEach((name) => { unsubs[name](); delete unsubs[name]; });
}

async function resolveUser(user) {
  if (!user) {
    fb.user = null; fb.roster = null; fb.state = "signedout";
    stopSync(); notify(); return;
  }
  const email = (user.email || "").toLowerCase();
  fb.user = { uid: user.uid, email, name: user.displayName || email };
  fb.rosterCheckFailed = false;
  try {
    const snap = await getDoc(doc(db, "roster", email));
    if (snap.exists()) {
      fb.roster = snap.data();
      fb.state = "ready";
      startSync();
    } else {
      fb.roster = null; fb.state = "pending"; stopSync();
    }
  } catch (e) {
    // Rules deny roster reads to non-roster users → permission-denied = not on
    // it yet. Anything else (e.g. "unavailable") is probably just bad wifi.
    fb.roster = null; fb.state = "pending"; stopSync();
    fb.rosterCheckFailed = e && e.code !== "permission-denied";
  }
  notify();
}

onAuthStateChanged(auth, resolveUser);
