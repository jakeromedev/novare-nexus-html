/**
 * Ask NOSCA — Phase 3 retrieval and ranking
 *
 * Deterministic retrieval pipeline:
 *
 *   question
 *      ↓
 *   normalize/tokenize
 *      ↓
 *   rank NOSCA_Index metadata
 *      ↓
 *   select strongest candidate files
 *      ↓
 *   extract selected file contents
 *      ↓
 *   split into bounded chunks
 *      ↓
 *   score chunks against the question
 *      ↓
 *   return context package + sources
 */

/**
 * Manual Phase 3 diagnostic.
 *
 * @return {Object}
 */
function testNoscaRetrieval() {
  const question =
    'What API management solutions and capabilities does Novare have?';

  return previewNoscaRetrieval(question);
}

/**
 * Safe retrieval preview by user question.
 *
 * @param {string} question
 * @return {Object}
 */
function previewNoscaRetrieval(question) {
  const result = retrieveNoscaContext_(question);

  return {
    ok: result.ok,
    question: result.question,
    queryTerms: result.queryTerms,
    candidateCount: result.candidates.length,
    contextChunkCount: result.contextChunks.length,
    totalContextChars: result.totalContextChars,
    elapsedMs: result.elapsedMs,
    candidates: result.candidates.map(function (candidate) {
      return {
        fileId: candidate.fileId,
        fileName: candidate.fileName,
        folderPath: candidate.folderPath,
        documentType: candidate.documentType,
        fileFormat: candidate.fileFormat,
        mimeType: candidate.mimeType,
        driveUrl: candidate.driveUrl,
        metadataScore: candidate.metadataScore,
        matchedTerms: candidate.matchedTerms
      };
    }),
    contextChunks: result.contextChunks.map(function (chunk) {
      return {
        sourceIndex: chunk.sourceIndex,
        fileId: chunk.fileId,
        fileName: chunk.fileName,
        driveUrl: chunk.driveUrl,
        chunkIndex: chunk.chunkIndex,
        score: chunk.score,
        matchedTerms: chunk.matchedTerms,
        preview: chunk.text.substring(
          0,
          NOSCA_CONFIG.retrieval.diagnosticChunkPreviewChars
        )
      };
    }),
    warnings: result.warnings
  };
}

/**
 * Core retrieval function used by the next answer-generation phase.
 *
 * Ends in "_" so it is not directly exposed through google.script.run.
 *
 * @param {string} question
 * @return {Object}
 */
