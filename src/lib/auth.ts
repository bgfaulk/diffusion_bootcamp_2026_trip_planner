import { cookies } from "next/headers";
import crypto from "node:crypto";
import { sessionSecret as secret } from "./crypto";
import { ensureSchema, getSql, seedStarterItems } from "./db";
import { AppError, validateEmail, validatePassword } from "./validation";

const cookieName = "trip_session";

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string) {
  const candidate = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

function hashToken(token: string) {
  return crypto.createHmac("sha256", secret()).update(token).digest("hex");
}

export async function emailExists(emailValue: unknown) {
  await ensureSchema();
  const email = validateEmail(emailValue);
  const rows = await getSql()`SELECT 1 FROM users WHERE email = ${email}`;
  return rows.length > 0;
}

export type AuthIntent = "signin" | "create" | "reset";

export async function createOrLogin(emailValue: unknown, passwordValue: unknown, intent: AuthIntent) {
  await ensureSchema();
  const sql = getSql();
  const email = validateEmail(emailValue);
  const password = validatePassword(passwordValue, intent !== "signin");
  const users = await sql`SELECT * FROM users WHERE email = ${email}`;
  let userId: string;
  if (intent === "create" && users.length) throw new AppError("An account already exists for this email. Sign in instead.");
  if (intent !== "create" && !users.length) throw new AppError("No account found for this email", 401);
  if (!users.length) {
    const { salt, hash } = hashPassword(password);
    const inserted = await sql`INSERT INTO users (email, password_hash, password_salt) VALUES (${email}, ${hash}, ${salt}) RETURNING id`;
    userId = String(inserted[0].id);
    await seedStarterItems(userId);
  } else {
    const user = users[0] as { id: string; password_hash: string; password_salt: string };
    if (intent === "reset") {
      const { salt, hash } = hashPassword(password);
      await sql`UPDATE users SET password_hash = ${hash}, password_salt = ${salt}, updated_at = now() WHERE id = ${user.id}`;
    } else if (!verifyPassword(password, user.password_salt, user.password_hash)) {
      throw new AppError("Email or password did not match", 401);
    }
    userId = user.id;
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${tokenHash}, ${userId}, now() + interval '7 days')`;
  const jar = await cookies();
  jar.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return { userId, email };
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
  return rows[0] ? { id: String(rows[0].id), email: String(rows[0].email) } : null;
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
