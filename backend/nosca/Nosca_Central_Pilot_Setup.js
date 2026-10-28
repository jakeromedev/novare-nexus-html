/**
 * NOVARE NEXUS — Switch central discovery to the Nexus account's Drive scope.
 * Run ONCE as novare.nexus@novare.com.ph, in the SAME Apps Script project.
 *
 * IMPORTANT: Every domain-authorized NOSCA user can discover filenames and
 * links for ALL files accessible to the Nexus account, including restricted
 * files they cannot open. This does not fetch document contents or change
 * Google Drive sharing permissions. Do not run until metadata visibility is
 * approved by the organization and legacy public deployments are retired.
 *
 * Preserves Gemini key, current endpoint URL, shared secret, and feature flags.
 */
function setupNoscaCentralAccountWideDiscovery() {
  const props = PropertiesService.getScriptProperties();
  const expected = 'novare.nexus@novare.com.ph';
  const owner = String(props.getProperty('NOSCA_CENTRAL_OWNER_EMAIL') || '')
    .trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '')
    .trim().toLowerCase();
  if (effective !== expected || owner !== expected)
    throw new Error('ACCOUNT_SETUP_REQUIRES_NEXUS_OWNER');
  if (String(props.getProperty('NOSCA_CENTRAL_SHARED_SECRET') || '').length < 48)
    throw new Error('CENTRAL_SHARED_SECRET_MISSING');
  if (!String(props.getProperty('NOSCA_CENTRAL_ALLOWED_DOMAINS') || '').trim())
    throw new Error('CENTRAL_ALLOWED_DOMAINS_MISSING');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Explicit owner acknowledgment: account-scoped metadata is available to
    // signed, authorized internal NOSCA users, regardless of Drive file ACL.
    props.setProperties({
      NOSCA_CENTRAL_SCOPE_MODE: 'account',
      NOSCA_CENTRAL_ACCOUNT_WIDE_APPROVED: 'I_ACKNOWLEDGE_METADATA_VISIBILITY'
    }, false);
    // The former allowlists must NOT determine search results anymore.
    props.deleteProperty('NOSCA_CENTRAL_ALLOWED_FILE_IDS');
    props.deleteProperty('NOSCA_CENTRAL_ALLOWED_DRIVE_IDS');
  } finally {
    lock.releaseLock();
  }
  const cfg = noscaOwnerConfig_();
  const report = {
    ok: true, executedAsOwner: true, scopeMode: cfg.mode,
    approvedFileFilteringRemoved: true,
    metadataVisibility: 'all-files-visible-to-novare-nexus-account',
    ownerEndpointEnabled: props.getProperty('NOSCA_CENTRAL_OWNER_ENDPOINT_ENABLED') === 'true',
    centralDiscoveryEnabled: props.getProperty('NOSCA_CENTRAL_DISCOVERY_ENABLED') === 'true',
    otherScriptPropertiesPreserved: true,
    nextTest: 'benchmarkNoscaCentralAccountWideSearch20261029'
  };
  console.log('[NOSCA CENTRAL][ACCOUNT_SETUP] ' + JSON.stringify(report));
  return report;
}

/** Retired old pilot name so it cannot accidentally restore the file allowlist. */
function setupNoscaCentralPjlPilot() {
  throw new Error('PILOT_RETIRED: Run setupNoscaCentralAccountWideDiscovery instead.');
}
