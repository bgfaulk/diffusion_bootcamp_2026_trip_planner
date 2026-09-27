import { requireUser } from "@/lib/auth";
import { errorResponse, fail } from "@/lib/validation";

// Proxies weatherapi.com so the key stays on the server. Responses are cached per location for 30 minutes
// to stay well inside the plan's request quota; the client refreshes on the same cadence.
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 30 * 60 * 1000;

function secure(url: string) { return url.startsWith("//") ? `https:${url}` : url; }

export async function GET(request: Request) {
  try {
    await requireUser();
    const key = process.env.WEATHER_API_KEY?.trim();
    if (!key) return Response.json({ configured: false });
    const q = (new URL(request.url).searchParams.get("q") || "San Francisco, CA").trim().slice(0, 120);
    const hit = cache.get(q);
    if (hit && Date.now() - hit.at < TTL) return Response.json(hit.data);
    const upstream = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&days=7&aqi=no&alerts=no`, { cache: "no-store" });
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
    cache.set(q, { at: Date.now(), data });
    return Response.json(data);
  } catch (error) {
    return errorResponse(error, "Could not load the weather");
  }
}
