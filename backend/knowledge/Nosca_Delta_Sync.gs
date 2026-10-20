/**
 * Durable Drive Changes API ingestion + bounded queue worker.
 * Entry point runNoscaIncrementalSync() is opt-in and safe to call manually.
 */
function noscaDeltaEventRow_(scope,token,position,change) {
  const id=String(change.fileId || (change.file&&change.file.id) || '');
  if(!id) return null;
  const kind=change.removed===true?'REMOVED':'CHANGE';
  const key=noscaDeltaHash_(scope+'|'+token+'|'+position+'|'+id+'|'+kind);
  return [key,scope,token,id,kind,String(change.time||''),new Date(),
    'Pending',0,'','',JSON.stringify({kind:kind}),''];
}
function noscaDeltaQueueKeys_(sheet) {
  const ids=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues():[];
  const known={};ids.forEach(function(r){if(r[0])known[String(r[0])]=true;});
  return known;
}
/** Called only with ScriptLock; stable IDs make at-least-once ingestion safe. */
function noscaDeltaEnqueue_(rows) {
  if(!rows.length)return 0;
  const sheet=noscaDeltaQueueSheet_();
  const known=noscaDeltaQueueKeys_(sheet);
  const added=[];
  rows.forEach(function(r){if(!r || !r[0] || known[r[0]])return;
    known[r[0]]=true;added.push(r);
  });
  noscaDeltaAppend_(sheet,added,NOSCA_DELTA.queueHeaders.length);
  return added.length;
}
function noscaDeltaChildTask_(itemId,kind,sourceId,payload) {
  const scope=noscaDeltaGet_('SCOPE');
  const key=noscaDeltaHash_('subtree|'+kind+'|'+sourceId+'|'+itemId+'|'+JSON.stringify(payload||{}));
  return [key,scope,'',itemId,kind,'',new Date(),'Pending',0,'','',JSON.stringify(payload||{}),''];
}
/**
 * One bounded Changes.list page, queued and flushed BEFORE token advancement.
 * The ingestion lease is not the global index lock, which is held only to
 * claim/commit state. A crash causes harmless re-fetch and deduplication.
 */
