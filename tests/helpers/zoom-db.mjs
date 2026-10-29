import { readFile } from 'node:fs/promises';
const moduleUrl = process.env.PGLITE_MODULE || '@electric-sql/pglite';
const { PGlite } = await import(moduleUrl);
export async function zoomDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table app_users(id uuid primary key,email text,plan text,auto_join boolean default true);
    create table meetings(id uuid primary key default gen_random_uuid(),user_id uuid references app_users(id),title text,source text,meeting_url text,status text,capture_mode text,start_time timestamptz,end_time timestamptz,stage_info jsonb,error text,status_synced_at timestamptz,recording_url text,cover_url text,duration_min numeric,attendees jsonb,participants jsonb,calendar_event_id text,created_at timestamptz default now());
    create table reports(id uuid primary key default gen_random_uuid(),meeting_id uuid unique references meetings(id),user_id uuid,summary text,action_items jsonb,next_steps jsonb,key_questions jsonb,topics jsonb,chapters jsonb,highlights jsonb,coaching jsonb,participants jsonb,sentiment_timeline jsonb,sentiment_label text,transcript text,scores jsonb,read_score numeric,category text,report_version integer);
    create table sessions(token text primary key,user_id uuid,expires_at timestamptz);`);
  await db.exec(await readFile(new URL('../../migrations/20261029_zoom_rtms.sql', import.meta.url), 'utf8'));
  return db;
}
const identifier = value => { if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw new Error('Unsafe test SQL identifier'); return `"${value}"`; };
export function postgrest(db) {
  return async (path, options = {}) => {
    const [table, query] = path.split('?'), params = new URLSearchParams(query), values = [];
    const arg = value => { values.push(value); return `$${values.length}`; };
    if (table.startsWith('rpc/')) {
      const args = Object.entries(options.body || {}).map(([name,value]) => `${identifier(name)} => ${arg(value)}`).join(',');
      const result = await db.query(`select * from ${identifier(table.slice(4))}(${args})`, values);
      if (['zoom_disconnect','zoom_commit_report','zoom_session_update','zoom_disable_meeting','zoom_begin_deletion','zoom_ack_deletion'].includes(table.slice(4))) return result.rows[0]?.[table.slice(4)];
      return result.rows;
    }
    let fields = '*'; const filters = [];
    for (const [name,value] of params) {
      if (name === 'select') { fields = value === '*' ? '*' : value.split(',').map(identifier).join(','); continue; }
      if (['limit','order','on_conflict'].includes(name)) continue;
      const col = identifier(name), dot = value.indexOf('.'), op = value.slice(0,dot), raw = value.slice(dot+1);
      if (op === 'is' && raw === 'null') filters.push(`${col} is null`);
      else if (op === 'in') filters.push(`${col} in (${raw.slice(1,-1).split(',').map(arg).join(',')})`);
      else { const ops = {eq:'=',neq:'<>',lt:'<',gt:'>',gte:'>=',lte:'<='}; if (!ops[op]) throw new Error('Unsupported fixture filter'); filters.push(`${col}${ops[op]}${arg(['invalidated','selected','needs_reconnect','stop_requested'].includes(name) ? raw === 'true' : raw)}`); }
    }
    const where = filters.length ? ' where '+filters.join(' and ') : '';
    let sql;
    if (options.method === 'PATCH') sql = `update ${identifier(table)} set ${Object.entries(options.body).map(([name,value]) => `${identifier(name)}=${arg(value)}`).join(',')}${where} returning *`;
    else if (options.method === 'POST') { const pairs = Object.entries(options.body); sql = `insert into ${identifier(table)}(${pairs.map(([name])=>identifier(name)).join(',')}) values(${pairs.map(([,value])=>arg(value)).join(',')})${options.prefer?.includes('ignore-duplicates')?' on conflict do nothing':''} returning *`; }
    else sql = `select ${fields} from ${identifier(table)}${where}${params.get('limit')?' limit '+Number(params.get('limit')):''}`;
    return (await db.query(sql, values)).rows;
  };
}
export const ids = {user:'11111111-1111-4111-8111-111111111111', other:'22222222-2222-4222-8222-222222222222', connection:'33333333-3333-4333-8333-333333333333', session:'44444444-4444-4444-8444-444444444444', meeting:'55555555-5555-4555-8555-555555555555', lease:'66666666-6666-4666-8666-666666666666'};
export async function seed(db) {
  await db.exec('truncate app_users,meetings,reports,sessions,zoom_connections,zoom_oauth_states,zoom_webhook_receipts,zoom_rtms_stops,zoom_rtms_sessions,zoom_rtms_deletions,zoom_rtms_account_deletions cascade');
  await db.query('insert into app_users(id,email,plan) values($1,$2,$3),($4,$5,$3)',[ids.user,'owner@example.invalid','enterprise',ids.other,'other@example.invalid']);
  await db.query('insert into zoom_connections(user_id,id,zoom_user_id,account_id,scopes,expires_at) values($1,$2,$3,$4,$5,now()+interval \'1 hour\')',[ids.user,ids.connection,'operator','account',['user:read:user','meeting:read:meeting_audio','meeting:read:meeting_video','meeting:read:meeting_screenshare','meeting:update:participant_rtms_app_status']]);
}
export function sessionPayload(extra={}) {
  return {id:ids.session,stream_key:'a'.repeat(64),user_id:ids.user,connection_id:ids.connection,account_id:'account',operator_id:'operator',meeting_uuid:'meeting-uuid',zoom_meeting_id:'89985000930',stream_id:'stream',event_ts:Date.now(),callback_hash:'b'.repeat(64),callback_ciphertext:'encrypted',callback_expires_at:new Date(Date.now()+6*3600000).toISOString(),max_meeting_min:120,...extra};
}
