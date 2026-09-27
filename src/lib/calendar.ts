import { trainingAgenda } from "./plan";
import { addDays, dayKey, fmtMinutes, keyToDate, type TimedBooking, type TripModel, type When } from "./trip-time";

// Calendar export. Everything happens in the browser: an .ics file is built from the person's own
// bookings and trip dates and downloaded, so Apple Calendar, Google Calendar, or Outlook can import it.
// A guest email from Settings (calendar_guest) rides along as an ATTENDEE on every event, with the person
// as ORGANIZER, so the calendar app offers to send them the invitations.
//
// Times: bookings are typed as free text, so a time written with a zone abbreviation ("9:00 AM CDT") is
// exported as that exact instant, and one without a zone is exported as a floating wall-clock time that
// shows as written wherever the phone is. Training days are pinned to Pacific time.

export type CalendarTime =
  | { kind: "date"; key: number }
  | { kind: "floating"; y: number; m: number; d: number; minutes: number }
  | { kind: "utc"; at: Date };

export type CalendarEvent = { summary: string; description?: string; location?: string; start: CalendarTime; end: CalendarTime };

const ZONE_RE = /\b(PST|PDT|MST|MDT|CST|CDT|EST|EDT|AKST|AKDT|HST|UTC|GMT)\b/i;
const PACIFIC = "America/Los_Angeles";
const categoryLabels: Record<TimedBooking["category"], string> = { flight: "Flight", hotel: "Hotel", rental: "Rental car", training: "Training", insurance: "Insurance", other: "" };

function timeOf(when: When, raw: string | undefined): CalendarTime {
  if (when.minutes === null) return { kind: "date", key: dayKey(when) };
  if (raw && ZONE_RE.test(raw)) return { kind: "utc", at: when.at };
  return { kind: "floating", y: when.y, m: when.m, d: when.d, minutes: when.minutes };
}

function plusMinutes(time: CalendarTime, minutes: number): CalendarTime {
  if (time.kind === "date") return { kind: "date", key: addDays(time.key, 1) };
  if (time.kind === "utc") return { kind: "utc", at: new Date(time.at.getTime() + minutes * 60_000) };
  const date = new Date(time.y, time.m - 1, time.d, 0, time.minutes + minutes);
  return { kind: "floating", y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate(), minutes: date.getHours() * 60 + date.getMinutes() };
}

function order(time: CalendarTime) {
  if (time.kind === "utc") return time.at.getTime();
  if (time.kind === "date") return keyToDate(time.key).getTime();
  return new Date(time.y, time.m - 1, time.d, 0, time.minutes).getTime();
}

// A wall-clock time in an IANA zone as a UTC instant, without a timezone library: read the zone's own
// clock at a guess and correct by the difference (twice, for the hour around a DST change).
export function zonedToUtc(y: number, m: number, d: number, minutes: number, zone: string) {
  const format = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const wall = (at: Date) => {
    const parts = Object.fromEntries(format.formatToParts(at).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  };
  const target = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = target;
  for (let i = 0; i < 2; i++) guess -= wall(new Date(guess)) - target;
  return new Date(guess);
}

// One event per booking that has a readable start. A missing or earlier end becomes start plus an hour.
export function bookingEvent(booking: TimedBooking): CalendarEvent | null {
  if (!booking.start) return null;
  const start = timeOf(booking.start, booking.start_at);
  let end = booking.end ? timeOf(booking.end, booking.end_at) : plusMinutes(start, 60);
  // All-day DTEND is exclusive, so a stay written as Oct 12 to Oct 16 blocks both days inclusive.
  if (start.kind === "date" && end.kind === "date") end = { kind: "date", key: Math.max(end.key, start.key) + 1 };
  if (start.kind !== "date" && (end.kind === "date" || order(end) <= order(start))) end = plusMinutes(start, 60);
  const label = categoryLabels[booking.category];
  const lines = [
    booking.provider && booking.provider !== booking.title ? booking.provider : "",
    booking.confirmation_number ? `Confirmation: ${booking.confirmation_number}` : "",
    booking.phone ? `Phone: ${booking.phone}` : "",
    booking.start_at || booking.end_at ? `As entered: ${[booking.start_at, booking.end_at].filter(Boolean).join(" to ")}` : "",
    booking.notes || ""
  ].filter(Boolean);
  return { summary: label ? `${label}: ${booking.title}` : booking.title, description: lines.join("\n"), location: booking.address || "", start, end };
}

// The whole trip as one all-day block, from the setup dates.
export function tripWindowEvent(trip: TripModel, tripName: string): CalendarEvent | null {
  if (!trip.startKey) return null;
  return { summary: tripName || "San Francisco trip", start: { kind: "date", key: trip.startKey }, end: { kind: "date", key: addDays(trip.endKey || trip.startKey, 1) } };
}

// One event per training day, 8 AM to 5 PM Pacific, with the day's agenda in the description.
export function trainingEvents(trip: TripModel, location: string): CalendarEvent[] {
  const first = trainingAgenda.slots[0]?.minutes ?? 8 * 60;
  const last = trainingAgenda.slots[trainingAgenda.slots.length - 1]?.minutes ?? 17 * 60;
  const agenda = trainingAgenda.slots.map(slot => `${fmtMinutes(slot.minutes)} ${slot.title}${slot.detail ? ` (${slot.detail})` : ""}`);
  const where = location || trip.training?.address || "";
  return trip.trainingKeys.map((key, index) => {
    const date = keyToDate(key);
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    return {
      summary: `${trip.training?.title || "Diffusion Bootcamp"}: day ${index + 1} of ${trip.trainingKeys.length}`,
      description: [...agenda, "", ...trainingAgenda.notes].join("\n"),
      location: where,
      start: { kind: "utc", at: zonedToUtc(y, m, d, first, PACIFIC) },
      end: { kind: "utc", at: zonedToUtc(y, m, d, last, PACIFIC) }
    };
  });
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function utcStamp(at: Date) { return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}00Z`; }
function timeLine(prop: "DTSTART" | "DTEND", time: CalendarTime) {
  if (time.kind === "date") return `${prop};VALUE=DATE:${time.key}`;
  if (time.kind === "utc") return `${prop}:${utcStamp(time.at)}`;
  return `${prop}:${time.y}${pad(time.m)}${pad(time.d)}T${pad(Math.floor(time.minutes / 60))}${pad(time.minutes % 60)}00`;
}
function escapeText(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
// RFC 5545 folds lines at 75 octets; a continuation line starts with one space.
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (cut > 1 && new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

// Builds the file. With a guest, the events are invitations (METHOD:REQUEST) from the person to the guest;
// without one they are plain events the calendar app just adds.
export function buildIcs(events: CalendarEvent[], options: { guest?: string; organizer?: string } = {}) {
  const guest = options.guest?.trim();
  const organizer = options.organizer?.trim();
  const stamp = utcStamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ABC Fitness//Diffusion Bootcamp Trip Planner//EN", "CALSCALE:GREGORIAN", `METHOD:${guest ? "REQUEST" : "PUBLISH"}`];
  events.forEach((event, index) => {
    lines.push("BEGIN:VEVENT", `UID:${stamp}-${index}-${Math.random().toString(36).slice(2, 10)}@trip-planner`, `DTSTAMP:${stamp}`, timeLine("DTSTART", event.start), timeLine("DTEND", event.end), `SUMMARY:${escapeText(event.summary)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (guest) {
      if (organizer) lines.push(`ORGANIZER:mailto:${organizer}`);
      lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${guest}`);
    }
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "event"; }
