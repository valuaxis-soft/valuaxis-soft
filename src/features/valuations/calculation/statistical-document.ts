/**
 * The statistical methods in the dictamen: a block "MÉTODOS ALTERNATIVOS
 * PARA ESTIMACIÓN DE VALOR" (once "APLICACIÓN ESTADÍSTICA") of its own, after the market's pages of the same comparable type, with the
 * criteria and their scales, the regression (a brief table, its equation,
 * constants and variables, and the conclusion last) and the goal programming
 * (its coefficients and the conclusion), each only when the appraiser turns
 * "Mostrar en el dictamen" on and it can be computed; and, if asked, the
 * table that sets them beside the market's homologation. None is adopted.
 * The technical tables (sums and products, statistics, analysis of variance,
 * coefficients, deviations and contributions) go to the calculation memory,
 * and to the dictamen only if the appraiser marks them (video 5.3).
 */
import type { GoalProgrammingFit } from "../engine/goal-programming";
import { MAX_PRODUCT_VARIABLES, constantLetters, variableLetters, type RegressionFit } from "../engine/regression";
import type { AppSection, Block, TableContent } from "../model";
import type { TableNote, TableSummaryBox } from "../services/table";
import { factorDecimals } from "./calculation-precision";
import {
  EMPTY,
  figure,
  figureColumn,
  generatedApartado,
  generatedBlock,
  generatedTable,
  money,
  moneyColumn,
  textColumn,
  whole,
  type GeneratedColumn,
} from "./generated-content";
import { GENERATED_BLOCK_PREFIX, replaceGeneratedBlocks } from "./market-document";
import { isRentComparableType, type ComparableType } from "./market-types";
import {
  DEFAULT_GOAL_TITLE,
  DEFAULT_REGRESSION_TITLE,
  codedValue,
  codingNote,
  computeStatisticalGoal,
  computeStatisticalRegression,
  fieldLabel,
  GOAL_EXTRA_TABLES,
  REGRESSION_EXTRA_TABLES,
  formatScaleValue,
  scaleValues,
  subjectAreaOf,
  type GoalExtraTable,
  type RegressionExtraTable,
  type StatisticalCalculationDto,
  type StatisticalRegressionResult,
  type StatisticalVariableDto,
} from "./statistical-types";

/** The title of the block, as the appraiser renamed the apartado (observation 4.12). */
export const STATISTICAL_BLOCK_TITLE = "MÉTODOS ALTERNATIVOS PARA ESTIMACIÓN DE VALOR";

const prefixFor = (type: ComparableType) => `${GENERATED_BLOCK_PREFIX}estadistico-${type.toLowerCase()}`;

/** "(TERRENOS)" after the titles, as the market's pages. */
const SCOPE: Record<ComparableType, string> = {
  TERRENO_VENTA: "(TERRENOS)",
  INMUEBLE_VENTA: "(INMUEBLES)",
  INMUEBLE_RENTA: "(INMUEBLES EN RENTA)",
  TERRENO_RENTA: "(TERRENOS EN RENTA)",
};

/** A data table wider than this goes on in a second table under it, with REF again. */
export const MAX_PRINTED_COLUMNS = 8;

/** The legend of a statistical value, in plain words (observations of 27 Oct 2026). */
export const STATISTICAL_VALUE_NOTE = "Valor estadístico estimado; se compara con el promedio y la mediana homologados.";
const NOT_ADOPTED_NOTE = "Ningún método se adopta automáticamente: el valor lo concluye el valuador.";
export const NO_CONTRIBUTION_NOTE = "Este criterio no aporta en la solución.";

/** Constants with eight significant figures: a coefficient of 0.0034702172 keeps its digits. */
const significant = new Intl.NumberFormat("es-MX", { maximumSignificantDigits: 8 });
const amount = (value: number) => (Number.isInteger(value) ? whole(value) : figure(value));

/** "Y = 37.242817 + 0.0034702172·X − 0.35639358·Z": the equation with its constants. */
export function regressionEquation(fit: Pick<RegressionFit, "coefficients" | "k">): string {
  const letters = variableLetters(fit.k);
  return `Y = ${significant.format(fit.coefficients[0])}${fit.coefficients.slice(1).map((value, j) =>
    ` ${value < 0 ? "−" : "+"} ${significant.format(Math.abs(value))}·${letters[j]}`).join("")}`;
}

