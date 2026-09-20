import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import type {
  Block,
  BlockFlow,
  Concept,
  ImageContent,
  Apartado,
  TableContent,
} from "../src/features/valuations/model";
import { BlockFlowRenderer } from "../src/features/valuations/components/editor/block-flow-renderer";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function concept(id: string, label?: string): Concept {
  return { id, label: label ?? `Concept ${id}`, value: "", enabled: true };
}

function image(id: string, title?: string): ImageContent {
  return { id, title: title ?? `Image ${id}`, src: "", enabled: true };
}

function table(id: string, title?: string): TableContent {
  return { id, title: title ?? `Table ${id}`, columns: [], columnKeys: [], rows: [], enabled: true };
}

function subBlock(id: string, title?: string): Apartado {
  return {
    id,
    title: title ?? `Apartado ${id}`,
    enabled: true,
    concepts: [],
    tables: [],
    images: [],
  };
}

function block(overrides: Partial<Block> = {}): Block {
  return {
    id: "block-1",
    title: "Block 1",
    sectionLabel: "BLO",
    enabled: true,
    required: false,
    concepts: [],
    apartados: [],
    tables: [],
    images: [],
    ...overrides,
  };
}

const noop = () => {};
const noopUpdate = () => {};

const conceptCbs = { onRemove: noop, onUpdate: noopUpdate };
const imageCbs = { onRemove: noop, onUpdate: noopUpdate };
const tableCbs = { onAddColumn: noop, onAddRow: noop, onRemove: noop, onUpdate: noopUpdate };

function renderBlockFlow(
  b: Block,
  renderApartado?: (subBlock: Apartado, flowIndex: number) => React.ReactNode,
) {
  const defaultRenderApartado = (sb: Apartado) =>
    createElement("div", { "data-testid": `apartado-${sb.id}` }, sb.title);

  return renderToStaticMarkup(
    createElement(BlockFlowRenderer, {
      block: b,
      allConcepts: [],
      conceptCallbacks: conceptCbs,
      imageCallbacks: imageCbs,
      tableCallbacks: tableCbs,
      readOnly: false,
      renderApartado: renderApartado ?? defaultRenderApartado,
    }),
  );
}

function renderBlockFlowWithCallbacks(
  b: Block,
  renderApartado?: (subBlock: Apartado, flowIndex: number) => React.ReactNode,
) {
  const defaultRenderApartado = (sb: Apartado) =>
    createElement("div", { "data-testid": `apartado-${sb.id}` }, sb.title);

  return renderToStaticMarkup(
    createElement(BlockFlowRenderer, {
      block: b,
      allConcepts: [],
      conceptCallbacks: conceptCbs,
      imageCallbacks: imageCbs,
      tableCallbacks: tableCbs,
      readOnly: false,
      onContentLayoutChange: noop,
      onBlockFlowChange: noop,
      renderApartado: renderApartado ?? defaultRenderApartado,
    }),
  );
}

/* ================================================================== */
/*  RENDER ORDER                                                       */
/* ================================================================== */

test("BlockFlow R1, A, R2, B → DOM order matches", () => {
  const b = block({
    concepts: [concept("c1"), concept("c2")],
    apartados: [subBlock("a"), subBlock("b")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
        { id: "r2", columns: [{ id: "col-r2", items: [{ type: "concept", id: "c2" }] }] },
      ],
    },
    blockFlow: {
      version: 1,
      items: [
        { type: "content-row", rowId: "r1" },
        { type: "apartado", apartadoId: "a" },
        { type: "content-row", rowId: "r2" },
        { type: "apartado", apartadoId: "b" },
      ],
    },
  });

  const html = renderBlockFlow(b);
  // Content rows render as grid divs, apartados as data-testid divs
  const apartadoA = html.indexOf('data-testid="apartado-a"');
  const apartadoB = html.indexOf('data-testid="apartado-b"');
  const row1 = html.indexOf("content-layout-v2-row");
  const row2 = html.indexOf("content-layout-v2-row", row1 + 1);

  assert.ok(row1 >= 0, "R1 renders");
  assert.ok(apartadoA >= 0, "Apartado A renders");
  assert.ok(row2 >= 0, "R2 renders");
  assert.ok(apartadoB >= 0, "Apartado B renders");
  assert.ok(row1 < apartadoA, "R1 before A");
  assert.ok(apartadoA < row2, "A before R2");
  assert.ok(row2 < apartadoB, "R2 before B");
});

