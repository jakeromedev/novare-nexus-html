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

  const parent = sheet.getParent();

  const result = {
    ok: true,
    spreadsheetId: parent.getId(),
    spreadsheetName: parent.getName(),
    configuredSpreadsheetId: NOSCA_CONFIG.dataSpreadsheetId,
    sheetName: sheet.getName(),
    sheetId: sheet.getSheetId(),
    configuredSheetId: Number(NOSCA_CONFIG.indexSheetId || 0) || null,
    lastRow: sheet.getLastRow(),
    lastColumn: sheet.getLastColumn(),
    headers: sheet
      .getRange(1, 1, 1, NOSCA_CONFIG.indexHeaders.length)
      .getDisplayValues()[0]
  };

  console.log('[Ask NOSCA] NOSCA_Index sheet access OK:', result);

  return result;
}


/**
 * Prepares the NOSCA_Index header row for document classification.
 *
 * Safety rule: this refuses to change the header while data rows still
 * exist. Clear rows 2+ first, then run this once before the new full index.
 *
 * @return {Object}
 */
function prepareNoscaIndexDocumentClassificationSchema() {
  const spreadsheet = SpreadsheetApp.openById(
    NOSCA_CONFIG.dataSpreadsheetId
  );
  const sheet = spreadsheet.getSheetByName(
    NOSCA_CONFIG.sheets.index
  );

  if (!sheet) {
    throw new Error(
      'Required sheet "' +
      NOSCA_CONFIG.sheets.index +
      '" was not found.'
    );
  }

  if (sheet.getLastRow() > 1) {
    throw new Error(
      'NOSCA_Index still has data rows. Clear rows 2+ first, then run ' +
      'prepareNoscaIndexDocumentClassificationSchema() again.'
    );
  }

  const headers = NOSCA_CONFIG.indexHeaders.slice();

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  }

  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers]);

  SpreadsheetApp.flush();

  const result = {
    ok: true,
    sheetName: sheet.getName(),
    columns: headers.length,
    headers: headers
  };

  console.log(
    '[Ask NOSCA] NOSCA_Index document-classification schema prepared:',
    result
  );

  return result;
}

/**
 * Preferred name for the current hierarchy-aware schema preparation.
 * The older classification function name remains for backward compatibility.
 */
function prepareNoscaIndexHierarchySchema() {
  return prepareNoscaIndexDocumentClassificationSchema();
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

  const expectedSheetId = Number(NOSCA_CONFIG.indexSheetId || 0);

  if (expectedSheetId && sheet.getSheetId() !== expectedSheetId) {
    throw new Error(
      'NOSCA_Index tab mismatch. Expected sheet gid ' +
      expectedSheetId +
      ', but "' +
      sheet.getName() +
      '" has gid ' +
      sheet.getSheetId() +
      '. Confirm NOSCA_CONFIG.dataSpreadsheetId and indexSheetId.'
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

    const generatedKeywords =
      String(row[10] || '').trim();
    const manualKeywords =
      String(row[11] || '').trim();

    records[fileId] = {
      fileId: fileId,
      itemType: String(row[1] || '').trim(),
      fileName: String(row[2] || '').trim(),
      folderPath: String(row[3] || '').trim(),
      hierarchyContext: String(row[4] || '').trim(),
      documentType: String(row[5] || '').trim(),
      fileFormat: String(row[6] || '').trim(),
      mimeType: String(row[7] || '').trim(),
      modifiedAt: normalizeNoscaComparableDate_(row[8]),
      driveUrl: String(row[9] || '').trim(),
      generatedKeywords: generatedKeywords,
      manualKeywords: manualKeywords,
      // Compatibility field used by existing ranking/debug helpers.
      keywords: [
        generatedKeywords,
        manualKeywords
      ].filter(Boolean).join(', '),
      indexedAt: normalizeNoscaDateValue_(row[12]),
      status: String(row[13] || '').trim(),
      notes: String(row[14] || '').trim()
    };
  });

  return records;
}

/**
 * LEGACY FULL SCAN SAFE WRITE SUPPORT
 *
 * Read the existing index once, retaining physical row numbers. Unlike the
 * original full-sheet writer, these helpers never clear/reorder unrelated rows.
 * A duplicate Item ID is unsafe for incremental upserts and aborts the scan.
 */