/**
 * Splits the columns of a wide table: the first table takes as many as fit;
 * each next one repeats the first column (REF) and goes on.
 */
export function splitColumns<T>(columns: T[]): T[][] {
  if (columns.length <= MAX_PRINTED_COLUMNS) return [columns];
  const parts: T[][] = [columns.slice(0, MAX_PRINTED_COLUMNS)];
  const room = MAX_PRINTED_COLUMNS - 1;
  for (let at = MAX_PRINTED_COLUMNS; at < columns.length; at += room) parts.push([columns[0], ...columns.slice(at, at + room)]);
  return parts;
}

type Column = { column: GeneratedColumn; cells: string[] };

/** A table before it is written: the dictamen prints it with `generatedTable`, the calculation memory as plain rows. */
type TableSpec = {
  id: string;
  title: string;
  columns: GeneratedColumn[];
  rows: string[][];
  summaryBoxes?: TableSummaryBox[];
  notes?: TableNote[];
  rowKeys?: string[];
};

/**
 * A table of the block, fitted to its content (video 5.3, 18:27): every table
 * of the alternative methods is brief. A width the appraiser chose in "Formato
 * de la tabla" is kept over this one (`GeneratedTableLayout.widthMode`).
 */
const written = (spec: TableSpec): TableContent => generatedTable(spec.id, spec.title, spec.columns, spec.rows, {
  ...(spec.summaryBoxes ? { summaryBoxes: spec.summaryBoxes } : {}),
  ...(spec.notes ? { notes: spec.notes } : {}),
  ...(spec.rowKeys ? { rowKeys: spec.rowKeys } : {}),
  widthMode: "content",
});

/** One or more tables from a list of columns, REF first, the boxes and notes under the last one. */
function splitTables(id: string, title: string, columns: Column[], options: { summaryBoxes?: TableSummaryBox[]; notes?: TableNote[]; rowKeys?: string[] }): TableSpec[] {
  const parts = splitColumns(columns);
  return parts.map((part, index) => {
    const last = index === parts.length - 1;
    const rows = (part[0]?.cells ?? []).map((_, row) => part.map((item) => item.cells[row]));
    return {
      id: index ? `${id}-${index + 1}` : id,
      title: parts.length > 1 ? `${title} (${index + 1} de ${parts.length})` : title,
      columns: part.map((item) => item.column),
      rows,
      ...(options.rowKeys ? { rowKeys: options.rowKeys } : {}),
      ...(last && options.summaryBoxes ? { summaryBoxes: options.summaryBoxes } : {}),
      ...(last && options.notes ? { notes: options.notes } : {}),
    };
  });
}

/**
 * The conclusion always goes last (video 5.3, 19:28): its box and the note of
 * the statistical value close the last table printed, after any other.
 */
function closedWith(specs: TableSpec[], conclusion: TableSummaryBox): TableSpec[] {
  return specs.map((spec, index) => (index === specs.length - 1
    ? { ...spec, summaryBoxes: [...(spec.summaryBoxes ?? []), conclusion], notes: [...(spec.notes ?? []), { position: "bottom", text: STATISTICAL_VALUE_NOTE }] }
    : spec));
}

/** A criterion's value as the data table prints it: "Regular (2)", "35 (25)" for a contrary one, as written otherwise. */
function printedValue(variable: StatisticalVariableDto, text: string): string {
  if (!text.trim()) return EMPTY;
  const coded = codedValue(variable, text);
  if (!coded.ok) return text;
  if (variable.coding === "DIRECT") return text;
  const label = variable.coding === "SCALE" ? scaleValues(variable).find((level) => level.value === coded.value)?.label ?? text : text;
  return `${label} (${formatScaleValue(Number(coded.value.toFixed(6)))})`;
}

/** "Escala de CALIDAD: Popular = 1, Medio = 2…" and "VUR: 60 − valor capturado": how each criterion became a number. */
function codingNotes(calculation: StatisticalCalculationDto): TableNote[] {
  const { settings } = calculation;
  return settings.variables.flatMap((variable): TableNote[] => {
    const label = fieldLabel(settings, variable.key);
    if (variable.coding === "SCALE") {
      const levels = scaleValues(variable).map((level) => `${level.label} = ${formatScaleValue(level.value)}`);
      return levels.length ? [{ position: "bottom", label: `Escala de ${label}:`, text: levels.join(", ") }] : [];
    }
    const note = codingNote(variable, label);
    return note ? [{ position: "bottom", text: note }] : [];
  });
}

