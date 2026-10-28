/**
 * The calculation memory (memoria de cálculo): a technical annex, apart from
 * the dictamen, that shows how every computed value of a valuation was
 * obtained. The dictamen prints values; the memory prints their formulas.
 *
 * It has two parts:
 * - The document: every table with formula cells, printed with the column
 *   letters and row numbers of the editor so "=G1*F1" can be followed, and
 *   every concept whose value is a formula. A computed value is flagged so it
 *   prints in blue; a value typed directly prints in black.
 * - The engine: the trace of each approach (each market, costs, income,
 *   machinery and the conclusion), recomputed from what the valuation stores,
 *   step by step in the order of the calculation, and compared with the
 *   values the server stored so a difference is never silent.
 *
 * Pure TypeScript — no React, no database.
 */
import { valueAtPath, type CapturedFormulas, type PercentFields } from "../calculation/captured-formulas";
import type { ComparableCardDto } from "../calculation/comparable-card.service";
import { comparableValidity } from "../calculation/comparable-validity";
import type { CostCalculationDto } from "../calculation/cost-types";
import { COST_PERCENT_FIELDS, costEngineConfig, toCostEngineInput } from "../calculation/cost-types";
import type { ConclusionCalculationDto } from "../calculation/conclusion-types";
import { CONCLUSION_PERCENT_FIELDS, canConclude, conclusionEngineConfig } from "../calculation/conclusion-types";
import { roundDecimal } from "../calculation/free-formula";
import { INCOME_PERCENT_FIELDS, incomeEngineConfig, toIncomeEngineInput, type IncomeCalculationDto } from "../calculation/income-types";
import { toMachineryCostEngineInput, toMachineryMarketEngineInput, type MachineryCalculationDto } from "../calculation/machinery-types";
import type { StatisticalCalculationDto } from "../calculation/statistical-types";
import { statisticalRuns } from "./statistical-memory";
import { isGeneratedBlock } from "../calculation/market-document";
import {
  COMPARABLE_TYPE_LABELS,
  FACTOR_TYPE_LABELS,
  comparableFormulaValues,
  factorKey,
  findFactor,
  isComparableComplete,
  isRentComparableType,
  marketEngineConfig,
  toMarketEngineInput,
  type ComparableType,
  type MarketCalculationDto,
} from "../calculation/market-types";
import { APPROACH_LABELS, concludeValue, type Approach } from "../engine/conclusion";
import { ENGINE_VERSION } from "../engine/config";
import { computeCostApproach } from "../engine/costs";
import { computeIncomeApproach } from "../engine/income";
import { computeMachineryCost, computeMachineryMarket } from "../engine/machinery";
import { computeMarketApproach } from "../engine/market";
import { Trace, type TraceStep } from "../engine/trace";
import type { Apartado, AppSection, Block, Concept, TableContent } from "../model";
import { getCanonicalSectionKey } from "../sections/section-registry";
import { formatConceptValueForDocument } from "../services/concept-value-format";
import { buildFormulaIndex, canonicalTable, cellAddress, columnLetter, formulaToText, type FormulaIndex } from "../services/formula-references";
import { DEFAULT_NUMBER_PRESENTATION, documentNumberPresentation, type NumberPresentation } from "../services/number-presentation";
import { getDisplayColumns, type FormulaOperand, type TableFormula, type TableV2 } from "../services/table";
import { evaluateTableFormulas, formulaCellKey, getCellDisplayValue, readSourceNumber, referenceKey } from "../services/table-formula-engine";
import { conceptSourceValue, conceptTakesFormula } from "../services/valuation-formulas";
import { getBlockFlowApartadoOrder } from "../services/visible-numbering";

/* ================================================================== */
/*  MODEL                                                              */
/* ================================================================== */

/** One cell of a table as the memory prints it. */
export type MemoryCell = {
  /** "B2": column letter and row number as the editor shows them. */
  address: string;
  /** The value as the dictamen prints it. */
  text: string;
  /** Computed by a formula (blue); false: typed directly (black). */
  computed: boolean;
  /** The formula as written, with its "=": "=G1*F1". */
  formula?: string;
  /** The same formula with the values it read in place: "=1200*0.95". */
  withValues?: string;
};

export type MemoryTable = {
  kind: "table";
  id: string;
  /** Sección › apartado › tabla. */
  location: string[];
  title: string;
  columns: Array<{ letter: string; name: string }>;
  rows: Array<{ number: number; cells: MemoryCell[] }>;
};

export type MemoryConcept = {
  kind: "concept";
  id: string;
  location: string[];
  label: string;
  value: string;
  formula: string;
  withValues?: string;
};