function loadNoscaIndexPatchSnapshot_() {
  const sheet = getNoscaIndexSheet_();
  assertNoscaIndexHeaders_(sheet);
  const width = NOSCA_CONFIG.indexHeaders.length;
  const lastRow = sheet.getLastRow();
  const values = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, width).getValues()
    : [];
  const records = {};
  const rowNumbers = {};
  values.forEach(function (row, index) {
    const id = String(row[0] || '').trim();
    if (!id) return;
    if (rowNumbers[id]) {
      throw new Error('Duplicate NOSCA_Index Item ID ' + id +
        '. Resolve the duplicate before resuming the full scan.');
    }
    const generated = String(row[10] || '').trim();
    const manual = String(row[11] || '').trim();
    rowNumbers[id] = index + 2;
    records[id] = {
      fileId: id,
      itemType: String(row[1] || '').trim(),
      fileName: String(row[2] || '').trim(),
      folderPath: String(row[3] || '').trim(),
      hierarchyContext: String(row[4] || '').trim(),
      documentType: String(row[5] || '').trim(),
      fileFormat: String(row[6] || '').trim(),
      mimeType: String(row[7] || '').trim(),
      modifiedAt: normalizeNoscaComparableDate_(row[8]),
      driveUrl: String(row[9] || '').trim(),
      generatedKeywords: generated,
      manualKeywords: manual,
      keywords: [generated, manual].filter(Boolean).join(', '),
      indexedAt: normalizeNoscaDateValue_(row[12]),
      status: String(row[13] || '').trim(),
      notes: String(row[14] || '').trim()
    };
  });
  return {sheet: sheet, rowNumbers: rowNumbers, records: records,
    lastRow: lastRow, width: width};
}

/**
 * Commit only affected records of a legacy full-scan batch.
 * - Existing changed rows: columns A:K and M:O only (never L / Manual Keywords).
 * - Existing unchanged rows: only column M / Indexed At (scan generation).
 * - New rows: a single contiguous append; no delete/reorder of existing rows.
 *
 * Safe to replay a failed batch: each record is addressed by Item ID and a
 * retry of a partly written batch updates that same row instead of duplicating.
 */
function writeNoscaLegacyPartialBatch_(snapshot, changedById, touchedById,
                                        newById, stamp) {
  const sheet = snapshot.sheet;
  const changedIds = Object.keys(changedById);
  const newIds = Object.keys(newById);
  const touchedIds = Object.keys(touchedById).filter(function (id) {
    return !changedById[id] && !newById[id];
  });

  // Existing changed records. Preserve column L even if users edited it after
  // the snapshot was read; it is NEVER included in these write ranges.
  changedIds.forEach(function (id) {
    const rowNo = snapshot.rowNumbers[id];
    if (!rowNo) throw new Error('Missing legacy index row for ' + id);
    const values = noscaIndexRecordToRow_(changedById[id]);
    sheet.getRange(rowNo, 1, 1, 11).setValues([values.slice(0, 11)]);
    sheet.getRange(rowNo, 13, 1, 3).setValues([values.slice(12, 15)]);
  });

  // Appending after any changed-row operations is safe for a retry. If this
  // write succeeds but a later operation fails, the next invocation loads
  // the now-present IDs instead of appending them again.
  if (newIds.length) {
    const startRow = sheet.getLastRow() + 1;
    const needed = startRow + newIds.length - 1;
    if (needed > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());
    }
    const values = newIds.map(function (id) {
      return noscaIndexRecordToRow_(newById[id]);
    });
    sheet.getRange(startRow, 1, values.length, snapshot.width).setValues(values);
  }

  // The final scan detects unseen files using Indexed At. Stamp unchanged
  // records as visited too. RangeList coalesces many unrelated cells into
  // bounded service operations instead of rewriting thousands of columns.
  const addresses = touchedIds.map(function (id) {
    if (!snapshot.rowNumbers[id]) {
      throw new Error('Missing legacy index row for touch ' + id);
    }
    return 'M' + snapshot.rowNumbers[id];
  });
  for (let i = 0; i < addresses.length; i += 50) {
    sheet.getRangeList(addresses.slice(i, i + 50)).setValue(stamp);
  }
  SpreadsheetApp.flush();
  return {changed: changedIds.length, inserted: newIds.length,
    stampedUnchanged: touchedIds.length};
}

