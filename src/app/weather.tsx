"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export type Weather = {
  location: string;
  current: { tempF: number; text: string; icon: string; isDay: boolean };
  days: { date: string; hi: number; lo: number; text: string; icon: string; rain: number }[];
};
type WeatherState = { status: "idle" | "loading" | "ready" | "error" | "off"; data?: Weather };

// Loads the forecast for a place and refreshes it every 30 minutes (matching the server cache).
export function useWeather(query: string | null): WeatherState {
  const [state, setState] = useState<WeatherState>({ status: "idle" });
  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    async function load() {
      setState(current => (current.data ? current : { status: "loading" }));
      try {
        const data = await api(`/api/weather?q=${encodeURIComponent(query as string)}`);
        if (cancelled) return;
        setState(data?.configured === false ? { status: "off" } : { status: "ready", data });
      } catch {
        if (!cancelled) setState(current => (current.data ? current : { status: "error" }));
      }
    }
    load();
    const timer = setInterval(load, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [query]);
  return state;
}

function dayLabel(date: string, index: number) {
  if (index === 0) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
}

export function WeatherPanel({ weather, collapsed }: { weather: WeatherState; collapsed: boolean }) {
  if (weather.status === "off" || weather.status === "idle") return null;
  const data = weather.data;
  if (!data) {
    if (collapsed) return null;
    return <section className="weather" aria-label="Weather"><p className="muted weather-note">{weather.status === "loading" ? "Checking the weather..." : "Weather unavailable right now."}</p></section>;
  }
  const title = `${data.location}: ${data.current.tempF}°F, ${data.current.text}`;
  return (
    <section className={collapsed ? "weather collapsed" : "weather"} aria-label="Weather" title={collapsed ? title : undefined}>
      <div className="weather-now">
        <img src={data.current.icon} alt="" width={48} height={48} />
        <div>
          <strong>{data.current.tempF}°</strong>
          {!collapsed && <span>{data.current.text}</span>}
        </div>
      </div>
      {!collapsed && <span className="weather-place">{data.location}</span>}
      {!collapsed && data.days.length > 0 && (
        <ol className="weather-days">
          {data.days.map((day, index) => (
            <li key={day.date} title={day.text}>
              <span className="weather-day">{dayLabel(day.date, index)}</span>
              <img src={day.icon} alt={day.text} width={28} height={28} />
              <span className="weather-hi">{day.hi}°</span>
              <span className="weather-lo">{day.lo}°</span>
              <span className="weather-rain">{day.rain >= 20 ? `${day.rain}%` : ""}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
