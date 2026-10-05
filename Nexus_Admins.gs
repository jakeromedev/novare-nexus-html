/**
 * NEXUS Admin accounts
 *
 * Source of truth:
 *   Spreadsheet: NOSCA_CONFIG.dataSpreadsheetId
 *   Sheet:       NOSCA_Admins
 *   Emails:      A2:A
 *
 * Admin authorization is always evaluated server-side from the signed-in
 * Google user's email. The browser receives only the resolved role.
 */

function getNexusAdminSettings_() {
  const config =
    typeof NOSCA_CONFIG !== 'undefined' &&
    NOSCA_CONFIG
      ? NOSCA_CONFIG
      : {};

  const sheets = config.sheets || {};
  const admins = config.admins || {};

  return {
    spreadsheetId:
      String(
        config.dataSpreadsheetId ||
        '1lJetYhn8loCBmcMtiZZSVCH1OLMOIGBq8GGWoWH20Gw'
      ).trim(),

    sheetName:
      String(
        sheets.admins ||
        'NOSCA_Admins'
      ).trim(),

    startRow:
      Math.max(
        Number(admins.startRow || 2),
        2
      ),

    emailColumn:
      Math.max(
        Number(admins.emailColumn || 1),
        1
      ),

    cacheSeconds:
      Math.min(
        Math.max(
          Number(admins.cacheSeconds || 300),
          30
        ),
        21600
      ),

    cacheKey:
      String(
        admins.cacheKey ||
        'NEXUS_ADMIN_EMAILS_V1'
      ).trim()
  };
}


/**
 * Normalizes Google account email addresses for role comparisons.
 *
 * @param {*} value
 * @return {string}
 */
function normalizeNoscaEmail_(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}


/**
 * Reads and caches NOSCA_Admins!A2:A.
 *
 * Blank rows are ignored and duplicate emails are removed.
 *
 * @return {string[]}
 */
function getNoscaAdminEmails_() {
  const settings = getNexusAdminSettings_();
  const cache = CacheService.getScriptCache();

  const cached = cache.get(settings.cacheKey);

  if (cached) {
    try {
      const parsed = JSON.parse(cached);

      if (Array.isArray(parsed)) {
        return parsed
          .map(normalizeNoscaEmail_)
          .filter(Boolean);
      }
    } catch (error) {
      console.warn(
        '[NEXUS Admin] Cached admin list was invalid. Reloading from sheet.',
        error
      );

      cache.remove(settings.cacheKey);
    }
  }

  if (!settings.spreadsheetId) {
    throw new Error(
      'NEXUS Admin spreadsheet ID is not configured.'
    );
  }

  const spreadsheet =
    SpreadsheetApp.openById(
      settings.spreadsheetId
    );

  const sheet =
    spreadsheet.getSheetByName(
      settings.sheetName
    );

  if (!sheet) {
    throw new Error(
      'NEXUS Admin sheet "' +
      settings.sheetName +
      '" was not found.'
    );
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < settings.startRow) {
    cache.put(
      settings.cacheKey,
      '[]',
      settings.cacheSeconds
    );

    return [];
  }

  const rowCount =
    lastRow - settings.startRow + 1;

  const values =
    sheet
      .getRange(
        settings.startRow,
        settings.emailColumn,
        rowCount,
        1
      )
      .getDisplayValues();

  const seen = Object.create(null);
  const emails = [];

  values.forEach(function (row) {
    const email =
      normalizeNoscaEmail_(
        row && row.length
          ? row[0]
          : ''
      );

    if (!email || seen[email]) {
      return;
    }

    seen[email] = true;
    emails.push(email);
  });

  cache.put(
    settings.cacheKey,
    JSON.stringify(emails),
    settings.cacheSeconds
  );

  return emails;
}


/**
 * Fail-closed admin check.
 *
 * Any spreadsheet/cache/access problem returns false instead of granting
 * elevated access.
 *
 * @param {*} email
 * @return {boolean}
 */
function isNoscaAdminEmail_(email) {
  const normalizedEmail =
    normalizeNoscaEmail_(email);

  if (!normalizedEmail) {
    return false;
  }

  try {
    return getNoscaAdminEmails_()
      .indexOf(normalizedEmail) !== -1;
  } catch (error) {
    console.error(
      '[NEXUS Admin] Admin lookup failed. Access remains non-admin.',
      error
    );

    return false;
  }
}


/**
 * Resolves the signed-in user's email directly from Apps Script.
 *
 * @return {string}
 */