/** Finalize in place: only M:O of unseen records, in bounded contiguous runs. */
function finalizeNoscaLegacyPartialRows_(snapshot, scanStartedAt) {
  const stamp = new Date(scanStartedAt);
  const comparable = normalizeNoscaComparableDate_(scanStartedAt);
  const rowChanges = [];
  Object.keys(snapshot.records).forEach(function (id) {
    const record = snapshot.records[id];
    if (normalizeNoscaComparableDate_(record.indexedAt) === comparable) {
      return;
    }
    rowChanges.push({number: snapshot.rowNumbers[id], values: [stamp,
      NOSCA_CONFIG.statuses.skipped,
      'Source file was not found under the configured Ask NOSCA ' +
      'knowledge root during the latest completed full scan.']});
  });
  rowChanges.sort(function (a, b) {return a.number - b.number;});
  let begin = 0;
  let batch = [];
  function commit() {
    if (!batch.length) return;
    snapshot.sheet.getRange(begin, 13, batch.length, 3).setValues(batch);
    batch = [];
  }
  rowChanges.forEach(function (update) {
    if (!batch.length) begin = update.number;
    if (batch.length &&
        (update.number !== begin + batch.length || batch.length >= 80)) {
      commit();
      begin = update.number;
    }
    batch.push(update.values);
  });
  commit();
  SpreadsheetApp.flush();
  return {removedFiles: rowChanges.length,
    writtenRows: Object.keys(snapshot.records).length};
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


/**
 * Clears all NOSCA_Index data rows while preserving:
 * - the header row
 * - sheet formatting
 * - the NOSCA_Logs sheet
 * - the NOSCA_Feedback sheet
 *
 * It also clears any saved full-index traversal checkpoint so the next
 * refreshNoscaIndex() starts cleanly from the knowledge root.
 *
 * This is an administrator/manual maintenance function.
 *
 * @return {Object}
 */
function clearNoscaIndexTable() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    throw new Error(
      'Another Ask NOSCA index operation is already running. Try again shortly.'
    );
  }

  try {
    const sheet = getNoscaIndexSheet_();
    const previousLastRow = sheet.getLastRow();
    const clearedRows = Math.max(previousLastRow - 1, 0);

    if (clearedRows > 0) {
      // Clear every populated column below the header, not only the current
      // schema width. This also removes leftover values from older schemas.
      const columnsToClear = Math.max(
        sheet.getLastColumn(),
        NOSCA_CONFIG.indexHeaders.length
      );

      sheet
        .getRange(2, 1, clearedRows, columnsToClear)
        .clearContent();
    }

    // A clean index must not resume an old partial traversal.
    if (typeof clearNoscaIndexScanState_ === 'function') {
      clearNoscaIndexScanState_();
    }

    // Safe even before the planned cache layer is fully implemented.
    try {
      CacheService.getScriptCache().remove('NOSCA_INDEX_METADATA');
    } catch (cacheError) {
      console.warn(
        '[Ask NOSCA] Index cleared, but cache cleanup was skipped:',
        getNoscaErrorMessage_(cacheError)
      );
    }

    SpreadsheetApp.flush();

    const result = {
      ok: true,
      sheetName: sheet.getName(),
      clearedRows: clearedRows,
      headerPreserved: true,
      checkpointCleared: true,
      message:
        'NOSCA_Index data rows were cleared. Header row was preserved. ' +
        'The next refreshNoscaIndex() will start a new full scan.'
    };

    console.log('[Ask NOSCA] NOSCA_Index cleared:', result);

    return result;
  } finally {
    lock.releaseLock();
  }
}


/**
 * Convenience reset for the new document-classification schema.
 *
 * Use this when you want to completely reset the index and immediately
 * restore the current NOSCA_CONFIG.indexHeaders.
 *
 * @return {Object}
 */
function clearAndPrepareNoscaIndexTable() {
  const cleared = clearNoscaIndexTable();
  const prepared = prepareNoscaIndexDocumentClassificationSchema();

  const result = {
    ok: true,
    clearedRows: cleared.clearedRows,
    columns: prepared.columns,
    headers: prepared.headers,
    message:
      'NOSCA_Index was cleared and prepared with the current schema.'
  };

  console.log('[Ask NOSCA] NOSCA_Index reset and prepared:', result);

  return result;
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
