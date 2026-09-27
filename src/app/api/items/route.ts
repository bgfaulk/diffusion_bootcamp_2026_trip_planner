import { requireUser } from "@/lib/auth";
import { decryptText, encryptText } from "@/lib/crypto";
import { getSql, pageKeys } from "@/lib/db";
import { asString, jsonError, requireString } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const page = asString(body.page, 40);
    if (!pageKeys.has(page as any)) throw new Error("Invalid page");
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
    return jsonError(error instanceof Error ? error.message : "Could not add item", 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const id = requireString(body.id, "Item id", 80);
    const checked = Boolean(body.checked);
    const sql = getSql();
    const rows = await sql`SELECT page FROM list_items WHERE id = ${id} AND user_id = ${user.id}`;
    if (!rows.length) throw new Error("Item not found");
    const next = await sql`SELECT COALESCE(MAX(position), 0)::int + 1 AS next FROM list_items WHERE user_id = ${user.id} AND page = ${rows[0].page}`;
    await sql`UPDATE list_items SET checked = ${checked}, position = ${Number(next[0].next)}, updated_at = now() WHERE id = ${id} AND user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update item", 400);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const id = requireString(body.id, "Item id", 80);
    await getSql()`DELETE FROM list_items WHERE id = ${id} AND user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not delete item", 400);
  }
}
