/**
 * A Concept, an Image and a Table dragged to another Block are saved and
 * reloaded in their new place only, with everything they carried.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { initialSectionsFor, mergeDatosImages } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import type { Apartado, AppSection, Block, TableContent } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import {
  applyContentDropToBlocks,
  type ContentDropSource,
  type ContentDropTarget,
} from "../../src/features/valuations/services/content-drop";
import { resolveContentLayout } from "../../src/features/valuations/services/content-layout";
import { contentMoveRulesForSection } from "../../src/features/valuations/services/content-move-rules";
import type { ContentContainerRef, TransferableContentType } from "../../src/features/valuations/services/content-transfer";
import { getCanonicalSectionKey } from "../../src/features/valuations/sections/section-registry";
import { extractStorageKey } from "../../src/features/valuations/services/image-source";
import { ensureTableV2, type TableFormula } from "../../src/features/valuations/services/table";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const formula = {
  expression: {
    kind: "binary",
    operator: "MULTIPLY",
    left: { kind: "operand", operand: { kind: "cell", rowId: "row-1", columnId: "col-area" } },
    right: { kind: "operand", operand: { kind: "cell", rowId: "row-1", columnId: "col-price" } },
  },
} as unknown as TableFormula;

const table = (id: string, title: string): TableContent => ({
  id,
  title,
  version: 2,
  columns: [
    { id: "col-area", name: "Superficie" },
    { id: "col-price", name: "Valor unitario", format: { type: "currency" } },
    { id: "col-total", name: "Valor parcial" },
  ],
  rows: [
    { id: "row-1", cells: { "col-area": { kind: "value", value: "120.50" }, "col-price": { kind: "value", value: "$8,500.00" }, "col-total": { kind: "formula", formula } } },
    { id: "row-2", cells: { "col-area": { kind: "value", value: title }, "col-price": { kind: "value", value: "001" }, "col-total": { kind: "value", value: "" } } },
  ],
  enabled: true,
} as unknown as TableContent);

const concept = (id: string, value: string) => ({ id, label: `Campo ${id}`, value, enabled: true });

function block(id: string, parts: Partial<Block>): Block {
  return { id, title: id.toUpperCase(), sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [], ...parts };
}

function startSection(id: string, imageSrc: string): AppSection {
  const inner: Apartado = { id: `${id}-apartado`, title: "APARTADO", enabled: true, concepts: [concept(`${id}-s`, "dentro")], tables: [], images: [] };
  return {
    id,
    label: "",
    title: id.toUpperCase(),
    sourceFile: "",
    enabled: true,
    required: false,
    blocks: [
      block(`${id}-uno`, {
        concepts: [concept(`${id}-a`, "valor a"), concept(`${id}-b`, "valor b")],
        images: [{ id: `${id}-img`, title: "Fachada", src: imageSrc, enabled: true, layoutWidthPercent: 45, captionText: "Vista", captionEnabled: true }],
        tables: [table(`${id}-t1`, "Primera"), table(`${id}-t2`, "Segunda")],
      }),
      block(`${id}-dos`, { concepts: [concept(`${id}-c`, "valor c")], apartados: [inner] }),
    ],
  };
}

async function save(fixture: Fixture, sections: AppSection[]) {
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    sections: buildSectionsPayload(sections) as never,
  });
}

/** The sections as the editor opens them. */
async function reload(fixture: Fixture, sectionId: string): Promise<AppSection> {
  const detail = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  // Datos generales is saved under its registry key.
  const section = initialSectionsFor(detail).find((item) => getCanonicalSectionKey(item.id) === getCanonicalSectionKey(sectionId));
  assert.ok(section, `section ${sectionId} reloads`);
  return section;
}

function drop(section: AppSection, source: ContentDropSource, target: ContentDropTarget): AppSection {
  const result = applyContentDropToBlocks(section.blocks, source, target, contentMoveRulesForSection(section));
  assert.equal(result.changed, true, `${source.itemType} ${source.itemId} moves`);
  return { ...section, blocks: result.blocks };
}

