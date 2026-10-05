/**
 * Ask NOSCA — shared configuration
 *
 * Secrets such as GEMINI_API_KEY must NOT be placed in this file.
 * Store secrets in Apps Script > Project Settings > Script Properties.
 */

const NOSCA_CONFIG = Object.freeze({
  knowledgeRootId: '0AM-X20Wb8s7YUk9PVA',

  dataSpreadsheetId:
    '1lJetYhn8loCBmcMtiZZSVCH1OLMOIGBq8GGWoWH20Gw',

  sheets: Object.freeze({
    index: 'NOSCA_Index',
    logs: 'NOSCA_Logs',
    feedback: 'NOSCA_Feedback',
    admins: 'NOSCA_Admins'
  }),

  admins: Object.freeze({
    emailColumn: 1,
    startRow: 2,
    cacheSeconds: 300,
    cacheKey: 'NEXUS_ADMIN_EMAILS_V1'
  }),

  indexHeaders: Object.freeze([
    'File ID',
    'File Name',
    'Folder Path',
    'Document Type',
    'File Format',
    'MIME Type',
    'Modified At',
    'Drive URL',
    'Keywords',
    'Indexed At',
    'Status',
    'Error / Notes'
  ]),

  documentTypes: Object.freeze({
    ee: 'EE',
    proposal: 'Proposal',
    presentation: 'Presentation',
    document: 'Document',
    spreadsheet: 'Spreadsheet',
    pdf: 'PDF',
    text: 'Text',
    other: 'Other'
  }),

  fileFormats: Object.freeze({
    googleDoc: 'Google Doc',
    googleSheet: 'Google Sheet',
    googleSlides: 'Google Slides',
    word: 'Word',
    excel: 'Excel',
    powerpoint: 'PowerPoint',
    pdf: 'PDF',
    text: 'Text',
    csv: 'CSV',
    other: 'Other'
  }),

  statuses: Object.freeze({
    active: 'Active',
    skipped: 'Skipped',
    unsupported: 'Unsupported',
    error: 'Error'
  }),

  mimeTypes: Object.freeze({
    folder: 'application/vnd.google-apps.folder',
    document: 'application/vnd.google-apps.document',
    presentation: 'application/vnd.google-apps.presentation',
    spreadsheet: 'application/vnd.google-apps.spreadsheet',
    text: 'text/plain',
    csv: 'text/csv',
    pdf: 'application/pdf',
    word:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    wordLegacy: 'application/msword',
    excel:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    excelLegacy: 'application/vnd.ms-excel',
    powerpoint:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    powerpointLegacy: 'application/vnd.ms-powerpoint'
  }),

  drivePageSize: 250,

  metadataAliases: Object.freeze([
    Object.freeze({
      matchAny: Object.freeze([
        'pj lhuillier',
        'cebuana lhuillier',
        'cebuana',
        'cash hub',
        'cashhub'
      ]),
      add: Object.freeze([
        'pjl',
        'pj lhuillier',
        'cebuana',
        'cebuana lhuillier',
        'cashhub',
        'cash hub'
      ])
    })
  ]),

  indexing: Object.freeze({
    // Quick preview returns as soon as this many files are found.
    previewDefaultLimit: 20,
    previewMaxLimit: 100,

    // Full index refresh processes one bounded batch per execution.
    // Re-run refreshNoscaIndex() while needsAnotherRun === true.
    batchMaxFiles: 500,
    batchExecutionBudgetMs: 180000,

    // Drive list page size. Smaller pages make checkpoints more responsive.
    drivePageSize: 250,

    // Progress logging so long Drive traversals visibly remain active.
    heartbeatMs: 10000,
    heartbeatEveryFolders: 10,

    // Script Properties values are sharded to stay below per-value limits.
    checkpointChunkChars: 6000,
    checkpointMaxChars: 350000
  }),

  // Leave a safety margin below Apps Script's execution limit.
  scanExecutionBudgetMs: 240000,

  // Safety guard for an unexpectedly broad Drive tree.
  maxIndexedFilesPerRun: 5000,

  content: Object.freeze({
    // Hard ceiling for text returned from one source file.
    maxCharsPerFile: 120000,

    // Diagnostic preview length returned by test functions.
    diagnosticPreviewChars: 1200,

    // Google Slides guardrails.
    maxSlidesPerFile: 250,

    // Google Sheets guardrails.
    maxSheetsPerFile: 25,
    maxRowsPerSheet: 300,
    maxColumnsPerSheet: 40,

    // Plain-text download guardrail.
    maxTextFileBytes: 2000000,

    // Phase 2 diagnostic: maximum number of indexed files to sample.
    diagnosticMaxFiles: 8
  }),

  retrieval: Object.freeze({
    // Number of metadata-ranked files to extract for one knowledge question.
    maxCandidateFiles: 5,

    // Number of index-only results returned for "find/show/list documents"
    // requests. These may include Office/PDF files that are metadata-only.
    maxDocumentLookupResults: 12,

    // Chunking settings after a candidate file has been extracted.
    chunkChars: 2600,
    chunkOverlapChars: 300,

    // Maximum chunks retained from one source file.
    maxChunksPerFile: 3,

    // Maximum chunks returned across all selected files.
    maxContextChunks: 8,

    // Hard total context ceiling before answer generation is added.
    maxContextChars: 22000,

    // Reject retrieval when every metadata candidate is essentially unrelated.
    minMetadataScore: 2,

    // Keep only content chunks with at least one meaningful term match,
    // unless the metadata match itself is exceptionally strong.
    minChunkScore: 1,

    // Diagnostic preview length for context snippets.
    diagnosticChunkPreviewChars: 700
  }),

  gemini: Object.freeze({
    // GA/stable Flash model. Can be overridden without code changes by
    // setting the optional Script Property NOSCA_GEMINI_MODEL.
    model: 'gemini-3.5-flash',

    apiBase:
      'https://generativelanguage.googleapis.com/v1beta/models/',

    temperature: 0.2,
    maxOutputTokens: 1400,

    // Gemini resilience: one initial request + up to three retries for
    // transient API failures. Backoff is 2s -> 4s -> 8s by default.
    maxAttempts: 4,
    retryDelayMs: 2000,
    retryMaxDelayMs: 8000,

    // Retry-After / google.rpc.RetryInfo delays are honored when present,
    // but capped to preserve Apps Script execution headroom.
    maxServerRetryDelayMs: 30000,

    // Public-question guardrail.
    maxQuestionChars: 2000
  }),

  logging: Object.freeze({
    // Logging must never block a valid Ask NOSCA answer.
    enabled: true,

    // Matches the imported NOSCA_Logs workbook schema.
    logHeaders: Object.freeze([
      'Request ID',
      'Timestamp',
      'User',
      'Question',
      'Status',
      'Sources',
      'Response Time (ms)',
      'Error',
      'Feedback'
    ]),

    // Matches the imported NOSCA_Feedback workbook schema.
    feedbackHeaders: Object.freeze([
      'Feedback ID',
      'Timestamp',
      'Request ID',
      'User',
      'Question',
      'Helpful',
      'Comment'
    ]),

    maxLoggedQuestionChars: 2000,
    maxLoggedSourcesChars: 12000,
    maxLoggedErrorChars: 1200,
    maxFeedbackCommentChars: 1000
  }),

  debug: Object.freeze({
    // Temporary diagnostic switch. Set to false after retrieval is healthy.
    enabled: true,

    // Prevent excessively large execution logs.
    maxCandidatesToLog: 12,
    maxChunksToLog: 12
  })
});

const NOSCA_SUPPORTED_CONTENT_MIME_TYPES = Object.freeze([
  NOSCA_CONFIG.mimeTypes.document,
  NOSCA_CONFIG.mimeTypes.presentation,
  NOSCA_CONFIG.mimeTypes.spreadsheet,
  NOSCA_CONFIG.mimeTypes.text
]);
