/**
 * Content drop — what a drag of a Concept/Image/Table means for a Block.
 *
 * The editor shows every position an item can be dropped at as a "slot".
 * This module is the pure side of that:
 *
 *  - which slots a container offers for the item being dragged
 *    (planContentDropSlots, planBlockBoundarySlots), and
 *  - what the Block looks like after the item is dropped on one of them
 *    (applyContentDrop).
 *
 * The dragged item is identified by its business ID, never by its layout
 * column ID, so a drop always moves the item the user picked up.
 *
 * No side effects, no persistence, no rendering.
 */

import type {
  Apartado,
  Block,
  BlockFlowV2,
  ContentLayout,
  ContentLayoutRowV2,
} from "../model";
import {
  insertContentRowIntoBlockFlowV2,
  moveContentColumnToBlockFlowBoundary,
  removeContentRowsFromBlockFlowV2,
  resolveBlockFlowV2,
} from "./block-flow";
import {
  CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW,
  resolveContentLayout,
} from "./content-layout";
import {
  moveContentLayout,
  type ContentLayoutMoveDescriptor,
} from "./content-layout-v2-operations";
import {
  moveContentItemAcrossContainers,
  type ContentContainerRef,
  type ContentTransferDescriptor,
  type TransferableContentType,
} from "./content-transfer";

/* ================================================================== */
/*  TYPES                                                              */
/* ================================================================== */

/** The item being dragged and the container it lives in. */
export type ContentDropSource = {
  container: ContentContainerRef;
  itemType: TransferableContentType;
  itemId: string;
};

export type ContentDropTarget =
  /** A new row above/below an existing row of a container. */
  | { kind: "row"; container: ContentContainerRef; rowId: string; placement: "above" | "below" }
  /**
   * Beside an existing column, in its row. "auto" is a drop onto the column
   * itself: after it when the item comes from earlier in the same row,
   * before it otherwise.
   */
  | { kind: "column"; container: ContentContainerRef; columnId: string; placement: "left" | "right" | "auto" }
  /** A new Block-level row before/after a structural row (content row or apartados). */
  | { kind: "block-boundary"; container: ContentContainerRef; structuralRowId: string; placement: "before" | "after" }
  /** Into an Apartado, as its last row. */
  | { kind: "apartado-inside"; container: ContentContainerRef };

export type ContentDropResult = {
  changed: boolean;
  block: Block;
};

/**
 * How a slot behaves while an item is dragged:
 *  - "open": a valid destination, shown to the user.
 *  - "noop": where the item already is. Not shown, but it still catches the
 *    drop so that releasing the item at home does not send it to a neighbour.
 *  - "closed": not a destination (the row is full).
 */
export type ContentDropSlotState = "open" | "noop" | "closed";

export type ContentRowSlotPlan = {
  rowId: string;
  /** Slot above the row. Only the first row has one; the others share the previous row's `below`. */
  above?: ContentDropSlotState;
  below: ContentDropSlotState;
  /** One entry per column. Only the last column has a `right` slot. */
  columns: Array<{ columnId: string; left: ContentDropSlotState; right?: ContentDropSlotState }>;
};

export type BlockBoundarySlotPlan = {
  structuralRowId: string;
  /** Only the first structural row has a `before` slot. */
  before?: ContentDropSlotState;
  after: ContentDropSlotState;
};

/* ================================================================== */
/*  DROPPABLE DATA → SOURCE / TARGET                                   */
/* ================================================================== */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readContainerRef(value: unknown): ContentContainerRef | null {
  if (!isRecord(value) || typeof value.blockId !== "string") return null;
  if (value.kind === "block") return { kind: "block", blockId: value.blockId };
  if (value.kind === "apartado" && typeof value.apartadoId === "string") {
    return { kind: "apartado", blockId: value.blockId, apartadoId: value.apartadoId };
  }
  return null;
}

