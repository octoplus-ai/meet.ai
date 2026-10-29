import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { prepareSql } from '../docs/sql/prepare-zoom-rtms.mjs';

const source = await readFile(new URL('../migrations/20261029_zoom_rtms.sql',import.meta.url),'utf8');
const artifact = prepareSql(source);
async function base() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table app_users(id uuid primary key,email text,auto_join boolean default true);
    create table meetings(id uuid primary key default gen_random_uuid(),user_id uuid references app_users(id),title text,source text,meeting_url text,status text,capture_mode text,start_time timestamptz,end_time timestamptz,stage_info jsonb,error text,status_synced_at timestamptz,recording_url text,cover_url text,duration_min integer,calendar_event_id text,created_at timestamptz default now());
    create unique index meetings_user_calendar_event on meetings(user_id,calendar_event_id) where calendar_event_id is not null;
    create table reports(id uuid primary key default gen_random_uuid(),meeting_id uuid unique references meetings(id),user_id uuid,summary text,action_items jsonb,next_steps jsonb,key_questions jsonb,topics jsonb,chapters jsonb,highlights jsonb,coaching jsonb,participants jsonb,sentiment_timeline jsonb,sentiment_label text,transcript jsonb,scores jsonb,read_score integer,category text,report_version integer);
    insert into app_users(id,email) values('11111111-1111-4111-8111-111111111111','local-fixture@example.invalid');`);
  return db;
}
async function noZoomTables(db) {
  assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'zoom_%'")).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from app_users')).rows[0].n,1);
}
test('prepared files match the current migration and default to a rollback rehearsal', async () => {
  assert.equal((await readFile(new URL('../docs/sql/20261029_zoom_rtms.preflight.sql',import.meta.url),'utf8')).replaceAll('\r\n','\n'),artifact.preflight);
  assert.equal((await readFile(new URL('../docs/sql/20261029_zoom_rtms.install.sql',import.meta.url),'utf8')).replaceAll('\r\n','\n'),artifact.install);
  assert.equal((await readFile(new URL('../docs/sql/20261029_zoom_rtms.verify.sql',import.meta.url),'utf8')).replaceAll('\r\n','\n'),artifact.verify);
  assert.deepEqual(prepareSql(source.replaceAll('\r\n','\n').replaceAll('\n','\r\n')),artifact,'Windows and Unix checkouts produce the same source fingerprint and SQL');
  assert.match(artifact.install,/rollback;\s*$/);
  assert.doesNotMatch(artifact.install,/^commit;/m);
});
test('read-only preflight and full rehearsal leave base data and schema unchanged', async () => {
  const db = await base();
  try { await db.exec(artifact.preflight); await db.exec(artifact.install); await noZoomTables(db); }
  finally { await db.close(); }
});
test('explicit final COMMIT installs 7 private tables and rejects a second first-install', async () => {
  const db = await base();
  try {
    await db.exec(artifact.install.replace(/rollback;\s*$/,'commit;'));
    await db.exec(artifact.verify);
    assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'zoom_%'")).rows[0].n,7);
    await assert.rejects(db.exec(artifact.install),/Existing Zoom objects/);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int n from app_users')).rows[0].n,1);
  } finally { await db.close(); }
});
test('preflight blocks a missing required column before installing objects', async () => {
  const db = await base();
  try {
    await db.exec('alter table meetings drop column capture_mode');
    await assert.rejects(db.exec(artifact.install),/meetings\.capture_mode.*MISSING/);
    await db.exec('rollback'); await noZoomTables(db);
  } finally { await db.close(); }
});
test('preflight requires the observed production JSONB transcript and integer score/duration types',async()=>{
  const db=await base();
  try {
    await db.exec('alter table reports alter column transcript type text using transcript::text; alter table reports alter column read_score type numeric; alter table meetings alter column duration_min type numeric;');
    await assert.rejects(db.exec(artifact.install),error=>{
      for(const pattern of [/meetings\.duration_min.*integer/,/reports\.transcript.*jsonb/,/reports\.read_score.*integer/])assert.match(error.message,pattern);
      return true;
    });
    await db.exec('rollback');await noZoomTables(db);
  } finally {await db.close();}
});
test('preflight rejects a partial report unique key and extra required insert fields', async () => {
  const db = await base();
  try {
    await db.exec('alter table reports drop constraint reports_meeting_id_key; create unique index partial_report_key on reports(meeting_id) where user_id is not null; alter table meetings add column required_label text not null;');
    await assert.rejects(db.exec(artifact.install),/reports\.meeting_id.*unique key[\s\S]*meetings\.required_label/);
    await db.exec('rollback'); await noZoomTables(db);
  } finally { await db.close(); }
});
test('error after DDL aborts the entire install, with no persistent Zoom schema after rollback', async () => {
  const db = await base();
  try {
    const failing = artifact.install.replace('-- This notification', "do $failure$ begin raise exception 'fixture postflight failure'; end $failure$;\n-- This notification");
    await assert.rejects(db.exec(failing),/fixture postflight failure/);
    await db.exec('rollback'); await noZoomTables(db);
  } finally { await db.close(); }
});
