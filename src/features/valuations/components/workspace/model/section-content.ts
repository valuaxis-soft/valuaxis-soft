import type { AppSection, Block, Concept } from "@/features/valuations/model";
import { resolveEffectiveConcept } from "@/features/valuations/concept-links";
import { COMPANY_HEADER_BLOCK_ID } from "@/features/valuations/services/caratula-company-header";
import { normalizeBlockFlowV2, isBlockFlowV2 } from "@/features/valuations/services/block-flow";
import { ensureContentLayout, isContentLayout } from "@/features/valuations/services/content-layout";

/**
 * Ensure a block has BOTH persisted ContentLayoutV2 AND BlockFlowV2.
 *
 * After ANY root-level content mutation (add/remove Concept/Image/Table),
 * canonical Block state must satisfy:
 * 1. business objects correct
 * 2. ContentLayoutV2 correct (content placement)
 * 3. BlockFlowV2 correct (structural ordering with content-row refs)
 *
 * BlockFlowV2 reconciliation preserves existing structural order.
 * Only adds genuinely new refs and removes stale refs.
 */
export function ensureBlockContentIntegrity(block: Block): Block {
  let updated = ensureContentLayout(block);

  // Always reconcile BlockFlowV2 against current ContentLayoutV2 + apartados
  // This preserves existing mixed ordering while adding/removing refs
  const existingFlow = updated.blockFlow;
  if (existingFlow && isBlockFlowV2(existingFlow)) {
    // Reconcile existing flow — preserves order, removes stale, adds missing
    updated = { ...updated, blockFlow: normalizeBlockFlowV2(updated, existingFlow) };
  } else {
    // No existing flow — create initial from ContentLayout rows + apartados
    const layout = updated.contentLayout;
    if (layout && isContentLayout(layout) && layout.rows.length > 0) {
      const contentRows = layout.rows.map((row) => ({
        id: `bf-c-${row.id}`,
        items: [{ type: "content-row" as const, rowId: row.id }],
      }));
      const apartadoRows = updated.apartados.map((sb) => ({
        id: `bf-a-${sb.id}`,
        items: [{ type: "apartado" as const, apartadoId: sb.id }],
      }));
      updated = { ...updated, blockFlow: { version: 2, rows: [...contentRows, ...apartadoRows] } };
    }
  }

  return updated;
}

export function getDocumentHeaderImage(sections: AppSection[]) {
  const caratulaSection = sections.find((section) => section.id === "caratula");
  const headerBlock = caratulaSection?.blocks.find((block) => block.id === COMPANY_HEADER_BLOCK_ID);
  return headerBlock?.images.find((image) => image.enabled !== false) ?? null;
}

export function flattenSectionConcepts(sectionsToRead: AppSection[]) {
  return sectionsToRead.flatMap((section) =>
    section.blocks.flatMap((block) => [
      ...block.concepts,
      ...block.apartados.flatMap((subBlock) => subBlock.concepts),
    ]),
  );
}

export function resolveSectionConceptsForDisplay(section: AppSection, allConcepts: Concept[]) {
  return {
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      concepts: block.concepts.map((concept) => resolveEffectiveConcept(concept, allConcepts)),
      apartados: block.apartados.map((subBlock) => ({
        ...subBlock,
        concepts: subBlock.concepts.map((concept) => resolveEffectiveConcept(concept, allConcepts)),
      })),
    })),
  };
}

export function mapAllConcepts(sectionsToMap: AppSection[], mapper: (concept: Concept) => Concept) {
  return sectionsToMap.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      concepts: block.concepts.map(mapper),
      apartados: block.apartados.map((subBlock) => ({
        ...subBlock,
        concepts: subBlock.concepts.map(mapper),
      })),
    })),
  }));
}
