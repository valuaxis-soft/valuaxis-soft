/**
 * "Homologación por el método de regresión lineal" of a market: which of the
 * market's characteristics enter as variables, the scales of the qualitative
 * ones, Y as the unit value or the price, and the conversion of the market's
 * own comparables to the engine input. A reference beside the homologated
 * mean and median: it never changes the value the appraiser adopts. Shared by
 * the browser (live result) and the server (stored trace).
 */
import {
  fitLinearRegression,
  type EstimationMethod,
  type RegressionFit,
} from "../engine/regression";
import { Trace } from "../engine/trace";
import { parseDecimal } from "./free-formula";
import {
  NUMERIC_CHARACTERISTICS,
  characteristicFieldsOf,
  characteristicText,
  defaultCharacteristicFields,
  isRentComparableType,
  type CharacteristicField,
  type ComparableDto,
  type MarketCalculationDto,
} from "./market-types";

/** Y of the regression: the offer's unit value (price / area), or the price itself. */
export const REGRESSION_DEPENDENTS = ["UNIT_VALUE", "PRICE"] as const;
export type RegressionDependent = (typeof REGRESSION_DEPENDENTS)[number];

/** A qualitative variable takes up to seven levels (popular = 1, medio = 2…), as the appraiser defines them. */
export const MAX_SCALE_LEVELS = 7;
export type RegressionScaleLevel = { label: string; value: number };

export type RegressionVariableDto = {
  /** Key of a characteristic of the market ("area", "frontage", "quality", "custom:…"). */
  key: string;
  /** The number each written value takes; empty or missing for figures. */
  scale?: RegressionScaleLevel[] | null;
};

export type MarketRegressionDto = {
  method: EstimationMethod;
  enabled: boolean;
  dependent: RegressionDependent;
  variables: RegressionVariableDto[];
  /** Whether the apartado prints in the dictamen; off until the appraiser turns it on. */
  showInDictamen: boolean;
};

export const defaultMarketRegression = (): MarketRegressionDto => ({
  method: "REGRESION_LINEAL",
  enabled: false,
  dependent: "UNIT_VALUE",
  variables: [{ key: "area" }],
  showInDictamen: false,
});

/** Characteristics that cannot be a variable: the price is Y, the notes are free text. */
const NOT_VARIABLES: ReadonlySet<string> = new Set(["price", "notes"]);

/** The characteristics the appraiser may choose as variables; the area always, even if its line is not printed. */
export function regressionFieldOptions(settings: Parameters<typeof characteristicFieldsOf>[0]): CharacteristicField[] {
  const fields = characteristicFieldsOf(settings).filter((field) => !NOT_VARIABLES.has(field.key));
  if (fields.some((field) => field.key === "area")) return fields;
  const area = defaultCharacteristicFields(settings.comparableType).find((field) => field.key === "area") as CharacteristicField;
  return [area, ...fields];
}

const normalized = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** The written values of a characteristic among the comparables and the subject, once each, to give them a scale. */
export function distinctValues(calculation: Pick<MarketCalculationDto, "settings" | "comparables">, key: string): string[] {
  const seen = new Map<string, string>();
  const subject = subjectText(calculation.settings, key);
  for (const text of [...calculation.comparables.map((comparable) => characteristicText(comparable, key)), subject]) {
    const trimmed = text.trim();
    if (trimmed && !seen.has(normalized(trimmed))) seen.set(normalized(trimmed), trimmed);
  }
  return [...seen.values()];
}

/** A characteristic is a figure when it is one of the form's numbers or every value written is a number. */
export function isNumericVariable(calculation: Pick<MarketCalculationDto, "settings" | "comparables">, key: string) {
  if (NUMERIC_CHARACTERISTICS.has(key)) return true;
  const values = distinctValues(calculation, key);
  return values.length > 0 && values.every((value) => parseDecimal(value) !== null);
}

function subjectText(settings: MarketCalculationDto["settings"], key: string) {
  if (key === "area" && settings.subjectArea) return String(settings.subjectArea);
  return settings.subjectCharacteristics?.[key] ?? "";
}

/** The number a written value takes: through the scale when there is one, else as a figure. */
function numberOf(text: string, variable: RegressionVariableDto): number | null {
  if (!text.trim()) return null;
  if (variable.scale?.length) {
    return variable.scale.find((level) => normalized(level.label) === normalized(text))?.value ?? null;
  }
  return parseDecimal(text);
}

export type MarketRegressionResult = {
  fit: RegressionFit;
  /** Names of the variables, in the order of the fit. */
  variables: string[];
  /** "$/m²" or "precio", with the unit of the market. */
  dependentLabel: string;
  /** The comparables that entered, with their Y and variables, by reference. */
  rows: Array<{ reference: number; y: number; x: number[] }>;
  subject: number[];
  /** Estimated unit value; null for a price regression without the subject's area. */
  unitValue: number | null;
  /** Estimated value of the property (or monthly rent). */
  value: number;
  /** Comparables left out by the appraiser, by reference. */
  excluded: number[];
};

