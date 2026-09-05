# Feasibility study plan: a Fusion 360 add-in for the composites app's Molds section

Planned 2026-09-04 with Simon, approved the same day. This is the plan for the
study; `FEASIBILITY.md` beside it does not exist yet and is what executing this
plan produces.

## Context

Simon asked whether a Fusion 360 add-in could talk to the composites app's Molds
section so that, from inside Fusion, a member signs in, selects the mold body,
and the add-in creates the mold entry in the app, generates the tooling-board
stock stack, and places each board layer over the mold as its own
semi-transparent body. The layers are the stock bodies for CAM, which is why
they must live in the Fusion file and not only in the app.

This plan is for a **feasibility study**, not an implementation. Executing it
produces a written study with a recommendation and a go/no-go, backed by a few
throwaway spikes. No product code, no app changes, no deploys.

### What Simon settled in the interview (2026-09-04)

- Source-of-truth mold CAD lives in the shared Fusion Team hub. Members are on
  educational licences. The add-in should install on each member's machine.
- Direction: both, **push first** (Fusion → app). Pull comes later.
- Selection: **the mold body itself**, not the part.
- Each layer body is **the packed blank rectangle** (the real slab of tooling
  board), stacked at the right Z, overlaid on the mold, semi-transparent.
- Planner UI inside Fusion: **study both** the palette-hosted real app and a
  minimal native dialog, and recommend one.
- Deliverable: a markdown study under a new `10 Fusion Add-in/` folder in the
  repo. Short proof-of-concept spikes are allowed and are clearly not product
  code.
- Members run Fusion on **both macOS and Windows**, so both are in scope for
  every spike, not only macOS.
- The toolbar panel is "FEB" and the command is "Plan stock" (confirmed).
- **Linking the mold to its Fusion document is a phase 1 feature**, not an
  assumption: the add-in writes the document's identity onto the mold record
  and the mold's detail card in the app shows it.

### What the codebase already gives us (exploration, 2026-09-04)

- The `molds` record has **no CAD field** today. Geometry enters only through
  the stack planner (`app/stock.js` → `stackplans` record), which the mold
  points at via `currentPlanId`. Native CAD uploads exist on parts and work
  orders only (`app/projects.js:1066`, `storage.rules:77-79`), never on molds.
- The stack plan already stores exactly what the add-in needs to draw:
  `plan.layers[i] = { z0, z1, thickness, blanks: [{x0,y0,x1,y1}], section }`
  in **millimetres, in the mold's own CAD frame**, stack built upward from
  `bounds.z0` (`app/slicer.js:822-863`, `app/stlio.js:67-72`). Packed
  positions on rack boards are not stored and are not needed for stock bodies.
- The slicer and packer are **pure JS with no DOM or WebGL** (`app/slicer.js:2`,
  `app/stlio.js:4-7`); the Worker is optional and the same code runs inline and
  under Node in the test harness (`app/stock.js:666-712`).
- Auth is Firebase email/password; usernames are a synthetic-email shim
  (`app/core.js:1953-1961`). The web API key is public by design
  (`app/firebase-config.js`). A Python client can sign in over the Identity
  Toolkit REST endpoint and call Firestore and Storage REST with the bearer
  token; `firestore.rules` evaluates identically.
- Record ids come from the increment-only `meta/{coll}` counter transaction in
  `app/fb.js` (`allocId`, season-aware since v4.3.0). Anything that mints ids
  outside that path breaks `ID_TO_COLL` routing and QR labels.
- Storage CAD uploads need **both** a known lowercased extension and a content
  type of `application/octet-stream` or `model/*`, and the app renders files by
  `getDownloadURL()` token URLs.
- One Cloud Function exists (`functions/index.js`, `parseReceipt`, Node 20), so
  the pattern for a server-side roster-gated callable is already in the repo.
- The slicer comments already assume Fusion is the STL source (multi-body
  exports, per-surface tessellation, T-junctions: `app/slicer.js:91,195,347`).

## The user story the study must prove or disprove

1. In Fusion, with the mold design open, the member selects the mold body and
   runs "Plan stock" from an FEB toolbar panel.
2. The add-in asks for (or already holds) their app sign-in.
3. The add-in hands the mold geometry to the app's planner. The member sets
   name, density range and board mode the way they do in the app today.
4. The app creates the `stackplans` record and the `molds` record (stage
   "Designed"), exactly as `submitMold` does now, so the mold shows up in the
   Molds tab with its plan and cut list.
5. The add-in draws one box body per blank per layer, in a new component named
   after the mold id, at the stored `z0..z1` and `x0..x1, y0..y1`, sets opacity
   to about 0.3, names each body `L<n> <thickness>mm S<section>`, and leaves the
   mold body untouched.
6. The add-in stamps the mold record with the Fusion document it came from
   (URN, version, project, document name, body name), and the mold's detail
   card in the app shows that link, with an "Open in Fusion" affordance if the
   deep-link spike passes.