function getNexusSignedInEmail_() {
  try {
    return normalizeNoscaEmail_(
      Session
        .getActiveUser()
        .getEmail()
    );
  } catch (error) {
    console.error(
      '[NEXUS Admin] Unable to resolve signed-in Google email.',
      error
    );

    return '';
  }
}


/**
 * Optional fallback display-name resolver.
 *
 * The project's existing getCurrentUser() remains the preferred source of
 * profile data. This function is used only when that function is unavailable
 * or returns no name.
 *
 * @param {string} email
 * @return {string}
 */
function getNexusFallbackDisplayName_(email) {
  try {
    if (
      typeof People !== 'undefined' &&
      People &&
      People.People &&
      typeof People.People.getBatchGet === 'function'
    ) {
      const response =
        People.People.getBatchGet({
          resourceNames: ['people/me'],
          personFields: 'names'
        });

      const personResponse =
        response &&
        response.responses &&
        response.responses.length
          ? response.responses[0]
          : null;

      const person =
        personResponse &&
        personResponse.person
          ? personResponse.person
          : null;

      if (
        person &&
        person.names &&
        person.names.length &&
        person.names[0].displayName
      ) {
        return String(
          person.names[0].displayName
        ).trim();
      }
    }
  } catch (error) {
    console.warn(
      '[NEXUS Admin] People API display-name fallback unavailable.',
      error
    );
  }

  const normalized =
    normalizeNoscaEmail_(email);

  if (!normalized) {
    return '';
  }

  const localPart =
    normalized.split('@')[0] || '';

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(function (part) {
      return (
        part.charAt(0).toUpperCase() +
        part.slice(1)
      );
    })
    .join(' ');
}


/**
 * Public frontend endpoint.
 *
 * It enriches the existing current-user profile with a server-resolved
 * isAdmin / role property without replacing the project's current identity
 * implementation.
 *
 * @return {Object}
 */
function getNexusCurrentUser() {
  let baseUser = {};

  try {
    if (
      typeof getCurrentUser === 'function'
    ) {
      baseUser =
        getCurrentUser() || {};
    }
  } catch (error) {
    console.warn(
      '[NEXUS Admin] Existing getCurrentUser() failed; using identity fallback.',
      error
    );

    baseUser = {};
  }

  let email =
    normalizeNoscaEmail_(
      baseUser.email
    );

  if (!email) {
    email =
      getNexusSignedInEmail_();
  }

  let name =
    String(
      baseUser.name || ''
    ).trim();

  if (!name) {
    name =
      getNexusFallbackDisplayName_(
        email
      );
  }

  const isAdmin =
    isNoscaAdminEmail_(email);

  const result = {
    name: name,
    email: email,
    isAdmin: isAdmin,
    role:
      isAdmin
        ? 'admin'
        : 'user',

    // Preserve the current Nexus profile-picture contract.
    photoUrl:
      String(
        baseUser.photoUrl || ''
      ).trim(),
    photoIsDefault:
      baseUser.photoIsDefault === true
  };

  // Preserve harmless existing profile metadata if the current user endpoint
  // already returns it.
  if (
    baseUser.department !== undefined
  ) {
    result.department =
      String(
        baseUser.department || ''
      ).trim();
  }

  return result;
}


/**
 * Server-side authorization guard for all future admin-only functions.
 *
 * Never authorize privileged operations using a browser-provided role.
 *
 * @return {string} normalized signed-in admin email
 */
function assertNoscaAdmin_() {
  const email =
    getNexusSignedInEmail_();

  if (
    !email ||
    !isNoscaAdminEmail_(email)
  ) {
    throw new Error(
      'You are not authorized to perform this NEXUS Admin action.'
    );
  }

  return email;
}


/**
 * Optional admin utility to invalidate the five-minute admin cache.
 *
 * This is deliberately protected by the same server-side admin assertion.
 *
 * @return {Object}
 */
function clearNoscaAdminCache() {
  const adminEmail =
    assertNoscaAdmin_();

  const settings =
    getNexusAdminSettings_();

  CacheService
    .getScriptCache()
    .remove(
      settings.cacheKey
    );

  return {
    ok: true,
    clearedBy: adminEmail,
    cacheKey: settings.cacheKey,
    message:
      'NEXUS Admin cache cleared.'
  };
}


/**
 * Manual diagnostic.
 *
 * Run from the Apps Script editor while signed in as a test account.
 * It does not expose the full admin email list.
 *
 * @return {Object}
 */
function testNexusAdminCurrentUser() {
  const user =
    getNexusCurrentUser();

  const result = {
    ok: true,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    role: user.role,
    adminSheet:
      getNexusAdminSettings_().sheetName
  };

  console.log(
    '[NEXUS Admin] Current user test:',
    result
  );

  return result;
}
