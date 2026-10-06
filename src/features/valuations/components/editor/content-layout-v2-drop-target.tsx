"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { ContentDropSlotState } from "../../services/content-drop";
import { buildContentColumnDndId, type ContentContainerRef } from "./content-dnd-ids";

/* ------------------------------------------------------------------ */
/*  Scoped drop zone ID builder                                        */
/* ------------------------------------------------------------------ */

/**
 * Build a scoped column drop zone ID using container ref.
 * Format: drop-col::{kind}::{ids}::{columnId}::{intent}
 */
function buildScopedDropColId(
  containerRef: ContentContainerRef,
  columnId: string,
  intent: "left" | "right",
): string {
  if (containerRef.kind === "block") {
    return `drop-col::block::${containerRef.blockId}::${columnId}::${intent}`;
  }
  return `drop-col::apartado::${containerRef.blockId}::${containerRef.apartadoId}::${columnId}::${intent}`;
}

/**
 * Build a scoped row drop zone ID using container ref.
 * Format: drop-row::{kind}::{ids}::{rowId}::{above|below}
 */
function buildScopedDropRowId(
  containerRef: ContentContainerRef,
  rowId: string,
  placement: "above" | "below",
): string {
  if (containerRef.kind === "block") {
    return `drop-row::block::${containerRef.blockId}::${rowId}::${placement}`;
  }
  return `drop-row::apartado::${containerRef.blockId}::${containerRef.apartadoId}::${rowId}::${placement}`;
}

/* ------------------------------------------------------------------ */
/*  V2 drop zone ID convention                                         */
/* ------------------------------------------------------------------ */

const V2_DROP_PREFIX = "v2drop-";
const V2_DROP_SEP = "::";

/**
 * Semantic drop intent for V2 column zones.
 *
 * COLUMN targets expose only left and right.
 * BELOW exists only at ROW level via V2RowDropTarget.
 */
export type V2ColumnDropIntent = "left" | "right";

/**
 * Encoded data for a V2 column drop zone.
 */
export type V2DropZoneData = {
  columnId: string;
  intent: V2ColumnDropIntent;
};

/**
 * Build a droppable ID for a V2 column directional zone.
 * Convention: `v2drop-{columnId}::{intent}`
 */
export function buildV2DropZoneId(data: V2DropZoneData): string {
  return `${V2_DROP_PREFIX}${data.columnId}${V2_DROP_SEP}${data.intent}`;
}

/**
 * Parse a droppable ID to extract V2 column drop zone data.
 * Returns null if the ID doesn't match the column drop zone pattern.
 */
export function parseV2DropZoneId(id: string): V2DropZoneData | null {
  if (!id.startsWith(V2_DROP_PREFIX)) return null;
  const rest = id.slice(V2_DROP_PREFIX.length);
  const sepIdx = rest.indexOf(V2_DROP_SEP);
  if (sepIdx < 0) return null;
  const columnId = rest.slice(0, sepIdx);
  const intent = rest.slice(sepIdx + V2_DROP_SEP.length);
  if (intent !== "left" && intent !== "right") return null;
  return { columnId, intent };
}

/**
 * Check if a droppable ID is a row-level below zone.
 * Convention: `v2row-{rowId}::below`
 */
export function isV2RowBelowZone(id: string): boolean {
  return id.startsWith("v2row-") && id.endsWith("::below");
}

/**
 * Extract the row ID from a row-level below zone ID.
 */
export function parseV2RowBelowZone(id: string): string | null {
  if (!isV2RowBelowZone(id)) return null;
  return id.slice("v2row-".length, id.length - "::below".length);
}

/* ------------------------------------------------------------------ */
/*  BlockFlow V2 structural drop zone ID convention                    */
/* ------------------------------------------------------------------ */

const BF_ROW_PREFIX = "bfrow-";
const BF_APARTADO_PREFIX = "bfapartado-";
const BF_SEP = "::";

/**
 * Build a structural row before/after drop zone ID.
 * Convention: `bfrow-{structuralRowId}::{before|after}`
 */
export function buildBfRowDropZoneId(data: { rowId: string; placement: "before" | "after" }): string {
  return `${BF_ROW_PREFIX}${data.rowId}${BF_SEP}${data.placement}`;
}

