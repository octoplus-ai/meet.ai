# Zoom native RTMS backend

This change adds a user-managed Zoom connection and a private native media service. It does not prove production readiness by itself. Production requires the database migration, configured Zoom Marketplace app, private storage/service deployment, a connected test account, and an authorized live meeting test. Existing Google Meet and Teams/browser capture remains separate.

## Zoom setup and permissions

Create a **user-managed General app** with RTMS enabled, Zoom Developer Pack credits, and event subscriptions to `meeting.rtms_started` and `meeting.rtms_stopped`. Use `/api/zoom/webhook` as the event notification URL and set the separate **Deauthorization Notification Endpoint URL** to that same URL for `app_deauthorized`. URL validation uses the same raw-body signature verification as other events. Zoom development/private apps do not emit deauthorization notifications; the explicit Disconnect control remains necessary during the pilot.

Configure these required granular scopes:

- `user:read:user` for the signed-in Zoom identity (`/v2/users/me`).
- `meeting:read:meeting_audio`, `meeting:read:meeting_video`, `meeting:read:meeting_screenshare` for meeting media. The screenshare scope is distinct from camera video (confirmed in the current Marketplace scope selector). Zoom transcription is not requested: the existing audio transcription pipeline supplies the transcript.
- `meeting:update:participant_rtms_app_status` for the connected participant's start/stop request.

Marketplace also adds `rtms:read:rtms_started`, `rtms:read:rtms_stopped`, and `zoomapp:inmeeting` for the selected features. The backend accepts additional granted scopes while requiring the five listed above. When removing the optional Zoom transcript scope, verify that Marketplace retains `meeting:read:meeting_audio`; it can remove that dependency automatically and require selecting it again.

The backend uses `PATCH /v2/live_meetings/{numericMeetingId}/rtms_app/status` with `{action,settings:{client_id}}`. It does not impersonate the host or another participant. Calendar intent is not proof of meeting permission. Automatic RTMS start must be enabled in Zoom for the installed app/user, or the connected participant must request it while present. Zoom meeting/account restrictions still apply.