/** Read the dragged item from the data a content column registers with the drag library. */
export function contentDropSourceFromData(data: unknown): ContentDropSource | null {
  if (!isRecord(data) || data.kind !== "content-column") return null;
  const container = readContainerRef(data.container);
  const { itemType, itemId } = data;
  if (!container || typeof itemId !== "string" || !itemId) return null;
  if (itemType !== "concept" && itemType !== "image" && itemType !== "table") return null;
  return { container, itemType, itemId };
}

/** Read the drop destination from the data a drop slot registers with the drag library. */
export function contentDropTargetFromData(data: unknown): ContentDropTarget | null {
  if (!isRecord(data)) return null;
  const container = readContainerRef(data.container);
  if (!container) return null;

  switch (data.kind) {
    case "content-row-target":
      if (typeof data.rowId !== "string") return null;
      return {
        kind: "row",
        container,
        rowId: data.rowId,
        placement: data.placement === "above" ? "above" : "below",
      };
    case "content-column-target":
      if (typeof data.columnId !== "string") return null;
      return {
        kind: "column",
        container,
        columnId: data.columnId,
        placement: data.placement === "left" ? "left" : "right",
      };
    // The column itself (keyboard drags land on it, not on a slot).
    case "content-column":
      if (typeof data.columnId !== "string") return null;
      return { kind: "column", container, columnId: data.columnId, placement: "auto" };
    case "block-flow-boundary":
      if (typeof data.structuralRowId !== "string") return null;
      return {
        kind: "block-boundary",
        container,
        structuralRowId: data.structuralRowId,
        placement: data.placement === "before" ? "before" : "after",
      };
    case "apartado-inside":
      return container.kind === "apartado" ? { kind: "apartado-inside", container } : null;
    default:
      return null;
  }
}

/* ================================================================== */
/*  SLOT PLANNING                                                      */
/* ================================================================== */

function findItemPosition(
  rows: ContentLayoutRowV2[],
  item: Pick<ContentDropSource, "itemType" | "itemId">,
): { rowIndex: number; colIndex: number } | null {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const colIndex = rows[rowIndex].columns.findIndex(
      (col) => col.items[0]?.type === item.itemType && col.items[0]?.id === item.itemId,
    );
    if (colIndex >= 0) return { rowIndex, colIndex };
  }
  return null;
}

/**
 * The slots a container offers while `dragged` is being moved.
 *
 * `dragged` is the item when it lives in THIS container, or null when it
 * comes from another one (then nothing here is "home").
 *
 * Row slots sit between rows (plus one above the first row). Column slots sit
 * between the columns of a row (plus one at each end); a row that already has
 * the maximum number of columns only accepts a reorder of its own columns.
 */
export function planContentDropSlots(
  layout: ContentLayout,
  dragged: Pick<ContentDropSource, "itemType" | "itemId"> | null,
): ContentRowSlotPlan[] {
  const home = dragged ? findItemPosition(layout.rows, dragged) : null;
  const homeIsAlone = home ? layout.rows[home.rowIndex].columns.length === 1 : false;

  // Row boundary `i` is above row `i`; boundary `rows.length` is below the last row.
  const rowBoundary = (boundaryIndex: number): ContentDropSlotState =>
    home && homeIsAlone && (boundaryIndex === home.rowIndex || boundaryIndex === home.rowIndex + 1)
      ? "noop"
      : "open";

  return layout.rows.map((row, rowIndex) => {
    const isHomeRow = home?.rowIndex === rowIndex;
    const isFull = row.columns.length >= CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW;

    // Column position `p` is to the left of column `p`; position `columns.length` is the right end.
    const columnPosition = (position: number): ContentDropSlotState => {
      if (isHomeRow && home) {
        return position === home.colIndex || position === home.colIndex + 1 ? "noop" : "open";
      }
      return isFull ? "closed" : "open";
    };

    return {
      rowId: row.id,
      ...(rowIndex === 0 ? { above: rowBoundary(0) } : {}),
      below: rowBoundary(rowIndex + 1),
      columns: row.columns.map((col, colIndex) => ({
        columnId: col.id,
        left: columnPosition(colIndex),
        ...(colIndex === row.columns.length - 1 ? { right: columnPosition(colIndex + 1) } : {}),
      })),
    };
  });
}