function retrieveNoscaContext_(question) {
  const startedAt = Date.now();
  const normalizedQuestion = normalizeNoscaQuery_(question);

  noscaDebugLog_(
    'Retrieval started',
    {
      questionLength: normalizedQuestion.text.length,
      queryTerms: normalizedQuestion.terms,
      phraseCount: normalizedQuestion.phrases.length,
      minMetadataScore:
        NOSCA_CONFIG.retrieval.minMetadataScore,
      minChunkScore:
        NOSCA_CONFIG.retrieval.minChunkScore,
      maxCandidateFiles:
        NOSCA_CONFIG.retrieval.maxCandidateFiles
    }
  );

  if (!normalizedQuestion.text) {
    throw new Error(
      'Ask NOSCA requires a non-empty question.'
    );
  }

  if (normalizedQuestion.text.length > 2000) {
    throw new Error(
      'Ask NOSCA question is too long. Keep the question under 2,000 characters.'
    );
  }

  const existing = loadNoscaExistingIndex_();

  noscaDebugLog_(
    'NOSCA_Index summary',
    summarizeNoscaIndexForDebug_(existing)
  );

  const rankedCandidates = rankNoscaIndexRecords_(
    existing,
    normalizedQuestion
  );

  noscaDebugLog_(
    'Top metadata-ranked candidates BEFORE threshold',
    rankedCandidates
      .slice(
        0,
        NOSCA_CONFIG.debug.maxCandidatesToLog
      )
      .map(function (candidate) {
        return {
          fileName: candidate.fileName,
          folderPath: candidate.folderPath,
          mimeType: candidate.mimeType,
          metadataScore: candidate.metadataScore,
          matchedTerms: candidate.matchedTerms,
          status: candidate.status
        };
      })
  );

  const candidateLimit = NOSCA_CONFIG.retrieval.maxCandidateFiles;
  const candidates = rankedCandidates
    .filter(function (candidate) {
      return (
        candidate.metadataScore >=
        NOSCA_CONFIG.retrieval.minMetadataScore
      );
    })
    .slice(0, candidateLimit);

  noscaDebugLog_(
    'Candidates AFTER metadata threshold',
    {
      selectedCount: candidates.length,
      rejectedByThreshold:
        Math.max(
          rankedCandidates.length - candidates.length,
          0
        ),
      candidates: candidates.map(function (candidate) {
        return {
          fileName: candidate.fileName,
          mimeType: candidate.mimeType,
          metadataScore: candidate.metadataScore,
          matchedTerms: candidate.matchedTerms
        };
      })
    }
  );

  if (!candidates.length) {
    noscaDebugWarn_(
      'Retrieval stopped: no candidate met minMetadataScore.',
      {
        minMetadataScore:
          NOSCA_CONFIG.retrieval.minMetadataScore,
        activeSupportedIndexRecords:
          rankedCandidates.length,
        highestMetadataScore:
          rankedCandidates.length
            ? rankedCandidates[0].metadataScore
            : null
      }
    );

    return {
      ok: true,
      question: normalizedQuestion.text,
      queryTerms: normalizedQuestion.terms,
      candidates: [],
      contextChunks: [],
      totalContextChars: 0,
      warnings: [
        'No sufficiently relevant source files were found in NOSCA_Index.'
      ],
      elapsedMs: Date.now() - startedAt
    };
  }

  const warnings = [];
  const scoredChunks = [];

  candidates.forEach(function (candidate) {
    try {
      noscaDebugLog_(
        'Extracting candidate',
        {
          fileName: candidate.fileName,
          mimeType: candidate.mimeType,
          metadataScore: candidate.metadataScore
        }
      );

      const extraction = extractNoscaFileContent_(candidate);

      noscaDebugLog_(
        'Extraction completed',
        {
          fileName: candidate.fileName,
          charCount: extraction.charCount,
          truncated: extraction.truncated,
          warningCount:
            (extraction.warnings || []).length
        }
      );

      (extraction.warnings || []).forEach(function (warning) {
        warnings.push(
          candidate.fileName + ': ' + warning
        );
      });

      const chunks = splitNoscaContentIntoChunks_(
        extraction.text,
        NOSCA_CONFIG.retrieval.chunkChars,
        NOSCA_CONFIG.retrieval.chunkOverlapChars
      );

      noscaDebugLog_(
        'Chunks created for candidate',
        {
          fileName: candidate.fileName,
          chunkCount: chunks.length
        }
      );

      const allScoredFileChunks = chunks
        .map(function (text, index) {
          const scoreResult = scoreNoscaContentChunk_(
            text,
            normalizedQuestion,
            candidate
          );

          return {
            fileId: candidate.fileId,
            fileName: candidate.fileName,
            folderPath: candidate.folderPath,
            documentType: candidate.documentType,
            fileFormat: candidate.fileFormat,
            mimeType: candidate.mimeType,
            driveUrl: candidate.driveUrl,
            metadataScore: candidate.metadataScore,
            chunkIndex: index + 1,
            score: scoreResult.score,
            matchedTerms: scoreResult.matchedTerms,
            text: text
          };
        })
        .sort(compareNoscaChunks_);

      noscaDebugLog_(
        'Top chunk scores BEFORE chunk threshold',
        allScoredFileChunks
          .slice(
            0,
            NOSCA_CONFIG.debug.maxChunksToLog
          )
          .map(function (chunk) {
            return {
              fileName: chunk.fileName,
              chunkIndex: chunk.chunkIndex,
              score: chunk.score,
              metadataScore: chunk.metadataScore,
              matchedTerms: chunk.matchedTerms
            };
          })
      );

      const rankedFileChunks = allScoredFileChunks
        .filter(function (chunk) {
          return (
            chunk.score >= NOSCA_CONFIG.retrieval.minChunkScore ||
            candidate.metadataScore >= 12
          );
        })
        .sort(compareNoscaChunks_)
        .slice(
          0,
          NOSCA_CONFIG.retrieval.maxChunksPerFile
        );

      noscaDebugLog_(
        'Chunks AFTER chunk threshold',
        {
          fileName: candidate.fileName,
          retainedCount: rankedFileChunks.length,
          minChunkScore:
            NOSCA_CONFIG.retrieval.minChunkScore,
          metadataBypass:
            candidate.metadataScore >= 12
        }
      );

      Array.prototype.push.apply(
        scoredChunks,
        rankedFileChunks
      );
    } catch (error) {
      const errorMessage =
        getNoscaErrorMessage_(error);

      noscaDebugError_(
        'Candidate extraction failed',
        {
          fileName: candidate.fileName,
          mimeType: candidate.mimeType,
          error: errorMessage
        }
      );

      warnings.push(
        candidate.fileName +
        ': extraction failed — ' +
        errorMessage
      );
    }
  });

  scoredChunks.sort(compareNoscaChunks_);

  const bounded = buildNoscaBoundedContext_(
    scoredChunks,
    NOSCA_CONFIG.retrieval.maxContextChunks,
    NOSCA_CONFIG.retrieval.maxContextChars
  );

  assignNoscaSourceIndexes_(
    bounded.contextChunks,
    candidates
  );

  noscaDebugLog_(
    'Final bounded retrieval context',
    {
      totalScoredChunksBeforeBounding:
        scoredChunks.length,
      selectedContextChunks:
        bounded.contextChunks.length,
      totalContextChars:
        bounded.totalChars,
      warnings: warnings,
      selected: bounded.contextChunks.map(
        function (chunk) {
          return {
            sourceIndex: chunk.sourceIndex,
            fileName: chunk.fileName,
            chunkIndex: chunk.chunkIndex,
            score: chunk.score,
            matchedTerms: chunk.matchedTerms,
            textLength: chunk.text.length
          };
        }
      )
    }
  );

  if (!bounded.contextChunks.length) {
    noscaDebugWarn_(
      'Retrieval ended with ZERO context chunks.',
      {
        candidateCount: candidates.length,
        scoredChunkCount: scoredChunks.length,
        likelyCauses: [
          'selected files extracted no text',
          'all chunks scored below minChunkScore',
          'source MIME types/extraction failed',
          'question terms did not appear in extracted content'
        ]
      }
    );
  }

  return {
    ok: true,
    question: normalizedQuestion.text,
    queryTerms: normalizedQuestion.terms,
    candidates: candidates,
    contextChunks: bounded.contextChunks,
    totalContextChars: bounded.totalChars,
    warnings: warnings,
    elapsedMs: Date.now() - startedAt
  };
}


