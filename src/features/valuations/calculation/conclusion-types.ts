/**
 * Conclusion of the valuation as the editor and the API exchange it: the value
 * each approach stored, how the appraiser concludes, and the concluded value.
 */
import type { Approach, ConclusionInput } from "../engine/conclusion";

export type ConclusionMethod = ConclusionInput["method"];

export type ConclusionSettingsDto = { method: ConclusionMethod; justification: string | null };

export type ConclusionCalculationDto = ConclusionSettingsDto & {
  /** Value each approach stored; null when it does not apply. */
  values: Record<Approach, number | null>;
  /** The market value comes from the building comparables when there are any, else from land. */
  marketSource: "INMUEBLE_VENTA" | "TERRENO_VENTA" | null;
  configured: boolean;
  locked: boolean;
};

/** Until the appraiser decides, conclude with the first approach that has a value, cost first as in Arandas. */
export function defaultMethod(values: Record<Approach, number | null>): ConclusionMethod {
  const approach = (["costos", "mercado", "ingresos"] as const).find((key) => values[key] !== null) ?? "costos";
  return { kind: "single", approach };
}

export function canConclude(calculation: Pick<ConclusionCalculationDto, "values" | "method">) {
  if (calculation.method.kind === "single") return calculation.values[calculation.method.approach] !== null;
  const weights = calculation.method.weights;
  const used = (Object.keys(weights) as Approach[]).filter((key) => (weights[key] ?? 0) > 0 && calculation.values[key] !== null);
  return used.length > 0 && Math.abs(used.reduce((sum, key) => sum + (weights[key] ?? 0), 0) - 1) < 1e-9;
}
