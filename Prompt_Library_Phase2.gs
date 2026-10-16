/**
 * NOVARE NEXUS — Prompt Hub Phase 2: quality and governance.
 * Requires Phase 1 Prompt_Library.gs and Prompt_Library_Community.gs.
 * Run setupNexusPromptPhase2Sheets() AFTER backing up the workbook.
 * No Phase 2 write is permitted until Phase 1 identity/write gate passes.
 */
var NEXUS_PROMPT_PHASE2 = Object.freeze({
  columns: ['Verified', 'Verified By', 'Verified At', 'Forked From', 'Current Revision'], // P:T
  bookmarks: {name:'NEXUS_Prompt_Bookmarks', headers:['Prompt ID','User Email']},
  reports: {name:'NEXUS_Prompt_Reports', headers:['Report ID','Target Type','Target ID','Prompt ID','Reporter Email','Reason','Details','Status','Reported At','Resolved By','Resolved At','Resolution Notes']},
  versions: {name:'NEXUS_Prompt_Versions', headers:['Version ID','Prompt ID','Revision','Event','Prompt Name','Category','Prompt Type','Use Case','Prompt','Status','Edited By','Edited At']},
  reasons: ['Inaccurate or misleading','Confidential or sensitive information','Inappropriate content','Duplicate or spam','Outdated prompt','Other']
});

function getNexusPromptPhase2Tab_(kind) {
  var conf=NEXUS_PROMPT_PHASE2[kind];
  if (!conf) throw new Error('Unknown Prompt Hub sheet: '+kind);
  var sheet=SpreadsheetApp.openById(AI_PROMPT_LIBRARY_CONFIG.spreadsheetId).getSheetByName(conf.name);
  if (!sheet) throw new Error('Phase 2 sheet missing: '+conf.name+'. Run setupNexusPromptPhase2Sheets().');
  var headers=sheet.getRange(1,1,1,conf.headers.length).getDisplayValues()[0];
  if (conf.headers.some(function(v,i){return String(headers[i]||'').trim()!==v;})) throw new Error('Invalid schema for '+conf.name);
  return sheet;
}
function validateNexusPromptPhase2_(sheet) {
  var actual=sheet.getRange(2,16,1,5).getDisplayValues()[0];
  if (NEXUS_PROMPT_PHASE2.columns.some(function(v,i){return String(actual[i]||'').trim()!==v;})) {
    throw new Error('Phase 2 columns P:T are not installed. Back up the workbook and run setupNexusPromptPhase2Sheets().');
  }
  ['bookmarks','reports','versions'].forEach(getNexusPromptPhase2Tab_);
}
function isNexusPromptPhase2Installed_() {
  try { validateNexusPromptPhase2_(getAIPromptLibrarySheet_()); return true; }
  catch(e){ return false; }
}
function getNexusPromptPhase2Identity_() { return getNexusPromptCommunityIdentity_(); }
function assertNexusPromptPhase2Admin_() {
  // Moderation must remain available even during a community-write freeze.
  // Never trust the frontend View As indicator or a user-supplied email.
  var actor=getNexusPromptCommunityIdentity_();
  if (!actor.verified || !actor.isAdmin) {
    throw new Error('Only a verified Nexus administrator can perform this action.');
  }
  return actor;
}
function getNexusPromptPhase2Rows_(sheet) {
  var n=sheet.getLastRow()-1;
  return n>0 ? sheet.getRange(2,1,n,sheet.getLastColumn()).getValues():[];
}
function phase2PromptAccessible_(prompt, actor) {
  return prompt.status==='Active' || (actor.verified && (actor.isAdmin || prompt.createdByEmail===actor.email));
}
function phase2CleanId_(v) { return String(v||'').trim(); }
function phase2CleanReason_(reason) {
  var s=String(reason||'').trim();
  if (NEXUS_PROMPT_PHASE2.reasons.indexOf(s)===-1) throw new Error('Select a valid report reason.');
  return s;
}
function phase2At_(date) {return date instanceof Date ? date.toISOString():String(date||'');}

