import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { getSql } from "@/lib/db";
import { parseHiddenStock, photoSpotIds } from "@/lib/photo-spots";
import { asBooleanOrNull, asString, errorResponse, fail } from "@/lib/validation";

// Stock photos fill the photo route until a person adds their own or deletes them. Deleting one is remembered
// per account in settings.hidden_stock_spots (a JSON list of spot ids); it is gone for good for that person.
export const POST = withAudit("photos.stock", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const spot = ctx.target = asString(body.spot, 80);
    if (!photoSpotIds.has(spot)) fail("Choose a stop on the photo route");
    const hidden = asBooleanOrNull(body.hidden);
    if (hidden === null) fail("hidden must be true or false");
    const sql = getSql();
    const rows = await sql`SELECT hidden_stock_spots FROM settings WHERE user_id = ${user.id}`;
    const current = parseHiddenStock(rows[0]?.hidden_stock_spots);
    const next = hidden ? Array.from(new Set([...current, spot])) : current.filter(id => id !== spot);
    const stored = JSON.stringify(next);
    await sql`
      INSERT INTO settings (user_id, hidden_stock_spots, updated_at)
      VALUES (${user.id}, ${stored}, now())
      ON CONFLICT(user_id) DO UPDATE SET hidden_stock_spots = excluded.hidden_stock_spots, updated_at = now()
    `;
    ctx.detail = hidden ? "hidden" : "restored";
    return Response.json({ stockHidden: next });
  } catch (error) {
    return errorResponse(error, "Could not update that stock photo");
  }
});