/**
 * The Block-level slots between structural rows (content rows and apartados)
 * while a content item is dragged.
 *
 * `homeContentRowId` is the Block content row the dragged item is alone in,
 * or null when it shares its row or lives in an Apartado: only then are the
 * boundaries around that row "home".
 */
export function planBlockBoundarySlots(
  flow: BlockFlowV2,
  homeContentRowId: string | null,
): BlockBoundarySlotPlan[] {
  const homeIndex = homeContentRowId === null
    ? -1
    : flow.rows.findIndex((row) =>
        row.items.some((item) => item.type === "content-row" && item.rowId === homeContentRowId),
      );

  const boundary = (boundaryIndex: number): ContentDropSlotState =>
    homeIndex >= 0 && (boundaryIndex === homeIndex || boundaryIndex === homeIndex + 1) ? "noop" : "open";

  return flow.rows.map((row, index) => ({
    structuralRowId: row.id,
    ...(index === 0 ? { before: boundary(0) } : {}),
    after: boundary(index + 1),
  }));
}

/**
 * The Block content row the dragged item is alone in, for
 * planBlockBoundarySlots. Null when the item is not in the Block's own
 * layout or shares its row.
 */
export function findHomeContentRowId(
  layout: ContentLayout,
  dragged: Pick<ContentDropSource, "itemType" | "itemId"> | null,
): string | null {
  const home = dragged ? findItemPosition(layout.rows, dragged) : null;
  if (!home) return null;
  const row = layout.rows[home.rowIndex];
  return row.columns.length === 1 ? row.id : null;
}

/* ================================================================== */
/*  APPLYING A DROP                                                    */
/* ================================================================== */

function isSameContainer(a: ContentContainerRef, b: ContentContainerRef): boolean {
  if (a.blockId !== b.blockId || a.kind !== b.kind) return false;
  return a.kind === "block" || (b.kind === "apartado" && a.apartadoId === b.apartadoId);
}

function findApartado(block: Block, ref: ContentContainerRef): Apartado | undefined {
  return ref.kind === "apartado" ? block.apartados.find((item) => item.id === ref.apartadoId) : undefined;
}

function findRowOfColumn(layout: ContentLayout, columnId: string): ContentLayoutRowV2 | undefined {
  return layout.rows.find((row) => row.columns.some((col) => col.id === columnId));
}

/** The items of a layout as a grid, to tell a real move from one that lands where it started. */
function layoutArrangement(layout: ContentLayout): string[][] {
  return layout.rows.map((row) => row.columns.map((col) => `${col.items[0]?.type}:${col.items[0]?.id}`));
}

/** The Block as the user sees it: its structural rows in order, content rows spelled out. */
function blockArrangement(layout: ContentLayout, flow: BlockFlowV2 | undefined): string {
  const rowsById = new Map(layout.rows.map((row) => [row.id, row]));
  return JSON.stringify(
    (flow?.rows ?? []).map((structuralRow) =>
      structuralRow.items.map((item) =>
        item.type === "apartado"
          ? `apartado:${item.apartadoId}`
          : (rowsById.get(item.rowId)?.columns ?? []).map((col) => `${col.items[0]?.type}:${col.items[0]?.id}`),
      ),
    ),
  );
}

/** The move inside one layout that a row/column target stands for. */
function layoutMoveFor(
  layout: ContentLayout,
  sourceColumnId: string,
  target: ContentDropTarget,
): ContentLayoutMoveDescriptor | null {
  if (target.kind === "row") {
    return {
      sourceColumnId,
      targetRowId: target.rowId,
      placement: target.placement === "above" ? "new-row-before" : "new-row-after",
    };
  }

  if (target.kind === "column") {
    const targetRow = findRowOfColumn(layout, target.columnId);
    if (!targetRow) return null;

    let placement: "before-column" | "after-column";
    if (target.placement === "auto") {
      const sourceIndex = targetRow.columns.findIndex((col) => col.id === sourceColumnId);
      const targetIndex = targetRow.columns.findIndex((col) => col.id === target.columnId);
      placement = sourceIndex >= 0 && sourceIndex < targetIndex ? "after-column" : "before-column";
    } else {
      placement = target.placement === "left" ? "before-column" : "after-column";
    }
    return { sourceColumnId, targetRowId: targetRow.id, targetColumnId: target.columnId, placement };
  }

  if (target.kind === "apartado-inside") {
    const lastRow = layout.rows[layout.rows.length - 1];
    return lastRow ? { sourceColumnId, targetRowId: lastRow.id, placement: "new-row-after" } : null;
  }

  return null;
}

