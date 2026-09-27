import { encryptText } from "./crypto";
import { getSql } from "./db";

// The welcome tour: one notification that points people at everything worth setting up. New accounts get it
// at signup; accounts that existed before it shipped get it on their next load. users.welcomed_at records
// that it was sent, so deleting the notice doesn't bring it back.

export type WelcomeStep = { text: string; action?: "setup" | "settings" | "guide" | "whatsapp" | "tripInfo" | "theme" | "photos" | "bug"; label?: string };

export function welcomeSteps(): WelcomeStep[] {
  return [
    { text: "Finish setup: your dates, bookings, travelers, and interests. The Overview and checklists are built from these.", action: "setup", label: "Finish setup" },
    { text: "Add a display name and your home and training addresses so the planner can personalize routes and timing.", action: "settings", label: "Open Settings" },
    { text: "Read the User Guide. Two minutes on what each page is for.", action: "guide", label: "Open the guide" },
    { text: "Join the ABC WhatsApp group for trip chatter and quick updates from the organizer.", action: "whatsapp", label: "ABC WhatsApp" },
    { text: "Put your bookings and insurance PDFs in Trip Information so they are on hand during the trip.", action: "tripInfo", label: "Trip Information" },
    { text: "Pick a theme: Light, Dark, or Digital Nirvana. The loading-screen chime can be muted in Settings.", action: "theme", label: "Choose a theme" },
    { text: "Fill the Photo Route as you go: six stops, one photo each.", action: "photos", label: "Photo Route" },
    { text: "Something broken, or an idea? Report Bug in your account menu goes straight to the organizer.", action: "bug", label: "Report Bug" }
  ];
}

// Sends the tour if this account hasn't had it. `fresh` picks the wording for a brand-new account.
export async function ensureWelcomed(userId: string, fresh: boolean) {
  const sql = getSql();
  const rows = await sql`SELECT welcomed_at FROM users WHERE id = ${userId}`;
  if (!rows.length || rows[0].welcomed_at) return false;
  const title = fresh ? "Welcome to the trip planner" : "A quick tour of the trip planner";
  const body = fresh
    ? "Here is everything worth setting up to get the most out of the planner. Each item has a button that takes you right to it."
    : "The planner has grown since you signed up: notifications, a User Guide, the ABC WhatsApp group, Report Bug, and more. Here is everything worth a look, each with a button that takes you right to it.";
  await sql`
    INSERT INTO notifications (user_id, kind, title, body, data)
    VALUES (${userId}, ${"welcome"}, ${encryptText(title)}, ${encryptText(body)}, ${encryptText(JSON.stringify({ steps: welcomeSteps() }))})
  `;
  await sql`UPDATE users SET welcomed_at = now() WHERE id = ${userId}`;
  return true;
}
