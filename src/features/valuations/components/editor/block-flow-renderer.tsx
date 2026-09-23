"use client";

/**
 * BlockFlowRenderer — renders a Block's direct content rows and Apartados
 * in the exact order defined by resolveBlockFlowV2(block).
 *
 * This component owns a single DndContext for content-row DnD and
 * structural apartado DnD, identical to the one in EditableContentLayout.
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

import { useCallback, useMemo, useState } from "react";
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
  moveContentLayout,
  type ContentLayoutMoveDescriptor,
} from "../../services/content-layout-v2-operations";
import {
  resolveBlockFlowV2,
  moveBlockFlowV2Apartado,
  insertContentRowIntoBlockFlowV2,
  removeContentRowsFromBlockFlowV2,
  moveContentColumnToBlockFlowBoundary,
  type ContentRowInsertDescriptor,
} from "../../services/block-flow";
import {
  moveContentItemAcrossContainers,
  type ContentTransferDescriptor,
} from "../../services/content-transfer";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { editorCanScroll } from "./editor-dnd-autoscroll";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  V2RowDropTarget,
  parseV2DropZoneId,
  parseV2RowBelowZone,
  parseBfRowDropZoneId,
  parseBfApartadoDropZoneId,
  BfRowDropZones,
  BfApartadoDropZones,
  BfApartadoInsideDropZone,
} from "./content-layout-v2-drop-target";
import {
  extractDomainColumnIdFromScoped,
  isScopedContentDropId,
  isScopedContentRowDropId,
  type ContentContainerRef,
} from "./content-dnd-ids";
import { V2RowContent, renderLayoutItem } from "./editable-content-layout-v2";
import { ContentDragPreview } from "./content-layout-drag-preview";
import { CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW } from "../../services/content-layout";
import type {
  EditableConceptCallbacks,
  EditableImageCallbacks,
  EditableTableCallbacks,
} from "./editable-content-layout-v2";
import { SortableApartado } from "./sortable-apartado";

/* ------------------------------------------------------------------ */
/*  Collision detection (shared with EditableContentLayout)          */
/* ------------------------------------------------------------------ */

/**
 * Classify a droppable ID as a specific content target (directional/row).
 * These are high-priority targets that should win over broad container zones.
 */
function isSpecificContentTarget(id: string): boolean {
  return id.startsWith("v2drop-") || id.startsWith("v2row-");
}

/**
 * Classify a droppable ID as a broad container target (inside zone).
 * These are stable fallbacks that should remain active when no specific
 * target is underneath the pointer.
 */
function isBroadContainerTarget(id: string): boolean {
  return id.startsWith("apartado-inside-") || id.startsWith("bfblock-inside-");
}

/**
 * Classify a droppable ID as a BlockFlow structural zone.
 */
function isBfStructural(id: string): boolean {
  return id.startsWith("bfrow-") || id.startsWith("bfapartado-");
}

/**
 * Check if a droppable ID is a raw sortable (not a semantic drop target).
 */
function isRawSortable(id: string): boolean {
  return !isSpecificContentTarget(id) && !isBroadContainerTarget(id) && !isBfStructural(id);
}

/**
 * Build a collision detection function that captures the current apartadoIdSet.
 * This closure approach keeps collision detection inside the component
 * where it has access to the apartado set for drag-kind filtering.
 */
