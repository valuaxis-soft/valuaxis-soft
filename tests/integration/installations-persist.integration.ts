/**
 * Installations added from the cost panel, from the installations table of
 * the construction section, or from a table of the appraiser's linked with
 * «Vincular con Costos», are still there after reloading. One captured
 * without its description yet (unit, quantity, state, value) used to wait
 * in the panel, unsaved, and was lost on reloading; the construction types
 * stay in every flow. Local database only.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import {
  findCaptureTable,
  readCapture,
  syncedFromTable,
  serverItems,
  withConstructionTables,
  withLinkedCaptureTable,
  withNewCaptureRow,
  type InstallationItem,
} from "../../src/features/valuations/calculation/construction-capture";
import { saveConstructionTypes } from "../../src/features/valuations/calculation/construction-types.service";
import { costInputSchema } from "../../src/features/valuations/calculation/cost-schemas";
import { getCostCalculation, saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_LAND, costInputOf, emptyConstructionCost, emptyInstallation, type CostCalculationDto, type CostInputDto, type InstallationDto } from "../../src/features/valuations/calculation/cost-types";
import type { AppSection, TableContent } from "../../src/features/valuations/model";
import { construccionSection } from "../../src/features/valuations/sections/construccion";
import { ensureTableV2, getDisplayColumns, type TableV2 } from "../../src/features/valuations/services/table";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
const editor = (fixture: Fixture) => ({ ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] });

// Invented house and installations.
const house = { ref: "T-1", description: "Casa habitación", classification: "Moderno", quality: "Media", area: 180, age: 6, usefulLife: 70 };
const yard = { ref: "T-2", description: "Cuarto de servicio", classification: "Moderno", quality: "Económica", area: 12, age: 6, usefulLife: 60 };

/** Saves as the route does: the payload goes through its schema first. */
async function save(fixture: Fixture, payload: CostInputDto) {
  await saveCostCalculation(fixture.publicId, editor(fixture), costInputSchema.parse(payload) as unknown as CostInputDto);
  return getCostCalculation(fixture.publicId, fixture.organizationId);
}

async function setUp() {
  const fixture = await createValuationFixture();
  await saveConstructionTypes(fixture.publicId, editor(fixture), { types: [house, yard] });
  await saveCostCalculation(fixture.publicId, editor(fixture), {
    land: { ...DEFAULT_LAND, subjectArea: 200, unitValue: 9000 },
    constructions: [{ ...emptyConstructionCost("T-1"), conservation: 0.98, unitReplacementCost: 14000 }],
    installations: [],
    indirects: [],
  });
  return { fixture, loaded: await getCostCalculation(fixture.publicId, fixture.organizationId) };
}

/** The installations the workspace sends after the table changed: each item over what the server had for it. */
function installationsFrom(items: Array<{ item: unknown }>, current: CostCalculationDto): InstallationDto[] {
  return items.map(({ item }, index) => {
    const known = current.installations.find((row) => row.ref.trim().toLowerCase() === (item as InstallationItem).ref.trim().toLowerCase());
    return { ...(known ?? emptyInstallation(index)), ...(item as InstallationItem) };
  });
}

/** Writes texts in a row of a table, by column header. */
function writeRow(table: TableContent, rowIndex: number, values: Record<string, string>): TableContent {
  const v2 = ensureTableV2(table);
  const byName = new Map(getDisplayColumns(v2).map((column) => [column.name.trim(), column.id]));
  const rows = v2.rows.map((row, index) => (index !== rowIndex ? row : {
    ...row,
    cells: { ...row.cells, ...Object.fromEntries(Object.entries(values).map(([name, value]) => [byName.get(name)!, { kind: "value" as const, value }])) },
  }));
  return { ...v2, rows } as unknown as TableContent;
}

const withTable = (section: AppSection, table: TableContent): AppSection => ({
  ...section,
  blocks: section.blocks.map((block) => ({
    ...block,
    tables: block.tables.map((item) => (item.id === table.id ? table : item)),
    apartados: block.apartados.map((apartado) => ({ ...apartado, tables: apartado.tables.map((item) => (item.id === table.id ? table : item)) })),
  })),
});

test("added in Costos with its state and value but no description yet: it is still there after reloading, and so are the types", async () => {
  const { fixture, loaded } = await setUp();
  const pending: InstallationDto = { ...emptyInstallation(0), unit: "Pza", quantity: 1, age: 6, usefulLife: 20, conservationRating: 9, unitReplacementCost: 9400 };
  const described: InstallationDto = { ...emptyInstallation(1), description: "Pérgola de herrería", quantity: 1, age: 6, usefulLife: 30 };
  const reloaded = await save(fixture, { ...costInputOf(loaded), installations: [pending, described] });
  assert.deepEqual(reloaded.installations.map((row) => [row.ref, row.description, row.unit, row.conservationRating, row.unitReplacementCost]), [
    ["1", "", "Pza", 9, 9400],
    ["2", "Pérgola de herrería", "", null, null],
  ]);
  assert.deepEqual(reloaded.types.map((type) => type.ref), ["T-1", "T-2"]);

  // The construction section opens with both, and reads them back as they are: nothing is dropped by the next save.
  const section = withConstructionTables(JSON.parse(JSON.stringify(construccionSection)) as AppSection, reloaded);
  const table = findCaptureTable(section, "installations")!;
  const items = readCapture(table, "installations", syncedFromTable(table, serverItems("installations", reloaded)));
  assert.deepEqual(items.map(({ item }) => item.ref), ["1", "2"]);
  const again = await save(fixture, { ...costInputOf(reloaded), installations: installationsFrom(items, reloaded) });
  assert.deepEqual(again.installations, reloaded.installations);
});