7. Later (pull, phase 2): from any open design, pick an existing mold and
   regenerate its stock bodies.

## Architectures to compare

Study A and B in full. C is rejected up front and the study says why in one
paragraph.

### A. Palette-hosted app (Fusion draws, the app thinks)

The add-in opens a Fusion palette pointed at the live app (a dedicated route or
query flag, e.g. `feb-composites.web.app/fusion.html`, loading the same
`core.js`, `fb.js`, `stock.js`, slicer files). Sign-in and the planner modal
are the real app code. The add-in exports the selected body as a mesh and posts
it into the page; the page runs `submitMold` unchanged, which allocates ids,
writes both records and uploads the mesh; then the page sends the plan's
`layers` back to Python, which draws the bodies.

Why it is attractive: zero duplicated planner logic, id allocation and rules
stay in one place, the rack lookup and density datalist come for free, and
future planner changes reach Fusion with no add-in release.

What must be proven: the palette's embedded Chromium runs the app (Workers,
IndexedDB auth persistence, WebGL optional), the JS↔Python bridge carries a
multi-megabyte STL in and a plan out, and the app can detect it is inside
Fusion without changing behaviour for browsers.

### B. Native dialog plus a Cloud Function slicer

A Fusion command dialog (name, density min/max, board mode, manual
thicknesses) and a new callable `sliceMold` in `functions/` that runs the
existing `slicer.js` under Node, allocates the ids with the Admin SDK, writes
both records, uploads the mesh, and returns `layers`. The add-in signs in over
REST and calls the function with the bearer token.

Why it is attractive: fully native UI, no embedded-browser risk, works the same
on Mac and Windows, and the function reuses the pure slicer verbatim.

What must be proven: the function can be roster-gated the way `parseReceipt`
is, the planner's inventory-dependent inputs (rack thicknesses from `DB.stock`,
the grade datalist, multi-body picker) can be served to a native dialog without
rebuilding half the modal, and Fusion's bundled Python can do HTTPS off the
main thread and marshal back with a custom event.

### C. Native dialog plus a Python port of the slicer (rejected)

Porting roughly 900 lines of geometry and the packer to Python creates a second
planner that drifts from the app's. The app's tests pin the packer's behaviour
byte-for-byte for a reason. Not studied further.

## Questions the study must answer

Grouped by who can answer them. Each gets a section in the study document.

### Fusion API capability (answered by spikes)

1. Can an add-in install and run under an educational licence on both macOS
   and Windows, from the per-user AddIns folder, with the bundled Python?
   Both platforms are required, since members use both.
2. Mesh out: does `STLExportOptions` export in centimetres (Fusion's internal
   unit) or in the design's display unit? If ambiguous, use
   `MeshCalculator` on the selected body and write the binary STL ourselves in
   millimetres. Confirm the mesh is in the root component's frame when the body
   sits in a sub-occurrence.
3. Bodies in: create axis-aligned boxes from `{x0,y0,z0,x1,y1,z1}` in a new
   component, parametric design mode, either by sketch + extrude or by
   `TemporaryBRepManager.createBox` + base feature. Confirm `BRepBody.opacity`
   exists and renders, and that body naming and component naming stick.
