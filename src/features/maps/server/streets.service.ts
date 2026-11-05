/**
 * The streets around a point, from OpenStreetMap through the Overpass API:
 * public mirrors tried in turn with a short backoff, the answer cached in
 * memory for a while under the rounded coordinates, so dragging the pin a
 * few meters, "Aplicar al croquis" and a reload do not ask again. The
 * browser never calls Overpass itself.
 */
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";

import { DEFAULT_STREETS_RADIUS, OSM_ATTRIBUTION, overpassQuery, parseOverpassWays, streetsCacheKey, type OverpassElement, type StreetsAroundDto } from "../streets-osm";
import type { LatLon } from "../types";

/** Public Overpass instances, in the order they are tried. */
const OVERPASS_MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
/** Before the next mirror after a refusal (429, 504): the mirrors share load, a pause helps. */
const BACKOFF_MS = [400, 1200];
const REQUEST_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 15 * 60_000;
const MAX_CACHE_ENTRIES = 200;

const STREETS_UNAVAILABLE = "No se pudieron obtener las calles de OpenStreetMap en este momento; inténtalo de nuevo en un minuto.";

interface CacheEntry {
  expiresAt: number;
  dto: StreetsAroundDto;
}

const cache = new Map<string, CacheEntry>();
/** One request per key at a time: a reload while the first one runs waits for it. */
const inFlight = new Map<string, Promise<StreetsAroundDto>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function queryMirror(url: string, query: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Valuaxis/1.0 (croquis de avalúos)" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Overpass ${url} answered ${response.status}`);
  const body = (await response.json()) as { elements?: OverpassElement[] };
  return parseOverpassWays(body.elements ?? []);
}

/** The ways from the first mirror that answers; every refusal goes to the log, the client gets one message. */
export async function fetchStreetsFromOverpass(point: LatLon, radiusMeters: number, fetchImpl: typeof fetch = fetch, mirrors = OVERPASS_MIRRORS) {
  const query = overpassQuery(point, radiusMeters);
  let lastError: unknown = null;
  for (const [index, url] of mirrors.entries()) {
    try {
      return await queryMirror(url, query, fetchImpl);
    } catch (error) {
      lastError = error;
      console.warn(`[STREETS] ${error instanceof Error ? error.message : String(error)}`);
      if (index < mirrors.length - 1) await sleep(BACKOFF_MS[Math.min(index, BACKOFF_MS.length - 1)]);
    }
  }
  console.error("[STREETS] every Overpass mirror failed", lastError);
  throw new ValuationWorkflowError(STREETS_UNAVAILABLE, 503);
}

function purgeExpired(now: number) {
  for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
  // Still too many: the oldest go first (Map keeps insertion order).
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
}

/** The streets around the point, from the cache when they are fresh. */
export async function getStreetsAround(point: LatLon, radiusMeters = DEFAULT_STREETS_RADIUS, fetchImpl: typeof fetch = fetch): Promise<StreetsAroundDto> {
  const key = streetsCacheKey(point, radiusMeters);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.dto;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = (async () => {
    try {
      // The query runs around the rounded point, so every pin in the same cell shares the answer.
      const [lat, lon] = key.split(",").map(Number) as [number, number, number];
      const ways = await fetchStreetsFromOverpass([lat, lon], radiusMeters, fetchImpl);
      const dto: StreetsAroundDto = { ways, radius: radiusMeters, attribution: OSM_ATTRIBUTION };
      purgeExpired(Date.now());
      cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, dto });
      return dto;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}
