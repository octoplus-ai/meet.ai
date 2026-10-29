// Offline deployment artifacts only. No connection string or production access.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const text = ['text', 'character varying'];
const columns = [
  ['app_users', 'id', ['uuid']], ['app_users', 'auto_join', ['boolean']],
  ...['id', 'user_id'].map(c => ['meetings', c, ['uuid']]),
  ...['title', 'source', 'meeting_url', 'status', 'capture_mode', 'error', 'recording_url', 'cover_url', 'calendar_event_id'].map(c => ['meetings', c, text]),
  ...['start_time', 'end_time', 'status_synced_at'].map(c => ['meetings', c, ['timestamp with time zone']]),
  ['meetings', 'stage_info', ['jsonb']], ['meetings', 'duration_min', ['integer']],
  ...['meeting_id', 'user_id'].map(c => ['reports', c, ['uuid']]),
  ...['summary', 'sentiment_label', 'category'].map(c => ['reports', c, text]),
  ...['action_items', 'next_steps', 'key_questions', 'topics', 'chapters', 'highlights', 'coaching', 'participants', 'sentiment_timeline', 'scores', 'transcript'].map(c => ['reports', c, ['jsonb']]),
  ['reports', 'read_score', ['integer']], ['reports', 'report_version', ['integer']],
];
const quote = x => `'${x.replaceAll("'", "''")}'`;
const values = columns.map(([t, c, types]) => `(${quote(t)},${quote(c)},array[${types.map(quote).join(',')}])`).join(',\n    ');
const zoomTables = ['zoom_connections', 'zoom_oauth_states', 'zoom_webhook_receipts', 'zoom_rtms_stops', 'zoom_rtms_sessions', 'zoom_rtms_deletions', 'zoom_rtms_account_deletions'];
const zoomArray = `array[${zoomTables.map(quote).join(',')}]`;
const requiredColumns = `with required(table_name,column_name,accepted_types) as (values\n    ${values}\n  )`;

// Conservative checks: a differing schema requires review, never an automatic ALTER.
export const guard = `do $preflight$
declare problems text[] := '{}'; item record;
begin
  if not has_schema_privilege(current_user,'public','CREATE') then
    problems := array_append(problems,'Current SQL role cannot CREATE in public');
  end if;
  for item in select rolname from (values ('anon'),('authenticated'),('service_role')) r(rolname)
    where not exists(select 1 from pg_roles p where p.rolname=r.rolname) loop
    problems := array_append(problems,'Missing database role: '||item.rolname);
  end loop;
  if not exists(select 1 from pg_roles where rolname='service_role' and (rolbypassrls or rolsuper)) then
    problems := array_append(problems,'service_role must have BYPASSRLS for server-only tables');
  end if;
  for item in select name from (values ('app_users'),('meetings'),('reports')) r(name) loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=item.name and c.relkind in ('r','p')) then
      problems := array_append(problems,'Missing base table: public.'||item.name);
    end if;
  end loop;
  for item in
    ${requiredColumns}
    select r.*,format_type(a.atttypid,null) actual_type,a.attgenerated
      from required r left join pg_namespace n on n.nspname='public'
      left join pg_class c on c.relnamespace=n.oid and c.relname=r.table_name
      left join pg_attribute a on a.attrelid=c.oid and a.attname=r.column_name and a.attnum>0 and not a.attisdropped
      where a.attname is null or not(format_type(a.atttypid,null)=any(r.accepted_types)) or a.attgenerated<>''
  loop
    problems := array_append(problems,item.table_name||'.'||item.column_name||': expected '||array_to_string(item.accepted_types,' / ')||'; found '||coalesce(item.actual_type,'MISSING'));
  end loop;
  -- These unique keys back FKs and ON CONFLICT(meeting_id). Partial/deferrable keys do not qualify.
  for item in select * from (values ('app_users','id'),('meetings','id'),('reports','meeting_id')) r(t,c) loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attname=item.c
      join pg_index i on i.indrelid=c.oid and i.indkey[0]=a.attnum
      where n.nspname='public' and c.relname=item.t and i.indisunique and i.indisvalid and i.indimmediate
        and i.indnkeyatts=1 and i.indpred is null and i.indexprs is null) then
      problems := array_append(problems,item.t||'.'||item.c||': missing valid nonpartial immediate unique key');
    end if;
  end loop;
  -- The minimal INSERT paths omit these columns. No new required field may be silently assumed.
  for item in
    select c.relname,a.attname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where n.nspname='public' and a.attnotnull and d.oid is null and a.attidentity='' and a.attgenerated=''
      and ((c.relname='meetings' and not(a.attname=any(array['user_id','title','source','meeting_url','status','capture_mode','start_time','stage_info'])))
        or (c.relname='reports' and not(a.attname=any(array['meeting_id','user_id','summary','action_items','next_steps','key_questions','topics','chapters','highlights','coaching','participants','sentiment_timeline','sentiment_label','transcript','scores','read_score','category','report_version']))))
  loop
    problems := array_append(problems,item.relname||'.'||item.attname||': required omitted column has no default');
  end loop;
  -- One first-install artifact only. Existing/partial objects must be compared before any replacement.
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and (c.relname=any(${zoomArray}) or c.relname in ('zoom_unique_active_identity','zoom_rtms_instance_owner','zoom_rtms_deletions_owner')))
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'zoom\\_%' escape '\\') then
    problems := array_append(problems,'Existing Zoom objects: stop and compare; this artifact is for first installation only');
  end if;
  if to_regprocedure('gen_random_uuid()') is null or to_regprocedure('pg_catalog.hashtextextended(text,bigint)') is null then
    problems := array_append(problems,'Required PostgreSQL UUID/hash functions missing');
  end if;
  if cardinality(problems)>0 then raise exception 'RTMS preflight blocked: %',array_to_string(problems,E'\\n'); end if;
end $preflight$;`;

