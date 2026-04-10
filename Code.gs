/**
 * ============================================================
 *  Petty Cash Manager — Google Apps Script Backend
 * ============================================================
 *
 *  SETUP INSTRUCTIONS (one-time):
 *  1. Open a new Google Sheet (this will be your database).
 *  2. Click Extensions > Apps Script.
 *  3. Delete any existing code, paste this entire file, Save.
 *  4. Click "Deploy" > "New Deployment".
 *  5. Click the gear icon ⚙ next to "Type", choose "Web app".
 *  6. Set:
 *       Execute as  → Me (your Google account)
 *       Who has access → Anyone
 *  7. Click "Deploy", allow permissions when prompted.
 *  8. Copy the Web App URL shown.
 *  9. Paste the URL into  config.js  in your project folder.
 * ============================================================
 */

// ── Sheet names & column layout ──────────────────────────────
const TX_SHEET   = 'Transactions';
const SET_SHEET  = 'Settings';

// Column order in the Transactions sheet (do NOT reorder)
const TX_COLS = [
  'id', 'type', 'amount', 'category', 'date',
  'description', 'reference', 'status', 'notes',
  'createdAt', 'actionAt', 'submittedBy'
];

// ── Sheet initialisation ─────────────────────────────────────
function getSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ----- Transactions sheet -----
  let txSheet = ss.getSheetByName(TX_SHEET);
  if (!txSheet) {
    // Re-use the default "Sheet1" if it exists, otherwise insert
    txSheet = ss.getSheetByName('Sheet1') || ss.insertSheet(TX_SHEET);
    txSheet.setName(TX_SHEET);
    txSheet.appendRow(TX_COLS);
    styleHeader_(txSheet, TX_COLS.length);
    txSheet.setFrozenRows(1);
    // Set column widths for readability
    txSheet.setColumnWidth(6, 220); // description
  }

  // ----- Settings sheet -----
  let setSheet = ss.getSheetByName(SET_SHEET);
  if (!setSheet) {
    setSheet = ss.insertSheet(SET_SHEET);
    setSheet.appendRow(['key', 'value']);
    styleHeader_(setSheet, 2);
    setSheet.appendRow(['initialBalance',  '0']);
    setSheet.appendRow(['setupDone',       'false']);
    setSheet.appendRow(['departmentName',  'My Department']);
  }

  return { txSheet, setSheet };
}

function styleHeader_(sheet, numCols) {
  const hdr = sheet.getRange(1, 1, 1, numCols);
  hdr.setFontWeight('bold')
     .setBackground('#1e293b')
     .setFontColor('#ffffff');
}

// ── GET — return all data ────────────────────────────────────
function doGet(e) {
  try {
    const { txSheet, setSheet } = getSheets_();

    // Read settings
    const setRows = setSheet.getDataRange().getValues();
    const settings = {};
    for (let i = 1; i < setRows.length; i++) {
      settings[setRows[i][0]] = setRows[i][1];
    }

    // Read transactions
    const txRows = txSheet.getDataRange().getValues();
    const transactions = [];
    for (let i = 1; i < txRows.length; i++) {
      const row = txRows[i];
      if (!row[0]) continue; // skip blank rows
      const tx = {};
      TX_COLS.forEach((col, j) => { tx[col] = row[j] !== undefined ? row[j] : ''; });
      tx.amount = parseFloat(tx.amount) || 0;
      transactions.push(tx);
    }

    // Newest first
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const payload = {
      fund: {
        initialBalance:  parseFloat(settings.initialBalance) || 0,
        setupDone:       settings.setupDone === 'true' || settings.setupDone === true,
        departmentName:  settings.departmentName || 'My Department'
      },
      transactions
    };

    return output_(payload);

  } catch (err) {
    return output_({ error: err.toString() });
  }
}

// ── POST — handle mutations ──────────────────────────────────
function doPost(e) {
  // Prevent concurrent writes corrupting the sheet
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;
    const { txSheet, setSheet } = getSheets_();
    let result = { success: true };

    // ── Add transaction ──────────────────────────────────────
    if (action === 'addTransaction') {
      const tx  = body.transaction;
      const id  = Date.now().toString();
      const now = new Date().toISOString();
      txSheet.appendRow([
        id,
        tx.type,
        parseFloat(tx.amount),
        tx.category,
        tx.date,
        tx.description,
        tx.reference  || '',
        'pending',
        '',
        now,
        '',
        tx.submittedBy || ''
      ]);
      result.id = id;
    }

    // ── Approve / Reject ─────────────────────────────────────
    else if (action === 'approveTransaction' || action === 'rejectTransaction') {
      const newStatus = action === 'approveTransaction' ? 'approved' : 'rejected';
      updateRow_(txSheet, body.id, {
        status:   newStatus,
        notes:    body.notes    || '',
        actionAt: new Date().toISOString()
      });
    }

    // ── Delete ───────────────────────────────────────────────
    else if (action === 'deleteTransaction') {
      deleteRow_(txSheet, body.id);
    }

    // ── Update settings ──────────────────────────────────────
    else if (action === 'updateSettings') {
      const setRows = setSheet.getDataRange().getValues();
      Object.entries(body.settings).forEach(([key, value]) => {
        let found = false;
        for (let i = 1; i < setRows.length; i++) {
          if (setRows[i][0] === key) {
            setSheet.getRange(i + 1, 2).setValue(value.toString());
            setRows[i][1] = value; // update local cache
            found = true;
            break;
          }
        }
        if (!found) {
          setSheet.appendRow([key, value.toString()]);
          setRows.push([key, value.toString()]);
        }
      });
    }

    return output_(result);

  } catch (err) {
    return output_({ error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ── Helpers ──────────────────────────────────────────────────

function output_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function findRow_(sheet, id) {
  const data   = sheet.getDataRange().getValues();
  const idCol  = TX_COLS.indexOf('id');   // column 0
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol].toString() === id.toString()) return i + 1; // 1-based
  }
  return -1;
}

function updateRow_(sheet, id, updates) {
  const rowNum = findRow_(sheet, id);
  if (rowNum < 0) return;
  Object.entries(updates).forEach(([col, val]) => {
    const colIdx = TX_COLS.indexOf(col);
    if (colIdx >= 0) sheet.getRange(rowNum, colIdx + 1).setValue(val);
  });
}

function deleteRow_(sheet, id) {
  const rowNum = findRow_(sheet, id);
  if (rowNum > 0) sheet.deleteRow(rowNum);
}
