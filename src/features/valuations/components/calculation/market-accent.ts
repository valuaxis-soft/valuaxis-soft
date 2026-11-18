import type { ComparableType } from "@/features/valuations/calculation/market-types";

/**
 * Each market's own color (V7.2-02), from the chart tokens of globals.css: on
 * its tab, its panel, the notice «Estás en…» and the blocks it writes, so
 * the appraiser always knows which market is in front. Land in ochre,
 * buildings in the logo's blue, rents in violet and terracotta.
 */
export const MARKET_ACCENT: Record<ComparableType, { border: string; soft: string; dot: string }> = {
  TERRENO_VENTA: { border: "border-chart-3", soft: "bg-chart-3/10", dot: "bg-chart-3" },
  INMUEBLE_VENTA: { border: "border-chart-1", soft: "bg-chart-1/10", dot: "bg-chart-1" },
  INMUEBLE_RENTA: { border: "border-chart-4", soft: "bg-chart-4/10", dot: "bg-chart-4" },
  TERRENO_RENTA: { border: "border-chart-5", soft: "bg-chart-5/10", dot: "bg-chart-5" },
};
