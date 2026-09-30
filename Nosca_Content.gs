/**
 * Ask NOSCA — Phase 2 content extraction
 *
 * Supported in this phase:
 * - Google Docs
 * - Google Slides
 * - Google Sheets
 * - Plain-text Drive files
 *
 * Full extracted text is intentionally NOT stored in NOSCA_Index.
 * Retrieval code in the next phase can call extractNoscaFileContent_()
 * only for the files it has selected as relevant.
 */

/**
 * Manual Apps Script diagnostic.
 *
 * Samples supported Active files from NOSCA_Index and verifies that their
 * content can be extracted. It returns only short previews, not full text.
 *
 * Run from the Apps Script editor:
 *
 *   testNoscaContentExtraction
 *
 * @return {Object}
 */
function testNoscaContentExtraction() {
  const startedAt = Date.now();
  const existing = loadNoscaExistingIndex_();

  const records = Object.keys(existing)
    .map(function (fileId) {
      return existing[fileId];
    })
    .filter(function (record) {
      return (
        record.status === NOSCA_CONFIG.statuses.active &&
        NOSCA_SUPPORTED_CONTENT_MIME_TYPES.indexOf(record.mimeType) !== -1
      );
    })
    .sort(function (a, b) {
      return String(a.folderPath || '').localeCompare(
        String(b.folderPath || '')
      ) || String(a.fileName || '').localeCompare(
        String(b.fileName || '')
      );
    });

  if (!records.length) {
    throw new Error(
      'No Active supported files were found in NOSCA_Index. ' +
      'Run refreshNoscaIndex() first.'
    );
  }

  const maxFiles = Math.min(
    Number(NOSCA_CONFIG.content.diagnosticMaxFiles || 8),
    records.length
  );

  const selected = selectNoscaDiagnosticSamples_(
    records,
    maxFiles
  );

  const results = selected.map(function (record) {
    try {
      const extraction = extractNoscaFileContent_(record);

      return {
        ok: true,
        fileId: record.fileId,
        fileName: record.fileName,
        mimeType: record.mimeType,
        charCount: extraction.charCount,
        truncated: extraction.truncated,
        warnings: extraction.warnings,
        preview: extraction.text.substring(
          0,
          NOSCA_CONFIG.content.diagnosticPreviewChars
        )
      };
    } catch (error) {
      return {
        ok: false,
        fileId: record.fileId,
        fileName: record.fileName,
        mimeType: record.mimeType,
        error: getNoscaErrorMessage_(error)
      };
    }
  });

  const passed = results.filter(function (item) {
    return item.ok;
  }).length;

  const failed = results.length - passed;

  const summary = {
    ok: failed === 0,
    filesTested: results.length,
    passed: passed,
    failed: failed,
    elapsedMs: Date.now() - startedAt,
    results: results
  };

  console.log(
    '[Ask NOSCA] Phase 2 content extraction test:',
    summary
  );

  return summary;
}

/**
 * Core reusable content extraction entry point.
 *
 * This function ends in "_" intentionally so it cannot be called directly
 * from google.script.run. Future retrieval code should call it server-side
 * only after selecting a source from the configured NOSCA corpus.
 *
 * @param {Object} record NOSCA_Index record
 * @return {{
 *   ok: boolean,
 *   fileId: string,
 *   fileName: string,
 *   mimeType: string,
 *   text: string,
 *   charCount: number,
 *   truncated: boolean,
 *   warnings: string[],
 *   extractedAt: string
 * }}
 */
function extractNoscaFileContent_(record) {
  validateNoscaExtractionRecord_(record);

  const mimeType = String(record.mimeType || '').trim();
  let rawResult;

  switch (mimeType) {
    case NOSCA_CONFIG.mimeTypes.document:
      rawResult = extractNoscaGoogleDoc_(record.fileId);
      break;

    case NOSCA_CONFIG.mimeTypes.presentation:
      rawResult = extractNoscaGoogleSlides_(record.fileId);
      break;

    case NOSCA_CONFIG.mimeTypes.spreadsheet:
      rawResult = extractNoscaGoogleSheet_(record.fileId);
      break;

    case NOSCA_CONFIG.mimeTypes.text:
      rawResult = extractNoscaPlainText_(record.fileId);
      break;

    default:
      throw new Error(
        'Unsupported Ask NOSCA content type: ' +
        (mimeType || '(blank MIME type)')
      );
  }

  const bounded = boundNoscaExtractedText_(
    rawResult.text || '',
    NOSCA_CONFIG.content.maxCharsPerFile
  );

  const warnings = []
    .concat(rawResult.warnings || [])
    .concat(bounded.warning ? [bounded.warning] : []);

  return {
    ok: true,
    fileId: record.fileId,
    fileName: record.fileName || '',
    mimeType: mimeType,
    text: bounded.text,
    charCount: bounded.text.length,
    truncated: bounded.truncated,
    warnings: warnings,
    extractedAt: new Date().toISOString()
  };
}

