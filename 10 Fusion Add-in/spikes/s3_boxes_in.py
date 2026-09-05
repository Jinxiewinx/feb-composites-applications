"""S3: draw one box body per blank from a stack plan's layers into a new
component named after the plan id, semi-transparent, over the mold.

PLAN is the JSON s2_plan_node.mjs writes: { layers: [{index, z0, z1,
thickness, section, blanks: [{x0,y0,x1,y1}]}] } in millimetres in the mold's
CAD frame. Fusion's API works in centimetres, hence the /10.

Parametric design: temporary bodies go in through a base feature (two
timeline items: the component and the base feature). Names and opacity are
set after finishEdit(), on the bodies as they exist in the component.

Throwaway spike, not product code."""
import adsk.core, adsk.fusion, json

PLAN = "~/Desktop/feb-s2/s2_meshcalc_mm-plan.json"
PLAN_ID = "STK-SN6-S3"   # spike placeholder; the add-in uses the allocated id


def run(_context: str):
    import os
    app = adsk.core.Application.get()
    des = app.activeDocument.products.itemByProductType("DesignProductType")
    root = des.rootComponent
    plan = json.load(open(os.path.expanduser(PLAN)))
    print("design type", des.designType, "timeline before", des.timeline.count)
    occ = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    comp = occ.component
    comp.name = PLAN_ID
    tb = adsk.fusion.TemporaryBRepManager.get()
    base = comp.features.baseFeatures.add()
    base.startEdit()
    names = []
    for L in plan["layers"]:
        n = L["index"] + 1
        for k, b in enumerate(L["blanks"]):
            x0, y0, x1, y1 = b["x0"] / 10, b["y0"] / 10, b["x1"] / 10, b["y1"] / 10
            z0, z1 = L["z0"] / 10, L["z1"] / 10
            centre = adsk.core.Point3D.create((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
            obb = adsk.core.OrientedBoundingBox3D.create(
                centre, adsk.core.Vector3D.create(1, 0, 0), adsk.core.Vector3D.create(0, 1, 0),
                x1 - x0, y1 - y0, z1 - z0)
            comp.bRepBodies.add(tb.createBox(obb), base)
            suffix = chr(97 + k) if len(L["blanks"]) > 1 else ""
            names.append(f"L{n} {L['thickness']:g}mm S{L.get('section', 0)}{suffix}")
    base.finishEdit()
    for i, name in enumerate(names):
        body = comp.bRepBodies.item(i)
        body.name = name
        body.opacity = 0.3
        bb = body.boundingBox
        print(repr(body.name), "opacity", round(body.opacity, 2),
              "mm min", [round(v * 10, 2) for v in bb.minPoint.asArray()],
              "max", [round(v * 10, 2) for v in bb.maxPoint.asArray()])
    print("component", comp.name, "bodies", comp.bRepBodies.count, "timeline after", des.timeline.count)
    app.activeViewport.fit()
