// Offline synthetic fixtures only: these tests never call an AI provider or a
// production database. Implementation is gated on explicit provider approval.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTranslationHandler } from '../api/report-translation.js';
import { reportTranslationSource, protectedTranslationItem, restoreTranslation, translateReport, translationMeeting } from '../api/lib/report-translation.js';
import { rtmsShareProof } from '../api/lib/rtms-media.js';
import { zoomDatabase, seed, ids } from './helpers/zoom-db.mjs';

const priorProofKey=process.env.ZOOM_TOKEN_ENCRYPTION_KEY;
process.env.ZOOM_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
after(()=>{if(priorProofKey===undefined)delete process.env.ZOOM_TOKEN_ENCRYPTION_KEY;else process.env.ZOOM_TOKEN_ENCRYPTION_KEY=priorProofKey;});
const token = 'a'.repeat(48);
const baseReport = () => ({ summary: 'Alex proposed 25 licenses for https://example.invalid/project.\n\nNext review: 2026-11-01.', topics: ['Planning'],
  key_questions: [{ q: 'Can Alex deliver 25?', a: 'Review the 2 blockers.', t: '1:23' }],
  action_items: [{ id: 'fixture-task-id', owner: 'Alex', task: 'Deliver 25 licenses', due: '2026-11-01', t: '1:25', done: true }], next_steps: ['Review progress'],
  chapters: [{ title: 'Plan', summary: 'Alex explains 25 licenses.', t: '0:05', points: ['Agree on scope'] }], highlights: [{ text: '25 is the target.', t: '1:30' }],
  coaching: { strengths: ['Clear message'], improvements: ['Shorten introduction'], tips: ['Ask a question'], speakerTimeline: [{name:'Alex',t:0}], pipUrl: 'https://private.invalid/secret', pitch: { overall: 'Specific proposal', speakers: [{ name: 'Alex', score: 70, worked: ['Clear target'], improve: ['Explain value'], sayNextTime: 'Deliver 25 licenses' }] } },
  participants: [{ name: 'Alex' }], transcript: [{ text: 'PRIVATE TRANSCRIPT MUST NOT BE SENT' }], scores: { overall: 75 } });
const meeting = () => ({ id: ids.meeting, user_id: ids.user, title: 'Planning call', status: 'done', capture_mode: 'inhouse_bot', link_access: 'restricted', stage_info: {}, reports: baseReport(), shares: [{token,role:'Viewer'}] });
const body = () => ({ meetingId: ids.meeting, shareToken: token, lang: 'fr' });
const req = (overrides = {}) => ({ method: 'POST', headers: {}, body: body(), ...overrides });
const response = () => ({ code:200,headers:{},status(code){this.code=code;return this;},setHeader(key,value){this.headers[key]=value;},json(value){this.value=value;return this;} });

test('translation projection excludes secrets/transcript and preserves structural facts', () => {
  const original=meeting(), before=JSON.stringify(original), source=reportTranslationSource(original);
  const serialized=JSON.stringify(source);
  for(const forbidden of [token,'PRIVATE TRANSCRIPT','private.invalid','speakerTimeline','om_session']) assert.equal(serialized.includes(forbidden),false);
  assert.equal(source.projection.report.action_items[0].owner,'Alex');
  assert.equal(source.projection.report.action_items[0].id,'fixture-task-id');
  assert.equal(source.projection.report.action_items[0].due,'2026-11-01');
  assert.equal(source.projection.report.action_items[0].t,'1:25');
  assert.equal(source.projection.report.coaching.pitch.speakers[0].score,70);
  assert.equal(source.items.some(item=>['id','owner','due','t','name'].includes(item.path.at(-1))),false);
  assert.equal(JSON.stringify(original),before);
  assert.match(source.sourceHash,/^[a-f0-9]{64}$/);
  const changed=meeting();changed.reports.summary+=' Changed.';
  assert.notEqual(source.sourceHash,reportTranslationSource(changed).sourceHash);
});

test('protected names, numeric facts and URLs survive translation exactly; missing/duplicated markers fail', () => {
  const item=protectedTranslationItem({id:'s0',path:[],text:'Alex has 25 at https://example.invalid/a and 2.5.'},['Alex']);
  assert.equal(restoreTranslation(item,'FR: '+item.text),'FR: Alex has 25 at https://example.invalid/a and 2.5.');
  assert.throws(()=>restoreTranslation(item,item.text.replace('⟪P0⟫','Someone')),/translation_invalid/);
  assert.throws(()=>restoreTranslation(item,item.text+' ⟪P0⟫'),/translation_invalid/);
});

