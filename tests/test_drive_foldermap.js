const fs = require('fs'), vm = require('vm'), assert = require('assert');
const rootDir = __dirname + '/../';
const rootId='0AM-X20Wb8s7YUk9PVA', mimeFolder='application/vnd.google-apps.folder', mimeDoc='application/vnd.google-apps.document';
let strategy='live', folderMapReady='true', stalenessMs=0, lookups=0, listCalls=0, sheetLoads=0;
const nodes={
  [rootId]:{id:rootId,name:'Drive',mimeType:mimeFolder,driveId:'SHARED',parents:[]},
  a:{id:'a',name:'CashHub',mimeType:mimeFolder,driveId:'SHARED',parents:[rootId]},
  b:{id:'b',name:'2026',mimeType:mimeFolder,driveId:'SHARED',parents:['a']},
  bad:{id:'bad',name:'External',mimeType:mimeFolder,driveId:'SHARED',parents:['outsideRoot']},
  outsideRoot:{id:'outsideRoot',name:'Unrelated',mimeType:mimeFolder,driveId:'SHARED',parents:[]},
  f1:{id:'f1',name:'CashHub proposal',mimeType:mimeDoc,driveId:'SHARED',parents:['a']},
  f2:{id:'f2',name:'CashHub renewal proposal',mimeType:mimeDoc,driveId:'SHARED',parents:['b']},
  f3:{id:'f3',name:'CashHub unrelated proposal',mimeType:mimeDoc,driveId:'SHARED',parents:['bad']},
};
const cols=['Folder ID','Parent ID','Drive ID','Folder Name','Canonical Path','In Scope','Last Verified At','Status'];
function mapRows() {const now = new Date(Date.now() - stalenessMs);return [
  [rootId,'','SHARED','Drive','/Drive',true,now,'Active'],
  ['a',rootId,'SHARED','CashHub','/Drive/CashHub',true,now,'Active'],
  ['b','a','SHARED','2026','/Drive/CashHub/2026',true,now,'Active'],
  ['bad','outsideRoot','SHARED','External','/Outside/External',false,now,'Skipped'],
];}
const log=[];
const env={
  console:{log(...v){log.push(v.join(' '));},warn(){},error(){}},
  PropertiesService:{getScriptProperties(){return {getProperty(k){return k==='NOSCA_SEARCH_BACKEND'?'drive':k==='NOSCA_DRIVE_SCOPE_STRATEGY'?strategy:k==='NOSCA_DELTA_FOLDER_MAP_READY'?folderMapReady:null;}}}},
  SpreadsheetApp:{openById(){sheetLoads++;return {getSheetByName(n){assert.strictEqual(n,'NOSCA_FolderMap');return {
    getLastRow(){return 5;},
    getRange(r,c,numR,numC){if(r===1) return {getDisplayValues(){return [cols];}};
      if(r===2) return {getValues(){return mapRows();}};
      throw Error('unexpected range');}
  };}};}},
  Drive:{Files:{get(id){lookups++;if(!nodes[id])throw Error('missing '+id);return nodes[id];},list(p){listCalls++;return{files:[nodes.f1,nodes.f2,nodes.f3],nextPageToken:''};}}},
};
vm.createContext(env);
for(const source of ['backend/core/Nosca_Config.js','backend/knowledge/Nosca_Drive.js','backend/knowledge/Nosca_Sheet.js','backend/knowledge/Nosca_Index.js','backend/knowledge/Nosca_Content.js','backend/knowledge/Nosca_Retrieval.js','backend/knowledge/Nosca_Drive_Search.js']){
  vm.runInContext(fs.readFileSync(rootDir+source,'utf8'),env,{filename:source});
}
function query(){return vm.runInContext('searchNoscaDriveRecords_("CashHub proposal")',env);}
strategy='live'; lookups=0;
const baseline=query();
assert.strictEqual(baseline.records.length,2);const baselineGets=lookups;
assert(baselineGets>=4, 'test must establish live ancestry lookups');
strategy='foldermap'; lookups=0;
const accelerated=query();
assert.strictEqual(accelerated.records.length,2);
assert(accelerated.records.every(x=>x.folderPath.startsWith('/Drive/')));
assert(accelerated.metrics.folderMapHits>=2);
assert.strictEqual(accelerated.metrics.folderMapRows,4);
assert(accelerated.metrics.folderMapUsableFolders>=2);
assert(lookups<baselineGets,'foldermap must reduce get calls');
const acceleratedGets=lookups;
folderMapReady='false'; lookups=0;
const notReady=query();
assert.strictEqual(notReady.records.length,2);
assert(notReady.metrics.folderMapWarning.includes('not marked ready'));
assert(lookups>=baselineGets,'not-ready folder map must use full live validation');
folderMapReady='true'; stalenessMs=8*24*60*60*1000; lookups=0;
const stale=query();
assert.strictEqual(stale.records.length,2);
assert.strictEqual(stale.metrics.folderMapUsableFolders,0);
assert(lookups>=baselineGets, 'stale folder map must use live validation');
console.log('PASS: foldermap vs live records, root scope, reductions, not-ready fallback, expiry fallback. Live gets:',baselineGets,'foldermap gets:',acceleratedGets, 'loaded:',sheetLoads);