export type MemoryInput = { name: string; value: string };

export type MemoryStep = {
  key: string;
  label: string;
  /** The formula in words and symbols, as the engine records it. */
  formula: string;
  inputs: MemoryInput[];
  value: string;
  /** Excel ROUND digits applied to the value. */
  rounding?: number;
  /** What the server stored for this step, when it is not what the memory computes. */
  storedValue?: string;
};

/** A value the appraiser typed as a formula in a calculation panel (a factor "=1/0.8", a price "=1345*235"). */
export type MemoryCapturedFormula = { label: string; formula: string; value: string };

export type MemoryApproach = {
  /** The engine run it reproduces: MOTOR.MERCADO.TERRENO_VENTA, MOTOR.COSTOS… */
  key: string;
  title: string;
  location: string[];
  steps: MemoryStep[];
  captured: MemoryCapturedFormula[];
  /** Why the engine cannot compute it yet, in the appraiser's words. */
  pending?: string;
  /** Engine version of the stored run; null when nothing was stored. */
  storedVersion: string | null;
  /** Some step differs from what the server stored. */
  differs: boolean;
};

export type CalculationMemory = {
  folio: string;
  valuationDate: string;
  firmName: string;
  engineVersion: string;
  /** ISO date and time the memory was generated. */
  generatedAt: string;
  concluded: boolean;
  document: Array<MemoryTable | MemoryConcept>;
  /** In the order their sections print in the dictamen; one without its section goes last. */
  approaches: MemoryApproach[];
  /** The headings of the dictamen's sections ("3. ENFOQUE DE COSTOS"), in the order they print. */
  sectionHeadings: string[];
};

/** The calculations of a valuation, as the editor's panels read them. */
export type MemoryCalculations = {
  markets: MarketCalculationDto[];
  cost: CostCalculationDto | null;
  income: IncomeCalculationDto | null;
  machinery: MachineryCalculationDto | null;
  conclusion: ConclusionCalculationDto | null;
  /** The statistical methods of each comparable type (regression and goal programming). */
  statistical?: StatisticalCalculationDto[];
};

/** A run of the engine the server stored: its version and the value of each step by key. */
export type StoredRun = { key: string; version: string; results: Record<string, number | null> };

export type CalculationMemoryInput = {
  /** The document as the dictamen prints it: numbered, with its formulas computed. */
  sections: AppSection[];
  calculations: MemoryCalculations;
  stored: StoredRun[];
  folio: string;
  valuationDate: string;
  firmName: string;
  concluded: boolean;
  generatedAt: Date;
};

/* ================================================================== */
/*  NUMBERS                                                            */
/* ================================================================== */

/** Most decimals an engine figure prints with: factors and rates need them. */
const ENGINE_DECIMALS = 6;
/** A range of more cells than this keeps its reference in the formula with values. */
const MAX_SUBSTITUTED_CELLS = 12;

const engineNumber = new Intl.NumberFormat("es-MX", { maximumFractionDigits: ENGINE_DECIMALS });

/** An engine figure: "1,528,000", "0.954321". */
export function formatEngineValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  return Number.isFinite(value) ? engineNumber.format(roundDecimal(value, ENGINE_DECIMALS)) : "—";
}

/** A number as it is typed in a formula: no separators, no exponent, a negative in parentheses. */
function formulaNumber(value: number) {
  const fixed = roundDecimal(value, ENGINE_DECIMALS).toFixed(ENGINE_DECIMALS).replace(/\.?0+$/, "");
  const text = fixed === "-0" ? "0" : fixed;
  return value < 0 ? `(${text})` : text;
}

/**
 * Words of the engine's keys and formulas as the appraiser reads them: the
 * land factors keep English keys in the engine, and keys carry no accents.
 */
const READABLE_WORDS: Record<string, string> = {
  negotiation: "negociación",
  location: "ubicación",
  services: "servicios",
  classification: "clasificación",
  topography: "topografía",
  util: "útil",
  conservacion: "conservación",
  terminacion: "terminación",
  maximo: "máximo",
  minimo: "mínimo",
};

const readable = (text: string) => text.replace(/[A-Za-záéíóúñ]+/g, (word) => READABLE_WORDS[word.toLowerCase()] ?? word);

/** "superficieComparable" reads "Superficie comparable", "vidaUtil" "Vida útil". */
function inputName(key: string) {
  const words = readable(key.replace(/([a-záéíóúñ])([A-Z])/g, "$1 $2")).replace(/ [A-Z](?=[a-z])/g, (word) => word.toLowerCase());
  return words.replace(/^./, (first) => first.toUpperCase());
}

