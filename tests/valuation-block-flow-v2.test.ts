import assert from "node:assert/strict";
import test from "node:test";
import type { Block, BlockFlow, BlockFlowV2, Apartado } from "../src/features/valuations/model";
import {
  isBlockFlow,
  isBlockFlowV1,
  isBlockFlowV2,
  isBlockFlowPersisted,
  isValidStructuralRow,
  contentRowStructuralId,
  apartadoStructuralId,
  convertBlockFlowV1ToV2,
  convertBlockFlowV2ToV1,
  generateBlockFlowV1,
  generateBlockFlowV2,
  normalizeBlockFlowV1,
  normalizeBlockFlowV2,
  resolveBlockFlow,
  resolveBlockFlowV1,
  resolveBlockFlowV2,
  moveBlockFlowItem,
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
/*  V1 TYPE GUARDS                                                     */
/* ================================================================== */

test("isBlockFlowV1 — valid empty V1", () => {
  assert.equal(isBlockFlowV1({ version: 1, items: [] }), true);
});

test("isBlockFlowV1 — valid mixed V1", () => {
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "apartado", apartadoId: "a1" },
    ],
  };
  assert.equal(isBlockFlowV1(flow), true);
});

test("isBlockFlowV1 — V2 object rejected", () => {
  assert.equal(isBlockFlowV1({ version: 2, rows: [] }), false);
});

test("isBlockFlowV1 — backward compat: isBlockFlow alias works", () => {
  assert.equal(isBlockFlow({ version: 1, items: [] }), true);
  assert.equal(isBlockFlow({ version: 2, rows: [] }), false);
});

/* ================================================================== */
/*  V2 TYPE GUARDS                                                     */
/* ================================================================== */

test("isBlockFlowV2 — valid empty V2", () => {
  assert.equal(isBlockFlowV2({ version: 2, rows: [] }), true);
});

test("isBlockFlowV2 — valid content-row", () => {
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [{ id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] }],
  };
  assert.equal(isBlockFlowV2(flow), true);
});

test("isBlockFlowV2 — valid one apartado", () => {
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [{ id: "bf-a-a1", items: [{ type: "apartado", apartadoId: "a1" }] }],
  };
  assert.equal(isBlockFlowV2(flow), true);
});

test("isBlockFlowV2 — valid two apartados", () => {
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [{
      id: "bf-pair",
      items: [
        { type: "apartado", apartadoId: "a1" },
        { type: "apartado", apartadoId: "a2" },
      ],
    }],
  };
  assert.equal(isBlockFlowV2(flow), true);
});

test("isBlockFlowV2 — V1 object rejected", () => {
  assert.equal(isBlockFlowV2({ version: 1, items: [] }), false);
});

test("isBlockFlowV2 — missing version", () => {
  assert.equal(isBlockFlowV2({ rows: [] }), false);
});

test("isBlockFlowV2 — rows not array", () => {
  assert.equal(isBlockFlowV2({ version: 2, rows: "bad" }), false);
});

test("isBlockFlowV2 — row missing id", () => {
  assert.equal(isBlockFlowV2({ version: 2, rows: [{ items: [] }] }), false);
});

test("isBlockFlowV2 — row missing items", () => {
  assert.equal(isBlockFlowV2({ version: 2, rows: [{ id: "r1" }] }), false);
});

test("isBlockFlowV2 — item with unknown type", () => {
  assert.equal(isBlockFlowV2({
    version: 2,
    rows: [{ id: "r1", items: [{ type: "unknown" }] }],
  }), false);
});

test("isBlockFlowV2 — content-row missing rowId", () => {
  assert.equal(isBlockFlowV2({
    version: 2,
    rows: [{ id: "r1", items: [{ type: "content-row" }] }],
  }), false);
});

test("isBlockFlowV2 — apartado missing apartadoId", () => {
  assert.equal(isBlockFlowV2({
    version: 2,
    rows: [{ id: "r1", items: [{ type: "apartado" }] }],
  }), false);
});

