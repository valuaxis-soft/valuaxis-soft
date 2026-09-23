/**
 * Comparative market approach and the homologation it shares with the rent
 * market. Formulas follow docs/fase0/metodologia/02-mercado-homologacion.md.
 */
import type { EngineConfig, SurfaceOrientation } from "./config";
import { productInOrder, resolveFactorSlots, surfaceFactor, type FactorSlot } from "./factors";
import { excelRound, roundIfSet } from "./rounding";
import { Trace } from "./trace";

export type ComparableInput = {
  id: string;
  /** Offer price (or monthly rent in the rent market). */
  price: number;
  area: number;
  /** Factors in capture order, with SURFACE_SLOT where the surface factor goes. */
  factors: FactorSlot[];
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
  /** Power n suggested by consecutive comparables (mode); informative, as in the books. */
  suggestedPower: number | null;
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
    const surface = trace.record({
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
  return { comparables, stats, suggestedPower: suggestPower(input.comparables, comparables) };
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

/**
 * Implied power between consecutive comparables: Vu ∝ S^(−1/n), so
 * 1/n = log(Vu_j / Vu_j+1) / log(S_j / S_j+1). Returns the most frequent n,
 * the first one in capture order on a tie (Excel's MODE.SNGL).
 */
function suggestPower(inputs: ComparableInput[], results: HomologatedComparable[]): number | null {
  const powers: number[] = [];
  for (let index = 0; index + 1 < inputs.length; index += 1) {
    const areaRatio = Math.log10(inputs[index].area / inputs[index + 1].area);
    if (areaRatio === 0) continue;
    const inverse = Math.log10(results[index].unitValue / results[index + 1].unitValue) / areaRatio;
    if (inverse === 0) continue;
    powers.push(Math.abs(excelRound(1 / inverse, 0)));
  }
  let best: number | null = null;
  let bestCount = 1;
  for (const power of powers) {
    const count = powers.filter((candidate) => candidate === power).length;
    if (count > bestCount) {
      best = power;
      bestCount = count;
    }
  }
  return best;
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
  /** The adopted value is outside the homologated range. */
  adoptedOutsideRange: boolean;
  value: number;
};

export function computeMarketApproach(input: MarketApproachInput, config: EngineConfig, trace = new Trace()): MarketApproachResult {
  const homologation = homologate(input, config.surfaceOrientation.market, trace, "mercado");
  const suggestedUnitValue = homologation.stats.mean;
  const adoptedUnitValue = trace.record({
    key: "mercado.valorAdoptado",
    label: "Valor unitario adoptado",
    formula: input.adoptedUnitValue === undefined ? "promedio homologado (sugerido)" : "captura del perito",
    inputs: { sugerido: suggestedUnitValue, capturado: input.adoptedUnitValue ?? null },
    value: input.adoptedUnitValue ?? suggestedUnitValue,
  });
  const scale = input.unitScale ?? 1;
  const subtotal = trace.record({
    key: "mercado.subtotal",
    label: "Subtotal",
    formula: scale === 1 ? "superficie del sujeto × valor adoptado" : `superficie del sujeto / ${scale} × valor adoptado`,
    inputs: { superficieSujeto: input.subjectArea, valorAdoptado: adoptedUnitValue },
    value: scale === 1 ? input.subjectArea * adoptedUnitValue : (input.subjectArea / scale) * adoptedUnitValue,
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
    adoptedOutsideRange: adoptedUnitValue < homologation.stats.min || adoptedUnitValue > homologation.stats.max,
    value,
  };
}
