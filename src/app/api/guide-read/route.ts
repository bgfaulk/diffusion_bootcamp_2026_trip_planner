import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { getSql } from "@/lib/db";
import { starsFor } from "@/lib/stars";
import { errorResponse } from "@/lib/validation";

// The checkbox at the bottom of the User Guide. The first tick is the one that counts; it is never
// cleared, so the guide award (see lib/stars.ts) stays earned.
export const POST = withAudit("guide.read", async (_request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    await getSql()`UPDATE users SET guide_read_at = coalesce(guide_read_at, now()) WHERE id = ${user.id}`;
    return Response.json({ ok: true, ...(await starsFor(user.id)) });
  } catch (error) {
    return errorResponse(error, "Could not save that");
  }
});