/** The comparables and the subject with their criteria, coded, in as many tables as the width needs. */
function dataTables(calculation: StatisticalCalculationDto, prefix: string, unitColumn: boolean): TableContent[] {
  const { settings } = calculation;
  const rent = isRentComparableType(settings.comparableType);
  const included = calculation.comparables.filter((comparable) => !comparable.excluded);
  const area = (values: Record<string, string>) => Number((values.area ?? "").replace(/,/g, ""));
  const columns: Column[] = [
    { column: figureColumn("REF"), cells: ["SUJETO", ...included.map((comparable) => String(comparable.reference))] },
    { column: moneyColumn(rent ? "RENTA $" : "PRECIO $"), cells: [EMPTY, ...included.map((comparable) => (comparable.price ? money(comparable.price) : EMPTY))] },
    ...(unitColumn ? [{
      column: moneyColumn(rent ? "$/M²/MES" : "$/M²"),
      cells: [EMPTY, ...included.map((comparable) => (comparable.price && area(comparable.values) > 0 ? money(comparable.price / area(comparable.values)) : EMPTY))],
    }] : []),
    ...settings.variables.map((variable, j): Column => ({
      column: textColumn(`${variableLetters(settings.variables.length)[j]} (${fieldLabel(settings, variable.key).toUpperCase()})`, "center"),
      cells: [printedValue(variable, settings.subject[variable.key] ?? ""), ...included.map((comparable) => printedValue(variable, comparable.values[variable.key] ?? ""))],
    })),
  ];
  return splitTables(`${prefix}-tabla-datos`, "Datos de los métodos alternativos", columns, {
    rowKeys: ["sujeto", ...included.map((comparable) => String(comparable.reference))],
    notes: [
      { position: "top", text: "Criterios de cada comparable y del sujeto; entre paréntesis, el número que toma cada uno con su codificación." },
      ...codingNotes(calculation),
    ],
  }).map(written);
}

/**
 * The regression's tables: the brief one of the dictamen (each comparable's
 * Y and Y estimated, the equation, the constants and the variables), and the
 * technical ones of the calculation memory (Excel's table of sums and
 * products, the statistics, the analysis of variance and the coefficients).
 */
