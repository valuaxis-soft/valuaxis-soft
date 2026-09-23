import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import type { Apartado, AppSection, Block, Concept, ConceptType } from "@/features/valuations/model";
import { COMPANY_HEADER_BLOCK_ID } from "@/features/valuations/services/caratula-company-header";
import {
  isCaratulaIntermediateBlock,
  UNTITLED_CARATULA_CONCEPT,
} from "@/features/valuations/services/caratula-blocks";
import {
  applyConceptEditOnlyHere,
  applyConceptUpdateEverywhere,
  changeExistingConceptRelation,
  linkConceptToCollection,
  unlinkConcept,
  type ExistingConceptRelationMode,
} from "@/features/valuations/concept-links";
import { normalizeBlockFlowV2, isBlockFlowV2 } from "@/features/valuations/services/block-flow";
import { isContentLayout, resolveContentLayout } from "@/features/valuations/services/content-layout";
import { setItemFullRowPreservingOrder, mergeItemToAdjacentRow } from "@/features/valuations/services/content-layout-v2-operations";
import { createApartado, createBlock, createConcept, newId } from "../model/content-factories";
import { textEditGroupKey, type EditorHistoryOptions } from "../model/editor-history";
import {
  ensureBlockContentIntegrity,
  flattenSectionConcepts,
  mapAllConcepts,
} from "../model/section-content";
import type { EditorState } from "./use-editor-state";

