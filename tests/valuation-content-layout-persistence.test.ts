import assert from "node:assert/strict";
import test from "node:test";
import type { ContentLayoutItem, ContentLayoutPersisted } from "../src/features/valuations/model";
import {
  blockMetadataFromContent,
  hydrateBlockMetadata,
  apartadoMetadataFromContent,
  hydrateApartadoMetadata,
} from "../src/features/valuations/metadata";
import { resolveContentLayout } from "../src/features/valuations/services/content-layout";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function layoutItem(type: "concept" | "image" | "table", id: string, span: 4 | 6 | 8 | 12): ContentLayoutItem {
  return { type, id, span };
}

/** Assert that a ContentLayoutPersisted is actually a V1 array and return it. */
function asV1(layout: ContentLayoutPersisted | undefined): ContentLayoutItem[] {
  assert.ok(Array.isArray(layout), "Expected V1 ContentLayoutItem[]");
  return layout;
}

/* ------------------------------------------------------------------ */
/*  Block: serialization round-trip                                   */
/* ------------------------------------------------------------------ */

test("blockMetadataFromContent — serializes contentLayout when present", () => {
  const layout = [layoutItem("concept", "c1", 6), layoutItem("image", "i1", 8)];
  const meta = blockMetadataFromContent({ enabled: true, contentLayout: layout });

  assert.deepEqual(meta.contentLayout, layout);
});

test("blockMetadataFromContent — contentLayout undefined when absent", () => {
  const meta = blockMetadataFromContent({ enabled: true });
  assert.equal(meta.contentLayout, undefined);
});

test("blockMetadataFromContent — preserves enabled and startOnNewPage", () => {
  const meta = blockMetadataFromContent({ enabled: false, startOnNewPage: true, contentLayout: [layoutItem("concept", "c1", 6)] });
  assert.equal(meta.enabled, false);
  assert.equal(meta.startOnNewPage, true);
  assert.equal(asV1(meta.contentLayout).length, 1);
});

/* ------------------------------------------------------------------ */
/*  Block: hydration round-trip                                       */
/* ------------------------------------------------------------------ */

test("hydrateBlockMetadata — parses valid contentLayout from JConfiguracion", () => {
  const config = {
    payload: {
      startOnNewPage: false,
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
        { type: "image", id: "i1", span: 8 },
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);

  const layout = asV1(meta.contentLayout);
  assert.equal(layout.length, 2);
  assert.deepEqual(layout[0], { type: "concept", id: "c1", span: 6 });
  assert.deepEqual(layout[1], { type: "image", id: "i1", span: 8 });
});

test("hydrateBlockMetadata — contentLayout undefined when absent", () => {
  const meta = hydrateBlockMetadata({ payload: { startOnNewPage: true } });
  assert.equal(meta.contentLayout, undefined);
});

test("hydrateBlockMetadata — contentLayout undefined for empty config", () => {
  const meta = hydrateBlockMetadata(null);
  assert.equal(meta.contentLayout, undefined);
});

test("hydrateBlockMetadata — filters out invalid items, preserves valid order", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },       // valid
        { type: "video", id: "v1", span: 8 },          // invalid type
        { type: "image", id: "i1", span: 3 },          // invalid span
        { type: "table", id: "t1", span: 12 },         // valid
        { type: "concept", id: "", span: 6 },           // empty id
        { type: "concept", id: "c2", span: 12 },       // valid
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);

  const layout = asV1(meta.contentLayout);
  assert.equal(layout.length, 3);
  assert.equal(layout[0].id, "c1");
  assert.equal(layout[1].id, "t1");
  assert.equal(layout[2].id, "c2");
});

test("hydrateBlockMetadata — contentLayout undefined when all items invalid", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "video", id: "v1", span: 8 },
        { type: "concept", id: "c1", span: 3 },
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);
  assert.equal(meta.contentLayout, undefined);
});

test("hydrateBlockMetadata — span preserved exactly", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 4 },
        { type: "concept", id: "c2", span: 6 },
        { type: "concept", id: "c3", span: 8 },
        { type: "concept", id: "c4", span: 12 },
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);

  const layout = asV1(meta.contentLayout);
  assert.equal(layout[0].span, 4);
  assert.equal(layout[1].span, 6);
  assert.equal(layout[2].span, 8);
  assert.equal(layout[3].span, 12);
});

