import { neon } from "@neondatabase/serverless";

export type PageKey = "prechecks" | "packing" | "departure" | "explore" | "gallery" | "return";

export const pageKeys = new Set<PageKey>(["prechecks", "packing", "departure", "explore", "gallery", "return"]);

let schemaReady = false;

export function getSql() {
  const url = process.env.DIFFUSION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DIFFUSION_DATABASE_URL or DATABASE_URL is not configured");
  return neon(url);
}

export async function ensureSchema() {
  if (schemaReady) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      profile_name TEXT,
      trip_name TEXT,
      home_address TEXT,
      home_place_id TEXT,
      home_lat DOUBLE PRECISION,
      home_lng DOUBLE PRECISION,
      training_location TEXT,
      training_place_id TEXT,
      training_lat DOUBLE PRECISION,
      training_lng DOUBLE PRECISION,
      theme TEXT NOT NULL DEFAULT 'light',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS list_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      page TEXT NOT NULL,
      title TEXT NOT NULL,
      checked BOOLEAN NOT NULL DEFAULT false,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS photos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      spot TEXT NOT NULL,
      caption TEXT,
      content_type TEXT NOT NULL,
      image_base64 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS itinerary (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      instructions TEXT,
      response TEXT,
      saved_plan TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  schemaReady = true;
}

export async function seedStarterItems(userId: string) {
  const sql = getSql();
  const existing = await sql`SELECT COUNT(*)::int AS count FROM list_items WHERE user_id = ${userId}`;
  if (Number(existing[0]?.count || 0) > 0) return;
  const starter: Record<PageKey, string[]> = {
    prechecks: [
      "Confirm traveler names match government IDs",
      "Add TSA PreCheck or Known Traveler Numbers if available",
      "Save reservations and confirmation numbers",
      "Confirm training address and daily start time"
    ],
    packing: [
      "Government ID and wallet",
      "Phone, charger, and portable battery",
      "Laptop, charger, notebook, and pens",
      "Comfortable walking shoes",
      "Light jacket for San Francisco evenings"
    ],
    departure: [
      "Check flight status before leaving",
      "Download boarding passes",
      "Pack IDs and medication in personal item",
      "Do home sweep: lights, locks, thermostat, trash"
    ],
    explore: [
      "Golden Gate Overlook",
      "Ferry Building",
      "North Beach dinner",
      "Mission District meal",
      "Half Moon Bay coast drive",
      "Filoli Historic House and Garden"
    ],
    gallery: ["Golden Gate Overlook", "Ferry Building", "North Beach", "Mission District", "Favorite surprise"],
    return: [
      "Check out on time",
      "Room sweep: chargers, closet, bathroom, safe",
      "Refuel rental car if required",
      "Save receipts for expenses",
      "Check return flight status"
    ]
  };
  for (const [page, titles] of Object.entries(starter) as [PageKey, string[]][]) {
    for (const [index, title] of titles.entries()) {
      await sql`INSERT INTO list_items (user_id, page, title, position) VALUES (${userId}, ${page}, ${title}, ${index + 1})`;
    }
  }
}
