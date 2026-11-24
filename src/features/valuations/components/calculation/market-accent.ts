import type { ComparableType } from "@/features/valuations/calculation/market-types";

/**
 * Each market's own color (V7.2-02), from the chart tokens of globals.css: on
 * its tab, its panel, the notice «Estás en…» and the blocks it writes, so
 * the appraiser always knows which market is in front. Land in ochre,
 * buildings in the logo's blue, rents in violet and terracotta. `here` fills
 * the «Estás en» bar with the market's pastel (V8.3: it got lost among the
 * pages), with the ink on it.
 */
export const MARKET_ACCENT: Record<ComparableType, { border: string; soft: string; dot: string; here: string }> = {
  TERRENO_VENTA: { border: "border-chart-3", soft: "bg-chart-3/10", dot: "bg-chart-3", here: "bg-market-land text-foreground" },
  INMUEBLE_VENTA: { border: "border-chart-1", soft: "bg-chart-1/10", dot: "bg-chart-1", here: "bg-market-building text-foreground" },
  INMUEBLE_RENTA: { border: "border-chart-4", soft: "bg-chart-4/10", dot: "bg-chart-4", here: "bg-market-rent text-foreground" },
  TERRENO_RENTA: { border: "border-chart-5", soft: "bg-chart-5/10", dot: "bg-chart-5", here: "bg-market-land-rent text-foreground" },
};