function regressionSpecs(calculation: StatisticalCalculationDto, result: StatisticalRegressionResult, prefix: string) {
  const { settings } = calculation;
  const { fit, data } = result;
  const rent = isRentComparableType(settings.comparableType);
  const decimals = factorDecimals(calculation.precision);
  const letters = variableLetters(fit.k);
  const constants = constantLetters(fit.k);
  const unit = rent ? "$/M²/MES" : "$/M²";
  const yName = settings.dependent === "PRICE" ? (rent ? "RENTA $" : "PRECIO $") : unit;
  const names = new Map<string, string>([["Y", yName], ...letters.map((letter, j): [string, string] => [letter, data.variables[j].toUpperCase()])]);
  const workbook = fit.k <= MAX_PRODUCT_VARIABLES;
  const showResidual = settings.regression.showResidual === true;
  const cell = (value: number) => figure(value, Number.isInteger(value) ? 0 : 2);
  const residuals = new Map(fit.residuals.map((row) => [row.id, row]));
  const references = data.rows.map((row) => String(row.reference));
  const brief: TableSpec = {
    id: `${prefix}-tabla`,
    title: "Regresión lineal",
    columns: [
      figureColumn("REF"), figureColumn(`Y (${yName})`), figureColumn("Y ESTIMADO"),
      ...(showResidual ? [figureColumn("RESIDUO")] : []),
    ],
    rows: data.rows.map((row) => {
      const estimate = residuals.get(String(row.reference));
      return [String(row.reference), cell(row.y), cell(estimate?.fitted ?? Number.NaN), ...(showResidual ? [cell(estimate?.residual ?? Number.NaN)] : [])];
    }),
    rowKeys: references,
    summaryBoxes: [
      { id: "constantes", position: "bottom", align: "start", caption: "CONSTANTES", rows: fit.coefficients.map((value, index) => ({ label: `${constants[index]} =`, value: significant.format(value) })) },
      {
        id: "variables",
        position: "bottom",
        align: "end",
        caption: "VARIABLES",
        rows: [
          ...letters.map((letter, j) => ({ label: `SI: ${letter} (${data.variables[j]}) =`, value: amount(data.subject[j]) })),
          { id: "y", label: "Y =", value: fit.equation.replace("Y = ", "").replaceAll(" ", "") },
        ],
      },
    ],
    notes: [
      { position: "top", text: "Valor de cada comparable (Y) y el que estima la ecuación; los criterios están en la tabla de datos." },
      // First the equation, then its constants and variables (video 5.3, 19:03).
      { position: "table", label: "Ecuación de regresión lineal:", text: regressionEquation(fit) },
    ],
  };
  const productColumns: Column[] = fit.columns.map((column): Column => ({
    column: figureColumn(column.name === "N" ? "N" : names.has(column.name) ? `${column.name} (${names.get(column.name)})` : column.name),
    cells: [...data.rows.map((row, index) => (column.name === "N" ? String(row.reference) : cell(column.values[index]))), column.name === "N" ? `N = ${whole(fit.n)}` : workbook ? cell(column.sum) : EMPTY],
  }));
  const products = splitTables(`${prefix}-productos`, workbook ? "Tabla de sumas y productos" : "Datos codificados de la regresión", productColumns, {
    notes: [{ position: "table", text: workbook ? "Datos codificados de los comparables con sus productos y, en el último renglón, las sumas de la tabla de valores." : "Datos codificados de los comparables." }],
  });
  const stat = (value: number | null) => figure(value, decimals);
  const statistics: TableSpec = {
    id: `${prefix}-estadisticas`,
    title: "Estadísticas de la regresión",
    columns: [textColumn("ESTADÍSTICAS DE LA REGRESIÓN"), figureColumn("VALOR")],
    rows: [
      ["Coeficiente de correlación múltiple (R)", stat(fit.multipleR)],
      ["Coeficiente de determinación R²", stat(fit.rSquared)],
      ["R² ajustado", stat(fit.adjustedRSquared)],
      ["Error típico", stat(fit.standardError)],
      ["Observaciones", whole(fit.n)],
    ],
  };
  const anova = fit.anova;
  const anovaTable: TableSpec | null = anova ? {
    id: `${prefix}-anova`,
    title: "Análisis de varianza",
    columns: [
      textColumn("ANÁLISIS DE VARIANZA"), figureColumn("GRADOS DE LIBERTAD"), figureColumn("SUMA DE CUADRADOS"),
      figureColumn("PROMEDIO DE LOS CUADRADOS"), figureColumn("F"), figureColumn("VALOR CRÍTICO DE F"),
    ],
    rows: [
      ["Regresión", whole(anova.regression.df), stat(anova.regression.sumSquares), stat(anova.regression.meanSquare), stat(anova.f), anova.significanceF === null ? EMPTY : figure(anova.significanceF, Math.max(decimals, 4))],
      ["Residuos", whole(anova.residual.df), stat(anova.residual.sumSquares), stat(anova.residual.meanSquare), "", ""],
      ["Total", whole(anova.total.df), stat(anova.total.sumSquares), "", "", ""],
    ],
    notes: [{ position: "table", text: "Valor crítico de F: probabilidad de obtener una F así de grande si los criterios no explicaran el precio, como lo reporta Excel." }],
  } : null;
  const unitValue = result.unitValue === null ? [] : [{ id: "unitario", label: rent ? "RENTA ESTIMADA/M²/MES:" : "PRECIO ESTIMADO/M²:", value: money(result.unitValue), emphasis: "strong" as const }];
  const conclusion: TableSummaryBox = {
    id: "conclusiones",
    position: "bottom",
    align: "end",
    caption: "CONCLUSIONES",
    rows: [...unitValue, { id: "valor", label: rent ? "RENTA MENSUAL ESTIMADA:" : "VALOR ESTIMADO DEL INMUEBLE:", value: money(result.value), emphasis: "total" }],
  };
  const extras: Record<RegressionExtraTable, TableSpec[]> = {
    products,
    statistics: [statistics],
    anova: anovaTable ? [anovaTable] : [],
    coefficients: [coefficientsSpec(fit, `${prefix}-coeficientes`, decimals)],
  };
  return { brief, extras, conclusion };
}

/** Under the coefficients table: what the probability and the limits mean, in plain words. */
export const COEFFICIENTS_NOTE =
  "Probabilidad: la de obtener un estadístico t así de grande si el coeficiente fuera cero; menor a 0.05, el criterio pesa en el precio. Los límites son el intervalo de confianza al 95 %, como los reporta Excel.";