test("hydrateBlockMetadata — no row/column/parentId data persisted", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6, row: 0, column: 2, parentId: "block-1" },
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);

  const layout = asV1(meta.contentLayout);
  const item = layout[0] as Record<string, unknown>;
  assert.equal(item.row, undefined);
  assert.equal(item.column, undefined);
  assert.equal(item.parentId, undefined);
});

/* ------------------------------------------------------------------ */
/*  SubBlock: serialization round-trip                                */
/* ------------------------------------------------------------------ */

test("apartadoMetadataFromContent — serializes contentLayout when present", () => {
  const layout = [layoutItem("table", "t1", 12)];
  const meta = apartadoMetadataFromContent({ enabled: true, contentLayout: layout });

  assert.deepEqual(meta.contentLayout, layout);
});

test("apartadoMetadataFromContent — contentLayout undefined when absent", () => {
  const meta = apartadoMetadataFromContent({ enabled: true });
  assert.equal(meta.contentLayout, undefined);
});

/* ------------------------------------------------------------------ */
/*  SubBlock: hydration round-trip                                    */
/* ------------------------------------------------------------------ */

test("hydrateApartadoMetadata — parses valid contentLayout", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
        { type: "table", id: "t1", span: 12 },
      ],
    },
  };
  const meta = hydrateApartadoMetadata(config);

  const layout = asV1(meta.contentLayout);
  assert.equal(layout.length, 2);
  assert.equal(layout[0].id, "c1");
  assert.equal(layout[1].id, "t1");
});

test("hydrateApartadoMetadata — contentLayout undefined when absent", () => {
  const meta = hydrateApartadoMetadata({ payload: {} });
  assert.equal(meta.contentLayout, undefined);
});

test("hydrateApartadoMetadata — filters invalid items", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
        { id: "no-type", span: 8 },                     // missing type
        { type: "image", id: "i1" },                    // missing span
      ],
    },
  };
  const meta = hydrateApartadoMetadata(config);

  const layout = asV1(meta.contentLayout);
  assert.equal(layout.length, 1);
  assert.equal(layout[0].id, "c1");
});

/* ------------------------------------------------------------------ */
/*  Backward compatibility                                            */
/* ------------------------------------------------------------------ */

test("backward compat — existing valuations without contentLayout load unchanged", () => {
  // Simulates a block from DB with no contentLayout in JConfiguracion
  const blockMeta = hydrateBlockMetadata({ payload: { startOnNewPage: false } });
  const subBlockMeta = hydrateApartadoMetadata({ payload: {} });

  assert.equal(blockMeta.contentLayout, undefined);
  assert.equal(subBlockMeta.contentLayout, undefined);
  assert.equal(blockMeta.startOnNewPage, false);
  assert.equal(subBlockMeta.enabled, true);
});

test("backward compat — resolveContentLayout generates legacy layout when contentLayout absent", () => {
  const block = {
    concepts: [{ id: "c1", label: "C1", value: "", enabled: true }],
    images: [],
    tables: [],
  };
  const layout = resolveContentLayout(block);

  assert.equal(layout.length, 1);
  assert.equal(layout[0].type, "concept");
  assert.equal(layout[0].id, "c1");
});

/* ------------------------------------------------------------------ */
/*  Full round-trip: serialize → hydrate → reconcile                  */
/* ------------------------------------------------------------------ */

test("round-trip — block contentLayout survives serialize → hydrate", () => {
  const original = [layoutItem("concept", "c1", 6), layoutItem("image", "i1", 8)];
  const serialized = blockMetadataFromContent({ enabled: true, contentLayout: original });
  const hydrated = hydrateBlockMetadata({ payload: serialized });

  assert.deepEqual(hydrated.contentLayout, original);
});

test("round-trip — subblock contentLayout survives serialize → hydrate", () => {
  const original = [layoutItem("table", "t1", 12), layoutItem("concept", "c2", 4)];
  const serialized = apartadoMetadataFromContent({ enabled: true, contentLayout: original });
  const hydrated = hydrateApartadoMetadata({ payload: serialized });

  assert.deepEqual(hydrated.contentLayout, original);
});

test("round-trip — stale items after hydration remain reconcilable", () => {
  // Simulate: layout references c1, c2 but only c1 exists in container
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
        { type: "concept", id: "c2", span: 12 },  // will be stale
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);
  const container = {
    concepts: [{ id: "c1", label: "C1", value: "", enabled: true }],
    images: [],
    tables: [],
    contentLayout: meta.contentLayout,
  };
  const resolved = resolveContentLayout(container);

  // c2 removed (stale), c1 preserved in order
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].id, "c1");
});

