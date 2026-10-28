import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DocumentTable } from "../src/features/valuations/components/document-table";
import { costDocumentBlocks, withConstructionTables } from "../src/features/valuations/calculation/cost-document";
import { costInputSchema } from "../src/features/valuations/calculation/cost-schemas";
import {
  DEFAULT_LAND,
  costColumnsOf,
  emptyInstallation,
  toCostEngineInput,
  type CostCalculationDto,
} from "../src/features/valuations/calculation/cost-types";
import {
  figureColumn,
  generatedTable,
  offerOptionsTable,
  printedTable,
  resultantColumn,
  textColumn,
} from "../src/features/valuations/calculation/generated-content";
import {
  MAX_EXTRA_COLUMNS,
  applyTableLayout,
  layoutOf,
  sourceOf,
  withColumnHidden,
  withExtraColumn,
  withExtraColumnChange,
  withHeaderLabel,
  withoutExtraColumn,
} from "../src/features/valuations/calculation/generated-table-layout";
import { replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { Trace } from "../src/features/valuations/engine/trace";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { ensureTableV2, getTableHeaderLayout } from "../src/features/valuations/services/table";
import { decodeStoredTable, serializeTableForSave } from "../src/features/valuations/services/table-persistence";

const casa = { ref: "T-1", description: "Casa", classification: "Moderno", quality: "Media", area: 120, age: 10, usefulLife: 60 };
const base: CostCalculationDto = {
  land: { ...DEFAULT_LAND },
  types: [casa],
  constructions: [{ ...casa, conservation: 0.9, conservationRating: null, ageFactor: 0.8, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: 10000 }],
  installations: [{ ...emptyInstallation(0), ref: "1", description: "Cisterna", quantity: 1, age: 10, usefulLife: 30, conservation: 1, ageFactor: 0.5, unitReplacementCost: 20000 }],
  indirects: [],
  market: { adoptedUnitValue: null, subjectArea: null, baseArea: null },
  configured: true,
  typesCaptured: true,
  locked: false,
};

function compute(calculation: CostCalculationDto) {
  const input = toCostEngineInput(calculation);
  assert.ok(input.ok);
  const trace = new Trace();
  return { input: input.input, result: computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG, trace), trace };
}

const cellsOf = (table: TableContent) => {
  const v2 = ensureTableV2(table);
  return v2.rows.map((row) => v2.columns.map((column) => {
    const cell = row.cells[column.id];
    return cell?.kind === "value" ? cell.value : "";
  }));
};
const namesOf = (table: TableContent) => ensureTableV2(table).columns.map((column) => column.name);

/* ── Added demerit factors ─────────────────────────────────────── */

test("the factors added after «Otro» multiply the FRe; without them the calculation and its input stay as they were", () => {
  const plain = compute(base);
  assert.equal(plain.input.constructions?.[0].extraFactors, undefined, "a table without added factors sends none");
  assert.equal(plain.trace.find("costos.construcciones.T-1.factorResultante")?.value, 0.9 * 0.8 * 1);
  assert.equal(plain.trace.find("costos.construcciones.T-1.factorResultante")?.formula, "conservación × edad × otro");

  const added: CostCalculationDto = {
    ...base,
    columns: { ...costColumnsOf(null), constructions: { other: "Obsolescencia", extra: ["Funcional", "Ubicación"] } },
    constructions: [{ ...base.constructions[0], extraFactors: [0.95] }],
  };
  const { input, result, trace } = compute(added);
  // The second added factor has no value in the row: it is 1, as an empty «Otro».
  assert.deepEqual(input.constructions?.[0].extraFactors, [0.95, 1]);
  const resultant = trace.find("costos.construcciones.T-1.factorResultante");
  assert.equal(resultant?.value, 0.9 * 0.8 * 1 * 0.95 * 1);
  assert.equal(resultant?.formula, "conservación × edad × otro × factor1 × factor2");
  assert.deepEqual(resultant?.inputs, { conservacion: 0.9, edad: 0.8, otro: 1, factor1: 0.95, factor2: 1 });
  assert.equal(trace.find("costos.construcciones.T-1.vnrParcial")?.value, resultant!.value * 10000 * 120);
  assert.ok(result.constructions < plain.result.constructions);
  assert.equal(input.specialInstallations?.[0].extraFactors, undefined, "each table has its own added factors");
});