test('provider output can only replace allowlisted text leaves and never report structure', async () => {
  const original=meeting(), source=reportTranslationSource(original), calls=[];
  const translated=await translateReport(source,'fr',{apiKey:'fixture-only',fetcher:async(url,options)=>{
    const sent=JSON.parse(options.body);calls.push(sent);
    const items=JSON.parse(sent.messages[0].content).items.map(item=>({...item,text:'FR: '+item.text}));
    return new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({items})}]}),{status:200});
  }});
  assert.ok(calls.length>0);assert.match(calls[0].system,/French/);
  assert.equal(translated.report.summary,'FR: '+original.reports.summary);
  assert.deepEqual(translated.report.action_items[0],{...original.reports.action_items[0],task:'FR: '+original.reports.action_items[0].task});
  assert.equal(translated.report.coaching.pitch.speakers[0].name,'Alex');
  assert.equal(translated.report.coaching.pitch.speakers[0].score,70);
  assert.equal(original.reports.summary.startsWith('FR:'),false);
  await assert.rejects(translateReport(source,'fr',{apiKey:'fixture',fetcher:async()=>new Response(JSON.stringify({content:[{type:'text',text:'{"items":[]}'}]}))}),/translation_invalid/);
});

test('personal shares require the report verification proof and exact meeting scope', async () => {
  const grant=async()=>({meeting:meeting(),email:'alex@example.invalid'}), none=async()=>[];
  const read=cookie=>translationMeeting(req({headers:{cookie}}),body(),{database:none,resolveShare:grant});
  assert.equal(await read(''),null);
  assert.equal((await read(`om_v_${token}=1`)).id,ids.meeting);
  assert.equal(await translationMeeting(req({headers:{cookie:`om_v_${token}=1`}}),{...body(),meetingId:ids.other},{database:none,resolveShare:grant}),null);
  assert.equal(await translationMeeting(req({headers:{cookie:`om_v_${token}=1`}}),body(),{database:none,resolveShare:async()=>null}),null,'revoked token');
  const rtms={...meeting(),capture_mode:'zoom_rtms'};
  const rtmsGrant=async()=>({meeting:rtms,email:'alex@example.invalid'});
  assert.equal(await translationMeeting(req({headers:{cookie:`om_v_${token}=1`}}),body(),{database:none,resolveShare:rtmsGrant}),null);
  const proof=rtmsShareProof(token,'alex@example.invalid');
  assert.equal((await translationMeeting(req({headers:{cookie:`om_v_${token}=${proof}`}}),body(),{database:none,resolveShare:rtmsGrant})).id,ids.meeting);
  assert.equal(await translationMeeting(req({headers:{cookie:`om_v_${token}=${proof}`}}),body(),{database:none,resolveShare:async()=>({meeting:{...rtms,stage_info:{deletion:true}},email:'alex@example.invalid'})}),null);
});

test('public shares honor restricted/revoked access and owner sessions are scoped', async () => {
  const noShare=async()=>null;
  assert.equal(await translationMeeting(req(),body(),{database:async()=>[meeting()],resolveShare:noShare}),null);
  assert.equal((await translationMeeting(req(),body(),{database:async()=>[{...meeting(),link_access:'public'}],resolveShare:noShare})).id,ids.meeting);
  const paths=[];
  const database=async path=>{paths.push(path);return path.startsWith('sessions?')?[{user_id:ids.user}]:[meeting()];};
  assert.equal((await translationMeeting(req({headers:{cookie:'om_session=fixture'}}),{meetingId:ids.meeting,lang:'es'},{database,resolveShare:noShare})).id,ids.meeting);
  assert.match(paths[0],/expires_at=gt/);assert.ok(paths[1].includes(`user_id=eq.${ids.user}`));
});

test('handler rejects arbitrary client texts and missing access before cache or provider work', async () => {
  let spent=0;
  const handler=createTranslationHandler({authorize:async()=>null,database:async()=>{spent++;},generate:async()=>{spent++;}});
  for(const patch of [{body:{...body(),texts:['arbitrary']}},{body:{...body(),lang:'__proto__'}},{method:'GET'},{}]) {
    const res=response();await handler(req(patch),res);assert.ok([400,403,405].includes(res.code));
  }
  assert.equal(spent,0);
});

test('cache hits and concurrent leases avoid paid duplicate generation', async () => {
  for(const [claim,code]of [[{state:'ready',payload:{title:'Cached',report:{summary:'Cached'}}},200],[{state:'pending'},202],[{state:'limit'},429]]){
    let spent=0;const res=response();await createTranslationHandler({authorize:async()=>meeting(),database:async()=>claim,generate:async()=>{spent++;}})(req(),res);
    assert.equal(res.code,code);assert.equal(spent,0);if(code===202)assert.equal(res.headers['Retry-After'],'5');
  }
});

