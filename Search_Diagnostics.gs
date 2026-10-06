/**
 * Novare Nexus Global Search diagnostics.
 *
 * Run this function manually from the Apps Script editor:
 *   runNexusSearchDiagnostics
 */
function runNexusSearchDiagnostics() {
  const report = {
    startedAt: new Date().toISOString(),
    config: {},
    index: {},
    searches: []
  };

  console.log('[NEXUS SEARCH DIAG] Starting global-search diagnostics...');

  try {
    report.config = {
      spreadsheetId: NOSCA_CONFIG && NOSCA_CONFIG.dataSpreadsheetId
        ? NOSCA_CONFIG.dataSpreadsheetId
        : '',
      sheetName: NOSCA_CONFIG && NOSCA_CONFIG.sheets
        ? NOSCA_CONFIG.sheets.index
        : '',
      configuredSheetId:
        NOSCA_CONFIG && NOSCA_CONFIG.indexSheetId != null
          ? NOSCA_CONFIG.indexSheetId
          : null,
      expectedHeaderCount:
        NOSCA_CONFIG && Array.isArray(NOSCA_CONFIG.indexHeaders)
          ? NOSCA_CONFIG.indexHeaders.length
          : 0,
      expectedHeaders:
        NOSCA_CONFIG && Array.isArray(NOSCA_CONFIG.indexHeaders)
          ? NOSCA_CONFIG.indexHeaders.slice()
          : []
    };

    console.log(
      '[NEXUS SEARCH DIAG] Config:',
      JSON.stringify(report.config, null, 2)
    );
  } catch (error) {
    console.error(
      '[NEXUS SEARCH DIAG] Unable to read NOSCA_CONFIG:',
      error
    );
  }

  try {
    const sheet = getNoscaIndexSheet_();
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet
      .getRange(1, 1, 1, lastColumn)
      .getDisplayValues()[0];

    const existing = loadNoscaExistingIndex_();
    const ids = Object.keys(existing);
    const sample = ids.slice(0, 3).map(function (id) {
      const record = existing[id] || {};
      return {
        fileId: record.fileId || '',
        itemType: record.itemType || '',
        fileName: record.fileName || '',
        folderPath: record.folderPath || '',
        documentType: record.documentType || '',
        fileFormat: record.fileFormat || '',
        status: record.status || '',
        driveUrl: record.driveUrl || ''
      };
    });

    report.index = {
      sheetName: sheet.getName(),
      sheetId: sheet.getSheetId(),
      lastRow: sheet.getLastRow(),
      lastColumn: sheet.getLastColumn(),
      headers: headers,
      loadedRecordCount: ids.length,
      sample: sample
    };

    console.log(
      '[NEXUS SEARCH DIAG] Index:',
      JSON.stringify(report.index, null, 2)
    );
  } catch (error) {
    report.index.error =
      error && error.message ? error.message : String(error);

    console.error(
      '[NEXUS SEARCH DIAG] Index loading failed:',
      error
    );
  }

  const tests = [
    { query: 'Novare', filter: 'all' },
    { query: 'proposal', filter: 'all' },
    { query: 'Cebuana', filter: 'all' },
    { query: 'Novare', filter: 'drive' },
    { query: 'proposal', filter: 'docs' }
  ];

  tests.forEach(function (test) {
    try {
      const response = searchNexus(test);
      const result = {
        query: test.query,
        filter: test.filter,
        ok: Boolean(response && response.ok),
        totalMatches:
          response && Number(response.totalMatches || 0),
        returned:
          response && Number(response.returned || 0),
        counts:
          response && response.counts ? response.counts : {},
        elapsedMs:
          response && Number(response.elapsedMs || 0),
        sample:
          response && Array.isArray(response.results)
            ? response.results.slice(0, 5).map(function (item) {
                return {
                  name: item.name || '',
                  itemType: item.itemType || '',
                  documentType: item.documentType || '',
                  fileFormat: item.fileFormat || '',
                  relevanceScore: item.relevanceScore || 0,
                  driveUrl: item.driveUrl || ''
                };
              })
            : []
      };

      report.searches.push(result);

      console.log(
        '[NEXUS SEARCH DIAG] Search test:',
        JSON.stringify(result, null, 2)
      );
    } catch (error) {
      const result = {
        query: test.query,
        filter: test.filter,
        ok: false,
        error:
          error && error.message ? error.message : String(error)
      };

      report.searches.push(result);

      console.error(
        '[NEXUS SEARCH DIAG] Search test failed:',
        JSON.stringify(result, null, 2)
      );
    }
  });

  console.log(
    '[NEXUS SEARCH DIAG] Complete report:',
    JSON.stringify(report, null, 2)
  );

  return report;
}