/* ================================================================== */
/*  DOCUMENT: FORMULA TABLES AND CONCEPTS                              */
/* ================================================================== */

const sectionHeading = (section: AppSection) => (section.label ? `${section.label}. ${section.title}` : section.title);
const blockHeading = (block: Pick<Block, "sectionLabel" | "title">) => [block.sectionLabel, block.title].filter(Boolean).join(". ");

/** "Sección › apartado", without repeating a title the level above already says. */
function placeOf(section: AppSection, block: Block, apartado: Apartado | null, apartadoLabel: string) {
  const same = (left: string, right: string | undefined) => left.trim().toLowerCase() === (right ?? "").trim().toLowerCase();
  const parts = [sectionHeading(section)];
  if (block.title.trim() && !same(block.title, section.title) && !same(block.title, apartado?.title)) parts.push(blockHeading(block));
  if (apartado?.title.trim()) parts.push([apartadoLabel, apartado.title].filter(Boolean).join(" "));
  return parts;
}

const hasOwnFormula = (concept: Concept): concept is Concept & { formula: TableFormula } =>
  Boolean(concept.formula?.expression) && conceptTakesFormula(concept);

const tableHasFormulas = (table: TableV2) => table.rows.some((row) => Object.values(row.cells).some((cell) => cell?.kind === "formula"));

/** The number a cell holds for a formula: its result, or what was typed when it reads as one. */
function cellNumber(table: TableV2, rowId: string, columnId: string): number | null {
  const cell = table.rows.find((row) => row.id === rowId)?.cells[columnId];
  if (!cell) return null;
  if (cell.kind === "formula") {
    const result = table.formulaResults?.[formulaCellKey(rowId, columnId)];
    return result?.ok ? result.value : null;
  }
  const read = readSourceNumber(cell.value);
  return read.kind === "number" ? read.value : null;
}

/** The cells between two corners as the table shows them, by rows. */
function spanCells(table: TableV2, from: { rowId: string; columnId: string }, to: { rowId: string; columnId: string }) {
  const columns = getDisplayColumns(table);
  const rowIndex = (id: string) => table.rows.findIndex((row) => row.id === id);
  const columnIndex = (id: string) => columns.findIndex((column) => column.id === id);
  const [r1, r2, c1, c2] = [rowIndex(from.rowId), rowIndex(to.rowId), columnIndex(from.columnId), columnIndex(to.columnId)];
  if ([r1, r2, c1, c2].includes(-1)) return null;
  const cells: Array<{ rowId: string; columnId: string }> = [];
  for (let row = Math.min(r1, r2); row <= Math.max(r1, r2); row += 1) {
    for (let column = Math.min(c1, c2); column <= Math.max(c1, c2); column += 1) {
      cells.push({ rowId: table.rows[row].id, columnId: columns[column].id });
    }
  }
  return cells;
}

/** The values a reference reads, written as a formula takes them; null keeps the reference. */
function referenceValues(index: FormulaIndex, operand: FormulaOperand, home: TableV2 | undefined): string | null {
  const tableOf = (tableId: string | undefined) => (tableId && tableId !== home?.id ? index.tableById.get(tableId)?.table : home);
  const list = (table: TableV2 | undefined, cells: Array<{ rowId: string; columnId: string }> | null) => {
    if (!table || !cells?.length || cells.length > MAX_SUBSTITUTED_CELLS) return null;
    const values = cells.map((cell) => cellNumber(table, cell.rowId, cell.columnId));
    if (values.some((value) => value === null)) return null;
    return values.map((value) => formulaNumber(value as number)).join("; ");
  };
  switch (operand.type) {
    case "cell":
      return list(tableOf(operand.tableId), [operand]);
    case "span": {
      const table = tableOf(operand.tableId);
      return list(table, table ? spanCells(table, operand.from, operand.to) : null);
    }
    case "range":
      return list(home, operand.cells);
    case "row":
      return list(home, home ? getDisplayColumns(home).map((column) => ({ rowId: operand.rowId, columnId: column.id })) : null);
    case "column":
      return list(home, home?.rows.map((row) => ({ rowId: row.id, columnId: operand.columnId })) ?? null);
    case "concept": {
      const concept = index.conceptById.get(referenceKey(String(operand.conceptId)))?.concept;
      const read = concept ? conceptSourceValue(concept) : null;
      return read?.kind === "number" ? formulaNumber(read.value) : null;
    }
    default:
      return null;
  }
}

