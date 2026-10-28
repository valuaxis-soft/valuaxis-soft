/**
 * "Métodos estadísticos" (otros métodos alternativos, aplicación estadística):
 * the multiple linear regression (RLM) and the goal programming (PM) as an
 * apartado of their own, apart from the market approach (28 Oct 2026). Both
 * share the comparables, the criteria (variables), their coding and scales,
 * as steps 1 to 6 of the appraiser's course; only the model changes. The
 * comparables are their own: the market's can be imported as a start, and the
 * ones added here never show in the market approach.
 *
 * One capture per comparable type (land or buildings, for sale or rent).
 * Pure, shared by the browser (live regression) and the server (stored trace,
 * goal programming solved with HiGHS).
 */
import { goalProgramProblem, readGoalSolution, type GoalProgramProblem, type GoalProgramSolution, type GoalProgrammingOutcome } from "../engine/goal-programming";
import { MAX_REGRESSION_VARIABLES, fitLinearRegression, type EstimationInput, type RegressionFit } from "../engine/regression";
import { Trace } from "../engine/trace";
import type { CalculationPrecision } from "./calculation-precision";
import { parseDecimal } from "./free-formula";
import { regressionFieldOptions } from "./market-regression";
import {
  characteristicValueText,
  defaultCharacteristicFields,
  isRentComparableType,
  type CharacteristicField,
  type ComparableType,
  type MarketCalculationDto,
} from "./market-types";

/** At most twelve criteria, for both methods. */
export const MAX_STATISTICAL_VARIABLES = MAX_REGRESSION_VARIABLES;
/** A qualitative criterion takes up to ten levels. */
export const MAX_SCALE_LEVELS = 10;
/** Enough for the hundred and more comparables a regression wants. */
export const MAX_STATISTICAL_COMPARABLES = 500;
export const MAX_STATISTICAL_FIELDS = 30;

/**
 * How a criterion becomes a number (step 3 of the course): as it is (direct),
 * against a base (contrary: VUR = 60 − antigüedad), its inverse (1/x), or by
 * the appraiser's scale (ordinal or nominal criteria).
 */
export const STATISTICAL_CODINGS = ["DIRECT", "CONTRARY", "INVERSE", "SCALE"] as const;
export type StatisticalCoding = (typeof STATISTICAL_CODINGS)[number];

export const CODING_LABELS: Record<StatisticalCoding, string> = {
  DIRECT: "Directo (tal cual)",
  CONTRARY: "Contrario (base − valor)",
  INVERSE: "Inverso (1 / valor)",
  SCALE: "Escala (cualitativo)",
};

/** "VUR = 60 − antigüedad": the base of a contrary criterion unless the appraiser writes another. */
export const DEFAULT_CONTRARY_BASE = 60;

/** A scale numbered 1, 2, 3… in the order of its levels, or with the numbers the appraiser writes (8, 4, 2, 1). */
export const SCALE_MODES = ["ORDERED", "FREE"] as const;
export type ScaleMode = (typeof SCALE_MODES)[number];

export type ScaleLevel = { label: string; value: number };

export type StatisticalVariableDto = {
  /** Key of a field of the capture ("area", "custom:…"). */
  key: string;
  coding: StatisticalCoding;
  /** Base of a contrary criterion; missing, 60. */
  base?: number | null;
  scaleMode?: ScaleMode | null;
  /** The levels in their order; with ORDERED their value is their place. */
  scale?: ScaleLevel[] | null;
};

/** Y of the regression: the total price of the offer, or its unit value. The goal programming always takes the price. */
export const STATISTICAL_DEPENDENTS = ["PRICE", "UNIT_VALUE"] as const;
export type StatisticalDependent = (typeof STATISTICAL_DEPENDENTS)[number];

export type StatisticalMethodSettings = {
  enabled: boolean;
  /** Prints in the dictamen; off until the appraiser turns it on. */
  showInDictamen: boolean;
  /** Title of its apartado; empty, the default. */
  title?: string | null;
};

