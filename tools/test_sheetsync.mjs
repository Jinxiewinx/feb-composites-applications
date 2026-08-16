#!/usr/bin/env node
/* Tests for "03 App/sheets/Sync.gs", the Apps Script that writes the app's
 * part list into the Composites Master Tracker.
 *
 * This is the only code in the repo that writes into somebody else's live
 * spreadsheet, and it runs unattended every 15 minutes. The failure mode is
 * not an exception — it is quietly overwriting a column nobody meant to hand
 * over, or deleting a row a human typed. So it gets tested here, against fake
 * SpreadsheetApp / UrlFetchApp objects, rather than by watching it in Drive.
 *
 * Apps Script is ES5 in a global scope, which is why Sync.gs can be read and
 * eval'd straight into these stubs with nothing to mock out inside it.
 *
 *   node tools/test_sheetsync.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- fake Sheets ---------- */

class FakeSheet {
  constructor(name, rows) {
    this.name = name;
    this.cells = rows.map(r => r.slice());     // values, row-major, 0-based
    this.bg = {};                              // "r,c" -> colour
    this.formulas = {};                        // "r,c" -> formula text
    this.frozen = 0;
  }
  _get(r, c) { const row = this.cells[r - 1] || []; return row[c - 1] === undefined ? "" : row[c - 1]; }
  _set(r, c, v) {
    while (this.cells.length < r) this.cells.push([]);
    const row = this.cells[r - 1];
    while (row.length < c) row.push("");
    row[c - 1] = v;
  }
  getLastRow() { return this.cells.length; }
  getLastColumn() { return this.cells.reduce((m, r) => Math.max(m, r.length), 0); }
  setFrozenRows(n) { this.frozen = n; }
  insertRowAfter(r) { this.cells.splice(r, 0, []); }
  getRange(r, c, nr, nc) {
    nr = nr || 1; nc = nc || 1;
    const sh = this;
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = [];
          for (let j = 0; j < nc; j++) row.push(sh._get(r + i, c + j));
          out.push(row);
        }
        return out;
      },
      setValues(vals) {
        for (let i = 0; i < vals.length; i++)
          for (let j = 0; j < vals[i].length; j++) sh._set(r + i, c + j, vals[i][j]);
        return this;
      },
      getValue() { return sh._get(r, c); },
      setValue(v) { sh._set(r, c, v); return this; },
      setBackground(col) {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.bg[`${r + i},${c + j}`] = col;
        return this;
      },
      setFontWeight() { return this; },
      getFormula() { return sh.formulas[`${r},${c}`] || ""; },
      copyTo(dest) { dest.setFormulaFrom(sh.formulas[`${r},${c}`] || ""); return this; },
      setFormulaFrom(f) { if (f) sh.formulas[`${r},${c}`] = f; return this; },
    };
  }
}

class FakeSpreadsheet {
  constructor(sheets) { this.sheets = sheets; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n, []); this.sheets.push(s); return s; }
}

/* ---------- the tracker tab, as the live SN6 workbook actually has it ---------- */

const HEADERS = ["", "Cad Progress", "Mold Progress", "Layup Progress", "Part Name",
  "Subteam", "Layup Type", "Layup Schedule", "Mold Location", "Mold Engineer",
  "Manufacturing Engineer", "Weight (g)", "Extra Comments", "Layup Deadline"];

function trackerTab(rows) {
  const sh = new FakeSheet("Part Tracker (App)", [HEADERS].concat(rows));
  // Column A carries =INT(N2-NOW()) on every seeded row, as the real sheet does.
  for (let r = 2; r <= rows.length + 1; r++) sh.formulas[`${r},1`] = `=INT(N${r}-NOW())`;
  return sh;
}
function partRow(name, extra) {
  const r = new Array(HEADERS.length).fill("");
  r[4] = name;
  Object.assign(r, extra || {});
  return r;
}

function feedResponse(parts) {
  return {
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      fields: {
        rows: { arrayValue: { values: parts.map(p => ({ stringValue: JSON.stringify(p) })) } },
        count: { integerValue: String(parts.length) },
        updatedAt: { stringValue: "2026-08-15T18:00:00.000Z" },
      },
    }),
  };
}

/* ---------- load Sync.gs ---------- */

