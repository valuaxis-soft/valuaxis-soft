/**
 * Statistical estimates of a unit value from the comparables, beside the
 * homologated mean and median: a reference for the appraiser, never the value
 * adopted. Linear regression follows the appraiser's workbook
 * "2._Regresion_Lineal_Multiple.xlsx" (sheets REG LIN and REG.LIN.3):
 * Y = A + B·X + C·Z…, with Y the price or $/m² and X, Z… the variables he
 * chooses. Other methods (goal programming, for one) take the same input and
 * go next to it under their own `EstimationMethod`.
 */
import { Trace } from "./trace";

export type EstimationMethod = "REGRESION_LINEAL";

export const ESTIMATION_METHOD_LABELS: Record<EstimationMethod, string> = {
  REGRESION_LINEAL: "Regresión lineal (mínimos cuadrados)",
};

/** Letters of the workbook: Y the dependent variable, X and Z the first two variables, A, B, C… the constants. */
export const VARIABLE_LETTERS = ["X", "Z", "W", "V", "U", "T"] as const;
export const CONSTANT_LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;
export const MAX_REGRESSION_VARIABLES = VARIABLE_LETTERS.length;
/** The appraiser recommends more than 30 comparables; with fewer the result is a weak reference. */
export const RECOMMENDED_REGRESSION_COMPARABLES = 30;

export type EstimationInput = {
  /** Name of Y as the appraiser reads it ("$/m²", "precio"). */
  dependent: string;
  /** Names of the explanatory variables, in the order of `x`. */
  variables: string[];
  observations: Array<{ id: string; y: number; x: number[] }>;
  /** The subject's value of each variable, in the same order. */
  subject: number[];
};

/** A column of the data table of the workbook: the values of each comparable and their sum. */
export type RegressionColumn = { name: string; values: number[]; sum: number };

export type RegressionResidual = { id: string; observed: number; fitted: number; residual: number };

export type RegressionFit = {
  method: "REGRESION_LINEAL";
  n: number;
  k: number;
  /** A (intercept), then B, C… one per variable. */
  coefficients: number[];
  /** "Y = A + BX + CZ". */
  equation: string;
  /** Y for the subject's variables. */
  estimate: number;
  /** Null when every Y is the same: there is no variation to explain. */
  rSquared: number | null;
  adjustedRSquared: number | null;
  /** Standard error of the estimate, √(SSres / (n − k − 1)). */
  standardError: number;
  residuals: RegressionResidual[];
  /** N, then X, Y, Z…, their squares and cross products, as the workbook's data table. */
  columns: RegressionColumn[];
  /** More comparables than the recommended 30. */
  reliable: boolean;
};

export type RegressionOutcome = { ok: true; fit: RegressionFit } | { ok: false; reason: string };

/** Relative pivot below which a variable is taken as a linear combination of the others. */
const COLLINEARITY_TOLERANCE = 1e-10;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const quoted = (names: string[]) => names.map((name) => `«${name}»`).join(", ");

/**
 * Ordinary least squares with k variables. The normal equations are solved
 * on the data centred on their means (better conditioned than the raw sums,
 * and the same solution: it reproduces the workbook's Cramer rule to the last
 * digit or two), by Gaussian elimination with partial pivoting.
 */
