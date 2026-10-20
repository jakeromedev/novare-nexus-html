/**
 * Folder ancestry, conservative retirement, and partial NOSCA_Index writes.
 * Never call writeNoscaIndexRows_() from this worker; full-sheet rewrites are
 * reserved for the legacy manual full scanner.
 */
function noscaDeltaFolderCache_() {
  const rows=noscaDeltaRead_(noscaDeltaFolderSheet_(),NOSCA_DELTA.folderHeaders.length);
  const map={};
  rows.forEach(function(r,i){if(r[0])map[String(r[0])]={row:i+2,parent:String(r[1]||''),
    drive:String(r[2]||''),name:String(r[3]||''),path:String(r[4]||''),
    inScope:r[5] === true || String(r[5]).toLowerCase()==='true'};});
  return map;
}
function noscaDeltaPutFolder_(item, info, cache) {
  const id=String(item.id||''); if(!id) return;
  const row=[id,String(item.parents&&item.parents[0]||''),String(item.driveId||''),
    String(item.name||''),String(info.path||''),Boolean(info.inScope),new Date(),
    info.inScope ? 'Active' : 'Skipped'];
  const sheet=noscaDeltaFolderSheet_();
  const record=cache[id];
  if(record) sheet.getRange(record.row,1,1,row.length).setValues([row]);
  else noscaDeltaAppend_(sheet,[row],row.length);
  cache[id]={row:record?record.row:sheet.getLastRow(),parent:row[1],drive:row[2],
    name:row[3],path:row[4],inScope:Boolean(info.inScope)};
}
/**
 * Current ancestry, bounded to 40 levels. Cached ancestry still checks the
 * directly changed item's parent; folder change events explicitly refresh it.
 */