test('revocation or edited source during translation fails closed and releases only own lease', async () => {
  for(const mode of ['revoke','edit','success']){
    let reads=0;const writes=[],res=response();
    const handler=createTranslationHandler({authorize:async()=>{reads++;if(reads>1&&mode==='revoke')return null;const m=meeting();if(reads>1&&mode==='edit')m.reports.summary+=' edited';return m;},
      database:async(path,options)=>{writes.push([path,options.body]);return path.includes('claim_')?{state:'claimed'}:true;},generate:async source=>source.projection});
    await handler(req(),res);assert.equal(res.code,mode==='revoke'?403:mode==='edit'?409:200);
    assert.equal(writes.length,2);assert.equal(writes[0][1].p_lease,writes[1][1].p_lease);
    assert.equal(writes[1][1].p_payload===null,mode!=='success');
  }
});

test('provider/database errors never echo sensitive content or secrets', async()=>{
  const res=response();await createTranslationHandler({authorize:async()=>meeting(),database:async()=>{throw Error('secret credentials and report text');}})(req(),res);
  assert.equal(res.code,503);assert.deepEqual(res.value,{error:'translation_unavailable'});
});

test('private cache migration enforces leases, deduplication, retry limits and service-only access', async()=>{
  const db=await zoomDatabase();
  try {
    await seed(db);
    await db.query("insert into meetings(id,user_id,title,status,capture_mode,stage_info) values($1,$2,'Fixture','done','inhouse_bot','{}')",[ids.meeting,ids.user]);
    await db.query("insert into reports(meeting_id,user_id,summary) values($1,$2,'Fixture summary')",[ids.meeting,ids.user]);
    await db.exec(await readFile(new URL('../migrations/20261029_report_translations.sql',import.meta.url),'utf8'));
    const claim=async(hash='a'.repeat(64),lang='fr',lease=ids.lease)=>(await db.query('select claim_report_translation($1,$2,$3,$4,$5) as result',[ids.meeting,ids.user,hash,lang,lease])).rows[0].result;
    assert.equal((await claim()).state,'claimed');assert.equal((await claim()).state,'pending');
    assert.equal((await db.query('select finish_report_translation($1,$2,$3,$4,$5) as ok',[ids.meeting,'a'.repeat(64),'fr',ids.other,{title:'wrong lease'}])).rows[0].ok,false);
    assert.equal((await db.query('select finish_report_translation($1,$2,$3,$4,$5) as ok',[ids.meeting,'a'.repeat(64),'fr',ids.lease,{title:'French',report:{summary:'Fixture translated'}}])).rows[0].ok,true);
    assert.equal((await claim()).state,'ready');
    await db.exec("set role anon");
    await assert.rejects(db.query('select * from report_translations'),/permission denied/);
    await assert.rejects(db.query('select claim_report_translation($1,$2,$3,$4,$5)',[ids.meeting,ids.user,'b'.repeat(64),'es',ids.lease]),/permission denied/);
    await db.exec('reset role');
    assert.equal((await claim('b'.repeat(64),'es')).state,'claimed');
    await db.query("update report_translations set attempts=3,lease_until=now()-interval '1 minute' where source_hash=$1",['b'.repeat(64)]);
    assert.equal((await claim('b'.repeat(64),'es')).state,'limit');
    assert.equal((await claim('c'.repeat(64),'de')).state,'claimed');
    assert.equal((await claim('d'.repeat(64),'it')).state,'claimed');
    assert.equal((await claim('e'.repeat(64),'pt')).state,'pending','at most two concurrent generation leases per meeting');
    await db.query("update report_translations set status='ready',payload='{}',lease_id=null,lease_until=null where meeting_id=$1",[ids.meeting]);
    await db.query("insert into report_translations(meeting_id,source_hash,lang,status,payload) select $1,lpad(to_hex(n),64,'0'),'en','ready','{}'::jsonb from generate_series(1,60) n",[ids.meeting]);
    assert.equal((await claim('e'.repeat(64),'pt')).state,'limit','daily generation budget is enforced before provider work');
    await db.query("update meetings set capture_mode='zoom_rtms',stage_info='{"+ '"deletion":true' +"}' where id=$1",[ids.meeting]);
    assert.equal((await claim('c'.repeat(64),'de')).state,'unavailable');
    await db.query('delete from reports where meeting_id=$1',[ids.meeting]);await db.query('delete from meetings where id=$1',[ids.meeting]);
    assert.equal((await db.query('select count(*)::integer as n from report_translations')).rows[0].n,0);
  } finally {await db.close();}
});
