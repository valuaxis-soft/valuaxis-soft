import assert from "node:assert/strict";
import test from "node:test";
import { COST_TEMPLATE_BLOCK_IDS } from "../src/features/valuations/calculation/cost-document";
import { INCOME_TEMPLATE_BLOCK_IDS } from "../src/features/valuations/calculation/income-document";
import { GENERATED_BLOCK_PREFIX, MARKET_TEMPLATE_BLOCK_IDS } from "../src/features/valuations/calculation/market-document";
import { buildSectionsPayload } from "../src/features/valuations/components/workspace/model/save-payload";
import { mergeDatosImages } from "../src/features/valuations/components/workspace/model/initial-hydration";
import type { Apartado, AppSection, Block, Concept, ImageContent, TableContent } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { ensureTerrenoSection, TERRENO_ELEMENT_IDS, TERRENO_MAIN_BLOCK_ID } from "../src/features/valuations/sections/terreno";
import { COMPANY_HEADER_BLOCK_ID } from "../src/features/valuations/services/caratula-company-header";
import {
  applyContentDropToBlocks,
  canMoveContent,
  type ContentDropSource,
} from "../src/features/valuations/services/content-drop";
import { resolveContentLayout } from "../src/features/valuations/services/content-layout";
import { contentMoveRulesForSection } from "../src/features/valuations/services/content-move-rules";
import type { ContentContainerRef, TransferableContentType } from "../src/features/valuations/services/content-transfer";
import { ensureTableV2 } from "../src/features/valuations/services/table";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const concept = (id: string): Concept => ({ id, label: id, value: `${id} value`, enabled: true });

const image = (id: string): ImageContent => ({
  id,
  title: `${id}.jpg`,
  src: `uploads/2026-10/${id}.jpg`,
  enabled: true,
  layoutWidth: "wide",
  layoutWidthPercent: 40,
  captionText: "Fachada",
  captionEnabled: true,
});

const table = (id: string): TableContent => ({
  id,
  title: `Tabla ${id}`,
  version: 2,
  columns: [{ id: `${id}-a`, name: "A", format: { type: "currency" } }, { id: `${id}-b`, name: "B" }],
  rows: [
    { id: `${id}-r1`, cells: { [`${id}-a`]: { kind: "value", value: "10" }, [`${id}-b`]: { kind: "value", value: "x" } } },
    {
      id: `${id}-r2`,
      cells: {
        [`${id}-a`]: { kind: "formula", formula: { op: "sum", args: [{ type: "cell", rowId: `${id}-r1`, columnId: `${id}-a` }] } },
        [`${id}-b`]: { kind: "value", value: "y" },
      },
    },
  ],
  enabled: true,
} as unknown as TableContent);

function apartado(id: string, parts: Partial<Apartado> = {}): Apartado {
  return { id, title: id, enabled: true, concepts: [], tables: [], images: [], ...parts };
}

function block(id: string, parts: Partial<Block> = {}): Block {
  return { id, title: id, sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [], ...parts };
}

function section(id: string, blocks: Block[]): AppSection {
  return { id, label: "", title: id, sourceFile: "", enabled: true, required: false, blocks };
}

const inBlock = (blockId: string): ContentContainerRef => ({ kind: "block", blockId });
const inApartado = (blockId: string, apartadoId: string): ContentContainerRef => ({ kind: "apartado", blockId, apartadoId });
const drag = (container: ContentContainerRef, itemType: TransferableContentType, itemId: string): ContentDropSource =>
  ({ container, itemType, itemId });

