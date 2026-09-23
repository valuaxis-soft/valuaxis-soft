/**
 * Market approach data as the editor and the API exchange it, and its
 * conversion to the engine input. Shared by the browser (live results) and the
 * server (stored results and trace), so both compute the same thing.
 */
import { SURFACE_SLOT, type CapturedFactor, type FactorSlot } from "../engine/factors";
import type { ComparableInput, MarketApproachInput } from "../engine/market";

export const COMPARABLE_TYPES = ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA"] as const;
export type ComparableType = (typeof COMPARABLE_TYPES)[number];

export const COMPARABLE_TYPE_LABELS: Record<ComparableType, string> = {
  TERRENO_VENTA: "Terrenos en venta",
  INMUEBLE_VENTA: "Inmuebles en venta",
  INMUEBLE_RENTA: "Inmuebles en renta",
};

/** Factor types of the catalog (devpware_tipos_factores_homologacion). */
export const FACTOR_TYPES = [
  "NEGOCIACION", "UBICACION", "SUPERFICIE", "ZONA", "FRENTE", "USO_SUELO", "SERVICIOS", "CLASIFICACION",
  "TOPOGRAFIA", "CALIDAD", "CONSERVACION", "EDAD", "FORMA", "PROYECTO", "OTRO",
] as const;
export type FactorType = (typeof FACTOR_TYPES)[number];

export const FACTOR_TYPE_LABELS: Record<FactorType, string> = {
  NEGOCIACION: "Negociación",
  UBICACION: "Ubicación",
  SUPERFICIE: "Superficie",
  ZONA: "Zona",
  FRENTE: "Frente",
  USO_SUELO: "Uso de suelo",
  SERVICIOS: "Servicios",
  CLASIFICACION: "Clasificación",
  TOPOGRAFIA: "Topografía",
  CALIDAD: "Calidad",
  CONSERVACION: "Conservación",
  EDAD: "Edad",
  FORMA: "Forma",
  PROYECTO: "Proyecto",
  OTRO: "Otro",
};

/** Factor columns of the homologation, in multiplication order. SUPERFICIE is computed. */
export type FactorSlotConfig = { type: FactorType; label: string };

/** The columns of the Arandas land homologation: Neg., Ubic., Sup., Zona, Frente, Uso. */
export const DEFAULT_FACTOR_SLOTS: FactorSlotConfig[] = ["NEGOCIACION", "UBICACION", "SUPERFICIE", "ZONA", "FRENTE", "USO_SUELO"]
  .map((type) => ({ type: type as FactorType, label: FACTOR_TYPE_LABELS[type as FactorType] }));

/** The books recommend a dispersion (max / min) below this. */
export const RECOMMENDED_MAX_DISPERSION = 1.25;
/** COT-2026-001: at least four comparables per homologation. */
export const MIN_COMPARABLES = 4;

export type ComparableFactorDto = {
  type: FactorType;
  value: number | null;
  subjectRating: number | null;
  comparableRating: number | null;
  justification: string | null;
};

export type ComparablePhotoDto = { id: string; title: string; url: string };

export type ComparableDto = {
  id: string;
  reference: number;
  location: string;
  /** Land area (TERRENO_VENTA), built area (INMUEBLE_VENTA) or rentable area (INMUEBLE_RENTA), m². */
  area: number | null;
  /** Offer price, or monthly rent for rent comparables. */
  price: number | null;
  landUse: string | null;
  shape: string | null;
  zone: string | null;
  frontage: number | null;
  depth: number | null;
  topography: string | null;
  services: string | null;
  notes: string | null;
  sourceName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  url: string | null;
  offerDate: string | null;
  photos: ComparablePhotoDto[];
  factors: ComparableFactorDto[];
};

export type MarketSettingsDto = {
  comparableType: ComparableType;
  subjectArea: number | null;
  /** Lote tipo; empty to homologate against the subject. */
  baseArea: number | null;
  surfacePower: number;
  adoptedUnitValue: number | null;
  justification: string | null;
  additionalAmount: number;
  factorSlots: FactorSlotConfig[];
};

export type MarketCalculationDto = {
  settings: MarketSettingsDto;
  comparables: ComparableDto[];
  locked: boolean;
};

export function defaultMarketSettings(comparableType: ComparableType): MarketSettingsDto {
  return {
    comparableType,
    subjectArea: null,
    baseArea: null,
    surfacePower: 3,
    adoptedUnitValue: null,
    justification: null,
    additionalAmount: 0,
    factorSlots: DEFAULT_FACTOR_SLOTS,
  };
}

/** A comparable enters the calculation once it has a positive area and price. */
export function isComparableComplete(comparable: Pick<ComparableDto, "area" | "price">) {
  return (comparable.area ?? 0) > 0 && (comparable.price ?? 0) > 0;
}

function capturedFactor(slot: FactorSlotConfig, factor: ComparableFactorDto | undefined): CapturedFactor {
  const base = { key: slot.type, label: slot.label };
  if (factor?.subjectRating && factor.comparableRating) {
    return { ...base, subjectRating: factor.subjectRating, comparableRating: factor.comparableRating };
  }
  // A factor the appraiser has not captured does not change the value.
  return { ...base, value: factor?.value ?? 1 };
}

/** Engine input, or the reason the calculation cannot run yet. */
export function toMarketEngineInput(dto: Pick<MarketCalculationDto, "settings" | "comparables">):
  | { ok: true; input: MarketApproachInput }
  | { ok: false; reason: string } {
  const { settings } = dto;
  if (!settings.subjectArea || settings.subjectArea <= 0) {
    return { ok: false, reason: "Captura la superficie del sujeto." };
  }
  if (!(settings.surfacePower > 0)) return { ok: false, reason: "La potencia n debe ser mayor que cero." };
  const complete = dto.comparables.filter(isComparableComplete);
  if (!complete.length) return { ok: false, reason: "Captura al menos un comparable con superficie y precio." };

  const comparables: ComparableInput[] = complete.map((comparable) => ({
    id: String(comparable.reference),
    price: comparable.price as number,
    area: comparable.area as number,
    factors: settings.factorSlots.map((slot): FactorSlot =>
      slot.type === "SUPERFICIE"
        ? SURFACE_SLOT
        : capturedFactor(slot, comparable.factors.find((factor) => factor.type === slot.type))),
  }));
  return {
    ok: true,
    input: {
      subjectArea: settings.subjectArea,
      ...(settings.baseArea ? { baseArea: settings.baseArea } : {}),
      surfacePower: settings.surfacePower,
      comparables,
      ...(settings.adoptedUnitValue ? { adoptedUnitValue: settings.adoptedUnitValue } : {}),
      additionalAmount: settings.additionalAmount,
    },
  };
}
