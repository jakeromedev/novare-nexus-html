/**
 * Ask NOSCA — index orchestration.
 *
 * Large Drive trees are indexed in resumable batches. Run refreshNoscaIndex()
 * repeatedly until it returns complete: true. Each incomplete run saves a
 * checkpoint in Script Properties and the next run resumes automatically.
 *
 * Recommended flow:
 *   1. testNoscaIndexConnections()
 *   2. previewNoscaKnowledgeFiles(20)
 *   3. refreshNoscaIndex()
 *   4. repeat step 3 while needsAnotherRun === true
 *   5. getNoscaIndexStatus()
 */

const NOSCA_INDEX_STATE_PREFIX = 'NOSCA_INDEX_SCAN_STATE_';
const NOSCA_INDEX_STATE_VERSION = 4;

/**
 * Public diagnostic that validates both required connections.
 *
 * @return {Object}
 */
function testNoscaIndexConnections() {
  const startedAt = Date.now();

  const result = {
    ok: false,
    sheet: null,
    drive: null,
    elapsedMs: 0
  };

  result.sheet = testNoscaDataSheetAccess();
  result.drive = testNoscaKnowledgeSourceAccess();
  result.ok = true;
  result.elapsedMs = Date.now() - startedAt;

  console.log('[Ask NOSCA] Index connectivity test passed:', result);

  return result;
}

/**
 * Public quick preview. It is read-only and stops as soon as it finds the
 * requested number of files. It does NOT populate NOSCA_Index.
 *
 * @param {number=} limit
 * @return {Object}
 */
function previewNoscaKnowledgeFiles(limit) {
  const settings = getNoscaIndexingSettings_();
  const requestedLimit = Math.min(
    Math.max(Number(limit || settings.previewDefaultLimit), 1),
    settings.previewMaxLimit
  );

  const scan = scanNoscaKnowledgePreview_(requestedLimit);

  return {
    ok: true,
    root: scan.root,
    foldersVisited: scan.folderCount,
    previewFileCount: scan.files.length,
    reachedLimit: scan.reachedLimit,
    treeExhausted: scan.treeExhausted,
    elapsedMs: scan.elapsedMs,
    preview: scan.files
  };
}

/**
 * Public resumable index refresh.
 *
 * One call processes one bounded batch, writes that batch to NOSCA_Index,
 * and saves a checkpoint when more folders remain. Run this function again
 * until complete === true.
 *
 * Files not seen during the scan are marked Skipped only after the ENTIRE
 * tree has been traversed, so an incomplete batch never falsely marks files
 * as missing.
 *
 * @return {Object}
 */
