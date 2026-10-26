/**
 * NOVARE NEXUS — STANDALONE centralized metadata discovery Apps Script.
 * Deploy as a SEPARATE script, as Novare Nexus, execute as ME.
 * The URL is necessarily reachable by UrlFetchApp without browser cookies;
 * enforce HMAC and corporate allowlists on EVERY request.
 * Only Drive.Files.list metadata is used. NEVER return file contents,
 * thumbnail URLs, document descriptions, owner identities or OAuth tokens.
 */
const NOSCA_CENTRAL_VERSION = 'nosca-central-discovery-20261023-v1';

function noscaCentralConfig_() {
  const props = PropertiesService.getScriptProperties();
  const owner = String(props.getProperty('NOSCA_CENTRAL_OWNER_EMAIL') || '').trim().toLowerCase();
  const secret = String(props.getProperty('NOSCA_CENTRAL_SHARED_SECRET') || '').trim();
  const domains = String(props.getProperty('NOSCA_CENTRAL_ALLOWED_DOMAINS') || '')
    .toLowerCase().split(',').map(function(s){return s.trim();}).filter(Boolean);
  const mode = String(props.getProperty('NOSCA_CENTRAL_SCOPE_MODE') || '').trim().toLowerCase();
  const driveIds = String(props.getProperty('NOSCA_CENTRAL_ALLOWED_DRIVE_IDS') || '')
    .split(',').map(function(s){return s.trim();})
    .filter(function(s){return /^[A-Za-z0-9_-]{10,}$/.test(s);}).slice(0,8);
  const accountWideApproved = String(props.getProperty('NOSCA_CENTRAL_ACCOUNT_WIDE_APPROVED') || '') === 'I_ACKNOWLEDGE_METADATA_VISIBILITY';
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!owner || !effective || effective !== owner) {
    throw new Error('Service must execute as the explicitly configured Novare Nexus owner.');
  }
  if (secret.length < 32 || !domains.length) throw new Error('Missing shared secret or allowed employee domains.');
  if (mode !== 'approved_drives' && mode !== 'account') throw new Error('Central scope mode must be approved_drives or account.');
  if (mode === 'approved_drives' && !driveIds.length) throw new Error('No approved shared Drive IDs configured.');
  if (mode === 'account' && !accountWideApproved) throw new Error('Account-wide metadata visibility has not been explicitly approved.');
  return {owner:owner,secret:secret,domains:domains,mode:mode,driveIds:driveIds};
}

function noscaCentralSignature_(payload, secret) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(JSON.stringify(payload),secret));
}

function noscaCentralConstantTimeEqual_(a,b) {
  a=String(a||''); b=String(b||'');
  let different=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) {
    different|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  }
  return different===0;
}

function noscaCentralAuthorize_(body,cfg) {
  if (!body || !body.payload || typeof body.payload!=='object' ||
      typeof body.signature!=='string') throw new Error('INVALID_ENVELOPE');
  const p=body.payload;
  if (p.v!==1 || p.op!=='lookup' || !Number.isFinite(p.timestamp) ||
      Math.abs(Date.now()-p.timestamp)>60000 ||
      !/^[a-f0-9-]{30,50}$/i.test(String(p.nonce||''))) throw new Error('EXPIRED_OR_INVALID_REQUEST');
  if (!noscaCentralConstantTimeEqual_(body.signature, noscaCentralSignature_(p,cfg.secret))) {
    throw new Error('INVALID_SIGNATURE');
  }
  const email=String(p.email||'').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      cfg.domains.indexOf(email.split('@')[1])<0) throw new Error('EMPLOYEE_NOT_ALLOWED');
  const question=String(p.question||'').replace(/\s+/g,' ').trim();
  if (!question || question.length>500) throw new Error('INVALID_QUESTION');
  // Replay protection for a short-lived signed request. No identity derived
  // from unauthenticated request parameters is trusted before signature check.
  const cache=CacheService.getScriptCache();
  const key='nosca-central-nonce-'+Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p.nonce)).slice(0,52);
  if (cache.get(key)) throw new Error('REPLAY_DETECTED');
  cache.put(key,'1',120);
  return question;
}

