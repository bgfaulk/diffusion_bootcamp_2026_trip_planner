import { createOrLogin, logout } from "@/lib/auth";
import { clientIp, enforceLimit } from "@/lib/rate-limit";
import { asString, errorResponse, honeypotTripped, jsonError } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (honeypotTripped(body)) return jsonError("Could not sign in", 400);
    const intent = body.intent === "create" || body.intent === "reset" ? body.intent : "signin";
    // Per address and per account, so one attacker can't hammer a single email from many places or many emails from one.
    enforceLimit(`auth:ip:${clientIp(request)}`, 30, 15 * 60 * 1000);
    enforceLimit(`auth:email:${asString(body.email, 254).toLowerCase()}`, 10, 15 * 60 * 1000);
    const user = await createOrLogin(body.email, body.password, intent, body.token);
    return Response.json({ user });
  } catch (error) {
    return errorResponse(error, "Could not sign in");
  }
}

export async function DELETE() {
  await logout();
  return Response.json({ ok: true });
}
