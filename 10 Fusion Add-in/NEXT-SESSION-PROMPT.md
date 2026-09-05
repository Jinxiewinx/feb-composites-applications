# Prompt for the next session

Written 2026-09-04 at Simon's request. Paste the block below as the first
message of a fresh Claude Code session opened in `SN6 Resources/`. A fresh
session is required: the `fusion` MCP server was registered after the current
one started, so only a new session can see its tools.

---

Read `SESSION-STATE.md`, then `10 Fusion Add-in/FEASIBILITY-PLAN.md` and
`10 Fusion Add-in/MCP.md`. Every decision in the plan is settled with me; do
not re-ask any of them. Work in the order below, pushing after each numbered
stage lands (rule 1), keeping SESSION-STATE current and pruned (rule 2), and
using your judgment rather than asking (rule 3). Write like a person (rule 5).

Fusion is open on this Mac with the design "Clamshell Mold With Mating
Surface" (display unit inches, parametric, 134 timeline items). The mold is
the root component's visible solid body named "Clamshell Mold Body", whose
bounding box is 0,0,0 to 889 x 533.4 x 61.6 mm, sitting on the origin the way
CS-003 expects. The Manufacture workspace may be active, so get the design
with `doc.products.itemByProductType("DesignProductType")`, not
`app.activeProduct`. The design also holds a large assembly under
occurrences; leave everything but the mold body alone. Never save the
document from a script; I save.

Use the `fusion` MCP server (`fusion_mcp_execute` with featureType "script",
`fusion_mcp_read` for screenshots and API docs). Run
`python3 "10 Fusion Add-in/tools/find_fusion_mcp.py"` first; if the tools are
not visible, the raw HTTP path in `MCP.md` works.

## Stage 1: run spikes S1, S2, S3 and S6 from the plan

Scripts go under `10 Fusion Add-in/spikes/`, one file each, with results in
`spikes/README.md` (date, Fusion version, platform, pass or fail, what was
learned). Throwaway code, never product code.

- S1: Fusion and Python versions, install paths for AddIns on macOS and
  Windows (Windows from documentation, marked untested).
- S2: mesh of "Clamshell Mold Body" as binary STL in millimetres in the root
  frame. Settle whether `STLExportOptions` writes centimetres, inches or
  millimetres for an inch design; if in doubt build the STL from
  `MeshCalculator` yourself. Load the result into the live app's planner
  (feb-composites.web.app, Molds tab, sign in with my account only if I have
  given you credentials in this session; otherwise use the local planner via
  `tools/serve_populated.mjs`) and confirm the plan's `bounds` equal the
  body's bounding box in millimetres.
- S3: from that plan's `layers[].blanks`, draw one box body per blank in a
  new component named after the plan id, at the stored z0..z1, opacity about
  0.3, each body named `L<n> <thickness>mm S<section>`. Take a screenshot
  through `fusion_mcp_read` and check the boxes sit over the mold with nothing
  to align. Use `fusion_mcp_update` undo to remove them afterwards, or leave
  them and tell me.
- S6: the document's `dataFile` id, versionId, versionNumber, project and
  folder, and whether any web URL property exists; then whether a
  `fusion360://` deep link opens a hub document (record the format you tried
  and the outcome).

Push after the four spikes have results, even if some fail.

## Stage 2: finish the feasibility study

Write `10 Fusion Add-in/FEASIBILITY.md` per the plan's "Study document"
section. Architecture A (the real app in a Fusion palette) versus B (native
dialog plus a Cloud Function running the existing pure-JS slicer). S4 and S5
need real add-in code; write the smallest add-in that answers each (a palette
loading the live app and round-tripping a 6 MB string; a threaded REST sign-in
plus a Firestore read) and install it in
`~/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns/` to
test. Recommend one architecture and size the first chunk in sessions. Push.

## Stage 3: build the add-in and the feature

Only after Stage 2's recommendation is written. Build the recommended
architecture as `10 Fusion Add-in/FEBPlanStock/` (toolbar panel "FEB",
command "Plan stock"): select the mold body, sign in, run the planner, create
the stack plan and mold records exactly as `submitMold` does (ids through the
shared counter, never minted locally), draw the blanks as semi-transparent
bodies, and stamp the mold record with the Fusion document identity
(`fusion` block: URN, versionId, versionNumber, project, document name, body
name, exportedAt, by). App side: add that block to the molds schema in
`app/shop.js` and a "Fusion" section on the mold detail card, with "Open in
Fusion" as a deep link only if S6 proved it and as a copyable document name
otherwise. No rules change is expected; say so explicitly if that holds, and
deploy rules first and alone if it does not. Tests for the app change,
version bump per the rubric, CHANGELOG, README rows for the new folder and
the add-in's own README with install steps for both platforms. Push, deploy
hosting, verify off the live host. Do not announce in #composites.

Stop and tell me at the end of each stage what passed, what failed, and what
you decided. If a spike fails in a way that changes the recommendation, say so
before starting Stage 3.
