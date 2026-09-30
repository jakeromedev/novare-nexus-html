/**
 * Ask NOSCA — Phase 6 logging, feedback and tuning helpers.
 *
 * Uses:
 * - NOSCA_Logs
 * - NOSCA_Feedback
 *
 * The generated answer itself is intentionally NOT written to these sheets.
 */

/**
 * Public diagnostic for the imported logging workbook.
 *
 * This function reveals schema/row counts only, not user questions.
 *
 * @return {Object}
 */
function validateNoscaLoggingConfiguration() {
  const logsSheet = getNoscaOperationalSheet_(
    NOSCA_CONFIG.sheets.logs,
    NOSCA_CONFIG.logging.logHeaders
  );

  const feedbackSheet = getNoscaOperationalSheet_(
    NOSCA_CONFIG.sheets.feedback,
    NOSCA_CONFIG.logging.feedbackHeaders
  );

  const result = {
    ok: true,
    spreadsheetId: NOSCA_CONFIG.dataSpreadsheetId,
    logsSheet: logsSheet.getName(),
    logsRows: Math.max(logsSheet.getLastRow() - 1, 0),
    feedbackSheet: feedbackSheet.getName(),
    feedbackRows: Math.max(feedbackSheet.getLastRow() - 1, 0)
  };

  console.log(
    '[Ask NOSCA] Logging configuration validated:',
    result
  );

  return result;
}

/**
 * Public frontend endpoint.
 *
 * Feedback is linked only to a Request ID that already exists in NOSCA_Logs.
 * The server retrieves the authoritative question/user from the log row,
 * rather than trusting client-submitted question text.
 *
 * @param {string} requestId
 * @param {boolean|string} helpful
 * @param {string=} comment
 * @return {Object}
 */
function submitNoscaFeedback(requestId, helpful, comment) {
  if (!NOSCA_CONFIG.logging.enabled) {
    return {
      ok: false,
      disabled: true
    };
  }

  const normalizedRequestId =
    String(requestId || '').trim();

  if (!normalizedRequestId) {
    throw new Error(
      'Ask NOSCA feedback requires a valid Request ID.'
    );
  }

  const helpfulValue =
    normalizeNoscaHelpfulValue_(helpful);

  const normalizedComment =
    truncateNoscaLogValue_(
      String(comment || '').trim(),
      NOSCA_CONFIG.logging.maxFeedbackCommentChars
    );

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    throw new Error(
      'Ask NOSCA feedback is temporarily busy. Please try again.'
    );
  }

  try {
    const logsSheet = getNoscaOperationalSheet_(
      NOSCA_CONFIG.sheets.logs,
      NOSCA_CONFIG.logging.logHeaders
    );

    const logRecord =
      findNoscaLogRecordByRequestId_(
        logsSheet,
        normalizedRequestId
      );

    if (!logRecord) {
      throw new Error(
        'The Ask NOSCA request could not be found for feedback.'
      );
    }

    const currentUser =
      getNoscaOperationalUser_();

    assertNoscaFeedbackOwnership_(
      logRecord.user,
      currentUser
    );

    const feedbackSheet = getNoscaOperationalSheet_(
      NOSCA_CONFIG.sheets.feedback,
      NOSCA_CONFIG.logging.feedbackHeaders
    );

    const now = new Date();
    const existingFeedbackRow =
      findNoscaFeedbackRowByRequestId_(
        feedbackSheet,
        normalizedRequestId
      );

    const rowValues = [
      existingFeedbackRow
        ? String(
            feedbackSheet
              .getRange(existingFeedbackRow, 1)
              .getValue() || ''
          ).trim() || createNoscaFeedbackId_()
        : createNoscaFeedbackId_(),
      now,
      normalizedRequestId,
      logRecord.user || currentUser,
      truncateNoscaLogValue_(
        logRecord.question,
        NOSCA_CONFIG.logging.maxLoggedQuestionChars
      ),
      helpfulValue,
      normalizedComment
    ];

    if (existingFeedbackRow) {
      feedbackSheet
        .getRange(
          existingFeedbackRow,
          1,
          1,
          rowValues.length
        )
        .setValues([rowValues]);
    } else {
      appendNoscaOperationalRow_(
        feedbackSheet,
        rowValues
      );
    }

    // Column I = Feedback in NOSCA_Logs.
    logsSheet
      .getRange(logRecord.row, 9)
      .setValue(helpfulValue);

    SpreadsheetApp.flush();

    const result = {
      ok: true,
      requestId: normalizedRequestId,
      helpful: helpfulValue,
      commentSaved: Boolean(normalizedComment)
    };

    console.log(
      '[Ask NOSCA] Feedback saved:',
      {
        requestId: normalizedRequestId,
        helpful: helpfulValue,
        commentSaved: Boolean(normalizedComment)
      }
    );

    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Server-private safe request logger.
 *
 * Any logging error is swallowed after being written to console so the
 * primary Ask NOSCA response is never lost because of analytics.
 *
 * @param {Object} record
 */
function safeLogNoscaRequest_(record) {
  if (!NOSCA_CONFIG.logging.enabled) {
    return;
  }

  try {
    logNoscaRequest_(record);
  } catch (error) {
    console.error(
      '[Ask NOSCA] Logging failed but the user response will continue:',
      getNoscaErrorMessage_(error)
    );
  }
}

/**
 * Writes one NOSCA_Logs row.
 *
 * @param {Object} record
 */
function logNoscaRequest_(record) {
  const sheet = getNoscaOperationalSheet_(
    NOSCA_CONFIG.sheets.logs,
    NOSCA_CONFIG.logging.logHeaders
  );

  const sourceText = formatNoscaLogSources_(
    record.sources || []
  );

  const row = [
    String(record.requestId || '').trim(),
    new Date(),
    getNoscaOperationalUser_(),
    truncateNoscaLogValue_(
      String(record.question || '').trim(),
      NOSCA_CONFIG.logging.maxLoggedQuestionChars
    ),
    record.status === 'Failed'
      ? 'Failed'
      : 'Success',
    truncateNoscaLogValue_(
      sourceText,
      NOSCA_CONFIG.logging.maxLoggedSourcesChars
    ),
    Math.max(
      Number(record.responseTimeMs || 0),
      0
    ),
    truncateNoscaLogValue_(
      String(record.error || '').trim(),
      NOSCA_CONFIG.logging.maxLoggedErrorChars
    ),
    'Not Rated'
  ];

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    throw new Error(
      'NOSCA_Logs is temporarily locked by another request.'
    );
  }

  try {
    appendNoscaOperationalRow_(sheet, row);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Creates a unique ID returned to the browser and written to NOSCA_Logs.
 */
function createNoscaRequestId_() {
  return (
    'NOSCA-' +
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || 'Asia/Manila',
      'yyyyMMdd-HHmmss'
    ) +
    '-' +
    Utilities.getUuid().substring(0, 8)
  );
}

function createNoscaFeedbackId_() {
  return (
    'FDBK-' +
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || 'Asia/Manila',
      'yyyyMMdd-HHmmss'
    ) +
    '-' +
    Utilities.getUuid().substring(0, 8)
  );
}

