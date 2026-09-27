import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { errorResponse } from "@/lib/validation";

export async function DELETE() {
  try {
    const user = await requireUser();
    await getSql()`DELETE FROM users WHERE id = ${user.id}`;
    const jar = await cookies();
    jar.delete("trip_session");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete account");
  }
}
