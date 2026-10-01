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
            fileName: source.fileName,
            folderPath: source.folderPath,
            documentType: source.documentType,
            fileFormat: source.fileFormat,
            mimeType: source.mimeType,
            driveUrl: source.driveUrl
          };
        });

        const lookupAnswer =
          buildNoscaDocumentLookupAnswer_(lookup);

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
              contextResolution.contextApplied
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
          'I could not find matching files in the current NOSCA index. ' +
          'The file may not have been indexed yet, or the search terms may ' +
          'not match its indexed metadata.',
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
          requestedDocumentTypes:
            lookup.requestedDocumentTypes || [],
          retrievalWarnings: [
            'No matching indexed documents were found.'
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
          'I could not find enough information in the available approved ' +
          'NOSCA references to answer that confidently. Try rephrasing the ' +
          'question or check whether the relevant material has been added to ' +
          'the NOSCA knowledge source.',
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
            retrieval.warnings || []
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

    const generated = generateNoscaGroundedAnswer_(
      resolvedQuestion,
      retrieval
    );

    const result = {
      ok: true,
      requestId: requestId,
      grounded: true,
      answer: generated.text,
      sources: sources.map(function (source) {
        return {
          sourceIndex: source.sourceIndex,
          fileName: source.fileName,
          folderPath: source.folderPath,
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

function buildNoscaDocumentLookupAnswer_(lookup) {
  const summary =
    lookup && lookup.summary
      ? lookup.summary
      : { returned: 0, byDocumentType: {} };

  const byType = summary.byDocumentType || {};
  const parts = [];

  [
    NOSCA_CONFIG.documentTypes.ee,
    NOSCA_CONFIG.documentTypes.proposal,
    NOSCA_CONFIG.documentTypes.presentation
  ].forEach(function (type) {
    const count = Number(byType[type] || 0);

    if (count > 0) {
      parts.push(
        count + ' ' + type + (count === 1 ? '' : ' files')
      );
    }
  });

  const knownPreferredCount =
    Number(byType[NOSCA_CONFIG.documentTypes.ee] || 0) +
    Number(byType[NOSCA_CONFIG.documentTypes.proposal] || 0) +
    Number(byType[NOSCA_CONFIG.documentTypes.presentation] || 0);

  const otherCount =
    Math.max(Number(summary.returned || 0) - knownPreferredCount, 0);

  if (otherCount > 0) {
    parts.push(
      otherCount + ' other document' + (otherCount === 1 ? '' : 's')
    );
  }

  const countText = parts.length
    ? parts.join(', ')
    : String(summary.returned || 0) + ' matching files';

  return (
    'I found matching files in the NOSCA index (' +
    countText +
    '). The strongest matches are listed below with their document type, ' +
    'file format, and Drive location.'
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