export type StatisticalSettingsDto = {
  comparableType: ComparableType;
  /** The characteristics captured for each comparable; "area" is always there (the unit value needs it). */
  fields: CharacteristicField[];
  /** The subject's value of each field, as written. */
  subject: Record<string, string>;
  dependent: StatisticalDependent;
  variables: StatisticalVariableDto[];
  regression: StatisticalMethodSettings & {
    /** The residual column of the data table; hidden unless the appraiser shows it. */
    showResidual?: boolean;
  };
  goal: StatisticalMethodSettings;
  /** The table that sets RLM, PM and the market's homologation side by side, in the dictamen. */
  showComparison: boolean;
};

export type StatisticalComparableDto = {
  id: string;
  /** 1, 2, 3… in the order of capture. */
  reference: number;
  price: number | null;
  /** The value of each field as written, by key ("area" included). */
  values: Record<string, string>;
  /** Left out of both models by the appraiser. */
  excluded?: boolean;
  /** Brought from the market approach: the id of that comparable, so it is not imported twice. */
  marketComparableId?: string | null;
};

/** What the market's homologation gave, to compare: never adopted from here. */
export type MarketReferenceDto = {
  /** Homologated mean and median, $/m² (or $/m²/mes). */
  mean: number | null;
  median: number | null;
  adoptedUnitValue: number | null;
  value: number | null;
  subjectArea: number | null;
};

export type StatisticalCalculationDto = {
  settings: StatisticalSettingsDto;
  comparables: StatisticalComparableDto[];
  locked: boolean;
  /** Stored as its own apartado: false while it is new or still read from the market. */
  configured: boolean;
  /**
   * Read from the regression the market approach kept before this apartado
   * existed (compatibility): its comparables are the market's until the
   * appraiser saves here, which keeps a copy of its own.
   */
  fromMarket: boolean;
  precision?: CalculationPrecision;
  /** The goal program the server solved for these data; the browser reads it back. */
  goal: { problem: GoalProgramProblem; solution: GoalProgramSolution } | null;
  market: MarketReferenceDto | null;
};

export const DEFAULT_REGRESSION_TITLE = "Cálculo por el método de regresión lineal múltiple";
export const DEFAULT_GOAL_TITLE = "Cálculo por el método de programación por metas";

/** The area field of a comparable type, with the tag of the market's format. */
export function areaField(type: ComparableType): CharacteristicField {
  return defaultCharacteristicFields(type).find((field) => field.key === "area") as CharacteristicField;
}