function refreshNoscaIndex() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(3000)) {
    throw new Error(
      'Another Ask NOSCA index refresh is already running. Try again shortly.'
    );
  }

  const executionStartedAt = Date.now();

  try {
    testNoscaDataSheetAccess();
    assertNoscaAdvancedDriveService_();

    let state = loadNoscaIndexScanState_();

    if (!state) {
      state = createNoscaIndexScanState_();
      console.log(
        '[Ask NOSCA][Index ' +
        state.scanId +
        '] New full index refresh started | root=' +
        state.root.path
      );
    } else {
      console.log(
        '[Ask NOSCA][Index ' +
        state.scanId +
        '] Resuming saved checkpoint | nextBatch=' +
        (Number(state.totals.batches || 0) + 1) +
        ' | queued=' +
        state.queue.length +
        ' | totalFiles=' +
        Number(state.totals.filesDiscovered || 0)
      );
    }

    const batch = scanNoscaKnowledgeBatch_(state);
    const batchWrite = applyNoscaIndexBatch_(
      batch.items || batch.files,
      state.scanStartedAt
    );

    accumulateNoscaIndexSummary_(state, batchWrite);

    let finalization = null;

    if (batch.complete) {
      finalization = finalizeNoscaIndexScan_(state);
      clearNoscaIndexScanState_();

      console.log(
        '[Ask NOSCA][Index ' +
        state.scanId +
        '] FULL REFRESH COMPLETE | items=' +
        Number(state.totals.itemsDiscovered || 0) +
        ' | files=' +
        Number(state.totals.filesDiscovered || 0) +
        ' | indexedFolders=' +
        Number(state.totals.foldersDiscovered || 0) +
        ' | foldersScanned=' +
        state.totals.foldersScanned +
        ' | batches=' +
        state.totals.batches +
        ' | skippedMissing=' +
        finalization.removedFiles
      );
    } else {
      saveNoscaIndexScanState_(state);

      console.log(
        '[Ask NOSCA][Index ' +
        state.scanId +
        '] Checkpoint saved | run refreshNoscaIndex() again | queued=' +
        state.queue.length +
        ' | totalItems=' +
        Number(state.totals.itemsDiscovered || 0)
      );
    }

    const result = buildNoscaIndexRefreshResult_(
      state,
      batch,
      batchWrite,
      finalization,
      executionStartedAt
    );

    console.log('[Ask NOSCA] Index refresh result:', result);

    return result;
  } catch (error) {
    console.error(
      '[Ask NOSCA] NOSCA_Index refresh failed:',
      getNoscaErrorMessage_(error)
    );

    throw error;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Clears only the saved traversal checkpoint. It does not clear NOSCA_Index.
 * The next refreshNoscaIndex() call starts a new full scan from the root.
 *
 * @return {Object}
 */
function resetNoscaIndexRefreshCheckpoint() {
  clearNoscaIndexScanState_();

  const result = {
    ok: true,
    message:
      'Ask NOSCA index checkpoint cleared. The next refresh will start from the root.'
  };

  console.log('[Ask NOSCA]', result.message);
  return result;
}

/**
 * Shows whether a resumable refresh is currently in progress.
 *
 * @return {Object}
 */
function getNoscaIndexRefreshStatus() {
  const state = loadNoscaIndexScanState_();

  if (!state) {
    return {
      ok: true,
      inProgress: false,
      message: 'No saved Ask NOSCA index refresh checkpoint.'
    };
  }

  return {
    ok: true,
    inProgress: true,
    scanId: state.scanId,
    scanStartedAt: state.scanStartedAt,
    updatedAt: state.updatedAt || '',
    batchesCompleted: Number(state.totals.batches || 0),
    foldersScanned: Number(state.totals.foldersScanned || 0),
    foldersDiscovered: Number(state.totals.foldersDiscovered || 0),
    filesDiscovered: Number(state.totals.filesDiscovered || 0),
    itemsDiscovered: Number(state.totals.itemsDiscovered || 0),
    queuedFolders: state.queue.length,
    cumulative: state.summary || {}
  };
}

/**
 * Public diagnostic for the current NOSCA_Index contents.
 */
function getNoscaIndexStatus() {
  const existing = loadNoscaExistingIndex_();

  const statusCounts = {
    Active: 0,
    Skipped: 0,
    Unsupported: 0,
    Error: 0,
    Other: 0
  };

  const itemTypeCounts = {};
  const documentTypeCounts = {};
  let latestIndexedAt = null;

  Object.keys(existing).forEach(function (fileId) {
    const record = existing[fileId];
    const status = record.status;
    const itemType =
      String(record.itemType || '(blank)');
    const documentType =
      String(record.documentType || '(blank)');

    if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
      statusCounts[status] += 1;
    } else {
      statusCounts.Other += 1;
    }

    itemTypeCounts[itemType] =
      (itemTypeCounts[itemType] || 0) + 1;
    documentTypeCounts[documentType] =
      (documentTypeCounts[documentType] || 0) + 1;

    if (
      record.indexedAt instanceof Date &&
      !isNaN(record.indexedAt.getTime()) &&
      (
        !latestIndexedAt ||
        record.indexedAt.getTime() > latestIndexedAt.getTime()
      )
    ) {
      latestIndexedAt = record.indexedAt;
    }
  });

  const result = {
    ok: true,
    rowCount: Object.keys(existing).length,
    statusCounts: statusCounts,
    itemTypeCounts: itemTypeCounts,
    documentTypeCounts: documentTypeCounts,
    latestIndexedAt:
      latestIndexedAt ? latestIndexedAt.toISOString() : '',
    refresh: getNoscaIndexRefreshStatus()
  };

  console.log(
    '[Ask NOSCA] Index status:\n' +
    JSON.stringify(result, null, 2)
  );

  return result;
}

