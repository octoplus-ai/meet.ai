import { readFile } from 'node:fs/promises';
import { zoomDatabase, postgrest, seed, ids } from './zoom-db.mjs';
export { ids };
export async function notificationDatabase() {
  const db = await zoomDatabase();
  await db.exec(`alter table app_users add column name text,add column sharing_prefs jsonb,add column integrations jsonb;
    alter table meetings add column shares jsonb,add column notified_at timestamptz;`);
  await db.exec(await readFile(new URL('../../migrations/20261029_notification_delivery.sql', import.meta.url), 'utf8'));
  return db;
}
export async function seedNotifications(db, { native = false, notified = false, report = true, attendees = [], integrations = {}, autoRecap = true } = {}) {
  await seed(db);
  await db.query('update app_users set name=$1,sharing_prefs=$2,integrations=$3 where id=$4', ['Owner',{autoRecap},integrations,ids.user]);
  await db.query(`insert into meetings(id,user_id,title,status,capture_mode,stage_info,shares,attendees,notified_at) values($1,$2,'Fixture meeting','done',$3,$4,'[]',$5,$6)`,
    [ids.meeting, ids.user, native ? 'zoom_rtms' : 'inhouse_bot', native ? {rtmsSessionId:ids.session} : {}, attendees, notified ? new Date() : null]);
  if(report) await db.query('insert into reports(meeting_id,user_id,summary,action_items,chapters) values($1,$2,$3,$4,$4)', [ids.meeting,ids.user,'Actual captured discussion',[]]);
}
export function notificationRest(db) {
  const rest = postgrest(db);
  return async (path, options) => {
    if(path.startsWith('rpc/')) {
      const result = await rest(path, options);
      return path === 'rpc/finish_meeting_notification' ? result[0]?.finish_meeting_notification : result;
    }
    if(path.startsWith('meetings?') && path.includes('reports(*)')) {
      const rows = await rest(path.replace('*,reports(*)','*'),options);
      for(const row of rows) row.reports=(await db.query('select * from reports where meeting_id=$1',[row.id])).rows[0];
      return rows;
    }
    return rest(path,options);
  };
}
