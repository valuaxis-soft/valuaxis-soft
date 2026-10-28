import type { Metadata } from "next";
import { headers } from "next/headers";

import { DemoMaps } from "@/features/demo-maps/components/demo-maps";
import { env } from "@/lib/env";
import { NONCE_HEADER } from "@/security/headers/security-headers";
import { requireSession } from "@/security/guards/require-session";

/**
 * Maps demonstration for the client, at an unlisted URL. It needs a session,
 * is not linked from any menu or the sitemap, and shows only example data.
 * To remove it, delete this folder and src/features/demo-maps/.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demostración de mapas",
  robots: { index: false, follow: false },
};

export default async function DemoMapsPage() {
  await requireSession("/demo/mapas-k7q2vx");
  // Runtime variable: the Docker build has no production.env, the container loads it.
  const googleMapsKey = env.GOOGLE_MAPS_API_KEY?.trim() || null;
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  return (
    <>
      {/* Google Maps copies the nonce of the first <style nonce> it finds onto the styles it injects; without one, the CSP blocks them. */}
      {googleMapsKey && <style nonce={nonce}>{".demo-maps-style-nonce{}"}</style>}
      <DemoMaps googleMapsKey={googleMapsKey} nonce={nonce} />
    </>
  );
}
