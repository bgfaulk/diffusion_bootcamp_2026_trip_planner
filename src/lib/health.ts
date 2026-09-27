import { encryptText } from "./crypto";
import { getSql } from "./db";
import { mailConfigured, sendMail } from "./mail";

// Application health for the organizer. A check reads the last hour of the audit log and the database size,
// stores a snapshot, compares against the thresholds below, and for each one crossed sends the owner an
// in-app notification (kind "health", with the details the notification modal shows) plus an email. The same
// alert repeats at most once a day. Checks run from the daily Vercel cron, when the owner opens the app
// (throttled), and from "Check now" on the Organizer page.

export const HEALTH = {
  windowMinutes: 60,
  minRequests: 20,        // latency and error thresholds need at least this many requests to mean anything
  p95Ms: 2000,
  avgMs: 800,
  failureRate: 0.05,      // 5xx responses / requests
  sizeWarnBytes: 350 * 1024 * 1024,     // Neon's free tier stores 512 MB
  sizeCriticalBytes: 450 * 1024 * 1024,
  growthBytes24h: 50 * 1024 * 1024,
  repeatHours: 24,
  visitThrottleMinutes: 15
};

export type HealthSnapshot = { checkedAt: string; requests: number; avgMs: number; p95Ms: number; failures: number; dbBytes: number; growthBytes24h: number | null };
type Alert = { key: string; title: string; body: string; rows: [string, string][]; advice: string[] };

