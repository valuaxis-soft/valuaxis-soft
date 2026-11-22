/**
 * The streets around a point, from OpenStreetMap. They come from our own
 * copy first (`devpware_calles_osm`, streets-db.ts): the public Overpass
 * mirrors failed almost every time in production (nov 2026). Overpass stays
 * as the fallback for a zone the copy has nothing for: mirrors raced with a
 * short head start each. Either answer is cached in memory for a day under
 * the rounded coordinates, so dragging the pin a few meters, "Generar
 * croquis de localización" and a reload do not ask again. The browser never
 * calls Overpass itself.
 */
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";

import type { StreetWay } from "../streets";
import { DEFAULT_STREETS_RADIUS, OSM_ATTRIBUTION, overpassQuery, parseOverpassWays, streetsCacheKey, type OverpassElement, type StreetsAroundDto } from "../streets-osm";
import type { LatLon } from "../types";
import { hasStoredStreets, streetsFromDatabase } from "./streets-db";

/** Public Overpass instances, in the order they are tried. */
const OVERPASS_MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

/** ASCII only (HTTP header values are Latin-1 at most, and the mirrors ask for a way to reach the operator). */
const OVERPASS_USER_AGENT = "Valuaxis/1.0 (+https://valuaxissoft.com)";

/** Our own copy of the streets; the tests replace it. */
export interface StoredStreets {
  around: (point: LatLon, radiusMeters: number) => Promise<StreetWay[]>;
  /** Whether the copy was ever loaded. */
  loaded: () => Promise<boolean>;
}

const DATABASE_STREETS: StoredStreets = { around: streetsFromDatabase, loaded: hasStoredStreets };

export interface OverpassTiming {
  /** One mirror gets this long before it is abandoned. */
  mirrorTimeoutMs: number;
  /** A mirror still silent after this long: the next one starts too, and the first to answer wins. */
  hedgeAfterMs: number;
  /** The whole search; well under the 60 s the reverse proxy waits, so the browser always gets our answer. */
  totalBudgetMs: number;
}

/**
 * Before 12 nov 2026 each mirror got 30 s in turn (up to ~92 s): the proxy in
 * front of the app cut the request at 60 s and the browser saw a page that
 * was not JSON ("Request failed"). Now the search ends within 20 s.
 */
const OVERPASS_TIMING: OverpassTiming = { mirrorTimeoutMs: 12_000, hedgeAfterMs: 3_500, totalBudgetMs: 20_000 };
/** Streets hardly change: an answer is reused for a day, and an older one (up to a week) when every mirror fails. */
const FRESH_MS = 24 * 60 * 60_000;
const STALE_MS = 7 * 24 * 60 * 60_000;
const MAX_CACHE_ENTRIES = 500;

const STREETS_UNAVAILABLE = "No se pudieron obtener las calles de OpenStreetMap en este momento; pulsa «Reintentar» en un minuto.";

interface CacheEntry {
  storedAt: number;
  dto: StreetsAroundDto;
}

const cache = new Map<string, CacheEntry>();
/** One request per key at a time: a reload while the first one runs waits for it. */
const inFlight = new Map<string, Promise<StreetsAroundDto>>();

async function queryMirror(url: string, query: string, fetchImpl: typeof fetch, signal: AbortSignal) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": OVERPASS_USER_AGENT },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!response.ok) throw new Error(`Overpass ${url} answered ${response.status}`);
  const body = (await response.json()) as { elements?: OverpassElement[] };
  return parseOverpassWays(body.elements ?? []);
}

/**
 * The ways from the first mirror that answers. The first mirror starts
 * alone; a refusal starts the next one at once, and a mirror that stays
 * silent past `hedgeAfterMs` gets company. The rest are cancelled as soon as
 * one answers, and everything stops at `totalBudgetMs`. Every refusal goes
 * to the log; the client gets one message.
 */
