import assert from "node:assert/strict";
import test from "node:test";
import type { Block, BlockFlow, BlockFlowV2, Apartado } from "../src/features/valuations/model";
import {
  isBlockFlow,
  generateBlockFlow,
  normalizeBlockFlow,
  resolveBlockFlow,
  moveBlockFlowItem,
  moveBlockFlowV2Apartado,
  insertContentRowIntoBlockFlowV2,
  removeContentRowsFromBlockFlowV2,
  moveContentColumnToBlockFlowBoundary,
} from "../src/features/valuations/services/block-flow";
import { hydrateBlockMetadata, blockMetadataFromContent } from "../src/features/valuations/metadata";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function subBlock(id: string): Apartado {
  return { id, title: `Apartado ${id}`, enabled: true, concepts: [], tables: [], images: [] };
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

/* ================================================================== */
/*  MODEL / GUARD — isBlockFlow                                        */
/* ================================================================== */

test("isBlockFlow — valid empty BlockFlow", () => {
  assert.equal(isBlockFlow({ version: 1, items: [] }), true);
});

test("isBlockFlow — valid mixed BlockFlow", () => {
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "apartado", apartadoId: "a1" },
      { type: "content-row", rowId: "r2" },
    ],
  };
  assert.equal(isBlockFlow(flow), true);
});

test("isBlockFlow — wrong version", () => {
  assert.equal(isBlockFlow({ version: 2, items: [] }), false);
});

test("isBlockFlow — missing version", () => {
  assert.equal(isBlockFlow({ items: [] }), false);
});

test("isBlockFlow — null", () => {
  assert.equal(isBlockFlow(null), false);
});

test("isBlockFlow — undefined", () => {
  assert.equal(isBlockFlow(undefined), false);
});

test("isBlockFlow — array", () => {
  assert.equal(isBlockFlow([]), false);
});

test("isBlockFlow — items not array", () => {
  assert.equal(isBlockFlow({ version: 1, items: "bad" }), false);
});

test("isBlockFlow — unknown item type", () => {
  assert.equal(
    isBlockFlow({ version: 1, items: [{ type: "unknown" }] }),
    false,
  );
});

test("isBlockFlow — content-row with empty rowId", () => {
  assert.equal(
    isBlockFlow({ version: 1, items: [{ type: "content-row", rowId: "" }] }),
    false,
  );
});

test("isBlockFlow — apartado with empty apartadoId", () => {
  assert.equal(
    isBlockFlow({ version: 1, items: [{ type: "apartado", apartadoId: "" }] }),
    false,
  );
});

test("isBlockFlow — content-row with missing rowId", () => {
  assert.equal(
    isBlockFlow({ version: 1, items: [{ type: "content-row" }] }),
    false,
  );
});

test("isBlockFlow — item not an object", () => {
  assert.equal(isBlockFlow({ version: 1, items: ["bad"] }), false);
});

/* ================================================================== */
/*  GENERATION — generateBlockFlow                                     */
/* ================================================================== */

test("generateBlockFlow — content rows R1 R2 + apartados A B → R1 R2 A B", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "c1", items: [] }] },
        { id: "r2", columns: [{ id: "c2", items: [] }] },
      ],
    },
  });
  const flow = generateBlockFlow(b)!;
  assert.equal(flow.version, 1);
  assert.equal(flow.items.length, 4);
  assert.deepEqual(flow.items[0], { type: "content-row", rowId: "r1" });
  assert.deepEqual(flow.items[1], { type: "content-row", rowId: "r2" });
  assert.deepEqual(flow.items[2], { type: "apartado", apartadoId: "a" });
  assert.deepEqual(flow.items[3], { type: "apartado", apartadoId: "b" });
});

test("generateBlockFlow — content only", () => {
  const b = block({
    contentLayout: {
      version: 2,
      rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }],
    },
  });
  const flow = generateBlockFlow(b)!;
  assert.equal(flow.items.length, 1);
  assert.deepEqual(flow.items[0], { type: "content-row", rowId: "r1" });
});

test("generateBlockFlow — apartados only", () => {
  const b = block({ apartados: [subBlock("a"), subBlock("b")] });
  const flow = generateBlockFlow(b)!;
  assert.equal(flow.items.length, 2);
  assert.deepEqual(flow.items[0], { type: "apartado", apartadoId: "a" });
  assert.deepEqual(flow.items[1], { type: "apartado", apartadoId: "b" });
});

test("generateBlockFlow — empty block → undefined", () => {
  const b = block();
  assert.equal(generateBlockFlow(b), undefined);
});

test("generateBlockFlow — V1 contentLayout treated as empty rows", () => {
  // V1 layouts resolve via content-layout-v2.ts canonical resolver.
  // If block has only V1 layout with no V2 rows resolved, only apartados appear.
  const b = block({
    contentLayout: [
      { type: "concept", id: "c1", span: 12 },
    ],
    apartados: [subBlock("a")],
  });
  const flow = generateBlockFlow(b)!;
  // V1 items get resolved into V2 rows by the canonical resolver.
  // At minimum we expect the apartado to be present.
  const apartadoItems = flow.items.filter((i) => i.type === "apartado");
  assert.equal(apartadoItems.length, 1);
});

/* ================================================================== */
/*  NORMALIZATION — normalizeBlockFlow                                  */
/* ================================================================== */

