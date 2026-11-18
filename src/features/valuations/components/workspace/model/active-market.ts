import { COMPARABLE_TYPES, type ComparableType } from "@/features/valuations/calculation/market-types";
import type { AppSection, Block } from "@/features/valuations/model";

/** What a market section shows (V7.2-01, V7.4-06): the market approach of a market, or the alternative methods of one (their own section). */
export type ActiveMarket = { tab: "mercado" | "metodos"; type: ComparableType };

const GENERATED_MARKET_BLOCK = new RegExp(`^motor-(mercado|estadistico)-(${COMPARABLE_TYPES.map((type) => type.toLowerCase()).join("|")})(?:-|$)`);

/** The market a block the calculation writes belongs to: its pages of the market approach or of the alternative methods. */
export function generatedMarketOf(block: Pick<Block, "id">): { kind: "mercado" | "estadistico"; type: ComparableType } | null {
  const match = GENERATED_MARKET_BLOCK.exec(block.id);
  if (!match) return null;
  return { kind: match[1] as "mercado" | "estadistico", type: match[2].toUpperCase() as ComparableType };
}

/**
 * Whether the editor shows a block while `active` is the tab open: each
 * market's tab shows only the pages it writes, and the tab of a market in
 * the alternative methods only that market's methods. The appraiser's own
 * blocks always show, and the dictamen prints every market included
 * whatever the tab.
 */
export function shownForActiveMarket(block: Pick<Block, "id">, active: ActiveMarket | null | undefined): boolean {
  if (!active) return true;
  const market = generatedMarketOf(block);
  if (!market) return true;
  return market.type === active.type && (market.kind === "estadistico" ? active.tab === "metodos" : active.tab === "mercado");
}

/** The blocks of each market the appraiser hid (V7.4-07): they leave the dictamen though the market is in the report. */
export function hiddenMarketBlocks(section: Pick<AppSection, "blocks">): Partial<Record<ComparableType, string[]>> {
  const hidden: Partial<Record<ComparableType, string[]>> = {};
  for (const block of section.blocks) {
    const market = generatedMarketOf(block);
    if (!market || market.kind !== "mercado" || block.enabled) continue;
    (hidden[market.type] ??= []).push(block.title);
  }
  return hidden;
}

/** The section with the hidden blocks of a market shown again. */
export function withMarketBlocksShown(section: Pick<AppSection, "blocks">, type: ComparableType): Block[] {
  return section.blocks.map((block) => {
    const market = generatedMarketOf(block);
    return market?.kind === "mercado" && market.type === type && !block.enabled ? { ...block, enabled: true } : block;
  });
}
