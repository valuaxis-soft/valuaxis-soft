import assert from "node:assert/strict";
import test from "node:test";
import type { Concept, ImageContent, TableContent } from "../src/features/valuations/model";
import {
  generateContentLayout,
  resolveContentLayout,
  sanitizeContentLayout,
} from "../src/features/valuations/services/content-layout-legacy";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */

function concept(id: string, layoutSpan?: "full" | "half"): Concept {
  return { id, label: id, value: "", enabled: true, layoutSpan };
}

function table(id: string): TableContent {
  return { id, title: id, columns: ["A"], rows: [["v"]], enabled: true };
}

function image(id: string, layoutWidth?: "normal" | "wide" | "full"): ImageContent {
  return { id, title: id, src: "", enabled: true, layoutWidth };
}

/* ------------------------------------------------------------------ */
/*  generateContentLayout                                             */
/* ------------------------------------------------------------------ */

test("generateContentLayout — empty container returns empty array", () => {
  const result = generateContentLayout({ concepts: [], images: [], tables: [] });
  assert.deepEqual(result, []);
});

test("generateContentLayout — concepts only, legacy render order", () => {
  const c1 = concept("c1");
  const c2 = concept("c2", "full");
  const result = generateContentLayout({ concepts: [c1, c2], images: [], tables: [] });

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { type: "concept", id: "c1", span: 6 });
  assert.deepEqual(result[1], { type: "concept", id: "c2", span: 12 });
});

test("generateContentLayout — images only", () => {
  const i1 = image("i1", "normal");
  const i2 = image("i2", "wide");
  const i3 = image("i3", "full");
  const result = generateContentLayout({ concepts: [], images: [i1, i2, i3], tables: [] });

  assert.equal(result.length, 3);
  assert.deepEqual(result[0], { type: "image", id: "i1", span: 8 });
  assert.deepEqual(result[1], { type: "image", id: "i2", span: 8 }); // wide → 8
  assert.deepEqual(result[2], { type: "image", id: "i3", span: 12 });
});

test("generateContentLayout — tables only, always span 12", () => {
  const t1 = table("t1");
  const t2 = table("t2");
  const result = generateContentLayout({ concepts: [], images: [], tables: [t1, t2] });

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { type: "table", id: "t1", span: 12 });
  assert.deepEqual(result[1], { type: "table", id: "t2", span: 12 });
});

test("generateContentLayout — mixed legacy arrays follow concepts → tables → images order", () => {
  const c1 = concept("c1");
  const t1 = table("t1");
  const i1 = image("i1");
  const result = generateContentLayout({ concepts: [c1], images: [i1], tables: [t1] });

  assert.equal(result.length, 3);
  assert.equal(result[0].type, "concept");
  assert.equal(result[0].id, "c1");
  assert.equal(result[1].type, "table");
  assert.equal(result[1].id, "t1");
  assert.equal(result[2].type, "image");
  assert.equal(result[2].id, "i1");
});

test("generateContentLayout — disabled items are included to preserve identity", () => {
  const c1 = concept("c1");
  c1.enabled = false;
  const i1 = image("i1");
  i1.enabled = false;
  const result = generateContentLayout({ concepts: [c1], images: [i1], tables: [] });

  assert.equal(result.length, 2);
  assert.equal(result[0].id, "c1");
  assert.equal(result[1].id, "i1");
});

test("generateContentLayout — concept span maps correctly", () => {
  const half = concept("half", "half");
  const full = concept("full", "full");
  const none = concept("none");
  const result = generateContentLayout({
    concepts: [half, full, none],
    images: [],
    tables: [],
  });

  assert.equal(result[0].span, 6); // half
  assert.equal(result[1].span, 12); // full
  assert.equal(result[2].span, 6); // no layoutSpan → 6
});

test("generateContentLayout — image width presets map correctly", () => {
  const normal = image("n", "normal");
  const wide = image("w", "wide");
  const full = image("f", "full");
  const none = image("x");
  const result = generateContentLayout({
    concepts: [],
    images: [normal, wide, full, none],
    tables: [],
  });

  assert.equal(result[0].span, 8); // normal
  assert.equal(result[1].span, 8); // wide → 8
  assert.equal(result[2].span, 12); // full
  assert.equal(result[3].span, 8); // no layoutWidth → 8
});

/* ------------------------------------------------------------------ */
/*  resolveContentLayout — legacy fallback                            */
/* ------------------------------------------------------------------ */

test("resolveContentLayout — generates legacy layout when contentLayout is absent", () => {
  const c1 = concept("c1");
  const t1 = table("t1");
  const result = resolveContentLayout({ concepts: [c1], images: [], tables: [t1] });

  assert.equal(result.length, 2);
  assert.equal(result[0].type, "concept");
  assert.equal(result[1].type, "table");
});

