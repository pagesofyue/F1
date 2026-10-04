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
    if (e.parameter.tab === RACES_TAB) ensureColumn_(getSheet_(RACES_TAB), 'Sprint Weekend');
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
    if (payload.action === 'verify') return jsonOut_({ ok: true });
    if (payload.action === 'saveBatch') return jsonOut_(saveBatch_(payload));
    if (payload.action === 'saveResults') return jsonOut_(saveResults_(payload));
    if (payload.action === 'saveNote') return jsonOut_(saveNote_(payload.round, payload.title, payload.text));
    if (!payload.tab) return jsonOut_({ ok: false, error: 'Missing "tab" in request.' });

    const sheet = getSheet_(payload.tab);
    const headers = getHeaders_(sheet);
    const touchesResults = payload.tab === RESULTS_TAB;

    if (payload.action === 'add') {
      let row = headers.map(h => (payload.data && payload.data[h] !== undefined) ? payload.data[h] : '');
      row = resolveRowImages_(headers, row);
      sheet.appendRow(row);
      if (touchesResults) refreshStandingsDoc_();
      return jsonOut_({ ok: true });
    }

    if (payload.action === 'update') {
      const rowNum = Number(payload.row);
      if (!rowNum || rowNum < 2) return jsonOut_({ ok: false, error: 'Invalid row number.' });
      let row = headers.map(h => (payload.data && payload.data[h] !== undefined) ? payload.data[h] : '');
      row = resolveRowImages_(headers, row);
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

/** Run ONCE from the editor (accept the new permissions, incl. "connect to an external
 *  service"). Installs one edit trigger that (a) refreshes the standings Doc when you type in
 *  Results and (b) turns pasted page links (Pinterest, Imgur, Drive...) in any image column
 *  into direct image links. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const f = t.getHandlerFunction();
    if (f === 'onResultsEdit' || f === 'onSheetEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
}
function installStandingsTrigger() { installTriggers(); } // old name, same thing

function onSheetEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() === RESULTS_TAB) { refreshStandingsDoc_(); return; }
    convertImageLinksInRange_(sheet, e.range);
  } catch (err) { console.error('onSheetEdit: ' + err); }
}
function onResultsEdit(e) { onSheetEdit(e); } // kept so an older installed trigger still works

/** Adds a "Grid" menu to the sheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Grid')
    .addItem('Convert all image links', 'convertAllImageLinks')
    .addItem('Refresh standings Doc', 'refreshStandingsDoc_')
    .addToUi();
}

/* ---------------- image links: paste a page link, get the real image ---------------- */

/** Columns that hold images: header ends in "URL" or mentions image/photo. */
function isImageHeader_(h) { return /url\s*$/i.test(String(h)) || /image|photo/i.test(String(h)); }

function metaContent_(html, prop) {
  const p = prop.replace(/[:.]/g, '\\$&');
  const a = new RegExp('<meta[^>]+(?:property|name)=["\']' + p + '["\'][^>]*content=["\']([^"\']+)["\']', 'i').exec(html);
  if (a) return a[1];
  const b = new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + p + '["\']', 'i').exec(html);
  return b ? b[1] : null;
}