/** "=G1*F1" and, when it names something, "=1200*0.95". */
function writtenFormula(formula: TableFormula, index: FormulaIndex, table: TableV2 | undefined) {
  const written = `=${formulaToText(formula, { index, table })}`;
  const substituted = `=${formulaToText(formula, { index, table, referenceValue: (operand, home) => referenceValues(index, operand, home) })}`;
  return { formula: written, ...(substituted === written ? {} : { withValues: substituted }) };
}

function memoryTable(table: TableContent, location: string[], index: FormulaIndex, presentation: NumberPresentation): MemoryTable | null {
  if (table.enabled === false) return null;
  const canonical = canonicalTable(table);
  if (!tableHasFormulas(canonical)) return null;
  const columns = getDisplayColumns(canonical);
  const results = evaluateTableFormulas(canonical);
  return {
    kind: "table",
    id: canonical.id,
    location,
    title: canonical.title.trim() || "Tabla",
    columns: columns.map((column, position) => ({ letter: columnLetter(position), name: column.name })),
    rows: canonical.rows.map((row, position) => ({
      number: position + 1,
      cells: columns.map((column): MemoryCell => {
        const cell = row.cells[column.id];
        const address = cellAddress(canonical, row.id, column.id) ?? "";
        const text = cell ? getCellDisplayValue(canonical, row.id, column.id, results, presentation) : "";
        if (cell?.kind !== "formula") return { address, text, computed: false };
        return { address, text, computed: true, ...writtenFormula(cell.formula, index, canonical) };
      }),
    })),
  };
}

function memoryConcept(concept: Concept, location: string[], index: FormulaIndex, presentation: NumberPresentation): MemoryConcept | null {
  if (concept.enabled === false || !hasOwnFormula(concept)) return null;
  const { formula, withValues } = writtenFormula(concept.formula, index, undefined);
  return {
    kind: "concept",
    id: concept.id,
    location,
    label: concept.label.trim() || "Concepto",
    value: formatConceptValueForDocument(concept, presentation),
    formula,
    ...(withValues ? { withValues } : {}),
  };
}

/** Every formula table and formula concept the dictamen prints, in document order. */
export function documentFormulas(sections: AppSection[]): Array<MemoryTable | MemoryConcept> {
  const index = buildFormulaIndex(sections);
  const presentation = sections.length ? documentNumberPresentation(sections) : DEFAULT_NUMBER_PRESENTATION;
  const items: Array<MemoryTable | MemoryConcept> = [];
  const visit = (content: Pick<Block | Apartado, "concepts" | "tables">, location: string[]) => {
    for (const concept of content.concepts) {
      const item = memoryConcept(concept, location, index, presentation);
      if (item) items.push(item);
    }
    for (const table of content.tables) {
      const item = memoryTable(table, [...location, table.title.trim() || "Tabla"], index, presentation);
      if (item) items.push(item);
    }
  };
  for (const section of sections) {
    if (section.enabled === false) continue;
    for (const block of section.blocks) {
      // The engine's own blocks carry no formulas: their figures are in the engine part.
      if (block.enabled === false || isGeneratedBlock(block)) continue;
      visit(block, placeOf(section, block, null, ""));
      let ordinal = 0;
      for (const apartado of getBlockFlowApartadoOrder(block)) {
        if (apartado.enabled === false) continue;
        ordinal += 1;
        const label = block.sectionLabel ? `${block.sectionLabel.replace(/\.+$/, "")}.${ordinal}` : "";
        visit(apartado, placeOf(section, block, apartado, label));
      }
    }
  }
  return items;
}

/* ================================================================== */
/*  ENGINE: TRACE OF EACH APPROACH                                     */
/* ================================================================== */

type EngineRun = {
  key: string;
  title: string;
  sectionKey: string;
  trace: Trace | null;
  pending?: string;
  captured?: MemoryCapturedFormula[];
  /** A market's factors by their column label, for the steps that multiply them (the resultant factor). */
  labels?: Record<string, string>;
};

/** "custom:vista-al-mar" reads "Vista al mar" when the firm's factor has no label of its own. */
const customFactorName = (key: string) => key.replace(/^custom:/, "").replace(/-/g, " ").replace(/^./, (first) => first.toUpperCase());

/**
 * The factors of a market by the key the engine records them with, labelled as
 * the homologation table heads them: the slot's label, else the catalog's
 * (the firm's own factor by its name). The surface factor is "superficie".
 */