/**
 * Parse a structural row drop zone ID.
 */
export function parseBfRowDropZoneId(id: string): { rowId: string; placement: "before" | "after" } | null {
  if (!id.startsWith(BF_ROW_PREFIX)) return null;
  const rest = id.slice(BF_ROW_PREFIX.length);
  const sepIdx = rest.indexOf(BF_SEP);
  if (sepIdx < 0) return null;
  const rowId = rest.slice(0, sepIdx);
  const placement = rest.slice(sepIdx + BF_SEP.length);
  if (placement !== "before" && placement !== "after") return null;
  return { rowId, placement };
}

/**
 * Build an apartado left/right drop zone ID.
 * Convention: `bfapartado-{apartadoId}::{left|right}`
 */
export function buildBfApartadoDropZoneId(data: { apartadoId: string; placement: "left" | "right" }): string {
  return `${BF_APARTADO_PREFIX}${data.apartadoId}${BF_SEP}${data.placement}`;
}

/**
 * Parse an apartado drop zone ID.
 */
export function parseBfApartadoDropZoneId(id: string): { apartadoId: string; placement: "left" | "right" } | null {
  if (!id.startsWith(BF_APARTADO_PREFIX)) return null;
  const rest = id.slice(BF_APARTADO_PREFIX.length);
  const sepIdx = rest.indexOf(BF_SEP);
  if (sepIdx < 0) return null;
  const apartadoId = rest.slice(0, sepIdx);
  const placement = rest.slice(sepIdx + BF_SEP.length);
  if (placement !== "left" && placement !== "right") return null;
  return { apartadoId, placement };
}

/* ------------------------------------------------------------------ */
/*  Drop slots                                                         */
/* ------------------------------------------------------------------ */

/**
 * A drop slot is drawn as a dashed line: horizontal between rows, vertical
 * between columns. While a content item is dragged every open slot is
 * visible, so the user sees all the places it can go; the one the drop would
 * land on is highlighted.
 *
 * The hit area is the outer element (larger than the line) and never takes
 * pointer events: the drag library works from its rectangle.
 */
function slotLineClassName(isHovered: boolean) {
  return cn(
    "absolute rounded-full border border-dashed transition-colors duration-100",
    isHovered ? "border-primary bg-primary/30" : "border-primary/40 bg-primary/5",
  );
}

/** Horizontal slot on the top or bottom edge of a row, centered on the gap to the next row. */
function RowDropSlot({
  id,
  edge,
  state,
  isDragging,
  isHovered,
  data,
  marker,
}: {
  id: string;
  edge: "top" | "bottom";
  state: ContentDropSlotState;
  isDragging: boolean;
  isHovered: boolean;
  data?: Record<string, unknown>;
  /** data-* attribute identifying the slot. */
  marker: Record<string, string>;
}) {
  const { setNodeRef } = useDroppable({
    id,
    disabled: !isDragging || state === "closed",
    data: data ? { ...data, noop: state === "noop" } : undefined,
  });
  const isVisible = isDragging && state === "open";

  return (
    <div
      ref={setNodeRef}
      {...marker}
      data-slot-state={isVisible ? (isHovered ? "target" : "open") : undefined}
      className="pointer-events-none absolute inset-x-0 z-20 h-3"
      style={{ [edge]: "-0.5rem" }}
    >
      {isVisible ? (
        <div
          className={cn(
            slotLineClassName(isHovered),
            "inset-x-0 top-1/2 -translate-y-1/2",
            isHovered ? "h-2.5" : "h-1.5",
          )}
        />
      ) : null}
    </div>
  );
}