test("isBlockFlowPersisted — recognizes both V1 and V2", () => {
  assert.equal(isBlockFlowPersisted({ version: 1, items: [] }), true);
  assert.equal(isBlockFlowPersisted({ version: 2, rows: [] }), true);
  assert.equal(isBlockFlowPersisted({ version: 3 }), false);
  assert.equal(isBlockFlowPersisted(null), false);
});

/* ================================================================== */
/*  STRUCTURAL ROW VALIDATION                                          */
/* ================================================================== */

test("isValidStructuralRow — content row (1 item)", () => {
  assert.equal(isValidStructuralRow({
    id: "r1",
    items: [{ type: "content-row", rowId: "r1" }],
  }), true);
});

test("isValidStructuralRow — one apartado", () => {
  assert.equal(isValidStructuralRow({
    id: "a1",
    items: [{ type: "apartado", apartadoId: "a1" }],
  }), true);
});

test("isValidStructuralRow — two apartados", () => {
  assert.equal(isValidStructuralRow({
    id: "pair",
    items: [
      { type: "apartado", apartadoId: "a1" },
      { type: "apartado", apartadoId: "a2" },
    ],
  }), true);
});

test("isValidStructuralRow — reject content-row + apartado mixed", () => {
  assert.equal(isValidStructuralRow({
    id: "bad",
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "apartado", apartadoId: "a1" },
    ],
  }), false);
});

test("isValidStructuralRow — reject two content-rows", () => {
  assert.equal(isValidStructuralRow({
    id: "bad",
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "content-row", rowId: "r2" },
    ],
  }), false);
});

test("isValidStructuralRow — reject 3 apartados", () => {
  assert.equal(isValidStructuralRow({
    id: "bad",
    items: [
      { type: "apartado", apartadoId: "a1" },
      { type: "apartado", apartadoId: "a2" },
      { type: "apartado", apartadoId: "a3" },
    ],
  }), false);
});

test("isValidStructuralRow — reject empty row", () => {
  assert.equal(isValidStructuralRow({ id: "empty", items: [] }), false);
});

test("isValidStructuralRow — reject duplicate apartado IDs", () => {
  assert.equal(isValidStructuralRow({
    id: "dup",
    items: [
      { type: "apartado", apartadoId: "a1" },
      { type: "apartado", apartadoId: "a1" },
    ],
  }), false);
});

/* ================================================================== */
/*  STABLE ID GENERATION                                               */
/* ================================================================== */

test("contentRowStructuralId — deterministic", () => {
  assert.equal(contentRowStructuralId("r1"), "bf-c-r1");
  assert.equal(contentRowStructuralId("r-0"), "bf-c-r-0");
});

test("apartadoStructuralId — deterministic", () => {
  assert.equal(apartadoStructuralId("a1"), "bf-a-a1");
  assert.equal(apartadoStructuralId("terreno-sub-1"), "bf-a-terreno-sub-1");
});

test("contentRowStructuralId — same input → same output", () => {
  const id1 = contentRowStructuralId("r1");
  const id2 = contentRowStructuralId("r1");
  assert.equal(id1, id2);
});

test("apartadoStructuralId — same input → same output", () => {
  const id1 = apartadoStructuralId("a1");
  const id2 = apartadoStructuralId("a1");
  assert.equal(id1, id2);
});

/* ================================================================== */
/*  V1 → V2 CONVERSION                                                 */
/* ================================================================== */

test("convertBlockFlowV1ToV2 — R1,A,R2,B → [R1],[A],[R2],[B]", () => {
  const v1: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "apartado", apartadoId: "a" },
      { type: "content-row", rowId: "r2" },
      { type: "apartado", apartadoId: "b" },
    ],
  };
  const v2 = convertBlockFlowV1ToV2(v1);
  assert.equal(v2.version, 2);
  assert.equal(v2.rows.length, 4);
  assert.deepEqual(v2.rows[0], { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] });
  assert.deepEqual(v2.rows[1], { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] });
  assert.deepEqual(v2.rows[2], { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] });
  assert.deepEqual(v2.rows[3], { id: "bf-a-b", items: [{ type: "apartado", apartadoId: "b" }] });
});

