/**
 * HTTP security headers for every response.
 *
 * Scripts need 'unsafe-inline' because Next.js injects inline bootstrap scripts
 * and the app does not use per-request nonces yet. Everything else is locked to
 * our own origin, plus S3 for signed image URLs.
 */
export function contentSecurityPolicy(options: { development: boolean }) {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(options.development ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://*.amazonaws.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(options.development ? ["ws:"] : [])],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  return options.development ? policy : `${policy}; upgrade-insecure-requests`;
}

export function securityHeaders(options: { development: boolean }) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(options.development
      ? []
      : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  ];
}
