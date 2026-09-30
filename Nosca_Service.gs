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
function askNosca(question) {
  const startedAt = Date.now();
  const requestId = createNoscaRequestId_();

  let validatedQuestion = '';

  try {
    validatedQuestion =
      validateNoscaPublicQuestion_(question);

    const retrieval = retrieveNoscaContext_(
      validatedQuestion
    );

    const sources = getNoscaRetrievedSources_(
      retrieval
    );

    if (
      !retrieval.contextChunks ||
      !retrieval.contextChunks.length
    ) {
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
        model: '',
        usage: {
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0
        },
        diagnostics: {
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
          elapsedMs: noResult.elapsedMs
        }
      );

      return noResult;
    }

    const generated = generateNoscaGroundedAnswer_(
      validatedQuestion,
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
          mimeType: source.mimeType,
          driveUrl: source.driveUrl
        };
      }),
      model: generated.model,
      usage: generated.usage,
      diagnostics: {
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
        String(question || '').trim(),
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