function noscaDeltaMembership_(item,root,folderCache) {
  const id=String(item.id||'');
  const rootPath='/'+sanitizeNoscaPathPart_(root.name||'Knowledge');
  if(id===root.id) return {inScope:true,path:rootPath};
  const parents=item.parents||[];
  let parentId=String(parents[0]||'');
  if (!parentId) return {inScope:false,path:''};
  const names=[];const seen={};
  for(let depth=0;depth<40 && parentId;depth++) {
    if(parentId===root.id) return {inScope:true,path:rootPath + (names.length?'/'+names.reverse().join('/'):'')};
    if(seen[parentId]) throw new Error('Cycle in Drive folder hierarchy.');
    seen[parentId]=true;
    let folder=folderCache[parentId];
    if(folder && folder.inScope && folder.path) {
      return {inScope:true,path:folder.path+(names.length?'/'+names.reverse().join('/'):'')};
    }
    if(folder && folder.inScope===false && folder.parent==='') return {inScope:false,path:''};
    let resource;
    try {resource=getNoscaDriveItem_(parentId);} catch(e) {
      throw new Error('Cannot verify Drive ancestry at '+parentId+': '+noscaDeltaMessage_(e));
    }
    if(!resource || resource.trashed || resource.mimeType!==NOSCA_CONFIG.mimeTypes.folder) {
      return {inScope:false,path:''};
    }
    names.push(sanitizeNoscaPathPart_(resource.name||'Untitled Folder'));
    parentId=String(resource.parents&&resource.parents[0]||'');
  }
  if(parentId) throw new Error('Drive parent chain exceeds safety limit.');
  return {inScope:false,path:''};
}
function noscaDeltaNormalized_(item,root,cache) {
  if(!item || !item.id || item.trashed) return {inScope:false};
  const isFolder=item.mimeType===NOSCA_CONFIG.mimeTypes.folder;
  const parent=noscaDeltaMembership_(item,root,cache);
  if(!parent.inScope) return {inScope:false,isFolder:isFolder};
  const path=isFolder && item.id!==root.id
    ? parent.path+'/'+sanitizeNoscaPathPart_(item.name||'Untitled Folder')
    :parent.path;
  return {inScope:true,isFolder:isFolder,path:path,
    normalized:isFolder?normalizeNoscaDriveFolder_(item,path):normalizeNoscaDriveFile_(item,path)};
}
function noscaDeltaRowMap_() {
  const sheet=getNoscaIndexSheet_();
  assertNoscaIndexHeaders_(sheet);
  const headers=sheet.getRange(1,1,1,NOSCA_CONFIG.indexHeaders.length).getDisplayValues()[0];
  const idCol=headers.indexOf('Item ID')+1;
  const manualCol=headers.indexOf('Manual Keywords')+1;
  if(!idCol || !manualCol) throw new Error('NOSCA_Index missing ID or Manual Keywords column.');
  const values=sheet.getLastRow()>1 ? sheet.getRange(2,idCol,sheet.getLastRow()-1,1).getValues():[];
  const rows={};
  values.forEach(function(v,i){const id=String(v[0]||'').trim();if(!id)return;
    if(rows[id]) throw new Error('Duplicate NOSCA_Index Item ID '+id+'; resolve before enabling delta writes.');
    rows[id]=i+2;
  });
  return {sheet:sheet,rows:rows,headers:headers,idCol:idCol,manualCol:manualCol};
}
function noscaDeltaParseRecord_(row) {
  const generated=String(row[10]||'');const manual=String(row[11]||'');
  return {fileId:String(row[0]||''), itemType:String(row[1]||''),fileName:String(row[2]||''),
    folderPath:String(row[3]||''), hierarchyContext:String(row[4]||''),
    documentType:String(row[5]||''),fileFormat:String(row[6]||''),mimeType:String(row[7]||''),
    modifiedAt:normalizeNoscaComparableDate_(row[8]),driveUrl:String(row[9]||''),
    generatedKeywords:generated,manualKeywords:manual,
    keywords:[generated,manual].filter(Boolean).join(', '),
    indexedAt:normalizeNoscaDateValue_(row[12]),status:String(row[13]||''),notes:String(row[14]||'')};
}
/** Update the two automatic-field spans; NEVER write Manual Keywords. */
function noscaDeltaWriteAutomatic_(lookup, rowNumber, record, isNew) {
  const sheet=lookup.sheet;
  const row=noscaIndexRecordToRow_(record);
  const names=NOSCA_CONFIG.indexHeaders;
  const desired={};
  names.forEach(function(n,i){desired[n]=row[i];});
  // Append a blank record first, but preserve a concurrently edited manual
  // keyword cell on updates by never including its column in any write.
  if(isNew && sheet.getMaxRows()<rowNumber) {
    sheet.insertRowsAfter(sheet.getMaxRows(),rowNumber-sheet.getMaxRows());
  }
  let begin=0,chunk=[];
  function flush() {
    if(chunk.length) sheet.getRange(rowNumber,begin,1,chunk.length).setValues([chunk]);
    chunk=[];
  }
  lookup.headers.forEach(function(header,i){
    const col=i+1;
    if(header==='Manual Keywords') {flush();return;}
    if(!chunk.length) begin=col;
    if(begin+chunk.length!==col){flush();begin=col;}
    chunk.push(desired[header]);
  });
  flush();
  lookup.rows[record.fileId]=rowNumber;
}
function noscaDeltaUpsert_(item,lookup) {
  const rowNumber=lookup.rows[item.id]||lookup.sheet.getLastRow()+1;
  const previous=lookup.rows[item.id]
    ? noscaDeltaParseRecord_(lookup.sheet.getRange(rowNumber,1,1,lookup.headers.length).getValues()[0])
    :null;
  const record=buildNoscaIndexRecord_(item,previous,new Date());
  // Re-read Manual Keywords during the commit lock, not in the resolver.
  record.manualKeywords=previous?previous.manualKeywords:'';
  const changed=!previous || hasNoscaIndexMetadataChanged_(previous,record) ||
    previous.status===NOSCA_CONFIG.statuses.skipped;
  if(changed) noscaDeltaWriteAutomatic_(lookup,rowNumber,record,!previous);
  return !previous?'inserted':changed?'updated':'unchanged';
}
function noscaDeltaRetire_(id,lookup,reason) {
  const rowNumber=lookup.rows[id]; if(!rowNumber)return 'not_indexed';
  const headers=lookup.headers;
  const statusCol=headers.indexOf('Status')+1;
  const notesCol=headers.indexOf('Error / Notes')+1;
  const oldStatus=String(lookup.sheet.getRange(rowNumber,statusCol).getValue()||'');
  if(oldStatus===NOSCA_CONFIG.statuses.skipped)return 'unchanged';
  lookup.sheet.getRange(rowNumber,statusCol).setValue(NOSCA_CONFIG.statuses.skipped);
  lookup.sheet.getRange(rowNumber,notesCol).setValue(reason||'Not currently visible under the configured knowledge root; verify permissions and ancestry.');
  return 'retired';
}
/** Build folder-map baseline from existing index folders in bounded batches. */
function bootstrapNoscaFolderMapBatch() {
  if(noscaDeltaFlag_('ENABLED') || noscaDeltaFlag_('WRITES_ENABLED')) {
    throw new Error('Pause delta writes before bootstrapping folder map.');
  }
  const root=noscaDeltaRoot_();
  const index=getNoscaIndexSheet_();assertNoscaIndexHeaders_(index);
  const idValues=index.getLastRow()>1?index.getRange(2,1,index.getLastRow()-1,4).getValues():[];
  const folders=idValues.filter(function(r){return r[1]===NOSCA_CONFIG.itemTypes.folder && r[0];});
  const current=Number(noscaDeltaGet_('FOLDER_BOOT_CURSOR')||0);
  const cache=noscaDeltaFolderCache_();
  let processed=0,issues=0;
  // Root membership always exists even if full scan doesn't emit a root row.
  const rootWrite=noscaDeltaWithLock_(function(){
    noscaDeltaPutFolder_(root,{inScope:true,path:'/'+sanitizeNoscaPathPart_(root.name)},cache);
    SpreadsheetApp.flush();
  },1000);
  if(rootWrite && rootWrite.busy)throw new Error('Folder-map writer lock busy; retry bootstrap.');
  for(let i=current;i<Math.min(folders.length,current+20);i++) {
    try {
      const item=getNoscaDriveItem_(String(folders[i][0]));
      const membership=noscaDeltaNormalized_(item,root,cache);
      const folderWrite=noscaDeltaWithLock_(function(){
        noscaDeltaPutFolder_(item,{inScope:membership.inScope,path:membership.path||''},cache);
        SpreadsheetApp.flush();
      },1000);
      if(folderWrite && folderWrite.busy)throw new Error('Folder-map writer lock busy.');
    } catch(e){issues++;console.warn('[NOSCA Delta] Folder map baseline: '+noscaDeltaMessage_(e));}
    processed++;
  }
  const next=current+processed;
  noscaDeltaSet_('FOLDER_BOOT_CURSOR',next);
  const priorErrors=Number(noscaDeltaGet_('FOLDER_BOOT_ERRORS')||0);
  noscaDeltaSet_('FOLDER_BOOT_ERRORS',priorErrors+issues);
  if(next>=folders.length && priorErrors+issues===0)noscaDeltaSet_('FOLDER_MAP_READY','true');
  return {processed:processed,cursor:next,folderCount:folders.length,issues:issues,
    totalIssues:priorErrors+issues,scannedAll:next>=folders.length,
    complete:next>=folders.length && priorErrors+issues===0};
}

