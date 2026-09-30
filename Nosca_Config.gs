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
    feedback: 'NOSCA_Feedback'
  }),

  indexHeaders: Object.freeze([
    'File ID',
    'File Name',
    'Folder Path',
    'MIME Type',
    'Modified At',
    'Drive URL',
    'Keywords',
    'Indexed At',
    'Status',
    'Error / Notes'
  ]),

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
    text: 'text/plain'
  }),

  drivePageSize: 1000,

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
    // Number of metadata-ranked files to extract for one question.
    maxCandidateFiles: 5,

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

    // One initial call + one retry for transient 429/5xx failures.
    maxAttempts: 2,
    retryDelayMs: 900,

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
  })
});

const NOSCA_SUPPORTED_CONTENT_MIME_TYPES = Object.freeze([
  NOSCA_CONFIG.mimeTypes.document,
  NOSCA_CONFIG.mimeTypes.presentation,
  NOSCA_CONFIG.mimeTypes.spreadsheet,
  NOSCA_CONFIG.mimeTypes.text
]);
