/**
 * Novare Nexus — AI Prompt Library backend
 *
 * Source of truth:
 * Spreadsheet: 1SFpdCxefmdyvoJ6dKOckYWeCYd-aVtlIc6WU21WMpgM
 * Sheet: 11_GenAI Prompts
 *
 * Sheet layout:
 * - Row 1 is intentionally blank / reserved.
 * - Headers are on row 2.
 * - The registry starts in column B.
 *
 * Contract (B:J):
 * Prompt ID | Prompt Name | Category | Prompt Type | Use Case | Prompt |
 * Status | Owner | Last Updated
 *
 * Public functions:
 * - getAIPromptLibrary(options)
 * - addAIPrompt(payload)
 * - updateAIPrompt(promptId, payload)
 * - deleteAIPrompt(promptId)
 * - fillAIPromptLibraryMetadata()
 * - runAIPromptLibraryDiagnostics()
 * - testAIPromptLibraryRead()
 */

const AI_PROMPT_LIBRARY_CONFIG = Object.freeze({
  spreadsheetId: '1SFpdCxefmdyvoJ6dKOckYWeCYd-aVtlIc6WU21WMpgM',
  sheetName: '11_GenAI Prompts',
  sheetId: 376893256, // diagnostic reference only; sheetName is authoritative

  headerRow: 2,
  dataStartRow: 3,
  startColumn: 2, // column B

  headers: Object.freeze([
    'Prompt ID',
    'Prompt Name',
    'Category',
    'Prompt Type',
    'Use Case',
    'Prompt',
    'Status',
    'Owner',
    'Last Updated'
  ]),


  allowedStatuses: Object.freeze([
    'Active',
    'Inactive',
    'Draft',
    'Retired'
  ]),

  maxLengths: Object.freeze({
    promptName: 180,
    category: 120,
    promptType: 120,
    useCase: 500,
    prompt: 12000
  })
});


/**
 * Returns the Prompt Library appropriate for the requested UI view.
 *
 * options.viewMode:
 * - "admin": returns every prompt status only if the real user is an admin.
 * - "user": returns Active prompts only.
 *
 * If options are omitted, a real admin receives the admin dataset and a
 * non-admin receives Active prompts only.
 */
function getAIPromptLibrary(options) {
  const actor = getAIPromptLibraryCurrentUser_();
  const requestedMode = normalizeAIPromptViewMode_(options);
  const adminView = actor.isAdmin === true && requestedMode !== 'user';

  const sheet = getAIPromptLibrarySheet_();
  validateAIPromptLibraryHeaders_(sheet);

  const allPrompts = readAIPromptRows_(sheet).sort(compareAIPrompts_);

  const prompts = adminView
    ? allPrompts.slice()
    : allPrompts.filter(function (prompt) {
        return prompt.status === 'Active';
      });

  const optionSource = adminView
    ? allPrompts
    : prompts;

  return {
    ok: true,
    adminView: adminView,
    prompts: prompts,
    categories: buildAIPromptCategories_(prompts),
    categoryOptions: buildAIPromptCategoryOptions_(optionSource),
    promptTypeOptions: buildAIPromptTypeOptions_(optionSource),
    total: prompts.length,
    fetchedAt: new Date().toISOString()
  };
}


/**
 * Adds one prompt to the registry.
 */
