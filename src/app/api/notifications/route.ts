import { requireUser } from "@/lib/auth";
import { withQuiet, withTraffic } from "@/lib/audit";
import { decryptRow } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { errorResponse, fail, requireString } from "@/lib/validation";

// A person's in-app notifications: the welcome notice, and notices the organizer sends to everyone.
// Every write answers with the fresh list so the client can replace its copy in one step.

async function listFor(userId: string) {
  const rows = await getSql()`SELECT id, kind, title, body, data, read_at, created_at FROM notifications WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 100`;
  return rows.map((row: any) => decryptRow(row, ["title", "body", "data"]));
}

export const GET = withQuiet("notifications.list", async (_request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    return Response.json({ notifications: await listFor(user.id) });
  } catch (error) {
    return errorResponse(error, "Could not load notifications");
  }
});

// Mark all (or one) as read.
export const PATCH = withTraffic("notifications.read", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const sql = getSql();
    if (body.all === true) {
      await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${user.id} AND read_at IS NULL`;
      ctx.detail = "all";
    } else {
      const id = ctx.target = requireString(body.id, "Notification id", 80);
      await sql`UPDATE notifications SET read_at = now() WHERE id = ${id} AND user_id = ${user.id}`;
    }
    return Response.json({ notifications: await listFor(user.id) });
  } catch (error) {
    return errorResponse(error, "Could not update notifications");
  }
});

// Delete all (or one).
export const DELETE = withTraffic("notifications.delete", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const sql = getSql();
    if (body.all === true) {
      await sql`DELETE FROM notifications WHERE user_id = ${user.id}`;
      ctx.detail = "all";
    } else {
      const id = ctx.target = requireString(body.id, "Notification id", 80);
      const rows = await sql`DELETE FROM notifications WHERE id = ${id} AND user_id = ${user.id} RETURNING id`;
      if (!rows.length) fail("Notification not found", 404);
    }
    return Response.json({ notifications: await listFor(user.id) });
  } catch (error) {
    return errorResponse(error, "Could not delete notifications");
  }
});
