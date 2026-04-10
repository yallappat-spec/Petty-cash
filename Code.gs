/**
 * ============================================================
 *  Petty Cash Manager — Google Apps Script Backend
 * ============================================================
 */

const TX_SHEET    = 'Transactions';
const SET_SHEET   = 'Settings';
const TRAVEL_SHEET = 'TravelExpenses';

const TX_COLS = [
  'id', 'type', 'amount', 'category', 'date',
  'description', 'reference', 'status', 'notes',
  'createdAt', 'actionAt', 'submittedBy'
];

const TRAVEL_COLS = [
  'id', 'date', 'from', 'to', 'km', 'perKmRate',
  'total', 'auditor', 'month', 'year', 'submittedBy', 'createdAt'
];

// ── Sheet initialisation ─────────────────────────────────────
function getSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Transactions sheet
  let txSheet = ss.getSheetByName(TX_SHEET);
  if (!txSheet) {
    txSheet = ss.getSheetByName('Sheet1') || ss.insertSheet(TX_SHEET);
    txSheet.setName(TX_SHEET);
    txSheet.appendRow(TX_COLS);
    styleHeader_(txSheet, TX_COLS.length);
    txSheet.setFrozenRows(1);
    txSheet.setColumnWidth(6, 220);
  }

  // Settings sheet
  let setSheet = ss.getSheetByName(SET_SHEET);
  if (!setSheet) {
    setSheet = ss.insertSheet(SET_SHEET);
    setSheet.appendRow(['key', 'value']);
    styleHeader_(setSheet, 2);
    setSheet.appendRow(['initialBalance',  '0']);
    setSheet.appendRow(['setupDone',       'false']);
    setSheet.appendRow(['departmentName',  'My Department']);
  }

  // Travel Expenses sheet
  let travelSheet = ss.getSheetByName(TRAVEL_SHEET);
  if (!travelSheet) {
    travelSheet = ss.insertSheet(TRAVEL_SHEET);
    travelSheet.appendRow(TRAVEL_COLS);
    styleHeader_(travelSheet, TRAVEL_COLS.length);
    travelSheet.setFrozenRows(1);
    travelSheet.setColumnWidth(3, 160); // from
    travelSheet.setColumnWidth(4, 160); // to
  }

  return { txSheet, setSheet, travelSheet };
}

function styleHeader_(sheet, numCols) {
  const hdr = sheet.getRange(1, 1, 1, numCols);
  hdr.setFontWeight('bold')
     .setBackground('#1e293b')
     .setFontColor('#ffffff');
}

// ── GET ──────────────────────────────────────────────────────
function doGet(e) {
  try {
    const { txSheet, setSheet, travelSheet } = getSheets_();

    // Settings
    const setRows  = setSheet.getDataRange().getValues();
    const settings = {};
    for (let i = 1; i < setRows.length; i++) {
      settings[setRows[i][0]] = setRows[i][1];
    }

    // Transactions
    const txRows = txSheet.getDataRange().getValues();
    const transactions = [];
    for (let i = 1; i < txRows.length; i++) {
      const row = txRows[i];
      if (!row[0]) continue;
      const tx = {};
      TX_COLS.forEach((col, j) => { tx[col] = row[j] !== undefined ? row[j] : ''; });
      tx.amount = parseFloat(tx.amount) || 0;
      transactions.push(tx);
    }
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Travel Expenses
    const travelRows = travelSheet.getDataRange().getValues();
    const travelExpenses = [];
    for (let i = 1; i < travelRows.length; i++) {
      const row = travelRows[i];
      if (!row[0]) continue;
      const t = {};
      TRAVEL_COLS.forEach((col, j) => { t[col] = row[j] !== undefined ? row[j] : ''; });
      t.km         = parseFloat(t.km)         || 0;
      t.perKmRate  = parseFloat(t.perKmRate)  || 0;
      t.total      = parseFloat(t.total)      || 0;
      travelExpenses.push(t);
    }
    travelExpenses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return output_({
      fund: {
        initialBalance: parseFloat(settings.initialBalance) || 0,
        setupDone:      settings.setupDone === 'true' || settings.setupDone === true,
        departmentName: settings.departmentName || 'My Department'
      },
      transactions,
      travelExpenses
    });

  } catch (err) {
    return output_({ error: err.toString() });
  }
}

// ── POST ─────────────────────────────────────────────────────
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;
    const { txSheet, setSheet, travelSheet } = getSheets_();
    let result = { success: true };

    // ── Add transaction ──────────────────────────────────────
    if (action === 'addTransaction') {
      const tx  = body.transaction;
      const id  = Date.now().toString();
      const now = new Date().toISOString();
      txSheet.appendRow([
        id, tx.type, parseFloat(tx.amount), tx.category, tx.date,
        tx.description, tx.reference || '', 'pending', '', now, '',
        tx.submittedBy || ''
      ]);
      result.id = id;
    }

    // ── Approve / Reject ─────────────────────────────────────
    else if (action === 'approveTransaction' || action === 'rejectTransaction') {
      const newStatus = action === 'approveTransaction' ? 'approved' : 'rejected';
      updateRow_(txSheet, body.id, TX_COLS, {
        status:   newStatus,
        notes:    body.notes || '',
        actionAt: new Date().toISOString()
      });
    }

    // ── Delete transaction ───────────────────────────────────
    else if (action === 'deleteTransaction') {
      deleteRow_(txSheet, body.id);
    }

    // ── Add Travel Expense ───────────────────────────────────
    else if (action === 'addTravelExpense') {
      const t   = body.expense;
      const id  = Date.now().toString();
      const now = new Date().toISOString();
      const km         = parseFloat(t.km)        || 0;
      const perKmRate  = parseFloat(t.perKmRate) || 0;
      const total      = parseFloat((km * perKmRate).toFixed(2));
      travelSheet.appendRow([
        id, t.date, t.from, t.to,
        km, perKmRate, total,
        t.auditor || '', t.month || '', t.year || '',
        t.submittedBy || '', now
      ]);
      result.id    = id;
      result.total = total;
    }

    // ── Delete Travel Expense ────────────────────────────────
    else if (action === 'deleteTravelExpense') {
      deleteRow_(travelSheet, body.id);
    }

    // ── Update Settings ──────────────────────────────────────
    else if (action === 'updateSettings') {
      const setRows = setSheet.getDataRange().getValues();
      Object.entries(body.settings).forEach(([key, value]) => {
        let found = false;
        for (let i = 1; i < setRows.length; i++) {
          if (setRows[i][0] === key) {
            setSheet.getRange(i + 1, 2).setValue(value.toString());
            setRows[i][1] = value;
            found = true; break;
          }
        }
        if (!found) setSheet.appendRow([key, value.toString()]);
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
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === id.toString()) return i + 1;
  }
  return -1;
}

function updateRow_(sheet, id, cols, updates) {
  const rowNum = findRow_(sheet, id);
  if (rowNum < 0) return;
  Object.entries(updates).forEach(([col, val]) => {
    const colIdx = cols.indexOf(col);
    if (colIdx >= 0) sheet.getRange(rowNum, colIdx + 1).setValue(val);
  });
}

function deleteRow_(sheet, id) {
  const rowNum = findRow_(sheet, id);
  if (rowNum > 0) sheet.deleteRow(rowNum);
}
