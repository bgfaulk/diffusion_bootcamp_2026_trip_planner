"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/client";
import { notify } from "./toast";
import { PlaceInput } from "./place-input";
import { Help } from "./help";
import { AIRPORT_CODES } from "@/lib/trip-time";

export const bookingCategories = ["flight", "hotel", "rental", "training", "insurance", "other"];

export function categoryTitle(category: string) {
  return ({ flight: "Flights", hotel: "Hotel", rental: "Rental Car", training: "Training", insurance: "Insurance", other: "Other" } as Record<string, string>)[category] || "Other";
}

// Provider suggestions per type. They feed a datalist, so anything else can still be typed.
const PROVIDERS: Record<string, string[]> = {
  flight: ["Alaska Airlines", "Allegiant Air", "American Airlines", "Breeze Airways", "Delta Air Lines", "Frontier Airlines", "Hawaiian Airlines", "JetBlue", "Southwest Airlines", "Spirit Airlines", "Sun Country Airlines", "United Airlines", "Air Canada", "British Airways", "Lufthansa", "WestJet"],
  hotel: ["Marriott", "Hilton", "Hyatt", "IHG", "Holiday Inn", "Hampton Inn", "Courtyard by Marriott", "Westin", "Sheraton", "Kimpton", "Best Western", "Airbnb", "Vrbo"],
  rental: ["Hertz", "Avis", "Enterprise", "National", "Budget", "Alamo", "Sixt", "Thrifty", "Dollar", "Turo"],
  insurance: ["Allianz Travel", "AIG Travel Guard", "Travelex", "World Nomads", "Generali Global Assistance", "Seven Corners", "Credit card coverage"]
};
const PROVIDER_HINT: Record<string, string> = { flight: "Airline", hotel: "Hotel or chain", rental: "Rental company", training: "Host or venue", insurance: "Insurer", other: "Company" };
const TITLE_HINT: Record<string, string> = { flight: "Outbound flight", hotel: "Hotel stay downtown", rental: "Rental car at SFO", training: "Diffusion Bootcamp", insurance: "Trip protection", other: "What this is" };
const START_LABEL: Record<string, string> = { flight: "Departs", hotel: "Check in", rental: "Pick up", training: "Starts", insurance: "Coverage starts", other: "Start" };
const END_LABEL: Record<string, string> = { flight: "Arrives", hotel: "Check out", rental: "Return", training: "Ends", insurance: "Coverage ends", other: "End" };

