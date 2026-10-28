/**
 * The statistical methods in the dictamen: a block "APLICACIÓN ESTADÍSTICA"
 * of its own, after the market's pages of the same comparable type, with the
 * criteria and their scales, the regression (as Excel's output: equation,
 * statistics and analysis of variance) and the goal programming (deviations
 * and contributions), each only when the appraiser turns "Mostrar en el
 * dictamen" on and it can be computed; and, if asked, the table that sets
 * them beside the market's homologation. None is adopted.
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
  formatScaleValue,
  scaleValues,
  subjectAreaOf,
  type StatisticalCalculationDto,
  type StatisticalRegressionResult,
  type StatisticalVariableDto,
} from "./statistical-types";

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

/** One or more tables from a list of columns, REF first, the boxes and notes under the last one. */
function splitTables(id: string, title: string, columns: Column[], options: { summaryBoxes?: TableSummaryBox[]; notes?: TableNote[]; rowKeys?: string[] }): TableContent[] {
  const parts = splitColumns(columns);
  return parts.map((part, index) => {
    const last = index === parts.length - 1;
    const rows = (part[0]?.cells ?? []).map((_, row) => part.map((item) => item.cells[row]));
    return generatedTable(index ? `${id}-${index + 1}` : id, parts.length > 1 ? `${title} (${index + 1} de ${parts.length})` : title, part.map((item) => item.column), rows, {
      ...(options.rowKeys ? { rowKeys: options.rowKeys } : {}),
      ...(last && options.summaryBoxes ? { summaryBoxes: options.summaryBoxes } : {}),
      ...(last && options.notes ? { notes: options.notes } : {}),
    });
  });
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
  return splitTables(`${prefix}-tabla-datos`, "Datos de los métodos estadísticos", columns, {
    rowKeys: ["sujeto", ...included.map((comparable) => String(comparable.reference))],
    notes: [
      { position: "top", text: "Criterios de cada comparable y del sujeto; entre paréntesis, el número que toma cada uno con su codificación." },
      ...codingNotes(calculation),
    ],
  });
}

