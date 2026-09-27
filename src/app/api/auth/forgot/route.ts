import { withAudit } from "@/lib/audit";
import { ensureSchema, getSql } from "@/lib/db";
import { appOrigin, mailConfigured, resetEmail, sendMail } from "@/lib/mail";
import { clientIp, enforceLimit } from "@/lib/rate-limit";
import { createResetToken } from "@/lib/reset";
import { errorResponse, fail, honeypotTripped, jsonError, validateEmail } from "@/lib/validation";

// Self-service reset: emails a single-use link through the organizer's Gmail. The answer is the same
// whether or not the email has an account, so this can't be used to find out who is registered.
export const POST = withAudit("auth.forgot", async (request, ctx) => {
  try {
    const body = await request.json();
    if (honeypotTripped(body)) return jsonError("Could not send a reset link", 400);
    const email = ctx.target = validateEmail(body.email);
    ctx.user = null;
    if (process.env.NODE_ENV === "production" && !mailConfigured()) fail("Email reset isn't set up yet. Ask the trip organizer for a reset link.", 503);
    enforceLimit(`forgot:ip:${clientIp(request)}`, 10, 15 * 60 * 1000);
    enforceLimit(`forgot:email:${email}`, 3, 15 * 60 * 1000);
    await ensureSchema();
    const rows = await getSql()`SELECT password_hash, suspended_at FROM users WHERE email = ${email}`;
    if (!rows.length) ctx.detail = "no account";
    else if (rows[0].suspended_at) ctx.detail = "suspended";
    else {
      const { token, expiresAt } = createResetToken(email, String(rows[0].password_hash));
      const mail = resetEmail(`${appOrigin(request)}/?reset=${token}`, expiresAt);
      ctx.detail = await sendMail(email, mail.subject, mail.text, mail.html);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not send a reset link");
  }
});
