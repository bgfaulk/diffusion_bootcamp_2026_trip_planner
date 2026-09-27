import { getUser } from "@/lib/auth";
import { decryptRow, decryptText } from "@/lib/crypto";
import { ensureSchema, getSql, hasDatabaseUrl } from "@/lib/db";

function emptyBootstrap() {
  return Response.json({
    user: null,
    settings: null,
    items: [],
    photos: {},
    itinerary: null,
    tripInfo: [],
    tripDocuments: []
  });
}

export async function GET() {
  if (!hasDatabaseUrl()) return emptyBootstrap();
  await ensureSchema();
  const user = await getUser();
  if (!user) return emptyBootstrap();
  const sql = getSql();
  const [settings, items, photos, itinerary, tripInfo, tripDocuments] = await Promise.all([
    sql`SELECT user_id, profile_name, trip_name, home_address, home_place_id, training_location, training_place_id, theme, planning_mode, planning_answers, updated_at FROM settings WHERE user_id = ${user.id}`,
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
    sql`SELECT id, label, file_name, content_type, created_at FROM trip_documents WHERE user_id = ${user.id} ORDER BY created_at DESC`
  ]);
  return Response.json({
    user,
    settings: settings[0] ? decryptRow(settings[0], ["profile_name", "trip_name", "home_address", "home_place_id", "training_location", "training_place_id", "planning_answers"]) : null,
    items: items.map((item: any) => ({ ...item, title: decryptText(item.title) })),
    photos: Object.fromEntries(photos.map((photo: any) => [photo.spot, {
      id: photo.id,
      caption: decryptText(photo.caption),
      imageUrl: `/api/photos/${photo.id}`
    }])),
    itinerary: itinerary[0] ? decryptRow(itinerary[0], ["instructions", "response", "saved_plan"]) : null,
    tripInfo: tripInfo.map((item: any) => decryptRow(item, ["title", "provider", "confirmation_number", "start_at", "end_at", "address", "phone", "notes"])),
    tripDocuments: tripDocuments.map((document: any) => ({
      ...decryptRow(document, ["label", "file_name"]),
      viewUrl: `/api/trip-documents/${document.id}`,
      downloadUrl: `/api/trip-documents/${document.id}?download=1`
    }))
  });
}
