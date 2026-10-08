/**
 * Content move rules — where the Concepts, Images and Tables of a section may
 * be dragged to.
 *
 * Content moves between the Blocks of its section, except where something
 * other than the editor owns a Block or an item and would undo the move:
 *
 *  - Blocks written by the calculation are regenerated from it, and the
 *    template Blocks they stand in for are dropped once it has results:
 *    content dragged into either would be lost, so they give and take nothing.
 *  - In the Carátula only Concepts change Block (its Blocks hold nothing
 *    else), and the fixed Blocks (company header, assumptions, conclusion) are
 *    edited through their own fields.
 *  - The construction tables filled from the cost capture are found by ID in
 *    their Apartado: they stay in it.
 *  - The table of measures of the "Medidas y colindancias" Apartado of the
 *    Terreno is printed in its own format there, and put back when missing:
 *    it stays in its Apartado.
 *
 * Pure: no side effects, no rendering.
 */

import { COST_TEMPLATE_BLOCK_IDS, isCostCaptureTable } from "../calculation/cost-document";
import { INCOME_TEMPLATE_BLOCK_IDS } from "../calculation/income-document";
import {
  MARKET_TEMPLATE_BLOCK_IDS,
  RENT_TEMPLATE_BLOCK_IDS,
  isGeneratedBlock,
} from "../calculation/market-document";
import type { AppSection, Block } from "../model";
import { findBoundaryTable, getTerrenoElementKind, isTerrenoSection } from "../sections/terreno";
import { getCaratulaBlockKind } from "./caratula-blocks";
import { COMPANY_HEADER_BLOCK_ID } from "./caratula-company-header";
import { contentItemKey, type ContentMoveRules } from "./content-drop";
import type { TransferableContentType } from "./content-transfer";

// Saved block ids come back in lower case.
const CALCULATION_PLACEHOLDER_BLOCK_IDS = new Set(
  [
    ...MARKET_TEMPLATE_BLOCK_IDS,
    ...RENT_TEMPLATE_BLOCK_IDS,
    ...COST_TEMPLATE_BLOCK_IDS,
    ...INCOME_TEMPLATE_BLOCK_IDS,
  ].map((id) => id.toLowerCase()),
);

/** A Block the calculation writes, or a template Block its results replace. */
function isCalculationOwnedBlock(block: Pick<Block, "id">): boolean {
  return isGeneratedBlock(block) || CALCULATION_PLACEHOLDER_BLOCK_IDS.has(block.id.toLowerCase());
}

const ALL_CONTENT_TYPES: readonly TransferableContentType[] = ["concept", "image", "table"];
const CONCEPTS_ONLY: readonly TransferableContentType[] = ["concept"];

/** The move rules of one section of the valuation, as it is now. */
export function contentMoveRulesForSection(section: AppSection): ContentMoveRules {
  const isCaratula = section.id === "caratula";
  const isTerreno = isTerrenoSection(section);

  const lockedBlockIds = new Set<string>();
  const pinnedItems = new Set<string>();

  for (const block of section.blocks) {
    const isFixedCaratulaBlock = isCaratula
      && (block.id === COMPANY_HEADER_BLOCK_ID || getCaratulaBlockKind(block) !== "intermediate");
    if (isFixedCaratulaBlock || isCalculationOwnedBlock(block)) lockedBlockIds.add(block.id);

    for (const table of block.tables) {
      if (isCostCaptureTable(table.id)) pinnedItems.add(contentItemKey("table", table.id));
    }
    for (const apartado of block.apartados) {
      const boundaryTable = isTerreno && getTerrenoElementKind(apartado) === "boundaries"
        ? findBoundaryTable(apartado)
        : undefined;
      for (const table of apartado.tables) {
        if (table === boundaryTable || isCostCaptureTable(table.id)) pinnedItems.add(contentItemKey("table", table.id));
      }
    }
  }

  return {
    crossBlockTypes: isCaratula ? CONCEPTS_ONLY : ALL_CONTENT_TYPES,
    lockedBlockIds,
    pinnedItems,
    closedContainers: new Map(),
  };
}
