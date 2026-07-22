#!/usr/bin/env python3
"""Generate retro seed JSON for the Parts and Timeline tabs from the SN5
Composites Master Tracker .xlsx (openpyxl isn't installed, so we read the
zip/XML directly). Emits, into both app/ and data/:
  - sn5-parts.json     (Composites Part Tracker sheet)
  - sn5-schedule.json  (Timeline sheet)

Same honesty rules as the work-order archive: everything is marked retro, we
normalize obvious source typos/casing for cross-linking, and we DON'T invent
data. The Timeline sheet's "Week Of" dates were internally inconsistent
(mixed 2025/2026 serials), so we order by the reliable week index and leave the
date blank rather than present bad dates as real.
"""
import json, re, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

XLSX = Path("/Users/simonstarbuck/Downloads/composites_programs/SN5 Composites/Composites Master Tracker 25-26 Season (SN5).xlsx")
HERE = Path(__file__).resolve().parent
APP = HERE.parent / "03 Work Orders" / "app"
DATA = HERE.parent / "03 Work Orders" / "data"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

z = zipfile.ZipFile(XLSX)
sst = []
r = ET.fromstring(z.read("xl/sharedStrings.xml"))
for si in r.findall(f"{NS}si"):
    sst.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
wb = ET.fromstring(z.read("xl/workbook.xml"))
sheets = [(s.get("name"), s.get(f"{RNS}id")) for s in wb.iter(f"{NS}sheet")]
rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
rid2t = {x.get("Id"): x.get("Target") for x in rels}
name2file = {n: "xl/" + rid2t[rid].lstrip("/") for n, rid in sheets}


def colrow(ref):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    ci = 0
    for ch in m.group(1):
        ci = ci * 26 + (ord(ch) - 64)
    return ci, int(m.group(2))


def cellval(c):
    t = c.get("t")
    v = c.find(f"{NS}v")
    if v is None:
        isv = c.find(f"{NS}is")
        return "".join(x.text or "" for x in isv.iter(f"{NS}t")) if isv is not None else ""
    if t == "s":
        return sst[int(v.text)]
    return v.text or ""


def sheet_rows(name):
    root = ET.fromstring(z.read(name2file[name]))
    rows = {}
    for c in root.iter(f"{NS}c"):
        ref = c.get("r")
        if not ref:
            continue
        ci, ri = colrow(ref)
        val = cellval(c)
        if val != "":
            rows.setdefault(ri, {})[ci] = val
    return rows


def serial_to_iso(v):
    """Excel serial (1899-12-30 epoch) -> ISO date, only if plausibly in the
    SN5 season window; otherwise "" (the source had junk serials)."""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return ""
    from datetime import date, timedelta
    d = date(1899, 12, 30) + timedelta(days=int(round(n)))
    if date(2025, 1, 1) <= d <= date(2026, 12, 31):
        return d.isoformat()
    return ""


def norm_name(s):
    s = (s or "").strip().upper().rstrip("*").strip()
    return s.replace("NOSECOME", "NOSECONE")  # known source typo


# ---------- Parts ----------
prows = sheet_rows("Composites Part Tracker")
parts = []
name_to_id = {}
n = 0
for ri in sorted(prows):
    if ri == 1:
        continue
    c = prows[ri]
    partName = (c.get(5) or "").strip()
    if not partName:
        continue
    n += 1
    pid = f"P-SN5-{n:03d}"
    parts.append({
        "id": pid,
        "partName": partName,
        "subteam": (c.get(6) or "").strip().upper(),
        "layupType": (c.get(7) or "").strip().upper(),
        "layupSchedule": (c.get(8) or "").strip(),
        "moldLocation": (c.get(9) or "").strip(),
        "moldEngineer": (c.get(10) or "").strip(),
        "manufacturingEngineer": (c.get(11) or "").strip(),
        "cadProgress": (c.get(2) or "Not Started").strip(),
        "moldProgress": (c.get(3) or "Not Started").strip(),
        "layupProgress": (c.get(4) or "Not Started").strip(),
        "weightG": (c.get(12) or "").strip(),
        "layupDeadline": serial_to_iso(c.get(14)),
        "comments": (c.get(13) or "").strip(),
        "workOrderId": "",
        "retro": True,
        "createdBy": "",
    })
    name_to_id[norm_name(partName)] = pid

# ---------- Timeline ----------
STATION_COL = {3: "mold1", 4: "mold2", 6: "infusion1", 7: "infusion2",
               8: "wetlay1", 9: "wetlay2", 11: "waterjet"}
trows = sheet_rows("Timeline")
schedule = []
for ri in sorted(trows):
    if ri == 1:
        continue
    c = trows[ri]
    if 1 not in c:
        continue
    try:
        idx = int(round(float(c[1])))
    except (TypeError, ValueError):
        continue
    wk = {"id": f"W{idx:02d}", "weekOf": "", "other": (c.get(13) or "").strip(),
          "notes": (c.get(14) or "").strip(), "retro": True}
    has_content = wk["other"] or wk["notes"]
    for col, field in STATION_COL.items():
        raw = (c.get(col) or "").strip()
        # Map a cell to a part id when its name matches one part; else keep the
        # raw text (typos, "A + B" combos, asterisked notes stay as written).
        wk[field] = name_to_id.get(norm_name(raw), raw) if raw else ""
        if raw:
            has_content = True
    if has_content:
        schedule.append(wk)


def write(name, obj):
    for d in (APP, DATA):
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_text(json.dumps(obj, indent=1))
    print(f"{name}: {len(obj)} records -> app/ and data/")


write("sn5-parts.json", parts)
write("sn5-schedule.json", schedule)
mapped = sum(1 for w in schedule for f in STATION_COL.values() if w[f].startswith("P-SN5-"))
print(f"timeline station cells linked to parts: {mapped}")