function buildCollisionDetection(apartadoIdSet: Set<string>): CollisionDetection {
  return (args) => {
    const activeId = args.active ? String(args.active.id) : null;
    const isApartadoDrag = activeId ? apartadoIdSet.has(activeId) : false;

    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length === 0) return rectIntersection(args);

    if (pointerCollisions.length === 1) {
      // Single collision — check drag-kind compatibility
      const collision = pointerCollisions[0];
      const collisionId = String(collision.id);
      if (isApartadoDrag && isSpecificContentTarget(collisionId)) return [];
      if (!isApartadoDrag && isBfStructural(collisionId) && isRawSortable(collisionId)) return [];
      return pointerCollisions;
    }

    // Multiple collisions — apply drag-kind filtering + priority hierarchy
    const compatible = pointerCollisions.filter((c) => {
      const id = String(c.id);
      if (isApartadoDrag) {
        // Apartado drag: reject content-specific targets
        return !isSpecificContentTarget(id);
      }
      // Content drag: reject bfapartado-merge (structural apartado merge zones)
      if (id.startsWith("bfapartado-")) return false;
      return true;
    });

    if (compatible.length === 0) return pointerCollisions;
    if (compatible.length === 1) return compatible;

    // Separate into priority tiers using droppable data kinds
    const specificTargets: typeof compatible = [];
    const structuralTargets: typeof compatible = [];
    const broadTargets: typeof compatible = [];
    const rawSortables: typeof compatible = [];

    // Build a lookup from droppableContainers array for data access
    const droppableDataById = new Map<string, Record<string, unknown> | undefined>();
    for (const container of args.droppableContainers) {
      droppableDataById.set(String(container.id), container.data?.current as Record<string, unknown> | undefined);
    }

    for (const collision of compatible) {
      const id = String(collision.id);
      const droppableData = droppableDataById.get(id);
      const kind = droppableData?.kind as string | undefined;

      if (kind === "content-column-target" || kind === "content-row-target") {
        specificTargets.push(collision);
      } else if (isBfStructural(id)) {
        structuralTargets.push(collision);
      } else if (kind === "apartado-inside" || kind === "block-inside") {
        broadTargets.push(collision);
      } else {
        rawSortables.push(collision);
      }
    }

    // Priority: specific > structural > broad > raw sortable
    if (specificTargets.length > 0) return specificTargets;
    if (structuralTargets.length > 0) return structuralTargets;
    if (broadTargets.length > 0) return broadTargets;
    if (rawSortables.length > 0) return rawSortables;

    return compatible;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers (shared with EditableContentLayout)                      */
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

function getColumnCount(rows: { id: string; columns: { id: string }[] }[], rowId: string): number {
  const row = rows.find((r) => r.id === rowId);
  return row ? row.columns.length : 0;
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
  /** Called when DnD produces a new content layout. */
  onContentLayoutChange?: (nextLayout: ContentLayout) => void;
  /** Called when structural DnD produces a new BlockFlow V2 order. */
  onBlockFlowChange?: (nextFlow: BlockFlowV2) => void;
  /** Called when cross-container content move produces a complete updated Block. */
  onCrossContainerChange?: (nextBlock: Block) => void;
  /** Called when same-apartado content reorder produces a new layout for that apartado. */
  onApartadoContentLayoutChange?: (apartadoId: string, nextLayout: ContentLayout) => void;
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
  onCrossContainerChange,
  onApartadoContentLayoutChange,
  renderApartado,
}: BlockFlowRendererProps) {
  /* ---- Resolve layout + V2 flow ---- */
  const resolvedLayout = useMemo(
    () => resolveContentLayout(block),
    [block],
  );

  const blockFlowV2 = useMemo(
    () => resolveBlockFlowV2(block),
    [block],
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

  /* ---- DnD state ---- */
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [activeApartadoId, setActiveApartadoId] = useState<string | null>(null);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);

  const columnToRowId = useMemo(
    () => buildColumnToRowId(resolvedLayout.rows),
    [resolvedLayout],
  );

  const columnItemRef = useMemo(() => {
    const map = new Map<string, ContentLayoutItemRef>();
    for (const row of resolvedLayout.rows) {
      for (const col of row.columns) {
        if (col.items.length > 0) {
          map.set(col.id, col.items[0]);
        }
      }
    }
    return map;
  }, [resolvedLayout]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /* ---- Collision detection (closure captures apartadoIdSet for drag-kind filtering) ---- */
  const collisionDetection = useMemo(
    () => buildCollisionDetection(apartadoIdSet),
    [apartadoIdSet],
  );

  /* ---- DnD handlers ---- */
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      setActiveTarget(event.over ? String(event.over.id) : null);
    },
    [],
  );

  const handleContentDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTarget(null);
      if (!over || !onContentLayoutChange) return;

      const sourceData = active.data.current as Record<string, unknown> | undefined;
      const overData = over.data.current as Record<string, unknown> | undefined;

      // Extract DOMAIN column IDs from metadata (not scoped DnD IDs)
      const sourceColumnId = (sourceData?.columnId as string) ?? extractDomainColumnIdFromScoped(String(active.id)) ?? String(active.id);
      const overDomainColumnId = (overData?.columnId as string) ?? extractDomainColumnIdFromScoped(String(over.id));

      /* ---- Cross-container detection ---- */
      if (sourceData && overData && onCrossContainerChange) {
        const sourceContainer = sourceData.container as ContentContainerRef | undefined;
        const overContainer = overData.container as ContentContainerRef | undefined;

        if (sourceContainer && overContainer) {
          // Determine if source and destination are the same container
          const isSameContainer =
            sourceContainer.kind === overContainer.kind &&
            sourceContainer.kind === "block"
              ? sourceContainer.blockId === overContainer.blockId
              : sourceContainer.kind === "apartado" && overContainer.kind === "apartado"
                ? sourceContainer.apartadoId === overContainer.apartadoId
                : false;

          if (!isSameContainer) {
            // CROSS-CONTAINER: build descriptor and delegate to transfer engine
            const itemType = sourceData.itemType as "concept" | "image" | "table" | undefined;
            const itemId = sourceData.itemId as string | undefined;

            // SAFETY: require business metadata for cross-container transfer
            if (!itemType || !itemId) return;

            let destinationPlacement: ContentTransferDescriptor["destinationPlacement"];
            let blockFlowPlacement: ContentTransferDescriptor["blockFlowPlacement"];

            if (overData.kind === "apartado-inside") {
              // Drop INTO an Apartado — create new row
              destinationPlacement = { type: "new-row" };
            } else if (overData.kind === "content-column-target") {
              // Drop on existing column in destination
              const placement = overData.placement as "left" | "right";
              const columnId = overData.columnId as string;
              destinationPlacement = placement === "left"
                ? { type: "before-column", anchorColumnId: columnId }
                : { type: "after-column", anchorColumnId: columnId };
            } else if (overData.kind === "content-row-target") {
              // Drop on row below in destination
              destinationPlacement = { type: "new-row" };
            } else if (overData.kind === "block-flow-boundary") {
              // Drop on BlockFlow structural boundary (bfrow before/after)
              destinationPlacement = { type: "new-row" };
              blockFlowPlacement = {
                targetStructuralRowId: overData.structuralRowId as string,
                placement: overData.placement as "before" | "after",
              };
            } else {
              return; // Unknown target type
            }

            const descriptor: ContentTransferDescriptor = {
              itemType,
              itemId,
              source: sourceContainer,
              destination: overContainer,
              destinationPlacement,
              blockFlowPlacement,
            };

            const result = moveContentItemAcrossContainers(block, descriptor);
            if (result.changed) {
              onCrossContainerChange(result.block);
            }
            return;
          }
          // Same container — fall through to same-container routing below
        }
      }

      /* ---- Same-Apartado reorder ---- */
      // When source and over are in the same apartado, resolve THAT apartado's
      // layout (not the block's layout) and perform the move within it.
      if (sourceData && onApartadoContentLayoutChange) {
        const sourceContainer = sourceData.container as ContentContainerRef | undefined;
        const overContainer = overData?.container as ContentContainerRef | undefined;

        if (
          sourceContainer?.kind === "apartado" &&
          overContainer?.kind === "apartado" &&
          sourceContainer.apartadoId === overContainer.apartadoId
        ) {
          const apartado = subBlocksById.get(sourceContainer.apartadoId);
          if (apartado) {
            const apartadoLayout = resolveContentLayout(apartado);
            const apartadoColumnToRowId = buildColumnToRowId(apartadoLayout.rows);

            // Determine the move target within the apartado's layout
            const overColumnId = overDomainColumnId ?? (overData?.columnId as string | undefined);

            // Case 1: Drop on column zone (left/right) within same apartado
            if (overColumnId && isScopedContentDropId(String(over.id))) {
              const targetRowId = apartadoColumnToRowId.get(overColumnId);
              if (targetRowId) {
                const placement = (overData?.placement as string) === "left" || String(over.id).endsWith("::left")
                  ? "before-column"
                  : "after-column";
                const descriptor: ContentLayoutMoveDescriptor = {
                  sourceColumnId,
                  targetRowId,
                  targetColumnId: overColumnId,
                  placement,
                };
                const result = moveContentLayout(apartadoLayout, descriptor);
                if (result.changed) {
                  onApartadoContentLayoutChange(sourceContainer.apartadoId, result.layout);
                }
                return;
              }
            }

            // Case 2: Drop on row below within same apartado
            const overRowId = overData?.rowId as string | undefined;
            if (overRowId && isScopedContentRowDropId(String(over.id))) {
              const descriptor: ContentLayoutMoveDescriptor = {
                sourceColumnId,
                targetRowId: overRowId,
                placement: "new-row-after",
              };
              const result = moveContentLayout(apartadoLayout, descriptor);
              if (result.changed) {
                onApartadoContentLayoutChange(sourceContainer.apartadoId, result.layout);
              }
              return;
            }

            // Case 3: Direct column targeting within same apartado
            if (overColumnId) {
              const targetRowId = apartadoColumnToRowId.get(overColumnId);
              if (targetRowId) {
                const currentRow = apartadoLayout.rows.find((r) => r.id === targetRowId);
                if (currentRow) {
                  const sourceIdx = currentRow.columns.findIndex((c) => c.id === sourceColumnId);
                  const targetIdx = currentRow.columns.findIndex((c) => c.id === overColumnId);
                  if (sourceIdx >= 0 && targetIdx >= 0) {
                    const placement = sourceIdx < targetIdx ? "after-column" : "before-column";
                    const descriptor: ContentLayoutMoveDescriptor = {
                      sourceColumnId,
                      targetRowId,
                      targetColumnId: overColumnId,
                      placement,
                    };
                    const result = moveContentLayout(apartadoLayout, descriptor);
                    if (result.changed) {
                      onApartadoContentLayoutChange(sourceContainer.apartadoId, result.layout);
                    }
                    return;
                  }
                }
              }
            }

            // Case 4: Drop on apartado inside zone (new row)
            if (overData?.kind === "apartado-inside") {
              const descriptor: ContentLayoutMoveDescriptor = {
                sourceColumnId,
                targetRowId: apartadoLayout.rows[apartadoLayout.rows.length - 1]?.id ?? "",
                placement: "new-row-after",
              };
              const result = moveContentLayout(apartadoLayout, descriptor);
              if (result.changed) {
                onApartadoContentLayoutChange(sourceContainer.apartadoId, result.layout);
              }
              return;
            }
          }
        }
      }

      /* ---- Structural BEFORE/AFTER drop zones (same-container content → boundary) ---- */
      const bfRowZone = parseBfRowDropZoneId(String(over.id));
      if (bfRowZone) {
        if (!blockFlowV2) return;
        const result = moveContentColumnToBlockFlowBoundary(
          resolvedLayout,
          blockFlowV2,
          {
            sourceColumnId,
            targetStructuralRowId: bfRowZone.rowId,
            placement: bfRowZone.placement,
          },
        );
        if (result.changed) {
          onContentLayoutChange(result.contentLayout);
          if (onBlockFlowChange) {
            onBlockFlowChange(result.blockFlow);
          }
        }
        return;
      }

      /* ---- Helper: perform dual writeback after a successful content move ---- */
      const applyContentMove = (
        result: { layout: ContentLayout; changed: boolean },
        oldRowIds: Set<string>,
        newFlow: BlockFlowV2 | undefined,
        insertDescriptor?: ContentRowInsertDescriptor,
      ) => {
        if (!result.changed) return;

        // Detect new and removed rows by diffing old vs new
        const newRowIds = new Set(result.layout.rows.map((r) => r.id));
        const removedRowIds: string[] = [];
        for (const id of oldRowIds) {
          if (!newRowIds.has(id)) removedRowIds.push(id);
        }

        // Start from current BlockFlowV2 (or empty)
        let flow = newFlow ?? { version: 2 as const, rows: [] };

        // Remove stale content-row references for disappeared rows
        if (removedRowIds.length > 0) {
          flow = removeContentRowsFromBlockFlowV2(flow, newRowIds);
        }

        // Insert new structural row if applicable
        if (insertDescriptor) {
          const insertResult = insertContentRowIntoBlockFlowV2(flow, insertDescriptor);
          if (insertResult.changed) {
            flow = insertResult.flow;
          }
        }

        // Fire both updates atomically
        onContentLayoutChange(result.layout);
        if (onBlockFlowChange) {
          onBlockFlowChange(flow);
        }
      };

      /* ---- Column zone drop (left/right) — check overData for domain columnId ---- */
      const overColumnId = overDomainColumnId ?? (overData?.columnId as string | undefined);
      if (overColumnId && isScopedContentDropId(String(over.id))) {
        const targetRowId = columnToRowId.get(overColumnId);
        if (!targetRowId) return;
        // Determine placement from overData or parse from scoped ID
        const placement = (overData?.placement as string) === "left" || String(over.id).endsWith("::left")
          ? "before-column"
          : "after-column";
        const descriptor: ContentLayoutMoveDescriptor = {
          sourceColumnId,
          targetRowId,
          targetColumnId: overColumnId,
          placement,
        };

        const oldRowIds = new Set(resolvedLayout.rows.map((r) => r.id));
        const result = moveContentLayout(resolvedLayout, descriptor);
        applyContentMove(result, oldRowIds, blockFlowV2);
        return;
      }

      /* ---- Also handle legacy unprefixed v2drop- zones ---- */
      const parsedZone = parseV2DropZoneId(String(over.id));
      if (parsedZone) {
        const targetRowId = columnToRowId.get(parsedZone.columnId);
        if (!targetRowId) return;
        const placement = parsedZone.intent === "left" ? "before-column" : "after-column";
        const descriptor: ContentLayoutMoveDescriptor = {
          sourceColumnId,
          targetRowId,
          targetColumnId: parsedZone.columnId,
          placement,
        };
        const oldRowIds = new Set(resolvedLayout.rows.map((r) => r.id));
        const result = moveContentLayout(resolvedLayout, descriptor);
        applyContentMove(result, oldRowIds, blockFlowV2);
        return;
      }

      /* ---- Row below drop (new-row-after) — check overData for domain rowId ---- */
      const overRowId = (overData?.rowId as string | undefined);
      if (overRowId && isScopedContentRowDropId(String(over.id))) {
        const oldRowIds = new Set(resolvedLayout.rows.map((r) => r.id));
        const descriptor: ContentLayoutMoveDescriptor = {
          sourceColumnId,
          targetRowId: overRowId,
          placement: "new-row-after",
        };
        const result = moveContentLayout(resolvedLayout, descriptor);

        let newContentRowId: string | undefined;
        if (result.changed) {
          const newRowIds = new Set(result.layout.rows.map((r) => r.id));
          for (const id of newRowIds) {
            if (!oldRowIds.has(id)) {
              newContentRowId = id;
              break;
            }
          }
        }

        applyContentMove(
          result,
          oldRowIds,
          blockFlowV2,
          newContentRowId
            ? { newContentRowId, anchorContentRowId: overRowId, placement: "after" }
            : undefined,
        );
        return;
      }

      /* ---- Also handle legacy unprefixed v2row- zones ---- */
      const belowRowId = parseV2RowBelowZone(String(over.id));
      if (belowRowId) {
        const oldRowIds = new Set(resolvedLayout.rows.map((r) => r.id));
        const descriptor: ContentLayoutMoveDescriptor = {
          sourceColumnId,
          targetRowId: belowRowId,
          placement: "new-row-after",
        };
        const result = moveContentLayout(resolvedLayout, descriptor);

        let newContentRowId: string | undefined;
        if (result.changed) {
          const newRowIds = new Set(result.layout.rows.map((r) => r.id));
          for (const id of newRowIds) {
            if (!oldRowIds.has(id)) {
              newContentRowId = id;
              break;
            }
          }
        }

        applyContentMove(
          result,
          oldRowIds,
          blockFlowV2,
          newContentRowId
            ? { newContentRowId, anchorContentRowId: belowRowId, placement: "after" }
            : undefined,
        );
        return;
      }

      /* ---- Direct column targeting (same-row reorder or cross-row move) ---- */
      // For raw sortable drops, extract domain column ID from over data or scoped ID
      const targetColumnId = overDomainColumnId ?? String(over.id);
      const targetRowId = columnToRowId.get(targetColumnId);
      if (!targetRowId) return;
      const sourceRowId = columnToRowId.get(sourceColumnId);
      const isSameRow = sourceRowId === targetRowId;

      if (isSameRow) {
        const currentRow = resolvedLayout.rows.find((r) => r.id === targetRowId);
        if (!currentRow) return;
        const sourceIdx = currentRow.columns.findIndex((c) => c.id === sourceColumnId);
        const targetIdx = currentRow.columns.findIndex((c) => c.id === targetColumnId);
        if (sourceIdx < 0 || targetIdx < 0) return;
        const placement = sourceIdx < targetIdx ? "after-column" : "before-column";
        const descriptor: ContentLayoutMoveDescriptor = {
          sourceColumnId,
          targetRowId,
          targetColumnId,
          placement,
        };
        const oldRowIds = new Set(resolvedLayout.rows.map((r) => r.id));
        const result = moveContentLayout(resolvedLayout, descriptor);
        applyContentMove(result, oldRowIds, blockFlowV2);
      } else {
        const destColCount = getColumnCount(resolvedLayout.rows, targetRowId);
        if (destColCount >= CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW) return;
        const descriptor: ContentLayoutMoveDescriptor = {
          sourceColumnId,
          targetRowId,
          targetColumnId,
          placement: "before-column",
        };
        const oldRowIds = new Set(resolvedLayout.rows.map((r) => r.id));
        const result = moveContentLayout(resolvedLayout, descriptor);
        applyContentMove(result, oldRowIds, blockFlowV2);
      }
    },
    [resolvedLayout, columnToRowId, onContentLayoutChange, onBlockFlowChange, blockFlowV2],
  );

  const handleApartadoDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeId = String(active.id);
      setActiveApartadoId(null);
      setActiveTarget(null);

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

  const dndId = useMemo(
    () => `v2-block-flow-${block.id}`,
    [block.id],
  );

  const activeItem = activeColumnId ? columnItemRef.get(activeColumnId) ?? null : null;

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
  if (structuralRows.length === 0 && resolvedLayout.rows.length === 0) return null;

  const content = (
    <div className={`flex flex-col gap-y-1 ${className ?? ""}`}>
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
                rowId={structuralRow.id}
                activeApartadoId={activeApartadoId}
                activeColumnId={activeColumnId}
                activeTarget={activeTarget}
                containerRef={{ kind: "block", blockId: block.id }}
              >
                <V2RowDropTarget
                  rowId={firstItem.rowId}
                  activeId={activeColumnId}
                  activeTarget={activeTarget}
                  containerRef={{ kind: "block", blockId: block.id }}
                >
                  <V2RowContent
                    row={row}
                    rowIndex={0}
                    activeColumnId={activeColumnId}
                    activeTarget={activeTarget}
                    renderItem={renderItem}
                    disabled={readOnly || !onContentLayoutChange}
                    containerRef={{ kind: "block", blockId: block.id }}
                  />
                </V2RowDropTarget>
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
                rowId={structuralRow.id}
                activeApartadoId={activeApartadoId}
                activeColumnId={activeColumnId}
                activeTarget={activeTarget}
                containerRef={{ kind: "block", blockId: block.id }}
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
                rowId={structuralRow.id}
                activeApartadoId={activeApartadoId}
                activeColumnId={activeColumnId}
                activeTarget={activeTarget}
                containerRef={{ kind: "block", blockId: block.id }}
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

  if (!onContentLayoutChange && !onBlockFlowChange) return content;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={{ canScroll: editorCanScroll }}
      onDragStart={({ active }: DragStartEvent) => {
        const activeId = String(active.id);
        if (apartadoIdSet.has(activeId)) {
          setActiveApartadoId(activeId);
        } else {
          setActiveColumnId(activeId);
        }
      }}
      onDragMove={handleDragMove}
      onDragEnd={(event: DragEndEvent) => {
        const activeId = String(event.active.id);

        // Handle apartado structural drag
        if (apartadoIdSet.has(activeId)) {
          handleApartadoDragEnd(event);
          return;
        }

        // Handle content column drag (existing logic)
        handleContentDragEnd(event);
        setActiveColumnId(null);
      }}
      onDragCancel={() => {
        setActiveColumnId(null);
        setActiveApartadoId(null);
        setActiveTarget(null);
      }}
    >
      {content}
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <ContentDragPreview item={{ ...activeItem, span: 12 }} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
