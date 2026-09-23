export const SITE_NAME = "Valuaxis";

export const SITE_DESCRIPTION =
  "Plataforma web para despachos de avalúos y peritos valuadores en México: captura, organiza y emite tus avalúos inmobiliarios en línea.";

export const SITE_THEME_COLOR = "#014069";

const FALLBACK_SITE_URL = "https://valuaxissoft.com";

/** Public origin for canonical URLs, the sitemap and Open Graph. */
export function getSiteUrl() {
  const value = process.env.APP_URL?.trim();
  if (!value) return FALLBACK_SITE_URL;
  try {
    return new URL(value).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

/** The per-request CSP nonce the proxy put in the request headers, if any. */
export function nonceFromContentSecurityPolicy(policy: string | null) {
  return policy?.match(/'nonce-([^']+)'/)?.[1];
}
