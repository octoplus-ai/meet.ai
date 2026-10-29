import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMeetingNotifier } from '../api/lib/notifications.js';
import { notificationDatabase, notificationRest, seedNotifications, ids } from './helpers/notification-db.mjs';
let db;
before(async()=>{db=await notificationDatabase();});after(async()=>{await db?.close();});beforeEach(async()=>seedNotifications(db,{native:true}));
const remove = () => db.query("update meetings set stage_info=stage_info||'{\"deletion\":\"requested\"}'::jsonb where id=$1",[ids.meeting]);
function fixture({ deleteAt, integrations = {} }={}) {
  const calls=[];let checks=0;
  const rest=notificationRest(db);
  const notifier=createMeetingNotifier({database:async(path,options)=>{
    if(path.startsWith('meetings?') && path.includes('select=id,user_id,status')) {checks++;if(deleteAt==='before_first_send'&&checks===1)await remove();}
    return rest(path,options);
  },ownerToken:async()=>{if(deleteAt==='token_lookup')await remove();return 'fixture-token';},botSender:async()=>null,
    token:()=>randomUUID().replaceAll('-',''),logger:{log(){},error(){}},
    send:async()=>{calls.push('email');return{ok:true,status:200,id:'message-fixture'};},
    push:async target=>{calls.push(target);if(deleteAt==='after_first_push')await remove();return{ok:true,status:200};},
  });
  return { calls, run: async()=>{if(deleteAt==='initial')await remove();if(Object.keys(integrations).length)await db.query('update app_users set integrations=$1 where id=$2',[integrations,ids.user]);return notifier.notify({id:ids.meeting,user_id:ids.user});} };
}
test('already deleted native report never queues or sends',async()=>{const f=fixture({deleteAt:'initial'});await f.run();assert.deepEqual(f.calls,[]);assert.equal((await db.query('select count(*) from meeting_notification_deliveries')).rows[0].count,0);});
test('deletion during sender lookup cancels the claimed delivery before Gmail',async()=>{const f=fixture({deleteAt:'token_lookup'});await f.run();assert.deepEqual(f.calls,[]);assert.equal((await db.query('select status from meeting_notification_deliveries')).rows[0].status,'cancelled');});
test('deletion after claim suppresses email',async()=>{const f=fixture({deleteAt:'before_first_send'});await f.run();assert.deepEqual(f.calls,[]);});
test('deletion during one push stops subsequent deliveries',async()=>{const f=fixture({deleteAt:'after_first_push',integrations:{first:{autoPush:true,url:'https://first.invalid'},second:{autoPush:true,url:'https://second.invalid'}}});await f.run();assert.equal(f.calls.filter(x=>x!=='email').length,1);assert.equal(f.calls.filter(x=>x==='email').length,1);});
test('native and legacy recaps use the same delivery ledger',async()=>{const native=fixture();await native.run();assert.deepEqual(native.calls,['email']);assert.ok((await db.query('select notified_at from meetings')).rows[0].notified_at);await seedNotifications(db);const legacy=fixture();await legacy.run();assert.deepEqual(legacy.calls,['email']);});