/** Where an item is: "block" or "block/apartado", in the content arrays and in the layouts shown. */
function placesOf(section: AppSection, type: TransferableContentType, id: string) {
  const key = `${type}s` as "concepts" | "images" | "tables";
  const inArray: string[] = [];
  const inLayout: string[] = [];
  for (const item of section.blocks) {
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

const inBlock = (blockId: string): ContentContainerRef => ({ kind: "block", blockId });
const lastRowOf = (container: Block | Apartado) => resolveContentLayout(container).rows.at(-1)!.id;

test("a concept, an image and a table moved to another block are saved and reloaded only there, intact", async () => {
  const fixture = await createValuationFixture();
  const id = "consideraciones";
  const uno = `${id}-uno`;
  const dos = `${id}-dos`;
  const apartado: ContentContainerRef = { kind: "apartado", blockId: dos, apartadoId: `${id}-apartado` };

  await save(fixture, [startSection(id, "uploads/2026-10/fachada.jpg")]);
  let section = await reload(fixture, id);
  assert.deepEqual(placesOf(section, "table", `${id}-t1`), { inArray: [uno], inLayout: [uno] });
  const tableBefore = ensureTableV2(section.blocks[0].tables[0]);
  const imageBefore = section.blocks[0].images[0];

  // Later block ← earlier block (the source is saved first), and the other way round.
  section = drop(section, { container: inBlock(uno), itemType: "concept", itemId: `${id}-a` }, { kind: "apartado-inside", container: apartado });
  section = drop(section, { container: inBlock(uno), itemType: "image", itemId: `${id}-img` }, {
    kind: "row", container: inBlock(dos), rowId: lastRowOf(section.blocks[1]), placement: "above",
  });
  section = drop(section, { container: inBlock(uno), itemType: "table", itemId: `${id}-t1` }, {
    kind: "row", container: apartado, rowId: lastRowOf(section.blocks[1].apartados[0]), placement: "below",
  });
  section = drop(section, { container: inBlock(dos), itemType: "concept", itemId: `${id}-c` }, {
    kind: "column", container: inBlock(uno), columnId: resolveContentLayout(section.blocks[0]).rows[0].columns[0].id, placement: "left",
  });
  const shown = JSON.stringify(section.blocks.map((item) => [resolveContentLayout(item), item.apartados.map(resolveContentLayout)]));

  await save(fixture, [section]);
  const reloaded = await reload(fixture, id);

  assert.deepEqual(placesOf(reloaded, "concept", `${id}-a`), { inArray: [`${dos}/${id}-apartado`], inLayout: [`${dos}/${id}-apartado`] });
  assert.deepEqual(placesOf(reloaded, "concept", `${id}-c`), { inArray: [uno], inLayout: [uno] });
  assert.deepEqual(placesOf(reloaded, "image", `${id}-img`), { inArray: [dos], inLayout: [dos] });
  assert.deepEqual(placesOf(reloaded, "table", `${id}-t1`), { inArray: [`${dos}/${id}-apartado`], inLayout: [`${dos}/${id}-apartado`] });
  assert.deepEqual(placesOf(reloaded, "table", `${id}-t2`), { inArray: [uno], inLayout: [uno] });
  assert.equal(
    JSON.stringify(reloaded.blocks.map((item) => [resolveContentLayout(item), item.apartados.map(resolveContentLayout)])),
    shown,
    "every item reloads at the position it was dropped at",
  );

  const [first, second] = reloaded.blocks;
  assert.deepEqual(first.concepts.map((item) => [item.id, item.value]), [[`${id}-b`, "valor b"], [`${id}-c`, "valor c"]]);
  assert.deepEqual(second.apartados[0].concepts.map((item) => [item.id, item.value]), [[`${id}-s`, "dentro"], [`${id}-a`, "valor a"]]);

  const image = second.images[0];
  assert.equal(extractStorageKey(image.src), "uploads/2026-10/fachada.jpg", "the same file");
  assert.deepEqual({ ...image, src: "" }, { ...imageBefore, src: "" }, "title, size and caption");

  assert.deepEqual(ensureTableV2(second.apartados[0].tables[0]), tableBefore, "values, formula and column format");
  // The table that stayed took the first place of its block: it is still itself.
  assert.deepEqual(first.tables.length, 1);
  assert.equal(ensureTableV2(first.tables[0]).rows[1].cells["col-area"]?.kind, "value");
  // What a loaded table computes from its formulas is derived, not part of what was saved.
  const { formulaResults: _computed, ...staying } = ensureTableV2(first.tables[0]);
  assert.deepEqual(staying, ensureTableV2(table(`${id}-t2`, "Segunda")));

  // Saving again changes nothing, and moving back restores the first arrangement.
  await save(fixture, [reloaded]);
  let back = await reload(fixture, id);
  assert.deepEqual(placesOf(back, "table", `${id}-t1`), { inArray: [`${dos}/${id}-apartado`], inLayout: [`${dos}/${id}-apartado`] });
  back = drop(back, { container: apartado, itemType: "table", itemId: `${id}-t1` }, { kind: "row", container: inBlock(uno), rowId: lastRowOf(back.blocks[0]), placement: "below" });
  back = drop(back, { container: inBlock(dos), itemType: "image", itemId: `${id}-img` }, { kind: "row", container: inBlock(uno), rowId: lastRowOf(back.blocks[0]), placement: "below" });
  await save(fixture, [back]);
  const restored = await reload(fixture, id);
  assert.deepEqual(placesOf(restored, "table", `${id}-t1`), { inArray: [uno], inLayout: [uno] });
  assert.deepEqual(placesOf(restored, "image", `${id}-img`), { inArray: [uno], inLayout: [uno] });
  assert.deepEqual(restored.blocks[0].tables.map((item) => ensureTableV2(item).title).sort(), ["Primera", "Segunda"]);
  assert.deepEqual(ensureTableV2(restored.blocks[0].tables.find((item) => item.id === `${id}-t1`)!), tableBefore);
  assert.deepEqual(restored.blocks[1].apartados[0].tables, []);
});

test("a Datos generales image moved to another block reloads there once, with the file the file service holds", async () => {
  const fixture = await createValuationFixture();
  const id = "datos";
  // The editor saves these images by the id the file service gave them.
  await save(fixture, [startSection(id, "archivo-1")].map((section) => ({
    ...section,
    blocks: section.blocks.map((item) => ({ ...item, images: item.images.map((image) => ({ ...image, id: "archivo-1" })) })),
  })));
  const storedImages = [{ id: "archivo-1", filename: "fachada.jpg", mimeType: "image/jpeg", size: 1, url: "/api/archivos/imagen?key=datos", blockId: `${id}-uno`, subBlockId: null }];

  let section = mergeDatosImages([await reload(fixture, id)], storedImages)[0];
  section = drop(section, { container: inBlock(`${id}-uno`), itemType: "image", itemId: "archivo-1" }, { kind: "apartado-inside", container: { kind: "apartado", blockId: `${id}-dos`, apartadoId: `${id}-apartado` } });
  await save(fixture, [section]);

  const reloaded = mergeDatosImages([await reload(fixture, id)], storedImages)[0];
  assert.deepEqual(placesOf(reloaded, "image", "archivo-1"), { inArray: [`${id}-dos/${id}-apartado`], inLayout: [`${id}-dos/${id}-apartado`] });
  const image = reloaded.blocks[1].apartados[0].images[0];
  assert.equal(image.src, "/api/archivos/imagen?key=datos");
  assert.equal(image.title, "Fachada");
  assert.equal(image.layoutWidthPercent, 45);
});
