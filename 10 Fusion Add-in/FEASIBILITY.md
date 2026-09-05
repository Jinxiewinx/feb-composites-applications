# Feasibility study: a Fusion add-in for the Molds section

Executes `FEASIBILITY-PLAN.md`. Spikes ran on 2026-09-04 on macOS (Fusion
2702.1.58, Python 3.14.0); results and scripts are in `spikes/`. Windows has
no result yet for any spike and that is an open item, not a gap that got
smoothed over.

## 1. Summary and recommendation

**Go, with architecture A: the real app in a Fusion palette.** Every spike
that A depends on passed. The palette is Chromium 122 with Workers, IndexedDB
and WebGL, it reaches Identity Toolkit and Firestore with the rules enforced,
and the bridge carries 6 MB in each direction in about a tenth of a second.
That means the add-in can export the selected body, hand it to the app's own
mold modal, and let `submitMold` do exactly what it does today: allocate the
ids through the shared counter, write the stack plan and the mold, upload the
mesh. The add-in's own job shrinks to three things: mesh out, identity out,
boxes in. Nothing about the planner is duplicated and nothing new runs on a
server.

B also passed its spike (S5), so it is a real fallback, but it costs a Cloud
Function that re-implements id allocation with the Admin SDK, a native
dialog that has to be fed the rack inventory and the density list, and a
second place where the mold and plan records get shaped. C is rejected, as
planned, for the same reason B is second: a second planner drifts.

**First chunk, two sessions.** Session one: the add-in (`FEBPlanStock/`) with
the FEB panel, the Plan stock command, body selection, mesh export, the
palette on the app with the bridge script, and drawing the returned blanks.
Session two: the app side, which is the bridge script itself, the `fusion`
block on `molds`, the Fusion section on the detail card, tests, version bump,
deploy. Stage 3 of the current prompt does both in one sitting if the session
holds.

**One spike failed and it does not change the recommendation.** The
`fusion360://` deep link opened nothing (S6), so "Open in Fusion" on the mold
card is a copyable document name plus a link to the document's Fusion Team
page (`dataFile.fusionWebURL`), where Autodesk's own "Open in Fusion" button
lives.

## 2. The user story

As agreed in the plan, unchanged:

1. In Fusion, with the mold design open, the member selects the mold body and
   runs "Plan stock" from the FEB toolbar panel.
2. The add-in opens the app in a palette. If the palette is not signed in,
   the app's own sign-in card is what they see.
3. The add-in exports the body as a millimetre STL and posts it into the
   page; the page opens the mold modal with the file already chosen, and the
   member sets name, density range and board mode the way they do today.
4. `submitMold` runs unchanged: `stackplans` and `molds` records, ids from
   the counter, mesh to Storage, the mold at "Designed".
5. The page hands the saved plan's layers back; the add-in draws one box per
   blank in a new component named after the plan id, opacity 0.3, bodies
   named `L<n> <thickness>mm S<section>`, mold body untouched.
6. The page stamped the mold with the Fusion document identity before saving
   (the add-in sent it with the mesh), and the detail card shows it.
7. Later, pull: pick a mold in the palette, regenerate its bodies in the open
   design.

## 3. What the app already provides

Confirmed by reading the code on 2026-09-04, and current:

- The stack plan stores `layers[i] = { z0, z1, thickness, section, blanks:
  [{x0,y0,x1,y1}] }` in millimetres in the mold's CAD frame
  (`app/slicer.js` `sliceMold`, `app/stlio.js` `sectionTris`). S3 drew from
  exactly that and the boxes landed on the mold.
- The slicer and packer are pure JS; `runSliceInline` in `app/stock.js` is
  the no-Worker path and `tools/test_slicer.mjs` evaluates `slicer.js` under
  Node. `spikes/s2_plan_node.mjs` did the same to plan the exported mesh.
- `submitMold` (`app/stock.js`) is the one place a plan and its mold are
  born: `allocId("stackplans")`, `allocId("molds")`, `save()` for both,
  `fb.upload` of the mesh, `setCurrentPlan`. Anything the add-in does must go
  through it, or through the same functions.
- Ids come from the `meta/{coll}` counter transaction in `app/fb.js`
  (`allocId`, season-aware). `ID_PREFIX.stackplans` is `STK`, molds `MOLD`.
- `molds` create and update are `onRoster()` in `firestore.rules`; there is no
  field whitelist on molds, so a new `fusion` map needs no rules change.