/**
 * Excel's coefficients table: a row for the intercept and one per variable
 * with the coefficient, its standard error, t, the probability and the 95 %
 * limits. The statistics are blank when the fit is exact.
 */
function coefficientsSpec(fit: RegressionFit, id: string, decimals: number): TableSpec {
  const stat = (value: number | null) => (value === null ? EMPTY : figure(value, Math.max(decimals, 4)));
  return {
    id,
    title: "Coeficientes de la regresión",
    columns: [
      textColumn(""), figureColumn("COEFICIENTES"), figureColumn("ERROR TÍPICO"), figureColumn("ESTADÍSTICO t"),
      figureColumn("PROBABILIDAD"), figureColumn("INFERIOR 95 %"), figureColumn("SUPERIOR 95 %"),
    ],
    rows: fit.coefficientTable.map((row) => [
      row.name === "Intercepción" ? row.name : `${row.constant} (${row.name})`,
      significant.format(row.coefficient), stat(row.standardError), stat(row.t), stat(row.p), stat(row.lower95), stat(row.upper95),
    ]),
    rowKeys: fit.coefficientTable.map((row) => row.constant),
    notes: [{ position: "table", text: COEFFICIENTS_NOTE }],
  };
}

/**
 * The goal programming's tables: the brief one of the dictamen (each
 * criterion's coefficient and the subject's value, video 5.3, 20:56) and the
 * technical ones of the calculation memory (the deviation of each comparable
 * and the part of each criterion in the subject's value).
 */
function goalSpecs(calculation: StatisticalCalculationDto, fit: GoalProgrammingFit, prefix: string) {
  const rent = isRentComparableType(calculation.settings.comparableType);
  const brief: TableSpec = {
    id: `${prefix}-coeficientes`,
    title: "Coeficientes de la programación por metas",
    columns: [textColumn("CRITERIO"), figureColumn("COEFICIENTE"), figureColumn("VALOR SUJETO")],
    rows: fit.contributions.map((row) => [row.name, significant.format(row.coefficient), amount(row.subjectValue)]),
    notes: [{ position: "table", text: "Valor del sujeto = Σ coeficiente × valor del sujeto en cada criterio." }],
  };
  const deviations: TableSpec = {
    id: `${prefix}-desviaciones`,
    title: "Desviaciones de la programación por metas",
    columns: [
      figureColumn("REF"), moneyColumn(rent ? "RENTA $" : "PRECIO $"), moneyColumn("ESTIMADO $"),
      moneyColumn("p (POR DEBAJO)"), moneyColumn("n (POR ENCIMA)"), textColumn("OBSERVACIÓN", "center"),
    ],
    rows: fit.deviations.map((row) => [row.id, money(row.observed), money(row.fitted), money(row.positive), money(row.negative), row.observe ? "A observar" : EMPTY]),
    rowKeys: fit.deviations.map((row) => row.id),
    notes: [
      { position: "top", text: "Modelo: mínimo de Σ (p + n) sujeto a Σ criterio × coeficiente + p − n = precio de cada comparable; coeficientes y desviaciones ≥ 0, sin ordenada al origen." },
      { position: "table", text: `«A observar»: el modelo no alcanza su precio; conviene revisar ese comparable. Suma de desviaciones: ${money(fit.objective)}.` },
    ],
  };
  const contributions: TableSpec = {
    id: `${prefix}-contribucion`,
    title: "Contribución de cada criterio",
    columns: [textColumn("CRITERIO"), figureColumn("COEFICIENTE"), figureColumn("VALOR SUJETO"), moneyColumn("CONTRIBUCIÓN $"), textColumn("NOTA")],
    rows: fit.contributions.map((row) => [row.name, significant.format(row.coefficient), amount(row.subjectValue), money(row.contribution), row.contributes ? "" : NO_CONTRIBUTION_NOTE]),
  };
  const conclusion: TableSummaryBox = {
    id: "conclusiones",
    position: "bottom",
    align: "end",
    caption: "CONCLUSIONES",
    rows: [{ id: "valor", label: rent ? "RENTA MENSUAL ESTIMADA:" : "VALOR ESTIMADO DEL INMUEBLE:", value: money(fit.estimate), emphasis: "total" }],
  };
  const extras: Record<GoalExtraTable, TableSpec[]> = { deviations: [deviations], contributions: [contributions] };
  return { brief, extras, conclusion };
}

