/**
 * Ask NOSCA incremental-sync infrastructure (opt-in; no production trigger is
 * installed by merely adding these files). This module deliberately does not
 * change NOSCA_CONFIG, NOSCA_Index, Ask NOSCA, or Global Search readers.
 */
const NOSCA_DELTA = Object.freeze({
  prefix: 'NOSCA_DELTA_',
  queue: 'NOSCA_SyncQueue',
  folders: 'NOSCA_FolderMap',
  logs: 'NOSCA_SyncLogs',
  queueHeaders: Object.freeze([
    'Queue ID','Source Scope','Page Token','Item ID','Event Kind','Event Time',
    'Enqueued At','State','Attempts','Next Attempt At','Last Error','Payload',
    'Lease Until'
  ]),
  folderHeaders: Object.freeze([
    'Folder ID','Parent ID','Drive ID','Folder Name','Canonical Path',
    'In Scope','Last Verified At','Status'
  ]),
  logHeaders: Object.freeze([
    'Run ID','Started At','Ended At','Duration (ms)','Source Scope',
    'Changes Fetched','Queued','Processed','Inserted','Updated','Skipped',
    'Folder Tasks','Retries','Pending Queue','Token Advanced','Result','Error'
  ]),
  maxChangesPage: 100,
  maxPagesPerRun: 1,
  maxTasksPerRun: 20,
  maxWorkMs: 60000,
  retryLimit: 5,
  processingLeaseMs: 180000,
  pollLeaseMs: 120000,
  maxLogRows: 800,
  handler: 'runNoscaIncrementalSync'
});

function noscaDeltaProps_() { return PropertiesService.getScriptProperties(); }
function noscaDeltaGet_(key) { return noscaDeltaProps_().getProperty(NOSCA_DELTA.prefix + key) || ''; }
function noscaDeltaSet_(key, value) { noscaDeltaProps_().setProperty(NOSCA_DELTA.prefix + key, String(value)); }
function noscaDeltaFlag_(key) { return noscaDeltaGet_(key) === 'true'; }
function noscaDeltaTime_() { return new Date().toISOString(); }
function noscaDeltaMessage_(error) { return String(error && error.message || error || 'Unknown error').slice(0, 420); }
function noscaDeltaHash_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value));
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function noscaDeltaWithLock_(fn, wait) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(wait === undefined ? 0 : wait)) return {busy:true};
  try { return fn(); } finally { lock.releaseLock(); }
}
function noscaDeltaBook_() { return SpreadsheetApp.openById(NOSCA_CONFIG.dataSpreadsheetId); }
/**
 * Open or initialize a sync-owned sheet. A previous Spreadsheet service timeout
 * can occur *after* insertSheet but *before* the header write. An existing,
 * genuinely empty sheet is safe to finish initializing on the next run.
 * Never reset headers or contents of a non-empty/mismatched sheet.
 */
