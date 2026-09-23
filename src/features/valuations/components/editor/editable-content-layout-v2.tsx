"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  Concept,
  ContentLayoutItemRef,
  ContentLayoutPersisted,
  ContentLayout,
  ImageContent,
  TableContent,
} from "../../model";
import { resolveContentLayout } from "../../services/content-layout";
import {
  moveContentLayout,
  type ContentLayoutMoveDescriptor,
} from "../../services/content-layout-v2-operations";
import { ConceptEditorRow } from "./concept-editor";
import { ImageEditorItem } from "./image-editor";
import { TableEditorItem } from "./table-editor";
import type { ExistingConceptRelationMode } from "../../concept-links";
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
import { SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { V2SortableColumn } from "./content-layout-v2-sortable-column";
import {
  V2ColumnDropZones,
  V2RowDropTarget,
  parseV2DropZoneId,
  parseV2RowBelowZone,
} from "./content-layout-v2-drop-target";
import { buildContentColumnDndId } from "./content-dnd-ids";
import { ContentDragPreview } from "./content-layout-drag-preview";
import { CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW } from "../../services/content-layout";

/* ------------------------------------------------------------------ */
/*  Generic container type                                            */
/* ------------------------------------------------------------------ */

type EditableContentContainer = {
  concepts: Concept[];
  images: ImageContent[];
  tables: TableContent[];
  contentLayout?: ContentLayoutPersisted;
};

/* ------------------------------------------------------------------ */
/*  Callback types                                                    */
/* ------------------------------------------------------------------ */

export type EditableConceptCallbacks = {
  onRemove: (conceptId: string) => void;
  onUpdate: (conceptId: string, patch: Partial<Concept>) => void;
  onUpdateEverywhere?: (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => void;
  onChangeRelation?: (conceptId: string, mode: ExistingConceptRelationMode) => void;
  onUnlink?: (conceptId: string) => void;
  onColumnPresentationChange?: (columnId: string, presentation: import("@/features/valuations/services/concept-presentation").ConceptPresentation | undefined) => void;
};

export type EditableImageCallbacks = {
  onRemove: (imageId: string) => void;
  onUpdate: (imageId: string, patch: Partial<ImageContent>) => void;
};

export type EditableTableCallbacks = {
  onAddColumn: (tableId: string) => void;
  onAddRow: (tableId: string) => void;
  onRemove: (tableId: string) => void;
  onUpdate: (tableId: string, updater: (table: TableContent) => TableContent) => void;
};

/* ------------------------------------------------------------------ */
/*  Component props                                                   */
/* ------------------------------------------------------------------ */

export type EditableContentLayoutProps = {
  container: EditableContentContainer;
  allConcepts: Concept[];
  allContainers: EditableContentContainer[];
  conceptCallbacks: EditableConceptCallbacks;
  imageCallbacks: EditableImageCallbacks;
  tableCallbacks: EditableTableCallbacks;
  readOnly: boolean;
  enableLayoutControls?: boolean;
  layout?: "default" | "caratulaGrid";
  requireTitle?: boolean;
  showTerrenoLengthHint?: boolean;
  className?: string;
  /** Called when DnD produces a new layout. */
  onContentLayoutChange?: (nextLayout: ContentLayout) => void;
  /**
   * DnD context ownership mode.
   * - "standalone" (default): creates its own DndContext
   * - "external": renders without DndContext, registers sortables/droppables into the nearest parent DndContext
   */
  dndContextMode?: "standalone" | "external";
  /**
   * Container reference for typed drag metadata.
   * When provided, V2SortableColumn will attach container info to active.data.current.
   */
  containerRef?: { kind: "block"; blockId: string } | { kind: "apartado"; blockId: string; apartadoId: string };
  /**
   * External DnD state: the currently dragged column's scoped ID.
   * Required when dndContextMode="external" so inner drop zones can show indicators.
   */
  externalActiveColumnId?: string | null;
  /**
   * External DnD state: the current over target's ID.
   * Required when dndContextMode="external" so inner drop zones can show indicators.
   */
  externalActiveTarget?: string | null;
};

/* ------------------------------------------------------------------ */
/*  Collision detection: pointerWithin + semantic priority + fallback  */
/* ------------------------------------------------------------------ */

/**
 * Is the droppable ID a semantic V2 drop target?
 * Semantic: v2drop-* (column left/right) or v2row-*::below (row below).
 */
function isSemanticDroppable(id: string): boolean {
  return id.startsWith("v2drop-") || id.startsWith("v2row-");
}

/**
 * Custom collision strategy for V2 content layout DnD.
 *
 * 1. pointerWithin for explicit directional/row zones — gives precise
 *    edge targeting when pointer coordinates are available.
 * 2. When multiple droppables overlap (e.g. row BELOW zone overlaps
 *    next row's sortable column body), explicit semantic targets
 *    (v2drop-*, v2row-*) win over raw sortable IDs.
 * 3. rectIntersection as fallback when pointerWithin returns nothing.
 */
const v2CollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);

  if (pointerCollisions.length > 0) {
    // When pointerWithin returns multiple overlapping droppables,
    // prefer explicit semantic targets (column zones, row BELOW)
    // over raw sortable container IDs.
    if (pointerCollisions.length > 1) {
      const semanticHits = pointerCollisions.filter((c) => isSemanticDroppable(String(c.id)));
      if (semanticHits.length > 0) {
        return semanticHits;
      }
    }
    return pointerCollisions;
  }

  return rectIntersection(args);
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Find which row a column belongs to. */
function buildColumnToRowId(rows: { id: string; columns: { id: string }[] }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    for (const col of row.columns) {
      map.set(col.id, row.id);
    }
  }
  return map;
}

