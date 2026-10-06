import assert from "node:assert/strict";
import test from "node:test";
import type { Apartado, Block, Concept, ContentLayout } from "../src/features/valuations/model";
import {
  applyContentDrop,
  contentDropSourceFromData,
  contentDropTargetFromData,
  findHomeContentRowId,
  planBlockBoundarySlots,
  planContentDropSlots,
  type ContentDropSource,
} from "../src/features/valuations/services/content-drop";
import { resolveBlockFlowV2 } from "../src/features/valuations/services/block-flow";
import { resolveContentLayout } from "../src/features/valuations/services/content-layout";
import {
  pickContentDropSlot,
  type DropSlotCandidate,
} from "../src/features/valuations/components/editor/content-drop-collision";
import type { ContentContainerRef } from "../src/features/valuations/services/content-transfer";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function concept(id: string): Concept {
  return { id, label: id, value: "", enabled: true };
}

function apartado(id: string, conceptIds: string[], contentLayout?: ContentLayout): Apartado {
  return {
    id,
    title: id,
    enabled: true,
    concepts: conceptIds.map(concept),
    tables: [],
    images: [],
    contentLayout,
  };
}

function block(overrides: Partial<Block> = {}): Block {
  return {
    id: "block-1",
    title: "Block 1",
    sectionLabel: "",
    enabled: true,
    required: false,
    concepts: [],
    apartados: [],
    tables: [],
    images: [],
    ...overrides,
  };
}

/** One single-column row per item: `c-<row>-0` in row `r-<row>`. */
function singleRows(ids: string[]): ContentLayout {
  return {
    version: 2,
    rows: ids.map((id, index) => ({
      id: `r-${index}`,
      columns: [{ id: `c-${index}-0`, items: [{ type: "concept" as const, id }] }],
    })),
  };
}

const BLOCK: ContentContainerRef = { kind: "block", blockId: "block-1" };
const inApartado = (apartadoId: string): ContentContainerRef => ({ kind: "apartado", blockId: "block-1", apartadoId });

function source(container: ContentContainerRef, itemId: string): ContentDropSource {
  return { container, itemType: "concept", itemId };
}

/** The apartado's content as the editor shows it: rows of item IDs. */
function apartadoGrid(b: Block, apartadoId: string): string[][] {
  const item = b.apartados.find((a) => a.id === apartadoId);
  assert.ok(item);
  return resolveContentLayout(item).rows.map((row) => row.columns.map((col) => col.items[0].id));
}

/** The block as the editor shows it: structural rows in order. */
function blockGrid(b: Block): Array<string | string[]> {
  const layout = resolveContentLayout(b);
  const rows = new Map(layout.rows.map((row) => [row.id, row.columns.map((col) => col.items[0].id)]));
  return (resolveBlockFlowV2(b)?.rows ?? []).map((row) => {
    const first = row.items[0];
    return first.type === "content-row"
      ? rows.get(first.rowId) ?? []
      : row.items.map((item) => (item.type === "apartado" ? `@${item.apartadoId}` : "")).join("+");
  });
}

function allColumnIds(layout: ContentLayout): string[] {
  return layout.rows.flatMap((row) => row.columns.map((col) => col.id));
}

/* ================================================================== */
/*  REGRESSION — "arrastro un concepto y no obedece"                   */
/* ================================================================== */

/**
 * What the appraiser did: add a concept (it joins the last row), drag it to
 * its own row, delete a concept, add another one. The new concept used to get
 * the same column ID as the one moved earlier, so dragging either of them
 * moved the other (or nothing).
 */
function recordedSequence(): Block {
  // Three concepts, then a fourth added from the menu: it joins the last row.
  let state = block({
    apartados: [apartado("A", ["terreno", "construccion", "nuevo", "superficie"], singleRows(["terreno", "construccion", "nuevo"]))],
  });
  assert.deepEqual(apartadoGrid(state, "A"), [["terreno"], ["construccion"], ["nuevo", "superficie"]]);

  // Dragged to its own row, at the top.
  const moved = applyContentDrop(state, source(inApartado("A"), "superficie"), {
    kind: "row", container: inApartado("A"), rowId: "r-0", placement: "above",
  });
  assert.equal(moved.changed, true);
  state = moved.block;
  assert.deepEqual(apartadoGrid(state, "A"), [["superficie"], ["terreno"], ["construccion"], ["nuevo"]]);

  // One concept is deleted and another one is added.
  state = {
    ...state,
    apartados: state.apartados.map((item) => ({
      ...item,
      concepts: [...item.concepts.filter((c) => c.id !== "construccion"), concept("otro")],
    })),
  };
  return state;
}

