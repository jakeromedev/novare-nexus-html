/**
 * NOVARE NEXUS — One-click Script Properties initialization.
 *
 * Add this COMPLETE file to the EXISTING NEXUS Apps Script project.
 * Run setupNoscaCentralDiscoveryProperties() in the Apps Script editor,
 * signed in as novare.nexus@novare.com.ph.
 *
 * Safety guarantees:
 * - Creates only missing central-discovery properties; preserves existing values.
 * - Does NOT remove or modify unrelated script properties (including GEMINI_API_KEY).
 * - Never prints the generated signing secret.
 * - Starts with BOTH central-discovery feature switches OFF.
 * - Does NOT automatically authorize any Shared Drives or account-wide discovery.
 * - Safe to rerun; will not rotate an existing valid signing secret.
 *
 * Two settings intentionally cannot be guessed:
 *   NOSCA_CENTRAL_ALLOWED_DRIVE_IDS    (approved Shared Drive IDs)
 *   NOSCA_CENTRAL_OWNER_DEPLOYMENT_URL (URL after new deployment exists)
 */
function setupNoscaCentralDiscoveryProperties() {
  const owner = 'novare.nexus@novare.com.ph';
  const effective = String(Session.getEffectiveUser().getEmail() || '')
    .trim().toLowerCase();
  if (effective !== owner) {
    throw new Error('SETUP_OWNER_ONLY: Sign in as ' + owner + ' and run again.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const store = PropertiesService.getScriptProperties();
    const current = store.getProperties();

    // Fail before making any changes if an existing identity or secret conflicts.
    const existingOwner = String(current.NOSCA_CENTRAL_OWNER_EMAIL || '')
      .trim().toLowerCase();
    if (existingOwner && existingOwner !== owner) {
      throw new Error('OWNER_EMAIL_CONFLICT: Review the existing owner property first.');
    }
    const existingSecret = String(current.NOSCA_CENTRAL_SHARED_SECRET || '');
    if (existingSecret && existingSecret.length < 48) {
      throw new Error('SHARED_SECRET_TOO_SHORT: Review existing secret before proceeding.');
    }
    const existingMode = String(current.NOSCA_CENTRAL_SCOPE_MODE || '')
      .trim().toLowerCase();
    if (existingMode && existingMode !== 'approved_drives') {
      throw new Error('SCOPE_ALREADY_CONFIGURED: Existing mode is not approved_drives; review manually.');
    }

    const defaults = {
      NOSCA_CENTRAL_OWNER_EMAIL: owner,
      NOSCA_CENTRAL_ALLOWED_DOMAINS: 'novare.com.ph',
      NOSCA_CENTRAL_SCOPE_MODE: 'approved_drives',
      NOSCA_CENTRAL_ALLOWED_DRIVE_IDS: '',
      NOSCA_CENTRAL_OWNER_ENDPOINT_ENABLED: 'false',
      NOSCA_CENTRAL_DISCOVERY_ENABLED: 'false',
      NOSCA_CENTRAL_OWNER_DEPLOYMENT_URL: ''
    };

    const updates = {};
    const created = [];
    const preserved = [];
    Object.keys(defaults).forEach(function (key) {
      // Do not overwrite values, including intentional blank placeholders.
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        updates[key] = defaults[key];
        created.push(key);
      } else {
        preserved.push(key);
      }
    });

    let secretGenerated = false;
    if (!existingSecret) {
      // Two UUIDs provide an unpredictable signing key. Never log its value.
      updates.NOSCA_CENTRAL_SHARED_SECRET =
        Utilities.getUuid() + Utilities.getUuid();
      secretGenerated = true;
    } else {
      preserved.push('NOSCA_CENTRAL_SHARED_SECRET');
    }

    if (Object.keys(updates).length > 0) {
      // FALSE is crucial: leave every unrelated property intact.
      store.setProperties(updates, false);
    }

    const after = store.getProperties();
    const approvedDriveCount = String(after.NOSCA_CENTRAL_ALLOWED_DRIVE_IDS || '')
      .split(',').map(function (s) { return s.trim(); }).filter(Boolean).length;
    const ownerUrlSet = !!String(after.NOSCA_CENTRAL_OWNER_DEPLOYMENT_URL || '').trim();
    const enabled = after.NOSCA_CENTRAL_OWNER_ENDPOINT_ENABLED === 'true' ||
      after.NOSCA_CENTRAL_DISCOVERY_ENABLED === 'true';
    const pending = [];
    if (!approvedDriveCount) pending.push('Select and approve Shared Drive IDs when Nexus has access.');
    if (!ownerUrlSet) pending.push('Create the owner deployment, then save its /exec URL.');
    if (enabled) pending.push('One or more existing feature flags are enabled; verify before proceeding.');

    const report = {
      ok: true,
      project: 'Existing NOVARE NEXUS Apps Script project',
      executedAsOwner: true,
      defaultsCreated: created,
      existingValuesPreserved: preserved,
      secretPresent: String(after.NOSCA_CENTRAL_SHARED_SECRET || '').length >= 48,
      secretGenerated: secretGenerated,
      scopeMode: after.NOSCA_CENTRAL_SCOPE_MODE,
      approvedDriveCount: approvedDriveCount,
      ownerDeploymentUrlSet: ownerUrlSet,
      ownerEndpointEnabled: after.NOSCA_CENTRAL_OWNER_ENDPOINT_ENABLED === 'true',
      centralDiscoveryEnabled: after.NOSCA_CENTRAL_DISCOVERY_ENABLED === 'true',
      pendingManualInputs: pending,
      otherScriptPropertiesPreserved: true
    };
    console.log('[NOSCA CENTRAL][SETUP] ' + JSON.stringify(report, null, 2));
    return report;
  } finally {
    lock.releaseLock();
  }
}
