/**
 * Ask NOSCA — Conversation context
 *
 * Keeps short follow-up requests grounded in the current browser-session
 * topic without persisting full chat history on the server.
 */

/**
 * Accepts both the legacy string request and the new structured request.
 *
 * @param {string|Object} request
 * @return {{question:string, context:Object}}
 */
function normalizeNoscaRequest_(request) {
  if (
    request &&
    typeof request === 'object' &&
    !Array.isArray(request)
  ) {
    return {
      question: String(request.question || ''),
      context: sanitizeNoscaConversationContext_(request.context)
    };
  }

  return {
    question: String(request || ''),
    context: sanitizeNoscaConversationContext_(null)
  };
}

/**
 * Resolves the current message against the previous browser-session context.
 *
 * @param {string} question
 * @param {Object} previousContext
 * @return {Object}
 */
function resolveNoscaConversationContext_(question, previousContext) {
  const currentQuestion = String(question || '').trim();
  const previous = sanitizeNoscaConversationContext_(previousContext);

  const requestedTypes =
    detectNoscaRequestedDocumentTypes_(currentQuestion);

  const explicitTopicTerms =
    extractNoscaConversationTopicTerms_(currentQuestion);

  const directLookup =
    isNoscaDocumentLookupQuestion_(currentQuestion);

  const knowledgeIntent =
    hasNoscaKnowledgeIntent_(currentQuestion);

  const followUpCue =
    hasNoscaFollowUpCue_(currentQuestion);

  const hasPreviousTopic =
    previous.topicTerms.length > 0;

  const typeOnlyOrShortFollowUp =
    requestedTypes.length > 0 &&
    explicitTopicTerms.length === 0;

  const inheritPreviousTopic =
    hasPreviousTopic &&
    (
      explicitTopicTerms.length === 0 ||
      followUpCue ||
      typeOnlyOrShortFollowUp
    );

  let topicTerms = [];

  if (explicitTopicTerms.length > 0) {
    topicTerms = explicitTopicTerms.slice();
  } else if (inheritPreviousTopic) {
    topicTerms = previous.topicTerms.slice();
  }

  let intent = directLookup
    ? 'document_lookup'
    : 'knowledge';

  if (
    !directLookup &&
    !knowledgeIntent &&
    requestedTypes.length > 0 &&
    previous.lastIntent === 'document_lookup' &&
    inheritPreviousTopic
  ) {
    intent = 'document_lookup';
  }

  if (
    !directLookup &&
    followUpCue &&
    requestedTypes.length > 0 &&
    previous.lastIntent === 'document_lookup' &&
    inheritPreviousTopic
  ) {
    intent = 'document_lookup';
  }

  let documentTypes = requestedTypes.slice();

  if (
    !documentTypes.length &&
    inheritPreviousTopic &&
    isNoscaReferenceFollowUp_(currentQuestion)
  ) {
    documentTypes = previous.documentTypes.slice();
  }

  const contextApplied =
    inheritPreviousTopic &&
    topicTerms.length > 0;

  const resolvedQuestion =
    buildNoscaResolvedQuestion_(
      currentQuestion,
      topicTerms,
      documentTypes,
      contextApplied
    );

  const nextContext = {
    version: 1,
    topicTerms: topicTerms.slice(0, 12),
    topicLabel: buildNoscaTopicLabel_(topicTerms),
    lastIntent: intent,
    documentTypes: documentTypes.slice(0, 4),
    previousQuestion: currentQuestion.slice(0, 500),
    previousResolvedQuestion: resolvedQuestion.slice(0, 1000),
    updatedAt: new Date().toISOString()
  };

  return {
    question: currentQuestion,
    resolvedQuestion: resolvedQuestion,
    intent: intent,
    requestedDocumentTypes: documentTypes,
    contextApplied: contextApplied,
    inheritedTopic: contextApplied
      ? previous.topicTerms.slice()
      : [],
    explicitTopicTerms: explicitTopicTerms,
    context: nextContext
  };
}

/**
 * Keeps only safe, bounded context fields supplied by the browser.
 *
 * @param {Object} value
 * @return {Object}
 */
function sanitizeNoscaConversationContext_(value) {
  const source =
    value && typeof value === 'object'
      ? value
      : {};

  const rawTopicTerms =
    Array.isArray(source.topicTerms)
      ? source.topicTerms
      : [];

  const topicTerms = [];
  const seen = {};

  rawTopicTerms.forEach(function (term) {
    const normalized =
      normalizeNoscaSearchText_(term);

    if (
      !normalized ||
      normalized.indexOf(' ') !== -1 ||
      seen[normalized]
    ) {
      return;
    }

    seen[normalized] = true;
    topicTerms.push(normalized);
  });

  const validTypes = Object.keys(
    NOSCA_CONFIG.documentTypes
  ).map(function (key) {
    return NOSCA_CONFIG.documentTypes[key];
  });

  const documentTypes =
    (Array.isArray(source.documentTypes)
      ? source.documentTypes
      : []
    )
      .map(function (type) {
        return String(type || '').trim();
      })
      .filter(function (type, index, array) {
        return (
          validTypes.indexOf(type) !== -1 &&
          array.indexOf(type) === index
        );
      })
      .slice(0, 4);

  const lastIntent =
    source.lastIntent === 'document_lookup'
      ? 'document_lookup'
      : 'knowledge';

  return {
    version: 1,
    topicTerms: topicTerms.slice(0, 12),
    topicLabel: String(source.topicLabel || '').slice(0, 160),
    lastIntent: lastIntent,
    documentTypes: documentTypes,
    previousQuestion:
      String(source.previousQuestion || '').slice(0, 500),
    previousResolvedQuestion:
      String(source.previousResolvedQuestion || '').slice(0, 1000),
    updatedAt: String(source.updatedAt || '').slice(0, 60)
  };
}

