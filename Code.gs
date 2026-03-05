// Google Apps Script — Production Log
// Paste this into your Apps Script editor (Extensions > Apps Script)
// Then deploy as Web App (Execute as: Me, Access: Anyone)
//
// Config sheet layout (must match exactly):
//   A: Item  |  B: Operation  |  C: (empty)  |  D: Issue Types  |  E: (empty)  |  F: Employees

const SS = SpreadsheetApp.getActiveSpreadsheet();
const LOG_SHEET = 'Log';
const CONFIG_SHEET = 'Config';

// Column positions in the Config sheet (1-indexed)
const COL = {
  ITEM: 1,       // A
  OPERATION: 2,  // B
  ISSUE_TYPE: 4, // D
  EMPLOYEE: 6    // F
};

// ── GET: return config data to the HTML form ──
function doGet(e) {
  try {
    const config = getConfig();
    return ContentService.createTextOutput(JSON.stringify(config))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST: handle form submissions and config additions ──
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'submit') {
      return handleSubmit(data);
    } else if (data.action === 'add_config') {
      return handleAddConfig(data);
    } else {
      return jsonResponse({ success: false, error: 'Unknown action: ' + data.action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── Submit a production log entry ──
// Log sheet columns:
//   A: Id | B: Submission Time | C: Name | D: Date | E: Process Task
//   F: Start Time | G: End Time | H: Quantity | I: Issues | J: Comments
//   K: Task Time (min) | L: Expected (min) | M: Time/Part (min)
//   N: Standard (min/part) | O: % Difference | P: Issue Count
//   Q: Off Target No Issue (Hrs) | R: On Target | S: Time Error
function handleSubmit(data) {
  const sheet = SS.getSheetByName(LOG_SHEET) || SS.insertSheet(LOG_SHEET);
  const id = sheet.getLastRow(); // row number as entry ID

  const startMin = timeToMinutes(data.start_time);
  const endMin = timeToMinutes(data.end_time);
  const taskTime = endMin - startMin;
  const qty = parseInt(data.quantity) || 1;
  const timePer = (taskTime / qty).toFixed(2);

  // Count semicolon-separated issues (blank = 0)
  const issueStr = (data.issues || '').trim();
  const issueCount = issueStr ? issueStr.split(';').filter(s => s.trim()).length : 0;

  sheet.appendRow([
    id,                  // A: Id
    new Date(),          // B: Submission Time
    data.name,           // C: Name
    data.date,           // D: Date
    data.operation,      // E: Process Task (operation includes item context)
    data.start_time,     // F: Start Time
    data.end_time,       // G: End Time
    qty,                 // H: Quantity
    issueStr,            // I: Issues
    data.comments,       // J: Comments
    taskTime,            // K: Task Time (min)
    '',                  // L: Expected (min) — filled by sheet formula
    timePer,             // M: Time/Part (min)
    '',                  // N: Standard (min/part) — filled by sheet formula
    '',                  // O: % Difference — filled by sheet formula
    issueCount,          // P: Issue Count
    '',                  // Q: Off Target No Issue (Hrs) — filled by sheet formula
    '',                  // R: On Target — filled by sheet formula
    ''                   // S: Time Error — filled by sheet formula
  ]);

  return jsonResponse({
    success: true,
    id: id,
    calculated: {
      task_time_min: taskTime,
      time_per_part: timePer
    }
  });
}

// ── Add a new config entry (employee, item/operation, or issue type) ──
function handleAddConfig(data) {
  const sheet = SS.getSheetByName(CONFIG_SHEET);
  if (!sheet) return jsonResponse({ success: false, error: 'Config sheet not found' });

  const type = data.config_type;
  const value = (data.value || '').trim();
  if (!value) return jsonResponse({ success: false, error: 'Empty value' });

  if (type === 'employee') {
    const existing = getColumnValues(sheet, COL.EMPLOYEE);
    if (existing.indexOf(value) === -1) {
      sheet.getRange(existing.length + 2, COL.EMPLOYEE).setValue(value);
    }
    return jsonResponse({ success: true, config_type: type, value: value });

  } else if (type === 'issue_type') {
    const existing = getColumnValues(sheet, COL.ISSUE_TYPE);
    if (existing.indexOf(value) === -1) {
      sheet.getRange(existing.length + 2, COL.ISSUE_TYPE).setValue(value);
    }
    return jsonResponse({ success: true, config_type: type, value: value });

  } else if (type === 'operation') {
    // Operations are paired: col A = Item, col B = Operation
    const itemName = (data.item || '').trim();
    if (!itemName) return jsonResponse({ success: false, error: 'Item name required for operation' });

    // Check for duplicates
    const items = getColumnValues(sheet, COL.ITEM);
    const ops = getColumnValues(sheet, COL.OPERATION);
    for (let i = 0; i < items.length; i++) {
      if (items[i] === itemName && ops[i] === value) {
        return jsonResponse({ success: true, config_type: type, value: value, note: 'Already exists' });
      }
    }

    const nextRow = Math.max(items.length, ops.length) + 2;
    sheet.getRange(nextRow, COL.ITEM).setValue(itemName);
    sheet.getRange(nextRow, COL.OPERATION).setValue(value);
    return jsonResponse({ success: true, config_type: type, value: value, item: itemName });

  } else {
    return jsonResponse({ success: false, error: 'Unknown config_type: ' + type });
  }
}

// ── Build config object from Config sheet ──
function getConfig() {
  const sheet = SS.getSheetByName(CONFIG_SHEET);
  if (!sheet) throw new Error('Config sheet not found');

  const employees = getColumnValues(sheet, COL.EMPLOYEE);
  const issueTypes = getColumnValues(sheet, COL.ISSUE_TYPE);

  // Build operations list from paired columns A + B
  const items = getColumnValues(sheet, COL.ITEM);
  const ops = getColumnValues(sheet, COL.OPERATION);
  const operations = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i] && ops[i]) {
      operations.push({ item: items[i], operation: ops[i] });
    }
  }

  return { employees, operations, issue_types: issueTypes };
}

// ── Helpers ──
function getColumnValues(sheet, col) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, col, lastRow - 1, 1).getValues()
    .map(r => r[0].toString().trim())
    .filter(v => v !== '');
}

function timeToMinutes(t) {
  const parts = t.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
