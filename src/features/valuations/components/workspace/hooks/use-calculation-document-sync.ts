import { useEffect, useEffectEvent } from "react";

import { api } from "@/lib/api-client";
import { COST_TEMPLATE_BLOCK_IDS, costDocumentBlocks, withConstructionTables } from "@/features/valuations/calculation/cost-document";
import { toCostEngineInput, type CostCalculationDto } from "@/features/valuations/calculation/cost-types";
import {
  GENERATED_BLOCK_PREFIX,
  MARKET_TEMPLATE_BLOCK_IDS,
  findSubjectLandArea,
  marketDocumentBlocks,
  marketPhotoBlocks,
  replaceGeneratedBlocks,
  withGeneratedBlocks,
} from "@/features/valuations/calculation/market-document";
import { toMarketEngineInput, type MarketCalculationDto } from "@/features/valuations/calculation/market-types";
import { DEFAULT_ENGINE_CONFIG } from "@/features/valuations/engine/config";
import { computeCostApproach } from "@/features/valuations/engine/costs";
import { computeMarketApproach, type MarketApproachResult } from "@/features/valuations/engine/market";
import { Trace } from "@/features/valuations/engine/trace";
import type { AppSection } from "@/features/valuations/model";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import type { EditorState } from "./use-editor-state";

const COST_PREFIX = `${GENERATED_BLOCK_PREFIX}costos`;

/**
 * Keeps the dictamen in step with the calculations: market blocks and photos,
 * cost blocks and the construction tables. The dictamen follows what the server
 * stored. It syncs on opening (a tab that is not open cannot report) and after
 * every change; unchanged results leave the sections untouched.
 */
export function useCalculationDocumentSync({
  canEdit,
  sections,
  updateSections,
  valuationId,
}: Pick<EditorState, "sections" | "updateSections"> & { canEdit: boolean; valuationId: string | null }) {
  const updateBySection = (groupKey: string, update: (key: string, section: AppSection) => AppSection) => {
    updateSections((current) => {
      let changed = false;
      const next = current.map((section) => {
        const updated = update(getCanonicalSectionKey(section.id), section);
        if (updated !== section) changed = true;
        return updated;
      });
      return changed ? next : current;
    }, { groupKey });
  };

  const applyMarket = (calculation: MarketCalculationDto, result: MarketApproachResult | null) => {
    if (!canEdit || calculation.locked) return;
    const type = calculation.settings.comparableType;
    const mainBlocks = marketDocumentBlocks(calculation, result);
    const photoBlocks = marketPhotoBlocks(calculation);
    updateBySection(`motor-mercado-${type}`, (key, section) =>
      key === "MERCADO_VENTA"
        ? withGeneratedBlocks(section, type, mainBlocks, { placeholderIds: MARKET_TEMPLATE_BLOCK_IDS })
        : key === "CROQUIS_COMPARABLES"
          ? withGeneratedBlocks(section, type, photoBlocks, { kind: "fotos", position: "end" })
          : section);
  };

  const applyCosts = (calculation: CostCalculationDto) => {
    if (!canEdit || calculation.locked || !calculation.configured) return;
    const input = toCostEngineInput(calculation);
    const trace = new Trace();
    const result = input.ok ? computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG, trace) : null;
    const blocks = costDocumentBlocks(calculation, result, input.ok ? trace : null);
    updateBySection("motor-costos", (key, section) =>
      key === "COSTOS"
        ? replaceGeneratedBlocks(section, (block) => block.id.startsWith(COST_PREFIX), blocks, { placeholderIds: COST_TEMPLATE_BLOCK_IDS })
        : key === "CONSTRUCCION"
          ? withConstructionTables(section, calculation)
          : section);
  };

  const refreshCosts = async () => {
    if (!valuationId) return;
    try {
      applyCosts(await api.costs.get(valuationId));
    } catch {
      // The cost tab reports its own errors; the dictamen keeps its last blocks.
    }
  };

  const onMarketCalculation = (calculation: MarketCalculationDto, result: MarketApproachResult | null) => {
    applyMarket(calculation, result);
    // The land of the cost approach uses the value adopted in the land market.
    if (calculation.settings.comparableType === "TERRENO_VENTA") void refreshCosts();
  };

  const syncOnOpen = useEffectEvent(async (id: string) => {
    const [land, buildings] = await Promise.all([
      api.market.get(id, "TERRENO_VENTA").catch(() => null),
      api.market.get(id, "INMUEBLE_VENTA").catch(() => null),
    ]);
    for (const calculation of [land, buildings]) {
      if (!calculation) continue;
      const input = toMarketEngineInput(calculation);
      applyMarket(calculation, input.ok ? computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG) : null);
    }
    await refreshCosts();
  });

  useEffect(() => {
    if (canEdit && valuationId) void syncOnOpen(valuationId);
  }, [canEdit, valuationId]);

  return { onMarketCalculation, onCostCalculation: applyCosts, suggestedSubjectArea: findSubjectLandArea(sections) };
}