test("convertBlockFlowV1ToV2 — content only", () => {
  const v1: BlockFlow = {
    version: 1,
    items: [{ type: "content-row", rowId: "r1" }],
  };
  const v2 = convertBlockFlowV1ToV2(v1);
  assert.equal(v2.rows.length, 1);
  assert.deepEqual(v2.rows[0].items, [{ type: "content-row", rowId: "r1" }]);
});

test("convertBlockFlowV1ToV2 — apartados only", () => {
  const v1: BlockFlow = {
    version: 1,
    items: [
      { type: "apartado", apartadoId: "a" },
      { type: "apartado", apartadoId: "b" },
    ],
  };
  const v2 = convertBlockFlowV1ToV2(v1);
  assert.equal(v2.rows.length, 2);
  assert.deepEqual(v2.rows[0].items, [{ type: "apartado", apartadoId: "a" }]);
  assert.deepEqual(v2.rows[1].items, [{ type: "apartado", apartadoId: "b" }]);
});

test("convertBlockFlowV1ToV2 — empty V1", () => {
  const v1: BlockFlow = { version: 1, items: [] };
  const v2 = convertBlockFlowV1ToV2(v1);
  assert.equal(v2.rows.length, 0);
});

test("convertBlockFlowV1ToV2 — legacy apartados NOT paired", () => {
  const v1: BlockFlow = {
    version: 1,
    items: [
      { type: "apartado", apartadoId: "a" },
      { type: "apartado", apartadoId: "b" },
    ],
  };
  const v2 = convertBlockFlowV1ToV2(v1);
  // Each apartado gets its own structural row — no auto-pairing
  assert.equal(v2.rows.length, 2);
  assert.equal(v2.rows[0].items.length, 1);
  assert.equal(v2.rows[1].items.length, 1);
});

/* ================================================================== */
/*  V2 → V1 CONVERSION                                                 */
/* ================================================================== */

test("convertBlockFlowV2ToV1 — [R1],[A],[R2],[B] → R1,A,R2,B", () => {
  const v2: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
      { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] },
      { id: "bf-a-b", items: [{ type: "apartado", apartadoId: "b" }] },
    ],
  };
  const v1 = convertBlockFlowV2ToV1(v2);
  assert.equal(v1.version, 1);
  assert.equal(v1.items.length, 4);
  assert.deepEqual(v1.items[0], { type: "content-row", rowId: "r1" });
  assert.deepEqual(v1.items[1], { type: "apartado", apartadoId: "a" });
  assert.deepEqual(v1.items[2], { type: "content-row", rowId: "r2" });
  assert.deepEqual(v1.items[3], { type: "apartado", apartadoId: "b" });
});

test("convertBlockFlowV2ToV1 — pair of apartados flattened", () => {
  const v2: BlockFlowV2 = {
    version: 2,
    rows: [{
      id: "bf-pair",
      items: [
        { type: "apartado", apartadoId: "a" },
        { type: "apartado", apartadoId: "b" },
      ],
    }],
  };
  const v1 = convertBlockFlowV2ToV1(v2);
  assert.equal(v1.items.length, 2);
  assert.deepEqual(v1.items[0], { type: "apartado", apartadoId: "a" });
  assert.deepEqual(v1.items[1], { type: "apartado", apartadoId: "b" });
});

test("convertBlockFlowV2ToV1 — empty V2", () => {
  const v2: BlockFlowV2 = { version: 2, rows: [] };
  const v1 = convertBlockFlowV2ToV1(v2);
  assert.equal(v1.items.length, 0);
});

/* ================================================================== */
/*  V1 GENERATION                                                      */
/* ================================================================== */

test("generateBlockFlowV1 — content rows + apartados", () => {
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
  const flow = generateBlockFlowV1(b)!;
  assert.equal(flow.version, 1);
  assert.equal(flow.items.length, 4);
  assert.deepEqual(flow.items[0], { type: "content-row", rowId: "r1" });
  assert.deepEqual(flow.items[1], { type: "content-row", rowId: "r2" });
  assert.deepEqual(flow.items[2], { type: "apartado", apartadoId: "a" });
  assert.deepEqual(flow.items[3], { type: "apartado", apartadoId: "b" });
});

