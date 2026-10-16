/**
 * Novare Nexus — Phase 1 Community API
 * Requires the upgraded Prompt_Library.gs in this package.
 *
 * No Gemini requests and no per-copy event timestamps.
 * IMPORTANT: Run setupNexusPromptCommunitySheets() as a current admin after
 * backing up 11_GenAI Prompts. This does not overwrite B:J.
 * Community writes are intentionally off until multi-account identity
 * testing has succeeded on the PUBLISHED Nexus web app.
 */
var NEXUS_PROMPT_COMMUNITY_CONFIG = Object.freeze({
  enabledKey: 'NEXUS_PROMPT_COMMUNITY_WRITES_ENABLED',
  votesSheet: 'NEXUS_Prompt_Votes',
  commentsSheet: 'NEXUS_Prompt_Comments',
  copiesSheet: 'NEXUS_Prompt_Copy_Counts',
  votesHeaders: ['Prompt ID','Voter Email'],
  commentsHeaders: ['Comment ID','Prompt ID','Author Email','Author Name','Comment','Status','Created At','Last Updated'],
  copiesHeaders: ['Prompt ID','User Email','Copy Count'],
  domain: 'novare.com.ph',
  maxComment: 2000
});

function isNexusPromptCommunityEnabled_() {
  return PropertiesService.getScriptProperties().getProperty(
    NEXUS_PROMPT_COMMUNITY_CONFIG.enabledKey
  ) === 'true';
}

/** Fail closed if the web app cannot prove which employee is visiting. */
function getNexusPromptCommunityIdentity_() {
  var actor = getAIPromptLibraryCurrentUser_() || {};
  var claimedEmail = String(actor.email || '').trim().toLowerCase();
  var activeEmail = '';
  try { activeEmail = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (error) { activeEmail = ''; }
  var verified = Boolean(
    claimedEmail && activeEmail && claimedEmail === activeEmail &&
    claimedEmail.slice(-1 - NEXUS_PROMPT_COMMUNITY_CONFIG.domain.length) ===
      '@' + NEXUS_PROMPT_COMMUNITY_CONFIG.domain
  );
  return {
    verified: verified,
    email: verified ? activeEmail : '',
    name: verified ? String(actor.name || activeEmail).trim() : '',
    isAdmin: verified && actor.isAdmin === true,
    identityStatus: verified ? 'Verified' : 'Unverified'
  };
}

function assertNexusPromptCommunityActor_() {
  if (!isNexusPromptCommunityEnabled_()) {
    throw new Error(
      'Community posting and engagement are not enabled yet. ' +
      'An administrator must verify user identity from multiple employee accounts first.'
    );
  }
  var identity = getNexusPromptCommunityIdentity_();
  if (!identity.verified) {
    throw new Error(
      'Your signed-in Google Workspace identity could not be verified. ' +
      'Community changes are disabled for safety. Contact the Nexus administrator.'
    );
  }
  return identity;
}

/** Execute manually, review the returned email from EACH TEST ACCOUNT. */
function getNexusPromptCommunityIdentityStatus() {
  var identity = getNexusPromptCommunityIdentity_();
  var result = {
    verified: identity.verified,
    email: identity.email,
    isAdmin: identity.isAdmin,
    writesEnabled: isNexusPromptCommunityEnabled_()
  };
  console.log('[NEXUS Prompt Hub] Identity check:', result);
  return result;
}

/**
 * Enable writes manually using Apps Script Project Settings > Script properties:
 * NEXUS_PROMPT_COMMUNITY_WRITES_ENABLED = true
 * Only after testing identities from at least two distinct employee accounts.
 * Do not expose a browser-callable endpoint that enables privileged writes.
 */
function getNexusPromptCommunitySchemaStatus_() {
  var sheet = getAIPromptLibrarySheet_();
  var data = {ok:false, communityColumns:false, sheets:{}};
  try {
    validateNexusPromptCommunitySchema_(sheet);
    data.communityColumns = true;
    ['votes','comments','copies'].forEach(function (name) {
      getNexusPromptCommunitySheet_(name);
      data.sheets[name] = true;
    });
    data.ok = true;
  } catch(error) {
    data.error = String(error && error.message || error);
  }
  return data;
}

function validateNexusPromptCommunitySchema_(sheet) {
  var expected = AI_PROMPT_LIBRARY_CONFIG.communityHeaders;
  var actual = sheet.getRange(2, 11, 1, 5).getDisplayValues()[0];
  for (var i=0; i<expected.length; i++) {
    if (String(actual[i] || '').trim() !== expected[i]) {
      throw new Error(
        'The community schema is not installed (column ' +
        ['K','L','M','N','O'][i] + '). ' +
        'Back up your sheet, then run setupNexusPromptCommunitySheets().' 
      );
    }
  }
}

function getNexusPromptCommunitySheet_(name) {
  var key = name + 'Sheet';
  var tabName = NEXUS_PROMPT_COMMUNITY_CONFIG[key];
  var headers = NEXUS_PROMPT_COMMUNITY_CONFIG[name+'Headers'];
  var spreadsheet = SpreadsheetApp.openById(AI_PROMPT_LIBRARY_CONFIG.spreadsheetId);
  var sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) throw new Error('Community sheet not found: ' + tabName);
  var actual = sheet.getRange(1,1,1,headers.length).getDisplayValues()[0];
  if (headers.some(function(header,i){return header !== String(actual[i]||'').trim();})) {
    throw new Error('Invalid headers in ' + tabName);
  }
  return sheet;
}

