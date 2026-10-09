/**
 * Novare Nexus — AI Prompt Library backend
 *
 * Data source:
 * Spreadsheet: 1lJetYhn8loCBmcMtiZZSVCH1OLMOIGBq8GGWoWH20Gw
 * Sheet: AI_Prompt_Library (gid is diagnostic-only)
 *
 * Current sheet contract:
 * Prompt ID | Icon | Category | Category Sort Order |
 * Prompt Title | Short Description | Prompt |
 * Featured | Prompt Sort Order | Status | Owner | Last Updated
 *
 * Public functions:
 * - getAIPromptLibrary()
 * - addAIPrompt(payload)
 * - runAIPromptLibraryDiagnostics()
 * - testAIPromptLibraryRead()
 */

const AI_PROMPT_LIBRARY_CONFIG = Object.freeze({
  spreadsheetId: '1lJetYhn8loCBmcMtiZZSVCH1OLMOIGBq8GGWoWH20Gw',
  sheetName: 'AI_Prompt_Library',
  sheetId: 1945694212, // diagnostic reference only; sheetName is authoritative

  headers: Object.freeze([
    'Prompt ID',
    'Icon',
    'Category',
    'Category Sort Order',
    'Prompt Title',
    'Short Description',
    'Prompt',
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

  allowedStatuses: Object.freeze([
    'Active',
    'Draft',
    'Inactive'
  ]),

  maxLengths: Object.freeze({
    category: 120,
    promptTitle: 180,
    shortDescription: 500,
    prompt: 12000
  })
});


/**
 * Returns Active prompts for standard Nexus users.
 *
 * categoryOptions is built from ALL rows (including Draft/Inactive) so an admin
 * can reuse an existing category without accidentally creating a duplicate.
 * Only Active prompt records are returned in prompts/categories.
 */
function getAIPromptLibrary() {
  const sheet = getAIPromptLibrarySheet_();
  validateAIPromptLibraryHeaders_(sheet);

  const allPrompts = readAIPromptRows_(sheet);

  const prompts = allPrompts
    .filter(function (prompt) {
      return prompt.status === 'Active';
    })
    .sort(compareAIPrompts_);

  return {
    ok: true,
    prompts: prompts,
    categories: buildAIPromptCategories_(prompts),
    categoryOptions: buildAIPromptCategoryOptions_(allPrompts),
    total: prompts.length,
    fetchedAt: new Date().toISOString()
  };
}


/**
 * Appends one prompt.
 *
 * Security:
 * - The real Google Workspace account must be a Nexus admin.
 * - View-As-User is frontend-only and does not weaken server authorization.
 *
 * Featured behavior:
 * - Icon is required.
 * - Any prompt added through Nexus is automatically saved as Featured = TRUE.
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

    const existingIds = new Set(
      existingPrompts
        .map(function (prompt) { return prompt.id; })
        .filter(Boolean)
    );

    const promptId = createAIPromptId_(existingIds);
    const now = new Date();
    const owner = String(
      actor.email || actor.name || 'Nexus Admin'
    ).trim();

    /*
     * Classification is intentionally simple for admins.
     * Nexus calculates ordering automatically:
     *
     * Existing category:
     * - preserve its Category Sort Order
     * - append prompt to the end of that category
     *
     * New category:
     * - assign the next Category Sort Order
     * - start Prompt Sort Order at 1
     */
    const ordering = resolveAIPromptOrdering_(
      existingPrompts,
      normalized.category
    );

    const featured = true;

    const row = [
      promptId,                                  // A Prompt ID
      safeSheetText_(normalized.icon),           // B Icon
      safeSheetText_(ordering.category),         // C Category
      ordering.categorySortOrder,                // D Category Sort Order
      safeSheetText_(normalized.promptTitle),    // E Prompt Title
      safeSheetText_(normalized.shortDescription), // F Short Description
      safeSheetText_(normalized.prompt),         // G Prompt
      featured,                                  // H Featured
      ordering.promptSortOrder,                  // I Prompt Sort Order
      normalized.status,                         // J Status
      safeSheetText_(owner),                     // K Owner
      now                                        // L Last Updated
    ];

    const nextRow = Math.max(sheet.getLastRow() + 1, 2);

    sheet
      .getRange(
        nextRow,
        1,
        1,
        AI_PROMPT_LIBRARY_CONFIG.headers.length
      )
      .setValues([row]);

    SpreadsheetApp.flush();

    const saved = normalizeAIPromptRow_(row, nextRow);

    return {
      ok: true,
      prompt: saved,
      visibleInLibrary: saved.status === 'Active',
      ordering: {
        categorySortOrder: ordering.categorySortOrder,
        promptSortOrder: ordering.promptSortOrder,
        categoryWasNew: ordering.categoryWasNew
      },
      message: saved.status === 'Active'
        ? 'Prompt added successfully.'
        : 'Prompt saved successfully as ' + saved.status + '.'
    };
  } finally {
    lock.releaseLock();
  }
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
      activeCount: all.filter(function (item) {
        return item.status === 'Active';
      }).length,
      draftCount: all.filter(function (item) {
        return item.status === 'Draft';
      }).length,
      inactiveCount: all.filter(function (item) {
        return item.status === 'Inactive';
      }).length,
      categoryCount: buildAIPromptCategoryOptions_(all).length
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

  /*
   * IMPORTANT:
   * Sheet name is the authoritative locator.
   *
   * A Google Sheet tab receives a new gid whenever the tab is recreated or
   * re-imported, even when the tab name stays the same. Therefore, do not
   * block the app when the gid changes.
   *
   * AI_PROMPT_LIBRARY_CONFIG.sheetId is retained only as a diagnostic
   * reference so runAIPromptLibraryDiagnostics() can report the current tab.
   */
  return sheet;
}


