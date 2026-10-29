-- Per-recipient recap delivery. Existing notified_at rows are deliberately not backfilled:
-- the old timestamp was written before sending, so their delivery outcome is unknown.
begin;
create table if not exists public.meeting_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('email','push')),
  recipient text not null,
  share_token text,
  capture_session_id text,
  status text not null default 'pending' check (status in ('pending','sending','retry','sent','cancelled','uncertain')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(meeting_id,kind,recipient)
);
alter table public.meeting_notification_deliveries enable row level security;
revoke all on public.meeting_notification_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.meeting_notification_deliveries to service_role;
create index if not exists meeting_notification_retry_idx on public.meeting_notification_deliveries(next_attempt_at)
  where status in ('pending','retry','sending');

create or replace function public.enqueue_meeting_notifications(p_meeting_id uuid,p_user_id uuid,p_targets jsonb)
returns setof public.meeting_notification_deliveries language plpgsql security definer set search_path=public as $$
declare m meetings%rowtype; target jsonb; share jsonb; v_recipient text; targets jsonb;
begin
  select * into m from meetings where id=p_meeting_id and user_id=p_user_id for update;
  if not found or m.status<>'done' or (m.capture_mode='zoom_rtms' and (m.stage_info->>'deletion' is not null or m.stage_info->>'rtmsSessionId' is null))
    or not exists(select 1 from reports where meeting_id=m.id and user_id=m.user_id and length(trim(coalesce(summary,'')))>0) then return; end if;
  if m.notified_at is not null and not exists(select 1 from meeting_notification_deliveries where meeting_id=m.id) then return; end if;
  if jsonb_typeof(p_targets)<>'array' or jsonb_array_length(p_targets)>200 then raise exception 'invalid_notification_targets'; end if;
  targets:=case when jsonb_typeof(m.shares)='array' then m.shares else '[]'::jsonb end;
  for target in select value from jsonb_array_elements(p_targets) loop
    v_recipient:=lower(trim(target->>'recipient'));
    if target->>'kind' not in ('email','push') or v_recipient is null or length(v_recipient)>320 or v_recipient='' then raise exception 'invalid_notification_target'; end if;
    if exists(select 1 from meeting_notification_deliveries n where n.meeting_id=m.id and n.kind=target->>'kind' and n.recipient=v_recipient) then continue; end if;
    share:=null;
    if target->>'kind'='email' then
      if v_recipient !~ '^[^\s,<>"@]+@[^\s,<>"@]+\.[^\s,<>"@]+$' then raise exception 'invalid_notification_recipient'; end if;
      select value into share from jsonb_array_elements(targets) where lower(value->>'email')=v_recipient limit 1;
      if share is null then
        if length(coalesce(target->>'token',''))<16 or length(coalesce(target->>'magic',''))<16 then raise exception 'invalid_notification_share'; end if;
        share:=jsonb_build_object('email',v_recipient,'role','Viewer','name','','token',target->>'token','magic',target->>'magic');
        targets:=targets||jsonb_build_array(share);
      end if;
    end if;
    insert into meeting_notification_deliveries(meeting_id,user_id,kind,recipient,share_token,capture_session_id)
      values(m.id,m.user_id,target->>'kind',v_recipient,share->>'token',case when m.capture_mode='zoom_rtms' then m.stage_info->>'rtmsSessionId' else null end)
      on conflict(meeting_id,kind,recipient) do nothing;
  end loop;
  -- The row lock makes share insertion merge with concurrent enqueue attempts instead of replacing them.
  update meetings set shares=targets where id=m.id;
  return query select * from meeting_notification_deliveries where meeting_id=m.id order by created_at,id;
end $$;

create or replace function public.claim_meeting_notification(p_id uuid,p_lease uuid)
returns setof public.meeting_notification_deliveries language plpgsql security definer set search_path=public as $$
declare n meeting_notification_deliveries%rowtype; m meetings%rowtype;
begin
  select * into n from meeting_notification_deliveries where id=p_id for update;
  if not found then return; end if;
  if n.status='sending' and n.lease_until<now() then
    -- A worker may have died after Gmail accepted the message. Never blindly resend it.
    update meeting_notification_deliveries set status='uncertain',error_code='delivery_interrupted',lease_id=null,lease_until=null,updated_at=now() where id=n.id;
    return;
  end if;
  if n.status not in ('pending','retry') or n.next_attempt_at>now() then return; end if;
  select * into m from meetings where id=n.meeting_id and user_id=n.user_id;
  if not found or m.status<>'done' or (m.capture_mode='zoom_rtms' and (m.stage_info->>'deletion' is not null or m.stage_info->>'rtmsSessionId' is distinct from n.capture_session_id)) then
    update meeting_notification_deliveries set status='cancelled',error_code='meeting_unavailable',updated_at=now() where id=n.id; return;
  end if;
  return query update meeting_notification_deliveries set status='sending',attempts=attempts+1,lease_id=p_lease,lease_until=now()+interval '2 minutes',updated_at=now()
    where id=n.id returning *;
end $$;

create or replace function public.finish_meeting_notification(p_id uuid,p_lease uuid,p_status text,p_error text default null,p_provider_id text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare n meeting_notification_deliveries%rowtype;
begin
  if p_status not in ('retry','sent','cancelled','uncertain') then raise exception 'invalid_notification_status'; end if;
  update meeting_notification_deliveries set status=p_status,error_code=left(p_error,80),provider_message_id=left(p_provider_id,200),
    sent_at=case when p_status='sent' then now() else sent_at end,
    next_attempt_at=now()+make_interval(secs=>case when p_error in ('no_sender','needScope') then 3600 else least(3600,60*power(2,least(attempts,6))::integer) end),
    lease_id=null,lease_until=null,updated_at=now()
    where id=p_id and lease_id=p_lease and status='sending' returning * into n;
  if not found then return false; end if;
  if not exists(select 1 from meeting_notification_deliveries where meeting_id=n.meeting_id and status not in ('sent','cancelled'))
    and exists(select 1 from meeting_notification_deliveries where meeting_id=n.meeting_id and kind='email' and status='sent') then
    update meetings set notified_at=coalesce(notified_at,now()) where id=n.meeting_id and user_id=n.user_id and status='done'
      and (capture_mode is distinct from 'zoom_rtms' or stage_info->>'deletion' is null);
  end if;
  return true;
end $$;

revoke all on function public.enqueue_meeting_notifications(uuid,uuid,jsonb),public.claim_meeting_notification(uuid,uuid),public.finish_meeting_notification(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_meeting_notifications(uuid,uuid,jsonb),public.claim_meeting_notification(uuid,uuid),public.finish_meeting_notification(uuid,uuid,text,text,text) to service_role;
commit;