test("a FRe typed by the appraiser still wins over the added factors", () => {
  const typed: CostCalculationDto = {
    ...base,
    columns: { ...costColumnsOf(null), constructions: { other: "Otro", extra: ["Funcional"] } },
    constructions: [{ ...base.constructions[0], extraFactors: [0.5], resultantFactor: 0.7 }],
  };
  assert.equal(compute(typed).trace.find("costos.construcciones.T-1.factorResultante")?.value, 0.7);
});

test("the cost columns are read with their defaults: «Otro» blank or missing is «Otro», at most two added factors", () => {
  assert.deepEqual(costColumnsOf(undefined), {
    constructions: { other: "Otro", extra: [] }, installations: { other: "Otro", extra: [] }, showMaintenance: null,
  });
  assert.deepEqual(costColumnsOf({ constructions: { other: "  ", extra: ["A", "B", "C", 4] }, showMaintenance: false }).constructions, { other: "Otro", extra: ["A", "B"] });
  assert.equal(costColumnsOf({ showMaintenance: false }).showMaintenance, false);
});

test("the save takes two added factors per row at most, and the names of the columns; an older client sends neither", () => {
  const construction = {
    ref: "T-1", conservation: 0.9, conservationRating: null, ageFactor: null, otherFactor: 1, resultantFactor: null,
    completion: 1, undivided: 1, unitReplacementCost: 10000,
  };
  const payload = {
    land: { ...DEFAULT_LAND }, constructions: [construction], installations: [], indirects: [],
  };
  const older = costInputSchema.parse(payload);
  assert.deepEqual(older.constructions[0].extraFactors, []);
  assert.equal(older.columns, undefined);

  const columns = { constructions: { other: "Obsolescencia", extra: ["Funcional"] }, installations: { other: "Otro", extra: [] }, showMaintenance: false };
  const current = costInputSchema.parse({ ...payload, columns, constructions: [{ ...construction, extraFactors: [0.95] }] });
  assert.deepEqual(current.constructions[0].extraFactors, [0.95]);
  assert.deepEqual(current.columns, columns);
  assert.equal(costInputSchema.safeParse({ ...payload, constructions: [{ ...construction, extraFactors: [1, 1, 1] }] }).success, false);
  assert.equal(costInputSchema.safeParse({ ...payload, columns: { ...columns, constructions: { other: "Otro", extra: ["A", "B", "C"] } } }).success, false);
  assert.equal(costInputSchema.safeParse({ ...payload, constructions: [{ ...construction, extraFactors: [11] }] }).success, false, "a factor is at most 10");
});

test("the cost page prints «Otro» as renamed and the added factors under Factores de Demérito, and the FRe in bold", () => {
  const added: CostCalculationDto = {
    ...base,
    columns: { ...costColumnsOf(null), constructions: { other: "Obsolescencia", extra: ["Funcional"] } },
    constructions: [{ ...base.constructions[0], extraFactors: [0.95] }],
  };
  const { result, trace } = compute(added);
  const [constructions, installations] = costDocumentBlocks(added, result, trace)[0].apartados;
  const [types, values] = constructions.tables;
  assert.deepEqual(namesOf(types).slice(6, 11), ["Cons.", "Edad", "Obsolescencia", "Funcional", "FRe"]);
  assert.deepEqual(cellsOf(types)[0].slice(6, 11), ["0.90", "0.80", "1.00", "0.95", "0.68"]);
  const group = getTableHeaderLayout(ensureTableV2(types)).topRow.find((cell) => cell.kind === "group-title");
  assert.deepEqual(group?.kind === "group-title" ? [group.group.title, group.colSpan] : null, ["Factores de Demérito", 5]);

  const bold = (table: TableContent) => {
    const v2 = ensureTableV2(table);
    return v2.columns.filter((column) => v2.schema?.columnPresentation?.[column.id]?.bold).map((column) => column.name);
  };
  assert.deepEqual(bold(types), ["FRe"]);
  assert.deepEqual(bold(values), ["Factor Resultante"]);
  assert.deepEqual(namesOf(installations.tables[0]).slice(8, 12), ["Cons.", "Edad", "Otro", "FRe"], "the installations keep their own columns");
  assert.deepEqual(bold(installations.tables[1]), ["F. Result."]);
});

