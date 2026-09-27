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
const peacock = ["#fcb711", "#f37021", "#cc004c", "#6460aa", "#0089d0", "#0db14b"];

function whenPacific(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) + " Pacific";
}

// The one email layout: the ABC FITNESS mark on the loader's dark stage, a heading, a paragraph or two, one
// button, the same link spelled out for clients that don't render buttons, and a quiet footer. Plain text
// carries the same content for clients that strip HTML.
function brandedEmail({ subject, heading, paragraphs, button, link, expiresAt, footer }: { subject: string; heading: string; paragraphs: string[]; button: string; link: string; expiresAt: string; footer: string }) {
  const expires = whenPacific(expiresAt);
  const text = `${paragraphs.join("\n\n")}

${button} (the link works once and expires ${expires}):
${link}

${footer}`;
  const mark = `<div style="font-size:34px;font-weight:900;letter-spacing:6px;line-height:1">${letters.map(([l, c]) => `<span style="color:${c}">${l}</span>`).join("")}</div>`
    + `<div style="margin-top:6px;font-size:11px;font-weight:900;letter-spacing:5px;line-height:1">${"FITNESS".split("").map((l, i) => `<span style="color:${peacock[Math.min(i, peacock.length - 1)]}">${l}</span>`).join("")}</div>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f1e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d2528">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #d8d1bf;border-radius:10px;overflow:hidden">
<tr><td style="background:#060a12;padding:22px;text-align:center">${mark}</td></tr>
<tr><td style="padding:26px 28px 8px"><p style="margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#115e59">Diffusion Bootcamp Trip Planner</p>
<h1 style="margin:0 0 14px;font-size:22px">${heading}</h1>
${paragraphs.map(p => `<p style="margin:0 0 18px;line-height:1.5">${p}</p>`).join("\n")}
<p style="margin:0 0 18px"><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;font-weight:800;border-radius:7px">${button}</a></p>
<p style="margin:0 0 18px;font-size:13px;color:#627174;line-height:1.5">The link works once and expires ${expires}. If the button doesn't work, copy this address into your browser:<br><a href="${link}" style="color:#115e59;word-break:break-all">${link}</a></p>
<p style="margin:0 0 20px;font-size:13px;color:#627174;line-height:1.5">${footer}</p></td></tr>
</table></body></html>`;
  return { subject, text, html };
}

// The password reset email ("Forgot your password?" and the organizer's reset links).
export function resetEmail(link: string, expiresAt: string) {
  return brandedEmail({
    subject: "Reset your Trip Planner password",
    heading: "Reset your password",
    paragraphs: ["Someone asked to reset the password for your Trip Planner account. If that was you, set a new password with the button below."],
    button: "Set a new password",
    link,
    expiresAt,
    footer: "If you didn't ask for this, ignore this email; your password stays the same."
  });
}

// Sent when someone creates an account: the link finishes sign-up by choosing a password, so an account
// can only be made by whoever reads the inbox.
export function welcomeEmail(link: string, expiresAt: string) {
  return brandedEmail({
    subject: "Finish setting up your Trip Planner account",
    heading: "Welcome to the trip",
    paragraphs: ["You're one step from your Diffusion Bootcamp Trip Planner account. Choose a password with the button below and you'll land straight on your planner."],
    button: "Choose a password",
    link,
    expiresAt,
    footer: "If you didn't sign up for the Trip Planner, ignore this email and no account will be created."
  });
}

// Sent instead of the welcome email when the address already has an account, so the sign-up form can answer
// the same way either time and nobody learns who is registered from it.
export function existingAccountEmail(link: string, expiresAt: string) {
  return brandedEmail({
    subject: "You already have a Trip Planner account",
    heading: "You're already signed up",
    paragraphs: ["Someone tried to create a Trip Planner account with this email, but one already exists. Just sign in with your usual password. If you've forgotten it, the button below sets a new one."],
    button: "Set a new password",
    link,
    expiresAt,
    footer: "If this wasn't you, ignore this email; your account and password stay the same."
  });
}

// The public address people should open links on: the request's own origin (Vercel sets the proto header).
export function appOrigin(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  return `${proto}://${host}`;
}