/** The regression's own tables: data with Y estimated, Excel's statistics and analysis of variance. */
function regressionTables(calculation: StatisticalCalculationDto, result: StatisticalRegressionResult, prefix: string): TableContent[] {
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
  const columns: Column[] = [
    ...fit.columns.map((column): Column => ({
      column: figureColumn(column.name === "N" ? "N" : names.has(column.name) ? `${column.name} (${names.get(column.name)})` : column.name),
      cells: [...data.rows.map((row, index) => (column.name === "N" ? String(row.reference) : cell(column.values[index]))), column.name === "N" ? `N = ${whole(fit.n)}` : workbook ? cell(column.sum) : EMPTY],
    })),
    { column: figureColumn("Y ESTIMADO"), cells: [...data.rows.map((row) => cell(residuals.get(String(row.reference))?.fitted ?? Number.NaN)), EMPTY] },
    ...(showResidual ? [{ column: figureColumn("RESIDUO"), cells: [...data.rows.map((row) => cell(residuals.get(String(row.reference))?.residual ?? Number.NaN)), EMPTY] }] : []),
  ];
  const unitValue = result.unitValue === null ? [] : [{ id: "unitario", label: rent ? "RENTA ESTIMADA/M²/MES:" : "PRECIO ESTIMADO/M²:", value: money(result.unitValue), emphasis: "strong" as const }];
  const boxes: TableSummaryBox[] = [
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
    {
      id: "conclusiones",
      position: "bottom",
      align: "end",
      caption: "CONCLUSIONES",
      rows: [...unitValue, { id: "valor", label: rent ? "RENTA MENSUAL ESTIMADA:" : "VALOR ESTIMADO DEL INMUEBLE:", value: money(result.value), emphasis: "total" }],
    },
  ];
  const dataTable = splitTables(`${prefix}-tabla`, "Regresión lineal", columns, {
    summaryBoxes: boxes,
    notes: [
      { position: "top", text: workbook ? "Datos de los comparables y, en el último renglón, las sumas de la tabla de valores." : "Datos de los comparables con su valor estimado." },
      { position: "bottom", label: "Ecuación de regresión lineal:", text: regressionEquation(fit) },
      { position: "bottom", text: STATISTICAL_VALUE_NOTE },
    ],
  });
  const stat = (value: number | null) => figure(value, decimals);
  const statistics = generatedTable(`${prefix}-estadisticas`, "Estadísticas de la regresión", [textColumn("ESTADÍSTICAS DE LA REGRESIÓN"), figureColumn("VALOR")], [
    ["Coeficiente de correlación múltiple (R)", stat(fit.multipleR)],
    ["Coeficiente de determinación R²", stat(fit.rSquared)],
    ["R² ajustado", stat(fit.adjustedRSquared)],
    ["Error típico", stat(fit.standardError)],
    ["Observaciones", whole(fit.n)],
  ]);
  const anova = fit.anova;
  const anovaTable = anova ? generatedTable(`${prefix}-anova`, "Análisis de varianza", [
    textColumn("ANÁLISIS DE VARIANZA"), figureColumn("GRADOS DE LIBERTAD"), figureColumn("SUMA DE CUADRADOS"),
    figureColumn("PROMEDIO DE LOS CUADRADOS"), figureColumn("F"), figureColumn("VALOR CRÍTICO DE F"),
  ], [
    ["Regresión", whole(anova.regression.df), stat(anova.regression.sumSquares), stat(anova.regression.meanSquare), stat(anova.f), anova.significanceF === null ? EMPTY : figure(anova.significanceF, Math.max(decimals, 4))],
    ["Residuos", whole(anova.residual.df), stat(anova.residual.sumSquares), stat(anova.residual.meanSquare), "", ""],
    ["Total", whole(anova.total.df), stat(anova.total.sumSquares), "", "", ""],
  ], { notes: [{ position: "bottom", text: "Valor crítico de F: probabilidad de obtener una F así de grande si los criterios no explicaran el precio, como lo reporta Excel." }] }) : null;
  return [...dataTable, statistics, ...(anovaTable ? [anovaTable] : [])];
}

/** The goal programming's tables: the deviation of each comparable and the part of each criterion in the subject's value. */
function goalTables(calculation: StatisticalCalculationDto, fit: GoalProgrammingFit, prefix: string): TableContent[] {
  const rent = isRentComparableType(calculation.settings.comparableType);
  const deviations = generatedTable(`${prefix}-desviaciones`, "Desviaciones de la programación por metas", [
    figureColumn("REF"), moneyColumn(rent ? "RENTA $" : "PRECIO $"), moneyColumn("ESTIMADO $"),
    moneyColumn("p (POR DEBAJO)"), moneyColumn("n (POR ENCIMA)"), textColumn("OBSERVACIÓN", "center"),
  ], fit.deviations.map((row) => [
    row.id, money(row.observed), money(row.fitted), money(row.positive), money(row.negative), row.observe ? "A observar" : EMPTY,
  ]), {
    rowKeys: fit.deviations.map((row) => row.id),
    notes: [
      { position: "top", text: "Modelo: mínimo de Σ (p + n) sujeto a Σ criterio × coeficiente + p − n = precio de cada comparable; coeficientes y desviaciones ≥ 0, sin ordenada al origen." },
      { position: "bottom", text: "«A observar»: el modelo no alcanza su precio; conviene revisar ese comparable." },
    ],
  });
  const contributions = generatedTable(`${prefix}-contribucion`, "Contribución de cada criterio", [
    textColumn("CRITERIO"), figureColumn("COEFICIENTE"), figureColumn("VALOR SUJETO"), moneyColumn("CONTRIBUCIÓN $"), textColumn("NOTA"),
  ], fit.contributions.map((row) => [
    row.name, significant.format(row.coefficient), amount(row.subjectValue), money(row.contribution), row.contributes ? "" : NO_CONTRIBUTION_NOTE,
  ]), {
    summaryBoxes: [{
      id: "conclusiones",
      position: "bottom",
      align: "end",
      caption: "CONCLUSIONES",
      rows: [
        { label: "SUMA DE DESVIACIONES:", value: money(fit.objective) },
        { label: rent ? "RENTA MENSUAL ESTIMADA:" : "VALOR ESTIMADO DEL INMUEBLE:", value: money(fit.estimate), emphasis: "total" },
      ],
    }],
    notes: [{ position: "bottom", text: STATISTICAL_VALUE_NOTE }],
  });
  return [deviations, contributions];
}

