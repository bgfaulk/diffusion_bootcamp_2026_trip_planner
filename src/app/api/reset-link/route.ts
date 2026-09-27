import { withAudit } from "@/lib/audit";
import { getSql } from "@/lib/db";
import { appOrigin, mailConfigured, resetEmail, sendMail } from "@/lib/mail";
import { createResetToken, isOwner } from "@/lib/reset";
import { errorResponse, fail, validateEmail } from "@/lib/validation";
import { requireUser } from "@/lib/auth";

// Organizer only: mint a 24-hour, single-use password reset link for an attendee, and email it to them
// when `send` is set and Gmail is configured.
export const POST = withAudit("admin.reset_link", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    if (!isOwner(user.email)) fail("Only the trip organizer can create reset links", 403);
    const body = await request.json();
    const email = ctx.target = validateEmail(body.email);
    const rows = await getSql()`SELECT password_hash FROM users WHERE email = ${email}`;
    if (!rows.length) fail("No account uses that email", 404);
    const { token, expiresAt } = createResetToken(email, String(rows[0].password_hash));
    let sent = false;
    if (body.send) {
      if (process.env.NODE_ENV === "production" && !mailConfigured()) fail("Email isn't set up. Add GMAIL_APP_PASSWORD to send links from here.", 503);
      const mail = resetEmail(`${appOrigin(request)}/?reset=${token}`, expiresAt);
      ctx.detail = await sendMail(email, mail.subject, mail.text, mail.html);
      sent = ctx.detail !== "unavailable";
    }
    return Response.json({ token, expiresAt, sent });
  } catch (error) {
    return errorResponse(error, "Could not create a reset link");
  }
});