test("generateBlockFlowV1 — empty block → undefined", () => {
  assert.equal(generateBlockFlowV1(block()), undefined);
});

/* ================================================================== */
/*  V2 GENERATION                                                      */
/* ================================================================== */

test("generateBlockFlowV2 — content rows + apartados", () => {
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
  const flow = generateBlockFlowV2(b)!;
  assert.equal(flow.version, 2);
  assert.equal(flow.rows.length, 4);
  assert.deepEqual(flow.rows[0], { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] });
  assert.deepEqual(flow.rows[1], { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] });
  assert.deepEqual(flow.rows[2], { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] });
  assert.deepEqual(flow.rows[3], { id: "bf-a-b", items: [{ type: "apartado", apartadoId: "b" }] });
});

test("generateBlockFlowV2 — empty block → undefined", () => {
  assert.equal(generateBlockFlowV2(block()), undefined);
});

test("generateBlockFlowV2 — stable IDs across calls", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: {
      version: 2,
      rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }],
    },
  });
  const f1 = generateBlockFlowV2(b)!;
  const f2 = generateBlockFlowV2(b)!;
  assert.deepEqual(f1.rows.map((r) => r.id), f2.rows.map((r) => r.id));
});

/* ================================================================== */
/*  V1 NORMALIZATION                                                   */
/* ================================================================== */

test("normalizeBlockFlowV1 — preserve order R1 A R2 B", () => {
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
  const result = normalizeBlockFlowV1(b, flow);
  assert.equal(result.items.length, 4);
  assert.deepEqual(result.items[0], { type: "content-row", rowId: "r1" });
  assert.deepEqual(result.items[1], { type: "apartado", apartadoId: "a" });
  assert.deepEqual(result.items[2], { type: "content-row", rowId: "r2" });
  assert.deepEqual(result.items[3], { type: "apartado", apartadoId: "b" });
});

test("normalizeBlockFlowV1 — stale refs removed", () => {
  const b = block({
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "content-row", rowId: "deleted" },
      { type: "apartado", apartadoId: "gone" },
    ],
  };
  const result = normalizeBlockFlowV1(b, flow);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], { type: "content-row", rowId: "r1" });
});

test("normalizeBlockFlowV1 — duplicates removed", () => {
  const b = block({
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "content-row", rowId: "r1" },
    ],
  };
  const result = normalizeBlockFlowV1(b, flow);
  assert.equal(result.items.length, 1);
});

test("normalizeBlockFlowV1 — missing content rows appended", () => {
  const b = block({
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "c1", items: [] }] },
        { id: "r2", columns: [{ id: "c2", items: [] }] },
      ],
    },
  });
  const flow: BlockFlow = { version: 1, items: [{ type: "content-row", rowId: "r1" }] };
  const result = normalizeBlockFlowV1(b, flow);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[1], { type: "content-row", rowId: "r2" });
});

test("normalizeBlockFlowV1 — missing apartados appended", () => {
  const b = block({ apartados: [subBlock("a"), subBlock("b")] });
  const flow: BlockFlow = { version: 1, items: [{ type: "apartado", apartadoId: "a" }] };
  const result = normalizeBlockFlowV1(b, flow);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[1], { type: "apartado", apartadoId: "b" });
});

/* ================================================================== */
/*  V2 NORMALIZATION                                                   */
/* ================================================================== */

test("normalizeBlockFlowV2 — preserve valid order", () => {
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
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
      { id: "bf-c-r2", items: [{ type: "content-row", rowId: "r2" }] },
      { id: "bf-a-b", items: [{ type: "apartado", apartadoId: "b" }] },
    ],
  };
  const result = normalizeBlockFlowV2(b, flow);
  assert.equal(result.version, 2);
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows[0].id, "bf-c-r1");
  assert.equal(result.rows[1].id, "bf-a-a");
  assert.equal(result.rows[2].id, "bf-c-r2");
  assert.equal(result.rows[3].id, "bf-a-b");
});

