import { useEffect, useEffectEvent, useRef } from "react";

import { api } from "@/lib/api-client";
import { caratulaConclusionValues, conclusionValues, withConceptValues } from "@/features/valuations/calculation/conclusion-document";
import { canConclude, conclusionEngineConfig, type ConclusionCalculationDto } from "@/features/valuations/calculation/conclusion-types";
import { COST_TEMPLATE_BLOCK_IDS, costDocumentBlocks, withConstructionTables } from "@/features/valuations/calculation/cost-document";
import { costEngineConfig, toCostEngineInput, type ConstructionTypesDto, type CostCalculationDto } from "@/features/valuations/calculation/cost-types";
import { INCOME_BLOCK_PREFIX, INCOME_TEMPLATE_BLOCK_IDS, incomeDocumentBlocks } from "@/features/valuations/calculation/income-document";
import { incomeEngineConfig, toIncomeEngineInput, type IncomeCalculationDto } from "@/features/valuations/calculation/income-types";
import { isMachineryCostBlock, isMachineryMarketBlock, machineryCostBlocks, machineryMarketBlocks } from "@/features/valuations/calculation/machinery-document";
import { toMachineryCostEngineInput, toMachineryMarketEngineInput, type MachineryCalculationDto } from "@/features/valuations/calculation/machinery-types";
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
import {
  COMPARABLE_TYPES,
  isRentComparableType,
  marketEngineConfig,
  toMarketEngineInput,
  type MarketCalculationDto,
} from "@/features/valuations/calculation/market-types";
import { statisticalDocumentBlocks, withStatisticalBlocks } from "@/features/valuations/calculation/statistical-document";
import type { StatisticalCalculationDto } from "@/features/valuations/calculation/statistical-types";
import { concludeValue } from "@/features/valuations/engine/conclusion";
import { computeCostApproach } from "@/features/valuations/engine/costs";
import { computeIncomeApproach } from "@/features/valuations/engine/income";
import { computeMachineryCost, computeMachineryMarket } from "@/features/valuations/engine/machinery";
import { computeMarketApproach, type MarketApproachResult } from "@/features/valuations/engine/market";
import { Trace } from "@/features/valuations/engine/trace";
import type { AppSection } from "@/features/valuations/model";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import { REPORT_APPROACHES, excludedReportApproaches } from "@/features/valuations/services/report-approaches";
import type { EditorState } from "./use-editor-state";

const COST_PREFIX = `${GENERATED_BLOCK_PREFIX}costos`;

/**
 * Keeps the dictamen in step with the calculations: market and rent blocks,
 * comparable photos, cost blocks and construction tables (the types captured
 * in the construction section and the installations of the cost panel), income blocks, the
 * cost and market blocks of a machinery valuation, and the concluded value in
 * the conclusion section and the carátula. It follows
 * what the server stored, syncs on opening (a tab that is not open cannot
 * report) and after every change; unchanged results leave the document alone.
 */
