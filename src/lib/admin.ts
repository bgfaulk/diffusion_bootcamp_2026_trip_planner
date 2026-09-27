import { requireUser } from "./auth";
import { decryptText } from "./crypto";
import { getSql } from "./db";
import { isOwner } from "./reset";
import { bucketMinutes, clampWindow } from "./time-window";
import { fail } from "./validation";

// Queries behind the Organizer page. Owner only.

export async function requireOwner() {
  const user = await requireUser();
  if (!isOwner(user.email)) fail("Only the trip organizer can do that", 403);
  return user;
}

export function windowFromParams(url: URL) {
  const minutes = clampWindow(Number(url.searchParams.get("minutes") || 1440));
  const to = new Date();
  const from = new Date(to.getTime() - minutes * 60_000);
  return { minutes, from, to, bucket: bucketMinutes(minutes) };
}

const appTables = ["users", "sessions", "settings", "list_items", "photos", "itinerary", "trip_info", "trip_documents", "audit_log", "notifications", "health_snapshots", "weather_cache"];

// Activity rows live a year (the widest window the picker offers); traffic rows only feed the request and
// latency charts and go after a week.
export async function pruneAuditLog() {
  const sql = getSql();
  await sql`DELETE FROM audit_log WHERE at < now() - interval '400 days'`;
  await sql`DELETE FROM audit_log WHERE kind = 'traffic' AND at < now() - interval '7 days'`;
  await sql`DELETE FROM weather_cache WHERE fetched_at < now() - interval '1 day'`;
}

