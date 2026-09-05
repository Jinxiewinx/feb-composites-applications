# Spikes

Throwaway scripts that answer the Fusion API questions in
`../FEASIBILITY-PLAN.md`. None of this is product code and none of it is
installed anywhere. S1, S2, S3 and S6 ran through Fusion's built-in MCP
server (`../MCP.md`) against the live design "Clamshell Mold With Mating
Surface" (inch display units, parametric, 134 timeline items). S4 and S5 need
a real add-in and are recorded in `../FEASIBILITY.md`.

Every macOS result below is from one machine: Fusion 2702.1.58, bundled
Python 3.14.0, macOS 26.3 arm64, 2026-09-04. No Windows result exists yet;
the Windows column is an open item for a member with Fusion installed, and
the scripts are written so that member can run them unchanged from
Utilities, Add-Ins, Scripts.

| Spike | File | macOS | Windows | Result |
|---|---|---|---|---|
| S1 | `s1_hello.py` | pass | untested | Versions read, AddIns folder exists |
| S2 | `s2_mesh_out.py`, `s2_plan_node.mjs` | pass | untested | STL in mm, plan bounds equal the body box |
| S3 | `s3_boxes_in.py`, `s3_boxes_in.png` | pass | untested | Boxes land on the mold, names and opacity stick |
| S6 | `s6_provenance.py` | pass, deep link fail | untested | Identity fields read; `fusion360://` did not open a document |

## S1: install path and runtime

- `app.version` 2702.1.58; `sys.version` 3.14.0, Clang build, arm64. The
  interpreter is Fusion's own process, not a system Python.
- The API package lives inside the app bundle under
  `Contents/Api/Python/packages/adsk/`, and the bundle itself is under
  `~/Library/Application Support/Autodesk/webdeploy/production/<hash>/`, so
  the path changes with every Fusion update. Nothing in the add-in may depend
  on it.
- Per-user add-in folder on macOS:
  `~/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns/`.
  It exists and is empty on this machine. The sibling `API/Scripts/` also
  exists.