/* ── Columns the appraiser sets on a table the calculation writes ─────────────────────────────── */

const homologation = (rows: [string, string, string][]) => generatedTable("motor-mercado-terreno_venta-enfoque-tabla-homologacion", "Homologación",
  [figureColumn("REF"), figureColumn("Neg.", { group: "FACTORES" }), resultantColumn("FRe", "FACTORES")],
  rows,
  { rowKeys: rows.map((row) => row[0]) });

test("a hidden column leaves the printed table, a renamed header prints renamed, and an added column prints its text", () => {
  const written = homologation([["1", "0.95", "0.95"], ["2", "1.00", "1.00"]]);
  const source = ensureTableV2(written);
  const [ref, negotiation, resultant] = source.columns;
  let layout = withColumnHidden({}, negotiation.id, true);
  layout = withHeaderLabel(layout, resultant.id, "F. Res.");
  layout = withHeaderLabel(layout, source.schema!.headerGroups![0].id, "FACTORES DE HOMOLOGACIÓN");
  layout = withExtraColumn(layout, "Observaciones", ref.id);
  const extra = layout.extraColumns![0];
  layout = withExtraColumnChange(layout, extra.id, { value: { rowId: source.rows[1].id, text: "Esquina" } });

  const table = applyTableLayout(written, layout);
  assert.deepEqual(namesOf(table), ["REF", "Observaciones", "F. Res."]);
  assert.deepEqual(cellsOf(table), [["1", "", "0.95"], ["2", "Esquina", "1.00"]]);
  const v2 = ensureTableV2(table);
  // The added column follows REF (no group); the group keeps only FRe, with its new title.
  assert.deepEqual(getTableHeaderLayout(v2).topRow.map((cell) => (cell.kind === "group-title" ? [cell.group.title, cell.colSpan] : cell.columnId)), [
    ref.id, extra.id, ["FACTORES DE HOMOLOGACIÓN", 1],
  ]);
  assert.equal(v2.schema?.columnPresentation?.[resultant.id]?.bold, true, "the FRe keeps its bold");
  // What the calculation wrote stays with the table: the hidden column can be shown again with its figures.
  assert.deepEqual(cellsOf(sourceOf(table) as unknown as TableContent), cellsOf(written));
  assert.deepEqual(cellsOf(applyTableLayout(table, withColumnHidden(layoutOf(table), negotiation.id, false)))[0], ["1", "", "0.95", "0.95"]);
  // Nothing set: the table as written.
  assert.deepEqual(printedTable(applyTableLayout(table, {})), printedTable(written));
});

test("the hidden columns, names and added columns travel in the saved table and come back the same", () => {
  const written = homologation([["1", "0.95", "0.95"]]);
  const source = ensureTableV2(written);
  const layout = withExtraColumnChange(
    withExtraColumn(withColumnHidden({}, source.columns[1].id, true), "Notas", null),
    "extra-1",
    { value: { rowId: source.rows[0].id, text: "Revisar" } },
  );
  const payload = serializeTableForSave(applyTableLayout(written, layout));
  assert.deepEqual(payload.schema?.generated?.layout.hidden, [source.columns[1].id], "the hidden column is in the payload");
  assert.deepEqual(payload.columns.map((column) => column.name), ["REF", "FRe", "Notas"], "and out of the printed columns");

  // As the database gives it back: the schema whole, and the cells as text.
  const reloaded = decodeStoredTable({
    id: payload.id,
    title: payload.title,
    enabled: payload.enabled,
    schema: JSON.parse(JSON.stringify(payload.schema)),
    columns: payload.columns,
    rows: payload.rows.map((row) => ({
      id: row.id,
      cells: payload.columns.map((column) => {
        const cell = row.cells[column.id];
        return { text: cell?.kind === "value" ? cell.value : null, numeric: null, boolean: null, date: null, complex: null, calculated: false };
      }),
    })),
  });
  assert.deepEqual(layoutOf(reloaded), layout);
  assert.deepEqual(cellsOf(reloaded as unknown as TableContent), [["1", "0.95", "Revisar"]]);
});