export function formatBytes(bytes: number) {
  const abs = Math.abs(bytes);
  if (abs >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (abs >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export async function ownerUserId(): Promise<string | null> {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) return null;
  const rows = await getSql()`SELECT id FROM users WHERE lower(email) = ${owner} LIMIT 1`;
  return rows[0] ? String(rows[0].id) : null;
}

// An in-app notification for the owner's account. `data` is what the notification modal shows when the
// notice is opened: display-ready rows plus optional advice lines.
export async function notifyOwner(kind: string, title: string, body: string, data?: { rows: [string, string][]; advice?: string[] }) {
  const id = await ownerUserId();
  if (!id) return false;
  await getSql()`
    INSERT INTO notifications (user_id, kind, title, body, data)
    VALUES (${id}, ${kind}, ${encryptText(title)}, ${encryptText(body)}, ${data ? encryptText(JSON.stringify(data)) : null})
  `;
  return true;
}

export async function latestSnapshot(): Promise<HealthSnapshot | null> {
  const rows = await getSql()`SELECT checked_at, requests, avg_ms, p95_ms, failures, db_bytes, growth_bytes_24h FROM health_snapshots ORDER BY checked_at DESC LIMIT 1`;
  return rows[0] ? toSnapshot(rows[0]) : null;
}

function toSnapshot(row: any): HealthSnapshot {
  return { checkedAt: new Date(row.checked_at).toISOString(), requests: Number(row.requests), avgMs: Number(row.avg_ms), p95Ms: Number(row.p95_ms), failures: Number(row.failures), dbBytes: Number(row.db_bytes), growthBytes24h: row.growth_bytes_24h == null ? null : Number(row.growth_bytes_24h) };
}

export async function runHealthCheck(trigger: "cron" | "owner" | "manual", options: { demo?: boolean } = {}) {
  const sql = getSql();
  if (trigger === "owner") {
    const last = await latestSnapshot();
    if (last && Date.now() - new Date(last.checkedAt).getTime() < HEALTH.visitThrottleMinutes * 60_000) return { skipped: true as const, snapshot: last, fired: [] as string[] };
  }
  const [totals, size, prior] = await Promise.all([
    sql`
      SELECT count(*)::int AS requests,
             coalesce(round(avg(ms)), 0)::int AS avg_ms,
             coalesce((percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)), 0)::int AS p95_ms,
             count(*) FILTER (WHERE status >= 500)::int AS failures
      FROM audit_log
      WHERE at >= now() - make_interval(mins => ${HEALTH.windowMinutes}) AND coalesce(route, '') NOT LIKE '/api/health%'
    `,
    sql`SELECT pg_database_size(current_database())::bigint AS bytes`,
    sql`SELECT db_bytes FROM health_snapshots WHERE checked_at <= now() - interval '23 hours' ORDER BY checked_at DESC LIMIT 1`
  ]);
  const requests = Number(totals[0].requests), avgMs = Number(totals[0].avg_ms), p95Ms = Number(totals[0].p95_ms), failures = Number(totals[0].failures);
  const dbBytes = Number(size[0].bytes);
  const growth = prior[0] ? dbBytes - Number(prior[0].db_bytes) : null;
  const inserted = await sql`
    INSERT INTO health_snapshots (requests, avg_ms, p95_ms, failures, db_bytes, growth_bytes_24h)
    VALUES (${requests}, ${avgMs}, ${p95Ms}, ${failures}, ${dbBytes}, ${growth})
    RETURNING checked_at, requests, avg_ms, p95_ms, failures, db_bytes, growth_bytes_24h
  `;
  await sql`DELETE FROM health_snapshots WHERE checked_at < now() - interval '90 days'`;
  const snapshot = toSnapshot(inserted[0]);

  // Outside production, ?demo=1 sets every threshold to zero so the alert path can be exercised.
  const t = options.demo && process.env.NODE_ENV !== "production" ? { ...HEALTH, minRequests: 0, p95Ms: -1, avgMs: -1, failureRate: -1, sizeWarnBytes: -1, sizeCriticalBytes: Number.MAX_SAFE_INTEGER, growthBytes24h: -1 } : HEALTH;
  const checkedAt = new Date(snapshot.checkedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }) + " Pacific";
  const common: [string, string][] = [
    ["Window", `Last ${t.windowMinutes} minutes`],
    ["Requests in window", String(requests)],
    ["Average response", `${avgMs} ms`],
    ["Slowest 5% (p95)", `${p95Ms} ms`],
    ["Server errors", String(failures)],
    ["Database size", formatBytes(dbBytes)],
    ["Growth in 24 hours", growth == null ? "Not enough history yet" : formatBytes(growth)],
    ["Checked", checkedAt]
  ];
  const alerts: Alert[] = [];
  const enough = requests >= t.minRequests;
  if (enough && p95Ms > t.p95Ms) alerts.push({ key: "p95", title: "Slow responses", body: `The slowest 5% of requests took ${p95Ms} ms over the last hour (threshold ${HEALTH.p95Ms} ms).`, rows: [["Threshold", `p95 above ${HEALTH.p95Ms} ms`], ...common], advice: ["Open the Organizer Overview and sort routes by p95 to see which endpoint is slow.", "Neon databases pause when idle; the first request after a pause can take a few seconds. If p95 is high only at quiet times, that's the cause.", "If it persists during active use, look at the slow route's queries or the size of the rows it returns."] });
  if (enough && avgMs > t.avgMs) alerts.push({ key: "avg", title: "Slow on average", body: `Requests averaged ${avgMs} ms over the last hour (threshold ${HEALTH.avgMs} ms).`, rows: [["Threshold", `average above ${HEALTH.avgMs} ms`], ...common], advice: ["A high average with a normal p95 usually means every request is slow, not a few outliers. Check the database region matches the Vercel region.", "Compare with the Requests chart on the Organizer Overview to see when it started."] });
  if (enough && failures / Math.max(1, requests) > t.failureRate) alerts.push({ key: "errors", title: "Server errors", body: `${failures} of ${requests} requests failed with a server error in the last hour (threshold ${Math.round(HEALTH.failureRate * 100)}%).`, rows: [["Threshold", `more than ${Math.round(HEALTH.failureRate * 100)}% of requests`], ...common], advice: ["The Activity tab on the Organizer page lists each failed request with its route and message.", "Check the Vercel deployment logs for the same time; a failed deploy or a missing environment variable shows up there."] });
  if (dbBytes > t.sizeCriticalBytes) alerts.push({ key: "size-critical", title: "Database almost full", body: `The database is ${formatBytes(dbBytes)}, close to the 512 MB limit of Neon's free plan.`, rows: [["Threshold", `above ${formatBytes(HEALTH.sizeCriticalBytes)}`], ...common], advice: ["Photos and PDFs are the large rows. The Organizer Overview shows bytes per table.", "Ask attendees to remove photos they don't need, or raise the plan on Neon before writes start failing."] });
  else if (dbBytes > t.sizeWarnBytes) alerts.push({ key: "size-warn", title: "Database getting large", body: `The database is ${formatBytes(dbBytes)} (warning threshold ${formatBytes(HEALTH.sizeWarnBytes)}).`, rows: [["Threshold", `above ${formatBytes(HEALTH.sizeWarnBytes)}`], ...common], advice: ["Photos are shrunk before upload and capped at six per person, so PDFs are the next thing to look at.", "The Organizer Overview shows bytes per table and the growth chart."] });
  if (growth != null && growth > t.growthBytes24h) alerts.push({ key: "growth", title: "Database growing quickly", body: `The database grew ${formatBytes(growth)} in the last 24 hours (threshold ${formatBytes(HEALTH.growthBytes24h)}).`, rows: [["Threshold", `more than ${formatBytes(HEALTH.growthBytes24h)} in 24 hours`], ...common], advice: ["A burst of photo or PDF uploads is the usual cause. The growth chart on the Organizer Overview shows which table.", "If it keeps up for a few days, the size thresholds will follow."] });

  const fired: string[] = [];
  for (const alert of alerts) {
    const state = await sql`SELECT last_alert_at FROM health_alert_state WHERE key = ${alert.key}`;
    if (!options.demo && state[0] && Date.now() - new Date(state[0].last_alert_at).getTime() < HEALTH.repeatHours * 3_600_000) continue;
    await notifyOwner("health", alert.title, alert.body, { rows: alert.rows, advice: alert.advice });
    await sql`INSERT INTO health_alert_state (key, last_alert_at) VALUES (${alert.key}, now()) ON CONFLICT (key) DO UPDATE SET last_alert_at = now()`;
    const owner = process.env.OWNER_EMAIL?.trim();
    if (owner && (mailConfigured() || process.env.NODE_ENV !== "production")) {
      const lines = alert.rows.map(([label, value]) => `${label}: ${value}`).join("\n");
      const text = `${alert.body}\n\n${lines}\n\nWhat to do:\n${alert.advice.map(line => `- ${line}`).join("\n")}\n`;
      const escape = (value: string) => value.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch] as string));
      const html = `<p>${escape(alert.body)}</p><table>${alert.rows.map(([label, value]) => `<tr><td style="padding:2px 12px 2px 0;color:#555">${escape(label)}</td><td>${escape(value)}</td></tr>`).join("")}</table><p><strong>What to do</strong></p><ul>${alert.advice.map(line => `<li>${escape(line)}</li>`).join("")}</ul>`;
      try { await sendMail(owner, `[Trip Planner] ${alert.title}`, text, html); } catch {}
    }
    fired.push(alert.key);
  }
  return { skipped: false as const, snapshot, fired };
}
