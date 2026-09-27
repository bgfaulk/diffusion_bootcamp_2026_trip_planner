import { cookies } from "next/headers";
import { withAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { errorResponse } from "@/lib/validation";

export const DELETE = withAudit("account.delete", async (_request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    ctx.target = user.email;
    await getSql()`DELETE FROM users WHERE id = ${user.id}`;
    const jar = await cookies();
    jar.delete("trip_session");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete account");
  }
});