export async function overview(window: ReturnType<typeof windowFromParams>) {
  const sql = getSql();
  const { from, to, bucket, minutes } = window;
  await pruneAuditLog();
  const [totals, routes, series, tables, dbSize, growthRows] = await Promise.all([
    sql`
      SELECT count(*)::int AS calls,
             count(*) FILTER (WHERE status >= 400)::int AS errors,
             count(*) FILTER (WHERE status >= 500)::int AS failures,
             coalesce(round(avg(ms)), 0)::int AS avg_ms,
             coalesce((percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)), 0)::int AS p95_ms,
             count(DISTINCT user_id)::int AS users,
             count(*) FILTER (WHERE event = 'auth.signin' AND status < 400)::int AS signins,
             count(*) FILTER (WHERE event = 'auth.signin' AND status >= 400)::int AS failed_signins,
             count(*) FILTER (WHERE event = 'auth.create' AND status < 400)::int AS signups
      FROM audit_log WHERE at >= ${from} AND at < ${to}
    `,
    sql`
      SELECT route, method, count(*)::int AS calls, count(*) FILTER (WHERE status >= 400)::int AS errors,
             round(avg(ms))::int AS avg_ms, (percentile_cont(0.95) WITHIN GROUP (ORDER BY ms))::int AS p95_ms, max(ms)::int AS max_ms
      FROM audit_log WHERE at >= ${from} AND at < ${to} AND route IS NOT NULL
      GROUP BY 1, 2 ORDER BY calls DESC LIMIT 40
    `,
    sql`
      SELECT date_bin(make_interval(mins => ${bucket}), at, ${from}) AS bucket,
             count(*)::int AS calls, count(*) FILTER (WHERE status >= 400)::int AS errors,
             round(avg(ms))::int AS avg_ms, (percentile_cont(0.95) WITHIN GROUP (ORDER BY ms))::int AS p95_ms
      FROM audit_log WHERE at >= ${from} AND at < ${to}
      GROUP BY 1 ORDER BY 1
    `,
    sql`
      SELECT relname AS name, pg_total_relation_size(relid)::bigint AS bytes, n_live_tup::int AS estimated_rows
      FROM pg_stat_user_tables WHERE relname = ANY(${appTables}) ORDER BY bytes DESC
    `,
    sql`SELECT pg_database_size(current_database())::bigint AS bytes`,
    // Stored bytes by hour of creation, per table. Cumulative sums drawn over the window give the growth
    // chart real history from day one without a snapshot table. Big blobs are sized by their column so the
    // query never has to detoast them.
    sql`
      SELECT t, date_trunc('hour', at) AS hour, sum(bytes)::bigint AS bytes, count(*)::int AS rows FROM (
        SELECT 'users' AS t, created_at AS at, pg_column_size(u.*) AS bytes FROM users u
        UNION ALL SELECT 'sessions', created_at, pg_column_size(s.*) FROM sessions s
        UNION ALL SELECT 'settings', updated_at, pg_column_size(g.*) FROM settings g
        UNION ALL SELECT 'list_items', created_at, pg_column_size(i.*) FROM list_items i
        UNION ALL SELECT 'photos', created_at, pg_column_size(image_base64) + 256 FROM photos
        UNION ALL SELECT 'itinerary', updated_at, pg_column_size(y.*) FROM itinerary y
        UNION ALL SELECT 'trip_info', created_at, pg_column_size(x.*) FROM trip_info x
        UNION ALL SELECT 'trip_documents', created_at, pg_column_size(file_base64) + 256 FROM trip_documents
        UNION ALL SELECT 'audit_log', at, pg_column_size(a.*) FROM audit_log a
      ) sized GROUP BY 1, 2 ORDER BY 2
    `
  ]);
  const counts = await sql`
    SELECT 'users' AS name, count(*)::int AS rows FROM users
    UNION ALL SELECT 'sessions', count(*)::int FROM sessions
    UNION ALL SELECT 'settings', count(*)::int FROM settings
    UNION ALL SELECT 'list_items', count(*)::int FROM list_items
    UNION ALL SELECT 'photos', count(*)::int FROM photos
    UNION ALL SELECT 'itinerary', count(*)::int FROM itinerary
    UNION ALL SELECT 'trip_info', count(*)::int FROM trip_info
    UNION ALL SELECT 'trip_documents', count(*)::int FROM trip_documents
    UNION ALL SELECT 'audit_log', count(*)::int FROM audit_log
  `;
  const rowCounts = Object.fromEntries(counts.map((row: any) => [row.name, row.rows]));

  // Growth: running totals per table, sampled at each chart bucket across the window (plus the level at the
  // start of the window, so the line never begins at zero when data already existed).
  const running: Record<string, number> = {};
  let total = 0;
  const timeline = growthRows.map((row: any) => ({ at: new Date(row.hour).getTime(), t: String(row.t), bytes: Number(row.bytes) }));
  const points: { at: number; total: number; byTable: Record<string, number> }[] = [];
  let index = 0;
  const step = bucket * 60_000;
  for (let at = from.getTime(); at <= to.getTime(); at += step) {
    while (index < timeline.length && timeline[index].at < at + step) {
      const entry = timeline[index++];
      running[entry.t] = (running[entry.t] || 0) + entry.bytes;
      total += entry.bytes;
    }
    points.push({ at, total, byTable: { ...running } });
  }

  return {
    window: { minutes, from: from.toISOString(), to: to.toISOString(), bucketMinutes: bucket },
    totals: totals[0],
    routes,
    series: series.map((row: any) => ({ at: new Date(row.bucket).getTime(), calls: row.calls, errors: row.errors, avgMs: row.avg_ms, p95Ms: row.p95_ms })),
    database: {
      bytes: Number(dbSize[0].bytes),
      tables: tables.map((row: any) => ({ name: row.name, bytes: Number(row.bytes), rows: rowCounts[row.name] ?? row.estimated_rows })),
      growth: points
    }
  };
}

