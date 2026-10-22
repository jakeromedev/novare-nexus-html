/**
 * Ask NOSCA — Phase 6 service/orchestration
 *
 * Public function for the future frontend:
 *
 *   google.script.run
 *     .withSuccessHandler(...)
 *     .withFailureHandler(...)
 *     .askNosca(question);
 */

/**
 * Main public Ask NOSCA backend function.
 *
 * @param {string} question
 * @return {Object}
 */
function askNosca(request) {
  const startedAt = Date.now();
  const requestId = createNoscaRequestId_();

  const normalizedRequest =
    normalizeNoscaRequest_(request);

  const rawQuestion =
    String(normalizedRequest.question || '');

  noscaDebugLog_(
    'askNosca request started',
    {
      requestId: requestId,
      rawQuestionLength: rawQuestion.length,
      hasConversationContext:
        Boolean(
          normalizedRequest.context &&
          normalizedRequest.context.topicTerms &&
          normalizedRequest.context.topicTerms.length
        )
    }
  );

  let validatedQuestion = '';
  let resolvedQuestion = '';
  let contextResolution = null;

  try {
    validatedQuestion =
      validateNoscaPublicQuestion_(rawQuestion);

    contextResolution =
      resolveNoscaConversationContext_(
        validatedQuestion,
        normalizedRequest.context
      );

    resolvedQuestion =
      contextResolution.resolvedQuestion ||
      validatedQuestion;

    noscaDebugLog_(
      'Conversation context resolved',
      {
        requestId: requestId,
        contextApplied:
          contextResolution.contextApplied,
        intent:
          contextResolution.intent,
        topicTerms:
          contextResolution.context.topicTerms,
        documentTypes:
          contextResolution.context.documentTypes,
        resolvedQuestionLength:
          resolvedQuestion.length
      }
    );

    if (
      contextResolution.intent === 'document_lookup' ||
      isNoscaDocumentLookupQuestion_(resolvedQuestion)
    ) {
      const lookup = findNoscaIndexedDocuments_(
        resolvedQuestion
      );

      const lookupElapsedMs = Date.now() - startedAt;

      if (lookup.results && lookup.results.length) {
        const lookupSources = lookup.results.map(function (source) {
          return {
            sourceIndex: source.sourceIndex,
            itemType:
              source.itemType || NOSCA_CONFIG.itemTypes.file,
            fileName: source.fileName,
            folderPath: source.folderPath,
            hierarchyContext: source.hierarchyContext || '',
            documentType: source.documentType,
            fileFormat: source.fileFormat,
            mimeType: source.mimeType,
            driveUrl: source.driveUrl
          };
        });

        const lookupAnswer =
          buildNoscaDocumentLookupAnswer_(lookup, contextResolution);

        // Document lookups return conversational text and Drive links in a
        // single fast response, without staging a separate Gemini request.
        const lookupResult = {
          ok: true,
          requestId: requestId,
          grounded: true,
          responseMode: 'document_lookup',
          answer: lookupAnswer,
          sources: lookupSources,
          conversationContext:
            contextResolution.context,
          model: '',
          usage: {
            promptTokenCount: 0,
            candidatesTokenCount: 0,
            totalTokenCount: 0
          },
          diagnostics: {
            contextApplied:
              contextResolution.contextApplied,
            resolvedQuestion: resolvedQuestion,
            retrievalCandidateCount: lookup.totalMatches,
            contextChunkCount: 0,
            contextChars: 0,
            lookupSummary: lookup.summary,
            searchBackend: lookup.backend || 'index',
            searchElapsedMs: lookup.searchElapsedMs || 0,
            searchTruncated: lookup.truncated === true,
            requestedDocumentTypes:
              lookup.requestedDocumentTypes || [],
            retrievalWarnings: []
          },
          elapsedMs: lookupElapsedMs
        };

        safeLogNoscaRequest_({
          requestId: requestId,
          question: validatedQuestion,
          status: 'Success',
          sources: lookupSources,
          responseTimeMs: lookupElapsedMs,
          error: ''
        });

        noscaDebugLog_(
          'askNosca document lookup returned',
          {
            requestId: requestId,
            totalMatches: lookup.totalMatches,
            returned: lookupSources.length,
            summary: lookup.summary,
            contextApplied:
              contextResolution.contextApplied,
            searchBackend: lookup.backend || 'index',
            searchElapsedMs: lookup.searchElapsedMs || 0,
            elapsedMs: lookupElapsedMs
          }
        );

        return lookupResult;
      }

      const noLookupResult = {
        ok: true,
        requestId: requestId,
        grounded: false,
        responseMode: 'document_lookup',
        answer:
          buildNoscaNoDocumentLookupAnswer_(
            lookup,
            contextResolution
          ),
        sources: [],
        conversationContext:
          contextResolution.context,
        model: '',
        usage: {
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0
        },
        diagnostics: {
          contextApplied:
            contextResolution.contextApplied,
          resolvedQuestion: resolvedQuestion,
          retrievalCandidateCount: 0,
          contextChunkCount: 0,
          contextChars: 0,
          lookupSummary: lookup.summary,
          searchBackend: lookup.backend || 'index',
          searchElapsedMs: lookup.searchElapsedMs || 0,
          searchTruncated: lookup.truncated === true,
          requestedDocumentTypes:
            lookup.requestedDocumentTypes || [],
          retrievalWarnings: [
            lookup.backend === 'drive'
              ? 'No matching readable Drive documents were found.'
              : 'No matching indexed documents were found.'
          ]
        },
        elapsedMs: lookupElapsedMs
      };

      safeLogNoscaRequest_({
        requestId: requestId,
        question: validatedQuestion,
        status: 'Success',
        sources: [],
        responseTimeMs: lookupElapsedMs,
        error: ''
      });

      return noLookupResult;
    }

    const retrieval = retrieveNoscaContext_(
      resolvedQuestion
    );

    const sources = getNoscaRetrievedSources_(
      retrieval
    );

    noscaDebugLog_(
      'askNosca retrieval returned',
      {
        requestId: requestId,
        candidateCount:
          retrieval.candidates.length,
        contextChunkCount:
          retrieval.contextChunks.length,
        totalContextChars:
          retrieval.totalContextChars,
        sourceCount:
          sources.length,
        contextApplied:
          contextResolution.contextApplied,
        warnings:
          retrieval.warnings || []
      }
    );

    if (
      !retrieval.contextChunks ||
      !retrieval.contextChunks.length
    ) {
      noscaDebugWarn_(
        'askNosca is returning the NO-CONTEXT fallback.',
        {
          requestId: requestId,
          candidateCount:
            retrieval.candidates.length,
          contextChunkCount:
            retrieval.contextChunks.length,
          totalContextChars:
            retrieval.totalContextChars,
          warnings:
            retrieval.warnings || []
        }
      );

      const noResult = {
        ok: true,
        requestId: requestId,
        grounded: false,
        answer:
          'I couldn’t find enough information to answer that confidently. ' +
          'Try rephrasing your question or using a more specific client, ' +
          'project, document type, or topic.',
        sources: [],
        conversationContext:
          contextResolution.context,
        model: '',
        usage: {
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0
        },
        diagnostics: {
          contextApplied:
            contextResolution.contextApplied,
          resolvedQuestion: resolvedQuestion,
          retrievalCandidateCount:
            retrieval.candidates.length,
          contextChunkCount: 0,
          contextChars: 0,
          retrievalWarnings:
            retrieval.warnings || [],
          searchBackend: retrieval.backend || 'index',
          searchElapsedMs: retrieval.searchElapsedMs || 0,
          extractionElapsedMs: retrieval.extractionElapsedMs || 0
        },
        elapsedMs: Date.now() - startedAt
      };

      safeLogNoscaRequest_({
        requestId: requestId,
        question: validatedQuestion,
        status: 'Success',
        sources: [],
        responseTimeMs: noResult.elapsedMs,
        error: ''
      });

      console.log(
        '[Ask NOSCA] No grounded context found:',
        {
          requestId: requestId,
          questionLength: validatedQuestion.length,
          contextApplied:
            contextResolution.contextApplied,
          elapsedMs: noResult.elapsedMs
        }
      );

      return noResult;
    }

    const generationStartedAt = Date.now();
    const generated = generateNoscaGroundedAnswer_(
      resolvedQuestion,
      retrieval
    );
    const generationElapsedMs = Date.now() - generationStartedAt;

    const result = {
      ok: true,
      requestId: requestId,
      grounded: true,
      answer: generated.text,
      sources: sources.map(function (source) {
        return {
          sourceIndex: source.sourceIndex,
          itemType:
            source.itemType || NOSCA_CONFIG.itemTypes.file,
          fileName: source.fileName,
          folderPath: source.folderPath,
          hierarchyContext: source.hierarchyContext || '',
          documentType: source.documentType,
          fileFormat: source.fileFormat,
          mimeType: source.mimeType,
          driveUrl: source.driveUrl
        };
      }),
      conversationContext:
        contextResolution.context,
      model: generated.model,
      usage: generated.usage,
      diagnostics: {
        contextApplied:
          contextResolution.contextApplied,
        resolvedQuestion: resolvedQuestion,
        retrievalCandidateCount:
          retrieval.candidates.length,
        contextChunkCount:
          retrieval.contextChunks.length,
        contextChars:
          retrieval.totalContextChars,
        retrievalWarnings:
          retrieval.warnings || [],
        searchBackend: retrieval.backend || 'index',
        searchElapsedMs: retrieval.searchElapsedMs || 0,
        extractionElapsedMs: retrieval.extractionElapsedMs || 0,
        generationElapsedMs: generationElapsedMs,
        geminiAttemptCount: Number(generated.attemptCount || 1),
        geminiRetryWaitMs: Number(generated.retryWaitMs || 0),
        geminiApiElapsedMs: Number(generated.apiElapsedMs || 0),
        finishReason:
          generated.finishReason || ''
      },
      elapsedMs: Date.now() - startedAt
    };

    safeLogNoscaRequest_({
      requestId: requestId,
      question: validatedQuestion,
      status: 'Success',
      sources: result.sources,
      responseTimeMs: result.elapsedMs,
      error: ''
    });

    console.log(
      '[Ask NOSCA] Grounded answer generated:',
      {
        requestId: requestId,
        questionLength: validatedQuestion.length,
        contextApplied:
          contextResolution.contextApplied,
        sourceCount: result.sources.length,
        model: result.model,
        tokenCount: result.usage.totalTokenCount,
        searchBackend: retrieval.backend || 'index',
        searchElapsedMs: retrieval.searchElapsedMs || 0,
        extractionElapsedMs: retrieval.extractionElapsedMs || 0,
        generationElapsedMs: generationElapsedMs,
        elapsedMs: result.elapsedMs
      }
    );

    return result;
  } catch (error) {
    const elapsedMs =
      Date.now() - startedAt;

    safeLogNoscaRequest_({
      requestId: requestId,
      question:
        validatedQuestion ||
        rawQuestion.trim(),
      status: 'Failed',
      sources: [],
      responseTimeMs: elapsedMs,
      error: getNoscaErrorMessage_(error)
    });

    console.error(
      '[Ask NOSCA] Request failed:',
      {
        requestId: requestId,
        elapsedMs: elapsedMs,
        error: getNoscaErrorMessage_(error)
      }
    );

    throw error;
  }
}

