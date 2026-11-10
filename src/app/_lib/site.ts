export const SITE_NAME = "Valuaxis";

export const SITE_TITLE = `${SITE_NAME} · Software de avalúos inmobiliarios en México`;

export const SITE_DESCRIPTION =
  "Software de avalúos inmobiliarios y de maquinaria para valuadores en México: enfoques de mercado, costos e ingresos, comparables con mapa y dictamen de avalúo en PDF.";

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