test("content drop — a concept added after moves and deletions gets its own column ID", () => {
  const state = recordedSequence();
  const layout = resolveContentLayout(state.apartados[0]);

  assert.deepEqual(apartadoGrid(state, "A"), [["superficie"], ["terreno"], ["nuevo", "otro"]]);
  const columnIds = allColumnIds(layout);
  assert.equal(new Set(columnIds).size, columnIds.length, `column IDs must be unique: ${columnIds.join(", ")}`);
});

test("content drop — dragging the new concept moves that concept, not the one sharing its old position", () => {
  const state = recordedSequence();

  const result = applyContentDrop(state, source(inApartado("A"), "otro"), {
    kind: "row", container: inApartado("A"), rowId: resolveContentLayout(state.apartados[0]).rows[0].id, placement: "above",
  });

  assert.equal(result.changed, true);
  assert.deepEqual(apartadoGrid(result.block, "A"), [["otro"], ["superficie"], ["terreno"], ["nuevo"]]);
});

test("content drop — a stored layout that already has two columns with one ID still moves the dragged item", () => {
  // Layouts saved before the fix can carry the duplicate.
  const stored: ContentLayout = {
    version: 2,
    rows: [
      { id: "r-0", columns: [{ id: "c-2-1", items: [{ type: "concept", id: "terreno" }] }] },
      { id: "r-1", columns: [{ id: "c-1-0", items: [{ type: "concept", id: "construccion" }] }] },
      {
        id: "r-2",
        columns: [
          { id: "c-2-0", items: [{ type: "concept", id: "nuevo" }] },
          { id: "c-2-1", items: [{ type: "concept", id: "superficie" }] },
        ],
      },
    ],
  };
  const state = block({ apartados: [apartado("A", ["terreno", "construccion", "nuevo", "superficie"], stored)] });

  const result = applyContentDrop(state, source(inApartado("A"), "superficie"), {
    kind: "row", container: inApartado("A"), rowId: "r-0", placement: "below",
  });

  assert.equal(result.changed, true);
  assert.deepEqual(apartadoGrid(result.block, "A"), [["terreno"], ["superficie"], ["construccion"], ["nuevo"]]);
});

/* ================================================================== */
/*  applyContentDrop — same container                                  */
/* ================================================================== */

test("content drop — to the very top of an apartado", () => {
  const state = block({ apartados: [apartado("A", ["a", "b", "c"], singleRows(["a", "b", "c"]))] });
  const result = applyContentDrop(state, source(inApartado("A"), "c"), {
    kind: "row", container: inApartado("A"), rowId: "r-0", placement: "above",
  });
  assert.deepEqual(apartadoGrid(result.block, "A"), [["c"], ["a"], ["b"]]);
});

test("content drop — below another row of an apartado", () => {
  const state = block({ apartados: [apartado("A", ["a", "b", "c"], singleRows(["a", "b", "c"]))] });
  const result = applyContentDrop(state, source(inApartado("A"), "a"), {
    kind: "row", container: inApartado("A"), rowId: "r-2", placement: "below",
  });
  assert.deepEqual(apartadoGrid(result.block, "A"), [["b"], ["c"], ["a"]]);
});

test("content drop — beside a column joins its row", () => {
  const state = block({ apartados: [apartado("A", ["a", "b", "c"], singleRows(["a", "b", "c"]))] });
  const result = applyContentDrop(state, source(inApartado("A"), "c"), {
    kind: "column", container: inApartado("A"), columnId: "c-0-0", placement: "right",
  });
  assert.deepEqual(apartadoGrid(result.block, "A"), [["a", "c"], ["b"]]);
});

test("content drop — onto a column of the same row swaps toward it", () => {
  const layout: ContentLayout = {
    version: 2,
    rows: [{
      id: "r-0",
      columns: [
        { id: "c-0-0", items: [{ type: "concept", id: "a" }] },
        { id: "c-0-1", items: [{ type: "concept", id: "b" }] },
      ],
    }],
  };
  const state = block({ apartados: [apartado("A", ["a", "b"], layout)] });

  const forward = applyContentDrop(state, source(inApartado("A"), "a"), {
    kind: "column", container: inApartado("A"), columnId: "c-0-1", placement: "auto",
  });
  assert.deepEqual(apartadoGrid(forward.block, "A"), [["b", "a"]]);

  const backward = applyContentDrop(state, source(inApartado("A"), "b"), {
    kind: "column", container: inApartado("A"), columnId: "c-0-0", placement: "auto",
  });
  assert.deepEqual(apartadoGrid(backward.block, "A"), [["b", "a"]]);
});

