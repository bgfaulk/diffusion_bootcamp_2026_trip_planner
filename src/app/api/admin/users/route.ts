import { actOnUser, listUsers, requireOwner, userActions, type UserAction } from "@/lib/admin";
import { withAudit, withQuiet } from "@/lib/audit";
import { errorResponse, fail, requireString } from "@/lib/validation";

export const GET = withQuiet("admin.users", async (_request, ctx) => {
  try {
    ctx.user = await requireOwner();
    return Response.json({ users: await listUsers() });
  } catch (error) {
    return errorResponse(error, "Could not load accounts");
  }
});

export const POST = withAudit("admin.user_action", async (request, ctx) => {
  try {
    const user = ctx.user = await requireOwner();
    const body = await request.json();
    const id = requireString(body.id, "Account id", 80);
    const action = String(body.action) as UserAction;
    if (!userActions.has(action)) fail("Unknown action");
    ctx.event = `admin.${action}`;
    ctx.target = await actOnUser(user.id, id, action);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not update that account");
  }
});