/**
 * Opens and schema-validates one operational sheet.
 */
function getNoscaOperationalSheet_(
  sheetName,
  expectedHeaders
) {
  let spreadsheet;

  try {
    spreadsheet = SpreadsheetApp.openById(
      NOSCA_CONFIG.dataSpreadsheetId
    );
  } catch (error) {
    throw new Error(
      'Unable to open the Ask NOSCA operational spreadsheet. ' +
      'Confirm the Apps Script execution account has Editor access. ' +
      'Original error: ' +
      getNoscaErrorMessage_(error)
    );
  }

  const sheet = spreadsheet.getSheetByName(
    sheetName
  );

  if (!sheet) {
    throw new Error(
      'Required Ask NOSCA sheet "' +
      sheetName +
      '" was not found.'
    );
  }

  assertNoscaOperationalHeaders_(
    sheet,
    expectedHeaders
  );

  return sheet;
}

function assertNoscaOperationalHeaders_(
  sheet,
  expectedHeaders
) {
  const actual = sheet
    .getRange(
      1,
      1,
      1,
      expectedHeaders.length
    )
    .getDisplayValues()[0]
    .map(function (value) {
      return String(value || '').trim();
    });

  const mismatches = [];

  expectedHeaders.forEach(function (header, index) {
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
      sheet.getName() +
      ' schema mismatch. ' +
      mismatches.join(' | ')
    );
  }
}

function appendNoscaOperationalRow_(
  sheet,
  values
) {
  const nextRow = Math.max(
    sheet.getLastRow() + 1,
    2
  );

  if (nextRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      Math.max(100, nextRow - sheet.getMaxRows())
    );
  }

  sheet
    .getRange(
      nextRow,
      1,
      1,
      values.length
    )
    .setValues([values]);

  return nextRow;
}

/**
 * Looks up the authoritative request record from NOSCA_Logs.
 */
function findNoscaLogRecordByRequestId_(
  sheet,
  requestId
) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  const finder = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(requestId)
    .matchEntireCell(true);

  const match = finder.findNext();

  if (!match) {
    return null;
  }

  const row = match.getRow();
  const values = sheet
    .getRange(row, 1, 1, 9)
    .getValues()[0];

  return {
    row: row,
    requestId: String(values[0] || '').trim(),
    timestamp: values[1],
    user: String(values[2] || '').trim(),
    question: String(values[3] || '').trim(),
    status: String(values[4] || '').trim(),
    sources: String(values[5] || '').trim(),
    responseTimeMs: Number(values[6] || 0),
    error: String(values[7] || '').trim(),
    feedback: String(values[8] || '').trim()
  };
}

