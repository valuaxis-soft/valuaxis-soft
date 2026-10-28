/**
 * The statistical methods in the calculation memory: the regression and the
 * goal programming of each comparable type, recomputed from what the
 * apartado stores (the goal program read from the solution the server
 * solved), with the scales and codings of the criteria among what the
 * appraiser captured. Pure.
 */
import { COMPARABLE_TYPE_LABELS, isRentComparableType } from "../calculation/market-types";
import {
  CODING_LABELS,
  DEFAULT_CONTRARY_BASE,
  computeStatisticalGoal,
  computeStatisticalRegression,
  fieldLabel,
  formatScaleValue,
  scaleValues,
  type StatisticalCalculationDto,
} from "../calculation/statistical-types";
import { Trace } from "../engine/trace";

type StatisticalRun = {
  key: string;
  title: string;
  sectionKey: string;
  trace: Trace | null;
  pending?: string;
  captured: Array<{ label: string; formula: string; value: string }>;
};

/** "Escala de CALIDAD: Regular" = 2, "VUR": 60 − valor: how each criterion became a number. */
function codings(calculation: StatisticalCalculationDto) {
  const { settings } = calculation;
  return settings.variables.flatMap((variable) => {
    const label = fieldLabel(settings, variable.key);
    if (variable.coding === "SCALE") {
      return scaleValues(variable).map((level) => ({
        label: `Escala de ${label}: ${level.label}`,
        formula: variable.scaleMode === "ORDERED" ? "escala ordenada consecutiva" : "escala libre del valuador",
        value: formatScaleValue(level.value),
      }));
    }
    if (variable.coding === "CONTRARY") return [{ label: `Codificación de ${label}`, formula: `${CODING_LABELS.CONTRARY}: ${formatScaleValue(variable.base ?? DEFAULT_CONTRARY_BASE)} − valor`, value: "—" }];
    if (variable.coding === "INVERSE") return [{ label: `Codificación de ${label}`, formula: CODING_LABELS.INVERSE, value: "—" }];
    return [];
  });
}

/** One run per comparable type with a method turned on, after the markets. */
export function statisticalRuns(calculations: StatisticalCalculationDto[] | undefined): StatisticalRun[] {
  return (calculations ?? []).flatMap((calculation): StatisticalRun[] => {
    const { settings } = calculation;
    if (!settings.regression.enabled && !settings.goal.enabled) return [];
    const trace = new Trace();
    const regression = computeStatisticalRegression(calculation, trace);
    const goal = computeStatisticalGoal(calculation, trace);
    const pending = [regression && !regression.ok ? `Regresión: ${regression.reason}` : null, goal && !goal.outcome.ok ? `Programación por metas: ${goal.outcome.reason}` : null]
      .filter(Boolean)
      .join(" ");
    const type = settings.comparableType;
    return [{
      key: `MOTOR.ESTADISTICO.${type}`,
      title: `Métodos estadísticos · ${COMPARABLE_TYPE_LABELS[type]}`,
      sectionKey: isRentComparableType(type) ? "MERCADO_RENTAS" : "MERCADO_VENTA",
      trace: trace.steps.length ? trace : null,
      ...(pending ? { pending } : {}),
      captured: codings(calculation),
    }];
  });
}