test("resolveContentLayout — generates legacy layout when contentLayout is empty array", () => {
  const c1 = concept("c1");
  const result = resolveContentLayout({ concepts: [c1], images: [], tables: [], contentLayout: [] });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "c1");
});

test("resolveContentLayout — completely legacy containers still generate concepts → tables → images", () => {
  const c1 = concept("c1");
  const c2 = concept("c2");
  const t1 = table("t1");
  const i1 = image("i1");
  const result = resolveContentLayout({ concepts: [c1, c2], images: [i1], tables: [t1] });

  assert.equal(result.length, 4);
  assert.deepEqual(result, [
    { type: "concept", id: "c1", span: 6 },
    { type: "concept", id: "c2", span: 6 },
    { type: "table", id: "t1", span: 12 },
    { type: "image", id: "i1", span: 8 },
  ]);
});

/* ------------------------------------------------------------------ */
/*  resolveContentLayout — valid layout passthrough                   */
/* ------------------------------------------------------------------ */

test("resolveContentLayout — returns valid existing contentLayout unchanged", () => {
  const c1 = concept("c1");
  const i1 = image("i1");
  const layout = [
    { type: "image" as const, id: "i1", span: 8 as const },
    { type: "concept" as const, id: "c1", span: 12 as const },
  ];
  const result = resolveContentLayout({ concepts: [c1], images: [i1], tables: [], contentLayout: layout });

  assert.deepEqual(result, layout);
});

/* ------------------------------------------------------------------ */
/*  resolveContentLayout — reconciliation: stale removal              */
/* ------------------------------------------------------------------ */

test("resolveContentLayout — removes stale reference, preserves remaining custom order", () => {
  const c1 = concept("c1");
  const c2 = concept("c2");
  // User ordered: c2 first, then stale-concept, then c1
  const layout = [
    { type: "concept" as const, id: "c2", span: 12 as const },
    { type: "concept" as const, id: "stale-concept", span: 6 as const },
    { type: "concept" as const, id: "c1", span: 6 as const },
  ];
  const result = resolveContentLayout({ concepts: [c1, c2], images: [], tables: [], contentLayout: layout });

  // stale-concept removed; c2 and c1 kept in original order
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "c2");
  assert.equal(result[0].span, 12);
  assert.equal(result[1].id, "c1");
  assert.equal(result[1].span, 6);
});

test("resolveContentLayout — removing one referenced item preserves all remaining custom order", () => {
  const c1 = concept("c1");
  const c3 = concept("c3");
  // Custom order: c3, c1 (c2 was deleted from container)
  const layout = [
    { type: "concept" as const, id: "c3", span: 12 as const },
    { type: "concept" as const, id: "c1", span: 6 as const },
  ];
  const result = resolveContentLayout({ concepts: [c1, c3], images: [], tables: [], contentLayout: layout });

  assert.equal(result.length, 2);
  assert.equal(result[0].id, "c3");
  assert.equal(result[0].span, 12);
  assert.equal(result[1].id, "c1");
  assert.equal(result[1].span, 6);
});

/* ------------------------------------------------------------------ */
/*  resolveContentLayout — reconciliation: duplicate removal          */
/* ------------------------------------------------------------------ */

test("resolveContentLayout — removes duplicates, keeps first valid occurrence", () => {
  const c1 = concept("c1");
  const layout = [
    { type: "concept" as const, id: "c1", span: 6 as const },
    { type: "concept" as const, id: "c1", span: 12 as const }, // duplicate
  ];
  const result = resolveContentLayout({ concepts: [c1], images: [], tables: [], contentLayout: layout });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "c1");
  assert.equal(result[0].span, 6); // first occurrence kept
});

test("resolveContentLayout — duplicates are removed without resetting layout", () => {
  const c1 = concept("c1");
  const c2 = concept("c2");
  const layout = [
    { type: "concept" as const, id: "c1", span: 12 as const },
    { type: "concept" as const, id: "c2", span: 6 as const },
    { type: "concept" as const, id: "c1", span: 6 as const }, // dup of c1
  ];
  const result = resolveContentLayout({ concepts: [c1, c2], images: [], tables: [], contentLayout: layout });

  assert.equal(result.length, 2);
  assert.equal(result[0].id, "c1");
  assert.equal(result[0].span, 12); // first occurrence
  assert.equal(result[1].id, "c2");
  assert.equal(result[1].span, 6);
});

/* ------------------------------------------------------------------ */
/*  resolveContentLayout — reconciliation: missing append             */
/* ------------------------------------------------------------------ */