export function useCalculationDocumentSync({
  canEdit,
  caratula,
  machinery,
  saveStatus,
  sections,
  updateCaratula,
  updateSections,
  valuationId,
}: Pick<EditorState, "caratula" | "saveStatus" | "sections" | "updateCaratula" | "updateSections"> & {
  canEdit: boolean;
  /** The valuation is of machinery and equipment. */
  machinery: boolean;
  valuationId: string | null;
}) {
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
    // Every market writes its own pages: land and buildings, for sale in the market section and for rent in the rent market.
    const [sectionKey, placeholders] = isRentComparableType(type)
      ? ["MERCADO_RENTAS", RENT_TEMPLATE_BLOCK_IDS]
      : ["MERCADO_VENTA", MARKET_TEMPLATE_BLOCK_IDS];
    updateBySection(`motor-mercado-${type}`, (key, section) =>
      key === sectionKey
        ? withGeneratedBlocks(section, type, mainBlocks, { placeholderIds: placeholders })
        : key === "CROQUIS_COMPARABLES"
          ? withGeneratedBlocks(section, type, photoBlocks, { kind: "fotos", position: "end" })
          : section);
  };

  // The statistical methods print after the market of their type, in the same section.
  const applyStatistical = (calculation: StatisticalCalculationDto) => {
    if (!canEdit || calculation.locked) return;
    const type = calculation.settings.comparableType;
    const blocks = statisticalDocumentBlocks(calculation);
    const sectionKey = isRentComparableType(type) ? "MERCADO_RENTAS" : "MERCADO_VENTA";
    updateBySection(`motor-estadistico-${type}`, (key, section) => (key === sectionKey ? withStatisticalBlocks(section, type, blocks) : section));
  };

  // The construction tables follow the types even before the cost approach is configured.
  const applyCosts = (calculation: CostCalculationDto) => {
    if (!canEdit || calculation.locked) return;
    const input = calculation.configured ? toCostEngineInput(calculation) : null;
    const trace = new Trace();
    const result = input?.ok ? computeCostApproach(input.input, costEngineConfig(calculation), trace) : null;
    const blocks = costDocumentBlocks(calculation, result, input?.ok ? trace : null);
    updateBySection("motor-costos", (key, section) =>
      key === "COSTOS" && calculation.configured
        ? replaceGeneratedBlocks(section, (block) => block.id.startsWith(COST_PREFIX), blocks, { placeholderIds: COST_TEMPLATE_BLOCK_IDS })
        : key === "CONSTRUCCION"
          ? withConstructionTables(section, calculation)
          : section);
  };

  const applyIncome = (calculation: IncomeCalculationDto) => {
    if (!canEdit || calculation.locked || !calculation.configured) return;
    const input = toIncomeEngineInput(calculation);
    const blocks = incomeDocumentBlocks(calculation, input.ok ? computeIncomeApproach(input.input, incomeEngineConfig(calculation)) : null);
    updateBySection("motor-ingresos", (key, section) =>
      key === "INGRESOS"
        ? replaceGeneratedBlocks(section, (block) => block.id.startsWith(INCOME_BLOCK_PREFIX), blocks, { placeholderIds: INCOME_TEMPLATE_BLOCK_IDS })
        : section);
  };

  const applyMachinery = (calculation: MachineryCalculationDto) => {
    if (!canEdit || calculation.locked || !calculation.applies) return;
    const costInput = calculation.configured.cost ? toMachineryCostEngineInput(calculation.cost) : null;
    const costBlocks = machineryCostBlocks(calculation.cost, costInput?.ok ? computeMachineryCost(costInput.input) : null);
    const marketInput = calculation.configured.market ? toMachineryMarketEngineInput(calculation.market) : null;
    const marketBlocks = calculation.configured.market
      ? machineryMarketBlocks(calculation.market, calculation.cost.item, marketInput?.ok ? computeMachineryMarket(marketInput.input) : null)
      : [];
    updateBySection("motor-maquinaria", (key, section) =>
      key === "COSTOS"
        ? replaceGeneratedBlocks(section, isMachineryCostBlock, costBlocks, { placeholderIds: COST_TEMPLATE_BLOCK_IDS })
        : key === "MERCADO_VENTA"
          ? replaceGeneratedBlocks(section, isMachineryMarketBlock, marketBlocks, { placeholderIds: MARKET_TEMPLATE_BLOCK_IDS })
          : section);
  };

  const applyConclusion = (calculation: ConclusionCalculationDto) => {
    if (!canEdit || calculation.locked || !canConclude(calculation)) return;
    const result = concludeValue({ values: calculation.values, method: calculation.method }, conclusionEngineConfig(calculation));
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
    // The server recomputed what depends on this market: costs for land for sale, income (and so the
    // conclusion) for buildings for rent. The land rent market feeds no other approach.
    void refresh({ costs: type === "TERRENO_VENTA", income: type === "INMUEBLE_RENTA", conclusion: type !== "TERRENO_RENTA" });
  };
  const onCostCalculation = (calculation: CostCalculationDto) => {
    applyCosts(calculation);
    void refresh({ conclusion: true });
  };
  // The server recomputed the cost approach with the new types; its calculation carries them.
  const onConstructionTypes = (types: ConstructionTypesDto) => {
    if (types.locked) return;
    void refresh({ costs: true, conclusion: true });
  };
  const onIncomeCalculation = (calculation: IncomeCalculationDto) => {
    applyIncome(calculation);
    void refresh({ conclusion: true });
  };
  const onMachineryCalculation = (calculation: MachineryCalculationDto) => {
    applyMachinery(calculation);
    void refresh({ conclusion: true });
  };

  const syncOnOpen = useEffectEvent(async (id: string) => {
    const markets = await Promise.all(COMPARABLE_TYPES.map((type) => api.market.get(id, type).catch(() => null)));
    for (const calculation of markets) {
      if (!calculation) continue;
      const input = toMarketEngineInput(calculation);
      applyMarket(calculation, input.ok ? computeMarketApproach(input.input, marketEngineConfig(calculation.settings, calculation.precision)) : null);
    }
    // After the markets: a regression the market kept before moves to its own block.
    const statistical = await Promise.all(COMPARABLE_TYPES.map((type) => api.statistical.get(id, type).catch(() => null)));
    for (const calculation of statistical) if (calculation) applyStatistical(calculation);
    if (machinery) {
      const calculation = await api.machinery.get(id).catch(() => null);
      if (calculation) applyMachinery(calculation);
    }
    await refresh({ costs: true, income: true, conclusion: true });
  });

  useEffect(() => {
    if (canEdit && valuationId) void syncOnOpen(valuationId);
  }, [canEdit, valuationId]);

  // An approach turned on or off for the dictamen: once the document is saved, the server concluded
  // again without it (or with it), and the conclusion and the carátula follow.
  const excluded = excludedReportApproaches(sections);
  const exclusionKey = REPORT_APPROACHES.filter((approach) => excluded.has(approach)).join(",");
  const savedExclusionKeyRef = useRef(exclusionKey);
  const refreshConclusion = useEffectEvent(() => void refresh({ conclusion: true }));
  useEffect(() => {
    if (saveStatus !== "saved") return;
    if (savedExclusionKeyRef.current === exclusionKey) return;
    savedExclusionKeyRef.current = exclusionKey;
    refreshConclusion();
  }, [exclusionKey, saveStatus]);

  return {
    onMarketCalculation,
    onCostCalculation,
    onConstructionTypes,
    onIncomeCalculation,
    onMachineryCalculation,
    onStatisticalCalculation: applyStatistical,
    onConclusionCalculation: applyConclusion,
    suggestedSubjectArea: findSubjectLandArea(sections),
  };
}
