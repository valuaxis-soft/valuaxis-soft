import { SESSION_MAX_LIFETIME_SECONDS, SESSION_TTL_SECONDS } from "../constants/auth.constants";

export function buildSessionExpiration(now = Date.now()) {
  return new Date(now + SESSION_TTL_SECONDS * 1000);
}

/**
 * Sliding expiration. Returns the new expiration when the session should be
 * renewed, or null when it should be left as is.
 *
 * - Renews only once less than half of the idle timeout remains, so an active
 *   user causes at most one write every few hours.
 * - Never extends past the absolute lifetime counted from login.
 */
export function computeRenewedExpiration(input: { createdAt: Date; expiresAt: Date; now?: number }): Date | null {
  const now = input.now ?? Date.now();
  const remaining = input.expiresAt.getTime() - now;
  if (remaining <= 0 || remaining > (SESSION_TTL_SECONDS * 1000) / 2) return null;

  const hardLimit = input.createdAt.getTime() + SESSION_MAX_LIFETIME_SECONDS * 1000;
  const next = Math.min(now + SESSION_TTL_SECONDS * 1000, hardLimit);
  return next > input.expiresAt.getTime() ? new Date(next) : null;
}
