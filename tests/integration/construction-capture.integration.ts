/**
 * Video 5.3 (Álvaro, nov 2026): one table of construction types and one of
 * installations in the construction section, the capture of the cost
 * approach. A valuation saved before (types typed in the panel «Tipos de
 * construcción», installations in the cost panel) opens with them as the
 * rows of its tables, saves them back unchanged, and its cost approach and
 * its conclusion do not move. Local database only.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import {
  readCapture,
  serverItems,
  syncedFromTable,
  withConstructionTables,
  type InstallationItem,
} from "../../src/features/valuations/calculation/construction-capture";
import { getConstructionTypes, saveConstructionTypes } from "../../src/features/valuations/calculation/construction-types.service";
import { getCostCalculation, saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_LAND, costInputOf, emptyConstructionCost, emptyInstallation, type CostInputDto } from "../../src/features/valuations/calculation/cost-types";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import type { AppSection, TableContent } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { construccionSection } from "../../src/features/valuations/sections/construccion";
import { ensureTableV2 } from "../../src/features/valuations/services/table";
import { initializeWorkingVersionStructure, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
const editor = (fixture: Fixture) => ({ ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] });

// Invented building and installations (the figures of the Arandas book, no client's data).
const building = { ref: "T-1", description: "Edificio de uso mixto", classification: "Moderno", quality: "Media", area: 467.27, age: 2, usefulLife: 70 };
const storage = { ref: "T-2", description: "Bodega", classification: "Industrial", quality: "Económica", area: 80, age: 10, usefulLife: 50 };
const installations = [
  { ...emptyInstallation(0), description: "Tanque estacionario inventado", unit: "Pza", quantity: 6, age: 2, usefulLife: 30, conservation: 0.975, unitReplacementCost: 9000 },
  { ...emptyInstallation(1), description: "Cisterna inventada", unit: "Lote", quantity: 1, age: 2, usefulLife: 70, conservation: 0.975, unitReplacementCost: 90000 },
];

async function storedValues(fixture: Fixture) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const approach = await prisma.enfoqueCosto.findUniqueOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 } });
  return {
    constructions: Number(approach.NValorConstrucciones),
    installations: Number(approach.NValorInstalaciones),
    physical: Number(approach.NValorFisicoTotal),
  };
}

/** A table of the section, in the editor's shape (`apartados`) or as the server reads it back (`subBlocks`, each table wrapped). */
const tableIn = (section: AppSection, id: string): TableContent => {
  for (const block of section.blocks) for (const container of [block, ...(block.apartados ?? (block as unknown as { subBlocks: AppSection["blocks"][number]["apartados"] }).subBlocks)]) {
    // Read back, each table comes wrapped (`{ table }`).
    const table = container.tables.map((item) => (item as unknown as { table?: TableContent }).table ?? item).find((item) => item.id === id);
    if (table) return table;
  }
  throw new Error(`no table ${id}`);
};

