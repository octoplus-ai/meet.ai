import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {zoomDatabase,postgrest,seed,ids} from './helpers/zoom-db.mjs';
const originalFetch=globalThis.fetch,previousEnv={...process.env};
Object.assign(process.env,{APP_URL:'https://octomeet.example.invalid',ZOOM_REDIRECT_URI:'https://octomeet.example.invalid/api/auth/zoom/callback',ZOOM_CLIENT_ID:'fixture-client',ZOOM_CLIENT_SECRET:'fixture-secret',ZOOM_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,4).toString('base64'),ZOOM_WEBHOOK_SECRET_TOKEN:'fixture-webhook',ZOOM_RTMS_ENABLED:'true',ZOOM_RTMS_SERVICE_URL:'https://rtms.example.invalid',RTMS_SERVICE_SECRET:'fixture-service-secret'.padEnd(40,'x')});
const zoom=await import('../api/lib/zoom.js'),rtms=await import('../api/lib/zoom-rtms.js');
const {encryptZoomSecret,decryptZoomSecret,sha256}=await import('../api/lib/zoom-security.js');
const {default:webhook}=await import('../api/zoom/webhook.js'),{default:status}=await import('../api/zoom/rtms-status.js');
const {createRtmsIngest}=await import('../api/zoom/rtms-ingest.js');
const {default:connectionStatus}=await import('../api/zoom/status.js');
const {default:stopBot}=await import('../api/bot/stop.js');
const {scheduleRtmsMeeting}=await import('../api/lib/zoom-routing.js');
let db,database,requests,provider;
before(async()=>{db=await zoomDatabase();database=postgrest(db);});
after(async()=>{globalThis.fetch=originalFetch;process.env=previousEnv;await db?.close();});
beforeEach(async()=>{
  await seed(db);requests=[];provider=null;
  globalThis.fetch=async(url,options={})=>{
    const value=String(url);requests.push({url:value,options});
    if(value.includes('/rest/v1/')){try{const result=await database(value.split('/rest/v1/')[1],{method:options.method,body:options.body?JSON.parse(options.body):undefined,prefer:options.headers?.Prefer});return new Response(JSON.stringify(result));}catch(error){return new Response(JSON.stringify({error:error.message}),{status:400});}}
    if(provider){const result=await provider(value,options);if(result)return result;}
    if(value==='https://zoom.us/oauth/token')return Response.json({access_token:'access-fixture',refresh_token:'refresh-fixture',expires_in:3600,token_type:'bearer',scope:zoom.ZOOM_SCOPES.join(' ')});
    if(value==='https://api.zoom.us/v2/users/me')return Response.json({id:'operator',account_id:'account',email:'owner@example.invalid'});
    if(value==='https://zoom.us/oauth/revoke')return Response.json({});
    if(value==='https://rtms.example.invalid/v1/sessions'){const body=JSON.parse(options.body);return Response.json({ok:true,id:rtms.rtmsStreamKey(body.meetingUuid,body.streamId),state:'running'});}
    if(value.startsWith('https://rtms.example.invalid/v1/'))return Response.json({ok:true});
    throw new Error('Unexpected external request in offline test: '+value);
  };
});
function response(){return {headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},writeHead(code,headers){this.code=code;Object.assign(this.headers,headers);},end(){}};}
const started=extra=>({event:'meeting.rtms_started',event_ts:Date.now(),payload:{account_id:'account',operator_id:'operator',meeting_id:89985000930,meeting_uuid:'meeting-uuid',rtms_stream_id:'stream',server_urls:'wss://rtms.zoom.us/path',...extra}});
async function start(){await rtms.handleRtmsEvent(started());const dispatch=requests.find(x=>x.url==='https://rtms.example.invalid/v1/sessions');return JSON.parse(dispatch.options.body);}
const callback=(body,dispatch)=>({method:'POST',headers:{authorization:`Bearer ${dispatch.callbackToken}`},body:{sessionId:dispatch.sessionId,...body}});

