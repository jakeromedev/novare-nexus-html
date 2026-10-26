/**
 * NOVARE NEXUS — CENTRAL DISCOVERY PRE-SCOPE DIAGNOSTIC
 *
 * Add this complete file to the existing ONE Apps Script project.
 * Run benchmarkNoscaCentralDriveAuthorizationPreScope from the editor while
 * signed in as novare.nexus@novare.com.ph.
 *
 * Purpose: Verify the owner's identity and Drive v3 metadata OAuth before
 * any approved Shared Drive IDs are configured. This function does NOT
 * authorize centralized discovery, change settings, access file content,
 * or bypass approved-drive rules in the production search functions.
 *
 * Requirements: Advanced Google Drive Service v3 enabled, and the OAuth
 * scope https://www.googleapis.com/auth/drive.metadata.readonly present.
 */
function benchmarkNoscaCentralDriveAuthorizationPreScope() {
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  var expectedOwner = String(props.getProperty('NOSCA_CENTRAL_OWNER_EMAIL') || '')
    .trim().toLowerCase();
  var effective = String(Session.getEffectiveUser().getEmail() || '')
    .trim().toLowerCase();
  var approvedDriveIds = String(props.getProperty('NOSCA_CENTRAL_ALLOWED_DRIVE_IDS') || '')
    .split(',').map(function (id) { return id.trim(); }).filter(Boolean);

  if (!expectedOwner || !effective || effective !== expectedOwner) {
    var identityFailure = {
      ok: false,
      test: 'NOSCA_CENTRAL_DRIVE_OAUTH_PRE_SCOPE',
      reason: 'OWNER_IDENTITY_MISMATCH',
      ownerConfigured: !!expectedOwner,
      effectiveIsOwner: !!expectedOwner && effective === expectedOwner
    };
    console.error('[NOSCA CENTRAL][PRE_SCOPE_AUTH] ' + JSON.stringify(identityFailure));
    throw new Error('Owner identity check failed. Run as the configured Novare Nexus account.');
  }

  try {
    // This is deliberately account-scoped, not an approved-drive search.
    // It verifies OAuth/API execution even if the account has zero files.
    var response = Drive.Files.list({
      q: 'trashed = false',
      corpora: 'user',
      pageSize: 1,
      fields: 'nextPageToken,files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    if (!response || typeof response !== 'object' ||
        (response.files != null && !Array.isArray(response.files))) {
      throw new Error('Unexpected Drive API response');
    }

    var report = {
      ok: true,
      test: 'NOSCA_CENTRAL_DRIVE_OAUTH_PRE_SCOPE',
      effectiveIsOwner: true,
      driveApiAuthorized: true,
      sampleCount: (response.files || []).length,
      approvedDrivesCount: approvedDriveIds.length,
      approvedScopeReady: approvedDriveIds.length > 0,
      centralDiscoveryEnabled: props.getProperty('NOSCA_CENTRAL_DISCOVERY_ENABLED') === 'true',
      ownerEndpointEnabled: props.getProperty('NOSCA_CENTRAL_OWNER_ENDPOINT_ENABLED') === 'true',
      note: approvedDriveIds.length === 0
        ? 'OAuth passed. Approved Shared Drives are not yet configured. Do not enable production discovery.'
        : 'OAuth passed. Run the strict approved-drive and security checks next.',
      elapsedMs: Date.now() - started
    };
    console.log('[NOSCA CENTRAL][PRE_SCOPE_AUTH] ' + JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    var failure = {
      ok: false,
      test: 'NOSCA_CENTRAL_DRIVE_OAUTH_PRE_SCOPE',
      effectiveIsOwner: true,
      driveApiAuthorized: false,
      error: String(error && error.message || error),
      elapsedMs: Date.now() - started
    };
    console.error('[NOSCA CENTRAL][PRE_SCOPE_AUTH] ' + JSON.stringify(failure, null, 2));
    throw error;
  }
}
