// Shared between the browser (wizard + prompt) and the server (plan import). No Node-only imports.

import { AppError } from "./validation";

export type EmailAccess = "connected" | "paste" | "skip";

// Every bootcamp attendee trains at the same place, so the ChatGPT path doesn't ask for it.
export const trainingAddress = "100 Oracle Pkwy, Redwood City, CA";
export const trainingDetail = "Oracle campus, Building 100, 6th floor";

// The bootcamp's daily agenda. It applies to every attendee's Training booking, for each day it spans.
export const trainingAgenda = {
  slots: [
    { minutes: 8 * 60, title: "Breakfast", detail: "Served at Diffusion" },
    { minutes: 8 * 60 + 30, title: "Workshop begins", detail: "" },
    { minutes: 12 * 60, title: "Lunch", detail: "" },
    { minutes: 13 * 60, title: "Back in the workshop", detail: "" },
    { minutes: 17 * 60, title: "End of day", detail: "Evenings are free. No Diffusion events." }
  ],
  notes: ["The office is inaccessible before 8 AM.", "Breakfast is served at Diffusion.", "Evenings are free all three nights. No Diffusion events."]
};

export type WizardAnswers = {
  step: number;
  // Furthest step reached, so visited steps stay clickable in both directions.
  furthest: number;
  completed: boolean;
  // Left setup before finishing: the app opens anyway and shows a "finish setup" banner.
  dismissed: boolean;
  displayName: string;
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  homeCity: string;
  trainingLocation: string;
  emailAccess: EmailAccess | "";
  bookingHints: string;
  bookingEmail: string;
  travelerCount: number;
  travelers: string;
  kids: string;
  accessibility: string;
  interests: string[];
  pace: "relaxed" | "balanced" | "packed" | "";
  budget: "budget" | "moderate" | "splurge" | "";
  transport: string;
  food: string;
  mustDo: string;
  response: string;
};

export const emptyAnswers: WizardAnswers = {
  step: 0,
  furthest: 0,
  completed: false,
  dismissed: false,
  displayName: "",
  tripName: "",
  destination: "San Francisco",
  startDate: "",
  endDate: "",
  homeCity: "",
  trainingLocation: "",
  emailAccess: "",
  bookingHints: "",
  bookingEmail: "",
  travelerCount: 1,
  travelers: "",
  kids: "",
  accessibility: "",
  interests: [],
  pace: "",
  budget: "",
  transport: "",
  food: "",
  mustDo: "",
  response: ""
};

export const interestOptions = [
  "Food & dining",
  "Views & photo spots",
  "Museums & art",
  "Outdoors & hikes",
  "History & landmarks",
  "Coffee & bakeries",
  "Nightlife & music",
  "Shopping",
  "Day trips outside the city",
  "Sports"
];

export function parseAnswers(value: unknown): WizardAnswers {
  if (typeof value !== "string" || !value) return { ...emptyAnswers };
  try {
    const parsed = JSON.parse(value);
    return { ...emptyAnswers, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return { ...emptyAnswers };
  }
}

const tripCategories = ["flight", "hotel", "rental", "training", "insurance", "other"];

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : typeof value === "number" ? String(value).slice(0, max) : "";
}

export function normalizeTripRecord(item: any) {
  return {
    category: tripCategories.includes(String(item?.category)) ? String(item.category) : "other",
    title: text(item?.title, 120),
    provider: text(item?.provider, 120),
    confirmationNumber: text(item?.confirmationNumber ?? item?.confirmation_number, 120),
    startAt: text(item?.startAt ?? item?.start_at, 120),
    endAt: text(item?.endAt ?? item?.end_at, 120),
    address: text(item?.address, 260),
    phone: text(item?.phone, 80),
    notes: text(item?.notes, 1200)
  };
}

export type TripRecord = ReturnType<typeof normalizeTripRecord>;

export type TripPlan = {
  tripName: string;
  trainingLocation: string;
  // Trip facts ChatGPT works out from the bookings; they fill in the wizard answers.
  startDate: string;
  endDate: string;
  homeCity: string;
  travelerCount: number;
  travelers: string;
  records: TripRecord[];
  itineraryText: string;
  lists: Record<"prechecks" | "packing" | "departure" | "explore" | "return", string[]>;
};

