import { env } from "@/lib/env";

/**
 * The keys of Google Maps (docs/OPERACION.md, section 7). Both are runtime
 * variables: the Docker image is built without production.env.
 */

/** The browser key, for the Maps JavaScript API; the page hands it to the browser, where anyone can see it. */
export function googleMapsBrowserKey() {
  return env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

/** The key the server calls the Static and Geocoding APIs with; the browser key when there is no separate one. */
export function googleMapsServerKey() {
  return env.GOOGLE_MAPS_SERVER_KEY?.trim() || googleMapsBrowserKey();
}

export const MAPS_NOT_CONFIGURED = "Los mapas no están configurados en este servidor (falta la llave de Google Maps).";
