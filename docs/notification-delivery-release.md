# Recap delivery incident fix — 2026-10-29

The previous implementation set `meetings.notified_at` before sending. A Gmail rejection,
missing sender, or interrupted function could permanently lose the recap. The report's
done-callback shortcut also skipped notification recovery. These are code defects; the
latest live meeting must finish processing before its actual recap is due.

Apply `migrations/20261029_notification_delivery.sql` before publishing the web changes.
It adds one RLS-protected, service-only table and three service-only RPCs. It does not
backfill, queue, alter, or send any existing report. Existing `notified_at` timestamps
without delivery-ledger rows remain untouched because their historical send outcome is
unknown. A rollback of the web code can leave the additive schema in place.

For a first installation, run the migration with its final `commit;` changed to
`rollback;`, verify it succeeds, then run the original transaction. Verify with read-only SQL:

```sql
select relrowsecurity from pg_class where oid='public.meeting_notification_deliveries'::regclass;
select role, has_table_privilege(role,'public.meeting_notification_deliveries','select') as can_read
from (values ('anon'),('authenticated'),('service_role')) x(role);
select p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('anon',p.oid,'execute') as anon_execute,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'execute') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('enqueue_meeting_notifications','claim_meeting_notification','finish_meeting_notification');
select status,count(*) from public.meeting_notification_deliveries group by status;
```

Expected first-install verification: RLS true; browser table access false; all three RPCs
security definer with `search_path=public`, browser execute false and service execute true;
zero delivery rows. No provider call is required to verify this schema.

New reports enqueue recipients before looking up sender tokens. Share links are persisted
atomically with the jobs. Each job has a unique meeting/channel/recipient identity and a
single active lease. Only confirmed successes mark that recipient sent. The existing
calendar sweep drains at most two due jobs after it arms calendars, within a bounded
provider-request budget. Report completion retries can recover notification preparation
without re-running analysis. Auto-sharing preferences, revoked shares, owner identity,
RTMS capture identity and deletion are checked again before delivery.

Google token refresh requests are bounded to 8 seconds, Gmail requests to 15 seconds,
and integration pushes to 10 seconds (further bounded by the drain deadline). A confirmed
bot-mailbox authentication rejection can fall back to the connected meeting owner.
Logs contain status/IDs, not provider response bodies or credentials.

Gmail's `messages.send` API does not expose a per-request idempotency key. Network timeouts,
crashes after a send, or a lost database acknowledgement are therefore stored as `uncertain`
and do not automatically resend. Review the provider's sent-mail evidence before explicitly
recovering one of those jobs. Successful and cancelled recipients are never retried. This
avoids claiming exactly-once delivery across an external email API that cannot provide it.

Historical recovery is a separate, explicitly scoped action: inspect the specific meeting,
its report, account connection and send evidence first. Do not clear old `notified_at` values
or enumerate old reports into the queue automatically.

Offline integration coverage uses the actual SQL migration in PGlite: partial delivery,
concurrent callbacks, disconnected Gmail, sender fallback, ambiguous outcomes, expired
leases, revoked shares/preferences, RTMS deletion, old timestamps and database privileges.
No test sends a real email or reads a real meeting transcript.
