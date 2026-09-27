// Errors the API is willing to show people. Anything else (database failures, bugs) is logged on the
// server and the client gets a generic message, so internals never leak into a response body.
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function fail(message: string, status = 400): never {
  throw new AppError(message, status);
}

export function asString(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

// Accepts a real boolean or the "true"/"false" strings a form posts; anything else is null ("not sent").
export function asBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function requireString(value: unknown, name: string, max = 500) {
  const next = asString(value, max);
  if (!next) fail(`${name} is required`);
  return next;
}

export function validateEmail(value: unknown) {
  const email = requireString(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid email address");
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
    fail("Password needs at least 8 characters, a number, and a special character");
  }
  return password;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

// Every route's catch block. AppErrors carry their own status and message; a malformed JSON body is the
// caller's fault; everything else is a server problem and only the fallback text goes out.
export function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AppError) return jsonError(error.message, error.status);
  if (error instanceof SyntaxError) return jsonError("The request body was not valid JSON", 400);
  console.error(fallback, error);
  return jsonError(fallback, 500);
}

// The login form has a hidden "website" field. People never see it; bots fill every field.
export function honeypotTripped(body: any) {
  return typeof body?.website === "string" && body.website.trim() !== "";
}