/** Add-only schema setup; existing columns B:O are not modified. */
function setupNexusPromptPhase2Sheets() {
  var user=getNexusPromptCommunityIdentity_();
  if (!user.verified || !user.isAdmin) throw new Error('Verified administrator required to install Phase 2 schema.');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var sheet=getAIPromptLibrarySheet_();
    validateAIPromptLibraryHeaders_(sheet);validateNexusPromptCommunitySchema_(sheet);
    var wanted=NEXUS_PROMPT_PHASE2.columns;
    var last=Math.max(sheet.getLastRow(),2);
    var existing=sheet.getRange(2,16,last-1,5).getValues();
    var installed=wanted.every(function(v,i){return String(existing[0][i]||'').trim()===v;});
    if(!installed){
      var busy=existing.some(function(row){return row.some(function(value){return String(value==null?'':value).trim()!=='';});});
      if(busy) throw new Error('Phase 2 migration blocked: P:T already contains values. No changes made.');
    }
    // Validate ALL existing supporting tabs before writing to avoid partial migration.
    var book=SpreadsheetApp.openById(AI_PROMPT_LIBRARY_CONFIG.spreadsheetId);
    ['bookmarks','reports','versions'].forEach(function(kind){
      var conf=NEXUS_PROMPT_PHASE2[kind],tab=book.getSheetByName(conf.name);
      if(tab){
        var actual=tab.getRange(1,1,1,conf.headers.length).getDisplayValues()[0];
        if(conf.headers.some(function(v,i){return String(actual[i]||'').trim()!==v;})) {
          throw new Error('Migration blocked: existing '+conf.name+' tab has incompatible headers.');
        }
      }
    });
    if(!installed) {
      sheet.getRange(2,16,1,5).setValues([wanted]);
      if(last>=3) {
        var ids=sheet.getRange(3,2,last-2,1).getValues();
        var values=ids.map(function(row){return phase2CleanId_(row[0])? [false,'','','',0]:['','','','',''];});
        sheet.getRange(3,16,values.length,5).setValues(values);
      }
    }
    ['bookmarks','reports','versions'].forEach(function(kind){
      var conf=NEXUS_PROMPT_PHASE2[kind];
      if(!book.getSheetByName(conf.name)){
        var tab=book.insertSheet(conf.name);
        tab.getRange(1,1,1,conf.headers.length).setValues([conf.headers]);
        tab.setFrozenRows(1);
      }
    });
    SpreadsheetApp.flush();
    return {ok:true,alreadyInstalled:installed,features:['Bookmarks','Reports','Verified prompts','Forks','Version history'],message:'Phase 2 schema ready. Run backfillNexusPromptPhase2Versions() before enabling version restores.'};
  } finally {lock.releaseLock();}
}

/** Read Phase 2 status without changing records. */
function runNexusPromptPhase2Diagnostics() {
  var r={ok:false,writesEnabled:isNexusPromptCommunityEnabled_(),identity:getNexusPromptCommunityIdentityStatus()};
  try {
    validateNexusPromptPhase2_(getAIPromptLibrarySheet_());
    ['bookmarks','reports','versions'].forEach(function(kind){r[kind+'Rows']=Math.max(0,getNexusPromptPhase2Tab_(kind).getLastRow()-1);});
    r.prompts=readAIPromptRows_(getAIPromptLibrarySheet_()).length;
    r.ok=true;
  }catch(e){r.error=String(e&&e.message||e);}
  console.log('[NEXUS][Prompt Phase 2]',r);return r;
}

