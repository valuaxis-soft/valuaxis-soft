/**
 * Market approach data as the editor and the API exchange it, and its
 * conversion to the engine input. Shared by the browser (live results) and the
 * server (stored results and trace), so both compute the same thing.
 */
import { SURFACE_SLOT, type CapturedFactor, type FactorSlot } from "../engine/factors";
import { DEFAULT_ENGINE_CONFIG, withRounding, type EngineConfig } from "../engine/config";
import type { ComparableInput, MarketApproachInput } from "../engine/market";
import { formulaOfText, type CapturedFormulas } from "./captured-formulas";
import type { MarketRegressionDto } from "./market-regression";
import type { ComparableAddress, ComparableListingDetails, ComparablePropertyDetails, OperationType, UrbanProximity } from "./comparable-card";
import type { ComparableReviewDto } from "./comparable-review";
import { withPrecision, type CalculationPrecision } from "./calculation-precision";

export const COMPARABLE_TYPES = ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA", "TERRENO_RENTA"] as const;
export type ComparableType = (typeof COMPARABLE_TYPES)[number];

/**
 * A valuation may carry several markets, one per comparable type, each with
 * its own comparables, homologation, value and pages: land and buildings for
 * sale in the market section, and for rent in the rent market.
 */
export const SALE_COMPARABLE_TYPES: ComparableType[] = ["TERRENO_VENTA", "INMUEBLE_VENTA"];
export const RENT_COMPARABLE_TYPES: ComparableType[] = ["INMUEBLE_RENTA", "TERRENO_RENTA"];

export const COMPARABLE_TYPE_LABELS: Record<ComparableType, string> = {
  TERRENO_VENTA: "Terrenos en venta",
  INMUEBLE_VENTA: "Inmuebles en venta",
  INMUEBLE_RENTA: "Inmuebles en renta",
  TERRENO_RENTA: "Terrenos en renta",
};

export const isRentComparableType = (type: ComparableType) => type === "INMUEBLE_RENTA" || type === "TERRENO_RENTA";
export const isLandComparableType = (type: ComparableType) => type === "TERRENO_VENTA" || type === "TERRENO_RENTA";

