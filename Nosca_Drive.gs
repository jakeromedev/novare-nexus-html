/**
 * Ask NOSCA — Google Drive discovery
 *
 * Requires the Advanced Drive Service:
 * Apps Script Editor > Services > + > Drive API > Add
 *
 * This version supports:
 * - fast previews that stop as soon as enough files are found
 * - batched/resumable full-tree scans
 * - heartbeat/progress logging while a scan is running
 */

/**
 * Public diagnostic: verifies that Apps Script can access the configured
 * NOSCA knowledge root.
 *
 * @return {Object}
 */
function testNoscaKnowledgeSourceAccess() {
  assertNoscaAdvancedDriveService_();

  const root = getNoscaDriveItem_(NOSCA_CONFIG.knowledgeRootId);

  if (!root || root.mimeType !== NOSCA_CONFIG.mimeTypes.folder) {
    throw new Error(
      'Configured NOSCA knowledge root is not an accessible Drive folder.'
    );
  }

  const sample = listNoscaFolderChildren_(root.id, 5);

  const result = {
    ok: true,
    rootId: root.id,
    rootName: root.name || '',
    rootMimeType: root.mimeType || '',
    driveId: root.driveId || '',
    sampleChildCount: sample.items.length,
    sampleChildren: sample.items.map(function (item) {
      return {
        id: item.id || '',
        name: item.name || '',
        mimeType: item.mimeType || ''
      };
    })
  };

  console.log('[Ask NOSCA] Knowledge source access OK:', result);

  return result;
}

/**
 * Quick read-only preview. Stops as soon as the requested number of files is
 * found instead of walking the entire Shared Drive.
 *
 * @param {number} limit
 * @return {Object}
 */
function scanNoscaKnowledgePreview_(limit) {
  assertNoscaAdvancedDriveService_();

  const settings = getNoscaIndexingSettings_();
  const requestedLimit = Math.min(
    Math.max(Number(limit || settings.previewDefaultLimit), 1),
    settings.previewMaxLimit
  );

  const startedAt = Date.now();
  const root = getNoscaDriveItem_(NOSCA_CONFIG.knowledgeRootId);

  if (!root || root.mimeType !== NOSCA_CONFIG.mimeTypes.folder) {
    throw new Error(
      'Configured NOSCA knowledge root is not an accessible Drive folder.'
    );
  }

  const rootPath = '/' + sanitizeNoscaPathPart_(root.name || 'NOSCA Knowledge');
  const queue = [{ id: root.id, path: rootPath, pageToken: '' }];
  const files = [];
  let folderCount = 0;
  let lastHeartbeatAt = startedAt;

  console.log(
    '[Ask NOSCA][Preview] Started | targetFiles=' +
    requestedLimit +
    ' | root=' +
    rootPath
  );

  while (queue.length && files.length < requestedLimit) {
    const current = queue.shift();
    const isFirstPage = !current.pageToken;

    if (isFirstPage) {
      folderCount += 1;
    }

    const page = listNoscaFolderChildren_(
      current.id,
      settings.drivePageSize,
      current.pageToken || ''
    );

    for (let i = 0; i < page.items.length; i += 1) {
      const item = page.items[i];

      if (item.mimeType === NOSCA_CONFIG.mimeTypes.folder) {
        queue.push({
          id: item.id,
          path:
            current.path +
            '/' +
            sanitizeNoscaPathPart_(item.name || 'Untitled Folder'),
          pageToken: ''
        });
        continue;
      }

      files.push(normalizeNoscaDriveFile_(item, current.path));

      if (files.length >= requestedLimit) {
        break;
      }
    }

    if (files.length < requestedLimit && page.nextPageToken) {
      queue.unshift({
        id: current.id,
        path: current.path,
        pageToken: page.nextPageToken
      });
    }

    const now = Date.now();

    if (
      now - lastHeartbeatAt >= settings.heartbeatMs ||
      (
        isFirstPage &&
        folderCount % settings.heartbeatEveryFolders === 0
      )
    ) {
      console.log(
        '[Ask NOSCA][Preview] Heartbeat | folders=' +
        folderCount +
        ' | files=' +
        files.length +
        ' | queued=' +
        queue.length +
        ' | current=' +
        current.path +
        ' | elapsed=' +
        formatNoscaElapsed_(now - startedAt)
      );
      lastHeartbeatAt = now;
    }
  }

  const result = {
    root: {
      id: root.id,
      name: root.name || '',
      path: rootPath,
      driveId: root.driveId || ''
    },
    files: files.slice(0, requestedLimit),
    folderCount: folderCount,
    reachedLimit: files.length >= requestedLimit,
    treeExhausted: queue.length === 0,
    elapsedMs: Date.now() - startedAt
  };

  console.log(
    '[Ask NOSCA][Preview] Complete | folders=' +
    result.folderCount +
    ' | files=' +
    result.files.length +
    ' | reachedLimit=' +
    result.reachedLimit +
    ' | elapsed=' +
    formatNoscaElapsed_(result.elapsedMs)
  );

  return result;
}

