import crypto from "node:crypto";
import { sessionSecret } from "./crypto";

// Password reset links. The organizer (OWNER_EMAIL) creates one for an attendee from Settings and sends
// it however they like; there is no email provider. A link is a signed {email, exp} payload. The current
// password hash is folded into the signature (not the payload), so the link stops working the moment
// the password changes: each link is single-use without a table to track it.
const TTL_MS = 24 * 60 * 60 * 1000;

function sign(payload: string, passwordHash: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(`reset:${payload}:${passwordHash}`).digest("base64url");
}

export function createResetToken(email: string, passwordHash: string) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + TTL_MS })).toString("base64url");
  return { token: `${payload}.${sign(payload, passwordHash)}`, expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
}

// The email inside a token, before anything is verified (used to look the account up and prefill the form).
export function resetTokenEmail(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 600) return null;
  try {
    const parsed = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    return typeof parsed?.email === "string" ? parsed.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function verifyResetToken(token: string, email: string, passwordHash: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload, passwordHash);
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed?.email === email && typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

// OWNER_EMAIL is one address or a comma-separated list. Every listed account gets the Organizer page; the
// first one is the organizer proper: it sends mail, receives alerts and bug reports, and gets in-app notices.
export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAIL ?? "").split(/[,\s]+/).map(value => value.trim()).filter(Boolean);
}

export function primaryOwnerEmail(): string | null {
  return ownerEmails()[0] ?? null;
}

export function isOwner(email: string) {
  const wanted = email.trim().toLowerCase();
  return Boolean(wanted) && ownerEmails().some(owner => owner.toLowerCase() === wanted);
}
