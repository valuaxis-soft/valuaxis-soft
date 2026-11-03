/**
 * Highlighted streets of the croquis: the front street detected from the pin
 * and the streets the appraiser paints by category (avenue, secondary,
 * tertiary, fourth). Pure functions, tested without a browser.
 */
import { NAMED_WAYS, distanceMeters, type LatLon, type StreetDetection, type StreetWay } from "./geo";

export type CategoryKey = "principal" | "secundaria" | "terciaria" | "cuarta";
export type HighlightKey = "front" | CategoryKey;

export interface HighlightStyle {
  on: boolean;
  color: string;
  weight: number;
}

export type HighlightStyles = Record<HighlightKey, HighlightStyle>;

export interface StreetCategory {
  key: CategoryKey;
  title: string;
}

/** The palette, in the order it is offered. */
export const STREET_CATEGORIES: readonly StreetCategory[] = [
  { key: "principal", title: "Avenida principal" },
  { key: "secundaria", title: "Calle secundaria" },
  { key: "terciaria", title: "Calle terciaria" },
  { key: "cuarta", title: "Calle cuarta" },
];

/** Line weights the sliders allow, in pixels. */
export const WEIGHT_RANGE = { min: 2, max: 14 } as const;

/** Each category has its own color and width; the front street keeps the red of the pin. */
export const DEFAULT_HIGHLIGHT_STYLES: HighlightStyles = {
  front: { on: true, color: "#c0392b", weight: 8 },
  principal: { on: true, color: "#1f7ac2", weight: 8 },
  secundaria: { on: true, color: "#e67e22", weight: 6 },
  terciaria: { on: true, color: "#2f8a4f", weight: 4 },
  cuarta: { on: true, color: "#8e44ad", weight: 3 },
};

/** Street name → category it is painted with. */
export type StreetPaint = ReadonlyMap<string, CategoryKey>;

/**
 * Touching a street with the selected category paints it; touching it again
 * with the same category removes it; another category repaints it. The front
 * street is never painted: it has its own style.
 */
export function paintStreet(paint: StreetPaint, name: string, category: CategoryKey, front: string | null): StreetPaint {
  if (name === front) return paint;
  const next = new Map(paint);
  if (next.get(name) === category) next.delete(name);
  else next.set(name, category);
  return next;
}

/** OpenStreetMap rank → category: 1–2 avenues, 3 secondary, 4 tertiary. "Cuarta" is only painted by hand. */
export function categoryForRank(rank: number): CategoryKey {
  return rank <= 2 ? "principal" : rank === 3 ? "secundaria" : "terciaria";
}

/** The suggested paint when the pin moves: nearby main roads as avenues, adjoining streets by their rank. */
export function seedPaint(detection: StreetDetection, ways: readonly StreetWay[] = NAMED_WAYS): StreetPaint {
  const rank = new Map<string, number>();
  for (const way of ways) rank.set(way.n, Math.min(rank.get(way.n) ?? 9, way.r));
  const paint = new Map<string, CategoryKey>();
  for (const name of detection.main) paint.set(name, "principal");
  for (const name of detection.side) paint.set(name, categoryForRank(rank.get(name) ?? 4));
  return paint;
}

export interface Highlights {
  front: string | null;
  paint: StreetPaint;
}

export interface HighlightedWay {
  way: StreetWay;
  key: HighlightKey;
  style: HighlightStyle;
}

/** Drawing order: wide avenues at the bottom, the front street on top of everything. */
const DRAW_ORDER: readonly HighlightKey[] = ["principal", "secundaria", "terciaria", "cuarta", "front"];

/** Ways to paint, in drawing order. Hidden categories are left out. */
export function highlightedWays({ front, paint }: Highlights, styles: HighlightStyles, ways: readonly StreetWay[] = NAMED_WAYS): HighlightedWay[] {
  const keyOf = (name: string): HighlightKey | null => (name === front ? "front" : (paint.get(name) ?? null));
  const byKey = new Map<HighlightKey, HighlightedWay[]>();
  for (const way of ways) {
    const key = keyOf(way.n);
    if (!key || !styles[key].on) continue;
    const list = byKey.get(key) ?? [];
    list.push({ way, key, style: styles[key] });
    byKey.set(key, list);
  }
  return DRAW_ORDER.flatMap((key) => byKey.get(key) ?? []);
}

/** Up to this zoom the map is a macro view: only avenues are drawn and touched. */
export const MACRO_MAX_ZOOM = 16;

export const isMacroZoom = (zoom: number) => Math.round(zoom) <= MACRO_MAX_ZOOM;

export const isMainRoad = (way: Pick<StreetWay, "r">) => way.r <= 2;

/** What the macro croquis shows: the highlighted avenues only. */
export function macroHighlights(items: readonly HighlightedWay[]) {
  return items.filter((item) => isMainRoad(item.way));
}

export interface StreetLabel {
  name: string;
  point: LatLon;
  color: string;
}

/** One label per highlighted street, on the middle of the piece closest to the center (the one most likely in frame). */
export function streetLabels(items: readonly HighlightedWay[], center: LatLon): StreetLabel[] {
  const best = new Map<string, { distance: number; label: StreetLabel }>();
  for (const { way, style } of items) {
    const point = way.g[Math.floor(way.g.length / 2)];
    const distance = distanceMeters(point, center);
    const current = best.get(way.n);
    if (!current || distance < current.distance) best.set(way.n, { distance, label: { name: way.n, point, color: style.color } });
  }
  return [...best.values()].map((entry) => entry.label);
}
