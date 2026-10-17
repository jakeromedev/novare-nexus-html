/**
 * ONESCA Global Search — Phase 2
 *
 * Drive-backed global search using the existing hierarchy-aware NOSCA_Index.
 *
 * Public entry point:
 *   searchNexus({ query: "...", filter: "all|drive|folders|docs|sheets|slides|pdf" })
 *
 * This service:
 * - does NOT call Gemini
 * - does NOT scan Drive live
 * - does NOT modify NOSCA_Index
 * - returns only metadata already stored in the index
 */

/**
 * @param {Object|string} request
 * @return {Object}
 */
function searchNexus(request) {
  const startedAt = Date.now();

  try {
    const normalized = normalizeNexusSearchRequest_(request);

    if (!normalized.query) {
      return {
        ok: true,
        query: '',
        filter: normalized.filter,
        totalMatches: 0,
        returned: 0,
        counts: {},
        results: [],
        elapsedMs: Date.now() - startedAt
      };
    }

    // Phase 3 will connect website-page search.
    if (normalized.filter === 'pages') {
      return {
        ok: true,
        query: normalized.query,
        filter: normalized.filter,
        totalMatches: 0,
        returned: 0,
        counts: {},
        results: [],
        phaseNotice: 'page_search_pending',
        elapsedMs: Date.now() - startedAt
      };
    }

    const existing = loadNoscaExistingIndex_();
    const query = buildNexusSearchQuery_(normalized.query);

    const ranked = Object.keys(existing)
      .map(function (itemId) {
        return existing[itemId];
      })
      .filter(function (record) {
        return isNexusSearchableRecord_(record, normalized.filter);
      })
      .map(function (record) {
        return scoreNexusSearchRecord_(record, query);
      })
      .filter(function (candidate) {
        return candidate.passes;
      })
      .sort(compareNexusSearchResults_);

    const maxResults = 40;
    const maxScore =
      ranked.length
        ? Math.max(
            Number(ranked[0].score || 0),
            1
          )
        : 1;

    const results = ranked
      .slice(0, maxResults)
      .map(function (candidate) {
        return toNexusSearchResult_(
          candidate,
          maxScore
        );
      });

    const counts = summarizeNexusSearchResults_(ranked);

    const result = {
      ok: true,
      query: normalized.query,
      filter: normalized.filter,
      totalMatches: ranked.length,
      returned: results.length,
      truncated: ranked.length > results.length,
      counts: counts,
      results: results,
      elapsedMs: Date.now() - startedAt
    };

    console.log(
      '[ONESCA Search] Completed:',
      {
        queryLength: normalized.query.length,
        filter: normalized.filter,
        totalMatches: result.totalMatches,
        returned: result.returned,
        folders: result.counts.folders || 0,
        docs: result.counts.docs || 0,
        sheets: result.counts.sheets || 0,
        slides: result.counts.slides || 0,
        pdf: result.counts.pdf || 0,
        elapsedMs: result.elapsedMs
      }
    );

    return result;
  } catch (error) {
    console.error(
      '[ONESCA Search] Failed:',
      {
        elapsedMs: Date.now() - startedAt,
        error: getNexusSearchErrorMessage_(error)
      }
    );

    throw new Error(
      'Search is temporarily unavailable. Please try again.'
    );
  }
}

