/**
 * Ask NOSCA — Test Exercises
 *
 * Purpose:
 * Keep manual/admin diagnostics separate from production Ask NOSCA functions.
 *
 * Exercise 01:
 * Locate a known Google Sheet directly in Drive using the Advanced Drive
 * Service, resolve its path back to the configured NOSCA knowledge root,
 * identify the requested sheet tab, and compare the live Drive file against
 * the current NOSCA_Index.
 *
 * This test is READ-ONLY:
 * - does not modify the source file
 * - does not modify NOSCA_Index
 * - does not call Gemini
 */

/**
 * EXERCISE 01
 *
 * Known file:
 * https://docs.google.com/spreadsheets/d/
 * 1pMqPZkX-vVoPh0IiV3xPnVxuc3CPohqmpvrCXy4deQg/
 * edit?gid=1595702941#gid=1595702941
 *
 * Run this function manually from the Apps Script function dropdown.
 *
 * @return {Object}
 */
function testNoscaExercise01FindKnownDriveFile() {
  const testUrl =
    'https://docs.google.com/spreadsheets/d/' +
    '1pMqPZkX-vVoPh0IiV3xPnVxuc3CPohqmpvrCXy4deQg/' +
    'edit?gid=1595702941#gid=1595702941';

  const expectedFileId =
    '1pMqPZkX-vVoPh0IiV3xPnVxuc3CPohqmpvrCXy4deQg';

  const expectedGid = 1595702941;

  console.log(
    '[Ask NOSCA][Exercise 01] Started | fileId=' + expectedFileId
  );

  assertNoscaAdvancedDriveService_();

  const parsedFileId = extractNoscaDriveFileIdFromUrl_(testUrl);

  if (parsedFileId !== expectedFileId) {
    throw new Error(
      'Exercise 01 failed before Drive lookup: parsed file ID did not ' +
      'match the expected file ID.'
    );
  }

  const file = getNoscaDriveItem_(expectedFileId);

  if (!file || !file.id) {
    throw new Error(
      'Exercise 01 could not find the requested Drive file.'
    );
  }

  console.log(
    '[Ask NOSCA][Exercise 01] Drive file found | name=' +
    String(file.name || '') +
    ' | mimeType=' +
    String(file.mimeType || '') +
    ' | driveId=' +
    String(file.driveId || '')
  );

  const pathResult = resolveNoscaDrivePathToKnowledgeRoot_(file);

  console.log(
    '[Ask NOSCA][Exercise 01] Path resolved | underKnowledgeRoot=' +
    pathResult.underKnowledgeRoot +
    ' | path=' +
    pathResult.path
  );

  const tabResult = inspectNoscaSpreadsheetTab_(file, expectedGid);

  if (tabResult.applicable) {
    console.log(
      '[Ask NOSCA][Exercise 01] Spreadsheet tab | gid=' +
      expectedGid +
      ' | found=' +
      tabResult.found +
      ' | name=' +
      String(tabResult.name || '')
    );
  }

  const indexResult = inspectNoscaIndexForFile_(expectedFileId);

  console.log(
    '[Ask NOSCA][Exercise 01] NOSCA_Index lookup | indexed=' +
    indexResult.indexed +
    (
      indexResult.indexed
        ? ' | status=' +
          String(indexResult.record.status || '') +
          ' | indexedPath=' +
          String(indexResult.record.folderPath || '')
        : ''
    )
  );

  const result = {
    ok: true,
    exercise: '01',
    testPurpose:
      'Find a known Drive file and compare live Drive metadata with NOSCA_Index.',
    sourceUrl: testUrl,
    file: {
      id: String(file.id || ''),
      name: String(file.name || ''),
      mimeType: String(file.mimeType || ''),
      modifiedTime: String(file.modifiedTime || ''),
      webViewLink:
        String(file.webViewLink || '') ||
        'https://drive.google.com/open?id=' +
          encodeURIComponent(String(file.id || '')),
      driveId: String(file.driveId || ''),
      parents: Array.isArray(file.parents) ? file.parents.slice() : []
    },
    location: pathResult,
    requestedSheetTab: tabResult,
    index: indexResult
  };

  console.log(
    '[Ask NOSCA][Exercise 01] Complete | found=true' +
    ' | underKnowledgeRoot=' +
    result.location.underKnowledgeRoot +
    ' | indexed=' +
    result.index.indexed
  );

  console.log(
    '[Ask NOSCA][Exercise 01] Result JSON: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


/**
 * Extracts a Google Drive/Docs file ID from a supported URL.
 *
 * @param {string} url
 * @return {string}
 */
function extractNoscaDriveFileIdFromUrl_(url) {
  const value = String(url || '').trim();

  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    const match = value.match(patterns[i]);

    if (match && match[1]) {
      return match[1];
    }
  }

  throw new Error(
    'Could not extract a Google Drive file ID from the supplied URL.'
  );
}


/**
 * Walks upward from a live Drive file until the configured NOSCA knowledge
 * root is reached or the parent chain ends.
 *
 * The returned path is based on live Drive metadata, not NOSCA_Index.
 *
 * @param {Object} file
 * @return {Object}
 */
function resolveNoscaDrivePathToKnowledgeRoot_(file) {
  const rootId = String(NOSCA_CONFIG.knowledgeRootId || '').trim();

  if (!rootId) {
    throw new Error('NOSCA_CONFIG.knowledgeRootId is not configured.');
  }

  const names = [sanitizeNoscaPathPart_(file.name || 'Untitled')];
  const ids = [String(file.id || '')];
  const visited = {};
  let current = file;
  let underKnowledgeRoot = String(file.id || '') === rootId;
  let stoppedReason = underKnowledgeRoot ? 'root_is_target' : '';

  visited[String(file.id || '')] = true;

  for (let depth = 0; !underKnowledgeRoot && depth < 100; depth += 1) {
    const parents = Array.isArray(current.parents)
      ? current.parents
      : [];

    if (!parents.length) {
      stoppedReason = 'no_parent';
      break;
    }

    const parentId = String(parents[0] || '').trim();

    if (!parentId) {
      stoppedReason = 'blank_parent';
      break;
    }

    if (visited[parentId]) {
      stoppedReason = 'parent_cycle';
      break;
    }

    visited[parentId] = true;

    const parent = getNoscaDriveItem_(parentId);

    names.unshift(
      sanitizeNoscaPathPart_(parent.name || 'Untitled Folder')
    );
    ids.unshift(String(parent.id || ''));

    if (String(parent.id || '') === rootId) {
      underKnowledgeRoot = true;
      stoppedReason = 'knowledge_root_reached';
      break;
    }

    current = parent;
  }

  if (!stoppedReason) {
    stoppedReason = underKnowledgeRoot
      ? 'knowledge_root_reached'
      : 'depth_limit';
  }

  return {
    underKnowledgeRoot: underKnowledgeRoot,
    knowledgeRootId: rootId,
    path: '/' + names.join('/'),
    pathIds: ids,
    stoppedReason: stoppedReason
  };
}


/**
 * For a Google Sheet file, confirms whether the requested gid exists and
 * returns its tab name.
 *
 * @param {Object} file
 * @param {number|string} gid
 * @return {Object}
 */
function inspectNoscaSpreadsheetTab_(file, gid) {
  const spreadsheetMime =
    NOSCA_CONFIG.mimeTypes.spreadsheet;

  if (String(file.mimeType || '') !== spreadsheetMime) {
    return {
      applicable: false,
      gid: Number(gid),
      found: false,
      name: ''
    };
  }

  const spreadsheet = SpreadsheetApp.openById(String(file.id || ''));
  const sheets = spreadsheet.getSheets();
  const targetGid = Number(gid);
  let matchedSheet = null;

  for (let i = 0; i < sheets.length; i += 1) {
    if (Number(sheets[i].getSheetId()) === targetGid) {
      matchedSheet = sheets[i];
      break;
    }
  }

  return {
    applicable: true,
    gid: targetGid,
    found: Boolean(matchedSheet),
    name: matchedSheet ? matchedSheet.getName() : '',
    spreadsheetName: spreadsheet.getName(),
    sheetCount: sheets.length
  };
}


/**
 * Checks whether a live Drive file already exists in NOSCA_Index.
 * Read-only.
 *
 * @param {string} fileId
 * @return {Object}
 */
function inspectNoscaIndexForFile_(fileId) {
  const existing = loadNoscaExistingIndex_();
  const record = existing[String(fileId || '').trim()] || null;

  if (!record) {
    return {
      indexed: false,
      record: null
    };
  }

  return {
    indexed: true,
    record: {
      fileId: record.fileId || '',
      itemType: record.itemType || '',
      fileName: record.fileName || '',
      folderPath: record.folderPath || '',
      hierarchyContext: record.hierarchyContext || '',
      documentType: record.documentType || '',
      fileFormat: record.fileFormat || '',
      mimeType: record.mimeType || '',
      modifiedAt: record.modifiedAt || '',
      driveUrl: record.driveUrl || '',
      generatedKeywords: record.generatedKeywords || '',
      manualKeywords: record.manualKeywords || '',
      indexedAt: record.indexedAt || '',
      status: record.status || '',
      notes: record.notes || ''
    }
  };
}


/**
 * EXERCISE 02
 *
 * Verifies the new document-classification logic against the known PJL
 * Cash Hub Renewal EE from Exercise 01.
 *
 * Expected:
 *   Document Type = EE
 *   File Format   = Google Sheet
 *
 * Read-only. Does not update NOSCA_Index and does not call Gemini.
 *
 * @return {Object}
 */
function testNoscaExercise02ClassifyKnownPjlEe() {
  const fileId =
    '1pMqPZkX-vVoPh0IiV3xPnVxuc3CPohqmpvrCXy4deQg';

  console.log(
    '[Ask NOSCA][Exercise 02] Started | fileId=' + fileId
  );

  assertNoscaAdvancedDriveService_();

  const file = getNoscaDriveItem_(fileId);
  const pathResult = resolveNoscaDrivePathToKnowledgeRoot_(file);

  const classificationInput = {
    id: file.id,
    name: file.name || '',
    mimeType: file.mimeType || '',
    folderPath: pathResult.path || ''
  };

  const documentType =
    classifyNoscaDocumentType_(classificationInput);
  const fileFormat =
    getNoscaFileFormat_(classificationInput);

  const expectedDocumentType =
    NOSCA_CONFIG.documentTypes.ee;
  const expectedFileFormat =
    NOSCA_CONFIG.fileFormats.googleSheet;

  const generatedKeywords =
    generateNoscaMetadataKeywords_(
      file.name || '',
      pathResult.path || '',
      buildNoscaHierarchyContext_(pathResult.path || ''),
      documentType,
      fileFormat,
      NOSCA_CONFIG.itemTypes.file
    );

  const hasPjlAlias =
    generatedKeywords
      .split(',')
      .map(function (value) {
        return String(value || '').trim().toLowerCase();
      })
      .indexOf('pjl') !== -1;

  const result = {
    ok:
      documentType === expectedDocumentType &&
      fileFormat === expectedFileFormat &&
      hasPjlAlias,
    exercise: '02',
    fileId: file.id,
    fileName: file.name || '',
    folderPath: pathResult.path || '',
    documentType: documentType,
    fileFormat: fileFormat,
    generatedKeywords: generatedKeywords,
    hasPjlAlias: hasPjlAlias,
    expectedDocumentType: expectedDocumentType,
    expectedFileFormat: expectedFileFormat
  };

  console.log(
    '[Ask NOSCA][Exercise 02] Classification | documentType=' +
    documentType +
    ' | fileFormat=' +
    fileFormat +
    ' | hasPjlAlias=' +
    hasPjlAlias +
    ' | passed=' +
    result.ok
  );

  console.log(
    '[Ask NOSCA][Exercise 02] Result JSON: ' +
    JSON.stringify(result, null, 2)
  );

  if (!result.ok) {
    throw new Error(
      'Exercise 02 classification failed. Expected "' +
      expectedDocumentType +
      '" / "' +
      expectedFileFormat +
      '", received "' +
      documentType +
      '" / "' +
      fileFormat +
      '".'
    );
  }

  return result;
}


/**
 * EXERCISE 03
 *
 * Validates hierarchy-aware indexing against the known PJL Cash Hub Renewal
 * folder supplied during development:
 *
 * https://drive.google.com/drive/folders/
 * 1wEglxSf8g12ozpVeXwMr7efltl6Am4O4
 *
 * It proves that:
 * - the folder itself can be indexed
 * - the full ancestor breadcrumb becomes Hierarchy Context
 * - child files inherit PJL / CashHub / Renewal context
 * - the query "PJL 3-year renewal cashhub documents" filters by contextual
 *   coverage instead of accepting unrelated "renewal" files
 *
 * Read-only. Does not change NOSCA_Index and does not call Gemini.
 */
function testNoscaExercise03PjlCashHubHierarchy() {
  const folderId =
    '1wEglxSf8g12ozpVeXwMr7efltl6Am4O4';

  const question =
    'give me PJL 3-year renewal cashhub documents';

  console.log(
    '[Ask NOSCA][Exercise 03] Started | folderId=' +
    folderId
  );

  assertNoscaAdvancedDriveService_();

  const folder = getNoscaDriveItem_(folderId);

  if (
    !folder ||
    folder.mimeType !== NOSCA_CONFIG.mimeTypes.folder
  ) {
    throw new Error(
      'Exercise 03 target is not an accessible Drive folder.'
    );
  }

  const pathResult =
    resolveNoscaDrivePathToKnowledgeRoot_(folder);

  const folderRecord =
    normalizeNoscaDriveFolder_(
      folder,
      pathResult.path
    );

  const page =
    listNoscaFolderChildren_(folderId, 100);

  const candidateItems = [folderRecord];

  page.items.forEach(function (item) {
    if (
      item.mimeType === NOSCA_CONFIG.mimeTypes.folder
    ) {
      candidateItems.push(
        normalizeNoscaDriveFolder_(
          item,
          pathResult.path +
          '/' +
          sanitizeNoscaPathPart_(
            item.name || 'Untitled Folder'
          )
        )
      );
      return;
    }

    candidateItems.push(
      normalizeNoscaDriveFile_(
        item,
        pathResult.path
      )
    );
  });

  const query = normalizeNoscaQuery_(question);

  const scored = candidateItems
    .map(function (item) {
      const record =
        buildNoscaIndexRecord_(
          item,
          null,
          new Date()
        );

      const score =
        scoreNoscaMetadataRecord_(
          record,
          query
        );

      const coverage =
        evaluateNoscaLookupCoverage_(
          record,
          query,
          [],
          []
        );

      return {
        itemType: record.itemType,
        itemName: record.fileName,
        folderPath: record.folderPath,
        hierarchyContext:
          record.hierarchyContext,
        documentType: record.documentType,
        fileFormat: record.fileFormat,
        metadataScore: score.score,
        coverage: coverage.ratio,
        matchedTerms: coverage.matchedTerms,
        requiredAnchors:
          coverage.requiredAnchors,
        missingAnchors:
          coverage.missingAnchors,
        passesContext:
          coverage.passes
      };
    })
    .sort(function (a, b) {
      if (b.coverage !== a.coverage) {
        return b.coverage - a.coverage;
      }

      return b.metadataScore - a.metadataScore;
    });

  const passing =
    scored.filter(function (item) {
      return item.passesContext;
    });

  const folderPasses =
    passing.some(function (item) {
      return (
        item.itemType === NOSCA_CONFIG.itemTypes.folder &&
        item.itemName === folder.name
      );
    });

  const result = {
    ok:
      pathResult.underKnowledgeRoot === true &&
      folderPasses &&
      passing.length > 0,
    exercise: '03',
    question: question,
    folder: {
      id: folder.id,
      name: folder.name || '',
      path: pathResult.path,
      hierarchyContext:
        buildNoscaHierarchyContext_(
          pathResult.path
        )
    },
    childCountSampled: page.items.length,
    passingResults: passing.slice(0, 20),
    rejectedResults: scored
      .filter(function (item) {
        return !item.passesContext;
      })
      .slice(0, 10)
  };

  console.log(
    '[Ask NOSCA][Exercise 03] Hierarchy | path=' +
    result.folder.path +
    ' | context=' +
    result.folder.hierarchyContext +
    ' | passing=' +
    result.passingResults.length +
    ' | passed=' +
    result.ok
  );

  console.log(
    '[Ask NOSCA][Exercise 03] Result JSON: ' +
    JSON.stringify(result, null, 2)
  );

  if (!result.ok) {
    throw new Error(
      'Exercise 03 hierarchy-aware retrieval test failed.'
    );
  }

  return result;
}