/**
 * Detects navigation-style requests where the user primarily wants files,
 * document locations, or a list of available materials rather than a
 * synthesized content answer.
 */
function isNoscaDocumentLookupQuestion_(question) {
  const value = normalizeNoscaSearchText_(question);

  if (!value) return false;

  const hasNavigationVerb =
    /\b(where|find|show|list|locate)\b/.test(value);

  if (hasNavigationVerb) {
    return true;
  }

  const hasDocumentNoun =
    /\b(document|documents|file|files|materials|deck|decks)\b/.test(value);

  const hasKnowledgeIntent =
    /\b(what|how|why|explain|summarize|summary|describe|compare|content|say)\b/.test(
      value
    );

  const wordCount = value.split(/\s+/).filter(Boolean).length;

  return (
    hasDocumentNoun &&
    !hasKnowledgeIntent &&
    wordCount <= 8
  );
}

/**
 * Returns metadata-only document matches from NOSCA_Index.
 *
 * Unlike normal grounded retrieval, this can return Unsupported records
 * (for example PPTX/DOCX/PDF) because the user is asking to find documents,
 * not necessarily extract their contents.
 */
function findNoscaIndexedDocuments_(question) {
  const normalizedQuestion = normalizeNoscaQuery_(question);
  const existing = loadNoscaExistingIndex_();
  const requestedTypes = detectNoscaRequestedDocumentTypes_(
    normalizedQuestion.text
  );

  const records = Object.keys(existing)
    .map(function (fileId) {
      return existing[fileId];
    })
    .filter(function (record) {
      return (
        record.status !== NOSCA_CONFIG.statuses.skipped &&
        record.status !== NOSCA_CONFIG.statuses.error
      );
    })
    .map(function (record) {
      const scoreResult = scoreNoscaMetadataRecord_(
        record,
        normalizedQuestion
      );

      return {
        fileId: record.fileId,
        fileName: record.fileName,
        folderPath: record.folderPath,
        documentType:
          record.documentType || NOSCA_CONFIG.documentTypes.other,
        fileFormat:
          record.fileFormat || NOSCA_CONFIG.fileFormats.other,
        mimeType: record.mimeType,
        driveUrl: record.driveUrl,
        keywords: record.keywords,
        indexedAt: record.indexedAt,
        status: record.status,
        notes: record.notes,
        metadataScore: scoreResult.score,
        matchedTerms: scoreResult.matchedTerms
      };
    })
    .filter(function (record) {
      if (record.metadataScore < NOSCA_CONFIG.retrieval.minMetadataScore) {
        return false;
      }

      if (!requestedTypes.length) {
        return true;
      }

      return requestedTypes.indexOf(record.documentType) !== -1;
    })
    .sort(compareNoscaCandidates_);

  const limit = Math.max(
    Number(NOSCA_CONFIG.retrieval.maxDocumentLookupResults || 12),
    1
  );

  const selected = requestedTypes.length
    ? records.slice(0, limit)
    : selectNoscaDiversifiedDocumentResults_(records, limit);

  selected.forEach(function (record, index) {
    record.sourceIndex = index + 1;
  });

  return {
    ok: true,
    question: normalizedQuestion.text,
    queryTerms: normalizedQuestion.terms,
    requestedDocumentTypes: requestedTypes,
    totalMatches: records.length,
    results: selected,
    summary: summarizeNoscaDocumentLookupResults_(selected)
  };
}

