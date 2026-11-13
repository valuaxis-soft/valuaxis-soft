/**
 * HTTP security headers.
 *
 * The Content-Security-Policy is built per request in the proxy with a fresh
 * nonce: Next.js reads it from the request and marks its own scripts with that
 * nonce, and 'strict-dynamic' lets those scripts load the app's chunks. No
 * inline script without the nonce can run.
 *
 * `<style>` elements need the nonce too (Base UI, the theme script) or must
 * match a known hash (sonner injects its CSS without a nonce). Style
 * attributes stay allowed because the UI positions and colors elements with
 * them. `style-src` keeps 'unsafe-inline' only for browsers that do not know
 * the -elem and -attr directives; the others ignore it. Development allows
 * any inline style because hot reload injects styles without the nonce.
 */
/**
 * Hashes of `<style>` contents that libraries insert without a nonce.
 * tests/security-baseline.test.ts recomputes them from node_modules, so a
 * library update that changes the CSS fails the tests instead of the page.
 */
export const TRUSTED_STYLE_HASHES = [
  // sonner: toast styles inserted on import.
  "'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='",
  // Empty <style>: sonner appends the element before filling it.
  "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
];

/**
 * Sources the Maps JavaScript API needs in the browser. Every page but the
 * printed documents gets them (googleMapsPage), because the policy that
 * applies is the one of the page the app was opened on. The loader script carries the nonce and
 * 'strict-dynamic' lets it add Google's own scripts; the host is listed for
 * CSP2 browsers. The Static and Geocoding APIs are called from the server,
 * so the dictamen and the PDF need none of this.
 */
const GOOGLE_MAPS_SOURCES: Record<string, string[]> = {
  "script-src": ["https://maps.googleapis.com"],
  "style-src-elem": ["https://fonts.googleapis.com"],
  "img-src": ["https://maps.gstatic.com", "https://maps.googleapis.com", "https://*.googleapis.com", "https://*.gstatic.com"],
  "font-src": ["https://fonts.gstatic.com"],
  "connect-src": ["https://maps.googleapis.com", "https://*.googleapis.com"],
  "worker-src": ["blob:"],
};

const PRINTED_DOCUMENT = /^\/(?:avaluos\/[^/]+\/(?:dictamen|memoria-calculo)|workspace\/preview-window)(?:\/|$)/;

/**
 * The pages whose document gets Google's sources: every page except the
 * printed documents (the dictamen, the calculation memory and the editor's
 * preview window), which show the croquis as stored images and must not
 * depend on anything outside the app.
 *
 * Until 12 nov 2026 only /workspace, /comparables and /demo/ got them. But a
 * CSP belongs to the document, and the app moves between pages without
 * loading a new one: the appraiser who signed in, or opened the dashboard,
 * and then clicked a valuation kept the dashboard's policy in the editor,
 * and Google's tiles, fonts and calls were blocked (a grey map with only the
 * pin until a reload; the installed app has no reload button). Scripts are
 * not widened by this: 'strict-dynamic' ignores host sources, so only the
 * nonce-carrying loader can add Google's scripts, and it runs only where a
 * map is drawn. What every page gains is images, fonts, styles and requests
 * to Google's map hosts, which the editor, the page with the most sensitive
 * data, already allowed.
 */
export function googleMapsPage(pathname: string) {
  return !PRINTED_DOCUMENT.test(pathname);
}

export function contentSecurityPolicy(options: { development: boolean; nonce: string; googleMaps?: boolean }) {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${options.nonce}'`,
      "'strict-dynamic'",
      ...(options.development ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "style-src-elem": options.development
      ? ["'self'", "'unsafe-inline'"]
      : ["'self'", `'nonce-${options.nonce}'`, ...TRUSTED_STYLE_HASHES],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://*.amazonaws.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(options.development ? ["ws:"] : [])],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  if (options.googleMaps) {
    for (const [name, sources] of Object.entries(GOOGLE_MAPS_SOURCES)) {
      directives[name] = [...(directives[name] ?? []), ...sources];
    }
  }
  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  return options.development ? policy : `${policy}; upgrade-insecure-requests`;
}

/** Request header the proxy uses to hand the nonce to the root layout. */
export const NONCE_HEADER = "x-nonce";

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