/** Additive migration; cannot run if K:O contain any data. Idempotent. */
function setupNexusPromptCommunitySheets() {
  var actor = getAIPromptLibraryCurrentUser_();
  var identity = getNexusPromptCommunityIdentity_();
  if (!actor || actor.isAdmin !== true || !identity.verified || !identity.isAdmin) {
    throw new Error('Verified Nexus administrator required for migration.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getAIPromptLibrarySheet_();
    validateAIPromptLibraryHeaders_(sheet);
    var headers = AI_PROMPT_LIBRARY_CONFIG.communityHeaders.slice();
    var lastRow = Math.max(sheet.getLastRow(), 2);
    var range = sheet.getRange(2,11,lastRow-1,5);
    var values = range.getValues();
    var existingHeaders = values[0] || [];
    var alreadyInstalled = headers.every(function(v,i) {
      return String(existingHeaders[i] || '').trim() === v;
    });
    if (!alreadyInstalled) {
      var anythingWritten = values.some(function(row) {
        return row.some(function(value){return String(value == null ? '' : value).trim() !== '';});
      });
      if (anythingWritten) {
        throw new Error('K:O contains existing data. No changes made. Review sheet before migrating.');
      }
      sheet.getRange(2,11,1,5).setValues([headers]);
      if (lastRow >= 3) {
        var ids = sheet.getRange(3,2,lastRow-2,1).getValues();
        var metadata = ids.map(function(row){ return String(row[0] || '').trim() ? ['', '',0,0,0] : ['', '', '', '', '']; });
        sheet.getRange(3,11,metadata.length,5).setValues(metadata);
      }
    }
    var book = SpreadsheetApp.openById(AI_PROMPT_LIBRARY_CONFIG.spreadsheetId);
    ['votes','comments','copies'].forEach(function(name){
      var tabName=NEXUS_PROMPT_COMMUNITY_CONFIG[name+'Sheet'];
      var wanted=NEXUS_PROMPT_COMMUNITY_CONFIG[name+'Headers'];
      var tab=book.getSheetByName(tabName);
      if (!tab) {
        tab=book.insertSheet(tabName);
        tab.getRange(1,1,1,wanted.length).setValues([wanted]);
        tab.setFrozenRows(1);
      } else {
        var first=tab.getRange(1,1,1,wanted.length).getDisplayValues()[0];
        if (wanted.some(function(v,i){return String(first[i]||'').trim()!==v;})) {
          throw new Error('Existing tab ' + tabName + ' has incompatible headers.');
        }
      }
    });
    SpreadsheetApp.flush();
    return {ok:true, alreadyInstalled:alreadyInstalled,
      message:'Community schema installed. Writes stay disabled until multi-account verification.'};
  } finally { lock.releaseLock(); }
}

/** Publish/unpublish without changing prompt content, ownership or counters. */
function setNexusPromptPublication(promptId, publish) {
  var actor = assertNexusPromptCommunityActor_();
  var id = String(promptId || '').trim();
  if (typeof publish !== 'boolean') throw new Error('Publication state must be boolean.');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var item = getNexusPromptById_(id);
    var mine = item.prompt.createdByEmail && item.prompt.createdByEmail === actor.email;
    if (!actor.isAdmin && !mine) throw new Error('Only the author can change publication.');
    if (!actor.isAdmin && ['Inactive','Retired'].indexOf(item.prompt.status) !== -1) {
      throw new Error('This prompt is locked by an administrator.');
    }
    if (publish && !(item.prompt.promptName && item.prompt.category &&
        item.prompt.promptType && item.prompt.useCase && item.prompt.prompt)) {
      throw new Error('The prompt must have all required fields before publishing.');
    }
    var newStatus = publish ? 'Active' : 'Draft';
    item.sheet.getRange(item.prompt.sheetRow,8).setValue(newStatus); // H Status
    item.sheet.getRange(item.prompt.sheetRow,10).setValue(new Date()); // J Last Updated
    return {ok:true,promptId:id,status:newStatus,message:publish?'Prompt published.':'Prompt unpublished and saved as Draft.'};
  } finally {lock.releaseLock();}
}