test("normalizeBlockFlowV2 — preserve V2 structural row IDs", () => {
  const b = block({
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [{ id: "custom-id", items: [{ type: "content-row", rowId: "r1" }] }],
  };
  const result = normalizeBlockFlowV2(b, flow);
  assert.equal(result.rows[0].id, "custom-id");
});

test("normalizeBlockFlowV2 — stale content-row ref removed", () => {
  const b = block({
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-c-deleted", items: [{ type: "content-row", rowId: "deleted" }] },
    ],
  };
  const result = normalizeBlockFlowV2(b, flow);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].items[0].type, "content-row");
});

test("normalizeBlockFlowV2 — stale apartado ref removed", () => {
  const b = block({ apartados: [subBlock("a")] });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
      { id: "bf-a-gone", items: [{ type: "apartado", apartadoId: "gone" }] },
    ],
  };
  const result = normalizeBlockFlowV2(b, flow);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].items[0].type, "apartado");
});

test("normalizeBlockFlowV2 — duplicate content refs removed (keeps first)", () => {
  const b = block({
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-c-r1-dup", items: [{ type: "content-row", rowId: "r1" }] },
    ],
  };
  const result = normalizeBlockFlowV2(b, flow);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, "bf-c-r1");
});

test("normalizeBlockFlowV2 — duplicate apartado refs removed (keeps first)", () => {
  const b = block({ apartados: [subBlock("a")] });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
      { id: "bf-a-a-dup", items: [{ type: "apartado", apartadoId: "a" }] },
    ],
  };
  const result = normalizeBlockFlowV2(b, flow);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, "bf-a-a");
});

test("normalizeBlockFlowV2 — empty rows removed", () => {
  const b = block({
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "empty", items: [] },
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
    ],
  };
  const result = normalizeBlockFlowV2(b, flow);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, "bf-c-r1");
});

test("normalizeBlockFlowV2 — malformed mixed row split into separate rows", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [{
      id: "bad-mixed",
      items: [
        { type: "content-row", rowId: "r1" },
        { type: "apartado", apartadoId: "a" },
      ],
    }],
  };
  const result = normalizeBlockFlowV2(b, flow);
  // Mixed row split into 2 singleton rows
  assert.equal(result.rows.length, 2);
  const types = result.rows.flatMap((r) => r.items.map((i) => i.type));
  assert.ok(types.includes("content-row"));
  assert.ok(types.includes("apartado"));
});

test("normalizeBlockFlowV2 — 3 apartados in one row → split (first 2 + 1)", () => {
  const b = block({ apartados: [subBlock("a"), subBlock("b"), subBlock("c")] });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [{
      id: "overloaded",
      items: [
        { type: "apartado", apartadoId: "a" },
        { type: "apartado", apartadoId: "b" },
        { type: "apartado", apartadoId: "c" },
      ],
    }],
  };
  const result = normalizeBlockFlowV2(b, flow);
  // 3 apartados: first row gets 2, third becomes singleton
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].items.length, 2);
  assert.equal(result.rows[1].items.length, 1);
});

test("normalizeBlockFlowV2 — missing content rows appended as singletons", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r1", columns: [{ id: "c1", items: [] }] },
        { id: "r2", columns: [{ id: "c2", items: [] }] },
      ],
    },
  });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [{ id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] }],
  };
  const result = normalizeBlockFlowV2(b, flow);
  // a first, then r1, r2 appended
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].items[0].type, "apartado");
  assert.equal(result.rows[1].items[0].type, "content-row");
  assert.equal(result.rows[2].items[0].type, "content-row");
});

test("normalizeBlockFlowV2 — missing apartados appended as singletons", () => {
  const b = block({ apartados: [subBlock("a"), subBlock("b")] });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [{ id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] }],
    // note: no r1 in block, but we test apartado appending
  };
  const bWithRow = block({
    apartados: [subBlock("a"), subBlock("b")],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow2: BlockFlowV2 = {
    version: 2,
    rows: [{ id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] }],
  };
  const result = normalizeBlockFlowV2(bWithRow, flow2);
  // r1 in user order, then a, b appended
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[1].items[0].type, "apartado");
  assert.equal(result.rows[2].items[0].type, "apartado");
});

