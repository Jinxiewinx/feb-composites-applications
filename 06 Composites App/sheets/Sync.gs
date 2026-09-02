/**
 * Sync.gs — mirrors the FEB composites app's Parts tab into this spreadsheet.
 *
 * Runs inside the Composites Master Tracker on a 15-minute timer. It PULLS a
 * snapshot the app publishes and writes it into a tab here. One direction
 * only: the app is the source of truth, and anything typed into the synced
 * columns of the target tab is overwritten on the next run.
 *
 * The app has no server — static hosting, no Cloud Functions, no service
 * account — so this script is where the timer lives. It needs no credentials:
 * the snapshot document allows unauthenticated reads, and its secret URL is
 * the only thing protecting it. Keep FEED_URL out of anywhere public.
 *
 * Install: see README.md next to this file.
 */

/* ------------------------------------------------------------------ config */

/** Paste the URL from the app: Reports tab -> "Tracker feed" (lead only). */
var FEED_URL = 'PASTE_THE_FEED_URL_HERE';

/**
 * Which tab to write.
 *
 * Ships pointed at a TRIAL tab so the live 'Composites Part Tracker' is not at
 * risk while this is being proved out. To go live, change this one string to
 * 'Composites Part Tracker'. Nothing else needs to change.
 */
var TARGET_SHEET = 'Part Tracker (App)';

/** Where orphan rows and run history get reported. Created on first run. */
var LOG_SHEET = 'Sync Log';

/**
 * Sheet header text -> field name in the feed.
 *
 * Keyed by HEADER TEXT rather than column letter on purpose: someone will
 * eventually insert a column, and a positional map would then write layup
 * stages into the weight column without erroring. Headers not listed here are
 * never touched, which is what protects column A's =INT(N2-NOW()) formula.
 */
var COLUMN_MAP = {
  'Cad Progress': 'cadProgress',
  'Mold Progress': 'moldProgress',
  'Layup Progress': 'layupProgress',
  'Part Name': 'partName',
  'Subteam': 'subteam',
  'Layup Type': 'layupType',
  'Layup Schedule': 'layupSchedule',
  'Mold Location': 'moldLocation',
  'Mold Engineer': 'moldEngineer',
  'Manufacturing Engineer': 'manufacturingEngineer',
  'Weight (g)': 'weightG',
  'Extra Comments': 'comments',
  'Layup Deadline': 'layupDeadline'
};

/** The column rows are matched on. Must be a key of COLUMN_MAP. */
var KEY_HEADER = 'Part Name';

/** Orphan tint: rows in the sheet the app has never heard of. Soft amber. */
var ORPHAN_COLOR = '#fff2cc';

/* ------------------------------------------------------------------- entry */

/**
 * Create the 15-minute trigger. Run this ONCE by hand after pasting FEED_URL.
 * Idempotent: clears any trigger this script previously installed first, so
 * running it twice does not give you two syncs racing each other.
 */
function installTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'syncFromApp') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('syncFromApp').timeBased().everyMinutes(15).create();
  syncFromApp();
}

/** Stop syncing. The sheet keeps whatever was last written. */
function removeTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'syncFromApp') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
}

/* -------------------------------------------------------------------- sync */

/** The scheduled job. Also safe to run by hand. */
function syncFromApp() {
  var parts = fetchParts();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(TARGET_SHEET);
  if (!sh) {
    throw new Error('No tab named "' + TARGET_SHEET + '". Create it (or fix ' +
                    'TARGET_SHEET at the top of Sync.gs) and run again.');
  }

  var result = writeParts(sh, parts);
  writeLog(ss, parts.length, result);
  return result;
}

/**
 * Fetch and decode the snapshot.
 *
 * Firestore's REST API returns value-typed JSON, but the app deliberately
 * stores each part as a JSON STRING inside rows[], so decoding is one parse
 * per row instead of walking mapValue/fields/stringValue for every column.
 */
function fetchParts() {
  if (!FEED_URL || FEED_URL.indexOf('PASTE') === 0) {
    throw new Error('FEED_URL is not set. Get it from the app: Reports tab, ' +
                    '"Tracker feed" button (lead only).');
  }
  var res = UrlFetchApp.fetch(FEED_URL, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code === 404) {
    throw new Error('Feed not found (404). A lead needs to press "Tracker ' +
                    'feed" in the app at least once to publish it.');
  }
  if (code !== 200) {
    throw new Error('Feed returned ' + code + ': ' + res.getContentText().slice(0, 300));
  }
  var fields = JSON.parse(res.getContentText()).fields || {};
  // An empty array comes back as {} with no `values` key at all.
  var values = (fields.rows && fields.rows.arrayValue && fields.rows.arrayValue.values) || [];
  var out = [];
  for (var i = 0; i < values.length; i++) {
    out.push(JSON.parse(values[i].stringValue));
  }
  return out;
}

