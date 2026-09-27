import { overview, requireOwner, windowFromParams } from "@/lib/admin";
import { withAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/validation";

export const GET = withAudit("admin.overview", async (request, ctx) => {
  try {
    ctx.user = await requireOwner();
    return Response.json(await overview(windowFromParams(new URL(request.url))));
  } catch (error) {
    return errorResponse(error, "Could not load the overview");
  }
});
