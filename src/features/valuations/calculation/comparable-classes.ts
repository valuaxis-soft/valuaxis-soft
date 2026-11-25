/**
 * The class of a comparable: real estate or machinery and equipment. The
 * appraiser's rule (24 Nov 2026): comparables of one class never show in the
 * searches, maps, duplicates or markets of the other. The class goes with the
 * kind of the offer («Retroexcavadora» is machinery, «Oficina» real estate);
 * the market (operation × land or building) still drives the calculation.
 *
 * Shared by the comparables (kinds, base, AI search) and the machinery
 * valuations (terms, card characteristics). Pure TypeScript.
 */
import { COMPARABLE_TYPE_LABELS, isRentComparableType, type ComparableType } from "./market-types";
import { isMachineryPropertyKind } from "./machinery-types";

export const COMPARABLE_CLASSES = ["INMUEBLE", "MAQUINARIA"] as const;
export type ComparableClass = (typeof COMPARABLE_CLASSES)[number];

export const COMPARABLE_CLASS_LABELS: Record<ComparableClass, string> = {
  INMUEBLE: "Inmuebles",
  MAQUINARIA: "Maquinaria y equipo",
};

/** The class of a comparable of before, or of one whose kind says nothing. */
export const DEFAULT_COMPARABLE_CLASS: ComparableClass = "INMUEBLE";

export const isComparableClass = (value: unknown): value is ComparableClass =>
  typeof value === "string" && (COMPARABLE_CLASSES as readonly string[]).includes(value);

/**
 * The markets a valuation captures comparables in: the four of real estate
 * (ComparableAvaluo) and the market of the machinery panel (MEH offers).
 */
export type ComparableMarketType = ComparableType | "MAQUINARIA_VENTA";

/** The class of the comparables a market takes. */
export function comparableClassOfType(type: ComparableMarketType): ComparableClass {
  return type === "MAQUINARIA_VENTA" ? "MAQUINARIA" : "INMUEBLE";
}

/** The class of the comparables a valuation looks for, by its «tipo de bien» (`ValuationDetail.propertyKind`). */
export function comparableClassOfValuation(propertyKind: string | null | undefined): ComparableClass {
  return isMachineryPropertyKind(propertyKind) ? "MAQUINARIA" : "INMUEBLE";
}

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * A «tipo de construcción» written before kinds existed that already said it
 * was machinery («Equipo y maquinaria», migration 039 and the suggestions of
 * 3 Nov 2026). The SQL of the base reads it the same way (own-base-sql).
 */
export const MACHINERY_CONSTRUCTION_TYPE = /^(equipo|maquinaria)/;

/**
 * The class of a stored comparable: the one kept with its kind; else, for one
 * captured before kinds, machinery when its type of construction said so,
 * real estate otherwise.
 */
export function comparableClassOf(comparable: { assetClass?: unknown; constructionType?: string | null }): ComparableClass {
  if (isComparableClass(comparable.assetClass)) return comparable.assetClass;
  return MACHINERY_CONSTRUCTION_TYPE.test(plain(comparable.constructionType ?? "")) ? "MAQUINARIA" : DEFAULT_COMPARABLE_CLASS;
}

/**
 * How a comparable's market is named where the comparable is shown (its
 * card, the base's list, the map): a machine or a vehicle is never «Inmuebles
 * en venta», whatever row of the catalog of comparable types it is filed
 * under; it is «Maquinaria y equipo en venta» (or «en renta»).
 */
export function comparableMarketLabel(type: ComparableType, assetClass?: ComparableClass | null): string {
  if (assetClass !== "MAQUINARIA") return COMPARABLE_TYPE_LABELS[type];
  return `${COMPARABLE_CLASS_LABELS.MAQUINARIA} ${isRentComparableType(type) ? "en renta" : "en venta"}`;
}
