/**
 * Programación por metas (goal programming), as the appraiser's course and
 * workbook solve it in LINGO: the price of each comparable is the goal, the
 * coefficients of its criteria weigh how much each one is worth, and the
 * deviations above (p) and below (n) the goal are as small as possible.
 *
 *   min Σᵢ (pᵢ + nᵢ)
 *   s.a. Σⱼ xᵢⱼ·bⱼ + pᵢ − nᵢ = yᵢ   for each comparable i
 *        bⱼ, pᵢ, nᵢ ≥ 0             (LINGO's default bounds)
 *
 * No intercept and every weight 1, exactly as LINGO. The value of the subject
 * is Σⱼ bⱼ·sujetoⱼ. A reference beside the regression and the homologation;
 * it never replaces the value adopted.
 *
 * The linear program is solved outside the engine (HiGHS on the server,
 * `calculation/goal-programming-solver.ts`); this module states the problem
 * and reads the solution back, pure, so the browser and the calculation
 * memory read the same result the server solved.
 */
import type { EstimationInput } from "./regression";
import { Trace } from "./trace";

/** What the solver is asked: the criteria of each comparable (rows) and its price. */
export type GoalProgramProblem = { x: number[][]; y: number[] };

/** The solver's answer: the optimal coefficients and deviations, or why there are none. */
export type GoalProgramSolution =
  | { status: "OPTIMAL"; objective: number; coefficients: number[]; positive: number[]; negative: number[] }
  | { status: "FAILED"; message: string };

/** The deviation of a comparable from its price: p when the model falls short, n when it goes over. */
export type GoalDeviation = {
  id: string;
  observed: number;
  /** Σⱼ bⱼ·xᵢⱼ. */
  fitted: number;
  positive: number;
  negative: number;
  /** A comparable the model does not reach exactly: the appraiser should look at it ("a observar"). */
  observe: boolean;
};

/** A criterion's part of the subject's value. */
export type GoalContribution = {
  name: string;
  coefficient: number;
  subjectValue: number;
  contribution: number;
  /** A coefficient of 0: "este criterio no aporta en la solución". */
  contributes: boolean;
};

export type GoalProgrammingFit = {
  method: "PROGRAMACION_METAS";
  n: number;
  k: number;
  /** Σ (p + n) at the optimum. */
  objective: number;
  coefficients: number[];
  deviations: GoalDeviation[];
  contributions: GoalContribution[];
  /** Σⱼ bⱼ·sujetoⱼ. */
  estimate: number;
};

export type GoalProgrammingOutcome = { ok: true; fit: GoalProgrammingFit } | { ok: false; reason: string };

/**
 * The linear program has a solution with any number of comparables, and the
 * appraiser's own workbook solves seven criteria with six houses; so two is
 * the floor, and fewer comparables than criteria is a warning
 * (`goalProgrammingWarnings`), not a block. His course works with six to fifteen.
 */
export const MIN_GOAL_COMPARABLES = 2;
export const RECOMMENDED_GOAL_COMPARABLES = { min: 6, max: 15 } as const;

/** What the appraiser should know about the number of comparables; the model is solved anyway. */
export function goalProgrammingWarnings(n: number, k: number): string[] {
  const warnings: string[] = [];
  if (n < k) {
    warnings.push(`Hay menos comparables (${n}) que criterios (${k}): varios criterios quedarán en 0 y el resultado depende mucho de cada comparable.`);
  }
  if (n < RECOMMENDED_GOAL_COMPARABLES.min || n > RECOMMENDED_GOAL_COMPARABLES.max) {
    warnings.push(`Se recomiendan de ${RECOMMENDED_GOAL_COMPARABLES.min} a ${RECOMMENDED_GOAL_COMPARABLES.max} comparables; hay ${n}.`);
  }
  return warnings;
}

/** A deviation below a cent of a peso is the solver's arithmetic, not the comparable. */
const DEVIATION_TOLERANCE = 0.005;
/** Coefficients the solver leaves at 1e-12 are zero. */
const ZERO_COEFFICIENT = 1e-9;

