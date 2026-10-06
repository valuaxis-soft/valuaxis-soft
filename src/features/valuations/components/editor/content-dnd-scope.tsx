"use client";

/**
 * ContentDndScope — the single drag-and-drop context of a section's Blocks.
 *
 * Three kinds of drag share it:
 *  - a content item (Concept/Image/Table), which can land on any drop slot of
 *    any Block the item may go to;
 *  - an Apartado, reordered inside its own Block;
 *  - a Block, reordered among the Blocks of the section.
 *
 * One context for all of them is what lets a Concept travel from one Block to
 * another: the drag library only sees the drop targets of the context the
 * dragged item was registered in.
 *
 * Each BlockFlowRenderer inside reads the drag state from here to draw its
 * slots, and registers how to finish an Apartado drag in its Block.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { ContentLayoutItemRef } from "../../model";
import {
  canDropContentInBlock,
  contentDropSourceFromData,
  contentDropTargetFromData,
  type ContentDropSource,
  type ContentDropTarget,
} from "../../services/content-drop";
import {
  pickContentDropSlot,
  type DropSlotCandidate,
  type DropSlotSibling,
} from "./content-drop-collision";
import { ContentDragPreview } from "./content-layout-drag-preview";
import { editorCanScroll } from "./editor-dnd-autoscroll";

/* ------------------------------------------------------------------ */
/*  Shared drag state                                                  */
/* ------------------------------------------------------------------ */

/** The DOM attribute a Block's content carries, to tell which Block a drop target is in. */
export const CONTENT_DND_BLOCK_ATTRIBUTE = "data-content-dnd-block";

type BlockDragHandlers = {
  /** Finish the drag of one of the Block's Apartados. */
  onApartadoDragEnd: (event: DragEndEvent) => void;
};

type ContentDndScopeValue = {
  /** Scoped ID of the content column being dragged. */
  activeColumnId: string | null;
  /** The content item being dragged. */
  activeContent: ContentDropSource | null;
  /** The Apartado being dragged, and the Block it belongs to. */
  activeApartado: { apartadoId: string; blockId: string } | null;
  /** ID of the drop target the drag would land on right now. */
  activeTarget: string | null;
  /** Whether Concepts may be dropped in a Block other than their own. */
  crossBlock: boolean;
  registerBlock: (blockId: string, handlers: BlockDragHandlers) => () => void;
};

const INERT_SCOPE: ContentDndScopeValue = {
  activeColumnId: null,
  activeContent: null,
  activeApartado: null,
  activeTarget: null,
  crossBlock: false,
  registerBlock: () => () => undefined,
};

const ContentDndScopeContext = createContext<ContentDndScopeValue>(INERT_SCOPE);

/** The drag state of the enclosing scope. Outside a scope nothing is ever dragged. */
export function useContentDndScope(): ContentDndScopeValue {
  return useContext(ContentDndScopeContext);
}

/* ------------------------------------------------------------------ */
/*  Collision detection                                                */
/* ------------------------------------------------------------------ */

type DragKind =
  | { kind: "content"; blockId: string }
  | { kind: "apartado"; blockId: string }
  | { kind: "block" };

type DroppableData = Record<string, unknown> | undefined;

/** The slot kinds a content drag can land on, and the direction each one is drawn in. */
const CONTENT_SLOT_AXIS: Record<string, DropSlotCandidate["axis"]> = {
  "content-row-target": "row",
  "block-flow-boundary": "row",
  "content-column-target": "column",
  "apartado-inside": "area",
  "block-inside": "area",
};

function isSpecificContentTarget(id: string): boolean {
  return id.startsWith("drop-col::") || id.startsWith("drop-row::");
}

function isBfStructural(id: string): boolean {
  return id.startsWith("bfrow-") || id.startsWith("bfapartado-");
}

/** Identity of the container a droppable belongs to, among all the Blocks of the scope. */
function containerKey(data: DroppableData): string {
  const container = data?.container as { kind?: string; blockId?: string; apartadoId?: string } | undefined;
  return `${container?.blockId}:${container?.kind}:${container?.apartadoId ?? ""}`;
}