test("normalizeBlockFlow — preserve valid order R1 A R2 B", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "c1", items: [] }] },
        { id: "r2", columns: [{ id: "c2", items: [] }] },
      ],
    },
  });
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "apartado", apartadoId: "a" },
      { type: "content-row", rowId: "r2" },
      { type: "apartado", apartadoId: "b" },
    ],
  };
  const result = normalizeBlockFlow(b, flow);
  assert.equal(result.items.length, 4);
  assert.deepEqual(result.items[0], { type: "content-row", rowId: "r1" });
  assert.deepEqual(result.items[1], { type: "apartado", apartadoId: "a" });
  assert.deepEqual(result.items[2], { type: "content-row", rowId: "r2" });
  assert.deepEqual(result.items[3], { type: "apartado", apartadoId: "b" });
});

test("normalizeBlockFlow — stale row ref removed", () => {
  const b = block({
    contentLayout: {
      version: 2,
      rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }],
    },
  });
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "content-row", rowId: "deleted-row" },
    ],
  };
  const result = normalizeBlockFlow(b, flow);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], { type: "content-row", rowId: "r1" });
});

test("normalizeBlockFlow — stale apartado removed", () => {
  const b = block({
    apartados: [subBlock("a")],
  });
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "apartado", apartadoId: "a" },
      { type: "apartado", apartadoId: "deleted" },
    ],
  };
  const result = normalizeBlockFlow(b, flow);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], { type: "apartado", apartadoId: "a" });
});

test("normalizeBlockFlow — duplicate row removed, keeps first", () => {
  const b = block({
    contentLayout: {
      version: 2,
      rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }],
    },
  });
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "content-row", rowId: "r1" },
    ],
  };
  const result = normalizeBlockFlow(b, flow);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], { type: "content-row", rowId: "r1" });
});

test("normalizeBlockFlow — duplicate apartado removed, keeps first", () => {
  const b = block({
    apartados: [subBlock("a")],
  });
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "apartado", apartadoId: "a" },
      { type: "apartado", apartadoId: "a" },
    ],
  };
  const result = normalizeBlockFlow(b, flow);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], { type: "apartado", apartadoId: "a" });
});

test("normalizeBlockFlow — missing content row appended", () => {
  const b = block({
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "c1", items: [] }] },
        { id: "r2", columns: [{ id: "c2", items: [] }] },
      ],
    },
  });
  const flow: BlockFlow = {
    version: 1,
    items: [{ type: "content-row", rowId: "r1" }],
  };
  const result = normalizeBlockFlow(b, flow);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], { type: "content-row", rowId: "r1" });
  assert.deepEqual(result.items[1], { type: "content-row", rowId: "r2" });
});

test("normalizeBlockFlow — missing apartado appended", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
  });
  const flow: BlockFlow = {
    version: 1,
    items: [{ type: "apartado", apartadoId: "a" }],
  };
  const result = normalizeBlockFlow(b, flow);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], { type: "apartado", apartadoId: "a" });
  assert.deepEqual(result.items[1], { type: "apartado", apartadoId: "b" });
});

test("normalizeBlockFlow — no mutation of input flow", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: {
      version: 2,
      rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }],
    },
  });
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "apartado", apartadoId: "a" },
    ],
  };
  const originalItems = [...flow.items];
  normalizeBlockFlow(b, flow);
  assert.deepEqual(flow.items, originalItems);
});

test("normalizeBlockFlow — no mutation of block", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: {
      version: 2,
      rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }],
    },
  });
  const flow: BlockFlow = {
    version: 1,
    items: [],
  };
  normalizeBlockFlow(b, flow);
  assert.equal(b.apartados.length, 1);
  assert.equal(b.apartados[0].id, "a");
});

test("normalizeBlockFlow — empty flow + live data → all appended", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: {
      version: 2,
      rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }],
    },
  });
  const flow: BlockFlow = { version: 1, items: [] };
  const result = normalizeBlockFlow(b, flow);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], { type: "content-row", rowId: "r1" });
  assert.deepEqual(result.items[1], { type: "apartado", apartadoId: "a" });
});

/* ================================================================== */
/*  RESOLUTION — resolveBlockFlow                                       */
/* ================================================================== */

test("resolveBlockFlow — no blockFlow → generate default", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: {
      version: 2,
      rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }],
    },
  });
  const flow = resolveBlockFlow(b)!;
  assert.equal(flow.version, 1);
  assert.equal(flow.items.length, 2);
  assert.deepEqual(flow.items[0], { type: "content-row", rowId: "r1" });
  assert.deepEqual(flow.items[1], { type: "apartado", apartadoId: "a" });
});

test("resolveBlockFlow — valid blockFlow → normalize", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "c1", items: [] }] },
        { id: "r2", columns: [{ id: "c2", items: [] }] },
      ],
    },
    blockFlow: {
      version: 1,
      items: [
        { type: "apartado", apartadoId: "a" },
        { type: "content-row", rowId: "r1" },
        { type: "apartado", apartadoId: "b" },
      ],
    },
  });
  const flow = resolveBlockFlow(b)!;
  // a stays first (user order), r1 second, b third, r2 appended (missing)
  assert.equal(flow.items.length, 4);
  assert.deepEqual(flow.items[0], { type: "apartado", apartadoId: "a" });
  assert.deepEqual(flow.items[1], { type: "content-row", rowId: "r1" });
  assert.deepEqual(flow.items[2], { type: "apartado", apartadoId: "b" });
  assert.deepEqual(flow.items[3], { type: "content-row", rowId: "r2" });
});

test("resolveBlockFlow — malformed blockFlow → generate default", () => {
  const b = block({
    apartados: [subBlock("a")],
    blockFlow: { version: 99, items: [] } as never,
  });
  const flow = resolveBlockFlow(b)!;
  assert.equal(flow.items.length, 1);
  assert.deepEqual(flow.items[0], { type: "apartado", apartadoId: "a" });
});