test("added in the installations table of the construction section, with or without its description: it is still there after reloading", async () => {
  const { fixture, loaded } = await setUp();
  const opened = withConstructionTables(JSON.parse(JSON.stringify(construccionSection)) as AppSection, loaded);
  const table = findCaptureTable(opened, "installations")!;
  let written = withNewCaptureRow(table).table;
  written = writeRow(written, ensureTableV2(written).rows.length - 1, { "Descripción": "Cisterna de 10 mil litros", Unidad: "Lote", "Cant.": "1", Edad: "6", VUT: "80" });
  written = withNewCaptureRow(written).table;
  written = writeRow(written, ensureTableV2(written).rows.length - 1, { Unidad: "Pza", "Cant.": "2" });
  const items = readCapture(written, "installations", syncedFromTable(table, serverItems("installations", loaded)));
  assert.equal(items.length, 2, "the row without description is an installation too");
  const reloaded = await save(fixture, { ...costInputOf(loaded), installations: installationsFrom(items, loaded) });
  assert.deepEqual(reloaded.installations.map((row) => [row.description, row.unit, row.quantity]), [["Cisterna de 10 mil litros", "Lote", 1], ["", "Pza", 2]]);
  assert.deepEqual(reloaded.types.map((type) => type.ref), ["T-1", "T-2"]);
  const back = findCaptureTable(withConstructionTables(withTable(opened, written), reloaded, {}), "installations")!;
  assert.deepEqual(readCapture(back, "installations", null).map(({ item }) => item.ref), items.map(({ item }) => item.ref));
});

test("a table of his own linked with Costos: its installations, and one added later, are still there after reloading", async () => {
  const { fixture, loaded } = await setUp();
  const opened = withConstructionTables(JSON.parse(JSON.stringify(construccionSection)) as AppSection, loaded);
  const names = ["#", "Tipo", "Descripción", "Unidad", "Cant.", "Edad", "VUT", "Conservación", "Mantenim."];
  const own = {
    version: 2,
    id: "tbl-propia",
    title: "Tabla configurable",
    columns: names.map((name, index) => ({ id: `c${index}`, name })),
    rows: [
      ["1", "E.A.", "Tanque de gas estacionario", "Pieza", "1", "6", "20", "Bueno", "Bueno"],
      ["2", "O.C.", "Terraza en planta baja", "m²", "36", "6", "80", "Bueno", "Bueno"],
    ].map((values, row) => ({ id: `r${row}`, cells: Object.fromEntries(values.map((value, index) => [`c${index}`, { kind: "value" as const, value }])) })),
  } as unknown as TableV2;
  const withOwn: AppSection = { ...opened, blocks: opened.blocks.map((block, index) => (index === opened.blocks.length - 1 ? { ...block, tables: [...block.tables, own as unknown as TableContent] } : block)) };
  const linked = withLinkedCaptureTable(withOwn, "tbl-propia", "installations", loaded);
  const linkedTable = findCaptureTable(linked, "installations")!;
  assert.equal(linkedTable.id, "tbl-propia");
  const reloaded = await save(fixture, { ...costInputOf(loaded), installations: installationsFrom(readCapture(linkedTable, "installations", null), loaded) });
  assert.deepEqual(reloaded.installations.map((row) => row.description), ["Tanque de gas estacionario", "Terraza en planta baja"]);

  // Reopened: the linked table is still the capture, with its rows; one added in Costos joins it, and stays.
  const reopened = withConstructionTables(linked, reloaded, {});
  assert.equal(findCaptureTable(reopened, "installations")!.id, "tbl-propia");
  const added = await save(fixture, { ...costInputOf(reloaded), installations: [...reloaded.installations, { ...emptyInstallation(2), description: "Jardín", quantity: 115, unit: "m²", conservationRating: 8 }] });
  const merged = findCaptureTable(withConstructionTables(reopened, added, { installations: syncedFromTable(findCaptureTable(reopened, "installations")!, serverItems("installations", reloaded)) }), "installations")!;
  const items = readCapture(merged, "installations", syncedFromTable(merged, serverItems("installations", added)));
  assert.deepEqual(items.map(({ item }) => [item.ref, item.description]), [["1", "Tanque de gas estacionario"], ["2", "Terraza en planta baja"], ["3", "Jardín"]]);
  const final = await save(fixture, { ...costInputOf(added), installations: installationsFrom(items, added) });
  assert.deepEqual(final.installations, added.installations);
  assert.deepEqual(final.types.map((type) => type.ref), ["T-1", "T-2"]);
});
