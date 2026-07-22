#!/usr/bin/env python3
"""Traceability audit for the SN6 Resources program (effectiveness test 5).

Asserts:
 1. Every PP-01..PP-10 in pain-points.md has a traceability-table row naming
    an owning deliverable (a CS-xxx or the WO system).
 2. Every CS doc cites at least one PP-xx, SN5 source doc, or datasheet.
 3. Every csRef / standardsRefs in the retro work orders resolves to a real CS doc.
 4. Every datasheet file cited in CS References tables exists in 04 Datasheets/.
 5. CS-INDEX rows match the actual CS source files (IDs and titles).

Exit 0 = all pass; prints a report either way.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CS_DIR = ROOT / "02 CS Standards" / "src"
PP = (ROOT / "01 Pain Points and Improvements" / "src" / "pain-points.md").read_text()
DS_DIR = ROOT / "04 Datasheets"

fails = []


def check(ok, msg):
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok:
        fails.append(msg)


# 1. PP coverage in traceability table
trace = PP.split("## 5. Traceability")[1].split("## 6.")[0]
for i in range(1, 11):
    pp = f"PP-{i:02d}"
    row = next((l for l in trace.splitlines() if l.strip().startswith(f"| {pp}")), "")
    check(bool(row) and ("CS-" in row or "WO system" in row),
          f"{pp} has a traceability row with an owning deliverable")

# 2. every CS doc cites a PP / SN5 source / datasheet
cs_files = sorted(CS_DIR.glob("CS-*.md"))
cs_ids = set()
for f in cs_files:
    t = f.read_text()
    m = re.match(r"CS-(\d{3})", f.name)
    if m:
        cs_ids.add(f"CS-{m.group(1)}")
    if f.name == "CS-INDEX.md":
        continue
    cited = bool(re.search(r"PP-\d{2}", t) or "SN5 Composites/" in t or "04 Datasheets/" in t)
    check(cited, f"{f.name} cites at least one PP / SN5 doc / datasheet")

# 3. WO refs resolve
wos = json.loads((ROOT / "03 Work Orders" / "data" / "sn5-work-orders.json").read_text())
bad_refs = set()
for w in wos:
    for ref in w.get("standardsRefs", []):
        if ref not in cs_ids:
            bad_refs.add(ref)
    for s in w.get("steps", []):
        r = s.get("csRef", "")
        if r and r.split("/")[0] not in cs_ids:
            bad_refs.add(r)
check(not bad_refs, f"all WO standards/step refs resolve to real CS docs {sorted(bad_refs) if bad_refs else ''}")
check(len(wos) == 26, f"retro WO count == 26 (got {len(wos)})")

# 4. cited datasheet files exist
missing = set()
for f in cs_files:
    for m in re.finditer(r"04 Datasheets/([\w .\-'&]+\.pdf)", f.read_text()):
        if not (DS_DIR / m.group(1)).exists():
            missing.add(m.group(1))
check(not missing, f"all cited datasheet PDFs exist {sorted(missing) if missing else ''}")

# 5. CS-INDEX rows match files
index = (CS_DIR / "CS-INDEX.md").read_text()
for f in cs_files:
    if f.name == "CS-INDEX.md":
        continue
    doc_id = f.name[:-3]
    title = f.read_text().splitlines()[0].lstrip("# ").strip()
    title_body = title.split(" ", 1)[1]
    row = next((l for l in index.splitlines() if l.strip().startswith(f"| {doc_id} ")), "")
    check(bool(row) and title_body.split(" (")[0] in row,
          f"CS-INDEX row matches {doc_id} ({title_body[:40]}…)")

print()
if fails:
    print(f"{len(fails)} FAILURES")
    sys.exit(1)
print("ALL TRACEABILITY CHECKS PASS")
