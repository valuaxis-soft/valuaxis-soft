import assert from "node:assert/strict";
import { test } from "node:test";
import { costDocumentBlocks, withConstructionTables } from "../src/features/valuations/calculation/cost-document";
import { DEFAULT_LAND, emptyInstallation, toCostEngineInput, type CostCalculationDto } from "../src/features/valuations/calculation/cost-types";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { Trace } from "../src/features/valuations/engine/trace";
import { replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { ensureTableV2, getTableHeaderLayout } from "../src/features/valuations/services/table";

const arandas: CostCalculationDto = {
  land: { ...DEFAULT_LAND, subjectArea: 169.78 },
  constructions: [{
    ref: "T-1", description: "Edificio de uso mixto", classification: "Moderno", quality: "Media",
    area: 467.27, age: 2, usefulLife: 70, conservation: 0.98, otherFactor: 1, completion: 1, undivided: 1, unitReplacementCost: 14361.99,
  }],
  installations: ([
    [6, 30, 9000], [1, 30, 35000], [11.55, 70, 14361.99], [3.54, 70, 14361.99],
    [4, 10, 30648], [1, 70, 90000], [4, 20, 4000], [4, 20, 3500],
  ] as const).map(([quantity, usefulLife, unitReplacementCost], index) => ({
    ...emptyInstallation(index), description: `Instalación ${index + 1}`, quantity, age: 2, usefulLife, conservation: 0.975, unitReplacementCost,
  })),
  indirects: [],
  market: { adoptedUnitValue: 9000, subjectArea: 169.78, baseArea: null },
  configured: true,
  locked: false,
};

function compute(calculation: CostCalculationDto) {
  const input = toCostEngineInput(calculation);
  assert.ok(input.ok);
  const trace = new Trace();
  return { result: computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG, trace), trace };
}

/** A generated table as the dictamen prints it. */
function printed(table: TableContent) {
  const v2 = ensureTableV2(table);
  return {
    groups: getTableHeaderLayout(v2).topRow.flatMap((cell) => (cell.kind === "group-title" ? [[cell.group.title, cell.colSpan]] : [])),
    columns: v2.columns.map((column) => column.name),
    rows: v2.rows.map((row) => v2.columns.map((column) => {
      const cell = row.cells[column.id];
      return cell?.kind === "value" ? cell.value : "";
    })),
    boxes: Object.fromEntries((v2.schema?.summaryBoxes ?? []).map((box) => [`${box.position}:${box.id}`, box.rows.map((row) => [row.label, row.value])])),
    schema: v2.schema,
  };
}