/** Returns { url, error }. url is a direct image link (or the original if nothing to change). */
function resolveImageUrl_(raw) {
  const url = String(raw || '').trim();
  if (!/^https?:\/\//i.test(url)) return { url: raw };

  // Google Drive share link -> viewable image (the file must be shared "Anyone with the link")
  let m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || url.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]+)/);
  if (m) return { url: 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1600' };

  // already a direct image
  if (/^https?:\/\/(i\.pinimg\.com|i\.imgur\.com|upload\.wikimedia\.org|lh3\.googleusercontent\.com|drive\.google\.com\/thumbnail)/i.test(url) ||
      /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(url)) return { url: url };

  // imgur page link
  m = url.match(/^https?:\/\/(?:www\.)?imgur\.com\/(?:gallery\/)?([A-Za-z0-9]{5,8})\/?$/);
  if (m) return { url: 'https://i.imgur.com/' + m[1] + '.jpg' };

  // anything else (Pinterest pins, pin.it short links, articles...): read the page's main image
  let res;
  try {
    res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                 'Accept-Language': 'en-US,en;q=0.9' },
    });
  } catch (err) { return { url: raw, error: 'Could not open that link.' }; }

  if (String(res.getHeaders()['Content-Type'] || '').toLowerCase().indexOf('image/') === 0) return { url: url };
  const html = res.getContentText();
  let found = metaContent_(html, 'og:image:secure_url') || metaContent_(html, 'og:image') ||
              metaContent_(html, 'twitter:image') || metaContent_(html, 'twitter:image:src');
  if (!found) return { url: raw, error: 'No image found at that link. Right-click the image > Copy image address and paste that instead.' };

  found = found.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'");
  if (/pinimg\.com\/\d+x\//.test(found)) { // Pinterest: prefer the full-size original if it exists
    const big = found.replace(/pinimg\.com\/\d+x\//, 'pinimg.com/originals/');
    try { if (UrlFetchApp.fetch(big, { method: 'head', muteHttpExceptions: true }).getResponseCode() === 200) found = big; } catch (err) {}
  }
  return { url: found };
}