/** Get column count for a row. */
function getColumnCount(rows: { id: string; columns: { id: string }[] }[], rowId: string): number {
  const row = rows.find((r) => r.id === rowId);
  return row ? row.columns.length : 0;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function EditableContentLayout({
  container,
  allConcepts,
  allContainers,
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
  dndContextMode = "standalone",
  containerRef,
  externalActiveColumnId,
  externalActiveTarget,
}: EditableContentLayoutProps) {
  const resolvedLayout = useMemo(
    () => resolveContentLayout(container),
    [container],
  );

  const conceptsById = useMemo(
    () => new Map(container.concepts.map((c) => [c.id, c])),
    [container.concepts],
  );
  const imagesById = useMemo(
    () => new Map(container.images.map((i) => [i.id, i])),
    [container.images],
  );
  const tablesById = useMemo(
    () => new Map(container.tables.map((t) => [t.id, t])),
    [container.tables],
  );
  const allContainerConcepts = useMemo(
    () => allContainers.flatMap((c) => c.concepts),
    [allContainers],
  );

  /* ---- DnD state ---- */
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  /** The single source of truth for the active semantic drop target. */
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

  /* ---- Single source of truth: dnd-kit collision → active target ---- */
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const overId = event.over ? String(event.over.id) : null;
      setActiveTarget(overId);
    },
    [],
  );

  /* ---- Drag end: resolve intent and delegate to pure engine ---- */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTarget(null);

      if (!over || !onContentLayoutChange) return;

      // Extract DOMAIN column IDs from metadata (not scoped DnD IDs)
      const activeData = active.data.current as Record<string, unknown> | undefined;
      const overData = over.data.current as Record<string, unknown> | undefined;
      const sourceColumnId = (activeData?.columnId as string) ?? String(active.id);
      const overColumnIdFromData = (overData?.columnId as string | undefined);

      /* ---- Column zone drop (left/right) ---- */
      // Check overData for domain columnId first, then try legacy parsing
      if (overColumnIdFromData && String(over.id).startsWith("drop-col::")) {
        const targetRowId = columnToRowId.get(overColumnIdFromData);
        if (!targetRowId) return;
        const placement = (overData?.placement as string) === "left" || String(over.id).endsWith("::left")
          ? "before-column"
          : "after-column";
        const descriptor: ContentLayoutMoveDescriptor = {
          sourceColumnId,
          targetRowId,
          targetColumnId: overColumnIdFromData,
          placement,
        };
        const result = moveContentLayout(resolvedLayout, descriptor);
        if (result.changed) {
          onContentLayoutChange(result.layout);
        }
        return;
      }

      // Legacy unprefixed v2drop- zones
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
        const result = moveContentLayout(resolvedLayout, descriptor);
        if (result.changed) {
          onContentLayoutChange(result.layout);
        }
        return;
      }

      /* ---- Row below drop ---- */
      const overRowIdFromData = (overData?.rowId as string | undefined);
      if (overRowIdFromData && String(over.id).startsWith("drop-row::")) {
        const descriptor: ContentLayoutMoveDescriptor = {
          sourceColumnId,
          targetRowId: overRowIdFromData,
          placement: "new-row-after",
        };
        const result = moveContentLayout(resolvedLayout, descriptor);
        if (result.changed) {
          onContentLayoutChange(result.layout);
        }
        return;
      }

      // Legacy unprefixed v2row- zones
      const belowRowId = parseV2RowBelowZone(String(over.id));
      if (belowRowId) {
        const descriptor: ContentLayoutMoveDescriptor = {
          sourceColumnId,
          targetRowId: belowRowId,
          placement: "new-row-after",
        };
        const result = moveContentLayout(resolvedLayout, descriptor);
        if (result.changed) {
          onContentLayoutChange(result.layout);
        }
        return;
      }

      /* ---- Sortable column drop (fallback: reorder within row) ---- */
      const targetColumnId = overColumnIdFromData ?? String(over.id);
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
        const result = moveContentLayout(resolvedLayout, descriptor);
        if (result.changed) {
          onContentLayoutChange(result.layout);
        }
      } else {
        const destColCount = getColumnCount(resolvedLayout.rows, targetRowId);
        if (destColCount >= CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW) {
          return;
        }
        const descriptor: ContentLayoutMoveDescriptor = {
          sourceColumnId,
          targetRowId,
          targetColumnId,
          placement: "before-column",
        };
        const result = moveContentLayout(resolvedLayout, descriptor);
        if (result.changed) {
          onContentLayoutChange(result.layout);
        }
      }
    },
    [resolvedLayout, columnToRowId, onContentLayoutChange],
  );

  const dndId = useMemo(
    () => `v2-content-layout-${container.concepts[0]?.id ?? container.images[0]?.id ?? container.tables[0]?.id ?? "empty"}`,
    [container.concepts, container.images, container.tables],
  );

  const activeItem = activeColumnId ? columnItemRef.get(activeColumnId) ?? null : null;

  /* ---- Render callbacks ---- */
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

  if (resolvedLayout.rows.length === 0) return null;

  // In external mode, use parent-provided DnD state for visual indicators.
  // In standalone mode, use internal state.
  const effectiveActiveColumnId = dndContextMode === "external" ? (externalActiveColumnId ?? null) : activeColumnId;
  const effectiveActiveTarget = dndContextMode === "external" ? (externalActiveTarget ?? null) : activeTarget;

  const content = (
    <div className={`flex flex-col gap-y-1 ${className ?? ""}`}>
      {resolvedLayout.rows.map((row, rowIndex) => (
        <V2RowDropTarget
          key={row.id}
          rowId={row.id}
          activeId={effectiveActiveColumnId}
          activeTarget={effectiveActiveTarget}
          containerRef={containerRef}
        >
          <V2RowContent
            row={row}
            rowIndex={rowIndex}
            activeColumnId={effectiveActiveColumnId}
            activeTarget={effectiveActiveTarget}
            renderItem={renderItem}
            disabled={readOnly || !onContentLayoutChange}
            containerRef={containerRef}
          />
        </V2RowDropTarget>
      ))}
    </div>
  );

  // External mode: render without DndContext — registers into parent context
  if (dndContextMode === "external") return content;

  if (!onContentLayoutChange) return content;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={v2CollisionDetection}
      autoScroll={{ canScroll: editorCanScroll }}
      onDragStart={({ active }: DragStartEvent) => setActiveColumnId(String(active.id))}
      onDragMove={handleDragMove}
      onDragEnd={(event: DragEndEvent) => {
        handleDragEnd(event);
        setActiveColumnId(null);
      }}
      onDragCancel={() => {
        setActiveColumnId(null);
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

/* ------------------------------------------------------------------ */
/*  Exported: row content with per-row SortableContext                 */
/* ------------------------------------------------------------------ */

export function V2RowContent({
  row,
  activeColumnId,
  activeTarget,
  renderItem,
  disabled,
  containerRef,
}: {
  row: { id: string; columns: { id: string; items: ContentLayoutItemRef[]; conceptPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation }[] };
  rowIndex: number;
  activeColumnId: string | null;
  activeTarget: string | null;
  renderItem: (itemRef: ContentLayoutItemRef, columnId: string, currentPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation) => React.ReactNode;
  disabled: boolean;
  containerRef?: { kind: "block"; blockId: string } | { kind: "apartado"; blockId: string; apartadoId: string };
}) {
  const span = columnSpan(row.columns.length);

  // Build scoped sortable IDs — unique across containers
  const rowSortableIds = useMemo(
    () => row.columns.map((c) =>
      containerRef ? buildContentColumnDndId(containerRef, c.id) : c.id,
    ),
    [row.columns, containerRef],
  );

  return (
    <SortableContext items={rowSortableIds}>
      <div
        className="content-layout-v2-row"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: "0.5rem",
        }}
      >
        {row.columns.map((column) => {
          const itemRef = column.items[0] ?? null;
          return (
            <div
              key={column.id}
              className="content-layout-v2-cell"
              style={{
                gridColumn: `span ${span}`,
                minWidth: 0,
              }}
            >
              <V2SortableColumn
                columnId={column.id}
                containerRef={containerRef}
                itemType={itemRef?.type as "concept" | "image" | "table" | undefined}
                itemId={itemRef?.id}
                disabled={disabled}
              >
                <V2ColumnDropZones
                  columnId={column.id}
                  activeId={activeColumnId}
                  activeTarget={activeTarget}
                  containerRef={containerRef}
                >
                  {itemRef ? renderItem(itemRef, column.id, column.conceptPresentation) : null}
                </V2ColumnDropZones>
              </V2SortableColumn>
            </div>
          );
        })}
      </div>
    </SortableContext>
  );
}

