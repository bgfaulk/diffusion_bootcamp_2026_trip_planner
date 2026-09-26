import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { asString, jsonError, requireString } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const label = requireString(form.get("label"), "Document label", 120);
    const file = form.get("document");
    if (!(file instanceof File)) throw new Error("Choose a PDF");
    if (file.type !== "application/pdf") throw new Error("Insurance documents must be PDFs");
    if (file.size > 10 * 1024 * 1024) throw new Error("PDF must be under 10 MB");
    const fileName = asString(file.name, 180) || "insurance-document.pdf";
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await getSql()`
      INSERT INTO trip_documents (user_id, label, file_name, content_type, file_base64)
      VALUES (${user.id}, ${label}, ${fileName}, ${file.type}, ${buffer.toString("base64")})
      RETURNING id
    `;
    return Response.json({ id: rows[0].id });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save PDF", 400);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const id = requireString(body.id, "Document id", 80);
    await getSql()`DELETE FROM trip_documents WHERE id = ${id} AND user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not delete PDF", 400);
  }
}
