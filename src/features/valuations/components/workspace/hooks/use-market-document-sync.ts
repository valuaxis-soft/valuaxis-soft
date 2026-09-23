import type { MarketApproachResult } from "@/features/valuations/engine/market";
import {
  MARKET_TEMPLATE_BLOCK_IDS,
  findSubjectLandArea,
  marketDocumentBlocks,
  marketPhotoBlocks,
  withGeneratedBlocks,
} from "@/features/valuations/calculation/market-document";
import type { MarketCalculationDto } from "@/features/valuations/calculation/market-types";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import type { EditorState } from "./use-editor-state";

/**
 * Writes the market calculation into the dictamen: comparables, homologation
 * and summary in the market section, photos in the comparables annex. Leaves
 * the sections untouched when the dictamen already shows the same thing.
 */
export function useMarketDocumentSync({ sections, updateSections }: Pick<EditorState, "sections" | "updateSections">) {
  const onMarketCalculation = (calculation: MarketCalculationDto, result: MarketApproachResult | null) => {
    const type = calculation.settings.comparableType;
    const mainBlocks = marketDocumentBlocks(calculation, result);
    const photoBlocks = marketPhotoBlocks(calculation);
    updateSections((current) => {
      let changed = false;
      const next = current.map((section) => {
        const key = getCanonicalSectionKey(section.id);
        const updated = key === "MERCADO_VENTA"
          ? withGeneratedBlocks(section, type, mainBlocks, { placeholderIds: MARKET_TEMPLATE_BLOCK_IDS })
          : key === "CROQUIS_COMPARABLES"
            ? withGeneratedBlocks(section, type, photoBlocks, { kind: "fotos", position: "end" })
            : section;
        if (updated !== section) changed = true;
        return updated;
      });
      return changed ? next : current;
    }, { groupKey: `motor-mercado-${type}` });
  };

  return { onMarketCalculation, suggestedSubjectArea: findSubjectLandArea(sections) };
}