function getNexusPromptCommunityVotedIds_(email) {
  var voted={};
  var sheet=getNexusPromptCommunitySheet_('votes');
  var n=sheet.getLastRow()-1;
  if (n<1) return voted;
  sheet.getRange(2,1,n,2).getValues().forEach(function(row){
    if (String(row[1]||'').toLowerCase()===email) voted[String(row[0]||'')]=true;
  });
  return voted;
}

function getNexusPromptById_(id) {
  var sheet=getAIPromptLibrarySheet_();
  validateAIPromptLibraryHeaders_(sheet);
  validateNexusPromptCommunitySchema_(sheet);
  var prompt=readAIPromptRows_(sheet).find(function(p){return p.id===id;});
  if(!prompt) throw new Error('Prompt does not exist.');
  return {sheet:sheet,prompt:prompt};
}

function updateNexusPromptCounter_(sheet,row,column,count) {
  sheet.getRange(row,column).setValue(Math.max(0,Math.floor(Number(count)||0)));
}

/** desired=true adds an upvote, false removes it. Idempotent for retries. */
function setNexusPromptUpvote(promptId,desired) {
  var actor=assertNexusPromptCommunityActor_();
  var id=String(promptId||'').trim();
  if(typeof desired!=='boolean') throw new Error('Desired vote state must be a boolean.');
  var lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var item=getNexusPromptById_(id);
    if(item.prompt.status!=='Active') throw new Error('Only published prompts can be upvoted.');
    var votes=getNexusPromptCommunitySheet_('votes');
    var n=votes.getLastRow()-1;
    var rows=n ? votes.getRange(2,1,n,2).getValues() : [];
    var matched=-1;
    for(var i=0;i<rows.length;i++) {
      if(String(rows[i][0]||'')===id && String(rows[i][1]||'').toLowerCase()===actor.email){matched=i; break;}
    }
    if(desired && matched<0) votes.appendRow([id,actor.email]);
    if(!desired && matched>=0) votes.deleteRow(matched+2);
    var countRows=votes.getLastRow()>1 ? votes.getRange(2,1,votes.getLastRow()-1,1).getValues() : [];
    var count=countRows.filter(function(row){return String(row[0]||'')===id;}).length;
    updateNexusPromptCounter_(item.sheet,item.prompt.sheetRow,13,count); // M
    SpreadsheetApp.flush();
    return {ok:true,promptId:id,upvoted:desired,upvoteCount:count};
  } finally{lock.releaseLock();}
}

/** Called ONLY after the browser has successfully copied the actual prompt. */
function recordNexusPromptCopy(promptId) {
  var actor=assertNexusPromptCommunityActor_();
  var id=String(promptId||'').trim();
  var lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var item=getNexusPromptById_(id);
    if(item.prompt.status!=='Active') throw new Error('Only published prompts are eligible for copy tracking.');
    if(!String(item.prompt.prompt||'').trim()) throw new Error('Prompt content is empty.');
    var copies=getNexusPromptCommunitySheet_('copies');
    var n=copies.getLastRow()-1;
    var rows=n ? copies.getRange(2,1,n,3).getValues() : [];
    var matched=-1;
    for(var i=0;i<rows.length;i++) {
      if(String(rows[i][0]||'')===id && String(rows[i][1]||'').toLowerCase()===actor.email){matched=i; break;}
    }
    var own=0;
    if(matched<0){copies.appendRow([id,actor.email,1]);own=1;}
    else{own=Math.max(0,Number(rows[matched][2])||0)+1;copies.getRange(matched+2,3).setValue(own);}
    var total=Math.max(0,Number(item.prompt.copyCount)||0)+1;
    updateNexusPromptCounter_(item.sheet,item.prompt.sheetRow,14,total); // N
    SpreadsheetApp.flush();
    return {ok:true,promptId:id,copyCount:total,myCopyCount:own};
  }finally{lock.releaseLock();}
}

