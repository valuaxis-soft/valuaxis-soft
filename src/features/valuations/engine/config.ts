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
  ageFactor: { exponent: number; floor: number | null };
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
  ageFactor: { exponent: 1.4, floor: null },
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

/**
 * The system default: the surface factor always brings the reference to the
 * subject, and the roundings of the latest real case (Arandas).
 */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  ...ARANDAS,
  surfaceOrientation: { costs: "reference-over-subject", market: "reference-over-subject", income: "reference-over-subject" },
};

/** Settings that wait for the appraiser (docs/fase0/PREGUNTAS-PERITO.md). */
export const PENDING_DECISIONS = [
  { question: 1, setting: "surfaceOrientation", note: "Dirección del factor de superficie en los tres enfoques." },
  { question: 4, setting: "market.adoptedUnitValue", note: "Valor adoptado sugerido (promedio homologado) y su redondeo." },
  { question: 5, setting: "ageFactor", note: "Método del factor de edad y valor mínimo cuando la edad supera la vida útil." },
  { question: 6, setting: "rounding", note: "Conclusión por un enfoque o ponderada, y redondeos por tipo de avalúo." },
  { question: 8, setting: "market.surfacePower", note: "Cómo se elige la potencia n y su rango permitido." },
  { question: 11, setting: "costs.indirects", note: "Cuándo se aplican los indirectos y sobre qué base." },
] as const;