function addAIPrompt(payload) {
  const actor = assertAIPromptLibraryAdmin_();
  const normalized = validateAIPromptPayload_(payload);
  const lock = LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    const sheet = getAIPromptLibrarySheet_();
    validateAIPromptLibraryHeaders_(sheet);

    const existingPrompts = readAIPromptRows_(sheet);
    const promptId = createNextGenAIPromptId_(existingPrompts);
    const owner = getAIPromptOwnerLabel_(actor);
    const now = new Date();

    const row = [
      promptId,                                      // B Prompt ID
      safeSheetText_(normalized.promptName),         // C Prompt Name
      safeSheetText_(normalized.category),           // D Category
      safeSheetText_(normalized.promptType),         // E Prompt Type
      safeSheetText_(normalized.useCase),            // F Use Case
      safeSheetText_(normalized.prompt),             // G Prompt
      normalized.status,                             // H Status
      safeSheetText_(owner),                         // I Owner
      now                                            // J Last Updated
    ];

    const nextRow = Math.max(
      sheet.getLastRow() + 1,
      AI_PROMPT_LIBRARY_CONFIG.dataStartRow
    );

    sheet
      .getRange(
        nextRow,
        AI_PROMPT_LIBRARY_CONFIG.startColumn,
        1,
        AI_PROMPT_LIBRARY_CONFIG.headers.length
      )
      .setValues([row]);

    SpreadsheetApp.flush();

    const saved = normalizeAIPromptRow_(row, nextRow);

    return {
      ok: true,
      prompt: saved,
      visibleToUsers: saved.status === 'Active',
      message: saved.status === 'Active'
        ? 'Prompt added and published successfully.'
        : 'Prompt saved successfully as ' + saved.status + '.'
    };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Updates one prompt by stable Prompt ID.
 */
function updateAIPrompt(promptId, payload) {
  const actor = assertAIPromptLibraryAdmin_();
  const normalized = validateAIPromptPayload_(payload);
  const id = String(promptId || '').trim();

  if (!id) {
    throw new Error('Prompt ID is required.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getAIPromptLibrarySheet_();
    validateAIPromptLibraryHeaders_(sheet);

    const allPrompts = readAIPromptRows_(sheet);
    const current = allPrompts.find(function (prompt) {
      return String(prompt.id || '') === id;
    });

    if (!current) {
      throw new Error('Prompt not found: ' + id);
    }

    const row = [
      id,                                            // B Prompt ID
      safeSheetText_(normalized.promptName),         // C Prompt Name
      safeSheetText_(normalized.category),           // D Category
      safeSheetText_(normalized.promptType),         // E Prompt Type
      safeSheetText_(normalized.useCase),            // F Use Case
      safeSheetText_(normalized.prompt),             // G Prompt
      normalized.status,                             // H Status
      safeSheetText_(getAIPromptOwnerLabel_(actor)), // I Owner
      new Date()                                     // J Last Updated
    ];

    sheet
      .getRange(
        current.sheetRow,
        AI_PROMPT_LIBRARY_CONFIG.startColumn,
        1,
        AI_PROMPT_LIBRARY_CONFIG.headers.length
      )
      .setValues([row]);

    SpreadsheetApp.flush();

    const saved = normalizeAIPromptRow_(
      row,
      current.sheetRow
    );

    return {
      ok: true,
      prompt: saved,
      visibleToUsers: saved.status === 'Active',
      message: 'Prompt updated successfully.'
    };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Permanently deletes one registry row by stable Prompt ID.
 */
function deleteAIPrompt(promptId) {
  assertAIPromptLibraryAdmin_();

  const id = String(promptId || '').trim();

  if (!id) {
    throw new Error('Prompt ID is required.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getAIPromptLibrarySheet_();
    validateAIPromptLibraryHeaders_(sheet);

    const prompt = readAIPromptRows_(sheet).find(function (item) {
      return String(item.id || '') === id;
    });

    if (!prompt) {
      throw new Error('Prompt not found: ' + id);
    }

    sheet.deleteRow(prompt.sheetRow);
    SpreadsheetApp.flush();

    return {
      ok: true,
      promptId: id,
      message: 'Prompt deleted successfully.'
    };
  } finally {
    lock.releaseLock();
  }
}



/**
 * Manual metadata refresh utility.
 *
 * Fills the two system-managed metadata columns for every prompt row:
 * - Owner: always jakerome.openiano@novare.com.ph
 * - Last Updated: the timestamp captured when this function starts
 *
 * Prompt content and publishing fields are left untouched.
 *
 * Run manually from the Apps Script editor:
 *   fillAIPromptLibraryMetadata()
 */
function fillAIPromptLibraryMetadata() {
  assertAIPromptLibraryAdmin_();

  const sheet = getAIPromptLibrarySheet_();
  validateAIPromptLibraryHeaders_(sheet);

  const config = AI_PROMPT_LIBRARY_CONFIG;
  const lastRow = sheet.getLastRow();
  const owner = 'jakerome.openiano@novare.com.ph';
  const runTimestamp = new Date();

  if (lastRow < config.dataStartRow) {
    return {
      ok: true,
      updatedRows: 0,
      owner: owner,
      lastUpdated: runTimestamp.toISOString(),
      message: 'No prompt rows were found to update.'
    };
  }

  const rowCount = lastRow - config.dataStartRow + 1;
  const range = sheet.getRange(
    config.dataStartRow,
    config.startColumn,
    rowCount,
    config.headers.length
  );

  const values = range.getValues();
  const OWNER_INDEX = 7;
  const LAST_UPDATED_INDEX = 8;
  let updatedRows = 0;

  values.forEach(function (row) {
    const hasRecord = row.some(function (value, index) {
      return index < OWNER_INDEX && String(value || '').trim() !== '';
    });

    if (!hasRecord) return;

    row[OWNER_INDEX] = owner;
    row[LAST_UPDATED_INDEX] = runTimestamp;
    updatedRows += 1;
  });

  range.setValues(values);
  SpreadsheetApp.flush();

  return {
    ok: true,
    updatedRows: updatedRows,
    owner: owner,
    lastUpdated: runTimestamp.toISOString(),
    message:
      'AI Prompt Library metadata updated successfully for ' +
      updatedRows +
      ' prompt rows.'
  };
}


/**
 * Manual Apps Script diagnostic.
 */
function runAIPromptLibraryDiagnostics() {
  const report = {
    startedAt: new Date().toISOString(),
    config: {
      spreadsheetId: AI_PROMPT_LIBRARY_CONFIG.spreadsheetId,
      sheetName: AI_PROMPT_LIBRARY_CONFIG.sheetName,
      sheetId: AI_PROMPT_LIBRARY_CONFIG.sheetId,
      sheetIdMode: 'diagnostic-only',
      headerRow: AI_PROMPT_LIBRARY_CONFIG.headerRow,
      startColumn: AI_PROMPT_LIBRARY_CONFIG.startColumn,
      expectedHeaders: AI_PROMPT_LIBRARY_CONFIG.headers.slice()
    }
  };

  try {
    const sheet = getAIPromptLibrarySheet_();
    validateAIPromptLibraryHeaders_(sheet);

    const all = readAIPromptRows_(sheet);

    report.sheet = {
      actualSheetId: sheet.getSheetId(),
      configuredSheetId: AI_PROMPT_LIBRARY_CONFIG.sheetId,
      sheetIdMatchesConfiguredReference:
        sheet.getSheetId() === AI_PROMPT_LIBRARY_CONFIG.sheetId,
      lastRow: sheet.getLastRow(),
      lastColumn: sheet.getLastColumn(),
      promptCount: all.length,
      activeCount: countAIPromptStatus_(all, 'Active'),
      draftCount: countAIPromptStatus_(all, 'Draft'),
      inactiveCount: countAIPromptStatus_(all, 'Inactive'),
      retiredCount: countAIPromptStatus_(all, 'Retired'),
      categoryCount: buildAIPromptCategoryOptions_(all).length,
      promptTypeCount: buildAIPromptTypeOptions_(all).length,
      promptContentCount: all.filter(function (prompt) {
        return Boolean(String(prompt.prompt || '').trim());
      }).length,
      missingPromptContentCount: all.filter(function (prompt) {
        return !String(prompt.prompt || '').trim();
      }).length
    };

    try {
      const user = getAIPromptLibraryCurrentUser_();
      report.currentUser = {
        email: String(user.email || ''),
        name: String(user.name || ''),
        isAdmin: user.isAdmin === true
      };
    } catch (userError) {
      report.currentUserError = String(
        userError && userError.message || userError
      );
    }

    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = String(error && error.message || error);
  }

  console.log(
    '[AI PROMPT LIBRARY DIAG] ' +
    JSON.stringify(report, null, 2)
  );

  return report;
}


function getAIPromptLibrarySheet_() {
  const spreadsheet = SpreadsheetApp.openById(
    AI_PROMPT_LIBRARY_CONFIG.spreadsheetId
  );

  const sheet = spreadsheet.getSheetByName(
    AI_PROMPT_LIBRARY_CONFIG.sheetName
  );

  if (!sheet) {
    throw new Error(
      'AI Prompt Library sheet not found: ' +
      AI_PROMPT_LIBRARY_CONFIG.sheetName
    );
  }

  // The sheet name is authoritative. The gid is diagnostic-only because
  // recreating a Google Sheets tab can change its gid.
  return sheet;
}


function validateAIPromptLibraryHeaders_(sheet) {
  const expected = AI_PROMPT_LIBRARY_CONFIG.headers;

  const actual = sheet
    .getRange(
      AI_PROMPT_LIBRARY_CONFIG.headerRow,
      AI_PROMPT_LIBRARY_CONFIG.startColumn,
      1,
      expected.length
    )
    .getDisplayValues()[0]
    .map(function (value) {
      return String(value || '').trim();
    });

  const mismatches = [];

  expected.forEach(function (header, index) {
    if (actual[index] !== header) {
      mismatches.push(
        'Column ' +
        columnNumberToA1_(AI_PROMPT_LIBRARY_CONFIG.startColumn + index) +
        ': expected "' +
        header +
        '" but found "' +
        (actual[index] || '(blank)') +
        '"'
      );
    }
  });

  if (mismatches.length) {
    throw new Error(
      AI_PROMPT_LIBRARY_CONFIG.sheetName +
      ' header schema mismatch. ' +
      mismatches.join('; ')
    );
  }
}


function readAIPromptRows_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < AI_PROMPT_LIBRARY_CONFIG.dataStartRow) {
    return [];
  }

  const values = sheet
    .getRange(
      AI_PROMPT_LIBRARY_CONFIG.dataStartRow,
      AI_PROMPT_LIBRARY_CONFIG.startColumn,
      lastRow - AI_PROMPT_LIBRARY_CONFIG.dataStartRow + 1,
      AI_PROMPT_LIBRARY_CONFIG.headers.length
    )
    .getValues();

  const prompts = values
    .map(function (row, index) {
      return normalizeAIPromptRow_(
        row,
        index + AI_PROMPT_LIBRARY_CONFIG.dataStartRow
      );
    })
    .filter(function (prompt) {
      return Boolean(
        prompt.id ||
        prompt.promptName ||
        prompt.category ||
        prompt.promptType ||
        prompt.useCase ||
        prompt.prompt
      );
    });

  return prompts;
}


function normalizeAIPromptRow_(row, sheetRow) {
  const lastUpdated = row[8] instanceof Date
    ? row[8].toISOString()
    : String(row[8] || '').trim();

  return {
    id: cleanSheetText_(row[0]),
    promptName: cleanSheetText_(row[1]),
    category: cleanSheetText_(row[2]),
    promptType: cleanSheetText_(row[3]),
    useCase: cleanSheetText_(row[4]),
    prompt: cleanSheetText_(row[5]),
    status: normalizeAIPromptStatus_(row[6]),
    owner: cleanSheetText_(row[7]),
    lastUpdated: lastUpdated,
    sheetRow: sheetRow
  };
}


function compareAIPrompts_(a, b) {
  const byName = String(a.promptName || '').localeCompare(
    String(b.promptName || ''),
    undefined,
    { sensitivity: 'base' }
  );

  if (byName !== 0) return byName;

  return String(a.id || '').localeCompare(
    String(b.id || ''),
    undefined,
    { sensitivity: 'base' }
  );
}


function buildAIPromptCategories_(prompts) {
  const map = new Map();

  prompts.forEach(function (prompt) {
    const name = String(
      prompt.category || ''
    ).trim() || 'Uncategorized';

    const key = name.toLowerCase();
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        name: name,
        count: 1
      });
      return;
    }

    existing.count += 1;
  });

  return Array.from(map.values()).sort(function (a, b) {
    return String(a.name || '').localeCompare(
      String(b.name || ''),
      undefined,
      { sensitivity: 'base' }
    );
  });
}


