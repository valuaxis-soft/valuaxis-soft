/**
 * The streets around a point, from OpenStreetMap. They come from our own
 * copy first (`devpware_calles_osm`, streets-db.ts): the public Overpass
 * mirrors failed almost every time in production (nov 2026). Overpass stays
 * as the fallback only while the copy is empty or cannot be read: mirrors
 * raced with a short head start each. Either answer is cached in memory for a day under
 * the rounded coordinates, so dragging the pin a few meters, "Generar
 * croquis de localización" and a reload do not ask again. The browser never
 * calls Overpass itself.
 */
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";

import { distanceMeters, metersPerPixel, type StreetWay } from "../streets";
import {
  DEFAULT_STREETS_RADIUS,
  OSM_ATTRIBUTION,
  STREETS_RADIUS_RANGE,
  overpassQuery,
  parseOverpassWays,
  streetsCacheKey,
  mergedStreetWays,
  viewStreetHighways,
  viewStreetsCacheKey,
  type OverpassElement,
  type StreetsAroundDto,
  type ViewBounds,
} from "../streets-osm";
import type { LatLon } from "../types";
import { spellingKey } from "../street-names";
import { hasStoredStreets, streetsFromDatabase, streetsInView, streetsNamedInBox } from "./streets-db";

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

async function queryMirror<T>(url: string, query: string, parse: (elements: never[]) => T, fetchImpl: typeof fetch, signal: AbortSignal) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": OVERPASS_USER_AGENT },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!response.ok) throw new Error(`Overpass ${url} answered ${response.status}`);
  const body = (await response.json()) as { elements?: never[] };
  return parse(body.elements ?? []);
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
  return fetchFromOverpass(overpassQuery(point, radiusMeters), (elements: OverpassElement[]) => parseOverpassWays(elements), fetchImpl, mirrors, timing);
}

/** Any Overpass query raced over the mirrors as above, its elements parsed by `parse` (the streets, the areas of the base map). */
export function fetchFromOverpass<T>(
  query: string,
  parse: (elements: never[]) => T,
  fetchImpl: typeof fetch = fetch,
  mirrors = OVERPASS_MIRRORS,
  timing: OverpassTiming = OVERPASS_TIMING,
): Promise<T> {
  const everything = new AbortController();
  return new Promise<T>((resolve, reject) => {
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
      queryMirror(url, query, parse, fetchImpl, AbortSignal.any([everything.signal, AbortSignal.timeout(timing.mirrorTimeoutMs)])).then(
        (result) => finish(() => resolve(result)),
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
 * The streets of the zone from our copy. Null when the copy cannot answer
 * for it: it was never loaded, or it cannot be read (a database without
 * migration 061 must not take the croquis down with it). An empty list from
 * a loaded copy is an answer: Overpass serves the same OpenStreetMap data,
 * so asking it would only make the valuer wait for the same nothing.
 */
async function storedStreetsAround(stored: StoredStreets, point: LatLon, radiusMeters: number) {
  try {
    const ways = await stored.around(point, radiusMeters);
    if (ways.length) return ways;
    return (await stored.loaded()) ? ways : null;
  } catch (error) {
    console.error(`[STREETS] source=db failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * The streets around the point, from the cache when they are fresh, then
 * from our copy, and from Overpass only while the copy is empty or cannot be
 * read. When every mirror fails, an older answer for the same cell (up to a
 * week) is better than nothing.
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
          throw error;
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

/** Where the streets of a view come from; the tests replace it. */
export interface ViewStreetsSource {
  inView: (bounds: ViewBounds, highways: readonly string[], toleranceDegrees: number) => Promise<StreetWay[]>;
  /** Every piece of these streets (by `spellingKey`) crossing the box, whatever their class. */
  named: (bounds: ViewBounds, spellingKeys: readonly string[]) => Promise<StreetWay[]>;
  loaded: () => Promise<boolean>;
  /** The streets around the view's center when our copy cannot answer (Overpass, 2 km at most). */
  around: (point: LatLon, radiusMeters: number) => Promise<StreetsAroundDto>;
}

const DATABASE_VIEW_STREETS: ViewStreetsSource = {
  inView: streetsInView,
  named: streetsNamedInBox,
  loaded: hasStoredStreets,
  around: (point, radius) => getStreetsAround(point, radius),
};

const viewCache = new Map<string, CacheEntry>();

/**
 * The named streets of the map's view (video 8.5, 4:01): the box already
 * snapped and grown (`viewStreetsBox`) and the classes that read at the
 * zoom, from our copy, cached for a day like the streets around the pin.
 * The highlighted streets (`highlighted`, by name) come whole, whatever
 * their class, so the map shows them as the croquis prints them. While the
 * copy is empty or unreadable, the streets around the view's center through
 * Overpass, as far as it reaches.
 */
export async function getStreetsInView(
  box: ViewBounds,
  zoom: number,
  highlighted: readonly string[] = [],
  source: ViewStreetsSource = DATABASE_VIEW_STREETS,
): Promise<StreetsAroundDto> {
  const keys = [...new Set(highlighted.map(spellingKey).filter(Boolean))].sort();
  const key = `${viewStreetsCacheKey(box, zoom)}|${keys.join("|")}`;
  const cached = viewCache.get(key);
  if (cached && Date.now() - cached.storedAt < FRESH_MS) return cached.dto;
  const center: LatLon = [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2];
  // Half a pixel of the screen at that zoom: what the map could not show anyway.
  const tolerance = (metersPerPixel(zoom, center[0]) * 0.5) / 111_320;
  let ways: StreetWay[] | null = null;
  try {
    const [inView, named] = await Promise.all([source.inView(box, viewStreetHighways(zoom), tolerance), keys.length ? source.named(box, keys) : []]);
    ways = mergedStreetWays(named, inView);
    if (!ways.length && !(await source.loaded())) ways = null;
  } catch (error) {
    console.error(`[STREETS] view from db failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!ways) {
    const radius = Math.min(STREETS_RADIUS_RANGE.max, Math.max(STREETS_RADIUS_RANGE.min, Math.ceil(distanceMeters(center, box[1]))));
    return source.around(center, radius);
  }
  const dto: StreetsAroundDto = { ways, radius: Math.ceil(distanceMeters(center, box[1])), attribution: OSM_ATTRIBUTION };
  for (const [entry, value] of viewCache) if (Date.now() - value.storedAt > FRESH_MS) viewCache.delete(entry);
  while (viewCache.size >= MAX_CACHE_ENTRIES) viewCache.delete(viewCache.keys().next().value as string);
  viewCache.set(key, { storedAt: Date.now(), dto });
  return dto;
}
