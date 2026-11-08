/**
 * NOVARE NEXUS — NOSCA Central Discovery Performance Benchmark.
 *
 * SINGLE FILE: replaces the former Nosca_Central_Owner_Timing_Benchmark.js.
 * Both diagnostics use the SAME existing Google Apps Script project and the
 * unmodified production authentication, owner handler, and bridge URL.
 *
 * Two entry points (run them under their required account contexts):
 *
 *   1) benchmarkNoscaCentralOwnerHandlerTiming20261105()
 *      Run as the configured NOVARE NEXUS OWNER account.
 *      Directly measures doPost() without HTTP: 1 ping + 2 PJL lookups.
 *      Log: [NOSCA CENTRAL][OWNER_HANDLER_SUMMARY]
 *
 *   2) benchmarkNoscaCentralBridgeDeepDive20261105()
 *      Run as an authorized EMPLOYEE who normally uses the portal.
 *      Measures authenticated HTTP and its redirect: 3 pings + 2 PJL lookups.
 *      Logs: [NOSCA CENTRAL][BRIDGE_DEEP_RUN],
 *            [NOSCA CENTRAL][BRIDGE_DEEP_SUMMARY]
 *
 * Requires existing owner-side: noscaOwnerConfig_, noscaOwnerSign_,
 *   noscaOwnerEqual_, doPost.
 * Requires existing employee-side: noscaCentralSettings_,
 *   noscaCentralEmployee_, noscaBridgeSign_, noscaBridgeConstantEqual_.
 *
 * Safety: read-only Drive queries, unique nonces, signed responses verified;
 * no credential, identity, file name, file ID, or URL logging. Does not alter
 * configuration, permissions, caching, deployments, or backend search logic.
 * Direct owner handler timing does NOT include HTTP/deployment startup.
 * Bridge-minus-owner timings are estimates, NOT pure network measurements.
 */