function createNoscaIndexScanState_() {
  const root = getNoscaDriveItem_(NOSCA_CONFIG.knowledgeRootId);

  if (!root || root.mimeType !== NOSCA_CONFIG.mimeTypes.folder) {
    throw new Error(
      'Configured NOSCA knowledge root is not an accessible Drive folder.'
    );
  }

  const rootPath = '/' + sanitizeNoscaPathPart_(root.name || 'NOSCA Knowledge');
  const started = new Date(Math.floor(Date.now() / 1000) * 1000);

  return {
    version: NOSCA_INDEX_STATE_VERSION,
    scanId:
      Utilities.formatDate(
        started,
        Session.getScriptTimeZone() || 'Etc/UTC',
        'yyyyMMdd-HHmmss'
      ) +
      '-' +
      Utilities.getUuid().slice(0, 8),
    knowledgeRootId: NOSCA_CONFIG.knowledgeRootId,
    scanStartedAt: started.toISOString(),
    updatedAt: started.toISOString(),
    root: {
      id: root.id,
      name: root.name || '',
      path: rootPath,
      driveId: root.driveId || ''
    },
    queue: [{ id: root.id, path: rootPath, pageToken: '' }],
    totals: {
      batches: 0,
      foldersScanned: 0,
      foldersDiscovered: 0,
      filesDiscovered: 0,
      itemsDiscovered: 0
    },
    summary: {
      newFiles: 0,
      updatedFiles: 0,
      unchangedFiles: 0,
      unsupportedFiles: 0,
      folderItems: 0,
      fileItems: 0
    }
  };
}

function applyNoscaIndexBatch_(items, scanStartedAt) {
  const existing = loadNoscaExistingIndex_();
  const indexedAt = new Date(scanStartedAt);

  if (isNaN(indexedAt.getTime())) {
    throw new Error('Ask NOSCA scan checkpoint has an invalid start time.');
  }

  const summary = {
    processedFiles: 0,
    processedItems: 0,
    newFiles: 0,
    updatedFiles: 0,
    unchangedFiles: 0,
    unsupportedFiles: 0,
    folderItems: 0,
    fileItems: 0,
    writtenRows: 0
  };

  (items || []).forEach(function (item) {
    if (!item || !item.id) return;

    const previous = existing[item.id] || null;
    const next = buildNoscaIndexRecord_(item, previous, indexedAt);
    const changed =
      !previous ||
      hasNoscaIndexMetadataChanged_(previous, next);

    if (!previous) {
      summary.newFiles += 1;
    } else if (changed) {
      summary.updatedFiles += 1;
    } else {
      summary.unchangedFiles += 1;
    }

    if (next.status === NOSCA_CONFIG.statuses.unsupported) {
      summary.unsupportedFiles += 1;
    }

    if (next.itemType === NOSCA_CONFIG.itemTypes.folder) {
      summary.folderItems += 1;
    } else {
      summary.fileItems += 1;
      summary.processedFiles += 1;
    }

    next.indexedAt = indexedAt;

    existing[item.id] = next;
    summary.processedItems += 1;
  });

  const records = Object.keys(existing)
    .map(function (fileId) {
      return existing[fileId];
    })
    .sort(compareNoscaIndexRecords_);

  const rows = records.map(noscaIndexRecordToRow_);
  writeNoscaIndexRows_(rows);
  summary.writtenRows = rows.length;

  console.log('[Ask NOSCA] Index batch written:', summary);

  return summary;
}

