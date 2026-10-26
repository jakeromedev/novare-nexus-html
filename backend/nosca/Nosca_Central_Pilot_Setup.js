/**
 * NOVARE NEXUS — PILOT SETUP FOR INDIVIDUALLY SHARED FILES.
 * Add this entire file to the SAME existing Apps Script project.
 * Run setupNoscaCentralPjlPilot() as novare.nexus@novare.com.ph.
 *
 * This is NOT the production rollout. It verifies the existing shared file
 * directly, sets only an approved-file allowlist, and leaves both web app
 * feature switches OFF. It never modifies GEMINI_API_KEY or other settings.
 */
function setupNoscaCentralPjlPilot() {
  const owner = 'novare.nexus@novare.com.ph';
  const account = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (account !== owner) throw new Error('PILOT_OWNER_REQUIRED');
  const fileId = '1ynKpK-D2huHtUlCoJiPKYZ1UNdQl80s064OqUuA_YAc';
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty('NOSCA_CENTRAL_SHARED_SECRET') || '').length < 48)
    throw new Error('PILOT_SHARED_SECRET_MISSING');
  // Confirm owner access BEFORE changing configuration.
  const f = Drive.Files.get(fileId, {
    fields: 'id,name,mimeType,trashed,webViewLink', supportsAllDrives: true
  });
  if (!f || f.id !== fileId || f.trashed) throw new Error('PILOT_FILE_NOT_READABLE');

  props.setProperties({
    NOSCA_CENTRAL_SCOPE_MODE: 'approved_files',
    NOSCA_CENTRAL_ALLOWED_FILE_IDS: fileId,
    NOSCA_CENTRAL_OWNER_ENDPOINT_ENABLED: 'false',
    NOSCA_CENTRAL_DISCOVERY_ENABLED: 'false'
  }, false);

  // Same search helper the owner endpoint uses when serving requests.
  const cfg = noscaOwnerConfig_();
  const test = noscaOwnerSearch_('pjl', cfg);
  const report = {
    ok: test.files.some(function (x) { return x.id === fileId; }),
    scopeMode: cfg.mode, account: account, allowlistedFileCount: cfg.fileIds.length,
    search: 'pjl', matches: test.files.length, apiCalls: test.apiCalls,
    results: test.files.map(function (x) {
      return { name: x.name, mimeType: x.mimeType, link: x.webViewLink };
    }),
    employeePortalUnchanged: true,
    ownerEndpointEnabled: false,
    centralDiscoveryEnabled: false,
    nextTest: 'benchmarkNoscaCentralOwnerSecurity'
  };
  console.log('[NOSCA CENTRAL][PILOT] ' + JSON.stringify(report, null, 2));
  if (!report.ok) throw new Error('PILOT_SEARCH_DID_NOT_RETURN_SHARED_PJL_FILE');
  return report;
}
