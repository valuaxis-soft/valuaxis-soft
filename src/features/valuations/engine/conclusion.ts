/**
 * Summary of values and concluded value. The books conclude with a single
 * approach, each one rounded in the summary; weighting is optional and off by
 * default until the appraiser decides (question 6).
 */
import { amountInWords } from "./amount-in-words";
import type { EngineConfig } from "./config";
import { roundIfSet } from "./rounding";
import { Trace } from "./trace";

export type Approach = "costos" | "mercado" | "ingresos";

export const APPROACH_LABELS: Record<Approach, string> = {
  costos: "Enfoque de costos",
  mercado: "Enfoque de mercado",
  ingresos: "Enfoque de ingresos",
};

export type ConclusionInput = {
  /** Value of each approach; `null` when it does not apply ("NO APLICA"). */
  values: Partial<Record<Approach, number | null>>;
  method: { kind: "single"; approach: Approach } | { kind: "weighted"; weights: Partial<Record<Approach, number>> };
};

export type ConclusionResult = {
  summary: Partial<Record<Approach, number | null>>;
  value: number;
  valueInWords: string;
};

export function concludeValue(input: ConclusionInput, config: EngineConfig, trace = new Trace()): ConclusionResult {
  const digits = config.rounding.conclusion;
  const summary: Partial<Record<Approach, number | null>> = {};
  for (const [approach, value] of Object.entries(input.values) as [Approach, number | null][]) {
    summary[approach] = value === null
      ? null
      : trace.record({
          key: `conclusion.${approach}`,
          label: `Valor por ${APPROACH_LABELS[approach].toLowerCase()}`,
          formula: "valor del enfoque",
          inputs: { valor: value },
          value: roundIfSet(value, digits),
          ...(digits === null ? {} : { rounding: digits }),
        });
  }

  const value = input.method.kind === "single"
    ? selectApproach(summary, input.method.approach, trace)
    : weightApproaches(summary, input.method.weights, digits, trace);
  return { summary, value, valueInWords: amountInWords(value) };
}

function selectApproach(summary: Partial<Record<Approach, number | null>>, approach: Approach, trace: Trace): number {
  const value = summary[approach];
  if (value === null || value === undefined) {
    throw new Error(`El ${APPROACH_LABELS[approach].toLowerCase()} no tiene valor para concluir.`);
  }
  return trace.record({
    key: "conclusion.valorConcluido",
    label: "Valor concluido",
    formula: `valor por ${APPROACH_LABELS[approach].toLowerCase()}`,
    inputs: { [approach]: value },
    value,
  });
}

function weightApproaches(
  summary: Partial<Record<Approach, number | null>>,
  weights: Partial<Record<Approach, number>>,
  digits: number | null,
  trace: Trace,
): number {
  const used = (Object.entries(weights) as [Approach, number][]).filter(([approach, weight]) => weight > 0 && typeof summary[approach] === "number");
  const totalWeight = used.reduce((sum, [, weight]) => sum + weight, 0);
  if (!used.length || Math.abs(totalWeight - 1) > 1e-9) {
    throw new Error("Los pesos de los enfoques con valor deben sumar 100 %.");
  }
  const weighted = used.reduce((sum, [approach, weight]) => sum + (summary[approach] as number) * weight, 0);
  return trace.record({
    key: "conclusion.valorConcluido",
    label: "Valor concluido (ponderado)",
    formula: used.map(([approach]) => `${approach} × peso`).join(" + "),
    inputs: Object.fromEntries(used.flatMap(([approach, weight]) => [[approach, summary[approach] as number], [`peso ${approach}`, weight]])),
    value: roundIfSet(weighted, digits),
    ...(digits === null ? {} : { rounding: digits }),
  });
}