/** Block, concept and apartado edits: add, update, remove, link and reorder. */
export function useBlockMutations({
  updateSectionBlocks,
  updateSections,
}: Pick<EditorState, "updateSectionBlocks" | "updateSections">) {
  const addBlock = (sectionId: string) => {
    updateSectionBlocks(sectionId, (blocks) => [
      ...blocks,
      createBlock(sectionId === "caratula" ? UNTITLED_CARATULA_CONCEPT : undefined),
    ]);
  };

  const updateBlock = (sectionId: string, blockId: string, patch: Partial<Block>) => {
    updateSectionBlocks(
      sectionId,
      (blocks) => blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
      { groupKey: textEditGroupKey(`block:${blockId}`, patch) },
    );
  };

  const removeBlock = (sectionId: string, blockId: string) => {
    updateSectionBlocks(sectionId, (blocks) => {
      return blocks.filter((block) => block.id !== blockId);
    });
  };

  const addConcept = (sectionId: string, blockId: string, type?: ConceptType) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        const newConcept = createConcept(sectionId === "caratula" ? UNTITLED_CARATULA_CONCEPT : undefined, type);
        const updated = {
          ...block,
          concepts: [...block.concepts, newConcept],
        };
        // Persist both ContentLayoutV2 and BlockFlowV2 atomically
        return ensureBlockContentIntegrity(updated);
      }),
    );
  };

  const addConceptFromExisting = (
    sectionId: string,
    blockId: string,
    source: Concept,
    mode: "copy" | "full" | "value",
    apartadoId?: string,
  ) => {
    updateSections((current) => {
      const linkedConcepts = linkConceptToCollection(flattenConcepts(current), source.id, newId(), mode);
      const linkedConcept = linkedConcepts.at(-1);
      if (!linkedConcept || linkedConcepts.length === flattenConcepts(current).length) return current;

      const byId = new Map(linkedConcepts.map((concept) => [concept.id, concept]));
      return current.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) => {
          const nextBlock = {
            ...block,
            concepts: block.concepts.map((concept) => byId.get(concept.id) ?? concept),
      apartados: block.apartados.map((subBlock) => ({
              ...subBlock,
              concepts: subBlock.concepts.map((concept) => byId.get(concept.id) ?? concept),
            })),
          };

          if (section.id === sectionId && block.id === blockId && !apartadoId) {
            return { ...nextBlock, concepts: [...nextBlock.concepts, linkedConcept] };
          }

          if (section.id === sectionId && block.id === blockId && apartadoId) {
            return {
              ...nextBlock,
              apartados: nextBlock.apartados.map((subBlock) =>
                subBlock.id === apartadoId
                  ? { ...subBlock, concepts: [...subBlock.concepts, linkedConcept] }
                  : subBlock,
              ),
            };
          }

          return nextBlock;
        }),
      }));
    });
  };

  const flattenConcepts = (sectionsToRead: AppSection[]) =>
    flattenSectionConcepts(sectionsToRead);

  const applyLinkedConcepts = (
    updater: (concepts: Concept[]) => Concept[],
    options?: EditorHistoryOptions,
  ) => {
    updateSections((current) => {
      const updated = updater(flattenConcepts(current));
      const byId = new Map(updated.map((concept) => [concept.id, concept]));
      return mapAllConcepts(current, (concept) => byId.get(concept.id) ?? concept);
    }, { normalize: false, ...options });
  };

  const updateConceptEverywhere = (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => {
    applyLinkedConcepts(
      (concepts) => applyConceptUpdateEverywhere(concepts, conceptId, patch),
      { groupKey: textEditGroupKey(`linked-concept:${conceptId}`, patch) },
    );
  };

  const editConceptOnlyHere = (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => {
    applyLinkedConcepts(
      (concepts) => applyConceptEditOnlyHere(concepts, conceptId, patch),
      { groupKey: textEditGroupKey(`concept:${conceptId}`, patch) },
    );
  };

  const unlinkConceptEverywhere = (conceptId: string) => {
    applyLinkedConcepts((concepts) =>
      concepts.map((concept) => (concept.id === conceptId ? unlinkConcept(concept, concepts) : concept)),
    );
  };

  const changeConceptRelation = (conceptId: string, mode: ExistingConceptRelationMode) => {
    applyLinkedConcepts((concepts) => changeExistingConceptRelation(concepts, conceptId, mode));
  };

  const updateConcept = (
    sectionId: string,
    blockId: string,
    conceptId: string,
    patch: Partial<Concept>,
  ) => {
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;

          const updatedConcepts = block.concepts.map((concept) =>
            concept.id === conceptId ? { ...concept, ...patch } : concept,
          );

          // When layoutSpan toggles, also update ContentLayoutV2 structure
          // so the visual layout matches the metadata.
          let updatedContentLayout = block.contentLayout;
          if (
            patch.layoutSpan !== undefined &&
            isContentLayout(block.contentLayout)
          ) {
            // Operate on the STORED layout directly — do NOT re-normalize via
            // resolveContentLayout, which can append missing content and
            // reorder items, breaking the flat order invariant.
            const v2Result = patch.layoutSpan === "full"
              ? setItemFullRowPreservingOrder(block.contentLayout, conceptId)
              : mergeItemToAdjacentRow(block.contentLayout, conceptId);
            if (v2Result.changed) {
              updatedContentLayout = v2Result.layout;
            }
          }

          return {
            ...block,
            concepts: updatedConcepts,
            contentLayout: updatedContentLayout,
          };
        }),
      { groupKey: textEditGroupKey(`concept:${conceptId}`, patch), normalize: false },
    );
  };

  const removeConcept = (sectionId: string, blockId: string, conceptId: string) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        const updated = { ...block, concepts: block.concepts.filter((concept) => concept.id !== conceptId) };
        return ensureBlockContentIntegrity(updated);
      }),
    );
  };

  const addApartado = (sectionId: string, blockId: string) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) =>
        block.id === blockId ? { ...block, apartados: [...block.apartados, createApartado()] } : block,
      ),
    );
  };

  const updateApartado = (
    sectionId: string,
    blockId: string,
    apartadoId: string,
    patch: Partial<Apartado>,
  ) => {
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                apartados: block.apartados.map((subBlock) =>
                  subBlock.id === apartadoId ? { ...subBlock, ...patch } : subBlock,
                ),
              }
            : block,
        ),
      { groupKey: textEditGroupKey(`subBlock:${apartadoId}`, patch) },
    );
  };

  const removeApartado = (sectionId: string, blockId: string, apartadoId: string) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        // 1. Remove SubBlock from apartados array
        const nextSubBlocks = block.apartados.filter((subBlock) => subBlock.id !== apartadoId);
        // 2. Clean up BlockFlowV2 refs — normalize removes stale apartado refs
        let nextBlockFlow = block.blockFlow;
        if (nextBlockFlow && isBlockFlowV2(nextBlockFlow)) {
          const cleanedBlock = { ...block, apartados: nextSubBlocks };
          nextBlockFlow = normalizeBlockFlowV2(cleanedBlock, nextBlockFlow);
        }
        return {
          ...block,
          apartados: nextSubBlocks,
          blockFlow: nextBlockFlow,
        };
      }),
    );
  };

  const addSubConcept = (sectionId: string, blockId: string, apartadoId: string, type?: ConceptType) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              apartados: block.apartados.map((subBlock) => {
                if (subBlock.id !== apartadoId) return subBlock;
                const updated = {
                  ...subBlock,
                  concepts: [...subBlock.concepts, createConcept(undefined, type)],
                };
                // Reconcile content layout so the new concept appears in the form
                return { ...updated, contentLayout: resolveContentLayout(updated) };
              }),
            }
          : block,
      ),
    );
  };

  const updateSubConcept = (
    sectionId: string,
    blockId: string,
    apartadoId: string,
    conceptId: string,
    patch: Partial<Concept>,
  ) => {
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                apartados: block.apartados.map((subBlock) =>
                  subBlock.id === apartadoId
                    ? {
                        ...subBlock,
                        concepts: subBlock.concepts.map((concept) =>
                          concept.id === conceptId ? { ...concept, ...patch } : concept,
                        ),
                      }
                    : subBlock,
                ),
              }
            : block,
        ),
      { groupKey: textEditGroupKey(`concept:${conceptId}`, patch), normalize: false },
    );
  };

  const removeSubConcept = (
    sectionId: string,
    blockId: string,
    apartadoId: string,
    conceptId: string,
  ) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              apartados: block.apartados.map((subBlock) => {
                if (subBlock.id !== apartadoId) return subBlock;
                const updated = {
                  ...subBlock,
                  concepts: subBlock.concepts.filter((concept) => concept.id !== conceptId),
                };
                // Reconcile content layout to remove the stale ref
                return { ...updated, contentLayout: resolveContentLayout(updated) };
              }),
            }
          : block,
      ),
    );
  };

  const onBlockDragEnd = (sectionId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    updateSectionBlocks(sectionId, (blocks) => {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);
      return arrayMove(blocks, oldIndex, newIndex);
    });
  };

  const moveBlock = (sectionId: string, blockId: string, direction: -1 | 1) => {
    updateSectionBlocks(sectionId, (blocks) => {
      const isDatos = sectionId === "datos" || sectionId === "datosGenerales";
      const movableBlocks = isDatos
        ? blocks
        : blocks.filter(
            (block) => block.id !== COMPANY_HEADER_BLOCK_ID && isCaratulaIntermediateBlock(block),
          );
      const currentPosition = movableBlocks.findIndex((block) => block.id === blockId);
      const targetBlock = movableBlocks[currentPosition + direction];
      if (currentPosition < 0 || !targetBlock) return blocks;
      const currentIndex = blocks.findIndex((block) => block.id === blockId);
      const targetIndex = blocks.findIndex((block) => block.id === targetBlock.id);
      return arrayMove(blocks, currentIndex, targetIndex);
    });
  };

  return {
    addApartado,
    addBlock,
    addConcept,
    addConceptFromExisting,
    addSubConcept,
    changeConceptRelation,
    editConceptOnlyHere,
    moveBlock,
    onBlockDragEnd,
    removeApartado,
    removeBlock,
    removeConcept,
    removeSubConcept,
    unlinkConceptEverywhere,
    updateApartado,
    updateBlock,
    updateConcept,
    updateConceptEverywhere,
    updateSubConcept,
  };
}
