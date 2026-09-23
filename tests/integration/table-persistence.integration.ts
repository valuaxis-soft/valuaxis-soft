import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { TableContent } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import type { TableFormula, TableV2 } from "../../src/features/valuations/services/table";
import { serializeTableForSave } from "../../src/features/valuations/services/table-persistence";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

const formula = {
  expression: {
    kind: "binary",
    operator: "MULTIPLY",
    left: { kind: "operand", operand: { kind: "cell", rowId: "row-1", columnId: "col-area" } },
    right: { kind: "operand", operand: { kind: "cell", rowId: "row-1", columnId: "col-price" } },
  },
} as unknown as TableFormula;

function editedTable(): TableV2 {
  return {
    id: "tbl-construcciones",
    title: "Cálculo de construcciones",
    version: 2,
    columns: [
      { id: "col-area", name: "Superficie" },
      { id: "col-price", name: "Valor unitario" },
      { id: "col-total", name: "Valor parcial" },
    ],
    rows: [
      {
        id: "row-1",
        cells: {
          "col-area": { kind: "value", value: "120.50" },
          "col-price": { kind: "value", value: "$8,500.00" },
          "col-total": { kind: "formula", formula },
        },
      },
      {
        id: "row-2",
        cells: {
          "col-area": { kind: "value", value: "0.10" },
          "col-price": { kind: "value", value: "001" },
          "col-total": { kind: "value", value: "" },
        },
      },
    ],
  };
}

async function save(fixture: Awaited<ReturnType<typeof createValuationFixture>>, tables: TableV2[]) {
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    sections: [
      {
        id: "costos",
        label: "ENF. COSTOS",
        title: "ENF. COSTOS",
        blocks: [
          {
            id: "bloque-costos",
            title: "Construcciones",
            tables: tables.map((table) => serializeTableForSave(table as unknown as TableContent)),
          },
        ],
      },
    ],
  });
}

async function loadTables(fixture: Awaited<ReturnType<typeof createValuationFixture>>) {
  const valuation = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  assert.ok(valuation, "valuation loads");
  const section = valuation.sections.find((item) => item.id === "costos" || item.label === "ENF. COSTOS");
  assert.ok(section, "costs section loads");
  const block = section.blocks.find((item) => item.id === "bloque-costos");
  assert.ok(block, "saved block loads");
  return block.tables;
}

test("an edited table is saved and reloaded with ids, exact values and formulas", async () => {
  const fixture = await createValuationFixture();
  const original = editedTable();
  await save(fixture, [original]);

  const [stored] = await loadTables(fixture);
  assert.ok(stored.table, "the loader returns the lossless table");
  assert.deepEqual(stored.table.columns, original.columns);
  assert.deepEqual(stored.table.rows, original.rows);
});

test("saving twice does not duplicate rows or columns", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, [editedTable()]);
  await save(fixture, [editedTable()]);

  const [stored] = await loadTables(fixture);
  assert.equal(stored.table?.columns.length, 3);
  assert.equal(stored.table?.rows.length, 2);
});

test("removed rows and columns do not come back after reload", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, [editedTable()]);

  const trimmed = editedTable();
  trimmed.columns = trimmed.columns.filter((column) => column.id !== "col-price");
  trimmed.rows = trimmed.rows.filter((row) => row.id !== "row-2");
  for (const row of trimmed.rows) delete row.cells["col-price"];
  await save(fixture, [trimmed]);

  const [stored] = await loadTables(fixture);
  assert.deepEqual(stored.table?.columns.map((column) => column.id), ["col-area", "col-total"]);
  assert.deepEqual(stored.table?.rows.map((row) => row.id), ["row-1"]);
});

test("a removed table does not come back after reload", async () => {
  const fixture = await createValuationFixture();
  await save(fixture, [editedTable()]);
  await save(fixture, []);

  assert.equal((await loadTables(fixture)).length, 0);
});
