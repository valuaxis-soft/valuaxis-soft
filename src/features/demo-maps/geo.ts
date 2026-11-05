/**
 * Pure logic of the maps demonstration: the sample streets of Loma Bonita,
 * the search by name, the sample comparables and their filters. Distances and
 * street detection are the shared ones (src/features/maps/streets.ts).
 * Everything here is example data over real OpenStreetMap streets; nothing
 * reads the database.
 */
import { distanceMeters, type StreetWay } from "@/features/maps/streets";
import type { LatLon } from "@/features/maps/types";

import streets from "./streets.json";

export type { LatLon } from "@/features/maps/types";
export { detectStreets, distanceMeters, segmentDistance } from "@/features/maps/streets";
export type { StreetWay } from "@/features/maps/streets";

interface StreetData {
  w: StreetWay[];
  p: { n: string; g: LatLon[] }[];
}

export const STREET_DATA = streets as unknown as StreetData;
/** Named pieces: a street highlights as a whole, by name. */
export const NAMED_WAYS = STREET_DATA.w.filter((way) => way.n);
export const STREET_NAMES = [...new Set(NAMED_WAYS.map((way) => way.n))].sort((a, b) => a.localeCompare(b, "es"));

/** Example subject: Calle Perla 3890, Loma Bonita Sur, Zapopan. */
export const SUBJECT_START: LatLon = [20.63442, -103.40239];
/** The area covered by streets.json. */
export const DEMO_BOUNDS: readonly [LatLon, LatLon] = [
  [20.6265, -103.4115],
  [20.6425, -103.3925],
];

export function isInsideDemoArea(p: LatLon) {
  const [[south, west], [north, east]] = DEMO_BOUNDS;
  return p[0] >= south && p[0] <= north && p[1] >= west && p[1] <= east;
}

/** "A, B, C, D y 2 más". */
export function summarizeNames(names: ReadonlySet<string>, max = 4) {
  const list = [...names];
  return list.slice(0, max).join(", ") + (list.length > max ? ` y ${list.length - max} más` : "");
}

