"""S2: mesh of the mold body as binary STL in millimetres, root frame.

Two paths, so the unit question is settled by measuring the files:
  1. ExportManager + STLExportOptions, once per unitType value.
  2. MeshCalculator on the body, written as binary STL by hand at 10x (cm -> mm).
Then plan the mm file with the app's own slicer under Node (s2_plan_node.mjs)
and compare `bounds` to the body's bounding box.

Throwaway spike, not product code. Set OUT to a scratch folder before running."""
import adsk.core, adsk.fusion, os, struct

OUT = os.path.expanduser("~/Desktop/feb-s2")
BODY = "Clamshell Mold Body"


def write_binary_stl(path, tm, scale, header):
    coords, idx = tm.nodeCoordinatesAsDouble, tm.nodeIndices
    with open(path, "wb") as f:
        f.write(header.encode().ljust(80, b" "))
        f.write(struct.pack("<I", tm.triangleCount))
        for t in range(tm.triangleCount):
            pts = []
            for i in (idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]):
                pts.append((coords[3 * i] * scale, coords[3 * i + 1] * scale, coords[3 * i + 2] * scale))
            (ax, ay, az), (bx, by, bz), (cx, cy, cz) = pts
            ux, uy, uz, vx, vy, vz = bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            L = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
            f.write(struct.pack("<12fH", nx / L, ny / L, nz / L, ax, ay, az, bx, by, bz, cx, cy, cz, 0))


def run(_context: str):
    app = adsk.core.Application.get()
    des = app.activeDocument.products.itemByProductType("DesignProductType")
    body = des.rootComponent.bRepBodies.itemByName(BODY)
    os.makedirs(OUT, exist_ok=True)
    em = des.exportManager
    du = adsk.fusion.DistanceUnits
    # Default unitType: the getter says 3 (inch) for an inch design, but the
    # file it writes is in millimetres. Measure, do not trust the getter.
    p = os.path.join(OUT, "s2_default.stl")
    o = em.createSTLExportOptions(body, p)
    o.isBinaryFormat = True
    print("default unitType reads", o.unitType, "export", em.execute(o), os.path.getsize(p))
    for label, u in [("in", du.InchDistanceUnits), ("mm", du.MillimeterDistanceUnits), ("cm", du.CentimeterDistanceUnits)]:
        p = os.path.join(OUT, f"s2_unit_{label}.stl")
        o = em.createSTLExportOptions(body, p)
        o.isBinaryFormat = True
        o.unitType = u
        print(label, "set ->", o.unitType, "export", em.execute(o), os.path.getsize(p))
    # Path 2: MeshCalculator. Coordinates come back in cm (Fusion's internal
    # unit) in the body's own frame; this body lives in the root, so that is
    # the root frame. A body inside an occurrence would need
    # body.createForAssemblyContext(occ) so the mesh comes out transformed.
    mc = body.meshManager.createMeshCalculator()
    mc.setQuality(adsk.fusion.TriangleMeshQualityOptions.NormalQualityTriangleMesh)
    tm = mc.calculate()
    c = tm.nodeCoordinatesAsDouble
    print("mesh tris", tm.triangleCount, "bounds(cm)", min(c[0::3]), max(c[0::3]), min(c[1::3]), max(c[1::3]), min(c[2::3]), max(c[2::3]))
    write_binary_stl(os.path.join(OUT, "s2_meshcalc_mm.stl"), tm, 10.0, "FEB S2 MeshCalculator mm")
    print("assemblyContext:", body.assemblyContext)
