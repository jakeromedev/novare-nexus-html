/* global SpreadsheetApp, LockService, Session, Utilities */

/**
 * NEXUS Site Access Logging
 *
 * Spreadsheet:
 * 1lJetYhn8loCBmcMtiZZSVCH1OLMOIGBq8GGWoWH20Gw
 *
 * Sheet:
 * Site Access Logs
 *
 * IMPORTANT:
 * User Email, User Name, and Actual Role are resolved on the server
 * through getNexusCurrentUser(). They are never trusted from the browser.
 */

var NEXUS_SITE_ACCESS_CONFIG = {
  spreadsheetId: '1lJetYhn8loCBmcMtiZZSVCH1OLMOIGBq8GGWoWH20Gw',
  sheetName: 'Site Access Logs',
  gid: 80798476,
  headers: [
    'Log ID',
    'Event Timestamp',
    'Event Date',
    'Session ID',
    'User Email',
    'User Name',
    'Actual Role',
    'Effective View',
    'Page Key',
    'Page Name',
    'Event Type',
    'Identity Status',
    'Source'
  ]
};


/**
 * Called by Scripts.html whenever the visible Nexus route changes.
 *
 * Expected payload:
 * {
 *   sessionId: 'NXS-...',
 *   pageKey: 'home',
 *   pageName: 'Home',
 *   effectiveView: 'user' | 'admin',
 *   source: 'Google Sites Embed' | 'Direct Web App'
 * }
 *
 * @param {Object} payload
 * @return {Object}
 */
