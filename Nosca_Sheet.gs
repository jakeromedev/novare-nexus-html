/**
 * Ask NOSCA — index sheet access and persistence.
 */

/**
 * Public diagnostic: verifies that the NOSCA data workbook and index tab are
 * accessible and have the expected schema.
 *
 * @return {Object}
 */
function testNoscaDataSheetAccess() {
  const sheet = getNoscaIndexSheet_();
  assertNoscaIndexHeaders_(sheet);

  const result = {
    ok: true,
    spreadsheetId: NOSCA_CONFIG.dataSpreadsheetId,
    sheetName: sheet.getName(),
    lastRow: sheet.getLastRow(),
    lastColumn: sheet.getLastColumn()
  };

  console.log('[Ask NOSCA] NOSCA_Index sheet access OK:', result);

  return result;
}

/**
 * Opens and validates the NOSCA_Index sheet.
 */
function getNoscaIndexSheet_() {
  let spreadsheet;

  try {
    spreadsheet = SpreadsheetApp.openById(
      NOSCA_CONFIG.dataSpreadsheetId
    );
  } catch (error) {
    throw new Error(
      'Unable to open the Ask NOSCA data spreadsheet. Confirm the Apps ' +
      'Script deployment account has Editor access. Original error: ' +
      getNoscaErrorMessage_(error)
    );
  }

  const sheet = spreadsheet.getSheetByName(
    NOSCA_CONFIG.sheets.index
  );

  if (!sheet) {
    throw new Error(
      'Required sheet "' +
      NOSCA_CONFIG.sheets.index +
      '" was not found in the Ask NOSCA data spreadsheet.'
    );
  }

  return sheet;
}

/**
 * Confirms the imported workbook still has the expected NOSCA_Index columns.
 */
function assertNoscaIndexHeaders_(sheet) {
  const expected = NOSCA_CONFIG.indexHeaders.slice();

  const actual = sheet
    .getRange(1, 1, 1, expected.length)
    .getDisplayValues()[0]
    .map(function (value) {
      return String(value || '').trim();
    });

  const mismatches = [];

  expected.forEach(function (header, index) {
    if (actual[index] !== header) {
      mismatches.push(
        'Column ' +
        (index + 1) +
        ': expected "' +
        header +
        '", found "' +
        (actual[index] || '') +
        '"'
      );
    }
  });

  if (mismatches.length) {
    throw new Error(
      'NOSCA_Index schema mismatch. ' +
      mismatches.join(' | ')
    );
  }
}

/**
 * Reads existing index records keyed by File ID.
 *
 * @return {Object<string,Object>}
 */
function loadNoscaExistingIndex_() {
  const sheet = getNoscaIndexSheet_();
  assertNoscaIndexHeaders_(sheet);

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {};
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, NOSCA_CONFIG.indexHeaders.length)
    .getValues();

  const records = {};

  values.forEach(function (row) {
    const fileId = String(row[0] || '').trim();

    if (!fileId || records[fileId]) {
      return;
    }

    records[fileId] = {
      fileId: fileId,
      fileName: String(row[1] || '').trim(),
      folderPath: String(row[2] || '').trim(),
      mimeType: String(row[3] || '').trim(),
      modifiedAt: normalizeNoscaComparableDate_(row[4]),
      driveUrl: String(row[5] || '').trim(),
      keywords: String(row[6] || '').trim(),
      indexedAt: normalizeNoscaDateValue_(row[7]),
      status: String(row[8] || '').trim(),
      notes: String(row[9] || '').trim()
    };
  });

  return records;
}

/**
 * Replaces index data rows while preserving sheet formatting and validation.
 */
function writeNoscaIndexRows_(rows) {
  const sheet = getNoscaIndexSheet_();
  assertNoscaIndexHeaders_(sheet);

  const width = NOSCA_CONFIG.indexHeaders.length;
  const existingDataRows = Math.max(sheet.getLastRow() - 1, 0);
  const rowsToClear = Math.max(existingDataRows, rows.length);

  if (rowsToClear > 0) {
    sheet
      .getRange(2, 1, rowsToClear, width)
      .clearContent();
  }

  if (!rows.length) {
    SpreadsheetApp.flush();
    return;
  }

  const requiredLastRow = rows.length + 1;

  if (sheet.getMaxRows() < requiredLastRow) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      requiredLastRow - sheet.getMaxRows()
    );
  }

  sheet
    .getRange(2, 1, rows.length, width)
    .setValues(rows);

  SpreadsheetApp.flush();
}

function normalizeNoscaComparableDate_(value) {
  if (!value) return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  const parsed = new Date(value);

  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return String(value || '').trim();
}

function normalizeNoscaDateValue_(value) {
  if (!value) return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  const parsed = new Date(value);

  return isNaN(parsed.getTime()) ? '' : parsed;
}
