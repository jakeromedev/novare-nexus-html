/**
 * Novare Nexus — AI Prompt Library backend
 *
 * Data source:
 * Spreadsheet: 1lJetYhn8loCBmcMtiZZSVCH1OLMOIGBq8GGWoWH20Gw
 * Sheet: AI_Prompt_Library (gid 815558942)
 *
 * Public functions:
 * - getAIPromptLibrary()
 * - addAIPrompt(payload)
 * - runAIPromptLibraryDiagnostics()
 */

const AI_PROMPT_LIBRARY_CONFIG = Object.freeze({
  spreadsheetId: '1lJetYhn8loCBmcMtiZZSVCH1OLMOIGBq8GGWoWH20Gw',
  sheetName: 'AI_Prompt_Library',
  sheetId: 815558942,
  headers: Object.freeze([
    'Prompt ID',
    'Icon',
    'Category',
    'Category Sort Order',
    'Prompt Title',
    'Short Description',
    'Prompt',
    'Use Case',
    'Tags',
    'Audience',
    'Variables',
    'Output Format',
    'Featured',
    'Prompt Sort Order',
    'Status',
    'Owner',
    'Last Updated'
  ]),
  allowedIcons: Object.freeze([
    'sparkles',
    'search',
    'document',
    'chat',
    'lightbulb',
    'layers',
    'code',
    'target',
    'rocket',
    'checklist',
    'tools',
    'shield'
  ]),
  allowedStatuses: Object.freeze(['Active', 'Draft', 'Inactive']),
  maxLengths: Object.freeze({
    category: 120,
    promptTitle: 180,
    shortDescription: 500,
    prompt: 12000,
    useCase: 180,
    tags: 600,
    audience: 180,
    variables: 1200,
    outputFormat: 600
  })
});

/**
 * Returns Active prompts for the standard Nexus user experience.
 */
