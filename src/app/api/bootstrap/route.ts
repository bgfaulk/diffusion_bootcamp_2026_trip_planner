import { after } from "next/server";
import { parseHiddenStock } from "@/lib/photo-spots";
import { runHealthCheck } from "@/lib/health";
import { ensureWelcomed } from "@/lib/welcome";
import { getUser } from "@/lib/auth";
import { withTraffic } from "@/lib/audit";
import { decryptRow, decryptText } from "@/lib/crypto";
import { ensureSchema, getSql, hasDatabaseUrl } from "@/lib/db";
import { starsFor } from "@/lib/stars";

function emptyBootstrap() {
  return Response.json({
    user: null,
    settings: null,
    notifications: [],
    links: { whatsapp: "" },
    items: [],
    photos: {},
    itinerary: null,
    tripInfo: [],
    tripDocuments: [],
    stars: null,
    leaderboard: []
  });
}

export const GET = withTraffic("bootstrap", async (_request, ctx) => {
  if (!hasDatabaseUrl()) return emptyBootstrap();
  await ensureSchema();
  const user = ctx.user = await getUser();
  if (!user) return emptyBootstrap();
  // The organizer's visits double as health checks (throttled inside runHealthCheck); they run after the response.
  if (user.owner) after(() => runHealthCheck("owner").catch(() => {}));
  // Accounts from before the welcome tour existed get it once, on their next load.
  await ensureWelcomed(user.id, false).catch(() => {});
  const sql = getSql();
  const [settings, items, photos, itinerary, tripInfo, tripDocuments, notifications] = await Promise.all([
    sql`SELECT user_id, profile_name, trip_name, home_address, home_place_id, training_location, training_place_id, theme, planning_mode, planning_answers, chime_muted, calendar_guest, hidden_stock_spots, updated_at FROM settings WHERE user_id = ${user.id}`,
    sql`SELECT * FROM list_items WHERE user_id = ${user.id} ORDER BY checked ASC, position ASC, created_at ASC`,
    sql`
      SELECT p.id, p.spot, p.caption
      FROM photos p
      JOIN (SELECT spot, max(created_at) AS latest FROM photos WHERE user_id = ${user.id} GROUP BY spot) latest
        ON latest.spot = p.spot AND latest.latest = p.created_at
      WHERE p.user_id = ${user.id}
    `,
    sql`SELECT instructions, response, saved_plan FROM itinerary WHERE user_id = ${user.id}`,
    sql`SELECT * FROM trip_info WHERE user_id = ${user.id} ORDER BY created_at DESC`,
    sql`SELECT id, label, file_name, content_type, created_at FROM trip_documents WHERE user_id = ${user.id} ORDER BY created_at DESC`,
    sql`SELECT id, kind, title, body, data, read_at, created_at FROM notifications WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 100`
  ]);
  const settingsRow = settings[0] ? decryptRow(settings[0], ["profile_name", "trip_name", "home_address", "home_place_id", "training_location", "training_place_id", "planning_answers", "calendar_guest"]) : null;
  // Stars settle on every load, so anything earned through a save that reloads (profile, trip details,
  // an import) shows up right here. Never fails the load.
  const starState = await starsFor(user.id, { items: items as any, settings: settingsRow as any, tripInfoCount: tripInfo.length }).catch(error => { console.error("stars", error); return { stars: null, leaderboard: [] }; });
  return Response.json({
    user,
    // Shared links handed only to signed-in attendees (kept out of the public repo).
    links: { whatsapp: process.env.WHATSAPP_GROUP_URL?.trim() || "" },
    settings: settingsRow,
    stars: starState.stars,
    leaderboard: starState.leaderboard,
    items: items.map((item: any) => ({ ...item, title: decryptText(item.title) })),
    // Stock photos the person deleted from the route; the client hides those and shows the empty frame instead.
    stockHidden: parseHiddenStock(settings[0]?.hidden_stock_spots),
    photos: Object.fromEntries(photos.map((photo: any) => [photo.spot, {
      id: photo.id,
      caption: decryptText(photo.caption),
      imageUrl: `/api/photos/${photo.id}`
    }])),
    itinerary: itinerary[0] ? decryptRow(itinerary[0], ["instructions", "response", "saved_plan"]) : null,
    tripInfo: tripInfo.map((item: any) => decryptRow(item, ["title", "provider", "confirmation_number", "start_at", "end_at", "address", "phone", "notes"])),
    notifications: notifications.map((row: any) => decryptRow(row, ["title", "body", "data"])),
    tripDocuments: tripDocuments.map((document: any) => ({
      ...decryptRow(document, ["label", "file_name"]),
      viewUrl: `/api/trip-documents/${document.id}`,
      downloadUrl: `/api/trip-documents/${document.id}?download=1`
    }))
  });
});