/** Extract search anchors only from the signed employee question. */
function noscaCentralAnchors_(question) {
  const tokens=String(question).toLowerCase().replace(/[_\/\\()[\]{}.,:;!?-]/g,' ')
    .replace(/[^a-z0-9+#&\s]/g,' ').split(/\s+/).filter(Boolean);
  const ignored={find:1,show:1,where:1,list:1,me:1,the:1,a:1,an:1,
    documents:1,document:1,files:1,file:1,folder:1,folders:1,
    for:1,from:1,year:1,years:1,yr:1,yrs:1,proposal:1,proposals:1,
    deck:1,decks:1,presentation:1,presentations:1,sheet:1,sheets:1,
    novare:1,of:1,to:1,and:1};
  const words=tokens.filter(function(t){return t.length>=3 && t.length<=60 &&
    /^[a-z0-9+#&]+$/.test(t) && !ignored[t];});
  const unique=words.filter(function(t,i){return words.indexOf(t)===i;});
  const important=unique.filter(function(t){return t!=='pjl';});
  const ordered=(important.length?important:unique)
    .sort(function(a,b){return b.length-a.length;});
  return ordered.slice(0,2);
}

function noscaCentralEscape_(value) {
  return String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

function noscaCentralSearch_(question,cfg) {
  const start=Date.now();
  const anchors=noscaCentralAnchors_(question);
  if (!anchors.length) return {files:[],apiCalls:0,truncated:false,elapsedMs:0};
  const collected={};
  let calls=0, truncated=false;
  const maxCalls=cfg.mode==='approved_drives'?Math.min(8,cfg.driveIds.length*2):4;
  const corpora=cfg.mode==='approved_drives'
    ? cfg.driveIds.map(function(id){return {corpora:'drive',driveId:id};})
    : [{corpora:'user'},{corpora:'allDrives'}];
  for (let a=0;a<anchors.length;a++) {
    if (a>0 && Object.keys(collected).length>=20) break;
    for (let c=0;c<corpora.length;c++) {
      if (calls>=maxCalls || Date.now()-start>6500) {truncated=true;break;}
      const target=corpora[c];
      const options={q:"trashed = false and name contains '"+noscaCentralEscape_(anchors[a])+"'",
        corpora:target.corpora, supportsAllDrives:true, includeItemsFromAllDrives:true,
        fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,driveId,webViewLink,modifiedTime)',
        pageSize:100, orderBy:'name_natural'};
      if(target.driveId) options.driveId=target.driveId;
      // Bounded to 2 pages per tier. Never claim a complete listing if
      // page tokens or incompleteSearch indicate otherwise.
      let token='';
      for(let page=0;page<2;page++) {
        if (calls>=maxCalls || Date.now()-start>6500) {truncated=true;break;}
        if (token) options.pageToken=token;
        const result=Drive.Files.list(options);
        calls++;
        (result.files||[]).forEach(function(f){
          if (!f || !f.id || !f.name) return;
          // Shared-drive allowlist enforced independently of requested term.
          if (cfg.mode==='approved_drives' && f.driveId!==target.driveId) return;
          collected[f.id]={id:f.id,name:String(f.name).slice(0,300),
            mimeType:String(f.mimeType||''),driveId:String(f.driveId||''),
            webViewLink:String(f.webViewLink||''),modifiedTime:String(f.modifiedTime||'')};
        });
        token=String(result.nextPageToken||'');
        if (result.incompleteSearch || token) truncated=true;
        if(!token) break;
      }
      if(token) truncated=true;
    }
  }
  const files=Object.keys(collected).map(function(id){return collected[id];}).slice(0,240);
  if(Object.keys(collected).length>files.length) truncated=true;
  return {files:files, apiCalls:calls, truncated:truncated,elapsedMs:Date.now()-start,
    scopeMode:cfg.mode};
}

function noscaCentralJson_(object) {
  return ContentService.createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

/** The sole public endpoint. Never return a stack trace or Drive tokens. */
function doPost(e) {
  const start=Date.now();
  try {
    const cfg=noscaCentralConfig_();
    const raw=String(e && e.postData && e.postData.contents || '');
    if (raw.length>3500) throw new Error('PAYLOAD_TOO_LARGE');
    const question=noscaCentralAuthorize_(JSON.parse(raw),cfg);
    const search=noscaCentralSearch_(question,cfg);
    console.log('[NOSCA CENTRAL][SERVER] '+JSON.stringify({
      version:NOSCA_CENTRAL_VERSION,scope:cfg.mode,
      durationMs:Date.now()-start,apiCalls:search.apiCalls,
      returned:search.files.length,truncated:search.truncated
    }));
    return noscaCentralJson_({ok:true,version:NOSCA_CENTRAL_VERSION,
      files:search.files, apiCalls:search.apiCalls,
      elapsedMs:search.elapsedMs, truncated:search.truncated,
      scopeMode:search.scopeMode});
  } catch (err) {
    const message=String(err && err.message || err);
    const code=/^(INVALID_|EXPIRED_|EMPLOYEE_|REPLAY_|PAYLOAD_)/.test(message)
      ? 'REQUEST_REJECTED' : 'SERVICE_UNAVAILABLE';
    console.warn('[NOSCA CENTRAL][DENIED] '+JSON.stringify({code:code,elapsedMs:Date.now()-start}));
    return noscaCentralJson_({ok:false,version:NOSCA_CENTRAL_VERSION,error:code});
  }
}

/** Owner runs this from the editor to trigger Google's Drive OAuth consent. */
function verifyNoscaDriveAuthorization() {
  const cfg=noscaCentralConfig_();
  const query={q:'trashed = false',pageSize:1,
    fields:'nextPageToken,files(id,name,mimeType)',supportsAllDrives:true,
    includeItemsFromAllDrives:true};
  if(cfg.mode==='approved_drives') {
    query.corpora='drive';query.driveId=cfg.driveIds[0];
  } else query.corpora='user';
  const result=Drive.Files.list(query);
  const report={ok:true,version:NOSCA_CENTRAL_VERSION,
    effectiveAccount:cfg.owner,scopeMode:cfg.mode,
    listedSampleCount:(result.files||[]).length,
    authorized:true,noContentAccessRequested:true};
  console.log('[NOSCA CENTRAL][AUTHORIZATION] '+JSON.stringify(report));
  return report;
}

/** Local security test; no external HTTP request or Drive call. */
function benchmarkNoscaCentralSecurity() {
  const cfg=noscaCentralConfig_();
  const payload={v:1,op:'lookup',timestamp:Date.now(),nonce:Utilities.getUuid(),
    email:'nosca-test@'+cfg.domains[0],question:'3 year roadmap'};
  const signed={payload:payload,signature:noscaCentralSignature_(payload,cfg.secret)};
  const accepted=noscaCentralAuthorize_(signed,cfg)==='3 year roadmap';
  let replayRejected=false;
  try{noscaCentralAuthorize_(signed,cfg);}catch(e){replayRejected=/REPLAY_DETECTED/.test(String(e));}
  let forgedRejected=false;
  const forged={payload:Object.assign({},payload,{nonce:Utilities.getUuid(),question:'secret'}),signature:signed.signature};
  try{noscaCentralAuthorize_(forged,cfg);}catch(e){forgedRejected=/INVALID_SIGNATURE/.test(String(e));}
  const result={ok:accepted&&replayRejected&&forgedRejected,
    signedAccepted:accepted,replayRejected:replayRejected,forgedRejected:forgedRejected};
  console.log('[NOSCA CENTRAL][SECURITY] '+JSON.stringify(result));
  if(!result.ok) throw new Error('Central discovery security checks failed.');
  return result;
}

/** Test centralized Drive discovery under the Novare Nexus execution identity. */
function benchmarkNoscaCentralOwnerSearch() {
  const cfg=noscaCentralConfig_();
  const result=noscaCentralSearch_('3 year roadmap',cfg);
  const out={ok:true,version:NOSCA_CENTRAL_VERSION,scopeMode:cfg.mode,
    ownerAuthorized:true,apiCalls:result.apiCalls,
    elapsedMs:result.elapsedMs,truncated:result.truncated,
    returned:result.files.length,
    topTitles:result.files.slice(0,10).map(function(f){return f.name;})};
  console.log('[NOSCA CENTRAL][OWNER_SEARCH] '+JSON.stringify(out));
  return out;
}
