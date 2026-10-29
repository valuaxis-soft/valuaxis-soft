/**
 * The adopted value of a market may be typed outside the ±30 % of the
 * homologated mean and median, and it is saved as typed; but the valuation
 * concludes only once every market of the dictamen adopts one within it
 * (observation 4.12 of the appraiser, 29 Oct 2026). A market left out of the
 * dictamen ("Agregar al informe" off) does not hold it back.
 *
 * Pure: the conclude dialog and the conclude service use the same check.
 */
import { computeMarketApproach } from "../engine/market";
import type { ReportApproach } from "../services/report-approaches";
import { marketsInReport } from "./factor-justification-document";
import { COMPARABLE_TYPE_LABELS, marketEngineConfig, toMarketEngineInput, type ComparableType, type MarketCalculationDto } from "./market-types";

/** The appraiser's own words, under the adopted value and when concluding is refused. */
export const ADOPTED_VALUE_OUTSIDE_MESSAGE = "Para concluir el avalúo deberá adoptarse un valor dentro del rango calculado ±30 %.";

type Market = Pick<MarketCalculationDto, "settings" | "comparables" | "precision">;

/** The markets of the dictamen whose adopted value is outside its limits, in the order given. */
export function marketsWithAdoptedValueOutside(markets: Market[], excluded: ReadonlySet<ReportApproach>): ComparableType[] {
  return marketsInReport(markets, excluded).flatMap((market) => {
    const input = toMarketEngineInput(market);
    // Without a result there is no range to be outside of.
    if (!input.ok) return [];
    const result = computeMarketApproach(input.input, marketEngineConfig(market.settings, market.precision));
    return result.adoptedOutsideLimits ? [market.settings.comparableType] : [];
  });
}

/** Why the valuation cannot conclude, naming the markets; null when none is outside. */
export function adoptedValueConcludeError(types: ComparableType[]): string | null {
  if (!types.length) return null;
  const markets = types.map((type) => COMPARABLE_TYPE_LABELS[type].toLowerCase()).join(", ");
  return `${ADOPTED_VALUE_OUTSIDE_MESSAGE} Revisa el valor adoptado del mercado de ${markets}.`;
}