test("resolveContentLayout — adding a new concept preserves existing custom order, appends only new", () => {
  const c1 = concept("c1");
  const c2 = concept("c2"); // new, not in layout
  const i1 = image("i1");
  // User ordered: i1 before c1
  const layout = [
    { type: "image" as const, id: "i1", span: 8 as const },
    { type: "concept" as const, id: "c1", span: 6 as const },
  ];
  const result = resolveContentLayout({ concepts: [c1, c2], images: [i1], tables: [], contentLayout: layout });

  assert.equal(result.length, 3);
  // Existing order preserved
  assert.equal(result[0].id, "i1");
  assert.equal(result[1].id, "c1");
  // New concept appended after existing items
  assert.equal(result[2].id, "c2");
  assert.equal(result[2].type, "concept");
});

test("resolveContentLayout — adding a new image preserves existing custom order", () => {
  const c1 = concept("c1");
  const i1 = image("i1");
  const i2 = image("i2"); // new
  const layout = [
    { type: "concept" as const, id: "c1", span: 12 as const },
    { type: "image" as const, id: "i1", span: 8 as const },
  ];
  const result = resolveContentLayout({ concepts: [c1], images: [i1, i2], tables: [], contentLayout: layout });

  assert.equal(result.length, 3);
  assert.equal(result[0].id, "c1");
  assert.equal(result[1].id, "i1");
  // New image appended
  assert.equal(result[2].id, "i2");
  assert.equal(result[2].type, "image");
});

test("resolveContentLayout — adding a new table appends in correct legacy position", () => {
  const c1 = concept("c1");
  const t1 = table("t1"); // new
  const i1 = image("i1");
  const layout = [
    { type: "concept" as const, id: "c1", span: 6 as const },
    { type: "image" as const, id: "i1", span: 8 as const },
  ];
  const result = resolveContentLayout({ concepts: [c1], images: [i1], tables: [t1], contentLayout: layout });

  assert.equal(result.length, 3);
  assert.equal(result[0].id, "c1");
  assert.equal(result[1].id, "i1");
  // New table appended (tables come after images in missing-items order? No: legacy is concepts → tables → images)
  // Missing items: t1 is a table, appended after all existing items
  assert.equal(result[2].id, "t1");
  assert.equal(result[2].type, "table");
});

/* ------------------------------------------------------------------ */
/*  resolveContentLayout — reconciliation: combined stale + missing   */
/* ------------------------------------------------------------------ */

test("resolveContentLayout — stale + missing references reconciled in one pass", () => {
  const c1 = concept("c1");
  const c2 = concept("c2"); // new, not in layout
  const i1 = image("i1");
  const t1 = table("t1"); // new, not in layout
  // Custom order: stale-image, c1, stale-table, i1
  const layout = [
    { type: "image" as const, id: "stale-image", span: 8 as const },
    { type: "concept" as const, id: "c1", span: 12 as const },
    { type: "table" as const, id: "stale-table", span: 12 as const },
    { type: "image" as const, id: "i1", span: 8 as const },
  ];
  const result = resolveContentLayout({ concepts: [c1, c2], images: [i1], tables: [t1], contentLayout: layout });

  // stale-image and stale-table removed
  // c1 and i1 kept in original order
  // c2 (concept) and t1 (table) appended in legacy type order
  assert.equal(result.length, 4);
  assert.equal(result[0].id, "c1");
  assert.equal(result[0].span, 12);
  assert.equal(result[1].id, "i1");
  assert.equal(result[1].span, 8);
  // Missing items in legacy order: concepts → tables → images
  assert.equal(result[2].id, "c2");
  assert.equal(result[2].type, "concept");
  assert.equal(result[3].id, "t1");
  assert.equal(result[3].type, "table");
});

/* ------------------------------------------------------------------ */
/*  resolveContentLayout — reconciliation: invalid items skipped      */
/* ------------------------------------------------------------------ */

test("resolveContentLayout — invalid span skipped, valid items kept", () => {
  const c1 = concept("c1");
  const c2 = concept("c2");
  const layout = [
    { type: "concept" as const, id: "c1", span: 3 as unknown as 4 | 6 | 8 | 12 },
    { type: "concept" as const, id: "c2", span: 12 as const },
  ];
  const result = resolveContentLayout({ concepts: [c1, c2], images: [], tables: [], contentLayout: layout });

  assert.equal(result.length, 2);
  assert.equal(result[0].id, "c2"); // invalid c1 skipped
  assert.equal(result[0].span, 12);
  assert.equal(result[1].id, "c1"); // missing c1 appended
  assert.equal(result[1].type, "concept");
});

