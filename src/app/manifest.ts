import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_THEME_COLOR } from "./_lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "es",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#fbf9f5",
    theme_color: SITE_THEME_COLOR,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