function getAIPromptLibrary() {
  const sheet = getAIPromptLibrarySheet_();
  validateAIPromptLibraryHeaders_(sheet);

  const prompts = readAIPromptRows_(sheet)
    .filter(function (prompt) {
      return prompt.status === 'Active';
    })
    .sort(compareAIPrompts_);

  return {
    ok: true,
    prompts: prompts,
    categories: buildAIPromptCategories_(prompts),
    total: prompts.length,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Appends one prompt. The real Google Workspace account must be a Nexus admin.
 * View-As-User is intentionally ignored by the backend because it is only a
 * frontend preview state.
 */
function addAIPrompt(payload) {
  const actor = assertAIPromptLibraryAdmin_();
  const normalized = validateAIPromptPayload_(payload);
  const lock = LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    const sheet = getAIPromptLibrarySheet_();
    validateAIPromptLibraryHeaders_(sheet);

    const existingIds = new Set(
      readAIPromptRows_(sheet).map(function (prompt) {
        return prompt.id;
      }).filter(Boolean)
    );

    const promptId = createAIPromptId_(existingIds);
    const now = new Date();
    const owner = String(actor.email || actor.name || 'Nexus Admin').trim();

    const row = [
      promptId,
      safeSheetText_(normalized.icon),
      safeSheetText_(normalized.category),
      normalized.categorySortOrder,
      safeSheetText_(normalized.promptTitle),
      safeSheetText_(normalized.shortDescription),
      safeSheetText_(normalized.prompt),
      safeSheetText_(normalized.useCase),
      safeSheetText_(normalized.tags),
      safeSheetText_(normalized.audience),
      safeSheetText_(normalized.variables),
      safeSheetText_(normalized.outputFormat),
      normalized.featured,
      normalized.promptSortOrder,
      normalized.status,
      safeSheetText_(owner),
      now
    ];

    const nextRow = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(nextRow, 1, 1, AI_PROMPT_LIBRARY_CONFIG.headers.length)
      .setValues([row]);

    SpreadsheetApp.flush();

    const saved = normalizeAIPromptRow_(row, nextRow);

    return {
      ok: true,
      prompt: saved,
      visibleInLibrary: saved.status === 'Active',
      message: saved.status === 'Active'
        ? 'Prompt added successfully.'
        : 'Prompt saved successfully as ' + saved.status + '.'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Manual Apps Script diagnostic. Run from the editor when validating setup.
 */
function runAIPromptLibraryDiagnostics() {
  const report = {
    startedAt: new Date().toISOString(),
    config: {
      spreadsheetId: AI_PROMPT_LIBRARY_CONFIG.spreadsheetId,
      sheetName: AI_PROMPT_LIBRARY_CONFIG.sheetName,
      sheetId: AI_PROMPT_LIBRARY_CONFIG.sheetId,
      expectedHeaders: AI_PROMPT_LIBRARY_CONFIG.headers.slice()
    }
  };

  try {
    const sheet = getAIPromptLibrarySheet_();
    validateAIPromptLibraryHeaders_(sheet);
    const all = readAIPromptRows_(sheet);

    report.sheet = {
      actualSheetId: sheet.getSheetId(),
      lastRow: sheet.getLastRow(),
      lastColumn: sheet.getLastColumn(),
      promptCount: all.length,
      activeCount: all.filter(function (item) { return item.status === 'Active'; }).length,
      draftCount: all.filter(function (item) { return item.status === 'Draft'; }).length,
      inactiveCount: all.filter(function (item) { return item.status === 'Inactive'; }).length
    };

    try {
      const user = getAIPromptLibraryCurrentUser_();
      report.currentUser = {
        email: String(user.email || ''),
        name: String(user.name || ''),
        isAdmin: user.isAdmin === true
      };
    } catch (userError) {
      report.currentUserError = String(userError && userError.message || userError);
    }

    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = String(error && error.message || error);
  }

  console.log('[AI PROMPT LIBRARY DIAG] ' + JSON.stringify(report, null, 2));
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

  if (sheet.getSheetId() !== AI_PROMPT_LIBRARY_CONFIG.sheetId) {
    throw new Error(
      'AI Prompt Library sheet ID mismatch. Expected gid ' +
      AI_PROMPT_LIBRARY_CONFIG.sheetId +
      ' but found ' + sheet.getSheetId() + '.'
    );
  }

  return sheet;
}

function validateAIPromptLibraryHeaders_(sheet) {
  const expected = AI_PROMPT_LIBRARY_CONFIG.headers;
  const actual = sheet
    .getRange(1, 1, 1, expected.length)
    .getDisplayValues()[0]
    .map(function (value) { return String(value || '').trim(); });

  const mismatches = [];

  expected.forEach(function (header, index) {
    if (actual[index] !== header) {
      mismatches.push(
        'Column ' + (index + 1) + ': expected "' + header +
        '" but found "' + (actual[index] || '(blank)') + '"'
      );
    }
  });

  if (mismatches.length) {
    throw new Error(
      'AI_Prompt_Library header schema mismatch. ' + mismatches.join('; ')
    );
  }
}

function readAIPromptRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet
    .getRange(2, 1, lastRow - 1, AI_PROMPT_LIBRARY_CONFIG.headers.length)
    .getValues();

  return values
    .map(function (row, index) {
      return normalizeAIPromptRow_(row, index + 2);
    })
    .filter(function (prompt) {
      return Boolean(
        prompt.id || prompt.promptTitle || prompt.prompt || prompt.category
      );
    });
}

function normalizeAIPromptRow_(row, sheetRow) {
  const lastUpdated = row[16] instanceof Date
    ? row[16].toISOString()
    : String(row[16] || '').trim();

  return {
    id: cleanSheetText_(row[0]),
    icon: normalizeAIPromptIcon_(row[1]),
    category: cleanSheetText_(row[2]),
    categorySortOrder: toAIPromptNumber_(row[3], 0),
    promptTitle: cleanSheetText_(row[4]),
    shortDescription: cleanSheetText_(row[5]),
    prompt: cleanSheetText_(row[6]),
    useCase: cleanSheetText_(row[7]),
    tags: cleanSheetText_(row[8]),
    audience: cleanSheetText_(row[9]),
    variables: cleanSheetText_(row[10]),
    outputFormat: cleanSheetText_(row[11]),
    featured: toAIPromptBoolean_(row[12]),
    promptSortOrder: toAIPromptNumber_(row[13], 0),
    status: normalizeAIPromptStatus_(row[14]),
    owner: cleanSheetText_(row[15]),
    lastUpdated: lastUpdated,
    sheetRow: sheetRow
  };
}

function compareAIPrompts_(a, b) {
  if (a.categorySortOrder !== b.categorySortOrder) {
    return a.categorySortOrder - b.categorySortOrder;
  }

  if (a.promptSortOrder !== b.promptSortOrder) {
    return a.promptSortOrder - b.promptSortOrder;
  }

  return String(a.promptTitle || '').localeCompare(
    String(b.promptTitle || ''),
    undefined,
    { sensitivity: 'base' }
  );
}

function buildAIPromptCategories_(prompts) {
  const map = new Map();

  prompts.forEach(function (prompt) {
    const name = String(prompt.category || '').trim() || 'Uncategorized';
    const existing = map.get(name);

    if (!existing) {
      map.set(name, {
        name: name,
        sortOrder: prompt.categorySortOrder,
        count: 1
      });
      return;
    }

    existing.count += 1;
    existing.sortOrder = Math.min(existing.sortOrder, prompt.categorySortOrder);
  });

  return Array.from(map.values()).sort(function (a, b) {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function validateAIPromptPayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Prompt details are required.');
  }

  const rawIcon = String(payload.icon || '').trim().toLowerCase();
  const rawStatus = String(payload.status || '').trim();

  if (AI_PROMPT_LIBRARY_CONFIG.allowedIcons.indexOf(rawIcon) === -1) {
    throw new Error('Invalid prompt icon.');
  }

  if (AI_PROMPT_LIBRARY_CONFIG.allowedStatuses.indexOf(rawStatus) === -1) {
    throw new Error('Invalid prompt status.');
  }

  const result = {
    icon: rawIcon,
    category: validateAIPromptText_(payload.category, 'Category', AI_PROMPT_LIBRARY_CONFIG.maxLengths.category, true),
    categorySortOrder: validateAIPromptSortOrder_(payload.categorySortOrder, 'Category Sort Order'),
    promptTitle: validateAIPromptText_(payload.promptTitle, 'Prompt Title', AI_PROMPT_LIBRARY_CONFIG.maxLengths.promptTitle, true),
    shortDescription: validateAIPromptText_(payload.shortDescription, 'Short Description', AI_PROMPT_LIBRARY_CONFIG.maxLengths.shortDescription, true),
    prompt: validateAIPromptText_(payload.prompt, 'Prompt', AI_PROMPT_LIBRARY_CONFIG.maxLengths.prompt, true),
    useCase: validateAIPromptText_(payload.useCase, 'Use Case', AI_PROMPT_LIBRARY_CONFIG.maxLengths.useCase, true),
    tags: validateAIPromptText_(payload.tags, 'Tags', AI_PROMPT_LIBRARY_CONFIG.maxLengths.tags, false),
    audience: validateAIPromptText_(payload.audience, 'Audience', AI_PROMPT_LIBRARY_CONFIG.maxLengths.audience, true),
    variables: validateAIPromptText_(payload.variables, 'Variables', AI_PROMPT_LIBRARY_CONFIG.maxLengths.variables, false),
    outputFormat: validateAIPromptText_(payload.outputFormat, 'Output Format', AI_PROMPT_LIBRARY_CONFIG.maxLengths.outputFormat, false),
    featured: toAIPromptBoolean_(payload.featured),
    promptSortOrder: validateAIPromptSortOrder_(payload.promptSortOrder, 'Prompt Sort Order'),
    status: rawStatus
  };

  return result;
}

function validateAIPromptText_(value, label, maxLength, required) {
  const text = String(value == null ? '' : value).trim();

  if (required && !text) {
    throw new Error(label + ' is required.');
  }

  if (text.length > maxLength) {
    throw new Error(label + ' exceeds the maximum length of ' + maxLength + ' characters.');
  }

  return text;
}

function validateAIPromptSortOrder_(value, label) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(label + ' must be a non-negative number.');
  }

  return Math.floor(number);
}

function normalizeAIPromptIcon_(value) {
  const icon = String(value || '').trim().toLowerCase();
  return AI_PROMPT_LIBRARY_CONFIG.allowedIcons.indexOf(icon) !== -1
    ? icon
    : 'sparkles';
}

function normalizeAIPromptStatus_(value) {
  const status = String(value || '').trim();
  return AI_PROMPT_LIBRARY_CONFIG.allowedStatuses.indexOf(status) !== -1
    ? status
    : 'Inactive';
}

function toAIPromptBoolean_(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

function toAIPromptNumber_(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createAIPromptId_(existingIds) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = 'PRM-' + Utilities.getUuid()
      .replace(/-/g, '')
      .slice(0, 8)
      .toUpperCase();

    if (!existingIds.has(candidate)) return candidate;
  }

  throw new Error('Unable to generate a unique Prompt ID. Please try again.');
}

function assertAIPromptLibraryAdmin_() {
  const user = getAIPromptLibraryCurrentUser_();

  if (!user || user.isAdmin !== true) {
    throw new Error('Administrator access is required to add prompts.');
  }

  return user;
}

function getAIPromptLibraryCurrentUser_() {
  if (typeof getNexusCurrentUser !== 'function') {
    throw new Error(
      'Nexus admin authorization is unavailable because getNexusCurrentUser() was not found.'
    );
  }

  // Intentionally call the existing live Nexus identity/admin resolver.
  // Do not cache this authorization result here.
  return getNexusCurrentUser();
}

function safeSheetText_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function cleanSheetText_(value) {
  const text = String(value == null ? '' : value).trim();
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}
