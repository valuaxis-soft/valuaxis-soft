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

/** The approaches that round their own value (the physical value, the comparative value), in the system and in the books. */
const ROUNDS_ITS_OWN: ReadonlySet<Approach> = new Set(["costos", "mercado"]);

export function concludeValue(input: ConclusionInput, config: EngineConfig, trace = new Trace()): ConclusionResult {
  const digits = config.rounding.conclusion;
  // One figure per value (FAL-14): the cost and market values are listed as their approach printed them.
  const roundsAgain = (approach: Approach) => config.rounding.summaryRoundsApproaches !== false || !ROUNDS_ITS_OWN.has(approach);
  const summary: Partial<Record<Approach, number | null>> = {};
  for (const [approach, value] of Object.entries(input.values) as [Approach, number | null][]) {
    const rounding = roundsAgain(approach) ? digits : null;
    summary[approach] = value === null
      ? null
      : trace.record({
          key: `conclusion.${approach}`,
          label: `Valor por ${APPROACH_LABELS[approach].toLowerCase()}`,
          formula: "valor del enfoque",
          inputs: { valor: value },
          value: roundIfSet(value, rounding),
          ...(rounding === null ? {} : { rounding }),
        });
  }

  const value = input.method.kind === "single"
    ? selectApproach(summary, input.method.approach, roundsAgain(input.method.approach) ? null : digits, trace)
    : weightApproaches(summary, input.method.weights, digits, trace);
  return { summary, value, valueInWords: amountInWords(value) };
}

/** The value of the approach concluded with; `digits`, the conclusion's rounding when the summary did not apply it. */
function selectApproach(summary: Partial<Record<Approach, number | null>>, approach: Approach, digits: number | null, trace: Trace): number {
  const value = summary[approach];
  if (value === null || value === undefined) {
    throw new Error(`El ${APPROACH_LABELS[approach].toLowerCase()} no tiene valor para concluir.`);
  }
  return trace.record({
    key: "conclusion.valorConcluido",
    label: "Valor concluido",
    formula: `valor por ${APPROACH_LABELS[approach].toLowerCase()}`,
    inputs: { [approach]: value },
    value: roundIfSet(value, digits),
    ...(digits === null ? {} : { rounding: digits }),
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
