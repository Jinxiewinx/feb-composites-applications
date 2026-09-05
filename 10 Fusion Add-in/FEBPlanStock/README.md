# FEBPlanStock

The composites app's stack planner, run from inside Fusion. Select the mold
body, press **Plan stock** on the **FEB** panel (Utilities tab of the Design
workspace), and the app opens in a palette on the right with the mesh
already loaded. Sign in if asked, set the board density and mode, press
Plan. The app creates the stack plan and the mold record the same way it
does in a browser, and the planned blanks appear over the mold as
see-through bodies, one component named after the plan id, each body named
`L<layer> <thickness>mm S<section>`. The mold record carries a Fusion
section with the document, body, version and a link to its Fusion Team page.

Nothing is saved to the document by the add-in. You save.

## Install

The add-in is a folder; Fusion loads every folder in its per-user AddIns
directory at startup. Copy `FEBPlanStock/` (this folder, with the
`.manifest`, the `.py` and `resources/`) there:

| Platform | AddIns folder |
|---|---|
| macOS | `~/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns/` |
| Windows | `%APPDATA%\Autodesk\Autodesk Fusion 360\API\AddIns\` |

On macOS, from a terminal in this repo:

```bash
cp -R "10 Fusion Add-in/FEBPlanStock" "$HOME/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns/"
```

On Windows, in PowerShell from the repo folder:

```powershell
Copy-Item -Recurse "10 Fusion Add-in\FEBPlanStock" "$env:APPDATA\Autodesk\Autodesk Fusion 360\API\AddIns\"
```

Then either restart Fusion (the manifest says `runOnStartup`) or open
Utilities, Add-Ins, the Add-Ins tab, select FEBPlanStock and press Run. The
FEB panel appears on the Utilities tab of the Design workspace.

To update, replace the folder and restart Fusion. To remove, delete the
folder.

Verified on macOS (Fusion 2702.1.58, 2026-09-04). Windows is untested and
the path above is Autodesk's documented one.

## Using it

1. Open the mold design. The mold body should sit on the origin the way
   CS-003 expects, with Z up; the planner slices along Z from the body's
   lowest point.
2. Utilities tab, FEB panel, Plan stock. Select the mold body (a solid body;
   one at a time). Press OK.
3. The FEB Composites palette opens docked on the right. The first time it
   asks you to sign in with your app account; the palette remembers it.
4. The mold modal is already open with the mesh loaded in millimetres and a
   name suggested from the document and body. Set density (and thicknesses
   if you are choosing them yourself) and press Plan.
5. The blanks appear as bodies with 30% opacity in a component named after
   the plan (STK-SN6-…). Use them as CAM stock. Re-running Plan stock on the
   same mold replaces that component.

If the palette is closed, Plan stock reopens it. If the page shows the
sign-in card and nothing else, sign in; the mesh is queued and arrives once
the page is ready.

## What talks to what

`FEBPlanStock.py` meshes the body with Fusion's `MeshCalculator` (Fusion's
API is in centimetres; the STL is written in millimetres by hand, so no
export dialog and no unit guess), base64-encodes it and sends it to the page
with `Palette.sendInfoToHTML("mold", …)`. The page side is
`06 Composites App/app/fusion.js`: it waits for Fusion's `adsk` bridge object,
announces `loaded`, opens the mold modal with the mesh, and after
`submitMold()` saves the plan sends `plan` back with the layers. The add-in
draws them. Two messages each way; the whole contract is at the top of each
file.

A log of what the add-in did is written to `febplanstock.log` beside the
add-in, because a running add-in has no console.
