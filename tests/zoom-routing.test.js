import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveZoomCaptureRoute, scheduleRtmsMeeting } from '../api/lib/zoom-routing.js';

const url = 'https://us06web.zoom.us/j/89985000930?pwd=fixture';
const now = Date.parse('2026-10-29T18:00:00Z');
const options = { meetingUrl: url, title: 'Fixture', joinAt: '2026-10-29T21:00:00Z', endAt: '2026-10-29T21:30:00Z', calendarEventId: 'event' };
function fixture(rows = [], { race, allow = true, controlError } = {}) {
  const writes = [], controls=[]; let racing = race;
  return { rows, writes, controls, deps: { now, control: async (...args)=>{controls.push(args);if(controlError)throw controlError;return {ok:true};}, gate: async () => ({ allow, maxMeetingMin: 240 }), database: async (query, request = {}) => {
    if (query==='rpc/zoom_create_intent') {writes.push({query,request});const row={id:'new',user_id:request.body.p_user_id,...request.body.p_meeting};rows.push(row);return [{...row}];}
    if (query==='rpc/zoom_replace_intent') { const prior=rows.find(row=>row.id===request.body.p_prior_id);if(!prior || prior.status!==request.body.p_status)return [];writes.push({query,request});prior.calendar_event_id+='\u0023rtms:'+prior.id;const row={id:'new',user_id:request.body.p_user_id,...request.body.p_meeting};rows.push(row);return [{...row}]; }
    const params = new URLSearchParams(query.split('?')[1]);
    const matches = row => [...params].every(([key, value]) => {
      if (['select','limit'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4,-1).split(',').includes(row[key]);
      if (value === 'is.null') return row[key] == null;
      throw new Error(`Unexpected query filter: ${key}`);
    });
    if (request.method) {
      writes.push({query,request});
      if (request.method === 'POST') { const row = { id: 'new', ...request.body }; rows.push(row); return [{...row}]; }
      if (racing) { racing(rows[0]); racing = null; }
      const matched = rows.filter(matches); for (const row of matched) Object.assign(row,request.body); return matched.map(row=>({...row}));
    }
    return rows.filter(matches).map(row=>({...row}));
  } } };
}
const row = extra => ({id:'old',user_id:'owner',calendar_event_id:'event',capture_mode:'zoom_rtms',status:'scheduled',start_time:options.joinAt,meeting_url:url,...extra});

test('unselected users and other platforms retain the browser route; missing schema cannot silently bypass selected routing', async () => {
  let reads=0; const getState=async()=>{reads++;return {selected:true,ready:true};};
  for (const platform of ['google_meet','teams']) assert.equal((await resolveZoomCaptureRoute('owner',platform,{env:{ZOOM_RTMS_ROUTING:'true'},getState})).mode,'browser');
  assert.equal((await resolveZoomCaptureRoute('owner','zoom',{env:{},getState})).mode,'browser'); assert.equal(reads,0);
  assert.equal((await resolveZoomCaptureRoute('owner','zoom',{env:{ZOOM_RTMS_ROUTING:'true'},getState:async()=>({selected:false})})).mode,'browser');
  const failed = await resolveZoomCaptureRoute('owner','zoom',{env:{ZOOM_RTMS_ROUTING:'true'},getState:async()=>{throw new Error('private database diagnostic');}});
  assert.deepEqual(failed,{mode:'rtms',ready:false,error:'zoom_configuration_unavailable'});
});
test('revoked selected connections cannot allocate a meeting or fall back to the browser', async () => {
  const route=await resolveZoomCaptureRoute('owner','zoom',{env:{ZOOM_RTMS_ROUTING:'true'},getState:async()=>({selected:true,connected:false,ready:false})});
  const f=fixture(); const result=await scheduleRtmsMeeting('owner',options,route,f.deps);
  assert.equal(result.error,'zoom_not_connected'); assert.equal(f.rows.length,0);
});
test('hosted and invited calendar entries create pending RTMS intent with real time and an independent two-hour maximum', async () => {
  for (const kind of ['hosted','invited']) {
    const f=fixture(); const result=await scheduleRtmsMeeting('owner',{...options,calendarEventId:kind},{ready:true},f.deps);
    assert.equal(result.mode,'zoom_rtms'); assert.equal(result.awaitingAuthorization,true);
    assert.equal(f.rows[0].status,'scheduled'); assert.equal(f.rows[0].capture_mode,'zoom_rtms'); assert.equal(f.rows[0].bot_id,null);
    assert.equal(f.rows[0].start_time,'2026-10-29T21:00:00.000Z'); assert.equal(f.rows[0].end_time,'2026-10-29T21:30:00.000Z');
    assert.equal(f.rows[0].stage_info.maxMeetingMin,120);
  }
});
test('existing browser capture is not replaced or duplicated across Zoom subdomains and passcodes', async () => {
  for (const status of ['scheduled','joining','recording','processing']) {
    const f=fixture([row({calendar_event_id:'other',capture_mode:'inhouse_bot',status,meeting_url:'https://zoom.us/wc/89985000930/join?pwd=different'})]);
    const result=await scheduleRtmsMeeting('owner',options,{ready:true},f.deps);
    assert.equal(result.error,'zoom_existing_capture'); assert.equal(f.writes.length,0);
  }
});
test('scheduled metadata update cannot overwrite a concurrent recording', async () => {
  const f=fixture([row()],{race:r=>{r.status='recording';r.status_synced_at='2026-10-29T18:00:01Z';}});
  const result=await scheduleRtmsMeeting('owner',options,{ready:true},f.deps);
  assert.equal(result.error,'meeting_not_armed'); assert.equal(f.rows[0].status,'recording');
});
test('opt-outs, terminal errors, past events and budgets remain effective', async () => {
  for (const status of ['skipped','error']) {
    const f=fixture([row({status})]); const result=await scheduleRtmsMeeting('owner',options,{ready:true},f.deps);
    assert.equal(result.error,'meeting_not_armed'); assert.equal(f.writes.length,0);
  }
  const past=fixture(); assert.equal((await scheduleRtmsMeeting('owner',{...options,joinAt:'2026-10-29T16:00:00Z',endAt:'2026-10-29T17:00:00Z'},{ready:true},past.deps)).error,'meeting_not_armed');
  const budget=fixture([],{allow:false}); assert.equal((await scheduleRtmsMeeting('owner',options,{ready:true},budget.deps)).error,'recording_limit'); assert.equal(budget.writes.length,0);
});
test('finished recordings are preserved without promising a new capture', async () => {
  const original=row({status:'done',recording_url:'https://media.example.test/owned.mp4'}); const f=fixture([original]);
  const result=await scheduleRtmsMeeting('owner',options,{ready:true},f.deps);
  assert.equal(result.already,true); assert.equal(result.awaitingAuthorization,false); assert.equal(f.writes.length,0);
});
test('recurring Zoom meeting ids can have separate nonoverlapping calendar intentions',async()=>{
  for(const capture_mode of ['inhouse_bot','zoom_rtms']) {
    const f=fixture([row({calendar_event_id:'other-day',capture_mode,start_time:'2026-10-30T21:00:00Z',end_time:'2026-10-30T21:30:00Z'})]);
    assert.equal((await scheduleRtmsMeeting('owner',options,{ready:true},f.deps)).ok,true);assert.equal(f.rows.length,2);
  }
});
test('manual retry with prior session creates a new recording identity and keeps original evidence',async()=>{
  const original=row({status:'error',recording_url:'r2:private/owner/old/recording.mp4',stage_info:{rtmsSessionId:'prior-session'}});const f=fixture([original]);
  const result=await scheduleRtmsMeeting('owner',{...options,manualRetry:true},{ready:true},f.deps);assert.equal(result.meeting.id,'new');assert.equal(f.rows[0].recording_url,original.recording_url);assert.equal(f.rows[0].status,'error');assert.equal(result.meeting.stage_info.rtmsSessionId,undefined);assert.equal(result.meeting.stage_info.previousAttemptId,'old');
});
test('only an explicit current manual request calls Zoom REST; future and automatic calendar intents wait for Zoom',async()=>{
  const current={...options,joinAt:'2026-10-29T17:59:00Z',endAt:'2026-10-29T18:30:00Z'};
  for(const [opts,count] of [[{...current,manualRetry:true},1],[current,0],[{...options,manualRetry:true},0]]){
    const f=fixture();const result=await scheduleRtmsMeeting('owner',opts,{ready:true},f.deps);assert.equal(result.ok,true);assert.equal(f.controls.length,count);if(count)assert.deepEqual(f.controls[0],['owner','new','start']);
  }
  const failure=fixture([],{controlError:Object.assign(new Error('private provider token'),{status:403})});const result=await scheduleRtmsMeeting('owner',{...current,manualRetry:true},{ready:true},failure.deps);assert.equal(result.error,'zoom_rtms_control_failed');assert.equal(result.ok,undefined);assert.equal(result.awaitingAuthorization,true);
});
test('manual retry after calendar end is a current new attempt with original schedule retained as metadata',async()=>{
  const f=fixture();const result=await scheduleRtmsMeeting('owner',{...options,joinAt:'2026-10-29T16:00:00Z',endAt:'2026-10-29T17:00:00Z',manualRetry:true},{ready:true},f.deps);
  assert.equal(result.startRequested,true);assert.equal(result.meeting.start_time,new Date(now).toISOString());assert.equal(result.meeting.end_time,null);assert.equal(result.meeting.stage_info.calendarStart,'2026-10-29T16:00:00Z');
});
