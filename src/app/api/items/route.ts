import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { decryptText, encryptText } from "@/lib/crypto";
import { getSql, pageKeys } from "@/lib/db";
import { asString, errorResponse, fail, requireString } from "@/lib/validation";

export const POST = withAudit("items.add", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const page = asString(body.page, 40);
    if (!pageKeys.has(page as any)) fail("Invalid page");
    const title = encryptText(requireString(body.title, "Item", 180));
    const sql = getSql();
    const positionRows = await sql`SELECT COALESCE(MAX(position), 0)::int + 1 AS next FROM list_items WHERE user_id = ${user.id} AND page = ${page}`;
    const item = await sql`
      INSERT INTO list_items (user_id, page, title, position)
      VALUES (${user.id}, ${page}, ${title}, ${Number(positionRows[0].next)})
      RETURNING *
    `;
    return Response.json({ item: { ...item[0], title: decryptText(item[0].title) } });
  } catch (error) {
    return errorResponse(error, "Could not add item");
  }
});

export const PATCH = withAudit("items.toggle", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const id = requireString(body.id, "Item id", 80);
    const checked = Boolean(body.checked);
    ctx.target = id; ctx.detail = checked ? "checked" : "unchecked";
    const sql = getSql();
    const rows = await sql`SELECT page FROM list_items WHERE id = ${id} AND user_id = ${user.id}`;
    if (!rows.length) fail("Item not found", 404);
    const next = await sql`SELECT COALESCE(MAX(position), 0)::int + 1 AS next FROM list_items WHERE user_id = ${user.id} AND page = ${rows[0].page}`;
    await sql`UPDATE list_items SET checked = ${checked}, position = ${Number(next[0].next)}, updated_at = now() WHERE id = ${id} AND user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not update item");
  }
});

export const DELETE = withAudit("items.delete", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const id = requireString(body.id, "Item id", 80);
    ctx.target = id;
    await getSql()`DELETE FROM list_items WHERE id = ${id} AND user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete item");
  }
});
