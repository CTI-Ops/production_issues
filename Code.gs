// Google Apps Script — Production Log
// Paste this into your Apps Script editor (Extensions > Apps Script)
// Then deploy as Web App (Execute as: Me, Access: Anyone)
//
// Config sheet layout (must match exactly):
//   A: Item  |  B: Operation  |  C: Issue Types

const SS = SpreadsheetApp.getActiveSpreadsheet();
const LOG_SHEET = 'Data Log';
const CONFIG_SHEET = 'Config';

// Column positions in the Config sheet (1-indexed)
const COL = {
  ITEM: 1,       // A
  OPERATION: 2,  // B
  ISSUE_TYPE: 3  // C
};

// ── GET: return config data or dashboard KPIs ──
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || '';
    if (action === 'dashboard') {
      return jsonResponse(getDashboardData());
    }
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
//   A: # | B: Submission Time | C: Date | D: Item | E: Op
//   F: Start Time | G: End Time | H: Qty | I: Issues | J: Comments
//   K: Time (min) | L: Time/Part (min)
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

  sheet.appendRow([
    id,                  // A: #
    new Date(),          // B: Submission Time
    data.date,           // C: Date
    data.item,           // D: Item
    data.operation,      // E: Op
    data.start_time,     // F: Start Time
    data.end_time,       // G: End Time
    qty,                 // H: Qty
    issueStr,            // I: Issues
    data.comments,       // J: Comments
    taskTime,            // K: Time (min)
    timePer              // L: Time/Part (min)
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

  if (type === 'issue_type') {
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

  return { operations, issue_types: issueTypes };
}

// ── Dashboard: aggregate KPIs from the Log sheet ──
function getDashboardData() {
  const sheet = SS.getSheetByName(LOG_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return { total_entries: 0, total_parts: 0, total_time_min: 0, entries_with_issues: 0,
             issues_breakdown: {}, items_breakdown: {}, recent_entries: [], period: 'all time' };
  }

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  // Columns (0-indexed): A:# B:Time C:Date D:Item E:Op F:Start G:End H:Qty I:Issues J:Comments K:Time L:Time/Part
  let totalEntries = 0, totalParts = 0, totalTime = 0, entriesWithIssues = 0;
  const issuesBreakdown = {}, itemsBreakdown = {};
  const recentRows = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    totalEntries++;
    const qty = parseInt(row[7]) || 0;
    const taskTime = parseInt(row[10]) || 0;
    totalParts += qty;
    totalTime += taskTime;

    // Issues
    const issueStr = (row[8] || '').toString().trim();
    const issues = issueStr ? issueStr.split(';').map(s => s.trim()).filter(s => s) : [];
    const hasRealIssue = issues.some(s => s !== 'None');
    if (hasRealIssue) entriesWithIssues++;
    issues.forEach(function(iss) {
      if (iss && iss !== 'None') issuesBreakdown[iss] = (issuesBreakdown[iss] || 0) + 1;
    });

    // Items
    const item = (row[3] || '').toString().trim();
    if (item) itemsBreakdown[item] = (itemsBreakdown[item] || 0) + qty;

    recentRows.push({
      item: item,
      operation: (row[4] || '').toString(),
      task_time_min: taskTime,
      quantity: qty,
      issues: issueStr
    });
  }

  // Return most recent first, cap at 20
  recentRows.reverse();
  const recent = recentRows.slice(0, 20);

  return {
    total_entries: totalEntries,
    total_parts: totalParts,
    total_time_min: totalTime,
    entries_with_issues: entriesWithIssues,
    issues_breakdown: issuesBreakdown,
    items_breakdown: itemsBreakdown,
    recent_entries: recent,
    period: 'all time'
  };
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
