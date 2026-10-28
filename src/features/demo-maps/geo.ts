/**
 * Pure logic of the maps demonstration: distances, street detection around
 * the subject pin, the sample comparables and their filters. Everything here is
 * example data over real OpenStreetMap streets; nothing reads the database.
 */
import streets from "./streets.json";

export type LatLon = readonly [number, number];

export interface StreetWay {
  /** Street name; empty for unnamed pieces. */
  n: string;
  /** 1–2 main roads, 3 secondary, 4 residential. */
  r: number;
  g: LatLon[];
}

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

// Local flat projection, accurate enough within a few kilometers of Zapopan.
const M_LAT = 110574;
const M_LON = 111320 * Math.cos((20.634 * Math.PI) / 180);

/** Distance in meters between two points. */
export function distanceMeters(a: LatLon, b: LatLon) {
  return Math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * M_LON);
}

/** Distance in meters from p to the segment a–b. */
export function segmentDistance(p: LatLon, a: LatLon, b: LatLon) {
  const ax = a[1] * M_LON, ay = a[0] * M_LAT;
  const bx = b[1] * M_LON, by = b[0] * M_LAT;
  const px = p[1] * M_LON, py = p[0] * M_LAT;
  const dx = bx - ax, dy = by - ay;
  const length2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance in meters from p to the closest point of a way. */
export function wayDistance(p: LatLon, way: Pick<StreetWay, "g">) {
  let min = Infinity;
  for (let i = 1; i < way.g.length; i++) min = Math.min(min, segmentDistance(p, way.g[i - 1], way.g[i]));
  return min;
}

export function isInsideDemoArea(p: LatLon) {
  const [[south, west], [north, east]] = DEMO_BOUNDS;
  return p[0] >= south && p[0] <= north && p[1] >= west && p[1] <= east;
}

/* ------------------------------------------------------------------ */
/*  Etapa 2: streets around the subject                                */
/* ------------------------------------------------------------------ */

/** Streets the user added or removed by touching them on the map. */
export interface ManualStreets {
  add: ReadonlySet<string>;
  remove: ReadonlySet<string>;
}

export const NO_MANUAL_STREETS: ManualStreets = { add: new Set(), remove: new Set() };

export interface StreetDetection {
  front: string | null;
  side: ReadonlySet<string>;
  main: ReadonlySet<string>;
}

/** Within this distance a street counts as adjoining (colindante). */
export const SIDE_STREET_METERS = 110;
/** Main roads (rank 1–2) within this distance are highlighted. */
export const MAIN_ROAD_METERS = 900;

/**
 * The front street is the closest named street; adjoining streets are the
 * others within 110 m, plus the ones added by hand and minus the ones removed;
 * main roads are rank 1–2 streets within 900 m that are neither.
 */
export function detectStreets(p: LatLon, ways: readonly StreetWay[], manual: ManualStreets = NO_MANUAL_STREETS): StreetDetection {
  let front: string | null = null;
  let best = Infinity;
  for (const way of ways) {
    const d = wayDistance(p, way);
    if (d < best) {
      best = d;
      front = way.n;
    }
  }
  const side = new Set<string>();
  for (const way of ways) if (way.n !== front && wayDistance(p, way) < SIDE_STREET_METERS) side.add(way.n);
  manual.add.forEach((name) => side.add(name));
  manual.remove.forEach((name) => side.delete(name));
  const main = new Set<string>();
  for (const way of ways) {
    if (way.r <= 2 && way.n !== front && !side.has(way.n) && wayDistance(p, way) < MAIN_ROAD_METERS) main.add(way.n);
  }
  return { front, side, main };
}

/** Touching a street toggles it as adjoining. The front street stays as it is. */
export function toggleSideStreet(detection: StreetDetection, manual: ManualStreets, name: string): ManualStreets {
  if (name === detection.front) return manual;
  const add = new Set(manual.add);
  const remove = new Set(manual.remove);
  if (detection.side.has(name)) {
    add.delete(name);
    remove.add(name);
  } else {
    remove.delete(name);
    add.add(name);
  }
  return { add, remove };
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
    ? [`Mercado de rentas · ${what}`, "Métodos estadísticos · Rentas"]
    : [`Mercado de venta · ${what}`, `Métodos estadísticos · ${what}`];
}

export function formatMoney(value: number) {
  return "$" + Math.round(value).toLocaleString("es-MX");
}