/**
 * Extracts Google Docs text.
 *
 * Supports modern tabbed Google Docs when getTabs() is available and falls
 * back to the traditional document body API for older/non-tabbed documents.
 */
function extractNoscaGoogleDoc_(fileId) {
  let document;

  try {
    document = DocumentApp.openById(fileId);
  } catch (error) {
    throw new Error(
      'Unable to open Google Doc "' +
      fileId +
      '". Original error: ' +
      getNoscaErrorMessage_(error)
    );
  }

  const sections = [];
  const warnings = [];

  try {
    if (
      typeof document.getTabs === 'function'
    ) {
      const tabs = document.getTabs();

      if (tabs && tabs.length) {
        tabs.forEach(function (tab) {
          appendNoscaDocumentTabText_(
            tab,
            sections,
            warnings,
            0
          );
        });
      }
    }
  } catch (error) {
    warnings.push(
      'Tabbed-document traversal failed; falling back to the primary body.'
    );
  }

  if (!sections.length) {
    try {
      const body = document.getBody();

      if (body) {
        const bodyText = normalizeNoscaExtractedText_(
          body.getText()
        );

        if (bodyText) {
          sections.push(bodyText);
        }
      }
    } catch (error) {
      throw new Error(
        'Unable to read Google Doc body "' +
        fileId +
        '". Original error: ' +
        getNoscaErrorMessage_(error)
      );
    }
  }

  // Add header/footer when available without making them fatal.
  try {
    if (typeof document.getHeader === 'function') {
      const header = document.getHeader();

      if (header) {
        const headerText = normalizeNoscaExtractedText_(
          header.getText()
        );

        if (headerText) {
          sections.unshift('[Header]\n' + headerText);
        }
      }
    }
  } catch (error) {
    warnings.push('Google Doc header could not be extracted.');
  }

  try {
    if (typeof document.getFooter === 'function') {
      const footer = document.getFooter();

      if (footer) {
        const footerText = normalizeNoscaExtractedText_(
          footer.getText()
        );

        if (footerText) {
          sections.push('[Footer]\n' + footerText);
        }
      }
    }
  } catch (error) {
    warnings.push('Google Doc footer could not be extracted.');
  }

  return {
    text: sections.join('\n\n'),
    warnings: warnings
  };
}

/**
 * Recursively reads a Google Docs tab when the tabbed-document API exists.
 */
function appendNoscaDocumentTabText_(tab, sections, warnings, depth) {
  if (!tab || depth > 20) {
    return;
  }

  try {
    let tabTitle = '';

    if (typeof tab.getTitle === 'function') {
      tabTitle = String(tab.getTitle() || '').trim();
    }

    if (
      typeof tab.asDocumentTab === 'function'
    ) {
      const documentTab = tab.asDocumentTab();

      if (
        documentTab &&
        typeof documentTab.getBody === 'function'
      ) {
        const body = documentTab.getBody();
        const text = body
          ? normalizeNoscaExtractedText_(body.getText())
          : '';

        if (text) {
          sections.push(
            (tabTitle ? '[Tab: ' + tabTitle + ']\n' : '') +
            text
          );
        }
      }
    }

    if (typeof tab.getChildTabs === 'function') {
      const children = tab.getChildTabs() || [];

      children.forEach(function (child) {
        appendNoscaDocumentTabText_(
          child,
          sections,
          warnings,
          depth + 1
        );
      });
    }
  } catch (error) {
    warnings.push(
      'A Google Doc tab could not be read: ' +
      getNoscaErrorMessage_(error)
    );
  }
}

/**
 * Extracts visible text from Google Slides.
 */