test("normalizeBlockFlowV2 — no mutation of input", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [{ id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] }],
  };
  const originalRows = [...flow.rows];
  normalizeBlockFlowV2(b, flow);
  assert.deepEqual(flow.rows, originalRows);
});

/* ================================================================== */
/*  V2 RESOLUTION                                                      */
/* ================================================================== */

test("resolveBlockFlowV2 — no blockFlow → generate default V2", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow = resolveBlockFlowV2(b)!;
  assert.equal(flow.version, 2);
  assert.equal(flow.rows.length, 2);
  assert.equal(flow.rows[0].items[0].type, "content-row");
  assert.equal(flow.rows[1].items[0].type, "apartado");
});

test("resolveBlockFlowV2 — V2 blockFlow → normalize", () => {
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
      version: 2,
      rows: [
        { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
        { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
        { id: "bf-a-b", items: [{ type: "apartado", apartadoId: "b" }] },
      ],
    },
  });
  const flow = resolveBlockFlowV2(b)!;
  assert.equal(flow.version, 2);
  // a first, r1 second, b third, r2 appended
  assert.equal(flow.rows.length, 4);
  assert.equal(flow.rows[0].items[0].type, "apartado");
  assert.equal(flow.rows[1].items[0].type, "content-row");
  assert.equal(flow.rows[2].items[0].type, "apartado");
  assert.equal(flow.rows[3].items[0].type, "content-row");
});

test("resolveBlockFlowV2 — V1 blockFlow → convert then normalize", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
    blockFlow: {
      version: 1,
      items: [
        { type: "apartado", apartadoId: "a" },
        { type: "content-row", rowId: "r1" },
      ],
    },
  });
  const flow = resolveBlockFlowV2(b)!;
  assert.equal(flow.version, 2);
  assert.equal(flow.rows.length, 2);
  assert.equal(flow.rows[0].items[0].type, "apartado");
  assert.equal(flow.rows[1].items[0].type, "content-row");
});

test("resolveBlockFlowV2 — empty block → undefined", () => {
  assert.equal(resolveBlockFlowV2(block()), undefined);
});

/* ================================================================== */
/*  V1 RESOLUTION (backward compat)                                    */
/* ================================================================== */

test("resolveBlockFlowV1 — no blockFlow → generate default V1", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow = resolveBlockFlowV1(b)!;
  assert.equal(flow.version, 1);
  assert.equal(flow.items.length, 2);
});

test("resolveBlockFlowV1 — V1 blockFlow → normalize V1", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
    blockFlow: {
      version: 1,
      items: [{ type: "apartado", apartadoId: "a" }, { type: "content-row", rowId: "r1" }],
    },
  });
  const flow = resolveBlockFlowV1(b)!;
  assert.equal(flow.version, 1);
  assert.equal(flow.items.length, 2);
  assert.equal(flow.items[0].type, "apartado");
  assert.equal(flow.items[1].type, "content-row");
});

test("resolveBlockFlowV1 — V2 blockFlow → convert to V1", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
    blockFlow: {
      version: 2,
      rows: [
        { id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] },
        { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
        { id: "bf-a-b", items: [{ type: "apartado", apartadoId: "b" }] },
      ],
    },
  });
  const flow = resolveBlockFlowV1(b)!;
  assert.equal(flow.version, 1);
  assert.equal(flow.items.length, 3);
  assert.equal(flow.items[0].type, "apartado");
  assert.equal(flow.items[1].type, "content-row");
  assert.equal(flow.items[2].type, "apartado");
});

test("resolveBlockFlow — backward compat alias works", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow = resolveBlockFlow(b)!;
  assert.equal(flow.version, 1);
  assert.equal(flow.items.length, 2);
});

/* ================================================================== */
/*  PERSISTENCE — metadata round-trip                                  */
/* ================================================================== */

test("hydrateBlockMetadata — V1 blockFlow present", () => {
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
});

