/**
 * Comparative market approach and the homologation it shares with the rent
 * market. Formulas follow docs/fase0/metodologia/02-mercado-homologacion.md.
 */
import { ADOPTED_VALUE_TOLERANCE, type EngineConfig, type SurfaceOrientation } from "./config";
import { productInOrder, resolveFactorSlots, surfaceFactor, type FactorSlot } from "./factors";
import { roundIfSet } from "./rounding";
import { Trace } from "./trace";

export type ComparableInput = {
  id: string;
  /** Offer price (or monthly rent in the rent market). */
  price: number;
  area: number;
  /** Factors in capture order, with SURFACE_SLOT where the surface factor goes. */
  factors: FactorSlot[];
  /** Surface factor the appraiser typed instead of the formula. */
  surfaceFactor?: number;
};

export type HomologationInput = {
  subjectArea: number;
  /** Lote tipo when the appraiser homologates against it; defaults to the subject. */
  baseArea?: number;
  surfacePower: number;
  comparables: ComparableInput[];
  /** 10,000 when unit values are per hectare with areas in m² (rural). */
  unitScale?: number;
};

export type HomologatedComparable = {
  id: string;
  unitValue: number;
  surfaceFactor: number;
  resultantFactor: number;
  homologatedUnitValue: number;
};

export type HomologationStats = {
  count: number;
  mean: number;
  min: number;
  max: number;
  median: number;
  /** Sample standard deviation. */
  standardDeviation: number;
  coefficientOfVariation: number;
  /** max / min; the books recommend below 1.25. */
  dispersion: number;
};

export type HomologationResult = {
  comparables: HomologatedComparable[];
  stats: HomologationStats;
};

export function homologate(
  input: HomologationInput,
  orientation: SurfaceOrientation,
  trace: Trace,
  keyPrefix: string,
): HomologationResult {
  const baseArea = input.baseArea ?? input.subjectArea;
  const scale = input.unitScale ?? 1;
  const comparables = input.comparables.map((comparable): HomologatedComparable => {
    const key = `${keyPrefix}.comparables.${comparable.id}`;
    const unitValue = trace.record({
      key: `${key}.valorUnitario`,
      label: `Valor unitario, comparable ${comparable.id}`,
      formula: scale === 1 ? "precio / superficie" : `precio / superficie × ${scale}`,
      inputs: { precio: comparable.price, superficie: comparable.area },
      value: scale === 1 ? comparable.price / comparable.area : (comparable.price / comparable.area) * scale,
    });
    const surface = comparable.surfaceFactor !== undefined
      ? trace.record({
          key: `${key}.factorSuperficie`,
          label: `Factor de superficie, comparable ${comparable.id}`,
          formula: "captura del perito",
          inputs: { capturado: comparable.surfaceFactor },
          value: comparable.surfaceFactor,
        })
      : trace.record({
          key: `${key}.factorSuperficie`,
          label: `Factor de superficie, comparable ${comparable.id}`,
          formula: orientation === "reference-over-subject"
            ? "(superficie del comparable / superficie base)^(1/n)"
            : "(superficie base / superficie del comparable)^(1/n)",
          inputs: { superficieComparable: comparable.area, superficieBase: baseArea, n: input.surfacePower },
          value: surfaceFactor(comparable.area, baseArea, input.surfacePower, orientation),
        });
    const factors = resolveFactorSlots(comparable.factors, surface);
    const resultant = trace.record({
      key: `${key}.factorResultante`,
      label: `Factor resultante, comparable ${comparable.id}`,
      formula: factors.map((factor) => factor.key).join(" × "),
      inputs: Object.fromEntries(factors.map((factor) => [factor.key, factor.value])),
      value: productInOrder(factors.map((factor) => factor.value)),
    });
    const homologated = trace.record({
      key: `${key}.valorHomologado`,
      label: `Valor unitario homologado, comparable ${comparable.id}`,
      formula: "factor resultante × valor unitario",
      inputs: { factorResultante: resultant, valorUnitario: unitValue },
      value: resultant * unitValue,
    });
    return { id: comparable.id, unitValue, surfaceFactor: surface, resultantFactor: resultant, homologatedUnitValue: homologated };
  });

  const values = comparables.map((comparable) => comparable.homologatedUnitValue);
  const stats = describe(values);
  trace.record({
    key: `${keyPrefix}.promedioHomologado`,
    label: "Valor unitario homologado promedio",
    formula: "promedio de los valores homologados",
    inputs: Object.fromEntries(comparables.map((comparable) => [comparable.id, comparable.homologatedUnitValue])),
    value: stats.mean,
  });
  trace.record({
    key: `${keyPrefix}.dispersion`,
    label: "Dispersión (máximo / mínimo)",
    formula: "máximo / mínimo",
    inputs: { maximo: stats.max, minimo: stats.min },
    value: stats.dispersion,
  });
  return { comparables, stats };
}

