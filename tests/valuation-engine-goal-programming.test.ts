import assert from "node:assert/strict";
import { test } from "node:test";
import { goalProgramLp, solveGoalProgram } from "../src/features/valuations/calculation/goal-programming-solver";
import { goalProgramProblem, goalProgrammingWarnings, readGoalSolution, type GoalProgrammingFit } from "../src/features/valuations/engine/goal-programming";
import type { EstimationInput } from "../src/features/valuations/engine/regression";
import { Trace } from "../src/features/valuations/engine/trace";

/** The appraiser's Excel (sheet of the LINGO model): six houses, seven criteria, the price as Y. */
const CRITERIA = ["M2T", "M2C", "NoPlantas", "VUR", "NoRec", "EdoCon", "Colonia"];
const WORKBOOK: EstimationInput = {
  dependent: "Precio",
  variables: CRITERIA,
  observations: [
    [106, 136, 2, 42, 3, 3, 4],
    [204, 229, 2, 30, 5, 2, 1],
    [176, 260, 2, 35, 3, 3, 3],
    [77, 114, 2, 55, 3, 4, 1],
    [180, 216, 2, 55, 4, 4, 4],
    [140, 194, 3, 50, 3, 3, 4],
  ].map((x, index) => ({ id: String(index + 1), x, y: [3450000, 3850000, 5150000, 2490000, 4850000, 5500000][index] })),
  subject: [137.24, 146.52, 2, 40, 3, 3, 1],
};

/** Example 2 of the course: LINGO gives 123,301.42 and 1,143,519.88. */
const COURSE: EstimationInput = {
  dependent: "Precio",
  variables: CRITERIA,
  observations: [
    [110.5, 92.3, 2, 66, 3, 3, 8],
    [105, 130, 2, 65, 3, 2, 2],
    [90, 75, 2, 69, 2, 4, 4],
    [85.2, 83.2, 1, 67, 3, 3, 1],
    [105, 110, 2, 65, 3, 2, 2.5],
    [107.5, 122.3, 3, 66, 4, 2, 5.5],
  ].map((x, index) => ({ id: String(index + 1), x, y: [1320000, 1210000, 875000, 750000, 1100000, 1520000][index] })),
  subject: [102, 90, 2, 68, 3, 3, 5],
};

const TOLERANCE = 0.05;
const near = (actual: number, expected: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= TOLERANCE, `${what}: ${actual} ≠ ${expected}`);

async function solved(input: EstimationInput, trace?: Trace): Promise<GoalProgrammingFit> {
  const problem = goalProgramProblem(input);
  assert.ok(problem.ok, problem.ok ? "" : problem.reason);
  const outcome = readGoalSolution(input, await solveGoalProgram(problem.problem), trace);
  assert.ok(outcome.ok, outcome.ok ? "" : outcome.reason);
  return outcome.fit;
}

test("the client's workbook gives LINGO's solution: objective, coefficients, deviations and value", async () => {
  const trace = new Trace();
  const fit = await solved(WORKBOOK, trace);
  near(fit.objective, 1149695.65, "objetivo");
  const expected = [0, 11826.087, 378623.188, 0, 0, 0, 384579.71];
  fit.coefficients.forEach((value, j) => near(value, expected[j], CRITERIA[j]));
  near(fit.deviations[0].negative, 453913.04, "nComp1");
  near(fit.deviations[2].positive, 164231.88, "pComp3");
  near(fit.deviations[5].positive, 531550.72, "pComp6");
  for (const index of [1, 3, 4]) {
    assert.equal(fit.deviations[index].positive + fit.deviations[index].negative, 0, `comparable ${index + 1} on its price`);
  }
  near(fit.estimate, 2874584.35, "valor del sujeto");
  // Comparables off their price are to be looked at; the criteria at 0 do not contribute.
  assert.deepEqual(fit.deviations.filter((row) => row.observe).map((row) => row.id), ["1", "3", "6"]);
  assert.deepEqual(fit.contributions.filter((row) => !row.contributes).map((row) => row.name), ["M2T", "VUR", "NoRec", "EdoCon"]);
  near(fit.contributions[1].contribution, 11826.087 * 146.52, "contribución M2C");
  // Every step in the trace, for the calculation memory.
  near(trace.find("metas.valor")?.value ?? 0, 2874584.35, "rastro del valor");
  near(trace.find("metas.objetivo")?.value ?? 0, 1149695.65, "rastro del objetivo");
  assert.ok(trace.find("metas.coeficiente.7"));
  assert.ok(trace.find("metas.n.1"));
});

test("the course's second example: objective 123,301.42 and value 1,143,519.88", async () => {
  const fit = await solved(COURSE);
  near(fit.objective, 123301.42, "objetivo");
  near(fit.estimate, 1143519.88, "valor del sujeto");
  assert.ok(fit.coefficients.every((value) => value >= 0), "LINGO's bounds: no negative coefficient");
});

test("the model is LINGO's, written in LP format: no intercept, weights of 1, every variable ≥ 0", () => {
  const lp = goalProgramLp({ x: [[1, -2.5, 0], [3, 4, 5]], y: [10, 20] });
  assert.equal(lp, "Minimize\n obj: p0 + n0 + p1 + n1\nSubject To\n c0: + 1 b0 - 2.5 b1 + p0 - n0 = 10\n c1: + 3 b0 + 4 b1 + 5 b2 + p1 - n1 = 20\nEnd\n");
});

test("too few comparables or a missing datum are said, not solved", () => {
  const few = goalProgramProblem({ ...WORKBOOK, observations: WORKBOOK.observations.slice(0, 1) });
  assert.ok(!few.ok);
  assert.match(few.reason, /al menos 2 comparables; hay 1/);
  // Fewer comparables than criteria, as the client's own workbook (6 and 7), is solved with a warning.
  assert.match(goalProgrammingWarnings(6, 7).join(" "), /menos comparables \(6\) que criterios \(7\)/);
  assert.deepEqual(goalProgrammingWarnings(10, 7), []);
  const none = goalProgramProblem({ ...WORKBOOK, variables: [], subject: [], observations: [] });
  assert.ok(!none.ok);
  const broken = goalProgramProblem({ ...WORKBOOK, subject: [...WORKBOOK.subject.slice(0, 6), Number.NaN] });
  assert.ok(!broken.ok);
  const failed = readGoalSolution(WORKBOOK, { status: "FAILED", message: "sin óptimo" });
  assert.ok(!failed.ok);
  assert.equal(failed.reason, "sin óptimo");
});
