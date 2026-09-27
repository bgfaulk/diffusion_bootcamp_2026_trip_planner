import { createOrLogin, getUser, logout } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { clientIp, enforceLimit } from "@/lib/rate-limit";
import { asString, errorResponse, honeypotTripped, jsonError } from "@/lib/validation";

export const POST = withAudit("auth.signin", async (request, ctx) => {
  try {
    const body = await request.json();
    if (honeypotTripped(body)) return jsonError("Could not sign in", 400);
    const intent = body.intent === "create" || body.intent === "reset" ? body.intent : "signin";
    ctx.event = `auth.${intent}`; ctx.user = null; ctx.target = asString(body.email, 254).toLowerCase() || undefined;
    // Per address and per account, so one attacker can't hammer a single email from many places or many emails from one.
    enforceLimit(`auth:ip:${clientIp(request)}`, 30, 15 * 60 * 1000);
    enforceLimit(`auth:email:${asString(body.email, 254).toLowerCase()}`, 10, 15 * 60 * 1000);
    const user = await createOrLogin(body.email, body.password, intent, body.token, body.inviteCode);
    ctx.user = { id: user.userId, email: user.email }; ctx.target = user.email;
    return Response.json({ user });
  } catch (error) {
    return errorResponse(error, "Could not sign in");
  }
});

export const DELETE = withAudit("auth.signout", async (_request, ctx) => {
  ctx.user = await getUser();
  await logout();
  return Response.json({ ok: true });
});
