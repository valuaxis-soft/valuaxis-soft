import { createRateLimiter } from "@/security/rate-limit/rate-limiter";

/** Invitations send email: at most 30 per organization per hour. */
export const teamInviteLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 });
