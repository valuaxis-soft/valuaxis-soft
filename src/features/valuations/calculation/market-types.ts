/**
 * Market approach data as the editor and the API exchange it, and its
 * conversion to the engine input. Shared by the browser (live results) and the
 * server (stored results and trace), so both compute the same thing.
 */
import { SURFACE_SLOT, type CapturedFactor, type FactorSlot } from "../engine/factors";
import { DEFAULT_ENGINE_CONFIG, withRounding, type EngineConfig } from "../engine/config";
import type { ComparableInput, MarketApproachInput } from "../engine/market";

export const COMPARABLE_TYPES = ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA"] as const;
export type ComparableType = (typeof COMPARABLE_TYPES)[number];

export const COMPARABLE_TYPE_LABELS: Record<ComparableType, string> = {
  TERRENO_VENTA: "Terrenos en venta",
  INMUEBLE_VENTA: "Inmuebles en venta",
  INMUEBLE_RENTA: "Inmuebles en renta",
};

/** Wording that changes between sale and rent comparables. */
export const MARKET_LABELS: Record<ComparableType, {
  title: string;
  subjectArea: string;
  price: string;
  unitValue: string;
  adopted: string;
  value: string;
}> = {
  TERRENO_VENTA: {
    title: "Cálculo del enfoque de mercado", subjectArea: "Superficie del sujeto (m²)", price: "Oferta",
    unitValue: "Valor unitario", adopted: "Valor unitario adoptado ($/m²)", value: "Valor comparativo de mercado",
  },
  INMUEBLE_VENTA: {
    title: "Cálculo del enfoque de mercado", subjectArea: "Superficie construida del sujeto (m²)", price: "Oferta",
    unitValue: "Valor unitario", adopted: "Valor unitario adoptado ($/m²)", value: "Valor comparativo de mercado",
  },
  INMUEBLE_RENTA: {
    title: "Cálculo del mercado de rentas", subjectArea: "Superficie rentable del sujeto (m²)", price: "Renta mensual",
    unitValue: "Renta unitaria", adopted: "Renta unitaria adoptada ($/m²/mes)", value: "Renta mensual estimada del sujeto",
  },
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
export type FactorSlotConfig = {
  type: FactorType;
  label: string;
  /** The subject's rating in the firm's factor catalog: the same for every comparable. */
  subjectOption?: string | null;
};

/** The columns of the Arandas land homologation: Neg., Ubic., Sup., Zona, Frente, Uso. */
export const DEFAULT_FACTOR_SLOTS: FactorSlotConfig[] = ["NEGOCIACION", "UBICACION", "SUPERFICIE", "ZONA", "FRENTE", "USO_SUELO"]
  .map((type) => ({ type: type as FactorType, label: FACTOR_TYPE_LABELS[type as FactorType] }));

/**
 * "Nivel de oferta observada durante la investigación de mercado": the six
 * options the appraiser's format prints, in its order.
 */
export const OFFER_LEVELS = ["MUY_ALTA", "ALTA", "MEDIA", "MEDIA_BAJA", "BAJA", "NULA"] as const;
export type OfferLevel = (typeof OFFER_LEVELS)[number];

export const OFFER_LEVEL_LABELS: Record<OfferLevel, string> = {
  MUY_ALTA: "MUY ALTA",
  ALTA: "ALTA",
  MEDIA: "MEDIA",
  MEDIA_BAJA: "MEDIA BAJA",
  BAJA: "BAJA",
  NULA: "NULA",
};

/** Built properties, for sale or rent: their comparables also carry conservación and calidad. */
export const isBuiltComparableType = (type: ComparableType) => type !== "TERRENO_VENTA";

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
  /** Description of the land use; the short zoning key goes in `landUseKey`. */
  landUse: string | null;
  /** Zoning key as the plan writes it ("AU-I/CS-D"). */
  landUseKey?: string | null;
  shape: string | null;
  zone: string | null;
  /** Number of street fronts. */
  frontCount?: number | null;
  frontage: number | null;
  depth: number | null;
  topography: string | null;
  services: string | null;
  /** Built properties: state of conservation and quality, as the appraiser words them. */
  conservation?: string | null;
  quality?: string | null;
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
  /** Excel ROUND digits of the value, the appraiser's choice; undefined keeps the default, null is no rounding. */
  rounding?: number | null;
  /** Offer level observed in the market research; printed only once chosen. */
  offerLevel?: OfferLevel | null;
  /** "Frente tipo" and "fondo tipo en la zona", metres; printed next to the lote tipo. */
  typicalFrontage?: number | null;
  typicalDepth?: number | null;
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
    offerLevel: null,
    typicalFrontage: null,
    typicalDepth: null,
  };
}

/** The engine settings of a market calculation: the defaults with the rounding the appraiser chose. */
export function marketEngineConfig(settings: Pick<MarketSettingsDto, "rounding">): EngineConfig {
  return settings.rounding === undefined ? DEFAULT_ENGINE_CONFIG : withRounding(DEFAULT_ENGINE_CONFIG, { market: settings.rounding });
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

/** The surface factor the appraiser typed for a comparable, instead of the formula. */
function typedSurfaceFactor(comparable: ComparableDto) {
  const value = comparable.factors.find((factor) => factor.type === "SUPERFICIE")?.value;
  return value && value > 0 ? { surfaceFactor: value } : {};
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
    ...typedSurfaceFactor(comparable),
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