function describe(values: number[]): HomologationStats {
  const count = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(count / 2);
  const median = count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = count > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1) : 0;
  const standardDeviation = Math.sqrt(variance);
  return {
    count,
    mean,
    min: sorted[0],
    max: sorted[count - 1],
    median,
    standardDeviation,
    coefficientOfVariation: standardDeviation / mean,
    dispersion: sorted[count - 1] / sorted[0],
  };
}

export type MarketApproachInput = HomologationInput & {
  /** Unit value the appraiser adopts; the homologated mean when missing. */
  adoptedUnitValue?: number;
  additionalAmount?: number;
};

export type MarketApproachResult = {
  homologation: HomologationResult;
  suggestedUnitValue: number;
  adoptedUnitValue: number;
  /** What the appraiser may adopt: within 30 % of the homologated mean and median. */
  adoptedLimits: { min: number; max: number };
  adoptedOutsideLimits: boolean;
  /** Lote tipo to subject, (lote tipo / subject)^(1/n); 1 when homologating against the subject. */
  subjectSurfaceFactor: number;
  value: number;
};

export function computeMarketApproach(input: MarketApproachInput, config: EngineConfig, trace = new Trace()): MarketApproachResult {
  const homologation = homologate(input, config.surfaceOrientation.market, trace, "mercado");
  const suggestedUnitValue = homologation.stats.mean;
  const adoptedLimits = adoptedValueLimits(homologation.stats);
  const adoptedUnitValue = trace.record({
    key: "mercado.valorAdoptado",
    label: "Valor unitario adoptado",
    formula: input.adoptedUnitValue === undefined ? "promedio homologado (sugerido)" : "captura del perito",
    inputs: { sugerido: suggestedUnitValue, capturado: input.adoptedUnitValue ?? null },
    value: input.adoptedUnitValue ?? suggestedUnitValue,
  });
  const scale = input.unitScale ?? 1;
  const indirect = config.indirectSubjectFactor && input.baseArea !== undefined && input.baseArea !== input.subjectArea;
  const subjectSurfaceFactor = indirect
    ? trace.record({
        key: "mercado.factorSuperficieSujeto",
        label: "Factor de superficie del sujeto contra el lote tipo",
        formula: "(lote tipo / superficie del sujeto)^(1/n)",
        inputs: { loteTipo: input.baseArea as number, superficieSujeto: input.subjectArea, n: input.surfacePower },
        value: surfaceFactor(input.baseArea as number, input.subjectArea, input.surfacePower, "reference-over-subject"),
      })
    : 1;
  const area = scale === 1 ? input.subjectArea : input.subjectArea / scale;
  const subtotal = trace.record({
    key: "mercado.subtotal",
    label: "Subtotal",
    formula: `superficie del sujeto${scale === 1 ? "" : ` / ${scale}`} × valor adoptado${indirect ? " × factor de superficie del sujeto" : ""}`,
    inputs: { superficieSujeto: input.subjectArea, valorAdoptado: adoptedUnitValue, ...(indirect ? { factorSuperficieSujeto: subjectSurfaceFactor } : {}) },
    value: indirect ? area * adoptedUnitValue * subjectSurfaceFactor : area * adoptedUnitValue,
  });
  const digits = config.rounding.market.comparativeValue;
  const value = trace.record({
    key: "mercado.valor",
    label: "Valor comparativo de mercado",
    formula: "subtotal + monto adicional",
    inputs: { subtotal, montoAdicional: input.additionalAmount ?? 0 },
    value: roundIfSet(subtotal + (input.additionalAmount ?? 0), digits),
    ...(digits === null ? {} : { rounding: digits }),
  });
  return {
    homologation,
    suggestedUnitValue,
    adoptedUnitValue,
    adoptedLimits,
    adoptedOutsideLimits: adoptedUnitValue < adoptedLimits.min - 1e-9 || adoptedUnitValue > adoptedLimits.max + 1e-9,
    subjectSurfaceFactor,
    value,
  };
}

/**
 * A guard against typing 130,000 for 13,000: the adopted value stays within
 * 30 % of the homologated mean and median (below the lower, above the higher).
 */
export function adoptedValueLimits(stats: Pick<HomologationStats, "mean" | "median">) {
  return {
    min: Math.min(stats.mean, stats.median) * (1 - ADOPTED_VALUE_TOLERANCE),
    max: Math.max(stats.mean, stats.median) * (1 + ADOPTED_VALUE_TOLERANCE),
  };
}