function pollNoscaDriveChanges_() {
  const root=noscaDeltaRoot_();noscaDeltaValidateScope_(root);
  const key=noscaDeltaTokenKey_(root),scope=noscaDeltaScope_(root);
  const lease=noscaDeltaWithLock_(function(){
    if(Number(noscaDeltaGet_('POLL_LEASE')||0)>Date.now())return {busy:true};
    const token=noscaDeltaGet_(key);
    if(!token)throw new Error('Missing saved token; run initializeNoscaDeltaSync() and validate baseline.');
    noscaDeltaSet_('POLL_LEASE',Date.now()+NOSCA_DELTA.pollLeaseMs);
    return {token:token};
  });
  if(lease.busy)return {busy:true,fetched:0,queued:0,advanced:false};
  try {
    const params=Object.assign({
      pageToken:lease.token, pageSize:NOSCA_DELTA.maxChangesPage,
      includeRemoved:true, supportsAllDrives:true, includeItemsFromAllDrives:true,
      fields:'nextPageToken,newStartPageToken,changes(fileId,removed,time,changeType,file(id,name,mimeType,parents,driveId,trashed,modifiedTime,webViewLink))'
    },root.driveId?{driveId:root.driveId}:{});
    const page=Drive.Changes.list(params);
    const changes=page.changes||[];
    const events=changes.map(function(change,i){return noscaDeltaEventRow_(scope,lease.token,i,change);}).filter(Boolean);
    const next=page.nextPageToken || page.newStartPageToken || '';
    const commit=noscaDeltaWithLock_(function(){
      // Cannot acknowledge a stale page fetched by an earlier invocation.
      if(noscaDeltaGet_(key)!==lease.token)throw new Error('Checkpoint changed during polling; retry.');
      const added=noscaDeltaEnqueue_(events);
      SpreadsheetApp.flush();
      if(next)noscaDeltaSet_(key,next);
      noscaDeltaSet_('POLL_LEASE','0');
      noscaDeltaSet_('LAST_POLL',noscaDeltaTime_());
      return {scope:scope,fetched:changes.length,queued:added,advanced:!!next,
        morePages:!!page.nextPageToken};
    },1000);
    if(commit.busy)throw new Error('Index queue lock busy when committing fetched page; token not advanced.');
    return commit;
  } catch(error) {
    noscaDeltaWithLock_(function(){noscaDeltaSet_('POLL_LEASE','0');},1000);
    throw error;
  }
}
function noscaDeltaClaimTasks_() {
  return noscaDeltaWithLock_(function(){
    const sheet=noscaDeltaQueueSheet_();
    const rows=noscaDeltaRead_(sheet,NOSCA_DELTA.queueHeaders.length);
    const now=Date.now();const selected=[];
    rows.forEach(function(r,i){
      if(selected.length>=NOSCA_DELTA.maxTasksPerRun)return;
      const state=String(r[7]||'');
      const due=!r[9] || new Date(r[9]).getTime()<=now;
      const expired=state==='Processing' && (!r[12] || new Date(r[12]).getTime()<now);
      if(!(state==='Pending' || (state==='Retry'&&due) || expired))return;
      const attempts=Number(r[8]||0)+1;
      const range=sheet.getRange(i+2,8,1,6);
      range.setValues([['Processing',attempts,'','',r[11],new Date(now+NOSCA_DELTA.processingLeaseMs)]]);
      selected.push({sheetRow:i+2,key:String(r[0]),id:String(r[3]),kind:String(r[4]),
        attempts:attempts,payload:String(r[11]||'{}')});
    });
    SpreadsheetApp.flush();
    return selected;
  },0);
}
function noscaDeltaTaskFinish_(task,meta,applyFn) {
  const committed=noscaDeltaWithLock_(function(){
    const sheet=noscaDeltaQueueSheet_();
    const current=sheet.getRange(task.sheetRow,1,1,13).getValues()[0];
    if(String(current[0])!==task.key || String(current[7])!=='Processing')
      throw new Error('Queue item changed before commit; retry later.');
    const stats=applyFn();
    // Folder tasks can yield an unfinished page; continue on a later tick.
    const done=!stats || stats.done!==false;
    if(!done){
      sheet.getRange(task.sheetRow,8,1,6).setValues([
        ['Pending',task.attempts,'','',JSON.stringify(stats.nextPayload||{}),'']]);
    } else {
      sheet.getRange(task.sheetRow,8,1,6).setValues([['Done',task.attempts,'','','','']]);
    }
    SpreadsheetApp.flush();
    return stats||{done:true};
  },250);
  if(committed.busy)throw new Error('Index writer busy. Retry later.');
  return committed;
}
function noscaDeltaTaskFailed_(task,error) {
  const message=noscaDeltaMessage_(error);
  noscaDeltaWithLock_(function(){
    const sheet=noscaDeltaQueueSheet_();
    if(String(sheet.getRange(task.sheetRow,1).getValue())!==task.key)return;
    const attempts=task.attempts;
    const exhausted=attempts>=NOSCA_DELTA.retryLimit;
    const delay=Math.min(60*60*1000,Math.pow(2,Math.min(attempts,8))*60*1000);
    const next=exhausted?'':new Date(Date.now()+delay+Math.floor(Math.random()*10000));
    sheet.getRange(task.sheetRow,8,1,6).setValues([[
      exhausted?'DeadLetter':'Retry',attempts,next,message,task.payload,'']]);
    SpreadsheetApp.flush();
  },500);
  console.error('[NOSCA Delta] '+task.kind+' failed '+task.id+': '+message);
}
/** Lists the current children of a changed folder, one page per queue run. */
function noscaDeltaFolderTask_(task,root,cache,lookup) {
  const payload=JSON.parse(task.payload||'{}');
  let item;
  try {item=getNoscaDriveItem_(task.id);} catch(e) {return {kind:'folder_unavailable',reason:noscaDeltaMessage_(e)};}
  const membership=noscaDeltaNormalized_(item,root,cache);
  if(!membership.inScope || item.trashed)return {kind:'retire_folder',path:payload.oldPath||''};
  const page=listNoscaFolderChildren_(task.id,100,payload.pageToken||'');
  const children=page.items.map(function(child,i){
    return noscaDeltaChildTask_(child.id,'CHANGE',task.key,{parentTask:task.key});
  });
  // Returning page for commit makes parent continuation and child enqueue atomic.
  return {kind:'subtree',children:children,done:!page.nextPageToken,
    nextPayload:{pageToken:page.nextPageToken||'',oldPath:payload.oldPath||''},path:membership.path};
}
/** Retires old descendant paths in bounded batches after a parent leaves scope. */
function noscaDeltaRetireTask_(task,lookup) {
  const p=JSON.parse(task.payload||'{}');
  const prefix=String(p.oldPath||'');
  if(!prefix)throw new Error('Subtree retirement requires old folder path.');
  const rows=noscaDeltaRead_(lookup.sheet,lookup.headers.length);
  const matches=[];
  rows.forEach(function(r){
    const path=String(r[3]||'');
    if((path===prefix || path.indexOf(prefix+'/')===0) && r[0])matches.push(String(r[0]));
  });
  const offset=Number(p.cursor||0);
  return {kind:'retire_subtree',ids:matches.slice(offset,offset+100),
    done:offset+100>=matches.length,
    nextPayload:{oldPath:prefix,cursor:offset+100}};
}
function noscaDeltaResolveTask_(task,root,cache,lookup) {
  if(task.kind==='SUBTREE')return noscaDeltaFolderTask_(task,root,cache,lookup);
  if(task.kind==='RETIRE_SUBTREE')return noscaDeltaRetireTask_(task,lookup);
  if(task.kind==='REMOVED')return {kind:'retire',reason:'Drive change log reports item removed from visible change set. Confirm deletion versus lost permissions.'};
  if(task.kind==='RETIRE')return {kind:'retire',reason:'Parent folder moved out of the indexed knowledge root.'};
  if(task.kind!=='CHANGE')throw new Error('Unknown queue kind '+task.kind);
  const item=getNoscaDriveItem_(task.id);
  const resolved=noscaDeltaNormalized_(item,root,cache);
  return {kind:resolved.inScope?'upsert':'retire',item:item,normalized:resolved,
    reason:'Item is trashed or no longer under the approved knowledge root.'};
}
function noscaDeltaApplyTask_(task,data,root,cache,lookup) {
  const oldFolder=cache[task.id];
  if(data.kind==='retire') {
    const result=noscaDeltaRetire_(task.id,lookup,data.reason);
    if(oldFolder && oldFolder.inScope && oldFolder.path) {
      noscaDeltaPutFolder_({id:task.id,parents:[oldFolder.parent],name:oldFolder.name,
        driveId:oldFolder.drive}, {inScope:false,path:''},cache);
      noscaDeltaEnqueue_([noscaDeltaChildTask_(task.id,'RETIRE_SUBTREE',task.key,{oldPath:oldFolder.path,cursor:0})]);
    }
    return {result:result};
  }
  if(data.kind==='upsert') {
    const result=noscaDeltaUpsert_(data.normalized.normalized,lookup);
    if(data.normalized.isFolder) {
      const newPath=data.normalized.path;
      noscaDeltaPutFolder_(data.item,data.normalized,cache);
      if(!oldFolder || oldFolder.path!==newPath || !oldFolder.inScope) {
        noscaDeltaEnqueue_([noscaDeltaChildTask_(task.id,'SUBTREE',task.key,{oldPath:oldFolder?oldFolder.path:''})]);
        if(oldFolder && oldFolder.path && !data.normalized.inScope) {
          noscaDeltaEnqueue_([noscaDeltaChildTask_(task.id,'RETIRE_SUBTREE',task.key,{oldPath:oldFolder.path,cursor:0})]);
        }
      }
    }
    return {result:result};
  }
  if(data.kind==='subtree') {
    noscaDeltaEnqueue_(data.children);
    return {result:'folder_task',done:data.done,nextPayload:data.nextPayload};
  }
  if(data.kind==='retire_subtree') {
    data.ids.forEach(function(id){noscaDeltaRetire_(id,lookup,'Folder moved outside the monitored knowledge tree.');});
    return {result:'folder_task',done:data.done,nextPayload:data.nextPayload};
  }
  if(data.kind==='retire_folder') {
    // A moved-out or inaccessible subtree is retired from the previous path.
    if(data.path)noscaDeltaEnqueue_([noscaDeltaChildTask_(task.id,'RETIRE_SUBTREE',task.key,{oldPath:data.path,cursor:0})]);
    return {result:'folder_task'};
  }
  if(data.kind==='folder_unavailable') throw new Error(data.reason);
  throw new Error('Unexpected resolved task '+data.kind);
}
function processNoscaSyncQueue_() {
  if(!noscaDeltaFlag_('WRITES_ENABLED'))return {dryRun:true,processed:0,message:'Queue is preserved; production index writes disabled.'};
  if(!noscaDeltaFlag_('BOOTSTRAP_COMPLETE'))throw new Error('Baseline verification required before index writes.');
  // This check is critical because the legacy full writer clears/sorts all rows.
  const activeLegacy=ScriptApp.getProjectTriggers().filter(function(t){
    return ['runNoscaIndexScheduledRefresh','continueNoscaIndexScheduledRefresh','refreshNoscaIndex'].indexOf(t.getHandlerFunction())!==-1;
  });
  if(activeLegacy.length)throw new Error('Legacy full-index trigger still installed; disable it before enabling delta writes.');
  if(getNoscaIndexRefreshStatus().inProgress)throw new Error('Legacy full scan has an unfinished checkpoint; resolve it before delta writes.');
  const root=noscaDeltaRoot_();
  const claimed=noscaDeltaClaimTasks_();if(claimed.busy)return {busy:true,processed:0};
  const cache=noscaDeltaFolderCache_();
  const lookup=noscaDeltaRowMap_();
  const started=Date.now();const summary={processed:0,inserted:0,updated:0,skipped:0,retries:0,folderTasks:0};
  for(const task of claimed){
    if(Date.now()-started>NOSCA_DELTA.maxWorkMs) {
      // Lease will expire and remaining tasks will be safely reclaimed.
      break;
    }
    try {
      const resolved=noscaDeltaResolveTask_(task,root,cache,lookup);
      const outcome=noscaDeltaTaskFinish_(task,resolved,function(){
        return noscaDeltaApplyTask_(task,resolved,root,cache,lookup);
      });
      summary.processed++;
      if(outcome.result==='inserted')summary.inserted++;
      if(outcome.result==='updated')summary.updated++;
      if(outcome.result==='retired')summary.skipped++;
      if(outcome.result==='folder_task')summary.folderTasks++;
    } catch(error){noscaDeltaTaskFailed_(task,error);summary.retries++;}
  }
  if(summary.processed)noscaDeltaSet_('LAST_APPLY',noscaDeltaTime_());
  return summary;
}
/** Scheduled/manual entry point. Safe no-op until explicitly enabled. */
function runNoscaIncrementalSync() {
  const started=Date.now();const stats={runId:Utilities.getUuid(),started:noscaDeltaTime_(),result:'SKIPPED'};
  if(!noscaDeltaFlag_('ENABLED')||noscaDeltaFlag_('PAUSED')) {
    return {ok:true,skipped:true,reason:'Incremental polling is disabled or paused.'};
  }
  try {
    const poll=pollNoscaDriveChanges_();
    const apply=processNoscaSyncQueue_();
    Object.assign(stats,{scope:noscaDeltaGet_('SCOPE'),fetched:poll.fetched||0,queued:poll.queued||0,
      processed:apply.processed||0,inserted:apply.inserted||0,updated:apply.updated||0,
      skipped:apply.skipped||0,retries:apply.retries||0,folderTasks:apply.folderTasks||0,
      advanced:poll.advanced?'Yes':'No',result:apply.dryRun?'DRY_RUN':'OK'});
    return {ok:true,poll:poll,worker:apply};
  } catch(error) {
    stats.result='ERROR';stats.error=noscaDeltaMessage_(error);
    noscaDeltaSet_('LAST_ERROR',stats.error);
    if (/invalid.*(page.?token|change.?token)|page.?token.*(invalid|expired)|(?:^|\s)410(?:\s|:|$)/i.test(stats.error)) {
      noscaDeltaSet_('PAUSED','true'); // Manual reconcile/rebootstrap required; never silently reset token.
    }
    console.error('[NOSCA Delta] Run failed: '+stats.error);
    return {ok:false,error:stats.error};
  } finally {
    stats.ended=noscaDeltaTime_();stats.duration=Date.now()-started;
    noscaDeltaLog_(stats);
  }
}
