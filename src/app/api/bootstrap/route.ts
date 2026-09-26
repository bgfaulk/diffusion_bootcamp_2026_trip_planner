import { getUser } from "@/lib/auth";
import { ensureSchema, getSql } from "@/lib/db";

export async function GET() {
  if (!process.env.DIFFUSION_DATABASE_URL && !process.env.DATABASE_URL) return Response.json({ user: null });
  await ensureSchema();
  const user = await getUser();
  if (!user) return Response.json({ user: null });
  const sql = getSql();
  const [settings, items, photos, itinerary] = await Promise.all([
    sql`SELECT * FROM settings WHERE user_id = ${user.id}`,
    sql`SELECT * FROM list_items WHERE user_id = ${user.id} ORDER BY checked ASC, position ASC, created_at ASC`,
    sql`
      SELECT p.id, p.spot, p.caption, p.content_type, p.image_base64, p.created_at
      FROM photos p
      JOIN (SELECT spot, max(created_at) AS latest FROM photos WHERE user_id = ${user.id} GROUP BY spot) latest
        ON latest.spot = p.spot AND latest.latest = p.created_at
      WHERE p.user_id = ${user.id}
    `,
    sql`SELECT instructions, response, saved_plan FROM itinerary WHERE user_id = ${user.id}`
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
    itinerary: itinerary[0] || null
  });
}
