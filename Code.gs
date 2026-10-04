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

  console.log('[Nexus User Debug] getCurrentUser() started.');
  console.log('[Nexus User Debug] Active user email:', email || '(blank)');

  const fallbackName = getDisplayNameFromEmail_(email);
  const peopleProfile = getCurrentUserPeopleProfile_(email);

  const result = {
    name: peopleProfile.name || fallbackName,
    email: email,
    department: 'OneSCA',
    photoUrl: peopleProfile.photoUrl || '',
    photoIsDefault: Boolean(peopleProfile.photoIsDefault)
  };

  console.log('[Nexus User Debug] getCurrentUser() result:', JSON.stringify({
    name: result.name,
    email: result.email,
    department: result.department,
    hasPhotoUrl: Boolean(result.photoUrl),
    photoIsDefault: result.photoIsDefault,
    photoUrlPreview: result.photoUrl
      ? result.photoUrl.substring(0, 120)
      : ''
  }));

  return result;
}

/**
 * Returns the signed-in Workspace user's People API profile when available.
 *
 * Safety behavior:
 * - Requires a non-empty Session.getActiveUser() email.
 * - Accepts People API data only when one of the returned email addresses
 *   matches the active Apps Script user. This prevents accidentally showing
 *   the deployer's profile when execution identity differs from the visitor.
 * - Failure to enable/use the People API never breaks the navbar; initials
 *   remain the frontend fallback.
 *
 * Apps Script setup:
 * Services (+) -> People API -> Add
 */
function getCurrentUserPeopleProfile_(activeEmail) {
  const fallback = {
    name: '',
    photoUrl: '',
    photoIsDefault: false
  };

  const normalizedActiveEmail = String(activeEmail || '')
    .trim()
    .toLowerCase();

  if (!normalizedActiveEmail) {
    console.warn(
      '[Nexus User Debug] Active email is blank. People API lookup skipped.'
    );
    return fallback;
  }

  try {
    console.log(
      '[Nexus User Debug] Starting People API lookup for:',
      normalizedActiveEmail
    );
    const peopleServiceAvailable = Boolean(
      typeof People !== 'undefined' &&
      People &&
      People.People &&
      typeof People.People.get === 'function'
    );

    console.log(
      '[Nexus User Debug] People advanced service available:',
      peopleServiceAvailable
    );

    if (!peopleServiceAvailable) {
      console.warn(
        '[Nexus User Debug] People API is not available. ' +
        'Enable Apps Script Services > People API.'
      );
      return fallback;
    }

    const person = People.People.get('people/me', {
      personFields: 'names,emailAddresses,photos'
    }) || {};

    console.log('[Nexus User Debug] People API raw counts:', JSON.stringify({
      names: Array.isArray(person.names) ? person.names.length : 0,
      emailAddresses: Array.isArray(person.emailAddresses)
        ? person.emailAddresses.length
        : 0,
      photos: Array.isArray(person.photos) ? person.photos.length : 0
    }));

    const peopleEmails = Array.isArray(person.emailAddresses)
      ? person.emailAddresses
          .map(function (entry) {
            return String(
              entry && entry.value ? entry.value : ''
            ).trim().toLowerCase();
          })
          .filter(Boolean)
      : [];

    console.log(
      '[Nexus User Debug] People API emails:',
      JSON.stringify(peopleEmails)
    );

    const belongsToActiveUser = peopleEmails.some(function (value) {
      return value === normalizedActiveEmail;
    });

    console.log(
      '[Nexus User Debug] People API identity match:',
      belongsToActiveUser
    );

    if (!belongsToActiveUser) {
      console.warn(
        '[Nexus User] People API identity did not match the active user; ' +
        'profile photo was ignored.'
      );
      return fallback;
    }

    const names = Array.isArray(person.names)
      ? person.names
      : [];

    const photos = Array.isArray(person.photos)
      ? person.photos
      : [];

    const preferredName = names.find(function (entry) {
      return Boolean(
        entry &&
        entry.displayName &&
        entry.metadata &&
        entry.metadata.primary
      );
    }) || names.find(function (entry) {
      return Boolean(entry && entry.displayName);
    });

    const preferredPhoto = photos.find(function (entry) {
      return Boolean(
        entry &&
        entry.url &&
        entry.metadata &&
        entry.metadata.primary
      );
    }) || photos.find(function (entry) {
      return Boolean(entry && entry.url);
    });

    const resolvedProfile = {
      name: preferredName
        ? String(preferredName.displayName || '').trim()
        : '',
      photoUrl: preferredPhoto
        ? String(preferredPhoto.url || '').trim()
        : '',
      photoIsDefault: Boolean(
        preferredPhoto &&
        preferredPhoto.default === true
      )
    };

    console.log(
      '[Nexus User Debug] Selected People profile:',
      JSON.stringify({
        name: resolvedProfile.name,
        hasPhotoUrl: Boolean(resolvedProfile.photoUrl),
        photoIsDefault: resolvedProfile.photoIsDefault,
        photoUrlPreview: resolvedProfile.photoUrl
          ? resolvedProfile.photoUrl.substring(0, 120)
          : ''
      })
    );

    return resolvedProfile;
  } catch (error) {
    console.error(
      '[Nexus User Debug] People API lookup failed:',
      error && error.stack
        ? error.stack
        : String(error)
    );

    console.warn(
      '[Nexus User] Unable to load the Google profile picture. ' +
      'Using initials fallback.'
    );

    return fallback;
  }
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
