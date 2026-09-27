import { createOrLogin, logout } from "@/lib/auth";
import { honeypotTripped, jsonError } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (honeypotTripped(body)) return jsonError("Could not sign in", 400);
    const intent = body.intent === "create" || body.intent === "reset" ? body.intent : "signin";
    const user = await createOrLogin(body.email, body.password, intent);
    return Response.json({ user });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not sign in", 401);
  }
}

export async function DELETE() {
  await logout();
  return Response.json({ ok: true });
}
