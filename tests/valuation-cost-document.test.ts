import assert from "node:assert/strict";
import { test } from "node:test";
import { costDocumentBlocks, withConstructionTables } from "../src/features/valuations/calculation/cost-document";
import { DEFAULT_LAND, costEngineConfig, emptyInstallation, toCostEngineInput, type CostCalculationDto } from "../src/features/valuations/calculation/cost-types";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { Trace } from "../src/features/valuations/engine/trace";
import { replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { ensureTableV2, getTableHeaderLayout } from "../src/features/valuations/services/table";

const arandasType = { ref: "T-1", description: "Edificio de uso mixto", classification: "Moderno", quality: "Media", area: 467.27, age: 2, usefulLife: 70 };

const arandas: CostCalculationDto = {
  land: { ...DEFAULT_LAND, subjectArea: 169.78 },
  types: [arandasType],
  constructions: [{ ...arandasType, conservation: 0.98, ageFactor: null, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: 14361.99 }],
  installations: ([
    [6, 30, 9000], [1, 30, 35000], [11.55, 70, 14361.99], [3.54, 70, 14361.99],
    [4, 10, 30648], [1, 70, 90000], [4, 20, 4000], [4, 20, 3500],
  ] as const).map(([quantity, usefulLife, unitReplacementCost], index) => ({
    ...emptyInstallation(index), description: `Instalación ${index + 1}`, quantity, age: 2, usefulLife, conservation: 0.975, unitReplacementCost,
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
    "A) TERRENO EN ESTUDIO", "B) CONSTRUCCIONES", "C) INSTALACIONES ESPECIALES, ELEMENTOS ACCESORIOS Y OBRAS COMPLEMENTARIAS (IE, EA, OC)",
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

test("the land block prints the book's A) TERRENO: lote tipo, market value, the factor table with Sup. = (lote tipo / sujeto)^(1/n), and the value", () => {
  // TCH, VI. ENF. COSTOS rows 12–20, with the lote tipo taken from the land market.
  const tch: CostCalculationDto = {
    ...arandas, types: [], constructions: [], installations: [],
    land: { ...DEFAULT_LAND, subjectArea: 160, factors: { negotiation: 0.95, location: 0.9, services: 1.05, classification: 1, topography: 1 } },
    market: { adoptedUnitValue: 5000, subjectArea: 160, baseArea: 140 },
    rounding: { land: -4, constructions: -4, installations: -3, physicalValue: -4 },
  };
  const input = toCostEngineInput(tch);
  assert.ok(input.ok);
  const trace = new Trace();
  const result = computeCostApproach(input.input, costEngineConfig(tch), trace);
  const land = printed(costDocumentBlocks(tch, result, trace)[0].apartados[0].tables[0]);
  assert.deepEqual(land.columns, [
    "Fracción", "Superficie de Sujeto (m²)", "Valor Unitario ($/m²)", "Neg.", "Ubic.", "Sup.", "Serv.", "Clas.", "Top.", "FRe",
    "Valor Unitario Neto $/m²", "Valor Parcial $",
  ]);
  assert.deepEqual(land.groups, [["Factores de Homologación", 7]]);
  assert.deepEqual(land.rows, [["I", "160.00", "$ 5,000.00", "0.95", "0.90", "0.96", "1.05", "1.00", "1.00", "0.86", "$ 4,293.33", "$ 686,933.59"]]);
  assert.deepEqual(land.boxes, {
    "top:lote-tipo": [["Lote Tipo:", "140.00 m²"]],
    "top:valor-mercado": [["Valor comparativo de Mercado ($/m²):", "$ 5,000.00"]],
    "bottom:superficie": [["Superficie valuada:", "160.00 m²"]],
    "bottom:medio": [["Valor Unitario Medio ($/m²):", "$ 4,293.33"]],
    "bottom:valor": [["A) Valor del Terreno:", "$ 690,000.00"]],
    "bottom:valor-fisico": [["A) Valor del Terreno:", "$ 690,000.00"], ["VALOR FÍSICO O DIRECTO (A):", "$ 690,000.00"]],
  });

  // Direct homologation: no lote tipo anywhere, the table shows the subject and Sup. = 1.
  const direct: CostCalculationDto = { ...tch, market: { ...tch.market, baseArea: null } };
  const directInput = toCostEngineInput(direct);
  assert.ok(directInput.ok);
  const directTrace = new Trace();
  const directResult = computeCostApproach(directInput.input, costEngineConfig(direct), directTrace);
  const directLand = printed(costDocumentBlocks(direct, directResult, directTrace)[0].apartados[0].tables[0]);
  assert.deepEqual(directLand.boxes["top:lote-tipo"], [["Lote Tipo:", "160.00 m²"]]);
  assert.equal(directLand.rows[0][5], "1.00");
  assert.deepEqual(directLand.boxes["bottom:valor"], [["A) Valor del Terreno:", "$ 720,000.00"]]);
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
  assert.equal(withConstructionTables(section, { ...arandas, types: [], constructions: [], installations: [], typesCaptured: false }), section);
});

test("the construction types table follows the types of the construction section, picked by the cost approach or not", () => {
  const section = constructionSection([
    templateTable("construccion_tipos", ["Tipo", "Tipo", "Clasificación", "Calidad", "Conservación", "Edad", "VUT", "VUR", "Sup. (m²)", "Descripción"]),
  ]);
  const bodega = { ref: "T-2", description: "Bodega", classification: "Industrial", quality: "Económica", area: 80, age: 10, usefulLife: 50 };
  const filled = withConstructionTables(section, { ...arandas, types: [arandasType, bodega] });
  const [types] = filled.blocks[0].apartados[0].tables as (TableContent & { rows: string[][] })[];
  assert.deepEqual(types.rows, [
    ["T-1", "Edificio de uso mixto", "Moderno", "Media", "0.98", "2", "70", "68", "467.27", ""],
    // Not valued yet: no conservation factor, but its own data.
    ["T-2", "Bodega", "Industrial", "Económica", "—", "10", "50", "40", "80.00", ""],
  ]);
});

test("a type deleted in the construction section leaves its table, the cost page and, the last one too, the printed table", () => {
  const section = constructionSection([
    templateTable("construccion_tipos", ["Tipo", "Tipo", "Clasificación", "Calidad", "Conservación", "Edad", "VUT", "VUR", "Sup. (m²)", "Descripción"]),
    templateTable("instalaciones_especiales", ["#", "Tipo", "Edad", "VUT", "VUR", "Conservación", "Mantenimiento", "Descripción"]),
  ]);
  const bodega = { ref: "T-2", description: "Bodega", classification: "Industrial", quality: "Económica", area: 80, age: 10, usefulLife: 50 };
  const both: CostCalculationDto = {
    ...arandas,
    types: [arandasType, bodega],
    constructions: [...arandas.constructions, { ...arandas.constructions[0], ...bodega, unitReplacementCost: 9000 }],
  };
  const withBoth = withConstructionTables(section, both);
  const rowsOf = (current: AppSection, index: number) => (ensureTableV2(current.blocks[0].apartados[0].tables[index]).rows.length);
  assert.equal(rowsOf(withBoth, 0), 2);

  // The server drops the cost row of a deleted type: T-2 leaves the section table and the cost page.
  const withoutBodega: CostCalculationDto = { ...both, types: [arandasType], constructions: arandas.constructions };
  const afterDelete = withConstructionTables(withBoth, withoutBodega);
  assert.deepEqual(printed(afterDelete.blocks[0].apartados[0].tables[0]).rows.map((row) => row[0]), ["T-1"]);
  const computed = compute(withoutBodega);
  const constructions = costDocumentBlocks(withoutBodega, computed.result, computed.trace)[0].apartados[1];
  assert.deepEqual(constructions.tables.map((table) => printed(table).rows.map((row) => row[0])), [["T-1"], ["T-1"]]);

  // The last type deleted and the installations removed: the tables are emptied, not left as they were.
  const nothing: CostCalculationDto = { ...arandas, types: [], constructions: [], installations: [] };
  const emptied = withConstructionTables(afterDelete, nothing);
  assert.equal(rowsOf(emptied, 0), 0);
  assert.equal(rowsOf(emptied, 1), 0);
});

test("removing a row from the cost calculation keeps the type described in its section but takes it off the cost page", () => {
  const bodega = { ref: "T-2", description: "Bodega", classification: "Industrial", quality: "Económica", area: 80, age: 10, usefulLife: 50 };
  // T-2 is a type of the section the cost approach does not pick.
  const picked: CostCalculationDto = { ...arandas, types: [arandasType, bodega] };
  const computed = compute(picked);
  const constructions = costDocumentBlocks(picked, computed.result, computed.trace)[0].apartados[1];
  assert.deepEqual(printed(constructions.tables[0]).rows.map((row) => row[0]), ["T-1"]);
  assert.equal(computed.result.constructions, 6530000, "V33 as Arandas");
  const section = withConstructionTables(constructionSection([
    templateTable("construccion_tipos", ["Tipo", "Tipo", "Clasificación", "Calidad", "Conservación", "Edad", "VUT", "VUR", "Sup. (m²)", "Descripción"]),
  ]), picked);
  assert.deepEqual(printed(section.blocks[0].apartados[0].tables[0]).rows.map((row) => row[0]), ["T-1", "T-2"]);
});

test("the cost page prints the factor the appraiser typed in place of the formula, in the column where the panel captures it", () => {
  const typed: CostCalculationDto = {
    ...arandas,
    land: { ...arandas.land, surfaceFactor: 1.1 },
    constructions: [{ ...arandas.constructions[0], ageFactor: 0.9, completion: 0.75, undivided: 0.5 }],
    installations: arandas.installations.map((row, index) => (index === 0 ? { ...row, otherFactor: 0.8, resultantFactor: 0.5 } : row)),
  };
  const { result, trace } = compute(typed);
  const [land, constructions, installations] = costDocumentBlocks(typed, result, trace)[0].apartados;
  assert.equal(printed(land.tables[0]).rows[0][5], "1.10", "Sup.");
  assert.equal(printed(land.tables[0]).rows[0][9], "1.10", "FRe");
  const [types, values] = constructions.tables.map(printed);
  // Cons., Edad, Otro, FRe, then Grado de terminación and Indiviso as percentages.
  assert.deepEqual(types.rows[0].slice(6), ["0.98", "0.90", "1.00", "0.88", "75%", "50%"]);
  // 0.98 × 0.9 × 14,361.99 = 12,667.28 $/m²; × 467.27 m² × 75 % × 50 %.
  assert.deepEqual(values.rows[0].slice(5), ["0.88", "$ 12,667.28", "$ 2,219,639.13"]);
  const items = printed(installations.tables[0]);
  assert.deepEqual(items.rows[0].slice(8, 12), ["0.98", "0.98", "0.80", "0.50"]);
});
