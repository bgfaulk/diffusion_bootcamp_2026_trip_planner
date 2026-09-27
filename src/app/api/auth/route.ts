import { createOrLogin, getUser, logout } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { clientIp, enforceLimit } from "@/lib/rate-limit";
import { asString, errorResponse, honeypotTripped, jsonError } from "@/lib/validation";

export const POST = withAudit("auth.signin", async (request, ctx) => {
  try {
    const body = await request.json();
    if (honeypotTripped(body)) return jsonError("Could not sign in", 400);
    // Accounts used to be created here with a password in the body. A tab from before the emailed sign-up link
    // still sends that shape; tell it to reload rather than treating it as a sign-in.
    if (body.intent === "create") return jsonError("Creating an account has changed. Reload the page and try again.", 409);
    const intent = body.intent === "activate" || body.intent === "reset" ? body.intent : "signin";
    ctx.event = `auth.${intent}`; ctx.user = null; ctx.target = asString(body.email, 254).toLowerCase() || undefined;
    // Per address and per account, so one attacker can't hammer a single email from many places or many emails from one.
    enforceLimit(`auth:ip:${clientIp(request)}`, 30, 15 * 60 * 1000);
    enforceLimit(`auth:email:${asString(body.email, 254).toLowerCase()}`, 10, 15 * 60 * 1000);
    const user = await createOrLogin(body.email, body.password, intent, body.token);
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
