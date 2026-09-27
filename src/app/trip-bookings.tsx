"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/client";
import { notify } from "./toast";

export const bookingCategories = ["flight", "hotel", "rental", "training", "insurance", "other"];

export function categoryTitle(category: string) {
  return ({ flight: "Flights", hotel: "Hotel", rental: "Rental Car", training: "Training", insurance: "Insurance", other: "Other" } as Record<string, string>)[category] || "Other";
}

function tripInfoPayload(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    category: String(data.get("category") || "other"),
    title: String(data.get("title") || ""),
    provider: String(data.get("provider") || ""),
    confirmationNumber: String(data.get("confirmationNumber") || ""),
    startAt: String(data.get("startAt") || ""),
    endAt: String(data.get("endAt") || ""),
    address: String(data.get("address") || ""),
    phone: String(data.get("phone") || ""),
    notes: String(data.get("notes") || "")
  };
}

// Add-a-booking form shared by Trip Information and the manual setup wizard.
export function BookingForm({ onSaved, compact = false, modal = false, category = "flight", submitLabel = "Add trip detail" }: { onSaved: () => Promise<void>; compact?: boolean; modal?: boolean; category?: string; submitLabel?: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setBusy(true);
    try {
      await api("/api/trip-info", { method: "POST", body: JSON.stringify(tripInfoPayload(form)) });
      form.reset();
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
      <label>Type<select name="category" defaultValue={category}>{bookingCategories.map(category => <option key={category} value={category}>{categoryTitle(category).replace(/s$/, "")}</option>)}</select></label>
      <label>Title<input name="title" placeholder="Outbound flight, hotel stay, rental car..." required maxLength={120} /></label>
      <label>Provider<input name="provider" placeholder="Airline, hotel, rental company..." maxLength={120} /></label>
      <label>Confirmation number<input name="confirmationNumber" maxLength={120} /></label>
      <label>Start<input name="startAt" placeholder="Date and time, e.g. Oct 12, 7:05 AM" maxLength={120} /></label>
      <label>End<input name="endAt" placeholder="Date and time, e.g. Oct 16, 11:00 AM" maxLength={120} /></label>
      <label>Address<input name="address" placeholder="Address, terminal, hotel, or office" maxLength={260} /></label>
      <label>Phone<input name="phone" placeholder="Support or front desk number" maxLength={80} /></label>
      <label className="wide">Notes<textarea name="notes" placeholder="Cancellation rules, warnings, loyalty numbers, pickup instructions..." maxLength={1200} /></label>
      {error && <p className="error wide">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? "Saving..." : submitLabel}</button>
    </form>
  );
}
