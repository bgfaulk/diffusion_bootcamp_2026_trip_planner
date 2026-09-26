export function asString(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function requireString(value: unknown, name: string, max = 500) {
  const next = asString(value, max);
  if (!next) throw new Error(`${name} is required`);
  return next;
}

export function validateEmail(value: unknown) {
  const email = requireString(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  return email;
}

export function validatePassword(value: unknown) {
  const password = requireString(value, "Password", 128);
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  return password;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function parseNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}
