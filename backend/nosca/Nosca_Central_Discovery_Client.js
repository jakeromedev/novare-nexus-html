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
  const p = PropertiesService.getScriptProperties();
  const url = String(p.getProperty('NOSCA_CENTRAL_OWNER_DEPLOYMENT_URL') || '').trim();
  const secret = String(p.getProperty('NOSCA_CENTRAL_SHARED_SECRET') || '').trim();
  const domains = String(p.getProperty('NOSCA_CENTRAL_ALLOWED_DOMAINS') || '')
    .trim().toLowerCase().split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))
    throw new Error('OWNER_DEPLOYMENT_URL_MISSING_OR_INVALID');
  if (secret.length < 48 || !domains.length)
    throw new Error('CENTRAL_BRIDGE_SETTINGS_MISSING');
  return { url: url, secret: secret, domains: domains };
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
function noscaCentralFetch_(url, jsonBody) {
  const oauth = ScriptApp.getOAuthToken();
  if (!oauth) throw new Error('EMPLOYEE_OAUTH_TOKEN_UNAVAILABLE');
  const first = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: jsonBody,
    headers: { Authorization: 'Bearer ' + oauth },
    muteHttpExceptions: true, followRedirects: false
  });
  const code = first.getResponseCode();
  if (code === 301 || code === 302 || code === 303 || code === 307 || code === 308) {
    const h = first.getHeaders();
    const location = String(h.Location || h.location || '').trim();
    if (!/^https:\/\/script\.googleusercontent\.com\//.test(location))
      throw new Error('UNEXPECTED_REDIRECT_HOST');
    const second = UrlFetchApp.fetch(location, {
      method: 'get', followRedirects: false, muteHttpExceptions: true
    });
    if (second.getResponseCode() !== 200)
      throw new Error('DOMAIN_TRANSPORT_RESPONSE_' + second.getResponseCode());
    return second.getContentText();
  }
  if (code !== 200) throw new Error('DOMAIN_TRANSPORT_RESPONSE_' + code);
  return first.getContentText();
}

/** Signed and authenticated call to the Nexus-owned deployment. */
function noscaCentralRemoteCall_(operation, question) {
  const settings = noscaCentralSettings_();
  const email = noscaCentralEmployee_(settings.domains);
  const text = String(question || '').replace(/\s+/g, ' ').trim();
  if (operation !== 'ping' && (text.length === 0 || text.length > 500))
    throw new Error('INVALID_CENTRAL_QUERY');
  if (['ping', 'lookup'].indexOf(operation) < 0) throw new Error('INVALID_OPERATION');
  const payload = { v: 1, op: operation, timestamp: Date.now(),
    nonce: Utilities.getUuid(), email: email, question: text };
  const request = JSON.stringify({ payload: payload,
    signature: noscaBridgeSign_(payload, settings.secret) });
  const started = Date.now();
  const responseText = noscaCentralFetch_(settings.url, request);
  if (responseText.length > 160000) throw new Error('CENTRAL_RESPONSE_TOO_LARGE');
  let envelope;
  try { envelope = JSON.parse(responseText); }
  catch (err) { throw new Error('DOMAIN_TRANSPORT_NON_JSON'); }
  if (!envelope || !envelope.payload || !envelope.signature ||
      !noscaBridgeConstantEqual_(envelope.signature,
        noscaBridgeSign_(envelope.payload, settings.secret)))
    throw new Error('CENTRAL_RESPONSE_SIGNATURE_INVALID');
  const data = envelope.payload;
  if (data.v !== 1 || data.nonce !== payload.nonce ||
      data.version !== NOSCA_CENTRAL_CLIENT_VERSION || data.operation !== operation ||
      data.ok !== true || !Array.isArray(data.files))
    throw new Error('CENTRAL_RESPONSE_INVALID');
  console.log('[NOSCA CENTRAL][BRIDGE] ' + JSON.stringify({
    version: data.version, operation: operation, elapsedMs: Date.now() - started,
    serviceElapsedMs: data.elapsedMs, returned: data.files.length,
    apiCalls: data.apiCalls, truncated: data.truncated, domainAuthenticated: true
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
