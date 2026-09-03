# PLAN: port the CFD PDF Viewer into this app

Approved by Simon 2026-09-02. This file is the working plan; tick the order-of-work
steps at the bottom as they land, and delete the file when the last one ships
(the reasoning then lives in DECISIONS.md and git log).


## Context

The desktop viewer in `07 CFD PDF Viewer/` compares Fluent report PDFs (Pages, Panels, Overlay blend/swipe/difference, Summary, Search). It works but every session starts from local files and nothing is shared. The `08 CFD Sims Dashboard/` folder already has the hosting harness on the `feb-cfd` Firebase project: Firestore, Storage, Auth, rules with emulator tests, design-system copy, deploy script. This plan moves the viewer's functionality into that harness and adds a shared report library so anyone on the team opens the same reports from a URL.

Decisions from Simon (2026-09-02):
- Reports live in a **shared library in Cloud Storage**.
- **Anyone with the link** reads, uploads and deletes. No sign-in for anything.
- `07` stays as-is; the web app is a **ported copy** that evolves in `08`.
- A **minimal report record** per upload is fine. No sim results, plots or settings yet.

The `07` code is small (8 ES modules, 88 KB) and its Electron surface is 7 lines, so the port is mostly a copy plus a library layer. pdf.js (1.8 MB, vendored) is already a module worker that needs a real origin, which Firebase Hosting gives.

## Scope and justification of additions

Ported unchanged: indexer, render, pages, panels, compare, summary, search. Same strip/content-space model, same jointCrop, same 0.00% invariant.

Added, each with the reason it is required rather than nice:

1. **Report library** (Firestore `reports` collection + Storage `reports/{id}/report.pdf`). This is the request: reports are uploaded once and opened by everyone.
2. **Content-hash dedup**. SHA-256 of the file computed client-side before upload; an existing record with the same hash is opened instead of re-uploaded. Required because with open uploads and no accounts, the same DP will be dragged in by several people and the library fills with duplicates on a billed bucket.
3. **Shareable URL state** (`?open=<id>,<id>&tab=overlay&panel=Contours/velo-wing-3`). Required because "look at this comparison" is the whole reason for hosting; without it people still describe what to click in Slack.
4. **Storage rules that cap what an open bucket accepts**: PDF content type only, size cap, one file per report id. Required because writes are open to the internet and the bucket is billed.
5. **Bucket CORS**. Required mechanically: the app fetches PDFs from `firebasestorage.googleapis.com` with `fetch()`, which is a cross-origin request.
6. **Two inherited bugs fixed during the port**: `panelRows()` in core.js reimplements the tested `matchPanels()` from indexer.js (the app calls the untested copy); swipe reads `ev.touches` but registers no touch listeners, so tablets cannot swipe. Both are a few lines and it is cheaper to fix them while the code is being moved than to carry two implementations into a new app.
7. **Sample report seeded into the library** instead of the `fetch("../DP_22.pdf")` demo button, which only worked in Electron through a parent-directory fallback and 404s when served.

Explicitly not added now: sign-in or roster UI (no auth, per Simon), sim records, results tables, saved comparisons, App Check. The last one is discussed under Guardrails.

## Pushback recorded, decision stands

Fully open writes mean anyone who finds the URL can upload to, or delete from, a billed bucket. Simon chose this knowingly. The plan limits the blast radius with rules (PDF only, size cap) and lists two guardrails that need no sign-in and one console action for later. Not building a login.

## Target layout

```
08 CFD Sims Dashboard/
  app/
    index.html          viewer shell (replaces the placeholder)
    styles.css          ported from 07, fonts and colours mapped to ds/tokens.css dark values
    core.js             ported; Electron lines removed; library + URL state wired in
    library.js          NEW: Firestore/Storage glue (~150 lines), no auth
    indexer.js render.js pages.js panels.js compare.js summary.js search.js   ported
    vendor/pdf.mjs, vendor/pdf.worker.mjs, vendor/VERSION                     copied
    firebase-config.js  exists
    ds/                 exists, unchanged
  test/
    fixtures/DP_22.pdf  copy (git stores the blob once; 07 already has it)
    test_indexer.mjs    ported from 07
    test_viewer_smoke.mjs  NEW: Playwright against the local static server
  tools/test_rules.mjs, tools/test_storage_rules.mjs   extended for `reports`
  firestore.rules, storage.rules, cors.json, firebase.json, package.json, CHANGELOG.md, README.md
```

