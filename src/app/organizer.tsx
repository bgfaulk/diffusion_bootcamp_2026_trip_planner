"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { DEFAULT_WINDOW_MINUTES } from "@/lib/time-window";
import { TabPanel, Tabs } from "./tabs";
import { RefreshControl, TimeWindowPill } from "./time-window-pill";

// The Organizer page (OWNER_EMAIL only): how the app is doing, who is registered, and what has been happening.
// One time window scopes the Overview and Activity tabs; Refresh and auto-refresh reload whichever tab is open.

type OrganizerTab = "overview" | "users" | "activity";

export function OrganizerPage({ userId }: { userId: string }) {
  const [tab, setTab] = useState<OrganizerTab>("overview");
  const [minutes, setMinutes] = useState(DEFAULT_WINDOW_MINUTES);
  const [refreshSeconds, setRefreshSeconds] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const refresh = useCallback(() => setTick(value => value + 1), []);
  useEffect(() => {
    if (refreshSeconds == null) return;
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [refreshSeconds, refresh]);
  const onLoaded = useCallback((loading: boolean) => { setBusy(loading); if (!loading) setUpdatedAt(new Date()); }, []);
  const shared = { minutes, tick, onLoading: onLoaded };
  return (
    <section className="page active organizer">
      <header className="page-header page-header-row">
        <div><p className="eyebrow">Organizer</p><h1>How the trip planner is doing</h1></div>
        <div className="pill-row">
          <TimeWindowPill minutes={minutes} onChange={setMinutes} disabled={busy} />
          <RefreshControl refreshing={busy} onRefresh={refresh} seconds={refreshSeconds} onSeconds={setRefreshSeconds} updatedAt={updatedAt} />
        </div>
      </header>
      <Tabs label="Organizer sections" active={tab} onChange={setTab} tabs={[{ key: "overview", label: "Overview" }, { key: "users", label: "Accounts" }, { key: "activity", label: "Activity" }]} />
      {tab === "overview" && <TabPanel id="overview"><OverviewTab {...shared} /></TabPanel>}
      {tab === "users" && <TabPanel id="users"><UsersTab {...shared} userId={userId} /></TabPanel>}
      {tab === "activity" && <TabPanel id="activity"><ActivityTab {...shared} /></TabPanel>}
    </section>
  );
}

type Shared = { minutes: number; tick: number; onLoading: (loading: boolean) => void };

// Fetches `path` whenever the window or the refresh tick changes; keeps the last data on screen while reloading.
function useAdmin<T>(path: string | null, { tick, onLoading }: Shared) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const id = ++latest.current;
    setLoading(true); onLoading(true);
    try {
      const next = await api(path);
      if (id === latest.current) { setData(next); setError(""); }
    } catch (err) {
      if (id === latest.current) setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      if (id === latest.current) { setLoading(false); onLoading(false); }
    }
  }, [path, onLoading]);
  useEffect(() => { void load(); }, [load, tick]);
  return { data, error, loading, reload: load };
}

/* ---------- sortable tables ---------- */

type SortDir = 1 | -1;
type SortState = { key: string; dir: SortDir };
type Cell = string | number | null | undefined;

// Click a header to sort by it; click again to flip. Numbers and dates start descending (biggest or newest
// first), text starts ascending. Empty cells always sink to the bottom whichever way the column points.
function useSort<T>(rows: T[], initial: SortState, cell: (row: T, key: string) => Cell) {
  const [sort, setSort] = useState<SortState>(initial);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const x = cell(a, sort.key), y = cell(b, sort.key);
    const xEmpty = x === null || x === undefined || x === "", yEmpty = y === null || y === undefined || y === "";
    if (xEmpty || yEmpty) return xEmpty === yEmpty ? 0 : xEmpty ? 1 : -1;
    const result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { sensitivity: "base", numeric: true });
    return result * sort.dir;
  }), [rows, sort, cell]);
  const toggle = (key: string, numeric: boolean) => setSort(current => current.key === key ? { key, dir: (current.dir * -1) as SortDir } : { key, dir: numeric ? -1 : 1 });
  return { sorted, sort, toggle };
}

