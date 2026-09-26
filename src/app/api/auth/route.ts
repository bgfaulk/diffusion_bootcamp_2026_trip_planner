import { createOrLogin, logout } from "@/lib/auth";
import { jsonError } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await createOrLogin(body.email, body.password, Boolean(body.resetPassword));
    return Response.json({ user });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not sign in", 401);
  }
}

export async function DELETE() {
  await logout();
  return Response.json({ ok: true });
}