function extractNoscaGoogleSlides_(fileId) {
  let presentation;

  try {
    presentation = SlidesApp.openById(fileId);
  } catch (error) {
    throw new Error(
      'Unable to open Google Slides file "' +
      fileId +
      '". Original error: ' +
      getNoscaErrorMessage_(error)
    );
  }

  const slides = presentation.getSlides();
  const maxSlides = Math.min(
    slides.length,
    NOSCA_CONFIG.content.maxSlidesPerFile
  );

  const sections = [];
  const warnings = [];

  for (let index = 0; index < maxSlides; index += 1) {
    const slide = slides[index];
    const slideText = [];

    const elements = slide.getPageElements();

    elements.forEach(function (element) {
      appendNoscaSlideElementText_(
        element,
        slideText,
        warnings,
        0
      );
    });

    // Speaker notes are useful internal knowledge when present.
    try {
      if (
        typeof slide.getNotesPage === 'function'
      ) {
        const notesPage = slide.getNotesPage();

        if (
          notesPage &&
          typeof notesPage.getSpeakerNotesShape === 'function'
        ) {
          const notesShape = notesPage.getSpeakerNotesShape();

          if (
            notesShape &&
            typeof notesShape.getText === 'function'
          ) {
            const notes = normalizeNoscaExtractedText_(
              notesShape.getText().asString()
            );

            if (notes) {
              slideText.push('[Speaker Notes]\n' + notes);
            }
          }
        }
      }
    } catch (error) {
      warnings.push(
        'Speaker notes could not be extracted from slide ' +
        (index + 1) +
        '.'
      );
    }

    const normalized = normalizeNoscaExtractedText_(
      slideText.join('\n')
    );

    if (normalized) {
      sections.push(
        '[Slide ' +
        (index + 1) +
        ']\n' +
        normalized
      );
    }
  }

  if (slides.length > maxSlides) {
    warnings.push(
      'Slides extraction stopped after ' +
      maxSlides +
      ' slides out of ' +
      slides.length +
      '.'
    );
  }

  return {
    text: sections.join('\n\n'),
    warnings: warnings
  };
}

/**
 * Reads text from common Google Slides page-element types.
 */
function appendNoscaSlideElementText_(
  element,
  output,
  warnings,
  depth
) {
  if (!element || depth > 12) {
    return;
  }

  try {
    const type = element.getPageElementType();

    if (type === SlidesApp.PageElementType.SHAPE) {
      const shape = element.asShape();

      if (
        shape &&
        typeof shape.getText === 'function'
      ) {
        const text = normalizeNoscaExtractedText_(
          shape.getText().asString()
        );

        if (text) {
          output.push(text);
        }
      }

      return;
    }

    if (type === SlidesApp.PageElementType.TABLE) {
      const table = element.asTable();

      for (let r = 0; r < table.getNumRows(); r += 1) {
        const row = [];

        for (let c = 0; c < table.getNumColumns(); c += 1) {
          const cellText = normalizeNoscaExtractedText_(
            table
              .getCell(r, c)
              .getText()
              .asString()
          );

          row.push(cellText);
        }

        if (row.some(function (value) { return value; })) {
          output.push(row.join('\t'));
        }
      }

      return;
    }

    if (type === SlidesApp.PageElementType.GROUP) {
      const group = element.asGroup();

      group.getChildren().forEach(function (child) {
        appendNoscaSlideElementText_(
          child,
          output,
          warnings,
          depth + 1
        );
      });
    }
  } catch (error) {
    warnings.push(
      'A slide element could not be read: ' +
      getNoscaErrorMessage_(error)
    );
  }
}

/**
 * Extracts a bounded, human-readable representation of Google Sheets.
 *
 * Only used ranges are considered, and row/column/sheet limits are applied
 * before reading values to avoid loading giant workbooks into memory.
 */
function extractNoscaGoogleSheet_(fileId) {
  let spreadsheet;

  try {
    spreadsheet = SpreadsheetApp.openById(fileId);
  } catch (error) {
    throw new Error(
      'Unable to open Google Sheet "' +
      fileId +
      '". Original error: ' +
      getNoscaErrorMessage_(error)
    );
  }

  const sheets = spreadsheet.getSheets();
  const maxSheets = Math.min(
    sheets.length,
    NOSCA_CONFIG.content.maxSheetsPerFile
  );

  const sections = [];
  const warnings = [];

  for (let index = 0; index < maxSheets; index += 1) {
    const sheet = sheets[index];
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();

    if (!lastRow || !lastColumn) {
      continue;
    }

    const rowsToRead = Math.min(
      lastRow,
      NOSCA_CONFIG.content.maxRowsPerSheet
    );

    const columnsToRead = Math.min(
      lastColumn,
      NOSCA_CONFIG.content.maxColumnsPerSheet
    );

    const values = sheet
      .getRange(1, 1, rowsToRead, columnsToRead)
      .getDisplayValues();

    const rowText = [];

    values.forEach(function (row) {
      const normalizedCells = row.map(function (cell) {
        return String(cell || '')
          .replace(/\r?\n/g, ' ')
          .trim();
      });

      if (
        normalizedCells.some(function (cell) {
          return cell !== '';
        })
      ) {
        rowText.push(normalizedCells.join('\t'));
      }
    });

    if (rowText.length) {
      sections.push(
        '[Sheet: ' +
        sheet.getName() +
        ']\n' +
        rowText.join('\n')
      );
    }

    if (lastRow > rowsToRead) {
      warnings.push(
        'Sheet "' +
        sheet.getName() +
        '" was limited to the first ' +
        rowsToRead +
        ' rows out of ' +
        lastRow +
        '.'
      );
    }

    if (lastColumn > columnsToRead) {
      warnings.push(
        'Sheet "' +
        sheet.getName() +
        '" was limited to the first ' +
        columnsToRead +
        ' columns out of ' +
        lastColumn +
        '.'
      );
    }
  }

  if (sheets.length > maxSheets) {
    warnings.push(
      'Workbook extraction stopped after ' +
      maxSheets +
      ' sheets out of ' +
      sheets.length +
      '.'
    );
  }

  return {
    text: sections.join('\n\n'),
    warnings: warnings
  };
}

