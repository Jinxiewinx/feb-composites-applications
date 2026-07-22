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
  query, where,
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

// Shrink an image client-side before upload so avatars/attachments stay small
// (Firestore-free storage still costs egress; a 4 MB phone photo becomes ~150 KB).
async function downscaleImage(file, maxDim) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  return blob || file;
}

// The data collections the app syncs. Add one here + a rules block + a counter
// prefix below to introduce a new record type. `roster` and `meta` are infra,
// not in this list.
const COLLECTIONS = ["workOrders", "parts", "projects", "schedule", "budget", "documents"];
// Id prefix per collection for allocId(). schedule ids are week keys, not
// counter-allocated, so it has no prefix.
const ID_PREFIX = { workOrders: "WO", parts: "P", projects: "PROJ", budget: "BUY", documents: "DOC" };

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
      return;
    }
    const clean = JSON.parse(JSON.stringify(obj));
    delete clean.updatedAt; delete clean.updatedBy;
    await setDoc(ref, { ...clean, ...stamp });
  },
  async del(coll, id) { await deleteDoc(doc(db, coll, id)); },

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

  // PREFIX-SN6-### from a shared per-collection counter so two laptops can't
  // mint the same id. Transactions need a connection; caller handles offline.
  async allocId(coll) {
    const prefix = ID_PREFIX[coll] || coll.toUpperCase();
    return runTransaction(db, async (tx) => {
      const ref = doc(db, "meta", coll);
      const snap = await tx.get(ref);
      const n = (snap.exists() && snap.data().next) || 1;
      tx.set(ref, { next: n + 1 }, { merge: true });
      return `${prefix}-SN6-${String(n).padStart(3, "0")}`;
    });
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