- Auth is Firebase email/password with usernames as synthetic addresses
  (`USER_DOMAIN`, `loginEmailFor` in `core.js`). Persistence is IndexedDB,
  which the palette has.
- The web API key is public config by design (`app/firebase-config.js`).
- Hosting sends `Cache-Control: no-cache` for html/js, so a deploy reaches the
  palette on next open, same as a browser.
- The one Cloud Function, `parseReceipt`, shows the roster gate pattern B
  would copy (`functions/index.js`).

## 4. The architectures

### A. Palette-hosted app

**Design.** The add-in opens `https://feb-composites.web.app/#/molds?fusion`
in a palette (`Palettes.add`, docked right, about 480 px wide). A small
bridge script in the app (`app/fusion.js`, loaded by `index.html`, inert
without `window.adsk`) polls for the `adsk` object for a few seconds,
registers `window.fusionJavaScriptHandler`, and tells Python `loaded`. Python
then sends one message, `mold`, with the body's binary STL as base64, the
body name, and the document identity. The bridge opens the mold modal, sets
`MOLD_BUF` from the STL with unit `mm` and the source name from the body,
and remembers the identity in `FUSION_CTX`. The member fills in the rest and
presses Plan. `submitMold` gains two lines: stamp `m.fusion` when
`FUSION_CTX` is set, and after the plan is saved call the bridge with `{
planId, moldId, layers }`. Python draws the boxes (S3's code, with the
allocated plan id as the component name). The palette stays open showing the
new mold's detail card, so the person sees what they made.

**Spike results.** S1, S2, S3, S4, S6 all pass for this path. The only
unverified piece is the app's own page inside the palette, which cannot be
read from Python; S4 verified every capability the page needs and left the
palette open for a person to look at. Stage 3's first deploy is where it is
proven end to end.

**Effort.** Add-in about 250 lines of Python (command, selection, mesh,
palette, handlers, drawing) plus the bridge script of about 80 lines and two
small edits in `stock.js`. Two sessions including tests and deploy.

**Maintenance.** Planner changes need no add-in release. The add-in has to
follow two API surfaces, Fusion's (stable for years) and the bridge contract
(two messages, ours). The document identity fields are read once.

**Failure modes.** The bridge object arriving late (poll for it). A message
sent before the page loads is dropped (wait for `loaded`). A user signed out
sees the sign-in card and nothing else happens until they sign in, which is
the right behaviour. Palette closed mid-plan: the app still saves; the
drawing step is lost and "Plan stock" again on the same body offers to draw
the last plan (phase 2 pull covers this properly). Autodesk swapping the
embedded browser again: the page is plain web code and needs nothing from
the browser beyond what a 2024 Chromium has.

### B. Native dialog plus a Cloud Function

**Design.** A `CommandDefinition` dialog with name, density min and max,
board mode and thicknesses; the add-in signs in over REST on a thread (S5),
posts the mesh and inputs to a new callable `sliceMold`, which runs
`slicer.js` under Node, allocates the ids with the Admin SDK in a
transaction that mirrors `allocId`, writes both records, uploads the mesh and
returns the layers.

**Spike results.** S5 passed: thread, HTTPS, custom event, main thread free.
S1 to S3 apply as well.

**Effort.** Add-in about 400 lines (dialog inputs, validation, token cache,
REST client). Function about 200 lines plus a Node build that vendors the
slicer and packer, a roster gate, tests against the emulator, and a functions
deploy, which the standing hosting authorization does not cover. Three to
four sessions.

**Maintenance.** Every change to the modal's inputs is done twice (web and
native). The rack inventory and density list have to be fetched by the
add-in to populate the dialog, so a third client of `DB.stock` exists. Id
allocation exists in two languages.

**Failure modes.** Drift between the web planner and the function's copy;
token storage on disk in the user's home folder; a function outage blocks
the feature entirely where A degrades to "use the browser".

### C. Native dialog plus a Python port of the slicer

Rejected in the plan. About 900 lines of geometry and the packer, whose
behaviour the app's tests pin byte for byte, would exist twice and drift.
Nothing in the spikes changes that.

## 5. Data model additions and rules impact

On `molds`, a `fusion` map written by the app when a plan is submitted from
the palette:

| Field | From | Example |
|---|---|---|
| `urn` | `dataFile.id` | `urn:adsk.wipprod:dm.lineage:YFZru_4jTGanjd9Eh5JkDg` |
| `versionId` | `dataFile.versionId` | `urn:adsk.wipprod:fs.file:vf.…?version=12` |
| `versionNumber` | `dataFile.versionNumber` | 12 |
| `project` | `parentProject.name` | FEB |
| `document` | `doc.name` | Clamshell Mold With Mating Surface |
| `body` | selected body name | Clamshell Mold Body |
| `webUrl` | `dataFile.fusionWebURL` | `https://my1635004.autodesk360.com/g/projects/…` |
| `exportedAt` | add-in, ISO 8601 | |
| `by` | `myEmail()` in the app | |

Shown on the mold detail card as a "Fusion" section: document name with a
copy button, body, version, project, when and by whom, and an "Open in Fusion
Team" link on `webUrl`. Read-only; the schema table in `app/shop.js` is for
editable fields and this block is stamped, so it renders like `buyRef` does,
as its own read-only section rather than as schema rows. On `stackplans`, the
same block is not needed: the plan already points at its mold and the mold
carries the block, and a re-plan of the same mold from Fusion overwrites the
block on the mold.

**Rules impact: none.** `molds` create and update are `onRoster()` with no
field list, so a signed-in member writing a map field is already allowed, a
guest is refused as before, and nothing in either architecture bypasses the
three refusals (client toast, `fb.js` throw, rules). No rules deploy in Stage
3 unless that finding turns out wrong, in which case rules go first and
alone.

## 6. Phase 2, pull

Everything pull needs is already stored or exposed. The palette can list
molds with a `fusion` block, and the add-in can match the open document by
`dataFile.id` to offer "this document's molds" first. Drawing is S3's code
from a stored plan. The one thing pull cannot do is open the Fusion document
from the app, because the deep link failed; the direction stays Fusion first.

## 7. Risks and unknowns

| Risk | Retired by | State |
|---|---|---|
| Palette cannot run the app | S4 capability probe | Retired for capabilities; page itself proven in Stage 3 |
| Payload ceiling below a real mesh | S4, 6 MB both ways | Retired |
| STL unit mistakes | S2 | Retired: set `unitType` explicitly or mesh by hand |
| Boxes land in the wrong frame | S3 against S2's plan | Retired for a root-level body; sub-occurrence body untested |
| Windows differences (paths, browser) | Nobody yet | Open: needs a member with Fusion on Windows |
| Bridge object timing | S4 | Retired: poll, and let the page speak first |
| Sign-in persistence across Fusion restarts | S4 IndexedDB present | Likely fine; confirm in Stage 3 by restarting Fusion |
| Deep link to reopen a document | S6 | Failed; web URL used instead |
| Edu licence forbids add-ins | Reasoning below | Open item for Simon to confirm |

**Educational licence.** Autodesk's support article "What are the terms of my
Fusion 360 education license?" says students and educators get free one-year
educational access, renewable while eligible, and Autodesk's Terms of Use
restrict educational offerings to educational purposes and not commercial or
for-profit use. Nothing in either restricts API use or add-ins; the API ships
with the product and the Scripts and Add-Ins dialog is present on the
educational build on this Mac (S1 ran under it). A student race team writing
its own add-in for its own molds is educational use. The linked
"Educational licensees additional terms" page returned 404 on 2026-09-04, so
the exact current wording could not be quoted and this is listed for Simon
below.

**No Autodesk Platform Services registration is needed.** The local API and
the palette need no Autodesk OAuth client and no APS app. Everything talks to
Firebase, as the browser does.

## 8. Open items for Simon

- Look at the `FEB Composites (S4)` palette left open in Fusion and say
  whether the app rendered and whether sign-in worked. It is the one S4 fact
  a script cannot read.
- Name a member with Fusion on Windows to run S1 to S3 (instructions are in
  `spikes/README.md`; the scripts run from Utilities > Add-Ins > Scripts).
- Confirm the educational licence reading above, or point at the current
  additional terms page.
- Sign-in storage: A keeps it in the palette's own browser profile, signed
  out through the app's own Sign out. No token is written to disk by the
  add-in. Say if that is not acceptable.
- Install and update: a zip of `FEBPlanStock/` in the repo, copied into the
  per-user AddIns folder, with a version string the add-in compares against
  `config/fusionAddin` in Firestore to show a "new version" note in the
  palette. That doc does not exist yet and needs a lead to create it.