export function columnSpan(columnCount: number): number {
  if (columnCount <= 1) return 12;
  if (columnCount === 2) return 6;
  return 4;
}

/* ------------------------------------------------------------------ */
/*  Exported: dispatch one item ref to its editor component           */
/* ------------------------------------------------------------------ */

export function renderLayoutItem({
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
}: {
  itemRef: ContentLayoutItemRef;
  columnId?: string;
  currentPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation;
  conceptsById: Map<string, Concept>;
  imagesById: Map<string, ImageContent>;
  tablesById: Map<string, TableContent>;
  allConcepts: Concept[];
  allContainerConcepts: Concept[];
  conceptCallbacks: EditableConceptCallbacks;
  imageCallbacks: EditableImageCallbacks;
  tableCallbacks: EditableTableCallbacks;
  readOnly: boolean;
  enableLayoutControls: boolean;
  layout: "default" | "caratulaGrid";
  requireTitle: boolean;
  showTerrenoLengthHint: boolean;
}) {
  if (itemRef.type === "concept") {
    const concept = conceptsById.get(itemRef.id);
    if (!concept) return null;
    return (
      <ConceptEditorRow
        concept={concept}
        concepts={allContainerConcepts}
        columnId={columnId}
        currentPresentation={currentPresentation}
        dragEnabled={false}
        enableLayoutControls={enableLayoutControls}
        layout={layout}
        onRemove={conceptCallbacks.onRemove}
        onUpdate={conceptCallbacks.onUpdate}
        onUpdateEverywhere={conceptCallbacks.onUpdateEverywhere}
        onChangeRelation={conceptCallbacks.onChangeRelation}
        onUnlink={conceptCallbacks.onUnlink}
        onColumnPresentationChange={conceptCallbacks.onColumnPresentationChange}
        readOnly={readOnly}
        requireTitle={requireTitle}
        showTerrenoLengthHint={showTerrenoLengthHint}
        allConcepts={allConcepts}
      />
    );
  }

  if (itemRef.type === "image") {
    const image = imagesById.get(itemRef.id);
    if (!image) return null;
    return (
      <ImageEditorItem
        image={image}
        onRemove={imageCallbacks.onRemove}
        onUpdate={imageCallbacks.onUpdate}
        readOnly={readOnly}
      />
    );
  }

  if (itemRef.type === "table") {
    const table = tablesById.get(itemRef.id);
    if (!table) return null;
    return (
      <TableEditorItem
        table={table}
        onAddColumn={tableCallbacks.onAddColumn}
        onAddRow={tableCallbacks.onAddRow}
        onRemove={tableCallbacks.onRemove}
        onUpdate={tableCallbacks.onUpdate}
        readOnly={readOnly}
      />
    );
  }

  return null;
}