/** Every place an item id shows up in: content arrays and layouts, as "block" or "block/apartado". */
function placesOf(blocks: Block[], type: TransferableContentType, id: string) {
  const key = `${type}s` as "concepts" | "images" | "tables";
  const inArray: string[] = [];
  const inLayout: string[] = [];
  for (const item of blocks) {
    const containers: Array<[string, Block | Apartado]> = [
      [item.id, item],
      ...item.apartados.map((child): [string, Apartado] => [`${item.id}/${child.id}`, child]),
    ];
    for (const [name, container] of containers) {
      if (container[key].some((entry) => entry.id === id)) inArray.push(name);
      const refs = resolveContentLayout(container).rows.flatMap((row) => row.columns.map((col) => col.items[0]));
      if (refs.some((ref) => ref.type === type && ref.id === id)) inLayout.push(name);
    }
  }
  return { inArray, inLayout };
}

/* ================================================================== */
/*  Rules per section                                                  */
/* ================================================================== */

test("move rules — in an ordinary section concepts, images and tables go to any other block or apartado", () => {
  const consideraciones = section("consideraciones", [
    block("one", { concepts: [concept("a")], images: [image("i")], tables: [table("t")] }),
    block("two", { apartados: [apartado("S")] }),
  ]);
  const rules = contentMoveRulesForSection(consideraciones);
  for (const type of ["concept", "image", "table"] as const) {
    assert.equal(canMoveContent(rules, drag(inBlock("one"), type, "x"), inBlock("two")), true, type);
    assert.equal(canMoveContent(rules, drag(inBlock("one"), type, "x"), inApartado("two", "S")), true, type);
  }
  assert.equal(rules.lockedBlockIds.size, 0);
  assert.equal(rules.pinnedItems.size, 0);
});

test("move rules — blocks written by the calculation, and the template blocks they replace, give and take nothing", () => {
  const generated = `${GENERATED_BLOCK_PREFIX}costos-enfoque-terreno`;
  // Saved block ids come back in lower case.
  const placeholder = COST_TEMPLATE_BLOCK_IDS[0].toLowerCase();
  const costos = section("costos", [
    block(generated, { concepts: [concept("g")] }),
    block(placeholder, { concepts: [concept("p")] }),
    block("mine", { concepts: [concept("m")] }),
    block("other", { concepts: [concept("o")] }),
  ]);
  const rules = contentMoveRulesForSection(costos);

  assert.deepEqual([...rules.lockedBlockIds].sort(), [generated, placeholder].sort());
  assert.equal(canMoveContent(rules, drag(inBlock("mine"), "concept", "m"), inBlock(generated)), false);
  assert.equal(canMoveContent(rules, drag(inBlock("mine"), "concept", "m"), inBlock(placeholder)), false);
  assert.equal(canMoveContent(rules, drag(inBlock(generated), "concept", "g"), inBlock("mine")), false);
  assert.equal(canMoveContent(rules, drag(inBlock(placeholder), "concept", "p"), inBlock("mine")), false);
  assert.equal(canMoveContent(rules, drag(inBlock("mine"), "concept", "m"), inBlock("other")), true);

  const refused = applyContentDropToBlocks(costos.blocks, drag(inBlock("mine"), "concept", "m"), { kind: "block-inside", container: inBlock(placeholder) }, rules);
  assert.equal(refused.changed, false);

  for (const id of [...MARKET_TEMPLATE_BLOCK_IDS, ...INCOME_TEMPLATE_BLOCK_IDS]) {
    assert.equal(contentMoveRulesForSection(section("x", [block(id)])).lockedBlockIds.has(id), true, id);
  }
});

test("move rules — in the carátula only concepts change block, and the fixed blocks stay out of it", () => {
  const caratula = section("caratula", [
    block(COMPANY_HEADER_BLOCK_ID),
    block("caratula-block-1", { concepts: [concept("a")] }),
    block("custom", { apartados: [apartado("S")] }),
    block("caratula-supuestos", { title: "SUPUESTOS Y CONDICIONES" }),
    block("caratula-conclusion", { title: "CONCLUSIÓN" }),
  ]);
  const rules = contentMoveRulesForSection(caratula);
  const from = (type: TransferableContentType) => drag(inBlock("caratula-block-1"), type, "a");

  assert.equal(canMoveContent(rules, from("concept"), inBlock("custom")), true);
  assert.equal(canMoveContent(rules, from("concept"), inApartado("custom", "S")), true);
  assert.equal(canMoveContent(rules, from("image"), inBlock("custom")), false);
  assert.equal(canMoveContent(rules, from("table"), inBlock("custom")), false);
  for (const fixed of [COMPANY_HEADER_BLOCK_ID, "caratula-supuestos", "caratula-conclusion"]) {
    assert.equal(canMoveContent(rules, from("concept"), inBlock(fixed)), false, fixed);
    assert.equal(canMoveContent(rules, drag(inBlock(fixed), "concept", "x"), inBlock("custom")), false, fixed);
  }
});

