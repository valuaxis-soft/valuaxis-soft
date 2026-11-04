/**
 * Conclusion of the valuation as the editor and the API exchange it: the value
 * each approach stored, how the appraiser concludes, and the concluded value.
 */
import type { Approach, ConclusionInput } from "../engine/conclusion";
import { DEFAULT_ENGINE_CONFIG, withRounding, type EngineConfig } from "../engine/config";
import type { CapturedFormulas, PercentFields } from "./captured-formulas";
import type { ReportApproach } from "../services/report-approaches";

export type ConclusionMethod = ConclusionInput["method"];

/**
 * The values a valuation may list in its "resumen de valores" (video 5.1,
 * 3 Nov 2026): the approaches and the statistical methods of the market for
 * sale. The appraiser picks which ones the conclusion lists and names each.
 */
export const SUMMARY_SOURCES = ["costos", "mercado-inmuebles", "mercado-terrenos", "mercado-rentas", "ingresos", "regresion", "metas"] as const;
export type SummarySource = (typeof SUMMARY_SOURCES)[number];

export const SUMMARY_SOURCE_LABELS: Record<SummarySource, string> = {
  costos: "Valor por enfoque de costos",
  "mercado-inmuebles": "Valor por enfoque de mercado",
  "mercado-terrenos": "Valor de terreno por enfoque de mercado",
  "mercado-rentas": "Cálculo de renta mensual",
  ingresos: "Valor por enfoque de ingresos",
  regresion: "Valor estimado por regresión",
  metas: "Valor estimado por programación por metas",
};

/** One line of the resumen de valores: which value, under the name the appraiser wrote. */
export type ConclusionSummaryRow = { source: SummarySource; label: string };

export type ConclusionSettingsDto = {
  method: ConclusionMethod;
  justification: string | null;
  /**
   * The lines of the resumen de valores the appraiser chose; absent, the
   * conclusion lists the three approaches as always. With one line only,
   * the concluded value is that value.
   */
  summaryRows?: ConclusionSummaryRow[];
  /** Excel ROUND digits of the concluded value, the appraiser's choice; undefined keeps the default, null is no rounding. */
  rounding?: number | null;
  /** Formulas typed in the weights ("method.weights.costos"); absent keeps the stored ones whose value did not change. */
  formulas?: CapturedFormulas;
};

/** The weights are typed as percentages. */
export const CONCLUSION_PERCENT_FIELDS: PercentFields = (path) => path.startsWith("method.weights.");

export function conclusionEngineConfig(settings: Pick<ConclusionSettingsDto, "rounding">): EngineConfig {
  return settings.rounding === undefined ? DEFAULT_ENGINE_CONFIG : withRounding(DEFAULT_ENGINE_CONFIG, { conclusion: settings.rounding });
}

export type ConclusionCalculationDto = ConclusionSettingsDto & {
  /** Value each approach stored; null when it does not apply. */
  values: Record<Approach, number | null>;
  /** The market value comes from the building comparables when there are any, else from land; from the equipment offers in a machinery valuation. */
  marketSource: "INMUEBLE_VENTA" | "TERRENO_VENTA" | "MAQUINARIA_VENTA" | null;
  /** The approaches the document leaves out of the dictamen: their values read "no aplica". */
  excluded?: ReportApproach[];
  /** Every value the valuation has to list in the resumen de valores; null when it is not calculated. */
  available?: Partial<Record<SummarySource, number | null>>;
  configured: boolean;
  locked: boolean;
};

/** The approach slot of the engine a summary value concludes through. */
export function summarySourceApproach(source: SummarySource): Approach {
  if (source === "costos" || source === "ingresos") return source;
  return "mercado";
}

/** The lines of the resumen de valores with their values: the rows chosen, or none when the conclusion lists the approaches as always. */
export function summaryRowValues(calculation: Pick<ConclusionCalculationDto, "summaryRows" | "available">): Array<ConclusionSummaryRow & { value: number | null }> {
  return (calculation.summaryRows ?? []).map((row) => ({
    ...row,
    label: row.label.trim() || SUMMARY_SOURCE_LABELS[row.source],
    value: calculation.available?.[row.source] ?? null,
  }));
}

/**
 * What the engine concludes with: the method over the approach values as
 * always, except when the resumen lists one value only: then that value is
 * the concluded one, through the approach slot it belongs to.
 */
export function conclusionInput(calculation: Pick<ConclusionCalculationDto, "values" | "method" | "summaryRows" | "available">): ConclusionInput {
  const rows = summaryRowValues(calculation);
  if (rows.length !== 1 || rows[0].value === null) return { values: calculation.values, method: calculation.method };
  const approach = summarySourceApproach(rows[0].source);
  return { values: { costos: null, mercado: null, ingresos: null, [approach]: rows[0].value }, method: { kind: "single", approach } };
}

/** Until the appraiser decides, conclude with the first approach that has a value, cost first as in Arandas. */
export function defaultMethod(values: Record<Approach, number | null>): ConclusionMethod {
  const approach = (["costos", "mercado", "ingresos"] as const).find((key) => values[key] !== null) ?? "costos";
  return { kind: "single", approach };
}

export function canConclude(calculation: Pick<ConclusionCalculationDto, "values" | "method" | "summaryRows" | "available">) {
  const { values, method } = conclusionInput(calculation);
  if (method.kind === "single") return values[method.approach] !== null;
  const weights = method.weights;
  const used = (Object.keys(weights) as Approach[]).filter((key) => (weights[key] ?? 0) > 0 && values[key] !== null);
  return used.length > 0 && Math.abs(used.reduce((sum, key) => sum + (weights[key] ?? 0), 0) - 1) < 1e-9;
}