function finalizeNoscaIndexScan_(state) {
  const existing = loadNoscaExistingIndex_();
  const scanStartedAt = normalizeNoscaComparableDate_(state.scanStartedAt);
  const indexedAt = new Date(state.scanStartedAt);
  const records = [];
  let removedFiles = 0;

  Object.keys(existing).forEach(function (fileId) {
    const record = existing[fileId];
    const touchedAt = normalizeNoscaComparableDate_(record.indexedAt);

    if (touchedAt !== scanStartedAt) {
      record.status = NOSCA_CONFIG.statuses.skipped;
      record.indexedAt = indexedAt;
      record.notes =
        'Source file was not found under the configured Ask NOSCA ' +
        'knowledge root during the latest completed full scan.';
      removedFiles += 1;
    }

    records.push(record);
  });

  records.sort(compareNoscaIndexRecords_);
  writeNoscaIndexRows_(records.map(noscaIndexRecordToRow_));

  return {
    removedFiles: removedFiles,
    writtenRows: records.length
  };
}

function buildNoscaIndexRefreshResult_(
  state,
  batch,
  batchWrite,
  finalization,
  executionStartedAt
) {
  return {
    ok: true,
    scanId: state.scanId,
    complete: batch.complete,
    needsAnotherRun: !batch.complete,
    stopReason: batch.stopReason,
    batchNumber: Number(state.totals.batches || 0),
    batchItemsDiscovered: Number(batch.batchItemsDiscovered || 0),
    batchFilesDiscovered: Number(batch.batchFilesDiscovered || 0),
    batchFoldersDiscovered: Number(batch.batchFoldersDiscovered || 0),
    batchFoldersStarted: batch.batchFoldersStarted,
    totalItemsDiscovered: Number(state.totals.itemsDiscovered || 0),
    totalFilesDiscovered: Number(state.totals.filesDiscovered || 0),
    totalFoldersDiscovered: Number(state.totals.foldersDiscovered || 0),
    totalFoldersScanned: Number(state.totals.foldersScanned || 0),
    queuedFolders: state.queue.length,
    batchWrite: batchWrite,
    cumulative: state.summary || {},
    removedFiles:
      finalization ? Number(finalization.removedFiles || 0) : null,
    indexRows:
      finalization
        ? Number(finalization.writtenRows || 0)
        : Number(batchWrite.writtenRows || 0),
    scanStartedAt: state.scanStartedAt,
    executionElapsedMs: Date.now() - executionStartedAt,
    nextStep: batch.complete
      ? 'Index refresh is complete. Run getNoscaIndexStatus(), then test Ask NOSCA.'
      : 'Run refreshNoscaIndex() again to continue from the saved checkpoint.'
  };
}

function accumulateNoscaIndexSummary_(state, batchWrite) {
  state.summary = state.summary || {
    newFiles: 0,
    updatedFiles: 0,
    unchangedFiles: 0,
    unsupportedFiles: 0
  };

  state.summary.newFiles += Number(batchWrite.newFiles || 0);
  state.summary.updatedFiles += Number(batchWrite.updatedFiles || 0);
  state.summary.unchangedFiles += Number(batchWrite.unchangedFiles || 0);
  state.summary.unsupportedFiles += Number(batchWrite.unsupportedFiles || 0);
  state.summary.folderItems =
    Number(state.summary.folderItems || 0) +
    Number(batchWrite.folderItems || 0);
  state.summary.fileItems =
    Number(state.summary.fileItems || 0) +
    Number(batchWrite.fileItems || 0);
}

function saveNoscaIndexScanState_(state) {
  const config = NOSCA_CONFIG.indexing || {};
  const chunkChars = Math.max(
    Math.min(Number(config.checkpointChunkChars || 6000), 7500),
    1000
  );
  const maxChars = Math.max(
    Number(config.checkpointMaxChars || 350000),
    chunkChars
  );

  const json = JSON.stringify(state);

  if (json.length > maxChars) {
    throw new Error(
      'Ask NOSCA checkpoint grew to ' +
      json.length +
      ' characters, above the configured safety limit of ' +
      maxChars +
      '. Narrow the knowledge source or move checkpoint state to a dedicated storage sheet.'
    );
  }

  const chunkCount = Math.max(Math.ceil(json.length / chunkChars), 1);
  const properties = PropertiesService.getScriptProperties();
  clearNoscaIndexScanState_();

  const values = {};

  values[NOSCA_INDEX_STATE_PREFIX + 'META'] = JSON.stringify({
    version: NOSCA_INDEX_STATE_VERSION,
    chunks: chunkCount,
    scanId: state.scanId,
    updatedAt: state.updatedAt || ''
  });

  for (let i = 0; i < chunkCount; i += 1) {
    values[
      NOSCA_INDEX_STATE_PREFIX + 'CHUNK_' + String(i).padStart(3, '0')
    ] = json.slice(i * chunkChars, (i + 1) * chunkChars);
  }

  properties.setProperties(values, false);

  console.log(
    '[Ask NOSCA][Index ' +
    state.scanId +
    '] Checkpoint persisted | chunks=' +
    chunkCount +
    ' | chars=' +
    json.length
  );
}

