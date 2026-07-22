#!/usr/bin/env python3
"""Generate the 26 retro SN5 work orders (25 Master Tracker parts + catch can)
into 03 Work Orders/data/sn5-work-orders.json and inject them into
work-orders.html at the __SN5_SEED_JSON__ placeholder (if present).

Sources: Composites Master Tracker 25-26 Season (SN5).xlsx (Part Tracker,
Mold Tracker sheets) as extracted 2026-07-12, plus #composites Slack history.
Retro convention: anything not recorded in SN5 is "not recorded (retro)" —
never fabricated.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "03 Work Orders" / "data" / "sn5-work-orders.json"
APP = ROOT / "03 Work Orders" / "work-orders.html"

NR = "not recorded (retro)"


def ply(material, orientation=NR, coverage="full", notes=""):
    return {"material": material, "orientation": orientation,
            "coverage": coverage, "notes": notes}


def parse_stack(shorthand):
    """Translate tracker shorthand into a ply list (best-effort, marked retro)."""
    s = shorthand.upper()
    plies = []
    note = f'tracker shorthand: "{shorthand}" — ply order/orientations {NR}'
    mapping = [
        ("6X 195 + CORE", [ply("195 twill")] * 3 + [ply("core (type per part notes)")] + [ply("195 twill")] * 3),
        ("195 88 .125 NOMEX", [ply("195 twill"), ply("88 spread-tow"), ply('Nomex honeycomb 0.125"'), ply("88 spread-tow"), ply("195 twill")]),
        ("195 2X 88 .25 NOMEX", [ply("195 twill"), ply("88 spread-tow"), ply("88 spread-tow"), ply('Nomex honeycomb 0.25"'), ply("88 spread-tow"), ply("88 spread-tow"), ply("195 twill")]),
        ("195 2X88 .25 NOMEX", [ply("195 twill"), ply("88 spread-tow"), ply("88 spread-tow"), ply('Nomex honeycomb 0.25"'), ply("88 spread-tow"), ply("88 spread-tow"), ply("195 twill")]),
        ("195 88 .25 NOMEX", [ply("195 twill"), ply("88 spread-tow"), ply('Nomex honeycomb 0.25"'), ply("88 spread-tow"), ply("195 twill")]),
        ("195 88 + CORE (6)", [ply("195 twill"), ply("88 spread-tow"), ply("core"), ply("88 spread-tow"), ply("195 twill")]),
        ("2X 195 88", [ply("195 twill"), ply("195 twill"), ply("88 spread-tow")]),
        ("2X 195", [ply("195 twill"), ply("195 twill")]),
        ("3X 195 (0 45 0)", [ply("195 twill", "0/90"), ply("195 twill", "±45"), ply("195 twill", "0/90")]),
        ("3X 195", [ply("195 twill")] * 3),
        ("195 88 + FOAM", [ply("195 twill"), ply("88 spread-tow"), ply("foam core (shaped)")]),
        ("1/2X 670", [ply("670 twill", notes="1–2 plies per tracker")]),
    ]
    for key, val in mapping:
        if key in s:
            plies = [dict(p) for p in val]
            break
    if not plies:
        plies = [ply(f"per tracker: {shorthand}")]
    return plies, note


MOLDS = {
    "BW LEFT SIDE PANEL": {"layers": '2 x 3"', "density": "30", "sealingType": "Resin", "location": "RFS"},
    "BW RIGHT SIDE PANEL": {"layers": '2 x 3"', "density": "30", "sealingType": "Resin", "location": "RFS"},
    "NOSECONE": {"layers": '10 x 2"', "density": "30", "sealingType": NR, "location": "RFS"},
    "CLAMSHELL": {"layers": '1 x 3"', "density": "30", "sealingType": NR, "location": "RFS"},
    "SEAT": {"layers": NR, "density": NR, "sealingType": NR, "location": NR},
    "STEERING COVER": {"layers": "4", "density": "60", "sealingType": "S120", "location": "RFS"},
}

# (name, subteam, processType, stack shorthand, moldEng, mfgEng, weight g,
#  weight target g, deadline, extra timeline events, extra notes)
PARTS = [
    ("DASHBOARD", "BERGO", "GlassInfusion", "195 88 .125 NOMEX", "N/A (flat)", "Justin", None, None, "2026-01-25",
     [["2026-01-28", "remake discussed (#composites)"],
      ["2026-03-25", "~57 g remake discussed (#composites)"],
      ["2026-04-07", 'Theo: "another dash sorry 💔 same thickness (1/8\\")" — DXF/thickness churn (PP-04)'],
      ["2026-05-05", "re-waterjet coordination thread"]],
     "Remade 3+ times: no frozen thickness/DXF spec shared between Bergo and composites (PP-04 case study)"),
    ("UT INLET", "AERO", "MoldInfusion", "6X 195 + CORE", "Nico", "Chuning", None, None, "2026-03-29",
     [["2026-04-19", "machined and sealed inlet (#composites)"],
      ["2026-04-25", "inlet layup (#composites)"]], "Part of undertray crunch (PP-07)"),
    ("UT SIDE LEFT", "AERO", "MoldInfusion", "6X 195 + CORE", "Justin", "Justin", None, None, "2026-03-29",
     [["2026-05-01", "side pod left sealed; right layup air leak noted same day (PP-06/minors)"]], ""),
    ("UNDERTRAY STRAKES", "AERO", "GlassInfusion", "195 88 + CORE (6)", "N/A (flat)", "Justin", None, None, "2026-04-05",
     [["2026-05-17", "strakes bonded, air dams on (#composites)"]], ""),
    ("UT SIDE RIGHT", "AERO", "MoldInfusion", "6X 195 + CORE", "Justin", "Justin", None, None, "2026-04-05",
     [["2026-05-01", '"resin reached everywhere but air started leaking in toward the end, hopefully it will turn out okay" — the no-drop-test failure mode CS-006 §7.4 now gates']], ""),
    ("UT DIFFUSER", "AERO", "MoldInfusion", "6X 195 + CORE", "Justin", "Justin", None, None, "2026-04-05",
     [["2026-04-14", "UT stack still undefined 3 weeks before layup (PP-07)"],
      ["2026-05-09", "diffuser released; parts dremeled (#composites)"],
      ["2026-05-10", "diffuser cut, rest coated (#composites)"],
      ["2026-06-21", "grounding validated <1 Ω continuous everywhere (comp recap) — CS-010 reference success"]],
     "The CS-010 reference part: criterion + copper mesh method defined up front, validated at comp"),
    ("SEAT", "BERGO", "MoldWetLay", "6X 195 + CORE", "Nico", "Chuning", None, None, "2026-02-15",
     [["2026-03-26", "seat molds complete"], ["2026-04-18", "seat coated, sanding next (#composites)"],
      ["2026-03-05", 'Justin asks: "What layup stack was used for seat last year?" — unanswerable from records (PP-09)']],
     "PP-09 case study: prior-year stack was unrecorded"),
    ("RW ENDPLATES", "AERO", "GlassInfusion", "195 2X 88 .25 NOMEX", "N/A (flat)", "Justin", 2272, None, "2026-03-08",
     [["2026-04-08", "wing assembly + endplate layups (#composites)"]], ""),
    ("FW MIDPLATES", "AERO", "GlassInfusion", "195 2X88 .25 NOMEX", "N/A (flat)", "Nico", None, None, "2026-02-15", [], ""),
    ("FW E1 TOP", "AERO", "MoldInfusion", "2X 195 88", NR, NR, 1394, 4485, "2026-02-22", [], "tracker target column read 4485 (units as recorded)"),
    ("FW E1 BOT", "AERO", "MoldInfusion", "2X 195 88", "Nick", "Nick", None, 4036, "2026-02-22", [], "weight cell read 0 — actual mass " + NR),
    ("RW E1 TOP", "AERO", "MoldInfusion", "2X 195 88", "Nick", "Nick", 1250, None, "2026-03-01", [], ""),
    ("RW E1 BOT", "AERO", "MoldInfusion", "2X 195 88", "Nick", "Nick", None, 5114, "2026-03-01", [], "weight cell read 0 — actual mass " + NR),
    ("FW ENDPLATES", "AERO", "GlassInfusion", "195 88 .25 NOMEX", "N/A (flat)", "Justin", None, None, "2026-03-15", [], ""),
    ("BW LEFT SIDE PANEL", "AERO", "MoldInfusion", "2X 195", "Justin", "Nico", 782, None, "2026-02-01",
     [["2026-01-26", "mold sealed (mold tracker)"]], 'timeline note: "may redo pending weight of right side panel"'),
    ("NOSECONE", "AERO", "MoldInfusion", "3X 195", "Chuning", "Justin", 735, None, "2026-02-08",
     [["2026-02-22", '"shiny but will probably redo this piece" (#composites)'],
      ["2026-02-28", "section 5 needs remachining (#composites)"],
      ["2026-03-27", 'layup via new "pre-preg" method (Alvin) — praised turnaround']],
     '10-section 2" mold stack; remachining churn (PP-03-adjacent)'),
    ("RW E2", "AERO", "FoamWrapped", "195 88 + FOAM", "Nick", "Nick", 521, None, "2026-02-08", [], ""),
    ("RW E4", "AERO", "FoamWrapped", "195 88 + FOAM", "Nick", "Nick", 481, None, "2026-02-15", [], ""),
    ("RW E5", "AERO", "FoamWrapped", "195 88 + FOAM", "Nick", "Nick", 148, None, "2026-02-15", [], ""),
    ("FLOOR CLOSEOUT", "BERGO", "GlassInfusion", "195 88 .25 NOMEX", "N/A (flat)", "Nico", None, None, "2026-03-15", [], ""),
    ("RW E3", "AERO", "FoamWrapped", "195 88 + FOAM", "Nick", "Nick", 298, 3169, "2026-02-01",
     [["2025-11-15", "RE3 CNC-foam wing layups (fall R&D)"], ["2026-02-01", 'RE3 "did not fit on 2 inch stock" — stock planning miss']], ""),
    ("CLAMSHELL", "AERO", "MoldInfusion", "3X 195 (0 45 0)", "Justin", "Chuning", 416, 2370, "2026-02-08",
     [["2026-01-24", "clamshell mold CAD assigned (weekly assignments)"],
      ["2026-02-17", "clamshell mold machined"],
      ["2026-02-23", "CAD error found (raised middle section): fix-or-reglue, Tue–Thu machining slots cancelled — PP-03 case study"],
      ["2026-03-04", '"She going" — layup proceeding (#composites)']],
     "PP-03 case study: no design review between mold CAD and machining. Weight note: tracker cell read '416 (bw 2370)' — 416 g is this part; the 2370 figure appears to reference the bodywork assembly context, NOT a target for this part (an >80% 'miss' would be a misreading, not a failure)"),
    ("BW RIGHT SIDE PANEL", "AERO", "MoldInfusion", "2X 195", "Justin", "Nico", 437, None, "2026-02-01",
     [["2026-01-26", "mold sealed (mold tracker)"]], ""),
    ("STEERING WHEEL", "BERGO", "GlassInfusion", "195 88 .25 NOMEX", "N/A (flat)", "Justin", 60, None, "2026-01-25",
     [["2025-10-08", "Bergo meeting: highest-risk component; ACB sponsor route; hydraulic press + dogbone tests planned"],
      ["2025-10-20", "3-pt bend test held ~390 lb (fall R&D)"]], ""),
    ("STEERING COVER", "AUTO-MECH", "MoldInfusion", "1/2X 670", "Justin", "Nick", 231, None, "2026-04-05",
     [["2025-11-20", "steering shroud mold machined (Jim Phieffer CAD)"]], "mold: 4-layer 60 lb board, S120 sealed (pre-XCR)"),
]

STD_STEPS = {
    "MoldInfusion": [
        ("Stack frozen (CS-002 §7.2)", "CS-002"), ("Mold design review (CS-003 §7.2)", "CS-003"),
        ("Glue mold stock (CS-003 §7.3)", "CS-003"), ("Machine mold (CS-005)", "CS-005"),
        ("Seal + release mold (CS-004)", "CS-004"), ("Dry stack + bag (CS-006 §7.2–7.3)", "CS-006"),
        ("Drop test (CS-006 §7.4)", "CS-006"), ("Infuse (CS-006 §7.5)", "CS-006"),
        ("Cure + demould (CS-006 §7.6)", "CS-006"), ("Trim + finish (CS-009)", "CS-009"),
    ],
    "GlassInfusion": [
        ("Stack frozen (CS-002 §7.2)", "CS-002"), ("Prepare flat plate/glass (CS-004 release rules)", "CS-004"),
        ("Dry stack + bag (CS-006 §7.2–7.3)", "CS-006"), ("Drop test (CS-006 §7.4)", "CS-006"),
        ("Infuse (CS-006 §7.5)", "CS-006"), ("Cure + demould (CS-006 §7.6)", "CS-006"),
        ("Cut to DXF (CS-009 §7.6, confirm rev)", "CS-009"), ("Finish (CS-009)", "CS-009"),
    ],
    "MoldWetLay": [
        ("Stack frozen (CS-002 §7.2)", "CS-002"), ("Mold design review (CS-003 §7.2)", "CS-003"),
        ("Glue + machine mold (CS-003/005)", "CS-003"), ("Seal + release mold (CS-004)", "CS-004"),
        ("Wet layup + bag (CS-007)", "CS-007"), ("Cure + demould (CS-007)", "CS-007"),
        ("Trim + finish (CS-009)", "CS-009"),
    ],
    "FoamWrapped": [
        ("Stack frozen (CS-002 §7.2)", "CS-002"), ("Shape foam core (CS-003 foam rules)", "CS-003"),
        ("Wet layup over core + bag (CS-007 §7.6)", "CS-007"), ("Cure (CS-007)", "CS-007"),
        ("Trim + finish (CS-009)", "CS-009"),
    ],
}


def make_wo(i, row):
    (name, subteam, ptype, shorthand, me, re_, wt, wt_target, deadline, timeline, notes) = row
    plies, stack_note = parse_stack(shorthand)
    steps = [{"seq": n + 1, "title": t, "csRef": ref, "status": "done (retro)",
              "buyoff": {"name": NR, "date": NR}, "notes": "", "photoRefs": []}
             for n, (t, ref) in enumerate(STD_STEPS[ptype])]
    qc = [{"criterion": "mass", "target": (f"{wt_target} (as recorded in tracker)" if wt_target else NR),
           "actual": (f"{wt} g" if wt else NR), "pass": None}]
    if "DIFFUSER" in name:
        qc.append({"criterion": "grounding resistance", "target": "<5 Ω every probe point",
                   "actual": "<1 Ω continuous everywhere (2026-06-21)", "pass": True})
    return {
        "id": f"WO-SN5-{i:03d}", "partName": name, "subteam": subteam, "revision": "A",
        "status": "Complete", "processType": ptype,
        "moldEngineer": me, "manufacturingEngineer": re_,
        "createdDate": "2026-07-12 (retro-filled)", "dueDate": deadline,
        "mold": ({**MOLDS.get(name, {"layers": NR, "density": NR, "sealingType": NR, "location": NR}),
                  "moldId": f"MOLD-{name.replace(' ', '-')}"}
                 if ptype in ("MoldInfusion", "MoldWetLay") else None),
        "layupStack": plies, "stackNote": stack_note,
        "bom": [{"item": f"per tracker shorthand: {shorthand}", "qty": NR, "unit": "", "source": "Sigmatex / Easy Composites / ACP (see Budget sheet)", "estCost": NR}],
        "standardsRefs": sorted({ref for _, ref in STD_STEPS[ptype]}),
        "steps": steps, "qualityChecks": qc,
        "weightTargetG": wt_target, "weightActualG": wt,
        "timeline": [{"date": d, "note": n} for d, n in timeline],
        "notes": notes, "retro": True,
    }


def catch_can():
    return {
        "id": "WO-SN5-026", "partName": "CATCH CAN (grounding retrofit)", "subteam": "POWERTRAIN",
        "revision": "B", "status": "Complete", "processType": "Other",
        "moldEngineer": "N/A", "manufacturingEngineer": "cross-team (powertrain + composites)",
        "createdDate": "2026-07-12 (retro-filled)", "dueDate": "2026-05-31", "mold": None,
        "layupStack": [
            {"material": "aluminum can substrate", "orientation": "n/a", "coverage": "full", "notes": "assumed 3004 aluminum"},
            {"material": "copper mesh (inner)", "orientation": "n/a", "coverage": "full", "notes": "rev B intent — inner/outer mesh in contact"},
            {"material": "670 twill + copper mesh interlayers", "orientation": NR, "coverage": "full", "notes": 'Slack SOP: "copper mesh, 670, copper mesh, 88"'},
            {"material": "88 spread-tow (outer)", "orientation": NR, "coverage": "full", "notes": ""},
        ],
        "stackNote": "rev A = CF wrap without defined criterion; rev B = copper-mesh sandwich; final resolution abandoned CF wrapping for epoxy + copper paths",
        "bom": [{"item": "copper mesh", "qty": NR, "unit": "", "source": "Amazon ($27.55, Budget sheet)", "estCost": "27.55"}],
        "standardsRefs": ["CS-010"],
        "steps": [
            {"seq": 1, "title": "Define acceptance criterion (CS-010 §7.1) — NOT DONE IN SN5", "csRef": "CS-010",
             "status": "skipped (retro)", "buyoff": {"name": "", "date": ""},
             "notes": "criterion/method first written down 2026-05-25, six months after work began — the PP-05 root cause", "photoRefs": []},
            {"seq": 2, "title": "CF wrap layup attempts", "csRef": "CS-010", "status": "done (retro)",
             "buyoff": {"name": NR, "date": NR}, "notes": "multiple layups Nov 2025–May 2026", "photoRefs": []},
            {"seq": 3, "title": "Resistance measurement", "csRef": "CS-010", "status": "done (retro)",
             "buyoff": {"name": NR, "date": NR}, "notes": "~40 Ω outer CF to can end surface (2026-05-25) vs <5 Ω needed", "photoRefs": []},
            {"seq": 4, "title": "Rework by sanding — FAILED", "csRef": "CS-009", "status": "failed (retro)",
             "buyoff": {"name": "", "date": ""}, "notes": "cans punctured at the taper during sanding (2026-05-27) — CS-009 §7.2 / CS-010 §7.4 now prohibit this", "photoRefs": []},
            {"seq": 5, "title": "Design pivot: epoxy + copper conductive paths", "csRef": "CS-010", "status": "done (retro)",
             "buyoff": {"name": NR, "date": NR}, "notes": "the CS-010 §7.1 decision-point lesson: CF wrap was the wrong path for this geometry", "photoRefs": []},
        ],
        "qualityChecks": [{"criterion": "resistance to ground", "target": "<5 Ω (rules) — written 2026-05-25 only",
                           "actual": "~40 Ω via CF wrap; pass after pivot " + NR, "pass": None}],
        "weightTargetG": None, "weightActualG": None,
        "timeline": [
            {"date": "2025-11", "note": "powertrain opens catch-can grounding conversation"},
            {"date": "2026-05-24", "note": "copper mesh in layup? (question — records unclear)"},
            {"date": "2026-05-25", "note": "40 Ω measured; criterion/method questions first written"},
            {"date": "2026-05-27", "note": "cans punctured during sanding; CF path abandoned"},
        ],
        "notes": "PP-05 case study. Kept as WO-SN5-026 even though it never appeared in the Master Tracker — small cross-team jobs bypassing tracking was itself the failure.",
        "retro": True,
    }


def main():
    wos = [make_wo(i + 1, row) for i, row in enumerate(PARTS)] + [catch_can()]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(wos, indent=1, ensure_ascii=False))
    print(f"wrote {len(wos)} work orders -> {OUT.name}")
    if APP.exists():
        import re as _re
        html = APP.read_text()
        payload = json.dumps(wos, ensure_ascii=False)
        marker = "__SN5_SEED_JSON__"
        if marker in html:
            html = html.replace(marker, payload)
        else:
            html = _re.sub(
                r'(<script id="seed" type="application/json">)[\s\S]*?(</script>)',
                lambda m: m.group(1) + payload + m.group(2), html, count=1)
        APP.write_text(html)
        print("seed injected into work-orders.html")


if __name__ == "__main__":
    main()
