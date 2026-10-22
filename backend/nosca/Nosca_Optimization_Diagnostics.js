/**
 * Ask NOSCA | optimization verification suite (read-only diagnostics).
 *
 * These functions are manually run from the Apps Script editor. They do not
 * enable new search, model, or caching behaviors or change Script Properties.
 * They require the existing NOSCA backend and NOSCA_SEARCH_BACKEND=drive.
 *
 * Run each phase SEPARATELY. Running every phase at once would duplicate
 * Drive reads and Gemini requests and can hit Apps Script quotas/timeouts.
 *
 * Tests use live Drive/Gemini resources for the executing user. Phase 1
 * invokes askNosca(), so the normal NOSCA_Logs row is written. Phase 4 calls
 * Gemini (API consumption). Phases 3 and 5 read document contents. Logs
 * contain file names/metadata and timing, never excerpts or Gemini answers.
 *
 * To change the test question, edit the question constant below, redeploy,
 * and use the SAME question for before/after comparisons.
 */
const NOSCA_OPT_DIAG_CONFIG = Object.freeze({
  question: 'What offerings does Novare have for customer experience?',
  topCandidatesToLog: 10,
  titleHints: Object.freeze([
    'customer experience', 'customer engagement', 'customer journey',
    'contact center', 'contact centre', 'cx', 'digital experience'
  ])
});

function noscaOptDiagnosticsCheck_() {
  if (typeof useNoscaNativeDriveSearch_ !== 'function' ||
      !useNoscaNativeDriveSearch_()) {
    throw new Error('Run diagnostics with Script Property NOSCA_SEARCH_BACKEND=drive.');
  }
}
function noscaOptDiagnosticsLog_(phase, action) {
  const startedAt = Date.now();
  let data;
  try {
    noscaOptDiagnosticsCheck_();
    data = action();
    data.ok = data.ok !== false;
  } catch (error) {
    data = {ok:false, error:String(error && error.message || error).slice(0,360)};
  }
  const report = Object.assign({
    phase: phase,
    question: NOSCA_OPT_DIAG_CONFIG.question,
    recordedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt
  }, data);
  console.log('[NOSCA OPTIMIZATION][' + phase + ']\n' + JSON.stringify(report,null,2));
  return report;
}
function noscaOptDiagnosticsSources_(sources, limit) {
  return (sources || []).slice(0,limit || 6).map(function(source) {
    return {
      name: String(source.fileName || ''),
      type: String(source.documentType || ''),
      format: String(source.fileFormat || '')
    };
  });
}
function noscaOptDiagnosticsRetrieval_(retrieval) {
  const candidates = retrieval.candidates || [];
  return {
    searchBackend: retrieval.backend || '',
    searchElapsedMs: Number(retrieval.searchElapsedMs || 0),
    extractionElapsedMs: Number(retrieval.extractionElapsedMs || 0),
    totalRetrievalMs: Number(retrieval.elapsedMs || 0),
    candidateCount: candidates.length,
    retainedChunkCount: (retrieval.contextChunks || []).length,
    contextChars: Number(retrieval.totalContextChars || 0),
    files: noscaOptDiagnosticsSources_(candidates, NOSCA_OPT_DIAG_CONFIG.topCandidatesToLog),
    fileReadMetrics: (retrieval.candidateExtractionMetrics || []).map(function(item) {
      return {
        name: String(item.fileName || ''),
        type: String(item.fileFormat || ''),
        ok: item.ok === true,
        elapsedMs: Number(item.elapsedMs || 0),
        extractedChars: Number(item.extractedChars || 0),
        retainedChunks: Number(item.retainedChunks || 0),
        warningCount: Number(item.warningCount || 0)
      };
    }),
    warningCount: (retrieval.warnings || []).length
  };
}

/**
 * PHASE 1 — Establish the end-to-end baseline BEFORE optimizing.
 * Runs the real askNosca() knowledge-answer workflow and writes its usual log.
 * Verify: total latency; search/extraction/Gemini split; source relevance.
 * Existing 46,820-ms observation is a reference, not a guaranteed repeat.
 */