export function fitLinearRegression(input: EstimationInput, trace = new Trace(), keyPrefix = "regresion"): RegressionOutcome {
  const k = input.variables.length;
  const n = input.observations.length;
  if (!k) return { ok: false, reason: "Elige al menos una variable para la regresión." };
  if (k > MAX_REGRESSION_VARIABLES) return { ok: false, reason: `La regresión lleva hasta ${MAX_REGRESSION_VARIABLES} variables.` };
  if (input.subject.length !== k || input.observations.some((row) => row.x.length !== k)) {
    return { ok: false, reason: "Cada comparable y el sujeto necesitan un valor por variable." };
  }
  const numbers = [...input.subject, ...input.observations.flatMap((row) => [row.y, ...row.x])];
  if (!numbers.every(Number.isFinite)) return { ok: false, reason: "Los datos de la regresión deben ser números." };
  // n = k + 1 passes exactly through every comparable: no degrees of freedom left to measure the error.
  if (n < k + 2) {
    return {
      ok: false,
      reason: `Con ${k} ${k === 1 ? "variable" : "variables"} la regresión necesita al menos ${k + 2} comparables; hay ${n}.`,
    };
  }

  const ys = input.observations.map((row) => row.y);
  const xs = Array.from({ length: k }, (_, j) => input.observations.map((row) => row.x[j]));
  const meanY = sum(ys) / n;
  const means = xs.map((values) => sum(values) / n);
  const centred = xs.map((values, j) => values.map((value) => value - means[j]));
  const centredY = ys.map((value) => value - meanY);
  const dot = (left: number[], right: number[]) => left.reduce((total, value, index) => total + value * right[index], 0);
  const matrix = centred.map((left) => centred.map((right) => dot(left, right)));
  const vector = centred.map((values) => dot(values, centredY));

  const singular = collinearity(matrix, input.variables);
  if (singular) return { ok: false, reason: singular };
  const slopes = solveLinearSystem(matrix, vector);
  if (!slopes) return { ok: false, reason: "Las variables elegidas no dejan una solución única (colinealidad). Quita alguna." };
  const intercept = meanY - dot(slopes, means);
  const coefficients = [intercept, ...slopes];

  const letters = VARIABLE_LETTERS.slice(0, k);
  const constants = CONSTANT_LETTERS.slice(0, k + 1);
  const columns = workbookColumns(ys, xs);
  for (const column of columns) {
    trace.record({
      key: `${keyPrefix}.suma.${column.name}`,
      label: column.name === "N" ? "Número de comparables (N)" : `Suma de ${column.name}`,
      formula: column.name === "N" ? "cuenta de comparables" : `Σ ${column.name}`,
      inputs: Object.fromEntries(input.observations.map((row, index) => [row.id, column.values[index]])),
      value: column.sum,
    });
  }
  const sums = Object.fromEntries(columns.map((column) => [`Σ${column.name}`, column.sum]));
  const names = Object.fromEntries(letters.map((letter, j) => [letter, input.variables[j]]));
  coefficients.forEach((value, index) => trace.record({
    key: `${keyPrefix}.constante.${constants[index]}`,
    label: index === 0 ? "Constante A (ordenada al origen)" : `Constante ${constants[index]} (coeficiente de ${input.variables[index - 1]})`,
    formula: "mínimos cuadrados: ecuaciones normales resueltas por eliminación de Gauss con pivoteo parcial",
    inputs: { ...sums, ...(index === 0 ? {} : { variable: names[letters[index - 1]] }) },
    value,
  }));

  const equation = `Y = ${constants[0]}${letters.map((letter, j) => ` + ${constants[j + 1]}${letter}`).join("")}`;
  const predict = (values: number[]) => intercept + dot(slopes, values);
  const estimate = trace.record({
    key: `${keyPrefix}.estimado`,
    label: `${input.dependent} estimado del sujeto`,
    formula: equation.replace("Y = ", ""),
    inputs: {
      ...Object.fromEntries(constants.map((letter, index) => [letter, coefficients[index]])),
      ...Object.fromEntries(letters.map((letter, j) => [letter, input.subject[j]])),
    },
    value: predict(input.subject),
  });

  const residuals = input.observations.map((row): RegressionResidual => {
    const fitted = predict(row.x);
    const residual = trace.record({
      key: `${keyPrefix}.residuo.${row.id}`,
      label: `Residuo, comparable ${row.id}`,
      formula: "Y observado − Y estimado",
      inputs: { observado: row.y, estimado: fitted },
      value: row.y - fitted,
    });
    return { id: row.id, observed: row.y, fitted, residual };
  });
  const residualSquares = sum(residuals.map((row) => row.residual ** 2));
  const totalSquares = sum(centredY.map((value) => value ** 2));
  const rSquared = totalSquares > 0 ? 1 - residualSquares / totalSquares : null;
  if (rSquared !== null) {
    trace.record({
      key: `${keyPrefix}.r2`,
      label: "Coeficiente de determinación R²",
      formula: "1 − Σ residuo² / Σ (Y − Ȳ)²",
      inputs: { sumaResiduos2: residualSquares, sumaTotal2: totalSquares },
      value: rSquared,
    });
  }
  const adjustedRSquared = rSquared === null ? null : trace.record({
    key: `${keyPrefix}.r2Ajustado`,
    label: "R² ajustado",
    formula: "1 − (1 − R²)(N − 1) / (N − k − 1)",
    inputs: { r2: rSquared, N: n, k },
    value: 1 - ((1 - rSquared) * (n - 1)) / (n - k - 1),
  });
  const standardError = trace.record({
    key: `${keyPrefix}.errorEstandar`,
    label: "Error estándar de la estimación",
    formula: "√(Σ residuo² / (N − k − 1))",
    inputs: { sumaResiduos2: residualSquares, N: n, k },
    value: Math.sqrt(residualSquares / (n - k - 1)),
  });

  return {
    ok: true,
    fit: {
      method: "REGRESION_LINEAL",
      n,
      k,
      coefficients,
      equation,
      estimate,
      rSquared,
      adjustedRSquared,
      standardError,
      residuals,
      columns,
      reliable: n > RECOMMENDED_REGRESSION_COMPARABLES,
    },
  };
}