export function marketFactorLabels(calculation: Pick<MarketCalculationDto, "settings">): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const slot of calculation.settings.factorSlots) {
    const key = factorKey(slot);
    const fallback = key.startsWith("custom:") ? customFactorName(key) : FACTOR_TYPE_LABELS[slot.type];
    labels[slot.type === "SUPERFICIE" ? "superficie" : key] = slot.label.trim() || fallback;
  }
  return labels;
}

/** Runs the engine as the panel does; a calculation that cannot run says why. */
function run(compute: (trace: Trace) => unknown): { trace: Trace | null; pending?: string } {
  const trace = new Trace();
  try {
    compute(trace);
    return { trace };
  } catch (error) {
    return { trace: null, pending: error instanceof Error ? error.message : "El cálculo no se pudo completar." };
  }
}

/** Factors typed as subject / comparable ratings: the formula the appraiser wrote, "=1/0.8". */
function capturedRatings(calculation: MarketCalculationDto): MemoryCapturedFormula[] {
  const captured: MemoryCapturedFormula[] = [];
  for (const comparable of calculation.comparables.filter(isComparableComplete)) {
    for (const slot of calculation.settings.factorSlots) {
      const factor = findFactor(comparable, slot);
      if (!factor?.subjectRating || !factor.comparableRating) continue;
      captured.push({
        label: `${slot.label}, comparable ${comparable.reference}`,
        formula: `=${formulaNumber(factor.subjectRating)}/${formulaNumber(factor.comparableRating)}`,
        value: formatEngineValue(factor.subjectRating / factor.comparableRating),
      });
    }
  }
  return captured;
}

/** How the memory names the numeric fields of the panels, by their key in what the panel saves. */
const FIELD_LABELS: Record<string, string> = {
  subjectArea: "Superficie del sujeto",
  baseArea: "Lote tipo",
  referenceArea: "Lote tipo",
  unitValue: "Valor unitario",
  adoptedUnitValue: "Valor unitario adoptado",
  additionalAmount: "Monto adicional",
  typicalFrontage: "Frente tipo",
  typicalDepth: "Fondo tipo",
  surfaceFactor: "Factor de superficie",
  resultantFactor: "Factor resultante",
  negotiation: "Negociación",
  location: "Ubicación",
  services: "Servicios",
  classification: "Clasificación",
  topography: "Topografía",
  conservation: "Factor de conservación",
  ageFactor: "Factor de edad",
  otherFactor: "Otro factor",
  completion: "Grado de terminación",
  undivided: "Indiviso",
  unitReplacementCost: "Valor unitario de reposición nuevo",
  quantity: "Cantidad",
  area: "Superficie",
  age: "Edad",
  usefulLife: "Vida útil",
  percentage: "Porcentaje",
  base: "Base",
  price: "Precio",
  frontage: "Frente",
  depth: "Fondo",
  frontCount: "Número de frentes",
  vacancyDays: "Días de vacío",
  contractYears: "Años de contrato",
  otherMonthlyIncome: "Otros ingresos mensuales",
  tiie: "TIIE 28 días",
  inflation: "Inflación anual",
  remainingLifeYears: "Vida útil remanente",
  vacancy: "Vacancia",
  unitRent: "Renta unitaria",
  rate: "Tasa",
  appliedRate: "Tasa aplicada",
  quotedPrice: "Cotización",
  exchangeRate: "Tipo de cambio",
  customs: "Gastos aduanales",
  freight: "Fletes y maniobras",
  insurance: "Seguros y/o fianzas",
  engineering: "Ingenierías",
  installation: "Instalación",
  otherExpenses: "Otros gastos",
  fees: "F.E.E.S.",
  maintenance: "Factor de mantenimiento",
  technological: "Factor tecnológico",
  economic: "Factor económico",
};
const GROUP_LABELS: Record<string, string> = { land: "Terreno", annuity: "Anualidad", marketRate: "Tasa de mercado", item: "Bien" };

/**
 * The field a formula was typed in, in words: "Construcción T-1 · Valor
 * unitario de reposición nuevo". `rows` names the rows of each list by their
 * position; `names` gives the words of a key of its own (a factor's column).
 */
function formulaFieldLabel(path: string, rows: Record<string, (index: number) => string> = {}, names: Record<string, string> = {}) {
  const segments = path.split(".");
  const parts: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const next = segments[index + 1];
    if (next !== undefined && /^\d+$/.test(next) && rows[segment]) {
      parts.push(rows[segment](Number(next)));
      index += 1;
    } else if (segment === "salePrices" && next !== undefined) {
      parts.push(`Precio de venta del comparable ${next}`);
      index += 1;
    } else if (segment === "weights" && next !== undefined) {
      parts.push(`Peso del ${(APPROACH_LABELS[next as Approach] ?? next).toLowerCase()}`);
      index += 1;
    } else if (next === undefined) {
      parts.push(names[segment] ?? FIELD_LABELS[segment] ?? inputName(segment));
    } else if (GROUP_LABELS[segment]) {
      parts.push(GROUP_LABELS[segment]);
    }
  }
  return parts.join(" · ");
}

