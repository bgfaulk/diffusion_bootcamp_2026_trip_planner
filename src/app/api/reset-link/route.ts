import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { createResetToken, isOwner } from "@/lib/reset";
import { errorResponse, fail, validateEmail } from "@/lib/validation";

// Organizer only: mint a 24-hour, single-use password reset link for an attendee.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isOwner(user.email)) fail("Only the trip organizer can create reset links", 403);
    const body = await request.json();
    const email = validateEmail(body.email);
    const rows = await getSql()`SELECT password_hash FROM users WHERE email = ${email}`;
    if (!rows.length) fail("No account uses that email", 404);
    const { token, expiresAt } = createResetToken(email, String(rows[0].password_hash));
    return Response.json({ token, expiresAt });
  } catch (error) {
    return errorResponse(error, "Could not create a reset link");
  }
}