/** Identity of the row a content column sits in, across containers. */
function contentRowKey(data: DroppableData): string | null {
  if (data?.kind !== "content-column" || typeof data.rowId !== "string") return null;
  return `${containerKey(data)}:${data.rowId}`;
}

/** The Block whose content a droppable is rendered in, if any. */
function blockIdOfNode(node: HTMLElement | null): string | null {
  return node?.closest(`[${CONTENT_DND_BLOCK_ATTRIBUTE}]`)?.getAttribute(CONTENT_DND_BLOCK_ATTRIBUTE) ?? null;
}

/**
 * Collision detection for a content drag: the slot the pointer aims at
 * (see pickContentDropSlot). A "noop" slot — the item's own place — and the
 * item's own column both resolve to no target, so the drop changes nothing.
 *
 * Slots of Blocks the item may not go to are disabled, so they never get here.
 */
const detectContentSlotCollision: CollisionDetection = ({
  active,
  droppableContainers,
  droppableRects,
  pointerCoordinates,
}) => {
  if (!pointerCoordinates) return [];
  type Droppable = (typeof droppableContainers)[number];

  const activeData = active.data.current as DroppableData;
  const homeRowKey = contentRowKey(activeData);
  const homeContainerKey = containerKey(activeData);
  const candidates: DropSlotCandidate[] = [];
  const containersById = new Map<string, Droppable>();
  const columnSlotIds = new Map<string, string>();
  const rowColumns: Array<{ columnId: string; isHome: boolean; rect: DropSlotCandidate["rect"] }> = [];

  for (const container of droppableContainers) {
    const data = container.data.current as DroppableData;
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
  if ((container.data.current as DroppableData)?.noop) return [];
  return [{ id: container.id, data: { droppableContainer: container, value: 0 } }];
};

/**
 * Collision detection inside one Block, for an Apartado drag and for a
 * content item moved with the keyboard: what is under the pointer (or the
 * dragged rectangle), specific targets before broad ones.
 */
const detectInBlockCollision = (isApartadoDrag: boolean): CollisionDetection => (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length === 0) return rectIntersection(args);

  const compatible = pointerCollisions.filter((collision) => {
    const id = String(collision.id);
    // An Apartado never lands on a content slot, nor a content item on an Apartado merge zone.
    return isApartadoDrag ? !isSpecificContentTarget(id) : !id.startsWith("bfapartado-");
  });
  if (compatible.length === 0) return pointerCollisions.length === 1 ? [] : pointerCollisions;
  if (compatible.length === 1) return compatible;

  const kindOf = new Map<string, unknown>();
  for (const container of args.droppableContainers) {
    kindOf.set(String(container.id), (container.data.current as DroppableData)?.kind);
  }

  const specific = compatible.filter((collision) => {
    const kind = kindOf.get(String(collision.id));
    return kind === "content-column-target" || kind === "content-row-target";
  });
  if (specific.length > 0) return specific;

  const structural = compatible.filter((collision) => isBfStructural(String(collision.id)));
  if (structural.length > 0) return structural;

  const broad = compatible.filter((collision) => {
    const kind = kindOf.get(String(collision.id));
    return kind === "apartado-inside" || kind === "block-inside";
  });
  return broad.length > 0 ? broad : compatible;
};

