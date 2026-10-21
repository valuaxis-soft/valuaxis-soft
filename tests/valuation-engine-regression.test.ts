import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RECOMMENDED_REGRESSION_COMPARABLES,
  fitLinearRegression,
  type EstimationInput,
  type RegressionFit,
} from "../src/features/valuations/engine/regression";
import { Trace } from "../src/features/valuations/engine/trace";

/** REG.LIN.3 of "2._Regresion_Lineal_Multiple.xlsx": X = surface, Y = $/m², Z = age. */
const WORKBOOK = {
  x: [455, 230, 250, 240, 220, 200, 210, 200, 250, 200],
  y: [39, 35, 32, 32, 35, 37, 34, 40, 32, 40],
  z: [5, 10, 10, 5, 9, 9, 5, 6, 6, 5],
};
const workbookInput = (): EstimationInput => ({
  dependent: "$/m²",
  variables: ["Superficie", "Edad"],
  observations: WORKBOOK.x.map((x, index) => ({ id: String(index + 1), y: WORKBOOK.y[index], x: [x, WORKBOOK.z[index]] })),
  subject: [200, 12],
});

function fitted(input: EstimationInput, trace?: Trace): RegressionFit {
  const outcome = fitLinearRegression(input, trace);
  assert.ok(outcome.ok, outcome.ok ? "" : outcome.reason);
  return outcome.fit;
}

/** Within `ulps` units in the last place: floating precision, not a tolerance of the method. */
function closeTo(actual: number, expected: number, ulps = 2) {
  const ulp = Math.abs(expected) * Number.EPSILON;
  assert.ok(Math.abs(actual - expected) <= ulps * ulp, `${actual} ≠ ${expected}`);
}

test("REG.LIN.3: the constants, the estimated $/m² and the value of the workbook, to floating precision", () => {
  const trace = new Trace();
  const fit = fitted(workbookInput(), trace);
  // C51:C53, K50 and K52 of the sheet.
  assert.equal(fit.coefficients[0], 37.242816724519066);
  closeTo(fit.coefficients[1], 0.003470217212981801);
  closeTo(fit.coefficients[2], -0.3563935786151572);
  assert.equal(fit.estimate, 33.66013722373354);
  assert.equal(fit.estimate * 200, 6732.027444746708);
  assert.equal(fit.equation, "Y = A + BX + CZ");
  // Row 41: N and the sums of X, Y, Z, X², Z², XY, XZ, YZ.
  assert.deepEqual(fit.columns.map((column) => [column.name, column.sum]), [
    ["N", 10], ["X", 2455], ["Y", 356], ["Z", 70], ["X²", 655025], ["Z²", 534], ["XY", 87715], ["XZ", 16805], ["YZ", 2475],
  ]);
  assert.equal(fit.columns.find((column) => column.name === "XY")?.values[0], 17745);
  assert.equal(fit.n, 10);
  assert.equal(fit.reliable, false, "ten comparables are below the recommended thirty");
  assert.equal(fit.residuals.length, 10);
  closeTo(fit.residuals[0].residual, 39 - (fit.coefficients[0] + fit.coefficients[1] * 455 + fit.coefficients[2] * 5), 64);
  // Every step is in the trace, for the calculation memory.
  assert.equal(trace.find("regresion.estimado")?.formula, "A + BX + CZ");
  assert.equal(trace.find("regresion.estimado")?.inputs.X, 200);
  assert.equal(trace.find("regresion.suma.YZ")?.value, 2475);
  assert.ok(trace.find("regresion.constante.C"));
  assert.ok(trace.find("regresion.residuo.10"));
  assert.ok(trace.find("regresion.r2"));
});

test("REG LIN: the simple regression of the workbook, Y = A + BX", () => {
  const fit = fitted({
    dependent: "$/m²",
    variables: ["Superficie"],
    observations: [[160, 2000], [120, 1500], [160, 1800], [105, 2100]].map(([x, y], index) => ({ id: String(index + 1), y, x: [x] })),
    subject: [110],
  });
  // C28, C24, F28 and F31 of the sheet.
  assert.equal(fit.coefficients[0], 1835.6200527704486);
  assert.equal(fit.coefficients[1], 0.10554089709762533);
  assert.equal(fit.estimate, 1847.2295514511875);
  assert.equal(fit.estimate * 110, 203195.25065963063);
  assert.equal(fit.equation, "Y = A + BX");
  assert.deepEqual(fit.columns.map((column) => column.sum), [4, 545, 7400, 76625, 1008500]);
});

/** Cramer's rule on the raw normal equations, with determinants by cofactors: another way to the same solution. */
function cramer(rows: number[][], ys: number[]) {
  const design = rows.map((row) => [1, ...row]);
  const size = design[0].length;
  const normal = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => design.reduce((total, row) => total + row[i] * row[j], 0)));
  const right = Array.from({ length: size }, (_, i) => design.reduce((total, row, index) => total + row[i] * ys[index], 0));
  const det = (matrix: number[][]): number => (matrix.length === 1 ? matrix[0][0]
    : matrix[0].reduce((total, value, j) => total + (j % 2 ? -1 : 1) * value * det(matrix.slice(1).map((row) => row.filter((_, c) => c !== j))), 0));
  const determinant = det(normal);
  return Array.from({ length: size }, (_, j) => det(normal.map((row, i) => row.map((value, c) => (c === j ? right[i] : value)))) / determinant);
}

