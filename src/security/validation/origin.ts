const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defense for API route handlers. A state-changing request coming from a
 * browser must originate from one of our own origins.
 *
 * - With an Origin header: it must be one of the allowed origins.
 * - Without Origin: modern browsers send Sec-Fetch-Site; anything other than
 *   same-origin or a direct navigation is rejected.
 * - With neither header the request did not come from a browser page, so it
 *   cannot carry a victim's cookie through CSRF; it still needs a session.
 */
export function isSameOriginRequest(input: {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  allowedOrigins: string[];
}): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;
  if (input.origin) return input.allowedOrigins.includes(input.origin);
  if (input.secFetchSite) return input.secFetchSite === "same-origin" || input.secFetchSite === "none";
  return true;
}
