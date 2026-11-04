/**
 * Address search for the croquis panel, through the Geocoding API with the
 * server's key: the browser never calls Google with it. Nothing is stored.
 */
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";

import type { LatLon } from "../types";
import { MAPS_NOT_CONFIGURED, googleMapsServerKey } from "./google-maps-keys";

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
/** Results beyond this are rarely the one wanted and would clutter the list. */
const MAX_RESULTS = 5;
export const MAX_QUERY_LENGTH = 300;

export interface GeocodingResult {
  address: string;
  point: LatLon;
  /** Google's precision: "ROOFTOP" is the building, "APPROXIMATE" the colonia or town. */
  precision: string;
}

interface GeocodingResponse {
  status: string;
  error_message?: string;
  results?: { formatted_address: string; geometry: { location: { lat: number; lng: number }; location_type: string } }[];
}

/** The Geocoding API's answer for a query, Mexico first; empty when nothing matches. */
export async function geocodeAddress(query: string, fetchImpl: typeof fetch = fetch): Promise<GeocodingResult[]> {
  const key = googleMapsServerKey();
  if (!key) throw new ValuationWorkflowError(MAPS_NOT_CONFIGURED, 503);
  const text = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!text) return [];
  const params = new URLSearchParams({ address: text, region: "mx", language: "es", key });
  const response = await fetchImpl(`${GEOCODING_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Geocoding API answered ${response.status}`);
  const body = (await response.json()) as GeocodingResponse;
  if (body.status === "ZERO_RESULTS") return [];
  if (body.status !== "OK") {
    // The key is rejected or the API is not enabled: the message names the cause, the client gets a generic one.
    console.error(`[GEOCODING] ${body.status}: ${body.error_message ?? ""}`);
    throw new ValuationWorkflowError("La búsqueda de direcciones no está disponible; revisa la llave de Google Maps.", 503);
  }
  return (body.results ?? []).slice(0, MAX_RESULTS).map((result) => ({
    address: result.formatted_address,
    point: [result.geometry.location.lat, result.geometry.location.lng],
    precision: result.geometry.location_type,
  }));
}
