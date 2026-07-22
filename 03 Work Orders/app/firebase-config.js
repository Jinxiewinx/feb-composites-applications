/* Firebase project config.
   Paste the object from the Firebase console (Project settings → Your apps →
   </> web app → "Config") as window.FIREBASE_CONFIG below. The console gives
   you `const firebaseConfig = {...}` — the app reads window.FIREBASE_CONFIG,
   so keep the `window.FIREBASE_CONFIG =` assignment, not a bare const. None of
   these values are secrets — security lives in firestore.rules, not here.

   To develop against the local emulators instead, add  useEmulators: true. */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDQgUkUQhueh-nFJcTF8OxIq_J2XQi6DWU",
  authDomain: "feb-composites.firebaseapp.com",
  projectId: "feb-composites",
  storageBucket: "feb-composites.firebasestorage.app",
  messagingSenderId: "977650432624",
  appId: "1:977650432624:web:8db2a6c247aa4861b112b5",
  measurementId: "G-8GWMZDPGTX"
};