/**
 * The data table of REG.LIN.3: N, X, Y, Z…, the squares of the variables and
 * the products of each pair (X², Z², XY, XZ, YZ with two variables).
 */
function workbookColumns(ys: number[], xs: number[][]): RegressionColumn[] {
  const column = (name: string, values: number[]): RegressionColumn => ({ name, values, sum: sum(values) });
  const data: Array<[string, number[]]> = [
    [VARIABLE_LETTERS[0], xs[0]],
    ["Y", ys],
    ...xs.slice(1).map((values, j): [string, number[]] => [VARIABLE_LETTERS[j + 1], values]),
  ];
  const squares = xs.map((values, j) => column(`${VARIABLE_LETTERS[j]}²`, values.map((value) => value ** 2)));
  const products = data.flatMap(([left, leftValues], i) => data.slice(i + 1).map(([right, rightValues]) =>
    column(`${left}${right}`, leftValues.map((value, index) => value * rightValues[index]))));
  return [
    column("N", ys.map(() => 1)),
    ...data.map(([name, values]) => column(name, values)),
    ...squares,
    ...products,
  ];
}

/**
 * Why the variables cannot be solved for, or null: one with the same value in
 * every comparable, or one that the previous ones already explain. Read on
 * the correlation matrix, so the tolerance does not depend on the units.
 */
function collinearity(matrix: number[][], names: string[]): string | null {
  const constant = names.filter((_, j) => !(matrix[j][j] > 0));
  if (constant.length) {
    return `${quoted(constant)} ${constant.length === 1 ? "tiene" : "tienen"} el mismo valor en todos los comparables: no explica las diferencias de precio y deja la regresión sin solución. Quítala o revisa la captura.`;
  }
  const scale = matrix.map((row, j) => Math.sqrt(row[j]));
  const reduced = matrix.map((row, i) => row.map((value, j) => value / (scale[i] * scale[j])));
  // Elimination in the order chosen: each pivot is 1 − R² of that variable on the previous ones.
  for (let pivot = 0; pivot < reduced.length; pivot += 1) {
    if (reduced[pivot][pivot] < COLLINEARITY_TOLERANCE) {
      return `${quoted([names[pivot]])} depende linealmente de ${quoted(names.slice(0, pivot))} (colinealidad): la regresión no tiene solución única. Quita una de esas variables.`;
    }
    for (let row = pivot + 1; row < reduced.length; row += 1) {
      const factor = reduced[row][pivot] / reduced[pivot][pivot];
      for (let column = pivot; column < reduced.length; column += 1) reduced[row][column] -= factor * reduced[pivot][column];
    }
  }
  return null;
}

/** Gaussian elimination with partial pivoting; null when a pivot is zero. */
export function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) best = row;
    if (!rows[best][pivot]) return null;
    [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
    for (let row = pivot + 1; row < size; row += 1) {
      const factor = rows[row][pivot] / rows[pivot][pivot];
      for (let column = pivot; column <= size; column += 1) rows[row][column] -= factor * rows[pivot][column];
    }
  }
  const solution = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let value = rows[row][size];
    for (let column = row + 1; column < size; column += 1) value -= rows[row][column] * solution[column];
    solution[row] = value / rows[row][row];
  }
  return solution;
}