/** The tables the dictamen prints of a method: the brief one, the technical ones the appraiser marked, and the conclusion last. */
function printedTables<K extends string>(specs: { brief: TableSpec; extras: Record<K, TableSpec[]>; conclusion: TableSummaryBox }, order: readonly K[], marked: readonly K[] | undefined): TableContent[] {
  const chosen = new Set(marked ?? []);
  return closedWith([specs.brief, ...order.filter((key) => chosen.has(key)).flatMap((key) => specs.extras[key])], specs.conclusion).map(written);
}

/** A technical table of the calculation memory: its title, headers, rows and notes, as written. */
export type StatisticalMemoryTable = { title: string; columns: string[]; rows: string[][]; notes: string[] };

const memoryTable = (spec: TableSpec): StatisticalMemoryTable => ({
  title: spec.title,
  columns: spec.columns.map((column) => column.name),
  rows: spec.rows,
  notes: (spec.notes ?? []).map((note) => [note.label, note.text].filter(Boolean).join(" ")),
});

/**
 * What the calculation memory prints of the alternative methods besides their
 * steps (video 5.3, 18:03–23:20): the table of sums and products, the
 * statistics, the analysis of variance and the coefficients of the
 * regression, and the deviations and contributions of the goal programming.
 * Whatever the dictamen shows.
 */
export function statisticalMemoryTables(calculation: StatisticalCalculationDto): StatisticalMemoryTable[] {
  const prefix = prefixFor(calculation.settings.comparableType);
  const regression = computeStatisticalRegression(calculation);
  const goal = computeStatisticalGoal(calculation);
  const tables: TableSpec[] = [];
  if (regression?.ok) {
    const specs = regressionSpecs(calculation, regression.result, `${prefix}-regresion`);
    tables.push(...REGRESSION_EXTRA_TABLES.flatMap((key) => specs.extras[key]).map((spec) => (spec.id.includes("-productos") ? { ...spec, title: `Regresión lineal: ${spec.title.toLowerCase()}` } : spec)));
  }
  if (goal?.outcome.ok) {
    const specs = goalSpecs(calculation, goal.outcome.fit, `${prefix}-metas`);
    tables.push(...GOAL_EXTRA_TABLES.flatMap((key) => specs.extras[key]));
  }
  // The memory has room for a wide table: the parts of a split one print as one.
  const merged = new Map<string, StatisticalMemoryTable>();
  for (const spec of tables) {
    const base = spec.title.replace(/ \(\d+ de \d+\)$/, "");
    const table = memoryTable({ ...spec, title: base });
    const previous = merged.get(base);
    if (!previous) merged.set(base, table);
    else merged.set(base, { ...previous, columns: [...previous.columns, ...table.columns.slice(1)], rows: previous.rows.map((row, index) => [...row, ...(table.rows[index] ?? []).slice(1)]) });
  }
  return [...merged.values()];
}

/** RLM, PM and the market's homologation side by side: a reference, none adopted. */
export type MethodComparisonRow = { method: string; unitValue: number | null; value: number | null };

/**
 * The rows of the comparison: the market's and each method that resolves.
 * `printed`, the dictamen's: only the methods it prints (a method with
 * "Mostrar en el dictamen" off does not appear in its comparison either).
 */
export function methodComparison(calculation: StatisticalCalculationDto, printed?: { regression: boolean; goal: boolean }): MethodComparisonRow[] {
  const regression = !printed || printed.regression ? computeStatisticalRegression(calculation) : null;
  const goal = !printed || printed.goal ? computeStatisticalGoal(calculation) : null;
  const market = calculation.market;
  const area = subjectAreaOf(calculation.settings) ?? market?.subjectArea ?? null;
  const times = (unit: number | null) => (unit !== null && area ? unit * area : null);
  const over = (value: number | null) => (value !== null && area ? value / area : null);
  const rows: MethodComparisonRow[] = [];
  if (market) {
    rows.push({ method: "Tradicional (homologación, valor de mercado)", unitValue: market.adoptedUnitValue, value: market.value });
    if (market.mean !== null) rows.push({ method: "Promedio homologado", unitValue: market.mean, value: times(market.mean) });
    if (market.median !== null) rows.push({ method: "Mediana homologada", unitValue: market.median, value: times(market.median) });
  }
  if (regression?.ok) rows.push({ method: "Regresión lineal múltiple (RLM)", unitValue: regression.result.unitValue, value: regression.result.value });
  if (goal?.outcome.ok) rows.push({ method: "Programación por metas (PM)", unitValue: over(goal.outcome.fit.estimate), value: goal.outcome.fit.estimate });
  return rows;
}

