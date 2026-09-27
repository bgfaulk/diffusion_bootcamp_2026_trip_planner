import { activity, requireOwner, windowFromParams } from "@/lib/admin";
import { withAudit } from "@/lib/audit";
import { asString, errorResponse } from "@/lib/validation";

export const GET = withAudit("admin.log", async (request, ctx) => {
  try {
    ctx.user = await requireOwner();
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 20), 1000);
    return Response.json(await activity(windowFromParams(url), {
      event: asString(url.searchParams.get("event"), 80) || null,
      q: asString(url.searchParams.get("q"), 120) || null,
      limit
    }));
  } catch (error) {
    return errorResponse(error, "Could not load the activity log");
  }
});
