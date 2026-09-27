import { requireUser } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { asString, errorResponse } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const instructions = encryptText(asString(body.instructions, 6000));
    const response = encryptText(asString(body.response, 12000));
    const savedPlan = encryptText(asString(body.savedPlan, 12000));
    await getSql()`
      INSERT INTO itinerary (user_id, instructions, response, saved_plan, updated_at)
      VALUES (${user.id}, ${instructions}, ${response}, ${savedPlan}, now())
      ON CONFLICT(user_id) DO UPDATE SET
        instructions = excluded.instructions,
        response = excluded.response,
        saved_plan = excluded.saved_plan,
        updated_at = now()
    `;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not save itinerary");
  }
}
