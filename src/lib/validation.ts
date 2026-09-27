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

// Shared with the login form so the live checklist and the server agree on the rules.
export function passwordChecks(password: string) {
  return [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "At least one number", ok: /\d/.test(password) },
    { label: "At least one special character", ok: /[^A-Za-z0-9]/.test(password) }
  ];
}

// New and reset passwords must meet every rule; sign-in only needs a non-empty password so
// accounts created before these rules still work.
export function validatePassword(value: unknown, enforceRules = true) {
  const password = requireString(value, "Password", 128);
  if (enforceRules && passwordChecks(password).some(check => !check.ok)) {
    throw new Error("Password needs at least 8 characters, a number, and a special character");
  }
  return password;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function parseNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

// The login form has a hidden "website" field. People never see it; bots fill every field.
export function honeypotTripped(body: any) {
  return typeof body?.website === "string" && body.website.trim() !== "";
}