/**
 * Pulls durable subject terms from the user's message.
 *
 * "Give me the files for PJL CashHub" -> ["pjl", "cashhub"]
 * "I want EE" -> []
 *
 * @param {string} question
 * @return {string[]}
 */
function extractNoscaConversationTopicTerms_(question) {
  const normalized =
    normalizeNoscaQuery_(question);

  const ignore = {
    also: true,
    another: true,
    instead: true,
    latest: true,
    new: true,
    newest: true,
    next: true,
    only: true,
    previous: true,
    recent: true,
    same: true,
    want: true,
    wanted: true,
    need: true,
    needed: true,
    give: true,
    get: true,
    getting: true,
    looking: true,
    look: true,
    open: true,
    send: true,
    provide: true,
    related: true,
    relevant: true,
    available: true,
    include: true,
    includes: true,
    including: true,
    summarize: true,
    summary: true,
    explain: true,
    describe: true,
    compare: true,
    architecture: true,
    approach: true,
    process: true,
    solution: true,
    solutions: true,
    capability: true,
    capabilities: true,
    presentation: true,
    presentations: true,
    slide: true,
    slides: true,
    deck: true,
    decks: true,
    ppt: true,
    pptx: true,
    powerpoint: true,
    proposal: true,
    proposals: true,
    bid: true,
    bids: true,
    rfp: true,
    rfi: true,
    rfq: true,
    ee: true,
    effort: true,
    estimate: true,
    estimation: true,
    material: true,
    materials: true,
    those: true,
    them: true,
    one: true,
    ones: true
  };

  return normalized.terms
    .filter(function (term) {
      return !ignore[term];
    })
    .slice(0, 12);
}

function hasNoscaKnowledgeIntent_(question) {
  const value =
    normalizeNoscaSearchText_(question);

  return /\b(what|how|why|explain|summarize|summary|describe|compare|analyze|analyse|content|say|tell)\b/.test(
    value
  );
}

function hasNoscaFollowUpCue_(question) {
  const value =
    normalizeNoscaSearchText_(question);

  return (
    /\b(also|instead|then|next|same|those|them|it|one|ones|only)\b/.test(
      value
    ) ||
    value.indexOf('how about') !== -1 ||
    value.indexOf('what about') !== -1 ||
    value.indexOf('i want') !== -1 ||
    value.indexOf('give me') !== -1 ||
    value.indexOf('show me') !== -1
  );
}

function isNoscaReferenceFollowUp_(question) {
  const value =
    normalizeNoscaSearchText_(question);

  return /\b(those|them|it|one|ones|same|latest|newest|recent)\b/.test(
    value
  );
}

/**
 * Builds the query that retrieval sees.
 */
function buildNoscaResolvedQuestion_(
  question,
  topicTerms,
  documentTypes,
  contextApplied
) {
  const original =
    String(question || '').trim();

  if (!contextApplied || !topicTerms.length) {
    return original;
  }

  const parts = [
    topicTerms.join(' ')
  ];

  if (documentTypes && documentTypes.length) {
    parts.push(documentTypes.join(' '));
  }

  parts.push(original);

  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

function buildNoscaTopicLabel_(topicTerms) {
  return (topicTerms || [])
    .map(function (term) {
      if (String(term).length <= 4) {
        return String(term).toUpperCase();
      }

      return String(term)
        .charAt(0)
        .toUpperCase() +
        String(term).slice(1);
    })
    .join(' ')
    .slice(0, 160);
}

/**
 * Manual diagnostic for the expected context flow.
 *
 * @return {Object}
 */
function testNoscaConversationContext() {
  const first = resolveNoscaConversationContext_(
    'Give me the files for PJL CashHub',
    null
  );

  const second = resolveNoscaConversationContext_(
    'I want EE',
    first.context
  );

  const third = resolveNoscaConversationContext_(
    'How about presentations?',
    second.context
  );

  const fourth = resolveNoscaConversationContext_(
    'Show me Maria Health proposals',
    third.context
  );

  const result = {
    ok:
      first.context.topicTerms.indexOf('pjl') !== -1 &&
      first.context.topicTerms.indexOf('cashhub') !== -1 &&
      second.resolvedQuestion.indexOf('pjl') !== -1 &&
      second.resolvedQuestion.indexOf('cashhub') !== -1 &&
      second.intent === 'document_lookup' &&
      second.requestedDocumentTypes.indexOf(
        NOSCA_CONFIG.documentTypes.ee
      ) !== -1 &&
      third.requestedDocumentTypes.indexOf(
        NOSCA_CONFIG.documentTypes.presentation
      ) !== -1 &&
      fourth.context.topicTerms.indexOf('maria') !== -1 &&
      fourth.context.topicTerms.indexOf('health') !== -1 &&
      fourth.context.topicTerms.indexOf('pjl') === -1,
    first: first,
    second: second,
    third: third,
    fourth: fourth
  };

  console.log(
    '[Ask NOSCA][Context Test] ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}