function buildAIPromptCategoryOptions_(prompts) {
  const map = new Map();

  prompts.forEach(function (prompt) {
    const name = String(prompt.category || '').trim();
    if (!name) return;

    const key = name.toLowerCase();
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        name: name,
        promptCount: 1
      });
      return;
    }

    existing.promptCount += 1;
  });

  return Array.from(map.values()).sort(function (a, b) {
    return String(a.name || '').localeCompare(
      String(b.name || ''),
      undefined,
      { sensitivity: 'base' }
    );
  });
}


function buildAIPromptTypeOptions_(prompts) {
  const map = new Map();

  prompts.forEach(function (prompt) {
    const name = String(prompt.promptType || '').trim();
    if (!name) return;

    const key = name.toLowerCase();

    if (!map.has(key)) {
      map.set(key, {
        name: name,
        promptCount: 1
      });
      return;
    }

    map.get(key).promptCount += 1;
  });

  return Array.from(map.values()).sort(function (a, b) {
    return String(a.name || '').localeCompare(
      String(b.name || ''),
      undefined,
      { sensitivity: 'base' }
    );
  });
}


function validateAIPromptPayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Prompt details are required.');
  }


  const rawStatus = String(
    payload.status || ''
  ).trim();


  if (
    AI_PROMPT_LIBRARY_CONFIG.allowedStatuses.indexOf(rawStatus) === -1
  ) {
    throw new Error('Invalid prompt status.');
  }

  return {
    promptName: validateAIPromptText_(
      payload.promptName,
      'Prompt Name',
      AI_PROMPT_LIBRARY_CONFIG.maxLengths.promptName,
      true
    ),

    category: validateAIPromptText_(
      payload.category,
      'Category',
      AI_PROMPT_LIBRARY_CONFIG.maxLengths.category,
      true
    ),

    promptType: validateAIPromptText_(
      payload.promptType,
      'Prompt Type',
      AI_PROMPT_LIBRARY_CONFIG.maxLengths.promptType,
      true
    ),

    useCase: validateAIPromptText_(
      payload.useCase,
      'Use Case',
      AI_PROMPT_LIBRARY_CONFIG.maxLengths.useCase,
      true
    ),

    prompt: validateAIPromptText_(
      payload.prompt,
      'Prompt',
      AI_PROMPT_LIBRARY_CONFIG.maxLengths.prompt,
      true
    ),

    status: rawStatus
  };
}


