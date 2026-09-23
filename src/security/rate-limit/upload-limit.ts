import { tooManyRequests } from "@/lib/api-response";
import { rateLimits } from "./rate-limiter";

/** Returns a 429 response when the user exceeded the upload limit, or null to continue. */
export function uploadRateLimitResponse(userId: number) {
  const result = rateLimits.upload.consume(`upload:${userId}`);
  return result.allowed ? null : tooManyRequests(result.retryAfterSeconds);
}
