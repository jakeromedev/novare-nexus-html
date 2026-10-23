/**
 * Ask NOSCA Phase 2B — opt-in, metadata-only, Drive file lookup V3.
 * V2 remains the default. No NOSCA_Index access, Gemini, or content reads.
 * Version exposed in lookup.summary.searchVersion and searchDiagnostics.
 */
const NOSCA_PHASE2B_VERSION = 'nosca-lookup-v3-20261023';

function noscaPhase2BEnabled_() {
  return String(PropertiesService.getScriptProperties()
    .getProperty('NOSCA_DOCUMENT_LOOKUP_V3_ENABLED') || 'false')
    .trim().toLowerCase() === 'true';
}

/** Normalize punctuation only for title ranking; never rewrite Drive IDs. */
function noscaV3Title_(value) {
  return String(value || '').toLowerCase()
    .replace(/[_\-\/\\()[\]{}.,:;!?]+/g, ' ')
    .replace(/[^a-z0-9+#&\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function noscaV3HasTerm_(text, term) {
  return (' ' + text + ' ').indexOf(' ' + term + ' ') !== -1;
}

/** An integer in a version number or calendar date does not mean N years. */
function noscaV3Duration_(value) {
  const normalized = noscaV3Title_(value);
  const match = normalized.match(/(?:^|\s)(\d{1,2})\s*(?:years?|yrs?)(?=\s|$)/);
  return match ? Number(match[1]) : null;
}

function noscaV3QueryInfo_(question) {
  const query = typeof question === 'string' ? normalizeNoscaQuery_(question) : question;
  const title = noscaV3Title_(query.text);
  const duration = noscaV3Duration_(query.text);
  const ignored = {
    year:true, years:true, yr:true, yrs:true, find:true, show:true,
    where:true, list:true, locate:true, novare:true, for:true,
    document:true, documents:true, file:true, files:true, material:true,
    materials:true, deck:true, decks:true, presentation:true,
    presentations:true, slide:true, slides:true, ppt:true, pptx:true,
    spreadsheet:true, spreadsheets:true, sheet:true, sheets:true,
    proposal:true, proposals:true, folder:true, folders:true,
    directory:true, directories:true, recording:true, recordings:true
  };
  const topics = (query.terms || []).filter(function (term) {
    return !ignored[term] && !(duration !== null && /^\d+$/.test(term));
  });
  const uniqueTopics = topics.filter(function (term, index) {
    return topics.indexOf(term) === index;
  });
  const anchors = getNoscaRequiredAliasAnchors_(query);
  return {
    query: query,
    normalizedTitle: title,
    duration: duration,
    topics: uniqueTopics,
    requiredAliases: anchors,
    requestedTypes: detectNoscaRequestedDocumentTypes_(query.text),
    requestedItemTypes: detectNoscaRequestedItemTypes_(query.text),
    explicitlyWantsFolder: /\b(folders?|director(?:y|ies))\b/.test(title),
    explicitlyWantsRecording: /\b(recordings?|videos?)\b/.test(title)
  };
}

/** Explainable scoring, intentionally isolated from knowledge retrieval. */
function noscaScoreDriveLookupV3_(record, info) {
  const title = noscaV3Title_(record.fileName);
  const actualDuration = noscaV3Duration_(record.fileName);
  const isFolder = record.itemType === NOSCA_CONFIG.itemTypes.folder;
  const documentType = String(record.documentType || '').toLowerCase();
  const lowerName = String(record.fileName || '').toLowerCase();
  const matchedTerms = info.topics.filter(function (term) {
    return noscaV3HasTerm_(title, term);
  });
  const missingAliases = info.requiredAliases.filter(function (anchor) {
    return !noscaV3HasTerm_(title, anchor);
  });
  const numericConflict = info.duration !== null && actualDuration !== null &&
    info.duration !== actualDuration;
  const missingDuration = info.duration !== null && actualDuration !== info.duration;
  const numericMissing = missingDuration ? [String(info.duration)] : [];
  const typeRejected = (info.requestedTypes.length &&
      info.requestedTypes.indexOf(record.documentType) === -1) ||
    (info.requestedItemTypes.length &&
      info.requestedItemTypes.indexOf(record.itemType) === -1);
  const topicMatched = info.topics.length ? matchedTerms.length : 0;
  // Never invent a topical match from an unrelated 'fullText' hit.
  const hasRequiredTopics = info.topics.length > 0 &&
    topicMatched >= (info.topics.length <= 2 ? info.topics.length :
      Math.ceil(info.topics.length * 0.75));
  const rejectedBecause = typeRejected ? 'requested-type-mismatch' :
    numericConflict ? 'different-year-duration' :
    missingDuration ? 'missing-year-duration' :
    missingAliases.length ? 'required-client-alias-missing' :
    !hasRequiredTopics ? 'missing-title-topic' : '';
  const breakdown = {
    topicTerms: topicMatched * 22,
    allTopics: topicMatched === info.topics.length && topicMatched > 0 ? 36 : 0,
    duration: info.duration !== null && actualDuration === info.duration ? 34 : 0,
    contiguousPhrase: 0,
    fileType: 0,
    originalVersion: 0,
    explicitClient: 0
  };
  if (info.duration !== null && actualDuration === info.duration) {
    // Handles 3-Year, 3_Year, 3 year; natural contiguous '3 year roadmap'.
    if (info.topics.indexOf('roadmap') !== -1 &&
        noscaV3HasTerm_(title, 'roadmap')) {
      // Renewal Roadmap / Roadmap Update Plan are meaningful 3-year deliverables
      // even when another qualifier separates "3-Year" from "Roadmap".
      breakdown.contiguousPhrase = 50;
      if (new RegExp('(?:^| )' + info.duration +
        ' (?:year|years|yr|yrs) roadmap(?: |$)').test(title)) {
        breakdown.contiguousPhrase += 8;
      }
    }
  }
  if (info.explicitlyWantsFolder) {
    breakdown.fileType = isFolder ? 25 : -15;
  } else if (isFolder) {
    breakdown.fileType = -25;
  } else if (info.explicitlyWantsRecording && /recording|video/.test(title)) {
    breakdown.fileType = 22;
  } else if (documentType === 'presentation' ||
      documentType === 'spreadsheet' || documentType === 'ee') {
    breakdown.fileType = 24;
  } else if (documentType === 'document' || documentType === 'proposal') {
    breakdown.fileType = 13;
  } else {
    breakdown.fileType = -13;
  }
  if (!info.explicitlyWantsRecording && /\b(recording|video)\b/.test(title)) {
    breakdown.fileType -= 22;
  }
  if (/\b(notes|transcript|meeting|brainstorming|checkpoint)\b/.test(title)) {
    breakdown.fileType -= 12;
  }
  if (/^(?:copy of|duplicate of)\b/i.test(lowerName)) breakdown.originalVersion -= 8;
  if (/\b(?:draft|wip|working copy)\b/i.test(title)) breakdown.originalVersion -= 4;
  breakdown.explicitClient = info.requiredAliases.length * 12;

  const score = Object.keys(breakdown).reduce(function (total, key) {
    return total + breakdown[key];
  }, 0);
  return {
    passes: !rejectedBecause,
    rejectReason: rejectedBecause,
    score: score,
    scoreBreakdown: breakdown,
    lookupCoverage: info.topics.length ? Number((topicMatched / info.topics.length).toFixed(3)) : 0,
    matchedTerms: matchedTerms,
    missingAliases: missingAliases,
    missingNumbers: numericMissing,
    numericDuration: actualDuration
  };
}

function noscaV3Compare_(a, b) {
  if (b.metadataScore !== a.metadataScore) return b.metadataScore - a.metadataScore;
  if (b.lookupCoverage !== a.lookupCoverage) return b.lookupCoverage - a.lookupCoverage;
  // Freshness is intentionally only a tie-breaker.
  const aDate = String(a.modifiedTime || '');
  const bDate = String(b.modifiedTime || '');
  if (aDate !== bDate) return bDate.localeCompare(aDate);
  return String(a.fileName || '').localeCompare(String(b.fileName || ''));
}

function noscaV3Rank_(records, info) {
  const ids = {};
  let duplicateIds = 0;
  const scored = (records || []).map(function (item) {
    if (!item || !item.fileId) return null;
    if (ids[item.fileId]) { duplicateIds += 1; return null; }
    ids[item.fileId] = true;
    const score = noscaScoreDriveLookupV3_(item, info);
    return Object.assign({}, item, {
      metadataScore: score.score,
      matchedTerms: score.matchedTerms,
      lookupCoverage: score.lookupCoverage,
      lookupMatchedTerms: score.matchedTerms,
      lookupMissingAnchors: score.missingAliases,
      lookupMissingNumbers: score.missingNumbers,
      lookupPassesContext: score.passes,
      lookupRejectReason: score.rejectReason,
      lookupScoreBreakdown: score.scoreBreakdown,
      lookupDuration: score.numericDuration
    });
  }).filter(Boolean);
  return { ranked: scored.filter(function (r) { return r.lookupPassesContext; })
    .sort(noscaV3Compare_),
    rejected: scored.filter(function (r) { return !r.lookupPassesContext; }),
    duplicateIds: duplicateIds };
}

function noscaV3FocusAnchor_(info) {
  const first = info.topics.filter(function (term) {
    return !/^(pjl|cashhub|novare)$/.test(term) && /^[a-z0-9+#&.-]{3,60}$/.test(term);
  });
  if (first.length) return first.sort(function (a,b) {return b.length - a.length;})[0];
  const rest = info.topics.filter(function (term) {
    return /^[a-z0-9+#&.-]{3,60}$/.test(term);
  });
  return rest.length ? rest[0] : '';
}

/** Focused filename first; measurable, bounded fallback; never claims exhaustiveness. */
function noscaFindDriveDocumentsV3_(question, options) {
  options = options || {};
  // Never silently widen a deliberately configured restricted search scope.
  if (noscaDriveScopeStrategy_() !== 'none') {
    throw new Error('Phase 2B V3 requires NOSCA_DRIVE_SCOPE_STRATEGY=none.');
  }
  const startedAt = Date.now();
  const info = noscaV3QueryInfo_(question);
  const limit = Math.max(1, Number(NOSCA_CONFIG.retrieval.maxDocumentLookupResults || 12));
  const anchor = noscaV3FocusAnchor_(info);
  const resultsById = {};
  const candidates = [];
  const tiers = [];
  const errors = [];
  const maxCalls = Number(options.maxCalls || 5);
  const searchFn = options.searchFn || searchNoscaDriveRecords_;
  const maxElapsedMs = Number(options.maxElapsedMs || 6500);
  let apiCalls = 0;

  function runTier(label, corpus, q, pages, maxResults, driveId) {
    if (apiCalls >= maxCalls || Date.now()-startedAt >= maxElapsedMs) return null;
    try {
      const search = searchFn(info.query, 'none', {
        tier: label, corpus: corpus, q: q,
        driveId: driveId || '',
        maxPages: Math.max(1, Math.min(pages || 1, maxCalls-apiCalls)),
        maxResults: maxResults || 150,
        pageSize: 100, orderBy: 'name_natural'
      });
      apiCalls += search.apiCalls;
      (search.records || []).forEach(function (record) {
        if (!record || !record.fileId) return;
        if (!resultsById[record.fileId]) {
          const copy = Object.assign({}, record, {
            lookupProvenance: [], driveId: record.driveId || '',
            modifiedTime: record.modifiedTime || ''
          });
          resultsById[record.fileId] = copy;
          candidates.push(copy);
        }
        const item = resultsById[record.fileId];
        if (!item.lookupProvenance.some(function (p) {
          return p.tier === label && p.corpus === corpus;
        })) item.lookupProvenance.push({tier:label, corpus:corpus});
      });
      tiers.push({tier:label, corpus:corpus, driveId:driveId || '', query:q,
        apiCalls:search.apiCalls, pages:search.pageCount || 0,
        rawCount:(search.records || []).length, scanned:search.scanned,
        elapsedMs:search.elapsedMs,
        truncated:search.truncated === true,
        incompleteSearch:search.incompleteSearch === true,
        nextPageTokenPresent:search.nextPageTokenPresent === true,
        stoppedByMaxResults:search.stoppedByMaxResults === true,
        stoppedByMaxPages:search.stoppedByMaxPages === true});
      return search;
    } catch (error) {
      errors.push({tier:label, corpus:corpus,
        message:String(error && error.message || error).slice(0,200)});
      return null;
    }
  }

  const focusedQ = anchor ? "trashed = false and name contains '" +
    escapeNoscaDriveQueryValue_(anchor) + "'" : '';
  let first = null;
  if (focusedQ) first = runTier('filename-primary', 'user', focusedQ, 2, 200);
  let rank = noscaV3Rank_(candidates, info);
  const hasNumericalTopic = info.duration !== null && info.topics.length > 0;
  const insufficient = rank.ranked.length < Math.min(5, limit);
  // A single narrow user corpus can omit useful shared-drive files even with
  // strong hits. For duration-qualified topical searches, compare allDrives.
  // For other searches, broaden only on sparse/incomplete/truncated results.
  const inspectAllDrives = Boolean(focusedQ) &&
    (hasNumericalTopic || insufficient || (first &&
      (first.truncated || first.incompleteSearch)));
  if (inspectAllDrives) {
    const cross = runTier('filename-cross-drive', 'allDrives', focusedQ, 2, 200);
    // When allDrives reports incompleteness, scan specifically identified
    // shared drives (if an administrator supplied their IDs). Never guess IDs.
    if (cross && cross.incompleteSearch) {
      const driveIds = String(PropertiesService.getScriptProperties()
        .getProperty('NOSCA_PHASE2B_SHARED_DRIVE_IDS') || '').split(',')
        .map(function (id) {return id.trim();})
        .filter(function (id) {return /^[a-zA-Z0-9_-]{10,}$/.test(id);})
        .slice(0,2);
      driveIds.forEach(function (driveId) {
        runTier('filename-targeted-drive', 'drive', focusedQ, 1, 100, driveId);
      });
    }
    rank = noscaV3Rank_(candidates, info);
  }
  // An optional targeted alternate anchor handles filenames lacking the first
  // word. Do not run broad OR unless high-confidence filename candidates fail.
  if (rank.ranked.length < Math.min(3, limit) && info.topics.length > 1) {
    const alternative = info.topics.filter(function (term) {
      return term !== anchor && /^[a-z0-9+#&.-]{3,60}$/.test(term);
    })[0];
    if (alternative) {
      runTier('filename-alternate', 'user',
        "trashed = false and name contains '" +
        escapeNoscaDriveQueryValue_(alternative) + "'", 1, 100);
      rank = noscaV3Rank_(candidates, info);
    }
  }
  if (rank.ranked.length < Math.min(3, limit)) {
    const terms = noscaDriveSearchTerms_(info.query);
    if (terms.length) {
      runTier('fulltext-fallback', 'user',
        'trashed = false and (' + terms.slice(0,3).map(function (term) {
          return "fullText contains '" + escapeNoscaDriveQueryValue_(term) + "'";
        }).join(' or ') + ')', 1, 80);
      rank = noscaV3Rank_(candidates, info);
    }
  }

  const selected = rank.ranked.slice(0, limit);
  selected.forEach(function (record, i) {record.sourceIndex=i+1;});
  const diagnostic = {
    patchVersion:NOSCA_PHASE2B_VERSION,
    enabled:noscaPhase2BEnabled_(),
    strategy:'filename-first',
    focusAnchor:anchor,
    apiCalls:apiCalls,
    uniqueCandidates:candidates.length,
    eligibleCandidates:rank.ranked.length,
    rejectedCandidates:rank.rejected.length,
    duplicateIdsRemoved:rank.duplicateIds,
    searchElapsedMs:Date.now()-startedAt,
    truncated:tiers.some(function (t) {return t.truncated;}),
    incompleteSearch:tiers.some(function (t) {return t.incompleteSearch;}),
    tiers:tiers,
    errors:errors
  };
  const summary = summarizeNoscaDocumentLookupResults_(selected);
  summary.searchVersion = NOSCA_PHASE2B_VERSION;
  summary.searchCalls = apiCalls;
  const result = {
    ok:true, question:info.query.text, queryTerms:info.query.terms,
    requestedDocumentTypes:info.requestedTypes,
    requestedItemTypes:info.requestedItemTypes,
    totalMatches:rank.ranked.length,
    results:selected,
    summary:summary,
    backend:'drive', searchElapsedMs:Date.now()-startedAt,
    truncated:diagnostic.truncated,
    warning:diagnostic.truncated ?
      'Drive search was bounded; additional matching files may exist.' : '',
    searchDiagnostics:diagnostic
  };
  // Version also appears in existing chat diagnostics.lookupSummary, with
  // no UI or Nosca_Service.js replacement needed.
  noscaDebugLog_('Phase 2B V3 document lookup', {
    version:NOSCA_PHASE2B_VERSION, questionLength:info.query.text.length,
    searchElapsedMs:result.searchElapsedMs, apiCalls:apiCalls,
    results:selected.length, tiers:tiers, errors:errors
  });
  return result;
}
