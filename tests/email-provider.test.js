import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {sendViaGmail} from '../api/lib/email.js';

const message={to:'recipient@example.invalid',fromAddress:'owner@example.invalid',subject:'Fixture',text:'Fixture',html:'Fixture'};
test('Gmail preserves confirmed provider ID and classifies auth versus quota rejections',async(t)=>{
  let response=Response.json({id:'provider-confirmed-id'});const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return response;});
  const success=await sendViaGmail('fixture',message);assert.equal(success.ok,true);assert.equal(success.id,'provider-confirmed-id');assert.ok(calls[0].options.signal);
  response=Response.json({error:{errors:[{reason:'userRateLimitExceeded'}]}},{status:403});const quota=await sendViaGmail('fixture',message);assert.equal(quota.error,'send_failed');assert.equal(quota.status,403);
  response=Response.json({error:{errors:[{reason:'insufficientPermissions'}]}},{status:403});assert.equal((await sendViaGmail('fixture',message)).error,'needScope');
});
test('a network failure after sending has an explicitly uncertain outcome',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('network unavailable');});const result=await sendViaGmail('fixture',message);assert.equal(result.ok,false);assert.equal(result.uncertain,true);assert.equal(result.error,'send_outcome_unknown');
});
test('Google token refresh has a bounded request and returns disconnected after refresh rejection',async()=>{
  const source=(await readFile(new URL('../api/lib/google.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
  const deadlines=[],logs=[];let failure=false;
  const context={Date,URLSearchParams,encodeURIComponent,process:{env:{}},AbortSignal:{timeout:ms=>{deadlines.push(ms);return 'bounded';}},
    console:{error:(...args)=>logs.push(args)},sb:async()=>[{access_token:'expired-fixture',refresh_token:'refresh-fixture',expiry:'2020-01-01'}],
    fetch:async(_url,options)=>{assert.equal(options.signal,'bounded');if(failure)throw new Error('network');return{json:async()=>({error:'invalid_grant',error_description:'Never log provider details'})};},
  };
  vm.createContext(context);vm.runInContext(source,context);
  assert.equal(await context.getValidToken('fixture'),null);assert.deepEqual(deadlines,[8000]);assert.equal(JSON.stringify(logs).includes('Never log'),false);
  failure=true;assert.equal(await context.getValidToken('fixture',{timeoutMs:100}),null);assert.deepEqual(deadlines,[8000,100]);
});