test("content drop — next to where the item already is changes nothing", () => {
  const state = block({ apartados: [apartado("A", ["a", "b", "c"], singleRows(["a", "b", "c"]))] });
  for (const [rowId, placement] of [["r-1", "above"], ["r-1", "below"], ["r-0", "below"]] as const) {
    const result = applyContentDrop(state, source(inApartado("A"), "b"), {
      kind: "row", container: inApartado("A"), rowId, placement,
    });
    assert.equal(result.changed, false, `${placement} ${rowId}`);
    assert.equal(result.block, state);
  }
});

test("content drop — a full row rejects a fourth column", () => {
  const layout: ContentLayout = {
    version: 2,
    rows: [
      {
        id: "r-0",
        columns: ["a", "b", "c"].map((id, index) => ({ id: `c-0-${index}`, items: [{ type: "concept" as const, id }] })),
      },
      { id: "r-1", columns: [{ id: "c-1-0", items: [{ type: "concept", id: "d" }] }] },
    ],
  };
  const state = block({ apartados: [apartado("A", ["a", "b", "c", "d"], layout)] });
  const result = applyContentDrop(state, source(inApartado("A"), "d"), {
    kind: "column", container: inApartado("A"), columnId: "c-0-0", placement: "left",
  });
  assert.equal(result.changed, false);
});