function normalizeNexusSearchRequest_(request) {
  const source =
    request && typeof request === 'object' && !Array.isArray(request)
      ? request
      : { query: request };

  const query = String(source.query || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  const allowedFilters = {
    all: true,
    pages: true,
    drive: true,
    folders: true,
    docs: true,
    sheets: true,
    slides: true,
    pdf: true
  };

  const rawFilter = String(source.filter || 'all')
    .trim()
    .toLowerCase();

  return {
    query: query,
    filter: allowedFilters[rawFilter] ? rawFilter : 'all'
  };
}

function buildNexusSearchQuery_(value) {
  const normalized = normalizeNexusSearchText_(value);

  const stopWords = {
    a: true,
    an: true,
    and: true,
    are: true,
    can: true,
    for: true,
    from: true,
    give: true,
    i: true,
    in: true,
    is: true,
    me: true,
    my: true,
    of: true,
    on: true,
    or: true,
    please: true,
    show: true,
    the: true,
    to: true,
    want: true,
    where: true,
    with: true
  };

  const terms = normalized
    .split(' ')
    .map(function (term) {
      return term.trim();
    })
    .filter(function (term) {
      return (
        term &&
        !stopWords[term] &&
        term.length >= 2
      );
    });

  const uniqueTerms = [];
  const seen = {};

  terms.forEach(function (term) {
    if (seen[term]) return;
    seen[term] = true;
    uniqueTerms.push(term);
  });

  const phrases = [];

  for (let size = Math.min(4, uniqueTerms.length); size >= 2; size -= 1) {
    for (let i = 0; i <= uniqueTerms.length - size; i += 1) {
      phrases.push(
        uniqueTerms.slice(i, i + size).join(' ')
      );
    }
  }

  return {
    raw: String(value || ''),
    normalized: normalized,
    terms: uniqueTerms,
    phrases: phrases,
    requiredAnchors:
      getNexusRequiredAliasAnchors_(normalized)
  };
}

function isNexusSearchableRecord_(record, filter) {
  if (!record || !record.fileId) {
    return false;
  }

  if (
    record.status === NOSCA_CONFIG.statuses.skipped ||
    record.status === NOSCA_CONFIG.statuses.error
  ) {
    return false;
  }

  const itemType = String(record.itemType || '');
  const format = String(record.fileFormat || '');
  const documentType = String(record.documentType || '');

  if (filter === 'folders') {
    return itemType === NOSCA_CONFIG.itemTypes.folder;
  }

  if (filter === 'docs') {
    return (
      itemType !== NOSCA_CONFIG.itemTypes.folder &&
      (
        format === NOSCA_CONFIG.fileFormats.googleDoc ||
        format === NOSCA_CONFIG.fileFormats.word ||
        documentType === NOSCA_CONFIG.documentTypes.document ||
        documentType === NOSCA_CONFIG.documentTypes.proposal
      )
    );
  }

  if (filter === 'sheets') {
    return (
      itemType !== NOSCA_CONFIG.itemTypes.folder &&
      (
        format === NOSCA_CONFIG.fileFormats.googleSheet ||
        format === NOSCA_CONFIG.fileFormats.excel ||
        format === NOSCA_CONFIG.fileFormats.csv ||
        documentType === NOSCA_CONFIG.documentTypes.spreadsheet ||
        documentType === NOSCA_CONFIG.documentTypes.ee
      )
    );
  }

  if (filter === 'slides') {
    return (
      itemType !== NOSCA_CONFIG.itemTypes.folder &&
      (
        format === NOSCA_CONFIG.fileFormats.googleSlides ||
        format === NOSCA_CONFIG.fileFormats.powerpoint ||
        documentType === NOSCA_CONFIG.documentTypes.presentation
      )
    );
  }

  if (filter === 'pdf') {
    return (
      itemType !== NOSCA_CONFIG.itemTypes.folder &&
      (
        format === NOSCA_CONFIG.fileFormats.pdf ||
        documentType === NOSCA_CONFIG.documentTypes.pdf
      )
    );
  }

  // "all" and "drive" both include every searchable Drive record.
  return filter === 'all' || filter === 'drive';
}

function scoreNexusSearchRecord_(record, query) {
  const fields = {
    name: normalizeNexusSearchText_(record.fileName),
    hierarchy: normalizeNexusSearchText_(record.hierarchyContext),
    path: normalizeNexusSearchText_(record.folderPath),
    manual: normalizeNexusSearchText_(record.manualKeywords),
    generated: normalizeNexusSearchText_(record.generatedKeywords),
    documentType: normalizeNexusSearchText_(record.documentType),
    fileFormat: normalizeNexusSearchText_(record.fileFormat),
    itemType: normalizeNexusSearchText_(record.itemType)
  };

  const searchable = Object.keys(fields)
    .map(function (key) {
      return fields[key];
    })
    .filter(Boolean)
    .join(' ');

  let score = 0;
  const matchedTerms = [];

  if (
    query.normalized &&
    fields.name === query.normalized
  ) {
    score += 140;
  }

  if (
    query.normalized &&
    fields.name.indexOf(query.normalized) !== -1
  ) {
    score += 75;
  }

  query.phrases.forEach(function (phrase) {
    if (!phrase || phrase.length < 4) return;

    if (fields.name.indexOf(phrase) !== -1) {
      score += 34;
    }
    if (fields.hierarchy.indexOf(phrase) !== -1) {
      score += 32;
    }
    if (fields.manual.indexOf(phrase) !== -1) {
      score += 30;
    }
    if (fields.generated.indexOf(phrase) !== -1) {
      score += 18;
    }
    if (fields.path.indexOf(phrase) !== -1) {
      score += 16;
    }
  });

  query.terms.forEach(function (term) {
    let matched = false;

    if (containsNexusSearchTerm_(fields.name, term)) {
      score += 15;
      matched = true;
    }

    if (containsNexusSearchTerm_(fields.manual, term)) {
      score += 14;
      matched = true;
    }

    if (containsNexusSearchTerm_(fields.hierarchy, term)) {
      score += 13;
      matched = true;
    }

    if (containsNexusSearchTerm_(fields.generated, term)) {
      score += 8;
      matched = true;
    }

    if (containsNexusSearchTerm_(fields.path, term)) {
      score += 7;
      matched = true;
    }

    if (containsNexusSearchTerm_(fields.documentType, term)) {
      score += 7;
      matched = true;
    }

    if (containsNexusSearchTerm_(fields.fileFormat, term)) {
      score += 5;
      matched = true;
    }

    if (containsNexusSearchTerm_(fields.itemType, term)) {
      score += 4;
      matched = true;
    }

    if (matched) {
      matchedTerms.push(term);
    }
  });

  const uniqueMatched = matchedTerms.filter(function (term, index, array) {
    return array.indexOf(term) === index;
  });

  const coverage = query.terms.length
    ? uniqueMatched.length / query.terms.length
    : 0;

  score += Math.max(0, uniqueMatched.length - 1) * 6;

  const missingAnchors = query.requiredAnchors.filter(function (anchor) {
    return !containsNexusSearchTerm_(searchable, anchor);
  });

  const anchorPass = missingAnchors.length === 0;

  let minimumMatched = 1;

  if (query.terms.length === 2) {
    minimumMatched = 2;
  } else if (query.terms.length >= 3) {
    minimumMatched = Math.max(
      2,
      Math.ceil(query.terms.length * 0.5)
    );
  }

  const coveragePass =
    uniqueMatched.length >= minimumMatched &&
    (
      query.terms.length < 3 ||
      coverage >= 0.5
    );

  // Prefer current/non-archive results for ordinary searches.
  const archiveText = fields.hierarchy + ' ' + fields.path;
  const queryWantsArchive =
    /\barchive\b|\barchived\b/.test(query.normalized);

  if (
    /\barchive\b|\barchived\b/.test(archiveText) &&
    !queryWantsArchive
  ) {
    score -= 18;
  }

  // A matching folder is valuable for navigation, but only after semantic
  // context requirements have passed.
  if (
    record.itemType === NOSCA_CONFIG.itemTypes.folder &&
    uniqueMatched.length >= 2
  ) {
    score += 5;
  }

  return {
    record: record,
    score: score,
    coverage: Number(coverage.toFixed(3)),
    matchedTerms: uniqueMatched,
    missingAnchors: missingAnchors,
    passes:
      score > 0 &&
      anchorPass &&
      coveragePass
  };
}

function getNexusRequiredAliasAnchors_(normalizedQuestion) {
  const aliases = NOSCA_CONFIG.metadataAliases || [];
  const anchors = [];

  aliases.forEach(function (rule) {
    const canonical = normalizeNexusSearchText_(
      rule && rule.canonical ? rule.canonical : ''
    );

    if (!canonical) return;

    const variants =
      rule && Array.isArray(rule.matchAny)
        ? rule.matchAny
        : [];

    const matched = variants.some(function (variant) {
      const normalizedVariant =
        normalizeNexusSearchText_(variant);

      if (!normalizedVariant) return false;

      return containsNexusSearchTerm_(
        normalizedQuestion,
        normalizedVariant
      );
    });

    if (
      matched &&
      anchors.indexOf(canonical) === -1
    ) {
      anchors.push(canonical);
    }
  });

  return anchors;
}

function compareNexusSearchResults_(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  if (b.coverage !== a.coverage) {
    return b.coverage - a.coverage;
  }

  const aFolder =
    a.record.itemType === NOSCA_CONFIG.itemTypes.folder ? 0 : 1;
  const bFolder =
    b.record.itemType === NOSCA_CONFIG.itemTypes.folder ? 0 : 1;

  if (aFolder !== bFolder) {
    return aFolder - bFolder;
  }

  return String(a.record.fileName || '').localeCompare(
    String(b.record.fileName || '')
  );
}

function toNexusSearchResult_(candidate, maxScore) {
  const record = candidate.record;
  const safeMaxScore = Math.max(
    Number(maxScore || 1),
    1
  );

  const normalizedScore =
    Math.max(
      Math.min(
        Number(candidate.score || 0) / safeMaxScore,
        1
      ),
      0
    );

  const coverage =
    Math.max(
      Math.min(
        Number(candidate.coverage || 0),
        1
      ),
      0
    );

  // Expose one bounded 0-100 relevance value so the browser can compare
  // Drive results with site-registry results for the Phase 4 Top Matches UI.
  const relevanceScore =
    Math.round(
      (
        normalizedScore * 0.72 +
        coverage * 0.28
      ) * 100
    );

  return {
    resultKind: 'drive',
    id: record.fileId,
    itemType:
      record.itemType || NOSCA_CONFIG.itemTypes.file,
    name: record.fileName || 'Untitled',
    folderPath: record.folderPath || '',
    hierarchyContext: record.hierarchyContext || '',
    documentType:
      record.documentType || NOSCA_CONFIG.documentTypes.other,
    fileFormat:
      record.fileFormat || NOSCA_CONFIG.fileFormats.other,
    mimeType: record.mimeType || '',
    modifiedAt: record.modifiedAt || '',
    driveUrl: record.driveUrl || '',
    relevanceScore: relevanceScore,
    score: candidate.score,
    coverage: candidate.coverage,
    matchedTerms: candidate.matchedTerms
  };
}


function summarizeNexusSearchResults_(candidates) {
  const counts = {
    total: candidates.length,
    folders: 0,
    docs: 0,
    sheets: 0,
    slides: 0,
    pdf: 0,
    other: 0
  };

  candidates.forEach(function (candidate) {
    const record = candidate.record;
    const itemType = String(record.itemType || '');
    const format = String(record.fileFormat || '');
    const documentType = String(record.documentType || '');

    if (itemType === NOSCA_CONFIG.itemTypes.folder) {
      counts.folders += 1;
      return;
    }

    if (
      format === NOSCA_CONFIG.fileFormats.googleDoc ||
      format === NOSCA_CONFIG.fileFormats.word ||
      documentType === NOSCA_CONFIG.documentTypes.document ||
      documentType === NOSCA_CONFIG.documentTypes.proposal
    ) {
      counts.docs += 1;
      return;
    }

    if (
      format === NOSCA_CONFIG.fileFormats.googleSheet ||
      format === NOSCA_CONFIG.fileFormats.excel ||
      format === NOSCA_CONFIG.fileFormats.csv ||
      documentType === NOSCA_CONFIG.documentTypes.spreadsheet ||
      documentType === NOSCA_CONFIG.documentTypes.ee
    ) {
      counts.sheets += 1;
      return;
    }

    if (
      format === NOSCA_CONFIG.fileFormats.googleSlides ||
      format === NOSCA_CONFIG.fileFormats.powerpoint ||
      documentType === NOSCA_CONFIG.documentTypes.presentation
    ) {
      counts.slides += 1;
      return;
    }

    if (
      format === NOSCA_CONFIG.fileFormats.pdf ||
      documentType === NOSCA_CONFIG.documentTypes.pdf
    ) {
      counts.pdf += 1;
      return;
    }

    counts.other += 1;
  });

  return counts;
}

function normalizeNexusSearchText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_/\\|()[\]{}:,;!?'"`~*=<>]/g, ' ')
    .replace(/[^a-z0-9+#&.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsNexusSearchTerm_(text, term) {
  const value = String(text || '').trim();
  const needle = String(term || '').trim();

  if (!value || !needle) return false;

  const paddedValue = ' ' + value + ' ';
  const paddedNeedle = ' ' + needle + ' ';

  return (
    paddedValue.indexOf(paddedNeedle) !== -1 ||
    value.indexOf(needle) !== -1
  );
}

function getNexusSearchErrorMessage_(error) {
  if (!error) return 'Unknown error';

  if (typeof error === 'string') {
    return error;
  }

  if (error.message) {
    return String(error.message);
  }

  try {
    return JSON.stringify(error);
  } catch (jsonError) {
    return String(error);
  }
}


/**
 * Manual backend diagnostic.
 *
 * @return {Object}
 */
function testNexusDriveSearch() {
  const result = searchNexus({
    query: 'PJL 3-year renewal cashhub',
    filter: 'all'
  });

  console.log(
    '[ONESCA Search Test] ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}