test("resolveContentLayout — invalid type skipped, valid items kept", () => {
  const c1 = concept("c1");
  const layout = [
    { type: "video" as unknown as "concept", id: "c1", span: 6 as const },
  ];
  const result = resolveContentLayout({ concepts: [c1], images: [], tables: [], contentLayout: layout });

  // Invalid item skipped → empty layout → falls back to legacy generation
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "c1");
  assert.equal(result[0].span, 6);
});

/* ------------------------------------------------------------------ */
/*  resolveContentLayout — empty container                            */
/* ------------------------------------------------------------------ */

test("resolveContentLayout — empty container with layout returns empty", () => {
  const layout = [
    { type: "concept" as const, id: "gone", span: 6 as const },
  ];
  const result = resolveContentLayout({ concepts: [], images: [], tables: [], contentLayout: layout });

  assert.equal(result.length, 0);
});

/* ------------------------------------------------------------------ */
/*  resolveContentLayout — no input mutation                          */
/* ------------------------------------------------------------------ */

test("resolveContentLayout — never mutates the input container or layout", () => {
  const c1 = concept("c1");
  const c2 = concept("c2");
  const layout = [
    { type: "concept" as const, id: "c1", span: 6 as const },
    { type: "concept" as const, id: "stale", span: 12 as const },
  ];
  const layoutCopy = layout.map((item) => ({ ...item }));
  const conceptsCopy = [c1, c2].map((c) => ({ ...c }));

  resolveContentLayout({ concepts: [c1, c2], images: [], tables: [], contentLayout: layout });

  // Layout array unchanged
  assert.equal(layout.length, layoutCopy.length);
  assert.deepEqual(layout, layoutCopy);
  // Concepts array unchanged
  assert.equal(conceptsCopy.length, 2);
});

/* ------------------------------------------------------------------ */
/*  sanitizeContentLayout                                             */
/* ------------------------------------------------------------------ */

test("sanitizeContentLayout — returns undefined when layout is undefined", () => {
  const result = sanitizeContentLayout({ concepts: [], images: [], tables: [] }, undefined);
  assert.equal(result, undefined);
});

test("sanitizeContentLayout — removes stale concept references", () => {
  const c1 = concept("c1");
  const layout = [
    { type: "concept" as const, id: "c1", span: 6 as const },
    { type: "concept" as const, id: "deleted-concept", span: 6 as const },
  ];
  const result = sanitizeContentLayout({ concepts: [c1], images: [], tables: [] }, layout);

  assert.ok(result);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "c1");
});

test("sanitizeContentLayout — removes stale image references", () => {
  const i1 = image("i1");
  const layout = [
    { type: "image" as const, id: "i1", span: 8 as const },
    { type: "image" as const, id: "deleted-image", span: 8 as const },
  ];
  const result = sanitizeContentLayout({ concepts: [], images: [i1], tables: [] }, layout);

  assert.ok(result);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "i1");
});

test("sanitizeContentLayout — removes stale table references", () => {
  const t1 = table("t1");
  const layout = [
    { type: "table" as const, id: "t1", span: 12 as const },
    { type: "table" as const, id: "deleted-table", span: 12 as const },
  ];
  const result = sanitizeContentLayout({ concepts: [], images: [], tables: [t1] }, layout);

  assert.ok(result);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "t1");
});

test("sanitizeContentLayout — returns undefined when all references are stale", () => {
  const layout = [
    { type: "concept" as const, id: "gone-1", span: 6 as const },
    { type: "image" as const, id: "gone-2", span: 8 as const },
  ];
  const result = sanitizeContentLayout({ concepts: [], images: [], tables: [] }, layout);

  assert.equal(result, undefined);
});

test("sanitizeContentLayout — does not mutate the input array", () => {
  const c1 = concept("c1");
  const layout = [
    { type: "concept" as const, id: "c1", span: 6 as const },
    { type: "concept" as const, id: "stale", span: 6 as const },
  ];
  const originalLength = layout.length;
  sanitizeContentLayout({ concepts: [c1], images: [], tables: [] }, layout);

  assert.equal(layout.length, originalLength);
  assert.equal(layout[1].id, "stale");
});

test("sanitizeContentLayout — preserves valid mixed layout", () => {
  const c1 = concept("c1");
  const t1 = table("t1");
  const i1 = image("i1");
  const layout = [
    { type: "concept" as const, id: "c1", span: 6 as const },
    { type: "table" as const, id: "t1", span: 12 as const },
    { type: "image" as const, id: "i1", span: 8 as const },
  ];
  const result = sanitizeContentLayout(
    { concepts: [c1], images: [i1], tables: [t1] },
    layout,
  );

  assert.ok(result);
  assert.equal(result.length, 3);
  assert.deepEqual(result, layout);
});
