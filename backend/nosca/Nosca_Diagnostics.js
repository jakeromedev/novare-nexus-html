/**
 * Ask NOSCA — consolidated diagnostics
 *
 * Add this file to the Novare Nexus Apps Script project, then run:
 *
 *   runNoscaDiagnostics
 *
 * from the Apps Script function dropdown.
 *
 * This diagnostic does not modify NOSCA_Index. It only reads the current
 * index, tests content extraction, and previews retrieval for a sample query.
 */

/**
 * Runs all three Ask NOSCA diagnostics and prints a consolidated result.
 *
 * @return {Object}
 */
function runNoscaDiagnostics() {
  var question = 'What services does Novare offer?';

  console.log('==================================================');
  console.log('[Ask NOSCA Diagnostics] START');
  console.log('[Ask NOSCA Diagnostics] Retrieval test question: ' + question);
  console.log('==================================================');

  var report = {
    generatedAt: new Date().toISOString(),
    question: question,
    indexStatus: runNoscaDiagnosticStep_(
      '1/3 NOSCA_Index status',
      function () {
        return getNoscaIndexStatus();
      }
    ),
    contentExtraction: runNoscaDiagnosticStep_(
      '2/3 Content extraction',
      function () {
        return testNoscaContentExtraction();
      }
    ),
    retrieval: runNoscaDiagnosticStep_(
      '3/3 Retrieval preview',
      function () {
        return previewNoscaRetrieval(question);
      }
    )
  };

  console.log('==================================================');
  console.log('[Ask NOSCA Diagnostics] CONSOLIDATED REPORT');
  console.log(JSON.stringify(report, null, 2));
  console.log('[Ask NOSCA Diagnostics] END');
  console.log('==================================================');

  return report;
}

/**
 * Runs only the NOSCA_Index status diagnostic.
 *
 * @return {Object}
 */
function runNoscaIndexStatusDiagnostic() {
  var result = getNoscaIndexStatus();
  console.log('[Ask NOSCA Diagnostics] NOSCA_Index status:');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Runs only the content extraction diagnostic.
 *
 * @return {Object}
 */
function runNoscaContentExtractionDiagnostic() {
  var result = testNoscaContentExtraction();
  console.log('[Ask NOSCA Diagnostics] Content extraction:');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Runs only the retrieval diagnostic.
 * Change the question here if you want to test a different query.
 *
 * @return {Object}
 */
function runNoscaRetrievalDiagnostic() {
  var question = 'What services does Novare offer?';
  var result = previewNoscaRetrieval(question);
  console.log('[Ask NOSCA Diagnostics] Retrieval preview:');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Executes one diagnostic without preventing the remaining diagnostics
 * from running if it fails.
 *
 * @param {string} label
 * @param {Function} callback
 * @return {Object}
 */
function runNoscaDiagnosticStep_(label, callback) {
  console.log('--------------------------------------------------');
  console.log('[Ask NOSCA Diagnostics] ' + label);

  try {
    var result = callback();
    console.log('[Ask NOSCA Diagnostics] SUCCESS: ' + label);
    console.log(JSON.stringify(result, null, 2));

    return {
      executed: true,
      success: true,
      result: result
    };
  } catch (error) {
    var message = error && error.message
      ? error.message
      : String(error);

    console.error('[Ask NOSCA Diagnostics] FAILED: ' + label);
    console.error(message);

    return {
      executed: true,
      success: false,
      error: message
    };
  }
}
