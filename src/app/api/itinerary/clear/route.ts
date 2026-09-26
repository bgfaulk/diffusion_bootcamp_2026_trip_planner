import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { jsonError } from "@/lib/validation";

export async function POST() {
  try {
    const user = await requireUser();
    await getSql()`UPDATE itinerary SET saved_plan = '', response = '', updated_at = now() WHERE user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not clear itinerary", 400);
  }
}