let RESPONSE = feedResponse([]);
globalThis.UrlFetchApp = { fetch: () => RESPONSE };
globalThis.SpreadsheetApp = { getActive: () => globalThis.__SS };
globalThis.ScriptApp = { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }), deleteTrigger() {} };

const src = readFileSync(join(root, "03 App/sheets/Sync.gs"), "utf8");
(0, eval)(src);
FEED_URL = "https://firestore.googleapis.com/v1/projects/feb-composites/databases/(default)/documents/tracker/TESTTOKEN";

/* ---------- runner ---------- */

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + " — " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }

function run(sheetRows, parts) {
  const tab = trackerTab(sheetRows);
  globalThis.__SS = new FakeSpreadsheet([tab]);
  RESPONSE = feedResponse(parts);
  const result = syncFromApp();
  return { tab, result, log: globalThis.__SS.getSheetByName("Sync Log") };
}

console.log("Sync.gs — writing the tracker tab:");

t("an existing row is updated in place, keeping its row number", () => {
  const { tab, result } = run(
    [partRow("SEAT"), partRow("UT INLET")],
    [{ id: "P-SN6-002", partName: "UT INLET", moldProgress: "Sealed", subteam: "AERO" }]
  );
  assert(result.updated === 1 && result.appended === 0, JSON.stringify(result));
  assert(tab.getLastRow() === 3, "no row was added: " + tab.getLastRow());
  assert(tab._get(3, 3) === "Sealed", "Mold Progress written to row 3: " + tab._get(3, 3));
  assert(tab._get(3, 6) === "AERO", "Subteam written");
});

t("a part with no row is appended, and inherits the countdown formula", () => {
  const { tab, result } = run(
    [partRow("SEAT")],
    [{ id: "P-SN6-001", partName: "SEAT" }, { id: "P-SN6-009", partName: "NOSECONE", subteam: "AERO" }]
  );
  assert(result.appended === 1, "one append: " + JSON.stringify(result));
  assert(tab._get(3, 5) === "NOSECONE", "appended at row 3: " + tab._get(3, 5));
  assert(tab.formulas["3,1"] === "=INT(N2-NOW())", "column A formula carried down: " + tab.formulas["3,1"]);
});

t("column A is never written, so the sheet's own formula survives a sync", () => {
  const { tab } = run([partRow("SEAT")], [{ id: "P-SN6-001", partName: "SEAT", cadProgress: "Part CAD Done" }]);
  assert(tab._get(2, 1) === "", "column A untouched, got: " + JSON.stringify(tab._get(2, 1)));
  assert(tab.formulas["2,1"] === "=INT(N2-NOW())", "and its formula is intact");
});

t("a row the app has never heard of is kept and tinted, never deleted", () => {
  const { tab, result } = run(
    [partRow("SEAT"), partRow("NICK'S SCRATCH ROW")],
    [{ id: "P-SN6-001", partName: "SEAT" }]
  );
  assert(tab.getLastRow() === 3, "the orphan row still exists: " + tab.getLastRow());
  assert(tab._get(3, 5) === "NICK'S SCRATCH ROW", "and still says what it said");
  assert(result.orphans.length === 1 && result.orphans[0] === "NICK'S SCRATCH ROW",
    "reported: " + JSON.stringify(result.orphans));
  assert(tab.bg["3,5"] === "#fff2cc", "and is tinted: " + tab.bg["3,5"]);
});

t("matching ignores case and stray spaces between the two systems", () => {
  const { tab, result } = run(
    [partRow("  ut  inlet ")],
    [{ id: "P-SN6-002", partName: "UT INLET", moldProgress: "Machining" }]
  );
  assert(result.updated === 1 && result.appended === 0, "matched, not duplicated: " + JSON.stringify(result));
  assert(tab._get(2, 3) === "Machining");
});

t("an ISO deadline lands as a real Date so the countdown can subtract it", () => {
  const { tab } = run([partRow("SEAT")], [{ id: "P-SN6-001", partName: "SEAT", layupDeadline: "2027-01-15" }]);
  const v = tab._get(2, 14);
  assert(v instanceof Date, "not a Date: " + typeof v + " " + v);
  assert(v.getFullYear() === 2027 && v.getMonth() === 0 && v.getDate() === 15, "wrong date: " + v);
});

