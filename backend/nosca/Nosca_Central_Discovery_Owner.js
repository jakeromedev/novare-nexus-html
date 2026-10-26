/**
 * NOVARE NEXUS — OWNER-EXECUTED METADATA DISCOVERY.
 * SAME Apps Script project as NEXUS; SECOND WEB-APP DEPLOYMENT only.
 * Owner deployment: Execute as ME (novare.nexus@novare.com.ph), access: DOMAIN.
 * Portal deployment: Execute as USER ACCESSING, access: DOMAIN.
 *
 * NEVER publish the owner deployment as Anyone/anonymous to make UrlFetchApp work.
 * The owner endpoint returns only approved Drive metadata; no file contents,
 * descriptions, permissions, thumbnails, owner email or OAuth tokens.
 * Endpoint stays OFF until a domain-authenticated transport check succeeds.
 */
const NOSCA_CENTRAL_OWNER_VERSION = 'nosca-central-single-project-20261026-pilot';

function noscaOwnerConfig_() {
  const props = PropertiesService.getScriptProperties();
  const owner = String(props.getProperty('NOSCA_CENTRAL_OWNER_EMAIL') || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!owner || !effective || owner !== effective) throw new Error('OWNER_IDENTITY_MISMATCH');
  const secret = String(props.getProperty('NOSCA_CENTRAL_SHARED_SECRET') || '').trim();
  const domains = String(props.getProperty('NOSCA_CENTRAL_ALLOWED_DOMAINS') || '')
    .trim().toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  const mode = String(props.getProperty('NOSCA_CENTRAL_SCOPE_MODE') || 'approved_drives').trim().toLowerCase();
  const driveIds = String(props.getProperty('NOSCA_CENTRAL_ALLOWED_DRIVE_IDS') || '')
    .split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return /^[A-Za-z0-9_-]{10,}$/.test(s); }).slice(0, 8);
  const fileIds = String(props.getProperty('NOSCA_CENTRAL_ALLOWED_FILE_IDS') || '')
    .split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return /^[A-Za-z0-9_-]{10,}$/.test(s); }).slice(0, 20);
  const accountWideApproved = props.getProperty('NOSCA_CENTRAL_ACCOUNT_WIDE_APPROVED') === 'I_ACKNOWLEDGE_METADATA_VISIBILITY';
  if (secret.length < 48 || !domains.length) throw new Error('CENTRAL_CONFIGURATION_MISSING');
  if (mode !== 'approved_drives' && mode !== 'approved_files' && mode !== 'account') throw new Error('INVALID_SCOPE_MODE');
  if (mode === 'approved_drives' && !driveIds.length) throw new Error('APPROVED_DRIVES_REQUIRED');
  if (mode === 'approved_files' && !fileIds.length) throw new Error('APPROVED_FILES_REQUIRED');
  if (mode === 'account' && !accountWideApproved) throw new Error('ACCOUNT_WIDE_NOT_APPROVED');
  return { owner: owner, secret: secret, domains: domains, mode: mode, driveIds: driveIds, fileIds: fileIds };
}

function noscaOwnerSign_(data, secret) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(JSON.stringify(data), secret));
}
function noscaOwnerEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  let delta = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    delta |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return delta === 0;
}

function noscaOwnerAuthorize_(envelope, cfg) {
  if (!envelope || !envelope.payload || typeof envelope.signature !== 'string')
    throw new Error('INVALID_ENVELOPE');
  const p = envelope.payload;
  if (p.v !== 1 || ['ping', 'lookup'].indexOf(p.op) < 0 ||
      !Number.isFinite(p.timestamp) || Math.abs(Date.now() - p.timestamp) > 60000 ||
      !/^[0-9a-f-]{30,50}$/i.test(String(p.nonce || '')))
    throw new Error('INVALID_TIMESTAMP_OR_NONCE');
  if (!noscaOwnerEqual_(envelope.signature, noscaOwnerSign_(p, cfg.secret)))
    throw new Error('INVALID_SIGNATURE');
  const email = String(p.email || '').trim().toLowerCase();
  const domain = email.split('@')[1];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || cfg.domains.indexOf(domain) < 0)
    throw new Error('EMPLOYEE_DOMAIN_NOT_ALLOWED');
  const question = String(p.question || '').replace(/\s+/g, ' ').trim();
  if (p.op === 'lookup' && (!question || question.length > 500))
    throw new Error('INVALID_QUESTION');
  const nonceKey = 'nosca-central-' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p.nonce)).slice(0, 50);
  const cache = CacheService.getScriptCache();
  if (cache.get(nonceKey)) throw new Error('REPLAY_REJECTED');
  cache.put(nonceKey, '1', 120);
  return { op: p.op, email: email, question: question, nonce: p.nonce };
}