function benchmarkNoscaPhase1Baseline() {
  return noscaOptDiagnosticsLog_('P1_BASELINE',function() {
    const result = askNosca(NOSCA_OPT_DIAG_CONFIG.question);
    const d = result && result.diagnostics || {};
    const total = Number(result && result.elapsedMs || 0);
    const search = Number(d.searchElapsedMs || 0);
    const extraction = Number(d.extractionElapsedMs || 0);
    const gemini = Number(d.generationElapsedMs || 0);
    return {
      ok: !!(result && result.ok),
      route: result && result.responseMode || 'knowledge_answer',
      totalBackendMs: total,
      stagesMs: {
        driveSearchAndRanking: search,
        documentExtractionAndChunking: extraction,
        geminiGeneration: gemini,
        remainingOrchestration: Math.max(0,total-search-extraction-gemini)
      },
      candidateCount:Number(d.retrievalCandidateCount || 0),
      retainedChunkCount:Number(d.contextChunkCount || 0),
      contextChars:Number(d.contextChars || 0),
      model:result && result.model || '',
      attempts:Number(d.geminiAttemptCount || 0),
      retryWaitMs:Number(d.geminiRetryWaitMs || 0),
      totalTokens:Number(result && result.usage && result.usage.totalTokenCount || 0),
      sourceFiles:noscaOptDiagnosticsSources_(result && result.sources,10),
      note:'Review source relevance manually. This creates a normal NOSCA usage-log entry.'
    };
  });
}

/**
 * PHASE 2 — Search quality / relevance.
 * Performs ONLY Drive candidate discovery (no document extraction or Gemini).
 * Verify: topical source names; scores; truncation; off-topic candidates.
 * titleHintMatched is a weak filename-only heuristic, NOT a quality verdict.
 */
function benchmarkNoscaPhase2Relevance() {
  return noscaOptDiagnosticsLog_('P2_RELEVANCE',function() {
    const query=normalizeNoscaQuery_(NOSCA_OPT_DIAG_CONFIG.question);
    const discovery=searchNoscaDriveRecords_(query,'none');
    const scored=(discovery.records || []).filter(function(record) {
      return record.itemType !== NOSCA_CONFIG.itemTypes.folder &&
        record.status === NOSCA_CONFIG.statuses.active &&
        NOSCA_SUPPORTED_CONTENT_MIME_TYPES.indexOf(record.mimeType) !== -1;
    }).map(function(record) {
      const matched=scoreNoscaMetadataRecord_(record,query);
      const name=String(record.fileName || '');
      const normalizedName=normalizeNoscaSearchText_(name);
      return Object.assign({},record,{
        metadataScore: Math.max(matched.score,NOSCA_CONFIG.retrieval.minMetadataScore),
        rawMetadataScore:matched.score,
        matchedTerms:matched.matchedTerms,
        titleHintMatched:NOSCA_OPT_DIAG_CONFIG.titleHints.some(function(term) {
          return normalizedName.indexOf(term) !== -1;
        })
      });
    }).sort(compareNoscaCandidates_);
    const top=scored.slice(0,NOSCA_OPT_DIAG_CONFIG.topCandidatesToLog);
    return {
      driveApiCalls:Number(discovery.apiCalls || 0),
      driveSearchMs:Number(discovery.elapsedMs || 0),
      rawCandidates:(discovery.records || []).length,
      readableCandidates:scored.length,
      truncated:discovery.truncated === true,
      selectedLimit:Number(NOSCA_CONFIG.retrieval.maxCandidateFiles || 5),
      topRanked:top.map(function(r,index) {
        return {rank:index+1,name:r.fileName,format:r.fileFormat,
          metadataScore:r.rawMetadataScore,matchedTerms:r.matchedTerms,
          titleHintMatched:r.titleHintMatched};
      }),
      topFiveTitleHintMatches:scored.slice(0,5).filter(function(r) {
        return r.titleHintMatched;
      }).length,
      humanReviewRequired:true,
      note:'Assess whether the top five actually answer the question. A title may lack the topic but its contents can still be relevant. Truncated results are not exhaustive.'
    };
  });
}

/**
 * PHASE 3 — Document extraction/chunking (no Gemini).
 * Uses REAL retrieveNoscaContext_() and the per-file timing instrumentation
 * added to Nosca_Retrieval.js. Verify slow file formats and wasted reads.
 */
function benchmarkNoscaPhase3Extraction() {
  return noscaOptDiagnosticsLog_('P3_EXTRACTION',function() {
    const retrieval=retrieveNoscaContext_(NOSCA_OPT_DIAG_CONFIG.question);
    const metrics=noscaOptDiagnosticsRetrieval_(retrieval);
    metrics.goal='Reduce unnecessary file reads without losing answer-bearing chunks.';
    return metrics;
  });
}