- Windows, from Autodesk's documentation and untested here:
  `%APPDATA%\Autodesk\Autodesk Fusion 360\API\AddIns\`.
- With the Manufacture workspace active, `app.activeProduct` is a CAM
  product; `doc.products.itemByProductType("DesignProductType")` returns the
  design regardless of workspace. In this session the active product was the
  design, but the add-in must not assume that.
- The root component holds 20 bodies, of which one is visible: "Clamshell
  Mold Body", solid, 70 faces, bounding box 0,0,0 to 88.9 x 53.34 x 6.1609 cm
  (Fusion's API is always in centimetres). The other 19 are hidden
  construction bodies and surfaces. Body selection by name would be
  ambiguous in a general design; the add-in selects by the user's pick.

## S2: mesh out, in millimetres, root frame

Two ways to get triangles, both measured by reading the STL files back with
a byte-level Python script rather than by trusting any API property.

**ExportManager with STLExportOptions.** For this inch design the freshly
created options object reports `unitType == 3` (InchDistanceUnits), which
matches the documentation ("initialized with the default units specified for
the Design"). The file it writes with that default untouched measures
889 x 533.4 x 61.64, which is millimetres. The getter and the writer
disagree. Setting `unitType` explicitly does work: InchDistanceUnits gave
35 x 21 x 2.427, MillimeterDistanceUnits gave 889 x 533.4 x 61.64,
CentimeterDistanceUnits gave 88.9 x 53.34 x 6.164. So the rule for the
add-in is: always set `unitType = MillimeterDistanceUnits` and never rely on
the default. The binary header Fusion writes is `STLB ATF 15.8.0.0 COLOR=`,
the ASCII variant starts `solid ASCII`; neither names a unit.

**MeshCalculator.** `body.meshManager.createMeshCalculator()` at
NormalQualityTriangleMesh gave 1516 triangles and 1204 nodes, coordinates in
centimetres. Multiplying by 10 and writing binary STL by hand (about 30 lines,
in `s2_mesh_out.py`) produced a 75,884-byte file with the same bounds as the
export manager's millimetre file. This path needs no temp file and lets the
add-in stamp its own header, so it is the one to build on. The body sits in
the root component (`assemblyContext` is None), so body frame and root frame
coincide here; a body inside an occurrence needs
`body.createForAssemblyContext(occ)` before meshing, which S2 did not
exercise (open item 16 in the plan).

**Bounding box detail.** The BRep `boundingBox` reports z max 6.1609 cm, the
mesh reaches 6.1636 cm. The mesh cannot exceed the true solid, so the
reported box is loose by about 0.03 mm. The planner works from the mesh, so
`bounds.z1` is 61.636 mm and not the 61.6 the design browser shows. This
is why the study says "bounds equal the mesh's box", not "equal the
browser's readout".

**In the app.** The millimetre STL was loaded into the app's planner two
ways. Under Node with `s2_plan_node.mjs`, which evaluates `app/slicer.js`
the way `tools/test_slicer.mjs` does, `splitBodies` found one body and
`planMold` with a 1in and 2in rack returned bounds
x 0..889, y 0..533.4, z 0..61.636, composition [50.8, 25.4], no warnings.
Then in the local populated app (`tools/serve_populated.mjs`, Molds tab,
"+ Mold", start from an STL, units mm, boards chosen from stock) the saved
`stackplans` record carried the identical `bounds`, `unit: "mm"`,
`triangleCount: 1516`, and a mold at "Designed" pointing at it. The fixture
rack has 1.5, 2 and 3in board, so that plan was a single 3in layer; its one
blank was x -25.4..914.4, y -31.75..565.15, the CS-003 inch margin around the
mold. That blank is the same numbers as layer 1 of the Node plan, which is
the blank S3 drew. The live app at feb-composites.web.app was not used: no
credentials were given this session, and the planner code is the same file.

## S3: boxes in

`s3_boxes_in.py` reads the plan JSON from S2 and, in a new component named
after the plan id, adds one box per blank through
`TemporaryBRepManager.createBox(OrientedBoundingBox3D)` and
`bRepBodies.add(tmp, baseFeature)` inside `baseFeature.startEdit()` /
`finishEdit()`. That is the parametric-mode route; it costs two timeline
items (the new component, the base feature). Results:

- Names stick when set after `finishEdit()` on `comp.bRepBodies.item(i)`;
  the body handles returned by `add()` inside the edit are stale afterwards.
- `BRepBody.opacity = 0.3` reads back as 0.3 and renders as a see-through
  grey box in the viewport (`s3_boxes_in.png`, iso top right).
- Bounding boxes read back in millimetres: L1 -25.4,-31.75,0 to
  914.4,565.15,50.8; L2a -25.4,420.56,50.8 to 914.4,560.26,76.2; L2b
  -25.4,-30.8,50.8 to 914.4,121.6,76.2. Those are the plan's numbers to the
  hundredth. The boxes sit around the mold with the margin visible on every
  side and nothing was moved, scaled or aligned.
- Mold body untouched; the assembly under the three occurrences untouched.
- Removed afterwards with the MCP server's undo, so the document is back to
  its 134 items. The base feature would be the natural place to also hold a
  "regenerate" later: delete the component and draw again.

## S6: provenance and the deep link

`s6_provenance.py` read, for the open document:

| Field | Value |
|---|---|
| `dataFile.id` | `urn:adsk.wipprod:dm.lineage:YFZru_4jTGanjd9Eh5JkDg` |
| `dataFile.versionId` | `urn:adsk.wipprod:fs.file:vf.YFZru_4jTGanjd9Eh5JkDg?version=12` |
| `dataFile.versionNumber` / `latestVersionNumber` | 12 / 12 |
| `dataFile.fusionWebURL` | `https://my1635004.autodesk360.com/g/projects/20250114858949751/data/<folder b64>/<lineage b64>` |
| `parentProject` | FEB, `a.YnVzaW5lc3M6bXkxNjM1MDA0IzIwMjUwMTE0ODU4OTQ5NzUx` |
| `parentFolder` | "clamshell mold (Simon)", `urn:adsk.wipprod:fs.folder:co.Yww4ZrNxRNikieyXHq8dEA` |
| hub | FEB Aero, `a.YnVzaW5lc3M6bXkxNjM1MDA0`, `fusionWebURL` `https://my1635004.autodesk360.com` |
| `app.currentUser` | display name and email of the signed-in Autodesk user |

So the `fusion` block on a mold record has a stable lineage URN, a version
URN and number, project and folder names and ids, the document name, the
body name, and a real https URL to the document's page in Fusion Team. The
web URL is the surprise: it is the thing the mold card can link to. Not read:
`dataFile.publicLink` and `sharedLink`, because reading them creates a share.

**Deep link.** Fusion.app registers the `fusion360` scheme
(`CFBundleURLSchemes` in its Info.plist; LaunchServices lists
"claimed schemes: fusion360:"). The format Fusion Team's own "Open in
Fusion" button uses is

```
fusion360://userEmail=<email>&lineageUrn=<lineage urn>&hubUrl=<hub url>&documentName=<name>
```

Tried from the shell, with MOLD-TEST-1 (a hub document that was not open):

- raw, via `open`: rejected by `open` itself as "not a URL" (the colons and
  slashes in the query never reach Fusion). `osascript open location` and
  Foundation's `URL(string:)` reject the raw form the same way.
- partly encoded (only `@` and the hub URL): rejected the same way.
- fully percent-encoded, via `open -u` and via `NSWorkspace.shared.open`:
  accepted (`open` returned true), Fusion came to the front, and no document
  opened. `app.documents` stayed at three before and after, checked twice
  twelve seconds apart.

Outcome: fail. The scheme exists but nothing this session could hand it
opened a document, and Autodesk documents no format for it. "Open in
Fusion" in the app is therefore the document name to copy plus the
`fusionWebURL` link, which opens the Fusion Team page where the user's own
"Open in Fusion" button lives. If Autodesk publishes the URL format later
the field is already stored to build it from.

A side note from LaunchServices: it lists Fusion 2705.1.11 while the running
build is 2702.1.58, so an update is staged on this Mac. Nothing here
depends on either number.