function detectNoscaRequestedDocumentTypes_(question) {
  const value = ' ' + normalizeNoscaSearchText_(question) + ' ';
  const types = NOSCA_CONFIG.documentTypes;
  const requested = [];

  function add(type) {
    if (requested.indexOf(type) === -1) {
      requested.push(type);
    }
  }

  if (
    /(^|\s)ee(\s|$)/.test(value) ||
    value.indexOf(' effort estimate ') !== -1 ||
    value.indexOf(' effort estimation ') !== -1
  ) {
    add(types.ee);
  }

  if (
    value.indexOf(' proposal ') !== -1 ||
    value.indexOf(' bid ') !== -1 ||
    value.indexOf(' rfp ') !== -1 ||
    value.indexOf(' rfi ') !== -1 ||
    value.indexOf(' rfq ') !== -1
  ) {
    add(types.proposal);
  }

  if (
    value.indexOf(' presentation ') !== -1 ||
    value.indexOf(' deck ') !== -1 ||
    value.indexOf(' slides ') !== -1 ||
    value.indexOf(' ppt ') !== -1 ||
    value.indexOf(' pptx ') !== -1 ||
    value.indexOf(' powerpoint ') !== -1
  ) {
    add(types.presentation);
  }

  return requested;
}

/**
 * For broad "PJL documents"-style requests, prevent one file family from
 * monopolizing all results. Take the best EE, Proposal, Presentation, then
 * fill remaining slots by overall metadata score.
 */
