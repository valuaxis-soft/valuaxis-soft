/**
 * Settings of the calculation engine. The Excel books differ in roundings and
 * in the direction of the surface factor, so each one has a profile that
 * reproduces it exactly; the default follows the rules proposed in
 * docs/fase0/README.md until the appraiser confirms them.
 */
/** Stored with every calculation (EjecucionCalculo.SVersionCalculo); change it when formulas change. */
export const ENGINE_VERSION = "motor-2026.09.1";

export type SurfaceOrientation = "reference-over-subject" | "subject-over-reference";

/** Excel ROUND digits (-4 = tens of thousands); `null` = no rounding. */
export type RoundingDigits = number | null;

export type EngineConfig = {
  ageFactor: {
    exponent: number;
    floor: number | null;
    /** An age at or past the useful life takes a useful life of age + 1, so the factor never reaches zero. */
    extendUsefulLife: boolean;
  };
  /**
   * With a lote tipo the comparables are homologated against it; this brings
   * the adopted value from the lote tipo to the subject (indirect homologation).
   */
  indirectSubjectFactor: boolean;
  surfaceOrientation: { costs: SurfaceOrientation; market: SurfaceOrientation; income: SurfaceOrientation };
  rounding: {
    costs: {
      /** Market unit value carried into the land of the cost approach. */
      marketUnitValue: RoundingDigits;
      land: RoundingDigits;
      constructions: RoundingDigits;
      installations: RoundingDigits;
      otherAssets: RoundingDigits;
      physicalValue: RoundingDigits;
    };
    market: { comparativeValue: RoundingDigits };
    /** Each approach value in the summary and the concluded value. */
    conclusion: RoundingDigits;
  };
};

const ARANDAS: EngineConfig = {
  ageFactor: { exponent: 1.4, floor: null, extendUsefulLife: false },
  indirectSubjectFactor: false,
  surfaceOrientation: { costs: "subject-over-reference", market: "reference-over-subject", income: "reference-over-subject" },
  rounding: {
    costs: { marketUnitValue: -1, land: -2, constructions: -4, installations: -3, otherAssets: null, physicalValue: -4 },
    market: { comparativeValue: -2 },
    conclusion: -4,
  },
};

const TCH: EngineConfig = {
  ...ARANDAS,
  rounding: { ...ARANDAS.rounding, costs: { ...ARANDAS.rounding.costs, land: -4 }, market: { comparativeValue: null } },
};

const TU: EngineConfig = {
  ...TCH,
  rounding: { ...TCH.rounding, costs: { ...TCH.rounding.costs, installations: null } },
};

const TU_OFICIAL: EngineConfig = {
  ...TU,
  surfaceOrientation: { costs: "reference-over-subject", market: "subject-over-reference", income: "subject-over-reference" },
};

const RURAL: EngineConfig = {
  ...TU,
  rounding: {
    ...TU.rounding,
    costs: { marketUnitValue: null, land: null, constructions: null, installations: null, otherAssets: null, physicalValue: null },
  },
};

/** One profile per Excel book, to reproduce each one exactly. */
export const EXCEL_PROFILES = { ARANDAS, TCH, TU, TU_OFICIAL, TR: RURAL, TRC: RURAL } as const satisfies Record<string, EngineConfig>;

/** Powers n of the surface factor an appraiser may use. */
export const SURFACE_POWERS = [3, 6, 9, 12] as const;

/** The adopted unit value may leave the homologated mean and median by this fraction at most. */
export const ADOPTED_VALUE_TOLERANCE = 0.3;

/**
 * The system default, as the appraiser defined it (docs/fase0/RESPUESTAS-PERITO.md):
 * - Market: the comparable is brought to the base, (base / comparable)^(1/n),
 *   where the base is the lote tipo (indirect) or the subject (direct).
 * - Costs: the lote tipo is brought to the subject, (lote tipo / subject)^(1/n).
 * - An age at or past the useful life takes a useful life of age + 1.
 * Roundings are the appraiser's choice per valuation; these are the starting ones.
 */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  ...ARANDAS,
  // The appraiser adopts the unit value; the land takes it as it is.
  rounding: { ...ARANDAS.rounding, costs: { ...ARANDAS.rounding.costs, marketUnitValue: null } },
  ageFactor: { exponent: 1.4, floor: 0, extendUsefulLife: true },
  indirectSubjectFactor: true,
  surfaceOrientation: { costs: "reference-over-subject", market: "subject-over-reference", income: "subject-over-reference" },
};

/** Roundings an appraiser chose for a valuation; a missing key keeps the default. */
export type RoundingOverrides = {
  costs?: Partial<Pick<EngineConfig["rounding"]["costs"], "land" | "constructions" | "installations" | "physicalValue">>;
  market?: RoundingDigits;
  conclusion?: RoundingDigits;
};

export function withRounding(config: EngineConfig, overrides: RoundingOverrides | null | undefined): EngineConfig {
  if (!overrides) return config;
  return {
    ...config,
    rounding: {
      costs: { ...config.rounding.costs, ...overrides.costs },
      market: { comparativeValue: overrides.market === undefined ? config.rounding.market.comparativeValue : overrides.market },
      conclusion: overrides.conclusion === undefined ? config.rounding.conclusion : overrides.conclusion,
    },
  };
}

/** Rounding choices offered in the editor (Excel ROUND digits; null = none). */
export const ROUNDING_OPTIONS: { digits: RoundingDigits; label: string }[] = [
  { digits: null, label: "Sin redondeo" },
  { digits: 2, label: "A centavos" },
  { digits: 0, label: "A pesos" },
  { digits: -1, label: "A decenas" },
  { digits: -2, label: "A centenas" },
  { digits: -3, label: "A miles" },
  { digits: -4, label: "A decenas de miles" },
  { digits: -5, label: "A centenas de miles" },
];

/** Settings that still wait for the appraiser. */
export const PENDING_DECISIONS = [
  { question: 3, setting: "machinery.conservationTwice", note: "MEH: la conservación se aplica en el factor de edad y otra vez en FCo (933,000) o una sola vez (952,000). Hoy, dos veces como el libro; se le aclaró la pregunta." },
] as const;