/** Snapshot registry data (not votes, copies, creator/verified metadata). Caller holds lock. */
function recordNexusPromptVersion_(item,event,editor) {
  var versionSheet=getNexusPromptPhase2Tab_('versions');
  var prompt=item.prompt || item;
  var rows=getNexusPromptPhase2Rows_(versionSheet);
  var latest=rows.reduce(function(n,r){return String(r[1]||'')===prompt.id?Math.max(n,Number(r[2])||0):n;},0);
  var revision=latest+1;
  versionSheet.appendRow([
    'PV-'+Utilities.getUuid(),prompt.id,revision,event,
    safeSheetText_(prompt.promptName),safeSheetText_(prompt.category),
    safeSheetText_(prompt.promptType),safeSheetText_(prompt.useCase),
    safeSheetText_(prompt.prompt),prompt.status,
    safeSheetText_(editor||''),new Date()
  ]);
  var sheet=item.sheet || getAIPromptLibrarySheet_();
  var row=prompt.sheetRow;
  if (row) sheet.getRange(row,20).setValue(revision);
  return revision;
}
/** Ensure original snapshot exists before first edit/status change. Caller holds lock. */
function ensureNexusPromptVersionBaseline_(item) {
  if (!isNexusPromptPhase2Installed_()) return;
  var sheet=getNexusPromptPhase2Tab_('versions');
  var rows=getNexusPromptPhase2Rows_(sheet);
  if (!rows.some(function(r){return String(r[1]||'')===item.prompt.id;})){
    recordNexusPromptVersion_(item,'Baseline',item.prompt.owner||'Legacy import');
  }
}
function appendNexusPromptVersionAfterChange_(id,event,editor) {
  if(!isNexusPromptPhase2Installed_())return;
  var item=getNexusPromptById_(id);
  recordNexusPromptVersion_(item,event,editor);
}

/** Migration backfill in batches. Does not change prompts B:S. Repeat until complete=true. */
function backfillNexusPromptPhase2Versions() {
  var actor=getNexusPromptCommunityIdentity_();
  if(!actor.verified || !actor.isAdmin) throw new Error('Verified admin required.');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var sheet=getAIPromptLibrarySheet_();validateNexusPromptPhase2_(sheet);
    var prompts=readAIPromptRows_(sheet);
    var rows=getNexusPromptPhase2Rows_(getNexusPromptPhase2Tab_('versions'));
    var existing={};rows.forEach(function(r){existing[String(r[1]||'')]=true;});
    var pending=prompts.filter(function(p){return !existing[p.id];});
    var batch=pending.slice(0,75);
    batch.forEach(function(p){recordNexusPromptVersion_({sheet:sheet,prompt:p},'Baseline',p.owner||'Legacy import');});
    SpreadsheetApp.flush();
    return {ok:true,backfilled:batch.length,remaining:pending.length-batch.length,complete:pending.length<=batch.length};
  }finally{lock.releaseLock();}
}

/** Read minimal Phase 2 state, never expose other employees' bookmarks. */
function getNexusPromptPhase2State_ (identity,prompts) {
  if(!isNexusPromptPhase2Installed_())return {installed:false,bookmarkedIds:[],reportCount:0};
  var bookmarked={};
  if(identity.verified){getNexusPromptPhase2Rows_(getNexusPromptPhase2Tab_('bookmarks')).forEach(function(r){
    if(String(r[1]||'').toLowerCase()===identity.email) bookmarked[String(r[0]||'')]=true;
  });}
  return {installed:true,bookmarkedIds:Object.keys(bookmarked),reportCount:0};
}
function setNexusPromptBookmark(promptId,desired) {
  var actor=assertNexusPromptCommunityActor_();
  if(typeof desired!=='boolean')throw new Error('Bookmark state must be a boolean.');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var item=getNexusPromptById_(phase2CleanId_(promptId));
    validateNexusPromptPhase2_(item.sheet);
    if(!phase2PromptAccessible_(item.prompt,actor))throw new Error('This prompt is not available.');
    var tab=getNexusPromptPhase2Tab_('bookmarks'),rows=getNexusPromptPhase2Rows_(tab),match=-1;
    for(var i=0;i<rows.length;i++)if(String(rows[i][0])===item.prompt.id && String(rows[i][1]).toLowerCase()===actor.email){match=i;break;}
    if(desired && match<0)tab.appendRow([item.prompt.id,actor.email]);
    if(!desired && match>=0)tab.deleteRow(match+2);
    return {ok:true,promptId:item.prompt.id,bookmarked:desired};
  }finally{lock.releaseLock();}
}

