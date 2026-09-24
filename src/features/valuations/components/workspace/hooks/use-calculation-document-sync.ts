import { useEffect, useEffectEvent } from "react";

import { api } from "@/lib/api-client";
import { caratulaConclusionValues, conclusionValues, withConceptValues } from "@/features/valuations/calculation/conclusion-document";
import { canConclude, type ConclusionCalculationDto } from "@/features/valuations/calculation/conclusion-types";
import { COST_TEMPLATE_BLOCK_IDS, costDocumentBlocks, withConstructionTables } from "@/features/valuations/calculation/cost-document";
import { toCostEngineInput, type CostCalculationDto } from "@/features/valuations/calculation/cost-types";
import { INCOME_BLOCK_PREFIX, INCOME_TEMPLATE_BLOCK_IDS, incomeDocumentBlocks } from "@/features/valuations/calculation/income-document";
import { toIncomeEngineInput, type IncomeCalculationDto } from "@/features/valuations/calculation/income-types";
import {
  GENERATED_BLOCK_PREFIX,
  MARKET_TEMPLATE_BLOCK_IDS,
  RENT_TEMPLATE_BLOCK_IDS,
  findSubjectLandArea,
  marketDocumentBlocks,
  marketPhotoBlocks,
  replaceGeneratedBlocks,
  withGeneratedBlocks,
} from "@/features/valuations/calculation/market-document";
import { toMarketEngineInput, type ComparableType, type MarketCalculationDto } from "@/features/valuations/calculation/market-types";
import { concludeValue } from "@/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG } from "@/features/valuations/engine/config";
import { computeCostApproach } from "@/features/valuations/engine/costs";
import { computeIncomeApproach } from "@/features/valuations/engine/income";
import { computeMarketApproach, type MarketApproachResult } from "@/features/valuations/engine/market";
import { Trace } from "@/features/valuations/engine/trace";
import type { AppSection } from "@/features/valuations/model";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import type { EditorState } from "./use-editor-state";

const COST_PREFIX = `${GENERATED_BLOCK_PREFIX}costos`;
const MARKET_TYPES: ComparableType[] = ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA"];

/**
 * Keeps the dictamen in step with the calculations: market and rent blocks,
 * comparable photos, cost blocks and construction tables, income blocks, and
 * the concluded value in the conclusion section and the carátula. It follows
 * what the server stored, syncs on opening (a tab that is not open cannot
 * report) and after every change; unchanged results leave the document alone.
 */
export function useCalculationDocumentSync({
  canEdit,
  caratula,
  sections,
  updateCaratula,
  updateSections,
  valuationId,
}: Pick<EditorState, "caratula" | "sections" | "updateCaratula" | "updateSections"> & { canEdit: boolean; valuationId: string | null }) {
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
    const [sectionKey, placeholders] = type === "INMUEBLE_RENTA"
      ? ["MERCADO_RENTAS", RENT_TEMPLATE_BLOCK_IDS]
      : ["MERCADO_VENTA", MARKET_TEMPLATE_BLOCK_IDS];
    updateBySection(`motor-mercado-${type}`, (key, section) =>
      key === sectionKey
        ? withGeneratedBlocks(section, type, mainBlocks, { placeholderIds: placeholders })
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

  const applyIncome = (calculation: IncomeCalculationDto) => {
    if (!canEdit || calculation.locked || !calculation.configured) return;
    const input = toIncomeEngineInput(calculation);
    const blocks = incomeDocumentBlocks(calculation, input.ok ? computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG) : null);
    updateBySection("motor-ingresos", (key, section) =>
      key === "INGRESOS"
        ? replaceGeneratedBlocks(section, (block) => block.id.startsWith(INCOME_BLOCK_PREFIX), blocks, { placeholderIds: INCOME_TEMPLATE_BLOCK_IDS })
        : section);
  };

  const applyConclusion = (calculation: ConclusionCalculationDto) => {
    if (!canEdit || calculation.locked || !canConclude(calculation)) return;
    const result = concludeValue({ values: calculation.values, method: calculation.method }, DEFAULT_ENGINE_CONFIG);
    const sectionValues = conclusionValues(calculation, result);
    const caratulaValues = caratulaConclusionValues(result);
    updateBySection("motor-conclusion", (key, section) =>
      key === "CONCLUSIONES" ? withConceptValues(section, sectionValues)
        : key === "CARATULA" ? withConceptValues(section, caratulaValues)
          : section);
    const total = String(result.value);
    if (caratula.valorTotal.replace(/[$,\s]/g, "") !== total || caratula.valorConLetra !== result.valueInWords) {
      updateCaratula({ valorTotal: total, valorConLetra: result.valueInWords });
    }
  };

  const refresh = async (parts: { costs?: boolean; income?: boolean; conclusion?: boolean }) => {
    if (!valuationId) return;
    // The dictamen keeps its last blocks if a request fails; each tab reports its own errors.
    const [costs, income, conclusion] = await Promise.all([
      parts.costs ? api.costs.get(valuationId).catch(() => null) : null,
      parts.income ? api.income.get(valuationId).catch(() => null) : null,
      parts.conclusion ? api.conclusion.get(valuationId).catch(() => null) : null,
    ]);
    if (costs) applyCosts(costs);
    if (income) applyIncome(income);
    if (conclusion) applyConclusion(conclusion);
  };

  const onMarketCalculation = (calculation: MarketCalculationDto, result: MarketApproachResult | null) => {
    applyMarket(calculation, result);
    const type = calculation.settings.comparableType;
    // The server recomputed what depends on this market: costs for land, income for rents.
    void refresh({ costs: type === "TERRENO_VENTA", income: type === "INMUEBLE_RENTA", conclusion: true });
  };
  const onCostCalculation = (calculation: CostCalculationDto) => {
    applyCosts(calculation);
    void refresh({ conclusion: true });
  };
  const onIncomeCalculation = (calculation: IncomeCalculationDto) => {
    applyIncome(calculation);
    void refresh({ conclusion: true });
  };

  const syncOnOpen = useEffectEvent(async (id: string) => {
    const markets = await Promise.all(MARKET_TYPES.map((type) => api.market.get(id, type).catch(() => null)));
    for (const calculation of markets) {
      if (!calculation) continue;
      const input = toMarketEngineInput(calculation);
      applyMarket(calculation, input.ok ? computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG) : null);
    }
    await refresh({ costs: true, income: true, conclusion: true });
  });

  useEffect(() => {
    if (canEdit && valuationId) void syncOnOpen(valuationId);
  }, [canEdit, valuationId]);

  return {
    onMarketCalculation,
    onCostCalculation,
    onIncomeCalculation,
    onConclusionCalculation: applyConclusion,
    suggestedSubjectArea: findSubjectLandArea(sections),
  };
}
