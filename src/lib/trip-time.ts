// Date/time helpers for the Overview page. Booking times arrive as free text ("Oct 12, 7:05 AM (ORD)",
// "2026-09-28 9:00 AM CDT - LIT", "Oct 12, check-in 4:00 PM"), so everything here is tolerant and
// returns null rather than guessing when a value can't be read.

import { trainingAgenda } from "./plan";

export type When = {
  at: Date;            // best-effort instant (honors a zone abbreviation when present)
  y: number; m: number; d: number;
  minutes: number | null; // wall-clock minutes since midnight, as written
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ZONES: Record<string, number> = { PST: -8, PDT: -7, MST: -7, MDT: -6, CST: -6, CDT: -5, EST: -5, EDT: -4, AKST: -9, AKDT: -8, HST: -10, UTC: 0, GMT: 0 };
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";

export function parseWhen(input: string | null | undefined, yearHint?: number): When | null {
  if (!input) return null;
  const text = String(input);
  let y: number | undefined, m = 0, d = 0;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const monthFirst = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`, "i").exec(text);
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?:,?\\s*(\\d{4}))?`, "i").exec(text);
  const numeric = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (monthFirst) { m = MONTHS.indexOf(monthFirst[1].slice(0, 3).toLowerCase()) + 1; d = +monthFirst[2]; y = monthFirst[3] ? +monthFirst[3] : undefined; }
  else if (dayFirst) { d = +dayFirst[1]; m = MONTHS.indexOf(dayFirst[2].slice(0, 3).toLowerCase()) + 1; y = dayFirst[3] ? +dayFirst[3] : undefined; }
  else if (numeric) { m = +numeric[1]; d = +numeric[2]; y = numeric[3] ? (+numeric[3] < 100 ? 2000 + +numeric[3] : +numeric[3]) : undefined; }
  if (!m || !d || m > 12 || d > 31) return null;
  if (!y) {
    const year = /\b(20\d{2})\b/.exec(text);
    y = year ? +year[1] : yearHint ?? new Date().getFullYear();
  }
  const minutes = timeMinutes(text);
  const zone = /\b(PST|PDT|MST|MDT|CST|CDT|EST|EDT|AKST|AKDT|HST|UTC|GMT)\b/i.exec(text);
  const h = minutes === null ? 0 : Math.floor(minutes / 60), min = minutes === null ? 0 : minutes % 60;
  const at = zone && minutes !== null
    ? new Date(Date.UTC(y, m - 1, d, h - ZONES[zone[1].toUpperCase()], min))
    : new Date(y, m - 1, d, h, min);
  return { at, y, m, d, minutes };
}

// "7:05 AM" / "4 pm" / "18:30" -> minutes since midnight. Skips ISO dates so "2026-09-28" isn't read as a time.
export function timeMinutes(text: string): number | null {
  const ampm = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/i.exec(text);
  if (ampm) {
    const h = +ampm[1] % 12 + (ampm[3].toLowerCase() === "p" ? 12 : 0);
    return h * 60 + (ampm[2] ? +ampm[2] : 0);
  }
  const clock = /(?:^|[^\d-])(\d{1,2}):(\d{2})\b/.exec(text);
  return clock && +clock[1] < 24 && +clock[2] < 60 ? +clock[1] * 60 + +clock[2] : null;
}

export function dayKey(w: { y: number; m: number; d: number }) { return w.y * 10000 + w.m * 100 + w.d; }
export function keyOf(date: Date) { return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate(); }
export function keyToDate(key: number) { return new Date(Math.floor(key / 10000), Math.floor((key % 10000) / 100) - 1, key % 100); }
export function addDays(key: number, days: number) { const date = keyToDate(key); date.setDate(date.getDate() + days); return keyOf(date); }
export function daysBetween(fromKey: number, toKey: number) { return Math.round((keyToDate(toKey).getTime() - keyToDate(fromKey).getTime()) / 86400000); }

