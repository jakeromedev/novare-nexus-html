/**
 * ONESCA / Novare Nexus web-app entry point.
 * Deploy this Apps Script project as a Web App, then embed the /exec URL in Google Sites.
 */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');

  return template
    .evaluate()
    .setTitle('Novare Nexus 2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Includes another Apps Script HTML file into Index.html.
 * Use only with trusted project files.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Initial server hook for proving client/server communication.
 * We can extend this later for Sheets, Drive, document generation, search, etc.
 */
function getServerStatus() {
  return {
    ok: true,
    app: 'Novare Nexus 2026',
    timestamp: new Date().toISOString()
  };
}

/**
 * Returns the identity of the Google Workspace user currently accessing ONESCA.
 *
 * Important:
 * - This intentionally uses Session.getActiveUser(), not getEffectiveUser(), so
 *   ONESCA never shows the deployer's identity as if it belonged to the visitor.
 * - Depending on the Apps Script deployment/domain policy, email can be blank.
 *   The client handles that case with a neutral fallback.
 * - This Stage 1 implementation does not require the People API or a change to
 *   the existing web-app execution identity.
 */
function getCurrentUser() {
  const email = String(Session.getActiveUser().getEmail() || '').trim();

  return {
    name: getDisplayNameFromEmail_(email),
    email: email,
    department: 'OneSCA'
  };
}

/**
 * Converts a corporate email local-part into a readable display name.
 * Example: jakerome.openiano@novare.com.ph -> Jakerome Openiano
 */
function getDisplayNameFromEmail_(email) {
  if (!email) return '';

  const localPart = String(email)
    .split('@')[0]
    .split('+')[0]
    .trim();

  if (!localPart) return '';

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}
/**
 * ONESCA managed-link registry.
 *
 * Source:
 * Spreadsheet: 1SFpdCxefmdyvoJ6dKOckYWeCYd-aVtlIc6WU21WMpgM
 * Sheet tab: 06_Assets
 * Column B: Link Key
 * Column I: URL
 *
 * This endpoint is intentionally generic so future page-specific scripts
 * (Offerings, Opportunities, Programs, etc.) can use the same registry.
 */
const NEXUS_LINK_REGISTRY = Object.freeze({
  spreadsheetId: '1SFpdCxefmdyvoJ6dKOckYWeCYd-aVtlIc6WU21WMpgM',
  sheetName: '06_Assets',
  keyColumn: 2,
  urlColumn: 9
});

/**
 * Returns URLs for the requested ONESCA link keys.
 *
 * @param {string[]} linkKeys Link keys requested by the client page.
 * @return {{
 *   links: Object<string,string>,
 *   missing: string[],
 *   duplicates: string[],
 *   invalid: string[]
 * }}
 */
function getManagedLinks(linkKeys) {
  const requestedKeys = normalizeManagedLinkKeys_(linkKeys);

  if (!requestedKeys.length) {
    return {
      links: {},
      missing: [],
      duplicates: [],
      invalid: [],
      meta: {
        connected: false,
        spreadsheetId: NEXUS_LINK_REGISTRY.spreadsheetId,
        sheetName: NEXUS_LINK_REGISTRY.sheetName,
        rowsScanned: 0,
        requestedCount: 0,
        matchedCount: 0
      }
    };
  }

  console.log(
    '[ONESCA Links] Connecting to spreadsheet %s / sheet %s for %s requested keys.',
    NEXUS_LINK_REGISTRY.spreadsheetId,
    NEXUS_LINK_REGISTRY.sheetName,
    requestedKeys.length
  );

  const spreadsheet = SpreadsheetApp.openById(
    NEXUS_LINK_REGISTRY.spreadsheetId
  );

  const sheet = spreadsheet.getSheetByName(
    NEXUS_LINK_REGISTRY.sheetName
  );

  if (!sheet) {
    throw new Error(
      'ONESCA link registry sheet "' +
      NEXUS_LINK_REGISTRY.sheetName +
      '" was not found.'
    );
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 1) {
    console.log(
      '[ONESCA Links] Connected to %s, but the sheet has no rows.',
      NEXUS_LINK_REGISTRY.sheetName
    );

    return {
      links: {},
      missing: requestedKeys.slice(),
      duplicates: [],
      invalid: [],
      meta: {
        connected: true,
        spreadsheetId: NEXUS_LINK_REGISTRY.spreadsheetId,
        sheetName: NEXUS_LINK_REGISTRY.sheetName,
        rowsScanned: 0,
        requestedCount: requestedKeys.length,
        matchedCount: 0
      }
    };
  }

  // Read only B:I. Inside this 8-column range:
  // index 0 = Column B (Link Key)
  // index 7 = Column I (URL)
  const values = sheet
    .getRange(1, NEXUS_LINK_REGISTRY.keyColumn, lastRow, 8)
    .getDisplayValues();

  const requestedSet = {};
  requestedKeys.forEach(function (key) {
    requestedSet[key] = true;
  });

  const links = {};
  const seen = {};
  const duplicateSet = {};
  const invalidSet = {};

  values.forEach(function (row) {
    const key = String(row[0] || '').trim();

    if (!key || !requestedSet[key]) {
      return;
    }

    const url = String(row[7] || '').trim();

    if (seen[key]) {
      duplicateSet[key] = true;
      return;
    }

    seen[key] = true;

    if (!url) {
      return;
    }

    if (!isSafeManagedLinkUrl_(url)) {
      invalidSet[key] = true;
      return;
    }

    links[key] = url;
  });

  const missing = requestedKeys.filter(function (key) {
    return !links[key];
  });

  const duplicates = Object.keys(duplicateSet);
  const invalid = Object.keys(invalidSet);
  const matchedCount = Object.keys(links).length;

  console.log(
    '[ONESCA Links] Google Sheet connected. Rows scanned: %s | Requested: %s | Matched: %s | Missing: %s | Duplicates: %s | Invalid: %s',
    lastRow,
    requestedKeys.length,
    matchedCount,
    missing.length,
    duplicates.length,
    invalid.length
  );

  return {
    links: links,
    missing: missing,
    duplicates: duplicates,
    invalid: invalid,
    meta: {
      connected: true,
      spreadsheetId: NEXUS_LINK_REGISTRY.spreadsheetId,
      sheetName: NEXUS_LINK_REGISTRY.sheetName,
      rowsScanned: lastRow,
      requestedCount: requestedKeys.length,
      matchedCount: matchedCount
    }
  };
}

/**
 * Normalizes, de-duplicates, and limits client-requested link keys.
 */
function normalizeManagedLinkKeys_(linkKeys) {
  if (!Array.isArray(linkKeys)) {
    return [];
  }

  const unique = {};

  linkKeys.forEach(function (key) {
    const normalized = String(key || '').trim();

    if (!normalized) return;

    // Keep the endpoint bounded even if a client sends a very large payload.
    if (Object.keys(unique).length >= 250) return;

    unique[normalized] = true;
  });

  return Object.keys(unique);
}

/**
 * Managed resource links are restricted to normal web URLs.
 * This prevents a malformed Sheet value such as javascript: from being
 * executed by the browser.
 */
function isSafeManagedLinkUrl_(url) {
  return /^https?:\/\/\S+$/i.test(String(url || '').trim());
}
