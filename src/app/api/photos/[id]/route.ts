import { requireUser } from "@/lib/auth";
import { withAudit, withQuiet } from "@/lib/audit";
import { decryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { errorResponse, fail, requireString } from "@/lib/validation";

// Serves one photo's bytes. Bootstrap only hands the browser this URL, so a page load no longer carries
// every image as base64 JSON. A photo row never changes after upload, so the browser may cache it for good.
export const GET = withQuiet<{ params: Promise<{ id: string }> }>("photos.view", async (_request, ctx, context) => {
  try {
    const user = ctx.user = await requireUser();
    const { id: rawId } = await context.params;
    const id = ctx.target = requireString(rawId, "Photo id", 80);
    const rows = await getSql()`SELECT content_type, image_base64 FROM photos WHERE id = ${id} AND user_id = ${user.id}`;
    if (!rows.length) fail("Photo not found", 404);
    const photo = rows[0] as { content_type: string; image_base64: string };
    return new Response(Buffer.from(decryptText(photo.image_base64), "base64"), {
      headers: {
        "Content-Type": photo.content_type,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return errorResponse(error, "Could not load photo");
  }
});

export const DELETE = withAudit<{ params: Promise<{ id: string }> }>("photos.delete", async (_request, ctx, context) => {
  try {
    const user = ctx.user = await requireUser();
    const { id: rawId } = await context.params;
    const id = ctx.target = requireString(rawId, "Photo id", 80);
    const rows = await getSql()`DELETE FROM photos WHERE id = ${id} AND user_id = ${user.id} RETURNING id`;
    if (!rows.length) fail("Photo not found", 404);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete photo");
  }
});