const marketSection = (blocks: Block[]): AppSection => ({ id: "mercado", label: "", title: "MERCADO", sourceFile: "", enabled: true, required: false, blocks });
const marketBlock = (table: TableContent): Block => ({
  id: "motor-mercado-terreno_venta-enfoque", title: "ENFOQUE", sectionLabel: "", enabled: true, required: false, concepts: [], images: [], tables: [],
  apartados: [{ id: "motor-mercado-terreno_venta-enfoque-homologacion", title: "HOMOLOGACIÓN", enabled: true, concepts: [], images: [], tables: [table] }],
});
const owns = (block: Block) => block.id.startsWith("motor-mercado-terreno_venta");

test("the calculation writes its table again with the columns the appraiser set, and each added text stays with its comparable", () => {
  const written = homologation([["1", "0.95", "0.95"], ["2", "1.00", "1.00"], ["3", "0.90", "0.90"]]);
  const source = ensureTableV2(written);
  const layout = withExtraColumnChange(
    withExtraColumn(withColumnHidden({}, source.columns[1].id, true), "Notas", null),
    "extra-1",
    { value: { rowId: source.rows[2].id, text: "Comparable 3" } },
  );
  const section = marketSection([marketBlock(applyTableLayout(written, layout))]);

  // Comparable 1 is deleted and the factors change: the table is written again.
  const next = replaceGeneratedBlocks(section, owns, [marketBlock(homologation([["2", "1.05", "1.05"], ["3", "0.90", "0.90"]]))]);
  const table = next.blocks[0].apartados[0].tables[0];
  assert.deepEqual(namesOf(table), ["REF", "FRe", "Notas"]);
  assert.deepEqual(cellsOf(table), [["2", "1.05", ""], ["3", "0.90", "Comparable 3"]]);
  // Written again the same: the section is left as it is.
  assert.equal(replaceGeneratedBlocks(next, owns, [marketBlock(homologation([["2", "1.05", "1.05"], ["3", "0.90", "0.90"]]))]), next);
});

test("an added column is placed, renamed and removed; at most four per table", () => {
  let layout = withExtraColumn({}, " ", null);
  assert.equal(layout.extraColumns?.[0].name, "Nueva columna");
  layout = withExtraColumnChange(layout, "extra-1", { name: "Notas", after: "col-1" });
  assert.deepEqual(layout.extraColumns?.[0], { id: "extra-1", name: "Notas", after: "col-1", values: {} });
  layout = withHeaderLabel(withHeaderLabel(layout, "col-2", "Factor"), "col-2", " ");
  assert.deepEqual(layout.labels, {}, "an empty name gives back the calculation's");
  for (let index = 0; index < 6; index += 1) layout = withExtraColumn(layout, `C${index}`, null);
  assert.equal(layout.extraColumns?.length, MAX_EXTRA_COLUMNS);
  assert.deepEqual(withoutExtraColumn(layout, "extra-1").extraColumns?.map((column) => column.id), ["extra-2", "extra-3", "extra-4"]);
});

/* ── Construction section tables: their columns as the appraiser left them ─────────────────────── */

const constructionSection = (table: TableContent): AppSection => ({
  id: "construccion", label: "IV", title: "CONSTRUCCIONES", sourceFile: "", enabled: true, required: false,
  blocks: [{
    id: "construccion_ie", title: "IE", sectionLabel: "", enabled: true, required: false, concepts: [], tables: [], images: [],
    apartados: [{ id: "instalaciones_especiales_detalle", title: "IE", enabled: true, concepts: [], images: [], tables: [table] }],
  }],
});