function findNoscaFeedbackRowByRequestId_(
  sheet,
  requestId
) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  // Column C = Request ID.
  const finder = sheet
    .getRange(2, 3, lastRow - 1, 1)
    .createTextFinder(requestId)
    .matchEntireCell(true);

  const match = finder.findNext();

  return match ? match.getRow() : 0;
}

function getNoscaOperationalUser_() {
  try {
    const email = Session
      .getActiveUser()
      .getEmail();

    if (email) {
      return String(email).trim();
    }
  } catch (error) {
    // Use a neutral fallback below.
  }

  return 'Unavailable';
}

/**
 * Prevents a logged-in user from altering another user's feedback when
 * Apps Script exposes employee identity.
 */
function assertNoscaFeedbackOwnership_(
  loggedUser,
  currentUser
) {
  const recorded =
    String(loggedUser || '').trim().toLowerCase();

  const current =
    String(currentUser || '').trim().toLowerCase();

  const unknownValues = {
    '': true,
    unavailable: true
  };

  if (
    !unknownValues[recorded] &&
    !unknownValues[current] &&
    recorded !== current
  ) {
    throw new Error(
      'This Ask NOSCA feedback request does not belong to the current user.'
    );
  }
}

function normalizeNoscaHelpfulValue_(value) {
  if (
    value === true ||
    String(value || '').trim().toLowerCase() === 'yes'
  ) {
    return 'Yes';
  }

  if (
    value === false ||
    String(value || '').trim().toLowerCase() === 'no'
  ) {
    return 'No';
  }

  throw new Error(
    'Feedback must be Helpful or Not helpful.'
  );
}

function formatNoscaLogSources_(sources) {
  if (!Array.isArray(sources) || !sources.length) {
    return '';
  }

  return sources
    .map(function (source, index) {
      if (!source || typeof source !== 'object') {
        return '';
      }

      const number =
        Number(source.sourceIndex || 0) ||
        index + 1;

      const name =
        String(source.fileName || '').trim();

      return name
        ? 'Source ' + number + ': ' + name
        : '';
    })
    .filter(function (value) {
      return value !== '';
    })
    .join(' | ');
}

function truncateNoscaLogValue_(
  value,
  maxChars
) {
  const text = String(value || '');
  const limit = Math.max(
    Number(maxChars || 0),
    1
  );

  if (text.length <= limit) {
    return text;
  }

  return (
    text.substring(0, Math.max(limit - 13, 1)) +
    ' [truncated]'
  );
}

/**
 * Server-private aggregate used for periodic tuning/admin review.
 *
 * Does not return individual user questions.
 *
 * @return {Object}
 */
function getNoscaTuningSummary_() {
  const logsSheet = getNoscaOperationalSheet_(
    NOSCA_CONFIG.sheets.logs,
    NOSCA_CONFIG.logging.logHeaders
  );

  const feedbackSheet = getNoscaOperationalSheet_(
    NOSCA_CONFIG.sheets.feedback,
    NOSCA_CONFIG.logging.feedbackHeaders
  );

  const logRows =
    logsSheet.getLastRow() >= 2
      ? logsSheet
          .getRange(
            2,
            1,
            logsSheet.getLastRow() - 1,
            9
          )
          .getValues()
      : [];

  const feedbackRows =
    feedbackSheet.getLastRow() >= 2
      ? feedbackSheet
          .getRange(
            2,
            1,
            feedbackSheet.getLastRow() - 1,
            7
          )
          .getValues()
      : [];

  let success = 0;
  let failed = 0;
  let totalResponseMs = 0;
  let successfulWithNoSources = 0;

  logRows.forEach(function (row) {
    const status =
      String(row[4] || '').trim();

    if (status === 'Success') {
      success += 1;

      if (!String(row[5] || '').trim()) {
        successfulWithNoSources += 1;
      }
    }

    if (status === 'Failed') {
      failed += 1;
    }

    totalResponseMs +=
      Math.max(Number(row[6] || 0), 0);
  });

  let helpfulYes = 0;
  let helpfulNo = 0;
  let comments = 0;

  feedbackRows.forEach(function (row) {
    const helpful =
      String(row[5] || '').trim();

    if (helpful === 'Yes') helpfulYes += 1;
    if (helpful === 'No') helpfulNo += 1;

    if (String(row[6] || '').trim()) {
      comments += 1;
    }
  });

  const rated = helpfulYes + helpfulNo;

  return {
    ok: true,
    totalRequests: logRows.length,
    success: success,
    failed: failed,
    successfulWithNoSources:
      successfulWithNoSources,
    averageResponseTimeMs:
      logRows.length
        ? Math.round(totalResponseMs / logRows.length)
        : 0,
    ratedResponses: rated,
    helpfulYes: helpfulYes,
    helpfulNo: helpfulNo,
    helpfulRate:
      rated
        ? Number(
            ((helpfulYes / rated) * 100).toFixed(1)
          )
        : 0,
    feedbackComments: comments
  };
}
