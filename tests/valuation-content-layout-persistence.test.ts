import assert from "node:assert/strict";
import test from "node:test";
import type { ContentLayout } from "../src/features/valuations/model";
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

function singleConceptLayout(id: string): ContentLayout {
  return {
    version: 2,
    rows: [{ id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept", id }] }] }],
  };
}

/* ------------------------------------------------------------------ */
/*  Serialization                                                     */
/* ------------------------------------------------------------------ */

test("blockMetadataFromContent — contentLayout undefined when absent", () => {
  const meta = blockMetadataFromContent({ enabled: true });
  assert.equal(meta.contentLayout, undefined);
});

test("blockMetadataFromContent — preserves enabled and startOnNewPage", () => {
  const layout = singleConceptLayout("c1");
  const meta = blockMetadataFromContent({ enabled: false, startOnNewPage: true, contentLayout: layout });
  assert.equal(meta.enabled, false);
  assert.equal(meta.startOnNewPage, true);
  assert.deepEqual(meta.contentLayout, layout);
});

test("apartadoMetadataFromContent — contentLayout undefined when absent", () => {
  const meta = apartadoMetadataFromContent({ enabled: true });
  assert.equal(meta.contentLayout, undefined);
});

/* ------------------------------------------------------------------ */
/*  Hydration: absent layout                                          */
/* ------------------------------------------------------------------ */

test("hydrateBlockMetadata — contentLayout undefined when absent", () => {
  const meta = hydrateBlockMetadata({ payload: { startOnNewPage: true } });
  assert.equal(meta.contentLayout, undefined);
});

test("hydrateBlockMetadata — contentLayout undefined for empty config", () => {
  const meta = hydrateBlockMetadata(null);
  assert.equal(meta.contentLayout, undefined);
});

test("hydrateApartadoMetadata — contentLayout undefined when absent", () => {
  const meta = hydrateApartadoMetadata({ payload: {} });
  assert.equal(meta.contentLayout, undefined);
});

test("no stored layout — existing valuations without contentLayout load unchanged", () => {
  // Simulates a block from DB with no contentLayout in JConfiguracion
  const blockMeta = hydrateBlockMetadata({ payload: { startOnNewPage: false } });
  const subBlockMeta = hydrateApartadoMetadata({ payload: {} });

  assert.equal(blockMeta.contentLayout, undefined);
  assert.equal(subBlockMeta.contentLayout, undefined);
  assert.equal(blockMeta.startOnNewPage, false);
  assert.equal(subBlockMeta.enabled, true);
});

test("no stored layout — resolveContentLayout bootstraps a layout from the content arrays", () => {
  const block = {
    concepts: [{ id: "c1", label: "C1", value: "", enabled: true }],
    images: [],
    tables: [],
  };
  const layout = resolveContentLayout(block);

  assert.deepEqual(layout, {
    version: 2,
    rows: [{ id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept", id: "c1" }] }] }],
  });
});

/* ------------------------------------------------------------------ */
/*  No mutation                                                       */
/* ------------------------------------------------------------------ */

test("hydrateBlockMetadata — does not mutate the input config", () => {
  const config = { payload: { contentLayout: singleConceptLayout("c1") } };
  const configCopy = JSON.parse(JSON.stringify(config));
  hydrateBlockMetadata(config);

  assert.deepEqual(config, configCopy);
});

/* ================================================================== */
/*  Persistence of the row/column layout                              */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Parsing: shape detection                                          */
/* ------------------------------------------------------------------ */

test("parse obsolete flat array — block treated as having no layout", () => {
  const config = {
    payload: {
      contentLayout: [
        { type: "concept", id: "c1", span: 6 },
        { type: "image", id: "i1", span: 8 },
      ],
    },
  };
  const meta = hydrateBlockMetadata(config);
  assert.equal(meta.contentLayout, undefined);
});

test("parse obsolete flat array — apartado treated as having no layout", () => {
  const config = {
    payload: {
      contentLayout: [{ type: "table", id: "t1", span: 12, rowBreakBefore: true }],
    },
  };
  const meta = hydrateApartadoMetadata(config);
  assert.equal(meta.contentLayout, undefined);
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
/*  Round-trip: serialize → hydrate                                   */
/* ------------------------------------------------------------------ */

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
/*  Safety                                                            */
/* ------------------------------------------------------------------ */

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
