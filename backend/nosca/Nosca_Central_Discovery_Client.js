/**
 * Ask NOSCA — central metadata-only discovery client, opt-in.
 * Runs in the EXISTING USER_ACCESSING NEXUS webapp. Never sends Gemini keys,
 * document contents, user OAuth tokens, or Drive credentials to the service.
 * The service executes independently under the Novare Nexus Google account.
 */
const NOSCA_CENTRAL_CLIENT_VERSION = 'nosca-central-discovery-20261023-v1';

function noscaCentralDiscoveryEnabled_() {
  return String(PropertiesService.getScriptProperties()
    .getProperty('NOSCA_CENTRAL_DISCOVERY_ENABLED') || 'false')
    .trim().toLowerCase() === 'true';
}

function noscaCentralSettings_() {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('NOSCA_CENTRAL_SERVICE_URL') || '').trim();
  const secret = String(props.getProperty('NOSCA_CENTRAL_SHARED_SECRET') || '').trim();
  const domains = String(props.getProperty('NOSCA_CENTRAL_ALLOWED_DOMAINS') || '')
    .toLowerCase().split(',').map(function(d){return d.trim();}).filter(Boolean);
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec(?:\?.*)?$/.test(url)) {
    throw new Error('Central discovery service URL is missing or invalid.');
  }
  if (secret.length < 32 || !domains.length) {
    throw new Error('Central discovery secret or employee-domain allowlist is not configured.');
  }
  return {url:url, secret:secret, domains:domains};
}

function noscaCentralEmployee_ (domains) {
  // In employee-scoped deployment these identities should agree. When a
  // privileged owner-executed deployment is substituted, refuse to proxy.
  const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  const domain = active.split('@')[1] || '';
  if (!active || active !== effective || domains.indexOf(domain) < 0) {
    throw new Error('Central discovery requires a verified, signed-in employee in an approved domain.');
  }
  return active;
}

function noscaCentralSignature_(payload, secret) {
  const bytes = Utilities.computeHmacSha256Signature(JSON.stringify(payload), secret);
  return Utilities.base64EncodeWebSafe(bytes);
}

function noscaCentralRemoteLookup_(question) {
  const settings = noscaCentralSettings_();
  const email = noscaCentralEmployee_(settings.domains);
  const text = String(question || '').replace(/\s+/g,' ').trim();
  if (!text || text.length > 500) throw new Error('Use a file-search query up to 500 characters.');
  const payload = {
    v:1, op:'lookup', timestamp:Date.now(),
    nonce:Utilities.getUuid(), email:email, question:text
  };
  const request = JSON.stringify({payload:payload,
    signature:noscaCentralSignature_(payload, settings.secret)});
  const started = Date.now();
  let response;
  try {
    response = UrlFetchApp.fetch(settings.url, {
      method:'post', contentType:'application/json', payload:request,
      muteHttpExceptions:true, followRedirects:true
    });
  } catch(e) {
    throw new Error('Central discovery service could not be reached.');
  }
  let data;
  try {data = JSON.parse(response.getContentText());}
  catch(e) {throw new Error('Central discovery service did not return JSON. Verify its deployment URL and access settings.');}
  if (response.getResponseCode() !== 200 || !data || data.ok !== true ||
      data.version !== NOSCA_CENTRAL_CLIENT_VERSION || !Array.isArray(data.files)) {
    console.warn('[NOSCA CENTRAL] Request rejected', {
      code:response.getResponseCode(),
      error:String(data && data.error || 'INVALID_RESPONSE').slice(0,80)
    });
    throw new Error('Central discovery request was rejected. Check the service configuration and access logs.');
  }
  console.log('[NOSCA CENTRAL] Metadata search completed', JSON.stringify({
    version:data.version, elapsedMs:Date.now()-started,
    serviceElapsedMs:data.elapsedMs, files:data.files.length,
    apiCalls:data.apiCalls, truncated:data.truncated,
    employeeVerified:true
  }));
  return data;
}

function noscaCentralRecord_(file) {
  // Whitelist every field. The service NEVER sends contents or permissions.
  const id = String(file.id || '').trim();
  const name = String(file.name || '').trim().slice(0,300);
  const mime = String(file.mimeType || 'application/octet-stream').trim();
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id) || !name) return null;
  const folder = mime === NOSCA_CONFIG.mimeTypes.folder;
  const record = {
    fileId:id, fileName:name, name:name, mimeType:mime,
    itemType:folder ? NOSCA_CONFIG.itemTypes.folder : NOSCA_CONFIG.itemTypes.file,
    folderPath:'', hierarchyContext:'', status:NOSCA_CONFIG.statuses.active,
    modifiedTime:String(file.modifiedTime || ''), driveId:String(file.driveId || ''),
    driveUrl:/^https:\/\//.test(String(file.webViewLink || ''))
      ? String(file.webViewLink) : 'https://drive.google.com/open?id='+encodeURIComponent(id)
  };
  record.fileFormat = getNoscaFileFormat_(record);
  record.documentType = classifyNoscaDocumentType_(record);
  return record;
}

