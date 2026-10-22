/**
 * Ask NOSCA — native Google Drive search adapter.
 *
 * This is a read-only candidate discovery layer, NOT a replacement for the
 * content extractor or Gemini. No NOSCA_Index, sync queue, or folder map writes.
 *
 * Rollout: Script Property NOSCA_SEARCH_BACKEND = drive enables this path.
 * Missing property or "index" retains the existing search. This makes deploys
 * safe to test/rollback without editing code.
 *
 * Default: NOSCA_DRIVE_SCOPE_STRATEGY=none. Searches all files accessible
 * to the requesting user, with no NEXUS root check or ancestry lookups.
 * Optional legacy restriction: 'live' or 'foldermap' to restrict results to
 * NOSCA_CONFIG.knowledgeRootId. Foldermap can become stale after moves.
 * A broad search can include non-NEXUS or personal files. Since content of
 * selected files may be sent to Gemini, get approval for this data scope.
 * Drive searches as the executing account (currently USER_ACCESSING).
 */
function useNoscaNativeDriveSearch_() {
  const value = String(
    PropertiesService.getScriptProperties().getProperty('NOSCA_SEARCH_BACKEND') ||
    'index'
  ).trim().toLowerCase();
  if (value !== 'drive' && value !== 'index') {
    throw new Error('NOSCA_SEARCH_BACKEND must be "drive" or "index".');
  }
  return value === 'drive';
}

/**
 * 'none' removes the root restriction and folder ancestry verification.
 * The legacy 'live' and 'foldermap' modes remain available for rollback.
 * Foldermap may be stale and may expose cached hierarchy metadata.
 */
function noscaDriveScopeStrategy_() {
  const mode = String(PropertiesService.getScriptProperties()
    .getProperty('NOSCA_DRIVE_SCOPE_STRATEGY') || 'none').trim().toLowerCase();
  if (mode !== 'none' && mode !== 'live' && mode !== 'foldermap') {
    throw new Error('NOSCA_DRIVE_SCOPE_STRATEGY must be "none", "live", or "foldermap".');
  }
  return mode;
}

/**
 * Read the EXISTING read-only folder map once, validate every cached record's
 * entire parent chain against the configured root, and return memoized paths.
 * Unknown, inconsistent, outside, and expired paths are not trusted; the normal
 * live ancestry verifier handles those candidates instead.
 *
 * This is intentionally opt-in. A completed baseline is not an always-current
 * security boundary: moving a folder may invalidate its cached membership.
 */
function noscaDriveScopeMemoFromFolderMap_(root, metrics) {
  const startedAt = Date.now();
  const rootPath = '/' + sanitizeNoscaPathPart_(root.name || 'Knowledge');
  const memo = {};
  memo[root.id] = {inScope:true, path:rootPath};
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('NOSCA_DELTA_FOLDER_MAP_READY') !== 'true') {
      metrics.folderMapWarning = 'Folder map is not marked ready; using live ancestry.';
      return memo;
    }
    const sheet = SpreadsheetApp.openById(NOSCA_CONFIG.dataSpreadsheetId)
      .getSheetByName('NOSCA_FolderMap');
    if (!sheet || sheet.getLastRow() < 2) {
      metrics.folderMapWarning = 'Folder map sheet is missing or empty; using live ancestry.';
      return memo;
    }
    const headers = sheet.getRange(1, 1, 1, 8).getDisplayValues()[0];
    const required = ['Folder ID','Parent ID','Drive ID','Folder Name',
      'Canonical Path','In Scope','Last Verified At','Status'];
    if (required.some(function (name, i) {return headers[i] !== name;})) {
      metrics.folderMapWarning = 'Folder map schema mismatch; using live ancestry.';
      return memo;
    }
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    metrics.folderMapRows = rows.length;
    const entries = {};
    rows.forEach(function(row) {
      const id = String(row[0] || '');
      if (!id) return;
      const lastVerified = row[6] instanceof Date
        ? row[6].getTime() : new Date(row[6]).getTime();
      entries[id] = {
        parent: String(row[1] || ''),
        driveId: String(row[2] || ''),
        name: String(row[3] || ''),
        path: String(row[4] || ''),
        inScope: row[5] === true || String(row[5]).toLowerCase() === 'true',
        lastVerified: lastVerified,
        status: String(row[7] || '')
      };
    });
    // Do not trust an arbitrarily old bootstrap indefinitely. This threshold
    // limits stale data but is NOT a substitute for continuous synchronization.
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const visited = {};
    function resolve(id, depth) {
      if (memo[id]) return memo[id];
      if (!id || depth > 40 || visited[id]) return null;
      const entry = entries[id];
      if (!entry || !entry.inScope || entry.status !== 'Active' ||
          !Number.isFinite(entry.lastVerified) ||
          now - entry.lastVerified > maxAgeMs ||
          (root.driveId && entry.driveId && entry.driveId !== root.driveId)) return null;
      visited[id] = true;
      const parent = resolve(entry.parent, depth + 1);
      delete visited[id];
      if (!parent || !parent.inScope) return null;
      const path = parent.path + '/' + sanitizeNoscaPathPart_(entry.name);
      if (entry.path !== path) return null;
      memo[id] = {inScope:true,path:path,fromFolderMap:true};
      return memo[id];
    }
    Object.keys(entries).forEach(function(id) {resolve(id, 0);});
    metrics.folderMapUsableFolders = Object.keys(memo).length - 1;
    if (!metrics.folderMapUsableFolders) {
      metrics.folderMapWarning = 'No validated folder-map paths; using live ancestry.';
    }
  } catch (error) {
    metrics.folderMapWarning = 'Folder map unavailable; using live ancestry: ' +
      String(error && error.message || error).slice(0, 120);
  } finally {
    metrics.folderMapLoadMs = Date.now() - startedAt;
  }
  return memo;
}

