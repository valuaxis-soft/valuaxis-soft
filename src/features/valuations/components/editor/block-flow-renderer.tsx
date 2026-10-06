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
  resolveBlockFlowV2,
  moveBlockFlowV2Apartado,
} from "../../services/block-flow";
import {
  applyContentDrop,
  contentDropSourceFromData,
  contentDropTargetFromData,
  findHomeContentRowId,
  planBlockBoundarySlots,
  planContentDropSlots,
  type ContentDropSource,
} from "../../services/content-drop";
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
  parseBfRowDropZoneId,
  parseBfApartadoDropZoneId,
  BfRowDropZones,
  BfApartadoDropZones,
  BfApartadoInsideDropZone,
} from "./content-layout-v2-drop-target";
import {
  pickContentDropSlot,
  type DropSlotCandidate,
  type DropSlotSibling,
} from "./content-drop-collision";
import { V2RowContent, renderLayoutItem } from "./editable-content-layout-v2";
import { ContentDragPreview } from "./content-layout-drag-preview";
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

/** The slot kinds a content drag can land on, and the direction each one is drawn in. */
const CONTENT_SLOT_AXIS: Record<string, DropSlotCandidate["axis"]> = {
  "content-row-target": "row",
  "block-flow-boundary": "row",
  "content-column-target": "column",
  "apartado-inside": "area",
};

/** Identity of the container a droppable belongs to, among the containers of a Block. */
function containerKey(data: Record<string, unknown> | undefined): string {
  const container = data?.container as { kind?: string; apartadoId?: string } | undefined;
  return `${container?.kind}:${container?.apartadoId ?? ""}`;
}

/** Identity of the row a content column sits in, across the containers of a Block. */
function contentRowKey(data: Record<string, unknown> | undefined): string | null {
  if (data?.kind !== "content-column" || typeof data.rowId !== "string") return null;
  return `${containerKey(data)}:${data.rowId}`;
}

/**
 * Collision detection for a content drag: the slot the pointer aims at
 * (see pickContentDropSlot). A "noop" slot — the item's own place — and the
 * item's own column both resolve to no target, so the drop changes nothing.
 */
const detectContentSlotCollision: CollisionDetection = ({
  active,
  droppableContainers,
  droppableRects,
  pointerCoordinates,
}) => {
  if (!pointerCoordinates) return [];
  type Droppable = (typeof droppableContainers)[number];

  const activeData = active.data.current as Record<string, unknown> | undefined;
  const homeRowKey = contentRowKey(activeData);
  const homeContainerKey = containerKey(activeData);
  const candidates: DropSlotCandidate[] = [];
  const containersById = new Map<string, Droppable>();
  const columnSlotIds = new Map<string, string>();
  const rowColumns: Array<{ columnId: string; isHome: boolean; rect: DropSlotCandidate["rect"] }> = [];

  for (const container of droppableContainers) {
    const data = container.data.current as Record<string, unknown> | undefined;
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const id = String(container.id);

    // The columns of the row the item is dragged from, to let it swap places with them.
    if (homeRowKey && contentRowKey(data) === homeRowKey) {
      rowColumns.push({ columnId: String(data?.columnId), isHome: container.id === active.id, rect });
      continue;
    }

    const axis = typeof data?.kind === "string" ? CONTENT_SLOT_AXIS[data.kind] : undefined;
    if (!axis) continue;
    candidates.push({ id, rect, axis });
    containersById.set(id, container);
    if (data?.kind === "content-column-target" && containerKey(data) === homeContainerKey) {
      columnSlotIds.set(`${String(data.columnId)}:${String(data.placement)}`, id);
    }
  }

  // Dropping onto a neighbour of the same row lands on its far side.
  rowColumns.sort((a, b) => a.rect.left - b.rect.left);
  const homeIndex = rowColumns.findIndex((column) => column.isHome);
  const siblings: DropSlotSibling[] = [];
  rowColumns.forEach((column, index) => {
    if (homeIndex < 0 || index === homeIndex) return;
    const next = rowColumns[index + 1];
    const slotId = index < homeIndex
      ? columnSlotIds.get(`${column.columnId}:left`)
      : next
        ? columnSlotIds.get(`${next.columnId}:left`)
        : columnSlotIds.get(`${column.columnId}:right`);
    if (slotId) siblings.push({ rect: column.rect, slotId });
  });

  const slotId = pickContentDropSlot(pointerCoordinates, candidates, droppableRects.get(active.id), siblings);
  const container = slotId ? containersById.get(slotId) : undefined;
  if (!container) return [];
  if ((container.data.current as Record<string, unknown> | undefined)?.noop) return [];
  return [{ id: container.id, data: { droppableContainer: container, value: 0 } }];
};

/**
 * Build a collision detection function that captures the current apartadoIdSet.
 * This closure approach keeps collision detection inside the component
 * where it has access to the apartado set for drag-kind filtering.
 */
function buildCollisionDetection(apartadoIdSet: Set<string>): CollisionDetection {
  return (args) => {
    const activeId = args.active ? String(args.active.id) : null;
    const isApartadoDrag = activeId ? apartadoIdSet.has(activeId) : false;

    // A content item dragged with the pointer aims at the drop slots only.
    if (!isApartadoDrag && args.pointerCoordinates) {
      return detectContentSlotCollision(args);
    }

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

  /* ---- DnD state ---- */
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [activeApartadoId, setActiveApartadoId] = useState<string | null>(null);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  /** The content item being dragged (from any container of this Block). */
  const [activeContent, setActiveContent] = useState<ContentDropSource | null>(null);

  const columnToRowId = useMemo(
    () => buildColumnToRowId(resolvedLayout.rows),
    [resolvedLayout],
  );

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

  /* ---- Content drop: one pure step from (item, slot) to the next Block ---- */
  const handleContentDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTarget(null);
      setActiveContent(null);
      if (!over) return;

      const source = contentDropSourceFromData(active.data.current);
      const target = contentDropTargetFromData(over.data.current);
      if (!source || !target) return;

      const result = applyContentDrop(block, source, target);
      if (!result.changed) return;
      const next = result.block;

      // One update for the whole Block keeps the move a single undo step.
      if (onCrossContainerChange) {
        onCrossContainerChange(next);
        return;
      }

      // Without it, only moves that leave every item in its container can be reported.
      if (next.contentLayout && next.contentLayout !== block.contentLayout) {
        onContentLayoutChange?.(next.contentLayout);
      }
      if (next.blockFlow && next.blockFlow !== block.blockFlow) {
        onBlockFlowChange?.(next.blockFlow);
      }
      for (const apartado of next.apartados) {
        const previous = subBlocksById.get(apartado.id);
        if (apartado.contentLayout && previous && apartado.contentLayout !== previous.contentLayout) {
          onApartadoContentLayoutChange?.(apartado.id, apartado.contentLayout);
        }
      }
    },
    [
      block,
      onContentLayoutChange,
      onBlockFlowChange,
      onApartadoContentLayoutChange,
      onCrossContainerChange,
      subBlocksById,
    ],
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

  const activeItem: ContentLayoutItemRef | null = activeContent
    ? { type: activeContent.itemType, id: activeContent.itemId }
    : null;

  /* ---- Drop slots offered while a content item is dragged ---- */
  const draggedInBlock = activeContent?.container.kind === "block" ? activeContent : null;
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
          setActiveContent(contentDropSourceFromData(active.data.current));
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
        setActiveContent(null);
        setActiveApartadoId(null);
        setActiveTarget(null);
      }}
    >
      {content}
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <ContentDragPreview item={activeItem} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
