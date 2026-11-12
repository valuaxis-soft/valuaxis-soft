"use client";

/**
 * ContentDndScope — the single drag-and-drop context of a section's Blocks.
 *
 * Three kinds of drag share it:
 *  - a content item (Concept/Image/Table), which can land on any drop slot of
 *    any container the item may go to (see ContentMoveRules);
 *  - an Apartado, reordered inside its own Block or taken to another Block
 *    of the section (when both may give and take Apartados);
 *  - a Block, reordered among the Blocks of the section.
 *
 * One context for all of them is what lets an item travel from one Block to
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
  SAME_BLOCK_MOVE_RULES,
  canMoveContent,
  contentDropSourceFromData,
  contentDropTargetFromData,
  type ContentDropSource,
  type ContentDropTarget,
  type ContentMoveRules,
} from "../../services/content-drop";
import type { ContentContainerRef } from "../../services/content-transfer";
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

/** An Apartado dropped in another Block: before or after one of its structural rows, or into it when it is empty. */
export type ApartadoBlockMove = {
  apartadoId: string;
  fromBlockId: string;
  toBlockId: string;
  boundary?: { structuralRowId: string; placement: "before" | "after" };
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
  /** Whether the item being dragged may be dropped in `container`. False when nothing is dragged. */
  acceptsContent: (container: ContentContainerRef) => boolean;
  /** Whether the Apartado being dragged may land in the Block. False when no Apartado is dragged. */
  acceptsApartado: (blockId: string) => boolean;
  registerBlock: (blockId: string, handlers: BlockDragHandlers) => () => void;
};

const INERT_SCOPE: ContentDndScopeValue = {
  activeColumnId: null,
  activeContent: null,
  activeApartado: null,
  activeTarget: null,
  acceptsContent: () => false,
  acceptsApartado: () => false,
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
 * Slots of containers the item may not go to are disabled, so they never get here.
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
 * Collision detection for an Apartado dragged with the pointer: the closest
 * boundary between the structural rows of a Block it may land in, the side
 * of an Apartado of its own Block (to pair with it), or an empty Block. Like
 * a content drag, the pointer does not have to be on the thin line. An
 * Apartado can be taller than the screen, so its own place is not a dead
 * zone: the lines around it are, and letting go closest to them changes nothing.
 */
const detectApartadoSlotCollision = (homeBlockId: string, acceptsBlock: (blockId: string) => boolean): CollisionDetection => ({
  droppableContainers,
  droppableRects,
  pointerCoordinates,
}) => {
  if (!pointerCoordinates) return [];
  type Droppable = (typeof droppableContainers)[number];
  const candidates: DropSlotCandidate[] = [];
  const byId = new Map<string, Droppable>();
  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const id = String(container.id);
    const data = container.data.current as DroppableData;
    const blockId = (data?.container as { blockId?: string } | undefined)?.blockId;
    let axis: DropSlotCandidate["axis"] | null = null;
    if (data?.kind === "block-flow-boundary" && blockId && acceptsBlock(blockId)) axis = "row";
    else if (data?.kind === "block-inside" && blockId && blockId !== homeBlockId && acceptsBlock(blockId)) axis = "area";
    else if (id.startsWith("bfapartado-") && blockIdOfNode(container.node.current) === homeBlockId) axis = "column";
    if (!axis) continue;
    candidates.push({ id, rect, axis });
    byId.set(id, container);
  }
  const slotId = pickContentDropSlot(pointerCoordinates, candidates);
  const container = slotId ? byId.get(slotId) : undefined;
  if (!container || (container.data.current as DroppableData)?.noop) return [];
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

function buildCollisionDetection(
  drag: DragKind | null,
  blockIds: ReadonlySet<string>,
  acceptsApartado: (blockId: string) => boolean,
): CollisionDetection {
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

    // An Apartado dragged with the pointer aims at the lines between rows, in its Block or another one.
    if (drag.kind === "apartado" && args.pointerCoordinates) return detectApartadoSlotCollision(drag.blockId, acceptsApartado)(args);

    // Anything else (moved with the keyboard) stays in its own Block.
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
  moveRules = SAME_BLOCK_MOVE_RULES,
  onBlockDragEnd,
  onContentDrop,
  apartadoBlockIds,
  onApartadoBlockMove,
  children,
}: {
  /** Identity of the drag context (stable per section). */
  id: string;
  /** The Blocks that can be reordered by drag, in order. */
  blockIds: string[];
  /** Where content may be dropped outside its own container. By default it stays in its Block. */
  moveRules?: ContentMoveRules;
  /** Called when a Block is dropped on another Block. */
  onBlockDragEnd?: (event: DragEndEvent) => void;
  /** Called when a content item is dropped on a slot. */
  onContentDrop: (source: ContentDropSource, target: ContentDropTarget) => void;
  /** The Blocks that may give their Apartados to, and take them from, the others. Absent: Apartados stay in their Block. */
  apartadoBlockIds?: ReadonlySet<string>;
  /** Called when an Apartado is dropped in another Block. */
  onApartadoBlockMove?: (move: ApartadoBlockMove) => void;
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
  const acceptsApartado = useCallback(
    (blockId: string) => {
      if (drag?.kind !== "apartado") return false;
      if (blockId === drag.blockId) return true;
      return Boolean(onApartadoBlockMove && apartadoBlockIds?.has(drag.blockId) && apartadoBlockIds.has(blockId));
    },
    [drag, apartadoBlockIds, onApartadoBlockMove],
  );
  const collisionDetection = useMemo(
    () => buildCollisionDetection(drag, blockIdSet, acceptsApartado),
    [drag, blockIdSet, acceptsApartado],
  );

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
        const over = event.over?.data.current as DroppableData;
        const toBlockId = (over?.container as { blockId?: string } | undefined)?.blockId;
        if (toBlockId && toBlockId !== current.blockId && (over?.kind === "block-flow-boundary" || over?.kind === "block-inside")) {
          const move: ApartadoBlockMove = { apartadoId: String(event.active.id), fromBlockId: current.blockId, toBlockId };
          if (over.kind === "block-flow-boundary" && typeof over.structuralRowId === "string" && (over.placement === "before" || over.placement === "after")) {
            move.boundary = { structuralRowId: over.structuralRowId, placement: over.placement };
          }
          onApartadoBlockMove?.(move);
          return;
        }
        blockHandlers.current.get(current.blockId)?.onApartadoDragEnd(event);
        return;
      }

      const source = contentDropSourceFromData(event.active.data.current);
      const target = contentDropTargetFromData(event.over?.data.current);
      if (!source || !target) return;
      if (!canMoveContent(moveRules, source, target.container)) return;
      onContentDrop(source, target);
    },
    [drag, reset, onBlockDragEnd, onContentDrop, onApartadoBlockMove, moveRules],
  );

  const acceptsContent = useCallback(
    (container: ContentContainerRef) =>
      activeContent !== null && canMoveContent(moveRules, activeContent, container),
    [activeContent, moveRules],
  );

  const value = useMemo<ContentDndScopeValue>(
    () => ({ activeColumnId, activeContent, activeApartado, activeTarget, acceptsContent, acceptsApartado, registerBlock }),
    [activeColumnId, activeContent, activeApartado, activeTarget, acceptsContent, acceptsApartado, registerBlock],
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
        {activeItem ? (
          <ContentDragPreview item={activeItem} count={activeContent?.groupIds?.length} />
        ) : activeApartado ? (
          // The Apartado can be taller than the screen: a small card follows the pointer instead.
          <ContentDragPreview item={{ type: "table", id: activeApartado.apartadoId }} label="Subbloque" />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