// === DIRECT OWNER HANDLER (no HTTP) ===
function benchmarkNoscaCentralOwnerHandlerTiming20261105() {
  const started = Date.now();
  const cfg = noscaOwnerConfig_(); // Same owner-identity and configuration gate.
  if (!cfg.endpointEnabled) {
    throw new Error('Owner endpoint is disabled; benchmark will not bypass the production guard.');
  }
  if (typeof doPost !== 'function') {
    throw new Error('Central Discovery doPost handler was not found in this project.');
  }

  const cases = [
    { name: 'ping_no_drive', op: 'ping', question: '' },
    { name: 'pjl_lookup_1', op: 'lookup', question: 'pjl' },
    { name: 'pjl_lookup_2', op: 'lookup', question: 'pjl' }
  ];
  const runs = [];

  cases.forEach(function (test) {
    // Envelope construction is intentionally OUTSIDE the measured handler.
    // Use the owner identity only inside the signed request, never in logs.
    const nonce = Utilities.getUuid();
    const payload = {
      v: 1,
      op: test.op,
      timestamp: Date.now(),
      nonce: nonce,
      email: cfg.owner,
      question: test.question
    };
    const request = JSON.stringify({
      payload: payload,
      signature: noscaOwnerSign_(payload, cfg.secret)
    });

    const handlerStarted = Date.now();
    const output = doPost({ postData: { contents: request, type: 'application/json' } });
    const responseText = output.getContent();
    const handlerMs = Date.now() - handlerStarted;

    // These checks are performed after the measured handler call. Never log
    // response metadata or sensitive identifiers, only aggregate metrics.
    let response;
    try {
      response = JSON.parse(responseText);
    } catch (err) {
      throw new Error(test.name + ': owner handler returned invalid JSON.');
    }
    const validResponse = !!(
      response && response.payload && response.payload.ok === true &&
      response.payload.nonce === nonce && response.payload.operation === test.op &&
      typeof response.signature === 'string' &&
      noscaOwnerEqual_(response.signature,
        noscaOwnerSign_(response.payload, cfg.secret))
    );
    if (!validResponse) {
      throw new Error(test.name + ': signed owner response invalid or denied; inspect [NOSCA CENTRAL][OWNER_DENIED] logs.');
    }

    const data = response.payload;
    const detail = data.performance || {};
    const configMs = Number(detail.configMs);
    const authMs = Number(detail.authMs);
    const searchMs = Number(detail.searchMs);
    const preSignMs = Number(detail.preSignMs);
    const hasStages = [configMs, authMs, searchMs, preSignMs]
      .every(function (n) { return Number.isFinite(n) && n >= 0; });
    const stageTotalMs = hasStages ? configMs + authMs + searchMs : null;

    const entry = {
      case: test.name,
      operation: test.op,
      trace: nonce.slice(0, 8),
      signedResponseVerified: true,
      handlerMs: handlerMs,
      configMs: hasStages ? configMs : null,
      authMs: hasStages ? authMs : null,
      searchMs: hasStages ? searchMs : null,
      // Time in the handler before signing not attributed to the above stages.
      otherBeforeSigningMs: hasStages ? Math.max(0, preSignMs - stageTotalMs) : null,
      // Signing + JSON output construction + any uninstrumented handler work.
      signingAndOutputMs: hasStages ? Math.max(0, handlerMs - preSignMs) : null,
      // Only the Drive-search function's own elapsed time, as reported by owner.
      searchServiceMs: Number(data.elapsedMs || 0),
      apiCalls: Number(data.apiCalls || 0),
      returned: Array.isArray(data.files) ? data.files.length : 0,
      responseHasOwnerStages: hasStages
    };
    runs.push(entry);
    console.log('[NOSCA CENTRAL][OWNER_HANDLER_BENCH] ' + JSON.stringify(entry));
  });

  const ping = runs[0];
  const searches = runs.slice(1);
  const avg = function (values) {
    return Math.round(values.reduce(function (sum, value) { return sum + value; }, 0) / values.length);
  };
  const summary = {
    pingOwnerHandlerMs: ping.handlerMs,
    avgLookupOwnerHandlerMs: avg(searches.map(function (r) { return r.handlerMs; })),
    avgLookupSearchMs: avg(searches.map(function (r) { return r.searchServiceMs; })),
    avgLookupNonSearchMs: avg(searches.map(function (r) {
      return Math.max(0, r.handlerMs - r.searchServiceMs);
    }))
  };
  const report = {
    ok: true,
    benchmark: 'NOSCA_CENTRAL_OWNER_HANDLER_TIMING_20261105',
    mode: 'direct_owner_handler_no_http',
    totalBenchmarkMs: Date.now() - started,
    runs: runs,
    summary: summary,
    explanation: 'Compare these owner handler times against the existing [NOSCA CENTRAL][BRIDGE] postFetchMs/transportMs. The difference is an estimate of routing, authentication and transport overhead, not a precisely isolated network measurement.'
  };
  console.log('[NOSCA CENTRAL][OWNER_HANDLER_SUMMARY] ' + JSON.stringify(report));
  return report;
}


