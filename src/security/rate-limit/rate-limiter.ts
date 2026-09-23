/**
 * Fixed-window rate limiter kept in process memory.
 *
 * Production runs a single app container, so one process sees every request.
 * Counters reset when the container restarts; if the app ever runs on more than
 * one instance this must move to a shared store (Postgres or Redis).
 */
export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Bucket = { count: number; resetAt: number };

const MAX_TRACKED_KEYS = 10_000;

export function createRateLimiter(options: { limit: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>();

  function purgeExpired(now: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    /** Counts one attempt for the key and says whether it is still within the limit. */
    consume(key: string, now = Date.now()): RateLimitResult {
      if (buckets.size > MAX_TRACKED_KEYS) purgeExpired(now);
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
        return { allowed: true };
      }
      bucket.count += 1;
      if (bucket.count > options.limit) {
        return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
      }
      return { allowed: true };
    },
    reset(key: string) {
      buckets.delete(key);
    },
  };
}

const MINUTE = 60_000;

/** Limits per flow. Keys combine the flow with the client IP, or with the user or email. */
export const rateLimits = {
  login: createRateLimiter({ limit: 10, windowMs: 15 * MINUTE }),
  passwordResetByIp: createRateLimiter({ limit: 10, windowMs: 60 * MINUTE }),
  passwordResetByEmail: createRateLimiter({ limit: 3, windowMs: 60 * MINUTE }),
  register: createRateLimiter({ limit: 5, windowMs: 60 * MINUTE }),
  oauthStart: createRateLimiter({ limit: 20, windowMs: 10 * MINUTE }),
  upload: createRateLimiter({ limit: 60, windowMs: 10 * MINUTE }),
};

/**
 * Client IP as seen behind Nginx Proxy Manager, which sets X-Real-IP and
 * appends to X-Forwarded-For. Falls back to a shared key when neither exists.
 */
export function clientIp(headers: Pick<Headers, "get">): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}
