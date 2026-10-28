"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type {
  Concept,
  ContentRowTagStyle,
  ContentLayoutItemRef,
  ContentLayout,
  ImageContent,
  TableContent,
} from "../../model";
import { resolveContentLayout, setContentRowTagStyle } from "../../services/content-layout";
import {
  planContentDropSlots,
  type ContentRowSlotPlan,
} from "../../services/content-drop";
import {
  moveContentLayout,
  type ContentLayoutMoveDescriptor,
} from "../../services/content-layout-v2-operations";
import { ConceptEditorRow } from "./concept-editor";
import { ImageEditorItem } from "./image-editor";
import { TableEditorItem } from "./table-editor";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { findBoundarySource, findBoundaryTable, getTerrenoElementKind } from "../../sections/terreno";
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
  type DragOverEvent,
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
  /** An Apartado passes its own: "Medidas y colindancias" is told by them. */
  id?: string;
  title?: string;
  concepts: Concept[];
  images: ImageContent[];
  tables: TableContent[];
  contentLayout?: ContentLayout;
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
  // "Linderos y colindancias según" prints under the table of measures: it is edited there, not among the concepts.
  const boundaries = useMemo(() => {
    if (container.id === undefined || container.title === undefined) return null;
    if (getTerrenoElementKind({ id: container.id, title: container.title }) !== "boundaries") return null;
    const table = findBoundaryTable(container);
    return table ? { tableId: table.id, source: findBoundarySource(container) } : null;
  }, [container]);
  const resolvedLayout = useMemo(() => {
    const sourceId = boundaries?.source?.id;
    return resolveContentLayout(sourceId ? { ...container, concepts: container.concepts.filter((concept) => concept.id !== sourceId) } : container);
  }, [boundaries, container]);
  const tableFooter = useMemo(() => (boundaries ? {
    tableId: boundaries.tableId,
    node: <BoundarySourceField source={boundaries.source} onUpdate={conceptCallbacks.onUpdate} readOnly={readOnly} />,
  } : undefined), [boundaries, conceptCallbacks.onUpdate, readOnly]);

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
  // onDragOver, not onDragMove: a move reports the target of the previous
  // move, so the highlight could differ from where the drop lands.
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
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
          placement: overData?.placement === "above" ? "new-row-before" : "new-row-after",
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

  // In external mode, use parent-provided DnD state for visual indicators.
  // In standalone mode, use internal state.
  const effectiveActiveColumnId = dndContextMode === "external" ? (externalActiveColumnId ?? null) : activeColumnId;
  const effectiveActiveTarget = dndContextMode === "external" ? (externalActiveTarget ?? null) : activeTarget;

  /* ---- Drop slots offered while something is dragged ---- */
  const slotPlan = useMemo(() => {
    if (!containerRef || effectiveActiveColumnId === null) return null;
    // The dragged item is "home" here when the active ID is one of this container's columns.
    let dragged: ContentLayoutItemRef | null = null;
    for (const row of resolvedLayout.rows) {
      for (const col of row.columns) {
        if (buildContentColumnDndId(containerRef, col.id) === effectiveActiveColumnId) {
          dragged = col.items[0] ?? null;
        }
      }
    }
    const plan = planContentDropSlots(
      resolvedLayout,
      dragged ? { itemType: dragged.type, itemId: dragged.id } : null,
    );
    return new Map(plan.map((rowPlan) => [rowPlan.rowId, rowPlan]));
  }, [containerRef, effectiveActiveColumnId, resolvedLayout]);

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
          tableFooter,
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
      tableFooter,
    ],
  );

  if (resolvedLayout.rows.length === 0) return null;

  const content = (
    <div className={`flex flex-col gap-y-1 ${className ?? ""}`}>
      {resolvedLayout.rows.map((row, rowIndex) => (
        <V2RowDropTarget
          key={row.id}
          rowId={row.id}
          activeId={effectiveActiveColumnId}
          activeTarget={effectiveActiveTarget}
          containerRef={containerRef}
          above={rowIndex === 0 ? slotPlan?.get(row.id)?.above ?? "open" : undefined}
          below={slotPlan?.get(row.id)?.below}
        >
          <V2RowContent
            row={row}
            rowIndex={rowIndex}
            activeColumnId={effectiveActiveColumnId}
            activeTarget={effectiveActiveTarget}
            renderItem={renderItem}
            disabled={readOnly || !onContentLayoutChange}
            containerRef={containerRef}
            slots={slotPlan?.get(row.id)?.columns}
            onTagStyleChange={onContentLayoutChange ? (rowId, tagStyle) => onContentLayoutChange(setContentRowTagStyle(resolvedLayout, rowId, tagStyle)) : undefined}
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
      onDragOver={handleDragOver}
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
          <ContentDragPreview item={activeItem} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported: row content with per-row SortableContext                 */
/* ------------------------------------------------------------------ */

/**
 * Concepts side by side print as data labels or as columns: the choice shows
 * over a row that holds only concepts, two or three of them.
 */
function RowTagStyleControl({ value, disabled, onChange }: { value: ContentRowTagStyle | undefined; disabled: boolean; onChange: (next: ContentRowTagStyle | undefined) => void }) {
  const options: Array<{ value: ContentRowTagStyle | undefined; label: string }> = [
    { value: undefined, label: "Columnas" },
    { value: "white", label: "Etiquetas, fondo blanco" },
    { value: "shaded", label: "Etiquetas sombreadas" },
  ];
  return (
    <div className="col-span-12 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground" role="radiogroup" aria-label="Formato de los conceptos del renglón" data-row-tag-control="">
      <span className="mr-1">Renglón:</span>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full border px-2 py-0.5 transition-colors disabled:opacity-50",
            value === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function V2RowContent({
  row,
  activeColumnId,
  activeTarget,
  renderItem,
  disabled,
  containerRef,
  slots,
  onTagStyleChange,
}: {
  row: { id: string; tagStyle?: ContentRowTagStyle; columns: { id: string; items: ContentLayoutItemRef[]; conceptPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation }[] };
  /** Prints the concepts of the row as data labels (white or shaded) or as columns again. */
  onTagStyleChange?: (rowId: string, tagStyle: ContentRowTagStyle | undefined) => void;
  rowIndex: number;
  activeColumnId: string | null;
  activeTarget: string | null;
  renderItem: (itemRef: ContentLayoutItemRef, columnId: string, currentPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation) => React.ReactNode;
  disabled: boolean;
  containerRef?: { kind: "block"; blockId: string } | { kind: "apartado"; blockId: string; apartadoId: string };
  /** Side slots of each column, from the container's slot plan (same order as row.columns). */
  slots?: ContentRowSlotPlan["columns"];
}) {
  const span = columnSpan(row.columns.length);

  // Build scoped sortable IDs — unique across containers
  const rowSortableIds = useMemo(
    () => row.columns.map((c) =>
      containerRef ? buildContentColumnDndId(containerRef, c.id) : c.id,
    ),
    [row.columns, containerRef],
  );

  const conceptsSideBySide = row.columns.length > 1 && row.columns.every((column) => column.items[0]?.type === "concept");

  return (
    <SortableContext items={rowSortableIds}>
      <div
        className="content-layout-v2-row"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: "0.5rem",
        }}
        data-row-tags={conceptsSideBySide ? row.tagStyle : undefined}
      >
        {conceptsSideBySide && onTagStyleChange ? (
          <RowTagStyleControl value={row.tagStyle} disabled={disabled} onChange={(next) => onTagStyleChange(row.id, next)} />
        ) : null}
        {row.columns.map((column, columnIndex) => {
          const itemRef = column.items[0] ?? null;
          const columnSlots = slots?.[columnIndex];
          return (
            <div
              key={column.id}
              className="content-layout-v2-cell"
              style={{
                gridColumn: `span ${span}`,
                minWidth: 0,
              }}
            >
              {/* The slots wrap the whole column (handle included) and stay put while it moves. */}
              <V2ColumnDropZones
                columnId={column.id}
                activeId={activeColumnId}
                activeTarget={activeTarget}
                containerRef={containerRef}
                hasPlan={Boolean(slots)}
                left={columnSlots?.left}
                right={columnSlots?.right}
              >
                <V2SortableColumn
                  columnId={column.id}
                  containerRef={containerRef}
                  itemType={itemRef?.type as "concept" | "image" | "table" | undefined}
                  itemId={itemRef?.id}
                  disabled={disabled}
                  data={{ rowId: row.id }}
                >
                  {itemRef ? renderItem(itemRef, column.id, column.conceptPresentation) : null}
                </V2SortableColumn>
              </V2ColumnDropZones>
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
  tableFooter,
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
  /** What a table prints with it and is edited under its grid. */
  tableFooter?: { tableId: string; node: ReactNode };
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
        footer={tableFooter?.tableId === table.id ? tableFooter.node : undefined}
      />
    );
  }

  return null;
}

/**
 * "Linderos y colindancias según: …" under the table of measures, where it
 * prints: its title and its text are those of the Apartado's concept.
 */
function BoundarySourceField({ source, onUpdate, readOnly }: {
  source: Concept | undefined;
  onUpdate: EditableConceptCallbacks["onUpdate"];
  readOnly: boolean;
}) {
  if (!source) {
    return (
      <p className="mt-3 text-[11px] text-muted-foreground">
        Para imprimir bajo la tabla el origen de los linderos, agrega a este apartado un concepto titulado «Linderos y colindancias según».
      </p>
    );
  }
  return (
    <div className="mt-3 grid gap-2 rounded-md border border-dashed bg-background/60 p-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]" data-boundary-source="">
      <p className="text-[11px] font-medium text-muted-foreground sm:col-span-2">Se imprime bajo la tabla:</p>
      <Input
        aria-label="Título del texto bajo la tabla"
        className="h-8 text-sm font-semibold"
        disabled={readOnly}
        value={source.label}
        onChange={(event) => onUpdate(source.id, { label: event.target.value })}
      />
      <Textarea
        aria-label="Origen de los linderos y colindancias"
        className="min-h-8 py-1.5 text-sm"
        disabled={readOnly}
        rows={1}
        placeholder="Escritura, título de propiedad, plano…"
        value={source.value}
        onChange={(event) => onUpdate(source.id, { value: event.target.value })}
      />
    </div>
  );
}
