import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { decryptText, encryptText } from "@/lib/crypto";
import { getSql, pageKeys } from "@/lib/db";
import { CUSTOM_LIMIT } from "@/lib/stars-rules";
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
    // Only the first five items a person ever adds count for stars (lib/stars.ts). The lifetime counter
    // decides, never the request body, so deleting and re-adding can't mint new counted items.
    const counter = await sql`UPDATE users SET custom_items_created = custom_items_created + 1 WHERE id = ${user.id} RETURNING custom_items_created`;
    const source = Number(counter[0]?.custom_items_created || 0) <= CUSTOM_LIMIT ? "custom" : "extra";
    const item = await sql`
      INSERT INTO list_items (user_id, page, title, position, source)
      VALUES (${user.id}, ${page}, ${title}, ${Number(positionRows[0].next)}, ${source})
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
    // Only the flag changes. Position stays put, so an item unchecked later returns to the spot it held in the list;
    // the bootstrap query orders by checked first and position second, which is what groups done items at the bottom.
    const rows = await sql`UPDATE list_items SET checked = ${checked}, updated_at = now() WHERE id = ${id} AND user_id = ${user.id} RETURNING id`;
    if (!rows.length) fail("Item not found", 404);
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