export function fmtDay(key: number, withYear = false) {
  return keyToDate(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}
export function fmtShort(key: number) { return keyToDate(key).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
export function fmtMinutes(minutes: number | null) {
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60), min = minutes % 60;
  return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// "in 2 days", "in 5 h 20 min", "in 12 min"; null once the moment has passed.
export function countdown(from: Date, to: Date): string | null {
  const ms = to.getTime() - from.getTime();
  if (ms < 0) return null;
  const days = Math.floor(ms / 86400000), hours = Math.floor((ms % 86400000) / 3600000), mins = Math.floor((ms % 3600000) / 60000);
  if (days >= 2) return `in ${days} days`;
  if (days === 1) return `in 1 day ${hours} h`;
  if (hours >= 1) return `in ${hours} h ${mins} min`;
  return mins > 0 ? `in ${mins} min` : "now";
}

/* ---------- itinerary text (saved by the wizard as "Day 1 - Mon, Oct 12" + "- time | place | why | address") ---------- */

export type Stop = { time: string; place: string; why: string; address: string; minutes: number | null };
export type PlanDay = { label: string; index: number; key: number | null; stops: Stop[] };
export type ParsedPlan = { intro: string[]; days: PlanDay[]; notes: string[] };

export function parseItinerary(text: string | null | undefined, startKey: number | null): ParsedPlan {
  const plan: ParsedPlan = { intro: [], days: [], notes: [] };
  if (!text) return plan;
  const lines = text.split(/\r?\n/);
  let day: PlanDay | null = null, inNotes = false;
  const yearHint = startKey ? Math.floor(startKey / 10000) : undefined;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (/^practical notes:?$/i.test(line) || /^notes:?$/i.test(line)) { inNotes = true; day = null; return; }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      if (inNotes || !day) { if (inNotes) plan.notes.push(bullet[1]); else plan.intro.push(bullet[1]); return; }
      const parts = bullet[1].split("|").map(part => part.trim());
      const hasTime = timeMinutes(parts[0]) !== null && parts.length > 1;
      const [time, place, why, address] = hasTime ? parts : ["", ...parts];
      day.stops.push({ time: time || "", place: place || "", why: why || "", address: address || "", minutes: hasTime ? timeMinutes(time) : null });
      return;
    }
    const nextIsBullet = /^[-*•]\s+/.test((lines[i + 1] || "").trim());
    const dayMatch = /^day\s*(\d+)/i.exec(line);
    if (dayMatch || (nextIsBullet && !inNotes && line.length < 80)) {
      const index = dayMatch ? +dayMatch[1] : plan.days.length + 1;
      const when = parseWhen(line.replace(/^day\s*\d+/i, ""), yearHint);
      let key = when ? dayKey(when) : startKey ? addDays(startKey, index - 1) : null;
      // A label without a year that lands months before the trip means the trip crosses New Year.
      if (when && startKey && key !== null && daysBetween(startKey, key) < -180) key = addDays(key, 365);
      day = { label: line, index, key, stops: [] };
      plan.days.push(day);
      inNotes = false;
      return;
    }
    if (!day) plan.intro.push(line);
  });
  return plan;
}

/** Longest saved plan the itinerary API accepts (it slices longer text, so the client checks first). */
export const MAX_ITINERARY_CHARS = 12000;

/** The inverse of parseItinerary: the same "Day N - ..." headers and "- time | place | why | address" bullets, so a stop
 *  edited in the app round-trips through the parser. Intro lines and practical notes come back as plain lines and bullets. */
export function serializeItinerary(plan: ParsedPlan): string {
  const clean = (value: string) => value.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  const out: string[] = plan.intro.map(clean).filter(Boolean);
  for (const day of plan.days) {
    if (out.length) out.push("");
    out.push(clean(day.label) || `Day ${day.index}`);
    for (const stop of day.stops) {
      const parts = [stop.place, stop.why, stop.address].map(clean);
      while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
      out.push(`- ${stop.time && timeMinutes(stop.time) !== null ? `${clean(stop.time)} | ` : ""}${parts.join(" | ")}`);
    }
  }
  if (plan.notes.length) { out.push("", "Practical notes:"); for (const note of plan.notes) out.push(`- ${clean(note)}`); }
  return out.join("\n");
}

/** A copy of the plan with one stop replaced, moved to another day, added (stopIndex null), or removed (stop null).
 *  A timed stop lands before the first later-timed stop of its day; an untimed one goes to the end. */
export function withStop(plan: ParsedPlan, from: { day: number; stop: number | null }, to: number, stop: Stop | null): ParsedPlan {
  const days = plan.days.map(day => ({ ...day, stops: [...day.stops] }));
  if (from.stop !== null) days[from.day]?.stops.splice(from.stop, 1);
  if (stop) {
    const target = days[to] ?? days[from.day];
    const next = { ...stop, minutes: stop.time ? timeMinutes(stop.time) : null };
    let at = target.stops.length;
    if (next.minutes !== null) { const later = target.stops.findIndex(other => other.minutes !== null && other.minutes > next.minutes!); if (later >= 0) at = later; }
    target.stops.splice(at, 0, next);
  }
  return { ...plan, days };
}