/**
 * The values typed as formulas in a panel, as the memory prints them: the
 * field, the formula and the value it gave (a percentage, as typed).
 */
export function typedFormulas(
  formulas: CapturedFormulas | undefined,
  source: unknown,
  options: { rows?: Record<string, (index: number) => string>; names?: Record<string, string>; percent?: PercentFields; prefix?: string } = {},
): MemoryCapturedFormula[] {
  return Object.entries(formulas ?? {}).flatMap(([path, formula]) => {
    const value = valueAtPath(source, path);
    if (typeof value !== "number") return [];
    const label = formulaFieldLabel(path, options.rows, options.names);
    return [{
      label: options.prefix ? `${options.prefix} · ${label}` : label,
      formula,
      value: options.percent?.(path) ? `${formatEngineValue(value * 100)} %` : formatEngineValue(value),
    }];
  });
}

const refRow = (kind: string, rows: Array<{ ref: string }>) => (index: number) => `${kind} ${rows[index]?.ref || index + 1}`;

/** The formulas typed in the specifications of a market and in its comparables (their data and their factors). */
function marketTypedFormulas(calculation: MarketCalculationDto): MemoryCapturedFormula[] {
  const factorNames = Object.fromEntries(calculation.settings.factorSlots.map((slot) => [factorKey(slot), slot.label]));
  return [
    ...typedFormulas(calculation.settings.formulas, calculation.settings),
    ...calculation.comparables.flatMap((comparable) => typedFormulas(comparable.formulas, comparableFormulaValues(comparable), {
      prefix: `Comparable ${comparable.reference}`,
      names: Object.fromEntries(comparable.factors.map((factor) => [factorKey(factor), factorNames[factorKey(factor)] ?? FACTOR_TYPE_LABELS[factor.type]])),
    })),
  ];
}

/** The formulas typed in the cost approach and in the construction types it values. */
function costTypedFormulas(cost: CostCalculationDto): MemoryCapturedFormula[] {
  return [
    ...typedFormulas(cost.typeFormulas, cost, { rows: { types: refRow("Tipo", cost.types) } }),
    ...typedFormulas(cost.formulas, cost, {
      percent: COST_PERCENT_FIELDS,
      rows: {
        constructions: refRow("Construcción", cost.constructions),
        installations: refRow("Instalación", cost.installations),
        indirects: (index) => `Indirecto ${cost.indirects[index]?.concept || index + 1}`,
      },
    }),
  ];
}