test("an old valuation opens with its types and installations as the rows of the single tables, saves them back unchanged, and costs do not move", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);

  // As it was saved before video 5.3: the types from the panel, the cost columns and installations from the cost panel.
  await saveConstructionTypes(fixture.publicId, user, { types: [building, storage] });
  const costs: CostInputDto = {
    land: { ...DEFAULT_LAND },
    constructions: [
      { ...emptyConstructionCost("T-1"), conservation: 0.98, unitReplacementCost: 14361.99 },
      { ...emptyConstructionCost("T-2"), conservation: 0.9, unitReplacementCost: 9000 },
    ],
    installations,
    indirects: [],
  };
  await saveCostCalculation(fixture.publicId, user, costs);
  const before = await getCostCalculation(fixture.publicId, fixture.organizationId);
  const valuesBefore = await storedValues(fixture);
  assert.equal(valuesBefore.constructions > 0 && valuesBefore.installations > 0, true);

  // The document as it was (the template's construction section) opens: the tables become the capture with the saved rows.
  const opened = withConstructionTables(JSON.parse(JSON.stringify(construccionSection)) as AppSection, before);
  const typesTable = tableIn(opened, "construccion_tipos");
  const installationsTable = tableIn(opened, "instalaciones_especiales");
  const typesSynced = syncedFromTable(typesTable, serverItems("types", before));
  const installationsSynced = syncedFromTable(installationsTable, serverItems("installations", before));
  const typeRows = readCapture(typesTable, "types", typesSynced);
  assert.deepEqual(typeRows.map(({ id, item }) => ({ id, ...item })), before.types, "every type, with its id, as the panel saved it");
  const installationRows = readCapture(installationsTable, "installations", installationsSynced);
  assert.deepEqual(installationRows.map(({ item }) => item), serverItems("installations", before).map(({ item }) => item));

  // Saved back from the table, as the workspace does: nothing changes.
  await saveConstructionTypes(fixture.publicId, user, { types: typeRows.map(({ id, item }) => ({ ...(id === undefined ? {} : { id }), ...(item as typeof building) })) });
  const current = await getCostCalculation(fixture.publicId, fixture.organizationId);
  await saveCostCalculation(fixture.publicId, user, {
    ...costInputOf(current),
    installations: current.installations.map((row, index) => ({ ...row, ...(installationRows[index].item as InstallationItem) })),
  });
  const afterSave = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(afterSave.types, before.types);
  assert.deepEqual(afterSave.constructions, before.constructions, "the cost columns of each type stay");
  assert.deepEqual(afterSave.installations, before.installations);
  assert.deepEqual(await storedValues(fixture), valuesBefore, "golden: constructions, installations and physical value as before");

  // The document is saved with the tables as the capture and comes back with them.
  await saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user, sections: buildSectionsPayload([opened]) });
  const detail = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  const saved = detail?.sections.find((section) => section.id === "construccion") as unknown as AppSection | undefined;
  assert.ok(saved);
  const savedTypes = ensureTableV2(tableIn(saved, "construccion_tipos"));
  assert.deepEqual(savedTypes.schema?.capture, { kind: "types" });
  assert.deepEqual(readCapture(savedTypes as unknown as TableContent, "types", typesSynced).map(({ item }) => item.ref), ["T-1", "T-2"]);
  assert.equal(ensureTableV2(tableIn(saved, "instalaciones_especiales")).schema?.capture?.kind, "installations");
});

test("a new valuation's construction section comes with its subbloques and both capture tables", async () => {
  const fixture = await createValuationFixture();
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  await initializeWorkingVersionStructure({ avaluoId: avaluo.IdAvaluo, userId: fixture.user.id });
  const detail = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  const section = detail?.sections.find((item) => item.id === "construccion") as unknown as AppSection | undefined;
  assert.ok(section);
  // Before, the template's subbloques (kept as `apartados`) were lost when the valuation was created.
  assert.deepEqual(readCapture(tableIn(section, "construccion_tipos"), "types", []), [], "the types table, with its empty rows");
  assert.equal(ensureTableV2(tableIn(section, "instalaciones_especiales")).columns.length, 10);
});

test("a type renamed in the table keeps its row and its cost columns; one taken out takes its cost row", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveConstructionTypes(fixture.publicId, user, { types: [building, storage] });
  await saveCostCalculation(fixture.publicId, user, {
    land: { ...DEFAULT_LAND },
    constructions: [
      { ...emptyConstructionCost("T-1"), conservation: 0.98, unitReplacementCost: 14361.99 },
      { ...emptyConstructionCost("T-2"), conservation: 0.9, unitReplacementCost: 9000 },
    ],
    installations: [],
    indirects: [],
  });
  const before = await getCostCalculation(fixture.publicId, fixture.organizationId);
  const opened = withConstructionTables(JSON.parse(JSON.stringify(construccionSection)) as AppSection, before);
  const table = ensureTableV2(tableIn(opened, "construccion_tipos"));
  const synced = syncedFromTable(table as unknown as TableContent, serverItems("types", before));

  // T-2 is renamed T-5 in its cell; T-1 is deleted (its row leaves the table).
  const edited = {
    ...table,
    rows: table.rows.slice(1).map((row) => ({ ...row, cells: { ...row.cells, tipo: { kind: "value" as const, value: "T-5" } } })),
  } as unknown as TableContent;
  const rows = readCapture(edited, "types", synced);
  assert.deepEqual(rows.map(({ id, item }) => [id, item.ref]), [[before.types[1].id, "T-5"]]);
  await saveConstructionTypes(fixture.publicId, user, { types: rows.map(({ id, item }) => ({ ...(id === undefined ? {} : { id }), ...(item as typeof building) })) });

  const afterSave = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(afterSave.types.map((type) => type.ref), ["T-5"]);
  assert.deepEqual(afterSave.constructions.map((row) => [row.ref, row.conservation, row.unitReplacementCost]), [["T-5", 0.9, 9000]], "the renamed type keeps its cost columns");
  assert.equal((await getConstructionTypes(fixture.publicId, fixture.organizationId)).types[0].id, before.types[1].id);
});
