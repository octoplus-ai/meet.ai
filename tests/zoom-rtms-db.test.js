import test, {before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {zoomDatabase,postgrest,seed,ids,sessionPayload} from './helpers/zoom-db.mjs';
let db,rpc; before(async()=>{db=await zoomDatabase();rpc=postgrest(db);});after(async()=>{await db?.close();});beforeEach(async()=>seed(db));
const open=(s=sessionPayload(),mid=null)=>rpc('rpc/zoom_open_rtms_session',{body:{p_session:s,p_meeting_id:mid}});
const call=(name,body)=>rpc('rpc/'+name,{body});
const row=async(table)=> (await db.query(`select * from ${table}`)).rows[0];
test('migration denies browser roles tables and every security definer RPC',async()=>{
  for(const role of ['anon','authenticated']) {
    const privileges=await db.query(`select has_table_privilege($1,'zoom_connections','select') t, has_function_privilege($1,'zoom_open_rtms_session(jsonb,uuid)','execute') f`,[role]);
    assert.deepEqual(privileges.rows[0],{t:false,f:false});
    const allFunctions=(await db.query("select p.oid,has_function_privilege($1,p.oid,'execute') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'zoom_%'",[role])).rows;
    assert.ok(allFunctions.length>=17);assert.equal(allFunctions.some(x=>x.allowed),false);
    for(const table of ['zoom_rtms_deletions','zoom_rtms_account_deletions'])assert.equal((await db.query("select has_table_privilege($1,$2,'select') allowed",[role,table])).rows[0].allowed,false);
    await db.exec('set role '+role);try{await assert.rejects(db.query('select * from zoom_connections'),/permission denied/);}finally{await db.exec('reset role');}
  }
});
test('duplicate signed streams atomically create one capture; mismatched owner cannot reuse it',async()=>{
  const outcomes=await Promise.all([open(),open()]);assert.equal(outcomes[0][0].id,outcomes[1][0].id);
  assert.equal((await db.query('select count(*) from meetings')).rows[0].count,1);
  assert.equal((await open(sessionPayload({user_id:ids.other}))).length,0);
});
test('stop before start is durable, stale stop cannot kill a newer stream, and restart cannot overwrite old media',async()=>{
  const payload=sessionPayload();await call('zoom_stop_stream',{p_key:payload.stream_key,p_event_ts:payload.event_ts});assert.equal((await open(payload)).length,0);
  const next=sessionPayload({stream_key:'c'.repeat(64)}),s=(await open(next))[0];
  await call('zoom_stop_stream',{p_key:next.stream_key,p_event_ts:next.event_ts-1});assert.equal((await row('zoom_rtms_sessions')).stop_requested,false);
  assert.equal((await open(sessionPayload({id:ids.lease,stream_key:'d'.repeat(64)}),s.meeting_id)).length,0);
  await call('zoom_stop_stream',{p_key:next.stream_key,p_event_ts:next.event_ts+1});assert.equal((await row('zoom_rtms_sessions')).stop_requested,true);
});
test('real legacy capture and canceled pending meeting block RTMS admission',async()=>{
  await db.query("insert into meetings(id,user_id,meeting_url,status,capture_mode) values($1,$2,$3,'recording','inhouse_bot')",[ids.meeting,ids.user,'https://us06web.zoom.us/j/89985000930']);assert.equal((await open()).length,0);
  await db.query("update meetings set status='skipped',capture_mode='zoom_rtms' where id=$1",[ids.meeting]);assert.equal((await open(sessionPayload(),ids.meeting)).length,0);
});
test('future recurring calendar intent does not block current stream, but two live streams cannot claim the same meeting instance',async()=>{
  await db.query("insert into meetings(id,user_id,meeting_url,status,capture_mode,start_time,end_time) values($1,$2,$3,'scheduled','inhouse_bot',now()+interval '1 day',now()+interval '25 hours')",[ids.meeting,ids.user,'https://us06web.zoom.us/wc/join/89985000930']);
  const s=(await open())[0];assert.ok(s);
  assert.equal((await open(sessionPayload({id:ids.lease,stream_key:'e'.repeat(64),stream_id:'second'}))).length,0);
  await call('zoom_stop_stream',{p_key:s.stream_key,p_event_ts:s.event_ts+1});
  const next=(await open(sessionPayload({id:ids.lease,stream_key:'e'.repeat(64),stream_id:'second'})))[0];assert.notEqual(next.meeting_id,s.meeting_id);
});
test('disconnect is sticky, cancels pending OAuth, denies new starts, and stale connection id cannot revoke reconnection',async()=>{
  await db.query("insert into zoom_oauth_states(state_hash,user_id,session_hash,nonce_hash,redirect_uri,expires_at,claimed_at) values('state',$1,'s','n','https://app.example.invalid/api/auth/zoom/callback',now()+interval '10 minutes',now())",[ids.user]);
  assert.equal(await call('zoom_disconnect',{p_user_id:ids.user,p_connection_id:ids.other}),false);
  assert.equal((await row('zoom_oauth_states')).invalidated,false);
  assert.equal(await call('zoom_disconnect',{p_user_id:ids.user,p_connection_id:ids.connection}),true);
  assert.equal((await row('zoom_connections')).selected,true);assert.equal((await open()).length,0);
  assert.equal((await call('zoom_commit_connection',{p_state_hash:'state',p_user_id:ids.user,p_id:ids.other,p_identity:{zoom_user_id:'operator',account_id:'account'},p_secret:'secret',p_expiry:new Date(Date.now()+3600000),p_scopes:[]})).length,0);
});
test('refresh and webhook leases admit only one claimant, including parallel requests',async()=>{
  await db.query("update zoom_connections set expires_at=now()-interval '1 second'");
  const refresh=await Promise.all([ids.lease,ids.other].map(lease=>call('zoom_claim_refresh',{p_user_id:ids.user,p_id:ids.connection,p_lease:lease})));assert.equal(refresh.flat().length,1);
  const events=await Promise.all([ids.lease,ids.other].map(lease=>call('zoom_claim_event',{p_key:'event',p_lease:lease})));assert.equal(events.flat().length,1);
});
test('stop is owner-bound, survives outage, preserves delivery, and late status cannot reopen completed report',async()=>{
  const s=(await open())[0];assert.equal((await call('zoom_stop_meeting',{p_user_id:ids.other,p_meeting_id:s.meeting_id})).length,0);
  await call('zoom_stop_meeting',{p_user_id:ids.user,p_meeting_id:s.meeting_id});
  const media={recording_url:`r2:private/${ids.user}/${s.meeting_id}/recording.mp4`};
  const status=await call('zoom_session_update',{p_session_id:s.id,p_status:'recording',p_error:null,p_media:media});assert.equal(status.stop,true);assert.equal((await row('meetings')).status,'processing');
  await call('zoom_claim_ingest',{p_session_id:s.id,p_lease:ids.lease});
  assert.equal(await call('zoom_commit_report',{p_session_id:s.id,p_lease:ids.lease,p_report:{summary:'Actual captured discussion',report_version:13},p_media:media}),true);
  await call('zoom_session_update',{p_session_id:s.id,p_status:'error',p_error:'late',p_media:{}});assert.equal((await row('meetings')).status,'done');
  assert.equal(await call('zoom_commit_report',{p_session_id:s.id,p_lease:ids.lease,p_report:{summary:'duplicate'},p_media:{}}),false);
});
test('cancel, deletion and changed session identity win against an in-flight report analysis',async()=>{
  for(const mutation of ["update meetings set status='skipped'", "update meetings set stage_info='{}'", 'delete from meetings']){
    await seed(db);const s=(await open())[0];await call('zoom_claim_ingest',{p_session_id:s.id,p_lease:ids.lease});await db.exec(mutation);
    assert.equal(await call('zoom_commit_report',{p_session_id:s.id,p_lease:ids.lease,p_report:{summary:'must not publish'},p_media:{}}),false);
    assert.equal((await db.query('select count(*) from reports')).rows[0].count,0);
  }
});
test('pending disable and expiration never discard an admitted recording; retry archives only the calendar link',async()=>{
  await db.query("insert into meetings(id,user_id,title,meeting_url,status,capture_mode,start_time,end_time,calendar_event_id) values($1,$2,'Pending',$3,'scheduled','zoom_rtms',now()-interval '2 hours',now()-interval '10 minutes','calendar')",[ids.meeting,ids.user,'https://zoom.us/j/89985000930']);
  const expired=await call('zoom_expire_intents',{p_user_id:ids.user,p_now:new Date()});assert.equal(expired.length,1);assert.equal(expired[0].error,'RTMS_START_NOT_AUTHORIZED');
  await db.query("update meetings set status='scheduled',start_time=now(),end_time=now()+interval '30 minutes' where id=$1",[ids.meeting]);
  const s=(await open(sessionPayload(),ids.meeting))[0];
  const stopped=await call('zoom_disable_meeting',{p_user_id:ids.user,p_meeting_id:ids.meeting});assert.equal(stopped.stopping,true);assert.equal((await row('meetings')).status,'processing');
  assert.equal((await call('zoom_expire_intents',{p_user_id:ids.user,p_now:new Date(Date.now()+86400000)})).length,0);
  await db.query("update meetings set status='error',recording_url='r2:private/fixture/recording.mp4',status_synced_at=null");
  const next=(await call('zoom_replace_intent',{p_user_id:ids.user,p_prior_id:ids.meeting,p_status:'error',p_synced:null,p_meeting:{title:'Retry',meeting_url:'https://zoom.us/j/89985000930',start_time:new Date(),calendar_event_id:'calendar',stage_info:{platform:'zoom'}}}))[0];
  assert.notEqual(next.id,ids.meeting);const prior=(await db.query('select * from meetings where id=$1',[ids.meeting])).rows[0];assert.equal(prior.recording_url,'r2:private/fixture/recording.mp4');assert.equal(prior.status,'error');assert.match(prior.calendar_event_id,/#rtms:/);
  assert.equal((await db.query('select stop_requested from zoom_rtms_sessions where id=$1',[s.id])).rows[0].stop_requested,true);
  const disabled=await call('zoom_disable_meeting',{p_user_id:ids.user,p_meeting_id:next.id});assert.equal(disabled.stopping,false);assert.equal((await db.query('select status from meetings where id=$1',[next.id])).rows[0].status,'skipped');
});
test('concurrent manual/calendar creation cannot leave two conflicting native pending rows',async()=>{
  const meeting={title:'Meeting',meeting_url:'https://zoom.us/wc/join/89985000930',start_time:new Date(),stage_info:{zoomMeetingId:'89985000930'}};
  const created=await Promise.all([call('zoom_create_intent',{p_user_id:ids.user,p_meeting:meeting}),call('zoom_create_intent',{p_user_id:ids.user,p_meeting:meeting})]);assert.equal(created.flat().length,1);
  const future=await call('zoom_create_intent',{p_user_id:ids.user,p_meeting:{...meeting,start_time:new Date(Date.now()+86400000)}});assert.equal(future.length,1);
});
test('pause/restart inherits the original two-hour deadline and expiration stops acquisition without blocking delivery',async()=>{
  const first=(await open())[0];await call('zoom_stop_stream',{p_key:first.stream_key,p_event_ts:first.event_ts+1});
  const next=(await open(sessionPayload({id:ids.lease,stream_key:'f'.repeat(64),stream_id:'later',event_ts:Date.now()+3600000})))[0];assert.equal(next.capture_deadline_at.toISOString(),first.capture_deadline_at.toISOString());
  await db.query("update zoom_rtms_sessions set capture_deadline_at=now()-interval '1 second' where id=$1",[next.id]);
  const state=await call('zoom_session_update',{p_session_id:next.id,p_status:'recording',p_error:null,p_media:{}});assert.equal(state.stop,true);
  assert.equal((await call('zoom_claim_ingest',{p_session_id:next.id,p_lease:ids.other})).length,1);
});
test('auto-join opt-out is enforced at admission; only explicit manual intent can override it',async()=>{
  await db.query('update app_users set auto_join=false where id=$1',[ids.user]);assert.equal((await open()).length,0);
  await db.query("insert into meetings(id,user_id,status,capture_mode,start_time,stage_info) values($1,$2,'scheduled','zoom_rtms',now(),'{\"manualIntent\":false}')",[ids.meeting,ids.user]);
  assert.equal((await open(sessionPayload(),ids.meeting)).length,0);
  await db.query("update meetings set stage_info='{\"manualIntent\":true}' where id=$1",[ids.meeting]);assert.equal((await open(sessionPayload(),ids.meeting)).length,1);
});

test('purge intent is owner-bound, stops capture and defeats an in-flight analysis without deleting DB evidence',async()=>{
  const s=(await open())[0];await call('zoom_claim_ingest',{p_session_id:s.id,p_lease:ids.lease});
  assert.deepEqual(await call('zoom_begin_deletion',{p_user_id:ids.other,p_meeting_id:s.meeting_id}),{ok:false});
  assert.equal((await row('zoom_rtms_sessions')).stop_requested,false);
  assert.deepEqual(await call('zoom_begin_deletion',{p_user_id:ids.user,p_meeting_id:s.meeting_id}),{ok:true,pending:1});
  assert.equal((await row('meetings')).stage_info.deletion,'requested');assert.equal((await row('zoom_rtms_sessions')).stop_requested,true);
  assert.equal((await call('zoom_claim_ingest',{p_session_id:s.id,p_lease:ids.other})).length,0);
  assert.equal(await call('zoom_commit_report',{p_session_id:s.id,p_lease:ids.lease,p_report:{summary:'Must not publish'},p_media:{}}),false);
  assert.deepEqual(await call('zoom_session_update',{p_session_id:s.id,p_status:'processing',p_error:null,p_media:{recording_url:'must not return'}}),{ok:false,stop:true,delete:true});
  assert.equal((await row('meetings')).recording_url,null);assert.equal((await open(sessionPayload(),s.meeting_id)).length,0);
  assert.equal((await db.query('select count(*) from reports')).rows[0].count,0);
  assert.equal((await row('zoom_rtms_deletions')).purged_at,null);
});

test('purge receipts are durable, idempotent and require the exact owner/session/meeting/stream acknowledgment',async()=>{
  const s=(await open())[0];const args={p_user_id:ids.user,p_meeting_id:s.meeting_id};
  await call('zoom_begin_deletion',args);await call('zoom_begin_deletion',args);
  assert.equal((await db.query('select count(*) from zoom_rtms_deletions')).rows[0].count,1);
  const ack={...args,p_session_id:s.id,p_stream_key:s.stream_key};
  for(const change of [{p_user_id:ids.other},{p_meeting_id:ids.other},{p_session_id:ids.other},{p_stream_key:'wrong'}])assert.equal(await call('zoom_ack_deletion',{...ack,...change}),false);
  assert.equal(await call('zoom_ack_deletion',ack),true);assert.equal(await call('zoom_ack_deletion',ack),true);
  await db.query('delete from meetings where id=$1',[s.meeting_id]);
  assert.ok((await row('zoom_rtms_deletions')).purged_at);assert.equal((await db.query('select count(*) from zoom_rtms_sessions')).rows[0].count,0);
  assert.deepEqual(await call('zoom_begin_deletion',args),{ok:true,pending:0});
});

test('account deletion blocks reconnection, new native captures and manual intentions while durable cleanup is pending',async()=>{
  const s=(await open())[0];
  await db.query("insert into zoom_oauth_states(state_hash,user_id,session_hash,nonce_hash,redirect_uri,expires_at,claimed_at) values('delete-state',$1,'s','n','https://app.example.invalid/api/auth/zoom/callback',now()+interval '10 minutes',now())",[ids.user]);
  assert.deepEqual(await call('zoom_begin_deletion',{p_user_id:ids.user,p_meeting_id:null}),{ok:true,pending:1});
  assert.ok((await row('zoom_connections')).revoked_at);assert.equal((await row('zoom_connections')).token_ciphertext,null);
  await db.exec("update zoom_oauth_states set invalidated=false");
  assert.equal((await call('zoom_commit_connection',{p_state_hash:'delete-state',p_user_id:ids.user,p_id:ids.other,p_identity:{zoom_user_id:'operator',account_id:'account'},p_secret:'secret',p_expiry:new Date(Date.now()+3600000),p_scopes:[]})).length,0);
  assert.equal((await open(sessionPayload({id:ids.lease,stream_key:'e'.repeat(64),stream_id:'new'}))).length,0);
  assert.equal((await call('zoom_create_intent',{p_user_id:ids.user,p_meeting:{title:'New',meeting_url:'https://zoom.us/j/89985000930',start_time:new Date(),stage_info:{manualIntent:true,zoomMeetingId:'89985000930'}}})).length,0);
  await db.query('delete from meetings where id=$1',[s.meeting_id]);await db.query('delete from app_users where id=$1',[ids.user]);
  assert.equal((await row('zoom_rtms_account_deletions')).user_id,ids.user);assert.equal((await row('zoom_rtms_deletions')).purged_at,null);
});

test('retry cannot archive prior evidence or create a duplicate after a concurrent intention won',async()=>{
  await db.query("insert into meetings(id,user_id,status,capture_mode,start_time,calendar_event_id,stage_info) values($1,$2,'error','zoom_rtms',now(),'calendar','{}')",[ids.meeting,ids.user]);
  const meeting={title:'Meeting',meeting_url:'https://zoom.us/j/89985000930',start_time:new Date(),calendar_event_id:'calendar',stage_info:{zoomMeetingId:'89985000930'}};
  assert.equal((await call('zoom_create_intent',{p_user_id:ids.user,p_meeting:{...meeting,calendar_event_id:'manual'}})).length,1);
  assert.equal((await call('zoom_replace_intent',{p_user_id:ids.user,p_prior_id:ids.meeting,p_status:'error',p_synced:null,p_meeting:meeting})).length,0);
  assert.equal((await db.query('select calendar_event_id from meetings where id=$1',[ids.meeting])).rows[0].calendar_event_id,'calendar');
});