/* ------------------------------------------------------------------ */
/*  No mutation                                                       */
/* ------------------------------------------------------------------ */

test("hydrateBlockMetadata — does not mutate the input config", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
      ],
    },
  };
  const configCopy = JSON.parse(JSON.stringify(config));
  hydrateBlockMetadata(config);

  assert.deepEqual(config, configCopy);
});

/* ------------------------------------------------------------------ */
/*  rowBreakBefore persistence                                        */
/* ------------------------------------------------------------------ */

test("round-trip — block with rowBreakBefore survives serialize → hydrate", () => {
  const original: ContentLayoutItem[] = [
    { type: "concept", id: "c1", span: 6 },
    { type: "concept", id: "c2", span: 6, rowBreakBefore: true },
    { type: "image", id: "i1", span: 8 },
  ];
  const serialized = blockMetadataFromContent({ enabled: true, contentLayout: original });
  const hydrated = hydrateBlockMetadata({ payload: serialized });

  const layout = asV1(hydrated.contentLayout);
  assert.equal(layout.length, 3);
  assert.equal(layout[0].rowBreakBefore, undefined);
  assert.equal(layout[1].rowBreakBefore, true);
  assert.equal(layout[2].rowBreakBefore, undefined);
});

test("round-trip — subblock with rowBreakBefore survives serialize → hydrate", () => {
  const original: ContentLayoutItem[] = [
    { type: "concept", id: "c1", span: 6, rowBreakBefore: true },
    { type: "table", id: "t1", span: 12 },
  ];
  const serialized = apartadoMetadataFromContent({ enabled: true, contentLayout: original });
  const hydrated = hydrateApartadoMetadata({ payload: serialized });

  const layout = asV1(hydrated.contentLayout);
  assert.equal(layout[0].rowBreakBefore, true);
  assert.equal(layout[1].rowBreakBefore, undefined);
});

test("backward compat — legacy metadata without rowBreakBefore loads unchanged", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
        { type: "image", id: "i1", span: 8 },
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);

  const layout = asV1(meta.contentLayout);
  assert.equal(layout[0].rowBreakBefore, undefined);
  assert.equal(layout[1].rowBreakBefore, undefined);
});

test("reconciliation — rowBreakBefore preserved through resolveContentLayout", () => {
  const container = {
    concepts: [
      { id: "c1", label: "C1", value: "", enabled: true },
      { id: "c2", label: "C2", value: "", enabled: true },
    ],
    images: [],
    tables: [],
    contentLayout: [
      { type: "concept" as const, id: "c1", span: 6 as const },
      { type: "concept" as const, id: "c2", span: 6 as const, rowBreakBefore: true },
    ],
  };
  const resolved = resolveContentLayout(container);

  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].rowBreakBefore, undefined);
  assert.equal(resolved[1].rowBreakBefore, true);
});

/* ================================================================== */
/*  Dual V1/V2 persistence support                                    */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Parsing: shape detection                                          */
/* ------------------------------------------------------------------ */

test("parse V1 — valid V1 array hydrates as V1", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
        { type: "image", id: "i1", span: 8 },
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);
  const layout = asV1(meta.contentLayout);
  assert.equal(layout.length, 2);
  assert.equal(layout[0].id, "c1");
  assert.equal(layout[1].id, "i1");
});

test("parse V2 — valid V2 object hydrates as V2", () => {
  const config = {
    payload: {
      contentLayout: {
        version: 2,
        rows: [
          {
            id: "r-0",
            columns: [
              { id: "c-0-0", items: [{ type: "concept", id: "c1" }] },
              { id: "c-0-1", items: [{ type: "image", id: "i1" }] },
            ],
          },
        ],
      },
    },
  };
  const meta = hydrateBlockMetadata(config);

  assert.ok(meta.contentLayout);
  assert.ok(!Array.isArray(meta.contentLayout), "Should be V2, not array");
  const v2 = meta.contentLayout as { version: number; rows: unknown[] };
  assert.equal(v2.version, 2);
  assert.equal(v2.rows.length, 1);
});

test("parse missing — undefined when contentLayout absent", () => {
  const meta = hydrateBlockMetadata({ payload: { startOnNewPage: true } });
  assert.equal(meta.contentLayout, undefined);
});

test("parse malformed array — returns undefined for garbage array", () => {
  const config = { payload: { contentLayout: ["not", "valid"] } };
  const meta = hydrateBlockMetadata(config);
  assert.equal(meta.contentLayout, undefined);
});