function loadNoscaIndexScanState_() {
  const properties = PropertiesService.getScriptProperties();
  const metaRaw = properties.getProperty(
    NOSCA_INDEX_STATE_PREFIX + 'META'
  );

  if (!metaRaw) {
    return null;
  }

  let meta;

  try {
    meta = JSON.parse(metaRaw);
  } catch (error) {
    clearNoscaIndexScanState_();
    throw new Error(
      'Ask NOSCA index checkpoint metadata was corrupted and has been cleared.'
    );
  }

  const chunkCount = Math.max(Number(meta.chunks || 0), 0);

  if (!chunkCount) {
    clearNoscaIndexScanState_();
    return null;
  }

  let json = '';

  for (let i = 0; i < chunkCount; i += 1) {
    const key =
      NOSCA_INDEX_STATE_PREFIX + 'CHUNK_' + String(i).padStart(3, '0');
    const chunk = properties.getProperty(key);

    if (chunk === null) {
      clearNoscaIndexScanState_();
      throw new Error(
        'Ask NOSCA index checkpoint was incomplete and has been cleared. Run refreshNoscaIndex() again to start a new scan.'
      );
    }

    json += chunk;
  }

  let state;

  try {
    state = JSON.parse(json);
  } catch (error) {
    clearNoscaIndexScanState_();
    throw new Error(
      'Ask NOSCA index checkpoint could not be read and has been cleared. Run refreshNoscaIndex() again.'
    );
  }

  if (
    Number(state.version || 0) !== NOSCA_INDEX_STATE_VERSION ||
    state.knowledgeRootId !== NOSCA_CONFIG.knowledgeRootId ||
    !Array.isArray(state.queue)
  ) {
    clearNoscaIndexScanState_();
    console.warn(
      '[Ask NOSCA] Saved index checkpoint was obsolete and has been cleared.'
    );
    return null;
  }

  return state;
}

function clearNoscaIndexScanState_() {
  const properties = PropertiesService.getScriptProperties();
  const all = properties.getProperties();

  Object.keys(all).forEach(function (key) {
    if (key.indexOf(NOSCA_INDEX_STATE_PREFIX) === 0) {
      properties.deleteProperty(key);
    }
  });
}

