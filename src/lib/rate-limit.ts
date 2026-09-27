import { AppError } from "./validation";

// Best-effort sliding window per key, held in memory. On Vercel each warm instance keeps its own
// counters, so this slows an attacker down rather than stopping one cold; combined with PBKDF2 it
// makes brute-forcing a password impractical without any shared store.
const buckets = new Map<string, number[]>();
const MAX_KEYS = 5000;

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded ? forwarded.split(",")[0] : request.headers.get("x-real-ip") || "unknown").trim();
}

// Throws a 429 once `max` hits land on `key` inside `windowMs`.
export function enforceLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter(at => now - at < windowMs);
  if (hits.length >= max) throw new AppError("Too many attempts. Wait a few minutes and try again.", 429);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > MAX_KEYS) {
    for (const [other, times] of buckets) {
      if (times.every(at => now - at >= windowMs)) buckets.delete(other);
      if (buckets.size <= MAX_KEYS / 2) break;
    }
  }
}