export const catalogQueries = `-- Metadata only: no table rows, OAuth values, meeting names or recordings.
select current_database() database_name,current_user sql_role,current_setting('server_version') postgres_version,
  has_schema_privilege(current_user,'public','CREATE') can_create_public;
select rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('anon','authenticated','service_role',current_user) order by rolname;
select c.relname table_name,r.rolname database_role,
  has_table_privilege(r.oid,c.oid,'SELECT') can_select,has_table_privilege(r.oid,c.oid,'INSERT') can_insert,
  has_table_privilege(r.oid,c.oid,'UPDATE') can_update,c.relrowsecurity rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r
where n.nspname='public' and c.relname in ('app_users','meetings','reports') and r.rolname in (current_user,'service_role') order by c.relname,r.rolname;
${requiredColumns}
select r.table_name,r.column_name,r.accepted_types,format_type(a.atttypid,a.atttypmod) actual_type,
  a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_expression,
  case when a.attname is null then 'MISSING'
    when not(format_type(a.atttypid,null)=any(r.accepted_types)) then 'TYPE_MISMATCH'
    when a.attgenerated<>'' then 'GENERATED_COLUMN_REVIEW' else 'TYPE_OK' end result
from required r left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=r.table_name
left join pg_attribute a on a.attrelid=c.oid and a.attname=r.column_name and a.attnum>0 and not a.attisdropped
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
order by r.table_name,r.column_name;
-- All base columns expose additional NOT NULL/default/length/precision requirements.
select c.relname table_name,a.attname column_name,format_type(a.atttypid,a.atttypmod) data_type,
  a.attnotnull not_null,a.attidentity identity_kind,a.attgenerated generated_kind,pg_get_expr(d.adbin,d.adrelid) default_expression
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname='public' and c.relname in ('app_users','meetings','reports') order by c.relname,a.attnum limit 250;
select c.relname table_name,k.conname,k.contype,k.convalidated,k.condeferrable,pg_get_constraintdef(k.oid,true) definition
from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('app_users','meetings','reports') order by c.relname,k.conname limit 100;
select tablename,indexname,indexdef from pg_indexes
where schemaname='public' and tablename in ('app_users','meetings','reports') order by tablename,indexname limit 100;
select c.relname table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('app_users','meetings','reports') and not t.tgisinternal order by c.relname,t.tgname limit 100;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('app_users','meetings','reports') order by tablename,policyname limit 100;
select c.relname,c.relkind,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname=any(${zoomArray}) order by c.relname;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'zoom\\_%' escape '\\' order by p.proname limit 100;`;

