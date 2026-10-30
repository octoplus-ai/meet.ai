-- Private derived translations, separate from the owner's original report.
begin;
create table if not exists public.report_translations (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  lang text not null check (lang in ('en','es','pt','fr','hi','it','ru','de','zh','ja','nl','da','fi','sv','no','ca','ko','pl','uk','he')),
  status text not null check (status in ('running','ready','failed')),
  payload jsonb,
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 1 check (attempts between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (meeting_id,source_hash,lang)
);
alter table public.report_translations enable row level security;
revoke all on public.report_translations from public,anon,authenticated;
grant select,insert,update,delete on public.report_translations to service_role;

create or replace function public.claim_report_translation(p_meeting_id uuid,p_user_id uuid,p_source_hash text,p_lang text,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m meetings%rowtype; t report_translations%rowtype; used integer;
begin
  if p_source_hash !~ '^[a-f0-9]{64}$' or p_lang not in ('en','es','pt','fr','hi','it','ru','de','zh','ja','nl','da','fi','sv','no','ca','ko','pl','uk','he') or p_lease is null then return jsonb_build_object('state','invalid'); end if;
  select * into m from meetings where id=p_meeting_id and user_id=p_user_id for update;
  if not found or m.status<>'done' or (m.capture_mode='zoom_rtms' and m.stage_info->>'deletion' is not null)
    or not exists(select 1 from reports where meeting_id=m.id and length(trim(coalesce(summary,'')))>0) then return jsonb_build_object('state','unavailable'); end if;
  select * into t from report_translations where meeting_id=m.id and source_hash=p_source_hash and lang=p_lang;
  if found then
    if t.status='ready' then return jsonb_build_object('state','ready','payload',t.payload); end if;
    if t.status='running' and t.lease_until>now() then return jsonb_build_object('state','pending'); end if;
    if t.attempts>=3 and t.updated_at>now()-interval '24 hours' then return jsonb_build_object('state','limit'); end if;
    if t.status='failed' and t.updated_at>now()-interval '30 seconds' then return jsonb_build_object('state','pending'); end if;
  end if;
  select coalesce(sum(attempts),0) into used from report_translations where meeting_id=m.id and updated_at>now()-interval '24 hours';
  if used>=60 then return jsonb_build_object('state','limit'); end if;
  if (select count(*) from report_translations where meeting_id=m.id and status='running' and lease_until>now())>=2 then return jsonb_build_object('state','pending'); end if;
  insert into report_translations(meeting_id,source_hash,lang,status,lease_id,lease_until)
    values(m.id,p_source_hash,p_lang,'running',p_lease,now()+interval '4 minutes')
    on conflict(meeting_id,source_hash,lang) do update set status='running',lease_id=p_lease,lease_until=now()+interval '4 minutes',
      attempts=case when report_translations.updated_at<now()-interval '24 hours' then 1 else report_translations.attempts+1 end,updated_at=now(),payload=null;
  return jsonb_build_object('state','claimed');
end $$;

create or replace function public.finish_report_translation(p_meeting_id uuid,p_source_hash text,p_lang text,p_lease uuid,p_payload jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_payload is not null and (jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>1000000) then return false; end if;
  update report_translations set status=case when p_payload is null then 'failed' else 'ready' end,
    payload=p_payload,lease_id=null,lease_until=null,updated_at=now()
    where meeting_id=p_meeting_id and source_hash=p_source_hash and lang=p_lang and status='running' and lease_id=p_lease and lease_until>now()
    and exists(select 1 from meetings where id=p_meeting_id and status='done' and (capture_mode is distinct from 'zoom_rtms' or stage_info->>'deletion' is null));
  return found;
end $$;

revoke all on function public.claim_report_translation(uuid,uuid,text,text,uuid),public.finish_report_translation(uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_report_translation(uuid,uuid,text,text,uuid),public.finish_report_translation(uuid,text,text,uuid,jsonb) to service_role;
commit;
