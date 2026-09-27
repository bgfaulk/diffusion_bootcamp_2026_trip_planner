import { requireUser } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { jsonError, requireString } from "@/lib/validation";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: rawId } = await context.params;
    const id = requireString(rawId, "Document id", 80);
    const rows = await getSql()`
      SELECT file_name, content_type, file_base64
      FROM trip_documents
      WHERE id = ${id} AND user_id = ${user.id}
    `;
    if (!rows.length) throw new Error("Document not found");
    const document = rows[0] as { file_name: string; content_type: string; file_base64: string };
    const url = new URL(request.url);
    const disposition = url.searchParams.get("download") ? "attachment" : "inline";
    const fileName = decryptText(document.file_name);
    return new Response(Buffer.from(decryptText(document.file_base64), "base64"), {
      headers: {
        "Content-Type": document.content_type,
        "Content-Disposition": `${disposition}; filename="${fileName.replace(/"/g, "")}"`
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not open PDF", 404);
  }
}
