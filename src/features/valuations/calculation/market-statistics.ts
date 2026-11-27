/**
 * The box of statistics of a market as a small table the appraiser edits
 * (video 8.10, 00:28–06:20): which statistic prints, its name, its order, and
 * statistics of his own over the homologated unit values (moda, desviación
 * estándar… or a formula). Pure: no React, no database.
 */
import type { HomologationStats } from "../engine/market";
import { evaluateFormula } from "./free-formula";
import { figure, money } from "./generated-content";
import {
  EXTRA_STATISTIC_KEY,
  MARKET_STATISTICS,
  MAX_EXTRA_STATISTICS,
  type ExtraStatistic,
  type ExtraStatisticKind,
  type MarketStatistic,
  type PrintedStatistics,
  type StatisticKey,
} from "./market-types";

/** What each statistic of the homologation is called where the appraiser chooses whether it prints. */
export const STATISTIC_LABELS: Record<MarketStatistic, string> = {
  offerMin: "Mínimo de oferta",
  offerMax: "Máximo de oferta",
  initialDispersion: "Dispersión inicial",
  min: "Mínimo homologado",
  max: "Máximo homologado",
  dispersion: "Dispersión final",
  mean: "Promedio homologado",
  median: "Mediana homologada",
};

export const EXTRA_STATISTIC_LABELS: Record<ExtraStatisticKind, string> = {
  mode: "Moda",
  stdev: "Desviación estándar",
  cv: "Coeficiente de variación",
  range: "Rango (máximo − mínimo)",
  count: "Número de comparables",
  formula: "Fórmula propia",
};


const isMarketStatistic = (key: string): key is MarketStatistic => (MARKET_STATISTICS as readonly string[]).includes(key);

/** The most repeated of the values, to the cent; none when every value is different. */
function mode(values: readonly number[]): number | null {
  const counts = new Map<string, { value: number; count: number }>();
  for (const value of values) {
    const key = value.toFixed(2);
    const entry = counts.get(key) ?? { value, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return best && best.count > 1 ? best.value : null;
}

/** A formula over the statistics: «=PROMEDIO*0.95», «=(MAXIMO-MINIMO)/PROMEDIO». */
export function statisticFormulaValue(formula: string, stats: HomologationStats): number | null {
  const names: Record<string, number> = {
    PROMEDIO: stats.mean, MEDIANA: stats.median, MINIMO: stats.min, MAXIMO: stats.max, DESVEST: stats.standardDeviation, N: stats.count,
  };
  const source = formula.trim().replace(/^=/, "");
  if (!source) return null;
  // Whole words, without case or accents: «Mínimo» is MINIMO, and the N of MINIMO is not N.
  const replaced = source.replace(/[A-Za-zÁÉÍÓÚáéíóú]+/g, (word) => {
    const name = word.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    return name in names ? `(${names[name]})` : word;
  });
  const value = evaluateFormula(replaced);
  return value === null || !Number.isFinite(value) ? null : value;
}

/** The figure of a statistic the appraiser added, as the box prints it; null when it cannot be computed. */
export function extraStatisticText(statistic: ExtraStatistic, stats: HomologationStats, homologated: readonly number[]): string | null {
  switch (statistic.kind) {
    case "mode": {
      const value = mode(homologated);
      return value === null ? null : money(value);
    }
    case "stdev": return money(stats.standardDeviation);
    case "cv": return `${figure(stats.coefficientOfVariation * 100, 2)} %`;
    case "range": return money(stats.max - stats.min);
    case "count": return figure(stats.count, 0);
    case "formula": {
      const value = statisticFormulaValue(statistic.formula ?? "", stats);
      return value === null ? null : money(value);
    }
  }
}

/** The name a statistic prints with: the appraiser's, or the format's. */
export function statisticLabel(choice: PrintedStatistics, key: StatisticKey): string {
  const own = choice.labels?.[key]?.trim();
  if (own) return own;
  if (isMarketStatistic(key)) return STATISTIC_LABELS[key];
  return choice.extra?.find((item) => item.id === key)?.label ?? key;
}

/** The choice with one statistic renamed; an empty name gives back the format's. */
export function withStatisticLabel(choice: PrintedStatistics, key: StatisticKey, label: string): PrintedStatistics {
  const { [key]: _previous, ...labels } = choice.labels ?? {};
  const name = label.trim();
  const own = isMarketStatistic(key) ? STATISTIC_LABELS[key] : null;
  const next = name && name !== own ? { ...labels, [key]: name } : labels;
  return { ...choice, labels: next };
}

/** The choice with one more statistic of the appraiser's, printed, at the end. */
export function withExtraStatistic(choice: PrintedStatistics, kind: ExtraStatisticKind, id: string): PrintedStatistics {
  const extra = choice.extra ?? [];
  if (extra.length >= MAX_EXTRA_STATISTICS || !EXTRA_STATISTIC_KEY.test(id)) return choice;
  const statistic: ExtraStatistic = { id, label: EXTRA_STATISTIC_LABELS[kind], kind, ...(kind === "formula" ? { formula: "=PROMEDIO" } : {}) };
  return { ...choice, order: [...choice.order, id as StatisticKey], extra: [...extra, statistic] };
}

/** The choice without a statistic the appraiser added. */
export function withoutExtraStatistic(choice: PrintedStatistics, id: string): PrintedStatistics {
  const { [id]: _label, ...labels } = choice.labels ?? {};
  return {
    order: choice.order.filter((key) => key !== id),
    hidden: choice.hidden.filter((key) => key !== id),
    labels,
    extra: (choice.extra ?? []).filter((item) => item.id !== id),
  };
}

/** A statistic of the appraiser's with its formula changed. */
export function withExtraStatisticFormula(choice: PrintedStatistics, id: string, formula: string): PrintedStatistics {
  return { ...choice, extra: (choice.extra ?? []).map((item) => (item.id === id ? { ...item, formula: formula.trim() || null } : item)) };
}