test("resolveBlockFlow — empty block → undefined", () => {
  const b = block();
  assert.equal(resolveBlockFlow(b), undefined);
});

/* ================================================================== */
/*  PERSISTENCE — metadata round-trip                                   */
/* ================================================================== */

test("hydrateBlockMetadata — blockFlow present and valid", () => {
  const config = {
    blockFlow: {
      version: 1,
      items: [
        { type: "content-row", rowId: "r1" },
        { type: "apartado", apartadoId: "a1" },
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);
  assert.ok(meta.blockFlow);
  assert.equal(meta.blockFlow.version, 1);
  assert.equal(meta.blockFlow.items.length, 2);
});

test("hydrateBlockMetadata — blockFlow under payload", () => {
  const config = {
    payload: {
      blockFlow: {
        version: 1,
        items: [{ type: "apartado", apartadoId: "x" }],
      },
    },
  };
  const meta = hydrateBlockMetadata(config);
  assert.ok(meta.blockFlow);
  assert.equal(meta.blockFlow.version, 1);
  if (meta.blockFlow.version === 1) {
    assert.equal(meta.blockFlow.items.length, 1);
  }
});

test("hydrateBlockMetadata — blockFlow absent → undefined", () => {
  const meta = hydrateBlockMetadata({});
  assert.equal(meta.blockFlow, undefined);
});

test("hydrateBlockMetadata — malformed blockFlow → undefined", () => {
  const meta = hydrateBlockMetadata({ blockFlow: { version: 99, items: [] } });
  assert.equal(meta.blockFlow, undefined);
});

test("hydrateBlockMetadata — config null → undefined blockFlow", () => {
  const meta = hydrateBlockMetadata(null);
  assert.equal(meta.blockFlow, undefined);
});

test("blockMetadataFromContent — serializes blockFlow when present", () => {
  const flow: BlockFlow = {
    version: 1,
    items: [{ type: "content-row", rowId: "r1" }],
  };
  const meta = blockMetadataFromContent({ enabled: true, blockFlow: flow });
  assert.ok(meta.blockFlow);
  assert.equal(meta.blockFlow.version, 1);
  assert.equal(meta.blockFlow.items.length, 1);
});

test("blockMetadataFromContent — blockFlow undefined when absent", () => {
  const meta = blockMetadataFromContent({ enabled: true });
  assert.equal(meta.blockFlow, undefined);
});

test("metadata round-trip — serialize then hydrate", () => {
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "apartado", apartadoId: "a1" },
    ],
  };
  const serialized = blockMetadataFromContent({ enabled: true, blockFlow: flow });
  const hydrated = hydrateBlockMetadata(serialized);
  assert.ok(hydrated.blockFlow);
  assert.equal(hydrated.blockFlow.version, 1);
  assert.equal(hydrated.blockFlow.items.length, 2);
  assert.deepEqual(hydrated.blockFlow.items[0], { type: "content-row", rowId: "r1" });
  assert.deepEqual(hydrated.blockFlow.items[1], { type: "apartado", apartadoId: "a1" });
});

/* ================================================================== */
/*  BACKWARD COMPATIBILITY                                              */
/* ================================================================== */

test("backward compat — old valuation without blockFlow renders identically", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "c1", items: [] }] },
        { id: "r2", columns: [{ id: "c2", items: [] }] },
      ],
    },
    // blockFlow is undefined (old valuation)
  });
  const flow = resolveBlockFlow(b)!;
  // Default order: R1, R2, A, B
  assert.equal(flow.items.length, 4);
  assert.deepEqual(flow.items, [
    { type: "content-row", rowId: "r1" },
    { type: "content-row", rowId: "r2" },
    { type: "apartado", apartadoId: "a" },
    { type: "apartado", apartadoId: "b" },
  ]);
});

test("backward compat — blockFlow not auto-written on load", () => {
  const b = block({ apartados: [subBlock("a")] });
  // Simulate: old valuation loaded, blockFlow should remain undefined
  assert.equal(b.blockFlow, undefined);
  // resolveBlockFlow generates on-the-fly but does NOT mutate block
  resolveBlockFlow(b);
  assert.equal(b.blockFlow, undefined);
});

/* ================================================================== */
/*  NO BUSINESS DATA DUPLICATION                                        */
/* ================================================================== */

test("no business data duplication — BlockFlow items are references only", () => {
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "apartado", apartadoId: "a1" },
    ],
  };
  // Verify items contain only string IDs, no Concept/Image/Table/SubBlock objects
  for (const item of flow.items) {
    const keys = Object.keys(item);
    assert.ok(keys.length <= 2); // type + id field
    assert.ok(!keys.includes("concepts"));
    assert.ok(!keys.includes("images"));
    assert.ok(!keys.includes("tables"));
    assert.ok(!keys.includes("title"));
    assert.ok(!keys.includes("enabled"));
  }
});

/* ================================================================== */
/*  STRUCTURAL MOVE — moveBlockFlowItem                                */
/* ================================================================== */

const flowR1AR2B: BlockFlow = {
  version: 1,
  items: [
    { type: "content-row", rowId: "r1" },
    { type: "apartado", apartadoId: "a" },
    { type: "content-row", rowId: "r2" },
    { type: "apartado", apartadoId: "b" },
  ],
};