function buildNoscaIndexRecord_(item, previous, indexedAt) {
  const itemType =
    String(item.itemType || '') ||
    (
      item.mimeType === NOSCA_CONFIG.mimeTypes.folder
        ? NOSCA_CONFIG.itemTypes.folder
        : NOSCA_CONFIG.itemTypes.file
    );

  const isFolder =
    itemType === NOSCA_CONFIG.itemTypes.folder;

  const supported = item.supported === true;

  // Folders are active metadata/navigation records even though there is no
  // document body to extract.
  const status = isFolder
    ? NOSCA_CONFIG.statuses.active
    : (
      supported
        ? NOSCA_CONFIG.statuses.active
        : NOSCA_CONFIG.statuses.unsupported
    );

  const documentType = isFolder
    ? NOSCA_CONFIG.documentTypes.folder
    : classifyNoscaDocumentType_(item);

  const fileFormat = isFolder
    ? NOSCA_CONFIG.fileFormats.folder
    : getNoscaFileFormat_(item);

  const hierarchyContext =
    String(
      item.hierarchyContext ||
      buildNoscaHierarchyContext_(item.folderPath || '')
    ).trim();

  const generatedKeywords =
    generateNoscaMetadataKeywords_(
      item.name,
      item.folderPath,
      hierarchyContext,
      documentType,
      fileFormat,
      itemType
    );

  // Manual Keywords are the only editable keyword field preserved across a
  // full refresh. Generated Keywords always follow the live Drive hierarchy.
  const manualKeywords =
    previous && previous.manualKeywords
      ? previous.manualKeywords
      : '';

  let notes = previous ? previous.notes : '';

  if (isFolder) {
    if (!previous || previous.status !== NOSCA_CONFIG.statuses.active) {
      notes =
        'Drive folder indexed as a navigation result. Child files inherit ' +
        'this directory hierarchy as retrieval context.';
    }
  } else if (!supported) {
    if (
      !previous ||
      previous.status === NOSCA_CONFIG.statuses.skipped ||
      !notes
    ) {
      notes =
        'Source type is indexed as metadata only in the current MVP. ' +
        'It can still be surfaced for document-location requests, but ' +
        'content extraction is not yet enabled for this MIME type.';
    }
  } else if (
    previous &&
    (
      previous.status === NOSCA_CONFIG.statuses.skipped ||
      previous.status === NOSCA_CONFIG.statuses.unsupported
    )
  ) {
    notes = '';
  }

  return {
    fileId: item.id,
    itemType: itemType,
    fileName: item.name,
    folderPath: item.folderPath,
    hierarchyContext: hierarchyContext,
    documentType: documentType,
    fileFormat: fileFormat,
    mimeType: item.mimeType,
    modifiedAt: normalizeNoscaComparableDate_(item.modifiedTime),
    driveUrl: item.driveUrl,
    generatedKeywords: generatedKeywords,
    manualKeywords: manualKeywords,
    keywords: [
      generatedKeywords,
      manualKeywords
    ].filter(Boolean).join(', '),
    indexedAt: indexedAt,
    status: status,
    notes: notes
  };
}

function hasNoscaIndexMetadataChanged_(previous, next) {
  return (
    previous.itemType !== next.itemType ||
    previous.fileName !== next.fileName ||
    previous.folderPath !== next.folderPath ||
    previous.hierarchyContext !== next.hierarchyContext ||
    previous.documentType !== next.documentType ||
    previous.fileFormat !== next.fileFormat ||
    previous.mimeType !== next.mimeType ||
    previous.modifiedAt !== next.modifiedAt ||
    previous.driveUrl !== next.driveUrl ||
    previous.generatedKeywords !== next.generatedKeywords ||
    previous.status !== next.status
  );
}

function noscaIndexRecordToRow_(record) {
  return [
    record.fileId,
    record.itemType,
    record.fileName,
    record.folderPath,
    record.hierarchyContext,
    record.documentType,
    record.fileFormat,
    record.mimeType,
    toNoscaSheetDate_(record.modifiedAt),
    record.driveUrl,
    record.generatedKeywords,
    record.manualKeywords,
    record.indexedAt || '',
    record.status,
    record.notes
  ];
}

function toNoscaSheetDate_(value) {
  if (!value) return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  const parsed = new Date(value);

  return isNaN(parsed.getTime()) ? '' : parsed;
}

function compareNoscaIndexRecords_(a, b) {
  const aSkipped = a.status === NOSCA_CONFIG.statuses.skipped ? 1 : 0;
  const bSkipped = b.status === NOSCA_CONFIG.statuses.skipped ? 1 : 0;

  if (aSkipped !== bSkipped) {
    return aSkipped - bSkipped;
  }

  const pathCompare = String(a.folderPath || '').localeCompare(
    String(b.folderPath || '')
  );

  if (pathCompare !== 0) {
    return pathCompare;
  }

  return String(a.fileName || '').localeCompare(
    String(b.fileName || '')
  );
}

/**
 * Classifies a file into the document families NOSCA users care about.
 *
 * Classification is deterministic and metadata-only:
 * - EE: effort-estimate signals in name/path
 * - Presentation: Google Slides / PowerPoint
 * - Proposal: proposal/bid/RFP/RFI/RFQ signals on document-like files
 * - fallback categories by file format
 */
