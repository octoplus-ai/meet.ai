import test, {before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMeetingNotifier} from '../api/lib/notifications.js';
import {notificationDatabase,notificationRest,seedNotifications,ids} from './helpers/notification-db.mjs';
let db,rest;
before(async()=>{db=await notificationDatabase();rest=notificationRest(db);});after(async()=>{await db?.close();});beforeEach(async()=>seedNotifications(db));
const meeting={id:ids.meeting,user_id:ids.user};
const rows=async()=> (await db.query('select * from meeting_notification_deliveries order by recipient')).rows;
const ready=()=>db.query("update meeting_notification_deliveries set next_attempt_at=now()-interval '1 second' where status='retry'");
function fixture({send,ownerToken,botSender,database}={}){
  const sent=[];const notifier=createMeetingNotifier({database:database||rest,ownerToken:ownerToken||(async()=> 'owner-token'),botSender:botSender||(async()=>null),
    token:()=>randomUUID().replaceAll('-',''),logger:{log(){},error(){}},
    send:async(token,message)=>{sent.push({token,to:message.to,from:message.fromAddress});return send?send(token,message):{ok:true,status:200,id:'gmail-fixture'};},
  });return{sent,...notifier};
}
test('unavailable Gmail leaves durable retry instead of claiming a recap as sent',async()=>{
  const offline=fixture({ownerToken:async()=>null});await offline.notify(meeting);assert.equal(offline.sent.length,0);
  assert.equal((await rows())[0].status,'retry');assert.equal((await rows())[0].error_code,'no_sender');assert.equal((await db.query('select notified_at from meetings')).rows[0].notified_at,null);
  await ready();const online=fixture();await online.drain();assert.equal(online.sent.length,1);assert.equal((await rows())[0].status,'sent');assert.ok((await db.query('select notified_at from meetings')).rows[0].notified_at);
});
test('partial success retries only rejected recipients, and report links exist before sending',async()=>{
  await seedNotifications(db,{attendees:[{email:'guest@example.invalid',responseStatus:'accepted'}]});
  const first=fixture({send:async(_token,message)=>{const stored=(await db.query('select shares from meetings')).rows[0].shares;assert.ok(stored.some(x=>x.email===message.to&&x.token));return message.to.startsWith('guest')?{ok:false,status:429,error:'send_failed'}:{ok:true,status:200,id:'accepted-owner'};}});
  await first.notify(meeting);assert.equal(first.sent.length,2);assert.deepEqual((await rows()).map(x=>[x.recipient,x.status]),[['guest@example.invalid','retry'],['owner@example.invalid','sent']]);
  await ready();const second=fixture();await second.notify(meeting);assert.deepEqual(second.sent.map(x=>x.to),['guest@example.invalid']);assert.ok((await db.query('select notified_at from meetings')).rows[0].notified_at);
});
test('concurrent report callbacks enqueue once and only one lease can send each recipient',async()=>{
  const f=fixture();await Promise.all([f.notify(meeting),f.notify(meeting),f.notify(meeting)]);assert.equal(f.sent.length,1);assert.equal((await rows()).length,1);
  await f.drain();assert.equal(f.sent.length,1);
});
test('explicit bot authentication rejection can fall back to owner Gmail',async()=>{
  const f=fixture({botSender:async()=>({token:'bot-token',fromAddress:'bot@example.invalid'}),send:async(token)=>token==='bot-token'?{ok:false,status:403,error:'needScope'}:{ok:true,status:200,id:'owner-message'}});
  await f.notify(meeting);assert.deepEqual(f.sent.map(x=>x.token),['bot-token','owner-token']);assert.equal((await rows())[0].status,'sent');
});
test('ambiguous network sends never fall back or automatically resend',async()=>{
  const f=fixture({botSender:async()=>({token:'bot-token',fromAddress:'bot@example.invalid'}),send:async()=>({ok:false,error:'send_outcome_unknown',uncertain:true})});
  await f.notify(meeting);await f.notify(meeting);await f.drain();assert.equal(f.sent.length,1);assert.equal((await rows())[0].status,'uncertain');assert.equal((await db.query('select notified_at from meetings')).rows[0].notified_at,null);
});
test('lost delivery acknowledgement stays uncertain instead of duplicating accepted mail',async()=>{
  let rejected=false;const f=fixture({database:async(path,options)=>{if(path==='rpc/finish_meeting_notification'&&options.body.p_status==='sent'&&!rejected){rejected=true;throw new Error('db unavailable');}return rest(path,options);}});
  await f.notify(meeting);await f.notify(meeting);assert.equal(f.sent.length,1);assert.equal((await rows())[0].status,'uncertain');
});
test('expired sending lease is marked uncertain and cannot be reclaimed automatically',async()=>{
  await rest('rpc/enqueue_meeting_notifications',{body:{p_meeting_id:ids.meeting,p_user_id:ids.user,p_targets:[{kind:'email',recipient:'owner@example.invalid',token:'a'.repeat(32),magic:'b'.repeat(32)}]}});
  const job=(await rows())[0];await rest('rpc/claim_meeting_notification',{body:{p_id:job.id,p_lease:randomUUID()}});await db.query("update meeting_notification_deliveries set lease_until=now()-interval '1 second'");
  const f=fixture();await f.drain();assert.equal(f.sent.length,0);assert.equal((await rows())[0].status,'uncertain');
});
test('old notified timestamps are not replayed and unfinished reports never queue',async()=>{
  await seedNotifications(db,{notified:true});const f=fixture();await f.notify(meeting);assert.equal((await rows()).length,0);assert.equal(f.sent.length,0);
  await seedNotifications(db,{report:false});await f.notify(meeting);assert.equal((await rows()).length,0);
  await db.query("update meetings set status='recording'");await f.notify(meeting);assert.equal((await rows()).length,0);
});
test('participant preference changes and revoked shares cancel unsent deliveries',async()=>{
  await seedNotifications(db,{attendees:[{email:'guest@example.invalid'}]});const offline=fixture({ownerToken:async()=>null});await offline.notify(meeting);await ready();
  await db.query('update app_users set sharing_prefs=$1 where id=$2',[{autoRecap:false},ids.user]);await db.query("update meetings set shares='[]'");
  const f=fixture();await f.drain({limit:10});assert.equal(f.sent.length,0);assert.equal((await rows()).every(x=>x.status==='cancelled'),true);
});
test('delivery table and RPCs are inaccessible to browser roles',async()=>{
  for(const role of ['anon','authenticated']){
    const privileges=await db.query("select has_table_privilege($1,'meeting_notification_deliveries','select') t,has_function_privilege($1,'enqueue_meeting_notifications(uuid,uuid,jsonb)','execute') enqueue,has_function_privilege($1,'claim_meeting_notification(uuid,uuid)','execute') claim,has_function_privilege($1,'finish_meeting_notification(uuid,uuid,text,text,text)','execute') finish",[role]);
    assert.deepEqual(privileges.rows[0],{t:false,enqueue:false,claim:false,finish:false});
  }
});