test('service deadline uses canonical UTC even when PostgREST returns microseconds and an offset',async()=>{
  const originalDatabase=database;
  database=async(path,options)=>{const result=await originalDatabase(path,options);return Array.isArray(result)?result.map(row=>row.capture_deadline_at?{...row,capture_deadline_at:new Date(row.capture_deadline_at).toISOString().replace('Z','000+00:00')}:row):result;};
  try{const dispatch=await start();assert.match(dispatch.captureDeadlineAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);assert.ok(Date.parse(dispatch.captureDeadlineAt)>Date.now());}
  finally{database=originalDatabase;}
});
test('OAuth state is session/user/browser-bound and single-use; tokens are encrypted and status never exposes them',async()=>{
  const auth=await zoom.createZoomAuthorization(ids.user,'session-token'),state=new URL(auth.url).searchParams.get('state');
  await assert.rejects(zoom.claimZoomState(state,auth.nonce,ids.other,'session-token'),/invalid_state/);
  await assert.rejects(zoom.claimZoomState(state,auth.nonce,ids.user,'other-session'),/invalid_state/);
  const claimed=await zoom.claimZoomState(state,auth.nonce,ids.user,'session-token');await assert.rejects(zoom.claimZoomState(state,auth.nonce,ids.user,'session-token'),/invalid_state/);
  const connection=await zoom.connectZoomAccount(ids.user,'fixture-code',claimed);
  assert.equal(connection.token_ciphertext.includes('access-fixture'),false);assert.equal(decryptZoomSecret(connection.token_ciphertext,`${ids.user}:${connection.id}`).accessToken,'access-fixture');
  await db.query("insert into sessions values('session-token',$1,now()+interval '1 hour')",[ids.user]);const res=response();await connectionStatus({method:'GET',headers:{cookie:'om_session=session-token'}},res);
  assert.equal(res.body.connected,true);assert.equal(res.body.rtmsConfigured,true);assert.equal(JSON.stringify(res.body).includes('token'),false);assert.equal(res.body.meetingAccess,'requires_zoom_permission');
});