/**
 * Returns live Drive metadata as NOSCA index-compatible records.
 * Default 'none' scope: no knowledge-root or parent-folder checks.
 * Legacy 'live' / 'foldermap' modes still validate the configured root.
 * Searches are bounded deliberately: a partial result is flagged, not called
 * an exhaustive list. The Drive API's fullText search is token-based, not
 * semantic or identical to Google Drive's website UI.
 */
function searchNoscaDriveRecords_(question, scopeStrategyOverride) {
  const startedAt = Date.now();
  assertNoscaAdvancedDriveService_();
  const scopeStrategy = scopeStrategyOverride || noscaDriveScopeStrategy_();
  if (scopeStrategy !== 'none' && scopeStrategy !== 'live' &&
      scopeStrategy !== 'foldermap') {
    throw new Error('Search scope strategy must be "none", "live", or "foldermap".');
  }
  const metrics = {
    rootLookupMs: 0,
    listElapsedMs: 0,
    folderLookups: 0,
    folderLookupMs: 0,
    scopeFilterMs: 0,
    folderMapLoadMs: 0,
    folderMapRows: 0,
    folderMapUsableFolders: 0,
    folderMapHits: 0,
    folderMapWarning: ''
  };

  // With unrestricted search, the knowledge root is not fetched at all.
  // Drive.Files.list itself enforces the requesting user's Drive ACLs.
  let root = null;
  if (scopeStrategy !== 'none') {
    const rootLookupStartedAt = Date.now();
    root = getNoscaDriveItem_(NOSCA_CONFIG.knowledgeRootId);
    metrics.rootLookupMs = Date.now() - rootLookupStartedAt;
    if (!root || root.trashed ||
        root.mimeType !== NOSCA_CONFIG.mimeTypes.folder) {
      throw new Error('NOSCA knowledge root is not an accessible Drive folder.');
    }
  }

  const normalized = typeof question === 'string'
    ? normalizeNoscaQuery_(question)
    : question;
  const searchTerms = noscaDriveSearchTerms_(normalized);
  if (!searchTerms.length) {
    return {
      records: [],
      scopeStrategy: scopeStrategy,
      elapsedMs: Date.now() - startedAt,
      apiCalls: 0,
      scanned: 0,
      truncated: false,
      metrics: metrics,
      warning: 'Add a client, project, file name, or other searchable term.'
    };
  }

  const config = NOSCA_CONFIG.driveSearch || {};
  const pageSize = Math.min(1000, Math.max(1, Number(config.pageSize || 100)));
  const maxPages = Math.min(10, Math.max(1, Number(config.maxPages || 2)));
  const maxResults = Math.min(200, Math.max(1, Number(config.maxScopedResults || 60)));
  const q = 'trashed = false and (' + searchTerms.map(function (term) {
    return "fullText contains '" + escapeNoscaDriveQueryValue_(term) + "'";
  }).join(' or ') + ')';
  const params = {
    q: q,
    pageSize: pageSize,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,driveId,webViewLink,modifiedTime,trashed)',
    orderBy: 'modifiedTime desc'
  };
  // 'allDrives' covers My Drive and shared drives the requester belongs to;
  // Google may flag broad queries as incompleteSearch. We surface that warning.
  // 'user' is faster and can be chosen if broad all-drives queries are slow.
  if (scopeStrategy === 'none') {
    const preferredCorpus = String(PropertiesService.getScriptProperties()
      .getProperty('NOSCA_DRIVE_CORPUS') || 'allDrives').trim();
    if (preferredCorpus !== 'user' && preferredCorpus !== 'allDrives') {
      throw new Error('NOSCA_DRIVE_CORPUS must be "user" or "allDrives".');
    }
    params.corpora = preferredCorpus;
  } else if (root.driveId) {
    params.corpora = 'drive';
    params.driveId = root.driveId;
  } else {
    params.corpora = 'user';
  }

  const memo = scopeStrategy === 'foldermap'
    ? noscaDriveScopeMemoFromFolderMap_(root, metrics) : {};
  if (root) {
    const rootPath = '/' + sanitizeNoscaPathPart_(root.name || 'Knowledge');
    memo[root.id] = {inScope: true, path: rootPath};
  }
  const results = [];
  const seen = {};
  let nextPageToken = '';
  let pages = 0;
  let scanned = 0;
  let incomplete = false;
  let stoppedEarly = false;

  do {
    if (nextPageToken) params.pageToken = nextPageToken;
    else delete params.pageToken;

    const listStartedAt = Date.now();
    const page = Drive.Files.list(params);
    metrics.listElapsedMs += Date.now() - listStartedAt;
    pages += 1;
    incomplete = incomplete || page.incompleteSearch === true;
    const items = page.files || [];
    scanned += items.length;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || !item.id || item.trashed || seen[item.id]) continue;
      seen[item.id] = true;
      let folderPath = '';
      if (scopeStrategy !== 'none') {
        const scopeStartedAt = Date.now();
        const location = noscaDriveSearchLocation_(item, root, memo, metrics);
        metrics.scopeFilterMs += Date.now() - scopeStartedAt;
        if (!location.inScope) continue;
        folderPath = item.mimeType === NOSCA_CONFIG.mimeTypes.folder
          ? location.path + '/' + sanitizeNoscaPathPart_(item.name || 'Untitled Folder')
          : location.path;
      }

      const normalizedItem = item.mimeType === NOSCA_CONFIG.mimeTypes.folder
        ? normalizeNoscaDriveFolder_(item, folderPath)
        : normalizeNoscaDriveFile_(item, folderPath);
      if (scopeStrategy === 'none') {
        // We intentionally do not know this item's ancestry. Never claim
        // that it is in the original knowledge-root folder.
        normalizedItem.folderPath = '';
        normalizedItem.hierarchyContext = '';
      }
      results.push(buildNoscaIndexRecord_(normalizedItem, null, new Date()));
      if (results.length >= maxResults) {
        stoppedEarly = true;
        break;
      }
    }
    nextPageToken = String(page.nextPageToken || '');
    if (stoppedEarly) break;
  } while (nextPageToken && pages < maxPages);

  const truncated = Boolean(nextPageToken) || incomplete || stoppedEarly;
  return {
    records: results,
    scopeStrategy: scopeStrategy,
    elapsedMs: Date.now() - startedAt,
    apiCalls: pages,
    scanned: scanned,
    truncated: truncated,
    metrics: metrics,
    warning: truncated
      ? 'Drive search was bounded; additional matching files may exist.'
      : ''
  };
}