/** The problem to solve, or why the data do not allow it yet. */
export function goalProgramProblem(input: EstimationInput): { ok: true; problem: GoalProgramProblem } | { ok: false; reason: string } {
  const k = input.variables.length;
  const n = input.observations.length;
  if (!k) return { ok: false, reason: "Elige al menos un criterio para la programación por metas." };
  if (input.subject.length !== k || input.observations.some((row) => row.x.length !== k)) {
    return { ok: false, reason: "Cada comparable y el sujeto necesitan un valor por criterio." };
  }
  const numbers = [...input.subject, ...input.observations.flatMap((row) => [row.y, ...row.x])];
  if (!numbers.every(Number.isFinite)) return { ok: false, reason: "Los datos de la programación por metas deben ser números." };
  if (n < MIN_GOAL_COMPARABLES) {
    return { ok: false, reason: `La programación por metas necesita al menos ${MIN_GOAL_COMPARABLES} comparables; hay ${n}.` };
  }
  return { ok: true, problem: { x: input.observations.map((row) => row.x), y: input.observations.map((row) => row.y) } };
}

/**
 * The fit the solution gives: coefficients, the deviation of each comparable,
 * the contribution of each criterion and the value of the subject, each step
 * in the trace.
 */
export function readGoalSolution(
  input: EstimationInput,
  solution: GoalProgramSolution,
  trace = new Trace(),
  keyPrefix = "metas",
): GoalProgrammingOutcome {
  if (solution.status !== "OPTIMAL") return { ok: false, reason: solution.message };
  const k = input.variables.length;
  if (solution.coefficients.length !== k || solution.positive.length !== input.observations.length) {
    return { ok: false, reason: "La solución guardada es de otros datos; vuelve a guardar para resolverla." };
  }
  const clean = (value: number) => (Math.abs(value) < ZERO_COEFFICIENT ? 0 : value);
  const coefficients = solution.coefficients.map(clean);
  coefficients.forEach((value, j) => trace.record({
    key: `${keyPrefix}.coeficiente.${j + 1}`,
    label: `Coeficiente de ${input.variables[j]}`,
    formula: "programación por metas: min Σ (p + n) s.a. Σ x·b + p − n = precio; b, p, n ≥ 0 (HiGHS)",
    inputs: { criterio: input.variables[j] },
    value,
  }));
  const deviations = input.observations.map((row, index): GoalDeviation => {
    const fitted = row.x.reduce((total, value, j) => total + value * coefficients[j], 0);
    const positive = clean(solution.positive[index]);
    const negative = clean(solution.negative[index]);
    trace.record({
      key: `${keyPrefix}.p.${row.id}`,
      label: `Desviación p (por debajo del precio), comparable ${row.id}`,
      formula: "precio − Σ x·b, cuando es positiva",
      inputs: { precio: row.y, estimado: fitted },
      value: positive,
    });
    trace.record({
      key: `${keyPrefix}.n.${row.id}`,
      label: `Desviación n (por encima del precio), comparable ${row.id}`,
      formula: "Σ x·b − precio, cuando es positiva",
      inputs: { precio: row.y, estimado: fitted },
      value: negative,
    });
    return { id: row.id, observed: row.y, fitted, positive, negative, observe: positive > DEVIATION_TOLERANCE || negative > DEVIATION_TOLERANCE };
  });
  const objective = trace.record({
    key: `${keyPrefix}.objetivo`,
    label: "Suma de desviaciones (función objetivo)",
    formula: "Σ (p + n)",
    inputs: Object.fromEntries(deviations.map((row) => [row.id, row.positive + row.negative])),
    value: deviations.reduce((total, row) => total + row.positive + row.negative, 0),
  });
  const contributions = coefficients.map((coefficient, j): GoalContribution => ({
    name: input.variables[j],
    coefficient,
    subjectValue: input.subject[j],
    contribution: coefficient * input.subject[j],
    contributes: coefficient !== 0,
  }));
  const estimate = trace.record({
    key: `${keyPrefix}.valor`,
    label: "Valor del sujeto por programación por metas",
    formula: "Σ coeficiente × valor del sujeto",
    inputs: Object.fromEntries(contributions.map((item) => [item.name, item.contribution])),
    value: contributions.reduce((total, item) => total + item.contribution, 0),
  });
  return {
    ok: true,
    fit: {
      method: "PROGRAMACION_METAS",
      n: input.observations.length,
      k,
      objective,
      coefficients,
      deviations,
      contributions,
      estimate,
    },
  };
}
