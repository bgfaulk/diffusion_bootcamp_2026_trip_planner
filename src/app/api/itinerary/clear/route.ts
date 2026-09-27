import { requireUser } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { errorResponse } from "@/lib/validation";

export async function POST() {
  try {
    const user = await requireUser();
    await getSql()`UPDATE itinerary SET saved_plan = ${encryptText("")}, response = ${encryptText("")}, updated_at = now() WHERE user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not clear itinerary");
  }
}
