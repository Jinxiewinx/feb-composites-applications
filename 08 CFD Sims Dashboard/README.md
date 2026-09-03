# FEB CFD app

Live at **https://feb-cfd.web.app**. Started 2026-09-02 as a shared dashboard
for the aero team's CFD work; the first thing in it is the report viewer that
used to be a desktop app in `07 CFD PDF Viewer/`, now with a library that the
whole team shares. What the dashboard tracks beyond that gets written down
when the team has said what they want.

`DECISIONS.md` has the reasoning behind the infrastructure choices (a web app
on Firebase, its own Firebase project, where data lives).

## How to use it

Open the site. The library on the left lists every report anyone has
uploaded; click Open on two of them and the views light up: Pages scroll
together, Panels puts the same named plot from every report side by side,
Overlay lays one over another (blend, swipe, or a difference map that reads
0.00% for identical reports), Summary diffs the mesh and solver numbers.

To add a report, drop a Fluent PDF onto the window or press Open PDFs. It
opens immediately and, with the checkbox on, uploads to the library for
everyone. The same file uploaded twice is recognised by its hash and not
stored again. Rename or delete through the ⋯ button on a library row.

The address bar carries what you have open, the tab and the plot. Copy it
and send it: the link is the comparison.

**Access is open.** No sign-in to read, upload, rename or delete; Simon's
call (2026-09-02) so nobody has to be added to anything. What the bucket
still refuses: anything that is not a PDF, anything over 60 MB, and any
record shape other than the one in `firestore.rules`. If that ever gets
abused, the two guardrails to add first are a billing budget alert and App
Check; neither needs a login.

## What exists

| Path | What it is |
|---|---|
| `app/` | The viewer. `core.js` is the shell and state, `library.js` the only file that talks to Firebase, the rest are the views ported from `07`. `vendor/` is pdf.js. `ds/` is copied from `05 Design System/` and must stay byte-identical |
| `firebase.json`, `.firebaserc` | Pins `feb-cfd`. Hosting root `app/`. Emulator ports offset from the composites app's so both can run |
| `firestore.rules` | `reports` is open with a fixed record shape. The other collections keep the composites roster model, unused until the dashboard needs sign-in |
| `storage.rules` | `reports/<id>/report.pdf`: public read, PDF-only writes under 60 MB. Other trees keep their roster gating |
| `cors.json` | The bucket's CORS policy. Applied by hand with gsutil, never by `firebase deploy` |
| `test/` | `test_indexer.mjs` (the PDF indexer against the real DP_22 fixture), `test_viewer_smoke.mjs` (Playwright, library stubbed), `test_library_emu.mjs` (the real library against the emulators) |
| `tools/` | Rules tests and the pdf.js vendoring script |
| `CHANGELOG.md` | Released versions, `cfd-vX.Y.Z` |

## Running it

Node, the Firebase CLI and a JDK (for the emulators), same as `SETUP.md` at
the repo root. From this folder:

```bash
npm test            # rules, indexer, browser smoke, emulator round trip
npm run emulators   # auth, Firestore, storage, hosting, with the UI on :4001
npm run serve       # the app on :8792; on localhost it talks to the emulators
npm run deploy      # hosting only, to feb-cfd.web.app
```

Playwright is not a dependency of the repo; the browser suites skip with a
message when it is missing (see `SETUP.md` at the root).

Rules deploy separately and only when they change, and the CORS policy is a
third thing again:

```bash
firebase deploy --only firestore:rules,storage --project feb-cfd
gsutil cors set cors.json gs://feb-cfd.firebasestorage.app
```

## State of the Firebase project

`feb-cfd`, console at https://console.firebase.google.com/project/feb-cfd.

| Service | State |
|---|---|
| Hosting | Live, the viewer, at https://feb-cfd.web.app |
| Firestore | Created, `us-west1` (same region as `feb-composites`). Rules deployed |
| Storage | Enabled, default bucket `feb-cfd.firebasestorage.app` in `us-west1`. Rules and CORS applied |
| Auth | Enabled: email/password and anonymous (guest), the same two providers as the composites app |

The project is on the Blaze plan, linked 2026-09-02 to the billing account
`feb-composites` uses. Nothing is charged until usage passes the free tier.

## Releases

Tags are `cfd-vX.Y.Z`, never bare `vX.Y.Z`, which belongs to the composites
app in the same repo. Version numbers follow the composites rubric at the
top of the root `CHANGELOG.md`; releases are listed in this folder's
`CHANGELOG.md`. To cut one: bump `APP_VERSION` in `app/core.js`, add the
changelog entry, commit, `git tag cfd-vX.Y.Z`, push with tags, `npm run
deploy`, then curl `core.js` off the host and check the version.

## Next

1. Talk to the team about what the dashboard tracks beyond the viewer.
2. Write the data model and replace the placeholder collections, tests in
   the same commit.
3. Guardrails if the open bucket is ever abused: a billing budget alert,
   then App Check.
