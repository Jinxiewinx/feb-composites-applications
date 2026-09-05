"""FEBPlanStock: the composites app's stack planner, from inside Fusion.

Adds an "FEB" panel to the Design workspace's Utilities tab with one command,
"Plan stock". Select the mold body, run it, and:

  1. the body is meshed and written as a binary STL in millimetres, in the
     root component's frame;
  2. the composites app (feb-composites.web.app) opens in a palette, docked
     on the right, and gets the mesh plus this document's identity;
  3. the member signs in if the palette is not signed in, sets the density
     and board mode in the app's own mold modal, and presses Plan. The app
     creates the stack plan and the mold record exactly as it does in a
     browser (ids from the shared counter, mesh to Storage) and stamps the
     mold with the Fusion document;
  4. the app hands the saved layers back and this add-in draws one box per
     blank in a new component named after the plan id, opacity 0.3, each
     body named "L<n> <thickness>mm S<section>". The mold body is untouched.

Nothing is saved to the document by the add-in. You save.

The message contract with app/fusion.js (JSON strings):
  add-in -> page   "mold"   {stl, body, fusion}
  page -> add-in   "loaded" {version}   "plan" {planId, moldId, name, layers}   "cancel" {}

Facts this code leans on (10 Fusion Add-in/spikes/README.md):
  - STLExportOptions.unitType reads inches on an inch design and writes mm
    anyway; MeshCalculator (cm, times 10) avoids the question and a temp file.
  - The palette's `adsk` bridge object arrives about a second after the page
    runs, and a sendInfoToHTML before the page reports "loaded" is dropped,
    so the page speaks first and the mesh is queued until it does.
  - Parametric designs take temporary bodies through a base feature; names
    and opacity are set after finishEdit().
"""
import adsk.core, adsk.fusion, traceback, os, json, time, base64, struct

APP_URL = "https://feb-composites.web.app/?fusion=1#/molds"
PALETTE_ID = "feb_plan_stock_palette"
CMD_ID = "FEB_PlanStock"
PANEL_ID = "FEB_Panel"
WORKSPACE_ID = "FusionSolidEnvironment"
TAB_ID = "ToolsTab"
HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "febplanstock.log")

_app = None
_ui = None
_handlers = []          # event handlers must outlive the function that made them
_state = {"page_ready": False, "pending": None, "design": None}


def log(*parts):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(p) for p in parts) + "\n")
    except Exception:
        pass


# ---------- geometry out ----------

def design_of(doc):
    """The design product even when Manufacture is the active workspace."""
    des = doc.products.itemByProductType("DesignProductType")
    return adsk.fusion.Design.cast(des)


def body_to_stl_mm(body):
    """Binary STL bytes, millimetres, root frame. A body picked inside an
    occurrence arrives as a proxy in the root context, so its mesh is already
    in the root frame."""
    mc = body.meshManager.createMeshCalculator()
    mc.setQuality(adsk.fusion.TriangleMeshQualityOptions.NormalQualityTriangleMesh)
    tm = mc.calculate()
    coords, idx = tm.nodeCoordinatesAsDouble, tm.nodeIndices
    out = bytearray()
    out += b"FEBPlanStock binary STL, millimetres, root frame".ljust(80, b" ")
    out += struct.pack("<I", tm.triangleCount)
    for t in range(tm.triangleCount):
        pts = []
        for i in (idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]):
            pts.append((coords[3 * i] * 10.0, coords[3 * i + 1] * 10.0, coords[3 * i + 2] * 10.0))
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = pts
        ux, uy, uz, vx, vy, vz = bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        n = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
        out += struct.pack("<12fH", nx / n, ny / n, nz / n, ax, ay, az, bx, by, bz, cx, cy, cz, 0)
    return bytes(out), tm.triangleCount


def document_identity(doc, body_name):
    """What the mold record stores about where its mesh came from. Every
    field is optional: an unsaved document has no dataFile at all."""
    ident = {"document": doc.name, "body": body_name, "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%S")}
    try:
        if doc.isSaved and doc.dataFile:
            df = doc.dataFile
            ident.update({
                "urn": df.id, "versionId": df.versionId, "versionNumber": df.versionNumber,
                "webUrl": df.fusionWebURL or "",
            })
            try:
                ident["project"] = df.parentProject.name
            except Exception:
                pass
            try:
                ident["folder"] = df.parentFolder.name
            except Exception:
                pass
    except Exception:
        log("identity:", traceback.format_exc())
    return ident


