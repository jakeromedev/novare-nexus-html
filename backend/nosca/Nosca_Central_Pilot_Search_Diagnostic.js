/**
 * NOVARE NEXUS — ONE-PROJECT APPROVED-FILE PILOT DIAGNOSTIC
 * Complete standalone Apps Script source file; does not modify Script Properties,
 * expose secrets, deploy endpoints, or replace the existing NOSCA modules.
 *
 * Run in the Apps Script editor as novare.nexus@novare.com.ph:
 *   benchmarkNoscaPilotFileSearch20261026
 *
 * Uses deliberately unique entry-point name to avoid a known name collision
 * with the legacy Nosca_Central_Discovery_Service.gs file.
 * Requires the pilot's noscaOwnerConfig_ and noscaOwnerSearch_ helpers.
 */
function benchmarkNoscaPilotFileSearch20261026() {
  const started = Date.now();
  const effectiveUser = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  const expectedOwner = 'novare.nexus@novare.com.ph';
  if (effectiveUser !== expectedOwner) {
    throw new Error('PILOT_MUST_RUN_AS_NOVARE_NEXUS');
  }
  if (typeof noscaOwnerConfig_ !== 'function' || typeof noscaOwnerSearch_ !== 'function') {
    throw new Error('PILOT_OWNER_MODULE_MISSING');
  }

  // The owner-specific helpers support approved_files; the older shared
  // noscaCentralConfig_ in Service.gs does not. Never call the older helper.
  const cfg = noscaOwnerConfig_();
  if (cfg.mode !== 'approved_files') {
    throw new Error('PILOT_REQUIRES_APPROVED_FILES_MODE; current=' + cfg.mode);
  }

  const result = noscaOwnerSearch_('pjl', cfg);
  const matches = (result.files || []).map(function (file) {
    return { name: file.name, mimeType: file.mimeType, hasLink: !!file.webViewLink };
  });
  const report = {
    test: 'NOSCA_PILOT_FILE_SEARCH_20261026',
    ok: matches.length > 0,
    effectiveIsOwner: true,
    scopeMode: cfg.mode,
    approvedFileCount: cfg.fileIds.length,
    query: 'pjl',
    matchedFileCount: matches.length,
    apiCalls: result.apiCalls,
    matches: matches,
    elapsedMs: Date.now() - started,
    note: 'This only verifies the owner-authorized local search. The duplicate legacy service and live deployment transport still require resolution.'
  };
  console.log('[NOSCA CENTRAL][PILOT_FILE_SEARCH] ' + JSON.stringify(report, null, 2));
  if (!report.ok) throw new Error('PILOT_RETURNED_ZERO_MATCHES');
  return report;
}
