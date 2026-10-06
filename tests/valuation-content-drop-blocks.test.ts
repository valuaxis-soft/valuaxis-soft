import assert from "node:assert/strict";
import test from "node:test";
import type { Apartado, Block, Concept, ContentLayout } from "../src/features/valuations/model";
import {
  SAME_BLOCK_MOVE_RULES,
  applyContentDropToBlocks,
  canMoveContent,
  contentContainerKey,
  contentItemKey,
  contentDropTargetFromData,
  type ContentDropSource,
  type ContentMoveRules,
} from "../src/features/valuations/services/content-drop";
import { resolveBlockFlowV2 } from "../src/features/valuations/services/block-flow";
import { resolveContentLayout } from "../src/features/valuations/services/content-layout";
import { conceptLinkIndicator, linkConceptToCollection, resolveEffectiveConcept } from "../src/features/valuations/concept-links";
import type { ContentContainerRef } from "../src/features/valuations/services/content-transfer";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function concept(id: string): Concept {
  return { id, label: id, value: "", enabled: true };
}

function apartado(id: string, conceptIds: string[], contentLayout?: ContentLayout): Apartado {
  return { id, title: id, enabled: true, concepts: conceptIds.map(concept), tables: [], images: [], contentLayout };
}

function block(id: string, overrides: Partial<Block> = {}): Block {
  return {
    id,
    title: id,
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

const inBlock = (blockId: string): ContentContainerRef => ({ kind: "block", blockId });
const inApartado = (blockId: string, apartadoId: string): ContentContainerRef => ({ kind: "apartado", blockId, apartadoId });
const source = (container: ContentContainerRef, itemId: string): ContentDropSource => ({ container, itemType: "concept", itemId });
const CROSS: ContentMoveRules = { ...SAME_BLOCK_MOVE_RULES, crossBlockTypes: ["concept", "image", "table"] };
const CONCEPTS_CROSS: ContentMoveRules = { ...SAME_BLOCK_MOVE_RULES, crossBlockTypes: ["concept"] };

/** The block as the editor shows it: structural rows in order. */
function blockGrid(b: Block): Array<string | string[]> {
  const layout = resolveContentLayout(b);
  const rows = new Map(layout.rows.map((row) => [row.id, row.columns.map((col) => col.items[0].id)]));
  return (resolveBlockFlowV2({ ...b, contentLayout: layout })?.rows ?? []).map((row) => {
    const first = row.items[0];
    return first.type === "content-row"
      ? rows.get(first.rowId) ?? []
      : row.items.map((item) => (item.type === "apartado" ? `@${item.apartadoId}` : "")).join("+");
  });
}

function apartadoGrid(b: Block, apartadoId: string): string[][] {
  const item = b.apartados.find((a) => a.id === apartadoId);
  assert.ok(item);
  return resolveContentLayout(item).rows.map((row) => row.columns.map((col) => col.items[0].id));
}

/** The structural row of block `b` that shows the content row holding `conceptId`. */
function structuralRowOf(b: Block, conceptId: string): string {
  const layout = resolveContentLayout(b);
  const rowId = layout.rows.find((row) => row.columns.some((col) => col.items[0].id === conceptId))?.id;
  const structural = resolveBlockFlowV2({ ...b, contentLayout: layout })?.rows.find((row) =>
    row.items.some((item) => item.type === "content-row" && item.rowId === rowId),
  );
  assert.ok(structural);
  return structural.id;
}

function twoBlocks(): Block[] {
  return [
    block("one", { concepts: ["a1", "a2", "a3"].map(concept), contentLayout: singleRows(["a1", "a2", "a3"]) }),
    block("two", {
      concepts: ["b1", "b2"].map(concept),
      contentLayout: singleRows(["b1", "b2"]),
      apartados: [apartado("S", ["s1", "s2"], singleRows(["s1", "s2"]))],
    }),
  ];
}

/* ================================================================== */
/*  Between two blocks                                                 */
/* ================================================================== */

test("drop across blocks — a concept lands on the row boundary it was dropped at", () => {
  const blocks = twoBlocks();
  const result = applyContentDropToBlocks(blocks, source(inBlock("one"), "a2"), {
    kind: "block-boundary", container: inBlock("two"), structuralRowId: structuralRowOf(blocks[1], "b1"), placement: "after",
  }, CROSS);

  assert.equal(result.changed, true);
  assert.deepEqual(blockGrid(result.blocks[0]), [["a1"], ["a3"]]);
  assert.deepEqual(blockGrid(result.blocks[1]), [["b1"], ["a2"], ["b2"], "@S"]);
  assert.deepEqual(result.blocks[0].concepts.map((c) => c.id), ["a1", "a3"]);
  assert.deepEqual(result.blocks[1].concepts.map((c) => c.id), ["b1", "b2", "a2"]);
});

test("drop across blocks — to the very top and the very bottom of the other block", () => {
  const blocks = twoBlocks();
  const top = applyContentDropToBlocks(blocks, source(inBlock("one"), "a3"), {
    kind: "block-boundary", container: inBlock("two"), structuralRowId: structuralRowOf(blocks[1], "b1"), placement: "before",
  }, CROSS);
  assert.deepEqual(blockGrid(top.blocks[1]), [["a3"], ["b1"], ["b2"], "@S"]);

  const bottom = applyContentDropToBlocks(blocks, source(inBlock("one"), "a3"), {
    kind: "block-boundary", container: inBlock("two"), structuralRowId: "bf-a-S", placement: "after",
  }, CROSS);
  assert.deepEqual(blockGrid(bottom.blocks[1]), [["b1"], ["b2"], "@S", ["a3"]]);
});

test("drop across blocks — beside a concept of the other block", () => {
  const blocks = twoBlocks();
  const result = applyContentDropToBlocks(blocks, source(inBlock("one"), "a1"), {
    kind: "column", container: inBlock("two"), columnId: "c-1-0", placement: "left",
  }, CROSS);
  assert.equal(result.changed, true);
  assert.deepEqual(blockGrid(result.blocks[0]), [["a2"], ["a3"]]);
  assert.deepEqual(blockGrid(result.blocks[1]), [["b1"], ["a1", "b2"], "@S"]);

  // Both blocks number their columns the same way: the arriving column gets an ID of its own.
  const columnIds = resolveContentLayout(result.blocks[1]).rows.flatMap((row) => row.columns.map((col) => col.id));
  assert.equal(new Set(columnIds).size, columnIds.length);
});

test("drop across blocks — into and out of an apartado of another block", () => {
  const blocks = twoBlocks();
  const into = applyContentDropToBlocks(blocks, source(inBlock("one"), "a1"), {
    kind: "row", container: inApartado("two", "S"), rowId: "r-0", placement: "below",
  }, CROSS);
  assert.equal(into.changed, true);
  assert.deepEqual(apartadoGrid(into.blocks[1], "S"), [["s1"], ["a1"], ["s2"]]);
  assert.deepEqual(blockGrid(into.blocks[1]), [["b1"], ["b2"], "@S"]);
  assert.deepEqual(blockGrid(into.blocks[0]), [["a2"], ["a3"]]);

  const out = applyContentDropToBlocks(blocks, source(inApartado("two", "S"), "s2"), {
    kind: "block-boundary", container: inBlock("one"), structuralRowId: structuralRowOf(blocks[0], "a1"), placement: "before",
  }, CROSS);
  assert.equal(out.changed, true);
  assert.deepEqual(blockGrid(out.blocks[0]), [["s2"], ["a1"], ["a2"], ["a3"]]);
  assert.deepEqual(apartadoGrid(out.blocks[1], "S"), [["s1"]]);
});

test("drop across blocks — into a block or an apartado that has nothing yet", () => {
  const blocks = [...twoBlocks(), block("empty", { apartados: [apartado("E", [])] }), block("bare")];

  const intoApartado = applyContentDropToBlocks(blocks, source(inBlock("one"), "a1"), {
    kind: "apartado-inside", container: inApartado("empty", "E"),
  }, CROSS);
  assert.equal(intoApartado.changed, true);
  assert.deepEqual(apartadoGrid(intoApartado.blocks[2], "E"), [["a1"]]);

  const intoBlock = applyContentDropToBlocks(blocks, source(inApartado("two", "S"), "s1"), {
    kind: "block-inside", container: inBlock("bare"),
  }, CROSS);
  assert.equal(intoBlock.changed, true);
  assert.deepEqual(blockGrid(intoBlock.blocks[3]), [["s1"]]);
  assert.deepEqual(apartadoGrid(intoBlock.blocks[1], "S"), [["s2"]]);
});

test("drop across blocks — a concept just added, not yet in the stored layout, moves too", () => {
  const blocks = twoBlocks();
  // Added from the menu: it is in the block but the stored layout does not know it.
  blocks[0] = { ...blocks[0], concepts: [...blocks[0].concepts, concept("nuevo")] };
  assert.deepEqual(blockGrid(blocks[0]), [["a1"], ["a2"], ["a3", "nuevo"]]);

  const result = applyContentDropToBlocks(blocks, source(inBlock("one"), "nuevo"), {
    kind: "row", container: inApartado("two", "S"), rowId: "r-0", placement: "above",
  }, CROSS);
  assert.equal(result.changed, true);
  assert.deepEqual(blockGrid(result.blocks[0]), [["a1"], ["a2"], ["a3"]]);
  assert.deepEqual(apartadoGrid(result.blocks[1], "S"), [["nuevo"], ["s1"], ["s2"]]);
});

test("drop across blocks — the concept keeps its identity, its fields and its links", () => {
  const [origin, linked] = linkConceptToCollection(
    [{ ...concept("origin"), label: "Superficie", value: "185", valueFormat: "m2" }],
    "origin",
    "linked",
    "full",
  );
  const blocks = [
    block("one", { concepts: [origin, concept("a2")] }),
    block("two", { concepts: [linked, concept("b2")], contentLayout: singleRows(["linked", "b2"]) }),
    block("three", { concepts: [concept("c1")], contentLayout: singleRows(["c1"]) }),
  ];
  const everyConcept = (list: Block[]) => list.flatMap((b) => [...b.concepts, ...b.apartados.flatMap((a) => a.concepts)]);
  const before = resolveEffectiveConcept(linked, everyConcept(blocks));

  // The source of the link moves away, then the linked concept does.
  const first = applyContentDropToBlocks(blocks, source(inBlock("one"), "origin"), {
    kind: "row", container: inBlock("three"), rowId: "r-0", placement: "below",
  }, CROSS);
  const second = applyContentDropToBlocks(first.blocks, source(inBlock("two"), "linked"), {
    kind: "column", container: inBlock("three"), columnId: "c-0-0", placement: "right",
  }, CROSS);
  assert.equal(first.changed && second.changed, true);

  const after = everyConcept(second.blocks);
  assert.equal(after.length, 5, "no concept is lost or duplicated");
  assert.equal(new Set(after.map((c) => c.id)).size, 5);
  assert.deepEqual(second.blocks[2].concepts.find((c) => c.id === "origin"), origin);
  assert.deepEqual(second.blocks[2].concepts.find((c) => c.id === "linked"), linked);
  assert.deepEqual(resolveEffectiveConcept(linked, after), before);
  assert.equal(conceptLinkIndicator(linked, after), "full");
  assert.deepEqual(blockGrid(second.blocks[2]), [["c1", "linked"], ["origin"]]);
});

test("drop across blocks — a full row of the other block takes no more columns", () => {
  const blocks = twoBlocks();
  blocks[1] = {
    ...blocks[1],
    contentLayout: { version: 2, rows: [{ id: "r-0", columns: ["b1", "b2", "x"].map((id, i) => ({ id: `c-0-${i}`, items: [{ type: "concept" as const, id }] })) }] },
    concepts: ["b1", "b2", "x"].map(concept),
  };
  const result = applyContentDropToBlocks(blocks, source(inBlock("one"), "a1"), {
    kind: "column", container: inBlock("two"), columnId: "c-0-2", placement: "right",
  }, CROSS);
  assert.equal(result.changed, false);
  assert.equal(result.blocks, blocks);
});

test("drop across blocks — an item leaves its block only where the rules of the section allow its type", () => {
  const blocks = twoBlocks();
  const target = { kind: "row", container: inApartado("two", "S"), rowId: "r-0", placement: "below" } as const;
  const conceptSource = source(inBlock("one"), "a1");
  const imageSource: ContentDropSource = { container: inBlock("one"), itemType: "image", itemId: "i" };

  assert.equal(applyContentDropToBlocks(blocks, conceptSource, target, SAME_BLOCK_MOVE_RULES).changed, false);
  assert.equal(applyContentDropToBlocks(blocks, conceptSource, target, CONCEPTS_CROSS).changed, true);

  assert.equal(canMoveContent(SAME_BLOCK_MOVE_RULES, conceptSource, inBlock("one")), true);
  assert.equal(canMoveContent(SAME_BLOCK_MOVE_RULES, conceptSource, inApartado("one", "X")), true, "inside its block it moves freely");
  assert.equal(canMoveContent(SAME_BLOCK_MOVE_RULES, conceptSource, inBlock("two")), false);
  assert.equal(canMoveContent(CONCEPTS_CROSS, conceptSource, inBlock("two")), true);
  assert.equal(canMoveContent(CONCEPTS_CROSS, imageSource, inBlock("two")), false);
  assert.equal(canMoveContent(CROSS, imageSource, inApartado("two", "S")), true);
});

test("move rules — a locked block gives and takes nothing across blocks, but still reorders its own content", () => {
  const rules: ContentMoveRules = { ...CROSS, lockedBlockIds: new Set(["two"]) };
  assert.equal(canMoveContent(rules, source(inBlock("one"), "a1"), inBlock("two")), false);
  assert.equal(canMoveContent(rules, source(inBlock("one"), "a1"), inApartado("two", "S")), false);
  assert.equal(canMoveContent(rules, source(inApartado("two", "S"), "s1"), inBlock("one")), false);
  assert.equal(canMoveContent(rules, source(inApartado("two", "S"), "s1"), inBlock("two")), true);
  assert.equal(canMoveContent(rules, source(inBlock("one"), "a1"), inBlock("three")), true);

  const blocks = twoBlocks();
  const refused = applyContentDropToBlocks(blocks, source(inBlock("one"), "a1"), {
    kind: "row", container: inApartado("two", "S"), rowId: "r-0", placement: "below",
  }, rules);
  assert.equal(refused.changed, false);
  assert.equal(refused.blocks, blocks);
});

test("move rules — a pinned item stays in its container, and a closed container takes no item of that type", () => {
  const rules: ContentMoveRules = {
    ...CROSS,
    pinnedItems: new Set([contentItemKey("table", "t1")]),
    closedContainers: new Map([[contentContainerKey(inApartado("one", "X")), ["image", "table"]]]),
  };
  const pinned: ContentDropSource = { container: inApartado("one", "X"), itemType: "table", itemId: "t1" };
  assert.equal(canMoveContent(rules, pinned, inApartado("one", "X")), true, "it still reorders where it is");
  assert.equal(canMoveContent(rules, pinned, inBlock("one")), false);
  assert.equal(canMoveContent(rules, pinned, inBlock("two")), false);

  const image: ContentDropSource = { container: inBlock("one"), itemType: "image", itemId: "i" };
  assert.equal(canMoveContent(rules, image, inApartado("one", "X")), false);
  assert.equal(canMoveContent(rules, image, inBlock("two")), true);
  assert.equal(canMoveContent(rules, source(inBlock("two"), "b1"), inApartado("one", "X")), true, "concepts still go in");
});

test("drop across blocks — inside one block it is the same move as before", () => {
  const blocks = twoBlocks();
  const result = applyContentDropToBlocks(blocks, source(inBlock("one"), "a3"), {
    kind: "block-boundary", container: inBlock("one"), structuralRowId: structuralRowOf(blocks[0], "a1"), placement: "before",
  }, SAME_BLOCK_MOVE_RULES);
  assert.equal(result.changed, true);
  assert.deepEqual(blockGrid(result.blocks[0]), [["a3"], ["a1"], ["a2"]]);
  assert.equal(result.blocks[1], blocks[1], "the other block is untouched");
});

test("drop across blocks — nothing is mutated, and unknown blocks change nothing", () => {
  const blocks = twoBlocks();
  const snapshot = JSON.stringify(blocks);
  applyContentDropToBlocks(blocks, source(inBlock("one"), "a1"), { kind: "row", container: inApartado("two", "S"), rowId: "r-0", placement: "below" }, CROSS);
  applyContentDropToBlocks(blocks, source(inApartado("two", "S"), "s1"), { kind: "column", container: inBlock("one"), columnId: "c-0-0", placement: "left" }, CROSS);
  assert.equal(JSON.stringify(blocks), snapshot);

  assert.equal(
    applyContentDropToBlocks(blocks, source(inBlock("ghost"), "a1"), { kind: "block-inside", container: inBlock("two") }, CROSS).changed,
    false,
  );
  assert.equal(
    applyContentDropToBlocks(blocks, source(inBlock("one"), "ghost"), { kind: "row", container: inApartado("two", "S"), rowId: "r-0", placement: "below" }, CROSS).changed,
    false,
  );
});

test("drop data — an empty block is a destination of its own", () => {
  assert.deepEqual(
    contentDropTargetFromData({ kind: "block-inside", container: inBlock("two") }),
    { kind: "block-inside", container: inBlock("two") },
  );
  assert.equal(contentDropTargetFromData({ kind: "block-inside", container: inApartado("two", "S") }), null);
});