test("the cost page is one block with land, constructions and installations, each with its boxed value, and the physical value", () => {
  const { result, trace } = compute(arandas);
  const blocks = costDocumentBlocks(arandas, result, trace);
  assert.deepEqual(blocks.map((block) => [block.id, block.title]), [["motor-costos-enfoque", "ENFOQUE FÍSICO O DE COSTOS"]]);
  const [land, constructions, installations] = blocks[0].apartados;
  assert.deepEqual(blocks[0].apartados.map((apartado) => apartado.title), [
    "A) TERRENO EN ESTUDIO", "B) CONSTRUCCIONES", "C) INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS",
  ]);

  const landTable = printed(land.tables[0]);
  assert.deepEqual(landTable.columns, [
    "Fracción", "Superficie de Sujeto (m²)", "Valor Unitario ($/m²)", "Neg.", "Ubic.", "Sup.", "Serv.", "Clas.", "Top.", "FRe",
    "Valor Unitario Neto $/m²", "Valor Parcial $",
  ]);
  assert.deepEqual(landTable.groups, [["Factores de Homologación", 7]]);
  assert.deepEqual(landTable.rows, [["I", "169.78", "$ 9,000.00", "1.00", "1.00", "1.00", "1.00", "1.00", "1.00", "1.00", "$ 9,000.00", "$ 1,528,020.00"]]);
  assert.deepEqual(landTable.boxes, {
    "top:lote-tipo": [["Lote Tipo:", "169.78 m²"]],
    "top:valor-mercado": [["Valor comparativo de Mercado ($/m²):", "$ 9,000.00"]],
    "bottom:superficie": [["Superficie valuada:", "169.78 m²"]],
    "bottom:medio": [["Valor Unitario Medio ($/m²):", "$ 9,000.00"]],
    "bottom:valor": [["A) Valor del Terreno:", "$ 1,528,000.00"]],
  }, "el terreno toma el valor adoptado en mercado");

  const [types, values] = constructions.tables.map(printed);
  assert.deepEqual(types.columns, [
    "Ref.", "Tipo de Construcción", "Superficie Construida (m²)", "Edad", "Vida útil", "Vida remanente",
    "Cons.", "Edad", "Otro", "FRe", "Grado de terminación", "Indiviso",
  ]);
  assert.deepEqual(types.groups, [["Factores de Demérito", 4]]);
  assert.deepEqual(types.rows, [["T-1", "Edificio de uso mixto", "467.27", "2", "70", "68", "0.98", "0.99", "1.00", "0.97", "100%", "100%"]]);
  assert.deepEqual(values.groups, [["Valor de Reposición Nuevo (VRN)", 2], ["Valor Neto de Reposición (VNR)", 2]]);
  assert.deepEqual(values.rows, [["T-1", "Edificio de uso mixto", "467.27", "$ 14,361.99", "$ 6,710,927.07", "0.97", "$ 13,977.76", "$ 6,531,386.08"]]);
  assert.deepEqual(values.boxes, {
    "bottom:subtotal": [["Subtotal:", "$ 6,531,386.08"]],
    "bottom:superficie": [["Superficie valuada:", "467.27 m²"]],
    "bottom:medio": [["Valor Unitario Medio ($/m²):", "$ 13,974.79"]],
    "bottom:valor": [["B) Valor de las Construcciones:", "$ 6,530,000.00"]],
  });

  const [items, itemValues] = installations.tables.map(printed);
  assert.deepEqual(items.columns.slice(0, 8), ["P/C", "Ref.", "Descripción", "Unidad", "Cant.", "Edad", "Vida útil", "Vida remanente"]);
  assert.deepEqual(items.rows[0], ["P", "1", "Instalación 1", "—", "6.00", "2", "30", "28", "0.98", "0.98", "1.00", "0.95", "100%", "100%"]);
  assert.equal(items.rows.length, 8);
  assert.deepEqual(itemValues.rows[0], ["P", "1", "Instalación 1", "—", "6.00", "$ 9,000.00", "$ 54,000.00", "0.95", "$ 8,576.98", "$ 51,461.85"]);
  assert.deepEqual(itemValues.boxes, {
    "bottom:sumas": [["Suma Privativa (P):", "$ 516,865.31"], ["Suma Común (C):", "$ 0.00"], ["Subtotal:", "$ 516,865.31"]],
    "bottom:valor": [["C) Valor de Instalaciones Especiales, Elementos Accesorios y Obras Complementarias:", "$ 517,000.00"]],
    // The physical value closes the page under the last table.
    "bottom:valor-fisico": [
      ["A) Valor del Terreno:", "$ 1,528,000.00"],
      ["B) Valor de las Construcciones:", "$ 6,530,000.00"],
      ["C) Valor de Instalaciones Especiales:", "$ 517,000.00"],
      ["VALOR FÍSICO O DIRECTO (A+B+C):", "$ 8,580,000.00"],
    ],
  });
  assert.equal(itemValues.schema?.summaryBoxes?.at(-1)?.rows.at(-1)?.emphasis, "total");
});

test("indirects print only when there are any, and the physical value adds only the parts captured", () => {
  const withIndirects: CostCalculationDto = {
    ...arandas,
    // A row still being typed comes before the one that counts.
    indirects: [{ concept: "", percentage: null, base: null }, { concept: "Proyecto y licencias", percentage: 0.05, base: null }],
  };
  const computed = compute(withIndirects);
  const apartados = costDocumentBlocks(withIndirects, computed.result, computed.trace)[0].apartados;
  assert.equal(apartados.at(-1)?.title, "E) INDIRECTOS");
  const indirects = printed(apartados.at(-1)!.tables[0]);
  assert.deepEqual(indirects.columns, ["Concepto", "Porcentaje", "Base $", "Importe $"]);
  assert.deepEqual(indirects.rows, [["Proyecto y licencias", "5.00%", "$ 7,047,000.00", "$ 352,350.00"]]);
  assert.deepEqual(indirects.boxes["bottom:valor"], [["E) Indirectos:", "$ 352,350.00"]]);
  assert.equal(indirects.boxes["bottom:valor-fisico"].at(-1)?.[0], "VALOR FÍSICO O DIRECTO (A+B+C+E):");
  assert.equal(printed(apartados[2].tables[1]).boxes["bottom:valor-fisico"], undefined, "the closing box moves to the last table");

  const landOnly: CostCalculationDto = { ...arandas, constructions: [], installations: [] };
  const land = compute(landOnly);
  const [block] = costDocumentBlocks(landOnly, land.result, land.trace);
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), ["A) TERRENO EN ESTUDIO"]);
  assert.deepEqual(printed(block.apartados[0].tables[0]).boxes["bottom:valor-fisico"], [
    ["A) Valor del Terreno:", "$ 1,528,000.00"],
    ["VALOR FÍSICO O DIRECTO (A):", "$ 1,530,000.00"],
  ]);
  assert.deepEqual(costDocumentBlocks(arandas, null, null), [], "nothing computed, no page");
});