/** The engine runs of a valuation, in the order of the document: markets, costs, income, conclusion. */
export function engineRuns(calculations: MemoryCalculations): EngineRun[] {
  const runs: EngineRun[] = [];
  const machinery = calculations.machinery?.applies ? calculations.machinery : null;

  for (const calculation of calculations.markets) {
    const type = calculation.settings.comparableType;
    if (!calculation.configured && !calculation.comparables.length) continue;
    const input = toMarketEngineInput(calculation);
    runs.push({
      key: `MOTOR.MERCADO.${type}`,
      title: `Enfoque de mercado · ${COMPARABLE_TYPE_LABELS[type]}`,
      sectionKey: isRentComparableType(type) ? "MERCADO_RENTAS" : "MERCADO_VENTA",
      captured: [...capturedRatings(calculation), ...marketTypedFormulas(calculation)],
      labels: marketFactorLabels(calculation),
      ...(input.ok
        ? run((trace) => computeMarketApproach(input.input, marketEngineConfig(calculation.settings, calculation.precision), trace))
        : { trace: null, pending: input.reason }),
    });
  }
  runs.push(...statisticalRuns(calculations.statistical));

  if (machinery) {
    if (machinery.configured.cost) {
      const input = toMachineryCostEngineInput(machinery.cost);
      runs.push({
        key: "MOTOR.MAQUINARIA.COSTOS",
        title: "Enfoque de costos · Maquinaria y equipo",
        sectionKey: "COSTOS",
        captured: typedFormulas(machinery.cost.formulas, machinery.cost, { rows: { attachments: refRow("Aditamento", machinery.cost.attachments) } }),
        ...(input.ok ? run((trace) => computeMachineryCost(input.input, trace)) : { trace: null, pending: input.reason }),
      });
    }
    if (machinery.configured.market) {
      const input = toMachineryMarketEngineInput(machinery.market);
      runs.push({
        key: "MOTOR.MAQUINARIA.MERCADO",
        title: "Enfoque de mercado · Maquinaria y equipo",
        sectionKey: "MERCADO_VENTA",
        captured: typedFormulas(machinery.market.formulas, machinery.market, { rows: { offers: refRow("Oferta", machinery.market.offers) } }),
        ...(input.ok ? run((trace) => computeMachineryMarket(input.input, trace)) : { trace: null, pending: input.reason }),
      });
    }
  } else if (calculations.cost?.configured) {
    const cost = calculations.cost;
    const input = toCostEngineInput(cost);
    runs.push({
      key: "MOTOR.COSTOS",
      title: "Enfoque de costos",
      sectionKey: "COSTOS",
      captured: costTypedFormulas(cost),
      ...(input.ok ? run((trace) => computeCostApproach(input.input, costEngineConfig(cost), trace)) : { trace: null, pending: input.reason }),
    });
  }

  if (!machinery && calculations.income?.configured) {
    const input = toIncomeEngineInput(calculations.income);
    runs.push({
      key: "MOTOR.INGRESOS",
      title: "Enfoque de ingresos",
      sectionKey: "INGRESOS",
      captured: typedFormulas(calculations.income.formulas, calculations.income, {
        percent: INCOME_PERCENT_FIELDS,
        rows: {
          rentableUnits: (index) => `Superficie rentable ${calculations.income?.rentableUnits[index]?.description || index + 1}`,
          deductions: (index) => `Deducción ${calculations.income?.deductions[index]?.concept || index + 1}`,
        },
      }),
      ...(input.ok ? run((trace) => computeIncomeApproach(input.input, incomeEngineConfig({ precision: calculations.income?.precision }), trace)) : { trace: null, pending: input.reason }),
    });
  }

  const conclusion = calculations.conclusion;
  if (conclusion && Object.values(conclusion.values).some((value) => value !== null)) {
    runs.push({
      key: "MOTOR.CONCLUSION",
      title: "Conclusión",
      sectionKey: "CONCLUSIONES",
      captured: typedFormulas(conclusion.formulas, conclusion, { percent: CONCLUSION_PERCENT_FIELDS }),
      ...(canConclude(conclusion)
        ? run((trace) => concludeValue({ values: conclusion.values, method: conclusion.method }, conclusionEngineConfig(conclusion), trace))
        : { trace: null, pending: "Elige con qué enfoque se concluye, o una ponderación que sume 100 %." }),
    });
  }
  return runs;
}

/** Stored values are kept with eight decimals: a difference below that is the storage, not the calculation. */
function sameAsStored(value: number, stored: number) {
  return Math.abs(value - stored) <= Math.max(1e-6, Math.abs(value) * 1e-9);
}

function memoryStep(step: TraceStep, stored: StoredRun | undefined, labels: Record<string, string> = {}): MemoryStep {
  const labelled = (text: string) => text.split(/(\s+)/).map((token) => (Object.hasOwn(labels, token) ? labels[token] : token)).join("");
  const storedValue = stored?.results[step.key.slice(0, 120)];
  const differs = typeof storedValue === "number" && Number.isFinite(step.value) && !sameAsStored(step.value, storedValue);
  return {
    key: step.key,
    label: step.label,
    formula: readable(labelled(step.formula)),
    inputs: Object.entries(step.inputs).map(([name, value]) => ({
      name: Object.hasOwn(labels, name) ? labels[name] : inputName(name),
      value: formatEngineValue(value),
    })),
    value: formatEngineValue(step.value),
    ...(step.rounding === undefined ? {} : { rounding: step.rounding }),
    ...(differs ? { storedValue: formatEngineValue(storedValue) } : {}),
  };
}

function approachLocation(sections: AppSection[], sectionKey: string, title: string) {
  const section = sections.find((item) => item.enabled !== false && getCanonicalSectionKey(item.id) === sectionKey);
  return section ? [sectionHeading(section), title] : [title];
}

/* ================================================================== */
/*  WHOLE MEMORY                                                       */
/* ================================================================== */