function comparisonTable(calculation: StatisticalCalculationDto, prefix: string, printed: { regression: boolean; goal: boolean }): TableContent | null {
  const rows = methodComparison(calculation, printed);
  if (rows.length < 2) return null;
  const rent = isRentComparableType(calculation.settings.comparableType);
  return generatedTable(`${prefix}-comparacion`, "Comparación de métodos", [
    textColumn("MÉTODO"), moneyColumn(rent ? "RENTA UNITARIA $/M²/MES" : "VALOR UNITARIO $/M²"), moneyColumn(rent ? "RENTA MENSUAL $" : "VALOR $"),
  ], rows.map((row) => [row.method, row.unitValue === null ? EMPTY : money(row.unitValue), row.value === null ? EMPTY : money(row.value)]), {
    notes: [{ position: "bottom", text: NOT_ADOPTED_NOTE }],
    widthMode: "content",
  });
}

/** The block of the apartado, or none while nothing is to print. */
export function statisticalDocumentBlocks(calculation: StatisticalCalculationDto): Block[] {
  const { settings } = calculation;
  // "Agregar al informe valuatorio" off, or the calculation taken away: nothing of this type prints.
  if (settings.excludedFromReport || settings.removed) return [];
  const type = settings.comparableType;
  const prefix = prefixFor(type);
  const scope = SCOPE[type];
  const regression = settings.regression.enabled && settings.regression.showInDictamen ? computeStatisticalRegression(calculation) : null;
  const goal = settings.goal.enabled && settings.goal.showInDictamen ? computeStatisticalGoal(calculation) : null;
  const regressionShown = regression?.ok ? regression.result : null;
  const goalShown = goal?.outcome.ok ? goal.outcome.fit : null;
  if (!regressionShown && !goalShown) return [];
  const comparison = settings.showComparison ? comparisonTable(calculation, prefix, { regression: Boolean(regressionShown), goal: Boolean(goalShown) }) : null;
  const unitColumn = Boolean(regressionShown) && settings.dependent === "UNIT_VALUE";
  const apartados = [
    generatedApartado(`${prefix}-datos`, `CRITERIOS, CODIFICACIÓN Y DATOS ${scope}`, { tables: dataTables(calculation, prefix, unitColumn) }),
    ...(regressionShown ? [generatedApartado(`${prefix}-regresion`, `${(settings.regression.title || DEFAULT_REGRESSION_TITLE).toUpperCase()} ${scope}`, {
      tables: printedTables(regressionSpecs(calculation, regressionShown, `${prefix}-regresion`), REGRESSION_EXTRA_TABLES, settings.regression.printedTables),
    })] : []),
    ...(goalShown ? [generatedApartado(`${prefix}-metas`, `${(settings.goal.title || DEFAULT_GOAL_TITLE).toUpperCase()} ${scope}`, {
      tables: printedTables(goalSpecs(calculation, goalShown, `${prefix}-metas`), GOAL_EXTRA_TABLES, settings.goal.printedTables),
    })] : []),
    ...(comparison ? [generatedApartado(`${prefix}-comparacion`, `COMPARACIÓN DE MÉTODOS ${scope}`, { tables: [comparison] })] : []),
  ];
  return [generatedBlock(prefix, STATISTICAL_BLOCK_TITLE, { apartados })];
}

/**
 * The apartado's block in the market section: where it was, or after the
 * last page of the market approach (the photos of the comparables aside).
 */
export function withStatisticalBlocks(section: AppSection, type: ComparableType, blocks: Block[]): AppSection {
  const prefix = prefixFor(type);
  return replaceGeneratedBlocks(section, (block) => block.id.startsWith(prefix), blocks, {
    position: "end",
    placeAmong: (kept) => {
      const last = kept.findLastIndex((block) => block.id.startsWith(`${GENERATED_BLOCK_PREFIX}mercado-`) && !block.id.endsWith("-fotos"));
      return last === -1 ? null : last + 1;
    },
  });
}