test("a valuation saved with the former cost blocks gets the page in their place, and a reload leaves it as it is", () => {
  const { result, trace } = compute(arandas);
  const blocks = costDocumentBlocks(arandas, result, trace);
  const former = ["terreno", "construcciones", "instalaciones", "resumen"].map((part): Block => ({
    id: `motor-costos-${part}`, title: part, sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [],
  }));
  const section: AppSection = { id: "costos", label: "VI", title: "COSTOS", sourceFile: "", enabled: true, required: false, blocks: former };
  const owns = (block: Block) => block.id.startsWith("motor-costos");
  const updated = replaceGeneratedBlocks(section, owns, blocks);
  assert.deepEqual(updated.blocks.map((block) => block.id), ["motor-costos-enfoque"]);
  // Saved and reloaded, the schema comes back as plain JSON.
  const reloaded = { ...updated, blocks: updated.blocks.map((block) => ({
    ...block,
    apartados: block.apartados.map((apartado) => ({ ...apartado, tables: apartado.tables.map((table) => JSON.parse(JSON.stringify(table)) as TableContent) })),
  })) };
  assert.equal(replaceGeneratedBlocks(reloaded, owns, costDocumentBlocks(arandas, result, trace)), reloaded);
});

const constructionSection = (tables: TableContent[]): AppSection => ({
  id: "construccion", label: "IV", title: "CONSTRUCCIONES", sourceFile: "", enabled: true, required: false,
  blocks: [{
    id: "construccion_descripcion_general", title: "DESCRIPCIÓN", sectionLabel: "", enabled: true, required: false,
    concepts: [], tables: [], images: [],
    apartados: [{ id: "construccion_tipos", title: "TIPOS", enabled: true, concepts: [], images: [], tables }],
  }],
});

const templateTable = (id: string, columns: string[]): TableContent => ({ id, title: id, columns, rows: [columns.map(() => "")], enabled: true });

test("the capture fills the construction section tables once, and a reload leaves them as they are", () => {
  const section = constructionSection([
    templateTable("construccion_tipos", ["Tipo", "Tipo", "Clasificación", "Calidad", "Conservación", "Edad", "VUT", "VUR", "Sup. (m²)", "Descripción"]),
    templateTable("instalaciones_especiales", ["#", "Tipo", "Edad", "VUT", "VUR", "Conservación", "Mantenimiento", "Descripción"]),
  ]);
  const filled = withConstructionTables(section, arandas);
  const [types, installations] = filled.blocks[0].apartados[0].tables as (TableContent & { rows: string[][] })[];
  assert.deepEqual(types.rows[0], ["T-1", "Edificio de uso mixto", "Moderno", "Media", "0.98", "2", "70", "68", "467.27", ""]);
  assert.equal(installations.rows.length, 8);

  const reloaded = { ...filled, blocks: filled.blocks.map((block) => ({
    ...block,
    apartados: block.apartados.map((apartado) => ({ ...apartado, tables: apartado.tables.map((table) => ensureTableV2(table) as unknown as TableContent) })),
  })) };
  assert.equal(withConstructionTables(reloaded, arandas), reloaded);
});

test("without a capture the construction tables the appraiser wrote stay untouched", () => {
  const section = constructionSection([templateTable("construccion_tipos", ["Tipo", "Descripción"])]);
  assert.equal(withConstructionTables(section, { ...arandas, constructions: [], installations: [] }), section);
});