test("move rules — the tables filled from the cost capture stay in their apartado", () => {
  const construccion = createInitialSections().find((item) => item.id === "construccion");
  assert.ok(construccion);
  const rules = contentMoveRulesForSection(construccion);
  const captured = construccion.blocks.flatMap((item) =>
    item.apartados.flatMap((child) => child.tables.map((entry) => ({ block: item.id, apartado: child.id, table: entry.id }))),
  ).filter((entry) => /(construccion_tipos|instalaciones_especiales)$/.test(entry.table));
  assert.equal(captured.length, 2, "the template has both capture tables");

  for (const entry of captured) {
    const source = drag(inApartado(entry.block, entry.apartado), "table", entry.table);
    assert.equal(canMoveContent(rules, source, inApartado(entry.block, entry.apartado)), true);
    assert.equal(canMoveContent(rules, source, inBlock(entry.block)), false);
    assert.equal(canMoveContent(rules, source, inBlock("another")), false);
  }
  // A table the appraiser added moves like any other.
  assert.equal(canMoveContent(rules, drag(inBlock(captured[0].block), "table", "tbl-own"), inBlock("another")), true);
});

test("move rules — terreno: the main block is open; Medidas y colindancias keeps its table of measures and takes any content", () => {
  const terreno = ensureTerrenoSection(createInitialSections().find((item) => item.id === "terreno")!);
  const withExtra = { ...terreno, blocks: [...terreno.blocks, block("extra", { concepts: [concept("e")], images: [image("i")], tables: [table("t")] })] };
  const rules = contentMoveRulesForSection(withExtra);
  // The template block as a new valuation has it, and as a saved one names it.
  const main = terreno.blocks[0];
  const boundaries = inApartado(main.id, main.apartados[0].id);
  const boundaryTable = main.apartados[0].tables[0].id;
  assert.equal(main.apartados[0].title, "MEDIDAS Y COLINDANCIAS");

  assert.equal(rules.lockedBlockIds.size, 0);
  assert.equal(canMoveContent(rules, drag(inBlock("extra"), "concept", "e"), inBlock(main.id)), true);
  assert.equal(canMoveContent(rules, drag(inBlock("extra"), "image", "i"), inBlock(main.id)), true);
  assert.equal(canMoveContent(rules, drag(inBlock("extra"), "table", "t"), inBlock(main.id)), true);

  assert.equal(canMoveContent(rules, drag(inBlock("extra"), "concept", "e"), boundaries), true);
  assert.equal(canMoveContent(rules, drag(inBlock("extra"), "image", "i"), boundaries), true);
  assert.equal(canMoveContent(rules, drag(inBlock("extra"), "table", "t"), boundaries), true);

  assert.equal(canMoveContent(rules, drag(boundaries, "table", boundaryTable), boundaries), true);
  assert.equal(canMoveContent(rules, drag(boundaries, "table", boundaryTable), inBlock(main.id)), false);
  assert.equal(canMoveContent(rules, drag(boundaries, "table", boundaryTable), inBlock("extra")), false);

  // What goes into the apartado survives the normalization of the section, and may leave again.
  let blocks = withExtra.blocks;
  for (const [type, id] of [["concept", "e"], ["image", "i"], ["table", "t"]] as const) {
    const moved = applyContentDropToBlocks(blocks, drag(inBlock("extra"), type, id), { kind: "apartado-inside", container: boundaries }, rules);
    assert.equal(moved.changed, true);
    blocks = moved.blocks;
  }
  const rebuilt = ensureTerrenoSection({ ...withExtra, blocks });
  for (const [type, id] of [["concept", "e"], ["image", "i"], ["table", "t"]] as const) {
    assert.deepEqual(placesOf(rebuilt.blocks, type, id).inArray, [`${main.id}/${main.apartados[0].id}`]);
  }
  const rebuiltRules = contentMoveRulesForSection(rebuilt);
  assert.equal(canMoveContent(rebuiltRules, drag(boundaries, "table", "t"), inBlock("extra")), true);
  assert.equal(canMoveContent(rebuiltRules, drag(boundaries, "table", boundaryTable), inBlock("extra")), false);
});