function getNexusPromptComments(promptId,options) {
  var id=String(promptId||'').trim();
  var actor=getNexusPromptCommunityIdentity_();
  var item=getNexusPromptById_(id);
  var mine=actor.verified && item.prompt.createdByEmail===actor.email;
  if(item.prompt.status!=='Active' && !mine && !actor.isAdmin) throw new Error('Prompt discussion is not available.');
  var adminMode=actor.isAdmin && options && options.includeHidden===true;
  var comments=getNexusPromptCommunitySheet_('comments');
  var n=comments.getLastRow()-1;
  var rows=n ? comments.getRange(2,1,n,8).getValues() : [];
  var all=rows.map(function(row){
    return {
      id:String(row[0]||''),promptId:String(row[1]||''),
      authorName:cleanSheetText_(row[3]),
      authorEmail:actor.verified && actor.email===String(row[2]||'').toLowerCase() ? actor.email : '',
      comment:cleanSheetText_(row[4]),status:String(row[5]||''),
      createdAt:row[6] instanceof Date ? row[6].toISOString() : String(row[6]||''),
      lastUpdated:row[7] instanceof Date ? row[7].toISOString() : String(row[7]||''),
      canEdit:actor.verified && (adminMode || actor.email===String(row[2]||'').toLowerCase())
    };
  }).filter(function(c){return c.promptId===id && (c.status==='Visible' || (adminMode && c.status==='Hidden'));});
  var page=Math.max(1,Math.floor(Number(options && options.page)||1));
  var size=Math.min(30,Math.max(1,Math.floor(Number(options && options.pageSize)||15)));
  return {ok:true,promptId:id,total:all.length,page:page,pageSize:size,
    comments:all.slice((page-1)*size,page*size),canComment:item.prompt.status==='Active' && actor.verified && isNexusPromptCommunityEnabled_()};
}

function createNexusPromptComment(promptId,body) {
  var actor=assertNexusPromptCommunityActor_();
  var id=String(promptId||'').trim();
  var comment=validateAIPromptText_(body,'Comment',NEXUS_PROMPT_COMMUNITY_CONFIG.maxComment,true);
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var item=getNexusPromptById_(id);
    if(item.prompt.status!=='Active') throw new Error('Comments are available on published prompts only.');
    var sheet=getNexusPromptCommunitySheet_('comments');
    var now=new Date();
    var commentId='PCM-'+Utilities.getUuid();
    sheet.appendRow([commentId,id,actor.email,safeSheetText_(actor.name),safeSheetText_(comment),'Visible',now,now]);
    var count=countNexusPromptVisibleComments_(sheet,id);
    updateNexusPromptCounter_(item.sheet,item.prompt.sheetRow,15,count);
    SpreadsheetApp.flush();
    return {ok:true,commentId:commentId,commentCount:count};
  }finally{lock.releaseLock();}
}

function locateNexusPromptComment_(commentId) {
  var id=String(commentId||'').trim();
  if(!id) throw new Error('Comment ID is required.');
  var sheet=getNexusPromptCommunitySheet_('comments');
  var n=sheet.getLastRow()-1;
  var rows=n ? sheet.getRange(2,1,n,8).getValues() : [];
  var index=rows.findIndex(function(row){return String(row[0]||'')===id;});
  if(index<0) throw new Error('Comment not found.');
  return {sheet:sheet,row:index+2,values:rows[index]};
}

function updateNexusPromptComment(commentId,body) {
  var actor=assertNexusPromptCommunityActor_();
  var comment=validateAIPromptText_(body,'Comment',NEXUS_PROMPT_COMMUNITY_CONFIG.maxComment,true);
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var item=locateNexusPromptComment_(commentId);
    var author=String(item.values[2]||'').toLowerCase();
    if(!actor.isAdmin && author!==actor.email) throw new Error('Only the author can edit this comment.');
    if(String(item.values[5]||'')!=='Visible') throw new Error('This comment is no longer editable.');
    item.sheet.getRange(item.row,5).setValue(safeSheetText_(comment));
    item.sheet.getRange(item.row,8).setValue(new Date());
    return {ok:true,commentId:String(commentId)};
  }finally{lock.releaseLock();}
}

