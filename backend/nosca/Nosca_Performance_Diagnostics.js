/**
 * Ask NOSCA — read-only performance benchmark for Drive Search + AI Overview.
 *
 * Run benchmarkNoscaDriveSearchAndOverview() from the Apps Script editor.
 * The benchmark calls the same service methods as the NEXUS UI:
 *   1) askNosca(...) (file lookup)
 *   2) generateNoscaDriveOverview(requestId) (separate Gemini RPC)
 *
 * It DOES perform one real Drive search and one real Gemini request, and the
 * existing askNosca() request logger may append a normal usage-log row.
 * No Script Properties, index rows, folder maps, or triggers are changed.
 *
 * IMPORTANT: Elapsed values measure Apps Script server time, not browser
 * network latency or UI painting. Normal users receive two separate RPCs.
 */
function benchmarkNoscaDriveSearchAndOverview() {
  return benchmarkNoscaDriveSearchAndOverviewQuestion_('Find CashHub proposals');
}

/** Optional: call this from another function to benchmark a different query. */
function benchmarkNoscaDriveSearchAndOverviewQuestion_(question) {
  const startedAt = Date.now();
  const report = {
    ok: false,
    query: String(question || ''),
    searchBackend: '',
    search: {},
    overview: {},
    totalBackendMs: 0,
    note: 'Server timings exclude browser/network delays between the two UI requests.'
  };
  try {
    const properties = PropertiesService.getScriptProperties();
    const backend = String(properties.getProperty('NOSCA_SEARCH_BACKEND') || 'index').toLowerCase();
    const overviewFlag = String(properties.getProperty('NOSCA_AI_OVERVIEW') || 'on').toLowerCase();
    report.searchBackend = backend;
    if (backend !== 'drive') {
      throw new Error('Set Script Property NOSCA_SEARCH_BACKEND=drive before benchmarking native Drive Search.');
    }
    if (overviewFlag === 'off') {
      throw new Error('Set Script Property NOSCA_AI_OVERVIEW=on before benchmarking Gemini AI Overview.');
    }

    const searchStartedAt = Date.now();
    const lookup = askNosca(question);
    const searchRpcMs = Date.now() - searchStartedAt;
    const driveSearchMs = Number(lookup && lookup.diagnostics && lookup.diagnostics.searchElapsedMs || 0);
    report.search = {
      ok: !!(lookup && lookup.ok),
      responseMode: lookup && lookup.responseMode || '',
      nativeDriveSearchMs: driveSearchMs,
      fullLookupBackendMs: searchRpcMs,
      lookupOtherMs: Math.max(0, searchRpcMs - driveSearchMs),
      returnedSources: lookup && lookup.sources ? lookup.sources.length : 0,
      candidateMatches: lookup && lookup.diagnostics ? lookup.diagnostics.retrievalCandidateCount : 0,
      truncated: !!(lookup && lookup.diagnostics && lookup.diagnostics.searchTruncated),
      requestedDocumentTypes: lookup && lookup.diagnostics
        ? lookup.diagnostics.requestedDocumentTypes || [] : [],
      lookupSummary: lookup && lookup.diagnostics
        ? lookup.diagnostics.lookupSummary || null : null,
      retrievalWarnings: lookup && lookup.diagnostics
        ? lookup.diagnostics.retrievalWarnings || [] : [],
      overviewAvailable: !!(lookup && lookup.aiOverviewAvailable)
    };

    if (!lookup || lookup.responseMode !== 'document_lookup') {
      throw new Error('This query did not enter the document lookup flow. Use a query such as "Find CashHub proposals".');
    }
    if (!lookup.aiOverviewAvailable) {
      throw new Error('The lookup returned no Gemini AI Overview request. Check matches, user cache, and NOSCA_AI_OVERVIEW.');
    }

    const overviewStartedAt = Date.now();
    const overview = generateNoscaDriveOverview(lookup.requestId);
    const overviewRpcMs = Date.now() - overviewStartedAt;
    const t = overview && overview.timings || {};
    report.overview = {
      ok: !!(overview && overview.ok),
      fullOverviewBackendMs: overviewRpcMs,
      evidencePreparationMs: Number(t.evidencePreparationMs || 0),
      documentExtractionMs: Number(t.documentExtractionMs || 0),
      geminiRequestMs: Number(t.geminiRequestMs || 0),
      responseParsingMs: Number(t.responseParsingMs || 0),
      totalOverviewGenerationMs: Number(t.totalOverviewMs || overview.elapsedMs || 0),
      extractionAttempts: Number(t.extractionAttempts || 0),
      extractionsWithText: Number(t.extractionsWithText || 0),
      generatedSummaries: overview.summaries ? overview.summaries.length : 0,
      metadataOnly: overview.metadataOnly === true,
      model: String(overview.model || '')
    };
    report.ok = report.search.ok && report.overview.ok;
  } catch (error) {
    report.error = String(error && error.message || error).slice(0, 400);
  }
  report.totalBackendMs = Date.now() - startedAt;
  console.log('[NOSCA SEARCH + GEMINI PERFORMANCE]\n' + JSON.stringify(report, null, 2));
  return report;
}