test("move rules — terreno: the fixed apartado is recognized by its saved id too", () => {
  const terreno = section("terreno", [
    block(TERRENO_MAIN_BLOCK_ID, {
      apartados: [apartado(TERRENO_ELEMENT_IDS.boundaries, {
        title: "Otro título",
        tables: [{ ...table("bt"), boundaryDistanceFormats: [{ valueFormat: "m" }] }, table("own")],
      })],
    }),
    block("extra"),
  ]);
  const rules = contentMoveRulesForSection(terreno);
  const boundaries = inApartado(TERRENO_MAIN_BLOCK_ID, TERRENO_ELEMENT_IDS.boundaries);
  assert.equal(canMoveContent(rules, drag(boundaries, "table", "bt"), inBlock("extra")), false);
  assert.equal(canMoveContent(rules, drag(boundaries, "table", "own"), inBlock("extra")), true);
  // The same ids in another section mean nothing.
  const elsewhere = contentMoveRulesForSection({ ...terreno, id: "consideraciones" });
  assert.equal(canMoveContent(elsewhere, drag(inBlock("extra"), "table", "t"), boundaries), true);
});

/* ================================================================== */
/*  An image or a table in its new block                               */
/* ================================================================== */

function contentSection(): AppSection {
  return section("consideraciones", [
    block("one", { concepts: [concept("a")], images: [image("i")], tables: [table("t"), table("t2")] }),
    block("two", { concepts: [concept("b")], apartados: [apartado("S", { concepts: [concept("s")] })] }),
  ]);
}

test("an image moved to another block is the same image, in one place, in the editor and in what is saved", () => {
  const start = contentSection();
  const rules = contentMoveRulesForSection(start);
  const result = applyContentDropToBlocks(start.blocks, drag(inBlock("one"), "image", "i"), {
    kind: "row", container: inApartado("two", "S"), rowId: resolveContentLayout(start.blocks[1].apartados[0]).rows[0].id, placement: "below",
  }, rules);

  assert.equal(result.changed, true);
  assert.deepEqual(placesOf(result.blocks, "image", "i"), { inArray: ["two/S"], inLayout: ["two/S"] });
  assert.equal(result.blocks[1].apartados[0].images[0], start.blocks[0].images[0], "the very same object: file, title and size");

  const [, two] = buildSectionsPayload([{ ...start, blocks: result.blocks }])[0].blocks;
  const saved = two.subBlocks[0].images[0];
  assert.deepEqual(
    { id: saved.id, title: saved.title, src: saved.src, layoutWidth: saved.layoutWidth, layoutWidthPercent: saved.layoutWidthPercent, captionText: saved.captionText },
    { id: "i", title: "i.jpg", src: "uploads/2026-10/i.jpg", layoutWidth: "wide", layoutWidthPercent: 40, captionText: "Fachada" },
  );
  assert.deepEqual(buildSectionsPayload([{ ...start, blocks: result.blocks }])[0].blocks[0].images, []);
});

