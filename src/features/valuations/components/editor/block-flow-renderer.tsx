"use client";

/**
 * BlockFlowRenderer — renders a Block's direct content rows and Apartados
 * in the exact order defined by resolveBlockFlowV2(block).
 *
 * Drag and drop runs in the enclosing ContentDndScope, shared by all the
 * Blocks of the section: this component draws the drop slots of its Block
 * and finishes the drags of its own Apartados.
 *
 * When block.blockFlow is absent, resolveBlockFlowV2 produces the legacy
 * order: all content rows then all Apartados — visually identical to the
 * current behaviour.
 *
 * V2 structural rows support:
 *  - Content row: full-width content layout row
 *  - Single apartado: full-width SortableApartado with left/right merge zones
 *  - Paired apartados: two SortableApartados in 50/50 CSS Grid
 */

import { useCallback, useEffect, useMemo } from "react";
import type {
  Block,
  BlockFlowV2,
  Concept,
  ContentLayoutItemRef,
  ContentLayout,
  Apartado,
} from "../../model";
import { resolveContentLayout } from "../../services/content-layout";
import {
  resolveBlockFlowV2,
  moveBlockFlowV2Apartado,
} from "../../services/block-flow";
import {
  canDropContentInBlock,
  findHomeContentRowId,
  planBlockBoundarySlots,
  planContentDropSlots,
} from "../../services/content-drop";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  V2RowDropTarget,
  parseBfRowDropZoneId,
  parseBfApartadoDropZoneId,
  BfRowDropZones,
  BfApartadoDropZones,
  BfApartadoInsideDropZone,
  BfBlockInsideDropZone,
} from "./content-layout-v2-drop-target";
import { CONTENT_DND_BLOCK_ATTRIBUTE, useContentDndScope } from "./content-dnd-scope";
import { V2RowContent, renderLayoutItem } from "./editable-content-layout-v2";
import type {
  EditableConceptCallbacks,
  EditableImageCallbacks,
  EditableTableCallbacks,
} from "./editable-content-layout-v2";
import { SortableApartado } from "./sortable-apartado";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildColumnToRowId(rows: { id: string; columns: { id: string }[] }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    for (const col of row.columns) {
      map.set(col.id, row.id);
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export type BlockFlowRendererProps = {
  /** The block whose content rows and apartados to render. */
  block: Block;
  /** All workspace concepts (for cross-block concept linking). */
  allConcepts: Concept[];
  /** Concept callbacks scoped to this block. */
  conceptCallbacks: EditableConceptCallbacks;
  /** Image callbacks scoped to this block. */
  imageCallbacks: EditableImageCallbacks;
  /** Table callbacks scoped to this block. */
  tableCallbacks: EditableTableCallbacks;
  /** Read-only mode. */
  readOnly: boolean;
  /** Enable layout controls on concept editors. */
  enableLayoutControls?: boolean;
  /** Layout variant. */
  layout?: "default" | "caratulaGrid";
  /** Require title on concept editors. */
  requireTitle?: boolean;
  /** Show terreno length hint. */
  showTerrenoLengthHint?: boolean;
  /** Additional CSS class for the outer container. */
  className?: string;
  /**
   * Makes the Block's content draggable. The drop itself is applied by the
   * enclosing ContentDndScope, to the whole Block at once.
   */
  onContentLayoutChange?: (nextLayout: ContentLayout) => void;
  /** Called when structural DnD produces a new BlockFlow V2 order. */
  onBlockFlowChange?: (nextFlow: BlockFlowV2) => void;
  /**
   * Render callback for each Apartado.
   * Receives the SubBlock, its index in the BlockFlow order,
   * and the current DnD state for visual indicators.
   */
  renderApartado: (subBlock: Apartado, flowIndex: number, dndState: { activeColumnId: string | null; activeTarget: string | null }) => React.ReactNode;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BlockFlowRenderer({
  block,
  allConcepts,
  conceptCallbacks,
  imageCallbacks,
  tableCallbacks,
  readOnly,
  enableLayoutControls = false,
  layout = "default",
  requireTitle = false,
  showTerrenoLengthHint = false,
  className,
  onContentLayoutChange,
  onBlockFlowChange,
  renderApartado,
}: BlockFlowRendererProps) {
  /* ---- Resolve layout + V2 flow ---- */
  const resolvedLayout = useMemo(
    () => resolveContentLayout(block),
    [block],
  );

  // Resolved against the layout being shown, so every visible row has its place in the flow.
  const blockFlowV2 = useMemo(
    () => resolveBlockFlowV2({ ...block, contentLayout: resolvedLayout }),
    [block, resolvedLayout],
  );

  /* ---- Lookups ---- */
  const conceptsById = useMemo(
    () => new Map(block.concepts.map((c) => [c.id, c])),
    [block.concepts],
  );
  const imagesById = useMemo(
    () => new Map(block.images.map((i) => [i.id, i])),
    [block.images],
  );
  const tablesById = useMemo(
    () => new Map(block.tables.map((t) => [t.id, t])),
    [block.tables],
  );
  const allContainerConcepts = useMemo(
    () => block.concepts,
    [block.concepts],
  );

  const subBlocksById = useMemo(
    () => new Map(block.apartados.map((sb) => [sb.id, sb])),
    [block.apartados],
  );

  const rowsById = useMemo(
    () => new Map(resolvedLayout.rows.map((r) => [r.id, r])),
    [resolvedLayout],
  );

  /* ---- Flatten apartado IDs from V2 structural rows for SortableContext ---- */
  const apartadoIds = useMemo(() => {
    if (!blockFlowV2) return block.apartados.map((sb) => sb.id);
    const ids: string[] = [];
    for (const structuralRow of blockFlowV2.rows) {
      for (const item of structuralRow.items) {
        if (item.type === "apartado") {
          ids.push(item.apartadoId);
        }
      }
    }
    return ids;
  }, [blockFlowV2, block.apartados]);

  const apartadoIdSet = useMemo(
    () => new Set(block.apartados.map((sb) => sb.id)),
    [block.apartados],
  );

  /* ---- DnD state, from the scope shared by the Blocks of the section ---- */
  const scope = useContentDndScope();
  const { registerBlock } = scope;
  // An item that may not come to this Block gets no slots here.
  const acceptsContent = scope.activeContent !== null
    && canDropContentInBlock(scope.activeContent, block.id, scope.crossBlock);
  const activeContent = acceptsContent ? scope.activeContent : null;
  const activeColumnId = acceptsContent ? scope.activeColumnId : null;
  const activeApartadoId = scope.activeApartado?.blockId === block.id ? scope.activeApartado.apartadoId : null;
  const activeTarget = scope.activeTarget;

  const columnToRowId = useMemo(
    () => buildColumnToRowId(resolvedLayout.rows),
    [resolvedLayout],
  );

  const handleApartadoDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeId = String(active.id);

      if (!over || !onBlockFlowChange || !blockFlowV2) return;

      const overId = String(over.id);
      if (overId === activeId) return;

      /* ---- Structural BEFORE/AFTER drop zones ---- */
      const bfRowZone = parseBfRowDropZoneId(overId);
      if (bfRowZone) {
        const result = moveBlockFlowV2Apartado(blockFlowV2, {
          apartadoId: activeId,
          target: {
            type: "structural-row",
            rowId: bfRowZone.rowId,
            placement: bfRowZone.placement,
          },
        });
        if (result.changed) onBlockFlowChange(result.flow);
        return;
      }

      /* ---- Apartado LEFT/RIGHT merge zones ---- */
      const bfApartadoZone = parseBfApartadoDropZoneId(overId);
      if (bfApartadoZone) {
        const result = moveBlockFlowV2Apartado(blockFlowV2, {
          apartadoId: activeId,
          target: {
            type: "apartado",
            apartadoId: bfApartadoZone.apartadoId,
            placement: bfApartadoZone.placement,
          },
        });
        if (result.changed) onBlockFlowChange(result.flow);
        return;
      }

      /* ---- Direct apartado target (sortable drop) ---- */
      if (apartadoIdSet.has(overId)) {
        // Determine placement by finding positions in V2 rows
        const sourceRow = blockFlowV2.rows.find((r) =>
          r.items.some((item) => item.type === "apartado" && item.apartadoId === activeId),
        );
        const targetRow = blockFlowV2.rows.find((r) =>
          r.items.some((item) => item.type === "apartado" && item.apartadoId === overId),
        );

        if (sourceRow && targetRow) {
          const sourceRowIdx = blockFlowV2.rows.indexOf(sourceRow);
          const targetRowIdx = blockFlowV2.rows.indexOf(targetRow);

          if (sourceRowIdx === targetRowIdx) {
            // Same row — determine left/right based on item order
            const sourceItemIdx = sourceRow.items.findIndex(
              (item) => item.type === "apartado" && item.apartadoId === activeId,
            );
            const targetItemIdx = sourceRow.items.findIndex(
              (item) => item.type === "apartado" && item.apartadoId === overId,
            );
            const placement = sourceItemIdx < targetItemIdx ? "right" : "left";
            const result = moveBlockFlowV2Apartado(blockFlowV2, {
              apartadoId: activeId,
              target: { type: "apartado", apartadoId: overId, placement },
            });
            if (result.changed) onBlockFlowChange(result.flow);
          } else {
            // Cross-row — use before/after on the target row
            const placement = sourceRowIdx < targetRowIdx ? "after" : "before";
            const result = moveBlockFlowV2Apartado(blockFlowV2, {
              apartadoId: activeId,
              target: { type: "structural-row", rowId: targetRow.id, placement },
            });
            if (result.changed) onBlockFlowChange(result.flow);
          }
        }
        return;
      }

      /* ---- Content row target ---- */
      const isOverContentRow = rowsById.has(overId);
      const isOverContentColumn = columnToRowId.has(overId);

      if (isOverContentRow || isOverContentColumn) {
        let targetRowId = overId;
        if (isOverContentColumn) {
          const resolved = columnToRowId.get(overId);
          if (!resolved) return;
          targetRowId = resolved;
        }

        // Find the target row in V2 and determine before/after
        const targetRowIdx = blockFlowV2.rows.findIndex((r) => r.id === targetRowId);
        if (targetRowIdx < 0) return;

        const sourceRow = blockFlowV2.rows.find((r) =>
          r.items.some((item) => item.type === "apartado" && item.apartadoId === activeId),
        );
        const placement = sourceRow && blockFlowV2.rows.indexOf(sourceRow) < targetRowIdx
          ? "after"
          : "before";

        const result = moveBlockFlowV2Apartado(blockFlowV2, {
          apartadoId: activeId,
          target: { type: "structural-row", rowId: targetRowId, placement },
        });
        if (result.changed) onBlockFlowChange(result.flow);
        return;
      }
    },
    [blockFlowV2, apartadoIdSet, rowsById, columnToRowId, onBlockFlowChange],
  );

  useEffect(
    () => registerBlock(block.id, { onApartadoDragEnd: handleApartadoDragEnd }),
    [registerBlock, block.id, handleApartadoDragEnd],
  );

  /* ---- Drop slots offered while a content item is dragged ---- */
  const draggedInBlock = activeContent?.container.kind === "block" && activeContent.container.blockId === block.id
    ? activeContent
    : null;
  const columnSlotsByRowId = useMemo(() => {
    if (!activeContent) return null;
    const plan = planContentDropSlots(resolvedLayout, draggedInBlock);
    return new Map(plan.map((rowPlan) => [rowPlan.rowId, rowPlan.columns]));
  }, [activeContent, draggedInBlock, resolvedLayout]);
  const boundarySlotsByRowId = useMemo(() => {
    if (!activeContent || !blockFlowV2) return null;
    const plan = planBlockBoundarySlots(blockFlowV2, findHomeContentRowId(resolvedLayout, draggedInBlock));
    return new Map(plan.map((rowPlan) => [rowPlan.structuralRowId, rowPlan]));
  }, [activeContent, blockFlowV2, draggedInBlock, resolvedLayout]);

  /* ---- Render callback ---- */
  const renderItem = useMemo(
    () =>
      (itemRef: ContentLayoutItemRef, columnId: string, currentPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation) =>
        renderLayoutItem({
          itemRef,
          columnId,
          currentPresentation,
          conceptsById,
          imagesById,
          tablesById,
          allConcepts,
          allContainerConcepts,
          conceptCallbacks,
          imageCallbacks,
          tableCallbacks,
          readOnly,
          enableLayoutControls,
          layout,
          requireTitle,
          showTerrenoLengthHint,
        }),
    [
      conceptsById,
      imagesById,
      tablesById,
      allConcepts,
      allContainerConcepts,
      conceptCallbacks,
      imageCallbacks,
      tableCallbacks,
      readOnly,
      enableLayoutControls,
      layout,
      requireTitle,
      showTerrenoLengthHint,
    ],
  );

  /* ---- Deterministic Apartado visual index (for color alternation) ---- */
  const apartadoVisualIndex = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    if (blockFlowV2) {
      for (const row of blockFlowV2.rows) {
        for (const item of row.items) {
          if (item.type === "apartado") {
            map.set(item.apartadoId, idx++);
          }
        }
      }
    }
    // Fallback: any apartado not in flow gets next index
    for (const sb of block.apartados) {
      if (!map.has(sb.id)) {
        map.set(sb.id, idx++);
      }
    }
    return map;
  }, [blockFlowV2, block.apartados]);

  /* ---- Build flow items list ---- */
  const structuralRows = blockFlowV2?.rows ?? [];

  /* ---- Render ---- */
  if (structuralRows.length === 0 && resolvedLayout.rows.length === 0) {
    // Nothing to show, but a Concept dragged from another Block can still land here.
    return readOnly || !onContentLayoutChange ? null : (
      <div {...{ [CONTENT_DND_BLOCK_ATTRIBUTE]: block.id }}>
        <BfBlockInsideDropZone blockId={block.id} activeColumnId={activeColumnId} activeTarget={activeTarget} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-y-1 ${className ?? ""}`} {...{ [CONTENT_DND_BLOCK_ATTRIBUTE]: block.id }}>
      <SortableContext items={apartadoIds} strategy={verticalListSortingStrategy}>
        {structuralRows.map((structuralRow) => {
          const firstItem = structuralRow.items[0];
          if (!firstItem) return null;

          /* --- Content structural row --- */
          if (firstItem.type === "content-row" && structuralRow.items.length === 1) {
            const row = rowsById.get(firstItem.rowId);
            if (!row) return null;
            return (
              <BfRowDropZones
                key={`row-${structuralRow.id}`}
                blockId={block.id}
                rowId={structuralRow.id}
                activeApartadoId={activeApartadoId}
                activeColumnId={activeColumnId}
                activeTarget={activeTarget}
                containerRef={{ kind: "block", blockId: block.id }}
                contentBefore={boundarySlotsByRowId?.get(structuralRow.id)?.before}
                contentAfter={boundarySlotsByRowId?.get(structuralRow.id)?.after}
              >
                {/* The new-row slots of a Block row are the structural boundaries around it. */}
                <V2RowContent
                  row={row}
                  rowIndex={0}
                  activeColumnId={activeColumnId}
                  activeTarget={activeTarget}
                  renderItem={renderItem}
                  disabled={readOnly || !onContentLayoutChange}
                  containerRef={{ kind: "block", blockId: block.id }}
                  slots={columnSlotsByRowId?.get(row.id)}
                />
              </BfRowDropZones>
            );
          }

          /* --- Single apartado structural row --- */
          if (
            firstItem.type === "apartado" &&
            structuralRow.items.length === 1
          ) {
            const subBlock = subBlocksById.get(firstItem.apartadoId);
            if (!subBlock) return null;
            const flowIdx = apartadoVisualIndex.get(firstItem.apartadoId) ?? 0;
            return (
              <BfRowDropZones
                key={`row-${structuralRow.id}`}
                blockId={block.id}
                rowId={structuralRow.id}
                activeApartadoId={activeApartadoId}
                activeColumnId={activeColumnId}
                activeTarget={activeTarget}
                containerRef={{ kind: "block", blockId: block.id }}
                contentBefore={boundarySlotsByRowId?.get(structuralRow.id)?.before}
                contentAfter={boundarySlotsByRowId?.get(structuralRow.id)?.after}
              >
                <BfApartadoDropZones
                  apartadoId={firstItem.apartadoId}
                  isSingleton={true}
                  activeApartadoId={activeApartadoId}
                  activeTarget={activeTarget}
                >
                  <BfApartadoInsideDropZone
                    apartadoId={firstItem.apartadoId}
                    blockId={block.id}
                    activeColumnId={activeColumnId}
                    activeTarget={activeTarget}
                    hasContent={subBlock.concepts.length > 0 || subBlock.images.length > 0 || subBlock.tables.length > 0}
                  >
                    <SortableApartado
                      apartadoId={firstItem.apartadoId}
                      blockId={block.id}
                      disabled={readOnly || !onBlockFlowChange}
                    >
                      {renderApartado(subBlock, flowIdx, { activeColumnId, activeTarget })}
                    </SortableApartado>
                  </BfApartadoInsideDropZone>
                </BfApartadoDropZones>
              </BfRowDropZones>
            );
          }

          /* --- Paired apartados structural row (2 apartados, 50/50) --- */
          if (
            firstItem.type === "apartado" &&
            structuralRow.items.length === 2
          ) {
            const item0 = structuralRow.items[0];
            const item1 = structuralRow.items[1];
            if (item0.type !== "apartado" || item1.type !== "apartado") return null;
            const sb1 = subBlocksById.get(item0.apartadoId);
            const sb2 = subBlocksById.get(item1.apartadoId);
            if (!sb1 && !sb2) return null;
            const flowIdx1 = apartadoVisualIndex.get(item0.apartadoId) ?? 0;
            const flowIdx2 = apartadoVisualIndex.get(item1.apartadoId) ?? 0;
            return (
              <BfRowDropZones
                key={`pair-${structuralRow.id}`}
                blockId={block.id}
                rowId={structuralRow.id}
                activeApartadoId={activeApartadoId}
                activeColumnId={activeColumnId}
                activeTarget={activeTarget}
                containerRef={{ kind: "block", blockId: block.id }}
                contentBefore={boundarySlotsByRowId?.get(structuralRow.id)?.before}
                contentAfter={boundarySlotsByRowId?.get(structuralRow.id)?.after}
              >
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {sb1 ? (
                    <BfApartadoDropZones
                      apartadoId={item0.apartadoId}
                      isSingleton={false}
                      activeApartadoId={activeApartadoId}
                      activeTarget={activeTarget}
                    >
                      <BfApartadoInsideDropZone
                        apartadoId={item0.apartadoId}
                        blockId={block.id}
                        activeColumnId={activeColumnId}
                        activeTarget={activeTarget}
                        hasContent={sb1.concepts.length > 0 || sb1.images.length > 0 || sb1.tables.length > 0}
                      >
                        <SortableApartado
                          apartadoId={item0.apartadoId}
                          blockId={block.id}
                          disabled={readOnly || !onBlockFlowChange}
                        >
                          {renderApartado(sb1, flowIdx1, { activeColumnId, activeTarget })}
                        </SortableApartado>
                      </BfApartadoInsideDropZone>
                    </BfApartadoDropZones>
                  ) : null}
                  {sb2 ? (
                    <BfApartadoDropZones
                      apartadoId={item1.apartadoId}
                      isSingleton={false}
                      activeApartadoId={activeApartadoId}
                      activeTarget={activeTarget}
                    >
                      <BfApartadoInsideDropZone
                        apartadoId={item1.apartadoId}
                        blockId={block.id}
                        activeColumnId={activeColumnId}
                        activeTarget={activeTarget}
                        hasContent={sb2.concepts.length > 0 || sb2.images.length > 0 || sb2.tables.length > 0}
                      >
                        <SortableApartado
                          apartadoId={item1.apartadoId}
                          blockId={block.id}
                          disabled={readOnly || !onBlockFlowChange}
                        >
                          {renderApartado(sb2, flowIdx2, { activeColumnId, activeTarget })}
                        </SortableApartado>
                      </BfApartadoInsideDropZone>
                    </BfApartadoDropZones>
                  ) : null}
                </div>
              </BfRowDropZones>
            );
          }

          return null;
        })}
      </SortableContext>

      {/* Fallback: content rows not referenced in flow (should not happen after normalization) */}
      {structuralRows.length === 0 && resolvedLayout.rows.map((row, rowIndex) => (
        <V2RowDropTarget
          key={`row-${row.id}`}
          rowId={row.id}
          activeId={activeColumnId}
          activeTarget={activeTarget}
          containerRef={{ kind: "block", blockId: block.id }}
        >
          <V2RowContent
            row={row}
            rowIndex={rowIndex}
            activeColumnId={activeColumnId}
            activeTarget={activeTarget}
            renderItem={renderItem}
            disabled={readOnly || !onContentLayoutChange}
            containerRef={{ kind: "block", blockId: block.id }}
          />
        </V2RowDropTarget>
      ))}
    </div>
  );
}