function selectNoscaDiversifiedDocumentResults_(records, limit) {
  const selected = [];
  const seen = {};
  const preferredTypes = [
    NOSCA_CONFIG.documentTypes.ee,
    NOSCA_CONFIG.documentTypes.proposal,
    NOSCA_CONFIG.documentTypes.presentation
  ];

  preferredTypes.forEach(function (type) {
    const match = records.find(function (record) {
      return record.documentType === type && !seen[record.fileId];
    });

    if (match && selected.length < limit) {
      selected.push(match);
      seen[match.fileId] = true;
    }
  });

  records.forEach(function (record) {
    if (selected.length >= limit || seen[record.fileId]) {
      return;
    }

    selected.push(record);
    seen[record.fileId] = true;
  });

  return selected;
}

function summarizeNoscaDocumentLookupResults_(records) {
  const byDocumentType = {};

  (records || []).forEach(function (record) {
    const type = String(
      record.documentType || NOSCA_CONFIG.documentTypes.other
    );

    byDocumentType[type] =
      (byDocumentType[type] || 0) + 1;
  });

  return {
    returned: (records || []).length,
    byDocumentType: byDocumentType
  };
}

/**
 * Ranks Active, supported NOSCA_Index records.
 */
function rankNoscaIndexRecords_(existing, query) {
  const records = Object.keys(existing)
    .map(function (fileId) {
      return existing[fileId];
    })
    .filter(function (record) {
      return (
        record.status === NOSCA_CONFIG.statuses.active &&
        NOSCA_SUPPORTED_CONTENT_MIME_TYPES.indexOf(record.mimeType) !== -1
      );
    });

  return records
    .map(function (record) {
      const scoreResult = scoreNoscaMetadataRecord_(
        record,
        query
      );

      return {
        fileId: record.fileId,
        fileName: record.fileName,
        folderPath: record.folderPath,
        documentType: record.documentType,
        fileFormat: record.fileFormat,
        mimeType: record.mimeType,
        driveUrl: record.driveUrl,
        keywords: record.keywords,
        indexedAt: record.indexedAt,
        status: record.status,
        notes: record.notes,
        metadataScore: scoreResult.score,
        matchedTerms: scoreResult.matchedTerms
      };
    })
    .sort(compareNoscaCandidates_);
}

/**
 * Metadata weighting favors titles and curated Keywords.
 */
function scoreNoscaMetadataRecord_(record, query) {
  const name = normalizeNoscaSearchText_(record.fileName);
  const keywords = normalizeNoscaSearchText_(record.keywords);
  const folder = normalizeNoscaSearchText_(record.folderPath);
  const documentType = normalizeNoscaSearchText_(
    record.documentType
  );
  const fileFormat = normalizeNoscaSearchText_(
    record.fileFormat
  );

  let score = 0;
  const matched = {};

  query.terms.forEach(function (term) {
    let matchedTerm = false;

    if (containsNoscaSearchTerm_(name, term)) {
      score += 6;
      matchedTerm = true;
    }

    if (containsNoscaSearchTerm_(keywords, term)) {
      score += 5;
      matchedTerm = true;
    }

    if (containsNoscaSearchTerm_(folder, term)) {
      score += 2;
      matchedTerm = true;
    }

    if (containsNoscaSearchTerm_(documentType, term)) {
      score += 8;
      matchedTerm = true;
    }

    if (containsNoscaSearchTerm_(fileFormat, term)) {
      score += 4;
      matchedTerm = true;
    }

    if (matchedTerm) {
      matched[term] = true;
    }
  });

  query.phrases.forEach(function (phrase) {
    if (!phrase || phrase.length < 4) return;

    if (name.indexOf(phrase) !== -1) {
      score += 10;
    }

    if (keywords.indexOf(phrase) !== -1) {
      score += 8;
    }

    if (folder.indexOf(phrase) !== -1) {
      score += 3;
    }

    if (documentType.indexOf(phrase) !== -1) {
      score += 10;
    }

    if (fileFormat.indexOf(phrase) !== -1) {
      score += 5;
    }
  });

  const matchedTerms = Object.keys(matched);
  score += Math.max(0, matchedTerms.length - 1) * 2;

  return {
    score: score,
    matchedTerms: matchedTerms
  };
}

/**
 * Scores one extracted chunk against the normalized query.
 */