export type MarketRegressionOutcome = { ok: true; result: MarketRegressionResult } | { ok: false; reason: string };

/** Y of a comparable, or null while its area or price is missing. */
function dependentOf(comparable: ComparableDto, dependent: RegressionDependent) {
  if (!comparable.price || comparable.price <= 0) return null;
  if (dependent === "PRICE") return comparable.price;
  return comparable.area && comparable.area > 0 ? comparable.price / comparable.area : null;
}

/**
 * The regression of the market, or why it cannot run yet; null while it is
 * not turned on. Comparables come from the market itself; the ones the
 * appraiser excluded stay out.
 */
export function computeMarketRegression(
  calculation: Pick<MarketCalculationDto, "settings" | "comparables">,
  trace = new Trace(),
  keyPrefix = "mercado.regresion",
): MarketRegressionOutcome | null {
  const { settings } = calculation;
  const regression = settings.regression;
  if (!regression?.enabled) return null;
  const options = regressionFieldOptions(settings);
  const variables = regression.variables.map((variable) => ({ variable, field: options.find((field) => field.key === variable.key) }));
  const gone = variables.find((item) => !item.field);
  if (gone) return { ok: false, reason: "Una variable de la regresión ya no está entre las características; quítala." };
  if (!variables.length) return { ok: false, reason: "Elige al menos una variable para la regresión." };
  const names = variables.map((item) => (item.field as CharacteristicField).label);

  const rent = isRentComparableType(settings.comparableType);
  const unit = rent ? "$/m²/mes" : "$/m²";
  const dependentLabel = regression.dependent === "PRICE" ? (rent ? "Renta mensual" : "Precio") : `Valor unitario (${unit})`;
  const included = calculation.comparables.filter((comparable) => !comparable.regressionExcluded);
  const missing: string[] = [];
  const rows = included.map((comparable) => {
    const y = dependentOf(comparable, regression.dependent);
    if (y === null) missing.push(`la ${regression.dependent === "PRICE" ? "oferta" : "superficie o la oferta"} del comparable ${comparable.reference}`);
    const x = variables.map(({ variable }, j) => {
      const text = variable.key === "area" ? (comparable.area ? String(comparable.area) : "") : characteristicText(comparable, variable.key);
      const value = numberOf(text, variable);
      if (value === null) missing.push(text.trim() ? `la escala de «${text.trim()}» (${names[j]}, comparable ${comparable.reference})` : `«${names[j]}» del comparable ${comparable.reference}`);
      return value ?? Number.NaN;
    });
    return { reference: comparable.reference, y: y ?? Number.NaN, x };
  });
  const subject = variables.map(({ variable }, j) => {
    const text = subjectText(settings, variable.key);
    const value = numberOf(text, variable);
    if (value === null) missing.push(text.trim() ? `la escala de «${text.trim()}» (${names[j]}, sujeto)` : `«${names[j]}» del sujeto`);
    return value ?? Number.NaN;
  });
  if (missing.length) {
    const shown = missing.slice(0, 4).join("; ");
    return { ok: false, reason: `Falta ${shown}${missing.length > 4 ? ` y ${missing.length - 4} más` : ""}. Captúralo o excluye el comparable de la regresión.` };
  }

  const outcome = fitLinearRegression({
    dependent: dependentLabel,
    variables: names,
    observations: rows.map((row) => ({ id: String(row.reference), y: row.y, x: row.x })),
    subject,
  }, trace, keyPrefix);
  if (!outcome.ok) return outcome;
  const { fit } = outcome;
  const area = settings.subjectArea && settings.subjectArea > 0 ? settings.subjectArea : null;
  if (regression.dependent === "UNIT_VALUE" && !area) return { ok: false, reason: "Captura la superficie del sujeto para obtener el valor estimado." };
  const value = trace.record(regression.dependent === "UNIT_VALUE"
    ? {
        key: `${keyPrefix}.valor`,
        label: rent ? "Renta mensual estimada por regresión" : "Valor estimado del inmueble por regresión",
        formula: "Y estimado × superficie del sujeto",
        inputs: { y: fit.estimate, superficieSujeto: area },
        value: fit.estimate * (area as number),
      }
    : {
        key: `${keyPrefix}.valor`,
        label: rent ? "Renta mensual estimada por regresión" : "Valor estimado del inmueble por regresión",
        formula: "Y estimado",
        inputs: { y: fit.estimate },
        value: fit.estimate,
      });
  const unitValue = regression.dependent === "UNIT_VALUE" ? fit.estimate : area ? trace.record({
    key: `${keyPrefix}.valorUnitario`,
    label: "Valor unitario estimado por regresión",
    formula: "Y estimado / superficie del sujeto",
    inputs: { y: fit.estimate, superficieSujeto: area },
    value: fit.estimate / area,
  }) : null;
  return {
    ok: true,
    result: {
      fit,
      variables: names,
      dependentLabel,
      rows,
      subject,
      unitValue,
      value,
      excluded: calculation.comparables.filter((comparable) => comparable.regressionExcluded).map((comparable) => comparable.reference),
    },
  };
}