function moveWithinApartado(
  block: Block,
  apartado: Apartado,
  layout: ContentLayout,
  sourceColumnId: string,
  target: ContentDropTarget,
): ContentDropResult {
  const descriptor = layoutMoveFor(layout, sourceColumnId, target);
  if (!descriptor) return { changed: false, block };

  const result = moveContentLayout(layout, descriptor);
  if (!result.changed) return { changed: false, block };
  if (JSON.stringify(layoutArrangement(result.layout)) === JSON.stringify(layoutArrangement(layout))) {
    return { changed: false, block };
  }

  return {
    changed: true,
    block: {
      ...block,
      apartados: block.apartados.map((item) =>
        item.id === apartado.id ? { ...item, contentLayout: result.layout } : item,
      ),
    },
  };
}

function moveWithinBlock(
  block: Block,
  layout: ContentLayout,
  sourceColumnId: string,
  target: ContentDropTarget,
): ContentDropResult {
  const unchanged: ContentDropResult = { changed: false, block };
  const flow = resolveBlockFlowV2({ ...block, contentLayout: layout });
  if (!flow) return unchanged;

  // Dropped next to its own row while alone in it: the row it is anchored to
  // would disappear with the move, so there is nothing to place it against.
  const homeRow = findRowOfColumn(layout, sourceColumnId);
  if (homeRow && homeRow.columns.length === 1) {
    const anchorsHome = target.kind === "row"
      ? target.rowId === homeRow.id
      : target.kind === "block-boundary" &&
        flow.rows.some((row) =>
          row.id === target.structuralRowId &&
          row.items.some((item) => item.type === "content-row" && item.rowId === homeRow.id),
        );
    if (anchorsHome) return unchanged;
  }

  let nextLayout: ContentLayout;
  let nextFlow: BlockFlowV2;

  if (target.kind === "block-boundary") {
    const result = moveContentColumnToBlockFlowBoundary(layout, flow, {
      sourceColumnId,
      targetStructuralRowId: target.structuralRowId,
      placement: target.placement,
    });
    if (!result.changed) return unchanged;
    nextLayout = result.contentLayout;
    nextFlow = result.blockFlow;
  } else {
    const descriptor = layoutMoveFor(layout, sourceColumnId, target);
    if (!descriptor) return unchanged;

    const result = moveContentLayout(layout, descriptor);
    if (!result.changed) return unchanged;
    nextLayout = result.layout;

    const previousRowIds = new Set(layout.rows.map((row) => row.id));
    const nextRowIds = new Set(nextLayout.rows.map((row) => row.id));
    nextFlow = removeContentRowsFromBlockFlowV2(flow, nextRowIds);

    // A new row was created: place it in the flow next to the row it was dropped on.
    const newRowId = nextLayout.rows.find((row) => !previousRowIds.has(row.id))?.id;
    if (newRowId && target.kind === "row") {
      const inserted = insertContentRowIntoBlockFlowV2(nextFlow, {
        newContentRowId: newRowId,
        anchorContentRowId: target.rowId,
        placement: target.placement === "above" ? "before" : "after",
      });
      if (inserted.changed) nextFlow = inserted.flow;
    }
  }

  const nextBlock: Block = { ...block, contentLayout: nextLayout, blockFlow: nextFlow };
  if (blockArrangement(nextLayout, resolveBlockFlowV2(nextBlock)) === blockArrangement(layout, flow)) {
    return unchanged;
  }
  return { changed: true, block: nextBlock };
}

