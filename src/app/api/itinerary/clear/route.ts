import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { errorResponse } from "@/lib/validation";

export const POST = withAudit("itinerary.clear", async (_request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    await getSql()`UPDATE itinerary SET saved_plan = ${encryptText("")}, response = ${encryptText("")}, updated_at = now() WHERE user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not clear itinerary");
  }
});