/**
 * PHASE 4 — Actual Gemini response (single real model request, plus retries).
 * Includes one retrieval and then Gemini; logs ONLY metadata/timings, NOT text.
 * Verify attemptCount, retryWaitMs, token usage, context size and model.
 */
function benchmarkNoscaPhase4Gemini() {
  return noscaOptDiagnosticsLog_('P4_GEMINI',function() {
    const retrieval=retrieveNoscaContext_(NOSCA_OPT_DIAG_CONFIG.question);
    const r=noscaOptDiagnosticsRetrieval_(retrieval);
    if (!retrieval.contextChunks || !retrieval.contextChunks.length) {
      return {ok:false,reason:'No grounded context; Gemini intentionally not called.',retrieval:r};
    }
    const started=Date.now();
    const answer=generateNoscaGroundedAnswer_(NOSCA_OPT_DIAG_CONFIG.question,retrieval);
    const generationMs=Date.now()-started;
    return {
      retrieval:r,
      generationMs:generationMs,
      model:String(answer.model || ''),
      geminiAttempts:Number(answer.attemptCount || 1),
      retryWaitMs:Number(answer.retryWaitMs || 0),
      geminiApiElapsedMs:Number(answer.apiElapsedMs || generationMs),
      outputChars:String(answer.text || '').length,
      finishReason:String(answer.finishReason || ''),
      tokenUsage:answer.usage || {},
      totalPipelineMs:r.totalRetrievalMs+generationMs,
      note:'Review the actual answer in NEXUS for grounded accuracy; this diagnostic intentionally does not print answer content.'
    };
  });
}

/**
 * PHASE 5 — Cache verification; runs retrieval twice, not Gemini.
 * A faster second run is NOT proof of caching: the retrieval implementation
 * must expose cacheHit=true or cache.hit=true before claiming a cache win.
 * Before Phase 5 cache integration this will report cacheVerified=false.
 */
function benchmarkNoscaPhase5Caching() {
  return noscaOptDiagnosticsLog_('P5_CACHE',function() {
    const first=retrieveNoscaContext_(NOSCA_OPT_DIAG_CONFIG.question);
    const second=retrieveNoscaContext_(NOSCA_OPT_DIAG_CONFIG.question);
    const firstMs=Number(first.elapsedMs || 0);
    const secondMs=Number(second.elapsedMs || 0);
    const explicitHit=second.cacheHit === true ||
      Boolean(second.cache && second.cache.hit === true);
    return {
      firstRun:noscaOptDiagnosticsRetrieval_(first),
      secondRun:noscaOptDiagnosticsRetrieval_(second),
      timingDifferenceMs:firstMs-secondMs,
      secondRunFaster:secondMs < firstMs,
      cacheVerified:explicitHit,
      note:explicitHit
        ? 'An explicit cache hit was reported. Verify same-user ACL isolation, TTL, and modification invalidation separately.'
        : 'No explicit cache-hit evidence exists yet. Faster repeats alone do not establish caching; Phase 5 is NOT verified.'
    };
  });
}

/** Quickly view diagnostic configuration WITHOUT performing any API calls. */
function logNoscaOptimizationDiagnosticStatus() {
  const props=PropertiesService.getScriptProperties();
  const report={
    question:NOSCA_OPT_DIAG_CONFIG.question,
    backend:String(props.getProperty('NOSCA_SEARCH_BACKEND') || 'index'),
    driveScope:String(props.getProperty('NOSCA_DRIVE_SCOPE_STRATEGY') || 'none'),
    model:typeof getNoscaGeminiModel_ === 'function' ? getNoscaGeminiModel_() : '',
    maxCandidateFiles:Number(NOSCA_CONFIG.retrieval.maxCandidateFiles || 0),
    maxContextChars:Number(NOSCA_CONFIG.retrieval.maxContextChars || 0),
    functions:[
      'benchmarkNoscaPhase1Baseline',
      'benchmarkNoscaPhase2Relevance',
      'benchmarkNoscaPhase3Extraction',
      'benchmarkNoscaPhase4Gemini',
      'benchmarkNoscaPhase5Caching'
    ],
    note:'Run one phase at a time. Before/after tests must use the same question and comparable execution account.'
  };
  console.log('[NOSCA OPTIMIZATION][STATUS]\n'+JSON.stringify(report,null,2));
  return report;
}