function buildCollisionDetection(drag: DragKind | null, blockIds: ReadonlySet<string>): CollisionDetection {
  return (args) => {
    if (!drag) return [];

    // A Block is reordered among the Blocks only.
    if (drag.kind === "block") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) => blockIds.has(String(container.id))),
      });
    }

    // A content item dragged with the pointer aims at the drop slots, in any Block.
    if (drag.kind === "content" && args.pointerCoordinates) return detectContentSlotCollision(args);

    // Anything else stays in its own Block.
    return detectInBlockCollision(drag.kind === "apartado")({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => blockIdOfNode(container.node.current) === drag.blockId,
      ),
    });
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ContentDndScope({
  id,
  blockIds,
  crossBlock = false,
  onBlockDragEnd,
  onContentDrop,
  children,
}: {
  /** Identity of the drag context (stable per section). */
  id: string;
  /** The Blocks that can be reordered by drag, in order. */
  blockIds: string[];
  /** Let Concepts be dropped in a Block other than their own. */
  crossBlock?: boolean;
  /** Called when a Block is dropped on another Block. */
  onBlockDragEnd?: (event: DragEndEvent) => void;
  /** Called when a content item is dropped on a slot. */
  onContentDrop: (source: ContentDropSource, target: ContentDropTarget) => void;
  children: React.ReactNode;
}) {
  const [drag, setDrag] = useState<DragKind | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState<ContentDropSource | null>(null);
  const [activeApartado, setActiveApartado] = useState<ContentDndScopeValue["activeApartado"]>(null);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);

  const blockHandlers = useRef(new Map<string, BlockDragHandlers>());
  const registerBlock = useCallback((blockId: string, handlers: BlockDragHandlers) => {
    blockHandlers.current.set(blockId, handlers);
    return () => {
      if (blockHandlers.current.get(blockId) === handlers) blockHandlers.current.delete(blockId);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const blockIdSet = useMemo(() => new Set(blockIds), [blockIds]);
  const collisionDetection = useMemo(() => buildCollisionDetection(drag, blockIdSet), [drag, blockIdSet]);

  const reset = useCallback(() => {
    setDrag(null);
    setActiveColumnId(null);
    setActiveContent(null);
    setActiveApartado(null);
    setActiveTarget(null);
  }, []);

  const handleDragStart = useCallback(
    ({ active }: DragStartEvent) => {
      const activeId = String(active.id);
      const content = contentDropSourceFromData(active.data.current);
      if (content) {
        setDrag({ kind: "content", blockId: content.container.blockId });
        setActiveColumnId(activeId);
        setActiveContent(content);
        return;
      }
      if (blockIdSet.has(activeId)) {
        setDrag({ kind: "block" });
        return;
      }
      const data = active.data.current as { kind?: string; blockId?: string } | undefined;
      const blockId = data?.kind === "apartado" ? data.blockId : undefined;
      if (!blockId) return;
      setDrag({ kind: "apartado", blockId });
      setActiveApartado({ apartadoId: activeId, blockId });
    },
    [blockIdSet],
  );

  // The target follows `over` itself: it is what the drop will use.
  const handleDragOver = useCallback(({ over }: DragOverEvent) => {
    setActiveTarget(over ? String(over.id) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const current = drag;
      reset();
      if (!current) return;

      if (current.kind === "block") {
        onBlockDragEnd?.(event);
        return;
      }
      if (current.kind === "apartado") {
        blockHandlers.current.get(current.blockId)?.onApartadoDragEnd(event);
        return;
      }

      const source = contentDropSourceFromData(event.active.data.current);
      const target = contentDropTargetFromData(event.over?.data.current);
      if (!source || !target) return;
      if (!canDropContentInBlock(source, target.container.blockId, crossBlock)) return;
      onContentDrop(source, target);
    },
    [drag, reset, onBlockDragEnd, onContentDrop, crossBlock],
  );

  const value = useMemo<ContentDndScopeValue>(
    () => ({ activeColumnId, activeContent, activeApartado, activeTarget, crossBlock, registerBlock }),
    [activeColumnId, activeContent, activeApartado, activeTarget, crossBlock, registerBlock],
  );

  const activeItem: ContentLayoutItemRef | null = activeContent
    ? { type: activeContent.itemType, id: activeContent.itemId }
    : null;

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={{ canScroll: editorCanScroll }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <ContentDndScopeContext.Provider value={value}>{children}</ContentDndScopeContext.Provider>
      <DragOverlay dropAnimation={null}>
        {activeItem ? <ContentDragPreview item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
