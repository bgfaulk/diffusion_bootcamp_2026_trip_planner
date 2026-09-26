import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { asString, jsonError } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const spot = asString(form.get("spot"), 80);
    const caption = asString(form.get("caption"), 240);
    const file = form.get("photo");
    if (!(file instanceof File) || !file.type.startsWith("image/")) throw new Error("Choose an image");
    if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB");
    const buffer = Buffer.from(await file.arrayBuffer());
    await getSql()`
      INSERT INTO photos (user_id, spot, caption, content_type, image_base64)
      VALUES (${user.id}, ${spot}, ${caption}, ${file.type}, ${buffer.toString("base64")})
    `;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save photo", 400);
  }
}
