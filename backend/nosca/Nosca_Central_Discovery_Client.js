/**
 * NOVARE NEXUS — Employee-scoped portal client for the owner-executed
 * discovery deployment of the SAME Apps Script project.
 * Never invokes this bridge for Gemini knowledge answers.
 * No fallback to user-scoped Drive when central mode is enabled but unavailable.
 */
const NOSCA_CENTRAL_CLIENT_VERSION = 'nosca-central-single-project-20261026-v1';

function noscaCentralDiscoveryEnabled_() {
  return String(PropertiesService.getScriptProperties()
    .getProperty('NOSCA_CENTRAL_DISCOVERY_ENABLED') || 'false').toLowerCase() === 'true';
}

function noscaCentralSettings_() {
  // Read once per remote call; preserve employee identity and URL validation.
  const p = PropertiesService.getScriptProperties().getProperties();
  const url = String(p.NOSCA_CENTRAL_OWNER_DEPLOYMENT_URL || '').trim();
  const secret = String(p.NOSCA_CENTRAL_SHARED_SECRET || '').trim();
  const domains = String(p.NOSCA_CENTRAL_ALLOWED_DOMAINS || '')
    .trim().toLowerCase().split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  // Both canonical and Workspace-domain Apps Script deployment URLs are valid.
  // Keep the host pinned and permit Workspace routes only for allowed domains.
  const canonicalRoute = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  const workspaceMatch = url.match(
    /^https:\/\/script\.google\.com\/a\/macros\/([A-Za-z0-9.-]+)\/s\/[A-Za-z0-9_-]+\/exec$/i
  );
  const allowedWorkspaceRoute = workspaceMatch &&
    domains.indexOf(workspaceMatch[1].toLowerCase()) !== -1;
  if (!canonicalRoute.test(url) && !allowedWorkspaceRoute)
    throw new Error('OWNER_DEPLOYMENT_URL_MISSING_OR_INVALID');
  if (secret.length < 48 || !domains.length)
    throw new Error('CENTRAL_BRIDGE_SETTINGS_MISSING');
  return { url: url, secret: secret, domains: domains,
    preferHtml: p.NOSCA_CENTRAL_PREFER_HTML_RESPONSE === 'true' };
}

function noscaCentralEmployee_(domains) {
  const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!active || active !== effective || domains.indexOf(active.split('@')[1]) < 0)
    throw new Error('EMPLOYEE_IDENTITY_UNVERIFIED');
  return active;
}

function noscaBridgeSign_(data, secret) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(JSON.stringify(data), secret));
}
function noscaBridgeConstantEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * Authenticated domain-only transport. Never send bearer tokens to any
 * destination other than script.google.com. Apps Script ContentService may
 * return a signed one-time redirect to script.googleusercontent.com; follow
 * that redirect WITHOUT Authorization header.
 * If the domain webapp rejects server-side OAuth, fail closed. Do NOT open
 * the owner deployment to Anyone/anonymous to bypass Google's auth gate.
 */
function noscaCentralFetch_(url, jsonBody, performance) {
  const authStarted = Date.now();
  const oauth = ScriptApp.getOAuthToken();
  if (performance) performance.oauthMs = Date.now() - authStarted;
  if (!oauth) throw new Error('EMPLOYEE_OAUTH_TOKEN_UNAVAILABLE');

  const firstStarted = Date.now();
  const first = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: jsonBody,
    headers: { Authorization: 'Bearer ' + oauth },
    muteHttpExceptions: true, followRedirects: false
  });
  if (performance) performance.postFetchMs = Date.now() - firstStarted;
  const code = first.getResponseCode();
  if (code === 301 || code === 302 || code === 303 || code === 307 || code === 308) {
    const h = first.getHeaders();
    const location = String(h.Location || h.location || '').trim();
    if (!/^https:\/\/script\.googleusercontent\.com\//.test(location))
      throw new Error('UNEXPECTED_REDIRECT_HOST');
    // Preserve the security boundary: never forward the employee bearer token
    // to googleusercontent.com. ContentService redirects are unavoidable.
    const redirectStarted = Date.now();
    const second = UrlFetchApp.fetch(location, {
      method: 'get', followRedirects: false, muteHttpExceptions: true
    });
    if (performance) {
      performance.redirectFetchMs = Date.now() - redirectStarted;
      performance.redirected = true;
    }
    if (second.getResponseCode() !== 200)
      throw new Error('DOMAIN_TRANSPORT_RESPONSE_' + second.getResponseCode());
    return second.getContentText();
  }
  if (performance) { performance.redirectFetchMs = 0; performance.redirected = false; }
  if (code !== 200) throw new Error('DOMAIN_TRANSPORT_RESPONSE_' + code);
  return first.getContentText();
}