/* ---------- airports, for "miles flown" ---------- */

const AIRPORTS: Record<string, [number, number]> = {
  ATL: [33.64, -84.43], LAX: [33.94, -118.41], ORD: [41.98, -87.9], DFW: [32.9, -97.04], DEN: [39.86, -104.67], JFK: [40.64, -73.78],
  SFO: [37.62, -122.38], SEA: [47.45, -122.31], LAS: [36.08, -115.15], MCO: [28.43, -81.31], EWR: [40.69, -74.17], CLT: [35.21, -80.94],
  PHX: [33.43, -112.01], IAH: [29.98, -95.34], MIA: [25.79, -80.29], BOS: [42.36, -71.01], MSP: [44.88, -93.22], FLL: [26.07, -80.15],
  DTW: [42.21, -83.35], PHL: [39.87, -75.24], LGA: [40.78, -73.87], BWI: [39.18, -76.67], SLC: [40.79, -111.98], SAN: [32.73, -117.19],
  IAD: [38.95, -77.46], DCA: [38.85, -77.04], MDW: [41.79, -87.75], TPA: [27.98, -82.53], BNA: [36.12, -86.68], AUS: [30.19, -97.67],
  HNL: [21.32, -157.92], PDX: [45.59, -122.6], DAL: [32.85, -96.85], STL: [38.75, -90.37], HOU: [29.65, -95.28], RDU: [35.88, -78.79],
  SMF: [38.7, -121.59], MSY: [29.99, -90.26], SJC: [37.36, -121.93], OAK: [37.72, -122.22], MCI: [39.3, -94.71], SNA: [33.68, -117.87],
  SAT: [29.53, -98.47], RSW: [26.54, -81.76], CLE: [41.41, -81.85], IND: [39.72, -86.29], PIT: [40.49, -80.23], CMH: [40.0, -82.89],
  CVG: [39.05, -84.67], LIT: [34.73, -92.22], OKC: [35.39, -97.6], TUL: [36.2, -95.89], MKE: [42.95, -87.9], ABQ: [35.04, -106.61],
  BUF: [42.94, -78.73], OMA: [41.3, -95.89], BDL: [41.94, -72.68], JAX: [30.49, -81.69], ONT: [34.06, -117.6], BUR: [34.2, -118.36],
  ELP: [31.81, -106.38], RIC: [37.51, -77.32], SDF: [38.17, -85.74], MEM: [35.04, -89.98], BHM: [33.56, -86.75], TUS: [32.12, -110.94],
  BOI: [43.56, -116.22], ANC: [61.17, -149.99], XNA: [36.28, -94.31], DSM: [41.53, -93.66], GEG: [47.62, -117.53], PBI: [26.68, -80.1],
  ORF: [36.89, -76.2], CHS: [32.9, -80.04], SAV: [32.13, -81.2], GRR: [42.88, -85.52], RNO: [39.5, -119.77], LGB: [33.82, -118.15],
  PVD: [41.73, -71.43], ALB: [42.75, -73.8], SYR: [43.11, -76.11], ROC: [43.12, -77.67], MHT: [42.93, -71.44], SJU: [18.44, -66.0],
  MSN: [43.14, -89.34], DAY: [39.9, -84.22], GSP: [34.9, -82.22], PNS: [30.47, -87.19], ICT: [37.65, -97.43], LBB: [33.66, -101.82],
  FAT: [36.78, -119.72], SBA: [34.43, -119.84], PSP: [33.83, -116.51], COS: [38.81, -104.7], TYS: [35.81, -83.99], SRQ: [27.4, -82.55],
  GSO: [36.1, -79.94], HSV: [34.64, -86.78], JAN: [32.31, -90.08], BTR: [30.53, -91.15], SHV: [32.45, -93.83], LNK: [40.85, -96.76],
  FSD: [43.58, -96.74], FAR: [46.92, -96.82], BIL: [45.81, -108.54], MSO: [46.92, -114.09], EUG: [44.12, -123.22]
};

/** Every airport the miles table knows, for the booking form's suggestions. */
export const AIRPORT_CODES = Object.keys(AIRPORTS).sort();

