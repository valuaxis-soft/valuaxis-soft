import type { MetadataRoute } from "next";
import { getSiteUrl } from "./_lib/site";

// Rendered per request so the URLs follow the runtime APP_URL.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/workspace",
        "/login",
        "/oauth/",
        "/recuperar-contrasena",
        "/restablecer-contrasena",
        "/verificar-correo",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