/**
 * An experimental direct HtmlService response can avoid the extra
 * ContentService redirect on SOME Google deployments. It must be verified
 * with the transport benchmark before enabling. Default is unchanged JSON.
 * Do not cache document metadata or reuse results between requests.
 */
/** Decode ONLY a tagged, Base64-encoded owner envelope or legacy JSON. */
function noscaCentralDecodeEnvelope_(responseText) {
  const raw = String(responseText || '');
  if (/^\s*\{/.test(raw)) {
    try { return { envelope: JSON.parse(raw), mode: 'content-json' }; }
    catch (_err) { throw new Error('DOMAIN_TRANSPORT_NON_JSON'); }
  }
  // HtmlService is an experiment, not a general HTML scraping mechanism.
  // Never eval, render, or run scripts from the remote response.
  const match = raw.match(/<pre\b[^>]*\bid=["']nosca-central-envelope-v1["'][^>]*>([A-Za-z0-9_\-+=\s]+)<\/pre>/i);
  if (!match) throw new Error('DOMAIN_TRANSPORT_UNRECOGNIZED_FORMAT');
  const encoded = match[1].replace(/\s+/g, '');
  if (!encoded || encoded.length > 225000) throw new Error('CENTRAL_RESPONSE_TOO_LARGE');
  try {
    const bytes = Utilities.base64DecodeWebSafe(encoded);
    const json = Utilities.newBlob(bytes).getDataAsString('UTF-8');
    return { envelope: JSON.parse(json), mode: 'html-b64-v1' };
  } catch (_err) { throw new Error('DOMAIN_TRANSPORT_HTML_DECODE_FAILED'); }
}

/** Signed and authenticated call to the Nexus-owned deployment. */
function noscaCentralRemoteCall_(operation, question, requestedMode, diagnostics) {
  const started = Date.now();
  const performance = {};
  const settingsStarted = Date.now();
  const settings = noscaCentralSettings_();
  performance.settingsMs = Date.now() - settingsStarted;
  const identityStarted = Date.now();
  const email = noscaCentralEmployee_(settings.domains);
  performance.identityMs = Date.now() - identityStarted;
  const text = String(question || '').replace(/\s+/g, ' ').trim();
  if (operation !== 'ping' && (text.length === 0 || text.length > 500))
    throw new Error('INVALID_CENTRAL_QUERY');
  if (['ping', 'lookup'].indexOf(operation) < 0) throw new Error('INVALID_OPERATION');
  const mode = requestedMode || (settings.preferHtml ? 'html-b64-v1' : 'content-json');
  if (mode !== 'content-json' && mode !== 'html-b64-v1')
    throw new Error('INVALID_CENTRAL_RESPONSE_MODE');
  const payload = { v: 1, op: operation, timestamp: Date.now(),
    nonce: Utilities.getUuid(), email: email, question: text };
  // Negotiate response format in the signed body so it can't be changed by
  // intermediaries. Omit on legacy JSON calls for backward compatibility.
  if (mode === 'html-b64-v1') payload.responseFormat = 'html-b64-v1';
  const signingStarted = Date.now();
  const request = JSON.stringify({ payload: payload,
    signature: noscaBridgeSign_(payload, settings.secret) });
  performance.requestSignMs = Date.now() - signingStarted;

  const transportStarted = Date.now();
  const responseText = noscaCentralFetch_(settings.url, request, performance);
  performance.transportMs = Date.now() - transportStarted;
  // The HTML wire format expands Base64 by about 1/3; both formats are
  // size-limited before parsing and always require a valid signed envelope.
  if (responseText.length > (mode === 'html-b64-v1' ? 240000 : 160000))
    throw new Error('CENTRAL_RESPONSE_TOO_LARGE');
  const parsingStarted = Date.now();
  const decoded = noscaCentralDecodeEnvelope_(responseText);
  const envelope = decoded.envelope;
  performance.responseParseMs = Date.now() - parsingStarted;
  performance.responseMode = decoded.mode;
  if (mode === 'html-b64-v1' && decoded.mode !== 'html-b64-v1')
    throw new Error('CENTRAL_HTML_MODE_UNAVAILABLE');
  const verificationStarted = Date.now();
  if (!envelope || !envelope.payload || !envelope.signature ||
      !noscaBridgeConstantEqual_(envelope.signature,
        noscaBridgeSign_(envelope.payload, settings.secret)))
    throw new Error('CENTRAL_RESPONSE_SIGNATURE_INVALID');
  const data = envelope.payload;
  // Protocol v1 is the compatibility boundary. The Owner and Portal can
  // legitimately use different release labels while versioned deployments
  // are rolled out independently. The HMAC, nonce and operation still must
  // match exactly; never trust an unsigned or mismatched response.
  if (data.v !== 1 || data.nonce !== payload.nonce ||
      data.operation !== operation || data.ok !== true ||
      typeof data.version !== 'string' || !data.version ||
      !Array.isArray(data.files))
    throw new Error('CENTRAL_RESPONSE_INVALID');
  performance.responseVerifyMs = Date.now() - verificationStarted;
  performance.totalMs = Date.now() - started;
  const ownerPerformance = data.performance || null;
  const ownerReportedMs = ownerPerformance && Number.isFinite(Number(ownerPerformance.preSignMs))
    ? Number(ownerPerformance.preSignMs) : null;
  performance.ownerReportedMs = ownerReportedMs;
  // Includes Google deployment startup, domain authentication, redirect and
  // network; it is an estimate, NOT an exact measurement of Google overhead.
  performance.transportMinusOwnerEstimateMs = ownerReportedMs === null ? null
    : Math.max(0, performance.transportMs - ownerReportedMs);
  if (diagnostics) {
    diagnostics.elapsedMs = performance.totalMs;
    diagnostics.postFetchMs = performance.postFetchMs;
    diagnostics.redirectFetchMs = performance.redirectFetchMs;
    diagnostics.redirected = performance.redirected;
    diagnostics.responseMode = decoded.mode;
    diagnostics.ownerPreSignMs = ownerReportedMs;
    diagnostics.apiCalls = data.apiCalls;
    diagnostics.returned = data.files.length;
    diagnostics.ownerVersion = data.version;
  }
  // Preserve the existing BRIDGE log prefix for current NOSCA diagnostics.
  console.log('[NOSCA CENTRAL][BRIDGE] ' + JSON.stringify({
    version: data.version, trace: payload.nonce.slice(0, 8),
    operation: operation, elapsedMs: performance.totalMs,
    serviceElapsedMs: data.elapsedMs, returned: data.files.length,
    apiCalls: data.apiCalls, truncated: data.truncated,
    responseSignatureVerified: true, serverVersion: data.version,
    performance: performance, ownerPerformance: ownerPerformance
  }));
  return data;
}

function noscaCentralRemoteLookup_(question) {
  return noscaCentralRemoteCall_('lookup', question);
}

function noscaCentralRecord_(file) {
  const id = String(file && file.id || '').trim();
  const name = String(file && file.name || '').trim().slice(0, 300);
  const mime = String(file && file.mimeType || 'application/octet-stream').trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id) || !name) return null;
  const folder = mime === NOSCA_CONFIG.mimeTypes.folder;
  const record = {
    fileId: id, fileName: name, name: name, mimeType: mime,
    itemType: folder ? NOSCA_CONFIG.itemTypes.folder : NOSCA_CONFIG.itemTypes.file,
    status: NOSCA_CONFIG.statuses.active, folderPath: '', hierarchyContext: '',
    modifiedTime: String(file.modifiedTime || ''), driveId: String(file.driveId || ''),
    driveUrl: /^https:\/\//.test(String(file.webViewLink || ''))
      ? String(file.webViewLink) : 'https://drive.google.com/open?id=' + encodeURIComponent(id)
  };
  record.fileFormat = getNoscaFileFormat_(record);
  record.documentType = classifyNoscaDocumentType_(record);
  return record;
}

function noscaFindCentralDocuments_(question) {
  const started = Date.now();
  const info = noscaV3QueryInfo_(question);
  const raw = noscaCentralRemoteLookup_(info.query.text);
  const records = raw.files.map(noscaCentralRecord_).filter(Boolean);
  const ranked = noscaV3Rank_(records, info);
  const limit = Math.max(1, Number(NOSCA_CONFIG.retrieval.maxDocumentLookupResults || 12));
  const selected = ranked.ranked.slice(0, limit);
  selected.forEach(function (r, i) { r.sourceIndex = i + 1; });
  const summary = summarizeNoscaDocumentLookupResults_(selected);
  summary.searchVersion = NOSCA_CENTRAL_CLIENT_VERSION;
  summary.discoveryIdentity = 'novare-nexus';
  summary.accessStatus = 'not-verified-for-employee';
  summary.searchCalls = raw.apiCalls;
  return {
    ok: true, question: info.query.text, queryTerms: info.query.terms,
    requestedDocumentTypes: info.requestedTypes,
    requestedItemTypes: info.requestedItemTypes,
    totalMatches: ranked.ranked.length, results: selected,
    summary: summary, backend: 'central_metadata',
    searchElapsedMs: Date.now() - started, truncated: raw.truncated === true,
    warning: raw.truncated ? 'This search was bounded; additional files may exist.' : '',
    searchDiagnostics: {
      patchVersion: NOSCA_CENTRAL_CLIENT_VERSION, identity: 'novare-nexus',
      apiCalls: raw.apiCalls, centralServiceMs: raw.elapsedMs,
      rawCandidateCount: records.length, eligible: ranked.ranked.length,
      rejected: ranked.rejected.length, truncated: raw.truncated === true,
      incompleteSearch: raw.incompleteSearch === true,
      scopeMode: raw.scopeMode, noGemini: true
    }
  };
}

/** Run ONLY in employee-executed portal deployment / editor context. */
function benchmarkNoscaCentralBridgeTransport() {
  const started = Date.now();
  const r = noscaCentralRemoteCall_('ping', '');
  const out = { ok: true, version: NOSCA_CENTRAL_CLIENT_VERSION,
    domainTransportWorks: true, ownerEndpointReachable: true,
    elapsedMs: Date.now() - started, metadataReturned: r.files.length };
  console.log('[NOSCA CENTRAL][TRANSPORT] ' + JSON.stringify(out));
  return out;
}

/** Dry-run central file lookup without changing production routing. */
function benchmarkNoscaCentralDiscovery() {
  const started = Date.now();
  const result = noscaFindCentralDocuments_('3 year roadmap');
  const out = { ok: true, version: NOSCA_CENTRAL_CLIENT_VERSION,
    centralEnabledForUsers: noscaCentralDiscoveryEnabled_(),
    backend: result.backend, elapsedMs: Date.now() - started,
    apiCalls: result.searchDiagnostics.apiCalls, scopeMode: result.searchDiagnostics.scopeMode,
    returned: result.results.length,
    top: result.results.slice(0, 5).map(function (f) { return f.fileName; }),
    employeeAccessNotImplied: true, geminiCalled: false };
  console.log('[NOSCA CENTRAL][DISCOVERY] ' + JSON.stringify(out));
  return out;
}

/** Compare employee read rights for a few centrally discoverable file IDs. */
function benchmarkNoscaCentralVisibility() {
  const raw = noscaCentralRemoteLookup_('3 year roadmap');
  const checks = raw.files.slice(0, 5).map(function (f) {
    let accessible = false;
    try {
      const found = Drive.Files.get(f.id, { fields: 'id', supportsAllDrives: true });
      accessible = !!(found && found.id === f.id);
    } catch (err) { accessible = false; }
    return { name: f.name, employeeCanOpen: accessible,
      requestAccessIfNeeded: !accessible };
  });
  const out = { version: NOSCA_CENTRAL_CLIENT_VERSION, centralTotal: raw.files.length,
    checked: checks.length, restrictedCount: checks.filter(function (x) {return !x.employeeCanOpen;}).length,
    checks: checks };
  console.log('[NOSCA CENTRAL][VISIBILITY] ' + JSON.stringify(out));
  return out;
}

/**
 * Offline Owner/Client wire-protocol compatibility check. No Drive call,
 * no HTTP request, and no feature switch changes. Can be run from the
 * Apps Script editor before live bridge transport testing.
 */
function benchmarkNoscaCentralProtocolCompatibility20261026() {
  const secret = String(PropertiesService.getScriptProperties()
    .getProperty('NOSCA_CENTRAL_SHARED_SECRET') || '');
  if (secret.length < 48) throw new Error('CENTRAL_SHARED_SECRET_MISSING');
  const request = {
    v: 1, op: 'lookup', timestamp: Date.now(), nonce: Utilities.getUuid(),
    email: 'test@novare.com.ph', question: 'pjl'
  };
  const response = {
    v: 1, version: NOSCA_CENTRAL_OWNER_VERSION,
    nonce: request.nonce, ok: true, operation: request.op,
    files: [{ id: '1ynKpK-D2huHtUlCoJiPKYZ1UNdQl80s064OqUuA_YAc',
      name: 'PJL 3-Year Renewal Roadmap Deck (Sep 28, 2026)',
      mimeType: 'application/vnd.google-apps.presentation' }],
    apiCalls: 1, truncated: false, incompleteSearch: false,
    elapsedMs: 1, scopeMode: 'approved_files'
  };
  const sig = noscaBridgeSign_(response, secret);
  const signatureAccepted = noscaBridgeConstantEqual_(sig,
    noscaBridgeSign_(response, secret));
  const versionCompatible = response.v === 1 &&
    typeof response.version === 'string' && !!response.version &&
    response.nonce === request.nonce && response.operation === request.op;
  const forged = Object.assign({}, response, { nonce: Utilities.getUuid() });
  const forgedRejected = !noscaBridgeConstantEqual_(sig,
    noscaBridgeSign_(forged, secret));
  const report = {
    ok: signatureAccepted && versionCompatible && forgedRejected,
    protocolVersion: 1,
    clientVersion: NOSCA_CENTRAL_CLIENT_VERSION,
    ownerVersion: NOSCA_CENTRAL_OWNER_VERSION,
    signedReplyAccepted: signatureAccepted,
    crossReleaseCompatible: versionCompatible,
    nonceTamperingRejected: forgedRejected,
    requiresDeployment: false
  };
  console.log('[NOSCA CENTRAL][PROTOCOL] ' + JSON.stringify(report));
  if (!report.ok) throw new Error('CENTRAL_PROTOCOL_SELF_TEST_FAILED');
  return report;
}


/**
 * One-time URL configuration for the existing NOVARE NEXUS Apps Script project.
 * Run in the editor signed in as novare.nexus@novare.com.ph.
 * Does not enable the owner endpoint or central discovery.
 */
function setupNoscaCentralOwnerDeploymentUrl20261026() {
  const endpointUrl = 'https://script.google.com/a/macros/novare.com.ph/s/AKfycbwucZ1n8-G5pXBq2-UVCeD1EaJ-xxO-85xT-7SeIW0auUnXUPVzffDtLB58hN8eCA44bg/exec';
  const props = PropertiesService.getScriptProperties();
  const owner = String(props.getProperty('NOSCA_CENTRAL_OWNER_EMAIL') || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!owner || owner !== effective) throw new Error('OWNER_ACCOUNT_REQUIRED_FOR_URL_SETUP');
  const propertyName = 'NOSCA_CENTRAL_OWNER_DEPLOYMENT_URL';
  const previous = props.getProperty(propertyName);
  props.setProperty(propertyName, endpointUrl);
  try {
    // Validates the URL against the fixed host and allowed company domain.
    noscaCentralSettings_();
  } catch (err) {
    if (previous === null) props.deleteProperty(propertyName);
    else props.setProperty(propertyName, previous);
    throw err;
  }
  const result = {
    ok: true,
    ownerVerified: true,
    ownerDeploymentUrlConfigured: true,
    centralDiscoveryEnabled: props.getProperty('NOSCA_CENTRAL_DISCOVERY_ENABLED') === 'true',
    ownerEndpointEnabled: props.getProperty('NOSCA_CENTRAL_OWNER_ENDPOINT_ENABLED') === 'true',
    nextStep: 'Verify deployment access and runtime scopes, then run bridge transport as employee'
  };
  console.log('[NOSCA CENTRAL][OWNER_URL_SETUP] ' + JSON.stringify(result));
  return result;
}


/**
 * PRIORITY 1: Diagnose bridge latency without querying Drive. Run as an
 * authorized employee in the Apps Script editor. One authenticated remote
 * ping, no cache, and no Script Property modifications.
 */
function benchmarkNoscaPhase1BridgePing20261029() {
  const started = Date.now();
  const response = noscaCentralRemoteCall_('ping', '');
  const out = { ok: true, test: 'BRIDGE_PHASE1_PING',
    elapsedMs: Date.now() - started, ownerElapsedMs: response.elapsedMs,
    ownerPerformance: response.performance || null, apiCalls: response.apiCalls,
    returned: response.files.length, signedResponseVerified: true };
  console.log('[NOSCA CENTRAL][PHASE1_PING] ' + JSON.stringify(out));
  return out;
}

/**
 * PRIORITY 1: Benchmark an uncached first-time Central Discovery lookup.
 * The existing BRIDGE log prints detailed settings, OAuth, POST, redirect,
 * parsing and signing timings. No changes to V3 ranking or knowledge Q&A.
 */
function benchmarkNoscaPhase1BridgeLookup20261029() {
  const started = Date.now();
  const result = noscaFindCentralDocuments_('novare nexus');
  const out = { ok: result.ok && result.backend === 'central_metadata',
    test: 'BRIDGE_PHASE1_LOOKUP', elapsedMs: Date.now() - started,
    backend: result.backend, apiCalls: result.searchDiagnostics.apiCalls,
    ownerDriveSearchMs: result.searchDiagnostics.centralServiceMs,
    returned: result.results.length,
    top: result.results.slice(0, 3).map(function (f) { return f.fileName; }),
    noCache: true, noEmployeeAccessChecks: true };
  console.log('[NOSCA CENTRAL][PHASE1_LOOKUP] ' + JSON.stringify(out));
  return out;
}

/**
 * Repeat the same query twice. Unlike caching benchmarks, this SHOULD issue
 * two signed HTTP calls (and two owner Drive searches); it measures platform
 * run-to-run variability and confirms we haven't introduced result caching.
 */
function benchmarkNoscaPhase1BridgeRepeat20261029() {
  const runs = [];
  for (let i = 0; i < 2; i++) {
    const started = Date.now();
    const response = noscaCentralRemoteLookup_('pjl');
    runs.push({ run: i + 1, elapsedMs: Date.now() - started,
      apiCalls: response.apiCalls, returned: response.files.length,
      ownerDriveSearchMs: response.elapsedMs,
      ownerPerformance: response.performance || null });
  }
  const out = { ok: runs.length === 2, test: 'BRIDGE_PHASE1_REPEAT',
    runs: runs, noCache: true, noPermissionCheck: true };
  console.log('[NOSCA CENTRAL][PHASE1_REPEAT] ' + JSON.stringify(out));
  return out;
}