function validateAIPromptText_(
  value,
  label,
  maxLength,
  required
) {
  const text = String(
    value == null ? '' : value
  ).trim();

  if (required && !text) {
    throw new Error(label + ' is required.');
  }

  if (text.length > maxLength) {
    throw new Error(
      label +
      ' exceeds the maximum length of ' +
      maxLength +
      ' characters.'
    );
  }

  return text;
}


function normalizeAIPromptStatus_(value) {
  const status = String(
    value || ''
  ).trim();

  return AI_PROMPT_LIBRARY_CONFIG.allowedStatuses.indexOf(status) !== -1
    ? status
    : 'Inactive';
}


function normalizeAIPromptViewMode_(options) {
  if (
    options &&
    typeof options === 'object' &&
    String(options.viewMode || '').toLowerCase() === 'user'
  ) {
    return 'user';
  }

  if (
    options &&
    typeof options === 'object' &&
    String(options.viewMode || '').toLowerCase() === 'admin'
  ) {
    return 'admin';
  }

  return 'auto';
}


function createNextGenAIPromptId_(prompts) {
  let maxId = 0;

  prompts.forEach(function (prompt) {
    const match = /^GP-(\d+)$/i.exec(
      String(prompt.id || '').trim()
    );

    if (!match) return;

    maxId = Math.max(
      maxId,
      Number(match[1]) || 0
    );
  });

  const next = maxId + 1;

  return 'GP-' + String(next).padStart(3, '0');
}


