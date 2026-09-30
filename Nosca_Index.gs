/**
 * Ask NOSCA — index orchestration.
 *
 * Recommended first run:
 *   1. testNoscaIndexConnections()
 *   2. previewNoscaKnowledgeFiles(20)
 *   3. refreshNoscaIndex()
 */

/**
 * Public diagnostic that validates both required Phase 1 connections.
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

  console.log('[Ask NOSCA] Phase 1 connectivity test passed:', result);

  return result;
}

/**
 * Public preview. Scans Drive but does not write to NOSCA_Index.
 *
 * @param {number=} limit
 * @return {Object}
 */
function previewNoscaKnowledgeFiles(limit) {
  const requestedLimit = Math.min(
    Math.max(Number(limit || 20), 1),
    100
  );

  const scan = scanNoscaKnowledgeTree_();

  return {
    ok: true,
    root: scan.root,
    folderCount: scan.folderCount,
    fileCount: scan.files.length,
    elapsedMs: scan.elapsedMs,
    preview: scan.files.slice(0, requestedLimit)
  };
}

/**
 * Public Phase 1 index refresh.
 *
 * - Recursively scans the configured knowledge root.
 * - Inserts new files.
 * - Updates files whose metadata changed.
 * - Preserves manually edited Keywords.
 * - Leaves unchanged rows' Indexed At timestamps untouched.
 * - Marks no-longer-present source files as Skipped instead of deleting them.
 * - Marks unsupported file types as Unsupported.
 *
 * @return {Object} refresh summary
 */
function refreshNoscaIndex() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(3000)) {
    throw new Error(
      'Another Ask NOSCA index refresh is already running. Try again shortly.'
    );
  }

  const startedAt = Date.now();

  try {
    testNoscaDataSheetAccess();

    const existing = loadNoscaExistingIndex_();
    const scan = scanNoscaKnowledgeTree_();
    const now = new Date();

    const discoveredIds = {};
    const finalRecords = [];

    const summary = {
      ok: false,
      rootName: scan.root.name,
      foldersScanned: scan.folderCount,
      filesDiscovered: scan.files.length,
      newFiles: 0,
      updatedFiles: 0,
      unchangedFiles: 0,
      unsupportedFiles: 0,
      removedFiles: 0,
      writtenRows: 0,
      elapsedMs: 0
    };

    scan.files.forEach(function (file) {
      discoveredIds[file.id] = true;

      const previous = existing[file.id] || null;
      const next = buildNoscaIndexRecord_(file, previous, now);
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

      if (previous && !changed && previous.indexedAt) {
        next.indexedAt = previous.indexedAt;
      }

      finalRecords.push(next);
    });

    Object.keys(existing).forEach(function (fileId) {
      if (discoveredIds[fileId]) {
        return;
      }

      const previous = existing[fileId];

      finalRecords.push({
        fileId: previous.fileId,
        fileName: previous.fileName,
        folderPath: previous.folderPath,
        mimeType: previous.mimeType,
        modifiedAt: previous.modifiedAt,
        driveUrl: previous.driveUrl,
        keywords: previous.keywords,
        indexedAt: now,
        status: NOSCA_CONFIG.statuses.skipped,
        notes:
          'Source file was not found under the configured Ask NOSCA ' +
          'knowledge root during the latest full scan.'
      });

      summary.removedFiles += 1;
    });

    finalRecords.sort(compareNoscaIndexRecords_);

    const rows = finalRecords.map(noscaIndexRecordToRow_);
    writeNoscaIndexRows_(rows);

    summary.writtenRows = rows.length;
    summary.elapsedMs = Date.now() - startedAt;
    summary.ok = true;

    console.log('[Ask NOSCA] NOSCA_Index refresh complete:', summary);

    return summary;
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

  let latestIndexedAt = null;

  Object.keys(existing).forEach(function (fileId) {
    const record = existing[fileId];
    const status = record.status;

    if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
      statusCounts[status] += 1;
    } else {
      statusCounts.Other += 1;
    }

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

  return {
    ok: true,
    rowCount: Object.keys(existing).length,
    statusCounts: statusCounts,
    latestIndexedAt:
      latestIndexedAt ? latestIndexedAt.toISOString() : ''
  };
}

function buildNoscaIndexRecord_(file, previous, indexedAt) {
  const supported = file.supported === true;

  const status = supported
    ? NOSCA_CONFIG.statuses.active
    : NOSCA_CONFIG.statuses.unsupported;

  let notes = previous ? previous.notes : '';

  if (!supported && !notes) {
    notes =
      'Source type is indexed as metadata only in the current MVP. ' +
      'Content extraction support can be added in a later phase.';
  }

  if (supported && previous && previous.status === NOSCA_CONFIG.statuses.skipped) {
    notes = '';
  }

  return {
    fileId: file.id,
    fileName: file.name,
    folderPath: file.folderPath,
    mimeType: file.mimeType,
    modifiedAt: normalizeNoscaComparableDate_(file.modifiedTime),
    driveUrl: file.driveUrl,
    keywords:
      previous && previous.keywords
        ? previous.keywords
        : generateNoscaMetadataKeywords_(file.name, file.folderPath),
    indexedAt: indexedAt,
    status: status,
    notes: notes
  };
}

function hasNoscaIndexMetadataChanged_(previous, next) {
  return (
    previous.fileName !== next.fileName ||
    previous.folderPath !== next.folderPath ||
    previous.mimeType !== next.mimeType ||
    previous.modifiedAt !== next.modifiedAt ||
    previous.driveUrl !== next.driveUrl ||
    previous.status !== next.status
  );
}

function noscaIndexRecordToRow_(record) {
  return [
    record.fileId,
    record.fileName,
    record.folderPath,
    record.mimeType,
    toNoscaSheetDate_(record.modifiedAt),
    record.driveUrl,
    record.keywords,
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
 * Creates lightweight retrieval keywords from metadata.
 * Manually edited Keywords values are preserved on later refreshes.
 */
function generateNoscaMetadataKeywords_(fileName, folderPath) {
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
    String(fileName || '')
      .replace(/\.[a-z0-9]{1,8}$/i, ' ') +
    ' ' +
    String(folderPath || '');

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

  return keywords.slice(0, 25).join(', ');
}
