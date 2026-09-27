import { cookies } from "next/headers";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { sessionSecret as secret } from "./crypto";
import { ensureSchema, getSql, seedStarterItems } from "./db";
import { isOwner, resetTokenEmail, verifyResetToken } from "./reset";
import { AppError, asString, validateEmail, validatePassword } from "./validation";

const cookieName = "trip_session";
const pbkdf2 = promisify(crypto.pbkdf2);

// PBKDF2 takes ~100 ms on purpose; running it on the thread pool keeps that from stalling every other
// request on the instance while someone signs in.
export async function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = (await pbkdf2(password, salt, 120000, 32, "sha256")).toString("hex");
  return { salt, hash };
}

export async function verifyPassword(password: string, salt: string, hash: string) {
  const candidate = (await hashPassword(password, salt)).hash;
  const expected = Buffer.from(hash, "hex");
  return candidate.length === hash.length && crypto.timingSafeEqual(Buffer.from(candidate, "hex"), expected);
}

function hashToken(token: string) {
  return crypto.createHmac("sha256", secret()).update(token).digest("hex");
}

export type AuthIntent = "signin" | "create" | "reset";

const badLink = "This reset link is invalid or has expired. Ask the trip organizer for a new one.";
const mismatch = "Email or password did not match";
// Salt for the PBKDF2 run a sign-in does when no account exists, so a missing email costs the same time as
// a wrong password and neither the message nor the timing says which one it was.
const dummySalt = "00000000000000000000000000000000";

// New accounts need the invite code the organizer shares with attendees (SIGNUP_CODE). Without it, creation
// is refused in production and allowed in development so a fresh checkout still works.
let signupWarned = false;
function requireInviteCode(codeValue: unknown) {
  const expected = process.env.SIGNUP_CODE?.trim() || "";
  if (!expected) {
    if (process.env.NODE_ENV === "production") throw new AppError("Account creation is not set up yet", 503);
    if (!signupWarned) { signupWarned = true; console.warn("SIGNUP_CODE is not set; allowing account creation because this is not production."); }
    return;
  }
  const given = Buffer.from(asString(codeValue, 200));
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) throw new AppError("That invite code is not right", 403);
}

// A reset never trusts the email in the request body: the account comes from the signed link, and the
// link only verifies against the account's current password hash, so it works exactly once.
export async function createOrLogin(emailValue: unknown, passwordValue: unknown, intent: AuthIntent, resetToken?: unknown, inviteCode?: unknown) {
  await ensureSchema();
  const sql = getSql();
  const email = intent === "reset" ? resetTokenEmail(resetToken) ?? "" : validateEmail(emailValue);
  if (intent === "reset" && !email) throw new AppError(badLink, 401);
  const password = validatePassword(passwordValue, intent !== "signin");
  if (intent === "create") requireInviteCode(inviteCode);
  const users = await sql`SELECT * FROM users WHERE email = ${email}`;
  let userId: string;
  if (intent === "create" && users.length) throw new AppError("An account already exists for this email. Sign in instead.");
  if (intent === "reset" && !users.length) throw new AppError(badLink, 401);
  if (intent === "signin" && !users.length) {
    await hashPassword(password, dummySalt);
    throw new AppError(mismatch, 401);
  }
  if (!users.length) {
    const { salt, hash } = await hashPassword(password);
    const inserted = await sql`INSERT INTO users (email, password_hash, password_salt) VALUES (${email}, ${hash}, ${salt}) RETURNING id`;
    userId = String(inserted[0].id);
    await seedStarterItems(userId);
  } else {
    const user = users[0] as { id: string; password_hash: string; password_salt: string };
    if (intent === "reset") {
      if (!verifyResetToken(String(resetToken), email, user.password_hash)) throw new AppError(badLink, 401);
      const { salt, hash } = await hashPassword(password);
      await sql`UPDATE users SET password_hash = ${hash}, password_salt = ${salt}, updated_at = now() WHERE id = ${user.id}`;
      // Whoever held the old password loses every session they had.
      await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;
    } else if (!(await verifyPassword(password, user.password_salt, user.password_hash))) {
      throw new AppError(mismatch, 401);
    }
    userId = user.id;
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  // Sign-in is rare enough to double as the moment expired sessions get swept out.
  await sql`DELETE FROM sessions WHERE expires_at < now()`;
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${tokenHash}, ${userId}, now() + interval '7 days')`;
  const jar = await cookies();
  jar.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return { userId, email, owner: isOwner(email) };
}

export async function getUser() {
  await ensureSchema();
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;
  const sql = getSql();
  const tokenHash = hashToken(token);
  const rows = await sql`
    SELECT users.id, users.email
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ${tokenHash} AND sessions.expires_at > now()
  `;
  return rows[0] ? { id: String(rows[0].id), email: String(rows[0].email), owner: isOwner(String(rows[0].email)) } : null;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new AppError("Not authenticated", 401);
  return user;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) {
    await ensureSchema();
    await getSql()`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  }
  jar.delete(cookieName);
}
