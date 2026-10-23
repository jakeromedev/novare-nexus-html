/** Ask NOSCA Phase 2B verification. No Gemini or NOSCA_Index writes. */
function noscaPhase2BLog_(phase, fn) {
  const start = Date.now();
  let data;
  try { data = fn(); }
  catch (error) {
    data = {ok:false, error:String(error && error.message || error).slice(0,350)};
  }
  const report = Object.assign({version:NOSCA_PHASE2B_VERSION,
    phase:phase, recordedAt:new Date().toISOString(),
    elapsedMs:Date.now()-start},data);
  console.log('[NOSCA PHASE 2B][' + phase + ']\n' + JSON.stringify(report,null,2));
  return report;
}

/** Avoid confusing the old August draft with the expected September deck. */
function noscaPhase2BExpected_(fileName) {
  const raw = noscaV3Title_(fileName);
  const date = /(?:sep(?:tember)? 28 2026|09 28 2026|2026 09 28)/.test(raw);
  return {
    pjlDeck: /\bpjl 3 year renewal roadmap deck\b/.test(raw) && date,
    cashhubPlan: /\bcashhub 3 year roadmap proposal update plan\b/.test(raw)
  };
}

function noscaPhase2BExpectedHits_(records) {
  const found = {pjlDeck:[], cashhubPlan:[]};
  (records || []).forEach(function (record, i) {
    const match = noscaPhase2BExpected_(record.fileName);
    Object.keys(found).forEach(function (key) {
      if (match[key]) found[key].push({rank:i+1,
        fileId:record.fileId, name:record.fileName,
        mimeType:record.mimeType || '', driveId:record.driveId || ''});
    });
  });
  return {pjlDeck:found.pjlDeck, cashhubPlan:found.cashhubPlan,
    bothFound:found.pjlDeck.length > 0 && found.cashhubPlan.length > 0};
}

function noscaPhase2BRunRawQuery_(term, corpus, maxPages) {
  assertNoscaAdvancedDriveService_();
  const begin = Date.now();
  const q = "trashed = false and name contains '" +
    escapeNoscaDriveQueryValue_(term) + "'";
  const args = {q:q, corpora:corpus, supportsAllDrives:true,
    includeItemsFromAllDrives:true, pageSize:100,
    fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,driveId,modifiedTime,webViewLink)',
    orderBy:'name_natural'};
  const ids = {};
  const records = [];
  const pages = [];
  let next = '';
  let incomplete = false;
  let errors = [];
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    if (next) args.pageToken=next; else delete args.pageToken;
    let res;
    try { res=Drive.Files.list(args); }
    catch (error) {
      errors.push(String(error && error.message || error).slice(0,250));
      break;
    }
    const items = res.files || [];
    const seenBefore = records.length;
    items.forEach(function (item) {
      if (!item.id || ids[item.id]) return;
      ids[item.id]=true;
      records.push({fileId:item.id, fileName:item.name,
        mimeType:item.mimeType, modifiedTime:item.modifiedTime,
        driveId:item.driveId, firstSeenOnPage:pageNumber});
    });
    next = String(res.nextPageToken || '');
    incomplete = incomplete || res.incompleteSearch === true;
    pages.push({page:pageNumber, rawItems:items.length,
      newlySeen:records.length-seenBefore, hasNextPage:!!next,
      incompleteSearch:res.incompleteSearch === true});
    if (!next) break;
  }
  const found = noscaPhase2BExpectedHits_(records);
  function pagesFor(key) {
    return found[key].map(function (item) {
      return records.find(function (r) { return r.fileId===item.fileId; }).firstSeenOnPage;
    });
  }
  return {corpus:corpus, term:term, q:q,
    elapsedMs:Date.now()-begin, apiCalls:pages.length,
    rawCandidates:pages.reduce(function (sum,p) {return sum+p.rawItems;},0),
    uniqueCandidates:records.length, pages:pages,
    incompleteSearch:incomplete, nextPageTokenPresent:!!next,
    truncated:!!next || incomplete || errors.length>0,
    expectedFiles:{pjlDeck:{found:found.pjlDeck.length>0,
      firstSeenPages:pagesFor('pjlDeck'), candidates:found.pjlDeck},
      cashhubPlan:{found:found.cashhubPlan.length>0,
      firstSeenPages:pagesFor('cashhubPlan'), candidates:found.cashhubPlan}},
    candidateNames:records.slice(0,15).map(function(r) {return r.fileName;}),
    errors:errors};
}

