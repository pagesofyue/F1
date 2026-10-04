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
const NOTES_DOC_PROPERTY = 'NOTES_DOC_ID';
const STANDINGS_DOC_PROPERTY = 'STANDINGS_DOC_ID';

// Keep in sync with CONFIG.SEASON in js/config.js
const SEASON = 2026;
// Exact tab names in this spreadsheet
const RESULTS_TAB = 'Results';
const RACES_TAB = 'Races';

/** Run this once from the Apps Script editor (select it in the function
 *  dropdown, click Run) after changing the password below. You can re-run
 *  it any time to change the password later. */
function setAdminPassword() {
  const NEW_PASSWORD = 'CHANGE-ME-TO-A-REAL-PASSWORD'; // <-- edit this line
  PropertiesService.getScriptProperties().setProperty(ADMIN_PASSWORD_PROPERTY, NEW_PASSWORD);
}

function doGet(e) {
  try {
    if (e.parameter.doc === 'notes') return jsonOut_(readNotesDoc_());
    if (e.parameter.doc === 'links') return jsonOut_(docLinks_());
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
    const touchesResults = payload.tab === RESULTS_TAB;

    if (payload.action === 'add') {
      const row = headers.map(h => (payload.data && payload.data[h] !== undefined) ? payload.data[h] : '');
      sheet.appendRow(row);
      if (touchesResults) refreshStandingsDoc_();
      return jsonOut_({ ok: true });
    }

    if (payload.action === 'update') {
      const rowNum = Number(payload.row);
      if (!rowNum || rowNum < 2) return jsonOut_({ ok: false, error: 'Invalid row number.' });
      const row = headers.map(h => (payload.data && payload.data[h] !== undefined) ? payload.data[h] : '');
      sheet.getRange(rowNum, 1, 1, headers.length).setValues([row]);
      if (touchesResults) refreshStandingsDoc_();
      return jsonOut_({ ok: true });
    }

    if (payload.action === 'delete') {
      const rowNum = Number(payload.row);
      if (!rowNum || rowNum < 2) return jsonOut_({ ok: false, error: 'Invalid row number.' });
      sheet.deleteRow(rowNum);
      if (touchesResults) refreshStandingsDoc_();
      return jsonOut_({ ok: true });
    }

    return jsonOut_({ ok: false, error: 'Unknown action: ' + payload.action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

/* ==========================================================================
   GOOGLE DOCS: race notes (read) + championship standings (written)
   ========================================================================== */

/** Run ONCE from the editor. Creates both Docs, one heading per round in the
 *  notes Doc, and the first standings export. Check View > Logs for the links. */
function setupDocs() {
  const props = PropertiesService.getScriptProperties();

  if (!props.getProperty(NOTES_DOC_PROPERTY)) {
    const doc = DocumentApp.create(SEASON + ' Grid — Race Notes');
    const body = doc.getBody();
    body.clear();
    body.appendParagraph('Write notes under each round heading. Keep the "Round N" headings as Heading 1. ' +
      'To show an image, put "Image: https://..." on its own line.').setItalic(true);
    const races = readRows_(getSheet_(RACES_TAB), getHeaders_(getSheet_(RACES_TAB)))
      .filter(r => String(r['Season']) === String(SEASON))
      .sort((a, b) => Number(a['Round']) - Number(b['Round']));
    races.forEach(r => {
      body.appendParagraph('Round ' + r['Round'] + ' — ' + (r['Race Name'] || ''))
        .setHeading(DocumentApp.ParagraphHeading.HEADING1);
      body.appendParagraph('');
    });
    doc.saveAndClose();
    props.setProperty(NOTES_DOC_PROPERTY, doc.getId());
  }

  if (!props.getProperty(STANDINGS_DOC_PROPERTY)) {
    const doc = DocumentApp.create(SEASON + ' Grid — Championship Standings');
    doc.saveAndClose();
    props.setProperty(STANDINGS_DOC_PROPERTY, doc.getId());
  }

  refreshStandingsDoc_();
  Logger.log('Notes doc:      ' + docLinks_().notesUrl);
  Logger.log('Standings doc:  ' + docLinks_().standingsUrl);
}

/** Optional, run once: also refresh the standings Doc when you type directly
 *  in the Results tab (edits made via admin.html refresh it automatically). */
function installStandingsTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onResultsEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onResultsEdit')
    .forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
}

function onResultsEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === RESULTS_TAB) refreshStandingsDoc_();
}

function docLinks_() {
  const props = PropertiesService.getScriptProperties();
  const n = props.getProperty(NOTES_DOC_PROPERTY);
  const s = props.getProperty(STANDINGS_DOC_PROPERTY);
  return {
    ok: true,
    notesUrl: n ? DocumentApp.openById(n).getUrl() : null,
    standingsUrl: s ? DocumentApp.openById(s).getUrl() : null,
  };
}

/** Parses the notes Doc: each Heading 1 containing "Round N" starts a race. */
function readNotesDoc_() {
  const id = PropertiesService.getScriptProperties().getProperty(NOTES_DOC_PROPERTY);
  if (!id) return { ok: false, error: 'No notes Doc yet — run setupDocs() in the Apps Script editor.' };
  const doc = DocumentApp.openById(id);
  const body = doc.getBody();
  const notes = [];
  let current = null;

  for (let i = 0; i < body.getNumChildren(); i++) {
    const el = body.getChild(i);
    const type = el.getType();
    const isPara = type === DocumentApp.ElementType.PARAGRAPH;
    const isItem = type === DocumentApp.ElementType.LIST_ITEM;
    if (!isPara && !isItem) continue;

    const text = (isPara ? el.asParagraph() : el.asListItem()).getText().trim();

    if (isPara && el.asParagraph().getHeading() === DocumentApp.ParagraphHeading.HEADING1) {
      const m = text.match(/round\s*(\d+)/i);
      current = m ? { round: Number(m[1]), title: text, blocks: [] } : null;
      if (current) notes.push(current);
      continue;
    }
    if (!current || !text) continue;

    const img = text.match(/^image:\s*(https?:\/\/\S+)$/i);
    if (img) current.blocks.push({ type: 'img', url: img[1] });
    else current.blocks.push({ type: isItem ? 'li' : 'p', text: text });
  }
  return { ok: true, url: doc.getUrl(), notes: notes };
}

/** Recomputes the standings from the Results tab and rewrites the standings Doc. */
function refreshStandingsDoc_() {
  try {
    const id = PropertiesService.getScriptProperties().getProperty(STANDINGS_DOC_PROPERTY);
    if (!id) return;
    const sheet = getSheet_(RESULTS_TAB);
    const rows = readRows_(sheet, getHeaders_(sheet))
      .filter(r => String(r['Season']) === String(SEASON) && r['Points'] !== '' && !isNaN(Number(r['Points'])));

    const drivers = {}, teams = {};
    rows.forEach(r => {
      const pts = Number(r['Points']) || 0;
      if (r['Driver']) {
        const d = drivers[r['Driver']] || (drivers[r['Driver']] = { points: 0, team: '' });
        d.points += pts;
        if (r['Team']) d.team = r['Team'];
      }
      if (r['Team']) teams[r['Team']] = (teams[r['Team']] || 0) + pts;
    });

    const driverTable = [['Pos', 'Driver', 'Team', 'Points']].concat(
      Object.keys(drivers).map(n => [n, drivers[n]]).sort((a, b) => b[1].points - a[1].points)
        .map((x, i) => [String(i + 1), x[0], x[1].team, String(x[1].points)]));
    const teamTable = [['Pos', 'Team', 'Points']].concat(
      Object.keys(teams).map(t => [t, teams[t]]).sort((a, b) => b[1] - a[1])
        .map((x, i) => [String(i + 1), x[0], String(x[1])]));

    const doc = DocumentApp.openById(id);
    const body = doc.getBody();
    body.clear();
    body.appendParagraph(SEASON + ' Championship Standings').setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph('Updated ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy HH:mm'))
      .setItalic(true);
    body.appendParagraph('Drivers').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (driverTable.length > 1) styleTable_(body.appendTable(driverTable));
    else body.appendParagraph('No scored results yet.');
    body.appendParagraph('Constructors').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (teamTable.length > 1) styleTable_(body.appendTable(teamTable));
    else body.appendParagraph('No scored results yet.');
    doc.saveAndClose();
  } catch (err) {
    console.error('Standings doc refresh failed: ' + err);
  }
}

function styleTable_(table) {
  const header = table.getRow(0);
  for (let c = 0; c < header.getNumCells(); c++) {
    header.getCell(c).editAsText().setBold(true);
    header.getCell(c).setBackgroundColor('#EEEEEE');
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
