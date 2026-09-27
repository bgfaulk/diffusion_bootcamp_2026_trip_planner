import { requireUser } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { errorResponse, fail, requireString } from "@/lib/validation";

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
    if (!rows.length) fail("Document not found", 404);
    const document = rows[0] as { file_name: string; content_type: string; file_base64: string };
    const url = new URL(request.url);
    const disposition = url.searchParams.get("download") ? "attachment" : "inline";
    // The header only allows printable ASCII; anything else (quotes, control characters, non-Latin
    // names) would let a stored file name break out of the header value.
    const fileName = decryptText(document.file_name).replace(/[^\x20-\x7e]|["\\]/g, "").trim() || "document.pdf";
    return new Response(Buffer.from(decryptText(document.file_base64), "base64"), {
      headers: {
        "Content-Type": document.content_type,
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return errorResponse(error, "Could not open PDF");
  }
}
