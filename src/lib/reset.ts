import crypto from "node:crypto";
import { sessionSecret } from "./crypto";

// Signed links that stand in for a password. Two kinds share one shape, a signed {email, exp} payload:
//
// - Reset links ("reset"): "Forgot your password?" emails one, and the organizer can mint one from the
//   Organizer page. The current password hash is folded into the signature (not the payload), so the link
//   stops working the moment the password changes: single-use without a table to track it.
// - Sign-up links ("signup"): creating an account emails one to the address given, so an account can only
//   be made by whoever reads that inbox. It verifies against a fixed marker instead of a hash and is refused
//   once the account exists, so it too works once.
const TTL_MS = 24 * 60 * 60 * 1000;
const signupMarker = "new-account";

function sign(kind: "reset" | "signup", payload: string, secretPart: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(`${kind}:${payload}:${secretPart}`).digest("base64url");
}

function createToken(kind: "reset" | "signup", email: string, secretPart: string) {
  const exp = Date.now() + TTL_MS;
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString("base64url");
  return { token: `${payload}.${sign(kind, payload, secretPart)}`, expiresAt: new Date(exp).toISOString() };
}

export function createResetToken(email: string, passwordHash: string) {
  return createToken("reset", email, passwordHash);
}

export function createSignupToken(email: string) {
  return createToken("signup", email, signupMarker);
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

function verifyToken(kind: "reset" | "signup", token: string, email: string, secretPart: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(kind, payload, secretPart);
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed?.email === email && typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export function verifyResetToken(token: string, email: string, passwordHash: string) {
  return verifyToken("reset", token, email, passwordHash);
}

export function verifySignupToken(token: string, email: string) {
  return verifyToken("signup", token, email, signupMarker);
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