test("a table moved to another block keeps its values, formulas and column formats", () => {
  const start = contentSection();
  const rules = contentMoveRulesForSection(start);
  const result = applyContentDropToBlocks(start.blocks, drag(inBlock("one"), "table", "t"), {
    kind: "column", container: inBlock("two"), columnId: resolveContentLayout(start.blocks[1]).rows[0].columns[0].id, placement: "right",
  }, rules);

  assert.equal(result.changed, true);
  assert.deepEqual(placesOf(result.blocks, "table", "t"), { inArray: ["two"], inLayout: ["two"] });
  assert.deepEqual(placesOf(result.blocks, "table", "t2"), { inArray: ["one"], inLayout: ["one"] });
  assert.deepEqual(ensureTableV2(result.blocks[1].tables[0]), ensureTableV2(table("t")));
  assert.deepEqual(resolveContentLayout(result.blocks[1]).rows[0].columns.map((col) => col.items[0].id), ["b", "t"]);

  const payload = buildSectionsPayload([{ ...start, blocks: result.blocks }])[0].blocks;
  assert.deepEqual(payload[0].tables.map((entry) => entry.id), ["t2"]);
  assert.deepEqual(payload[1].tables.map((entry) => entry.id), ["t"]);
});

test("moving an item to another block and back leaves the blocks showing what they showed", () => {
  const start = contentSection();
  const rules = contentMoveRulesForSection(start);
  const there = applyContentDropToBlocks(start.blocks, drag(inBlock("one"), "table", "t2"), { kind: "apartado-inside", container: inApartado("two", "S") }, rules);
  assert.equal(there.changed, true);
  // Undo restores the previous section object: nothing of it was touched.
  assert.deepEqual(placesOf(start.blocks, "table", "t2"), { inArray: ["one"], inLayout: ["one"] });
  assert.deepEqual(placesOf(there.blocks, "table", "t2"), { inArray: ["two/S"], inLayout: ["two/S"] });
});

/* ================================================================== */
/*  Datos generales images (file service)                              */
/* ================================================================== */

const stored = (id: string, blockId: string, subBlockId: string | null = null) =>
  ({ id, filename: `${id}.jpg`, mimeType: "image/jpeg", size: 1, url: `/api/archivos/imagen?key=${id}`, blockId, subBlockId });

test("datos images — an image moved to another block gets its URL where it is now, not a copy where it was uploaded", () => {
  const datos = section("datos", [
    block("one", { images: [] }),
    block("two", { images: [{ id: "img", title: "Fachada", src: "img", enabled: true, layoutWidthPercent: 30 }], apartados: [apartado("S")] }),
  ]);
  const [merged] = mergeDatosImages([datos], [stored("img", "one")]);

  assert.deepEqual(merged.blocks[0].images, []);
  assert.deepEqual(merged.blocks[1].images, [
    { id: "img", title: "Fachada", src: "/api/archivos/imagen?key=img", enabled: true, layoutWidthPercent: 30 },
  ]);
});

test("datos images — one moved from the block into an apartado is not duplicated either; an unsaved upload shows where it was uploaded", () => {
  const datos = section("datos", [
    block("one", { apartados: [apartado("S", { images: [{ id: "img", title: "Fachada", src: "img" }] })] }),
    block("two"),
  ]);
  const [merged] = mergeDatosImages([datos], [stored("img", "one"), stored("fresh", "two"), stored("inside", "one", "S")]);

  assert.deepEqual(merged.blocks[0].images, []);
  assert.deepEqual(merged.blocks[0].apartados[0].images.map((entry) => [entry.id, entry.src]), [
    ["img", "/api/archivos/imagen?key=img"],
    ["inside", "/api/archivos/imagen?key=inside"],
  ]);
  assert.deepEqual(merged.blocks[1].images.map((entry) => [entry.id, entry.title]), [["fresh", "fresh.jpg"]]);
});

test("datos images — other sections are left alone", () => {
  const other = section("terreno", [block("one", { images: [image("img")] })]);
  assert.equal(mergeDatosImages([other], [stored("img", "one")])[0], other);
});