/** Gate A: raw API coverage before touching rank or production behavior. */
function benchmarkNoscaPhase2BCoverage() {
  return noscaPhase2BLog_('COVERAGE',function () {
    const probes = [];
    ['roadmap','CashHub','PJL'].forEach(function (term) {
      ['user','allDrives'].forEach(function (corpus) {
        probes.push(noscaPhase2BRunRawQuery_(term,corpus,2));
      });
    });
    const files = {pjlDeck:false,cashhubPlan:false};
    probes.forEach(function (p) {
      Object.keys(files).forEach(function (key) {
        files[key]=files[key]||p.expectedFiles[key].found;
      });
    });
    return {ok:probes.every(function(p){return !p.errors.length;}),
      expectedFiles:files,
      gateAPassed:files.pjlDeck && files.cashhubPlan,
      apiCalls:probes.reduce(function(n,p){return n+p.apiCalls;},0),
      probes:probes,
      note:'A missing result in a bounded or incomplete search does not establish absence or denied access. Run under the same account as the Drive UI.'};
  });
}

/** Optionally compare exact known Drive IDs; only set properties if known. */
function benchmarkNoscaPhase2BVerifyFileIds() {
  return noscaPhase2BLog_('VERIFY_IDS',function() {
    const props=PropertiesService.getScriptProperties();
    const targets={
      pjlDeck:props.getProperty('NOSCA_PHASE2B_EXPECTED_PJL_FILE_ID'),
      cashhubPlan:props.getProperty('NOSCA_PHASE2B_EXPECTED_CASHHUB_FILE_ID')
    };
    const reports={};
    Object.keys(targets).forEach(function(key) {
      const id=String(targets[key]||'').trim();
      if (!id) {reports[key]={configured:false}; return;}
      try {
        const item=Drive.Files.get(id,{supportsAllDrives:true,
          fields:'id,name,mimeType,driveId,webViewLink,trashed'});
        reports[key]={configured:true,accessible:true,
          id:item.id,name:item.name,driveId:item.driveId||'',
          trashed:item.trashed===true};
      } catch(error) {
        reports[key]={configured:true,accessible:false,
          error:String(error && error.message || error).slice(0,180)};
      }
    });
    return {ok:true, files:reports,
      note:'Only tests explicitly supplied file IDs. It does not bypass Drive permissions.'};
  });
}

function noscaPhase2BBriefResults_(search, count) {
  return (search.results || []).slice(0,count||12).map(function(r,i) {
    return {rank:i+1, name:r.fileName, fileId:r.fileId,
      type:r.documentType, score:r.metadataScore,
      scoreBreakdown:r.lookupScoreBreakdown,
      duration:r.lookupDuration,
      matchedTerms:r.lookupMatchedTerms,
      provenance:r.lookupProvenance||[]};
  });
}

/** Gate B: run V3 directly even while Script Property is false. */
function benchmarkNoscaPhase2BDiscovery() {
  return noscaPhase2BLog_('DISCOVERY',function () {
    const question='3 year roadmap';
    const result=noscaFindDriveDocumentsV3_(question);
    return {ok:true, question:question,
      propertyEnabled:noscaPhase2BEnabled_(),
      driveSearchMs:result.searchElapsedMs,
      diagnostics:result.searchDiagnostics,
      expectedFinalHits:noscaPhase2BExpectedHits_(result.results),
      results:noscaPhase2BBriefResults_(result,12),
      comparison:{v2ApiCalls:2,v2SearchMs:3026},
      note:'V3 dry run does not switch the live lookup path or use Gemini.'};
  });
}

function noscaPhase2BFixtures_() {
  const names = [
    'PJL 3-Year Renewal Roadmap Deck (Sep 28, 2026)',
    'CashHub_3-Year_Roadmap_Proposal_Update_Plan.xlsx',
    'Copy of [DRAFT] PJL 3-Year Renewal Roadmap Deck (August 26, 2026)',
    'PJL 3 Year Roadmap Brainstorming Session - Recording',
    'INTERNAL: PJL 3 Year Roadmap Alignment - 2026/09/30 14:00 PST',
    '[DRAFT] NOVARE_JFC_Data_Fusion_Hub_Proposal_Year2_v3.0.docx',
    'PJL 5-Year Renewal Roadmap Deck (2026)',
    'PJL 2026 Roadmap Deck',
    'CashHub customer experience proposal',
    'PJL CashHub API integration EE'
  ];
  return names.map(function(name,i) {
    let type = 'Document';
    if (/\.xlsx| EE$/i.test(name)) type='Spreadsheet';
    if (/\bdeck\b/i.test(name)) type='Presentation';
    if (/proposal/i.test(name) && type==='Document') type='Proposal';
    const folder = /\bINTERNAL:/.test(name);
    return {fileId:'fixture-'+i, fileName:name,
      itemType:folder?'Folder':'File',
      documentType:type, mimeType:type==='Presentation'?
        'application/vnd.google-apps.presentation':
        'application/vnd.google-apps.document',
      modifiedTime:'2026-10-22T00:00:00Z'};
  });
}

