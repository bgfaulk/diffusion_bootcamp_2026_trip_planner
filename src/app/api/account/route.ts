import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { jsonError } from "@/lib/validation";

export async function DELETE() {
  try {
    const user = await requireUser();
    await getSql()`DELETE FROM users WHERE id = ${user.id}`;
    const jar = await cookies();
    jar.delete("trip_session");
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not delete account", 400);
  }
}