export function airportCodes(text: string): string[] {
  const codes: string[] = [];
  for (const match of text.matchAll(/\b([A-Z]{3})\b/g)) if (AIRPORTS[match[1]] && !codes.includes(match[1])) codes.push(match[1]);
  return codes;
}

export function milesBetween(a: string, b: string): number | null {
  const from = AIRPORTS[a], to = AIRPORTS[b];
  if (!from || !to) return null;
  const rad = (deg: number) => deg * Math.PI / 180;
  const dLat = rad(to[0] - from[0]), dLng = rad(to[1] - from[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from[0])) * Math.cos(rad(to[0])) * Math.sin(dLng / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/* ---------- the overview model ---------- */

export type Booking = {
  id: string;
  category: "flight" | "hotel" | "rental" | "training" | "insurance" | "other";
  title: string;
  provider?: string;
  confirmation_number?: string;
  start_at?: string;
  end_at?: string;
  address?: string;
  phone?: string;
  notes?: string;
  from_airport?: string; // flights: three-letter codes, entered on the booking form
  to_airport?: string;
};
export type TimedBooking = Booking & { start: When | null; end: When | null };
export type DayEvent = { minutes: number | null; time: string; title: string; detail: string; kind: "booking" | "stop" | "training"; bookingId?: string };
export type Phase = "before" | "during" | "after" | "unknown";

export type TripModel = {
  todayKey: number;
  startKey: number | null;
  endKey: number | null;
  phase: Phase;
  dayNumber: number | null;
  totalDays: number | null;
  focusKey: number | null;
  focusDay: PlanDay | null;
  events: DayEvent[];
  nextUp: { title: string; detail: string; when: string; relative: string } | null;
  stats: { label: string; value: string; note?: string }[];
  route: string;
  miles: number;
  trainingKeys: number[];
  bookings: TimedBooking[];
  outbound?: TimedBooking;
  homebound?: TimedBooking;
  hotel?: TimedBooking;
  training?: TimedBooking;
  plan: ParsedPlan;
};

const startLabels: Record<Booking["category"], string> = { flight: "Depart", hotel: "Check in", rental: "Pick up rental car", training: "Training begins", insurance: "Coverage starts", other: "Starts" };
const endLabels: Record<Booking["category"], string> = { flight: "Arrive", hotel: "Check out", rental: "Return rental car", training: "Training wraps up", insurance: "Coverage ends", other: "Ends" };

/** Every day a Training booking spans (the bootcamp agenda applies to each). */
export function trainingDays(training: TimedBooking | undefined): number[] {
  const keys: number[] = [];
  if (!training?.start) return keys;
  const first = dayKey(training.start), last = training.end ? Math.max(dayKey(training.end), first) : first;
  for (let key = first, guard = 0; key <= last && guard < 14; key = addDays(key, 1), guard++) keys.push(key);
  return keys;
}

/** What the bookings put on one day: the bootcamp agenda on training days, then each booking's start and end that
 *  fall on that day. Built from Trip Information every time, so a booking that is added, changed or removed shows
 *  up, moves or disappears on its own. Shared by the Overview's day view and the Explore itinerary. */
export function bookingEvents(bookings: TimedBooking[], key: number, trainingKeys: number[], training?: TimedBooking): DayEvent[] {
  const events: DayEvent[] = [];
  if (trainingKeys.includes(key)) {
    trainingAgenda.slots.forEach((slot, index) => events.push({ minutes: slot.minutes, time: fmtMinutes(slot.minutes), title: training ? `${slot.title} · ${training.title}` : slot.title, detail: slot.detail || (index === 1 ? training?.address || "" : ""), kind: "training", bookingId: training?.id }));
  }
  for (const b of bookings) {
    if (b.category === "training" && trainingKeys.length) continue; // the agenda covers it
    const who = b.provider && b.provider !== b.title ? `${b.title} · ${b.provider}` : b.title;
    if (b.start && dayKey(b.start) === key) events.push({ minutes: b.start.minutes, time: fmtMinutes(b.start.minutes), title: `${startLabels[b.category]} · ${who}`, detail: [b.address, b.confirmation_number && `Conf. ${b.confirmation_number}`].filter(Boolean).join(" · "), kind: "booking", bookingId: b.id });
    if (b.end && dayKey(b.end) === key && b.end_at !== b.start_at) events.push({ minutes: b.end.minutes, time: fmtMinutes(b.end.minutes), title: `${endLabels[b.category]} · ${who}`, detail: b.category === "flight" ? (b.end_at || "") : (b.address || ""), kind: "booking", bookingId: b.id });
  }
  return events;
}

// Words that mark a stop as really being a booking moment, by booking kind.
const bookingWords: Record<Booking["category"], RegExp> = {
  flight: /\b(flight|depart|departure|departs|arriv(e|es|al|ing)|land(s|ing|ed)?|board(s|ing)?|airport|take ?off|fly|flying)\b/i,
  hotel: /\b(check[- ]?in|check[- ]?out|hotel|lodging)\b/i,
  rental: /\b(rental|rent(al)? car|pick ?up|return|drop ?off|car return)\b/i,
  training: /\b(bootcamp|boot camp|training|workshop|class|session|diffusion)\b/i,
  insurance: /\binsurance\b/i,
  other: /(?!)/
};
const genericProviders = /^(united|american|delta|airline|airlines|hotel|hertz|avis|budget|enterprise|national|alamo|the|and|inc|llc)$/i;
const near = (a: number | null, b: number | null, minutes = 120) => a !== null && b !== null && Math.abs(a - b) <= minutes;

/** Whether a plan stop is only restating a booking (the flight, hotel check-in, rental pickup, or the bootcamp itself):
 *  a stop on the booking's day that names its confirmation number or provider, a flight stop that names one of its
 *  airports or sits within two hours of departure or arrival, a hotel or rental stop within two hours of its times, or a
 *  training-day stop during the agenda's hours. Such stops are dropped from the plan because Trip Information places
 *  those moments itself, so they follow the booking when it changes. */
export function stopMatchesBooking(stop: Stop, key: number | null, b: TimedBooking, trainingKeys: number[]): boolean {
  if (key === null) return false;
  const text = `${stop.place} ${stop.why} ${stop.address}`.toLowerCase();
  if (b.category === "training") {
    if (!trainingKeys.includes(key) || !bookingWords.training.test(text)) return false;
    const first = trainingAgenda.slots[0].minutes - 60, last = trainingAgenda.slots[trainingAgenda.slots.length - 1].minutes + 60;
    return stop.minutes === null || (stop.minutes >= first && stop.minutes <= last);
  }
  const onDay = (b.start && dayKey(b.start) === key) || (b.end && dayKey(b.end) === key);
  if (!onDay) return false;
  const conf = (b.confirmation_number || "").trim().toLowerCase();
  if (conf.length >= 4 && text.includes(conf)) return true;
  const provider = (b.provider || "").trim().toLowerCase();
  if (provider.length >= 4 && !genericProviders.test(provider) && text.includes(provider) && bookingWords[b.category].test(text)) return true;
  if (!bookingWords[b.category].test(text)) return false;
  if (b.category === "flight") {
    const codes = [b.from_airport, b.to_airport, ...airportCodes(b.start_at || ""), ...airportCodes(b.end_at || "")].filter((c): c is string => Boolean(c)).map(c => c.toUpperCase());
    if (codes.some(code => new RegExp(`\\b${code}\\b`).test(`${stop.place} ${stop.why} ${stop.address}`.toUpperCase()))) return true;
  }
  const startsToday = b.start && dayKey(b.start) === key, endsToday = b.end && dayKey(b.end) === key;
  return (Boolean(startsToday) && near(stop.minutes, b.start!.minutes)) || (Boolean(endsToday) && near(stop.minutes, b.end!.minutes));
}

/** The plan without stops that only restate a booking. `removed` counts what was dropped. */
export function stripBookingStops(plan: ParsedPlan, bookings: TimedBooking[], trainingKeys: number[]): { plan: ParsedPlan; removed: number } {
  let removed = 0;
  const days = plan.days.map(day => {
    const stops = day.stops.filter(stop => !bookings.some(b => stopMatchesBooking(stop, day.key, b, trainingKeys)));
    removed += day.stops.length - stops.length;
    return stops.length === day.stops.length ? day : { ...day, stops };
  });
  return { plan: removed ? { ...plan, days } : plan, removed };
}

/** Timed bookings, soonest first. The year hint fills in dates written without one. */
export function timeBookings(input: Booking[], yearHint: number): TimedBooking[] {
  return input
    .map(b => ({ ...b, start: parseWhen(b.start_at, yearHint), end: parseWhen(b.end_at, yearHint) }))
    .sort((a, b) => (a.start?.at.getTime() ?? Infinity) - (b.start?.at.getTime() ?? Infinity));
}

export function buildTripModel(input: { startDate?: string; endDate?: string; bookings: Booking[]; itinerary?: string | null; now: Date }): TripModel {
  const { now } = input;
  const todayKey = keyOf(now);
  const yearHint = parseWhen(input.startDate)?.y ?? now.getFullYear();
  const bookings = timeBookings(input.bookings, yearHint);
  const flights = bookings.filter(b => b.category === "flight");
  const outbound = flights.find(f => /outbound|depart/i.test(f.title)) || flights[0];
  const homebound = flights.find(f => f !== outbound && /return|home|back/i.test(f.title)) || flights.find(f => f !== outbound);
  const hotel = bookings.find(b => b.category === "hotel");
  const training = bookings.find(b => b.category === "training");

  // Trip dates come from setup; without them, fall back to the flights, then the hotel, then the training days.
  const startWhen = parseWhen(input.startDate) || outbound?.start || hotel?.start || training?.start || null;
  const endWhen = parseWhen(input.endDate) || homebound?.start || hotel?.end || training?.end || training?.start || null;
  const startKey = startWhen ? dayKey(startWhen) : null;
  const endKey = endWhen ? dayKey(endWhen) : null;
  // Training days: every day the Training booking spans gets the bootcamp agenda.
  const trainingKeys = trainingDays(training);
  // Stops that only restate a booking are left out: the bookings themselves supply those moments.
  const plan = stripBookingStops(parseItinerary(input.itinerary, startKey), bookings, trainingKeys).plan;

  const phase: Phase = !startKey ? "unknown" : todayKey < startKey ? "before" : endKey && todayKey > endKey ? "after" : "during";
  const totalDays = startKey && endKey ? daysBetween(startKey, endKey) + 1 : null;
  const focusKey = phase === "before" ? startKey : phase === "during" ? todayKey : null;
  const dayNumber = focusKey && startKey ? daysBetween(startKey, focusKey) + 1 : null;
  const focusDay = focusKey !== null ? plan.days.find(day => day.key === focusKey) || (phase === "before" ? plan.days[0] : null) || null : null;

  const agendaTitle = (slot: { title: string }) => training ? `${slot.title} · ${training.title}` : slot.title;

  // Everything happening on the focus day: booking starts/ends plus itinerary stops, in time order.
  const events: DayEvent[] = [];
  if (focusKey !== null) {
    events.push(...bookingEvents(bookings, focusKey, trainingKeys, training));
    for (const stop of focusDay?.stops || []) events.push({ minutes: stop.minutes, time: stop.time, title: stop.place, detail: [stop.why, stop.address].filter(Boolean).join(" · "), kind: "stop" });
    events.sort((a, b) => (a.minutes ?? 1e9) - (b.minutes ?? 1e9));
  }

  // Next up: the soonest future booking moment or itinerary stop.
  type Candidate = { at: Date; title: string; detail: string; key: number; minutes: number | null };
  const candidates: Candidate[] = [];
  for (const key of trainingKeys) for (const slot of trainingAgenda.slots) {
    const date = keyToDate(key); date.setMinutes(slot.minutes);
    candidates.push({ at: date, title: agendaTitle(slot), detail: training?.address || "", key, minutes: slot.minutes });
  }
  for (const b of bookings) {
    if (b.category === "training" && trainingKeys.length) continue;
    const who = b.provider && b.provider !== b.title ? `${b.title} · ${b.provider}` : b.title;
    if (b.start) candidates.push({ at: b.start.at, title: `${startLabels[b.category]} · ${who}`, detail: b.address || "", key: dayKey(b.start), minutes: b.start.minutes });
    if (b.end && b.category !== "flight") candidates.push({ at: b.end.at, title: `${endLabels[b.category]} · ${who}`, detail: b.address || "", key: dayKey(b.end), minutes: b.end.minutes });
  }
  for (const day of plan.days) if (day.key !== null) for (const stop of day.stops) {
    const date = keyToDate(day.key);
    if (stop.minutes !== null) date.setMinutes(stop.minutes);
    candidates.push({ at: date, title: stop.place, detail: stop.why, key: day.key, minutes: stop.minutes });
  }
  const upcoming = candidates.filter(c => c.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  const nextUp = upcoming ? { title: upcoming.title, detail: upcoming.detail, when: [fmtDay(upcoming.key), fmtMinutes(upcoming.minutes)].filter(Boolean).join(" · "), relative: countdown(now, upcoming.at) || "" } : null;

  // Stats.
  const stats: TripModel["stats"] = [];
  if (phase === "before" && startKey) stats.push({ label: "Days until the trip", value: String(daysBetween(todayKey, startKey)), note: fmtDay(startKey) });
  if (phase === "during" && dayNumber && totalDays) stats.push({ label: "Trip progress", value: `Day ${dayNumber} of ${totalDays}`, note: endKey ? `Home ${fmtDay(endKey)}` : undefined });
  if (outbound?.start) {
    const left = countdown(now, outbound.start.at);
    stats.push({ label: "Flight out", value: left ? left.replace(/^in /, "") : "Departed", note: [fmtDay(dayKey(outbound.start)), fmtMinutes(outbound.start.minutes)].filter(Boolean).join(" · ") });
  }
  if (hotel?.start) {
    const left = countdown(now, hotel.start.at);
    const checkedOut = hotel.end && now.getTime() > hotel.end.at.getTime();
    stats.push({ label: "Hotel check-in", value: left ? left.replace(/^in /, "") : checkedOut ? "Checked out" : "Checked in", note: [fmtDay(dayKey(hotel.start)), fmtMinutes(hotel.start.minutes)].filter(Boolean).join(" · ") });
  }
  let miles = 0; const legs: string[] = [];
  const bayArea = ["SFO", "OAK", "SJC"];
  // The From/To fields win. Older bookings fall back to codes written into the start and end text, then to the
  // title and address, so a layover mentioned in the notes never gets chained into the route.
  const codesOf = (f: TimedBooking) => {
    if (f.from_airport && f.to_airport && f.from_airport !== f.to_airport) return [f.from_airport, f.to_airport];
    if (f.from_airport || f.to_airport) return [f.from_airport || f.to_airport!];
    const from = airportCodes(f.start_at || ""), to = airportCodes(f.end_at || "");
    if (from.length && to.length) return [from[0], to[0]];
    return airportCodes([f.start_at, f.end_at, f.address, f.title].filter(Boolean).join(" ")).slice(0, 2);
  };
  const homeCode = outbound ? codesOf(outbound).find(code => !bayArea.includes(code)) : undefined;
  for (const f of flights) {
    let codes = codesOf(f);
    // One code only: pair it with the other end of the trip (the Bay Area, or the airport the outbound left from).
    if (codes.length === 1) {
      const away = bayArea.includes(codes[0]) ? homeCode : "SFO";
      if (away && away !== codes[0]) codes = f === homebound ? [codes[0], away].sort((a, b) => (bayArea.includes(a) ? -1 : 1) - (bayArea.includes(b) ? -1 : 1)) : (bayArea.includes(codes[0]) ? [away, codes[0]] : [codes[0], away]);
    }
    for (let i = 0; i + 1 < codes.length; i++) { const d = milesBetween(codes[i], codes[i + 1]); if (d) { miles += d; legs.push(`${codes[i]} → ${codes[i + 1]}`); } }
  }
  const route = legs.join(", ");
  if (miles) stats.push({ label: "Miles in the air", value: miles.toLocaleString("en-US"), note: `${route} (estimate)` });
  if (startKey && endKey && endKey > startKey) stats.push({ label: "Nights away", value: String(daysBetween(startKey, endKey)), note: `${fmtShort(startKey)} to ${fmtShort(endKey)}` });
  if (training?.start && training.end) stats.push({ label: "Training days", value: String(daysBetween(dayKey(training.start), dayKey(training.end)) + 1), note: `${fmtShort(dayKey(training.start))} to ${fmtShort(dayKey(training.end))}` });
  if (homebound?.start) {
    const left = countdown(now, homebound.start.at);
    if (left && phase === "during") stats.push({ label: "Flight home", value: left.replace(/^in /, ""), note: [fmtDay(dayKey(homebound.start)), fmtMinutes(homebound.start.minutes)].filter(Boolean).join(" · ") });
  }

  return { todayKey, startKey, endKey, phase, dayNumber, totalDays, focusKey, focusDay, events, nextUp, stats, route, miles, trainingKeys, bookings, outbound, homebound, hotel, training, plan };
}