test("content drop — block item between two apartados", () => {
  const state = block({
    concepts: [concept("x"), concept("y")],
    contentLayout: singleRows(["x", "y"]),
    apartados: [apartado("A", ["a"]), apartado("B", ["b"])],
  });
  assert.deepEqual(blockGrid(state), [["x"], ["y"], "@A", "@B"]);

  const result = applyContentDrop(state, source(BLOCK, "x"), {
    kind: "block-boundary", container: BLOCK, structuralRowId: "bf-a-A", placement: "after",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(blockGrid(result.block), [["y"], "@A", ["x"], "@B"]);
});

test("content drop — block item to the top of the block", () => {
  const state = block({
    concepts: [concept("x"), concept("y"), concept("z")],
    contentLayout: singleRows(["x", "y", "z"]),
  });
  const flow = resolveBlockFlowV2(state);
  assert.ok(flow);

  const result = applyContentDrop(state, source(BLOCK, "z"), {
    kind: "block-boundary", container: BLOCK, structuralRowId: flow.rows[0].id, placement: "before",
  });
  assert.deepEqual(blockGrid(result.block), [["z"], ["x"], ["y"]]);
});

test("content drop — on the boundary of its own row the item stays put", () => {
  const state = block({
    concepts: [concept("x"), concept("y")],
    contentLayout: singleRows(["x", "y"]),
    apartados: [apartado("A", ["a"])],
  });
  const flow = resolveBlockFlowV2(state);
  assert.ok(flow);
  const ownRow = flow.rows[0].id;

  for (const placement of ["before", "after"] as const) {
    const result = applyContentDrop(state, source(BLOCK, "x"), {
      kind: "block-boundary", container: BLOCK, structuralRowId: ownRow, placement,
    });
    assert.equal(result.changed, false, placement);
  }
  // The neighbour's near boundary is the same place.
  const neighbour = applyContentDrop(state, source(BLOCK, "x"), {
    kind: "block-boundary", container: BLOCK, structuralRowId: flow.rows[1].id, placement: "before",
  });
  assert.equal(neighbour.changed, false);
});

/* ================================================================== */
/*  applyContentDrop — between containers                              */
/* ================================================================== */

test("content drop — into another apartado lands on the row it was dropped at, not at the end", () => {
  const state = block({
    apartados: [
      apartado("A", ["a1", "a2"], singleRows(["a1", "a2"])),
      apartado("B", ["b1", "b2", "b3"], singleRows(["b1", "b2", "b3"])),
    ],
  });

  const below = applyContentDrop(state, source(inApartado("A"), "a2"), {
    kind: "row", container: inApartado("B"), rowId: "r-0", placement: "below",
  });
  assert.equal(below.changed, true);
  assert.deepEqual(apartadoGrid(below.block, "A"), [["a1"]]);
  assert.deepEqual(apartadoGrid(below.block, "B"), [["b1"], ["a2"], ["b2"], ["b3"]]);

  const above = applyContentDrop(state, source(inApartado("A"), "a2"), {
    kind: "row", container: inApartado("B"), rowId: "r-0", placement: "above",
  });
  assert.deepEqual(apartadoGrid(above.block, "B"), [["a2"], ["b1"], ["b2"], ["b3"]]);
});

test("content drop — the concept itself travels with all its fields", () => {
  const withUnit: Concept = { ...concept("a1"), value: "185", valueFormat: "m2" };
  const state = block({
    apartados: [
      { ...apartado("A", []), concepts: [withUnit] },
      apartado("B", ["b1"]),
    ],
  });
  const result = applyContentDrop(state, source(inApartado("A"), "a1"), {
    kind: "column", container: inApartado("B"), columnId: resolveContentLayout(state.apartados[1]).rows[0].columns[0].id, placement: "right",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(result.block.apartados[0].concepts, []);
  assert.deepEqual(result.block.apartados[1].concepts.find((c) => c.id === "a1"), withUnit);
  assert.deepEqual(apartadoGrid(result.block, "B"), [["b1", "a1"]]);
});

test("content drop — into an empty apartado", () => {
  const state = block({ apartados: [apartado("A", ["a1"]), apartado("B", [])] });
  const result = applyContentDrop(state, source(inApartado("A"), "a1"), {
    kind: "apartado-inside", container: inApartado("B"),
  });
  assert.equal(result.changed, true);
  assert.deepEqual(apartadoGrid(result.block, "B"), [["a1"]]);
  assert.deepEqual(result.block.apartados[0].concepts, []);
});

test("content drop — from an apartado to a block-level position", () => {
  const state = block({
    concepts: [concept("x")],
    apartados: [apartado("A", ["a1", "a2"]), apartado("B", ["b1"])],
  });
  // No layout or flow stored yet: the block is as the template left it.
  assert.deepEqual(blockGrid(state), [["x"], "@A", "@B"]);

  const result = applyContentDrop(state, source(inApartado("A"), "a2"), {
    kind: "block-boundary", container: BLOCK, structuralRowId: "bf-a-A", placement: "after",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(blockGrid(result.block), [["x"], "@A", ["a2"], "@B"]);
  assert.deepEqual(result.block.concepts.map((c) => c.id), ["x", "a2"]);
});

test("content drop — from the block into an apartado removes its block row", () => {
  const state = block({
    concepts: [concept("x"), concept("y")],
    contentLayout: singleRows(["x", "y"]),
    apartados: [apartado("A", ["a1"], singleRows(["a1"]))],
  });
  const result = applyContentDrop(state, source(BLOCK, "x"), {
    kind: "row", container: inApartado("A"), rowId: "r-0", placement: "above",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(blockGrid(result.block), [["y"], "@A"]);
  assert.deepEqual(apartadoGrid(result.block, "A"), [["x"], ["a1"]]);
});

test("content drop — never mutates the block it is given", () => {
  const state = block({
    concepts: [concept("x")],
    contentLayout: singleRows(["x"]),
    apartados: [apartado("A", ["a1", "a2"], singleRows(["a1", "a2"]))],
  });
  const snapshot = JSON.stringify(state);
  applyContentDrop(state, source(inApartado("A"), "a2"), { kind: "row", container: inApartado("A"), rowId: "r-0", placement: "above" });
  applyContentDrop(state, source(BLOCK, "x"), { kind: "apartado-inside", container: inApartado("A") });
  assert.equal(JSON.stringify(state), snapshot);
});

test("content drop — an item or container that does not exist changes nothing", () => {
  const state = block({ apartados: [apartado("A", ["a1"])] });
  assert.equal(applyContentDrop(state, source(inApartado("A"), "ghost"), { kind: "apartado-inside", container: inApartado("A") }).changed, false);
  assert.equal(applyContentDrop(state, source(inApartado("ghost"), "a1"), { kind: "apartado-inside", container: inApartado("A") }).changed, false);
  assert.equal(
    applyContentDrop(state, source({ kind: "block", blockId: "other" }, "a1"), { kind: "apartado-inside", container: inApartado("A") }).changed,
    false,
  );
});

/* ================================================================== */
/*  Slots shown while dragging                                         */
/* ================================================================== */

test("drop slots — a container offers every row position to an item from elsewhere", () => {
  const plan = planContentDropSlots(singleRows(["a", "b", "c"]), null);
  assert.deepEqual(plan.map((row) => [row.above, row.below]), [["open", "open"], [undefined, "open"], [undefined, "open"]]);
  // Each single-column row can also take the item on either side.
  assert.deepEqual(plan[1].columns, [{ columnId: "c-1-0", left: "open", right: "open" }]);
});

test("drop slots — the positions around the dragged item are its home, not destinations", () => {
  const plan = planContentDropSlots(singleRows(["a", "b", "c"]), { itemType: "concept", itemId: "b" });
  assert.deepEqual(plan.map((row) => [row.above, row.below]), [["open", "noop"], [undefined, "noop"], [undefined, "open"]]);
  assert.deepEqual(plan[1].columns, [{ columnId: "c-1-0", left: "noop", right: "noop" }]);
});

test("drop slots — an item that shares its row can leave it upward or downward", () => {
  const layout: ContentLayout = {
    version: 2,
    rows: [{
      id: "r-0",
      columns: ["a", "b", "c"].map((id, index) => ({ id: `c-0-${index}`, items: [{ type: "concept" as const, id }] })),
    }],
  };
  const plan = planContentDropSlots(layout, { itemType: "concept", itemId: "a" });
  assert.equal(plan[0].above, "open");
  assert.equal(plan[0].below, "open");
  // Reordering inside its own (full) row stays possible, past its neighbours.
  assert.deepEqual(plan[0].columns.map((col) => [col.left, col.right]), [["noop", undefined], ["noop", undefined], ["open", "open"]]);
});

test("drop slots — a full row takes no more columns", () => {
  const layout: ContentLayout = {
    version: 2,
    rows: [{
      id: "r-0",
      columns: ["a", "b", "c"].map((id, index) => ({ id: `c-0-${index}`, items: [{ type: "concept" as const, id }] })),
    }],
  };
  const plan = planContentDropSlots(layout, null);
  assert.deepEqual(plan[0].columns.map((col) => [col.left, col.right]), [["closed", undefined], ["closed", undefined], ["closed", "closed"]]);
  assert.equal(plan[0].below, "open");
});

test("drop slots — block boundaries around the item's own row are home", () => {
  const state = block({
    concepts: [concept("x"), concept("y")],
    contentLayout: singleRows(["x", "y"]),
    apartados: [apartado("A", ["a"])],
  });
  const flow = resolveBlockFlowV2(state);
  assert.ok(flow);
  const layout = resolveContentLayout(state);

  const dragging = planBlockBoundarySlots(flow, findHomeContentRowId(layout, { itemType: "concept", itemId: "y" }));
  assert.deepEqual(dragging.map((row) => [row.before, row.after]), [["open", "noop"], [undefined, "noop"], [undefined, "open"]]);

  // An item coming from an apartado can go to every boundary.
  const fromApartado = planBlockBoundarySlots(flow, findHomeContentRowId(layout, null));
  assert.deepEqual(fromApartado.map((row) => [row.before, row.after]), [["open", "open"], [undefined, "open"], [undefined, "open"]]);
});

/* ================================================================== */
/*  Which slot the pointer aims at                                     */
/* ================================================================== */

/** Three 32px rows, 4px apart, 400px wide; a 12px slot straddles each gap. */
const ROW_SLOTS: DropSlotCandidate[] = [
  { id: "above-0", axis: "row", rect: { top: -8, left: 0, width: 400, height: 12 } },
  { id: "below-0", axis: "row", rect: { top: 28, left: 0, width: 400, height: 12 } },
  { id: "below-1", axis: "row", rect: { top: 64, left: 0, width: 400, height: 12 } },
  { id: "below-2", axis: "row", rect: { top: 100, left: 0, width: 400, height: 12 } },
];

test("slot picking — the slot under the pointer", () => {
  assert.equal(pickContentDropSlot({ x: 200, y: 34 }, ROW_SLOTS), "below-0");
});

test("slot picking — over the middle of a row, the nearest row slot", () => {
  // Row 1 spans 36..68: upper half goes above it, lower half below it.
  assert.equal(pickContentDropSlot({ x: 200, y: 45 }, ROW_SLOTS), "below-0");
  assert.equal(pickContentDropSlot({ x: 200, y: 59 }, ROW_SLOTS), "below-1");
});

test("slot picking — over the item's own place, nothing", () => {
  const home = { top: 36, left: 0, width: 400, height: 32 };
  assert.equal(pickContentDropSlot({ x: 200, y: 50 }, ROW_SLOTS, home), null);
  // But a slot that is under the pointer still wins.
  assert.equal(pickContentDropSlot({ x: 200, y: 66 }, ROW_SLOTS, home), "below-1");
});

test("slot picking — side slots only when the pointer is on them", () => {
  const candidates: DropSlotCandidate[] = [
    ...ROW_SLOTS,
    { id: "left-1", axis: "column", rect: { top: 36, left: -10, width: 12, height: 32 } },
    { id: "right-1", axis: "column", rect: { top: 36, left: 398, width: 12, height: 32 } },
  ];
  assert.equal(pickContentDropSlot({ x: 404, y: 52 }, candidates), "right-1");
  // Right next to it, in the middle of the row: a row slot, never a snap to the side.
  assert.equal(pickContentDropSlot({ x: 14, y: 50 }, candidates), "below-0");
});

test("slot picking — in a corner, the slot whose line is closer", () => {
  const candidates: DropSlotCandidate[] = [
    ...ROW_SLOTS,
    { id: "left-1", axis: "column", rect: { top: 36, left: -10, width: 12, height: 32 } },
  ];
  // Both the row slot below row 0 (28..40) and the side slot (36..68) hold the pointer.
  assert.equal(pickContentDropSlot({ x: -4, y: 39 }, candidates), "left-1");
  assert.equal(pickContentDropSlot({ x: 1, y: 36 }, candidates), "below-0");
});

test("slot picking — onto a neighbour of the same row, the slot on its far side", () => {
  const siblings = [{ rect: { top: 36, left: 204, width: 196, height: 32 }, slotId: "right-of-neighbour" }];
  assert.equal(pickContentDropSlot({ x: 300, y: 50 }, ROW_SLOTS, null, siblings), "right-of-neighbour");
});

test("slot picking — an empty apartado is one big slot", () => {
  const candidates: DropSlotCandidate[] = [
    ...ROW_SLOTS,
    { id: "empty", axis: "area", rect: { top: 0, left: 420, width: 400, height: 80 } },
  ];
  assert.equal(pickContentDropSlot({ x: 600, y: 40 }, candidates), "empty");
});

test("slot picking — away from the content, nothing", () => {
  assert.equal(pickContentDropSlot({ x: 200, y: 400 }, ROW_SLOTS), null);
  assert.equal(pickContentDropSlot({ x: 900, y: 50 }, ROW_SLOTS), null);
  assert.equal(pickContentDropSlot({ x: 200, y: 50 }, []), null);
});

/* ================================================================== */
/*  Reading the drag library's data                                    */
/* ================================================================== */

test("drop data — the dragged column names its item and container", () => {
  assert.deepEqual(
    contentDropSourceFromData({ kind: "content-column", container: inApartado("A"), columnId: "c-0-0", itemType: "concept", itemId: "a1" }),
    { container: inApartado("A"), itemType: "concept", itemId: "a1" },
  );
  assert.equal(contentDropSourceFromData({ kind: "content-column", container: BLOCK, columnId: "c-0-0" }), null);
  assert.equal(contentDropSourceFromData(undefined), null);
});

test("drop data — each slot kind maps to its destination", () => {
  assert.deepEqual(
    contentDropTargetFromData({ kind: "content-row-target", container: inApartado("A"), rowId: "r-0", placement: "above" }),
    { kind: "row", container: inApartado("A"), rowId: "r-0", placement: "above" },
  );
  assert.deepEqual(
    contentDropTargetFromData({ kind: "content-column-target", container: BLOCK, columnId: "c-0-0", placement: "left" }),
    { kind: "column", container: BLOCK, columnId: "c-0-0", placement: "left" },
  );
  assert.deepEqual(
    contentDropTargetFromData({ kind: "block-flow-boundary", container: BLOCK, structuralRowId: "bf-a-A", placement: "before" }),
    { kind: "block-boundary", container: BLOCK, structuralRowId: "bf-a-A", placement: "before" },
  );
  assert.deepEqual(
    contentDropTargetFromData({ kind: "apartado-inside", container: inApartado("A"), placement: "new-row" }),
    { kind: "apartado-inside", container: inApartado("A") },
  );
  // A keyboard drag lands on the column itself.
  assert.deepEqual(
    contentDropTargetFromData({ kind: "content-column", container: BLOCK, columnId: "c-1-0", itemType: "concept", itemId: "x" }),
    { kind: "column", container: BLOCK, columnId: "c-1-0", placement: "auto" },
  );
  assert.equal(contentDropTargetFromData({ kind: "something-else", container: BLOCK }), null);
  assert.equal(contentDropTargetFromData(undefined), null);
});