function noscaOwnerSearchAnchors_(question) {
  const words = String(question).toLowerCase().replace(/[_\\/()[\]{},.:;!?-]/g, ' ')
    .replace(/[^a-z0-9+#&\s]/g, ' ').split(/\s+/).filter(Boolean);
  const stop = { find:1, show:1, where:1, list:1, me:1, the:1, a:1, an:1,
    documents:1, document:1, files:1, file:1, folder:1, folders:1,
    for:1, from:1, year:1, years:1, proposal:1, proposals:1,
    deck:1, decks:1, presentation:1, presentations:1, sheet:1, sheets:1,
    novare:1, of:1, to:1, and:1 };
  const unique = words.filter(function (t, i) {
    return t.length >= 3 && t.length <= 60 && /^[a-z0-9+#&]+$/.test(t) &&
      !stop[t] && words.indexOf(t) === i;
  });
  // Preserve three-year semantics in V3 ranking; Drive search only uses anchors.
  return unique.sort(function (a, b) {
    if (a === 'roadmap') return -1;
    if (b === 'roadmap') return 1;
    return b.length - a.length;
  }).slice(0, 2);
}

function noscaOwnerSearch_(question, cfg) {
  const started = Date.now();
  const anchors = noscaOwnerSearchAnchors_(question);
  if (!anchors.length) return { files: [], apiCalls: 0, truncated: false, elapsedMs: 0, scopeMode: cfg.mode };

  // Restricted pilot: resolve ONLY explicitly allowlisted file IDs. Never
  // search the rest of the owner's Drive, even if it has broader access.
  if (cfg.mode === 'approved_files') {
    const files = [];
    let apiCalls = 0;
    for (let i = 0; i < cfg.fileIds.length; i++) {
      if (Date.now() - started > 6500) break;
      let f;
      try {
        apiCalls++;
        f = Drive.Files.get(cfg.fileIds[i], {
          fields: 'id,name,mimeType,driveId,webViewLink,modifiedTime,trashed',
          supportsAllDrives: true
        });
      } catch (err) {
        // Inaccessible/missing approved IDs are excluded; no permission details
        // are sent back to employees.
        continue;
      }
      if (!f || !f.id || !f.name || f.trashed) continue;
      const name = String(f.name).toLowerCase();
      if (!anchors.some(function (word) { return name.indexOf(word) >= 0; })) continue;
      files.push({
        id: String(f.id), name: String(f.name).slice(0, 300),
        mimeType: String(f.mimeType || ''), driveId: String(f.driveId || ''),
        webViewLink: /^https:\/\//.test(String(f.webViewLink || '')) ? String(f.webViewLink) : '',
        modifiedTime: String(f.modifiedTime || '')
      });
    }
    return {
      files: files, apiCalls: apiCalls,
      truncated: apiCalls < cfg.fileIds.length, incompleteSearch: false,
      elapsedMs: Date.now() - started, scopeMode: cfg.mode
    };
  }

  const found = Object.create(null);
  const corpora = cfg.mode === 'approved_drives'
    ? cfg.driveIds.map(function (id) { return { corpus: 'drive', driveId: id }; })
    : [{ corpus: 'user' }, { corpus: 'allDrives' }];
  const maxCalls = cfg.mode === 'approved_drives' ? Math.min(12, cfg.driveIds.length * 2) : 4;
  let apiCalls = 0, truncated = false, incompleteSearch = false;
  outer: for (let i = 0; i < anchors.length; i++) {
    if (i > 0 && Object.keys(found).length >= 30) break;
    for (let c = 0; c < corpora.length; c++) {
      const target = corpora[c];
      let pageToken = '';
      for (let page = 0; page < 2; page++) {
        if (apiCalls >= maxCalls || Date.now() - started > 6500) { truncated = true; break outer; }
        const opts = {
          q: "trashed = false and name contains '" + anchors[i].replace(/'/g, "\\'") + "'",
          corpora: target.corpus, supportsAllDrives: true, includeItemsFromAllDrives: true,
          fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,driveId,webViewLink,modifiedTime)',
          pageSize: 100, orderBy: 'name_natural'
        };
        if (target.driveId) opts.driveId = target.driveId;
        if (pageToken) opts.pageToken = pageToken;
        const result = Drive.Files.list(opts);
        apiCalls++;
        (result.files || []).forEach(function (f) {
          if (!f || !f.id || !f.name) return;
          if (cfg.mode === 'approved_drives' && f.driveId !== target.driveId) return;
          found[f.id] = {
            id: String(f.id), name: String(f.name).slice(0, 300),
            mimeType: String(f.mimeType || ''), driveId: String(f.driveId || ''),
            webViewLink: /^https:\/\//.test(String(f.webViewLink || '')) ? String(f.webViewLink) : '',
            modifiedTime: String(f.modifiedTime || '')
          };
        });
        if (result.incompleteSearch) incompleteSearch = true;
        pageToken = String(result.nextPageToken || '');
        if (!pageToken) break;
      }
      if (pageToken) truncated = true;
    }
  }
  const ids = Object.keys(found);
  const files = ids.slice(0, 240).map(function (id) { return found[id]; });
  if (ids.length > files.length || incompleteSearch) truncated = true;
  return { files: files, apiCalls: apiCalls, truncated: truncated,
    incompleteSearch: incompleteSearch, elapsedMs: Date.now() - started, scopeMode: cfg.mode };
}

function noscaOwnerJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Global doPost in the ONE shared Apps Script project.
 * Never exposes metadata from the employee-executed deployment: owner identity
 * check and a signed request are mandatory. No visitor-provided OAuth tokens.
 */
function doPost(e) {
  const started = Date.now();
  let cfg, signed;
  try {
    cfg = noscaOwnerConfig_();
    if (PropertiesService.getScriptProperties().getProperty('NOSCA_CENTRAL_OWNER_ENDPOINT_ENABLED') !== 'true')
      throw new Error('OWNER_ENDPOINT_DISABLED');
    const raw = String(e && e.postData && e.postData.contents || '');
    if (!raw || raw.length > 3500) throw new Error('INVALID_REQUEST_SIZE');
    const auth = noscaOwnerAuthorize_(JSON.parse(raw), cfg);
    const result = auth.op === 'ping' ? {
      files: [], apiCalls: 0, truncated: false, incompleteSearch: false, elapsedMs: 0, scopeMode: cfg.mode
    } : noscaOwnerSearch_(auth.question, cfg);
    const payload = {
      v: 1, version: NOSCA_CENTRAL_OWNER_VERSION, nonce: auth.nonce,
      ok: true, operation: auth.op, files: result.files, apiCalls: result.apiCalls,
      truncated: result.truncated, incompleteSearch: result.incompleteSearch,
      elapsedMs: result.elapsedMs, scopeMode: result.scopeMode
    };
    signed = { payload: payload, signature: noscaOwnerSign_(payload, cfg.secret) };
    console.log('[NOSCA CENTRAL][OWNER] ' + JSON.stringify({
      version: payload.version, operation: auth.op, elapsedMs: Date.now() - started,
      apiCalls: result.apiCalls, returned: result.files.length, scopeMode: cfg.mode
    }));
    return noscaOwnerJson_(signed);
  } catch (err) {
    // Do not disclose filename, user identity, or the secret in error responses.
    const code = /^(INVALID_|REPLAY_|EMPLOYEE_|OWNER_)/.test(String(err.message || ''))
      ? 'REQUEST_DENIED' : 'OWNER_SERVICE_UNAVAILABLE';
    console.warn('[NOSCA CENTRAL][OWNER_DENIED] ' + JSON.stringify({
      code: code, elapsedMs: Date.now() - started
    }));
    return noscaOwnerJson_({ ok: false, error: code });
  }
}

/** Run as novare.nexus@novare.com.ph in editor to grant Drive OAuth. */
function verifyNoscaDriveAuthorization() {
  const cfg = noscaOwnerConfig_();
  const options = { q: 'trashed = false', pageSize: 1,
    fields: 'files(id,name),nextPageToken', supportsAllDrives: true, includeItemsFromAllDrives: true };
  if (cfg.mode === 'approved_drives') { options.corpora = 'drive'; options.driveId = cfg.driveIds[0]; }
  else options.corpora = 'user';
  const result = cfg.mode === 'approved_files'
    ? { files: [Drive.Files.get(cfg.fileIds[0], { fields: 'id,name', supportsAllDrives: true })] }
    : Drive.Files.list(options);
  const report = { version: NOSCA_CENTRAL_OWNER_VERSION, ownerIdentityVerified: true,
    mode: cfg.mode, apiWorked: !!result, sampleCount: (result.files || []).length };
  console.log('[NOSCA CENTRAL][AUTHORIZATION] ' + JSON.stringify(report));
  return report;
}

/** No Drive calls. Owner-specific benchmark; avoids global function name collisions. */
function benchmarkNoscaCentralOwnerSecurity() {
  const cfg = noscaOwnerConfig_();
  const payload = { v: 1, op: 'ping', timestamp: Date.now(), nonce: Utilities.getUuid(),
    email: 'nosca-test@' + cfg.domains[0], question: '' };
  const signed = { payload: payload, signature: noscaOwnerSign_(payload, cfg.secret) };
  const accepted = noscaOwnerAuthorize_(signed, cfg).op === 'ping';
  let replay = false, forged = false, outOfDomain = false;
  try { noscaOwnerAuthorize_(signed, cfg); } catch (e) { replay = /REPLAY_REJECTED/.test(String(e)); }
  const tampered = { payload: Object.assign({}, payload, { nonce: Utilities.getUuid() }), signature: signed.signature };
  try { noscaOwnerAuthorize_(tampered, cfg); } catch (e) { forged = /INVALID_SIGNATURE/.test(String(e)); }
  const blocked = { v: 1, op: 'ping', timestamp: Date.now(), nonce: Utilities.getUuid(),
    email: 'someone@untrusted.example', question: '' };
  try { noscaOwnerAuthorize_({ payload: blocked, signature: noscaOwnerSign_(blocked, cfg.secret) }, cfg); }
  catch (e) { outOfDomain = /EMPLOYEE_DOMAIN_NOT_ALLOWED/.test(String(e)); }
  const report = { version: NOSCA_CENTRAL_OWNER_VERSION,
    ok: accepted && replay && forged && outOfDomain, signedAccepted: accepted,
    replayDenied: replay, forgeryDenied: forged, otherDomainDenied: outOfDomain };
  console.log('[NOSCA CENTRAL][SECURITY] ' + JSON.stringify(report));
  if (!report.ok) throw new Error('Central security self-test failed');
  return report;
}

function benchmarkNoscaCentralOwnerSearch() {
  const cfg = noscaOwnerConfig_();
  const result = noscaOwnerSearch_(cfg.mode === 'approved_files' ? 'pjl' : '3 year roadmap', cfg);
  const report = { version: NOSCA_CENTRAL_OWNER_VERSION,
    mode: cfg.mode, elapsedMs: result.elapsedMs, apiCalls: result.apiCalls,
    count: result.files.length, truncated: result.truncated,
    titles: result.files.slice(0, 8).map(function (x) { return x.name; }) };
  console.log('[NOSCA CENTRAL][OWNER_SEARCH] ' + JSON.stringify(report));
  return report;
}

/** One-time secret initialization in this SAME project's Script Properties. */
function setupNoscaCentralSharedSecret() {
  const props = PropertiesService.getScriptProperties();
  const current = String(props.getProperty('NOSCA_CENTRAL_SHARED_SECRET') || '');
  if (current.length >= 48) {
    console.log('[NOSCA CENTRAL][SECRET] Existing secret retained (value not logged).');
    return { ok: true, generated: false, secretPresent: true };
  }
  if (current.length > 0) throw new Error('An undersized secret already exists; review it before replacing.');
  props.setProperty('NOSCA_CENTRAL_SHARED_SECRET', Utilities.getUuid() + Utilities.getUuid());
  console.log('[NOSCA CENTRAL][SECRET] Shared secret created in project Script Properties (value not logged).');
  return { ok: true, generated: true, secretPresent: true };
}

/** Deployment-ready summary; excludes secrets and sensitive IDs. */
function benchmarkNoscaCentralConfiguration() {
  const p = PropertiesService.getScriptProperties();
  const owner = String(p.getProperty('NOSCA_CENTRAL_OWNER_EMAIL') || '').trim().toLowerCase();
  const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  const props = {
    ownerConfigured: !!owner,
    effectiveIsOwner: !!owner && effective === owner,
    activeIsEffective: active !== '' && active === effective,
    approvedDrivesCount: String(p.getProperty('NOSCA_CENTRAL_ALLOWED_DRIVE_IDS') || '')
      .split(',').filter(function (x) { return x.trim(); }).length,
    approvedFilesCount: String(p.getProperty('NOSCA_CENTRAL_ALLOWED_FILE_IDS') || '')
      .split(',').filter(function (x) { return x.trim(); }).length,
    scopeMode: p.getProperty('NOSCA_CENTRAL_SCOPE_MODE') || 'approved_drives',
    sharedSecretPresent: String(p.getProperty('NOSCA_CENTRAL_SHARED_SECRET') || '').length >= 48,
    ownerEndpointEnabled: p.getProperty('NOSCA_CENTRAL_OWNER_ENDPOINT_ENABLED') === 'true',
    portalCentralEnabled: p.getProperty('NOSCA_CENTRAL_DISCOVERY_ENABLED') === 'true',
    ownerDeploymentUrlConfigured: !!p.getProperty('NOSCA_CENTRAL_OWNER_DEPLOYMENT_URL')
  };
  console.log('[NOSCA CENTRAL][CONFIG] ' + JSON.stringify(props));
  return props;
}