test("moveBlockFlowItem — B before A → R1 B A R2", () => {
  const result = moveBlockFlowItem(flowR1AR2B, {
    sourceType: "apartado",
    sourceId: "b",
    targetType: "apartado",
    targetId: "a",
    placement: "before",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(result.flow.items, [
    { type: "content-row", rowId: "r1" },
    { type: "apartado", apartadoId: "b" },
    { type: "apartado", apartadoId: "a" },
    { type: "content-row", rowId: "r2" },
  ]);
});

test("moveBlockFlowItem — A after R2 → R1 R2 A B", () => {
  const result = moveBlockFlowItem(flowR1AR2B, {
    sourceType: "apartado",
    sourceId: "a",
    targetType: "content-row",
    targetId: "r2",
    placement: "after",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(result.flow.items, [
    { type: "content-row", rowId: "r1" },
    { type: "content-row", rowId: "r2" },
    { type: "apartado", apartadoId: "a" },
    { type: "apartado", apartadoId: "b" },
  ]);
});

test("moveBlockFlowItem — B before R1 → B R1 A R2", () => {
  const result = moveBlockFlowItem(flowR1AR2B, {
    sourceType: "apartado",
    sourceId: "b",
    targetType: "content-row",
    targetId: "r1",
    placement: "before",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(result.flow.items, [
    { type: "apartado", apartadoId: "b" },
    { type: "content-row", rowId: "r1" },
    { type: "apartado", apartadoId: "a" },
    { type: "content-row", rowId: "r2" },
  ]);
});

test("moveBlockFlowItem — invalid source → unchanged", () => {
  const result = moveBlockFlowItem(flowR1AR2B, {
    sourceType: "apartado",
    sourceId: "nonexistent",
    targetType: "apartado",
    targetId: "a",
    placement: "before",
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.flow.items, flowR1AR2B.items);
});

test("moveBlockFlowItem — invalid target → unchanged", () => {
  const result = moveBlockFlowItem(flowR1AR2B, {
    sourceType: "apartado",
    sourceId: "a",
    targetType: "apartado",
    targetId: "nonexistent",
    placement: "before",
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.flow.items, flowR1AR2B.items);
});

test("moveBlockFlowItem — same source/target → unchanged", () => {
  const result = moveBlockFlowItem(flowR1AR2B, {
    sourceType: "apartado",
    sourceId: "a",
    targetType: "apartado",
    targetId: "a",
    placement: "before",
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.flow.items, flowR1AR2B.items);
});

test("moveBlockFlowItem — content-row source → unchanged (not supported yet)", () => {
  const result = moveBlockFlowItem(flowR1AR2B, {
    sourceType: "content-row",
    sourceId: "r1",
    targetType: "apartado",
    targetId: "a",
    placement: "before",
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.flow.items, flowR1AR2B.items);
});

test("moveBlockFlowItem — no mutation of input flow", () => {
  const original = [...flowR1AR2B.items];
  moveBlockFlowItem(flowR1AR2B, {
    sourceType: "apartado",
    sourceId: "b",
    targetType: "apartado",
    targetId: "a",
    placement: "before",
  });
  assert.deepEqual(flowR1AR2B.items, original);
});

test("moveBlockFlowItem — no duplicate/loss of items", () => {
  const result = moveBlockFlowItem(flowR1AR2B, {
    sourceType: "apartado",
    sourceId: "b",
    targetType: "apartado",
    targetId: "a",
    placement: "before",
  });
  assert.equal(result.changed, true);
  assert.equal(result.flow.items.length, flowR1AR2B.items.length);
  const ids = result.flow.items.map((item) =>
    item.type === "apartado" ? `a:${item.apartadoId}` : `r:${item.rowId}`,
  );
  assert.equal(new Set(ids).size, ids.length, "no duplicates");
});

/* ================================================================== */
/*  NATIVE V2 STRUCTURAL MOVE — moveBlockFlowV2Apartado                */
/* ================================================================== */

const flowV2_AB: BlockFlowV2 = {
  version: 2,
  rows: [
    { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
    { id: "bf-a-b", items: [{ type: "apartado", apartadoId: "b" }] },
  ],
};

const flowV2_R1AR2B: BlockFlowV2 = {
  version: 2,
  rows: [
    { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
    { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
    { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] },
    { id: "bf-a-b", items: [{ type: "apartado", apartadoId: "b" }] },
  ],
};

const flowV2_pair_AB_C: BlockFlowV2 = {
  version: 2,
  rows: [
    { id: "bf-pair", items: [
      { type: "apartado", apartadoId: "a" },
      { type: "apartado", apartadoId: "b" },
    ]},
    { id: "bf-a-c", items: [{ type: "apartado", apartadoId: "c" }] },
  ],
};

test("V2 move — B right of A → [A,B]", () => {
  const result = moveBlockFlowV2Apartado(flowV2_AB, {
    apartadoId: "b",
    target: { type: "apartado", apartadoId: "a", placement: "right" },
  });
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 1);
  assert.deepEqual(result.flow.rows[0].items, [
    { type: "apartado", apartadoId: "a" },
    { type: "apartado", apartadoId: "b" },
  ]);
});

test("V2 move — B left of A → [B,A]", () => {
  const result = moveBlockFlowV2Apartado(flowV2_AB, {
    apartadoId: "b",
    target: { type: "apartado", apartadoId: "a", placement: "left" },
  });
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 1);
  assert.deepEqual(result.flow.rows[0].items, [
    { type: "apartado", apartadoId: "b" },
    { type: "apartado", apartadoId: "a" },
  ]);
});

test("V2 move — B after row containing R1 → [A], R1, [B]", () => {
  const result = moveBlockFlowV2Apartado(flowV2_R1AR2B, {
    apartadoId: "b",
    target: { type: "structural-row", rowId: "bf-c-r1", placement: "after" },
  });
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 4);
  // B extracted from its old row, new singleton row created after R1
  const rowIds = result.flow.rows.map((r) => r.id);
  const r1Idx = rowIds.indexOf("bf-c-r1");
  const bRow = result.flow.rows[r1Idx + 1];
  assert.deepEqual(bRow.items, [{ type: "apartado", apartadoId: "b" }]);
});

test("V2 move — B before R1 → B, R1, A, R2", () => {
  const result = moveBlockFlowV2Apartado(flowV2_R1AR2B, {
    apartadoId: "b",
    target: { type: "structural-row", rowId: "bf-c-r1", placement: "before" },
  });
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 4);
  // B should be first row
  assert.deepEqual(result.flow.rows[0].items, [{ type: "apartado", apartadoId: "b" }]);
  assert.deepEqual(result.flow.rows[1].items, [{ type: "content-row", rowId: "r1" }]);
});

test("V2 move — C right of A/B pair → rejected (max 2)", () => {
  const result = moveBlockFlowV2Apartado(flowV2_pair_AB_C, {
    apartadoId: "c",
    target: { type: "apartado", apartadoId: "a", placement: "right" },
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.flow, flowV2_pair_AB_C);
});

test("V2 move — content-row lateral target → rejected", () => {
  const result = moveBlockFlowV2Apartado(flowV2_R1AR2B, {
    apartadoId: "a",
    target: { type: "apartado", apartadoId: "r1", placement: "left" },
  });
  // r1 is not an apartado, so target not found
  assert.equal(result.changed, false);
});

test("V2 move — moving from pair leaves remaining valid", () => {
  const result = moveBlockFlowV2Apartado(flowV2_pair_AB_C, {
    apartadoId: "b",
    target: { type: "structural-row", rowId: "bf-a-c", placement: "after" },
  });
  assert.equal(result.changed, true);
  // A should remain as singleton row
  const aRow = result.flow.rows.find((r) => r.items.some((i) => i.type === "apartado" && i.apartadoId === "a"));
  assert.ok(aRow);
  assert.equal(aRow.items.length, 1);
  // C and B should be together or adjacent
  const bRow = result.flow.rows.find((r) => r.items.some((i) => i.type === "apartado" && i.apartadoId === "b"));
  assert.ok(bRow);
});

test("V2 move — empty source structural row removed", () => {
  const result = moveBlockFlowV2Apartado(flowV2_AB, {
    apartadoId: "b",
    target: { type: "apartado", apartadoId: "a", placement: "right" },
  });
  assert.equal(result.changed, true);
  // Only 1 row should remain (A and B in same row)
  assert.equal(result.flow.rows.length, 1);
  assert.equal(result.flow.rows[0].items.length, 2);
});

test("V2 move — existing unaffected row IDs preserved", () => {
  const result = moveBlockFlowV2Apartado(flowV2_AB, {
    apartadoId: "b",
    target: { type: "apartado", apartadoId: "a", placement: "right" },
  });
  assert.equal(result.changed, true);
  // The A row ID should be preserved
  assert.equal(result.flow.rows[0].id, "bf-a-a");
});

test("V2 move — new structural row gets unique ID", () => {
  const result = moveBlockFlowV2Apartado(flowV2_AB, {
    apartadoId: "b",
    target: { type: "structural-row", rowId: "bf-a-a", placement: "before" },
  });
  assert.equal(result.changed, true);
  const ids = result.flow.rows.map((r) => r.id);
  // All IDs should be unique
  assert.equal(new Set(ids).size, ids.length);
});

test("V2 move — immutable (no mutation of input flow)", () => {
  const originalRows = flowV2_AB.rows.map((r) => ({ ...r, items: [...r.items] }));
  moveBlockFlowV2Apartado(flowV2_AB, {
    apartadoId: "b",
    target: { type: "apartado", apartadoId: "a", placement: "right" },
  });
  assert.deepEqual(flowV2_AB.rows, originalRows);
});

test("V2 move — no duplicate/loss of apartados", () => {
  const result = moveBlockFlowV2Apartado(flowV2_AB, {
    apartadoId: "b",
    target: { type: "apartado", apartadoId: "a", placement: "right" },
  });
  assert.equal(result.changed, true);
  const apartados = result.flow.rows.flatMap((r) =>
    r.items.filter((i) => i.type === "apartado").map((i) => i.apartadoId),
  );
  assert.equal(new Set(apartados).size, apartados.length, "no duplicates");
  assert.equal(apartados.length, 2, "no loss");
});

test("V2 move — same source/target → unchanged", () => {
  const result = moveBlockFlowV2Apartado(flowV2_AB, {
    apartadoId: "a",
    target: { type: "apartado", apartadoId: "a", placement: "right" },
  });
  assert.equal(result.changed, false);
});

test("V2 move — invalid source → unchanged", () => {
  const result = moveBlockFlowV2Apartado(flowV2_AB, {
    apartadoId: "nonexistent",
    target: { type: "apartado", apartadoId: "a", placement: "right" },
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.flow, flowV2_AB);
});

test("V2 move — invalid target row → unchanged", () => {
  const result = moveBlockFlowV2Apartado(flowV2_AB, {
    apartadoId: "b",
    target: { type: "structural-row", rowId: "nonexistent", placement: "before" },
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.flow, flowV2_AB);
});

test("V2 move — R1,A,R2,B → B before R1 → B,R1,A,R2", () => {
  const result = moveBlockFlowV2Apartado(flowV2_R1AR2B, {
    apartadoId: "b",
    target: { type: "structural-row", rowId: "bf-c-r1", placement: "before" },
  });
  assert.equal(result.changed, true);
  const rowTypes = result.flow.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.deepEqual(rowTypes, [
    "apartado:b",
    "content:r1",
    "apartado:a",
    "content:r2",
  ]);
});

/* ================================================================== */
/*  insertContentRowIntoBlockFlowV2                                    */
/* ================================================================== */

const flowV2_R1A_R2: BlockFlowV2 = {
  version: 2,
  rows: [
    { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
    { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
    { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] },
  ],
};

test("insert — after anchor: R1,A,R2 → R1,A,R2,R3", () => {
  const result = insertContentRowIntoBlockFlowV2(flowV2_R1A_R2, {
    newContentRowId: "r3",
    anchorContentRowId: "r2",
    placement: "after",
  });
  assert.equal(result.changed, true);
  const rowTypes = result.flow.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.deepEqual(rowTypes, [
    "content:r1",
    "apartado:a",
    "content:r2",
    "content:r3",
  ]);
});

test("insert — before anchor: R1,A,R2 → R3,R1,A,R2", () => {
  const result = insertContentRowIntoBlockFlowV2(flowV2_R1A_R2, {
    newContentRowId: "r3",
    anchorContentRowId: "r1",
    placement: "before",
  });
  assert.equal(result.changed, true);
  const rowTypes = result.flow.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.deepEqual(rowTypes, [
    "content:r3",
    "content:r1",
    "apartado:a",
    "content:r2",
  ]);
});

test("insert — anchor separated by apartados: R1,A,R2 → R1,A,R2,R3 after R2", () => {
  // Same as above — anchor is R2, apartado A is between R1 and R2
  const result = insertContentRowIntoBlockFlowV2(flowV2_R1A_R2, {
    newContentRowId: "r3",
    anchorContentRowId: "r2",
    placement: "after",
  });
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 4);
  const lastRow = result.flow.rows[3];
  assert.equal(lastRow.items[0].type, "content-row");
  if (lastRow.items[0].type === "content-row") {
    assert.equal(lastRow.items[0].rowId, "r3");
  }
});

test("insert — duplicate new row rejected", () => {
  const result = insertContentRowIntoBlockFlowV2(flowV2_R1A_R2, {
    newContentRowId: "r1",
    anchorContentRowId: "r2",
    placement: "after",
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.flow, flowV2_R1A_R2);
});

test("insert — nonexistent anchor → unchanged", () => {
  const result = insertContentRowIntoBlockFlowV2(flowV2_R1A_R2, {
    newContentRowId: "r3",
    anchorContentRowId: "nonexistent",
    placement: "after",
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.flow, flowV2_R1A_R2);
});

test("insert — new structural row gets unique ID", () => {
  const result = insertContentRowIntoBlockFlowV2(flowV2_R1A_R2, {
    newContentRowId: "r3",
    anchorContentRowId: "r2",
    placement: "after",
  });
  assert.equal(result.changed, true);
  const ids = result.flow.rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "all IDs unique");
});

test("insert — immutable (no mutation of input flow)", () => {
  const originalRows = flowV2_R1A_R2.rows.map((r) => ({ ...r, items: [...r.items] }));
  insertContentRowIntoBlockFlowV2(flowV2_R1A_R2, {
    newContentRowId: "r3",
    anchorContentRowId: "r2",
    placement: "after",
  });
  assert.deepEqual(flowV2_R1A_R2.rows, originalRows);
});

/* ================================================================== */
/*  removeContentRowsFromBlockFlowV2                                   */
/* ================================================================== */

test("remove — stale content row removed", () => {
  const result = removeContentRowsFromBlockFlowV2(flowV2_R1A_R2, new Set(["r1", "r2"]));
  // r1 and r2 are live, a is apartado (always kept)
  const rowTypes = result.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.deepEqual(rowTypes, ["content:r1", "apartado:a", "content:r2"]);
});

test("remove — disappeared source row removed from flow", () => {
  // r1 disappears after a move, only r2 is live
  const result = removeContentRowsFromBlockFlowV2(flowV2_R1A_R2, new Set(["r2"]));
  const rowTypes = result.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  // r1 removed, a and r2 remain
  assert.deepEqual(rowTypes, ["apartado:a", "content:r2"]);
});

test("remove — all content rows gone → only apartados remain", () => {
  const result = removeContentRowsFromBlockFlowV2(flowV2_R1A_R2, new Set());
  const rowTypes = result.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.deepEqual(rowTypes, ["apartado:a"]);
});

test("remove — empty flow → empty", () => {
  const emptyFlow: BlockFlowV2 = { version: 2, rows: [] };
  const result = removeContentRowsFromBlockFlowV2(emptyFlow, new Set());
  assert.deepEqual(result.rows, []);
});

test("remove — immutable (no mutation of input)", () => {
  const originalRows = flowV2_R1A_R2.rows.map((r) => ({ ...r, items: [...r.items] }));
  removeContentRowsFromBlockFlowV2(flowV2_R1A_R2, new Set(["r2"]));
  assert.deepEqual(flowV2_R1A_R2.rows, originalRows);
});

test("remove — paired apartados preserved", () => {
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-a-ab", items: [
        { type: "apartado", apartadoId: "a" },
        { type: "apartado", apartadoId: "b" },
      ]},
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
    ],
  };
  // r1 is live, so paired apartados + r1 both remain
  const result = removeContentRowsFromBlockFlowV2(flow, new Set(["r1"]));
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].items.length, 2);
  assert.equal(result.rows[0].items[0].type, "apartado");
  assert.equal(result.rows[0].items[1].type, "apartado");
});

/* ================================================================== */
/*  INTEGRATION: combined insert + remove scenarios                    */
/* ================================================================== */

test("integration — CASE 1: new row after R2, source row stays", () => {
  // Flow: R1,A,R2
  // Move column from R1 to below R2 → R3 created, R1 stays
  // Expected: R1,A,R2,R3
  const flow = flowV2_R1A_R2;

  // Simulate: source row R1 still has columns after move
  // So only insertion needed
  const result = insertContentRowIntoBlockFlowV2(flow, {
    newContentRowId: "r3",
    anchorContentRowId: "r2",
    placement: "after",
  });

  const rowTypes = result.flow.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.deepEqual(rowTypes, [
    "content:r1",
    "apartado:a",
    "content:r2",
    "content:r3",
  ]);
});

test("integration — CASE 2: source row emptied + new row after R2", () => {
  // Flow: R1,A,R2
  // R1 disappears, R3 created after R2
  // Expected: A,R2,R3
  let flow = flowV2_R1A_R2;

  // 1. Remove disappeared source row
  flow = removeContentRowsFromBlockFlowV2(flow, new Set(["r2"]));
  // Now: A,R2

  // 2. Insert new row after R2
  const result = insertContentRowIntoBlockFlowV2(flow, {
    newContentRowId: "r3",
    anchorContentRowId: "r2",
    placement: "after",
  });

  const rowTypes = result.flow.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.deepEqual(rowTypes, [
    "apartado:a",
    "content:r2",
    "content:r3",
  ]);
});

test("integration — CASE 3: LEFT/RIGHT into existing row, source stays", () => {
  // Flow: R1,A,R2
  // Move column from R2 into R1 (LEFT/RIGHT) — no new row, R2 stays
  // Expected: BlockFlow unchanged
  const flow = flowV2_R1A_R2;

  // LEFT/RIGHT into existing row doesn't create new rows
  // and doesn't remove source row
  // So no BlockFlow change needed
  const oldRowIds = new Set(["r1", "r2"]);
  const newLayout = {
    version: 2 as const,
    rows: [
      { id: "r1", columns: [] },
      { id: "r2", columns: [] },
    ],
  };
  const newRowIds = new Set(newLayout.rows.map((r) => r.id));

  // No rows removed
  const removedRowIds: string[] = [];
  for (const id of oldRowIds) {
    if (!newRowIds.has(id)) removedRowIds.push(id);
  }
  assert.equal(removedRowIds.length, 0);

  // No new rows created
  let newContentRowId: string | undefined;
  for (const id of newRowIds) {
    if (!oldRowIds.has(id)) {
      newContentRowId = id;
      break;
    }
  }
  assert.equal(newContentRowId, undefined);

  // BlockFlow unchanged
  const flowResult = removeContentRowsFromBlockFlowV2(flow, newRowIds);
  assert.deepEqual(flowResult, flow);
});

test("integration — CASE 4: source row emptied, no new row", () => {
  // Flow: R1,A,R2
  // R1 disappears, no new row
  // Expected: A,R2
  const flow = flowV2_R1A_R2;
  const result = removeContentRowsFromBlockFlowV2(flow, new Set(["r2"]));
  const rowTypes = result.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.deepEqual(rowTypes, ["apartado:a", "content:r2"]);
});

test("integration — full dual-writeback simulation", () => {
  // Simulate the complete dual-writeback flow from handleContentDragEnd
  // Scenario: R1,A,R2, move column from R1 below R2
  // R1 stays, R3 created after R2

  const flow = flowV2_R1A_R2;
  const oldRowIds = new Set(["r1", "r2"]);

  // Simulate moveContentLayoutV2 result
  const newLayout = {
    version: 2 as const,
    rows: [
      { id: "r1", columns: [] },
      { id: "r2", columns: [] },
      { id: "r3", columns: [] },
    ],
  };
  const newRowIds = new Set(newLayout.rows.map((r) => r.id));

  // 1. Detect removed rows
  const removedRowIds: string[] = [];
  for (const id of oldRowIds) {
    if (!newRowIds.has(id)) removedRowIds.push(id);
  }
  assert.equal(removedRowIds.length, 0, "no rows removed");

  // 2. Detect new rows
  let newContentRowId: string | undefined;
  for (const id of newRowIds) {
    if (!oldRowIds.has(id)) {
      newContentRowId = id;
      break;
    }
  }
  assert.equal(newContentRowId, "r3");

  // 3. Start from current flow
  let currentFlow = flow;

  // 4. Remove stale refs (none in this case)
  if (removedRowIds.length > 0) {
    currentFlow = removeContentRowsFromBlockFlowV2(currentFlow, newRowIds);
  }

  // 5. Insert new row
  if (newContentRowId) {
    const insertResult = insertContentRowIntoBlockFlowV2(currentFlow, {
      newContentRowId,
      anchorContentRowId: "r2",
      placement: "after",
    });
    if (insertResult.changed) {
      currentFlow = insertResult.flow;
    }
  }

  const rowTypes = currentFlow.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.deepEqual(rowTypes, [
    "content:r1",
    "apartado:a",
    "content:r2",
    "content:r3",
  ]);
});

/* ================================================================== */
/*  moveContentColumnToBlockFlowBoundary                               */
/* ================================================================== */

const layoutV2_R1_R2: import("../src/features/valuations/model").ContentLayoutV2 = {
  version: 2,
  rows: [
    { id: "r1", columns: [{ id: "col-x", items: [{ type: "concept", id: "X" }] }] },
    { id: "r2", columns: [{ id: "col-y", items: [{ type: "concept", id: "Y" }] }] },
  ],
};

test("boundary — move X before A: [RX],[A],[R2]", () => {
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
      { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] },
    ],
  };

  const result = moveContentColumnToBlockFlowBoundary(layoutV2_R1_R2, flow, {
    sourceColumnId: "col-x",
    targetStructuralRowId: "bf-a-a",
    placement: "before",
  });

  assert.equal(result.changed, true);

  // ContentLayoutV2: r1 removed (empty), new row created, r2 stays
  const layoutRowIds = result.contentLayout.rows.map((r) => r.id);
  assert.ok(layoutRowIds.includes("r2"), "r2 preserved");
  assert.ok(layoutRowIds.length >= 2, "at least new row + r2");

  // BlockFlowV2: new content-row before A
  const bfRowTypes = result.blockFlow.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.ok(bfRowTypes.includes("apartado:a"), "A preserved");
  assert.ok(bfRowTypes.includes("content:r2"), "r2 preserved");
  // New content row should be before A
  const aIdx = bfRowTypes.indexOf("apartado:a");
  const newContentIdx = bfRowTypes.findIndex((t, i) => t.startsWith("content:") && i < aIdx);
  assert.ok(newContentIdx >= 0, "new content row before A");
});

test("boundary — move X after A: [A],[RX],[R2]", () => {
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
      { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] },
    ],
  };

  const result = moveContentColumnToBlockFlowBoundary(layoutV2_R1_R2, flow, {
    sourceColumnId: "col-x",
    targetStructuralRowId: "bf-a-a",
    placement: "after",
  });

  assert.equal(result.changed, true);

  const bfRowTypes = result.blockFlow.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  // Should have: A, new content row, r2
  const aIdx = bfRowTypes.indexOf("apartado:a");
  const newContentIdx = bfRowTypes.findIndex((t, i) => t.startsWith("content:") && i > aIdx);
  assert.ok(newContentIdx >= 0, "new content row after A");
  assert.ok(bfRowTypes.includes("content:r2"), "r2 preserved");
});