function classifyNoscaDocumentType_(file) {
  const type = NOSCA_CONFIG.documentTypes;

  if (
    String(file && file.itemType || '') === NOSCA_CONFIG.itemTypes.folder ||
    String(file && file.mimeType || '') === NOSCA_CONFIG.mimeTypes.folder
  ) {
    return type.folder;
  }

  const format = getNoscaFileFormat_(file);
  const searchable = normalizeNoscaClassificationText_(
    String(file && file.name || '') +
    ' ' +
    String(file && file.folderPath || '')
  );

  if (hasNoscaEeSignal_(searchable)) {
    return type.ee;
  }

  if (
    format === NOSCA_CONFIG.fileFormats.googleSlides ||
    format === NOSCA_CONFIG.fileFormats.powerpoint
  ) {
    return type.presentation;
  }

  if (
    hasNoscaProposalSignal_(searchable) &&
    isNoscaProposalCapableFormat_(format)
  ) {
    return type.proposal;
  }

  if (
    format === NOSCA_CONFIG.fileFormats.googleSheet ||
    format === NOSCA_CONFIG.fileFormats.excel ||
    format === NOSCA_CONFIG.fileFormats.csv
  ) {
    return type.spreadsheet;
  }

  if (
    format === NOSCA_CONFIG.fileFormats.googleDoc ||
    format === NOSCA_CONFIG.fileFormats.word
  ) {
    return type.document;
  }

  if (format === NOSCA_CONFIG.fileFormats.pdf) {
    return type.pdf;
  }

  if (format === NOSCA_CONFIG.fileFormats.text) {
    return type.text;
  }

  return type.other;
}

/**
 * Friendly file-format label derived from MIME type.
 */
function getNoscaFileFormat_(file) {
  const mime = String(file && file.mimeType || '');
  const m = NOSCA_CONFIG.mimeTypes;
  const f = NOSCA_CONFIG.fileFormats;

  if (mime === m.folder) return f.folder;
  if (mime === m.document) return f.googleDoc;
  if (mime === m.spreadsheet) return f.googleSheet;
  if (mime === m.presentation) return f.googleSlides;
  if (mime === m.word || mime === m.wordLegacy) return f.word;
  if (mime === m.excel || mime === m.excelLegacy) return f.excel;
  if (
    mime === m.powerpoint ||
    mime === m.powerpointLegacy
  ) {
    return f.powerpoint;
  }
  if (mime === m.pdf) return f.pdf;
  if (mime === m.csv) return f.csv;
  if (mime === m.text) return f.text;

  return f.other;
}

function normalizeNoscaClassificationText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_/\\|()[\]{}:,;!?'"`~*=<>.+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasNoscaEeSignal_(normalizedText) {
  const padded = ' ' + String(normalizedText || '') + ' ';

  return (
    padded.indexOf(' effort estimate ') !== -1 ||
    padded.indexOf(' effort estimation ') !== -1 ||
    padded.indexOf(' engineering estimate ') !== -1 ||
    /(^|\s)ee(\s|$)/.test(String(normalizedText || ''))
  );
}

function hasNoscaProposalSignal_(normalizedText) {
  const value = ' ' + String(normalizedText || '') + ' ';

  const signals = [
    ' proposal ',
    ' technical proposal ',
    ' commercial proposal ',
    ' bid ',
    ' bid response ',
    ' bid document ',
    ' tender ',
    ' tender response ',
    ' rfp ',
    ' rfp response ',
    ' rfi ',
    ' rfi response ',
    ' rfq ',
    ' rfq response ',
    ' response to rfp ',
    ' response to rfi ',
    ' response to rfq '
  ];

  return signals.some(function (signal) {
    return value.indexOf(signal) !== -1;
  });
}

function isNoscaProposalCapableFormat_(format) {
  const f = NOSCA_CONFIG.fileFormats;

  return (
    format === f.googleDoc ||
    format === f.word ||
    format === f.pdf ||
    format === f.text
  );
}

/**
 * Creates lightweight retrieval keywords from metadata and classification.
 * Manually edited Keywords values are preserved on later refreshes.
 */
