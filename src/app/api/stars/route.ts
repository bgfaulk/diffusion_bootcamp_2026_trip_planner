import { requireUser } from "@/lib/auth";
import { withQuiet } from "@/lib/audit";
import { starsFor } from "@/lib/stars";
import { errorResponse } from "@/lib/validation";

// The person's stars and the leaderboard, settled fresh. Called after checklist edits and while the
// Overview is open; quiet, so it only reaches the audit log when it fails.
export const GET = withQuiet("stars.refresh", async (_request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    return Response.json(await starsFor(user.id));
  } catch (error) {
    return errorResponse(error, "Could not load stars");
  }
});