function withContainerLayout(block: Block, ref: ContentContainerRef, layout: ContentLayout): Block {
  if (ref.kind === "block") return { ...block, contentLayout: layout };
  return {
    ...block,
    apartados: block.apartados.map((item) =>
      item.id === ref.apartadoId ? { ...item, contentLayout: layout } : item,
    ),
  };
}

function moveAcrossContainers(
  block: Block,
  source: ContentDropSource,
  target: ContentDropTarget,
): ContentDropResult {
  const unchanged: ContentDropResult = { changed: false, block };

  const destinationContainer = target.container.kind === "block" ? block : findApartado(block, target.container);
  const sourceContainer = source.container.kind === "block" ? block : findApartado(block, source.container);
  if (!destinationContainer || !sourceContainer) return unchanged;

  // Work on the layouts and flow the editor is showing, not on whatever was
  // last stored: they include content added since and have repaired IDs.
  let working = withContainerLayout(block, source.container, resolveContentLayout(sourceContainer));
  working = withContainerLayout(working, target.container, resolveContentLayout(destinationContainer));
  const flow = resolveBlockFlowV2(working);
  working = { ...working, blockFlow: flow };

  let destinationPlacement: ContentTransferDescriptor["destinationPlacement"];
  let blockFlowPlacement: ContentTransferDescriptor["blockFlowPlacement"];

  switch (target.kind) {
    case "apartado-inside":
      destinationPlacement = { type: "new-row" };
      break;
    case "column":
      destinationPlacement = target.placement === "right"
        ? { type: "after-column", anchorColumnId: target.columnId }
        : { type: "before-column", anchorColumnId: target.columnId };
      break;
    case "row": {
      destinationPlacement = target.placement === "above"
        ? { type: "new-row-before", anchorRowId: target.rowId }
        : { type: "new-row-after", anchorRowId: target.rowId };
      if (target.container.kind === "block") {
        const structuralRow = flow?.rows.find((row) =>
          row.items.some((item) => item.type === "content-row" && item.rowId === target.rowId),
        );
        if (!structuralRow) return unchanged;
        blockFlowPlacement = {
          targetStructuralRowId: structuralRow.id,
          placement: target.placement === "above" ? "before" : "after",
        };
      }
      break;
    }
    case "block-boundary":
      if (target.container.kind !== "block" || !flow) return unchanged;
      destinationPlacement = { type: "new-row" };
      blockFlowPlacement = {
        targetStructuralRowId: target.structuralRowId,
        placement: target.placement,
      };
      break;
  }

  const result = moveContentItemAcrossContainers(working, {
    itemType: source.itemType,
    itemId: source.itemId,
    source: source.container,
    destination: target.container,
    destinationPlacement,
    blockFlowPlacement,
  });
  return result.changed ? { changed: true, block: result.block } : unchanged;
}

/**
 * Drop `source` on `target` and return the resulting Block.
 *
 * Covers every destination the editor offers: another position in the same
 * container, a Block-level boundary, or another container of the same Block
 * (Block ↔ Apartado, Apartado ↔ Apartado). The item keeps its ID and all its
 * fields; only its place changes.
 *
 * Returns `changed: false` (and the same Block) when the drop is invalid,
 * the destination row is full, or the item would land where it already is.
 * Never mutates the input.
 */
export function applyContentDrop(
  block: Block,
  source: ContentDropSource,
  target: ContentDropTarget,
): ContentDropResult {
  const unchanged: ContentDropResult = { changed: false, block };
  if (source.container.blockId !== block.id || target.container.blockId !== block.id) return unchanged;

  if (!isSameContainer(source.container, target.container)) {
    return moveAcrossContainers(block, source, target);
  }

  const apartado = findApartado(block, source.container);
  if (source.container.kind === "apartado" && !apartado) return unchanged;

  const layout = resolveContentLayout(apartado ?? block);
  const home = findItemPosition(layout.rows, source);
  if (!home) return unchanged;
  const sourceColumnId = layout.rows[home.rowIndex].columns[home.colIndex].id;

  return apartado
    ? moveWithinApartado(block, apartado, layout, sourceColumnId, target)
    : moveWithinBlock(block, layout, sourceColumnId, target);
}