/** RLM, PM and the market's homologation side by side: a reference, none adopted. */
export type MethodComparisonRow = { method: string; unitValue: number | null; value: number | null };

export function methodComparison(calculation: StatisticalCalculationDto): MethodComparisonRow[] {
  const regression = computeStatisticalRegression(calculation);
  const goal = computeStatisticalGoal(calculation);
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

function comparisonTable(calculation: StatisticalCalculationDto, prefix: string): TableContent | null {
  const rows = methodComparison(calculation);
  if (rows.length < 2) return null;
  const rent = isRentComparableType(calculation.settings.comparableType);
  return generatedTable(`${prefix}-comparacion`, "Comparación de métodos", [
    textColumn("MÉTODO"), moneyColumn(rent ? "RENTA UNITARIA $/M²/MES" : "VALOR UNITARIO $/M²"), moneyColumn(rent ? "RENTA MENSUAL $" : "VALOR $"),
  ], rows.map((row) => [row.method, row.unitValue === null ? EMPTY : money(row.unitValue), row.value === null ? EMPTY : money(row.value)]), {
    notes: [{ position: "bottom", text: NOT_ADOPTED_NOTE }],
  });
}

/** The block of the apartado, or none while nothing is to print. */
export function statisticalDocumentBlocks(calculation: StatisticalCalculationDto): Block[] {
  const { settings } = calculation;
  const type = settings.comparableType;
  const prefix = prefixFor(type);
  const scope = SCOPE[type];
  const regression = settings.regression.enabled && settings.regression.showInDictamen ? computeStatisticalRegression(calculation) : null;
  const goal = settings.goal.enabled && settings.goal.showInDictamen ? computeStatisticalGoal(calculation) : null;
  const regressionShown = regression?.ok ? regression.result : null;
  const goalShown = goal?.outcome.ok ? goal.outcome.fit : null;
  if (!regressionShown && !goalShown) return [];
  const comparison = settings.showComparison ? comparisonTable(calculation, prefix) : null;
  const unitColumn = Boolean(regressionShown) && settings.dependent === "UNIT_VALUE";
  const apartados = [
    generatedApartado(`${prefix}-datos`, `CRITERIOS, CODIFICACIÓN Y DATOS ${scope}`, { tables: dataTables(calculation, prefix, unitColumn) }),
    ...(regressionShown ? [generatedApartado(`${prefix}-regresion`, `${(settings.regression.title || DEFAULT_REGRESSION_TITLE).toUpperCase()} ${scope}`, {
      tables: regressionTables(calculation, regressionShown, `${prefix}-regresion`),
    })] : []),
    ...(goalShown ? [generatedApartado(`${prefix}-metas`, `${(settings.goal.title || DEFAULT_GOAL_TITLE).toUpperCase()} ${scope}`, {
      tables: goalTables(calculation, goalShown, `${prefix}-metas`),
    })] : []),
    ...(comparison ? [generatedApartado(`${prefix}-comparacion`, `COMPARACIÓN DE MÉTODOS ${scope}`, { tables: [comparison] })] : []),
  ];
  return [generatedBlock(prefix, "APLICACIÓN ESTADÍSTICA", { apartados })];
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