/** Report once per reporter+target while a previous report is still Open. */
function reportNexusPromptContent(targetType,targetId,reason,details) {
  var actor=assertNexusPromptCommunityActor_();
  var kind=String(targetType||'').toLowerCase();
  if(kind!=='prompt' && kind!=='comment')throw new Error('Report target must be prompt or comment.');
  var id=phase2CleanId_(targetId);
  var why=phase2CleanReason_(reason);
  var text=String(details||'').trim();
  if(text.length>1000)throw new Error('Report details must be at most 1000 characters.');
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try {
    var promptId=id;
    if(kind==='comment'){
      var comment=locateNexusPromptComment_(id);
      if(String(comment.values[5])!=='Visible')throw new Error('This comment is not reportable.');
      promptId=phase2CleanId_(comment.values[1]);
    }
    var item=getNexusPromptById_(promptId);validateNexusPromptPhase2_(item.sheet);
    if(item.prompt.status!=='Active')throw new Error('Only published content can be reported.');
    var reports=getNexusPromptPhase2Tab_('reports'),rows=getNexusPromptPhase2Rows_(reports);
    var dup=rows.some(function(r){return String(r[1])===kind && String(r[2])===id && String(r[4]).toLowerCase()===actor.email && String(r[7])==='Open';});
    if(dup)return {ok:true,alreadyReported:true,message:'Your report is already pending review.'};
    var reportId='PR-'+Utilities.getUuid();
    reports.appendRow([reportId,kind,id,promptId,actor.email,why,safeSheetText_(text),'Open',new Date(),'','','']);
    return {ok:true,reportId:reportId,message:'Report submitted for administrator review.'};
  }finally{lock.releaseLock();}
}
function getNexusPromptReports(options) {
  var admin=assertNexusPromptPhase2Admin_();
  var rows=getNexusPromptPhase2Rows_(getNexusPromptPhase2Tab_('reports'));
  var status=String(options&&options.status||'Open');
  var items=rows.map(function(r){return {
    id:String(r[0]),targetType:String(r[1]),targetId:String(r[2]),promptId:String(r[3]),
    reporterEmail:String(r[4]),reason:cleanSheetText_(r[5]),details:cleanSheetText_(r[6]),
    status:String(r[7]),reportedAt:phase2At_(r[8]),resolvedBy:String(r[9]||''),
    resolvedAt:phase2At_(r[10]),resolutionNotes:cleanSheetText_(r[11])
  };}).filter(function(item){return status==='All' || item.status===status;});
  items.sort(function(a,b){return b.reportedAt.localeCompare(a.reportedAt);});
  var page=Math.max(1,Math.floor(Number(options&&options.page)||1));
  return {ok:true,total:items.length,page:page,items:items.slice((page-1)*20,page*20)};
}
/** Resolution: Dismiss, Resolve (no action), Hide (prompt -> Retired, comment -> Hidden). */
function resolveNexusPromptReport(reportId,decision,note) {
  var actor=assertNexusPromptPhase2Admin_();
  var outcome=String(decision||'');
  if(['Dismiss','Resolve','Hide'].indexOf(outcome)<0)throw new Error('Unsupported moderation action.');
  var notes=String(note||'').trim();
  if(notes.length>500)throw new Error('Resolution notes are too long.');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var sheet=getNexusPromptPhase2Tab_('reports');
    var rows=getNexusPromptPhase2Rows_(sheet),index=rows.findIndex(function(r){return String(r[0])===phase2CleanId_(reportId);});
    if(index<0)throw new Error('Report not found.');
    var r=rows[index];
    if(String(r[7])!=='Open')throw new Error('Report has already been processed.');
    if(outcome==='Hide'){
      if(String(r[1])==='prompt'){
        var item=getNexusPromptById_(String(r[3]));
        ensureNexusPromptVersionBaseline_(item);
        item.sheet.getRange(item.prompt.sheetRow,8).setValue('Retired');
        item.sheet.getRange(item.prompt.sheetRow,10).setValue(new Date());
        appendNexusPromptVersionAfterChange_(item.prompt.id,'Moderated',actor.email);
      }else{
        var comment=locateNexusPromptComment_(String(r[2]));
        if(String(comment.values[5])!=='Deleted'){
          comment.sheet.getRange(comment.row,6).setValue('Hidden');
          comment.sheet.getRange(comment.row,8).setValue(new Date());
          var prompt=getNexusPromptById_(String(comment.values[1]));
          updateNexusPromptCounter_(prompt.sheet,prompt.prompt.sheetRow,15,countNexusPromptVisibleComments_(comment.sheet,prompt.prompt.id));
        }
      }
    }
    sheet.getRange(index+2,8,1,5).setValues([[outcome==='Dismiss'?'Dismissed':'Resolved',r[8],actor.email,new Date(),safeSheetText_(notes)]]);
    // Above range H:L stores Status/ReportedAt/ResolvedBy/ResolvedAt/Notes; ReportedAt preserved.
    SpreadsheetApp.flush();
    return {ok:true,status:outcome==='Dismiss'?'Dismissed':'Resolved',message:'Report reviewed.'};
  }finally{lock.releaseLock();}
}