test("hydrateBlockMetadata — V2 blockFlow present", () => {
  const config = {
    blockFlow: {
      version: 2,
      rows: [
        { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
        { id: "bf-a-a1", items: [{ type: "apartado", apartadoId: "a1" }] },
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);
  assert.ok(meta.blockFlow);
  assert.equal(meta.blockFlow.version, 2);
  assert.ok("rows" in meta.blockFlow);
});

test("hydrateBlockMetadata — blockFlow under payload", () => {
  const config = {
    payload: {
      blockFlow: {
        version: 2,
        rows: [{ id: "bf-a-x", items: [{ type: "apartado", apartadoId: "x" }] }],
      },
    },
  };
  const meta = hydrateBlockMetadata(config);
  assert.ok(meta.blockFlow);
  assert.equal(meta.blockFlow.version, 2);
});

test("hydrateBlockMetadata — blockFlow absent → undefined", () => {
  assert.equal(hydrateBlockMetadata({}).blockFlow, undefined);
});

test("hydrateBlockMetadata — malformed blockFlow → undefined", () => {
  assert.equal(hydrateBlockMetadata({ blockFlow: { version: 99, items: [] } }).blockFlow, undefined);
});

test("hydrateBlockMetadata — config null → undefined blockFlow", () => {
  assert.equal(hydrateBlockMetadata(null).blockFlow, undefined);
});

test("blockMetadataFromContent — serializes V1 blockFlow", () => {
  const flow: BlockFlow = { version: 1, items: [{ type: "content-row", rowId: "r1" }] };
  const meta = blockMetadataFromContent({ enabled: true, blockFlow: flow });
  assert.ok(meta.blockFlow);
  assert.equal(meta.blockFlow.version, 1);
});

test("blockMetadataFromContent — serializes V2 blockFlow", () => {
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [{ id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] }],
  };
  const meta = blockMetadataFromContent({ enabled: true, blockFlow: flow });
  assert.ok(meta.blockFlow);
  assert.equal(meta.blockFlow.version, 2);
});

test("metadata round-trip — V1 serialize then hydrate", () => {
  const flow: BlockFlow = {
    version: 1,
    items: [{ type: "content-row", rowId: "r1" }, { type: "apartado", apartadoId: "a1" }],
  };
  const serialized = blockMetadataFromContent({ enabled: true, blockFlow: flow });
  const hydrated = hydrateBlockMetadata(serialized);
  assert.ok(hydrated.blockFlow);
  assert.equal(hydrated.blockFlow.version, 1);
});

test("metadata round-trip — V2 serialize then hydrate", () => {
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-a-a1", items: [{ type: "apartado", apartadoId: "a1" }] },
    ],
  };
  const serialized = blockMetadataFromContent({ enabled: true, blockFlow: flow });
  const hydrated = hydrateBlockMetadata(serialized);
  assert.ok(hydrated.blockFlow);
  assert.equal(hydrated.blockFlow.version, 2);
  if (hydrated.blockFlow && hydrated.blockFlow.version === 2) {
    assert.equal(hydrated.blockFlow.rows.length, 2);
  }
});

/* ================================================================== */
/*  BACKWARD COMPATIBILITY                                             */
/* ================================================================== */

test("backward compat — old V1 valuation resolves identically", () => {
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
  const flow = resolveBlockFlow(b)!;
  assert.equal(flow.version, 1);
  assert.equal(flow.items.length, 4);
  assert.deepEqual(flow.items, [
    { type: "content-row", rowId: "r1" },
    { type: "content-row", rowId: "r2" },
    { type: "apartado", apartadoId: "a" },
    { type: "apartado", apartadoId: "b" },
  ]);
});

test("backward compat — V2 blockFlow resolved via V1 compat returns V1", () => {
  const b = block({
    apartados: [subBlock("a")],
    blockFlow: {
      version: 2,
      rows: [{ id: "bf-a-a", items: [{ type: "apartado", apartadoId: "a" }] }],
    },
  });
  // resolveBlockFlow (V1 compat) should return V1
  const flow = resolveBlockFlow(b)!;
  assert.equal(flow.version, 1);
  assert.equal(flow.items.length, 1);
  assert.equal(flow.items[0].type, "apartado");
});