export async function listUsers() {
  const rows = await getSql()`
    SELECT u.id, u.email, u.created_at, u.suspended_at, s.profile_name,
      (SELECT count(*)::int FROM list_items WHERE user_id = u.id) AS items,
      (SELECT count(*)::int FROM trip_info WHERE user_id = u.id) AS bookings,
      (SELECT count(*)::int FROM photos WHERE user_id = u.id) AS photos,
      (SELECT coalesce(sum(pg_column_size(image_base64)), 0)::bigint FROM photos WHERE user_id = u.id) AS photo_bytes,
      (SELECT count(*)::int FROM trip_documents WHERE user_id = u.id) AS documents,
      (SELECT coalesce(sum(pg_column_size(file_base64)), 0)::bigint FROM trip_documents WHERE user_id = u.id) AS document_bytes,
      (SELECT count(*)::int FROM sessions WHERE user_id = u.id AND expires_at > now()) AS sessions,
      (SELECT max(at) FROM audit_log WHERE user_id = u.id AND event = 'auth.signin' AND status < 400) AS last_signin,
      (SELECT max(at) FROM audit_log WHERE user_id = u.id) AS last_seen,
      (SELECT ip FROM audit_log WHERE user_id = u.id ORDER BY at DESC LIMIT 1) AS last_ip
    FROM users u LEFT JOIN settings s ON s.user_id = u.id
    ORDER BY u.created_at
  `;
  return rows.map((row: any) => ({
    id: String(row.id),
    email: String(row.email),
    name: decryptText(row.profile_name),
    owner: isOwner(String(row.email)),
    createdAt: row.created_at,
    suspendedAt: row.suspended_at,
    items: row.items, bookings: row.bookings, photos: row.photos, documents: row.documents,
    storedBytes: Number(row.photo_bytes) + Number(row.document_bytes),
    sessions: row.sessions,
    lastSignin: row.last_signin, lastSeen: row.last_seen, lastIp: row.last_ip
  }));
}

export type UserAction = "suspend" | "unsuspend" | "revoke" | "delete";
export const userActions = new Set<UserAction>(["suspend", "unsuspend", "revoke", "delete"]);

export async function actOnUser(actorId: string, id: string, action: UserAction) {
  const sql = getSql();
  const rows = await sql`SELECT id, email FROM users WHERE id = ${id}`;
  if (!rows.length) fail("That account no longer exists", 404);
  const email = String(rows[0].email);
  if (String(rows[0].id) === actorId) fail("You can't do that to your own account");
  if (isOwner(email)) fail("The organizer account can't be changed here");
  if (action === "suspend") {
    await sql.transaction([
      sql`UPDATE users SET suspended_at = now(), updated_at = now() WHERE id = ${id}`,
      sql`DELETE FROM sessions WHERE user_id = ${id}`
    ]);
  } else if (action === "unsuspend") {
    await sql`UPDATE users SET suspended_at = NULL, updated_at = now() WHERE id = ${id}`;
  } else if (action === "revoke") {
    await sql`DELETE FROM sessions WHERE user_id = ${id}`;
  } else {
    await sql`DELETE FROM users WHERE id = ${id}`;
  }
  return email;
}

export async function activity(window: ReturnType<typeof windowFromParams>, filters: { event: string | null; q: string | null; limit: number; traffic: boolean }) {
  const like = filters.q ? `%${filters.q}%` : null;
  const rows = await getSql()`
    SELECT id, at, event, method, route, status, ms, email, target, ip, user_agent, detail, kind
    FROM audit_log
    WHERE at >= ${window.from} AND at < ${window.to}
      AND (${filters.traffic} OR kind = 'activity')
      AND (${filters.event}::text IS NULL OR event = ${filters.event})
      AND (${like}::text IS NULL OR email ILIKE ${like} OR ip ILIKE ${like} OR target ILIKE ${like} OR detail ILIKE ${like} OR route ILIKE ${like})
    ORDER BY at DESC LIMIT ${filters.limit}
  `;
  const events = await getSql()`SELECT DISTINCT event FROM audit_log WHERE at >= ${window.from} AND (${filters.traffic} OR kind = 'activity') ORDER BY 1`;
  return { rows: rows.map((row: any) => ({ ...row, id: String(row.id) })), events: events.map((row: any) => String(row.event)) };
}