// A date-time picker's value ("2026-10-12T07:05") saved the way people write it ("Oct 12, 2026, 7:05 AM"), which is
// what the Overview's parser and the booking cards already read. Anything else passes through unchanged.
export function friendlyWhen(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return value.trim();
  const [, y, m, d, h, min] = match.map(Number) as unknown as number[];
  const date = new Date(y, m - 1, d, h, min);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Tidies a US phone number as it is typed: "(555) 123-4567", or "+1 (555) 123-4567" when it starts with a country code.
// Other international numbers (+44 ...) and anything longer than ten digits, like extensions, are left as typed.
export function formatPhone(raw: string) {
  if (/[a-z]/i.test(raw)) return raw; // "x12", "ext. 4" or a note: leave it exactly as typed
  const text = raw.replace(/[^\d+\s().-]/g, "").trimStart();
  if (text.startsWith("+") && !text.startsWith("+1")) return text;
  let digits = text.replace(/\D/g, "");
  const country = text.startsWith("+") || (digits.length === 11 && digits.startsWith("1"));
  if (country && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length > 10) return text;
  const prefix = country ? "+1 " : "";
  if (!digits.length) return text.startsWith("+") ? text.replace(/[^+\d]/g, "") : ""; // "+" or "+1" while typing or deleting
  if (digits.length < 4) return `${prefix}(${digits}`;
  if (digits.length < 7) return `${prefix}(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `${prefix}(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function tripInfoPayload(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    category: String(data.get("category") || "other"),
    title: String(data.get("title") || ""),
    provider: String(data.get("provider") || ""),
    confirmationNumber: String(data.get("confirmationNumber") || ""),
    startAt: friendlyWhen(String(data.get("startAt") || "")),
    endAt: friendlyWhen(String(data.get("endAt") || "")),
    address: String(data.get("address") || ""),
    phone: String(data.get("phone") || "").trim(),
    notes: String(data.get("notes") || ""),
    fromAirport: String(data.get("fromAirport") || "").trim().toUpperCase(),
    toAirport: String(data.get("toAirport") || "").trim().toUpperCase()
  };
}

// Add-a-booking form shared by Trip Information and the manual setup wizard. With `category` set (Trip Information
// opens it from a tab) the type is fixed to that tab; without it (the wizard) a Type picker is shown.
export function BookingForm({ onSaved, compact = false, modal = false, category, submitLabel = "Add trip detail" }: { onSaved: () => Promise<void>; compact?: boolean; modal?: boolean; category?: string; submitLabel?: string }) {
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [fromAirport, setFromAirport] = useState("");
  const [toAirport, setToAirport] = useState("");
  const airportField = (value: string) => value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 3);
  const [picked, setPicked] = useState(category ?? "flight");
  const [busy, setBusy] = useState(false);
  const kind = category ?? picked;
  const providers = PROVIDERS[kind] ?? [];
  const listId = `providers-${kind}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setBusy(true);
    try {
      await api("/api/trip-info", { method: "POST", body: JSON.stringify(tripInfoPayload(form)) });
      form.reset();
      setAddress("");
      setPhone("");
      setFromAirport(""); setToAirport("");
      await onSaved();
      notify.success("Booking saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that booking");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={`trip-form ${compact ? "compact" : ""} ${modal ? "in-modal" : ""}`} onSubmit={submit}>
      {category
        ? <input type="hidden" name="category" value={category} />
        : <label>Type<select name="category" value={picked} onChange={event => setPicked(event.target.value)}>{bookingCategories.map(option => <option key={option} value={option}>{categoryTitle(option).replace(/s$/, "")}</option>)}</select></label>}
      <label>Title<input name="title" placeholder={TITLE_HINT[kind] ?? TITLE_HINT.other} required maxLength={120} /></label>
      <label>Provider<input name="provider" list={providers.length ? listId : undefined} placeholder={PROVIDER_HINT[kind] ?? PROVIDER_HINT.other} maxLength={120} autoComplete="off" />
        {providers.length > 0 && <datalist id={listId}>{providers.map(name => <option key={name} value={name} />)}</datalist>}
      </label>
      <label>Confirmation number<input name="confirmationNumber" maxLength={120} /></label>
      {kind === "flight" && (
        <>
          {/* Airport codes feed the Overview's route and miles; each is three letters, with the miles table's airports as suggestions. */}
          <label><span>From airport <Help text="Three-letter code such as ORD. It drives the route and miles on the Overview." /></span><input name="fromAirport" list="airport-codes" value={fromAirport} onChange={event => setFromAirport(airportField(event.target.value))} placeholder="ORD" maxLength={3} autoCapitalize="characters" autoComplete="off" spellCheck={false} pattern="[A-Za-z]{3}" title="Three letters, like ORD" /></label>
          <label>To airport<input name="toAirport" list="airport-codes" value={toAirport} onChange={event => setToAirport(airportField(event.target.value))} placeholder="SFO" maxLength={3} autoCapitalize="characters" autoComplete="off" spellCheck={false} pattern="[A-Za-z]{3}" title="Three letters, like SFO" /></label>
          <datalist id="airport-codes">{AIRPORT_CODES.map(code => <option key={code} value={code} />)}</datalist>
        </>
      )}
      <label>{START_LABEL[kind] ?? START_LABEL.other}<input type="datetime-local" name="startAt" step={60} /></label>
      <label>{END_LABEL[kind] ?? END_LABEL.other}<input type="datetime-local" name="endAt" step={60} /></label>
      <label>Address<PlaceInput name="address" value={address} onChange={setAddress} placeholder="Address, terminal, hotel, or office" maxLength={260} /></label>
      <label><span>Phone <Help text="Any format works. US numbers are tidied as you type; start with + for other countries." /></span><input type="tel" inputMode="tel" autoComplete="tel" name="phone" value={phone} onChange={event => setPhone(formatPhone(event.target.value))} placeholder="(555) 123-4567" maxLength={80} /></label>
      <label className="wide">Notes<textarea name="notes" placeholder="Cancellation rules, warnings, loyalty numbers, pickup instructions..." maxLength={1200} /></label>
      {error && <p className="error wide">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? "Saving..." : submitLabel}</button>
    </form>
  );
}