function generateNoscaMetadataKeywords_(
  itemName,
  folderPath,
  hierarchyContext,
  documentType,
  fileFormat,
  itemType
) {
  const stopWords = {
    a: true,
    an: true,
    and: true,
    are: true,
    as: true,
    at: true,
    by: true,
    for: true,
    from: true,
    in: true,
    of: true,
    on: true,
    or: true,
    the: true,
    to: true,
    with: true
  };

  const raw =
    String(itemName || '')
      .replace(/\.[a-z0-9]{1,8}$/i, ' ') +
    ' ' +
    String(folderPath || '') +
    ' ' +
    String(hierarchyContext || '') +
    ' ' +
    String(documentType || '') +
    ' ' +
    String(fileFormat || '') +
    ' ' +
    String(itemType || '') +
    ' ' +
    getNoscaDocumentTypeKeywordAliases_(
      documentType,
      fileFormat,
      itemType
    ) +
    ' ' +
    getNoscaMetadataAliasKeywords_(
      itemName,
      folderPath,
      hierarchyContext
    );

  const parts = raw
    .toLowerCase()
    .replace(/[^a-z0-9&+#.-]+/g, ' ')
    .split(/\s+/)
    .map(function (value) {
      return value.trim();
    })
    .filter(function (value) {
      return (
        value &&
        value.length > 1 &&
        !stopWords[value]
      );
    });

  const seen = {};
  const keywords = [];

  parts.forEach(function (value) {
    if (seen[value]) return;
    seen[value] = true;
    keywords.push(value);
  });

  return keywords.slice(0, 60).join(', ');
}

function getNoscaDocumentTypeKeywordAliases_(
  documentType,
  fileFormat,
  itemType
) {
  const type = String(documentType || '');
  const format = String(fileFormat || '');
  const kind = String(itemType || '');
  const d = NOSCA_CONFIG.documentTypes;
  const f = NOSCA_CONFIG.fileFormats;
  const aliases = [];

  if (
    kind === NOSCA_CONFIG.itemTypes.folder ||
    type === d.folder
  ) {
    aliases.push('folder directory location path');
  } else if (type === d.ee) {
    aliases.push('ee effort estimate estimation');
  } else if (type === d.proposal) {
    aliases.push('proposal bid rfp rfi rfq tender response');
  } else if (type === d.presentation) {
    aliases.push('presentation deck slides ppt pptx');
  } else if (type === d.spreadsheet) {
    aliases.push('spreadsheet sheet excel xls xlsx');
  } else if (type === d.document) {
    aliases.push('document doc docx word');
  } else if (type === d.pdf) {
    aliases.push('pdf document');
  }

  if (format === f.googleSheet) aliases.push('google sheet');
  if (format === f.googleDoc) aliases.push('google doc');
  if (format === f.googleSlides) aliases.push('google slides');
  if (format === f.word) aliases.push('word docx');
  if (format === f.excel) aliases.push('excel xlsx');
  if (format === f.powerpoint) aliases.push('powerpoint ppt pptx');

  return aliases.join(' ');
}

function getNoscaMetadataAliasKeywords_(
  itemName,
  folderPath,
  hierarchyContext
) {
  const aliases = NOSCA_CONFIG.metadataAliases || [];
  const searchable = normalizeNoscaClassificationText_(
    String(itemName || '') +
    ' ' +
    String(folderPath || '') +
    ' ' +
    String(hierarchyContext || '')
  );
  const additions = [];

  aliases.forEach(function (rule) {
    const matchAny =
      rule && Array.isArray(rule.matchAny)
        ? rule.matchAny
        : [];
    const add =
      rule && Array.isArray(rule.add)
        ? rule.add
        : [];

    const matched = matchAny.some(function (term) {
      const normalizedTerm =
        normalizeNoscaClassificationText_(term);

      return (
        normalizedTerm &&
        searchable.indexOf(normalizedTerm) !== -1
      );
    });

    if (matched) {
      Array.prototype.push.apply(additions, add);
    }
  });

  return additions.join(' ');
}