# ---------- geometry in ----------

def draw_plan(plan):
    """One box per blank, in a new component named after the plan id."""
    des = _state.get("design") or design_of(_app.activeDocument)
    root = des.rootComponent
    name = plan.get("planId") or "Stock plan"
    # Re-running for the same plan replaces the previous component's bodies.
    for occ in root.occurrences:
        if occ.component.name == name:
            occ.deleteMe()
            break
    occ = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    comp = occ.component
    comp.name = name
    tb = adsk.fusion.TemporaryBRepManager.get()
    parametric = des.designType == adsk.fusion.DesignTypes.ParametricDesignType
    base = comp.features.baseFeatures.add() if parametric else None
    if base:
        base.startEdit()
    names = []
    for L in plan.get("layers", []):
        n = int(L.get("index", 0)) + 1
        blanks = L.get("blanks", [])
        for k, b in enumerate(blanks):
            x0, y0, x1, y1 = b["x0"] / 10.0, b["y0"] / 10.0, b["x1"] / 10.0, b["y1"] / 10.0
            z0, z1 = L["z0"] / 10.0, L["z1"] / 10.0
            centre = adsk.core.Point3D.create((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
            obb = adsk.core.OrientedBoundingBox3D.create(
                centre, adsk.core.Vector3D.create(1, 0, 0), adsk.core.Vector3D.create(0, 1, 0),
                x1 - x0, y1 - y0, z1 - z0)
            tmp = tb.createBox(obb)
            if base:
                comp.bRepBodies.add(tmp, base)
            else:
                comp.bRepBodies.add(tmp)
            thk = L.get("thickness", z1 * 10 - z0 * 10)
            suffix = chr(97 + k) if len(blanks) > 1 else ""
            names.append(f"L{n} {thk:g}mm S{int(L.get('section', 0))}{suffix}")
    if base:
        base.finishEdit()
    for i, nm in enumerate(names):
        if i < comp.bRepBodies.count:
            body = comp.bRepBodies.item(i)
            body.name = nm
            body.opacity = 0.3
    log("drew", len(names), "bodies in", name)
    return len(names)


# ---------- palette ----------

class PaletteIncoming(adsk.core.HTMLEventHandler):
    def notify(self, args):
        try:
            a = adsk.core.HTMLEventArgs.cast(args)
            action, data = a.action, a.data or "{}"
            if action == "loaded":
                _state["page_ready"] = True
                log("page loaded:", data[:200])
                a.returnData = "ok"
                flush_pending()
            elif action == "plan":
                plan = json.loads(data)
                n = draw_plan(plan)
                a.returnData = "ok"
                _ui.messageBox(f"{plan.get('planId', 'The plan')} is saved in the app and {n} stock "
                               f"{'body is' if n == 1 else 'bodies are'} drawn over the mold.\n\n"
                               f"Nothing is saved to this document yet.", "FEB Plan stock")
            elif action == "cancel":
                _state["pending"] = None
                a.returnData = "ok"
            elif action == "response":
                # The page's answer to a sendInfoToHTML: "ok" means the mold
                # modal opened with the mesh; anything else names the problem.
                log("page response:", data[:200])
                try:
                    reply = json.loads(data).get("data", "")
                except Exception:
                    reply = data
                if reply and reply != "ok" and not reply.startswith("pong"):
                    _ui.messageBox("The app could not take the mesh:\n" + str(reply), "FEB Plan stock")
            else:
                a.returnData = "ok"
        except Exception:
            log("incoming:", traceback.format_exc())
            _ui.messageBox("Plan stock could not read what the app sent back:\n" + traceback.format_exc(), "FEB Plan stock")


class PaletteClosed(adsk.core.UserInterfaceGeneralEventHandler):
    def notify(self, args):
        _state["page_ready"] = False
        _state["pending"] = None


def palette():
    p = _ui.palettes.itemById(PALETTE_ID)
    if p:
        return p
    _state["page_ready"] = False
    p = _ui.palettes.add(PALETTE_ID, "FEB Composites", APP_URL, True, True, True, 460, 760, True)
    p.dockingState = adsk.core.PaletteDockingStates.PaletteDockStateRight
    h = PaletteIncoming(); p.incomingFromHTML.add(h); _handlers.append(h)
    c = PaletteClosed(); p.closed.add(c); _handlers.append(c)
    return p


def flush_pending():
    msg = _state.get("pending")
    if not msg or not _state.get("page_ready"):
        return
    _state["pending"] = None
    p = palette()
    t = time.time()
    p.sendInfoToHTML("mold", json.dumps(msg))
    log("sent mesh", len(msg.get("stl", "")), "chars in", round(time.time() - t, 3), "s")


# ---------- the command ----------

class CommandCreated(adsk.core.CommandCreatedEventHandler):
    def notify(self, args):
        try:
            cmd = adsk.core.CommandCreatedEventArgs.cast(args).command
            cmd.isRepeatable = False
            sel = cmd.commandInputs.addSelectionInput("body", "Mold body", "Select the mold body to plan stock for")
            sel.addSelectionFilter("SolidBodies")
            sel.setSelectionLimits(1, 1)
            cmd.commandInputs.addTextBoxCommandInput("note", "",
                "The body is exported in millimetres and handed to the composites app, which opens on the right. "
                "Sign in there if asked, set the board density, press Plan. The layers come back as see-through bodies.",
                4, True)
            h = CommandExecute(); cmd.execute.add(h); _handlers.append(h)
        except Exception:
            _ui.messageBox("Plan stock failed to open:\n" + traceback.format_exc(), "FEB Plan stock")


class CommandExecute(adsk.core.CommandEventHandler):
    def notify(self, args):
        try:
            cmd = adsk.core.CommandEventArgs.cast(args).command
            sel = adsk.core.SelectionCommandInput.cast(cmd.commandInputs.itemById("body"))
            body = adsk.fusion.BRepBody.cast(sel.selection(0).entity)
            doc = _app.activeDocument
            _state["design"] = design_of(doc)
            stl, tris = body_to_stl_mm(body)
            ident = document_identity(doc, body.name)
            _state["pending"] = {"stl": base64.b64encode(stl).decode("ascii"), "body": body.name, "unit": "mm", "fusion": ident}
            log("exported", body.name, tris, "triangles,", len(stl), "bytes")
            p = palette()
            p.isVisible = True
            if _state["page_ready"]:
                flush_pending()
            else:
                # The page announces itself with "loaded" and the mesh goes then.
                # If it never does (offline, signed-out palette that never loaded),
                # say so after a while rather than sitting silent.
                _state["asked_at"] = time.time()
        except Exception:
            _ui.messageBox("Plan stock failed:\n" + traceback.format_exc(), "FEB Plan stock")


def run(context):
    global _app, _ui
    try:
        _app = adsk.core.Application.get()
        _ui = _app.userInterface
        cmd = _ui.commandDefinitions.itemById(CMD_ID)
        if not cmd:
            cmd = _ui.commandDefinitions.addButtonDefinition(
                CMD_ID, "Plan stock",
                "Export the selected mold body to the composites app's stack planner and draw the tooling-board layers over it.",
                os.path.join(HERE, "resources"))
        h = CommandCreated(); cmd.commandCreated.add(h); _handlers.append(h)
        ws = _ui.workspaces.itemById(WORKSPACE_ID)
        tab = ws.toolbarTabs.itemById(TAB_ID) or ws.toolbarTabs.item(0)
        panel = tab.toolbarPanels.itemById(PANEL_ID) or tab.toolbarPanels.add(PANEL_ID, "FEB")
        if not panel.controls.itemById(CMD_ID):
            ctl = panel.controls.addCommand(cmd)
            ctl.isPromoted = True
            ctl.isPromotedByDefault = True
        log("FEBPlanStock loaded; Fusion", _app.version)
    except Exception:
        if _ui:
            _ui.messageBox("FEBPlanStock failed to load:\n" + traceback.format_exc(), "FEB Plan stock")


def stop(context):
    try:
        ui = adsk.core.Application.get().userInterface
        p = ui.palettes.itemById(PALETTE_ID)
        if p:
            p.deleteMe()
        ws = ui.workspaces.itemById(WORKSPACE_ID)
        for tab in ws.toolbarTabs:
            panel = tab.toolbarPanels.itemById(PANEL_ID)
            if panel:
                ctl = panel.controls.itemById(CMD_ID)
                if ctl:
                    ctl.deleteMe()
                panel.deleteMe()
        cmd = ui.commandDefinitions.itemById(CMD_ID)
        if cmd:
            cmd.deleteMe()
    except Exception:
        log("stop:", traceback.format_exc())