test("boundary — source row disappears, no stale R1", () => {
  // X is the only column in R1, so R1 disappears after move
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
      { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] },
    ],
  };

  const result = moveContentColumnToBlockFlowBoundary(layoutV2_R1_R2, flow, {
    sourceColumnId: "col-x",
    targetStructuralRowId: "bf-a-a",
    placement: "after",
  });

  assert.equal(result.changed, true);

  // r1 should be removed from BlockFlow (source row disappeared)
  const bfRowTypes = result.blockFlow.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.ok(!bfRowTypes.includes("content:r1"), "no stale r1 in BlockFlow");
  assert.ok(bfRowTypes.includes("content:r2"), "r2 preserved");
  assert.ok(bfRowTypes.includes("apartado:a"), "A preserved");
});

test("boundary — source row stays (multi-column), R1(Y) preserved", () => {
  // R1 has X,Y — X moves out, R1(Y) stays
  const layoutWithY: import("../src/features/valuations/model").ContentLayoutV2 = {
    version: 2,
    rows: [
      { id: "r1", columns: [
        { id: "col-x", items: [{ type: "concept", id: "X" }] },
        { id: "col-y", items: [{ type: "concept", id: "Y" }] },
      ]},
    ],
  };

  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
    ],
  };

  const result = moveContentColumnToBlockFlowBoundary(layoutWithY, flow, {
    sourceColumnId: "col-x",
    targetStructuralRowId: "bf-a-a",
    placement: "after",
  });

  assert.equal(result.changed, true);

  // r1 should still be in BlockFlow (source row not empty)
  const bfRowTypes = result.blockFlow.rows.map((r) => {
    const item = r.items[0];
    if (item.type === "content-row") return `content:${item.rowId}`;
    return `apartado:${item.apartadoId}`;
  });
  assert.ok(bfRowTypes.includes("content:r1"), "r1 preserved in BlockFlow");
  assert.ok(bfRowTypes.includes("apartado:a"), "A preserved");
  // New row should be after A
  const aIdx = bfRowTypes.indexOf("apartado:a");
  const newContentIdx = bfRowTypes.findIndex((t, i) => t.startsWith("content:") && i > aIdx);
  assert.ok(newContentIdx >= 0, "new content row after A");
});

