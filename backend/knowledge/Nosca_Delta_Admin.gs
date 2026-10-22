/**
 * Ask NOSCA delta synchronization — read-only operator diagnostics.
 *
 * This module deliberately contains NO folder-map bootstrap/index functions.
 * Those functions belong exclusively in Nosca_Delta_Index.gs. Having copies
 * in both files caused duplicate Apps Script global function declarations.
 *
 * This module does not enable polling, process the queue, modify the index,
 * advance change tokens, or install/remove triggers.
 */

/** Summarize queue states without loading file contents or changing queue rows. */
function noscaDeltaQueueStatus_() {
  const totals = {Pending:0, Processing:0, Retry:0, Done:0, DeadLetter:0};
  const sheet = noscaDeltaQueueSheet_();
  const count = Math.max(0, sheet.getLastRow() - 1);
  let oldestMs = Infinity;
  if (count > 0) {
    // Queue columns G/H = Enqueued At / State. Only the needed fields are read.
    const values = sheet.getRange(2, 7, count, 2).getValues();
    values.forEach(function (row) {
      const state = String(row[1] || '');
      if (Object.prototype.hasOwnProperty.call(totals, state)) totals[state]++;
      if (state !== 'Pending' && state !== 'Retry' && state !== 'Processing') return;
      const time = row[0] instanceof Date ? row[0].getTime() : new Date(row[0]).getTime();
      if (Number.isFinite(time) && time < oldestMs) oldestMs = time;
    });
  }
  return {states:totals, oldestPending:oldestMs === Infinity ? '' : new Date(oldestMs).toISOString()};
}

/**
 * Read-only status based on Script Properties, queue summaries, and triggers.
 * Does not fetch/change Drive tokens and does not write any sheet data.
 */
function getNoscaDeltaSyncStatus() {
  const scope = noscaDeltaGet_('SCOPE');
  const tokenKey = scope ? 'TOKEN_' + noscaDeltaHash_(scope).slice(0, 20) : '';
  const queue = noscaDeltaQueueStatus_();
  const handler = NOSCA_DELTA.handler;
  const triggers = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === handler;
  });
  return {
    enabled: noscaDeltaFlag_('ENABLED'),
    paused: noscaDeltaFlag_('PAUSED'),
    writesEnabled: noscaDeltaFlag_('WRITES_ENABLED'),
    baselineConfirmed: noscaDeltaFlag_('BOOTSTRAP_COMPLETE'),
    folderMapReady: noscaDeltaFlag_('FOLDER_MAP_READY'),
    sourceScope: scope,
    tokenPresent: !!(tokenKey && noscaDeltaGet_(tokenKey)),
    initialTokenCapturedAt: noscaDeltaGet_('CAPTURED_AT'),
    lastPoll: noscaDeltaGet_('LAST_POLL'),
    lastApply: noscaDeltaGet_('LAST_APPLY'),
    lastError: noscaDeltaGet_('LAST_ERROR'),
    queueStates: queue.states,
    oldestPending: queue.oldestPending,
    triggerCount: triggers.length,
    legacyScheduler: typeof getNoscaIndexScheduleStatus === 'function'
      ? getNoscaIndexScheduleStatus() : null
  };
}

/** Print the read-only delta status to Apps Script's execution log. */
function logNoscaDeltaSyncStatus() {
  const status = getNoscaDeltaSyncStatus();
  console.log('[NOSCA Delta Sync Status]\n' + JSON.stringify(status, null, 2));
  return status;
}

/**
 * Read one page of shared-drive/user-level Drive changes without advancing
 * the saved checkpoint or enqueuing anything. The feed can include items
 * OUTSIDE the selected NEXUS knowledge-root folder; this is a connectivity
 * diagnostic, not proof that an item is within the monitored folder tree.
 */
function previewNoscaDeltaChanges() {
  const root = noscaDeltaRoot_();
  noscaDeltaValidateScope_(root);
  const token = noscaDeltaGet_(noscaDeltaTokenKey_(root));
  if (!token) throw new Error('No saved Drive change token. Initialize delta sync first.');
  // Apps Script Advanced Drive Service requires pageToken as the FIRST
  // positional argument: Drive.Changes.list(pageToken, optionalArgs).
  const params = Object.assign({
    pageSize: 25,
    includeRemoved: true,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'nextPageToken,newStartPageToken,changes(fileId,removed,time,changeType,file(id,name,mimeType,parents,driveId,trashed,modifiedTime))'
  }, root.driveId ? {driveId: root.driveId} : {});
  const result = Drive.Changes.list(token, params);
  const events = (result.changes || []).map(function (change) {
    return {
      itemId: String(change.fileId || (change.file && change.file.id) || ''),
      name: change.file && change.file.name || '',
      kind: change.changeType || '',
      removed: change.removed === true,
      time: change.time || ''
    };
  });
  return {
    ok: true,
    sourceScope: noscaDeltaScope_(root),
    fetched: events.length,
    events: events,
    morePages: !!result.nextPageToken,
    checkpointUnchanged: true,
    note: 'Read-only preview; events can be outside the monitored NEXUS folder.'
  };
}

/** Print one read-only Changes API preview page to execution logs. */
function logNoscaDeltaChangesPreview() {
  const result = previewNoscaDeltaChanges();
  console.log('[NOSCA Changes API Preview]\n' + JSON.stringify(result, null, 2));
  return result;
}