/**
 * Manual Apps Script runner: execute the next folder-map bootstrap batch and
 * print its progress in Executions > Logs. Does not reset the cursor.
 */
function runNoscaFolderBootstrapWithLog() {
  const result = bootstrapNoscaFolderMapBatch();
  console.log('[NOSCA Folder Bootstrap] ' + JSON.stringify(result, null, 2));
  return result;
}


/**
 * Fast, hands-free baseline bootstrap.
 * Google Apps Script has a hard execution time limit, so a single indefinite
 * while-loop is unsafe. This runner processes several 20-folder batches in one
 * execution, then uses ONE one-shot continuation to resume automatically.
 * It never turns on the incremental index writer or changes NOSCA_Index.
 *
 * Run startNoscaFolderMapContinuousBootstrap() ONCE from the editor.
 */
// Configuration is returned by a function instead of declared as a top-level
// const. Apps Script shares one global scope across all .gs files, and a stale
// copy of the earlier bootstrap module can otherwise fail compilation with
// "Identifier NOSCA_FOLDER_BOOT_LOOP has already been declared".
// Keep only one authoritative Nosca_Delta_Index.gs in the clasp project.
function noscaFolderBootLoopSettings_() {
  return {
    handler:'continueNoscaFolderMapContinuousBootstrap',
    maxWorkMs:210000,           // 3.5 minutes of work; headroom for slow Sheets calls
    maxBatches:8,               // 8 x 20 folders per invocation, maximum
    resumeAfterMs:240000,       // one-shot continuation, at least 4 minutes later
    busyRetryAfterMs:120000,    // if a previous execution is still running
    leaseMs:420000              // recover from a crashed worker after 7 minutes
  };
}
function noscaFolderBootAutoTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === noscaFolderBootLoopSettings_().handler;
  });
}
function noscaFolderBootRemoveAutoTriggers_() {
  const all=noscaFolderBootAutoTriggers_();
  all.forEach(function(trigger){ScriptApp.deleteTrigger(trigger);});
  return all.length;
}
function noscaFolderBootSchedule_(delayMs) {
  if (!noscaDeltaFlag_('FOLDER_AUTO_ENABLED')) return false;
  if (!noscaFolderBootAutoTriggers_().length) {
    ScriptApp.newTrigger(noscaFolderBootLoopSettings_().handler)
      .timeBased().after(delayMs).create();
  }
  return true;
}
/** Start from the existing FOLDER_BOOT_CURSOR; never resets completed work. */
function startNoscaFolderMapContinuousBootstrap() {
  if(noscaDeltaFlag_('ENABLED') || noscaDeltaFlag_('WRITES_ENABLED')) {
    throw new Error('Disable incremental sync/writes before bootstrapping the folder map.');
  }
  if(typeof getNoscaIndexRefreshStatus === 'function' && getNoscaIndexRefreshStatus().inProgress) {
    throw new Error('Legacy full-index scan is still in progress. Finish that scan before running the folder-map loop.');
  }
  // Remove only the OLD periodic folder-map helper, not unrelated triggers.
  const prior=stopNoscaFolderMapBootstrapTrigger();
  noscaDeltaSet_('FOLDER_AUTO_ENABLED','true');
  noscaDeltaSet_('FOLDER_AUTO_LAST_ERROR','');
  console.log('[NOSCA Folder Bootstrap] Continuous mode started; removed ' +
    prior.removed + ' old 10-minute helper trigger(s).');
  return continueNoscaFolderMapContinuousBootstrap();
}
/**
 * Trigger handler AND manual resume entry point.
 * All Drive/Sheets tasks remain bounded, with a durable cursor per batch.
 */
