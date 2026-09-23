/**
 * HTTP security headers.
 *
 * The Content-Security-Policy is built per request in the proxy with a fresh
 * nonce: Next.js reads it from the request and marks its own scripts with that
 * nonce, and 'strict-dynamic' lets those scripts load the app's chunks. No
 * inline script without the nonce can run. Styles still allow inline because
 * the UI uses style attributes.
 */
export function contentSecurityPolicy(options: { development: boolean; nonce: string }) {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${options.nonce}'`,
      "'strict-dynamic'",
      ...(options.development ? ["'unsafe-eval'"] : []),
    ],
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

/** A base64 nonce from 16 random bytes. Works in any runtime with Web Crypto. */
export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** Headers that do not change per request. The CSP is added by the proxy. */
export function securityHeaders(options: { development: boolean }) {
  return [
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