4. Palette bridge (A only): a palette can load an https page; page→Python via
   `adsk.fusionSendData` and Python→page via `sendInfoToHTML`; measure the
   payload ceiling (a 6 MB decimated STL is the app's own storage budget).
5. Palette browser (A only): Workers, IndexedDB and `fetch` to Firebase and
   Storage work; auth persists across Fusion restarts; WebGL absent is fine.
6. Threading (B only): HTTPS on a worker thread and a `CustomEvent` back to the
   main thread, without freezing the UI during a 10 second slice.
7. Provenance: what identifiers Fusion exposes for the open document
   (`dataFile.id` URN, `versionId`, project and folder ids, a web URL if any),
   and whether a `fusion360://` deep link can open a hub document from the app.
   This is the phase 1 mold link and the foundation of the pull direction.

### App-side changes (answered by reading the code; no code written)

8. Data model: a `fusion` block on `molds` (document URN, version, project,
   document name, body name, exported-at, by) and on `stackplans` (the same
   plus mesh provenance). Confirm this is a schema-table edit in
   `app/shop.js:51-77` plus a detail section, with no rules change because
   `molds` create/update is already `onRoster()`.
9. For A: what a `fusion.html` route needs (which scripts, how `submitMold`
   is reached without the Molds tab shell, how to detect the palette host, what
   `firebase.json` needs for the route).
10. For B: what `sliceMold` needs (roster gate, id allocation via the same
    counter transaction as `allocId`, Storage upload with a token URL the web
    UI can render, the `unit` and `sourceBytes` fields, the `by`/`ts` stamps).
11. Guest mode: a signed-out add-in must be refused writes the same three ways
    the app is; confirm nothing in either architecture bypasses that.

### Auth, security, distribution (answered by reasoning and one check)

12. Where the sign-in lives: the palette's browser session (A) or a refresh
    token in the user's home directory (B). Say what is stored where and how a
    member signs out.
13. Install and update: a zip in `10 Fusion Add-in/`, copied to the AddIns
    folder; a version check against a Firestore `config/` doc for a reload
    nudge, mirroring the app's own reload banner.
14. Educational licence terms permit add-ins and API use. Cite the Autodesk
    page in the study.

### Coordinate and unit pitfalls (answered by spikes 2 and 3)

15. The slicer stacks from `bounds.z0` upward and the first blank's x0 is
    negative by the CS-003 margin. Confirm bodies land on the mold with nothing
    to align, the way the exported section STLs already do.
16. Assemblies with bodies metres apart, and a mold not sitting on the origin.
17. Inch designs: Fusion display unit vs the millimetre plan.

## Spikes (throwaway, under `10 Fusion Add-in/spikes/`, never product code)

| Spike | Proves | Pass criterion |
|---|---|---|
| S1 `hello_addin` | Install path, bundled Python version, toolbar button, Mac and Windows | Button appears, logs Python version |
| S2 `mesh_out` | Mesh of a selected body in mm, root frame, as binary STL | STL opens in the app's planner with unit "mm" and correct bounds |
| S3 `boxes_in` | Draw two overlapping semi-transparent boxes from hard-coded mm coordinates into a new component | Bodies visible over a sample mold, opacity applied, names stick |
| S4 `palette_bridge` | Load `feb-composites.web.app` in a palette, sign in, round-trip a 6 MB string | Sign-in works, message arrives both ways, no CSP or Worker failure |
| S5 `rest_signin` | Python `urllib` sign-in and a Firestore read off the main thread | Token obtained, `molds` list read, UI stays responsive |
| S6 `provenance` | Read URN, version, project of the open document; try a `fusion360://` link | Fields logged; link either opens the doc or the study records that it does not |

S1 through S3 are required for both architectures. S4 decides A. S5 decides B.
S6 decides the shape of the phase 1 mold link and informs phase 2. Each spike
is one Python file plus a README line with the result, date, Fusion version
and platform. S1, S2 and S3 run on both macOS and Windows; S4 through S6 run
on macOS and are repeated on Windows only where the result could differ
(palette browser, file paths). Sample geometry comes from `app/samples/*.stl` and a Fusion
design made from one of them.

## Study document

`10 Fusion Add-in/FEASIBILITY.md`, structured as:

1. Summary and recommendation (A, B, or neither), with the go/no-go.
2. The user story above, as agreed.
3. What the app already provides (the findings list, kept current).
4. Architecture A and B: design sketch, spike results, effort estimate in
   sessions, maintenance cost, failure modes.
5. Data model additions and the rules impact (expected: none).
6. Phase 2 (pull): what the spikes say is possible.
7. Risks and unknowns, each with the spike or question that retires it.
8. Open items for Simon.

A short `10 Fusion Add-in/README.md` says what the folder is and that nothing
in it is installed on anyone's machine. The repo `README.md` gets the new folder
in its layout table in the same push.

## Constraints and non-goals

- No product code, no app edits, no rules deploys, no hosting deploys. Spikes
  live under `10 Fusion Add-in/spikes/` and never touch `06 Composites App/`.
- No Autodesk Platform Services app registration, no OAuth with Autodesk. The
  local Fusion API needs neither, and the study says so explicitly.
- No `#composites` announcement.
- Write like a person (rule 5): no em dashes, bold for labels only.

## Verification

The study is done when:

- Every numbered question above has an answer in `FEASIBILITY.md`, or is
  listed under open items with who can answer it.
- Each spike has a recorded pass or fail with the date and Fusion version. S1
  to S3 have results on both macOS and Windows; a missing Windows result is an
  open item naming who will run it, not a silent gap.
- The study specifies the mold link feature end to end: the fields on
  `molds`, where the detail card shows them, and whether "Open in Fusion" is
  a deep link or a copyable document name.
- S2 output loads in the live app's planner and produces a plan whose
  `bounds` match the Fusion body's bounding box in millimetres.
- S3 draws bodies whose coordinates match a hand-checked blank from a real
  stack plan (read via the Molds tab), so the coordinate-frame claim is
  verified against production data, not against the sample.
- The recommendation names one architecture and the first implementation
  chunk, sized in sessions, so the next session can start the build without
  re-deriving anything.
- Pushed to `main` with a commit message that records the recommendation and
  the spike results, `README.md` updated, `SESSION-STATE.md` pruned and
  updated per `.claude/SESSION-STATE-POLICY.md`.

## Open questions for Simon (not blocking the study)

- **Fusion is not installed on the Mac these sessions run on** (checked
  2026-09-04: nothing in `/Applications`, no per-user AddIns folder). So no
  spike can run from a session unattended. Either Fusion gets installed here
  under Simon's educational licence, or each spike is written here and run by
  a member on their own machine, who pastes the log back. The study needs one
  Mac and one Windows volunteer either way.