test('a durable deletion blocks callbacks, OAuth and report publication before storage purge acknowledges',async()=>{
  const dispatch=await start();
  await database('rpc/zoom_begin_deletion',{body:{p_user_id:ids.user,p_meeting_id:null}});
  await assert.rejects(zoom.createZoomAuthorization(ids.user,'session'),/zoom_not_connected/);
  const reply=response();await status(callback({status:'recording'},dispatch),reply);assert.equal(reply.code,409);assert.equal(reply.body.stop,true);assert.equal(reply.body.delete,true);
  let analyzed=false;const ingest=createRtmsIngest({database,analyze:async()=>{analyzed=true;return{};},notify:async()=>{throw new Error('Cannot notify after deletion');}});
  const delivery=response();await ingest(callback({recordingUrl:`r2:private/${ids.user}/${dispatch.meetingId}/recording.mp4`,turns:[{text:'Captured speech'}]},dispatch),delivery);
  assert.equal(delivery.code,409);assert.equal(delivery.body.delete,true);assert.equal(analyzed,false);assert.equal((await db.query('select recording_url from meetings')).rows[0].recording_url,null);
});
test('expired, invalidated, or wrong nonce OAuth state cannot connect; disconnect during code exchange cannot restore access',async()=>{
  const auth=await zoom.createZoomAuthorization(ids.user,'session'),state=new URL(auth.url).searchParams.get('state');
  await assert.rejects(zoom.claimZoomState(state,'x'.repeat(43),ids.user,'session'),/invalid_state/);
  await db.query("update zoom_oauth_states set expires_at=now()-interval '1 second'");await assert.rejects(zoom.claimZoomState(state,auth.nonce,ids.user,'session'),/invalid_state/);
  const next=await zoom.createZoomAuthorization(ids.user,'session'),hash=await zoom.claimZoomState(new URL(next.url).searchParams.get('state'),next.nonce,ids.user,'session');
  provider=async url=>{if(url==='https://zoom.us/oauth/token'){await database('rpc/zoom_disconnect',{body:{p_user_id:ids.user,p_connection_id:ids.connection}});}return null;};
  await assert.rejects(zoom.connectZoomAccount(ids.user,'code',hash),/invalid_state/);assert.equal((await zoom.getRtmsConnectionState(ids.user)).connected,false);
});
test('OAuth aliases are explicit, state-bound, and use their own registered callback during token exchange',async()=>{
  const previous=process.env.ZOOM_APP_ORIGINS,alias='https://alias.example.invalid';process.env.ZOOM_APP_ORIGINS=`${process.env.APP_URL},${alias}`;
  try {
    const auth=await zoom.createZoomAuthorization(ids.user,'alias-session',alias),params=new URL(auth.url).searchParams;
    assert.equal(params.get('redirect_uri'),alias+'/api/auth/zoom/callback');
    await assert.rejects(zoom.claimZoomState(params.get('state'),auth.nonce,ids.user,'alias-session',process.env.APP_URL),/invalid_state/);
    const hash=await zoom.claimZoomState(params.get('state'),auth.nonce,ids.user,'alias-session',alias);await zoom.connectZoomAccount(ids.user,'code',hash);
    const exchange=requests.find(x=>x.url==='https://zoom.us/oauth/token');assert.equal(exchange.options.body.get('redirect_uri'),alias+'/api/auth/zoom/callback');
    await assert.rejects(zoom.createZoomAuthorization(ids.user,'session','https://evil.example.invalid'),/invalid_origin/);
  } finally {if(previous==null)delete process.env.ZOOM_APP_ORIGINS;else process.env.ZOOM_APP_ORIGINS=previous;}
});
test('an opted-out user cannot auto-start from a signed native event without explicit manual intent',async()=>{
  await db.query('update app_users set auto_join=false where id=$1',[ids.user]);assert.equal((await rtms.handleRtmsEvent(started())).ignored,true);
  assert.equal(requests.some(x=>x.url==='https://rtms.example.invalid/v1/sessions'),false);assert.equal((await db.query('select count(*) from zoom_rtms_sessions')).rows[0].count,0);
});
test('manual start without calendar id promotes a preexisting calendar intention before Zoom control',async()=>{
  await db.query('update app_users set auto_join=false where id=$1',[ids.user]);
  await db.query("insert into meetings(id,user_id,meeting_url,status,capture_mode,start_time,end_time,stage_info,calendar_event_id) values($1,$2,'https://zoom.us/j/89985000930','scheduled','zoom_rtms',now(),now()+interval '1 hour','{\"manualIntent\":false}','event')",[ids.meeting,ids.user]);
  let controls=0;const result=await scheduleRtmsMeeting(ids.user,{meetingUrl:'https://us06web.zoom.us/j/89985000930',manualRetry:true},{ready:true},{database,gate:async()=>({allow:true,maxMeetingMin:120}),control:async()=>{controls++;assert.equal((await db.query('select stage_info from meetings where id=$1',[ids.meeting])).rows[0].stage_info.manualIntent,true);}});
  assert.equal(result.startRequested,true);assert.equal(controls,1);await rtms.handleRtmsEvent(started());assert.equal((await db.query('select count(*) from zoom_rtms_sessions')).rows[0].count,1);
});
test('camera permission alone cannot masquerade as shared-screen permission',async()=>{
  await db.query("update zoom_connections set scopes=array_remove(scopes,'meeting:read:meeting_screenshare')");assert.equal((await zoom.getRtmsConnectionState(ids.user)).ready,false);
  const auth=await zoom.createZoomAuthorization(ids.user,'session'),hash=await zoom.claimZoomState(new URL(auth.url).searchParams.get('state'),auth.nonce,ids.user,'session');
  provider=async url=>url==='https://zoom.us/oauth/token'?Response.json({access_token:'a',refresh_token:'r',token_type:'bearer',expires_in:3600,scope:zoom.ZOOM_SCOPES.filter(x=>x!=='meeting:read:meeting_screenshare').join(' ')}):null;
  await assert.rejects(zoom.connectZoomAccount(ids.user,'code',hash),/zoom_missing_scopes/);
});
test('refresh CAS cannot resurrect credentials revoked while Zoom rotates them',async()=>{
  await db.query("update zoom_connections set expires_at=now()-interval '1 second',token_ciphertext=$1",[encryptZoomSecret({accessToken:'old',refreshToken:'old-refresh'},`${ids.user}:${ids.connection}`)]);
  provider=async url=>{if(url==='https://zoom.us/oauth/token')await database('rpc/zoom_disconnect',{body:{p_user_id:ids.user,p_connection_id:ids.connection}});return null;};
  await assert.rejects(zoom.getZoomAccessToken(ids.user),/zoom_reconnect_required/);
  const row=(await db.query('select * from zoom_connections')).rows[0];assert.equal(row.token_ciphertext,null);assert.equal(row.selected,true);
});
test('signed webhook routes invited operator rather than meeting host, retries are idempotent, no OAuth secrets go to worker',async()=>{
  const body=started({host_id:'different-host',is_original_host:false}),raw=JSON.stringify(body),ts=String(Math.floor(Date.now()/1000));
  const req={method:'POST',body:raw,headers:{'x-zm-request-timestamp':ts,'x-zm-signature':'v0='+createHmac('sha256',process.env.ZOOM_WEBHOOK_SECRET_TOKEN).update(`v0:${ts}:${raw}`).digest('hex')}};
  const first=response();await webhook(req,first);assert.equal(first.code,200);assert.equal(first.body.ok,true);
  const second=response();await webhook(req,second);assert.equal(second.body.duplicate,true);
  const dispatches=requests.filter(x=>x.url==='https://rtms.example.invalid/v1/sessions');assert.equal(dispatches.length,1);
  const dispatch=JSON.parse(dispatches[0].options.body);assert.equal(dispatch.userId,ids.user);assert.equal(dispatch.maxMeetingMin,120);assert.equal(dispatch.operatorId,'operator');assert.equal(dispatch.accessToken,undefined);
  assert.equal((await db.query('select callback_hash from zoom_rtms_sessions')).rows[0].callback_hash,sha256(dispatch.callbackToken));
  const bad=response();await webhook({...req,body:raw+' '},bad);assert.equal(bad.code,401);
});
test('unconnected operator and unrelated meeting ended do not capture or stop; stopped-before-start remains closed',async()=>{
  assert.equal((await rtms.handleRtmsEvent(started({operator_id:'other-user'}))).ignored,true);
  assert.equal((await rtms.handleRtmsEvent({...started(),event:'meeting.ended'})).ignored,true);
  const event=started();await rtms.handleRtmsEvent({event:'meeting.rtms_stopped',event_ts:event.event_ts,payload:{meeting_uuid:event.payload.meeting_uuid,rtms_stream_id:'stream'}});
  assert.equal((await rtms.handleRtmsEvent(event)).ignored,true);assert.equal(requests.some(x=>x.url==='https://rtms.example.invalid/v1/sessions'),false);
});
test('deauthorization is bound to Zoom app/account/user and cannot revoke a newer connection generation',async()=>{
  const event={event:'app_deauthorized',event_ts:Date.now()+1000,payload:{client_id:'fixture-client',account_id:'account',user_id:'operator'}};
  await assert.rejects(rtms.handleRtmsEvent({...event,payload:{...event.payload,client_id:'other-client'}}),/invalid_rtms_event/);
  await rtms.handleRtmsEvent({...event,payload:{...event.payload,account_id:'other-account'}});assert.equal((await zoom.getRtmsConnectionState(ids.user)).connected,true);
  const old=await zoom.revokeZoomConnection(ids.user,{connectionId:ids.other,revokeProvider:false});assert.equal(old,false);assert.equal((await zoom.getRtmsConnectionState(ids.user)).connected,true);
  await rtms.handleRtmsEvent(event);const state=await zoom.getRtmsConnectionState(ids.user);assert.equal(state.connected,false);assert.equal(state.selected,true);
  assert.equal(requests.some(x=>x.url==='https://zoom.us/oauth/revoke'),false);
});
test('stop persists even when native service is unreachable and OAuth has been revoked',async()=>{
  const dispatch=await start();await database('rpc/zoom_disconnect',{body:{p_user_id:ids.user,p_connection_id:ids.connection}});
  provider=async url=>{if(url.startsWith('https://rtms.example.invalid/'))throw new Error('service offline');return null;};
  const result=await rtms.stopRTMSMeeting(ids.user,dispatch.meetingId);assert.equal(result.stopping,true);assert.equal(result.dispatched,false);
  const res=response();await status(callback({status:'joining'},dispatch),res);assert.equal(res.body.stop,true);
  assert.equal((await db.query('select status from meetings')).rows[0].status,'processing');
});
test('the existing stop endpoint recognizes Zoom canonical meeting identity and never discards native media',async()=>{
  const dispatch=await start();await db.query("insert into sessions values('owner-session',$1,now()+interval '1 hour'),('other-session',$2,now()+interval '1 hour')",[ids.user,ids.other]);
  const body={meetingUrl:'https://us02web.zoom.us/wc/89985000930/join?pwd=different'};
  const other=response();await stopBot({method:'POST',headers:{cookie:'om_session=other-session'},body},other);assert.equal(other.code,404);
  const res=response();await stopBot({method:'POST',headers:{cookie:'om_session=owner-session'},body},res);assert.equal(res.code,200);assert.equal(res.body.stopping,true);assert.equal((await db.query('select status from meetings where id=$1',[dispatch.meetingId])).rows[0].status,'processing');
  const tokenCheck=response();await status(callback({status:'recording'},dispatch),tokenCheck);assert.equal(tokenCheck.body.stop,true);
});
test('callback token cannot cross meeting, user or session; media is stored before AI and remains available if analysis fails',async()=>{
  const dispatch=await start();for(const patch of [{sessionId:ids.other},{meetingId:ids.other},{userId:ids.other}])await assert.rejects(rtms.authorizeRtmsCallback(callback(patch,dispatch),{sessionId:dispatch.sessionId,...patch}),/unauthorized/);
  const url=`r2:private/${ids.user}/${dispatch.meetingId}/recording.mp4`;let calls=0;
  const ingest=createRtmsIngest({database,analyze:async()=>{calls++;assert.equal((await db.query('select recording_url from meetings')).rows[0].recording_url,url);throw new Error('private vendor error token=secret');},notify:async()=>{throw new Error('must not notify');}});
  const res=response();await ingest(callback({recordingUrl:url,durationMin:2,turns:[{speaker:'Santiago',text:'A real captured sentence.',t:'0:01'}]},dispatch),res);
  assert.equal(res.code,503);assert.equal(res.body.error,'zoom_ingest_retry');assert.equal(calls,1);assert.equal((await db.query('select count(*) from reports')).rows[0].count,0);
  assert.equal((await db.query('select ingest_lease from zoom_rtms_sessions')).rows[0].ingest_lease,null);
});
test('production JSONB transcript and INTEGER columns preserve real delivery without changing the legacy string contract',async()=>{
  const dispatch=await start(),recordingUrl=`r2:private/${ids.user}/${dispatch.meetingId}/recording.mp4`;
  const turns=[{speaker:'Speaker A',text:'Revisamos el envío "uno" y acordamos avanzar.',t:'0:01'},{speaker:'Mario',text:'Confirmado: lo probamos mañana.',t:'1:12'}];
  const scores={overall:88.6,engagement:74,sentiment:90,balance:60.25,clarity:87,charisma:70};
  let notified=0;
  const ingest=createRtmsIngest({database,analyze:async(text)=>{
    assert.equal(typeof text,'string');assert.match(text,/\[0:01\] Speaker A:/);
    return{summary:'Se acordó probar el envío mañana.',speakerMap:{'Speaker A':'Santiago'},scores,participants:[{name:'Santiago',role:'Owner'}]};
  },notify:async(meeting,ai,report)=>{notified++;assert.equal(meeting.duration_min,2);assert.equal(typeof report.transcript,'string');}});
  const body={recordingUrl,durationMin:1.75625,turns,stage:{mediaAvailability:'audio_video',mediaCounts:{audio:20,video:10,share:4}}};
  const early=response();await ingest(callback({...body,mediaOnly:true},dispatch),early);assert.equal(early.body.mediaSaved,true);
  let meeting=(await db.query('select duration_min,stage_info from meetings where id=$1',[dispatch.meetingId])).rows[0];
  assert.equal(meeting.duration_min,2);assert.equal(meeting.stage_info.recordingDurationSec,105.375);
  const delivered=response();await ingest(callback(body,dispatch),delivered);assert.equal(delivered.code,200);assert.equal(delivered.body.ok,true);
  const stored=(await db.query('select transcript,jsonb_typeof(transcript) as transcript_kind,scores,read_score,participants from reports where meeting_id=$1',[dispatch.meetingId])).rows[0];
  assert.equal(stored.transcript_kind,'string');
  assert.equal(stored.transcript,'[0:01] Santiago: Revisamos el envío "uno" y acordamos avanzar.\n[1:12] Mario: Confirmado: lo probamos mañana.');
  assert.deepEqual(stored.scores,scores);assert.equal(stored.read_score,89);assert.equal(stored.participants[0].name,'Santiago');
  meeting=(await db.query('select status,duration_min,stage_info from meetings where id=$1',[dispatch.meetingId])).rows[0];
  assert.equal(meeting.status,'done');assert.equal(meeting.duration_min,2);assert.equal(meeting.stage_info.recordingDurationSec,105.375);
  assert.deepEqual(meeting.stage_info.mediaCounts,{audio:20,video:10,share:4});assert.equal(notified,1);
});
test('revoked session stops new media but can finalize captured video and one real report; empty capture is never a report',async()=>{
  const dispatch=await start(),url=`r2:private/${ids.user}/${dispatch.meetingId}/recording.mp4`;
  await rtms.disconnectRtmsUser(ids.user);const heartbeat=response();await status(callback({status:'recording'},dispatch),heartbeat);assert.equal(heartbeat.body.stop,true);
  let analysisCalls=0,notifications=0;const ingest=createRtmsIngest({database,analyze:async()=>{analysisCalls++;return{summary:'Discussed delivery.',speakerMap:{},participants:[]};},notify:async()=>{notifications++;}});
  const media=response();await ingest(callback({recordingUrl:url,mediaOnly:true},dispatch),media);assert.equal(media.body.mediaSaved,true);assert.equal(analysisCalls,0);
  const empty=response();await ingest(callback({recordingUrl:url,turns:[]},dispatch),empty);assert.equal(empty.body.noTranscript,true);assert.equal((await db.query('select count(*) from reports')).rows[0].count,0);
  const delivered=response();await ingest(callback({recordingUrl:url,turns:[{speaker:'Santiago',text:'Discussed delivery.',t:'0:01'}]},dispatch),delivered);assert.equal(delivered.body.ok,true);assert.equal(notifications,1);
  // A repeated callback may recover an unqueued recap after a function interruption.
  // Per-recipient deduplication is exercised against the real delivery ledger separately.
  const duplicate=response();await ingest(callback({recordingUrl:url,turns:[]},dispatch),duplicate);assert.equal(duplicate.body.alreadyDone,true);assert.equal(notifications,2);assert.equal(analysisCalls,1);
  assert.equal((await db.query('select status from meetings')).rows[0].status,'done');
});
test('cancel racing analysis prevents report publication and auto notifications',async()=>{
  const dispatch=await start();let notified=false;
  const ingest=createRtmsIngest({database,analyze:async()=>{await db.exec("update meetings set status='skipped'");return{summary:'Must not publish',speakerMap:{}};},notify:async()=>{notified=true;}});
  const res=response();await ingest(callback({turns:[{text:'Some actual discussion'}]},dispatch),res);assert.equal(res.code,409);assert.equal(notified,false);assert.equal((await db.query('select count(*) from reports')).rows[0].count,0);
});

test('deletion committed immediately after report commit suppresses recap notifications',async()=>{
  const dispatch=await start();let notified=false;
  const raceDatabase=async(path,options)=>{const result=await database(path,options);if(path==='rpc/zoom_commit_report'&&result===true)await database('rpc/zoom_begin_deletion',{body:{p_user_id:ids.user,p_meeting_id:dispatch.meetingId}});return result;};
  const ingest=createRtmsIngest({database:raceDatabase,analyze:async()=>({summary:'A captured discussion',speakerMap:{}}),notify:async()=>{notified=true;}});
  const res=response();await ingest(callback({turns:[{text:'Some actual discussion'}]},dispatch),res);
  assert.equal(res.code,409);assert.equal(res.body.delete,true);assert.equal(notified,false);
});