/**
 * Processes one resumable Drive traversal batch.
 *
 * The caller owns checkpoint persistence. This function mutates and returns
 * the supplied state only in memory.
 *
 * @param {Object} state
 * @return {Object}
 */
function scanNoscaKnowledgeBatch_(state) {
  assertNoscaAdvancedDriveService_();

  if (!state || !Array.isArray(state.queue)) {
    throw new Error('Ask NOSCA index scan state is missing or invalid.');
  }

  const settings = getNoscaIndexingSettings_();
  const startedAt = Date.now();
  const deadline = startedAt + settings.batchExecutionBudgetMs;
  const batchFiles = [];
  let batchFoldersStarted = 0;
  let lastHeartbeatAt = startedAt;
  let stopReason = 'tree_complete';

  state.totals = state.totals || {
    batches: 0,
    foldersScanned: 0,
    filesDiscovered: 0
  };

  console.log(
    '[Ask NOSCA][Index ' +
    state.scanId +
    '] Batch ' +
    (Number(state.totals.batches || 0) + 1) +
    ' started | queued=' +
    state.queue.length +
    ' | totalFolders=' +
    Number(state.totals.foldersScanned || 0) +
    ' | totalFiles=' +
    Number(state.totals.filesDiscovered || 0)
  );

  while (state.queue.length) {
    if (batchFiles.length >= settings.batchMaxFiles) {
      stopReason = 'batch_file_limit';
      break;
    }

    if (Date.now() >= deadline) {
      stopReason = 'time_budget';
      break;
    }

    const current = state.queue.shift();
    const isFirstPage = !current.pageToken;

    if (isFirstPage) {
      state.totals.foldersScanned += 1;
      batchFoldersStarted += 1;

      if (
        batchFoldersStarted === 1 ||
        state.totals.foldersScanned % settings.heartbeatEveryFolders === 0
      ) {
        console.log(
          '[Ask NOSCA][Index ' +
          state.scanId +
          '] Scanning folder #' +
          state.totals.foldersScanned +
          ': ' +
          current.path +
          ' | queued=' +
          state.queue.length
        );
      }
    }

    const page = listNoscaFolderChildren_(
      current.id,
      settings.drivePageSize,
      current.pageToken || ''
    );

    for (let i = 0; i < page.items.length; i += 1) {
      const item = page.items[i];

      if (item.mimeType === NOSCA_CONFIG.mimeTypes.folder) {
        state.queue.push({
          id: item.id,
          path:
            current.path +
            '/' +
            sanitizeNoscaPathPart_(item.name || 'Untitled Folder'),
          pageToken: ''
        });
        continue;
      }

      batchFiles.push(normalizeNoscaDriveFile_(item, current.path));
      state.totals.filesDiscovered += 1;
    }

    if (page.nextPageToken) {
      state.queue.unshift({
        id: current.id,
        path: current.path,
        pageToken: page.nextPageToken
      });
    }

    const now = Date.now();

    if (now - lastHeartbeatAt >= settings.heartbeatMs) {
      console.log(
        '[Ask NOSCA][Index ' +
        state.scanId +
        '] Heartbeat | batchFiles=' +
        batchFiles.length +
        ' | totalFiles=' +
        state.totals.filesDiscovered +
        ' | totalFolders=' +
        state.totals.foldersScanned +
        ' | queued=' +
        state.queue.length +
        ' | current=' +
        current.path +
        ' | elapsed=' +
        formatNoscaElapsed_(now - startedAt)
      );
      lastHeartbeatAt = now;
    }
  }

  const complete = state.queue.length === 0;

  if (complete) {
    stopReason = 'tree_complete';
  }

  state.totals.batches = Number(state.totals.batches || 0) + 1;
  state.updatedAt = new Date().toISOString();

  const result = {
    files: batchFiles,
    complete: complete,
    stopReason: stopReason,
    batchFoldersStarted: batchFoldersStarted,
    batchFilesDiscovered: batchFiles.length,
    queuedFolders: state.queue.length,
    elapsedMs: Date.now() - startedAt,
    state: state
  };

  console.log(
    '[Ask NOSCA][Index ' +
    state.scanId +
    '] Batch ' +
    state.totals.batches +
    ' scan complete | batchFiles=' +
    result.batchFilesDiscovered +
    ' | totalFiles=' +
    state.totals.filesDiscovered +
    ' | totalFolders=' +
    state.totals.foldersScanned +
    ' | queued=' +
    result.queuedFolders +
    ' | stopReason=' +
    result.stopReason +
    ' | elapsed=' +
    formatNoscaElapsed_(result.elapsedMs)
  );

  return result;
}