/** Gate C: offline deterministic ranking, no Drive requests. */
function benchmarkNoscaPhase2BRanking() {
  return noscaPhase2BLog_('RANKING',function () {
    const info=noscaV3QueryInfo_('3 year roadmap');
    const fixtures=noscaPhase2BFixtures_();
    const scored=noscaV3Rank_(fixtures.concat(fixtures[0]),info);
    const hits=noscaPhase2BExpectedHits_(scored.ranked);
    const excluded=scored.rejected.map(function(r){return {
      name:r.fileName,reason:r.lookupRejectReason,
      score:r.metadataScore,breakdown:r.lookupScoreBreakdown};});
    const unrelatedPass=scored.ranked.every(function(r) {
      return !/Year2_v3\.0|5-Year|2026 Roadmap/i.test(r.fileName);
    });
    const sorted=scored.ranked.every(function(r,i) {
      return i===0 || scored.ranked[i-1].metadataScore>=r.metadataScore;
    });
    const top5=hits.bothFound && hits.pjlDeck[0].rank<=5 && hits.cashhubPlan[0].rank<=5;
    return {ok:unrelatedPass&&sorted&&top5&&scored.duplicateIds===1,
      gateCPassed:unrelatedPass&&sorted&&top5&&scored.duplicateIds===1,
      top5Expected:top5, irrelevantRejected:unrelatedPass,
      finalOrderMatchesScores:sorted,
      duplicateIdsRemoved:scored.duplicateIds,
      query:info.query.text, numericDuration:info.duration,
      candidates:scored.ranked.map(function(r,i) {
        return {rank:i+1,name:r.fileName,score:r.metadataScore,
          breakdown:r.lookupScoreBreakdown,coverage:r.lookupCoverage,
          matchedTerms:r.lookupMatchedTerms,duration:r.lookupDuration};
      }), rejected:excluded};
  });
}

/** Gate D: five real, metadata-only searches. No Gemini or index writes. */
function benchmarkNoscaPhase2BEndToEnd() {
  return noscaPhase2BLog_('END_TO_END',function () {
    const queries=['3 year roadmap','PJL 3 year roadmap',
      'CashHub 3 year roadmap','pjl cashhub','Find CashHub proposals'];
    const searches=queries.map(function(question) {
      const begin=Date.now();
      const context=resolveNoscaConversationContext_(question,null);
      const result=noscaFindDriveDocumentsV3_(question);
      return {question:question, resolvedIntent:context.intent,
        version:result.searchDiagnostics.patchVersion,
        elapsedMs:Date.now()-begin,
        apiCalls:result.searchDiagnostics.apiCalls,
        truncated:result.searchDiagnostics.truncated,
        incompleteSearch:result.searchDiagnostics.incompleteSearch,
        errors:result.searchDiagnostics.errors || [],
        tiers:result.searchDiagnostics.tiers.map(function(t){
          return {tier:t.tier,corpus:t.corpus,count:t.rawCount,
            incompleteSearch:t.incompleteSearch,truncated:t.truncated};
        }),
        expectedHits:noscaPhase2BExpectedHits_(result.results),
        count:result.results.length,
        topResults:noscaPhase2BBriefResults_(result,7)};
    });
    const goalMet=searches[0].expectedHits.bothFound &&
      searches[0].expectedHits.pjlDeck[0].rank<=5 &&
      searches[0].expectedHits.cashhubPlan[0].rank<=5 &&
      searches[1].expectedHits.pjlDeck.length>0 &&
      searches[1].expectedHits.pjlDeck[0].rank<=3 &&
      searches[2].expectedHits.cashhubPlan.length>0 &&
      searches[2].expectedHits.cashhubPlan[0].rank<=3;
    const noSearchErrors=searches.every(function(item) {
      return item.errors.length===0;
    });
    const allLookups=searches.every(function(item) {
      return item.resolvedIntent==='document_lookup' && item.count>0;
    });
    const releaseReady=goalMet && noSearchErrors && allLookups &&
      noscaPhase2BEnabled_();
    const compact=searches.map(function(item) {
      return {question:item.question, elapsedMs:item.elapsedMs,
        apiCalls:item.apiCalls, count:item.count,
        pjlDeckRank:item.expectedHits.pjlDeck.length ?
          item.expectedHits.pjlDeck[0].rank : null,
        cashhubPlanRank:item.expectedHits.cashhubPlan.length ?
          item.expectedHits.cashhubPlan[0].rank : null,
        errorCount:item.errors.length, errors:item.errors};
    });
    // Keep a short independently readable line before the detailed report,
    // which can exceed Apps Script's execution-log size limit.
    console.log('[NOSCA PHASE 2B][END_TO_END_SUMMARY]\n' +
      JSON.stringify({version:NOSCA_PHASE2B_VERSION,
        propertyEnabled:noscaPhase2BEnabled_(), goalMet:goalMet,
        noSearchErrors:noSearchErrors, allLookups:allLookups,
        releaseReady:releaseReady, searches:compact},null,2));
    return {ok:goalMet && noSearchErrors && allLookups,
      version:NOSCA_PHASE2B_VERSION,
      propertyEnabled:noscaPhase2BEnabled_(),
      goalMet:goalMet, noSearchErrors:noSearchErrors,
      allLookups:allLookups, releaseReady:releaseReady,
      summary:compact, searches:searches,
      note:'Before production enablement, verify each source is accessible under the same account as the Drive UI.'};
  });
}

