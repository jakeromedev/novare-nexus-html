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

  communityHeaders: Object.freeze([
    'Created By Email', 'Created At', 'Upvote Count',
    'Copy Count', 'Comment Count'
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
  const identity = getNexusPromptCommunityIdentity_();
  const requestedMode = normalizeAIPromptViewMode_(options);
  const adminView = actor.isAdmin === true && requestedMode !== 'user';
  const sheet = getAIPromptLibrarySheet_();
  validateAIPromptLibraryHeaders_(sheet);
  validateNexusPromptCommunitySchema_(sheet);

  const allPrompts = readAIPromptRows_(sheet).sort(compareAIPrompts_);
  const prompts = adminView
    ? allPrompts.slice()
    : allPrompts.filter(function (prompt) {
        return prompt.status === 'Active';
      });
  const myPrompts = identity.verified
    ? allPrompts.filter(function (prompt) {
        return prompt.createdByEmail === identity.email;
      })
    : [];
  const optionSource = adminView ? allPrompts : prompts;
  const myVotes = identity.verified
    ? getNexusPromptCommunityVotedIds_(identity.email)
    : {};

  // Only an employee's OWN creator email may appear in their feed response.
  // Do not expose everyone else's email or sheet row number to the browser.
  const publicPrompts = prompts.map(function (original) {
    const item = Object.assign({}, original);
    if (!identity.verified || item.createdByEmail !== identity.email) {
      item.createdByEmail = '';
    }
    delete item.sheetRow;
    return item;
  });
  const publicMyPrompts = myPrompts.map(function (original) {
    const item = Object.assign({}, original);
    delete item.sheetRow;
    return item;
  });

  // Return only per-user vote/bookmark state; never expose other users' emails.
  const phase2 = getNexusPromptPhase2State_(identity, allPrompts);
  const bookmarked = {};
  (phase2.bookmarkedIds || []).forEach(function(id) { bookmarked[id] = true; });
  [publicPrompts, publicMyPrompts].forEach(function (items) {
    items.forEach(function (prompt) {
      prompt.upvotedByMe = myVotes[prompt.id] === true;
      prompt.bookmarkedByMe = bookmarked[prompt.id] === true;
      if (!adminView) prompt.verifiedBy = '';
    });
  });

  return {
    ok: true,
    adminView: adminView,
    identityVerified: identity.verified,
    communityWritesEnabled: isNexusPromptCommunityEnabled_(),
    phase2Installed: phase2.installed === true,
    currentUserEmail: identity.verified ? identity.email : '',
    prompts: publicPrompts,
    myPrompts: publicMyPrompts,
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
  const actor = assertNexusPromptCommunityActor_();
  const normalized = validateAIPromptPayload_(payload);
  if (normalized.status !== 'Active' && normalized.status !== 'Draft' && !actor.isAdmin) {
    throw new Error('Employees may publish or save Draft prompts only.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getAIPromptLibrarySheet_();
    validateAIPromptLibraryHeaders_(sheet);
    validateNexusPromptCommunitySchema_(sheet);
    const existing = readAIPromptRows_(sheet);
    const id = createNextGenAIPromptId_(existing);
    // New creations have no prior revision to backfill. Version 1 is saved after writing.
    const now = new Date();
    const row = [
      id, safeSheetText_(normalized.promptName),
      safeSheetText_(normalized.category),
      safeSheetText_(normalized.promptType),
      safeSheetText_(normalized.useCase),
      safeSheetText_(normalized.prompt),
      normalized.status,
      safeSheetText_(getAIPromptOwnerLabel_(actor)),
      now,
      safeSheetText_(actor.email),
      now,
      0, 0, 0
    ];
    if (isNexusPromptPhase2Installed_()) {
      row.push(false, '', '', '', 0);
    }
    const nextRow = Math.max(sheet.getLastRow() + 1, AI_PROMPT_LIBRARY_CONFIG.dataStartRow);
    sheet.getRange(nextRow, AI_PROMPT_LIBRARY_CONFIG.startColumn, 1, row.length).setValues([row]);
    if (isNexusPromptPhase2Installed_()) {
      recordNexusPromptVersion_({sheet: sheet, prompt: normalizeAIPromptRow_(row, nextRow)}, 'Created', actor.email);
    }
    SpreadsheetApp.flush();
    return {
      ok: true,
      prompt: normalizeAIPromptRow_(sheet.getRange(nextRow, 2, 1, 19).getValues()[0], nextRow),
      visibleToUsers: normalized.status === 'Active',
      message: normalized.status === 'Active' ? 'Prompt published.' : 'Draft saved.'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates one prompt by stable Prompt ID.
 */
function updateAIPrompt(promptId, payload) {
  const actor = assertNexusPromptCommunityActor_();
  const normalized = validateAIPromptPayload_(payload);
  const id = String(promptId || '').trim();
  if (!id) throw new Error('Prompt ID is required.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getAIPromptLibrarySheet_();
    validateAIPromptLibraryHeaders_(sheet);
    validateNexusPromptCommunitySchema_(sheet);
    const current = readAIPromptRows_(sheet).find(function (item) { return item.id === id; });
    if (!current) throw new Error('Prompt not found.');
    const isAuthor = current.createdByEmail && current.createdByEmail === actor.email;
    if (!actor.isAdmin && !isAuthor) throw new Error('Only the author may edit this prompt.');
    if (!actor.isAdmin) {
      if (['Active', 'Draft'].indexOf(normalized.status) < 0) {
        throw new Error('Employees can only publish or save a draft.');
      }
      if (['Inactive', 'Retired'].indexOf(current.status) >= 0) {
        throw new Error('This prompt is locked by an administrator.');
      }
    }
    if (isNexusPromptPhase2Installed_()) {
      ensureNexusPromptVersionBaseline_({sheet: sheet, prompt: current});
    }
    const now = new Date();
    const row = [
      id, safeSheetText_(normalized.promptName),
      safeSheetText_(normalized.category),
      safeSheetText_(normalized.promptType),
      safeSheetText_(normalized.useCase),
      safeSheetText_(normalized.prompt),
      normalized.status,
      safeSheetText_(current.owner), // immutable original author label
      now,
      safeSheetText_(current.createdByEmail), // immutable canonical author
      current.createdAt ? new Date(current.createdAt) : '',
      current.upvoteCount, current.copyCount, current.commentCount
    ];
    if (isNexusPromptPhase2Installed_()) {
      row.push(false, '', '', current.forkedFrom || '', current.currentRevision || 0);
    }
    sheet.getRange(current.sheetRow, AI_PROMPT_LIBRARY_CONFIG.startColumn, 1, row.length).setValues([row]);
    if (isNexusPromptPhase2Installed_()) {
      appendNexusPromptVersionAfterChange_(id, 'Edited', actor.email);
    }
    SpreadsheetApp.flush();
    return {ok: true, prompt: normalizeAIPromptRow_(sheet.getRange(current.sheetRow, 2, 1, 19).getValues()[0], current.sheetRow),
      visibleToUsers: normalized.status === 'Active', message: 'Prompt updated.'};
  } finally {
    lock.releaseLock();
  }
}

/**
 * Permanently deletes one registry row by stable Prompt ID.
 */
function deleteAIPrompt(promptId) {
  const actor = assertNexusPromptCommunityActor_();
  if (!actor.isAdmin) throw new Error('Only administrators may permanently delete prompts.');

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

    removeNexusPromptCommunityRelations_(id);
    removeNexusPromptPhase2Relations_(id);
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
  throw new Error(
    'Deprecated for community ownership safety. This historical utility overwrote ' +
    'Owner on every row. Do not run it after the collaborative migration.'
  );
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

    report.community = getNexusPromptCommunitySchemaStatus_();
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
      AI_PROMPT_LIBRARY_CONFIG.headers.length + AI_PROMPT_LIBRARY_CONFIG.communityHeaders.length + 5
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
    ? row[8].toISOString() : String(row[8] || '').trim();
  const createdAt = row[10] instanceof Date
    ? row[10].toISOString() : String(row[10] || '').trim();
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
    createdByEmail: String(row[9] || '').trim().toLowerCase(),
    createdAt: createdAt,
    upvoteCount: Math.max(0, Number(row[11]) || 0),
    copyCount: Math.max(0, Number(row[12]) || 0),
    commentCount: Math.max(0, Number(row[13]) || 0),
    verified: row[14] === true || String(row[14]).toUpperCase() === 'TRUE',
    verifiedBy: String(row[15] || '').trim(),
    verifiedAt: row[16] instanceof Date ? row[16].toISOString() : String(row[16] || ''),
    forkedFrom: cleanSheetText_(row[17]),
    currentRevision: Math.max(0, Number(row[18]) || 0),
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
      actor.name ||
      actor.email
    ) ||
    'Nexus Contributor'
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


/**
 * Phase 1 Prompt Hub detail endpoint. Resolves the ID on every view and
 * never returns Draft, Inactive, Retired or another user's private metadata.
 * The URL fragment is untrusted; this validation must remain server-side.
 */
function getNexusPublishedPromptDetail(promptId) {
  const id = String(promptId || '').trim();
  if (!/^GP-[0-9]+$/i.test(id)) return {ok:false};
  const actor = getAIPromptLibraryCurrentUser_();
  const identity = getNexusPromptCommunityIdentity_();
  let item;
  try { item = getNexusPromptById_(id); }
  catch (error) {
    if (/does not exist/i.test(String(error && error.message || ''))) return {ok:false};
    throw error;
  }
  if (!item || item.prompt.status !== 'Active') return {ok:false};
  const prompt = Object.assign({}, item.prompt);
  delete prompt.sheetRow;
  if (!identity.verified || prompt.createdByEmail !== identity.email) {
    prompt.createdByEmail = '';
  }
  if (!actor.isAdmin) prompt.verifiedBy = '';
  prompt.upvotedByMe = identity.verified
    ? getNexusPromptCommunityVotedIds_(identity.email)[prompt.id] === true
    : false;
  prompt.bookmarkedByMe = identity.verified
    ? getNexusPromptPhase2State_(identity, [item.prompt]).bookmarkedIds.indexOf(prompt.id) !== -1
    : false;
  return {ok:true, prompt:prompt};
}