function Th({ label, sortKey, sort, onSort, numeric = false }: { label: string; sortKey: string; sort: SortState; onSort: (key: string, numeric: boolean) => void; numeric?: boolean }) {
  const active = sort.key === sortKey;
  return (
    <th className={numeric ? "num sort-th" : "sort-th"} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey, numeric)} className={active ? "on" : ""}>{label}<span aria-hidden="true">{active ? (sort.dir === 1 ? "▲" : "▼") : "▵"}</span></button>
    </th>
  );
}

const dateCell = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);

/* ---------- Overview ---------- */

type Overview = {
  window: { minutes: number; from: string; to: string; bucketMinutes: number };
  totals: { calls: number; errors: number; failures: number; avg_ms: number; p95_ms: number; users: number; signins: number; failed_signins: number; signups: number };
  routes: { route: string; method: string; calls: number; errors: number; avg_ms: number; p95_ms: number; max_ms: number }[];
  series: { at: number; calls: number; errors: number; avgMs: number; p95Ms: number }[];
  database: { bytes: number; tables: { name: string; bytes: number; rows: number }[]; growth: { at: number; total: number; byTable: Record<string, number> }[] };
};

function OverviewTab(shared: Shared) {
  const { data, error, loading } = useAdmin<Overview>(`/api/admin/overview?minutes=${shared.minutes}`, shared);
  const tables = useSort(data?.database.tables ?? noTables, { key: "bytes", dir: -1 }, tableCell);
  const routes = useSort(data?.routes ?? noRoutes, { key: "calls", dir: -1 }, routeCell);
  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading...</p>;
  const t = data.totals;
  const errorRate = t.calls ? Math.round((t.errors / t.calls) * 1000) / 10 : 0;
  const tableTotal = data.database.tables.reduce((sum, table) => sum + table.bytes, 0);
  return (
    <div className={loading ? "stack reloading" : "stack"}>
      {error && <p className="error">{error} Showing the last loaded data.</p>}
      <div className="stat-grid">
        <Stat label="Requests" value={t.calls.toLocaleString("en-US")} note={`${data.window.bucketMinutes} min buckets`} />
        <Stat label="Errors" value={t.errors.toLocaleString("en-US")} note={`${errorRate}% of requests · ${t.failures} server-side`} tone={t.failures ? "bad" : t.errors ? "warn" : undefined} />
        <Stat label="Latency" value={`${t.avg_ms} ms`} note={`p95 ${t.p95_ms} ms`} />
        <Stat label="Active accounts" value={String(t.users)} note={`${t.signins} sign-ins · ${t.failed_signins} failed · ${t.signups} new`} tone={t.failed_signins > 10 ? "warn" : undefined} />
        <Stat label="Database" value={fmtBytes(data.database.bytes)} note={`${data.database.tables.length} tables · ${fmtBytes(tableTotal)} in tables`} />
      </div>
      <Panel title="Requests" note="API calls per bucket; errors are any 4xx or 5xx.">
        <TimeChart points={data.series.map(row => ({ at: row.at, values: [row.calls, row.errors] }))} series={[{ label: "Requests", color: "var(--accent)", kind: "bar" }, { label: "Errors", color: "var(--danger)", kind: "bar" }]} from={data.window.from} to={data.window.to} bucketMinutes={data.window.bucketMinutes} format={value => value.toLocaleString("en-US")} />
      </Panel>
      <Panel title="Latency" note="Server time per request, average and 95th percentile.">
        <TimeChart points={data.series.map(row => ({ at: row.at, values: [row.avgMs, row.p95Ms] }))} series={[{ label: "Average", color: "var(--accent)", kind: "line" }, { label: "p95", color: "var(--bay)", kind: "line" }]} from={data.window.from} to={data.window.to} bucketMinutes={data.window.bucketMinutes} format={value => `${Math.round(value)} ms`} />
      </Panel>
      <Panel title="Stored data growth" note="Bytes of row content by creation time, cumulative. Indexes and free space are not included; the Database tile has the full on-disk size.">
        <TimeChart points={data.database.growth.map(point => ({ at: point.at, values: [point.total], extra: point.byTable }))} series={[{ label: "Stored bytes", color: "var(--accent)", kind: "line", area: true }]} from={data.window.from} to={data.window.to} bucketMinutes={data.window.bucketMinutes} format={fmtBytes} extraLabel="by table" />
      </Panel>
      <div className="two-up">
        <Panel title="Tables" note="On-disk size including indexes, and exact row counts.">
          <div className="table-scroll"><table className="fact-table data-table">
            <thead><tr><Th label="Table" sortKey="name" sort={tables.sort} onSort={tables.toggle} /><Th label="Rows" sortKey="rows" numeric sort={tables.sort} onSort={tables.toggle} /><Th label="Size" sortKey="bytes" numeric sort={tables.sort} onSort={tables.toggle} /><th>Share</th></tr></thead>
            <tbody>
              {tables.sorted.map(table => (
                <tr key={table.name}><td><code>{table.name}</code></td><td className="num">{table.rows.toLocaleString("en-US")}</td><td className="num">{fmtBytes(table.bytes)}</td><td><span className="share-bar"><i style={{ width: `${tableTotal ? Math.max(2, (table.bytes / tableTotal) * 100) : 0}%` }} /></span></td></tr>
              ))}
            </tbody>
          </table></div>
        </Panel>
        <Panel title="Routes" note="Busiest endpoints in the window.">
          {data.routes.length ? (
            <div className="table-scroll"><table className="fact-table data-table">
              <thead><tr><Th label="Route" sortKey="route" sort={routes.sort} onSort={routes.toggle} /><Th label="Calls" sortKey="calls" numeric sort={routes.sort} onSort={routes.toggle} /><Th label="Errors" sortKey="errors" numeric sort={routes.sort} onSort={routes.toggle} /><Th label="Avg" sortKey="avg_ms" numeric sort={routes.sort} onSort={routes.toggle} /><Th label="p95" sortKey="p95_ms" numeric sort={routes.sort} onSort={routes.toggle} /><Th label="Max" sortKey="max_ms" numeric sort={routes.sort} onSort={routes.toggle} /></tr></thead>
              <tbody>
                {routes.sorted.map(route => (
                  <tr key={`${route.method} ${route.route}`}><td><code>{route.method} {route.route}</code></td><td className="num">{route.calls}</td><td className={route.errors ? "num bad" : "num"}>{route.errors}</td><td className="num">{route.avg_ms} ms</td><td className="num">{route.p95_ms} ms</td><td className="num">{route.max_ms} ms</td></tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className="muted">No requests in this window.</p>}
        </Panel>
      </div>
    </div>
  );
}

const noTables: Overview["database"]["tables"] = [];
const noRoutes: Overview["routes"] = [];
const tableCell = (row: Overview["database"]["tables"][number], key: string) => (row as unknown as Record<string, Cell>)[key];
const routeCell = (row: Overview["routes"][number], key: string) => (key === "route" ? `${row.route} ${row.method}` : (row as unknown as Record<string, Cell>)[key]);

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" | "bad" }) {
  return <div className={`stat-tile ${tone || ""}`}><span className="eyebrow">{label}</span><strong>{value}</strong>{note && <span className="muted">{note}</span>}</div>;
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className="org-panel"><div className="panel-head"><div><h2>{title}</h2>{note && <p className="muted">{note}</p>}</div></div>{children}</section>;
}

/* ---------- chart ---------- */

type ChartSeries = { label: string; color: string; kind: "bar" | "line"; area?: boolean };
type ChartPoint = { at: number; values: number[]; extra?: Record<string, number> };

// One SVG for bars and lines: recessive hairline grid, thin marks, a crosshair that snaps to the nearest
// bucket, and a tooltip listing every series at that time. Text uses ink tokens; only marks wear the series color.
function TimeChart({ points, series, from, to, bucketMinutes, format, extraLabel }: { points: ChartPoint[]; series: ChartSeries[]; from: string; to: string; bucketMinutes: number; format: (value: number) => string; extraLabel?: string }) {
  const W = 720, H = 220, top = 12, right = 12, bottom = 28, left = 56;
  const plotW = W - left - right, plotH = H - top - bottom;
  const fromMs = new Date(from).getTime(), toMs = new Date(to).getTime();
  const span = Math.max(1, toMs - fromMs);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const max = useMemo(() => Math.max(1, ...points.flatMap(point => point.values)), [points]);
  const ticks = useMemo(() => niceTicks(max), [max]);
  const yMax = ticks[ticks.length - 1] || max;
  const x = (at: number) => left + ((at - fromMs) / span) * plotW;
  const y = (value: number) => top + plotH - (value / yMax) * plotH;
  const slot = (bucketMinutes * 60_000 / span) * plotW;
  const barW = Math.min(24, Math.max(2, slot * 0.7));
  const labels = timeLabels(fromMs, toMs);

  function onMove(event: React.PointerEvent) {
    const svg = svgRef.current; if (!svg || !points.length) return;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const at = fromMs + ((px - left) / plotW) * span;
    let best = 0, bestDist = Infinity;
    points.forEach((point, index) => { const d = Math.abs(point.at + bucketMinutes * 30_000 - at); if (d < bestDist) { bestDist = d; best = index; } });
    setHover(best);
  }
  const active = hover !== null ? points[hover] : null;
  const activeX = active ? x(active.at) + (series.every(s => s.kind === "bar") ? slot / 2 : 0) : 0;

  return (
    <div className="chart">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={series.map(s => s.label).join(", ")} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map(tick => <g key={tick}><line x1={left} x2={W - right} y1={y(tick)} y2={y(tick)} className="grid" /><text x={left - 8} y={y(tick) + 4} className="axis" textAnchor="end">{format(tick)}</text></g>)}
        <line x1={left} x2={W - right} y1={top + plotH} y2={top + plotH} className="baseline" />
        {labels.map(label => <text key={label.at} x={x(label.at)} y={H - 8} className="axis" textAnchor="middle">{label.text}</text>)}
        {series.map((s, si) => {
          if (s.kind === "bar") {
            return <g key={si} fill={s.color}>{points.map((point, index) => {
              const value = point.values[si]; if (!value) return null;
              const bx = x(point.at) + (slot - barW) / 2, by = y(value), h = top + plotH - by, r = Math.min(4, h, barW / 2);
              return <path key={index} d={`M${bx},${top + plotH} V${by + r} a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${top + plotH} Z`} opacity={hover === null || hover === index ? 1 : 0.55} />;
            })}</g>;
          }
          const path = points.map((point, index) => `${index ? "L" : "M"}${x(point.at) + slot / 2},${y(point.values[si])}`).join(" ");
          const area = `${path} L${x(points[points.length - 1].at) + slot / 2},${top + plotH} L${x(points[0].at) + slot / 2},${top + plotH} Z`;
          return <g key={si}>{s.area && points.length > 1 && <path d={area} fill={s.color} opacity={0.1} />}<path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /></g>;
        })}
        {active && <line x1={activeX} x2={activeX} y1={top} y2={top + plotH} className="crosshair" />}
        {active && series.map((s, si) => s.kind === "line" && <circle key={si} cx={x(active.at) + slot / 2} cy={y(active.values[si])} r={4} fill={s.color} className="dot" />)}
      </svg>
      {active && (
        <div className="chart-tip" style={{ left: `${(activeX / W) * 100}%` }}>
          <span className="muted">{tipTime(active.at, bucketMinutes)}</span>
          {series.map((s, si) => <div key={si}><i style={{ background: s.color }} /><strong>{format(active.values[si])}</strong><span>{s.label}</span></div>)}
          {active.extra && extraLabel && Object.entries(active.extra).filter(([, bytes]) => bytes > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, bytes]) => <div key={name} className="tip-extra"><strong>{format(bytes)}</strong><span>{name}</span></div>)}
        </div>
      )}
      {series.length > 1 && <div className="chart-legend">{series.map((s, si) => <span key={si}><i className={s.kind} style={{ background: s.color }} />{s.label}</span>)}</div>}
      {!points.length && <p className="muted chart-empty">Nothing recorded in this window yet.</p>}
    </div>
  );
}

