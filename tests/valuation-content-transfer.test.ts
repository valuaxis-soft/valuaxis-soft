import assert from "node:assert/strict";
import test from "node:test";
import type { Block, ContentLayoutV2, Apartado } from "../src/features/valuations/model";
import { moveContentItemAcrossContainers } from "../src/features/valuations/services/content-transfer";
import type { ContentContainerRef, ContentTransferDescriptor } from "../src/features/valuations/services/content-transfer";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function subBlock(id: string, overrides: Partial<Apartado> = {}): Apartado {
  return {
    id,
    title: `Apartado ${id}`,
    enabled: true,
    concepts: [],
    tables: [],
    images: [],
    ...overrides,
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

function v2Layout(rows: { id: string; cols: string[] }[]): ContentLayoutV2 {
  return {
    version: 2,
    rows: rows.map((r) => ({
      id: r.id,
      columns: r.cols.map((colId) => ({
        id: colId,
        items: [{ type: "concept" as const, id: colId }],
      })),
    })),
  };
}

function v2LayoutWithType(rows: { id: string; cols: { id: string; type: "concept" | "image" | "table" }[] }[]): ContentLayoutV2 {
  return {
    version: 2,
    rows: rows.map((r) => ({
      id: r.id,
      columns: r.cols.map((c) => ({
        id: c.id,
        items: [{ type: c.type, id: c.id }],
      })),
    })),
  };
}

const SOURCE_BLOCK: ContentContainerRef = { kind: "block", blockId: "block-1" };
function DEST_APARTADO(apartadoId: string): ContentContainerRef {
  return { kind: "apartado", blockId: "block-1", apartadoId };
}

/* ================================================================== */
/*  CASE 1 — BLOCK → APARTADO (new row)                                */
/* ================================================================== */

test("CASE 1: Block → Apartado new row — B moves into empty Apartado X", () => {
  const b = block({
    concepts: [
      { id: "A", label: "A", value: "", enabled: true },
      { id: "B", label: "B", value: "", enabled: true },
    ],
    contentLayout: v2Layout([{ id: "R1", cols: ["A", "B"] }]),
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, true);

  // B removed from Block concepts
  const blockConcepts = result.block.concepts.map((c) => c.id);
  assert.deepEqual(blockConcepts, ["A"]);

  // Block R1 now has only A
  const blockLayout = result.block.contentLayout as ContentLayoutV2;
  assert.equal(blockLayout.rows.length, 1);
  assert.equal(blockLayout.rows[0].columns.length, 1);
  assert.equal(blockLayout.rows[0].columns[0].items[0].id, "A");

  // B added to Apartado X concepts
  const xBlock = result.block.apartados.find((s) => s.id === "X")!;
  assert.equal(xBlock.concepts.length, 1);
  assert.equal(xBlock.concepts[0].id, "B");

  // Apartado X layout has new row with B
  const xLayout = xBlock.contentLayout as ContentLayoutV2;
  assert.equal(xLayout.rows.length, 1);
  assert.equal(xLayout.rows[0].columns[0].items[0].id, "B");
});

/* ================================================================== */
/*  CASE 2 — BLOCK → APARTADO, SOURCE ROW EMPTIES                     */
/* ================================================================== */

test("CASE 2: Block → Apartado, source row empties — R1 removed + BlockFlow cleanup", () => {
  const b = block({
    concepts: [
      { id: "B", label: "B", value: "", enabled: true },
    ],
    contentLayout: v2Layout([{ id: "R1", cols: ["B"] }]),
    blockFlow: {
      version: 2,
      rows: [
        { id: "bf-r1", items: [{ type: "content-row", rowId: "R1" }] },
        { id: "bf-a-X", items: [{ type: "apartado", apartadoId: "X" }] },
      ],
    },
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, true);

  // B removed from Block
  assert.equal(result.block.concepts.length, 0);

  // Block layout: R1 gone (was only B)
  const blockLayout = result.block.contentLayout as ContentLayoutV2;
  assert.equal(blockLayout.rows.length, 0);

  // B added to Apartado X
  const xBlock = result.block.apartados.find((s) => s.id === "X")!;
  assert.equal(xBlock.concepts.length, 1);
  assert.equal(xBlock.concepts[0].id, "B");

  // BlockFlow: R1 reference removed
  const bf = result.block.blockFlow as import("../src/features/valuations/model").BlockFlowV2;
  const bfContentRows = bf.rows.filter((r) => r.items.some((i) => i.type === "content-row"));
  assert.equal(bfContentRows.length, 0, "no content-row refs in BlockFlow after source row emptied");
});

/* ================================================================== */
/*  CASE 3 — APARTADO → BLOCK NEW STRUCTURAL ROW                      */
/* ================================================================== */

test("CASE 3: Apartado → Block new structural row — B moves to Block after Apartado X", () => {
  const b = block({
    concepts: [
      { id: "A", label: "A", value: "", enabled: true },
    ],
    contentLayout: v2Layout([{ id: "R1", cols: ["A"] }]),
    blockFlow: {
      version: 2,
      rows: [
        { id: "bf-r1", items: [{ type: "content-row", rowId: "R1" }] },
        { id: "bf-a-X", items: [{ type: "apartado", apartadoId: "X" }] },
        { id: "bf-r2", items: [{ type: "content-row", rowId: "R2" }] },
      ],
    },
    apartados: [
      subBlock("X", {
        concepts: [{ id: "B", label: "B", value: "", enabled: true }],
        contentLayout: v2Layout([{ id: "RX", cols: ["B"] }]),
      }),
    ],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: DEST_APARTADO("X"),
    destination: SOURCE_BLOCK,
    destinationPlacement: { type: "new-row" },
    blockFlowPlacement: {
      targetStructuralRowId: "bf-a-X",
      placement: "after",
    },
  });

  assert.equal(result.changed, true);

  // B removed from Apartado X
  const xBlock = result.block.apartados.find((s) => s.id === "X")!;
  assert.equal(xBlock.concepts.length, 0);

  // B added to Block concepts
  const blockConcepts = result.block.concepts.map((c) => c.id);
  assert.ok(blockConcepts.includes("B"), "B is in Block concepts");

  // Block layout: new row RB added
  const blockLayout = result.block.contentLayout as ContentLayoutV2;
  assert.equal(blockLayout.rows.length, 2); // R1 + new RB

  // BlockFlow: new content-row inserted after Partado X
  const bf = result.block.blockFlow as import("../src/features/valuations/model").BlockFlowV2;
  const bfItemTypes = bf.rows.map((r) => r.items[0].type);
  assert.deepEqual(bfItemTypes, ["content-row", "apartado", "content-row", "content-row"]);
});

/* ================================================================== */
/*  CASE 4 — APARTADO → BLOCK EXISTING ROW                            */
/* ================================================================== */

test("CASE 4: Apartado → Block existing row — B moves RIGHT of A", () => {
  const b = block({
    concepts: [
      { id: "A", label: "A", value: "", enabled: true },
    ],
    contentLayout: v2Layout([{ id: "R1", cols: ["A"] }]),
    apartados: [
      subBlock("X", {
        concepts: [{ id: "B", label: "B", value: "", enabled: true }],
        contentLayout: v2Layout([{ id: "RX", cols: ["B"] }]),
      }),
    ],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: DEST_APARTADO("X"),
    destination: SOURCE_BLOCK,
    destinationPlacement: { type: "after-column", anchorColumnId: "A" },
  });

  assert.equal(result.changed, true);

  // B removed from Apartado X
  const xBlock = result.block.apartados.find((s) => s.id === "X")!;
  assert.equal(xBlock.concepts.length, 0);

  // Block R1 now has A, B
  const blockLayout = result.block.contentLayout as ContentLayoutV2;
  assert.equal(blockLayout.rows.length, 1);
  assert.equal(blockLayout.rows[0].columns.length, 2);
  assert.equal(blockLayout.rows[0].columns[0].items[0].id, "A");
  assert.equal(blockLayout.rows[0].columns[1].items[0].id, "B");
});

/* ================================================================== */
/*  CASE 5 — APARTADO A → APARTADO B                                  */
/* ================================================================== */

test("CASE 5: Apartado A → Apartado B — B moves RIGHT of Y", () => {
  const b = block({
    apartados: [
      subBlock("A", {
        concepts: [
          { id: "X", label: "X", value: "", enabled: true },
          { id: "B", label: "B", value: "", enabled: true },
        ],
        contentLayout: v2Layout([{ id: "RA", cols: ["X", "B"] }]),
      }),
      subBlock("B", {
        concepts: [{ id: "Y", label: "Y", value: "", enabled: true }],
        contentLayout: v2Layout([{ id: "RB", cols: ["Y"] }]),
      }),
    ],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: DEST_APARTADO("A"),
    destination: DEST_APARTADO("B"),
    destinationPlacement: { type: "after-column", anchorColumnId: "Y" },
  });

  assert.equal(result.changed, true);

  // Apartado A: X remains, B gone
  const aBlock = result.block.apartados.find((s) => s.id === "A")!;
  const aConcepts = aBlock.concepts.map((c) => c.id);
  assert.deepEqual(aConcepts, ["X"]);

  // Apartado B: Y, B
  const bBlock = result.block.apartados.find((s) => s.id === "B")!;
  const bConcepts = bBlock.concepts.map((c) => c.id);
  assert.deepEqual(bConcepts, ["Y", "B"]);

  // BlockFlow unchanged (no Block-level changes)
  assert.equal(result.block.blockFlow, undefined);
});

/* ================================================================== */
/*  CASE 6 — SOURCE APARTADO ROW EMPTIES                              */
/* ================================================================== */

test("CASE 6: Source Apartado row empties — RA disappears", () => {
  const b = block({
    apartados: [
      subBlock("A", {
        concepts: [{ id: "B", label: "B", value: "", enabled: true }],
        contentLayout: v2Layout([{ id: "RA", cols: ["B"] }]),
      }),
      subBlock("B", {
        concepts: [{ id: "Y", label: "Y", value: "", enabled: true }],
        contentLayout: v2Layout([{ id: "RB", cols: ["Y"] }]),
      }),
    ],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: DEST_APARTADO("A"),
    destination: DEST_APARTADO("B"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, true);

  // Apartado A: empty
  const aBlock = result.block.apartados.find((s) => s.id === "A")!;
  assert.equal(aBlock.concepts.length, 0);

  // Apartado A layout: no rows (empty removed)
  const aLayout = aBlock.contentLayout as ContentLayoutV2;
  assert.equal(aLayout.rows.length, 0);

  // Apartado B: has Y and B
  const bBlock = result.block.apartados.find((s) => s.id === "B")!;
  assert.equal(bBlock.concepts.length, 2);
});

/* ================================================================== */
/*  FAILURE CASES                                                      */
/* ================================================================== */

test("failure: item not found in source business array", () => {
  const b = block({
    concepts: [{ id: "A", label: "A", value: "", enabled: true }],
    contentLayout: v2Layout([{ id: "R1", cols: ["A"] }]),
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "NONEXISTENT",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, false);
  assert.ok(result.reason?.includes("not found"));
});

test("auto-converts V1/missing source layout to V2", () => {
  const b = block({
    concepts: [{ id: "A", label: "A", value: "", enabled: true }],
    // No contentLayout — auto-converts to V2
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "A",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  // Auto-conversion succeeds: concept extracted from resolved V2 layout
  assert.equal(result.changed, true);
  assert.ok(!result.block.concepts.some((c) => c.id === "A"));
});

test("failure: destination not found", () => {
  const b = block({
    concepts: [{ id: "A", label: "A", value: "", enabled: true }],
    contentLayout: v2Layout([{ id: "R1", cols: ["A"] }]),
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "A",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("NONEXISTENT"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, false);
  assert.ok(result.reason?.includes("not found"));
});

test("failure: Block destination new-row without blockFlowPlacement", () => {
  const b = block({
    concepts: [{ id: "A", label: "A", value: "", enabled: true }],
    contentLayout: v2Layout([{ id: "R1", cols: ["A"] }]),
    apartados: [subBlock("X", {
      concepts: [{ id: "B", label: "B", value: "", enabled: true }],
      contentLayout: v2Layout([{ id: "RX", cols: ["B"] }]),
    })],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: DEST_APARTADO("X"),
    destination: SOURCE_BLOCK,
    destinationPlacement: { type: "new-row" },
    // No blockFlowPlacement
  });

  assert.equal(result.changed, false);
  assert.ok(result.reason?.includes("blockFlowPlacement"));
});

test("failure: destination anchor column not found", () => {
  const b = block({
    concepts: [{ id: "A", label: "A", value: "", enabled: true }],
    contentLayout: v2Layout([{ id: "R1", cols: ["A"] }]),
    apartados: [subBlock("X", {
      concepts: [{ id: "B", label: "B", value: "", enabled: true }],
      contentLayout: v2Layout([{ id: "RX", cols: ["B"] }]),
    })],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: DEST_APARTADO("X"),
    destination: SOURCE_BLOCK,
    destinationPlacement: { type: "after-column", anchorColumnId: "NONEXISTENT" },
  });

  assert.equal(result.changed, false);
  assert.ok(result.reason?.includes("rejected"));
});

test("failure: destination row capacity full", () => {
  const b = block({
    concepts: [
      { id: "A", label: "A", value: "", enabled: true },
      { id: "B2", label: "B2", value: "", enabled: true },
      { id: "C", label: "C", value: "", enabled: true },
    ],
    contentLayout: v2Layout([{ id: "R1", cols: ["A", "B2", "C"] }]),
    apartados: [subBlock("X", {
      concepts: [{ id: "B", label: "B", value: "", enabled: true }],
      contentLayout: v2Layout([{ id: "RX", cols: ["B"] }]),
    })],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: DEST_APARTADO("X"),
    destination: SOURCE_BLOCK,
    destinationPlacement: { type: "after-column", anchorColumnId: "A" },
  });

  assert.equal(result.changed, false);
  assert.ok(result.reason?.includes("rejected"));
});

/* ================================================================== */
/*  IMMUTABILITY                                                       */
/* ================================================================== */

test("immutability: input block not mutated", () => {
  const originalConcepts = [{ id: "A", label: "A", value: "", enabled: true }];
  const originalSubBlocks = [subBlock("X")];
  const b = block({
    concepts: originalConcepts,
    contentLayout: v2Layout([{ id: "R1", cols: ["A"] }]),
    apartados: originalSubBlocks,
  });

  moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "A",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(b.concepts, originalConcepts, "concepts array not mutated");
  assert.equal(b.apartados, originalSubBlocks, "apartados array not mutated");
});

/* ================================================================== */
/*  TYPE COVERAGE                                                      */
/* ================================================================== */

test("Image transfer: Block → Apartado new row", () => {
  const b = block({
    images: [{ id: "IMG1", title: "Image 1", src: "", enabled: true }],
    contentLayout: v2LayoutWithType([{ id: "R1", cols: [{ id: "IMG1", type: "image" }] }]),
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "image",
    itemId: "IMG1",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, true);
  assert.equal(result.block.images.length, 0);
  const xBlock = result.block.apartados.find((s) => s.id === "X")!;
  assert.equal(xBlock.images.length, 1);
  assert.equal(xBlock.images[0].id, "IMG1");
});

test("Table transfer: Block → Apartado new row", () => {
  const b = block({
    tables: [{ id: "TBL1", title: "Table 1", columns: [], rows: [], enabled: true }],
    contentLayout: v2LayoutWithType([{ id: "R1", cols: [{ id: "TBL1", type: "table" }] }]),
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "table",
    itemId: "TBL1",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, true);
  assert.equal(result.block.tables.length, 0);
  const xBlock = result.block.apartados.find((s) => s.id === "X")!;
  assert.equal(xBlock.tables.length, 1);
  assert.equal(xBlock.tables[0].id, "TBL1");
});

/* ================================================================== */
/*  BUSINESS OBJECT PRESERVATION                                       */
/* ================================================================== */

test("business object: same ID and all fields preserved", () => {
  const concept = {
    id: "B",
    label: "My Concept",
    value: "42",
    type: "number" as const,
    enabled: true,
    layoutSpan: "full" as const,
  };

  const b = block({
    concepts: [
      { id: "A", label: "A", value: "", enabled: true },
      concept,
    ],
    contentLayout: v2Layout([{ id: "R1", cols: ["A", "B"] }]),
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, true);

  const xBlock = result.block.apartados.find((s) => s.id === "X")!;
  const movedConcept = xBlock.concepts[0];
  assert.equal(movedConcept.id, "B");
  assert.equal(movedConcept.label, "My Concept");
  assert.equal(movedConcept.value, "42");
  assert.equal(movedConcept.type, "number");
  assert.equal(movedConcept.layoutSpan, "full");
});

/* ================================================================== */
/*  NO DUPLICATES                                                      */
/* ================================================================== */

test("no duplicates: item exists exactly once after move", () => {
  const b = block({
    concepts: [
      { id: "A", label: "A", value: "", enabled: true },
      { id: "B", label: "B", value: "", enabled: true },
    ],
    contentLayout: v2Layout([{ id: "R1", cols: ["A", "B"] }]),
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  // Check all concept arrays across block and apartados
  const allConceptIds: string[] = [];
  allConceptIds.push(...result.block.concepts.map((c) => c.id));
  for (const sb of result.block.apartados) {
    allConceptIds.push(...sb.concepts.map((c) => c.id));
  }

  const bCount = allConceptIds.filter((id) => id === "B").length;
  assert.equal(bCount, 1, "B exists exactly once");
});

/* ================================================================== */
/*  NEW ITEM — IMMEDIATE CROSS-CONTAINER TRANSFER                      */
/*  Items created but never moved should transfer without activation.   */
/* ================================================================== */

test("NEW Block Concept → Apartado: immediate transfer without prior move", () => {
  // Block has persisted V2 layout with existing concepts A, B
  // NEW concept C exists in business array only (not in persisted layout)
  const b = block({
    concepts: [
      { id: "A", label: "A", value: "", enabled: true },
      { id: "B", label: "B", value: "", enabled: true },
      { id: "C", label: "C", value: "", enabled: true }, // NEW — not in contentLayout
    ],
    contentLayout: v2Layout([{ id: "R1", cols: ["A", "B"] }]), // C is missing
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "C",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, true, "transfer succeeds for new item");
  assert.ok(!result.block.concepts.some((c) => c.id === "C"), "C removed from Block");
  assert.ok(result.block.apartados[0].concepts.some((c) => c.id === "C"), "C added to Apartado");
});

test("NEW Apartado Concept → Block: immediate transfer without prior move", () => {
  // Apartado X has persisted V2 layout with existing concept A
  // NEW concept B exists in business array only
  const b = block({
    concepts: [],
    contentLayout: v2Layout([]),
    blockFlow: {
      version: 2,
      rows: [
        { id: "sr-0", items: [{ type: "content-row", rowId: "R1" }] },
        { id: "sr-1", items: [{ type: "apartado", apartadoId: "X" }] },
      ],
    },
    apartados: [
      subBlock("X", {
        concepts: [
          { id: "A", label: "A", value: "", enabled: true },
          { id: "B", label: "B", value: "", enabled: true }, // NEW
        ],
        contentLayout: v2Layout([{ id: "R1", cols: ["A"] }]), // B missing
      }),
    ],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "B",
    source: DEST_APARTADO("X"),
    destination: SOURCE_BLOCK,
    destinationPlacement: { type: "new-row" },
    blockFlowPlacement: { targetStructuralRowId: "sr-0", placement: "after" },
  });

  assert.equal(result.changed, true, "transfer succeeds");
  assert.ok(result.block.concepts.some((c) => c.id === "B"), "B in Block");
  assert.ok(!result.block.apartados[0].concepts.some((c) => c.id === "B"), "B removed from Apartado");
});

test("NEW Apartado A Concept → Apartado B: immediate transfer", () => {
  const b = block({
    apartados: [
      subBlock("A", {
        concepts: [
          { id: "X", label: "X", value: "", enabled: true },
          { id: "Y", label: "Y", value: "", enabled: true }, // NEW
        ],
        contentLayout: v2Layout([{ id: "R1", cols: ["X"] }]), // Y missing
      }),
      subBlock("B", {
        concepts: [{ id: "Z", label: "Z", value: "", enabled: true }],
        contentLayout: v2Layout([{ id: "R1", cols: ["Z"] }]),
      }),
    ],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "concept",
    itemId: "Y",
    source: DEST_APARTADO("A"),
    destination: DEST_APARTADO("B"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, true, "A → B succeeds");
  assert.ok(!result.block.apartados[0].concepts.some((c) => c.id === "Y"), "Y removed from A");
  assert.ok(result.block.apartados[1].concepts.some((c) => c.id === "Y"), "Y added to B");
});

test("NEW Block Image → Apartado: immediate transfer", () => {
  const b = block({
    images: [
      { id: "IMG-1", title: "Img 1", src: "a.png" },
      { id: "IMG-NEW", title: "New", src: "new.png" }, // NEW
    ],
    contentLayout: {
      version: 2,
      rows: [{ id: "R1", columns: [{ id: "c-0-0", items: [{ type: "image", id: "IMG-1" }] }] }],
    },
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "image",
    itemId: "IMG-NEW",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, true, "image transfer succeeds");
  assert.ok(!result.block.images.some((i) => i.id === "IMG-NEW"), "IMG-NEW removed from Block");
  assert.ok(result.block.apartados[0].images.some((i) => i.id === "IMG-NEW"), "IMG-NEW in Apartado");
});

test("NEW Block Table → Apartado: immediate transfer", () => {
  const b = block({
    tables: [
      { id: "T-1", title: "Table 1", columns: [], rows: [] },
      { id: "T-NEW", title: "New Table", columns: [], rows: [] }, // NEW
    ],
    contentLayout: {
      version: 2,
      rows: [{ id: "R1", columns: [{ id: "c-0-0", items: [{ type: "table", id: "T-1" }] }] }],
    },
    apartados: [subBlock("X")],
  });

  const result = moveContentItemAcrossContainers(b, {
    itemType: "table",
    itemId: "T-NEW",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(result.changed, true, "table transfer succeeds");
  assert.ok(!result.block.tables.some((t) => t.id === "T-NEW"), "T-NEW removed from Block");
  assert.ok(result.block.apartados[0].tables.some((t) => t.id === "T-NEW"), "T-NEW in Apartado");
});

test("NEW item produces same result as post-activation transfer", () => {
  // Without prior move — immediate transfer
  const bNew = block({
    concepts: [
      { id: "A", label: "A", value: "", enabled: true },
      { id: "C", label: "C", value: "", enabled: true }, // NEW
    ],
    contentLayout: v2Layout([{ id: "R1", cols: ["A"] }]),
    apartados: [subBlock("X")],
  });

  const resultNew = moveContentItemAcrossContainers(bNew, {
    itemType: "concept",
    itemId: "C",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  // With persisted layout (simulating after same-container move)
  const bPersisted = block({
    concepts: [
      { id: "A", label: "A", value: "", enabled: true },
      { id: "C", label: "C", value: "", enabled: true },
    ],
    contentLayout: v2Layout([{ id: "R1", cols: ["A", "C"] }]), // C is persisted
    apartados: [subBlock("X")],
  });

  const resultPersisted = moveContentItemAcrossContainers(bPersisted, {
    itemType: "concept",
    itemId: "C",
    source: SOURCE_BLOCK,
    destination: DEST_APARTADO("X"),
    destinationPlacement: { type: "new-row" },
  });

  assert.equal(resultNew.changed, true, "new item transfer succeeds");
  assert.equal(resultPersisted.changed, true, "persisted item transfer succeeds");
  // Both should produce equivalent outcomes
  assert.equal(
    resultNew.block.concepts.length,
    resultPersisted.block.concepts.length,
    "same Block concept count",
  );
  assert.equal(
    resultNew.block.apartados[0].concepts.length,
    resultPersisted.block.apartados[0].concepts.length,
    "same Apartado concept count",
  );
});
