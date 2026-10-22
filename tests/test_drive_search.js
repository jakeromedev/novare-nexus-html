const fs=require('fs'), vm=require('vm'), assert=require('assert');
const base=__dirname+'/../';
let mode='drive';
let listCalls=0, getCalls=0, readIndexCalls=0;
const capturedLogs=[];
const D='SHARED',ROOT='0AM-X20Wb8s7YUk9PVA',A='CASHHUB_FOLDER',NESTED='2026_FOLDER',OTHER='OUTSIDE',G_DOC='application/vnd.google-apps.document',FOLDER='application/vnd.google-apps.folder';
const nodes={
 [ROOT]:{id:ROOT,name:'Knowledge',mimeType:FOLDER,driveId:D,parents:[]},
 [A]:{id:A,name:'CashHub',mimeType:FOLDER,driveId:D,parents:[ROOT]},
 [NESTED]:{id:NESTED,name:'2026 Renewal',mimeType:FOLDER,driveId:D,parents:[A]},
 [OTHER]:{id:OTHER,name:'Other Project',mimeType:FOLDER,driveId:D,parents:['OTHER_ROOT']},
 OTHER_ROOT:{id:'OTHER_ROOT',name:'Other Root',mimeType:FOLDER,driveId:D,parents:[]},
 f1:{id:'f1',name:'CashHub Renewal Proposal',mimeType:G_DOC,driveId:D,parents:[A],webViewLink:'https://example.com/f1'},
 f2:{id:'f2',name:'CashHub Unauthorized',mimeType:G_DOC,driveId:D,parents:[OTHER]},
 f3:{id:'f3',name:'Project Ideas',mimeType:G_DOC,driveId:D,parents:[A]},
 f4:{id:'f4',name:'Renewal Integration Specs',mimeType:G_DOC,driveId:D,parents:[NESTED]},
};
const env={
 console:{log(...values){capturedLogs.push(values.join(' '));},warn(){},error(){}},
 PropertiesService:{getScriptProperties(){return{getProperty(key){return key==='NOSCA_SEARCH_BACKEND'?mode:null;}}}},
 Drive:{Files:{get(id){getCalls++;if(!nodes[id])throw Error('missing');return nodes[id];},list(params){listCalls++;assert(params.q.includes('fullText contains'));assert.strictEqual(params.driveId,D);return{files:[nodes.f1,nodes.f2,nodes.f3,nodes.f4,nodes[A]],nextPageToken:''};}}},
};
vm.createContext(env);
const sources=['backend/core/Nosca_Config.js','backend/knowledge/Nosca_Drive.js','backend/knowledge/Nosca_Sheet.js','backend/knowledge/Nosca_Index.js','backend/knowledge/Nosca_Content.js','backend/knowledge/Nosca_Retrieval.js','backend/knowledge/Nosca_Drive_Search.js'];
for (const source of sources) vm.runInContext(fs.readFileSync(base+source,'utf8'),env,{filename:source});
// Every record must be under the exact configured knowledge root.
vm.runInContext('loadNoscaExistingIndex_ = function() { throw new Error("Index must not be read in Drive mode"); };',env);
vm.runInContext('extractNoscaFileContent_ = function(candidate) { return {text:"CashHub renewal proposal describes account integration and technical services for CashHub.",charCount:85,truncated:false,warnings:[]}; };',env);
function evaluate(expr) {return vm.runInContext(expr,env);}
assert.strictEqual(evaluate('useNoscaNativeDriveSearch_()'),true);
const found=evaluate('searchNoscaDriveRecords_("CashHub Proposal")');
assert.strictEqual(found.records.length,4,'3 in-scope docs plus folder');
assert(found.records.every(r=>r.fileId!=='f2'),'must fail-closed on out-of-scope Drive files');
assert(found.records.find(r=>r.fileId==='f1').folderPath.includes('CashHub'));
assert(found.records.find(r=>r.fileId==='f4').folderPath.includes('CashHub/2026 Renewal'),'nested ancestry must be retained');
const lookup=evaluate('findNoscaIndexedDocuments_("find CashHub proposal")');
assert.strictEqual(lookup.backend,'drive');
assert(lookup.results.find(r=>r.fileId==='f1'));
assert(!lookup.results.find(r=>r.fileId==='f2'));
const knowledge=evaluate('retrieveNoscaContext_("What are CashHub renewal services?")');
assert.strictEqual(knowledge.backend,'drive');
assert(knowledge.contextChunks.length>0);
assert(!knowledge.candidates.find(r=>r.fileId==='f2'));
assert.strictEqual(readIndexCalls,0);
const report=evaluate('logNoscaNativeDriveSearch()');
assert.strictEqual(report.ok,true);
assert.strictEqual(report.backend,'drive');
assert(Number.isFinite(report.timings.listElapsedMs));
assert(Number.isFinite(report.timings.folderLookups));
assert(capturedLogs.some(line=>line.includes('[NOSCA DRIVE SEARCH PREVIEW]') && line.includes('scopedMatches')),
  'diagnostic must write a readable results object to Apps Script execution logs');
mode='index';
assert.strictEqual(evaluate('useNoscaNativeDriveSearch_()'),false);
mode='invalid';
assert.throws(()=>evaluate('useNoscaNativeDriveSearch_()'),/NOSCA_SEARCH_BACKEND/);
console.log('PASS: Drive search routing, project root scope, document lookup, grounded retrieval and rollback configuration; Drive API calls:',listCalls,'folder lookups:',getCalls);