const postflight = `do $postflight$
declare item record; object_id oid; expected_count integer := 17;
begin
  for item in select unnest(${zoomArray}) name loop
    object_id := to_regclass('public.'||item.name);
    if object_id is null or not exists(select 1 from pg_class where oid=object_id and relrowsecurity) then
      raise exception 'RTMS postflight: missing/private-RLS table %',item.name;
    end if;
    if exists(select 1 from pg_policy where polrelid=object_id)
      or has_table_privilege('anon',object_id,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege('authenticated',object_id,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'RTMS postflight: browser table access %',item.name;
    end if;
    if not has_table_privilege('service_role',object_id,'SELECT') or not has_table_privilege('service_role',object_id,'INSERT')
      or not has_table_privilege('service_role',object_id,'UPDATE') or not has_table_privilege('service_role',object_id,'DELETE') then
      raise exception 'RTMS postflight: service table privileges %',item.name;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'zoom\\_%' escape '\\')<>expected_count then
    raise exception 'RTMS postflight: expected % RPCs',expected_count;
  end if;
  for item in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'zoom\\_%' escape '\\' loop
    if not item.prosecdef or not('search_path=public'=any(coalesce(item.proconfig,'{}'::text[])))
      or has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE')
      or not has_function_privilege('service_role',item.oid,'EXECUTE') then
      raise exception 'RTMS postflight: unsafe RPC privileges/config %',item.proname;
    end if;
  end loop;
  if exists(select 1 from pg_constraint where contype='f' and conrelid in ('public.zoom_rtms_deletions'::regclass,'public.zoom_rtms_account_deletions'::regclass)) then
    raise exception 'RTMS postflight: purge receipts must not cascade';
  end if;
end $postflight$;
select 'RTMS_POSTFLIGHT_OK' result,7 private_tables,17 service_only_rpcs;
`;

export function prepareSql(source) {
  const normalized = source.replaceAll('\r\n', '\n');
  const start = normalized.indexOf('\nbegin;\n'), end = normalized.lastIndexOf('\ncommit;');
  if (start<0 || end<start || normalized.slice(end+8).trim()) throw new Error('Unexpected migration transaction envelope');
  const body = normalized.slice(start+8,end);
  const sha = createHash('sha256').update(normalized).digest('hex');
  const header = `-- Generated by docs/sql/prepare-zoom-rtms.mjs; do not edit the embedded migration.\n-- Source migrations/20261029_zoom_rtms.sql SHA256 (LF normalized): ${sha}\n`;
  return {
    preflight: header + `-- Run the WHOLE file. Read-only; expected first-install Zoom inventories are empty.\n-- Review all CHECKs, lengths, triggers and indexes; TYPE_OK alone is not launch approval.\nbegin read only;\nset local statement_timeout='15s';\nset local lock_timeout='3s';\n${catalogQueries}\n${guard}\nselect 'RTMS_BASE_SCHEMA_PREFLIGHT_OK' result;\nrollback;\n`,
    install: header + `-- FIRST INSTALL / DRY RUN by default. Run the WHOLE file in one SQL Editor execution.\n-- Only after catalog review and successful dry run, change the FINAL rollback to commit.\n-- Keep ZOOM_RTMS_ENABLED and ZOOM_RTMS_ROUTING disabled throughout this operation.\nbegin;\nset local statement_timeout='60s';\nset local lock_timeout='5s';\nset local idle_in_transaction_session_timeout='60s';\nselect pg_advisory_xact_lock(hashtextextended('octomeet:zoom-rtms-migration:20261029',0));\n${guard}\n${body}\n${postflight}\n-- This notification is delivered only on COMMIT.\nnotify pgrst, 'reload schema';\n-- DEFAULT IS A REVERSIBLE REHEARSAL. Change only this final statement to COMMIT to install.\nrollback;\n`,
    verify: header + `-- Read-only post-install check; does not start a meeting or return table rows.\nbegin read only;\nset local statement_timeout='15s';\nset local lock_timeout='3s';\n${postflight}\nrollback;\n`,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const source = await readFile(new URL('../../migrations/20261029_zoom_rtms.sql', import.meta.url),'utf8');
  const artifacts = prepareSql(source);
  await writeFile(new URL('./20261029_zoom_rtms.preflight.sql',import.meta.url),artifacts.preflight);
  await writeFile(new URL('./20261029_zoom_rtms.install.sql',import.meta.url),artifacts.install);
  await writeFile(new URL('./20261029_zoom_rtms.verify.sql',import.meta.url),artifacts.verify);
  console.log('Prepared read-only preflight and transaction-only dry run; no database connection used.');
}