export function fetchStreetsFromOverpass(
  point: LatLon,
  radiusMeters: number,
  fetchImpl: typeof fetch = fetch,
  mirrors = OVERPASS_MIRRORS,
  timing: OverpassTiming = OVERPASS_TIMING,
): Promise<StreetWay[]> {
  const query = overpassQuery(point, radiusMeters);
  const everything = new AbortController();
  return new Promise<StreetWay[]>((resolve, reject) => {
    let next = 0;
    let running = 0;
    let settled = false;
    let hedge: ReturnType<typeof setTimeout> | undefined;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedge);
      clearTimeout(deadline);
      everything.abort();
      settle();
    };
    const fail = (reason: string) =>
      finish(() => {
        console.error(`[STREETS] ${reason}`);
        reject(new ValuationWorkflowError(STREETS_UNAVAILABLE, 503));
      });
    const deadline = setTimeout(() => fail(`no Overpass mirror answered within ${timing.totalBudgetMs} ms`), timing.totalBudgetMs);
    const launch = () => {
      if (settled || next >= mirrors.length) return;
      const url = mirrors[next];
      next += 1;
      running += 1;
      clearTimeout(hedge);
      if (next < mirrors.length) hedge = setTimeout(launch, timing.hedgeAfterMs);
      queryMirror(url, query, fetchImpl, AbortSignal.any([everything.signal, AbortSignal.timeout(timing.mirrorTimeoutMs)])).then(
        (ways) => finish(() => resolve(ways)),
        (error: unknown) => {
          running -= 1;
          if (settled) return;
          console.warn(`[STREETS] ${url}: ${error instanceof Error ? error.message : String(error)}`);
          if (next < mirrors.length) launch();
          else if (running === 0) fail("every Overpass mirror failed");
        },
      );
    };
    launch();
  });
}

function purgeExpired(now: number) {
  for (const [key, entry] of cache) if (now - entry.storedAt > STALE_MS) cache.delete(key);
  // Still too many: the oldest go first (Map keeps insertion order).
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
}

/**
 * The streets of the zone from our copy, or null when it has none there (or
 * cannot be read: a database without migration 061 must not take the croquis
 * down with it).
 */
async function storedStreetsAround(stored: StoredStreets, point: LatLon, radiusMeters: number) {
  try {
    const ways = await stored.around(point, radiusMeters);
    return ways.length ? ways : null;
  } catch (error) {
    console.error(`[STREETS] source=db failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * The streets around the point, from the cache when they are fresh, then
 * from our copy, then from Overpass. When every mirror fails, an older
 * answer for the same cell (up to a week) is better than nothing; and with
 * the copy loaded, a zone without streets in it is a zone without named
 * streets, not an error.
 */
export async function getStreetsAround(
  point: LatLon,
  radiusMeters = DEFAULT_STREETS_RADIUS,
  fetchImpl: typeof fetch = fetch,
  timing: OverpassTiming = OVERPASS_TIMING,
  stored: StoredStreets = DATABASE_STREETS,
): Promise<StreetsAroundDto> {
  const key = streetsCacheKey(point, radiusMeters);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.storedAt < FRESH_MS) return cached.dto;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = (async () => {
    try {
      // The query runs around the rounded point, so every pin in the same cell shares the answer.
      const [lat, lon] = key.split(",").map(Number) as [number, number, number];
      let ways = await storedStreetsAround(stored, [lat, lon], radiusMeters);
      if (ways) console.info(`[STREETS] source=db n=${ways.length} zone=${key}`);
      else {
        try {
          ways = await fetchStreetsFromOverpass([lat, lon], radiusMeters, fetchImpl, OVERPASS_MIRRORS, timing);
          console.info(`[STREETS] source=overpass n=${ways.length} zone=${key}`);
        } catch (error) {
          const stale = cache.get(key);
          if (stale && Date.now() - stale.storedAt < STALE_MS) return stale.dto;
          if (!(await stored.loaded().catch(() => false))) throw error;
          console.info(`[STREETS] source=db n=0 zone=${key} (no named streets in the copy, and Overpass did not answer)`);
          ways = [];
        }
      }
      const dto: StreetsAroundDto = { ways, radius: radiusMeters, attribution: OSM_ATTRIBUTION };
      purgeExpired(Date.now());
      cache.delete(key);
      cache.set(key, { storedAt: Date.now(), dto });
      return dto;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}