test("boundary — paired apartados preserved", () => {
  const layout: import("../src/features/valuations/model").ContentLayoutV2 = {
    version: 2,
    rows: [
      { id: "r1", columns: [{ id: "col-x", items: [{ type: "concept", id: "X" }] }] },
    ],
  };

  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-a-ab", items: [
        { type: "apartado", apartadoId: "a" },
        { type: "apartado", apartadoId: "b" },
      ]},
    ],
  };

  const result = moveContentColumnToBlockFlowBoundary(layout, flow, {
    sourceColumnId: "col-x",
    targetStructuralRowId: "bf-a-ab",
    placement: "after",
  });

  assert.equal(result.changed, true);

  // Paired apartados should be preserved
  const pairedRow = result.blockFlow.rows.find((r) =>
    r.items.some((item) => item.type === "apartado" && item.apartadoId === "a"),
  );
  assert.ok(pairedRow, "paired row exists");
  assert.equal(pairedRow.items.length, 2, "pair has 2 items");
});

test("boundary — invalid target → unchanged", () => {
  const result = moveContentColumnToBlockFlowBoundary(layoutV2_R1_R2, {
    version: 2,
    rows: [],
  }, {
    sourceColumnId: "col-x",
    targetStructuralRowId: "nonexistent",
    placement: "before",
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.contentLayout, layoutV2_R1_R2);
});