test("backward compat — blockFlow not auto-written on load", () => {
  const b = block({ apartados: [subBlock("a")] });
  assert.equal(b.blockFlow, undefined);
  resolveBlockFlow(b);
  assert.equal(b.blockFlow, undefined);
  resolveBlockFlowV2(b);
  assert.equal(b.blockFlow, undefined);
});

/* ================================================================== */
/*  NO BUSINESS DATA DUPLICATION                                       */
/* ================================================================== */

test("no business data duplication — V1 items are references only", () => {
  const flow: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "apartado", apartadoId: "a1" },
    ],
  };
  for (const item of flow.items) {
    const keys = Object.keys(item);
    assert.ok(keys.length <= 2);
    assert.ok(!keys.includes("concepts"));
    assert.ok(!keys.includes("images"));
    assert.ok(!keys.includes("tables"));
    assert.ok(!keys.includes("title"));
    assert.ok(!keys.includes("enabled"));
  }
});

test("no business data duplication — V2 cell items are references only", () => {
  const flow: BlockFlowV2 = {
    version: 2,
    rows: [
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
      { id: "bf-a-a1", items: [{ type: "apartado", apartadoId: "a1" }] },
    ],
  };
  for (const row of flow.rows) {
    for (const item of row.items) {
      const keys = Object.keys(item);
      assert.ok(keys.length <= 2);
      assert.ok(!keys.includes("concepts"));
      assert.ok(!keys.includes("images"));
      assert.ok(!keys.includes("tables"));
      assert.ok(!keys.includes("title"));
      assert.ok(!keys.includes("enabled"));
    }
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

/* ================================================================== */
/*  V1→V2→V1 ROUND-TRIP                                                */
/* ================================================================== */

test("V1→V2→V1 round-trip — preserves item references", () => {
  const v1: BlockFlow = {
    version: 1,
    items: [
      { type: "content-row", rowId: "r1" },
      { type: "apartado", apartadoId: "a" },
      { type: "content-row", rowId: "r2" },
      { type: "apartado", apartadoId: "b" },
    ],
  };
  const v2 = convertBlockFlowV1ToV2(v1);
  const backToV1 = convertBlockFlowV2ToV1(v2);
  assert.equal(backToV1.version, 1);
  assert.equal(backToV1.items.length, v1.items.length);
  for (let i = 0; i < v1.items.length; i++) {
    assert.deepEqual(backToV1.items[i], v1.items[i]);
  }
});

test("V2→V1→V2 round-trip — pair of apartados preserved", () => {
  const v2: BlockFlowV2 = {
    version: 2,
    rows: [{
      id: "bf-pair",
      items: [
        { type: "apartado", apartadoId: "a" },
        { type: "apartado", apartadoId: "b" },
      ],
    }],
  };
  const v1 = convertBlockFlowV2ToV1(v2);
  const backToV2 = convertBlockFlowV1ToV2(v1);
  // V1 flattens the pair, V2 wraps each into singleton rows
  assert.equal(backToV2.rows.length, 2);
  assert.equal(backToV2.rows[0].items.length, 1);
  assert.equal(backToV2.rows[1].items.length, 1);
});

/* ================================================================== */
/*  MALFORMED INPUT HANDLING                                           */
/* ================================================================== */

test("normalizeBlockFlowV2 — malformed V2 with bad row ignored", () => {
  const b = block({
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
  });
  const flow = {
    version: 2,
    rows: [
      null,
      { id: "bf-c-r1", items: [{ type: "content-row", rowId: "r1" }] },
    ],
  } as unknown as BlockFlowV2;
  const result = normalizeBlockFlowV2(b, flow);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, "bf-c-r1");
});

test("resolveBlockFlowV2 — completely malformed → generates default", () => {
  const b = block({
    apartados: [subBlock("a")],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [] }] }] },
    blockFlow: { version: 99 } as never,
  });
  const flow = resolveBlockFlowV2(b)!;
  assert.equal(flow.version, 2);
  assert.equal(flow.rows.length, 2);
});
