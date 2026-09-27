import { requireUser } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { asString, errorResponse, fail } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const spot = asString(form.get("spot"), 80);
    const caption = encryptText(asString(form.get("caption"), 240));
    const file = form.get("photo");
    if (!(file instanceof File) || !file.type.startsWith("image/")) fail("Choose an image");
    if (file.size > 5 * 1024 * 1024) fail("Image must be under 5 MB");
    const buffer = Buffer.from(await file.arrayBuffer());
    await getSql()`
      INSERT INTO photos (user_id, spot, caption, content_type, image_base64)
      VALUES (${user.id}, ${spot}, ${caption}, ${file.type}, ${encryptText(buffer.toString("base64"))})
    `;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not save photo");
  }
}
