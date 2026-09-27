import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { photoSpotIds } from "@/lib/photo-spots";
import { asString, errorResponse, fail } from "@/lib/validation";

export const POST = withAudit("photos.add", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const form = await request.formData();
    const spot = asString(form.get("spot"), 80);
    ctx.target = spot;
    if (!photoSpotIds.has(spot)) fail("Choose a stop on the photo route");
    const caption = encryptText(asString(form.get("caption"), 240));
    const file = form.get("photo");
    if (!(file instanceof File) || !file.type.startsWith("image/")) fail("Choose an image");
    if (file.size > 5 * 1024 * 1024) fail("Image must be under 5 MB");
    ctx.detail = `${file.type} · ${Math.round(file.size / 1024)} KB`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await getSql()`
      INSERT INTO photos (user_id, spot, caption, content_type, image_base64)
      VALUES (${user.id}, ${spot}, ${caption}, ${file.type}, ${encryptText(buffer.toString("base64"))})
    `;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not save photo");
  }
});