function validateAIPromptLibraryHeaders_(sheet) {
  const expected = AI_PROMPT_LIBRARY_CONFIG.headers;

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
        '" but found "' +
        (actual[index] || '(blank)') +
        '"'
      );
    }
  });

  if (mismatches.length) {
    throw new Error(
      'AI_Prompt_Library header schema mismatch. ' +
      mismatches.join('; ')
    );
  }
}


function readAIPromptRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet
    .getRange(
      2,
      1,
      lastRow - 1,
      AI_PROMPT_LIBRARY_CONFIG.headers.length
    )
    .getValues();

  return values
    .map(function (row, index) {
      return normalizeAIPromptRow_(row, index + 2);
    })
    .filter(function (prompt) {
      return Boolean(
        prompt.id ||
        prompt.promptTitle ||
        prompt.prompt ||
        prompt.category
      );
    });
}


function normalizeAIPromptRow_(row, sheetRow) {
  const lastUpdated = row[11] instanceof Date
    ? row[11].toISOString()
    : String(row[11] || '').trim();

  return {
    id: cleanSheetText_(row[0]),
    icon: normalizeAIPromptIcon_(row[1]),
    category: cleanSheetText_(row[2]),
    categorySortOrder: toAIPromptNumber_(row[3], 0),
    promptTitle: cleanSheetText_(row[4]),
    shortDescription: cleanSheetText_(row[5]),
    prompt: cleanSheetText_(row[6]),
    featured: toAIPromptBoolean_(row[7]),
    promptSortOrder: toAIPromptNumber_(row[8], 0),
    status: normalizeAIPromptStatus_(row[9]),
    owner: cleanSheetText_(row[10]),
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


/**
 * Active category filters used by the public library.
 */
function buildAIPromptCategories_(prompts) {
  const map = new Map();

  prompts.forEach(function (prompt) {
    const name = String(
      prompt.category || ''
    ).trim() || 'Uncategorized';

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
    existing.sortOrder = Math.min(
      existing.sortOrder,
      prompt.categorySortOrder
    );
  });

  return Array.from(map.values()).sort(compareAIPromptCategories_);
}


/**
 * Admin dropdown categories built from ALL prompt rows.
 * Includes maxPromptSort so the Add form can suggest the next order.
 */
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
        sortOrder: Number(prompt.categorySortOrder) || 0,
        promptCount: 1,
        maxPromptSort: Number(prompt.promptSortOrder) || 0
      });
      return;
    }

    existing.promptCount += 1;
    existing.sortOrder = Math.min(
      existing.sortOrder,
      Number(prompt.categorySortOrder) || 0
    );
    existing.maxPromptSort = Math.max(
      existing.maxPromptSort,
      Number(prompt.promptSortOrder) || 0
    );
  });

  return Array.from(map.values()).sort(compareAIPromptCategories_);
}


function compareAIPromptCategories_(a, b) {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  return String(a.name || '').localeCompare(
    String(b.name || ''),
    undefined,
    { sensitivity: 'base' }
  );
}