/** Wording that changes between sale and rent comparables. */
export const MARKET_LABELS: Record<ComparableType, {
  /** Header of the calculation panel, apart from the pages of the dictamen it writes. */
  title: string;
  subjectArea: string;
  price: string;
  unitValue: string;
  adopted: string;
  value: string;
}> = {
  TERRENO_VENTA: {
    title: "Especificaciones del cálculo del enfoque de mercado", subjectArea: "Superficie del sujeto (m²)", price: "Oferta",
    unitValue: "Valor unitario", adopted: "Valor unitario adoptado ($/m²)", value: "Valor comparativo de mercado",
  },
  INMUEBLE_VENTA: {
    title: "Especificaciones del cálculo del enfoque de mercado", subjectArea: "Superficie construida del sujeto (m²)", price: "Oferta",
    unitValue: "Valor unitario", adopted: "Valor unitario adoptado ($/m²)", value: "Valor comparativo de mercado",
  },
  INMUEBLE_RENTA: {
    title: "Especificaciones del cálculo del mercado de rentas", subjectArea: "Superficie rentable del sujeto (m²)", price: "Renta mensual",
    unitValue: "Renta unitaria", adopted: "Renta unitaria adoptada ($/m²/mes)", value: "Renta mensual estimada del sujeto",
  },
  TERRENO_RENTA: {
    title: "Especificaciones del cálculo del mercado de rentas", subjectArea: "Superficie de terreno del sujeto (m²)", price: "Renta mensual",
    unitValue: "Renta unitaria", adopted: "Renta unitaria adoptada ($/m²/mes)", value: "Renta mensual estimada del terreno",
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
  /** A factor the firm created ("custom:vista"); its type is OTRO and it has no catalog ratings. */
  key?: string | null;
};

/** At most six factors per homologation, as the columns of the appraiser's format; FRe is not one of them. */
export const MAX_FACTOR_SLOTS = 6;

/** What identifies a factor in a homologation: the firm's own key, or its type. */
export const factorKey = (item: { type: FactorType; key?: string | null }) => item.key ?? item.type;

/** Keys of the factors the firm created: "custom:" and a slug of the name. */
export const CUSTOM_FACTOR_KEY = /^custom:[a-z0-9-]{1,50}$/;

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

/**
 * The offer level grid: up to six options the appraiser may rename, the one
 * marked, and the sentence above it. A capture made before they were editable
 * keeps the six options of the format and its mark.
 */
export const MAX_OFFER_OPTIONS = 6;
export const DEFAULT_OFFER_LABELS = OFFER_LEVELS.map((level) => OFFER_LEVEL_LABELS[level]);

export const offerLabelsOf = (settings: Pick<MarketSettingsDto, "offerLabels">) =>
  settings.offerLabels?.length ? settings.offerLabels : DEFAULT_OFFER_LABELS;

export function offerMarkOf(settings: Pick<MarketSettingsDto, "offerMark" | "offerLevel" | "offerLabels">): number | null {
  const mark = settings.offerMark !== undefined ? settings.offerMark : settings.offerLevel ? OFFER_LEVELS.indexOf(settings.offerLevel) : null;
  return mark !== null && mark >= 0 && mark < offerLabelsOf(settings).length ? mark : null;
}

/** Built properties, for sale or rent: their comparables also carry conservación and calidad. */
export const isBuiltComparableType = (type: ComparableType) => !isLandComparableType(type);

/** "Homologación de acuerdo a": the lote tipo (indirect homologation) or the subject (direct). */
export const HOMOLOGATION_BASES = ["LOTE_TIPO", "SUJETO"] as const;
export type HomologationBasis = (typeof HOMOLOGATION_BASES)[number];

/** A homologation captured before the choice existed is against the lote tipo when it has one. */
export const homologationBasisOf = (settings: Pick<MarketSettingsDto, "homologationBasis" | "baseArea">): HomologationBasis =>
  settings.homologationBasis ?? (settings.baseArea ? "LOTE_TIPO" : "SUJETO");

/**
 * The characteristics of the comparables: a list of fields the appraiser may
 * rename, remove, reorder or add to. Fields of the capture form keep their
 * key; added ones are "custom:" keys whose values live with each comparable.
 */
export const BUILTIN_CHARACTERISTICS = [
  "frontCount", "landUseKey", "shape", "zone", "frontage", "depth", "area", "conservation", "quality", "topography",
  "services", "price", "notes",
] as const;
export type BuiltinCharacteristic = (typeof BUILTIN_CHARACTERISTICS)[number];
export type CharacteristicField = { key: string; label: string };

export const isBuiltinCharacteristic = (key: string): key is BuiltinCharacteristic =>
  (BUILTIN_CHARACTERISTICS as readonly string[]).includes(key);
/** Numbers of the capture form among the characteristics. */
export const NUMERIC_CHARACTERISTICS: ReadonlySet<string> = new Set(["frontCount", "frontage", "depth", "area", "price"]);

/** Keys of the characteristics the appraiser adds: "custom:" and a short id. */
export const CUSTOM_CHARACTERISTIC_KEY = /^custom:[a-z0-9-]{1,40}$/;

const AREA_TAGS: Record<ComparableType, string> = {
  TERRENO_VENTA: "SUPERFICIE", INMUEBLE_VENTA: "SUP. CONST.", INMUEBLE_RENTA: "SUP. RENTABLE", TERRENO_RENTA: "SUPERFICIE",
};

/** The fields of the characteristics line, in the order and with the tags of the appraiser's format. */
export function defaultCharacteristicFields(type: ComparableType): CharacteristicField[] {
  const labels: Record<BuiltinCharacteristic, string> = {
    frontCount: "N. FRENTES", landUseKey: "USO DE SUELO", shape: "FORMA", zone: "ZONA", frontage: "FRENTE", depth: "FONDO",
    area: AREA_TAGS[type], conservation: "CONSERVACIÓN", quality: "CALIDAD", topography: "TOPOGRAFÍA", services: "SERVICIOS",
    price: isRentComparableType(type) ? "RENTA MENSUAL" : "OFERTA", notes: "OBSERVACIONES",
  };
  return BUILTIN_CHARACTERISTICS
    .filter((key) => isBuiltComparableType(type) || (key !== "conservation" && key !== "quality"))
    .map((key) => ({ key, label: labels[key] }));
}

export const characteristicFieldsOf = (settings: Pick<MarketSettingsDto, "characteristicFields" | "comparableType">) =>
  settings.characteristicFields ?? defaultCharacteristicFields(settings.comparableType);

type CharacteristicValues = Pick<ComparableDto, BuiltinCharacteristic | "extra" | "formulas">;

/** A characteristic of a comparable as the capture shows it: the number (without its formula) or the text, empty when there is none. */
export function characteristicValueText(comparable: CharacteristicValues, key: string): string {
  if (!isBuiltinCharacteristic(key)) return comparable.extra?.[key] ?? "";
  const value = comparable[key];
  return value === null || value === undefined ? "" : String(value);
}

/** A characteristic as it is edited: a number typed as a formula reads back as typed. */
export function characteristicText(comparable: CharacteristicValues, key: string): string {
  return (NUMERIC_CHARACTERISTICS.has(key) ? comparable.formulas?.[key] : undefined) ?? characteristicValueText(comparable, key);
}

/**
 * The comparable with one characteristic changed: a number of the capture
 * form takes `parsed` (what the formula or number typed gives, null when
 * empty or unreadable); the rest take the text, and an empty text clears it.
 */
export function withCharacteristic<T extends CharacteristicValues>(comparable: T, key: string, value: string, parsed: number | null): T {
  const typed = value.trim();
  if (!isBuiltinCharacteristic(key)) {
    const { [key]: _removed, ...extra } = comparable.extra ?? {};
    return { ...comparable, extra: typed ? { ...extra, [key]: typed } : extra };
  }
  if (!NUMERIC_CHARACTERISTICS.has(key)) return { ...comparable, [key]: typed || null };
  // A number typed as a formula keeps it, to read back as typed and print in the calculation memory.
  const { [key]: _replaced, ...formulas } = comparable.formulas ?? {};
  const formula = parsed === null ? null : formulaOfText(typed);
  return { ...comparable, [key]: parsed, formulas: formula ? { ...formulas, [key]: formula } : formulas };
}

/** COT-2026-001: at least four comparables per homologation. */
export const MIN_COMPARABLES = 4;

export type ComparableFactorDto = {
  type: FactorType;
  /** The firm's own factor, when `type` is OTRO. */
  key?: string | null;
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
  /** Land area (land comparables), built area (INMUEBLE_VENTA) or rentable area (INMUEBLE_RENTA), m². */
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
  /** Characteristics the appraiser added to the list, by field key. */
  extra?: Record<string, string>;
  /** Written instead of the characteristics line, when the appraiser prefers a text of their own. */
  characteristicsText?: string | null;
  /** "Justificación de los factores utilizados" for this comparable. */
  factorJustification?: string | null;
  /** Left out of the linear regression by the appraiser; it stays in the homologation. */
  regressionExcluded?: boolean;
  sourceName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  url: string | null;
  offerDate: string | null;
  /** Day the listing was consulted, YYYY-MM-DD; the form starts with today. */
  consultedOn?: string | null;
  /** Day the offer stops being valid, when the listing says. */
  validUntil?: string | null;
  /** The listing as it was pasted ("Pegar anuncio"), kept as evidence. */
  listingText?: string | null;
  /** The location in parts; `location` stays the line the dictamen prints. */
  address?: ComparableAddress | null;
  /** "Proximidad urbana" of the SHF rules. */
  urbanProximity?: UrbanProximity | null;
  /** Sale or rent; missing, the one of the comparable type. */
  operationType?: OperationType | null;
  /** Decimal degrees; filled by hand until there is a map. */
  latitude?: number | null;
  longitude?: number | null;
  /**
   * Data of a built comparable for the search of the firm's base: its land
   * area (its `area` is the built or rentable one), bedrooms, bathrooms (½ for
   * a half bath) and type of construction. The calculation does not read them.
   */
  landArea?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  constructionType?: string | null;
  /** The master workbook's property facts (age, levels, parking, paving, position, unit basis); the calculation does not read them. */
  propertyDetails?: ComparablePropertyDetails | null;
  /** The master workbook's listing facts (id in the portal, currency, photo link, verification). */
  listingDetails?: ComparableListingDetails | null;
  photos: ComparablePhotoDto[];
  /** Read only: the comparable's number in the firm's base (formatComparableId), its screenshot and its review. */
  folio?: number | null;
  /** "Pantalla de referencia": the screenshot of the listing as it was when captured, apart from the photos. */
  screenshot?: ComparablePhotoDto | null;
  review?: ComparableReviewDto | null;
  /** Read only: "Fecha de alta / actualización" of its data, YYYY-MM-DD; it is valid six months from it (comparable-validity). */
  updatedOn?: string | null;
  factors: ComparableFactorDto[];
  /**
   * Formulas typed in its numeric fields ("area", "price", "frontage",
   * "depth", "frontCount") and in its factors ("factors.NEGOCIACION");
   * absent keeps the stored ones whose value did not change.
   */
  formulas?: CapturedFormulas;
};

/** Where a factor's formula is kept among the comparable's formulas. */
export const factorFormulaPath = (factor: { type: FactorType; key?: string | null }) => `factors.${factorKey(factor)}`;

/** The numbers of a comparable as its formulas name them: its fields, and its factors by key. */
export function comparableFormulaValues(comparable: Pick<ComparableDto, "area" | "price" | "frontage" | "depth" | "factors"> & { frontCount?: number | null }) {
  return {
    area: comparable.area,
    price: comparable.price,
    frontage: comparable.frontage,
    depth: comparable.depth,
    frontCount: comparable.frontCount ?? null,
    factors: Object.fromEntries(comparable.factors.map((factor) => [factorKey(factor), factor.value])),
  };
}

export type MarketSettingsDto = {
  comparableType: ComparableType;
  subjectArea: number | null;
  /** Lote tipo; used when the homologation is against it. */
  baseArea: number | null;
  surfacePower: number;
  adoptedUnitValue: number | null;
  /** General text of the justification of the factors, before the one of each comparable. */
  justification: string | null;
  additionalAmount: number;
  /** "Cálculo": the additional amount enters the value; missing, it does (as before). */
  additionalAmountInCalculation?: boolean;
  /** "Mostrar en dictamen": the line of the additional amount prints; missing, only when there is one. Never without "cálculo". */
  showAdditionalAmount?: boolean;
  factorSlots: FactorSlotConfig[];
  /** Excel ROUND digits of the value, the appraiser's choice; undefined keeps the default, null is no rounding. */
  rounding?: number | null;
  /**
   * Offer level observed in the market research, among the six options of the
   * format; kept for captures made before the options were editable. The mark
   * is `offerMark` from then on.
   */
  offerLevel?: OfferLevel | null;
  /** The options of the offer level grid, up to six; empty or missing, the six of the format. */
  offerLabels?: string[] | null;
  /** Index of the option observed; printed only once chosen. */
  offerMark?: number | null;
  /** Sentence above the grid; empty, the one of the format. */
  offerIntro?: string | null;
  /** Homologation against the lote tipo or the subject; missing, against the lote tipo when there is one. */
  homologationBasis?: HomologationBasis | null;
  /**
   * Frente and fondo of the basis, metres: "frente/fondo tipo en la zona"
   * against the lote tipo, the subject's own against the subject (often unknown
   * for irregular lots, so optional).
   */
  typicalFrontage?: number | null;
  typicalDepth?: number | null;
  /** The fields of the characteristics; missing, those of the format for the comparable type. */
  characteristicFields?: CharacteristicField[] | null;
  /** The subject's characteristics, beside the comparables', by field key. */
  subjectCharacteristics?: Record<string, string>;
  /** Whether the justification of the factors prints in the dictamen; it does unless turned off. */
  showFactorJustification?: boolean;
  /** "Homologación por el método de regresión lineal": a reference beside the mean and median; missing, not used. */
  regression?: MarketRegressionDto | null;
  /** Whether the note under the homologation table prints; it does unless turned off. */
  showHomologationNote?: boolean;
  /** The appraiser's own note under the homologation table; empty, the one of the format. */
  homologationNote?: string | null;
  /** Formulas typed in the numeric fields ("subjectArea", "adoptedUnitValue"); absent keeps the stored ones whose value did not change. */
  formulas?: CapturedFormulas;
};

export type MarketCalculationDto = {
  settings: MarketSettingsDto;
  comparables: ComparableDto[];
  locked: boolean;
  /** The valuation's precision (decimals shown, calculating with them); missing, the behavior of before. */
  precision?: CalculationPrecision;
  /** The market has stored settings: its tab shows even without comparables. */
  configured?: boolean;
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

/** What a stored comparable carries that its form does not send: its identity, its images and its review. */
export type ComparableReadOnlyKey = "id" | "reference" | "photos" | "folio" | "screenshot" | "review" | "updatedOn";

/** The form values of a stored comparable, to send it back with a change. */
export function comparableFormValues(comparable: ComparableDto): Omit<ComparableDto, ComparableReadOnlyKey> {
  const {
    id: _id, reference: _reference, photos: _photos, folio: _folio, screenshot: _screenshot, review: _review, updatedOn: _updatedOn, ...values
  } = comparable;
  return values;
}

/** The engine settings of a market calculation: the defaults with the rounding the appraiser chose and the valuation's precision. */
export function marketEngineConfig(settings: Pick<MarketSettingsDto, "rounding">, precision?: CalculationPrecision | null): EngineConfig {
  const config = settings.rounding === undefined ? DEFAULT_ENGINE_CONFIG : withRounding(DEFAULT_ENGINE_CONFIG, { market: settings.rounding });
  return withPrecision(config, precision);
}

/** The additional amount the value takes: none when the appraiser left it out of the calculation. */
export const additionalAmountOf = (settings: Pick<MarketSettingsDto, "additionalAmount" | "additionalAmountInCalculation">) =>
  (settings.additionalAmountInCalculation === false ? 0 : settings.additionalAmount);

/** Whether the dictamen prints the line of the additional amount: only marked, and only when it is in the calculation. */
export const printsAdditionalAmount = (settings: Pick<MarketSettingsDto, "additionalAmount" | "additionalAmountInCalculation" | "showAdditionalAmount">) =>
  settings.additionalAmountInCalculation !== false && (settings.showAdditionalAmount ?? settings.additionalAmount > 0);

/** A comparable enters the calculation once it has a positive area and price. */
export function isComparableComplete(comparable: Pick<ComparableDto, "area" | "price">) {
  return (comparable.area ?? 0) > 0 && (comparable.price ?? 0) > 0;
}

/** The comparable's capture of a factor of the homologation. */
export const findFactor = (comparable: Pick<ComparableDto, "factors">, slot: Pick<FactorSlotConfig, "type" | "key">) =>
  comparable.factors.find((factor) => factorKey(factor) === factorKey(slot));

/** The value a captured factor takes: subject / comparable rating, its own value, or 1 when not captured. */
export const factorValue = (factor: ComparableFactorDto | undefined) =>
  factor?.subjectRating && factor.comparableRating ? factor.subjectRating / factor.comparableRating : factor?.value ?? 1;

function capturedFactor(slot: FactorSlotConfig, factor: ComparableFactorDto | undefined): CapturedFactor {
  const base = { key: factorKey(slot), label: slot.label };
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
      slot.type === "SUPERFICIE" ? SURFACE_SLOT : capturedFactor(slot, findFactor(comparable, slot))),
    ...typedSurfaceFactor(comparable),
  }));
  return {
    ok: true,
    input: {
      subjectArea: settings.subjectArea,
      // Against the subject the lote tipo is left out, even when one was captured before.
      ...(settings.baseArea && homologationBasisOf(settings) === "LOTE_TIPO" ? { baseArea: settings.baseArea } : {}),
      surfacePower: settings.surfacePower,
      comparables,
      ...(settings.adoptedUnitValue ? { adoptedUnitValue: settings.adoptedUnitValue } : {}),
      additionalAmount: additionalAmountOf(settings),
    },
  };
}