/** Search by street name in the demo area: exact name first, then partial; the longest piece wins. */
export function findStreet(query: string, ways: readonly StreetWay[] = NAMED_WAYS) {
  // "Calle Perla 3890, Zapopan" → "calle perla": the street before the comma, without the number.
  const q = query.split(",")[0].replace(/\s*#?\s*\d+[a-z]?\s*$/i, "").trim().toLocaleLowerCase("es");
  if (!q) return null;
  const exact = ways.filter((way) => way.n.toLocaleLowerCase("es") === q);
  const candidates = exact.length ? exact : ways.filter((way) => way.n.toLocaleLowerCase("es").includes(q));
  if (!candidates.length) return null;
  const middle = (way: StreetWay) => way.g[Math.floor(way.g.length / 2)];
  // streets.json reaches a little beyond the map's bounds: pieces inside them come first.
  const inside = candidates.filter((way) => isInsideDemoArea(middle(way)));
  const way = [...(inside.length ? inside : candidates)].sort((a, b) => b.g.length - a.g.length)[0];
  return { name: way.n, point: middle(way) };
}

/* ------------------------------------------------------------------ */
/*  Etapa 3: sample comparables                                        */
/* ------------------------------------------------------------------ */

export type ComparableKind = "IV" | "TV" | "IR" | "TR";

export const COMPARABLE_TYPES: readonly { kind: ComparableKind; name: string; color: string }[] = [
  { kind: "IV", name: "Inmuebles en venta", color: "#1f7ac2" },
  { kind: "TV", name: "Terrenos en venta", color: "#2f8a4f" },
  { kind: "IR", name: "Inmuebles en renta", color: "#8e44ad" },
  { kind: "TR", name: "Terrenos en renta", color: "#b06d10" },
];

export function comparableType(kind: ComparableKind) {
  return COMPARABLE_TYPES.find((type) => type.kind === kind)!;
}

export interface DemoComparable {
  ref: string;
  kind: ComparableKind;
  land: boolean;
  rent: boolean;
  /** m² of land, or of construction for a building. */
  area: number;
  price: number;
  lat: number;
  lon: number;
  street: string;
  colonia: string;
  bedrooms: number | null;
  bathrooms: number | null;
  date: Date;
  current: boolean;
  source: string;
}

const COLONIAS = ["Loma Bonita", "Loma Bonita Sur", "Loma Bonita Ejidal", "Las Águilas", "Jardines del Sol"];
const SOURCES = ["Inmuebles24", "Lamudi", "Vivanuncios", "Propiedades.com", "Asesor externo"];

/** Park–Miller generator: the same seed gives the same comparables on every load. */
function seededRandom(seed: number) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

/**
 * Fictitious comparables on residential streets within 1.5 km of the start
 * subject: 14 buildings and 11 lots for sale, 6 buildings and 3 lots for rent.
 */
export function generateComparables(ways: readonly StreetWay[] = STREET_DATA.w, options: { count?: number; seed?: number; center?: LatLon } = {}) {
  const { count = 34, seed = 7, center = SUBJECT_START } = options;
  const rnd = seededRandom(seed);
  const residential = ways.filter((way) => way.r >= 3 && way.n);
  const comparables: DemoComparable[] = [];
  for (let i = 0; i < count; i++) {
    const way = residential[Math.floor(rnd() * residential.length)];
    const vertex = way.g[Math.floor(rnd() * way.g.length)];
    if (distanceMeters(vertex, center) > 1500) {
      i--;
      continue;
    }
    const kind: ComparableKind = i < 14 ? "IV" : i < 25 ? "TV" : i < 31 ? "IR" : "TR";
    const land = kind[0] === "T";
    const rent = kind[1] === "R";
    const area = land ? Math.round(140 + rnd() * 260) : Math.round(110 + rnd() * 190);
    const unit = rent ? (land ? 18 + rnd() * 12 : 85 + rnd() * 70) : land ? 8200 + rnd() * 5600 : 17500 + rnd() * 11000;
    const months = Math.floor(rnd() * 11);
    const step = rent ? 100 : 10000;
    comparables.push({
      ref: "C-" + String(41 + i).padStart(5, "0"),
      kind,
      land,
      rent,
      area,
      price: Math.round((area * unit) / step) * step,
      lat: vertex[0] + (rnd() - 0.5) * 0.0003,
      lon: vertex[1] + (rnd() - 0.5) * 0.0003,
      street: way.n,
      colonia: COLONIAS[Math.floor(rnd() * COLONIAS.length)],
      bedrooms: land ? null : 2 + Math.floor(rnd() * 3),
      bathrooms: land ? null : 1 + Math.floor(rnd() * 3) + (rnd() > 0.5 ? 0.5 : 0),
      date: new Date(2026, 9 - months, 3 + Math.floor(rnd() * 24)),
      current: months < 6,
      source: SOURCES[Math.floor(rnd() * SOURCES.length)],
    });
  }
  return comparables;
}

/** The firm's own example valuations, shown as squares. */
export const DEMO_VALUATIONS = [
  { folio: "VLO-0001", type: "Casa habitación", lat: 20.63442, lon: -103.40239 },
  { folio: "VLO-0002", type: "Terreno urbano", lat: 20.6388, lon: -103.4062 },
  { folio: "VLO-0003", type: "Local comercial", lat: 20.6297, lon: -103.3968 },
  { folio: "VLO-0004", type: "Casa habitación", lat: 20.6402, lon: -103.3981 },
  { folio: "VLO-0005", type: "Departamento", lat: 20.6309, lon: -103.4081 },
] as const;

export interface ComparableFilters {
  layers: Readonly<Record<ComparableKind, boolean>>;
  minPrice: number | null;
  maxPrice: number | null;
  onlyCurrent: boolean;
}

export const ALL_LAYERS: Record<ComparableKind, boolean> = { IV: true, TV: true, IR: true, TR: true };

export function passesFilters(comparable: DemoComparable, filters: ComparableFilters) {
  return (
    filters.layers[comparable.kind] &&
    comparable.price >= (filters.minPrice ?? 0) &&
    comparable.price <= (filters.maxPrice ?? Infinity) &&
    (!filters.onlyCurrent || comparable.current)
  );
}

/** Comparables within the radius, closest first, with their distance in meters. */
export function comparablesWithinRadius(comparables: readonly DemoComparable[], center: LatLon, radiusMeters: number) {
  return comparables
    .map((comparable) => ({ comparable, distance: distanceMeters([comparable.lat, comparable.lon], center) }))
    .filter((entry) => entry.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance);
}

/** Where a comparable can be added in the valuation, by its kind. */
export function comparableDestinations(comparable: Pick<DemoComparable, "land" | "rent">) {
  const what = comparable.land ? "Terrenos" : "Inmuebles";
  return comparable.rent
    ? [`Mercado de rentas · ${what}`, "Métodos alternativos · Rentas"]
    : [`Mercado de venta · ${what}`, `Métodos alternativos · ${what}`];
}

export function formatMoney(value: number) {
  return "$" + Math.round(value).toLocaleString("es-MX");
}