Sources checked 2026-10-29: [RTMS app prerequisites and scopes](https://developers.zoom.us/docs/rtms/meetings/add-features/), [participant REST control](https://developers.zoom.us/docs/rtms/meetings/quickstart-rest-api/), [event schemas and operator identity](https://developers.zoom.us/docs/api/rtms/events/), [OAuth](https://developers.zoom.us/docs/integrations/oauth/), [development app deauthorization limitations](https://developers.zoom.us/docs/integrations/end-user-auth/).

## Deployment configuration

Apply `migrations/20261029_zoom_rtms.sql` using the private PostgreSQL administrator connection. Supabase REST with the service-role key cannot install SQL. The migration was verified against local PostgreSQL via PGlite; it has not been applied to production by these tests. Compare the existing `meetings`/`reports` column types and constraints before applying it to production.

Web environment (server only):

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Exact HTTPS app origin; no path, query or alternate host supplied by requests. |
| `ZOOM_APP_ORIGINS` | Optional comma-separated explicit allowlist, at most two HTTPS app origins including `APP_URL`. Each must have its exact callback registered in Zoom. No wildcard or request-supplied hosts. |
| `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | User-managed Marketplace app credentials. |
| `ZOOM_REDIRECT_URI` | Optional compatibility setting; if supplied, exactly one allowed origin + `/api/auth/zoom/callback`. Actual OAuth start/exchange uses the initiating allowed origin bound in state. |
| `ZOOM_TOKEN_ENCRYPTION_KEY` | Random 32 bytes encoded in base64, server secret. Rotation requires re-encryption or reconnecting users; it also signs restricted-media access proofs. |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | Marketplace webhook signing secret. |
| `ZOOM_RTMS_SERVICE_URL` | HTTPS service origin, no path/query/credentials. |
| `RTMS_SERVICE_SECRET` | At least 32 characters, shared only by web backend and native service. |
| `ZOOM_RTMS_ENABLED=true` | Allows signed starts to dispatch to the configured service. |
| `ZOOM_RTMS_ROUTING=true` | Separately enables calendar/manual routing to RTMS for selected connections; turn on only after setup is verified. |

Private media access additionally uses `R2_ACCOUNT_ID`, `R2_PRIVATE_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. The private bucket must differ from the legacy public `R2_BUCKET`; disable public access. No Zoom OAuth access or refresh token is sent to the native service or stored in `app_users.integrations`.

## Endpoints and identity

| Endpoint | Authorization and behavior |
| --- | --- |
| `GET /api/auth/zoom/start` | Existing OctoMeet session; generates 10-minute state bound to user, session and secure browser nonce. |
| `GET /api/auth/zoom/callback` | Atomic one-use state claim; server token exchange and identity lookup; encrypted token commit. Safe redirects only. |
| `GET /api/zoom/status` | Session only; safe account/scopes/configuration status, never tokens. Connected does not mean currently recording. |
| `POST /api/zoom/disconnect` | Session, exact Origin, JSON. Durable local revocation/stop intent before network calls; provider token revoked separately. |
| `POST /api/zoom/rtms-control` | Same CSRF checks; internal meeting UUID owner check. Start requires active OAuth; stopping a capture does not. |
| `POST /api/zoom/webhook` | Exact raw bytes, HMAC SHA-256, timestamp within five minutes, durable claim/receipt. |
| `POST /api/zoom/rtms-status` | Random session bearer token, hashed in DB, six-hour expiry, owner/meeting/session binding. |
| `POST /api/zoom/rtms-ingest` | Same scope; media saved before analysis; one ingest lease and transactional report/meeting commit. |
| `GET/HEAD /api/zoom/media` | Owner session or valid share authorization; private object signing/range delivery. |

RTMS starts map `(payload.account_id, payload.operator_id)` to exactly one active connection. The meeting host can be a different person. A stop event has no user identity; it can stop only the previously bound `(meeting_uuid, rtms_stream_id)` session. Stop-before-start events leave durable tombstones. Generic `meeting.ended` events never stop unrelated recordings.

`getRtmsConnectionState(userId)` returns `configured`, `connected`, `selected`, `ready`, `connectionId`, `zoomUserId`, and `accountId`. `selected` survives revocation/disconnection so routing cannot silently switch a user back to browser capture. Configuration failure is closed for selected connections.

An OAuth flow stays on the allowed app origin where the user's session and nonce cookies live. The state includes that exact redirect URI, the callback claim verifies it, and the token exchange reuses it. A mutation's Origin must equal its request host even when both aliases are allowed. `APP_URL` must still be configured explicitly for worker callbacks.

An OctoMeet `auto_join=false` preference blocks automatic RTMS admission inside the same transaction as session creation. Only a stored explicit `manualIntent` for that meeting permits a manual override. An individual disabled event blocks admission. Unstarted intents expire after the calendar end plus five minutes (two-hour fallback without an end); already admitted sessions are unaffected. An explicit retry after a prior session creates a new meeting ID and retains the previous media/report, archiving only the old calendar association.

## Native service contract

Authenticate service requests with `Authorization: Bearer RTMS_SERVICE_SECRET`:

- `POST /v1/sessions`: `{sessionId,meetingId,userId,meetingUuid,streamId,serverUrls,operatorId,startedAt,eventTimestamp,maxMeetingMin,captureDeadlineAt,callbackUrl,statusUrl,callbackToken}`.
- `POST /v1/sessions/:key/stop`: `{reason}`.
- `POST /v1/users/:userId/revoke`: stop currently known sessions, not a permanent ban on future reconnected sessions.
- `POST /v1/sessions/:key/purge`: `{sessionId,meetingId,userId}`; idempotently closes acquisition and writers, then deletes the exact private objects and local spool. `{ok:true,purged:true}` acknowledges completed cleanup.

`key = sha256(meetingUuid + '\0' + streamId)`. Start acknowledgment must be `{ok:true,id:key,state:'queued'|'running'|'stopping'|'stopped'|'done'}`. Persist the session before acknowledging. Before joining RTMS and on heartbeats, call `statusUrl`; `stop:true` prevents/ends capture. Do not treat a transient callback failure as authorization to start. A stopped stream may still finalize media already captured with authorization.

`captureDeadlineAt` is fixed by the first stream of a Zoom meeting instance, capped by the plan and at most 120 minutes. Pause/resume streams inherit the same deadline. Both the native service timer and status heartbeat enforce it; the expiry stops new capture, not delivery of existing media.

Callbacks carry Bearer `callbackToken` and `sessionId`. The token is random, stored hashed (plus an encrypted retry copy), and expires six hours after admission allocation: at most two hours of capture plus up to four hours of delivery retries. Never print it or persist it in public artifacts.

Status fields are `status: joining|recording|processing|error` and optional enumerated `error`. Ingest accepts `mediaOnly:true` for early media persistence, then `turns:[{speaker,text,t}]`, `rosterNames`, `recordingUrl`, `coverUrl`, `durationMin`. References must exactly match:

```
r2:private/{userId}/{meetingId}/recording.mp4
r2:private/{userId}/{meetingId}/cover.jpg
```

Arbitrary URLs, other owners' keys and arbitrary stage metadata are rejected. One RTMS session owns one internal meeting ID. A later stream after a stop uses a new internal meeting/report and cannot overwrite earlier media. Duplicate dispatch/delivery uses the original session and meeting. Existing active browser captures prevent native duplicate capture.

An empty transcript saves available media and sets `RTMS_NO_SPEECH`; it returns `{ok:true,noTranscript:true}` without creating a fabricated report. An analysis failure returns a retriable 503 with the file retained. A canceled, deleted or reassigned meeting cannot receive an in-flight report. Late status callbacks cannot reopen a completed report. Disconnect/revoke stops acquisition but permits delivery of previously authorized media.

The production schema stores `transcript` as JSONB; native delivery preserves the existing scalar-string contract (`[time] speaker: text`) so the report UI and stored-transcript analysis remain compatible. `duration_min` and `read_score` are INTEGER and are explicitly rounded before delivery. The measured duration remains available in `stage_info.recordingDurationSec` to millisecond precision, while `scores` JSONB retains the complete metrics. No base column types are changed by the RTMS migration.

Deletion begins with the owner-bound `zoom_begin_deletion` transaction. It marks the meeting `stage_info.deletion='requested'`, stops the session, invalidates ingest leases and creates a private durable purge queue; account deletion also revokes OAuth and blocks reconnect/new captures. Status callbacks return `stop:true,delete:true` so the worker can purge even during a dispatch outage. Database rows are removed only after the service acknowledges storage/spool cleanup and `zoom_ack_deletion` matches the owner, meeting, session and stream. Queue receipts have no cascading foreign key and survive account deletion for safe retries. Revocation alone never runs this deletion workflow.

The cleanup cron only purges native storage and records the acknowledgment. It does not delete meetings or accounts from the database. If deletion initially returns pending, the owner completes the existing confirmed deletion action after storage cleanup finishes. Account deletion retains the exact-email confirmation; no account is silently deleted by the cron. Native notification delivery rechecks the current meeting before each external send; a message already accepted by an external provider cannot be recalled.

The webhook reader consumes the restored raw `data`/`end` stream without accessing Vercel's lazy JSON parser, preserving exact signed bytes. See the [official Node helper implementation](https://github.com/vercel/vercel/blob/main/packages/node/src/serverless-functions/helpers.ts).

## Verification

No test below calls Zoom, a production database, R2 or an AI provider. The API tests replace all outbound requests and reject unrecognized destinations. SQL executes against real local PostgreSQL in PGlite; parallel promises exercise atomic claims, but this is not a multi-process PostgreSQL load test.

From `speaker-camera-hotfix`, install the locked dependencies including the development-only PGlite package and run the full suite:

```
npm ci
npm test
```

Alternatively set `PGLITE_MODULE` to the installed module's absolute file URL. Tests cover CSRF/state replay/expiry, AES binding, secret redaction, raw signatures, URL allowlists, invited participant ownership, deauthorization/refresh races, service outage stops, private media scope, duplicate/late deliveries, canceled analysis and browser-role SQL privileges. Production activation still needs the configured Zoom app and a live hosted/invited meeting test with audio, camera, shared screen, stop and replay in OctoMeet.
