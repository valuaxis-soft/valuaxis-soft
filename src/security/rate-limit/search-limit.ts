import { tooManyRequests } from "@/lib/api-response";
import { rateLimits } from "./rate-limiter";

/** Returns a 429 response when the user exceeded the comparable search limit, or null to continue. */
export function comparableSearchRateLimitResponse(userId: number) {
  const result = rateLimits.comparableSearch.consume(`comparable-search:${userId}`);
  return result.allowed ? null : tooManyRequests(result.retryAfterSeconds);
}
