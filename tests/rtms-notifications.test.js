import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../api/lib/process.js',import.meta.url),'utf8');
const notifySource=source.slice(source.indexOf('export async function notifyParticipants'),source.indexOf('// Bump this whenever')).replace('export async','async');
function fixture({native=true,deleteAt,integrations={}}={}){
  let deleted=deleteAt==='initial',reads=0;const calls=[];
  const context={APP_URL:'https://fixture.invalid/',arr:x=>Array.isArray(x)?x:[],console:{log(){},error(){}},encodeURIComponent,
    sb:async(path,options={})=>{
      if(path.startsWith('app_users?'))return[{name:'Owner',email:'owner@example.invalid',integrations}];
      if(path.startsWith('meetings?')){
        calls.push({type:'database',path,options});
        if(!options.method){reads++;if(deleteAt==='before_first_send'&&reads===2)deleted=true;}
        if(path.includes('stage_info->>deletion=is.null')&&deleted)return[];
        return[{id:'meeting'}];
      }
      throw new Error('Unexpected fixture request '+path);
    },
    getValidToken:async()=>{if(deleteAt==='token_lookup')deleted=true;return'fixture';},getBotSender:async()=>null,
    randomToken:()=> 'random-fixture',recapCoverUrl:()=>'',reportEmail:()=>({subject:'recap',text:'captured text',html:'text'}),
    sendViaGmail:async()=>{calls.push({type:'email'});return{ok:true};},
    deliverReport:async target=>{calls.push({type:'push',target});if(deleteAt==='after_first_push')deleted=true;return{ok:true};},
  };
  vm.runInNewContext(notifySource+';this.notify=notifyParticipants',context);
  return {calls,run:()=>context.notify({id:'meeting',user_id:'owner',capture_mode:native?'zoom_rtms':'inhouse_bot',stage_info:native?{rtmsSessionId:'capture'}:{},title:'Actual meeting'},{summary:'Actual discussion'},{} )};
}
test('already deleted native reports do not resolve sender tokens, claim or send',async()=>{
  const f=fixture({deleteAt:'initial'});await f.run();assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,undefined);
});
test('deletion during sender lookup prevents the atomic notification claim',async()=>{
  const f=fixture({deleteAt:'token_lookup'});await f.run();assert.equal(f.calls.some(x=>x.type==='email'),false);
  const claim=f.calls.find(x=>x.options?.body?.notified_at);assert.match(claim.path,/user_id=eq.owner/);assert.match(claim.path,/stage_info->>deletion=is.null/);assert.match(claim.path,/rtmsSessionId=eq.capture/);
});
test('deletion after a claim suppresses the next email',async()=>{
  const f=fixture({deleteAt:'before_first_send'});await f.run();assert.equal(f.calls.some(x=>x.type==='email'),false);
});
test('deletion after one accepted integration push stops remaining pushes and recap email',async()=>{
  const f=fixture({deleteAt:'after_first_push',integrations:{first:{autoPush:true,url:'https://first.invalid'},second:{autoPush:true,url:'https://second.invalid'}}});
  await f.run();assert.deepEqual(f.calls.filter(x=>x.type==='push').map(x=>x.target),['first']);assert.equal(f.calls.some(x=>x.type==='email'),false);
});
test('valid native notification preserves recap behavior and guards its final share write; legacy adds no checks',async()=>{
  const native=fixture();await native.run();assert.equal(native.calls.filter(x=>x.type==='email').length,1);assert.match(native.calls.at(-1).path,/stage_info->>deletion=is.null/);
  const legacy=fixture({native:false});await legacy.run();assert.equal(legacy.calls.filter(x=>x.type==='email').length,1);assert.equal(legacy.calls.filter(x=>x.type==='database'&&!x.options.method).length,0);
});