function convertImageLinksInRange_(sheet, range) {
  if (range.getRow() === 1 || range.getNumRows() * range.getNumColumns() > 40) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (let r = 0; r < range.getNumRows(); r++) {
    for (let c = 0; c < range.getNumColumns(); c++) {
      const col = range.getColumn() + c;
      if (!isImageHeader_(headers[col - 1])) continue;
      const cell = sheet.getRange(range.getRow() + r, col);
      const v = cell.getValue();
      if (typeof v !== 'string' || !/^https?:\/\//i.test(v.trim())) continue;
      const out = resolveImageUrl_(v);
      if (out.error) cell.setNote(out.error);
      else if (out.url && out.url !== v.trim()) { cell.setValue(out.url); cell.setNote('Converted from: ' + v.trim()); }
    }
  }
}

/** Run from the Grid menu: converts every page link already in your image columns. */
function convertAllImageLinks() {
  SpreadsheetApp.getActive().getSheets().forEach(sheet => {
    const last = sheet.getLastRow();
    if (last < 2) return;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    headers.forEach((h, i) => {
      if (!isImageHeader_(h)) return;
      for (let row = 2; row <= last; row++) {
        const cell = sheet.getRange(row, i + 1), v = cell.getValue();
        if (typeof v !== 'string' || !/^https?:\/\//i.test(v.trim())) continue;
        const out = resolveImageUrl_(v);
        if (out.error) cell.setNote(out.error);
        else if (out.url && out.url !== v.trim()) { cell.setValue(out.url); cell.setNote('Converted from: ' + v.trim()); }
      }
    });
  });
}

/** Converts image-column values in a row written by the admin panel. */
function resolveRowImages_(headers, row) {
  return row.map((v, i) => {
    if (!isImageHeader_(headers[i]) || typeof v !== 'string') return v;
    const out = resolveImageUrl_(v);
    return out.url || v;
  });
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

/** Saves a whole admin page at once: edited rows, new rows and deleted rows in one request. */
function saveBatch_(payload) {
  const updates = Array.isArray(payload.updates) ? payload.updates : [];
  const adds = Array.isArray(payload.adds) ? payload.adds : [];
  const deletes = (Array.isArray(payload.deletes) ? payload.deletes : []).map(Number).filter(n => n >= 2);
  if (updates.length + adds.length + deletes.length > 300) return { ok: false, error: 'Too many changes in one save.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_(payload.tab);
    const headers = getHeaders_(sheet);
    const toRow = (data) => resolveRowImages_(headers,
      headers.map(h => (data && data[h] !== undefined) ? data[h] : ''));

    // 1) edits (row numbers are from before any deletes), 2) deletes bottom-up, 3) new rows at the end
    updates.forEach(u => {
      const n = Number(u.row);
      if (n >= 2) sheet.getRange(n, 1, 1, headers.length).setValues([toRow(u.data)]);
    });
    deletes.sort((a, b) => b - a).forEach(n => sheet.deleteRow(n));
    if (adds.length) {
      const rows = adds.map(toRow);
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  if (payload.tab === RESULTS_TAB) refreshStandingsDoc_();
  return { ok: true, updated: updates.length, added: adds.length, deleted: deletes.length };
}

/** Adds a header cell if the tab doesn't have that column yet (blank values). */
function ensureColumn_(sheet, name) {
  const headers = getHeaders_(sheet);
  if (headers.length && headers.indexOf(name) === -1) {
    sheet.getRange(1, headers.length + 1).setValue(name);
  }
}

/** Replaces every Results row for one Season + Round + Session with the rows
 *  sent from the race page, then refreshes the standings Doc. */
function saveResults_(payload) {
  const season = String(payload.season || '').trim();
  const round = String(payload.round || '').trim();
  const session = String(payload.session || '').trim();
  if (!season || !round || !session) return { ok: false, error: 'Missing season, round or session.' };
  const incoming = Array.isArray(payload.rows) ? payload.rows : [];
  if (incoming.length > 60) return { ok: false, error: 'Too many rows.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_(RESULTS_TAB);
    const headers = getHeaders_(sheet);
    const iS = headers.indexOf('Season'), iR = headers.indexOf('Round'), iX = headers.indexOf('Session');
    if (iS < 0 || iR < 0 || iX < 0) return { ok: false, error: 'Results tab needs Season, Round and Session columns.' };

    const lastRow = sheet.getLastRow();
    const existing = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
    const kept = existing.filter(r => !(
      String(r[iS]).trim() === season && String(r[iR]).trim() === round && String(r[iX]).trim() === session));

    const fresh = incoming.map(obj => headers.map(h => {
      if (h === 'Season') return Number(season) || season;
      if (h === 'Round') return Number(round) || round;
      if (h === 'Session') return session;
      const v = obj[h];
      return v === undefined || v === null ? '' : v;
    }));

    const all = kept.concat(fresh);
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    if (all.length) sheet.getRange(2, 1, all.length, headers.length).setValues(all);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  refreshStandingsDoc_();
  return { ok: true };
}

/** Replaces everything under the "Round N" Heading 1 with the given text
 *  (one line = one paragraph, "- " = bullet, "Image: url" = picture).
 *  Creates the heading at the end of the Doc if that round has none yet. */
function saveNote_(round, title, text) {
  const id = PropertiesService.getScriptProperties().getProperty(NOTES_DOC_PROPERTY);
  if (!id) return { ok: false, error: 'No notes Doc yet — run setupDocs() in the Apps Script editor.' };
  round = Number(round);
  if (!round) return { ok: false, error: 'Missing round.' };

  const doc = DocumentApp.openById(id);
  const body = doc.getBody();
  let start = -1, end = body.getNumChildren();

  for (let i = 0; i < body.getNumChildren(); i++) {
    const el = body.getChild(i);
    if (el.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    const para = el.asParagraph();
    if (para.getHeading() !== DocumentApp.ParagraphHeading.HEADING1) continue;
    if (start >= 0) { end = i; break; }
    const m = para.getText().match(/round\s*(\d+)/i);
    if (m && Number(m[1]) === round) start = i;
  }
  if (start < 0) {
    body.appendParagraph(title || ('Round ' + round)).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    start = body.getNumChildren() - 1;
    end = start + 1;
  }

  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let idx = start + 1;
  lines.forEach(l => {
    const m = l.match(/^[-•*]\s+(.*)$/);
    if (m) body.insertListItem(idx++, m[1]).setGlyphType(DocumentApp.GlyphType.BULLET);
    else body.insertParagraph(idx++, l).setHeading(DocumentApp.ParagraphHeading.NORMAL);
  });

  // remove the old content (shifted down by the lines just inserted)
  for (let i = end - 1 + lines.length; i >= start + 1 + lines.length; i--) {
    const el = body.getChild(i);
    try { body.removeChild(el); }
    catch (err) { if (el.getType() === DocumentApp.ElementType.PARAGRAPH) el.asParagraph().clear(); }
  }
  doc.saveAndClose();
  return { ok: true };
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