/**
 * Manual end-to-end Phase 4 test.
 *
 * @return {Object}
 */
function testNoscaGroundedAnswer() {
  return askNosca(
    'What API management solutions and capabilities does Novare have?'
  );
}

/**
 * Natural, metadata-grounded reply for a fast Drive document search.
 *
 * Do not generate a second Gemini request here: that would turn a ~2-3s
 * lookup back into a slower generation workflow. Instead, mention concrete
 * details visible in returned filenames and allow the source cards to hold
 * the full filenames, counts, and links.
 *
 * This intentionally does NOT infer document contents or claim the set of
 * Drive matches is exhaustive (Drive Search may be bounded/truncated).
 */
function buildNoscaDocumentLookupAnswer_(lookup, contextResolution) {
  const results = Array.isArray(lookup && lookup.results)
    ? lookup.results : [];
  const context = contextResolution && contextResolution.context || {};
  const topic = noscaFriendlyLookupTopic_(context.topicLabel);
  const topicPhrase = topic ? 'for ' + topic : 'in Drive';
  const folderType = NOSCA_CONFIG.itemTypes.folder;
  const files = results.filter(function (item) {
    return item.itemType !== folderType;
  });
  const folders = results.filter(function (item) {
    return item.itemType === folderType;
  });
  const requestedTypes = Array.isArray(lookup && lookup.requestedDocumentTypes)
    ? lookup.requestedDocumentTypes : [];
  const requestedItemTypes = Array.isArray(lookup && lookup.requestedItemTypes)
    ? lookup.requestedItemTypes : [];
  const proposalType = NOSCA_CONFIG.documentTypes.proposal;
  const isProposalSearch = requestedTypes.length === 1 &&
    requestedTypes[0] === proposalType;
  const isFolderSearch = requestedItemTypes.length === 1 &&
    requestedItemTypes[0] === folderType;

  // The year signals are taken ONLY from visible filenames; we do not claim
  // they reflect a document's actual revision or modification date.
  const details = files.map(function (item) {
    const name = String(item.fileName || '');
    const years = [];
    const yearPattern = /(?:^|\D)(20\d{2})(?=\D|$)/g;
    let match;
    while ((match = yearPattern.exec(name)) !== null) {
      const year = Number(match[1]);
      if (year >= 2000 && year <= 2099 && years.indexOf(year) === -1) {
        years.push(year);
      }
    }
    return {
      name: name,
      years: years,
      renewal: /\brenewal\b/i.test(name),
      proposal: item.documentType === proposalType || /\bproposal\b/i.test(name)
    };
  });
  const allYears = [];
  details.forEach(function (entry) {
    entry.years.forEach(function (year) {
      if (allYears.indexOf(year) === -1) allYears.push(year);
    });
  });
  allYears.sort(function (a, b) { return b - a; });
  const renewalEntries = details.filter(function (entry) {
    return entry.renewal && entry.proposal;
  });
  const renewal = renewalEntries.length > 0;
  const renewalYears = [];
  renewalEntries.forEach(function (entry) {
    entry.years.forEach(function (year) { renewalYears.push(year); });
  });
  const renewalYear = renewalYears.length
    ? Math.max.apply(null, renewalYears) : 0;
  const otherYears = allYears.filter(function (year) {
    return year !== renewalYear;
  }).slice(0, 2);

  if (isFolderSearch || (folders.length && !files.length)) {
    if (folders.length === 1) {
      return 'Here’s the folder I came across ' + topicPhrase + '. You can open it below.';
    }
    return 'There are a few folders ' + topicPhrase + '. I’ve linked them below so you can browse what’s inside.';
  }

  if (files.length === 1) {
    if (renewalYear) {
      return 'A ' + renewalYear + ' renewal proposal came up ' + topicPhrase + '. You can open it below.';
    }
    if (isProposalSearch) {
      return 'Here’s the proposal that came up ' + topicPhrase + '. You can open it below.';
    }
    return 'This is the file that came up ' + topicPhrase + '. I’ve linked it below.';
  }

  if (renewalYear && otherYears.length) {
    return 'For ' + (topic || 'this search') + ', I’m seeing a ' +
      renewalYear + ' renewal proposal alongside files labeled ' +
      noscaJoinLookupYears_(otherYears) + '. The links are below.';
  }
  if (renewalYear) {
    return 'A ' + renewalYear + ' renewal proposal is among the matches ' +
      topicPhrase + '. I’ve linked the related files below.';
  }
  if (renewal) {
    return 'There’s a renewal proposal among the results ' + topicPhrase +
      '. I’ve included the other matching files below as well.';
  }
  if (isProposalSearch && allYears.length >= 2) {
    return 'I’m seeing proposals ' + topicPhrase + ' labeled ' +
      noscaJoinLookupYears_(allYears.slice(0, 3)) +
      '. You can open the versions below.';
  }
  if (isProposalSearch) {
    return 'Here are the proposals that came up ' + topicPhrase +
      '. I’ve kept the file links together below.';
  }
  if (files.length && folders.length) {
    return 'There’s a mix of documents and folders ' + topicPhrase +
      '. I’ve put the matching links below.';
  }
  if (allYears.length >= 2) {
    return 'For ' + (topic || 'your search') + ', I’m seeing files labeled ' +
      noscaJoinLookupYears_(allYears.slice(0, 3)) +
      '. I’ve linked them below.';
  }
  if (allYears.length === 1) {
    return 'The matches ' + topicPhrase + ' include files labeled ' +
      allYears[0] + '. I’ve linked them below.';
  }
  return 'Here’s what came up ' + topicPhrase +
    '. You can open the matching files directly below.';
}