t("an empty deadline stays empty rather than becoming 1970", () => {
  const { tab } = run([partRow("SEAT")], [{ id: "P-SN6-001", partName: "SEAT", layupDeadline: "" }]);
  assert(tab._get(2, 14) === "", "got: " + JSON.stringify(tab._get(2, 14)));
});

t("columns the map does not name are left alone", () => {
  // Someone adds a "Notes to self" column at the end. The sync must not touch it.
  const tab = trackerTab([partRow("SEAT")]);
  tab._set(1, 15, "Notes to self");
  tab._set(2, 15, "do not lose this");
  globalThis.__SS = new FakeSpreadsheet([tab]);
  RESPONSE = feedResponse([{ id: "P-SN6-001", partName: "SEAT", comments: "from the app" }]);
  syncFromApp();
  assert(tab._get(2, 15) === "do not lose this", "clobbered: " + tab._get(2, 15));
  assert(tab._get(2, 13) === "from the app", "but the mapped column did get written");
});

t("a reordered header row still writes the right columns", () => {
  // Positional mapping would put stages in the wrong cells here and never error.
  const swapped = HEADERS.slice();
  swapped[1] = "Part Name"; swapped[4] = "Cad Progress";
  const tab = new FakeSheet("Part Tracker (App)", [swapped, (() => {
    const r = new Array(HEADERS.length).fill(""); r[1] = "SEAT"; return r;
  })()]);
  globalThis.__SS = new FakeSpreadsheet([tab]);
  RESPONSE = feedResponse([{ id: "P-SN6-001", partName: "SEAT", cadProgress: "Part CAD Done" }]);
  syncFromApp();
  assert(tab._get(2, 5) === "Part CAD Done", "followed the header, not the position: " + tab._get(2, 5));
  assert(tab._get(2, 2) === "SEAT", "name stayed in its column");
});

console.log("\nSync.gs — failing loudly:");

t("a missing target tab names itself instead of writing somewhere random", () => {
  globalThis.__SS = new FakeSpreadsheet([new FakeSheet("Something Else", [HEADERS])]);
  RESPONSE = feedResponse([]);
  let msg = "";
  try { syncFromApp(); } catch (e) { msg = e.message; }
  assert(msg.includes("Part Tracker (App)"), "unhelpful error: " + msg);
});

t("a tab with no Part Name header refuses to guess", () => {
  globalThis.__SS = new FakeSpreadsheet([new FakeSheet("Part Tracker (App)", [["a", "b", "c"]])]);
  RESPONSE = feedResponse([{ id: "P-SN6-001", partName: "SEAT" }]);
  let msg = "";
  try { syncFromApp(); } catch (e) { msg = e.message; }
  assert(msg.includes("Part Name"), "unhelpful error: " + msg);
});

t("an unpublished feed says who has to press what", () => {
  globalThis.__SS = new FakeSpreadsheet([trackerTab([])]);
  RESPONSE = { getResponseCode: () => 404, getContentText: () => "{}" };
  let msg = "";
  try { syncFromApp(); } catch (e) { msg = e.message; }
  assert(msg.includes("Tracker feed") && msg.includes("lead"), "unhelpful error: " + msg);
});

t("an empty feed writes nothing rather than blanking the sheet", () => {
  const { tab, result } = run([partRow("SEAT", { 2: "Sealed" })], []);
  assert(result.updated === 0 && result.appended === 0, JSON.stringify(result));
  assert(tab._get(2, 5) === "SEAT" && tab._get(2, 3) === "Sealed", "existing data intact");
});

console.log("\nSync.gs — the staleness log:");

t("every run records when it happened and what diverged", () => {
  const { log } = run(
    [partRow("SEAT"), partRow("ORPHAN")],
    [{ id: "P-SN6-001", partName: "SEAT" }, { id: "P-SN6-002", partName: "NEW" }]
  );
  assert(log, "a Sync Log tab is created");
  assert(log._get(1, 1) === "Run", "header: " + log._get(1, 1));
  assert(log._get(2, 1) instanceof Date, "newest run on row 2 with a real timestamp");
  assert(log._get(2, 2) === 2, "parts in app: " + log._get(2, 2));
  assert(log._get(2, 3) === 1 && log._get(2, 4) === 1, "1 updated, 1 added");
  assert(String(log._get(2, 5)).includes("ORPHAN"), "orphan named: " + log._get(2, 5));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
