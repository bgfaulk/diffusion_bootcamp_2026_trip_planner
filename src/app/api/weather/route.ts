import { requireUser } from "@/lib/auth";
import { withQuiet } from "@/lib/audit";
import { getSql } from "@/lib/db";
import { errorResponse, fail } from "@/lib/validation";

// Proxies weatherapi.com so the key stays on the server. A forecast is fetched at most once per location
// per 30 minutes for everyone: the shared copy lives in the weather_cache table (serverless instances don't
// share memory and don't live long), with a small in-memory layer in front of it for repeat hits on the same
// instance. Locations are normalized so nearby people share an entry: place names are lower-cased and
// coordinates rounded to two decimals (about a kilometer).
const memory = new Map<string, { at: number; data: unknown }>();
const TTL = 30 * 60 * 1000;
const MAX_ENTRIES = 200;

function cacheKey(q: string) {
  const coords = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coords) return `${Number(coords[1]).toFixed(2)},${Number(coords[2]).toFixed(2)}`;
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}
// Where an answer came from goes into the audit row for the organizer, not into a response header: a header
// would let any attendee probe whether someone else had just looked up a given place.
function respond(data: unknown, source: "memory" | "shared" | "upstream", ctx: { detail?: string }) {
  ctx.detail = source;
  return Response.json(data, { headers: { "Cache-Control": "private, max-age=300" } });
}
// The free tier returns three forecast days; asking for more only makes the response bigger.
const DAYS = 3;

function secure(url: string) { return url.startsWith("//") ? `https:${url}` : url; }
function remember(key: string, data: unknown) {
  if (memory.size >= MAX_ENTRIES) {
    for (const [k, entry] of memory) if (Date.now() - entry.at >= TTL) memory.delete(k);
    if (memory.size >= MAX_ENTRIES) memory.delete(memory.keys().next().value as string);
  }
  memory.set(key, { at: Date.now(), data });
}

export const GET = withQuiet("weather", async (request, ctx) => {
  try {
    ctx.user = await requireUser();
    const key = process.env.WEATHER_API_KEY?.trim();
    if (!key) return Response.json({ configured: false });
    const q = (new URL(request.url).searchParams.get("q") || "San Francisco, CA").trim().slice(0, 120);
    const key_ = cacheKey(q);
    ctx.target = key_;
    const hit = memory.get(key_);
    if (hit && Date.now() - hit.at < TTL) return respond(hit.data, "memory", ctx);
    const sql = getSql();
    const shared = await sql`SELECT data, fetched_at FROM weather_cache WHERE key = ${key_}`;
    if (shared[0] && Date.now() - new Date(shared[0].fetched_at).getTime() < TTL) {
      const data = JSON.parse(String(shared[0].data));
      remember(key_, data);
      return respond(data, "shared", ctx);
    }
    const upstream = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&days=${DAYS}&aqi=no&alerts=no`, { cache: "no-store" });
    if (!upstream.ok) fail("Weather is unavailable right now", 502);
    const raw = await upstream.json();
    const data = {
      configured: true,
      location: [raw.location?.name, raw.location?.region].filter(Boolean).join(", "),
      current: {
        tempF: Math.round(raw.current?.temp_f ?? 0),
        text: String(raw.current?.condition?.text || ""),
        icon: secure(String(raw.current?.condition?.icon || "")),
        isDay: raw.current?.is_day === 1
      },
      days: (raw.forecast?.forecastday || []).map((day: any) => ({
        date: String(day.date),
        hi: Math.round(day.day?.maxtemp_f ?? 0),
        lo: Math.round(day.day?.mintemp_f ?? 0),
        text: String(day.day?.condition?.text || ""),
        icon: secure(String(day.day?.condition?.icon || "")),
        rain: Number(day.day?.daily_chance_of_rain ?? 0)
      }))
    };
    await sql`
      INSERT INTO weather_cache (key, data, fetched_at) VALUES (${key_}, ${JSON.stringify(data)}, now())
      ON CONFLICT (key) DO UPDATE SET data = excluded.data, fetched_at = now()
    `;
    remember(key_, data);
    return respond(data, "upstream", ctx);
  } catch (error) {
    return errorResponse(error, "Could not load the weather");
  }
});
