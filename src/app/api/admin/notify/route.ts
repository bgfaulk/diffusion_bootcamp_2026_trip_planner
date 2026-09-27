import { requireOwner } from "@/lib/admin";
import { withAudit } from "@/lib/audit";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { asString, errorResponse, requireString } from "@/lib/validation";

// The organizer sends one notice to every active account. It shows up in each person's Notifications.
export const POST = withAudit("admin.notify", async (request, ctx) => {
  try {
    ctx.user = await requireOwner();
    const body = await request.json();
    const title = encryptText(requireString(body.title, "Title", 120));
    const message = encryptText(asString(body.body, 2000));
    const sql = getSql();
    const users = await sql`SELECT id FROM users WHERE suspended_at IS NULL`;
    for (const row of users) {
      await sql`INSERT INTO notifications (user_id, title, body) VALUES (${row.id}, ${title}, ${message})`;
    }
    ctx.detail = `${users.length} accounts`;
    return Response.json({ sent: users.length });
  } catch (error) {
    return errorResponse(error, "Could not send the notice");
  }
});