test("the installations table of the construction section without Mantenimiento keeps every figure in its column, and a column added keeps its text", () => {
  const template = { id: "instalaciones_especiales", title: "IE", columns: ["#", "Tipo", "Edad", "VUT", "VUR", "Conservación", "Mantenimiento", "Descripción"], columnKeys: ["numero", "tipo", "edad", "vut", "vur", "conservacion", "mantenimiento", "descripcion"], rows: [], enabled: true };
  const filled = withConstructionTables(constructionSection(template), base).blocks[0].apartados[0].tables[0];
  assert.deepEqual(cellsOf(filled), [["1", "Privativa", "10", "30", "20", "1.000", "—", "Cisterna (1.00)"]]);

  // The appraiser deletes Mantenimiento and adds a column of his own.
  const v2 = ensureTableV2(filled);
  const edited = {
    ...v2,
    columns: [...v2.columns.filter((column) => column.id !== "mantenimiento"), { id: "notas", name: "Notas" }],
    rows: v2.rows.map((row) => ({ ...row, cells: { ...row.cells, notas: { kind: "value" as const, value: "Nueva" } } })),
  } as unknown as TableContent;
  const recalculated = withConstructionTables(constructionSection(edited), {
    ...base,
    installations: [{ ...base.installations[0], age: 12 }],
  }).blocks[0].apartados[0].tables[0];
  assert.deepEqual(namesOf(recalculated), ["#", "Tipo", "Edad", "VUT", "VUR", "Conservación", "Descripción", "Notas"]);
  assert.deepEqual(cellsOf(recalculated), [["1", "Privativa", "12", "30", "18", "1.000", "Cisterna (1.00)", "Nueva"]]);
});

test("a table saved before by position (columns column-1…) is read by its headers", () => {
  const saved = ensureTableV2({ id: "instalaciones_especiales", title: "IE", columns: ["#", "Tipo", "Edad", "VUT", "VUR", "Conservación", "Descripción"], rows: [], enabled: true });
  assert.equal(saved.columns[0].id, "column-1");
  const filled = withConstructionTables(constructionSection(saved as unknown as TableContent), base).blocks[0].apartados[0].tables[0];
  assert.deepEqual(cellsOf(filled), [["1", "Privativa", "10", "30", "20", "1.000", "Cisterna (1.00)"]]);
});

/* ── Print ─────────────────────────────────────────────────────── */

const render = (table: TableContent) => renderToStaticMarkup(createElement(DocumentTable, { variant: "report", table }));

test("a calculation table prints like a configurable one: same size, rows, dark gray text; its FRe in bold", () => {
  const calculated = render(homologation([["1", "0.95", "0.95"]]));
  const configurable = render({ id: "t", title: "Tabla configurable", columns: ["REF", "Neg.", "FRe"], rows: [["1", "0.95", "0.95"]], enabled: true });
  const tableClass = (html: string) => html.match(/<table class="([^"]*)"/)?.[1].split(" ").filter((name) => /^text-/.test(name)).sort();
  assert.deepEqual(tableClass(calculated), tableClass(configurable));
  assert.ok(tableClass(calculated)?.includes("text-[#333333]"), "dark gray, not black");
  assert.match(calculated, /<td[^>]*font-bold[^>]*>0\.95<\/td><\/tr>/, "the FRe, last column");
  assert.equal(calculated.match(/<td[^>]*font-bold[^>]*>/g)?.length, 1, "only the FRe");
  const wide = render(generatedTable("w", "W", Array.from({ length: 14 }, (_, index) => textColumn(`C${index}`)), [Array.from({ length: 14 }, () => "1")]));
  assert.match(wide, /<table class="[^"]*text-\[10px\]/, "a wide one a point less, as a configurable one; never 9px");
});

test("a box or a cell marked with an X is shaded, and the rules of the boxes are not black", () => {
  const offer = render(offerOptionsTable("oferta", "Nivel de oferta", ["MUY ALTA", "ALTA", "MEDIA", "MEDIA BAJA", "BAJA", "NULA"], 2));
  assert.equal(offer.match(/<td[^>]*bg-\[#BDD7EE\][^>]*>\( X \)<\/td>/g)?.length, 1, "the observed level");
  const boxed = render(generatedTable("h", "H", [figureColumn("REF")], [["1"]], {
    summaryBoxes: [{ id: "base", position: "top", rows: [{ label: "Lote Tipo:", value: "140 m²", mark: false }, { label: "Lote Sujeto:", value: "169 m²", mark: true }] }],
  }));
  assert.match(boxed, /<td class="[^"]*bg-\[#BDD7EE\][^"]*">x<\/td>/);
  assert.doesNotMatch(boxed, /<td class="[^"]*bg-\[#BDD7EE\][^"]*"><\/td>/, "the option not chosen is not shaded");
  assert.doesNotMatch(boxed, /border-\[var\(--caratula-dark-blue\)\]/);
});
