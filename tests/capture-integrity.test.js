import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {partialCaptureSummary, PARTIAL_CAPTURE_NOTICES as notices} from '../api/lib/capture-integrity.js';

test('only explicit trusted capture evidence adds a warning; no evidence is inferred from summary text',()=>{
  const original='The transcript says renderer_unresponsive. Original summary stays intact.';
  for(const stage of [undefined,{},[],{captureInterrupted:'true'},{recovery:{fullMeetingRecovered:'false'}},{endReason:'normal'}, {captureInterrupted:false,recovery:{fullMeetingRecovered:true}}]) assert.equal(partialCaptureSummary(original,stage),original);
  for(const stage of [{captureInterrupted:true},{recovery:{fullMeetingRecovered:false}},...['renderer_unresponsive','renderer_crashed','renderer_disconnected'].map(endReason=>({endReason}))]) assert.equal(partialCaptureSummary(original,stage),notices.en+'\n\n'+original);
});
test('Spanish detected language adds one exact notice and preserves the original summary',()=>{
  const original='Se revisaron las decisiones.\n\nSe acordó el próximo paso.';
  for(const languageCode of ['es','es-AR','ES_uy']){
    const stage={captureInterrupted:true,languageCode};const first=partialCaptureSummary(original,stage);
    assert.equal(first,notices.es+'\n\n'+original);assert.equal(partialCaptureSummary(first,stage),first);
  }
  const english=partialCaptureSummary(original,{captureInterrupted:true,languageCode:'en'});
  assert.equal(partialCaptureSummary(english,{captureInterrupted:true,languageCode:'es'}),notices.es+'\n\n'+original);
  assert.equal(partialCaptureSummary('',{captureInterrupted:true}),'');
});

const source=await readFile(new URL('../api/lib/process.js',import.meta.url),'utf8');
const reanalyzeSource=source.slice(source.indexOf('export async function reanalyzeStored')).replace('export async','async');
function fixture({transcript='[0:00] Person: A sufficiently long synthetic transcript with actual captured information.',summary='Original stored summary.',aiSummary='Regenerated summary.'}={}){
  let report={summary,transcript,participants:[],coaching:{}};let calls=0;
  const context={ANALYSIS_VERSION:13,partialCaptureSummary,analyzeTranscript:async()=>{calls++;return{summary:aiSummary,scores:{}};},assignTimestamps(){},parseStoredTurns:()=>[],sanitizeSpeakerMap:()=>({}),normalizeStoredTranscript:text=>text,preserveCameraMetadata:()=>({}),
    sb:async(_path,options={})=>{if(options.method==='PATCH'){report={...report,...options.body};return null;}return[report];},
  };
  vm.createContext(context);vm.runInContext(reanalyzeSource,context);
  return{run:()=>context.reanalyzeStored({id:'fixture',stage_info:{captureInterrupted:true,recovery:{fullMeetingRecovered:false},languageCode:'es'}}),get report(){return report;},get calls(){return calls;}};
}
test('stored reanalysis cannot discard or duplicate the partial-capture notice',async()=>{
  const f=fixture();await f.run();assert.equal(f.report.summary,notices.es+'\n\nRegenerated summary.');await f.run();assert.equal(f.report.summary,notices.es+'\n\nRegenerated summary.');
});
test('short transcript and failed reanalysis preserve original content with the capture notice',async()=>{
  const short=fixture({transcript:'Short.'});await short.run();assert.equal(short.calls,0);assert.equal(short.report.summary,notices.es+'\n\nOriginal stored summary.');
  const empty=fixture({aiSummary:''});await empty.run();assert.equal(empty.report.summary,notices.es+'\n\nOriginal stored summary.');
});
