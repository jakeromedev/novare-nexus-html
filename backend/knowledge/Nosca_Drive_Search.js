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
 * Drive searches files visible to the Apps Script execution identity. This
 * project currently deploys as USER_ACCESSING. Do not change that identity
 * without separately reviewing user-specific permission enforcement.
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
 * Returns live, in-scope Drive metadata as NOSCA index-compatible records.
 * Each returned item has been checked against the configured knowledge root.
 * Searches are bounded deliberately: a partial result is flagged, not called
 * an exhaustive list. The Drive API's fullText search is token-based, not
 * semantic or identical to Google Drive's website UI.
 */
function searchNoscaDriveRecords_(question) {
  const startedAt = Date.now();
  assertNoscaAdvancedDriveService_();
  const rootLookupStartedAt = Date.now();
  const root = getNoscaDriveItem_(NOSCA_CONFIG.knowledgeRootId);
  const rootLookupMs = Date.now() - rootLookupStartedAt;
  const metrics = {
    rootLookupMs: rootLookupMs,
    listElapsedMs: 0,
    folderLookups: 0,
    folderLookupMs: 0,
    scopeFilterMs: 0
  };
  if (!root || root.trashed || root.mimeType !== NOSCA_CONFIG.mimeTypes.folder) {
    throw new Error('NOSCA knowledge root is not an accessible Drive folder.');
  }

  const normalized = typeof question === 'string'
    ? normalizeNoscaQuery_(question)
    : question;
  const searchTerms = noscaDriveSearchTerms_(normalized);
  if (!searchTerms.length) {
    return {
      records: [],
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
  // Prefer searching one Shared Drive over allDrives: faster and avoids
  // incompleteSearch for broad multi-drive queries.
  if (root.driveId) {
    params.corpora = 'drive';
    params.driveId = root.driveId;
  } else {
    params.corpora = 'user';
  }

  const rootPath = '/' + sanitizeNoscaPathPart_(root.name || 'Knowledge');
  const memo = {};
  memo[root.id] = {inScope: true, path: rootPath};
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
      const scopeStartedAt = Date.now();
      const location = noscaDriveSearchLocation_(item, root, memo, metrics);
      metrics.scopeFilterMs += Date.now() - scopeStartedAt;
      if (!location.inScope) continue;

      const normalizedItem = item.mimeType === NOSCA_CONFIG.mimeTypes.folder
        ? normalizeNoscaDriveFolder_(item, location.path + '/' + sanitizeNoscaPathPart_(item.name || 'Untitled Folder'))
        : normalizeNoscaDriveFile_(item, location.path);
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
 * A result is accepted only when a parent chain reaches NOSCA's root.
 * The memo is per-request and does not share permissions across users.
 * Inaccessible/broken ancestry fails closed, with no global search fallback.
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
 * question, but NEVER return metadata from outside the knowledge root.
 */
function previewNoscaNativeDriveSearch(question) {
  const normalized = normalizeNoscaQuery_(
    String(question || 'CashHub proposal').slice(0, 300)
  );
  const result = searchNoscaDriveRecords_(normalized);
  const ranked = result.records.map(function (record) {
    const scoring = scoreNoscaMetadataRecord_(record,normalized);
    return {name:record.fileName, type:record.documentType,
      path:record.folderPath, score:scoring.score, url:record.driveUrl};
  }).sort(function(a,b){return b.score-a.score;});
  const report = {ok:true, backend:'drive', question:normalized.text,
    elapsedMs:result.elapsedMs, apiCalls:result.apiCalls,
    scanned:result.scanned, scopedMatches:result.records.length,
    truncated:result.truncated, warning:result.warning,
    timings:result.metrics,
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