/** Gate D offline mocked failure, short queries, numeric and type regressions. */
function benchmarkNoscaPhase2BRegression() {
  return noscaPhase2BLog_('REGRESSION',function () {
    const records=noscaPhase2BFixtures_();
    const tests=[];
    function check(name, condition) {tests.push({name:name,passed:!!condition});}
    ['3-year roadmap','3 year roadmap','3_year_roadmap'].forEach(function(q) {
      check('three-year-variant:'+q, noscaV3QueryInfo_(q).duration===3);
    });
    check('unrelated-v3-is-not-three-years',
      noscaV3Duration_('[DRAFT] year2 proposal v3.0')===null);
    check('different-five-year-excluded',
      !noscaScoreDriveLookupV3_(records[6],noscaV3QueryInfo_('3 year roadmap')).passes);
    check('main-deck-valid',
      noscaScoreDriveLookupV3_(records[0],noscaV3QueryInfo_('3 year roadmap')).passes);
    check('cashhub-client-matched',
      noscaScoreDriveLookupV3_(records[1],noscaV3QueryInfo_('CashHub 3 year roadmap')).passes);
    check('cashhub-client-filter',
      !noscaScoreDriveLookupV3_(records[0],noscaV3QueryInfo_('CashHub 3 year roadmap')).passes);
    check('file-type-proposal-filter',
      !noscaScoreDriveLookupV3_(records[0],noscaV3QueryInfo_('Find CashHub proposals')).passes);
    check('folder-explicit-is-eligible',
      noscaScoreDriveLookupV3_(records[4],noscaV3QueryInfo_('3 year roadmap folders')).passes);
    check('presentation-filter',
      !noscaScoreDriveLookupV3_(records[1],noscaV3QueryInfo_('3 year roadmap slides')).passes);
    check('empty-match',noscaV3Rank_([],noscaV3QueryInfo_('3 year roadmap')).ranked.length===0);
    check('id-deduplicated',noscaV3Rank_([records[0],records[0]],
      noscaV3QueryInfo_('3 year roadmap')).duplicateIds===1);
    function mock(mode) {
      const calls=[];
      function searchFn(q,scope,options) {
        calls.push({corpus:options.corpus,tier:options.tier});
        if (mode==='fail' && options.corpus==='user') throw new Error('mocked user API failure');
        if (options.corpus==='allDrives') {
          return {records:[records[0],records[1]],
            apiCalls:1, scanned:2,elapsedMs:1,truncated:false,pageCount:1};
        }
        return {records:mode==='sparse'?[]:[records[0]],apiCalls:1,
          scanned:mode==='sparse'?0:1,elapsedMs:1,truncated:mode==='truncated',
          incompleteSearch:false,pageCount:1};
      }
      const res=noscaFindDriveDocumentsV3_('3 year roadmap',{
        searchFn:searchFn,maxCalls:3,maxElapsedMs:2000});
      return {res:res,calls:calls};
    }
    const sparse=mock('sparse');
    check('sparse-recovers-cross-drive',sparse.res.results.length===2 &&
      sparse.calls.some(function(c) {return c.corpus==='allDrives';}));
    const failed=mock('fail');
    check('user-api-error-fallback',failed.res.results.length===2 &&
      failed.res.searchDiagnostics.errors.length>=1);
    const truncated=mock('truncated');
    check('truncated-cross-drive',truncated.calls.some(function(c) {
      return c.corpus==='allDrives';}));
    return {ok:tests.every(function(t) {return t.passed;}),
      passed:tests.filter(function(t) {return t.passed;}).length,
      total:tests.length,tests:tests,
      note:'Pure local fixtures and injected Drive mocks; no real Drive/Gemini calls.'};
  });
}
