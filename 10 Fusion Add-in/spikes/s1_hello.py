"""S1: Fusion and Python versions, AddIns folders. Run through the `script`
tool of Fusion's built-in MCP server (see ../MCP.md). Read-only.

Throwaway spike, not product code. Result in README.md beside this file."""
import adsk.core, adsk.fusion, sys, platform, os

MAC_ADDINS = "~/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns"
MAC_SCRIPTS = "~/Library/Application Support/Autodesk/Autodesk Fusion 360/API/Scripts"
# Windows, from Autodesk's documentation, untested here:
WIN_ADDINS = r"%APPDATA%\Autodesk\Autodesk Fusion 360\API\AddIns"


def run(_context: str):
    app = adsk.core.Application.get()
    print("fusion version:", app.version)
    print("python:", sys.version)
    print("platform:", platform.platform(), platform.machine())
    print("executable:", sys.executable)
    print("api path:", adsk.core.__file__)
    for p in (MAC_ADDINS, MAC_SCRIPTS):
        e = os.path.expanduser(p)
        print(p, "exists" if os.path.isdir(e) else "missing", os.listdir(e) if os.path.isdir(e) else "")
    doc = app.activeDocument
    print("doc:", doc.name, "isModified", doc.isModified)
    print("activeProduct:", app.activeProduct.productType)
    # Manufacture may be the active workspace, so ask the document for the design.
    des = doc.products.itemByProductType("DesignProductType")
    um = des.unitsManager
    print("design type:", des.designType, "units:", um.defaultLengthUnits, "internal:", um.internalUnits)
    root = des.rootComponent
    print("root:", root.name, "bodies:", root.bRepBodies.count, "occurrences:", root.occurrences.count,
          "timeline:", des.timeline.count)
    for b in root.bRepBodies:
        bb = b.boundingBox
        print(" body", repr(b.name), "visible", b.isVisible, "solid", b.isSolid,
              "min(cm)", [round(v, 4) for v in bb.minPoint.asArray()],
              "max(cm)", [round(v, 4) for v in bb.maxPoint.asArray()], "faces", b.faces.count)
