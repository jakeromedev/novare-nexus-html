/**
 * Ask NOSCA — Google Drive discovery
 *
 * Requires the Advanced Drive Service:
 * Apps Script Editor > Services > + > Drive API > Add
 *
 * Uses Drive API v3-compatible methods so shared-drive content can be
 * traversed with supportsAllDrives/includeItemsFromAllDrives.
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
 * Recursively discovers files below the configured NOSCA knowledge root.
 *
 * Folders themselves are not written to NOSCA_Index. Their names are used
 * to build Folder Path values for discovered files.
 *
 * @return {{
 *   root: Object,
 *   files: Object[],
 *   folderCount: number,
 *   elapsedMs: number
 * }}
 */
function scanNoscaKnowledgeTree_() {
  assertNoscaAdvancedDriveService_();

  const startedAt = Date.now();
  const deadline =
    startedAt + Number(NOSCA_CONFIG.scanExecutionBudgetMs || 240000);

  const root = getNoscaDriveItem_(NOSCA_CONFIG.knowledgeRootId);

  if (!root || root.mimeType !== NOSCA_CONFIG.mimeTypes.folder) {
    throw new Error(
      'Configured NOSCA knowledge root is not an accessible Drive folder.'
    );
  }

  const rootPath = '/' + sanitizeNoscaPathPart_(root.name || 'NOSCA Knowledge');

  const foldersToVisit = [
    {
      id: root.id,
      path: rootPath
    }
  ];

  const files = [];
  let folderCount = 0;

  while (foldersToVisit.length) {
    assertNoscaScanBudget_(startedAt, deadline, files.length);

    const currentFolder = foldersToVisit.shift();
    folderCount += 1;

    let pageToken = null;

    do {
      assertNoscaScanBudget_(startedAt, deadline, files.length);

      const page = listNoscaFolderChildren_(
        currentFolder.id,
        NOSCA_CONFIG.drivePageSize,
        pageToken
      );

      page.items.forEach(function (item) {
        assertNoscaScanBudget_(startedAt, deadline, files.length);

        if (item.mimeType === NOSCA_CONFIG.mimeTypes.folder) {
          foldersToVisit.push({
            id: item.id,
            path:
              currentFolder.path +
              '/' +
              sanitizeNoscaPathPart_(item.name || 'Untitled Folder')
          });

          return;
        }

        files.push(
          normalizeNoscaDriveFile_(item, currentFolder.path)
        );

        if (files.length > NOSCA_CONFIG.maxIndexedFilesPerRun) {
          throw new Error(
            'Ask NOSCA scan stopped because the configured maximum of ' +
            NOSCA_CONFIG.maxIndexedFilesPerRun +
            ' files was exceeded. Narrow the knowledge scope or increase ' +
            'maxIndexedFilesPerRun deliberately.'
          );
        }
      });

      pageToken = page.nextPageToken || null;
    } while (pageToken);
  }

  const result = {
    root: {
      id: root.id,
      name: root.name || '',
      path: rootPath,
      driveId: root.driveId || ''
    },
    files: files,
    folderCount: folderCount,
    elapsedMs: Date.now() - startedAt
  };

  console.log(
    '[Ask NOSCA] Drive scan complete. Folders:',
    folderCount,
    '| Files:',
    files.length,
    '| Elapsed ms:',
    result.elapsedMs
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

/**
 * Stops large scans before the Apps Script execution deadline is reached.
 */
function assertNoscaScanBudget_(startedAt, deadline, fileCount) {
  if (Date.now() <= deadline) {
    return;
  }

  throw new Error(
    'Ask NOSCA Drive scan reached its safety execution budget after ' +
    fileCount +
    ' discovered files and ' +
    (Date.now() - startedAt) +
    ' ms. No partial index was written. Narrow the source scope or ' +
    'implement batched continuation before indexing a larger corpus.'
  );
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