function assertAIPromptLibraryAdmin_() {
  const user = getAIPromptLibraryCurrentUser_();

  if (!user || user.isAdmin !== true) {
    throw new Error(
      'Administrator access is required to manage prompts.'
    );
  }

  return user;
}


function getAIPromptLibraryCurrentUser_() {
  if (typeof getNexusCurrentUser !== 'function') {
    throw new Error(
      'Nexus admin authorization is unavailable because ' +
      'getNexusCurrentUser() was not found.'
    );
  }

  return getNexusCurrentUser();
}


function getAIPromptOwnerLabel_(actor) {
  return String(
    actor && (
      actor.email ||
      actor.name
    ) ||
    'Nexus Admin'
  ).trim();
}


function safeSheetText_(value) {
  const text = String(
    value == null ? '' : value
  );

  return /^[=+\-@]/.test(text)
    ? "'" + text
    : text;
}


function cleanSheetText_(value) {
  const text = String(
    value == null ? '' : value
  ).trim();

  return /^'[=+\-@]/.test(text)
    ? text.slice(1)
    : text;
}


function countAIPromptStatus_(prompts, status) {
  return prompts.filter(function (prompt) {
    return prompt.status === status;
  }).length;
}


function columnNumberToA1_(columnNumber) {
  let number = Number(columnNumber) || 0;
  let result = '';

  while (number > 0) {
    number -= 1;
    result =
      String.fromCharCode(65 + (number % 26)) +
      result;
    number = Math.floor(number / 26);
  }

  return result || '?';
}


/**
 * Browser-facing read smoke test.
 * Real admins receive the full registry; non-admins receive Active prompts.
 */
function testAIPromptLibraryRead() {
  const result = getAIPromptLibrary();

  console.log(
    '[AI PROMPT LIBRARY READ TEST] ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}
