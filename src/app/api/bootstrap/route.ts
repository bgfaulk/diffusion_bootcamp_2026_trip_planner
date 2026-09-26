import { getUser } from "@/lib/auth";
import { ensureSchema, getSql, hasDatabaseUrl } from "@/lib/db";

function emptyBootstrap() {
  return Response.json({
    user: null,
    settings: null,
    items: [],
    photos: {},
    itinerary: null,
    tripInfo: [],
    tripDocuments: [],
    tripImport: null
  });
}

export async function GET() {
  if (!hasDatabaseUrl()) return emptyBootstrap();
  await ensureSchema();
  const user = await getUser();
  if (!user) return emptyBootstrap();
  const sql = getSql();
  const [settings, items, photos, itinerary, tripInfo, tripDocuments, tripImport] = await Promise.all([
    sql`SELECT * FROM settings WHERE user_id = ${user.id}`,
    sql`SELECT * FROM list_items WHERE user_id = ${user.id} ORDER BY checked ASC, position ASC, created_at ASC`,
    sql`
      SELECT p.id, p.spot, p.caption, p.content_type, p.image_base64, p.created_at
      FROM photos p
      JOIN (SELECT spot, max(created_at) AS latest FROM photos WHERE user_id = ${user.id} GROUP BY spot) latest
        ON latest.spot = p.spot AND latest.latest = p.created_at
      WHERE p.user_id = ${user.id}
    `,
    sql`SELECT instructions, response, saved_plan FROM itinerary WHERE user_id = ${user.id}`,
    sql`SELECT * FROM trip_info WHERE user_id = ${user.id} ORDER BY created_at DESC`,
    sql`SELECT id, label, file_name, content_type, created_at FROM trip_documents WHERE user_id = ${user.id} ORDER BY created_at DESC`,
    sql`SELECT instructions, response FROM trip_import WHERE user_id = ${user.id}`
  ]);
  return Response.json({
    user,
    settings: settings[0] || null,
    items,
    photos: Object.fromEntries(photos.map((photo: any) => [photo.spot, {
      id: photo.id,
      caption: photo.caption,
      imageUrl: `data:${photo.content_type};base64,${photo.image_base64}`
    }])),
    itinerary: itinerary[0] || null,
    tripInfo,
    tripDocuments: tripDocuments.map((document: any) => ({
      ...document,
      viewUrl: `/api/trip-documents/${document.id}`,
      downloadUrl: `/api/trip-documents/${document.id}?download=1`
    })),
    tripImport: tripImport[0] || null
  });
}