function scoreNoscaContentChunk_(text, query, candidate) {
  const normalized = normalizeNoscaSearchText_(text);
  let score = 0;
  const matched = {};

  query.terms.forEach(function (term) {
    const occurrences = countNoscaTermOccurrences_(
      normalized,
      term
    );

    if (occurrences > 0) {
      matched[term] = true;
      score += Math.min(occurrences, 5) * 2;
    }
  });

  query.phrases.forEach(function (phrase) {
    if (!phrase || phrase.length < 4) return;

    if (normalized.indexOf(phrase) !== -1) {
      score += 8;
    }
  });

  const matchedTerms = Object.keys(matched);

  if (matchedTerms.length > 1) {
    score += (matchedTerms.length - 1) * 3;
  }

  score += Math.min(candidate.metadataScore || 0, 10) * 0.15;

  return {
    score: Number(score.toFixed(2)),
    matchedTerms: matchedTerms
  };
}

/**
 * Splits text into overlapping chunks while preferring natural boundaries.
 */
function splitNoscaContentIntoChunks_(
  text,
  targetChars,
  overlapChars
) {
  const source = normalizeNoscaExtractedText_(text);

  if (!source) {
    return [];
  }

  const target = Math.max(Number(targetChars || 2600), 800);
  const overlap = Math.min(
    Math.max(Number(overlapChars || 300), 0),
    Math.floor(target / 3)
  );

  if (source.length <= target) {
    return [source];
  }

  const chunks = [];
  let start = 0;
  let guard = 0;

  while (start < source.length && guard < 1000) {
    guard += 1;

    let end = Math.min(start + target, source.length);

    if (end < source.length) {
      const paragraphBreak = source.lastIndexOf(
        '\n\n',
        end
      );
      const lineBreak = source.lastIndexOf(
        '\n',
        end
      );
      const sentenceBreak = source.lastIndexOf(
        '. ',
        end
      );

      const preferredBreak = Math.max(
        paragraphBreak,
        lineBreak,
        sentenceBreak
      );

      if (
        preferredBreak > start + Math.floor(target * 0.55)
      ) {
        end = preferredBreak + 1;
      }
    }

    const chunk = source
      .substring(start, end)
      .trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= source.length) {
      break;
    }

    start = Math.max(
      end - overlap,
      start + 1
    );
  }

  return chunks;
}

/**
 * Applies global chunk count and total character ceilings.
 */
function buildNoscaBoundedContext_(
  rankedChunks,
  maxChunks,
  maxChars
) {
  const selected = [];
  const fileChunkCounts = {};
  let totalChars = 0;

  const chunkLimit = Math.max(Number(maxChunks || 8), 1);
  const charLimit = Math.max(Number(maxChars || 22000), 1000);

  for (
    let index = 0;
    index < rankedChunks.length;
    index += 1
  ) {
    if (selected.length >= chunkLimit) {
      break;
    }

    const chunk = rankedChunks[index];
    const alreadySelected =
      fileChunkCounts[chunk.fileId] || 0;

    if (
      alreadySelected >=
      NOSCA_CONFIG.retrieval.maxChunksPerFile
    ) {
      continue;
    }

    const remaining = charLimit - totalChars;

    if (remaining <= 0) {
      break;
    }

    let text = chunk.text;

    if (text.length > remaining) {
      if (remaining < 500) {
        break;
      }

      text =
        text.substring(0, remaining) +
        '\n[Context truncated]';
    }

    selected.push({
      sourceIndex: 0,
      fileId: chunk.fileId,
      fileName: chunk.fileName,
      folderPath: chunk.folderPath,
      documentType: chunk.documentType,
      fileFormat: chunk.fileFormat,
      mimeType: chunk.mimeType,
      driveUrl: chunk.driveUrl,
      chunkIndex: chunk.chunkIndex,
      score: chunk.score,
      matchedTerms: chunk.matchedTerms,
      text: text
    });

    fileChunkCounts[chunk.fileId] =
      alreadySelected + 1;

    totalChars += text.length;
  }

  return {
    contextChunks: selected,
    totalChars: totalChars
  };
}

/**
 * Assigns stable source numbers based on candidate order.
 */