`07 CFD PDF Viewer/` is untouched except a README note pointing at the live URL.

## Data model

`reports/{id}` in Firestore, id allocated client-side as `RPT-` + 8 random base32 chars (no `meta` counter: counters need a transaction and the counter rule assumes a roster member).

| Field | Type | Notes |
|---|---|---|
| `id` | string | same as doc id |
| `name` | string ≤ 120 | display name, defaults to filename without `.pdf`, editable |
| `path` | string | `reports/{id}/report.pdf`, fixed |
| `size` | int | bytes |
| `sha256` | string | hex, dedup key; single-field index not needed, query with `where("sha256","==",h)` |
| `pages` | int | from the indexer at upload time |
| `panels` | int | from the indexer at upload time |
| `note` | string ≤ 500 | optional, free text |
| `createdAt` | timestamp | server |

Nothing large in Firestore (DECISIONS.md #3). The index is recomputed on open, never stored.

## Rules

`firestore.rules`: add

```
match /reports/{id} {
  allow read: if true;
  allow create: if validReport(request.resource.data) && request.resource.data.id == id;
  allow update: if validReport(request.resource.data)
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name','note']);
  allow delete: if true;
}
```

`validReport` checks the field types and caps above and that `path == 'reports/' + id + '/report.pdf'`. Existing collections keep their roster rules; `config` stays lead-only so nobody can write it.

`storage.rules`: add

```
match /reports/{id}/report.pdf {
  allow read: if true;
  allow write: if request.resource == null
    || (request.resource.contentType == 'application/pdf' && request.resource.size < 60 * 1024 * 1024);
}
```

(`request.resource == null` is delete.) 60 MB: DP_22 is 8.5 MB; the cap leaves room for a longer report and stops a 2 GB drop.

`cors.json` for the bucket, applied with `gsutil cors set cors.json gs://feb-cfd.firebasestorage.app`: origins `https://feb-cfd.web.app`, `https://feb-cfd.firebaseapp.com`, `http://localhost:8792`, `http://localhost:5051`; methods GET, HEAD; `Content-Type` and `Range` headers. Modelled on `06 Composites App/cors.json`.

## App changes

**library.js** (new). Imports `firebase-app`, `firebase-firestore`, `firebase-storage` from the same 12.16.0 CDN paths as `06 Composites App/app/fb.js:12-26`; no auth import. Emulator switch copied from `fb.js:46-51` with ports 8090 and 9198. API:
- `watchReports(cb)`: `onSnapshot` on `reports` ordered by `createdAt desc`.
- `findByHash(sha)`: one query.
- `upload(file, {onProgress})`: hash with `crypto.subtle.digest`, dedup, `uploadBytesResumable` to `reports/{id}/report.pdf` with progress, then `setDoc` the record. Storage first, Firestore second, so a record never points at a missing file.
- `openReport(rec)`: `getDownloadURL` then `fetch` → ArrayBuffer, returned as `{name, bytes}` for `addDocs`.
- `rename(id, name)`, `setNote(id, note)`, `remove(id)` (deletes the file, then the doc; file-not-found counts as success, as in `fb.js` `deleteFiles`).

**core.js** (ported). Remove the three `cfdNative` blocks (`07/app/core.js:214-217, 222-227`) and the `loadSample` demo. `addDocs(sources)` already accepts `{name, file}` and `{name, bytes}`; a library entry becomes `{name, bytes, reportId}`. `pick()` stays as the file input. Drop and file input now go through `library.upload` first (upload, then open); a small "open without uploading" checkbox on the drop overlay covers one-off local PDFs. Replace `panelRows()` (`core.js:129`) with a call to `matchPanels` from indexer.js, adapting its `cells` shape at the one call site. Add URL state: read `?open=`, `tab`, `panel` on boot; write them with `history.replaceState` on every `render()`.

**Sidebar**: two sections, "Library" (all reports, name, pages, panels, size, date, open/rename/delete, search filter) and "Open" (the current `S.docs` list with colour swatches, unchanged). Upload button and progress bar at the top.

**compare.js**: register `touchstart`/`touchmove`/`touchend` on the divider and hold alongside the mouse handlers (`07/app/compare.js:149-178`).

**styles.css**: copy, then map values onto `ds/tokens.css` dark-theme tokens where a token exists (surface, line, ink, muted, gold, blue) and load the DS fonts. Keep the viewer's own `--canvas #6f747c` and dark-only rule; the page sets `data-theme="dark"` on `<html>` and has no toggle. Rationale is the viewer's own (contour colour scales read differently on a bright surround), and pinning dark keeps one design language without fighting it. No layout changes.

**index.html**: viewer shell from `07/app/index.html` with `ds/tokens.css`, `ds/components.css`, `firebase-config.js`, `core.js` as a module. Footer shows `APP_VERSION`.

**firebase.json**: add a 1-day `Cache-Control` for `vendor/*.mjs` (1.8 MB, changes only with `npm run vendor`), keep no-cache on everything else. Add `"headers"` `Content-Type: text/javascript` for `.mjs` is not needed on Firebase Hosting (served correctly), but the smoke test verifies the worker starts.

## Tests

- `test/test_indexer.mjs`: ported; imports `../app/indexer.js` and `pdfjs-dist` from a devDependency, runs against `test/fixtures/DP_22.pdf`. Add a case that `matchPanels` output feeds the panels view shape used by core.js (since core now calls it).
- `tools/test_rules.mjs`: `reports` cases: `none` can read, create a valid record, update name/note only, cannot change `path` or `sha256`, cannot create with a 5 MB `note` or a wrong `path`, can delete; existing roster cases unchanged.
- `tools/test_storage_rules.mjs`: unauthenticated PDF write to `reports/X/report.pdf` allowed (the emulator's simple upload does not set contentType, so assert the deny cases: wrong path under `reports/`, non-PDF content type, and that `sims/` still refuses guests).
- `test/test_viewer_smoke.mjs`: Playwright via `tools/lib/browser.mjs` `loadChromium()`/`serveDir()` from the repo root, serving `08/app/` with `firebase-config.js` routed to a stub that sets `useEmulators:false` and a `library.js` stub with `watchReports` returning two entries backed by the fixture PDF. Asserts: module worker starts (39 pages, 59 panels via `window.CFD`), Panels view renders 59 rows, Overlay difference on the same file twice reads `pct === 0`. Skips with the standard message when Chromium is missing.
- `package.json`: `test:indexer`, `test:smoke`, `test` runs rules + indexer + smoke.

## Deploy and release

1. Push, then from `08`: `firebase deploy --only firestore:rules,storage:rules --project feb-cfd` (rules changed, said so in the report), `gsutil cors set`, then `npm run deploy`.
2. Verify: `curl https://feb-cfd.web.app/core.js | grep APP_VERSION`; open the live URL, upload DP_22.pdf from `07`, reload, confirm it lists and opens from the library, run the difference on it against itself.
3. Seed: upload `DP_22.pdf` and the Ghostscript variant through the live UI so the library is not empty on day one.
4. `CHANGELOG.md` created in `08` with `cfd-v0.1.0`; tag `cfd-v0.1.0` by hand. Parameterising `tools/release.mjs` waits for the second release.
5. `08/README.md`: rewrite the "What exists" table, add "How to use", record the open-access decision and its caps. `07/README.md`: one paragraph pointing at the live app. Root `README.md` row for `08` updated. SESSION-STATE `Now` entry replaced.

## Guardrails for an open bucket (after the port, small)

- **Billing budget alert** on the billing account at a low monthly threshold, via `gcloud billing budgets create`. Costs nothing, tells Simon if someone abuses the bucket.
- **App Check** (reCAPTCHA v3) in monitor mode: needs a site key created in the Firebase console, one click Simon does; after that the SDK lines are five. Enforce later if abuse appears. Listed, not built, in this pass.

## Verification (end to end)

1. `npm test` in `08`: rules (Firestore + Storage), indexer, smoke all green.
2. `npm run emulators` + `npm run serve`: drop a PDF, see it upload to the Storage emulator and appear in the library, open two, swipe, difference reads 0.00% on identical files.
3. Live: steps 2 and 3 under Deploy. Also open the shareable URL in a private window and confirm it loads the same two reports and panel with no sign-in.
4. `node tools/test_designsystem.mjs` from the repo root still passes (unchanged app copy); `cmp app/ds/tokens.css "../05 Design System/tokens.css"` still identical.

## Order of work (each step pushed on its own)

- [ ] 1. Rules + tests + CORS file (harness first, deployable alone).
- [ ] 2. Copy the viewer modules and vendor, index.html, styles; Electron lines out; serve locally and confirm parity with `07`.
- [ ] 3. library.js + sidebar + upload/open/delete + dedup.
- [ ] 4. URL state, matchPanels consolidation, touch swipe.
- [ ] 5. Smoke test, docs, deploy, seed, tag.
