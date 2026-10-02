/**
 * ==========================================================================
 * ADMIN BACKEND — paste this entire file into Extensions > Apps Script
 * in the SAME Google Sheet that has your Teams/Races/Results/Posters tabs.
 *
 * Setup (see README.md section 5 for the full walkthrough):
 *   1. Paste this code in, replacing the default myFunction() stub.
 *   2. Edit the password in setAdminPassword() below, then run it once.
 *   3. Deploy > New deployment > Web app > Execute as Me > Access: Anyone.
 *   4. Copy the Web app URL into js/config.js (ADMIN.APPS_SCRIPT_URL).
 *
 * How it works:
 *   - GET  requests (?tab=Races)        -> read-only, returns headers + rows.
 *     No password needed — this is the same data your published CSV already
 *     shows publicly, just fetched live instead of via the CSV cache.
 *   - POST requests (add/update/delete) -> require a password that must
 *     match the one stored in this script's Script Properties (never
 *     stored in your website's code).
 * ==========================================================================
 */

const ADMIN_PASSWORD_PROPERTY = 'ADMIN_PASSWORD';

/** Run this once from the Apps Script editor (select it in the function
 *  dropdown, click Run) after changing the password below. You can re-run
 *  it any time to change the password later. */
function setAdminPassword() {
  const NEW_PASSWORD = 'CHANGE-ME-TO-A-REAL-PASSWORD'; // <-- edit this line
  PropertiesService.getScriptProperties().setProperty(ADMIN_PASSWORD_PROPERTY, NEW_PASSWORD);
}

function doGet(e) {
  try {
    const tabName = e.parameter.tab;
    if (!tabName) return jsonOut_({ ok: false, error: 'Missing "tab" parameter' });
    const sheet = getSheet_(tabName);
    const headers = getHeaders_(sheet);
    const rows = readRows_(sheet, headers);
    return jsonOut_({ ok: true, headers: headers, rows: rows });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const stored = PropertiesService.getScriptProperties().getProperty(ADMIN_PASSWORD_PROPERTY);
    if (!stored) {
      return jsonOut_({ ok: false, error: 'No admin password set yet — run setAdminPassword() in the Apps Script editor first.' });
    }
    if (payload.password !== stored) {
      return jsonOut_({ ok: false, error: 'Incorrect password.' });
    }
    if (!payload.tab) return jsonOut_({ ok: false, error: 'Missing "tab" in request.' });

    const sheet = getSheet_(payload.tab);
    const headers = getHeaders_(sheet);

    if (payload.action === 'add') {
      const row = headers.map(h => (payload.data && payload.data[h] !== undefined) ? payload.data[h] : '');
      sheet.appendRow(row);
      return jsonOut_({ ok: true });
    }

    if (payload.action === 'update') {
      const rowNum = Number(payload.row);
      if (!rowNum || rowNum < 2) return jsonOut_({ ok: false, error: 'Invalid row number.' });
      const row = headers.map(h => (payload.data && payload.data[h] !== undefined) ? payload.data[h] : '');
      sheet.getRange(rowNum, 1, 1, headers.length).setValues([row]);
      return jsonOut_({ ok: true });
    }

    if (payload.action === 'delete') {
      const rowNum = Number(payload.row);
      if (!rowNum || rowNum < 2) return jsonOut_({ ok: false, error: 'Invalid row number.' });
      sheet.deleteRow(rowNum);
      return jsonOut_({ ok: true });
    }

    return jsonOut_({ ok: false, error: 'Unknown action: ' + payload.action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

/* ---------------- helpers ---------------- */

function getSheet_(tabName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error('No tab named "' + tabName + '" in this spreadsheet.');
  return sheet;
}

function getHeaders_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h).trim())
    .filter(Boolean);
}

function readRows_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || headers.length === 0) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .map((row, i) => {
      const obj = { _row: i + 2 }; // actual sheet row number, needed for update/delete
      headers.forEach((h, idx) => { obj[h] = row[idx]; });
      return obj;
    })
    .filter(obj => headers.some(h => obj[h] !== '' && obj[h] !== undefined && obj[h] !== null));
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