// === AUTHENTICATED HTTP BRIDGE ===
function benchmarkNoscaCentralBridgeDeepDive20261105() {
  const batchStarted = Date.now();
  const cases = [
    { name: 'ping_1', op: 'ping', question: '' },
    { name: 'ping_2', op: 'ping', question: '' },
    { name: 'pjl_1', op: 'lookup', question: 'pjl' },
    { name: 'pjl_2', op: 'lookup', question: 'pjl' },
    { name: 'ping_after_lookups', op: 'ping', question: '' }
  ];
  const runs = [];

  // Return only non-sensitive error identifiers in execution logs.
  function fail(code) { throw new Error(code); }
  function duration(start) { return Date.now() - start; }
  function roundedMean(values) {
    return values.length ? Math.round(values.reduce(function (s, v) { return s + v; }, 0) / values.length) : null;
  }
  function stats(values) {
    return { count: values.length, averageMs: roundedMean(values),
      minMs: values.length ? Math.min.apply(null, values) : null,
      maxMs: values.length ? Math.max.apply(null, values) : null };
  }
  function runOne(test) {
    const started = Date.now();
    const record = {
      case: test.name,
      operation: test.op,
      ok: false,
      elapsedMs: null,
      setupMs: null,
      identityMs: null,
      signMs: null,
      oauthMs: null,
      postFetchMs: null,
      redirectFetchMs: null,
      firstHttpStatus: null,
      redirectHttpStatus: null,
      redirected: false,
      responseParseMs: null,
      responseVerifyMs: null,
      responseChars: null,
      returned: null,
      apiCalls: null,
      remoteSearchMs: null,
      remotePreSignMs: null,
      remoteConfigMs: null,
      remoteAuthMs: null,
      remoteSearchStageMs: null,
      remoteSourceVersionMatch: null,
      remoteVersion: null,
      remotePerformanceAvailable: false,
      estimatedPostResidualMs: null,
      estimatedBridgeResidualMs: null
    };
    try {
      const setupStarted = Date.now();
      // Using the original settings validator preserves host/domain pinning.
      const settings = noscaCentralSettings_();
      record.setupMs = duration(setupStarted);
      const identityStarted = Date.now();
      const email = noscaCentralEmployee_(settings.domains);
      record.identityMs = duration(identityStarted);

      const payload = {
        v: 1, op: test.op, timestamp: Date.now(),
        nonce: Utilities.getUuid(), email: email, question: test.question
      };
      const signStarted = Date.now();
      const requestBody = JSON.stringify({
        payload: payload, signature: noscaBridgeSign_(payload, settings.secret)
      });
      record.signMs = duration(signStarted);

      const oauthStarted = Date.now();
      const oauth = ScriptApp.getOAuthToken();
      record.oauthMs = duration(oauthStarted);
      if (!oauth) fail('OAUTH_TOKEN_UNAVAILABLE');

      const firstStarted = Date.now();
      // EXACT production transport: authenticated POST; redirects disabled.
      const first = UrlFetchApp.fetch(settings.url, {
        method: 'post', contentType: 'application/json', payload: requestBody,
        headers: { Authorization: 'Bearer ' + oauth },
        muteHttpExceptions: true, followRedirects: false
      });
      record.postFetchMs = duration(firstStarted);
      record.firstHttpStatus = first.getResponseCode();

      let response;
      if ([301, 302, 303, 307, 308].indexOf(record.firstHttpStatus) !== -1) {
        const headers = first.getHeaders();
        const location = String(headers.Location || headers.location || '').trim();
        // NEVER forward OAuth to redirected host or an unrecognized destination.
        if (!/^https:\/\/script\.googleusercontent\.com\//.test(location)) {
          fail('UNEXPECTED_REDIRECT_HOST');
        }
        record.redirected = true;
        const redirectStarted = Date.now();
        response = UrlFetchApp.fetch(location, {
          method: 'get', followRedirects: false, muteHttpExceptions: true
        });
        record.redirectFetchMs = duration(redirectStarted);
        record.redirectHttpStatus = response.getResponseCode();
        if (record.redirectHttpStatus !== 200) fail('REDIRECT_HTTP_' + record.redirectHttpStatus);
      } else {
        record.redirectFetchMs = 0;
        if (record.firstHttpStatus !== 200) fail('POST_HTTP_' + record.firstHttpStatus);
        response = first;
      }

      const responseText = response.getContentText();
      record.responseChars = responseText.length;
      if (responseText.length > 160000) fail('CENTRAL_RESPONSE_TOO_LARGE');
      const parseStarted = Date.now();
      let envelope;
      try { envelope = JSON.parse(responseText); }
      catch (_err) { fail('CENTRAL_RESPONSE_NON_JSON'); }
      record.responseParseMs = duration(parseStarted);

      const verifyStarted = Date.now();
      if (!envelope || !envelope.payload || !envelope.signature ||
          !noscaBridgeConstantEqual_(envelope.signature,
            noscaBridgeSign_(envelope.payload, settings.secret))) {
        fail('CENTRAL_RESPONSE_SIGNATURE_INVALID');
      }
      const data = envelope.payload;
      if (data.v !== 1 || data.nonce !== payload.nonce ||
          data.operation !== test.op || data.ok !== true ||
          typeof data.version !== 'string' || !data.version ||
          !Array.isArray(data.files)) {
        fail('CENTRAL_RESPONSE_INVALID');
      }
      record.responseVerifyMs = duration(verifyStarted);
      record.remoteVersion = data.version; // public source label, not a credential
      record.remoteSourceVersionMatch = (typeof NOSCA_CENTRAL_OWNER_VERSION === 'string')
        ? data.version === NOSCA_CENTRAL_OWNER_VERSION : null;
      record.returned = data.files.length;
      record.apiCalls = Number(data.apiCalls) || 0;
      record.remoteSearchMs = Number(data.elapsedMs) || 0;

      // When available, these signed fields cover owner processing up to response signing.
      // Their absence is itself a useful deployment/endpoint diagnostic.
      const owner = data.performance;
      if (owner && Number.isFinite(Number(owner.preSignMs))) {
        record.remotePerformanceAvailable = true;
        record.remotePreSignMs = Number(owner.preSignMs);
        record.remoteConfigMs = Number.isFinite(Number(owner.configMs)) ? Number(owner.configMs) : null;
        record.remoteAuthMs = Number.isFinite(Number(owner.authMs)) ? Number(owner.authMs) : null;
        record.remoteSearchStageMs = Number.isFinite(Number(owner.searchMs)) ? Number(owner.searchMs) : null;
        // These are residuals, NOT pure network latency: includes routing,
        // scheduling, platform startup, signing and network handling.
        record.estimatedPostResidualMs = Math.max(0, record.postFetchMs - record.remotePreSignMs);
      }
      record.elapsedMs = duration(started);
      record.estimatedBridgeResidualMs = record.remotePreSignMs === null ? null
        : Math.max(0, record.elapsedMs - record.remotePreSignMs);
      record.ok = true;
    } catch (err) {
      record.elapsedMs = duration(started);
      // Only known diagnostic codes are logged; platform exceptions are not
      // printed because they can contain sensitive account/deployment URLs.
      const code = String(err && err.message || '');
      record.errorCode = /^(?:OAUTH_TOKEN_UNAVAILABLE|UNEXPECTED_REDIRECT_HOST|REDIRECT_HTTP_\d+|POST_HTTP_\d+|CENTRAL_RESPONSE_TOO_LARGE|CENTRAL_RESPONSE_NON_JSON|CENTRAL_RESPONSE_SIGNATURE_INVALID|CENTRAL_RESPONSE_INVALID)$/.test(code)
        ? code : 'UNEXPECTED_PLATFORM_OR_CONFIGURATION_ERROR';
    }
    console.log('[NOSCA CENTRAL][BRIDGE_DEEP_RUN] ' + JSON.stringify(record));
    return record;
  }

  cases.forEach(function (test) { runs.push(runOne(test)); });
  const good = runs.filter(function (r) { return r.ok; });
  const pings = good.filter(function (r) { return r.operation === 'ping'; });
  const lookups = good.filter(function (r) { return r.operation === 'lookup'; });
  const pingAverageMs = roundedMean(pings.map(function (r) { return r.elapsedMs; }));
  const lookupAverageMs = roundedMean(lookups.map(function (r) { return r.elapsedMs; }));
  const report = {
    ok: good.length === runs.length,
    benchmark: 'NOSCA_CENTRAL_BRIDGE_DEEP_DIVE_20261105',
    testMode: 'authenticated_http_no_cache',
    requestCount: runs.length,
    successful: good.length,
    failed: runs.length - good.length,
    totalBenchmarkMs: duration(batchStarted),
    ping: stats(pings.map(function (r) { return r.elapsedMs; })),
    lookup: stats(lookups.map(function (r) { return r.elapsedMs; })),
    avgPostFetchMs: roundedMean(good.map(function (r) { return r.postFetchMs; })),
    avgRedirectFetchMs: roundedMean(good.map(function (r) { return r.redirectFetchMs; })),
    avgRemoteSearchMs: roundedMean(lookups.map(function (r) { return r.remoteSearchMs; })),
    avgRemotePreSignMs: stats(good.filter(function (r) { return r.remotePreSignMs !== null; })
      .map(function (r) { return r.remotePreSignMs; })),
    avgEstimatedPostResidualMs: roundedMean(good.filter(function (r) { return r.estimatedPostResidualMs !== null; })
      .map(function (r) { return r.estimatedPostResidualMs; })),
    ownerPerformanceAvailableCount: good.filter(function (r) { return r.remotePerformanceAvailable; }).length,
    currentSourceOwnerVersion: typeof NOSCA_CENTRAL_OWNER_VERSION === 'string' ? NOSCA_CENTRAL_OWNER_VERSION : null,
    remoteVersions: good.reduce(function (acc, r) {
      if (acc.indexOf(r.remoteVersion) === -1) acc.push(r.remoteVersion);
      return acc;
    }, []),
    pingToLookupDifferenceMs: pingAverageMs === null || lookupAverageMs === null ? null
      : lookupAverageMs - pingAverageMs,
    ownerTimingsNote: 'Missing remote performance means owner-side stages could not be subtracted reliably. Check endpoint/version routing, not just source code.',
    residualNote: 'HTTP timing includes remote execution. Residual values estimate unmeasured overhead; they are NOT isolated network latency.',
    runs: runs
  };
  console.log('[NOSCA CENTRAL][BRIDGE_DEEP_SUMMARY] ' + JSON.stringify(report));
  return report;
}


