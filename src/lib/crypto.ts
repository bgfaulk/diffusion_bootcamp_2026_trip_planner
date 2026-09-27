import crypto from "node:crypto";

const prefix = "enc:v1:";
const devSecret = "development-only-session-secret";

// Sessions and the at-rest encryption key both derive from SESSION_SECRET, so a production deploy
// without it must fail loudly rather than run on the well-known development value.
export function sessionSecret() {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || value === "\"\"" || value === "''") {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not configured");
    return devSecret;
  }
  return value;
}

// The key is a hash of the secret; derive it once per secret instead of on every field.
let cached: { secret: string; key: Buffer } | null = null;
function key() {
  const secret = sessionSecret();
  if (!cached || cached.secret !== secret) cached = { secret, key: crypto.createHash("sha256").update(secret).digest() };
  return cached.key;
}

export function encryptText(value: string | null | undefined) {
  if (!value) return "";
  if (value.startsWith(prefix)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${prefix}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptText(value: unknown) {
  if (typeof value !== "string" || !value.startsWith(prefix)) return typeof value === "string" ? value : "";
  const [, , ivValue, tagValue, encryptedValue] = value.split(":");
  if (!ivValue || !tagValue || !encryptedValue) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function decryptRow<T extends Record<string, any>>(row: T, fields: string[]) {
  const next: Record<string, any> = { ...row };
  for (const field of fields) next[field] = decryptText(row[field]);
  return next as T;
}