export function buildCalculationMemory(input: CalculationMemoryInput): CalculationMemory {
  const storedByKey = new Map(input.stored.map((run) => [run.key, run]));
  const approaches = engineRuns(input.calculations).map((engine): MemoryApproach => {
    const stored = storedByKey.get(engine.key);
    const steps = engine.trace?.steps.map((step) => memoryStep(step, stored, step.key.endsWith(".factorResultante") ? engine.labels : undefined)) ?? [];
    return {
      key: engine.key,
      title: engine.title,
      location: approachLocation(input.sections, engine.sectionKey, engine.title),
      steps,
      captured: engine.captured ?? [],
      ...(engine.pending ? { pending: engine.pending } : {}),
      storedVersion: stored?.version ?? null,
      differs: steps.some((step) => step.storedValue !== undefined),
    };
  });
  const sectionHeadings = input.sections.filter((section) => section.enabled !== false).map(sectionHeading);
  // As the dictamen prints them: an approach whose section is not in the document goes last, in the engine's order.
  const rank = (approach: MemoryApproach) => {
    const index = approach.location.length > 1 ? sectionHeadings.indexOf(approach.location[0]) : -1;
    return index === -1 ? sectionHeadings.length : index;
  };
  return {
    folio: input.folio,
    valuationDate: input.valuationDate,
    firmName: input.firmName,
    engineVersion: ENGINE_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    concluded: input.concluded,
    document: documentFormulas(input.sections),
    approaches: approaches.map((approach, index) => ({ approach, index: engineOrder(approaches, approach, index) }))
      .sort((a, b) => rank(a.approach) - rank(b.approach) || a.index - b.index)
      .map(({ approach }) => approach),
    sectionHeadings,
  };
}

/**
 * Where an approach goes among those of its section: its own place, but the
 * statistical methods of a market (MOTOR.ESTADISTICO.<tipo>) right after the
 * market of the same type (MOTOR.MERCADO.<tipo>), as the dictamen prints them.
 */
function engineOrder(approaches: Array<Pick<MemoryApproach, "key">>, approach: Pick<MemoryApproach, "key">, index: number) {
  const type = /^MOTOR\.ESTADISTICO\.(.+)$/.exec(approach.key)?.[1];
  const market = type ? approaches.findIndex((item) => item.key === `MOTOR.MERCADO.${type}`) : -1;
  return market === -1 ? index : market + 0.5;
}

/** One section of the dictamen in the memory: its formulas, then the approaches calculated in it. */
export type MemoryChapter = { heading: string; document: Array<MemoryTable | MemoryConcept>; approaches: MemoryApproach[] };

/**
 * The memory by the sections of the dictamen, in their order: each with the
 * formulas of its tables and concepts and the engine's steps of its
 * approaches. Sections with neither are left out; approaches without a
 * section in the document form chapters of their own, last.
 */
export function memoryChapters(memory: Pick<CalculationMemory, "document" | "approaches" | "sectionHeadings">): MemoryChapter[] {
  const chapters = new Map<string, MemoryChapter>();
  const chapter = (heading: string) => {
    const found = chapters.get(heading);
    if (found) return found;
    const created: MemoryChapter = { heading, document: [], approaches: [] };
    chapters.set(heading, created);
    return created;
  };
  for (const heading of memory.sectionHeadings) chapter(heading);
  for (const item of memory.document) chapter(item.location[0] ?? "Documento").document.push(item);
  for (const approach of memory.approaches) chapter(approach.location.length > 1 ? approach.location[0] : approach.title).approaches.push(approach);
  return [...chapters.values()].filter((item) => item.document.length || item.approaches.length);
}

/** The order the markets print in the dictamen: land before buildings for sale, buildings before land for rent. */
const PRINT_ORDER: ComparableType[] = ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA", "TERRENO_RENTA"];

/**
 * "Memoria técnica de comparables": the sheet of every comparable the
 * valuation uses, market by market as the dictamen prints them, with the
 * data, photos and source captured. A sheet of the memory carries no uses
 * in other valuations, review or warnings.
 */
export function memoryComparableCards(
  markets: Array<Pick<MarketCalculationDto, "settings" | "comparables" | "comparableValidityMonths">>,
  valuation: { id: string; folio: string; title: string | null },
  today: string,
): ComparableCardDto[] {
  return [...markets]
    .sort((a, b) => PRINT_ORDER.indexOf(a.settings.comparableType) - PRINT_ORDER.indexOf(b.settings.comparableType))
    .flatMap((market) => [...market.comparables].sort((a, b) => a.reference - b.reference).map((comparable): ComparableCardDto => ({
      comparable,
      type: market.settings.comparableType,
      valuation,
      validity: comparableValidity(comparable.updatedOn ?? today, today, comparable.validityMonths ?? market.comparableValidityMonths),
      warnings: [],
      uses: [],
    })));
}
