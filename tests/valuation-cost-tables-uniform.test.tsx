/**
 * Video 7.4 (Álvaro, 17 nov 2026): the cost tables as the others. An
 * installation taken out renumbers the others (here and in the construction
 * section) and comes back with «Deshacer»; the installations print as soon
 * as they are captured, with their Edad and FRe; a table of his own in the
 * construction section is linked with the cost approach; the name of an
 * installation is unlinked on its own. The figures of the cost approach and
 * of the conclusion do not change.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  captureLinkPlan,
  captureTablesOf,
  findCaptureTable,
  mergeCapture,
  nextCaptureRef,
  readCapture,
  serverItems,
  syncedFromTable,
  withConstructionTables,
  withLinkedCaptureTable,
} from "../src/features/valuations/calculation/construction-capture";
import { costDocumentBlocks } from "../src/features/valuations/calculation/cost-document";
import { costInputSchema } from "../src/features/valuations/calculation/cost-schemas";
import { DEFAULT_LAND, costEngineConfig, effectiveConservation, emptyInstallation, toCostEngineInput, type CostCalculationDto } from "../src/features/valuations/calculation/cost-types";
import { withoutInstallation } from "../src/features/valuations/components/calculation/cost-calculation-panel";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach, demeritPreview } from "../src/features/valuations/engine/costs";
import { Trace } from "../src/features/valuations/engine/trace";
import type { AppSection, TableContent } from "../src/features/valuations/model";
import { construccionSection } from "../src/features/valuations/sections/construccion";
import { ensureTableV2, getDisplayColumns, type TableV2 } from "../src/features/valuations/services/table";

// Invented valuation with the appraiser's book figures (Arandas): one type and three installations.
const type = { ref: "T-1", description: "Casa habitación", classification: "Moderno", quality: "Media", area: 467.27, age: 2, usefulLife: 70 };
const valued: CostCalculationDto = {
  land: { ...DEFAULT_LAND, subjectArea: 169.78 },
  types: [{ id: 1, ...type }],
  constructions: [{ ...type, conservation: 0.98, conservationRating: null, ageFactor: null, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: 14361.99 }],
  installations: ([[6, 30, 9000], [1, 30, 35000], [4, 20, 4000]] as const).map(([quantity, usefulLife, unitReplacementCost], index) => ({
    ...emptyInstallation(index), description: `Instalación ${index + 1}`, unit: "Lote", quantity, age: 2, usefulLife, conservation: 0.975, unitReplacementCost,
  })),
  indirects: [],
  market: { adoptedUnitValue: 9000, subjectArea: 169.78, baseArea: null },
  configured: true,
  typesCaptured: true,
  locked: false,
};

function compute(calculation: CostCalculationDto) {
  const input = toCostEngineInput(calculation);
  assert.ok(input.ok);
  const trace = new Trace();
  return { result: computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG, trace), trace };
}

function printedRows(table: TableContent) {
  const v2 = ensureTableV2(table);
  return v2.rows.map((row) => v2.columns.map((column) => {
    const cell = row.cells[column.id];
    return cell?.kind === "value" ? cell.value : "";
  }));
}

const templateSection = () => JSON.parse(JSON.stringify(construccionSection)) as AppSection;
const shown = (table: TableContent) => {
  const v2 = ensureTableV2(table);
  return v2.rows.map((row) => Object.fromEntries(getDisplayColumns(v2).map((column) => {
    const cell = row.cells[column.id];
    return [column.name, cell?.kind === "value" ? cell.value : ""];
  })));
};

test("an installation taken out renumbers the others 1, 2…; references of the appraiser's own stay", () => {
  const rows = [{ ref: "1", name: "a" }, { ref: "2", name: "b" }, { ref: "3", name: "c" }];
  assert.deepEqual(withoutInstallation(rows, 0), [{ ref: "1", name: "b" }, { ref: "2", name: "c" }]);
  const own = [{ ref: "IE-1" }, { ref: "IE-2" }, { ref: "IE-3" }];
  assert.deepEqual(withoutInstallation(own, 1), [{ ref: "IE-1" }, { ref: "IE-3" }]);
  // A new one takes the next free number: with 1 and 3 left, 4 (a second 3 was refused by the save, and lost on reloading).
  assert.equal(nextCaptureRef("installations", ["1", "3"]), "4");
});

test("the construction section follows the renumbering: each row keeps its own columns and takes its new number; «Deshacer» puts it back", () => {
  const section = withConstructionTables(templateSection(), valued);
  const table = findCaptureTable(section, "installations")!;
  // The appraiser's own column «Tipo» (E.A., O.C.) on each row.
  const tipo = getDisplayColumns(ensureTableV2(table)).find((column) => column.name === "Tipo")!.id;
  const v2 = ensureTableV2(table);
  const marked = { ...v2, rows: v2.rows.map((row, index) => ({ ...row, cells: { ...row.cells, [tipo]: { kind: "value" as const, value: ["E.A.", "O.C.", "E.A. 3"][index] } } })) } as unknown as TableContent;
  const synced = syncedFromTable(marked, serverItems("installations", valued));
  const removed = { ...valued, installations: withoutInstallation(valued.installations, 0) };
  const after = mergeCapture(marked, serverItems("installations", removed), synced, removed);
  assert.deepEqual(shown(after).map((row) => [row["#"], row.Tipo, row["Descripción"]]), [["1", "O.C.", "Instalación 2"], ["2", "E.A. 3", "Instalación 3"]]);

  const back = mergeCapture(after, serverItems("installations", valued), syncedFromTable(after, serverItems("installations", removed)), valued);
  assert.deepEqual(shown(back).map((row) => [row["#"], row.Tipo, row["Descripción"]]), [["1", "", "Instalación 1"], ["2", "O.C.", "Instalación 2"], ["3", "E.A. 3", "Instalación 3"]]);
});

test("Edad and FRe of a row without its value are those the calculation gives once it has it", () => {
  const { trace } = compute(valued);
  const config = costEngineConfig(valued);
  for (const row of valued.installations) {
    const preview = demeritPreview({ ref: row.ref, age: row.age, usefulLife: row.usefulLife, conservation: effectiveConservation(row), otherFactor: row.otherFactor }, config);
    assert.equal(preview.ageFactor, trace.find(`costos.instalaciones.${row.ref}.factorEdad`)?.value);
    assert.equal(preview.resultantFactor, trace.find(`costos.instalaciones.${row.ref}.factorResultante`)?.value);
  }
  assert.deepEqual(demeritPreview({ ref: "x", age: 2, usefulLife: null, conservation: 0.9 }, config), { ageFactor: null, resultantFactor: null });
});

test("an installation without its value prints with what it has (video 7.4, 24:21); the physical value and the conclusion stay the same", () => {
  const { result, trace } = compute(valued);
  const pending = {
    ...valued,
    installations: [...valued.installations, { ...emptyInstallation(3), description: "Cisterna de 10 mil litros", costName: "Cisterna", unit: "Lote", quantity: 1, age: 2, usefulLife: 80, conservation: 0.975, unitReplacementCost: null }],
  };
  const withPending = compute(pending);
  assert.equal(withPending.result.physicalValue, result.physicalValue, "the installation without value does not enter the sum");
  assert.equal(withPending.result.specialInstallations, result.specialInstallations);

  const [block] = costDocumentBlocks(pending, withPending.result, withPending.trace);
  const installations = block.apartados.find((apartado) => apartado.title.startsWith("C)"))!;
  const [factors, values] = installations.tables.map(printedRows);
  assert.equal(factors.length, 4);
  // Its own short name; Edad and FRe as the engine gives them; dashes for what needs its value.
  assert.deepEqual(factors[3].slice(0, 3), ["P", "4", "Cisterna"]);
  const preview = demeritPreview({ ref: "4", age: 2, usefulLife: 80, conservation: 0.975, otherFactor: 1 }, costEngineConfig(pending));
  assert.equal(factors[3][9], preview.ageFactor!.toFixed(2));
  assert.equal(factors[3][11], preview.resultantFactor!.toFixed(2));
  assert.deepEqual(values[3].slice(5), ["—", "—", preview.resultantFactor!.toFixed(2), "—", "—"]);
  // The valued rows print as before.
  assert.deepEqual(values.slice(0, 3), printedRows(costDocumentBlocks(valued, result, trace)[0].apartados.find((apartado) => apartado.title.startsWith("C)"))!.tables[1]));
  const closing = ensureTableV2(block.apartados.at(-1)!.tables.at(-1)!).schema?.summaryBoxes?.find((box) => box.id === "valor-fisico");
  assert.ok(closing?.rows.at(-1)?.value.includes(result.physicalValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })));
});

test("the save keeps the installation's own name in costs; an older client may leave it out", () => {
  const base = { land: DEFAULT_LAND, constructions: [], indirects: [] };
  const parsed = costInputSchema.parse({ ...base, installations: [{ ...emptyInstallation(0), description: "Cisterna de 10 mil litros con bomba", costName: "Cisterna" }] });
  assert.equal(parsed.installations[0].costName, "Cisterna");
  assert.equal(costInputSchema.parse({ ...base, installations: [{ ...emptyInstallation(0), description: "Cisterna" }] }).installations[0].costName, undefined);
});

test("«Vincular con Costos» on a table of his own: columns taken by their headers, the template's table left as his", () => {
  const section = withConstructionTables(templateSection(), valued);
  // His «Tabla configurable» (video 7.4, 21:45), with invented rows.
  const names = ["#", "Tipo", "Descripción", "Unidad", "Cant.", "Edad", "VUT", "Conservación", "Mantenim."];
  const own: TableV2 = {
    version: 2,
    id: "tbl-propia",
    title: "Tabla configurable",
    columns: names.map((name, index) => ({ id: `c${index}`, name })),
    rows: [
      ["1", "E.A.", "Tanque de gas estacionario de 300 lts.", "Pieza", "1", "6", "20", "Bueno", "Bueno"],
      ["2", "O.C.", "Enrejado de patio de servicio.", "Lote", "1", "6", "30", "Bueno", "Bueno"],
    ].map((values, row) => ({ id: `r${row}`, cells: Object.fromEntries(values.map((value, index) => [`c${index}`, { kind: "value" as const, value }])) })),
  } as TableV2;
  const withOwn: AppSection = { ...section, blocks: section.blocks.map((block, index) => (index === section.blocks.length - 1 ? { ...block, tables: [...block.tables, own as unknown as TableContent] } : block)) };

  const plan = captureLinkPlan(own, "installations");
  assert.ok(plan.ok);
  assert.deepEqual(plan.taken.map((item) => item.header), ["#", "Descripción", "Unidad", "Cant.", "Edad", "VUT", "Mantenim."]);
  assert.deepEqual(plan.computed, ["Conservación"]);
  assert.equal(plan.rows, 2);
  assert.equal(plan.addsRef, false);

  const linked = withLinkedCaptureTable(withOwn, "tbl-propia", "installations", valued);
  assert.equal([...captureTablesOf(linked)].find(([, kind]) => kind === "installations")?.[0], "tbl-propia");
  assert.deepEqual(readCapture(findCaptureTable(linked, "installations")!, "installations", null).map(({ item }) => [item.ref, item.description, (item as { usefulLife: number | null }).usefulLife]), [
    ["1", "Tanque de gas estacionario de 300 lts.", 20], ["2", "Enrejado de patio de servicio.", 30],
  ]);
  const template = ensureTableV2(linked.blocks.flatMap((block) => [block, ...block.apartados]).flatMap((item) => item.tables).find((table) => table.id.endsWith("instalaciones_especiales"))!);
  assert.equal(template.schema?.capture?.unlinked, true, "the table that was the capture stays as his");

  const noDescription = { ...own, columns: own.columns.map((column) => (column.name === "Descripción" ? { ...column, name: "Concepto" } : column)) };
  assert.equal(captureLinkPlan(noDescription, "installations").ok, false);
  const noNumber = { ...own, columns: own.columns.map((column) => (column.name === "#" ? { ...column, name: "Clave" } : column)) };
  const numbered = captureLinkPlan(noNumber, "installations");
  assert.ok(numbered.ok && numbered.addsRef);
});