function logNexusSitePageView(payload) {
  var data = payload || {};
  var user = getNexusAccessCurrentUser_();

  var email = String(user.email || '')
    .trim()
    .toLowerCase();

  var name = String(user.name || '')
    .trim();

  var isAdmin = user.isAdmin === true;

  var actualRole = isAdmin
    ? 'Admin'
    : 'User';

  var requestedView = String(
    data.effectiveView || ''
  )
    .trim()
    .toLowerCase();

  // A normal user can never log an Admin effective view.
  var effectiveView =
    isAdmin && requestedView === 'admin'
      ? 'Admin'
      : 'User';

  var sessionId = normalizeNexusAccessValue_(
    data.sessionId,
    80
  );

  var pageKey = normalizeNexusAccessValue_(
    data.pageKey,
    80
  );

  var pageName = normalizeNexusAccessValue_(
    data.pageName,
    160
  );

  var source = normalizeNexusAccessValue_(
    data.source,
    80
  );

  if (!source) {
    source = 'Nexus';
  }

  if (!sessionId) {
    throw new Error(
      'Site Access Log: Session ID is required.'
    );
  }

  if (!pageKey) {
    throw new Error(
      'Site Access Log: Page Key is required.'
    );
  }

  var now = new Date();
  var timezone = getNexusAccessTimeZone_();

  var eventDate = Utilities.formatDate(
    now,
    timezone,
    'yyyy-MM-dd'
  );

  var logId = createNexusAccessLogId_(now);

  var identityStatus = email
    ? 'Resolved'
    : 'Unresolved';

  var row = [
    safeNexusAccessSheetText_(logId),
    now,
    eventDate,
    safeNexusAccessSheetText_(sessionId),
    safeNexusAccessSheetText_(email),
    safeNexusAccessSheetText_(name),
    actualRole,
    effectiveView,
    safeNexusAccessSheetText_(pageKey),
    safeNexusAccessSheetText_(
      pageName || pageKey
    ),
    'PAGE_VIEW',
    identityStatus,
    safeNexusAccessSheetText_(source)
  ];

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var sheet = getNexusSiteAccessLogSheet_();

    ensureNexusSiteAccessHeaders_(sheet);

    var targetRow = Math.max(
      sheet.getLastRow() + 1,
      2
    );

    sheet
      .getRange(
        targetRow,
        1,
        1,
        NEXUS_SITE_ACCESS_CONFIG.headers.length
      )
      .setValues([row]);

    sheet
      .getRange(targetRow, 2)
      .setNumberFormat(
        'yyyy-mm-dd hh:mm:ss'
      );

    SpreadsheetApp.flush();

    return {
      ok: true,
      logId: logId,
      sessionId: sessionId,
      pageKey: pageKey,
      pageName: pageName || pageKey,
      eventType: 'PAGE_VIEW',
      userEmail: email,
      userName: name,
      actualRole: actualRole,
      effectiveView: effectiveView
    };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Run once from Apps Script to initialize/validate the sheet.
 *
 * This does NOT create a fake access log.
 *
 * @return {Object}
 */
function setupNexusSiteAccessLogs() {
  var sheet = getNexusSiteAccessLogSheet_();

  ensureNexusSiteAccessHeaders_(sheet);

  sheet.setFrozenRows(1);

  var headerRange = sheet.getRange(
    1,
    1,
    1,
    NEXUS_SITE_ACCESS_CONFIG.headers.length
  );

  headerRange
    .setFontWeight('bold')
    .setBackground('#0F4C9A')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  var widths = [
    190,
    165,
    105,
    190,
    250,
    190,
    105,
    115,
    150,
    190,
    110,
    120,
    135
  ];

  widths.forEach(function (width, index) {
    sheet.setColumnWidth(
      index + 1,
      width
    );
  });

  SpreadsheetApp.flush();

  return {
    ok: true,
    spreadsheetId:
      NEXUS_SITE_ACCESS_CONFIG.spreadsheetId,
    sheetName:
      NEXUS_SITE_ACCESS_CONFIG.sheetName,
    gid:
      NEXUS_SITE_ACCESS_CONFIG.gid,
    headers:
      NEXUS_SITE_ACCESS_CONFIG.headers.slice(),
    currentUser:
      getNexusAccessCurrentUser_()
  };
}


/**
 * Manual test.
 *
 * Run this function directly from Apps Script after running
 * setupNexusSiteAccessLogs().
 *
 * It creates one clearly identified TEST page-view row.
 *
 * @return {Object}
 */
/**
 * Read-only diagnostic endpoint for the live Nexus frontend.
 *
 * This verifies that:
 * - the new Apps Script deployment can see this file
 * - the target workbook is accessible
 * - the target sheet exists
 * - the current header row is compatible
 * - the signed-in identity can be resolved
 *
 * It does not append a log row.
 *
 * @return {Object}
 */
function getNexusSiteAccessLogStatus() {
  var result = {
    ok: false,
    spreadsheetId:
      NEXUS_SITE_ACCESS_CONFIG.spreadsheetId,
    sheetName:
      NEXUS_SITE_ACCESS_CONFIG.sheetName,
    gid:
      NEXUS_SITE_ACCESS_CONFIG.gid,
    currentUser: null,
    lastRow: 0,
    headersValid: false,
    error: ''
  };

  try {
    var sheet = getNexusSiteAccessLogSheet_();

    result.lastRow = sheet.getLastRow();

    ensureNexusSiteAccessHeaders_(sheet);

    result.headersValid = true;
    result.currentUser =
      getNexusAccessCurrentUser_();
    result.ok = true;

    return result;
  } catch (error) {
    result.error = String(
      error && error.message
        ? error.message
        : error
    );

    return result;
  }
}


function testNexusSiteAccessLog() {
  return logNexusSitePageView({
    sessionId:
      'TEST-' +
      new Date().getTime(),
    pageKey: 'test',
    pageName: 'Site Access Log Test',
    effectiveView: 'user',
    source: 'Apps Script Manual Test'
  });
}


/**
 * Resolve the current Nexus user.
 *
 * @return {Object}
 */
function getNexusAccessCurrentUser_() {
  if (
    typeof getNexusCurrentUser === 'function'
  ) {
    var user = getNexusCurrentUser();

    if (user) {
      return user;
    }
  }

  // Defensive fallback only.
  var fallbackEmail = '';

  try {
    fallbackEmail = Session
      .getActiveUser()
      .getEmail();
  } catch (error) {
    fallbackEmail = '';
  }

  return {
    name: '',
    email: fallbackEmail,
    isAdmin: false,
    role: 'user'
  };
}


/**
 * Get the configured access-log sheet.
 *
 * @return {Object}
 */
function getNexusSiteAccessLogSheet_() {
  var spreadsheet = SpreadsheetApp.openById(
    NEXUS_SITE_ACCESS_CONFIG.spreadsheetId
  );

  var sheet = spreadsheet.getSheetByName(
    NEXUS_SITE_ACCESS_CONFIG.sheetName
  );

  if (!sheet) {
    throw new Error(
      'Site Access Log: Sheet "' +
      NEXUS_SITE_ACCESS_CONFIG.sheetName +
      '" was not found.'
    );
  }

  return sheet;
}


/**
 * Create the header when blank, otherwise validate it.
 *
 * @param {Object} sheet
 */
function ensureNexusSiteAccessHeaders_(sheet) {
  var expected =
    NEXUS_SITE_ACCESS_CONFIG.headers;

  var existing = sheet
    .getRange(
      1,
      1,
      1,
      expected.length
    )
    .getDisplayValues()[0];

  existing = existing.map(function (value) {
    return String(value || '').trim();
  });

  var isBlank = existing.every(
    function (value) {
      return value === '';
    }
  );

  // If the sheet has no data rows yet, it is safe to initialize/repair
  // the header row automatically.
  if (
    isBlank ||
    sheet.getLastRow() <= 1
  ) {
    sheet
      .getRange(
        1,
        1,
        1,
        expected.length
      )
      .setValues([
        expected.slice()
      ]);

    return;
  }

  var mismatch = [];

  expected.forEach(function (
    header,
    index
  ) {
    if (existing[index] !== header) {
      mismatch.push(
        'Column ' +
        (index + 1) +
        ': expected "' +
        header +
        '", found "' +
        existing[index] +
        '"'
      );
    }
  });

  if (mismatch.length > 0) {
    throw new Error(
      'Site Access Log header mismatch. ' +
      mismatch.join('; ')
    );
  }
}


/**
 * Create a readable unique log ID.
 *
 * @param {Date} now
 * @return {string}
 */
function createNexusAccessLogId_(now) {
  var timestamp = Utilities.formatDate(
    now,
    'UTC',
    'yyyyMMddHHmmssSSS'
  );

  var suffix = Utilities
    .getUuid()
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase();

  return (
    'NAL-' +
    timestamp +
    '-' +
    suffix
  );
}


/**
 * Get a safe timezone for the log date.
 *
 * @return {string}
 */
function getNexusAccessTimeZone_() {
  try {
    var spreadsheet = SpreadsheetApp.openById(
      NEXUS_SITE_ACCESS_CONFIG.spreadsheetId
    );

    var spreadsheetTimeZone =
      spreadsheet.getSpreadsheetTimeZone();

    if (spreadsheetTimeZone) {
      return spreadsheetTimeZone;
    }
  } catch (error) {
    // Continue to fallback.
  }

  return 'Asia/Manila';
}


/**
 * Normalize browser-supplied metadata.
 *
 * @param {*} value
 * @param {number} maxLength
 * @return {string}
 */
function normalizeNexusAccessValue_(
  value,
  maxLength
) {
  var text = String(
    value == null
      ? ''
      : value
  ).trim();

  var length = Number(maxLength);

  if (
    !isFinite(length) ||
    length < 0
  ) {
    length = 0;
  }

  return text.slice(
    0,
    length
  );
}


/**
 * Store text literally when it starts with a spreadsheet formula character.
 *
 * @param {*} value
 * @return {string}
 */
function safeNexusAccessSheetText_(value) {
  var text = String(
    value == null
      ? ''
      : value
  );

  if (/^[=+\-@]/.test(text)) {
    return "'" + text;
  }

  return text;
}
