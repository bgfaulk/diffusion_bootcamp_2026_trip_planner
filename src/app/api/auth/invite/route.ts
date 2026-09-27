import { withAudit } from "@/lib/audit";
import { requireInviteCode } from "@/lib/auth";
import { ensureSchema, getSql } from "@/lib/db";
import { appOrigin, existingAccountEmail, mailConfigured, sendMail, welcomeEmail } from "@/lib/mail";
import { clientIp, enforceLimit } from "@/lib/rate-limit";
import { createResetToken, createSignupToken } from "@/lib/reset";
import { errorResponse, fail, honeypotTripped, jsonError, validateEmail } from "@/lib/validation";

// Step one of creating an account: with the invite code, email the address a single-use link that finishes
// sign-up by choosing a password (/?welcome=<token>, handled by /api/auth with intent "activate"). The
// account only comes into being once someone opens that link, so nobody can register an address they
// can't read. If the address already has an account it gets a "you're already signed up" email with a
// reset link instead, and the answer here is the same either way, so the form can't be used to find out
// who is registered.
export const POST = withAudit("auth.invite", async (request, ctx) => {
  try {
    const body = await request.json();
    if (honeypotTripped(body)) return jsonError("Could not send a sign-up link", 400);
    const email = ctx.target = validateEmail(body.email);
    ctx.user = null;
    requireInviteCode(body.inviteCode);
    if (process.env.NODE_ENV === "production" && !mailConfigured()) fail("Sign-up email isn't set up yet. Ask the trip organizer for help.", 503);
    enforceLimit(`invite:ip:${clientIp(request)}`, 10, 15 * 60 * 1000);
    enforceLimit(`invite:email:${email}`, 3, 15 * 60 * 1000);
    await ensureSchema();
    const rows = await getSql()`SELECT password_hash, suspended_at FROM users WHERE email = ${email}`;
    if (!rows.length) {
      const { token, expiresAt } = createSignupToken(email);
      const mail = welcomeEmail(`${appOrigin(request)}/?welcome=${token}`, expiresAt);
      ctx.detail = `welcome: ${await sendMail(email, mail.subject, mail.text, mail.html)}`;
    } else if (rows[0].suspended_at) {
      ctx.detail = "suspended";
    } else {
      const { token, expiresAt } = createResetToken(email, String(rows[0].password_hash));
      const mail = existingAccountEmail(`${appOrigin(request)}/?reset=${token}`, expiresAt);
      ctx.detail = `existing: ${await sendMail(email, mail.subject, mail.text, mail.html)}`;
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not send a sign-up link");
  }
});