function continueNoscaFolderMapContinuousBootstrap() {
  if(!noscaDeltaFlag_('FOLDER_AUTO_ENABLED')) {
    return {ok:false,stopped:true,message:'Continuous bootstrap is not enabled.'};
  }
  if(noscaDeltaFlag_('ENABLED') || noscaDeltaFlag_('WRITES_ENABLED')) {
    stopNoscaFolderMapContinuousBootstrap();
    throw new Error('Folder bootstrap stopped because incremental indexing was enabled.');
  }
  if(typeof getNoscaIndexRefreshStatus === 'function' && getNoscaIndexRefreshStatus().inProgress) {
    noscaFolderBootRemoveAutoTriggers_();
    noscaFolderBootSchedule_(noscaFolderBootLoopSettings_().busyRetryAfterMs);
    console.log('[NOSCA Folder Bootstrap] Waiting for legacy full-index scan to finish.');
    return {ok:true,waitingForFullScan:true,continuationScheduled:true};
  }

  // Use only a short script lock to claim a lease; the per-folder writes
  // acquire their own short locks inside bootstrapNoscaFolderMapBatch().
  const claim=noscaDeltaWithLock_(function(){
    const until=Number(noscaDeltaGet_('FOLDER_AUTO_LEASE_UNTIL')||0);
    if(until>Date.now()) return {busy:true};
    noscaDeltaSet_('FOLDER_AUTO_LEASE_UNTIL',String(Date.now()+noscaFolderBootLoopSettings_().leaseMs));
    return {claimed:true};
  },1000);
  if(!claim || claim.busy) {
    // Existing execution owns the lease. Keep one future wake-up so a stalled
    // run cannot quietly strand the bootstrap.
    noscaFolderBootRemoveAutoTriggers_();
    noscaFolderBootSchedule_(noscaFolderBootLoopSettings_().busyRetryAfterMs);
    console.log('[NOSCA Folder Bootstrap] Another execution is active; retry queued.');
    return {ok:true,busy:true,continuationScheduled:true};
  }

  let batches=0,processed=0,last=null;
  const begin=Date.now();
  try {
    // Replace the fired one-shot with exactly one watchdog/continuation before
    // performing any expensive Drive or Sheets work.
    noscaFolderBootRemoveAutoTriggers_();
    noscaFolderBootSchedule_(noscaFolderBootLoopSettings_().resumeAfterMs);

    while(noscaDeltaFlag_('FOLDER_AUTO_ENABLED') &&
        batches<noscaFolderBootLoopSettings_().maxBatches &&
        Date.now()-begin<noscaFolderBootLoopSettings_().maxWorkMs) {
      last=bootstrapNoscaFolderMapBatch();
      batches++;
      processed+=last.processed;
      console.log('[NOSCA Folder Bootstrap] '+JSON.stringify(last));
      if(last.scannedAll || last.cursor>=last.folderCount) break;
      if(last.processed<=0) throw new Error('Folder bootstrap made no progress; stopped to avoid an endless loop.');
    }

    const ready=noscaDeltaFlag_('FOLDER_MAP_READY');
    const scannedAll=Boolean(last && (last.scannedAll || last.cursor>=last.folderCount));
    if(scannedAll && !ready) {
      const errors=Number(noscaDeltaGet_('FOLDER_BOOT_ERRORS')||0);
      throw new Error('All folders visited, but folder map is NOT ready ('+errors+
        ' accumulated issue(s)). Review warnings and use restartNoscaFolderMapBootstrap() after resolving them.');
    }
    if(ready) {
      stopNoscaFolderMapContinuousBootstrap();
      const result={ok:true,complete:true,processedThisRun:processed,batches:batches,
        cursor:last?last.cursor:Number(noscaDeltaGet_('FOLDER_BOOT_CURSOR')||0),
        folderCount:last?last.folderCount:null,folderMapReady:true};
      console.log('[NOSCA Folder Bootstrap] COMPLETE '+JSON.stringify(result));
      return result;
    }
    const result={ok:true,complete:false,processedThisRun:processed,batches:batches,
      cursor:last?last.cursor:Number(noscaDeltaGet_('FOLDER_BOOT_CURSOR')||0),
      folderCount:last?last.folderCount:null,continuationScheduled:true};
    console.log('[NOSCA Folder Bootstrap] PAUSED FOR AUTO-RESUME '+JSON.stringify(result));
    return result;
  } catch(error) {
    const message=noscaDeltaMessage_(error);
    noscaDeltaSet_('FOLDER_AUTO_LAST_ERROR',message);
    stopNoscaFolderMapContinuousBootstrap();
    console.error('[NOSCA Folder Bootstrap] STOPPED: '+message);
    throw error;
  } finally {
    // Keep this cleanup narrow: do not clear another execution's valid lease.
    const release=noscaDeltaWithLock_(function(){
      noscaDeltaSet_('FOLDER_AUTO_LEASE_UNTIL','0');
      return true;
    },1000);
    if(release && release.busy)console.warn('[NOSCA Folder Bootstrap] Lease cleanup busy; it will expire automatically.');
  }
}
/** Stops future automatic invocations. An invocation already running will stop after its current batch. */
function stopNoscaFolderMapContinuousBootstrap() {
  noscaDeltaSet_('FOLDER_AUTO_ENABLED','false');
  const removed=noscaFolderBootRemoveAutoTriggers_();
  return {ok:true,removed:removed,cursor:Number(noscaDeltaGet_('FOLDER_BOOT_CURSOR')||0),
    message:'Automatic folder-map continuation stopped. Existing folder records and cursor preserved.'};
}
/** Read-only progress for operators. */
function getNoscaFolderMapContinuousBootstrapStatus() {
  return {enabled:noscaDeltaFlag_('FOLDER_AUTO_ENABLED'),
    cursor:Number(noscaDeltaGet_('FOLDER_BOOT_CURSOR')||0),
    totalIssues:Number(noscaDeltaGet_('FOLDER_BOOT_ERRORS')||0),
    folderMapReady:noscaDeltaFlag_('FOLDER_MAP_READY'),
    continuationTriggers:noscaFolderBootAutoTriggers_().length,
    lastError:noscaDeltaGet_('FOLDER_AUTO_LAST_ERROR')};
}

/** Logs the current continuous folder-map bootstrap status without changing progress. */
function logNoscaFolderMapBootstrapStatus() {
  const status = getNoscaFolderMapContinuousBootstrapStatus();
  console.log('[NOSCA Folder Map Bootstrap Status]\n' + JSON.stringify(status, null, 2));
  return status;
}