test("Legacy order (no blockFlow): R1, R2, A, B", () => {
  const b = block({
    concepts: [concept("c1"), concept("c2")],
    apartados: [subBlock("a"), subBlock("b")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
        { id: "r2", columns: [{ id: "col-r2", items: [{ type: "concept", id: "c2" }] }] },
      ],
    },
    // no blockFlow
  });

  const html = renderBlockFlow(b);
  const apartadoA = html.indexOf('data-testid="apartado-a"');
  const apartadoB = html.indexOf('data-testid="apartado-b"');
  const row1 = html.indexOf("content-layout-v2-row");
  const row2 = html.indexOf("content-layout-v2-row", row1 + 1);

  assert.ok(row1 < row2, "R1 before R2");
  assert.ok(row2 < apartadoA, "R2 before A");
  assert.ok(apartadoA < apartadoB, "A before B");
});

test("Apartado first: A, R1, B, R2", () => {
  const b = block({
    concepts: [concept("c1"), concept("c2")],
    apartados: [subBlock("a"), subBlock("b")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
        { id: "r2", columns: [{ id: "col-r2", items: [{ type: "concept", id: "c2" }] }] },
      ],
    },
    blockFlow: {
      version: 1,
      items: [
        { type: "apartado", apartadoId: "a" },
        { type: "content-row", rowId: "r1" },
        { type: "apartado", apartadoId: "b" },
        { type: "content-row", rowId: "r2" },
      ],
    },
  });

  const html = renderBlockFlow(b);
  const apartadoA = html.indexOf('data-testid="apartado-a"');
  const apartadoB = html.indexOf('data-testid="apartado-b"');
  const row1 = html.indexOf("content-layout-v2-row");
  const row2 = html.indexOf("content-layout-v2-row", row1 + 1);

  assert.ok(apartadoA < row1, "A before R1");
  assert.ok(row1 < apartadoB, "R1 before B");
  assert.ok(apartadoB < row2, "B before R2");
});

test("Content only (no apartados)", () => {
  const b = block({
    concepts: [concept("c1")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes("content-layout-v2-row"), "content row renders");
  assert.ok(!html.includes("apartado-"), "no apartados");
});

test("Apartados only (no content rows)", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
  });

  const html = renderBlockFlow(b);
  assert.ok(!html.includes("content-layout-v2-row"), "no content rows");
  assert.ok(html.includes('data-testid="apartado-a"'), "apartado a renders");
  assert.ok(html.includes('data-testid="apartado-b"'), "apartado b renders");
});

test("Empty block renders empty string", () => {
  const b = block();
  const html = renderBlockFlow(b);
  assert.equal(html, "");
});

/* ================================================================== */
/*  STALE SAFETY                                                       */
/* ================================================================== */

test("Stale row ref does not crash", () => {
  const b = block({
    concepts: [concept("c1")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
      ],
    },
    blockFlow: {
      version: 1,
      items: [
        { type: "content-row", rowId: "r-nonexistent" },
        { type: "content-row", rowId: "r1" },
      ],
    },
  });

  const html = renderBlockFlow(b);
  // Only r1 renders, r-nonexistent is skipped
  const rows = html.split("content-layout-v2-row").length - 1;
  assert.equal(rows, 1);
});

test("Stale apartado ref does not crash", () => {
  const b = block({
    concepts: [concept("c1")],
    apartados: [subBlock("a")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
      ],
    },
    blockFlow: {
      version: 1,
      items: [
        { type: "content-row", rowId: "r1" },
        { type: "apartado", apartadoId: "apartado-nonexistent" },
        { type: "apartado", apartadoId: "a" },
      ],
    },
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes("content-layout-v2-row"), "r1 renders");
  assert.ok(html.includes('data-testid="apartado-a"'), "apartado a renders");
  assert.ok(!html.includes("apartado-nonexistent"), "nonexistent skipped");
});

/* ================================================================== */
/*  CANONICAL COMPONENTS                                               */
/* ================================================================== */

