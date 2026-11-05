/**
 * NOVARE NEXUS — Central Discovery owner-handler timing benchmark.
 *
 * Add this single file to backend/nosca/ in the EXISTING Apps Script project.
 * Run benchmarkNoscaCentralOwnerHandlerTiming20261105 from Apps Script's editor
 * while signed in as the configured NOSCA_CENTRAL_OWNER_EMAIL account.
 *
 * WHAT IT MEASURES
 *   - The full synchronous execution of the existing doPost(e) handler
 *   - Owner configuration/identity checks, signed-request authorization,
 *     Drive search, response signing, and construction of the JSON response
 *   - One ping (no Drive calls) and two identical "pjl" lookups
 *
 * WHAT IT DOES NOT MEASURE
 *   - Google HTTP request routing, deployment startup before doPost runs,
 *     UrlFetchApp, redirect transport, or browser-to-portal latency
 *
 * SECURITY / SIDE EFFECTS
 *   - Invokes the real existing owner handler with a valid HMAC envelope.
 *   - Does not disable authentication or anti-replay checks.
 *   - Uses a unique nonce for each invocation.
 *   - Does not log the shared secret, file names, IDs, or employee email.
 *   - Performs two real, read-only Drive searches and uses the existing
 *     short-lived nonce replay cache, just like ordinary owner requests.
 *   - Does not create a second Apps Script project or web-app deployment.
 *
 * Requires the existing owner implementation:
 *   noscaOwnerConfig_, noscaOwnerSign_, noscaOwnerEqual_, doPost.
 */
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