function assignNoscaSourceIndexes_(chunks, candidates) {
  const sourceMap = {};
  let nextIndex = 1;

  candidates.forEach(function (candidate) {
    if (sourceMap[candidate.fileId]) return;

    sourceMap[candidate.fileId] = nextIndex;
    nextIndex += 1;
  });

  chunks.forEach(function (chunk) {
    chunk.sourceIndex =
      sourceMap[chunk.fileId] || 0;
  });
}

/**
 * Normalizes a user question and removes common low-information terms.
 */
function normalizeNoscaQuery_(question) {
  const text = String(question || '')
    .replace(/\s+/g, ' ')
    .trim();

  const normalized = normalizeNoscaSearchText_(text);

  const rawTerms = normalized
    .split(' ')
    .filter(function (term) {
      return term !== '';
    });

  const terms = [];
  const seen = {};

  rawTerms.forEach(function (term) {
    if (!isNoscaMeaningfulQueryTerm_(term)) {
      return;
    }

    if (seen[term]) {
      return;
    }

    seen[term] = true;
    terms.push(term);
  });

  const phrases = [];

  for (let size = 3; size >= 2; size -= 1) {
    for (
      let index = 0;
      index <= rawTerms.length - size;
      index += 1
    ) {
      const parts = rawTerms.slice(
        index,
        index + size
      );

      const meaningfulParts = parts.filter(
        isNoscaMeaningfulQueryTerm_
      );

      if (meaningfulParts.length < 2) {
        continue;
      }

      const phrase = parts.join(' ');

      if (phrases.indexOf(phrase) === -1) {
        phrases.push(phrase);
      }
    }
  }

  return {
    text: text,
    normalized: normalized,
    terms: terms.slice(0, 30),
    phrases: phrases.slice(0, 20)
  };
}