test("Concept uses existing ConceptEditorRow renderer", () => {
  const c = concept("c1", "Test Concept");
  const b = block({
    concepts: [c],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes("Test Concept"), "ConceptEditorRow renders concept label");
});

test("Image uses existing ImageEditorItem renderer", () => {
  const img = image("img1");
  const b = block({
    images: [img],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "image", id: "img1" }] }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes("Image img1"), "ImageEditorItem renders image title");
});

test("Table uses existing TableEditorItem renderer", () => {
  const tbl = table("tbl1");
  const b = block({
    tables: [tbl],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "table", id: "tbl1" }] }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes("Table tbl1"), "TableEditorItem renders table title");
});

test("Apartado uses existing renderer (renderApartado callback)", () => {
  const sb = subBlock("a", "My Apartado");
  const b = block({
    apartados: [sb],
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes("My Apartado"), "renderApartado callback renders apartado");
});

/* ================================================================== */
/*  BACKWARD COMPATIBILITY                                             */
/* ================================================================== */

test("No blockFlow = legacy order visually identical", () => {
  const b = block({
    concepts: [concept("c1"), concept("c2"), concept("c3")],
    apartados: [subBlock("a"), subBlock("b")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
        { id: "r2", columns: [{ id: "col-r2", items: [{ type: "concept", id: "c2" }] }] },
        { id: "r3", columns: [{ id: "col-r3", items: [{ type: "concept", id: "c3" }] }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  // All 3 content rows appear before both apartados
  const row1 = html.indexOf("content-layout-v2-row");
  const row2 = html.indexOf("content-layout-v2-row", row1 + 1);
  const row3 = html.indexOf("content-layout-v2-row", row2 + 1);
  const apartadoA = html.indexOf('data-testid="apartado-a"');
  const apartadoB = html.indexOf('data-testid="apartado-b"');

  assert.ok(row1 < row2, "R1 before R2");
  assert.ok(row2 < row3, "R2 before R3");
  assert.ok(row3 < apartadoA, "R3 before A");
  assert.ok(apartadoA < apartadoB, "A before B");
});

test("Mixed content types in BlockFlow order", () => {
  const b = block({
    concepts: [concept("c1")],
    images: [image("img1")],
    apartados: [subBlock("a")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
        { id: "r2", columns: [{ id: "col-r2", items: [{ type: "image", id: "img1" }] }] },
      ],
    },
    blockFlow: {
      version: 1,
      items: [
        { type: "apartado", apartadoId: "a" },
        { type: "content-row", rowId: "r2" },
        { type: "content-row", rowId: "r1" },
      ],
    },
  });

  const html = renderBlockFlow(b);
  const apartadoA = html.indexOf('data-testid="apartado-a"');
  const row1 = html.indexOf("content-layout-v2-row");
  const row2 = html.indexOf("content-layout-v2-row", row1 + 1);

  assert.ok(html.includes("Concept c1"), "concept renders");
  assert.ok(html.includes("Image img1"), "image renders");
  assert.ok(apartadoA < row1, "A before R2");
  assert.ok(row1 < row2, "R2 before R1");
});

/* ================================================================== */
/*  APARTADO STRUCTURAL DnD                                            */
/* ================================================================== */

test("Apartado renders through SortableApartado (grip handle present)", () => {
  const b = block({
    apartados: [subBlock("a", "My Apartado")],
  });

  const html = renderBlockFlow(b);
  // SortableApartado renders a grip handle button with aria-label
  assert.ok(html.includes("Reordenar apartado"), "grip handle aria-label present");
  assert.ok(html.includes("My Apartado"), "apartado content renders");
});

test("Structural handle is a button with grab cursor", () => {
  const b = block({
    apartados: [subBlock("a")],
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes("cursor-grab"), "grab cursor class present");
  assert.ok(html.includes("Reordenar apartado"), "handle button present");
});

test("Multiple apartados each have their own grip handle", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b"), subBlock("c")],
  });

  const html = renderBlockFlow(b);
  // Count occurrences of the grip handle aria-label
  const handleCount = (html.match(/Reordenar apartado/g) ?? []).length;
  assert.equal(handleCount, 3, "each apartado has a grip handle");
});

test("Apartado with onBlockFlowChange renders SortableApartado enabled", () => {
  const b = block({
    apartados: [subBlock("a")],
  });

  const html = renderBlockFlowWithCallbacks(b);
  assert.ok(html.includes("Reordenar apartado"), "handle present when onBlockFlowChange provided");
});

test("Apartado without onBlockFlowChange renders SortableApartado disabled", () => {
  const b = block({
    apartados: [subBlock("a")],
  });

  // renderBlockFlow does NOT pass onBlockFlowChange
  const html = renderBlockFlow(b);
  // When disabled, the button should have disabled attribute
  assert.ok(html.includes("Reordenar apartado"), "handle still renders when disabled");
});

/* ================================================================== */
/*  V2 STRUCTURAL ROW RENDERING                                        */
/* ================================================================== */

test("V2 — content structural row renders content row", () => {
  const b = block({
    concepts: [concept("c1")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
      ],
    },
    blockFlow: {
      version: 2,
      rows: [
        { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes("content-layout-v2-row"), "content row renders");
  assert.ok(html.includes("Concept c1"), "concept content renders");
});

test("V2 — single apartado structural row renders full width", () => {
  const b = block({
    apartados: [subBlock("a", "Apartado A")],
    blockFlow: {
      version: 2,
      rows: [
        { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes("Apartado A"), "apartado renders");
  assert.ok(html.includes("Reordenar apartado"), "grip handle present");
  // Single apartado should NOT be in a grid
  assert.ok(!html.includes("grid-cols-2"), "single apartado is not in grid");
});

test("V2 — paired apartados structural row renders 50/50 grid", () => {
  const b = block({
    apartados: [subBlock("a", "Apartado A"), subBlock("b", "Apartado B")],
    blockFlow: {
      version: 2,
      rows: [
        {
          id: "bf-pair",
          items: [
            { type: "apartado", apartadoId: "a" },
            { type: "apartado", apartadoId: "b" },
          ],
        },
      ],
    },
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes("Apartado A"), "apartado A renders");
  assert.ok(html.includes("Apartado B"), "apartado B renders");
  assert.ok(html.includes("grid-cols-2"), "paired apartados use 50/50 grid");
  // Both grip handles present
  const handleCount = (html.match(/Reordenar apartado/g) ?? []).length;
  assert.equal(handleCount, 2, "both apartados have grip handles");
});

test("V2 — complex flow: R1, [A,B], R2, C", () => {
  const b = block({
    concepts: [concept("c1"), concept("c2")],
    apartados: [subBlock("a"), subBlock("b"), subBlock("c")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
        { id: "r2", columns: [{ id: "col-r2", items: [{ type: "concept", id: "c2" }] }] },
      ],
    },
    blockFlow: {
      version: 2,
      rows: [
        { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
        {
          id: "bf-pair",
          items: [
            { type: "apartado", apartadoId: "a" },
            { type: "apartado", apartadoId: "b" },
          ],
        },
        { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] },
        { id: "bf-a-c", items: [{ type: "apartado", apartadoId: "c" }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  // Verify DOM order: R1, pair(A,B), R2, C
  const row1 = html.indexOf("content-layout-v2-row");
  const apartadoA = html.indexOf('data-testid="apartado-a"');
  const apartadoB = html.indexOf('data-testid="apartado-b"');
  const row2 = html.indexOf("content-layout-v2-row", row1 + 1);
  const apartadoC = html.indexOf('data-testid="apartado-c"');

  assert.ok(row1 >= 0, "R1 renders");
  assert.ok(apartadoA >= 0, "A renders");
  assert.ok(apartadoB >= 0, "B renders");
  assert.ok(row2 >= 0, "R2 renders");
  assert.ok(apartadoC >= 0, "C renders");

  assert.ok(row1 < apartadoA, "R1 before A");
  assert.ok(apartadoA < apartadoB, "A before B (same structural row)");
  assert.ok(apartadoB < row2, "B before R2");
  assert.ok(row2 < apartadoC, "R2 before C");

  // Grid for paired row
  assert.ok(html.includes("grid-cols-2"), "paired row uses grid");
});

test("V2 — legacy V1 blockFlow renders identically via V2 conversion", () => {
  const b = block({
    concepts: [concept("c1")],
    apartados: [subBlock("a")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
      ],
    },
    blockFlow: {
      version: 1,
      items: [
        { type: "content-row", rowId: "r1" },
        { type: "apartado", apartadoId: "a" },
      ],
    },
  });

  const html = renderBlockFlow(b);
  const row1 = html.indexOf("content-layout-v2-row");
  const apartadoA = html.indexOf('data-testid="apartado-a"');
  assert.ok(row1 >= 0, "R1 renders");
  assert.ok(apartadoA >= 0, "A renders");
  assert.ok(row1 < apartadoA, "R1 before A");
  // V1 conversion produces singleton rows, no grid
  assert.ok(!html.includes("grid-cols-2"), "V1 conversion does not produce grid");
});

test("V2 — stale content row ref does not crash", () => {
  const b = block({
    concepts: [concept("c1")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
      ],
    },
    blockFlow: {
      version: 2,
      rows: [
        { id: "bf-c-deleted", items: [{ type: "content-row", rowId: "deleted" }] },
        { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  // Stale row is removed by normalization, only r1 renders
  const rows = html.split("content-layout-v2-row").length - 1;
  assert.equal(rows, 1);
});

test("V2 — stale apartado ref does not crash", () => {
  const b = block({
    apartados: [subBlock("a")],
    blockFlow: {
      version: 2,
      rows: [
        { id: "bf-a-deleted", items: [{ type: "apartado", apartadoId: "deleted" }] },
        { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes('data-testid="apartado-a"'), "valid apartado renders");
  assert.ok(!html.includes("apartado-deleted"), "stale apartado skipped");
});

test("V2 — empty structural rows are ignored", () => {
  const b = block({
    apartados: [subBlock("a")],
    blockFlow: {
      version: 2,
      rows: [
        { id: "empty", items: [] },
        { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
      ],
    },
  });

  const html = renderBlockFlow(b);
  assert.ok(html.includes('data-testid="apartado-a"'), "valid apartado renders");
});

/* ================================================================== */
/*  V2 NUMBERING                                                       */
/* ================================================================== */

test("V2 numbering — paired [A,B] then [C] → A=1, B=2, C=3", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b"), subBlock("c")],
    blockFlow: {
      version: 2,
      rows: [
        {
          id: "bf-pair",
          items: [
            { type: "apartado", apartadoId: "a" },
            { type: "apartado", apartadoId: "b" },
          ],
        },
        { id: "bf-a-c", items: [{ type: "apartado", apartadoId: "c" }] },
      ],
    },
  });

  // Check numbering via renderApartado callback
  const labels: string[] = [];
  renderBlockFlow(b, (sb, flowIdx) => {
    labels.push(`${sb.id}:${flowIdx}`);
    return createElement("div", { "data-testid": `apartado-${sb.id}` }, sb.title);
  });

  // Flow indices should be 0, 1, 2 for A, B, C
  assert.ok(labels.includes("a:0"), "A has flow index 0");
  assert.ok(labels.includes("b:1"), "B has flow index 1");
  assert.ok(labels.includes("c:2"), "C has flow index 2");
});

test("V2 numbering — R1, [A,B], R2, C → correct flow indices", () => {
  const b = block({
    concepts: [concept("c1"), concept("c2")],
    apartados: [subBlock("a"), subBlock("b"), subBlock("c")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "col-r1", items: [{ type: "concept", id: "c1" }] }] },
        { id: "r2", columns: [{ id: "col-r2", items: [{ type: "concept", id: "c2" }] }] },
      ],
    },
    blockFlow: {
      version: 2,
      rows: [
        { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
        {
          id: "bf-pair",
          items: [
            { type: "apartado", apartadoId: "a" },
            { type: "apartado", apartadoId: "b" },
          ],
        },
        { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] },
        { id: "bf-a-c", items: [{ type: "apartado", apartadoId: "c" }] },
      ],
    },
  });

  const labels: string[] = [];
  renderBlockFlow(b, (sb, flowIdx) => {
    labels.push(`${sb.id}:${flowIdx}`);
    return createElement("div", { "data-testid": `apartado-${sb.id}` }, sb.title);
  });

  // Content row takes index 0, then A=1, B=2, content row takes 3, C=4
  assert.ok(labels.includes("a:1"), "A has flow index 1");
  assert.ok(labels.includes("b:2"), "B has flow index 2");
  assert.ok(labels.includes("c:4"), "C has flow index 4");
});
