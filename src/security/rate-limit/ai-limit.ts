import { rateLimits, type RateLimitResult } from "./rate-limiter";

/** Counts one AI call for the user and for their organization; the first limit exceeded answers. */
export function consumeAiRateLimit(user: { id: number; organizationId: number }, now = Date.now()): RateLimitResult {
  const byOrganization = rateLimits.aiByOrganization.consume(`ai:org:${user.organizationId}`, now);
  if (!byOrganization.allowed) return byOrganization;
  return rateLimits.aiByUser.consume(`ai:user:${user.id}`, now);
}

/** Counts one «Buscar con IA» for the user and for their organization: its own limits, apart from the other assisted features. */
export function consumeAiWebSearchRateLimit(user: { id: number; organizationId: number }, now = Date.now()): RateLimitResult {
  const byOrganization = rateLimits.aiWebSearchByOrganization.consume(`ai-web-search:org:${user.organizationId}`, now);
  if (!byOrganization.allowed) return byOrganization;
  return rateLimits.aiWebSearchByUser.consume(`ai-web-search:user:${user.id}`, now);
}