/**
 * Write the parts into the sheet.
 *
 * Matches existing rows by normalised part name and updates them in place, so
 * the sheet keeps its own row order, formatting, and any extra columns nobody
 * told this script about. Parts with no row yet are appended. Rows the app has
 * never heard of are LEFT ALONE and tinted, never deleted — someone typed
 * them, and version history is a poor apology for a script eating them.
 */
function writeParts(sh, parts) {
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  // header text -> 1-based column index, for the headers we actually own
  var colOf = {};
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).trim();
    if (COLUMN_MAP.hasOwnProperty(h)) colOf[h] = c + 1;
  }
  if (!colOf[KEY_HEADER]) {
    throw new Error('No "' + KEY_HEADER + '" column on the "' + TARGET_SHEET +
                    '" tab. Row 1 must carry the tracker headers.');
  }

  var lastRow = sh.getLastRow();
  var keyCol = colOf[KEY_HEADER];

  // Existing rows, by normalised name.
  var rowOf = {};
  if (lastRow >= 2) {
    var keys = sh.getRange(2, keyCol, lastRow - 1, 1).getValues();
    for (var r = 0; r < keys.length; r++) {
      var k = normName(keys[r][0]);
      if (k && !rowOf.hasOwnProperty(k)) rowOf[k] = r + 2;
    }
  }

  var updated = 0, appended = 0, seen = {};
  var appendAt = lastRow + 1;

  for (var p = 0; p < parts.length; p++) {
    var part = parts[p];
    var key = normName(part.partName);
    if (!key) continue;
    seen[key] = true;

    var row = rowOf[key];
    if (row) { updated++; }
    else { row = appendAt++; appended++; carryFormula(sh, row); }

    for (var header in colOf) {
      if (!colOf.hasOwnProperty(header)) continue;
      var val = part[COLUMN_MAP[header]];
      sh.getRange(row, colOf[header]).setValue(coerce(header, val));
    }
  }

  // Orphans: rows with a name the app does not have.
  var orphans = [];
  for (var name in rowOf) {
    if (!rowOf.hasOwnProperty(name) || seen[name]) continue;
    orphans.push(sh.getRange(rowOf[name], keyCol).getValue());
    sh.getRange(rowOf[name], 1, 1, lastCol).setBackground(ORPHAN_COLOR);
  }

  return { updated: updated, appended: appended, orphans: orphans };
}

/**
 * Column A holds =INT(N2-NOW()), the days-to-deadline countdown. It is the
 * sheet's own formula and this script never writes it — but an appended row
 * starts empty, so the formula has to be carried down or new parts show a
 * blank countdown.
 */
function carryFormula(sh, row) {
  if (row <= 2) return;
  var src = sh.getRange(row - 1, 1);
  if (src.getFormula()) src.copyTo(sh.getRange(row, 1));
}

/**
 * Deadlines arrive as ISO strings and must land as real dates or the sheet's
 * countdown formula subtracts text and yields #VALUE!. Everything else is text
 * exactly as the app has it.
 */
function coerce(header, val) {
  if (val === null || val === undefined) return '';
  if (header === 'Layup Deadline') {
    var s = String(val).trim();
    if (!s) return '';
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return s;
  }
  return String(val);
}

/** Part names differ by case and stray spaces between the two systems. */
function normName(v) {
  return String(v === null || v === undefined ? '' : v)
    .trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * One line per run, newest first, plus the orphan list.
 *
 * The timestamp is the point: a frozen feed and a healthy one look identical
 * on the tracker tab itself, so without this a sync that silently stopped
 * three weeks ago reads as current data.
 */
function writeLog(ss, fetched, result) {
  var sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET);
    sh.getRange(1, 1, 1, 5).setValues([[
      'Run', 'Parts in app', 'Rows updated', 'Rows added', 'In sheet but not in app'
    ]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  sh.insertRowAfter(1);
  sh.getRange(2, 1, 1, 5).setValues([[
    new Date(), fetched, result.updated, result.appended,
    result.orphans.length ? result.orphans.join(', ') : ''
  ]]);
}
