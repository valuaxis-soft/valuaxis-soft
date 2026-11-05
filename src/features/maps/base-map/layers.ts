/**
 * The layers of the map of comparables, one per type like folders, as the
 * client approved them in the demonstration: each with its color, a filled
 * pin for a valid comparable and a hollow one for an expired one. Pure.
 */
import { COMPARABLE_TYPE_LABELS, COMPARABLE_TYPES, type ComparableType } from "@/features/valuations/calculation/market-types";

export interface BaseMapLayer {
  type: ComparableType;
  title: string;
  color: string;
}

/** In the order of the demonstration: buildings for sale first, land for rent last. */
export const BASE_MAP_LAYERS: readonly BaseMapLayer[] = [
  { type: "INMUEBLE_VENTA", title: COMPARABLE_TYPE_LABELS.INMUEBLE_VENTA, color: "#1f7ac2" },
  { type: "TERRENO_VENTA", title: COMPARABLE_TYPE_LABELS.TERRENO_VENTA, color: "#2f8a4f" },
  { type: "INMUEBLE_RENTA", title: COMPARABLE_TYPE_LABELS.INMUEBLE_RENTA, color: "#8e44ad" },
  { type: "TERRENO_RENTA", title: COMPARABLE_TYPE_LABELS.TERRENO_RENTA, color: "#b06d10" },
];

export function baseMapLayer(type: ComparableType) {
  return BASE_MAP_LAYERS.find((layer) => layer.type === type) ?? BASE_MAP_LAYERS[0];
}

export type LayerVisibility = Readonly<Record<ComparableType, boolean>>;

/** Every layer on, or only the ones given. */
export function layerVisibility(on: readonly ComparableType[] = COMPARABLE_TYPES): LayerVisibility {
  return Object.fromEntries(COMPARABLE_TYPES.map((type) => [type, on.includes(type)])) as Record<ComparableType, boolean>;
}

export interface PinStyle {
  fill: string;
  stroke: string;
}

/** Filled with the layer's color while valid; white with the color as border once expired. */
export function pinStyle(type: ComparableType, expired: boolean): PinStyle {
  const { color } = baseMapLayer(type);
  return expired ? { fill: "#ffffff", stroke: color } : { fill: color, stroke: "#ffffff" };
}

/** The pins of the layers that are on. */
export function visiblePins<T extends { type: ComparableType }>(pins: readonly T[], layers: LayerVisibility) {
  return pins.filter((pin) => layers[pin.type]);
}

/** How many pins each layer has, for the counts next to the checkboxes. */
export function countByLayer(pins: readonly { type: ComparableType }[]): Record<ComparableType, number> {
  const counts = Object.fromEntries(COMPARABLE_TYPES.map((type) => [type, 0])) as Record<ComparableType, number>;
  for (const pin of pins) counts[pin.type] += 1;
  return counts;
}

/** The firm's valuations on the map: dark squares, like the demonstration. */
export const VALUATION_PIN_COLOR = "#0b3a5b";
/** The center and circle of the radius search. */
export const RADIUS_COLOR = "#1f7ac2";
