"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
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
 * Format: drop-row::{kind}::{ids}::{rowId}::below
 */
function buildScopedDropRowId(
  containerRef: ContentContainerRef,
  rowId: string,
): string {
  if (containerRef.kind === "block") {
    return `drop-row::block::${containerRef.blockId}::${rowId}::below`;
  }
  return `drop-row::apartado::${containerRef.blockId}::${containerRef.apartadoId}::${rowId}::below`;
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
/*  Single directional drop zone                                       */
/* ------------------------------------------------------------------ */

function DropZone({
  id,
  position,
  active,
  isHovered,
  data,
}: {
  id: string;
  position: "left" | "right";
  active: boolean;
  isHovered: boolean;
  data?: Record<string, unknown>;
}) {
  const { setNodeRef } = useDroppable({ id, disabled: !active, data });

  return (
    <div
      ref={setNodeRef}
      data-drop-zone={position}
      className={cn(
        "absolute z-20 top-0 bottom-0 transition-colors duration-100",
        position === "left" && "left-0 w-2 cursor-col-resize",
        position === "right" && "right-0 w-2 cursor-col-resize",
        isHovered
          ? "border border-dashed border-primary/60 rounded-sm"
          : active
            ? "bg-transparent hover:bg-primary/10"
            : "bg-transparent pointer-events-none",
      )}
      style={{ minWidth: "0.5rem" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Row-level BELOW drop target                                        */
/* ------------------------------------------------------------------ */

/**
 * A droppable zone attached to the row container for "below" targeting.
 * This targets the entire row, not individual columns.
 *
 * Uses container-scoped drop zone ID for uniqueness.
 */
export function V2RowDropTarget({
  rowId,
  activeId,
  activeTarget,
  containerRef,
  children,
}: {
  rowId: string;
  activeId: string | null;
  activeTarget: string | null;
  containerRef?: { kind: "block"; blockId: string } | { kind: "apartado"; blockId: string; apartadoId: string };
  children: React.ReactNode;
}) {
  const belowZoneId = containerRef
    ? buildScopedDropRowId(containerRef, rowId)
    : `v2row-${rowId}::below`;
  const { setNodeRef } = useDroppable({
    id: belowZoneId,
    disabled: !activeId,
    data: containerRef ? { kind: "content-row-target", container: containerRef, rowId, placement: "below" as const } : undefined,
  });

  const isHovered = activeTarget === belowZoneId;

  return (
    <div className="relative">
      {children}
      <div
        ref={setNodeRef}
        data-row-below={rowId}
        className={cn(
          "absolute left-0 right-0 z-20 transition-colors duration-100",
          isHovered
            ? "border border-dashed border-primary/60 rounded-sm"
            : "bg-transparent pointer-events-none",
        )}
        style={{ bottom: 0, height: "1.25rem" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Column-level drop zones (left + right only)                        */
/* ------------------------------------------------------------------ */

/**
 * Wraps a sortable column with left/right drop zones.
 * The row-level below zone is handled by V2RowDropTarget.
 *
 * Uses container-scoped drop zone IDs to ensure uniqueness across
 * all containers sharing a single DndContext.
 *
 * activeId must be the SCOPED sortable ID (not the domain column ID).
 */
export function V2ColumnDropZones({
  columnId,
  activeId,
  activeTarget,
  containerRef,
  children,
}: {
  columnId: string;
  activeId: string | null;
  activeTarget: string | null;
  containerRef?: { kind: "block"; blockId: string } | { kind: "apartado"; blockId: string; apartadoId: string };
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
  const isSelfDragging = activeId === selfSortableId;

  return (
    <div className="relative">
      {children}
      {isDragging && !isSelfDragging && (
        <>
          <DropZone
            id={leftId}
            position="left"
            active={isDragging}
            isHovered={activeTarget === leftId}
            data={containerRef ? { kind: "content-column-target", container: containerRef, columnId, placement: "left" as const } : undefined}
          />
          <DropZone
            id={rightId}
            position="right"
            active={isDragging}
            isHovered={activeTarget === rightId}
            data={containerRef ? { kind: "content-column-target", container: containerRef, columnId, placement: "right" as const } : undefined}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BlockFlow V2 structural drop zones                                 */
/* ------------------------------------------------------------------ */

/**
 * Renders before/after drop zones on a structural row (content or apartado).
 * Shows blue indicator when an apartado OR content column is being dragged over.
 */
export function BfRowDropZones({
  rowId,
  activeApartadoId,
  activeColumnId,
  activeTarget,
  containerRef,
  children,
}: {
  rowId: string;
  activeApartadoId: string | null;
  activeColumnId: string | null;
  activeTarget: string | null;
  containerRef?: { kind: "block"; blockId: string } | { kind: "apartado"; blockId: string; apartadoId: string };
  children: React.ReactNode;
}) {
  const isDragging = activeApartadoId !== null || activeColumnId !== null;

  const beforeId = buildBfRowDropZoneId({ rowId, placement: "before" });
  const afterId = buildBfRowDropZoneId({ rowId, placement: "after" });

  const bfBoundaryData = containerRef
    ? { kind: "block-flow-boundary" as const, container: containerRef, structuralRowId: rowId }
    : undefined;

  const { setNodeRef: setBeforeRef } = useDroppable({ id: beforeId, disabled: !isDragging, data: bfBoundaryData });
  const { setNodeRef: setAfterRef } = useDroppable({ id: afterId, disabled: !isDragging, data: bfBoundaryData });

  const isBeforeHovered = activeTarget === beforeId;
  const isAfterHovered = activeTarget === afterId;

  return (
    <div className="relative">
      {/* Before zone — top edge */}
      <div
        ref={setBeforeRef}
        data-bf-row-before={rowId}
        className={cn(
          "absolute left-0 right-0 z-20 transition-colors duration-100",
          isBeforeHovered
            ? "border-t-2 border-dashed border-primary/60"
            : isDragging
              ? "bg-transparent"
              : "bg-transparent pointer-events-none",
        )}
        style={{ top: "-0.25rem", height: "0.5rem" }}
      />
      {children}
      {/* After zone — bottom edge */}
      <div
        ref={setAfterRef}
        data-bf-row-after={rowId}
        className={cn(
          "absolute left-0 right-0 z-20 transition-colors duration-100",
          isAfterHovered
            ? "border-b-2 border-dashed border-primary/60"
            : isDragging
              ? "bg-transparent"
              : "bg-transparent pointer-events-none",
        )}
        style={{ bottom: "-0.25rem", height: "0.5rem" }}
      />
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
      {/* Overlay: active only for empty apartados as drop fallback */}
      <div
        ref={setNodeRef}
        data-bf-apartado-inside={apartadoId}
        className={cn(
          "absolute inset-0 z-20 rounded-lg border-2 border-dashed transition-colors duration-100",
          isHovered
            ? "border-primary/60 bg-primary/5"
            : isDragging && !hasContent
              ? "border-transparent bg-transparent hover:border-primary/20 hover:bg-primary/5"
              : "border-transparent bg-transparent pointer-events-none",
        )}
      />
    </div>
  );
}
