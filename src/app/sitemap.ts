import type { MetadataRoute } from "next";
import { getSiteUrl } from "./_lib/site";

// Rendered per request so the URLs follow the runtime APP_URL.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  return [
    { url: `${siteUrl}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${siteUrl}/registro`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${siteUrl}/iniciar-sesion`, changeFrequency: "yearly", priority: 0.5 },
  ];
}
