/**
 * What the appraiser adds to "Medidas y colindancias" of the Terreno (a
 * Concept, an Image, a Table) and what is typed in its table of measures is
 * saved and reloaded: the editor normalizes that Apartado on every change and
 * on opening, and must not put its template back in place of the content.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createConcept, createTable } from "../../src/features/valuations/components/workspace/model/content-factories";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { withAddedApartadoContent } from "../../src/features/valuations/components/workspace/model/section-content";
import { normalizeEditorSections } from "../../src/features/valuations/components/workspace/model/section-numbering";
import type { Apartado, AppSection, ImageContent } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { findBoundaryTable, getTerrenoElementKind, isTerrenoSection } from "../../src/features/valuations/sections/terreno";
import { resolveContentLayout } from "../../src/features/valuations/services/content-layout";
import { extractStorageKey } from "../../src/features/valuations/services/image-source";
import { ensureTableV2 } from "../../src/features/valuations/services/table";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

async function save(fixture: Fixture, sections: AppSection[]) {
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    sections: buildSectionsPayload(sections) as never,
  });
}

/** The sections as the editor opens them. */
async function reload(fixture: Fixture): Promise<AppSection[]> {
  return initialSectionsFor(await getValuationByPublicId(fixture.publicId, fixture.organizationId));
}

function boundariesOf(sections: AppSection[]): Apartado {
  const apartado = sections.find(isTerrenoSection)?.blocks[0]?.apartados.find((item) => getTerrenoElementKind(item) === "boundaries");
  assert.ok(apartado, "the Terreno has its Medidas y colindancias apartado");
  return apartado;
}

/** An edit of the apartado as the editor applies it: the change, then the normalization of the sections. */
function edit(sections: AppSection[], change: (apartado: Apartado) => Apartado): AppSection[] {
  const target = boundariesOf(sections);
  return normalizeEditorSections(sections.map((section) => (isTerrenoSection(section)
    ? { ...section, blocks: section.blocks.map((block) => ({ ...block, apartados: block.apartados.map((item) => (item === target ? change(item) : item)) })) }
    : section)));
}

const measures = (apartado: Apartado) => {
  const table = findBoundaryTable(apartado);
  assert.ok(table, "the table of measures is there");
  const v2 = ensureTableV2(table);
  return v2.rows.map((row) => v2.columns.map((column) => {
    const cell = row.cells[column.id];
    return cell?.kind === "value" ? cell.value : "";
  }));
};

const layoutOf = (apartado: Apartado) =>
  resolveContentLayout(apartado).rows.map((row) => row.columns.map((column) => column.items.map((item) => `${item.type}:${item.id}`).join("+")).join("|"));

test("content added to Medidas y colindancias and its measures are saved and reloaded", async () => {
  const fixture = await createValuationFixture();

  // A new valuation, saved and opened again: from here on its tables are the stored ones.
  await save(fixture, initialSectionsFor(null));
  let sections = await reload(fixture);
  assert.deepEqual(measures(boundariesOf(sections)).map((row) => row[0]), ["Al Norte:", "Al Sur:", "Al Este:", "Al Oeste:"]);
  const boundaryTableId = findBoundaryTable(boundariesOf(sections))!.id;

  // The appraiser fills a boundary and adds a table, an image and a concept with "+ Agregar".
  sections = edit(sections, (apartado) => ({
    ...apartado,
    tables: apartado.tables.map((item) => {
      if (item.id !== boundaryTableId) return item;
      const v2 = ensureTableV2(item);
      const [direction, distance, adjoining] = v2.columns.map((column) => column.id);
      const rows = v2.rows.map((row, index) => (index === 0
        ? { ...row, cells: { ...row.cells, [direction]: { kind: "value", value: "Al Norte:" }, [distance]: { kind: "value", value: "12.50" }, [adjoining]: { kind: "value", value: "Calle Hidalgo" } } }
        : row));
      return { ...v2, rows } as unknown as typeof item;
    }),
  }));
  const addedTable = createTable();
  sections = edit(sections, (apartado) => withAddedApartadoContent({ ...apartado, tables: [...apartado.tables, addedTable] }, { type: "table", id: addedTable.id }));
  const addedImage: ImageContent = { id: "img-croquis", title: "Croquis del predio", src: "uploads/2026-10/croquis.jpg", enabled: true, layoutWidthPercent: 60, captionText: "Croquis", captionEnabled: true };
  sections = edit(sections, (apartado) => withAddedApartadoContent({ ...apartado, images: [...apartado.images, addedImage] }, { type: "image", id: addedImage.id }));
  const addedConcept = { ...createConcept("Superficie según escrituras"), value: "250.00 m²" };
  sections = edit(sections, (apartado) => withAddedApartadoContent({ ...apartado, concepts: [...apartado.concepts, addedConcept] }, { type: "concept", id: addedConcept.id }));

  // Nothing is lost in the editor itself…
  const edited = boundariesOf(sections);
  assert.deepEqual(edited.tables.map((item) => item.id), [boundaryTableId, addedTable.id]);
  assert.deepEqual(edited.images.map((item) => item.id), [addedImage.id]);
  assert.equal(edited.concepts.at(-1)?.id, addedConcept.id);
  const shown = layoutOf(edited);
  assert.deepEqual(shown.slice(-3), [`table:${addedTable.id}`, `image:${addedImage.id}`, `concept:${addedConcept.id}`]);

  // …nor on saving and opening again, twice over.
  for (const round of ["first", "second"]) {
    await save(fixture, sections);
    sections = await reload(fixture);
    const reloaded = boundariesOf(sections);

    assert.deepEqual(measures(reloaded)[0], ["Al Norte:", "12.50", "Calle Hidalgo"], `${round} reload keeps what was typed in the measures`);
    assert.deepEqual(measures(reloaded).map((row) => row[0]), ["Al Norte:", "Al Sur:", "Al Este:", "Al Oeste:"]);
    assert.deepEqual(findBoundaryTable(reloaded)?.boundaryDistanceFormats, Array.from({ length: 4 }, () => ({ valueFormat: "m" })));

    assert.deepEqual(reloaded.tables.map((item) => item.id), [boundaryTableId, addedTable.id], `${round} reload keeps the added table`);
    assert.deepEqual(ensureTableV2(reloaded.tables[1]).columns, ensureTableV2(addedTable).columns);
    assert.equal(reloaded.tables[1].boundaryDistanceFormats, undefined, "the added table is not taken for the table of measures");

    assert.equal(reloaded.images.length, 1, `${round} reload keeps the added image`);
    assert.equal(extractStorageKey(reloaded.images[0].src), "uploads/2026-10/croquis.jpg");
    assert.deepEqual(
      { title: reloaded.images[0].title, width: reloaded.images[0].layoutWidthPercent, caption: reloaded.images[0].captionText },
      { title: "Croquis del predio", width: 60, caption: "Croquis" },
    );

    assert.deepEqual(reloaded.concepts.map((item) => item.value), ["Escrituras públicas...", "250.00 m²"], `${round} reload keeps the added concept`);
    assert.deepEqual(layoutOf(reloaded), shown, `${round} reload keeps every item where it was`);
  }
});
