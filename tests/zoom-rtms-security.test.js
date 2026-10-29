import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable,PassThrough} from 'node:stream';
import {encryptZoomSecret,decryptZoomSecret,verifyZoomWebhook,zoomRawBody,safeRtmsServerUrls,requireZoomMutation,zoomStateCookie,zoomRequestOrigin} from '../api/lib/zoom-security.js';
import {rtmsMedia,rtmsTurns,safeRtmsError} from '../api/lib/zoom-delivery.js';
const env={ZOOM_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
test('encrypted OAuth tokens authenticate both ciphertext and owner/generation binding',()=>{
  const token={accessToken:'private access',refreshToken:'private refresh'},encrypted=encryptZoomSecret(token,'user:connection',env);
  assert.equal(encrypted.includes('private'),false);assert.deepEqual(decryptZoomSecret(encrypted,'user:connection',env),token);
  assert.notEqual(encrypted,encryptZoomSecret(token,'user:connection',env));
  assert.throws(()=>decryptZoomSecret(encrypted,'other:connection',env),/zoom_reconnect_required/);
  const parts=encrypted.split('.');parts[3]='A'+parts[3].slice(1);assert.throws(()=>decryptZoomSecret(parts.join('.'),'user:connection',env));
  assert.throws(()=>encryptZoomSecret(token,'x',{ZOOM_TOKEN_ENCRYPTION_KEY:'short'}),/zoom_not_configured/);
});
test('webhook signature authenticates raw bytes and rejects old/future timestamps and parsed objects',async()=>{
  const raw=Buffer.from('{ "event": "meeting.rtms_started" }'),ts=String(Math.floor(Date.now()/1000)),secret='fixture-webhook';
  const headers={'x-zm-request-timestamp':ts,'x-zm-signature':'v0='+createHmac('sha256',secret).update(`v0:${ts}:`).update(raw).digest('hex')};
  assert.equal(verifyZoomWebhook(raw,headers,secret),true);assert.equal(verifyZoomWebhook(JSON.stringify(JSON.parse(raw)),headers,secret),false);
  assert.equal(verifyZoomWebhook(raw,headers,secret,Date.now()+301000),false);assert.equal(verifyZoomWebhook(raw,headers,secret,Date.now()-301000),false);
  assert.equal(verifyZoomWebhook(JSON.parse(raw),headers,secret),false);await assert.rejects(zoomRawBody({body:JSON.parse(raw)}),/raw_body_required/);
  await assert.rejects(zoomRawBody({body:Buffer.alloc(262145)}),/body_too_large/);
});
test('RTMS URLs cannot route SDK traffic to arbitrary or credentialed endpoints',()=>{
  assert.equal(safeRtmsServerUrls('wss://rtms.zoom.us:443/path,wss://media.zoom.com/path'),'wss://rtms.zoom.us:443/path,wss://media.zoom.com/path');
  for(const value of ['wss://127.0.0.1','wss://zoom.us.evil.test','wss://evilzoom.us','ws://rtms.zoom.us','wss://token@rtms.zoom.us','wss://rtms.zoom.us:8443','wss://rtms.zoom.us/#secret','']) assert.throws(()=>safeRtmsServerUrls(value));
});

test('webhook reads Vercel restored raw bytes without invoking its lazy JSON parser',async()=>{
  const raw=Buffer.from('{  "event":"endpoint.url_validation", "label":"á" }');
  const req=Readable.from([raw]);for await(const _ of req) { /* Vercel consumes the original request. */ }
  const restored=new PassThrough(),originalOn=req.on.bind(req);
  req.read=restored.read.bind(restored);
  req.on=req.addListener=(name,callback)=>name==='data'||name==='end'?restored.on(name,callback):originalOn(name,callback);
  restored.end(raw);
  Object.defineProperty(req,'body',{get(){throw new Error('JSON parser must not run before signature verification');}});
  assert.deepEqual(await zoomRawBody(req),raw);
});
test('mutations require exact app Origin and JSON; OAuth nonce is a scoped secure cookie',()=>{
  const prior=process.env.APP_URL;process.env.APP_URL='https://app.example.invalid';
  try{requireZoomMutation({headers:{host:'app.example.invalid',origin:process.env.APP_URL,'content-type':'application/json'}});for(const origin of [undefined,'https://evil.example.invalid','null']) assert.throws(()=>requireZoomMutation({headers:{host:'app.example.invalid',origin,'content-type':'application/json'}}),/invalid_origin/);}finally{if(prior==null)delete process.env.APP_URL;else process.env.APP_URL=prior;}
  assert.match(zoomStateCookie('abc'),/Path=\/api\/auth\/zoom; HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
});
test('delivery admits only this session private recording and sanitizes metadata/errors',()=>{
  const session={user_id:'u',meeting_id:'m',id:'s',max_meeting_min:120};
  const good=rtmsMedia({recordingUrl:'r2:private/u/m/recording.mp4',durationMin:2,stage:{rtmsSessionId:'evil',token:'secret'}},session);
  assert.equal(good.stage_info.rtmsSessionId,'s');assert.equal(good.stage_info.token,undefined);
  for(const recordingUrl of ['https://evil.test/video','r2:private/other/m/recording.mp4','r2:private/u/other/recording.mp4','r2:private/u/m/../recording.mp4','r2:private/u/m/recording.mp4?key=secret']) assert.throws(()=>rtmsMedia({recordingUrl},session),/invalid_media/);
  assert.throws(()=>rtmsMedia({durationMin:122},session),/invalid_duration/);assert.equal(safeRtmsError('token=secret error'),'RTMS_PROCESSING_FAILED');
  assert.throws(()=>rtmsTurns({turns:[{text:'actual speech',t:'javascript:bad'}]}),/invalid_transcript/);assert.deepEqual(rtmsTurns({turns:[{text:'   '}]}),[]);
});
test('two allowed app origins still require same-origin mutations and reject forwarded-host injection',()=>{
  const prevApp=process.env.APP_URL,prevOrigins=process.env.ZOOM_APP_ORIGINS;
  process.env.APP_URL='https://primary.example.invalid';process.env.ZOOM_APP_ORIGINS='https://primary.example.invalid,https://alias.example.invalid';
  try{
    for(const host of ['primary.example.invalid','alias.example.invalid'])requireZoomMutation({headers:{host,origin:`https://${host}`,'content-type':'application/json'}});
    assert.throws(()=>requireZoomMutation({headers:{host:'alias.example.invalid',origin:'https://primary.example.invalid','content-type':'application/json'}}),/invalid_origin/);
    for(const host of ['evil.example.invalid','primary.example.invalid.evil.test','primary.example.invalid,evil.test','primary.example.invalid:443','user@primary.example.invalid'])assert.throws(()=>zoomRequestOrigin({headers:{host}}),/invalid_origin/);
  }finally{if(prevApp==null)delete process.env.APP_URL;else process.env.APP_URL=prevApp;if(prevOrigins==null)delete process.env.ZOOM_APP_ORIGINS;else process.env.ZOOM_APP_ORIGINS=prevOrigins;}
});