/** Extract a small, user-query-derived OR set without building unsafe Drive q. */
function noscaDriveSearchTerms_(query) {
  const terms = (query.terms || []).filter(function (term) {
    return /^[a-z0-9+#&.\-]{2,60}$/.test(term);
  });
  const seen = {};
  const selected = [];
  terms.forEach(function (term) {
    // Avoid spending the limited Drive search window on generic categories.
    if (/^(novare|proposal|proposals|document|documents|file|files|deck|decks|presentation|presentations|solution|solutions|capability|capabilities)$/.test(term)) return;
    if (!seen[term] && selected.length < 5) {
      seen[term] = true;
      selected.push(term);
    }
  });
  if (!selected.length) {
    terms.slice(0, 3).forEach(function (term) {
      if (!seen[term]) {seen[term] = true; selected.push(term);}
    });
  }
  // Add only one-word aliases; Drive fullText matching does not inherit
  // parent folder names. Metadata ranking retains canonical aliases afterward.
  (NOSCA_CONFIG.metadataAliases || []).forEach(function (rule) {
    const variants = (rule.matchAny || []).map(function (value) {
      return normalizeNoscaSearchText_(value);
    });
    if (!variants.some(function (variant) {
      return variant && (
        query.normalized.indexOf(variant) !== -1 ||
        terms.indexOf(variant) !== -1
      );
    })) return;
    variants.forEach(function (variant) {
      if (/^[a-z0-9+#&.\-]{2,60}$/.test(variant) &&
          !seen[variant] && selected.length < 7) {
        seen[variant] = true;
        selected.push(variant);
      }
    });
  });
  return selected.slice(0, 7);
}

/**
 * Legacy restricted-mode ancestry verifier (not called in 'none' mode).
 * The memo is per-request and does not share permissions across users.
 * Inaccessible/broken ancestry fails closed for restricted modes.
 */
function noscaDriveSearchLocation_(item, root, memo, metrics) {
  if (item.id === root.id) return memo[root.id];
  if (root.driveId && item.driveId && item.driveId !== root.driveId) {
    return {inScope:false, path:''};
  }
  const names = [];
  const visited = {};
  let parentId = String(item.parents && item.parents[0] || '');
  const chain = [];
  for (let depth = 0; depth < 40 && parentId; depth += 1) {
    if (visited[parentId]) return {inScope:false,path:''};
    visited[parentId] = true;
    if (memo[parentId]) {
      if (metrics && memo[parentId].fromFolderMap) metrics.folderMapHits += 1;
      if (!memo[parentId].inScope) return {inScope:false,path:''};
      const path = memo[parentId].path +
        (names.length ? '/' + names.slice().reverse().join('/') : '');
      // Populate each visited folder's concrete location for later hits.
      let runningPath = memo[parentId].path;
      for (let i = chain.length - 1; i >= 0; i -= 1) {
        runningPath += '/' + chain[i].name;
        memo[chain[i].id] = {inScope:true,path:runningPath};
      }
      return {inScope:true,path:path};
    }
    let folder;
    const folderLookupStartedAt = Date.now();
    try {
      folder = Drive.Files.get(parentId, {
        supportsAllDrives:true,
        fields:'id,name,mimeType,parents,driveId,trashed'
      });
    } catch (error) {
      // Fail closed. An inaccessible ancestor must not broaden the search.
      return {inScope:false,path:''};
    } finally {
      if (metrics) {
        metrics.folderLookups += 1;
        metrics.folderLookupMs += Date.now() - folderLookupStartedAt;
      }
    }
    if (!folder || folder.trashed ||
        folder.mimeType !== NOSCA_CONFIG.mimeTypes.folder) {
      return {inScope:false,path:''};
    }
    const name = sanitizeNoscaPathPart_(folder.name || 'Untitled Folder');
    names.push(name);
    chain.push({id:folder.id,name:name});
    parentId = String(folder.parents && folder.parents[0] || '');
  }
  return {inScope:false,path:''};
}

/**
 * Read-only operator test. Run with both backends on the same representative
 * question. In 'none' mode, results may be outside the knowledge root.
 */
function previewNoscaNativeDriveSearch(question, scopeStrategyOverride) {
  const normalized = normalizeNoscaQuery_(
    String(question || 'CashHub proposal').slice(0, 300)
  );
  const result = searchNoscaDriveRecords_(normalized, scopeStrategyOverride);
  const ranked = result.records.map(function (record) {
    const scoring = scoreNoscaMetadataRecord_(record,normalized);
    return {name:record.fileName, type:record.documentType,
      path:record.folderPath, score:scoring.score, url:record.driveUrl};
  }).sort(function(a,b){return b.score-a.score;});
  const report = {ok:true, backend:'drive', scopeStrategy:result.scopeStrategy, question:normalized.text,
    elapsedMs:result.elapsedMs, apiCalls:result.apiCalls,
    estimatedTotalDriveApiCalls:result.apiCalls + result.metrics.folderLookups +
      (result.scopeStrategy === 'none' ? 0 : 1),
    scanned:result.scanned, matches:result.records.length,
    truncated:result.truncated, warning:result.warning,
    timings:result.metrics,
    scopeWarning:result.scopeStrategy === 'none'
      ? 'Unrestricted to the NEXUS knowledge root: results can include personal or non-NEXUS files accessible to this user. Folder paths are omitted.'
      : result.scopeStrategy === 'foldermap'
        ? 'Folder-map paths are cached and may be stale; do not treat this mode as a verified live security boundary.'
        : '',
    results:ranked.slice(0,12)};

  // A returned object alone doesn't appear in Apps Script's execution log.
  // Log a bounded diagnostic report so operators can inspect the result.
  // Note: the 12 returned source titles/URLs may be confidential.
  console.log('[NOSCA DRIVE SEARCH PREVIEW]\n' + JSON.stringify(report, null, 2));
  return report;
}

/**
 * Run this function directly from the Apps Script editor with no arguments.
 * The preview function itself logs the same report; this is a convenient
 * named execution entry point, not an additional API request.
 */
function logNoscaNativeDriveSearch() {
  return previewNoscaNativeDriveSearch('CashHub proposal');
}

/**
 * Optional legacy comparison: folder-map-assisted knowledge-root validation.
 * The default preview now searches all accessible Drive files, without any
 * folder ancestry calls. This test does not change Script Properties.
 */
function logNoscaNativeDriveSearchFast() {
  return previewNoscaNativeDriveSearch('CashHub proposal', 'foldermap');
}

/** Compare with the previous root-restricted search, without changing settings. */
function logNoscaNativeDriveSearchRestricted() {
  return previewNoscaNativeDriveSearch('CashHub proposal', 'live');
}
