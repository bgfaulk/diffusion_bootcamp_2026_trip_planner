import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { asString, errorResponse } from "@/lib/validation";
import { MAX_ITINERARY_CHARS } from "@/lib/trip-time";

export const POST = withAudit("itinerary.save", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const instructions = encryptText(asString(body.instructions, 6000));
    const response = encryptText(asString(body.response, MAX_ITINERARY_CHARS));
    const savedPlan = encryptText(asString(body.savedPlan, MAX_ITINERARY_CHARS));
    // `cleaned` says the client has already dropped stops that restate bookings (or the text is the person's own),
    // so the one-time tidy of older plans never runs on it. Left out, the stamp stays whatever it was.
    const cleanedAt = body.cleaned === true ? new Date() : null;
    await getSql()`
      INSERT INTO itinerary (user_id, instructions, response, saved_plan, cleaned_at, updated_at)
      VALUES (${user.id}, ${instructions}, ${response}, ${savedPlan}, ${cleanedAt}, now())
      ON CONFLICT(user_id) DO UPDATE SET
        instructions = excluded.instructions,
        response = excluded.response,
        saved_plan = excluded.saved_plan,
        cleaned_at = COALESCE(excluded.cleaned_at, itinerary.cleaned_at),
        updated_at = now()
    `;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not save itinerary");
  }
});