/** Preserve known client/product capitalization in an otherwise lightweight reply. */
function noscaFriendlyLookupTopic_(value) {
  return String(value || '').trim()
    .replace(/\bcashhub\b/gi, 'CashHub')
    .replace(/\bpjl\b/gi, 'PJL')
    .replace(/\bapi\b/gi, 'API')
    .replace(/\bgcp\b/gi, 'GCP')
    .slice(0, 160);
}

function noscaJoinLookupYears_(years) {
  return joinNoscaFriendlyList_((years || []).map(String));
}

function buildNoscaNoDocumentLookupAnswer_(lookup, contextResolution) {
  const context = contextResolution && contextResolution.context || {};
  const topic = noscaFriendlyLookupTopic_(context.topicLabel);
  const requestedTypes = Array.isArray(lookup && lookup.requestedDocumentTypes)
    ? lookup.requestedDocumentTypes : [];
  const type = requestedTypes.length === 1 ? requestedTypes[0] : '';
  const what = type === NOSCA_CONFIG.documentTypes.proposal
    ? 'a matching proposal'
    : type === NOSCA_CONFIG.documentTypes.presentation
      ? 'a matching presentation'
      : type === NOSCA_CONFIG.documentTypes.ee
        ? 'a matching effort estimate' : 'a close match';
  return 'I’m not seeing ' + what + (topic ? ' for ' + topic : '') +
    ' in these Drive results. Try a project name, a year, or a different keyword.';
}

function joinNoscaFriendlyList_(items) {
  const values = (items || []).filter(Boolean);

  if (!values.length) {
    return '';
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return values[0] + ' and ' + values[1];
  }

  return (
    values.slice(0, -1).join(', ') +
    ', and ' +
    values[values.length - 1]
  );
}

function validateNoscaPublicQuestion_(question) {
  const value = String(question || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!value) {
    throw new Error(
      'Please enter a question for Ask NOSCA.'
    );
  }

  const maxChars = Number(
    NOSCA_CONFIG.gemini.maxQuestionChars || 2000
  );

  if (value.length > maxChars) {
    throw new Error(
      'Ask NOSCA questions are limited to ' +
      maxChars +
      ' characters.'
    );
  }

  return value;
}
