import { requireUser } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { asString, errorResponse } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const instructions = encryptText(asString(body.instructions, 8000));
    const response = encryptText(asString(body.response, 20000));
    await getSql()`
      INSERT INTO trip_import (user_id, instructions, response, updated_at)
      VALUES (${user.id}, ${instructions}, ${response}, now())
      ON CONFLICT(user_id) DO UPDATE SET
        instructions = excluded.instructions,
        response = excluded.response,
        updated_at = now()
    `;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not save import draft");
  }
}