function resolveAIPromptOrdering_(prompts, requestedCategory) {
  const requested = String(requestedCategory || '').trim();
  const requestedKey = requested.toLowerCase();

  const sameCategory = prompts.filter(function (prompt) {
    return String(prompt.category || '').trim().toLowerCase() === requestedKey;
  });

  if (sameCategory.length) {
    const canonicalCategory = String(
      sameCategory[0].category || requested
    ).trim();

    const categorySortOrder = sameCategory.reduce(
      function (best, prompt) {
        const value = Number(prompt.categorySortOrder) || 0;

        if (best === null) return value;
        return Math.min(best, value);
      },
      null
    );

    const maxPromptSort = sameCategory.reduce(
      function (max, prompt) {
        return Math.max(
          max,
          Number(prompt.promptSortOrder) || 0
        );
      },
      0
    );

    return {
      category: canonicalCategory,
      categorySortOrder: categorySortOrder === null
        ? 0
        : categorySortOrder,
      promptSortOrder: maxPromptSort + 1,
      categoryWasNew: false
    };
  }

  const maxCategorySort = prompts.reduce(
    function (max, prompt) {
      return Math.max(
        max,
        Number(prompt.categorySortOrder) || 0
      );
    },
    0
  );

  return {
    category: requested,
    categorySortOrder: maxCategorySort + 1,
    promptSortOrder: 1,
    categoryWasNew: true
  };
}


function validateAIPromptPayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Prompt details are required.');
  }

  const rawIcon = String(
    payload.icon || ''
  ).trim().toLowerCase();

  const rawStatus = String(
    payload.status || ''
  ).trim();

  if (
    AI_PROMPT_LIBRARY_CONFIG.allowedIcons.indexOf(rawIcon) === -1
  ) {
    throw new Error('Invalid prompt icon.');
  }

  if (
    AI_PROMPT_LIBRARY_CONFIG.allowedStatuses.indexOf(rawStatus) === -1
  ) {
    throw new Error('Invalid prompt status.');
  }

  return {
    icon: rawIcon,

    category: validateAIPromptText_(
      payload.category,
      'Category',
      AI_PROMPT_LIBRARY_CONFIG.maxLengths.category,
      true
    ),

    promptTitle: validateAIPromptText_(
      payload.promptTitle,
      'Prompt Title',
      AI_PROMPT_LIBRARY_CONFIG.maxLengths.promptTitle,
      true
    ),

    shortDescription: validateAIPromptText_(
      payload.shortDescription,
      'Short Description',
      AI_PROMPT_LIBRARY_CONFIG.maxLengths.shortDescription,
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


function validateAIPromptSortOrder_(value, label) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(
      label + ' must be a non-negative number.'
    );
  }

  return Math.floor(number);
}


function normalizeAIPromptIcon_(value) {
  const icon = String(
    value || ''
  ).trim().toLowerCase();

  return AI_PROMPT_LIBRARY_CONFIG.allowedIcons.indexOf(icon) !== -1
    ? icon
    : 'sparkles';
}


function normalizeAIPromptStatus_(value) {
  const status = String(
    value || ''
  ).trim();

  return AI_PROMPT_LIBRARY_CONFIG.allowedStatuses.indexOf(status) !== -1
    ? status
    : 'Inactive';
}


function toAIPromptBoolean_(value) {
  if (value === true || value === 1) return true;

  const normalized = String(
    value || ''
  ).trim().toLowerCase();

  return (
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === '1'
  );
}


function toAIPromptNumber_(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : fallback;
}


function createAIPromptId_(existingIds) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = (
      'PRM-' +
      Utilities
        .getUuid()
        .replace(/-/g, '')
        .slice(0, 8)
        .toUpperCase()
    );

    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Unable to generate a unique Prompt ID. Please try again.'
  );
}


function assertAIPromptLibraryAdmin_() {
  const user = getAIPromptLibraryCurrentUser_();

  if (!user || user.isAdmin !== true) {
    throw new Error(
      'Administrator access is required to add prompts.'
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

  // Reuse the existing live Nexus identity/admin resolver.
  // No authorization cache is introduced here.
  return getNexusCurrentUser();
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


/**
 * Minimal browser-facing read smoke test.
 */
function testAIPromptLibraryRead() {
  const result = getAIPromptLibrary();

  console.log(
    '[AI PROMPT LIBRARY READ TEST] ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}