test("parse malformed V2 — returns undefined for invalid V2 shape", () => {
  const config = {
    payload: {
      contentLayout: { version: 2, rows: "not-an-array" },
    },
  };
  const meta = hydrateBlockMetadata(config);
  assert.equal(meta.contentLayout, undefined);
});

test("parse wrong version — returns undefined for version 1 object", () => {
  const config = {
    payload: {
      contentLayout: { version: 1, rows: [] },
    },
  };
  const meta = hydrateBlockMetadata(config);
  assert.equal(meta.contentLayout, undefined);
});

test("parse V2 normalized on hydration — malformed refs removed", () => {
  const config = {
    payload: {
      contentLayout: {
        version: 2,
        rows: [
          {
            id: "r-0",
            columns: [
              { id: "c-0-0", items: [{ type: "concept", id: "c1" }] },
              { id: "", items: [{ type: "concept", id: "c2" }] }, // empty column id → removed
            ],
          },
        ],
      },
    },
  };
  const meta = hydrateBlockMetadata(config);

  assert.ok(meta.contentLayout);
  assert.ok(!Array.isArray(meta.contentLayout));
  const v2 = meta.contentLayout as { version: number; rows: { columns: unknown[] }[] };
  // Empty column removed, only 1 column remains
  assert.equal(v2.rows[0].columns.length, 1);
});

/* ------------------------------------------------------------------ */
/*  Round-trip: V1 serialize → hydrate                                */
/* ------------------------------------------------------------------ */

test("round-trip V1 block — serialize → hydrate preserves V1", () => {
  const original = [
    { type: "concept" as const, id: "c1", span: 6 as const },
    { type: "image" as const, id: "i1", span: 8 as const },
  ];
  const serialized = blockMetadataFromContent({ enabled: true, contentLayout: original });
  const hydrated = hydrateBlockMetadata({ payload: serialized });

  const layout = asV1(hydrated.contentLayout);
  assert.deepEqual(layout, original);
});

test("round-trip V2 block — serialize → hydrate preserves V2", () => {
  const original = {
    version: 2 as const,
    rows: [
      {
        id: "r-0",
        columns: [
          { id: "c-0-0", items: [{ type: "concept" as const, id: "c1" }] },
        ],
      },
    ],
  };
  const serialized = blockMetadataFromContent({ enabled: true, contentLayout: original });
  const hydrated = hydrateBlockMetadata({ payload: serialized });

  assert.ok(hydrated.contentLayout);
  assert.ok(!Array.isArray(hydrated.contentLayout));
  const v2 = hydrated.contentLayout as typeof original;
  assert.equal(v2.version, 2);
  assert.equal(v2.rows.length, 1);
  assert.equal(v2.rows[0].columns[0].items[0].id, "c1");
});

test("round-trip V1 subblock — serialize → hydrate preserves V1", () => {
  const original = [
    { type: "table" as const, id: "t1", span: 12 as const },
    { type: "concept" as const, id: "c2", span: 4 as const },
  ];
  const serialized = apartadoMetadataFromContent({ enabled: true, contentLayout: original });
  const hydrated = hydrateApartadoMetadata({ payload: serialized });

  const layout = asV1(hydrated.contentLayout);
  assert.deepEqual(layout, original);
});

test("round-trip V2 subblock — serialize → hydrate preserves V2", () => {
  const original = {
    version: 2 as const,
    rows: [
      {
        id: "r-0",
        columns: [
          { id: "c-0-0", items: [{ type: "table" as const, id: "t1" }] },
          { id: "c-0-1", items: [{ type: "concept" as const, id: "c2" }] },
        ],
      },
    ],
  };
  const serialized = apartadoMetadataFromContent({ enabled: true, contentLayout: original });
  const hydrated = hydrateApartadoMetadata({ payload: serialized });

  assert.ok(hydrated.contentLayout);
  assert.ok(!Array.isArray(hydrated.contentLayout));
  const v2 = hydrated.contentLayout as typeof original;
  assert.equal(v2.version, 2);
  assert.equal(v2.rows[0].columns.length, 2);
});

/* ------------------------------------------------------------------ */
/*  Mixed: V1 Block + V2 Block, V1 SubBlock + V2 SubBlock            */
/* ------------------------------------------------------------------ */

