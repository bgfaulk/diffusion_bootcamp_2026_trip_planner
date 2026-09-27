// Trailing time windows for the Organizer page, modeled on the Settings > Operations picker in revari-crm
// (Grafana-style quick ranges, a custom value + unit, step wider/narrower, zoom out). Pure functions so the
// picker and the API agree on what "Last 24 hours" means.

export type WindowUnit = "minutes" | "hours" | "days" | "months";
export const WINDOW_UNITS: readonly WindowUnit[] = ["minutes", "hours", "days", "months"];

const MINUTES_PER: Record<WindowUnit, number> = { minutes: 1, hours: 60, days: 1440, months: 43200 };

/** ~12 months (366 days). */
export const MAX_WINDOW_MINUTES = 527040;
export const DEFAULT_WINDOW_MINUTES = 60;

export const QUICK_RANGES: readonly { minutes: number; label: string }[] = [
  { minutes: 5, label: "Last 5 minutes" },
  { minutes: 15, label: "Last 15 minutes" },
  { minutes: 30, label: "Last 30 minutes" },
  { minutes: 60, label: "Last 1 hour" },
  { minutes: 180, label: "Last 3 hours" },
  { minutes: 360, label: "Last 6 hours" },
  { minutes: 720, label: "Last 12 hours" },
  { minutes: 1440, label: "Last 24 hours" },
  { minutes: 2880, label: "Last 2 days" },
  { minutes: 10080, label: "Last 7 days" },
  { minutes: 43200, label: "Last 30 days" },
  { minutes: 129600, label: "Last 90 days" },
  { minutes: 259200, label: "Last 6 months" },
  { minutes: MAX_WINDOW_MINUTES, label: "Last 12 months" }
];

/** Auto-refresh cadences in seconds; null is off. */
export const REFRESH_INTERVALS: readonly { seconds: number | null; label: string }[] = [
  { seconds: null, label: "Off" },
  { seconds: 15, label: "15s" },
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 300, label: "5m" },
  { seconds: 600, label: "10m" }
];

export function clampWindow(minutes: number, max = MAX_WINDOW_MINUTES) {
  if (!Number.isFinite(minutes)) return DEFAULT_WINDOW_MINUTES;
  return Math.min(Math.max(Math.round(minutes), 1), max);
}

export function windowMinutes(value: number, unit: WindowUnit) {
  return clampWindow(value * MINUTES_PER[unit]);
}

/** Largest exact value + unit pair, for seeding the custom controls (43200 -> 1 months, 90 -> 90 minutes). */
export function windowParts(minutes: number): { value: number; unit: WindowUnit } {
  for (const unit of ["months", "days", "hours"] as const) {
    if (minutes % MINUTES_PER[unit] === 0) return { value: minutes / MINUTES_PER[unit], unit };
  }
  return { value: minutes, unit: "minutes" };
}

/** Short label: 15m, 1h, 36h, 7d, 2mo, else one decimal of the largest unit. */
export function formatWindow(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 43200 === 0) return `${minutes / 43200}mo`;
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes >= 1440) return `${trim1(minutes / 1440)}d`;
  return `${trim1(minutes / 60)}h`;
}

/** The quick-range label when it matches exactly, else "Last <n> <unit>". */
export function formatWindowLong(minutes: number) {
  const quick = QUICK_RANGES.find(range => range.minutes === minutes);
  if (quick) return quick.label;
  if (minutes < 60) return `Last ${plural(minutes, "minute")}`;
  if (minutes % 43200 === 0) return `Last ${plural(minutes / 43200, "month")}`;
  if (minutes % 1440 === 0) return `Last ${plural(minutes / 1440, "day")}`;
  if (minutes % 60 === 0) return `Last ${plural(minutes / 60, "hour")}`;
  if (minutes >= 1440) return `Last ${plural(Math.round((minutes / 1440) * 10) / 10, "day")}`;
  return `Last ${plural(Math.round((minutes / 60) * 10) / 10, "hour")}`;
}

/** Neighboring quick range: +1 widens, -1 narrows; the ends clamp. */
export function stepWindow(minutes: number, dir: 1 | -1) {
  if (dir === 1) return QUICK_RANGES.find(range => range.minutes > minutes)?.minutes ?? MAX_WINDOW_MINUTES;
  for (let i = QUICK_RANGES.length - 1; i >= 0; i--) if (QUICK_RANGES[i].minutes < minutes) return QUICK_RANGES[i].minutes;
  return QUICK_RANGES[0].minutes;
}

export function zoomOutWindow(minutes: number) {
  return Math.min(minutes * 2, MAX_WINDOW_MINUTES);
}

/** Bucket width (minutes) that gives a chart roughly 48 to 90 points across the window. */
export function bucketMinutes(minutes: number) {
  const steps = [1, 5, 10, 15, 30, 60, 180, 360, 720, 1440, 10080];
  return steps.find(step => minutes / step <= 90) ?? 10080;
}

function plural(value: number, unit: string) { return `${value} ${unit}${value === 1 ? "" : "s"}`; }
function trim1(value: number) { return (Math.round(value * 10) / 10).toString(); }
