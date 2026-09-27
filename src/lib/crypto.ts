import crypto from "node:crypto";

const prefix = "enc:v1:";

export function sessionSecret() {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || value === "\"\"" || value === "''") return "development-only-session-secret";
  return value;
}

function key() {
  return crypto.createHash("sha256").update(sessionSecret()).digest();
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