function setNexusPromptVerified(promptId,verify) {
  var actor=assertNexusPromptPhase2Admin_();
  if(typeof verify!=='boolean')throw new Error('Verified flag must be boolean.');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    var item=getNexusPromptById_(phase2CleanId_(promptId));validateNexusPromptPhase2_(item.sheet);
    if(verify && item.prompt.status!=='Active')throw new Error('Only active prompts may be verified.');
    item.sheet.getRange(item.prompt.sheetRow,16,1,3).setValues([[verify,verify?actor.email:'',verify?new Date():'']]);
    return {ok:true,promptId:item.prompt.id,verified:verify};
  }finally{lock.releaseLock();}
}

/** Fork published prompt into new, personally owned Draft. Never copies votes/bookmarks. */
function forkNexusPrompt(promptId) {
  var actor=assertNexusPromptCommunityActor_();
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try {
    var parent=getNexusPromptById_(phase2CleanId_(promptId));validateNexusPromptPhase2_(parent.sheet);
    if(parent.prompt.status!=='Active')throw new Error('Only published prompts can be forked.');
    var existing=readAIPromptRows_(parent.sheet),id=createNextGenAIPromptId_(existing),now=new Date();
    var title=('Adapted: '+parent.prompt.promptName).slice(0,AI_PROMPT_LIBRARY_CONFIG.maxLengths.promptName);
    var row=[id,safeSheetText_(title),safeSheetText_(parent.prompt.category),
      safeSheetText_(parent.prompt.promptType),safeSheetText_(parent.prompt.useCase),
      safeSheetText_(parent.prompt.prompt),'Draft',safeSheetText_(getAIPromptOwnerLabel_(actor)),now,
      safeSheetText_(actor.email),now,0,0,0,false,'','',parent.prompt.id,0];
    var next=Math.max(parent.sheet.getLastRow()+1,3);
    parent.sheet.getRange(next,2,1,row.length).setValues([row]);
    appendNexusPromptVersionAfterChange_(id,'Forked',actor.email);
    SpreadsheetApp.flush();
    return {ok:true,promptId:id,forkedFrom:parent.prompt.id,message:'Draft fork created. Open My Prompts to customize and publish it.'};
  }finally{lock.releaseLock();}
}