export function defaultStatisticalSettings(comparableType: ComparableType): StatisticalSettingsDto {
  return {
    comparableType,
    fields: [areaField(comparableType)],
    subject: {},
    dependent: "PRICE",
    variables: [],
    regression: { enabled: false, showInDictamen: false, title: null, showResidual: false },
    goal: { enabled: false, showInDictamen: false, title: null },
    showComparison: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Levels and scales                                                  */
/* ------------------------------------------------------------------ */

/** How two written levels are compared: no case, accents or extra spaces ("Calle inferior" = "calle  inferior"). */
export const normalizedLevel = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** The scale's levels with the numbers they take: their place (1, 2…) when ordered, or their own. */
export function scaleValues(variable: Pick<StatisticalVariableDto, "scale" | "scaleMode">): ScaleLevel[] {
  const levels = variable.scale ?? [];
  return variable.scaleMode === "ORDERED" ? levels.map((level, index) => ({ label: level.label, value: index + 1 })) : levels;
}

/** The level a written value matches, or null. */
export function levelOf(variable: Pick<StatisticalVariableDto, "scale" | "scaleMode">, text: string): ScaleLevel | null {
  const wanted = normalizedLevel(text);
  return scaleValues(variable).find((level) => normalizedLevel(level.label) === wanted) ?? null;
}

/** The written values of a field among the comparables and the subject, once each (first spelling kept). */
export function writtenValues(calculation: Pick<StatisticalCalculationDto, "settings" | "comparables">, key: string): string[] {
  const seen = new Map<string, string>();
  for (const text of [...calculation.comparables.map((comparable) => comparable.values[key] ?? ""), calculation.settings.subject[key] ?? ""]) {
    const trimmed = text.trim();
    if (trimmed && !seen.has(normalizedLevel(trimmed))) seen.set(normalizedLevel(trimmed), trimmed);
  }
  return [...seen.values()];
}

/** A field is a figure when every value written is a number. */
export function isNumericField(calculation: Pick<StatisticalCalculationDto, "settings" | "comparables">, key: string) {
  if (key === "area") return true;
  const values = writtenValues(calculation, key);
  return values.length > 0 && values.every((value) => parseDecimal(value) !== null);
}

/** "Regular (2)": a written level with the number its scale gives it. */
export function codedText(variable: StatisticalVariableDto | undefined, text: string): string {
  if (!variable || variable.coding !== "SCALE" || !text.trim()) return text;
  const level = levelOf(variable, text);
  return level ? `${level.label} (${formatScaleValue(level.value)})` : text;
}

export const formatScaleValue = (value: number) => (Number.isInteger(value) ? String(value) : value.toLocaleString("es-MX", { maximumFractionDigits: 4 }));

/** The values of a field that its scale does not have yet. */
export function unscaledValues(calculation: Pick<StatisticalCalculationDto, "settings" | "comparables">, variable: StatisticalVariableDto) {
  return writtenValues(calculation, variable.key).filter((value) => !levelOf(variable, value));
}

/* ------------------------------------------------------------------ */
/*  Coding                                                             */
/* ------------------------------------------------------------------ */

/** The number a written value takes with its criterion's coding; a reason when it cannot. */
export function codedValue(variable: StatisticalVariableDto, text: string): { ok: true; value: number } | { ok: false; missing: "value" | "scale" | "zero" } {
  if (!text.trim()) return { ok: false, missing: "value" };
  if (variable.coding === "SCALE") {
    const level = levelOf(variable, text);
    return level ? { ok: true, value: level.value } : { ok: false, missing: "scale" };
  }
  const number = parseDecimal(text);
  if (number === null) return { ok: false, missing: variable.scale?.length ? "scale" : "value" };
  if (variable.coding === "CONTRARY") return { ok: true, value: (variable.base ?? DEFAULT_CONTRARY_BASE) - number };
  if (variable.coding === "INVERSE") return number === 0 ? { ok: false, missing: "zero" } : { ok: true, value: 1 / number };
  return { ok: true, value: number };
}

/** "VUR = 60 − antigüedad", "1 / superficie": how a coded criterion is written in the dictamen. */
export function codingNote(variable: StatisticalVariableDto, label: string): string | null {
  if (variable.coding === "CONTRARY") return `${label}: ${formatScaleValue(variable.base ?? DEFAULT_CONTRARY_BASE)} − valor capturado (criterio contrario).`;
  if (variable.coding === "INVERSE") return `${label}: 1 / valor capturado (inverso multiplicativo).`;
  return null;
}

/* ------------------------------------------------------------------ */
/*  Model input                                                        */
/* ------------------------------------------------------------------ */

export type StatisticalData = {
  input: EstimationInput;
  /** The comparables that entered, by reference, with Y and the coded criteria. */
  rows: Array<{ reference: number; y: number; x: number[] }>;
  /** The criteria's labels, in the order of the model. */
  variables: string[];
  subject: number[];
  dependentLabel: string;
  subjectArea: number | null;
};

const unitOf = (type: ComparableType) => (isRentComparableType(type) ? "$/m²/mes" : "$/m²");

/** The label of a field, or its key when it is gone. */
export const fieldLabel = (settings: Pick<StatisticalSettingsDto, "fields">, key: string) =>
  settings.fields.find((field) => field.key === key)?.label ?? key;

/** The subject's area, for the unit value and the comparison. */
export const subjectAreaOf = (settings: Pick<StatisticalSettingsDto, "subject">) => {
  const area = parseDecimal(settings.subject.area ?? "");
  return area && area > 0 ? area : null;
};

/**
 * The coded data of the model, or what is missing. `dependent` is the
 * regression's Y; the goal programming asks for the price.
 */
export function statisticalData(
  calculation: Pick<StatisticalCalculationDto, "settings" | "comparables">,
  dependent: StatisticalDependent,
): { ok: true; data: StatisticalData } | { ok: false; reason: string } {
  const { settings } = calculation;
  if (!settings.variables.length) return { ok: false, reason: "Elige al menos un criterio (variable)." };
  if (settings.variables.length > MAX_STATISTICAL_VARIABLES) return { ok: false, reason: `Se usan hasta ${MAX_STATISTICAL_VARIABLES} criterios.` };
  const gone = settings.variables.find((variable) => !settings.fields.some((field) => field.key === variable.key));
  if (gone) return { ok: false, reason: "Un criterio ya no está entre las características capturadas; quítalo." };
  const names = settings.variables.map((variable) => fieldLabel(settings, variable.key));
  const rent = isRentComparableType(settings.comparableType);
  const dependentLabel = dependent === "PRICE" ? (rent ? "Renta mensual" : "Precio") : `Valor unitario (${unitOf(settings.comparableType)})`;
  const missing: string[] = [];
  const describe = (result: { missing: "value" | "scale" | "zero" }, text: string, name: string, who: string) =>
    (result.missing === "scale" ? `la escala de «${text.trim()}» (${name}, ${who})`
      : result.missing === "zero" ? `un valor distinto de cero en «${name}» (${who}; su inverso no existe)`
        : `«${name}» del ${who}`);
  const included = calculation.comparables.filter((comparable) => !comparable.excluded);
  const rows = included.map((comparable) => {
    const area = parseDecimal(comparable.values.area ?? "");
    const y = comparable.price && comparable.price > 0
      ? dependent === "PRICE" ? comparable.price : area && area > 0 ? comparable.price / area : null
      : null;
    if (y === null) missing.push(`la ${dependent === "PRICE" ? "oferta" : "superficie o la oferta"} del comparable ${comparable.reference}`);
    const x = settings.variables.map((variable, j) => {
      const text = comparable.values[variable.key] ?? "";
      const result = codedValue(variable, text);
      if (!result.ok) missing.push(describe(result, text, names[j], `comparable ${comparable.reference}`));
      return result.ok ? result.value : Number.NaN;
    });
    return { reference: comparable.reference, y: y ?? Number.NaN, x };
  });
  const subject = settings.variables.map((variable, j) => {
    const text = settings.subject[variable.key] ?? "";
    const result = codedValue(variable, text);
    if (!result.ok) missing.push(describe(result, text, names[j], "sujeto"));
    return result.ok ? result.value : Number.NaN;
  });
  if (missing.length) {
    const shown = missing.slice(0, 4).join("; ");
    return { ok: false, reason: `Falta ${shown}${missing.length > 4 ? ` y ${missing.length - 4} más` : ""}. Captúralo o excluye el comparable.` };
  }
  return {
    ok: true,
    data: {
      input: { dependent: dependentLabel, variables: names, observations: rows.map((row) => ({ id: String(row.reference), y: row.y, x: row.x })), subject },
      rows,
      variables: names,
      subject,
      dependentLabel,
      subjectArea: subjectAreaOf(settings),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Regression                                                         */
/* ------------------------------------------------------------------ */

export type StatisticalRegressionResult = {
  fit: RegressionFit;
  data: StatisticalData;
  /** Estimated unit value; null for a price regression without the subject's area. */
  unitValue: number | null;
  /** Estimated value of the property (or monthly rent). */
  value: number;
};

export type StatisticalRegressionOutcome = { ok: true; result: StatisticalRegressionResult } | { ok: false; reason: string };

/** The regression of the apartado, or why it cannot run yet; null while it is off. */
export function computeStatisticalRegression(
  calculation: Pick<StatisticalCalculationDto, "settings" | "comparables">,
  trace = new Trace(),
  keyPrefix = "estadistico.regresion",
): StatisticalRegressionOutcome | null {
  const { settings } = calculation;
  if (!settings.regression.enabled) return null;
  const prepared = statisticalData(calculation, settings.dependent);
  if (!prepared.ok) return prepared;
  const { data } = prepared;
  const outcome = fitLinearRegression(data.input, trace, keyPrefix);
  if (!outcome.ok) return outcome;
  const { fit } = outcome;
  const area = data.subjectArea;
  const rent = isRentComparableType(settings.comparableType);
  if (settings.dependent === "UNIT_VALUE" && !area) return { ok: false, reason: "Captura la superficie del sujeto para obtener el valor estimado." };
  const label = rent ? "Renta mensual estimada por regresión" : "Valor estimado del inmueble por regresión";
  const value = trace.record(settings.dependent === "UNIT_VALUE"
    ? { key: `${keyPrefix}.valor`, label, formula: "Y estimado × superficie del sujeto", inputs: { y: fit.estimate, superficieSujeto: area }, value: fit.estimate * (area as number) }
    : { key: `${keyPrefix}.valor`, label, formula: "Y estimado", inputs: { y: fit.estimate }, value: fit.estimate });
  const unitValue = settings.dependent === "UNIT_VALUE" ? fit.estimate : area ? trace.record({
    key: `${keyPrefix}.valorUnitario`,
    label: "Valor unitario estimado por regresión",
    formula: "Y estimado / superficie del sujeto",
    inputs: { y: fit.estimate, superficieSujeto: area },
    value: fit.estimate / area,
  }) : null;
  return { ok: true, result: { fit, data, unitValue, value } };
}

/* ------------------------------------------------------------------ */
/*  Goal programming                                                   */
/* ------------------------------------------------------------------ */

/** The goal program of the apartado (Y the price), or why it cannot be stated; null while it is off. */
export function statisticalGoalProblem(calculation: Pick<StatisticalCalculationDto, "settings" | "comparables">):
  | { ok: true; data: StatisticalData; problem: GoalProgramProblem }
  | { ok: false; reason: string }
  | null {
  if (!calculation.settings.goal.enabled) return null;
  const prepared = statisticalData(calculation, "PRICE");
  if (!prepared.ok) return prepared;
  const stated = goalProgramProblem(prepared.data.input);
  return stated.ok ? { ok: true, data: prepared.data, problem: stated.problem } : stated;
}

export type StatisticalGoalResult = { outcome: GoalProgrammingOutcome; data: StatisticalData | null; pending: boolean };

const sameProblem = (left: GoalProgramProblem, right: GoalProgramProblem) => JSON.stringify(left) === JSON.stringify(right);

/**
 * The goal programming read from the solution the server sent: null while it
 * is off, `pending` while the solution is of other data (a change on its way).
 */
export function computeStatisticalGoal(
  calculation: Pick<StatisticalCalculationDto, "settings" | "comparables" | "goal">,
  trace = new Trace(),
  keyPrefix = "estadistico.metas",
): StatisticalGoalResult | null {
  const stated = statisticalGoalProblem(calculation);
  if (!stated) return null;
  if (!stated.ok) return { outcome: stated, data: null, pending: false };
  const solved = calculation.goal;
  if (!solved || !sameProblem(solved.problem, stated.problem)) {
    return { outcome: { ok: false, reason: "Resolviendo la programación por metas…" }, data: stated.data, pending: true };
  }
  return { outcome: readGoalSolution(stated.data.input, solved.solution, trace, keyPrefix), data: stated.data, pending: false };
}

/* ------------------------------------------------------------------ */
/*  The market's regression of before, and importing the market        */
/* ------------------------------------------------------------------ */

/** A characteristic of a market comparable as this apartado keeps it: the area and the figures as numbers, the rest as written. */
function marketValues(comparable: MarketCalculationDto["comparables"][number], fields: CharacteristicField[]): Record<string, string> {
  return Object.fromEntries(fields.flatMap((field) => {
    const text = field.key === "area" ? (comparable.area ? String(comparable.area) : "") : characteristicValueText(comparable, field.key);
    return text.trim() ? [[field.key, text.trim()]] : [];
  }));
}

/** The market's fields this apartado can use (the price is Y, the notes are free text), the area first. */
export function marketFields(settings: MarketCalculationDto["settings"]): CharacteristicField[] {
  const fields = regressionFieldOptions(settings);
  return [...fields.filter((field) => field.key === "area"), ...fields.filter((field) => field.key !== "area")];
}

/**
 * The regression the market approach kept before this apartado existed, read
 * as this apartado: the market's comparables, fields and subject, its
 * variables with their scales. Its data stay the market's until saved here.
 */
export function statisticalFromMarket(market: Pick<MarketCalculationDto, "settings" | "comparables">): Pick<StatisticalCalculationDto, "settings" | "comparables"> | null {
  const regression = market.settings.regression;
  if (!regression) return null;
  const type = market.settings.comparableType;
  const fields = marketFields(market.settings);
  const subject = Object.fromEntries(Object.entries({
    ...(market.settings.subjectCharacteristics ?? {}),
    ...(market.settings.subjectArea ? { area: String(market.settings.subjectArea) } : {}),
  }).filter(([key, value]) => value.trim() && fields.some((field) => field.key === key)));
  return {
    settings: {
      ...defaultStatisticalSettings(type),
      fields,
      subject,
      dependent: regression.dependent,
      variables: regression.variables.map((variable): StatisticalVariableDto => (variable.scale?.length
        ? { key: variable.key, coding: "SCALE", scaleMode: "FREE", scale: variable.scale }
        : { key: variable.key, coding: "DIRECT" })),
      regression: { enabled: regression.enabled, showInDictamen: regression.showInDictamen, title: null, showResidual: false },
    },
    comparables: market.comparables.map((comparable) => ({
      id: `mercado-${comparable.id}`,
      reference: comparable.reference,
      price: comparable.price,
      values: marketValues(comparable, fields),
      ...(comparable.regressionExcluded ? { excluded: true } : {}),
      marketComparableId: comparable.id,
    })),
  };
}

/**
 * "Importar del enfoque de mercado": the market's comparables not imported
 * yet, numbered after the ones captured here, with the market's fields this
 * apartado lacks and the subject's values it has not written.
 */
export function withMarketComparables(
  calculation: Pick<StatisticalCalculationDto, "settings" | "comparables">,
  market: Pick<MarketCalculationDto, "settings" | "comparables">,
  newId: () => string,
): Pick<StatisticalCalculationDto, "settings" | "comparables"> & { imported: number } {
  const known = new Set(calculation.settings.fields.map((field) => field.key));
  const fields = [...calculation.settings.fields, ...marketFields(market.settings).filter((field) => !known.has(field.key))].slice(0, MAX_STATISTICAL_FIELDS);
  const already = new Set(calculation.comparables.map((comparable) => comparable.marketComparableId).filter(Boolean));
  const next = Math.max(0, ...calculation.comparables.map((comparable) => comparable.reference));
  const added = market.comparables
    .filter((comparable) => !already.has(comparable.id))
    .slice(0, MAX_STATISTICAL_COMPARABLES - calculation.comparables.length)
    .map((comparable, index): StatisticalComparableDto => ({
      id: newId(),
      reference: next + index + 1,
      price: comparable.price,
      values: marketValues(comparable, fields),
      marketComparableId: comparable.id,
    }));
  const marketSubject: Record<string, string> = {
    ...(market.settings.subjectCharacteristics ?? {}),
    ...(market.settings.subjectArea ? { area: String(market.settings.subjectArea) } : {}),
  };
  const subject = { ...calculation.settings.subject };
  for (const field of fields) {
    const text = marketSubject[field.key]?.trim();
    if (text && !subject[field.key]?.trim()) subject[field.key] = text;
  }
  return { settings: { ...calculation.settings, fields, subject }, comparables: [...calculation.comparables, ...added], imported: added.length };
}

/** References 1, 2, 3… in the order of the rows, after one is removed. */
export const renumbered = (comparables: StatisticalComparableDto[]) =>
  comparables.map((comparable, index) => (comparable.reference === index + 1 ? comparable : { ...comparable, reference: index + 1 }));
