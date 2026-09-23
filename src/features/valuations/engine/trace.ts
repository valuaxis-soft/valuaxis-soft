/**
 * Traceability (COT-2026-001, feature 19): every value the engine produces is
 * recorded with the formula and the inputs it came from, so a figure in the
 * dictamen can be followed back to the data the appraiser captured.
 */
export type TraceInputs = Record<string, number | string | null>;

export type TraceStep = {
  /** Stable key, e.g. "costos.construcciones.T-1.vnrParcial". */
  key: string;
  label: string;
  /** Readable formula with the input names used in `inputs`. */
  formula: string;
  inputs: TraceInputs;
  value: number;
  /** Excel ROUND digits applied to this value, if any. */
  rounding?: number;
};

export class Trace {
  readonly steps: TraceStep[] = [];

  record(step: TraceStep): number {
    this.steps.push(step);
    return step.value;
  }

  find(key: string): TraceStep | undefined {
    return this.steps.find((step) => step.key === key);
  }
}