/**
 * Downloads a plain-text Drive file through Drive API v3.
 *
 * We use the script's OAuth token rather than publishing or sharing the file.
 */
function extractNoscaPlainText_(fileId) {
  assertNoscaAdvancedDriveService_();

  const metadata = getNoscaDriveItem_(fileId);

  if (
    String(metadata.mimeType || '') !==
    NOSCA_CONFIG.mimeTypes.text
  ) {
    throw new Error(
      'Plain-text extraction was requested for a non-text file.'
    );
  }

  const url =
    'https://www.googleapis.com/drive/v3/files/' +
    encodeURIComponent(fileId) +
    '?alt=media&supportsAllDrives=true';

  let response;

  try {
    response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        Authorization:
          'Bearer ' +
          ScriptApp.getOAuthToken()
      },
      muteHttpExceptions: true
    });
  } catch (error) {
    throw new Error(
      'Unable to download plain-text file "' +
      fileId +
      '". Original error: ' +
      getNoscaErrorMessage_(error)
    );
  }

  const code = response.getResponseCode();

  if (code < 200 || code >= 300) {
    throw new Error(
      'Plain-text Drive download failed with HTTP ' +
      code +
      '.'
    );
  }

  const blob = response.getBlob();
  const byteLength = blob.getBytes().length;

  if (
    byteLength >
    NOSCA_CONFIG.content.maxTextFileBytes
  ) {
    throw new Error(
      'Plain-text file is larger than the Phase 2 safety limit of ' +
      NOSCA_CONFIG.content.maxTextFileBytes +
      ' bytes.'
    );
  }

  return {
    text: blob.getDataAsString('UTF-8'),
    warnings: []
  };
}

/**
 * Ensures extraction is limited to records produced by NOSCA_Index.
 */
function validateNoscaExtractionRecord_(record) {
  if (!record || typeof record !== 'object') {
    throw new Error(
      'Ask NOSCA content extraction requires a valid index record.'
    );
  }

  const fileId = String(record.fileId || '').trim();

  if (!fileId) {
    throw new Error(
      'Ask NOSCA index record is missing File ID.'
    );
  }

  const mimeType = String(record.mimeType || '').trim();

  if (
    NOSCA_SUPPORTED_CONTENT_MIME_TYPES.indexOf(mimeType) === -1
  ) {
    throw new Error(
      'Ask NOSCA does not currently extract this MIME type: ' +
      (mimeType || '(blank)')
    );
  }
}

/**
 * Applies a hard character ceiling to extracted source text.
 */
function boundNoscaExtractedText_(text, maxChars) {
  const normalized = normalizeNoscaExtractedText_(
    String(text || '')
  );

  const limit = Math.max(
    Number(maxChars || 0),
    1000
  );

  if (normalized.length <= limit) {
    return {
      text: normalized,
      truncated: false,
      warning: ''
    };
  }

  return {
    text:
      normalized.substring(0, limit) +
      '\n\n[Content truncated by Ask NOSCA extraction limit]',
    truncated: true,
    warning:
      'Extracted text exceeded ' +
      limit +
      ' characters and was truncated.'
  };
}

/**
 * Normalizes source text while preserving meaningful line breaks.
 */
function normalizeNoscaExtractedText_(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

/**
 * Chooses a useful diagnostic sample across MIME types when possible.
 */
function selectNoscaDiagnosticSamples_(records, limit) {
  const selected = [];
  const selectedIds = {};
  const mimeSeen = {};

  // First pass: one sample per supported MIME type.
  records.forEach(function (record) {
    if (selected.length >= limit) return;
    if (mimeSeen[record.mimeType]) return;

    mimeSeen[record.mimeType] = true;
    selectedIds[record.fileId] = true;
    selected.push(record);
  });

  // Second pass: fill remaining slots.
  records.forEach(function (record) {
    if (selected.length >= limit) return;
    if (selectedIds[record.fileId]) return;

    selectedIds[record.fileId] = true;
    selected.push(record);
  });

  return selected;
}
