import assert from "node:assert/strict";
import test from "node:test";
import type { TableContent } from "../src/features/valuations/model";
import { createHomologationTable, ensureTableV2, type TableFormula, type TableV2 } from "../src/features/valuations/services/table";
import {
  decodeStoredTable,
  decodeTableCell,
  encodeTableCell,
  serializeTableForSave,
  type StoredCellRecord,
} from "../src/features/valuations/services/table-persistence";

const formula = {
  expression: {
    kind: "binary",
    operator: "MULTIPLY",
    left: { kind: "operand", operand: { kind: "cell", rowId: "row-1", columnId: "col-area" } },
    right: { kind: "operand", operand: { kind: "cell", rowId: "row-1", columnId: "col-price" } },
  },
} as unknown as TableFormula;

function v2Table(): TableV2 {
  return {
    id: "tbl-1",
    title: "Cálculo de construcciones",
    version: 2,
    columns: [
      { id: "col-area", name: "Superficie" },
      { id: "col-price", name: "Valor unitario", format: { type: "currency" } as never },
      { id: "col-total", name: "Valor parcial" },
    ],
    rows: [
      {
        id: "row-1",
        cells: {
          "col-area": { kind: "value", value: "0.10" },
          "col-price": { kind: "value", value: "$1,500" },
          "col-total": { kind: "formula", formula },
        },
      },
    ],
  };
}

const asEditorState = (table: TableV2) => table as unknown as TableContent;

function roundTrip(table: TableV2): TableV2 {
  // Editor → API payload → server normalization → cells stored → loader.
  const onServer = ensureTableV2(serializeTableForSave(asEditorState(table)));
  return decodeStoredTable({
    id: onServer.id,
    title: onServer.title,
    enabled: true,
    schema: onServer.schema,
    columns: onServer.columns,
    rows: onServer.rows.map((row) => ({
      id: row.id,
      cells: onServer.columns.map((column) => {
        const stored = encodeTableCell(row.cells[column.id]);
        return {
          text: stored.text,
          numeric: null,
          boolean: null,
          date: null,
          complex: stored.complex,
          calculated: stored.calculated,
        };
      }),
    })),
  });
}

test("a V2 table survives the full save and reload path unchanged", () => {
  const original = v2Table();
  const reloaded = roundTrip(original);
  assert.deepEqual(reloaded.columns, original.columns);
  assert.deepEqual(reloaded.rows, original.rows);
  assert.equal(reloaded.title, original.title);
});

test("regression: the server no longer replaces an edited table with an empty one", () => {
  const onServer = ensureTableV2(serializeTableForSave(asEditorState(v2Table())));
  assert.equal(onServer.columns.length, 3);
  assert.equal(onServer.rows.length, 1);
  assert.equal(onServer.columns[0].name, "Superficie");
});

test("cell text is stored exactly as typed, without number or date coercion", () => {
  for (const value of ["0.10", "$1,500", "2026-01-01", "001", "  espacios  "]) {
    const stored = encodeTableCell({ kind: "value", value });
    assert.equal(stored.text, value);
    assert.deepEqual(decodeTableCell({ ...record(), text: stored.text, complex: stored.complex }), { kind: "value", value });
  }
});

test("formulas keep their cell references and come back as formulas, not JSON text", () => {
  const cell = roundTrip(v2Table()).rows[0].cells["col-total"];
  assert.equal(cell.kind, "formula");
  if (cell.kind === "formula") assert.deepEqual(cell.formula, formula);
});

test("formulas saved by the previous format are still read as formulas", () => {
  const cell = decodeTableCell({ ...record(), complex: formula, calculated: true });
  assert.deepEqual(cell, { kind: "formula", formula });
});

test("numbers, booleans and dates saved by the previous format are read back as text", () => {
  assert.deepEqual(decodeTableCell({ ...record(), numeric: "1500" }), { kind: "value", value: "1500" });
  assert.deepEqual(decodeTableCell({ ...record(), boolean: true }), { kind: "value", value: "Si" });
  assert.deepEqual(decodeTableCell({ ...record(), date: "2026-01-01T00:00:00.000Z" }), {
    kind: "value",
    value: "2026-01-01T00:00:00.000Z",
  });
});

test("the homologation preset keeps its schema through save and reload", () => {
  const preset = createHomologationTable();
  const reloaded = roundTrip(preset);
  assert.deepEqual(reloaded.schema, preset.schema);
  assert.equal(reloaded.columns.length, preset.columns.length);
});

test("legacy string tables are sent as V2 with their existing column keys", () => {
  const legacy: TableContent = {
    id: "legacy-1",
    title: "Colindancias",
    columns: ["Rumbo", "Distancia"],
    columnKeys: ["rumbo", "distancia"],
    rows: [["Norte", "12.50"]],
    enabled: true,
  };
  const payload = serializeTableForSave(legacy);
  assert.equal(payload.version, 2);
  assert.deepEqual(payload.columns.map((column) => column.id), ["rumbo", "distancia"]);
  assert.deepEqual(payload.rows[0].cells.distancia, { kind: "value", value: "12.50" });
});

test("rows without a stored id get the same id the legacy loader produced", () => {
  const table = decodeStoredTable({
    id: "tbl-9",
    title: "T",
    enabled: true,
    columns: [{ id: "a", name: "A" }],
    rows: [{ id: null, cells: [null] }],
  });
  assert.equal(table.rows[0].id, "r-tbl-9-0");
  assert.deepEqual(table.rows[0].cells.a, { kind: "value", value: "" });
});

function record(): StoredCellRecord {
  return { text: null, numeric: null, boolean: null, date: null, complex: null, calculated: false };
}