/**
 * Compare live, uncached authenticated bridge calls with the existing
 * ContentService JSON response and an opt-in HtmlService response.
 * No document results are cached; both modes invoke fresh owner searches.
 * Runs work even while NOSCA_CENTRAL_PREFER_HTML_RESPONSE is unset/false.
 * Deploy the updated OWNER handler before running this comparison.
 */
function benchmarkNoscaCentralResponseModes20261105() {
  const cases = [
    {name: 'json_ping_1', mode: 'content-json', op: 'ping', question: ''},
    {name: 'html_ping_1', mode: 'html-b64-v1', op: 'ping', question: ''},
    {name: 'html_pjl_1', mode: 'html-b64-v1', op: 'lookup', question: 'pjl'},
    {name: 'json_pjl_1', mode: 'content-json', op: 'lookup', question: 'pjl'},
    {name: 'html_ping_2', mode: 'html-b64-v1', op: 'ping', question: ''},
    {name: 'json_ping_2', mode: 'content-json', op: 'ping', question: ''},
    {name: 'json_pjl_2', mode: 'content-json', op: 'lookup', question: 'pjl'},
    {name: 'html_pjl_2', mode: 'html-b64-v1', op: 'lookup', question: 'pjl'}
  ];
  const started = Date.now();
  const runs = cases.map(function (test) {
    const metric = {};
    try {
      // Executes the exact production caller with an explicit wire mode.
      // Every signed request is unique and passes the owner authorization.
      noscaCentralRemoteCall_(test.op, test.question, test.mode, metric);
      const result = {case: test.name, requestedMode: test.mode,
        operation: test.op, ok: true,
        responseMode: metric.responseMode, elapsedMs: metric.elapsedMs,
        postFetchMs: metric.postFetchMs,
        redirectFetchMs: metric.redirectFetchMs,
        redirected: metric.redirected,
        ownerPreSignMs: metric.ownerPreSignMs,
        ownerVersion: metric.ownerVersion,
        returned: metric.returned, apiCalls: metric.apiCalls};
      console.log('[NOSCA CENTRAL][TRANSPORT_MODE_RUN] ' + JSON.stringify(result));
      return result;
    } catch (error) {
      // Log a stable error identifier only, never employee email, URLs or secrets.
      const message = String(error && error.message || '');
      const code = /^(?:CENTRAL_|DOMAIN_|OWNER_|EMPLOYEE_|INVALID_)/.test(message)
        ? message.replace(/[^A-Z0-9_]/g, '').slice(0, 80)
        : 'TRANSPORT_BENCHMARK_ERROR';
      const result = {case: test.name, requestedMode: test.mode, operation: test.op,
        ok: false, errorCode: code};
      console.log('[NOSCA CENTRAL][TRANSPORT_MODE_RUN] ' + JSON.stringify(result));
      return result;
    }
  });
  function summarize(mode, op) {
    const filtered = runs.filter(function (r) {
      return r.ok && r.requestedMode === mode && r.operation === op;
    });
    const avg = function (k) {
      return filtered.length ? Math.round(filtered.reduce(function (n, r) {
        return n + Number(r[k] || 0);
      }, 0) / filtered.length) : null;
    };
    return {count: filtered.length, avgElapsedMs: avg('elapsedMs'),
      avgPostFetchMs: avg('postFetchMs'), avgRedirectFetchMs: avg('redirectFetchMs'),
      avgOwnerPreSignMs: avg('ownerPreSignMs'),
      redirectedCount: filtered.filter(function (r) { return r.redirected; }).length};
  }
  const report = {
    ok: runs.every(function (r) { return r.ok; }),
    benchmark: 'NOSCA_CENTRAL_RESPONSE_MODE_AB_20261105',
    noSearchResultCache: true,
    totalMs: Date.now() - started,
    jsonPing: summarize('content-json', 'ping'),
    htmlPing: summarize('html-b64-v1', 'ping'),
    jsonLookup: summarize('content-json', 'lookup'),
    htmlLookup: summarize('html-b64-v1', 'lookup'),
    runs: runs,
    note: 'Separate live requests: outcomes can vary with Apps Script startup and Google routing. ' +
      'A successful HTML test proves transport compatibility, not guaranteed speed improvement.'
  };
  console.log('[NOSCA CENTRAL][TRANSPORT_MODE_SUMMARY] ' + JSON.stringify(report));
  return report;
}