test("mixed — V1 block and V2 block in same valuation hydrate independently", () => {
  const v1Config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
      ],
    },
  };
  const v2Config = {
    payload: {
      contentLayout: {
        version: 2,
        rows: [
          {
            id: "r-0",
            columns: [
              { id: "c-0-0", items: [{ type: "concept", id: "c2" }] },
            ],
          },
        ],
      },
    },
  };

  const block1 = hydrateBlockMetadata(v1Config);
  const block2 = hydrateBlockMetadata(v2Config);

  // Block 1 is V1
  assert.ok(Array.isArray(block1.contentLayout));
  assert.equal(block1.contentLayout.length, 1);

  // Block 2 is V2
  assert.ok(block2.contentLayout);
  assert.ok(!Array.isArray(block2.contentLayout));
  const v2 = block2.contentLayout as { version: number };
  assert.equal(v2.version, 2);
});

test("mixed — V1 subblock and V2 subblock hydrate independently", () => {
  const v1Config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
      ],
    },
  };
  const v2Config = {
    payload: {
      contentLayout: {
        version: 2,
        rows: [
          {
            id: "r-0",
            columns: [
              { id: "c-0-0", items: [{ type: "table", id: "t1" }] },
            ],
          },
        ],
      },
    },
  };

  const sub1 = hydrateApartadoMetadata(v1Config);
  const sub2 = hydrateApartadoMetadata(v2Config);

  // Sub 1 is V1
  assert.ok(Array.isArray(sub1.contentLayout));

  // Sub 2 is V2
  assert.ok(sub2.contentLayout);
  assert.ok(!Array.isArray(sub2.contentLayout));
});

/* ------------------------------------------------------------------ */
/*  Safety: no mutation, V1 stays V1, V2 stays V2                    */
/* ------------------------------------------------------------------ */

test("safety — V1 remains V1 after hydration", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
        { type: "image", id: "i1", span: 8 },
      ],
    },
  };
  const configCopy = JSON.parse(JSON.stringify(config));
  const meta = hydrateBlockMetadata(config);

  // Input unchanged
  assert.deepEqual(config, configCopy);

  // Output is V1 array
  const layout = asV1(meta.contentLayout);
  assert.equal(layout.length, 2);
  assert.equal(layout[0].type, "concept");
  assert.equal(layout[1].type, "image");
});

test("safety — V2 remains V2 after hydration", () => {
  const config = {
    payload: {
      contentLayout: {
        version: 2,
        rows: [
          {
            id: "r-0",
            columns: [
              { id: "c-0-0", items: [{ type: "concept", id: "c1" }] },
            ],
          },
        ],
      },
    },
  };
  const configCopy = JSON.parse(JSON.stringify(config));
  const meta = hydrateBlockMetadata(config);

  // Input unchanged
  assert.deepEqual(config, configCopy);

  // Output is V2 object
  assert.ok(meta.contentLayout);
  assert.ok(!Array.isArray(meta.contentLayout));
  const v2 = meta.contentLayout as { version: number; rows: unknown[] };
  assert.equal(v2.version, 2);
  assert.equal(v2.rows.length, 1);
});

test("safety — no business data duplicated in V2", () => {
  const config = {
    payload: {
      contentLayout: {
        version: 2,
        rows: [
          {
            id: "r-0",
            columns: [
              {
                id: "c-0-0",
                items: [{ type: "concept", id: "c1" }],
                // Extra fields should not be present
                label: "不应出现",
                value: "不应出现",
              },
            ],
          },
        ],
      },
    },
  };
  const meta = hydrateBlockMetadata(config);

  assert.ok(meta.contentLayout);
  assert.ok(!Array.isArray(meta.contentLayout));
  const v2 = meta.contentLayout as { version: number; rows: { columns: { items: Record<string, unknown>[] }[] }[] };
  const item = v2.rows[0].columns[0].items[0];
  assert.equal(item.label, undefined);
  assert.equal(item.value, undefined);
  assert.equal(Object.keys(item).length, 2); // only type and id
});

test("safety — no row/column indexes added", () => {
  const config = {
    payload: {
      contentLayout: {
        version: 2,
        rows: [
          {
            id: "r-0",
            columns: [
              { id: "c-0-0", items: [{ type: "concept", id: "c1" }] },
            ],
          },
        ],
      },
    },
  };
  const meta = hydrateBlockMetadata(config);

  assert.ok(meta.contentLayout);
  assert.ok(!Array.isArray(meta.contentLayout));
  const v2 = meta.contentLayout as { version: number; rows: Record<string, unknown>[] };
  const row = v2.rows[0];
  assert.equal(row.rowIndex, undefined);
  assert.equal(row.columnIndex, undefined);
  assert.equal(row.order, undefined);
});