function deleteNexusPromptComment(commentId) {
  var actor=assertNexusPromptCommunityActor_();
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var comment=locateNexusPromptComment_(commentId);
    var author=String(comment.values[2]||'').toLowerCase();
    if(!actor.isAdmin && author!==actor.email) throw new Error('Only the author can remove this comment.');
    var promptId=String(comment.values[1]||'');
    var item=getNexusPromptById_(promptId);
    if(String(comment.values[5]||'')!=='Deleted'){
      comment.sheet.getRange(comment.row,6).setValue('Deleted');
      comment.sheet.getRange(comment.row,8).setValue(new Date());
    }
    var count=countNexusPromptVisibleComments_(comment.sheet,promptId);
    updateNexusPromptCounter_(item.sheet,item.prompt.sheetRow,15,count);
    return {ok:true,commentId:String(commentId),commentCount:count};
  }finally{lock.releaseLock();}
}

function moderateNexusPromptComment(commentId,hide) {
  var actor=assertNexusPromptCommunityActor_();
  if(!actor.isAdmin) throw new Error('Administrator required.');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    var comment=locateNexusPromptComment_(commentId);
    if(String(comment.values[5]||'')==='Deleted') throw new Error('Deleted comment cannot be restored.');
    var item=getNexusPromptById_(String(comment.values[1]||''));
    comment.sheet.getRange(comment.row,6).setValue(hide?'Hidden':'Visible');
    comment.sheet.getRange(comment.row,8).setValue(new Date());
    var count=countNexusPromptVisibleComments_(comment.sheet,item.prompt.id);
    updateNexusPromptCounter_(item.sheet,item.prompt.sheetRow,15,count);
    return {ok:true,commentCount:count};
  } finally {lock.releaseLock();}
}

function countNexusPromptVisibleComments_(sheet,id) {
  var n=sheet.getLastRow()-1;
  if(n<1)return 0;
  return sheet.getRange(2,2,n,5).getValues().filter(function(row){
    return String(row[0]||'')===id && String(row[4]||'')==='Visible';
  }).length;
}

/** Exceptionally destructive admin-only clean-up; caller holds script lock. */
function removeNexusPromptCommunityRelations_(id) {
  ['votes','comments','copies'].forEach(function(name){
    var sheet=getNexusPromptCommunitySheet_(name);
    var n=sheet.getLastRow()-1;
    if(n<1)return;
    var column=name==='comments'?2:1;
    var rows=sheet.getRange(2,column,n,1).getValues();
    for(var i=rows.length-1;i>=0;i--){if(String(rows[i][0]||'')===id)sheet.deleteRow(i+2);}
  });
}

/** Admin maintenance: restore aggregates from authoritative event/actor sheets. */
function reconcileNexusPromptCommunityCounts() {
  var actor=getAIPromptLibraryCurrentUser_();
  if(!actor || actor.isAdmin!==true)throw new Error('Nexus admin required.');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    var sheet=getAIPromptLibrarySheet_();validateNexusPromptCommunitySchema_(sheet);
    var all=readAIPromptRows_(sheet);
    var votes=getNexusPromptCommunitySheet_('votes');
    var copies=getNexusPromptCommunitySheet_('copies');
    var comments=getNexusPromptCommunitySheet_('comments');
    var vr=votes.getLastRow()>1?votes.getRange(2,1,votes.getLastRow()-1,2).getValues():[];
    var cr=copies.getLastRow()>1?copies.getRange(2,1,copies.getLastRow()-1,3).getValues():[];
    var mr=comments.getLastRow()>1?comments.getRange(2,1,comments.getLastRow()-1,8).getValues():[];
    var seen={};
    all.forEach(function(item){
      var activeVotes=vr.filter(function(r){return String(r[0])===item.id;}).map(function(r){return String(r[1]||'').toLowerCase();});
      var voteCount=Array.from(new Set(activeVotes)).length;
      var copyCount=cr.filter(function(r){return String(r[0])===item.id;}).reduce(function(total,r){return total+Math.max(0,Number(r[2])||0);},0);
      var commentCount=mr.filter(function(r){return String(r[1])===item.id && String(r[5])==='Visible';}).length;
      sheet.getRange(item.sheetRow,13,1,3).setValues([[voteCount,copyCount,commentCount]]);
    });
    SpreadsheetApp.flush();
    return {ok:true,promptCount:all.length};
  }finally{lock.releaseLock();}
}