function noscaDeltaTab_(name, headers, create, existingBook) {
  const book = existingBook || noscaDeltaBook_();
  let sheet = book.getSheetByName(name);
  if (!sheet && create) sheet = book.insertSheet(name);
  if (!sheet) throw new Error('Missing auxiliary sheet ' + name + '. Run initializeNoscaDeltaSync().');

  let actual = sheet.getRange(1,1,1,headers.length).getDisplayValues()[0];
  const emptyHeader = actual.every(function (value) { return !String(value || '').trim(); });
  // A partially created sheet has zero data rows; initialize it without
  // asking the operator to delete and recreate tabs after every timeout.
  if (create && emptyHeader && sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    actual = sheet.getRange(1,1,1,headers.length).getDisplayValues()[0];
  }
  headers.forEach(function (header, i) {
    if (header !== String(actual[i] || '').trim()) {
      throw new Error('Schema mismatch in ' + name + ', column ' + (i+1) +
        ': expected "' + header + '", found "' + String(actual[i] || '').trim() +
        '". Existing non-empty sheets are never overwritten.');
    }
  });
  return sheet;
}
function noscaDeltaQueueSheet_() { return noscaDeltaTab_(NOSCA_DELTA.queue, NOSCA_DELTA.queueHeaders, false); }
function noscaDeltaFolderSheet_() { return noscaDeltaTab_(NOSCA_DELTA.folders, NOSCA_DELTA.folderHeaders, false); }
function noscaDeltaLogSheet_() { return noscaDeltaTab_(NOSCA_DELTA.logs, NOSCA_DELTA.logHeaders, false); }
function noscaDeltaRead_(sheet, columns) {
  const n = Math.max(sheet.getLastRow() - 1, 0);
  return n ? sheet.getRange(2,1,n,columns).getValues() : [];
}
function noscaDeltaAppend_(sheet, rows, width) {
  if (!rows.length) return;
  const start = sheet.getLastRow() + 1;
  if (sheet.getMaxRows() < start + rows.length - 1) {
    sheet.insertRowsAfter(sheet.getMaxRows(), start + rows.length - 1 - sheet.getMaxRows());
  }
  sheet.getRange(start,1,rows.length,width).setValues(rows);
}
function noscaDeltaLog_(stats) {
  try {
    const sheet = noscaDeltaLogSheet_();
    const names = ['runId','started','ended','duration','scope','fetched','queued',
      'processed','inserted','updated','skipped','folderTasks','retries','pending',
      'advanced','result','error'];
    noscaDeltaAppend_(sheet, [names.map(function (key) { return stats[key] || ''; })], names.length);
    // Keep a bounded log; delete oldest log rows only, never index rows.
    const extra = sheet.getLastRow() - 1 - NOSCA_DELTA.maxLogRows;
    if (extra > 0) sheet.deleteRows(2, extra);
  } catch (error) { console.warn('[NOSCA Delta] Logging failed: ' + noscaDeltaMessage_(error)); }
}
function noscaDeltaRoot_() {
  assertNoscaAdvancedDriveService_();
  const root = Drive.Files.get(NOSCA_CONFIG.knowledgeRootId, {
    supportsAllDrives: true,
    fields: 'id,name,mimeType,parents,driveId,trashed,webViewLink'
  });
  if (root.trashed || root.mimeType !== NOSCA_CONFIG.mimeTypes.folder) {
    throw new Error('Configured knowledge root must be an accessible, non-trashed Drive folder.');
  }
  return root;
}
function noscaDeltaScope_(root) { return root.driveId ? 'drive_' + root.driveId : 'user'; }
function noscaDeltaScopeArgs_(root) {
  const options = {supportsAllDrives:true};
  if (root.driveId) options.driveId = root.driveId;
  return options;
}
function noscaDeltaTokenKey_(root) { return 'TOKEN_' + noscaDeltaHash_(noscaDeltaScope_(root)).slice(0,20); }
function noscaDeltaValidateScope_(root) {
  const recorded = noscaDeltaGet_('SCOPE');
  if (recorded && recorded !== noscaDeltaScope_(root)) throw new Error('Root Drive scope changed; pause and rebootstrap before syncing.');
  if (noscaDeltaGet_('ROOT_ID') && noscaDeltaGet_('ROOT_ID') !== root.id) {
    throw new Error('Knowledge root ID changed; pause and rebootstrap before syncing.');
  }
}
/** Read-only diagnostics. Does not create checkpoint tokens or modify data. */
function diagnoseNoscaChangeSource() {
  const root = noscaDeltaRoot_();
  const sheet = getNoscaIndexSheet_();
  assertNoscaIndexHeaders_(sheet);
  return {
    rootName:root.name, rootId:root.id,
    sharedDriveId:root.driveId || '', scope:noscaDeltaScope_(root),
    indexRows:Math.max(0,sheet.getLastRow()-1),
    headers:sheet.getRange(1,1,1,NOSCA_CONFIG.indexHeaders.length).getValues()[0],
    legacyTriggers:ScriptApp.getProjectTriggers().filter(function(t){
      return ['runNoscaIndexScheduledRefresh','continueNoscaIndexScheduledRefresh','refreshNoscaIndex'].indexOf(t.getHandlerFunction()) !== -1;
    }).map(function(t){return t.getHandlerFunction();})
  };
}
/** Only reports the availability of a new token; does not overwrite production state. */
function previewNoscaStartToken() {
  const root = noscaDeltaRoot_();
  const token = Drive.Changes.getStartPageToken(noscaDeltaScopeArgs_(root));
  return {scope:noscaDeltaScope_(root), tokenAvailable:!!token.startPageToken};
}
/**
 * Initializes at most ONE auxiliary sheet mutation per execution.
 * A Sheets timeout can happen after insertSheet() but before headers are saved.
 * Retrying completes an unfinished tab without clearing data.
 */
