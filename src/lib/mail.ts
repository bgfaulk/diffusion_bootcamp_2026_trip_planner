import nodemailer from "nodemailer";
import { primaryOwnerEmail } from "./reset";

// Outbound mail through the organizer's Gmail account: the first OWNER_EMAIL plus a Google "app password"
// (GMAIL_APP_PASSWORD). Nothing else to set up. Without the password, production reports mail as
// unavailable and development prints the message to the server log so the flow can still be exercised.

export function mailConfigured() {
  return Boolean(primaryOwnerEmail() && process.env.GMAIL_APP_PASSWORD?.trim());
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<"sent" | "logged" | "unavailable"> {
  const user = primaryOwnerEmail();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim().replace(/\s+/g, ""); // Google shows app passwords with spaces
  if (!user || !pass) {
    if (process.env.NODE_ENV === "production") return "unavailable";
    console.log(`[mail not configured] To: ${to}\nSubject: ${subject}\n\n${text}`);
    return "logged";
  }
  const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  await transport.sendMail({ from: `"Trip Planner" <${user}>`, to, subject, text, html });
  return "sent";
}

const letters: [string, string][] = [["A", "#fcb711"], ["B", "#f37021"], ["C", "#0089d0"]];

// The password reset email. Plain text carries the same link for clients that strip HTML.
export function resetEmail(link: string, expiresAt: string) {
  const expires = new Date(expiresAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) + " Pacific";
  const text = `Someone asked to reset the password for your Trip Planner account.

Set a new password here (the link works once and expires ${expires}):
${link}

If you didn't ask for this, you can ignore this email; your password stays the same.`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f1e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d2528">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #d8d1bf;border-radius:10px;overflow:hidden">
<tr><td style="background:#060a12;padding:22px;text-align:center;font-size:34px;font-weight:900;letter-spacing:6px">${letters.map(([l, c]) => `<span style="color:${c}">${l}</span>`).join("")}</td></tr>
<tr><td style="padding:26px 28px 8px"><p style="margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#115e59">Diffusion Bootcamp Trip Planner</p>
<h1 style="margin:0 0 14px;font-size:22px">Reset your password</h1>
<p style="margin:0 0 18px;line-height:1.5">Someone asked to reset the password for your Trip Planner account. If that was you, set a new password with the button below.</p>
<p style="margin:0 0 18px"><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;font-weight:800;border-radius:7px">Set a new password</a></p>
<p style="margin:0 0 18px;font-size:13px;color:#627174;line-height:1.5">The link works once and expires ${expires}. If the button doesn't work, copy this address into your browser:<br><a href="${link}" style="color:#115e59;word-break:break-all">${link}</a></p>
<p style="margin:0 0 20px;font-size:13px;color:#627174;line-height:1.5">If you didn't ask for this, ignore this email; your password stays the same.</p></td></tr>
</table></body></html>`;
  return { subject: "Reset your Trip Planner password", text, html };
}

// The public address people should open links on: the request's own origin (Vercel sets the proto header).
export function appOrigin(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  return `${proto}://${host}`;
}
