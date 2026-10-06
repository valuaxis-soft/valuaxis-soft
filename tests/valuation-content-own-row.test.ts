import assert from "node:assert/strict";
import test from "node:test";
import {
  withAddedApartadoContent,
  withAddedBlockContent,
} from "../src/features/valuations/components/workspace/model/section-content";
import type { Apartado, Block, Concept, ContentLayout, ImageContent, TableContent } from "../src/features/valuations/model";
import { resolveBlockFlowV2 } from "../src/features/valuations/services/block-flow";
import {
  contentLayoutWithOwnRowFor,
  resolveContentLayout,
} from "../src/features/valuations/services/content-layout";

const concept = (id: string, layoutSpan?: Concept["layoutSpan"]): Concept => ({ id, label: id, value: "", enabled: true, layoutSpan });
const image = (id: string): ImageContent => ({ id, title: id, src: `${id}.jpg`, enabled: true });
const table = (id: string): TableContent => ({ id, title: id, columns: ["A"], rows: [[""]], enabled: true });

function block(overrides: Partial<Block> = {}): Block {
  return { id: "block", title: "Block", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [], ...overrides };
}

function apartado(overrides: Partial<Apartado> = {}): Apartado {
  return { id: "S", title: "S", enabled: true, concepts: [], tables: [], images: [], ...overrides };
}

const grid = (layout: ContentLayout) => layout.rows.map((row) => row.columns.map((col) => col.items[0].id));

/** The block as the editor shows it: content rows and apartados in order. */
function shown(b: Block): Array<string | string[]> {
  const layout = resolveContentLayout(b);
  const rows = new Map(layout.rows.map((row) => [row.id, row.columns.map((col) => col.items[0].id)]));
  return (resolveBlockFlowV2({ ...b, contentLayout: layout })?.rows ?? []).map((row) => {
    const first = row.items[0];
    return first.type === "content-row" ? rows.get(first.rowId) ?? [] : `@${first.apartadoId}`;
  });
}

const stored: ContentLayout = {
  version: 2,
  rows: [
    { id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept", id: "a" }] }, { id: "c-0-1", items: [{ type: "concept", id: "b" }] }] },
    { id: "r-1", columns: [{ id: "c-1-0", items: [{ type: "concept", id: "c" }] }] },
  ],
};

test("the resolver's fallback still fills the last row: saved valuations lay out as before", () => {
  const container = block({ concepts: ["a", "b", "c", "new"].map((id) => concept(id)), contentLayout: stored });
  assert.deepEqual(grid(resolveContentLayout(container)), [["a", "b"], ["c", "new"]]);
});

test("a concept the user adds gets a row of its own at the end, whatever room the last row has", () => {
  const container = block({ concepts: ["a", "b", "c", "new"].map((id) => concept(id)), contentLayout: stored });
  const layout = contentLayoutWithOwnRowFor(container, { type: "concept", id: "new" });

  assert.deepEqual(grid(layout), [["a", "b"], ["c"], ["new"]]);
  assert.deepEqual(layout.rows.slice(0, 2), stored.rows, "the rows that were there are untouched");
  assert.equal(new Set(layout.rows.map((row) => row.id)).size, 3);
  assert.equal(new Set(layout.rows.flatMap((row) => row.columns.map((col) => col.id))).size, 4);
  assert.deepEqual(grid(resolveContentLayout({ ...container, contentLayout: layout })), [["a", "b"], ["c"], ["new"]], "and it resolves to itself");
});

test("own row — a container whose layout was never stored keeps the arrangement it showed", () => {
  // Two half-width concepts share the first row of a bootstrapped layout.
  const before = block({ concepts: [concept("a"), concept("b")] });
  assert.deepEqual(grid(resolveContentLayout(before)), [["a", "b"]]);

  const after = { ...before, concepts: [...before.concepts, concept("new")] };
  assert.deepEqual(grid(contentLayoutWithOwnRowFor(after, { type: "concept", id: "new" })), [["a", "b"], ["new"]]);
});

test("own row — beside a lone concept, where the fallback would have put it, there is room and it is not used", () => {
  const lone: ContentLayout = { version: 2, rows: [{ id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept", id: "a" }] }] }] };
  const container = block({ concepts: [concept("a"), concept("new")], contentLayout: lone });
  assert.deepEqual(grid(resolveContentLayout(container)), [["a", "new"]]);
  assert.deepEqual(grid(contentLayoutWithOwnRowFor(container, { type: "concept", id: "new" })), [["a"], ["new"]]);
});

test("own row — images and tables too, and only the added item is placed", () => {
  const container = apartado({
    concepts: [concept("a")],
    images: [image("i")],
    tables: [table("t")],
    contentLayout: { version: 2, rows: [{ id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept", id: "a" }] }] }] },
  });
  // The image was added; the table is content the layout never knew (the fallback places it).
  assert.deepEqual(grid(contentLayoutWithOwnRowFor(container, { type: "image", id: "i" })), [["a", "t"], ["i"]]);
  assert.deepEqual(grid(contentLayoutWithOwnRowFor({ ...container, images: [] }, { type: "table", id: "t" })), [["a"], ["t"]]);
});

test("own row — row and column ids never repeat, even after rows were moved around", () => {
  const moved: ContentLayout = {
    version: 2,
    rows: [
      { id: "r-2", columns: [{ id: "c-3-0", items: [{ type: "concept", id: "a" }] }] },
      { id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept", id: "b" }] }] },
    ],
  };
  const container = block({ concepts: ["a", "b", "new"].map((id) => concept(id)), contentLayout: moved });
  const layout = contentLayoutWithOwnRowFor(container, { type: "concept", id: "new" });
  assert.deepEqual(layout.rows.map((row) => row.id), ["r-2", "r-0", "r-3"]);
  assert.deepEqual(layout.rows[2].columns.map((col) => col.id), ["c-3-0-dup-0"]);
  assert.equal(JSON.stringify(container.contentLayout), JSON.stringify(moved), "nothing is mutated");
});

test("adding to a block puts the new row last in the block, after its apartados", () => {
  const start = block({ concepts: [concept("a")], apartados: [apartado({ concepts: [concept("s")] })] });
  const first = withAddedBlockContent({ ...start, concepts: [...start.concepts, concept("n1")] }, { type: "concept", id: "n1" });
  assert.deepEqual(shown(first), [["a"], "@S", ["n1"]]);

  const second = withAddedBlockContent({ ...first, tables: [table("t")] }, { type: "table", id: "t" });
  assert.deepEqual(shown(second), [["a"], "@S", ["n1"], ["t"]]);

  const third = withAddedBlockContent({ ...second, images: [image("i")] }, { type: "image", id: "i" });
  assert.deepEqual(shown(third), [["a"], "@S", ["n1"], ["t"], ["i"]]);
});

test("adding to an apartado puts the new item in its own last row of the apartado", () => {
  const start = apartado({ concepts: [concept("a")] });
  const next = withAddedApartadoContent({ ...start, concepts: [...start.concepts, concept("new")] }, { type: "concept", id: "new" });
  assert.deepEqual(grid(resolveContentLayout(next)), [["a"], ["new"]]);
  assert.deepEqual(next.concepts.map((item) => item.id), ["a", "new"]);
});