/** Vertical slot on the left or right edge of a column, centered on the gap to its neighbour. */
function ColumnDropSlot({
  id,
  side,
  state,
  isDragging,
  isHovered,
  data,
}: {
  id: string;
  side: "left" | "right";
  state: ContentDropSlotState;
  isDragging: boolean;
  isHovered: boolean;
  data?: Record<string, unknown>;
}) {
  const { setNodeRef } = useDroppable({
    id,
    disabled: !isDragging || state === "closed",
    data: data ? { ...data, noop: state === "noop" } : undefined,
  });
  const isVisible = isDragging && state === "open";

  return (
    <div
      ref={setNodeRef}
      data-drop-zone={side}
      data-slot-state={isVisible ? (isHovered ? "target" : "open") : undefined}
      className="pointer-events-none absolute inset-y-0 z-20 w-3"
      style={{ [side]: "-0.625rem" }}
    >
      {isVisible ? (
        <div
          className={cn(
            slotLineClassName(isHovered),
            "inset-y-0 left-1/2 -translate-x-1/2",
            isHovered ? "w-2.5" : "w-1.5",
          )}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Row-level drop target                                              */
/* ------------------------------------------------------------------ */

/**
 * Wraps a content row with its new-row slots: one below it and, for the
 * first row of a container, one above it.
 *
 * Uses container-scoped drop zone IDs for uniqueness.
 */
export function V2RowDropTarget({
  rowId,
  activeId,
  activeTarget,
  containerRef,
  above,
  below = "open",
  children,
}: {
  rowId: string;
  activeId: string | null;
  activeTarget: string | null;
  containerRef?: ContentContainerRef;
  /** State of the slot above the row. Omit it for rows that are not the first of their container. */
  above?: ContentDropSlotState;
  below?: ContentDropSlotState;
  children: React.ReactNode;
}) {
  const isDragging = activeId !== null;
  const belowZoneId = containerRef
    ? buildScopedDropRowId(containerRef, rowId, "below")
    : `v2row-${rowId}::below`;
  const aboveZoneId = containerRef ? buildScopedDropRowId(containerRef, rowId, "above") : null;

  return (
    <div className="relative">
      {children}
      {aboveZoneId && above ? (
        <RowDropSlot
          id={aboveZoneId}
          edge="top"
          state={above}
          isDragging={isDragging}
          isHovered={activeTarget === aboveZoneId}
          data={{ kind: "content-row-target", container: containerRef, rowId, placement: "above" }}
          marker={{ "data-row-above": rowId }}
        />
      ) : null}
      <RowDropSlot
        id={belowZoneId}
        edge="bottom"
        state={below}
        isDragging={isDragging}
        isHovered={activeTarget === belowZoneId}
        data={containerRef ? { kind: "content-row-target", container: containerRef, rowId, placement: "below" } : undefined}
        marker={{ "data-row-below": rowId }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Column-level drop zones (left + right only)                        */
/* ------------------------------------------------------------------ */

/**
 * Wraps a sortable column with its side slots.
 * The new-row slots are handled by V2RowDropTarget.
 *
 * Uses container-scoped drop zone IDs to ensure uniqueness across
 * all containers sharing a single DndContext.
 *
 * activeId must be the SCOPED sortable ID (not the domain column ID).
 *
 * `left` / `right` come from the container's slot plan. Without a plan both
 * sides are open, except on the column being dragged.
 */
export function V2ColumnDropZones({
  columnId,
  activeId,
  activeTarget,
  containerRef,
  left,
  right,
  hasPlan = false,
  children,
}: {
  columnId: string;
  activeId: string | null;
  activeTarget: string | null;
  containerRef?: ContentContainerRef;
  left?: ContentDropSlotState;
  right?: ContentDropSlotState;
  /** True when `left` / `right` come from a slot plan (an omitted side then has no slot). */
  hasPlan?: boolean;
  children: React.ReactNode;
}) {
  const isDragging = activeId !== null;

  // Build scoped drop zone IDs — unique across containers
  const leftId = containerRef
    ? buildScopedDropColId(containerRef, columnId, "left")
    : buildV2DropZoneId({ columnId, intent: "left" });
  const rightId = containerRef
    ? buildScopedDropColId(containerRef, columnId, "right")
    : buildV2DropZoneId({ columnId, intent: "right" });

  // Check if the active sortable is THIS column's scoped sortable ID
  const selfSortableId = containerRef
    ? buildContentColumnDndId(containerRef, columnId)
    : columnId;
  const fallbackState: ContentDropSlotState = activeId === selfSortableId ? "closed" : "open";
  const leftState = hasPlan ? left : fallbackState;
  const rightState = hasPlan ? right : fallbackState;

  return (
    <div className="relative">
      {children}
      {leftState ? (
        <ColumnDropSlot
          id={leftId}
          side="left"
          state={leftState}
          isDragging={isDragging}
          isHovered={activeTarget === leftId}
          data={containerRef ? { kind: "content-column-target", container: containerRef, columnId, placement: "left" } : undefined}
        />
      ) : null}
      {rightState ? (
        <ColumnDropSlot
          id={rightId}
          side="right"
          state={rightState}
          isDragging={isDragging}
          isHovered={activeTarget === rightId}
          data={containerRef ? { kind: "content-column-target", container: containerRef, columnId, placement: "right" } : undefined}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BlockFlow V2 structural drop zones                                 */
/* ------------------------------------------------------------------ */

/**
 * Renders before/after drop zones on a structural row (content or apartado).
 *
 * Two kinds of drag use them:
 *  - An Apartado drag: both zones accept it and only the hovered one shows.
 *  - A content drag: the zones are the Block-level new-row slots. `contentBefore`
 *    and `contentAfter` say which ones exist; open ones are visible throughout
 *    the drag, like every other content slot.
 */
export function BfRowDropZones({
  rowId,
  activeApartadoId,
  activeColumnId,
  activeTarget,
  containerRef,
  contentBefore,
  contentAfter,
  children,
}: {
  rowId: string;
  activeApartadoId: string | null;
  activeColumnId: string | null;
  activeTarget: string | null;
  containerRef?: ContentContainerRef;
  /** Content slot before the row (first structural row only). */
  contentBefore?: ContentDropSlotState;
  /** Content slot after the row. */
  contentAfter?: ContentDropSlotState;
  children: React.ReactNode;
}) {
  const isApartadoDrag = activeApartadoId !== null;
  const isContentDrag = activeColumnId !== null;

  const beforeId = buildBfRowDropZoneId({ rowId, placement: "before" });
  const afterId = buildBfRowDropZoneId({ rowId, placement: "after" });

  // An Apartado can go on either side of any row; a content item only where the plan says.
  const beforeState: ContentDropSlotState = isApartadoDrag ? "open" : contentBefore ?? "closed";
  const afterState: ContentDropSlotState = isApartadoDrag ? "open" : contentAfter ?? "closed";

  const { setNodeRef: setBeforeRef } = useDroppable({
    id: beforeId,
    disabled: !(isApartadoDrag || isContentDrag) || beforeState === "closed",
    data: containerRef
      ? { kind: "block-flow-boundary", container: containerRef, structuralRowId: rowId, placement: "before", noop: beforeState === "noop" }
      : undefined,
  });
  const { setNodeRef: setAfterRef } = useDroppable({
    id: afterId,
    disabled: !(isApartadoDrag || isContentDrag) || afterState === "closed",
    data: containerRef
      ? { kind: "block-flow-boundary", container: containerRef, structuralRowId: rowId, placement: "after", noop: afterState === "noop" }
      : undefined,
  });

  const isBeforeHovered = activeTarget === beforeId;
  const isAfterHovered = activeTarget === afterId;
  const showBefore = isBeforeHovered || (isContentDrag && beforeState === "open");
  const showAfter = isAfterHovered || (isContentDrag && afterState === "open");

  return (
    <div className="relative">
      {/* Before zone — top edge */}
      <div
        ref={setBeforeRef}
        data-bf-row-before={rowId}
        data-slot-state={showBefore ? (isBeforeHovered ? "target" : "open") : undefined}
        className="pointer-events-none absolute inset-x-0 z-20 h-3"
        style={{ top: "-0.5rem" }}
      >
        {showBefore ? (
          <div
            className={cn(
              slotLineClassName(isBeforeHovered),
              "inset-x-0 top-1/2 -translate-y-1/2",
              isBeforeHovered ? "h-2.5" : "h-1.5",
            )}
          />
        ) : null}
      </div>
      {children}
      {/* After zone — bottom edge */}
      <div
        ref={setAfterRef}
        data-bf-row-after={rowId}
        data-slot-state={showAfter ? (isAfterHovered ? "target" : "open") : undefined}
        className="pointer-events-none absolute inset-x-0 z-20 h-3"
        style={{ bottom: "-0.5rem" }}
      >
        {showAfter ? (
          <div
            className={cn(
              slotLineClassName(isAfterHovered),
              "inset-x-0 top-1/2 -translate-y-1/2",
              isAfterHovered ? "h-2.5" : "h-1.5",
            )}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders left/right drop zones on an apartado within a structural row.
 * Shows blue indicator when another apartado is being dragged toward
 * a lateral merge position.
 *
 * Only shown when the apartado is in a singleton row (not already paired).
 */
export function BfApartadoDropZones({
  apartadoId,
  isSingleton,
  activeApartadoId,
  activeTarget,
  children,
}: {
  apartadoId: string;
  isSingleton: boolean;
  activeApartadoId: string | null;
  activeTarget: string | null;
  children: React.ReactNode;
}) {
  const isDragging = activeApartadoId !== null;
  const isSelfDragging = activeApartadoId === apartadoId;
  const showZones = isDragging && !isSelfDragging && isSingleton;

  const leftId = buildBfApartadoDropZoneId({ apartadoId, placement: "left" });
  const rightId = buildBfApartadoDropZoneId({ apartadoId, placement: "right" });

  const { setNodeRef: setLeftRef } = useDroppable({ id: leftId, disabled: !showZones });
  const { setNodeRef: setRightRef } = useDroppable({ id: rightId, disabled: !showZones });

  const isLeftHovered = activeTarget === leftId;
  const isRightHovered = activeTarget === rightId;

  return (
    <div className="relative">
      {children}
      {showZones && (
        <>
          <div
            ref={setLeftRef}
            data-bf-apartado-left={apartadoId}
            className={cn(
              "absolute left-0 top-0 bottom-0 z-20 w-2 transition-colors duration-100",
              isLeftHovered
                ? "border-l-2 border-dashed border-primary/60"
                : "bg-transparent hover:bg-primary/10",
            )}
          />
          <div
            ref={setRightRef}
            data-bf-apartado-right={apartadoId}
            className={cn(
              "absolute right-0 top-0 bottom-0 z-20 w-2 transition-colors duration-100",
              isRightHovered
                ? "border-r-2 border-dashed border-primary/60"
                : "bg-transparent hover:bg-primary/10",
            )}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Apartado "inside" drop target                                      */
/* ------------------------------------------------------------------ */

/**
 * A semantic target for dropping content INTO an Apartado.
 * Shows blue indicator when a content column is being dragged.
 * Works for both empty and non-empty Apartados.
 */
export function BfApartadoInsideDropZone({
  apartadoId,
  blockId,
  activeColumnId,
  activeTarget,
  hasContent,
  children,
}: {
  apartadoId: string;
  blockId: string;
  activeColumnId: string | null;
  activeTarget: string | null;
  /** When true, the apartado has existing content — overlay becomes pass-through so inner targets win. */
  hasContent?: boolean;
  children: React.ReactNode;
}) {
  const isDragging = activeColumnId !== null;
  const zoneId = `apartado-inside-${apartadoId}`;
  const { setNodeRef } = useDroppable({
    id: zoneId,
    // When the apartado has content, only register for empty-space fallback
    disabled: !isDragging || Boolean(hasContent),
    data: {
      kind: "apartado-inside",
      container: { kind: "apartado" as const, blockId, apartadoId },
      placement: "new-row" as const,
    },
  });

  const isHovered = activeTarget === zoneId;

  return (
    <div className="relative min-h-[2rem]">
      {children}
      {/* Overlay: an empty apartado is one big slot, visible while content is dragged */}
      <div
        ref={setNodeRef}
        data-bf-apartado-inside={apartadoId}
        data-slot-state={isDragging && !hasContent ? (isHovered ? "target" : "open") : undefined}
        className={cn(
          "absolute inset-0 z-20 rounded-lg border border-dashed transition-colors duration-100",
          "pointer-events-none",
          isHovered
            ? "border-primary bg-primary/15"
            : isDragging && !hasContent
              ? "border-primary/40 bg-primary/5"
              : "border-transparent bg-transparent",
        )}
      />
    </div>
  );
}