/**
 * Gets one Drive item using the Advanced Drive Service.
 */
function getNoscaDriveItem_(fileId) {
  try {
    return Drive.Files.get(fileId, {
      supportsAllDrives: true,
      fields:
        'id,name,mimeType,modifiedTime,webViewLink,parents,driveId,trashed'
    });
  } catch (error) {
    throw new Error(
      'Unable to access NOSCA Drive item "' +
      fileId +
      '". Confirm the Apps Script deployment account has access and ' +
      'that the Advanced Drive Service is enabled. Original error: ' +
      getNoscaErrorMessage_(error)
    );
  }
}

/**
 * Lists direct children of a Drive folder.
 *
 * @param {string} folderId
 * @param {number=} pageSize
 * @param {string=} pageToken
 * @return {{items: Object[], nextPageToken: string}}
 */
function listNoscaFolderChildren_(folderId, pageSize, pageToken) {
  const escapedFolderId = escapeNoscaDriveQueryValue_(folderId);

  const params = {
    q:
      "'" +
      escapedFolderId +
      "' in parents and trashed = false",
    pageSize: Math.min(
      Math.max(Number(pageSize || NOSCA_CONFIG.drivePageSize), 1),
      1000
    ),
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields:
      'nextPageToken,files(' +
      'id,name,mimeType,modifiedTime,webViewLink,parents,driveId,trashed' +
      ')'
  };

  if (pageToken) {
    params.pageToken = pageToken;
  }

  let response;

  try {
    response = Drive.Files.list(params);
  } catch (error) {
    throw new Error(
      'Unable to list NOSCA Drive folder "' +
      folderId +
      '". Original error: ' +
      getNoscaErrorMessage_(error)
    );
  }

  return {
    items: (response && response.files) || [],
    nextPageToken:
      (response && response.nextPageToken) || ''
  };
}

/**
 * Converts a Drive API file into the metadata shape used by the indexer.
 */
function normalizeNoscaDriveFile_(item, folderPath) {
  const mimeType = String(item.mimeType || '').trim();
  const supported =
    NOSCA_SUPPORTED_CONTENT_MIME_TYPES.indexOf(mimeType) !== -1;

  return {
    id: String(item.id || '').trim(),
    name: String(item.name || 'Untitled').trim(),
    folderPath: String(folderPath || '/').trim(),
    mimeType: mimeType,
    modifiedTime: String(item.modifiedTime || '').trim(),
    driveUrl:
      String(item.webViewLink || '').trim() ||
      (
        item.id
          ? 'https://drive.google.com/open?id=' +
            encodeURIComponent(item.id)
          : ''
      ),
    supported: supported
  };
}

/**
 * Ensures the Advanced Drive Service has been added to the Apps Script project.
 */
function assertNoscaAdvancedDriveService_() {
  if (
    typeof Drive === 'undefined' ||
    !Drive.Files ||
    typeof Drive.Files.list !== 'function'
  ) {
    throw new Error(
      'Ask NOSCA requires the Advanced Drive Service. In Apps Script, ' +
      'open Services > + > Drive API > Add, then run the test again.'
    );
  }
}

function getNoscaIndexingSettings_() {
  const configured = NOSCA_CONFIG.indexing || {};

  return {
    previewDefaultLimit: Math.max(
      Number(configured.previewDefaultLimit || 20),
      1
    ),
    previewMaxLimit: Math.max(
      Number(configured.previewMaxLimit || 100),
      1
    ),
    drivePageSize: Math.min(
      Math.max(
        Number(configured.drivePageSize || NOSCA_CONFIG.drivePageSize || 250),
        1
      ),
      1000
    ),
    batchMaxFiles: Math.max(
      Number(configured.batchMaxFiles || 500),
      1
    ),
    batchExecutionBudgetMs: Math.max(
      Number(configured.batchExecutionBudgetMs || 180000),
      30000
    ),
    heartbeatMs: Math.max(
      Number(configured.heartbeatMs || 10000),
      1000
    ),
    heartbeatEveryFolders: Math.max(
      Number(configured.heartbeatEveryFolders || 10),
      1
    )
  };
}

function formatNoscaElapsed_(elapsedMs) {
  const seconds = Math.max(Math.round(Number(elapsedMs || 0) / 1000), 0);

  if (seconds < 60) {
    return seconds + 's';
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return minutes + 'm ' + remainder + 's';
}

function escapeNoscaDriveQueryValue_(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function sanitizeNoscaPathPart_(value) {
  return String(value || '')
    .replace(/\//g, '／')
    .trim();
}

function getNoscaErrorMessage_(error) {
  if (!error) return 'Unknown error';
  return String(error.message || error);
}