function niceTicks(max: number) {
  const raw = max / 4;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * power).find(candidate => candidate >= raw) || power;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step - 1e-9 && ticks.length < 8; value += step) ticks.push(Math.round(value * 1000) / 1000);
  return ticks;
}

function timeLabels(fromMs: number, toMs: number) {
  const span = toMs - fromMs, count = 6, labels: { at: number; text: string }[] = [];
  for (let i = 0; i <= count; i++) {
    const at = fromMs + (span / count) * i;
    labels.push({ at, text: span <= 2 * 86400000 ? clock(new Date(at)) : new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
  }
  return labels;
}

function tipTime(at: number, bucketMinutes: number) {
  const date = new Date(at);
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return bucketMinutes >= 1440 ? day : `${day} ${clock(date)}`;
}

function clock(date: Date) { return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }

/* ---------- Accounts ---------- */

type Account = { id: string; email: string; name: string; owner: boolean; createdAt: string; suspendedAt: string | null; items: number; bookings: number; photos: number; documents: number; storedBytes: number; sessions: number; lastSignin: string | null; lastSeen: string | null; lastIp: string | null };

function UsersTab({ userId, ...shared }: Shared & { userId: string }) {
  const { data, error, loading, reload } = useAdmin<{ users: Account[] }>("/api/admin/users", shared);
  const accounts = useSort(data?.users ?? noAccounts, { key: "createdAt", dir: 1 }, accountCell);
  const [pending, setPending] = useState<null | { account: Account; action: "suspend" | "delete" | "revoke" }>(null);
  const [confirmText, setConfirmText] = useState("");
  const [link, setLink] = useState<null | { email: string; url: string; expiresAt: string }>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function act(account: Account, action: "suspend" | "unsuspend" | "revoke" | "delete") {
    setMessage(""); setBusy(account.id);
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify({ id: account.id, action }) });
      setMessage({ suspend: `Suspended ${account.email}.`, unsuspend: `Reinstated ${account.email}.`, revoke: `Signed ${account.email} out everywhere.`, delete: `Deleted ${account.email} and all of their data.` }[action]);
      setPending(null); setConfirmText("");
      await reload();
    } catch (err) { setMessage(err instanceof Error ? err.message : "That didn't work"); } finally { setBusy(""); }
  }
  async function resetLink(account: Account, send = false) {
    setMessage(""); setBusy(account.id);
    try {
      const result = await api("/api/reset-link", { method: "POST", body: JSON.stringify({ email: account.email, send }) });
      if (send && result.sent) { setLink(null); setMessage(`Emailed a reset link to ${account.email}. It works once and expires in 24 hours.`); }
      else setLink({ email: account.email, url: `${location.origin}/?reset=${result.token}`, expiresAt: result.expiresAt });
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not create a reset link"); } finally { setBusy(""); }
  }

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading...</p>;
  return (
    <div className={loading ? "stack reloading" : "stack"}>
      {message && <p className="save-status">{message}</p>}
      {link && (
        <div className="org-panel stack">
          <div className="panel-head"><div><h2>Reset link for {link.email}</h2><p className="muted">Send it to them yourself. It lasts 24 hours and works once.</p></div><button type="button" className="link-button" onClick={() => setLink(null)}>Dismiss</button></div>
          <input value={link.url} readOnly onFocus={event => event.target.select()} />
          <div className="button-row"><button type="button" className="btn" onClick={() => navigator.clipboard.writeText(link.url).catch(() => {})}>Copy link</button><span className="muted">Expires {new Date(link.expiresAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.</span></div>
        </div>
      )}
      <div className="org-panel table-scroll">
        <table className="fact-table data-table accounts">
          <thead><tr><Th label="Account" sortKey="email" sort={accounts.sort} onSort={accounts.toggle} /><Th label="Status" sortKey="status" sort={accounts.sort} onSort={accounts.toggle} /><Th label="Last sign-in" sortKey="lastSignin" numeric sort={accounts.sort} onSort={accounts.toggle} /><Th label="Last seen" sortKey="lastSeen" numeric sort={accounts.sort} onSort={accounts.toggle} /><Th label="Data" sortKey="storedBytes" numeric sort={accounts.sort} onSort={accounts.toggle} /><Th label="Sessions" sortKey="sessions" numeric sort={accounts.sort} onSort={accounts.toggle} /><th>Actions</th></tr></thead>
          <tbody>
            {accounts.sorted.map(account => {
              const self = account.id === userId;
              return (
                <tr key={account.id} className={account.suspendedAt ? "suspended" : ""}>
                  <td><strong>{account.name || account.email}</strong>{account.name && <span className="muted">{account.email}</span>}<span className="muted">Joined {fmtWhen(account.createdAt)}{account.owner ? " · organizer" : ""}</span></td>
                  <td>{account.suspendedAt ? <span className="status-pill bad">Suspended {fmtWhen(account.suspendedAt)}</span> : <span className="status-pill ok">Active</span>}</td>
                  <td>{account.lastSignin ? fmtWhen(account.lastSignin) : <span className="muted">Never</span>}</td>
                  <td>{account.lastSeen ? <>{fmtWhen(account.lastSeen)}{account.lastIp && <span className="muted">{account.lastIp}</span>}</> : <span className="muted">No activity</span>}</td>
                  <td className="num">{fmtBytes(account.storedBytes)}<span className="muted">{account.bookings} bookings · {account.items} items · {account.photos} photos · {account.documents} PDFs</span></td>
                  <td className="num">{account.sessions}</td>
                  <td>
                    {self || account.owner ? <span className="muted">{self ? "This is you" : "Organizer"}</span> : (
                      <div className="row-actions">
                        <button type="button" className="link-button" disabled={busy === account.id} onClick={() => resetLink(account, true)}>Email reset link</button>
                        <button type="button" className="link-button" disabled={busy === account.id} onClick={() => resetLink(account)}>Copy reset link</button>
                        <button type="button" className="link-button" disabled={busy === account.id || !account.sessions} onClick={() => setPending({ account, action: "revoke" })}>Sign out everywhere</button>
                        {account.suspendedAt
                          ? <button type="button" className="link-button" disabled={busy === account.id} onClick={() => act(account, "unsuspend")}>Reinstate</button>
                          : <button type="button" className="link-button" disabled={busy === account.id} onClick={() => setPending({ account, action: "suspend" })}>Suspend</button>}
                        <button type="button" className="link-button danger" disabled={busy === account.id} onClick={() => { setConfirmText(""); setPending({ account, action: "delete" }); }}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pending && (
        <div className="modal-backdrop" onClick={() => setPending(null)}>
          <section className="modal confirm-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <button type="button" className="modal-x" onClick={() => setPending(null)} aria-label="Close">×</button>
            <p className="eyebrow">Accounts</p>
            {pending.action === "delete" ? (
              <>
                <h2>Delete {pending.account.email}?</h2>
                <p>This removes the account and every checklist, booking, photo, PDF, and itinerary it holds. It can&apos;t be undone. Type the email to confirm.</p>
                <label>Email<input value={confirmText} onChange={event => setConfirmText(event.target.value)} placeholder={pending.account.email} autoFocus /></label>
                <div className="button-row"><button type="button" className="btn" onClick={() => setPending(null)}>Keep it</button><button type="button" className="btn danger" disabled={confirmText.trim().toLowerCase() !== pending.account.email || busy === pending.account.id} onClick={() => act(pending.account, "delete")}>Delete permanently</button></div>
              </>
            ) : pending.action === "suspend" ? (
              <>
                <h2>Suspend {pending.account.email}?</h2>
                <p>They are signed out everywhere right away and can&apos;t sign back in until you reinstate them. Their data stays.</p>
                <div className="button-row"><button type="button" className="btn" onClick={() => setPending(null)}>Keep it</button><button type="button" className="btn danger" disabled={busy === pending.account.id} onClick={() => act(pending.account, "suspend")}>Suspend</button></div>
              </>
            ) : (
              <>
                <h2>Sign {pending.account.email} out everywhere?</h2>
                <p>Every device they are signed in on goes back to the login screen. They can sign in again with their password.</p>
                <div className="button-row"><button type="button" className="btn" onClick={() => setPending(null)}>Keep it</button><button type="button" className="btn primary" disabled={busy === pending.account.id} onClick={() => act(pending.account, "revoke")}>Sign them out</button></div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const noAccounts: Account[] = [];
function accountCell(row: Account, key: string): Cell {
  switch (key) {
    case "email": return row.name ? `${row.name} ${row.email}` : row.email;
    case "status": return row.suspendedAt ? "suspended" : "active";
    case "createdAt": case "lastSignin": case "lastSeen": return dateCell(row[key]);
    default: return (row as unknown as Record<string, Cell>)[key];
  }
}

/* ---------- Activity ---------- */

type LogRow = { id: string; at: string; event: string; method: string | null; route: string | null; status: number | null; ms: number | null; email: string | null; target: string | null; ip: string | null; user_agent: string | null; detail: string | null };

function ActivityTab(shared: Shared) {
  const [event, setEvent] = useState("");
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [limit, setLimit] = useState(200);
  const path = `/api/admin/log?minutes=${shared.minutes}&limit=${limit}${event ? `&event=${encodeURIComponent(event)}` : ""}${applied ? `&q=${encodeURIComponent(applied)}` : ""}`;
  const { data, error, loading } = useAdmin<{ rows: LogRow[]; events: string[] }>(path, shared);
  const log = useSort(data?.rows ?? noRows, { key: "at", dir: -1 }, logCell);
  function search(formEvent: FormEvent<HTMLFormElement>) { formEvent.preventDefault(); setApplied(q.trim()); }
  return (
    <div className={loading ? "stack reloading" : "stack"}>
      <form className="filter-row" onSubmit={search}>
        <label>Event<select value={event} onChange={e => setEvent(e.target.value)}><option value="">All events</option>{(data?.events || (event ? [event] : [])).map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>Search<input value={q} onChange={e => setQ(e.target.value)} placeholder="email, IP, route, detail" /></label>
        <label>Rows<select value={limit} onChange={e => setLimit(Number(e.target.value))}>{[100, 200, 500, 1000].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <button className="btn">Apply</button>
      </form>
      {error && <p className="error">{error}</p>}
      {!data ? <p className="muted">Loading...</p> : !data.rows.length ? <p className="check-empty">Nothing recorded for these filters.</p> : (
        <div className="org-panel table-scroll">
          <table className="fact-table data-table log">
            <thead><tr><Th label="Time" sortKey="at" numeric sort={log.sort} onSort={log.toggle} /><Th label="Event" sortKey="event" sort={log.sort} onSort={log.toggle} /><Th label="Account" sortKey="email" sort={log.sort} onSort={log.toggle} /><Th label="Status" sortKey="status" numeric sort={log.sort} onSort={log.toggle} /><Th label="ms" sortKey="ms" numeric sort={log.sort} onSort={log.toggle} /><Th label="IP" sortKey="ip" sort={log.sort} onSort={log.toggle} /><Th label="Detail" sortKey="detail" sort={log.sort} onSort={log.toggle} /></tr></thead>
            <tbody>
              {log.sorted.map(row => (
                <tr key={row.id} className={row.status && row.status >= 500 ? "bad" : row.status && row.status >= 400 ? "warn" : ""} title={row.user_agent || undefined}>
                  <td className="when">{fmtWhen(row.at, true)}</td>
                  <td><code>{row.event}</code><span className="muted">{row.method} {row.route}</span></td>
                  <td>{row.email || <span className="muted">anonymous</span>}</td>
                  <td className="num">{row.status ?? ""}</td>
                  <td className="num">{row.ms ?? ""}</td>
                  <td><code>{row.ip}</code></td>
                  <td className="detail">{[row.target, row.detail].filter(Boolean).join(" · ")}<span className="muted">{shortAgent(row.user_agent)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length >= limit && <p className="muted">Showing the newest {limit}. Raise the row limit or narrow the window to see more.</p>}
        </div>
      )}
    </div>
  );
}

const noRows: LogRow[] = [];
function logCell(row: LogRow, key: string): Cell {
  if (key === "at") return dateCell(row.at);
  if (key === "detail") return [row.target, row.detail].filter(Boolean).join(" · ");
  return (row as unknown as Record<string, Cell>)[key];
}

/* ---------- helpers ---------- */

export function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[index]}`;
}

function fmtWhen(iso: string, seconds = false) {
  const date = new Date(iso);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) });
}

// "Chrome 130 · macOS" style summary of a user agent; the full string is in the row's title.
function shortAgent(agent: string | null) {
  if (!agent) return "";
  const browser = /(Edg|OPR|Chrome|Firefox|Safari|curl)\/([\d.]+)/.exec(agent);
  const os = /(iPhone|iPad|Android|Windows|Mac OS X|Linux|CrOS)/.exec(agent);
  const name = browser ? ({ Edg: "Edge", OPR: "Opera" } as Record<string, string>)[browser[1]] || browser[1] : "";
  return [name && `${name} ${browser![2].split(".")[0]}`, os?.[1].replace("Mac OS X", "macOS")].filter(Boolean).join(" · ");
}