function noscaDeltaInitializeAuxStep_(book) {
  const specs = [
    {name:NOSCA_DELTA.queue, headers:NOSCA_DELTA.queueHeaders},
    {name:NOSCA_DELTA.folders, headers:NOSCA_DELTA.folderHeaders},
    {name:NOSCA_DELTA.logs, headers:NOSCA_DELTA.logHeaders}
  ];
  for (let n = 0; n < specs.length; n++) {
    const spec = specs[n];
    let sheet = book.getSheetByName(spec.name);
    if (!sheet) {
      // Creating this sheet is this invocation's ONLY sheet mutation.
      book.insertSheet(spec.name);
      return {complete:false,step:'CREATED_SHEET',sheet:spec.name,
        message:'Created ' + spec.name + '. Run initializeNoscaDeltaSync() again.'};
    }
    const actual = sheet.getRange(1,1,1,spec.headers.length).getDisplayValues()[0];
    const empty = actual.every(function(v){return !String(v || '').trim();});
    if (empty && sheet.getLastRow() === 0) {
      // Header writing runs separately from sheet creation. In case of timeout,
      // inspect the actual header on retry rather than blindly overwriting.
      sheet.getRange(1,1,1,spec.headers.length).setValues([spec.headers]);
      return {complete:false,step:'WROTE_HEADERS',sheet:spec.name,
        message:'Wrote ' + spec.name + ' headers. Run initializeNoscaDeltaSync() again.'};
    }
    spec.headers.forEach(function(expected,i){
      if (expected !== String(actual[i] || '').trim()) {
        throw new Error('Schema mismatch in ' + spec.name + ', column ' + (i+1) +
          ': expected "' + expected + '", found "' + String(actual[i] || '').trim() +
          '". Existing sheet data was not modified.');
      }
    });
  }
  return {complete:true};
}
/**
 * Retryable manual setup. Run repeatedly until response.complete === true.
 * The token is captured ONLY after all three auxiliary sheets are verified;
 * capture must precede controlled baseline reconciliation.
 * This never enables incremental writes or installs triggers.
 */
function initializeNoscaDeltaSync() {
  return noscaDeltaWithLock_(function () {
    const book=noscaDeltaBook_();
    const phase=noscaDeltaInitializeAuxStep_(book);
    if (!phase.complete) {
      const progress={ok:true,complete:false,step:phase.step,
        sheet:phase.sheet,message:phase.message,
        writesEnabled:noscaDeltaFlag_('WRITES_ENABLED')};
      console.log('[NOSCA Delta init] ' + JSON.stringify(progress));
      return progress;
    }

    const root=noscaDeltaRoot_();
    assertNoscaIndexHeaders_(getNoscaIndexSheet_());
    noscaDeltaValidateScope_(root);
    const props=noscaDeltaProps_();
    const tokenKey=noscaDeltaTokenKey_(root);
    if (!noscaDeltaGet_(tokenKey)) {
      const result=Drive.Changes.getStartPageToken(noscaDeltaScopeArgs_(root));
      if (!result.startPageToken) throw new Error('Drive did not return a start-page token.');
      noscaDeltaSet_(tokenKey,result.startPageToken);
      noscaDeltaSet_('CAPTURED_AT',noscaDeltaTime_());
    }
    noscaDeltaSet_('SCOPE',noscaDeltaScope_(root));
    noscaDeltaSet_('ROOT_ID',root.id);
    if (!props.getProperty(NOSCA_DELTA.prefix+'ENABLED')) noscaDeltaSet_('ENABLED','false');
    if (!props.getProperty(NOSCA_DELTA.prefix+'WRITES_ENABLED')) noscaDeltaSet_('WRITES_ENABLED','false');
    if (!props.getProperty(NOSCA_DELTA.prefix+'BOOTSTRAP_COMPLETE')) noscaDeltaSet_('BOOTSTRAP_COMPLETE','false');
    if (!props.getProperty(NOSCA_DELTA.prefix+'PAUSED')) noscaDeltaSet_('PAUSED','false');
    const result={ok:true,complete:true,scope:noscaDeltaScope_(root),
      capturedAt:noscaDeltaGet_('CAPTURED_AT'),
      enabled:noscaDeltaFlag_('ENABLED'),writesEnabled:noscaDeltaFlag_('WRITES_ENABLED'),
      message:'All three tabs verified; token captured. Complete the controlled baseline before writes.'};
    console.log('[NOSCA Delta init] ' + JSON.stringify(result));
    return result;
  },1000);
}