/** Metadata-only, no user-Drive fallback when centralized search is enabled. */
function noscaFindCentralDocuments_(question) {
  const started = Date.now();
  const info = noscaV3QueryInfo_(question);
  const raw = noscaCentralRemoteLookup_(info.query.text);
  const records = raw.files.map(noscaCentralRecord_).filter(Boolean);
  const ranked = noscaV3Rank_(records, info);
  const limit = Math.max(1, Number(NOSCA_CONFIG.retrieval.maxDocumentLookupResults || 12));
  const selected = ranked.ranked.slice(0,limit);
  selected.forEach(function(r,i){r.sourceIndex=i+1;});
  const summary = summarizeNoscaDocumentLookupResults_(selected);
  summary.searchVersion = NOSCA_CENTRAL_CLIENT_VERSION;
  summary.discoveryIdentity = 'novare-nexus';
  summary.accessStatus = 'not-verified-for-employee';
  summary.searchCalls = raw.apiCalls;
  return {
    ok:true, question:info.query.text, queryTerms:info.query.terms,
    requestedDocumentTypes:info.requestedTypes,
    requestedItemTypes:info.requestedItemTypes,
    totalMatches:ranked.ranked.length, results:selected, summary:summary,
    backend:'central_metadata', searchElapsedMs:Date.now()-started,
    truncated:raw.truncated === true,
    warning:raw.truncated ? 'Search was bounded; additional files may exist.' : '',
    searchDiagnostics:{
      patchVersion:NOSCA_CENTRAL_CLIENT_VERSION, identity:'novare-nexus',
      apiCalls:raw.apiCalls, centralServiceMs:raw.elapsedMs,
      rawCandidateCount:records.length, eligible:ranked.ranked.length,
      rejected:ranked.rejected.length, truncated:raw.truncated === true,
      scopeMode:raw.scopeMode, noGemini:true
    }
  };
}

/** Run in USER_ACCESSING portal, after central service deployment. */
function benchmarkNoscaCentralDiscovery() {
  const result = noscaFindCentralDocuments_('3 year roadmap');
  const report = {
    version:NOSCA_CENTRAL_CLIENT_VERSION, enabled:noscaCentralDiscoveryEnabled_(),
    backend:result.backend, elapsedMs:result.searchElapsedMs,
    apiCalls:result.searchDiagnostics.apiCalls,
    scopeMode:result.searchDiagnostics.scopeMode,
    returned:result.results.length,
    topFive:result.results.slice(0,5).map(function(f){return {name:f.fileName,score:f.metadataScore};}),
    noContentReturned:true, aclStatus:'not-verified-for-employee'
  };
  console.log('[NOSCA CENTRAL][CLIENT_TEST] '+JSON.stringify(report));
  return report;
}

/** Safe check for deployment identity (logs only emails, not credentials). */
function benchmarkNoscaCentralIdentity() {
  const config = noscaCentralSettings_();
  const email = noscaCentralEmployee_(config.domains);
  const out = {ok:true, activeAndEffectiveAgree:true,
    email:email, enabled:noscaCentralDiscoveryEnabled_()};
  console.log('[NOSCA CENTRAL][EMPLOYEE_IDENTITY] '+JSON.stringify(out));
  return out;
}

/** Compare catalog visibility with the employee's ACTUAL Drive permissions. */
function benchmarkNoscaCentralVisibility() {
  const raw = noscaCentralRemoteLookup_('3 year roadmap');
  const items = raw.files.slice(0, 5);
  const checks = items.map(function (file) {
    let accessible = false;
    try {
      const found = Drive.Files.get(file.id, {
        fields:'id', supportsAllDrives:true
      });
      accessible = Boolean(found && found.id === file.id);
    } catch (e) {
      // A missing permission is expected for some central-discovery files.
      accessible = false;
    }
    return {id:file.id, name:file.name, employeeCanOpen:accessible,
      needsPermissionRequest:!accessible};
  });
  const report = {version:NOSCA_CENTRAL_CLIENT_VERSION,
    centralFound:raw.files.length, verified:checks.length,
    accessibleToEmployee:checks.filter(function(c){return c.employeeCanOpen;}).length,
    requestAccessCandidates:checks.filter(function(c){return c.needsPermissionRequest;}).length,
    files:checks};
  console.log('[NOSCA CENTRAL][VISIBILITY] '+JSON.stringify(report));
  return report;
}
