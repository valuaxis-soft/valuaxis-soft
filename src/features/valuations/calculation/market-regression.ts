/**
 * The regression the market approach kept before the statistical methods
 * became an apartado of their own (`statistical-types.ts`, 28 Oct 2026):
 * `EnfoqueMercado.JConfiguracion.regression` and `regressionExcluded` of each
 * comparable. Valuations saved with it still carry it; the statistical
 * apartado reads it (compatibility) until the appraiser saves there. The
 * market itself no longer computes or prints it.
 */
import {
  characteristicFieldsOf,
  defaultCharacteristicFields,
  type CharacteristicField,
} from "./market-types";

/** Y of the regression: the offer's unit value (price / area), or the price itself. */
export const REGRESSION_DEPENDENTS = ["UNIT_VALUE", "PRICE"] as const;
type RegressionDependent = (typeof REGRESSION_DEPENDENTS)[number];

/** A qualitative variable took up to seven levels in the market's regression. */
export const MAX_SCALE_LEVELS = 7;
type RegressionScaleLevel = { label: string; value: number };

type RegressionVariableDto = {
  /** Key of a characteristic of the market ("area", "frontage", "quality", "custom:…"). */
  key: string;
  /** The number each written value takes; empty or missing for figures. */
  scale?: RegressionScaleLevel[] | null;
};

export type MarketRegressionDto = {
  method: "REGRESION_LINEAL";
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

/** The characteristics of a market that may be a variable; the area always, even if its line is not printed. */
export function regressionFieldOptions(settings: Parameters<typeof characteristicFieldsOf>[0]): CharacteristicField[] {
  const fields = characteristicFieldsOf(settings).filter((field) => !NOT_VARIABLES.has(field.key));
  if (fields.some((field) => field.key === "area")) return fields;
  const area = defaultCharacteristicFields(settings.comparableType).find((field) => field.key === "area") as CharacteristicField;
  return [area, ...fields];
}