// ChatGPT sometimes wraps JSON in ``` fences or adds a sentence around it; pull out the outermost object.
export function extractJson(raw: string): any {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new AppError("That doesn't look like the JSON ChatGPT returned. Paste the whole response.");
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      throw new AppError("The pasted response isn't valid JSON. Ask ChatGPT to return only the JSON and paste it again.");
    }
  }
}

function isoDate(value: unknown) {
  const date = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function list(value: unknown, max = 25) {
  if (!Array.isArray(value)) return [];
  return value.map(entry => text(typeof entry === "string" ? entry : entry?.title, 180)).filter(Boolean).slice(0, max);
}

function itineraryToText(itinerary: any) {
  if (typeof itinerary === "string") return itinerary.trim();
  if (!itinerary || typeof itinerary !== "object") return "";
  const lines: string[] = [];
  if (itinerary.title) lines.push(text(itinerary.title, 200), "");
  if (itinerary.overview) lines.push(text(itinerary.overview, 2000), "");
  for (const day of Array.isArray(itinerary.days) ? itinerary.days : []) {
    lines.push(text(day?.label ?? day?.day, 200));
    for (const stop of Array.isArray(day?.items) ? day.items : []) {
      const parts = [stop?.time, stop?.place, stop?.why, stop?.address].map(part => text(part, 300)).filter(Boolean);
      if (parts.length) lines.push(`- ${parts.join(" | ")}`);
    }
    lines.push("");
  }
  const notes = list(itinerary.notes, 20);
  if (notes.length) lines.push("Practical notes:", ...notes.map(note => `- ${note}`));
  return lines.join("\n").trim();
}

export function normalizePlan(parsed: any): TripPlan {
  if (!parsed || typeof parsed !== "object") throw new AppError("The pasted response is empty");
  const plan: TripPlan = {
    tripName: text(parsed.tripName, 120),
    trainingLocation: text(parsed.trainingLocation, 240),
    startDate: isoDate(parsed.startDate),
    endDate: isoDate(parsed.endDate),
    homeCity: text(parsed.homeCity, 160),
    travelerCount: Math.max(0, Math.min(20, Math.round(Number(parsed.travelers?.count) || 0))),
    travelers: text(parsed.travelers?.names, 240),
    records: (Array.isArray(parsed.records) ? parsed.records : []).map(normalizeTripRecord).filter((record: TripRecord) => record.title).slice(0, 40),
    itineraryText: itineraryToText(parsed.itinerary).slice(0, 12000),
    lists: {
      prechecks: list(parsed.prechecks),
      packing: list(parsed.packing),
      departure: list(parsed.departure),
      explore: list(parsed.explore),
      return: list(parsed.return)
    }
  };
  const listCount = Object.values(plan.lists).reduce((sum, items) => sum + items.length, 0);
  if (!plan.records.length && !plan.itineraryText && !listCount) {
    throw new AppError("Couldn't find any trip details in that response. Make sure you pasted ChatGPT's full JSON answer.");
  }
  return plan;
}

function emailInstructions(answers: WizardAnswers) {
  const hints = answers.bookingHints ? `\nHints about my bookings: ${answers.bookingHints}` : "";
  const inbox = answers.bookingEmail ? ` (${answers.bookingEmail})` : "";
  if (answers.emailAccess === "connected") {
    return `Search my email${inbox} for this trip's confirmations: flights, hotel, rental car, bootcamp registration, and travel insurance. Put each one in "records".
Before you search, check that you can actually read that inbox. If you can't (for example this is the phone app, or the Gmail connector isn't available on this plan), don't guess and don't recommend plugins, GPTs, or paid add-ons: say so in one sentence and ask me to paste my confirmation emails into this chat instead, then continue with what I paste. If some bookings aren't in my email, tell me which ones are missing.${hints}`;
  }
  if (answers.emailAccess === "paste") {
    return `I'll paste my confirmation emails after this message. Pull every flight, hotel, rental car, bootcamp, and insurance detail from them into "records". Wait for my pasted emails before answering.${hints}`;
  }
  return `Don't look for bookings. Leave "records" empty unless I mention a booking. Ask me for my travel dates and where I'm flying from before you answer.${hints}`;
}

export function buildWizardPrompt(answers: WizardAnswers) {
  const line = (label: string, value: string | number) => (value === "" || value === undefined ? "" : `- ${label}: ${value}`);
  const about = [
    line("My name", answers.displayName),
    line("Trip name", answers.tripName),
    `- Why I'm going: bootcamp training at ${trainingAddress} (${trainingDetail}), in the San Francisco Bay Area`,
    line("Leaving home", answers.startDate),
    line("Returning home", answers.endDate),
    line("Traveling from", answers.homeCity),
    line("Who's coming", answers.travelers),
    line("Kids and ages", answers.kids),
    line("Accessibility or mobility needs", answers.accessibility),
    line("Interests", answers.interests.join(", ")),
    line("Pace", answers.pace),
    line("Budget", answers.budget),
    line("Getting around", answers.transport),
    line("Food preferences or restrictions", answers.food),
    line("Must-dos", answers.mustDo)
  ].filter(Boolean).join("\n");

  return `You're helping me set up my trip planner app. Use what I tell you below to plan my trip, then give me the result as a downloadable file named trip-plan.json containing ONE JSON object in the exact shape shown. I'll upload that file into the app.

About the trip:
${about}

Bookings:
${emailInstructions(answers)}

From the bookings, work out:
- "startDate" and "endDate": the day I leave home and the day I get back (YYYY-MM-DD).
- "homeCity": the city or airport I'm traveling from.
- "travelers": how many people are going and their names (passengers on the flights, guests on the hotel reservation).
If you can't tell one of these from the bookings, ask me before you answer.

Build out:
- "records": give every booking its exact dates and local times in "startAt" and "endAt" (flight departure/arrival with airport codes, hotel check-in/checkout, rental pickup/return). Include the bootcamp itself as a "training" record at ${trainingAddress} (${trainingDetail}).
- "itinerary": a day-by-day plan from the day I leave home to the day I get back, built around the bootcamp and booking times, with realistic travel time between stops (including the commute to Redwood City). Do not list the flights, hotel check-in or check-out, rental pickup or return, or the bootcamp sessions themselves as itinerary items; the app places those on the right days from "records". Include only what happens around them.
- "prechecks": things to confirm before the trip (IDs, reservations, check-in times).
- "packing": a packing list for these travelers, this season, and these plans.
- "departure": a departure-day checklist timed to the outbound flight (when to leave home, check in, and reach the gate).
- "explore": 6 to 10 places worth visiting that match my interests.
- "return": a return-day checklist timed to hotel checkout, rental return, and the return flight.
- Flag conflicts in the notes, like a rental pickup that closes before the flight lands.

JSON shape:
{
  "tripName": "Short trip name",
  "trainingLocation": "${trainingAddress}",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "homeCity": "City or airport",
  "travelers": { "count": 1, "names": "Names of everyone traveling" },
  "records": [
    { "category": "flight | hotel | rental | training | insurance | other", "title": "Short label", "provider": "Company", "confirmationNumber": "", "startAt": "Date/time", "endAt": "Date/time", "address": "", "phone": "", "notes": "" }
  ],
  "itinerary": {
    "title": "",
    "overview": "",
    "days": [ { "label": "Day 1 - Mon, Oct 12", "items": [ { "time": "9:00 AM", "place": "", "why": "", "address": "" } ] } ],
    "notes": [ "Practical tips: parking, layers, reservations, transit" ]
  },
  "prechecks": ["..."],
  "packing": ["..."],
  "departure": ["..."],
  "explore": ["..."],
  "return": ["..."]
}

The file must contain valid JSON only: no markdown fences and no commentary. Use "" for anything unknown.
Don't paste the JSON into the chat. Just give me the download link for trip-plan.json. If you can't create files, reply with only the JSON instead.`;
}

export const sampleResponse = JSON.stringify({
  tripName: "Diffusion Bootcamp - Bay Area",
  trainingLocation: trainingAddress,
  startDate: "2026-10-12",
  endDate: "2026-10-16",
  homeCity: "Chicago, IL (ORD)",
  travelers: { count: 1, names: "Alex Rivera" },
  records: [
    { category: "flight", title: "Outbound flight", provider: "United Airlines", confirmationNumber: "K7Q2PL", startAt: "Oct 12, 7:05 AM (ORD)", endAt: "Oct 12, 9:48 AM (SFO)", address: "O'Hare Terminal 1", phone: "800-864-8331", notes: "Seat 14C. Checked bag included." },
    { category: "flight", title: "Return flight", provider: "United Airlines", confirmationNumber: "K7Q2PL", startAt: "Oct 16, 6:20 PM (SFO)", endAt: "Oct 17, 12:31 AM (ORD)", address: "SFO Terminal 3", phone: "800-864-8331", notes: "" },
    { category: "hotel", title: "Hotel stay", provider: "Hotel Zephyr", confirmationNumber: "88213904", startAt: "Oct 12, check-in 4:00 PM", endAt: "Oct 16, checkout 11:00 AM", address: "250 Beach St, San Francisco, CA 94133", phone: "415-617-6565", notes: "Early check-in not guaranteed. Bag drop available." },
    { category: "rental", title: "Rental car", provider: "Hertz", confirmationNumber: "H55190023", startAt: "Oct 14, 9:00 AM", endAt: "Oct 16, 2:00 PM", address: "SFO Rental Car Center", phone: "800-654-3131", notes: "Return by 2:00 PM to make the 6:20 PM flight comfortably." },
    { category: "training", title: "Diffusion Bootcamp", provider: "Bootcamp", confirmationNumber: "", startAt: "Oct 13, 9:00 AM", endAt: "Oct 15, 5:00 PM", address: `${trainingAddress} (${trainingDetail})`, phone: "", notes: "Bring laptop and charger. Lunch provided." }
  ],
  itinerary: {
    title: "Four days in San Francisco",
    overview: "Training days are at the Oracle campus in Redwood City. Evenings and the last morning are for exploring San Francisco.",
    days: [
      { label: "Day 1 - Mon, Oct 12", items: [
        { time: "11:00 AM", place: "BART from SFO to Embarcadero", why: "Fastest way downtown, about 35 minutes", address: "SFO International Terminal BART" },
        { time: "12:30 PM", place: "Ferry Building", why: "Lunch at the marketplace while you wait for check-in", address: "1 Ferry Building" },
        { time: "7:00 PM", place: "North Beach dinner", why: "Walkable from the hotel, classic Italian", address: "Columbus Ave & Green St" }
      ] },
      { label: "Day 2 - Tue, Oct 13", items: [
        { time: "6:30 PM", place: "Redwood Shores Lagoon walk", why: "Easy stroll right after class", address: "Redwood Shores, Redwood City" }
      ] },
      { label: "Day 3 - Wed, Oct 14", items: [
        { time: "6:00 PM", place: "Golden Gate Overlook at sunset", why: "Rental car day, 20-minute drive", address: "Langdon Ct, San Francisco" }
      ] },
      { label: "Day 4 - Thu, Oct 15", items: [
        { time: "7:00 PM", place: "Mission District tacos", why: "Casual last-night dinner", address: "Valencia St & 18th St" }
      ] }
    ],
    notes: ["Bring layers; evenings drop into the 50s.", "Hotel parking is $55/night. Only keep the car for the days you need it.", "Rental return closes at 2 PM on Oct 16. Plan to leave the city by noon."]
  },
  prechecks: ["Confirm hotel early check-in", "Add United flight to phone wallet", "Download the BART app and add funds", "Confirm the bootcamp start time"],
  packing: ["Laptop, charger, and notebook", "Light jacket and a layer for evenings", "Comfortable walking shoes", "Portable battery", "Government ID"],
  departure: ["Check flight status at 5 AM", "Leave for ORD by 5:15 AM", "Pack ID and medication in your personal item"],
  explore: ["Ferry Building Marketplace", "North Beach and City Lights Books", "Golden Gate Overlook", "Yerba Buena Gardens", "Mission District murals", "Lands End trail", "Dolores Park"],
  return: ["Check out by 11 AM, use bag drop", "Refuel the rental car before returning", "Return the car at SFO by 2 PM", "Save receipts for expenses"]
}, null, 2);