function isNoscaMeaningfulQueryTerm_(term) {
  const stopWords = {
    a: true,
    about: true,
    an: true,
    and: true,
    are: true,
    as: true,
    at: true,
    be: true,
    can: true,
    could: true,
    do: true,
    does: true,
    document: true,
    documents: true,
    file: true,
    files: true,
    find: true,
    for: true,
    from: true,
    have: true,
    has: true,
    how: true,
    i: true,
    in: true,
    is: true,
    it: true,
    me: true,
    of: true,
    on: true,
    our: true,
    please: true,
    show: true,
    tell: true,
    that: true,
    the: true,
    their: true,
    this: true,
    to: true,
    us: true,
    what: true,
    where: true,
    which: true,
    who: true,
    with: true,
    would: true,
    you: true
  };

  const value = String(term || '').trim();

  if (!value || stopWords[value]) {
    return false;
  }

  if (/^[a-z0-9+#&.-]{2,}$/.test(value)) {
    return true;
  }

  return value.length >= 3;
}

function normalizeNoscaSearchText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_/\\|()[\]{}:,;!?'"`~*=<>]/g, ' ')
    .replace(/[^a-z0-9+#&.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsNoscaSearchTerm_(text, term) {
  if (!text || !term) return false;

  const paddedText = ' ' + text + ' ';
  const paddedTerm = ' ' + term + ' ';

  if (paddedText.indexOf(paddedTerm) !== -1) {
    return true;
  }

  return text.indexOf(term) !== -1;
}

function countNoscaTermOccurrences_(text, term) {
  if (!text || !term) return 0;

  let count = 0;
  let start = 0;

  while (count < 20) {
    const found = text.indexOf(term, start);

    if (found === -1) {
      break;
    }

    count += 1;
    start = found + term.length;
  }

  return count;
}

function compareNoscaCandidates_(a, b) {
  if (b.metadataScore !== a.metadataScore) {
    return b.metadataScore - a.metadataScore;
  }

  const nameCompare = String(a.fileName || '').localeCompare(
    String(b.fileName || '')
  );

  if (nameCompare !== 0) {
    return nameCompare;
  }

  return String(a.fileId || '').localeCompare(
    String(b.fileId || '')
  );
}

function compareNoscaChunks_(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  if (b.metadataScore !== a.metadataScore) {
    return b.metadataScore - a.metadataScore;
  }

  if (a.fileId !== b.fileId) {
    return String(a.fileId || '').localeCompare(
      String(b.fileId || '')
    );
  }

  return a.chunkIndex - b.chunkIndex;
}

/**
 * Builds a source-labelled context block for the next phase.
 */
function buildNoscaContextText_(retrievalResult) {
  if (
    !retrievalResult ||
    !retrievalResult.contextChunks ||
    !retrievalResult.contextChunks.length
  ) {
    return '';
  }

  return retrievalResult.contextChunks
    .map(function (chunk) {
      return (
        '[Source ' +
        chunk.sourceIndex +
        ': ' +
        chunk.fileName +
        ' | Type: ' +
        String(chunk.documentType || 'Other') +
        ' | Format: ' +
        String(chunk.fileFormat || '') +
        ' | Path: ' +
        String(chunk.folderPath || '') +
        ' | Chunk ' +
        chunk.chunkIndex +
        ']\n' +
        chunk.text
      );
    })
    .join('\n\n---\n\n');
}

/**
 * Debug-only summary of the current NOSCA_Index without logging document text.
 */
function summarizeNoscaIndexForDebug_(existing) {
  const summary = {
    totalRows: 0,
    byStatus: {},
    byMimeType: {},
    byDocumentType: {},
    activeSupported: 0,
    activeUnsupportedMime: 0
  };

  Object.keys(existing || {}).forEach(function (fileId) {
    const record = existing[fileId] || {};
    const status =
      String(record.status || '(blank)');
    const mime =
      String(record.mimeType || '(blank)');

    summary.totalRows += 1;
    summary.byStatus[status] =
      (summary.byStatus[status] || 0) + 1;
    summary.byMimeType[mime] =
      (summary.byMimeType[mime] || 0) + 1;

    const documentType =
      String(record.documentType || '(blank)');
    summary.byDocumentType[documentType] =
      (summary.byDocumentType[documentType] || 0) + 1;

    if (status === NOSCA_CONFIG.statuses.active) {
      if (
        NOSCA_SUPPORTED_CONTENT_MIME_TYPES.indexOf(mime) !== -1
      ) {
        summary.activeSupported += 1;
      } else {
        summary.activeUnsupportedMime += 1;
      }
    }
  });

  return summary;
}

function noscaDebugLog_(label, data) {
  if (
    !NOSCA_CONFIG.debug ||
    !NOSCA_CONFIG.debug.enabled
  ) {
    return;
  }

  console.log(
    '[Ask NOSCA DEBUG] ' + label,
    data
  );
}

function noscaDebugWarn_(label, data) {
  if (
    !NOSCA_CONFIG.debug ||
    !NOSCA_CONFIG.debug.enabled
  ) {
    return;
  }

  console.warn(
    '[Ask NOSCA DEBUG] ' + label,
    data
  );
}

function noscaDebugError_(label, data) {
  if (
    !NOSCA_CONFIG.debug ||
    !NOSCA_CONFIG.debug.enabled
  ) {
    return;
  }

  console.error(
    '[Ask NOSCA DEBUG] ' + label,
    data
  );
}

/**
 * Produces deduplicated source metadata for answer attribution.
 */
function getNoscaRetrievedSources_(retrievalResult) {
  const seen = {};
  const sources = [];

  if (
    !retrievalResult ||
    !retrievalResult.contextChunks
  ) {
    return sources;
  }

  retrievalResult.contextChunks.forEach(function (chunk) {
    if (seen[chunk.fileId]) {
      return;
    }

    seen[chunk.fileId] = true;

    sources.push({
      sourceIndex: chunk.sourceIndex,
      fileId: chunk.fileId,
      fileName: chunk.fileName,
      folderPath: chunk.folderPath,
      documentType: chunk.documentType,
      fileFormat: chunk.fileFormat,
      mimeType: chunk.mimeType,
      driveUrl: chunk.driveUrl
    });
  });

  sources.sort(function (a, b) {
    return a.sourceIndex - b.sourceIndex;
  });

  return sources;
}