function getNexusPromptVersionHistory(promptId) {
  var actor=getNexusPromptCommunityIdentity_();
  var item=getNexusPromptById_(phase2CleanId_(promptId));validateNexusPromptPhase2_(item.sheet);
  if(!actor.verified || !(actor.isAdmin || item.prompt.createdByEmail===actor.email)) {
    throw new Error('Full revision history is available only to the original author or an administrator.');
  }
  if(!phase2PromptAccessible_(item.prompt,actor))throw new Error('Prompt history not available.');
  var rows=getNexusPromptPhase2Rows_(getNexusPromptPhase2Tab_('versions'));
  var canRestore=actor.verified && isNexusPromptCommunityEnabled_() && (actor.isAdmin || (item.prompt.createdByEmail===actor.email && ['Active','Draft'].indexOf(item.prompt.status)>=0));
  var versions=rows.filter(function(r){return String(r[1])===item.prompt.id;}).map(function(r){return {
    revision:Number(r[2])||0,event:String(r[3]),promptName:cleanSheetText_(r[4]),category:cleanSheetText_(r[5]),
    promptType:cleanSheetText_(r[6]),useCase:cleanSheetText_(r[7]),prompt:cleanSheetText_(r[8]),
    status:String(r[9]),editedAt:phase2At_(r[11]),editedBy:cleanSheetText_(r[10])
  };}).sort(function(a,b){return b.revision-a.revision;});
  return {ok:true,promptId:item.prompt.id,currentRevision:item.prompt.currentRevision,canRestore:canRestore,versions:versions.slice(0,100)};
}

/** Restore content from an immutable snapshot, save it as another new revision. */
function restoreNexusPromptVersion(promptId,revision) {
  var actor=assertNexusPromptCommunityActor_();
  var id=phase2CleanId_(promptId),requested=Number(revision);
  if(!Number.isInteger(requested)||requested<1)throw new Error('Valid revision number required.');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var item=getNexusPromptById_(id);validateNexusPromptPhase2_(item.sheet);
    var owned=item.prompt.createdByEmail && item.prompt.createdByEmail===actor.email;
    if(!actor.isAdmin && !owned)throw new Error('Only the original author or an administrator can restore.');
    if(!actor.isAdmin && ['Active','Draft'].indexOf(item.prompt.status)===-1)throw new Error('Moderated prompt is locked.');
    var rows=getNexusPromptPhase2Rows_(getNexusPromptPhase2Tab_('versions'));
    var snapshot=rows.find(function(r){return String(r[1])===id && Number(r[2])===requested;});
    if(!snapshot)throw new Error('Revision not found.');
    // Preserve owner, creator identity, counters, origin. Do NOT restore status from snapshot.
    // Restored content is a Draft for author review. A restored prompt is no longer verified.
    var status='Draft';
    item.sheet.getRange(item.prompt.sheetRow,3,1,6).setValues([[
      safeSheetText_(snapshot[4]),safeSheetText_(snapshot[5]),safeSheetText_(snapshot[6]),
      safeSheetText_(snapshot[7]),safeSheetText_(snapshot[8]),status
    ]]);
    item.sheet.getRange(item.prompt.sheetRow,10).setValue(new Date());
    item.sheet.getRange(item.prompt.sheetRow,16,1,3).setValues([[false,'','']]);
    appendNexusPromptVersionAfterChange_(id,'Restored from v'+requested,actor.email);
    SpreadsheetApp.flush();
    return {ok:true,promptId:id,status:status,message:'Revision restored as Draft. Review before publishing.'};
  }finally{lock.releaseLock();}
}

/** Additional cleanup for admin-only permanent delete; invoked under caller lock. */
function removeNexusPromptPhase2Relations_(id) {
  if(!isNexusPromptPhase2Installed_())return;
  ['bookmarks','reports','versions'].forEach(function(kind){
    var sheet=getNexusPromptPhase2Tab_(kind),rows=getNexusPromptPhase2Rows_(sheet);
    var col=kind==='reports'?4:kind==='versions'?2:1;
    for(var i=rows.length-1;i>=0;i--){if(String(rows[i][col-1])===id)sheet.deleteRow(i+2);}
  });
}