test("three variables: the same constants as Cramer's rule, and R², adjusted R² and the standard error", () => {
  // Surface, age and quality (popular 1 … lujo 4) of twelve comparables, with $/m².
  const rows = [
    [120, 5, 2], [95, 12, 1], [150, 3, 3], [200, 8, 3], [80, 20, 1], [130, 10, 2],
    [175, 2, 4], [110, 15, 2], [160, 6, 3], [90, 25, 1], [220, 4, 4], [140, 9, 2],
  ];
  const ys = [15200, 11800, 18900, 17600, 9900, 14100, 22800, 12600, 18100, 9200, 23900, 14800];
  const fit = fitted({
    dependent: "$/m²",
    variables: ["Superficie", "Edad", "Calidad"],
    observations: rows.map((x, index) => ({ id: String(index + 1), y: ys[index], x })),
    subject: [150, 7, 3],
  });
  const expected = cramer(rows, ys);
  fit.coefficients.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= 1e-9 * Math.max(1, Math.abs(expected[index])), `${value} ≠ ${expected[index]}`));
  assert.equal(fit.equation, "Y = A + BX + CZ + DW");
  const predict = (x: number[]) => expected[0] + x.reduce((total, value, j) => total + value * expected[j + 1], 0);
  assert.ok(Math.abs(fit.estimate - predict([150, 7, 3])) < 1e-8);
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const residual = rows.reduce((total, x, index) => total + (ys[index] - predict(x)) ** 2, 0);
  const totalSquares = ys.reduce((total, y) => total + (y - mean) ** 2, 0);
  const r2 = 1 - residual / totalSquares;
  assert.ok(Math.abs((fit.rSquared as number) - r2) < 1e-12);
  assert.ok(Math.abs((fit.adjustedRSquared as number) - (1 - ((1 - r2) * 11) / 8)) < 1e-12);
  assert.ok(Math.abs(fit.standardError - Math.sqrt(residual / 8)) < 1e-6);
  assert.equal(fit.columns.length, 1 + 4 + 3 + 6, "N, X Y Z W, three squares and the six products");
});

test("a design that is exactly linear gives back its constants and R² = 1", () => {
  const rows = [[1, 4, 2], [2, 1, 7], [3, 9, 1], [4, 2, 2], [5, 6, 5], [6, 3, 8]];
  const fit = fitted({
    dependent: "precio",
    variables: ["a", "b", "c"],
    observations: rows.map((x, index) => ({ id: String(index + 1), y: 5 + 2 * x[0] - 3 * x[1] + 0.5 * x[2], x })),
    subject: [10, 1, 4],
  });
  [5, 2, -3, 0.5].forEach((value, index) => assert.ok(Math.abs(fit.coefficients[index] - value) < 1e-12));
  assert.ok(Math.abs(fit.estimate - (5 + 20 - 3 + 2)) < 1e-12);
  assert.ok(Math.abs((fit.rSquared as number) - 1) < 1e-12);
  assert.ok(fit.residuals.every((row) => Math.abs(row.residual) < 1e-10));
});

test("singular designs and too few comparables answer with a reason, without throwing", () => {
  const base = workbookInput();
  const reason = (input: EstimationInput) => {
    const outcome = fitLinearRegression(input);
    assert.equal(outcome.ok, false);
    return outcome.ok ? "" : outcome.reason;
  };
  // An age the same in every comparable.
  assert.match(reason({ ...base, observations: base.observations.map((row) => ({ ...row, x: [row.x[0], 7] })) }), /«Edad» tiene el mismo valor en todos los comparables/);
  // An age that is the surface over ten: collinear.
  assert.match(reason({ ...base, observations: base.observations.map((row) => ({ ...row, x: [row.x[0], row.x[0] / 10] })) }), /«Edad» depende linealmente de «Superficie»/);
  // Three variables where the third is the sum of the other two.
  assert.match(
    reason({ ...base, variables: ["Superficie", "Edad", "Suma"], subject: [200, 12, 212], observations: base.observations.map((row) => ({ ...row, x: [...row.x, row.x[0] + row.x[1]] })) }),
    /«Suma» depende linealmente de «Superficie», «Edad»/,
  );
  // n = k + 1 passes through every point: nothing left to measure the error with.
  assert.equal(reason({ ...base, observations: base.observations.slice(0, 3) }), "Con 2 variables la regresión necesita al menos 4 comparables; hay 3.");
  assert.equal(reason({ ...base, observations: [] }), "Con 2 variables la regresión necesita al menos 4 comparables; hay 0.");
  assert.equal(reason({ ...base, variables: [], subject: [], observations: base.observations.map((row) => ({ ...row, x: [] })) }), "Elige al menos una variable para la regresión.");
  assert.equal(reason({ ...base, subject: [200, Number.NaN] }), "Los datos de la regresión deben ser números.");
  assert.equal(reason({ ...base, subject: [200] }), "Cada comparable y el sujeto necesitan un valor por variable.");
});

test("every Y the same: the constants are found, R² does not apply", () => {
  const base = workbookInput();
  const fit = fitted({ ...base, observations: base.observations.map((row) => ({ ...row, y: 30 })) });
  assert.ok(Math.abs(fit.estimate - 30) < 1e-12);
  assert.equal(fit.rSquared, null);
  assert.equal(fit.adjustedRSquared, null);
});

test("more than thirty comparables is the recommended size", () => {
  const observations = Array.from({ length: RECOMMENDED_REGRESSION_COMPARABLES + 1 }, (_, index) => ({ id: String(index + 1), y: 100 + index * 2 + (index % 3), x: [index] }));
  assert.equal(fitted({ dependent: "$/m²", variables: ["x"], observations, subject: [5] }).reliable, true);
  assert.equal(fitted({ dependent: "$/m²", variables: ["x"], observations: observations.slice(1), subject: [5] }).reliable, false);
});
