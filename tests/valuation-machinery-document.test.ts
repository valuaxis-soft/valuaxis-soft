/**
 * Machinery and equipment (MEH): the capture against the engine and the pages
 * of the dictamen, with the example of the firm's book.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { machineryInputSchema } from "../src/features/valuations/calculation/machinery-schemas";
import { isMachineryCostBlock, isMachineryMarketBlock, machineryCostBlocks, machineryMarketBlocks } from "../src/features/valuations/calculation/machinery-document";
import {
  DEFAULT_MACHINERY_COST,
  DEFAULT_MACHINERY_MARKET,
  MACHINERY_CONSERVATION_TWICE,
  alignedCharacteristics,
  emptyOffer,
  isMachineryPropertyKind,
  toMachineryCostEngineInput,
  toMachineryMarketEngineInput,
  type MachineryCostDto,
  type MachineryMarketDto,
} from "../src/features/valuations/calculation/machinery-types";
import { COST_TEMPLATE_BLOCK_IDS } from "../src/features/valuations/calculation/cost-document";
import { isGeneratedBlock, replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { PENDING_DECISIONS } from "../src/features/valuations/engine/config";
import { computeMachineryCost, computeMachineryMarket } from "../src/features/valuations/engine/machinery";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { contentMoveRulesForSection } from "../src/features/valuations/services/content-move-rules";
import { ensureTableV2, getTableHeaderLayout } from "../src/features/valuations/services/table";
import { workbookCost, workbookMarket } from "./machinery-workbook.fixture";

function costResult(cost: MachineryCostDto) {
  const input = toMachineryCostEngineInput(cost);
  assert.ok(input.ok);
  return computeMachineryCost(input.input);
}

function marketResult(market: MachineryMarketDto) {
  const input = toMachineryMarketEngineInput(market);
  assert.ok(input.ok);
  return computeMachineryMarket(input.input);
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
    boxes: Object.fromEntries((v2.schema?.summaryBoxes ?? []).map((box) => [box.id, box.rows.map((row) => [row.label, row.value])])),
  };
}
const tableOf = (block: Block, id: string) => {
  const table = block.apartados.flatMap((apartado) => apartado.tables).find((item) => item.id === id);
  assert.ok(table, `table ${id}`);
  return printed(table);
};

test("the capture of the book gives the book's values through the engine", () => {
  const cost = costResult(workbookCost);
  assert.ok(Math.abs(cost.item.value - 740788.9020491218) < 1e-6, "W42");
  assert.ok(Math.abs(cost.attachmentsTotal - 192389.25) < 1e-6, "V59");
  assert.equal(cost.physicalValue, 933000);
  assert.equal(costResult({ ...workbookCost, conservationTwice: false }).physicalValue, 952000);
  const market = marketResult(workbookMarket);
  assert.ok(Math.abs(market.median - 978738.7347164522) < 1e-6, "AI89");
  assert.equal(market.value, 980000);
});

test("the starting capture follows the pending setting and the book's roundings, which the appraiser can change", () => {
  assert.equal(DEFAULT_MACHINERY_COST.conservationTwice, MACHINERY_CONSERVATION_TWICE);
  assert.ok(PENDING_DECISIONS.some((decision) => decision.setting === "machinery.conservationTwice"), "question 3 is still open");
  assert.deepEqual([DEFAULT_MACHINERY_COST.rounding, DEFAULT_MACHINERY_MARKET.rounding], [-3, -4]);
  assert.ok(Math.abs(costResult({ ...workbookCost, rounding: null }).physicalValue - 933178.1520491218) < 1e-6);
  assert.equal(costResult({ ...workbookCost, rounding: -4 }).physicalValue, 930000);
  assert.equal(marketResult({ ...workbookMarket, rounding: -3 }).value, 979000);
});

test("incomplete captures do not compute and say what is missing", () => {
  const reason = (cost: MachineryCostDto) => {
    const input = toMachineryCostEngineInput(cost);
    return input.ok ? null : input.reason;
  };
  assert.match(reason(DEFAULT_MACHINERY_COST) ?? "", /cotización/);
  assert.match(reason({ ...workbookCost, item: { ...workbookCost.item, usefulLife: null } }) ?? "", /vida útil/);
  assert.match(reason({ ...workbookCost, item: { ...workbookCost.item, rating: null } }) ?? "", /calificación/);
  // An attachment still being written stays out; the item is computed.
  const partial = { ...workbookCost, attachments: [workbookCost.attachments[0], { ...workbookCost.attachments[1], usefulLife: null }] };
  assert.equal(costResult(partial).attachments.length, 1);

  assert.equal(toMachineryMarketEngineInput(DEFAULT_MACHINERY_MARKET).ok, false);
  assert.equal(toMachineryMarketEngineInput({ ...workbookMarket, usefulLife: null }).ok, false);
  // An offer with its own useful life needs no shared one, and an age past it takes age + 1.
  const own = marketResult({ ...workbookMarket, usefulLife: null, offers: [{ ...workbookMarket.offers[0], usefulLife: 8 }] });
  assert.ok(Math.abs(own.offers[0].ageFactor - (1 - (8 / 9) ** 1.4) * 0.975) < 1e-12);
});

test("the API accepts the capture with free factors and useful lives, and rejects typing slips", () => {
  const accepts = (input: unknown) => machineryInputSchema.safeParse(input).success;
  assert.equal(accepts({ cost: workbookCost, market: workbookMarket }), true);
  assert.equal(accepts({ cost: { ...workbookCost, item: { ...workbookCost.item, conservation: 1.2, usefulLife: 3, age: 40 } } }), true);
  assert.equal(accepts({}), false);
  assert.equal(accepts({ cost: { ...workbookCost, item: { ...workbookCost.item, rating: 7.5 } } }), false);
  assert.equal(accepts({ cost: { ...workbookCost, item: { ...workbookCost.item, maintenance: -0.5 } } }), false);
  assert.equal(accepts({ cost: { ...workbookCost, rounding: 0.5 } }), false);
  assert.equal(accepts({ market: { ...workbookMarket, offers: [{ ...emptyOffer(0), ref: "C 1" }] } }), false);
  assert.equal(accepts({ market: { ...workbookMarket, offers: [emptyOffer(0), emptyOffer(0)] } }), false);
  assert.equal(isMachineryPropertyKind("maquinaria_equipo"), true);
  assert.equal(isMachineryPropertyKind("casa_habitacion"), false);
  assert.equal(isMachineryPropertyKind(undefined), false);
});

test("the cost page follows the book's sheet: identification, V.R.N., expenses, depreciation, attachments and the physical value", () => {
  const blocks = machineryCostBlocks(workbookCost, costResult(workbookCost));
  assert.deepEqual(blocks.map((block) => [block.id, block.title]), [["motor-maquinaria-costos", "ENFOQUE FÍSICO O DE COSTOS"]]);
  const [block] = blocks;
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), [
    "IDENTIFICACIÓN DEL BIEN", "V.R.N. UNITARIO DEL BIEN", "V.R.N. INSTALADO DEL BIEN", "V.N.R. UNITARIO INSTALADO DEL BIEN",
    "V.N.R. UNITARIO DE PIEZAS ESPECIALES / ADITAMENTOS",
  ]);

  assert.deepEqual(tableOf(block, "motor-maquinaria-costos-tabla-identificacion").rows, [
    ["Retroexcavadora hidráulica", "Caterpillar", "416E", "IGRIEK598GRED9494", "KEDJOI99FWWQDG6559", "JJD598F"],
  ]);
  assert.deepEqual(tableOf(block, "motor-maquinaria-costos-tabla-cotizacion").rows, [["( X )", "(   )", "(   )", "(   )"]]);
  assert.deepEqual(tableOf(block, "motor-maquinaria-costos-tabla-vrn-unitario").rows, [[
    "Caterpillar México", "34 559 9900", "Estados Unidos", "$ 65,000.00", "17.6500", "15/Diciembre/26", "$ 1,147,250.00", "1.00", "$ 1,147,250.00",
  ]]);
  assert.deepEqual(tableOf(block, "motor-maquinaria-costos-tabla-vrn-instalado").rows, [
    ["1%", "2%", "1%", "3%", "2%", "0%", "9%", "$ 1,250,502.50"],
    ["$ 11,472.50", "$ 22,945.00", "$ 11,472.50", "$ 34,417.50", "$ 22,945.00", "$ 0.00", "$ 103,252.50", ""],
  ]);

  const depreciation = tableOf(block, "motor-maquinaria-costos-tabla-vnr");
  assert.deepEqual(depreciation.groups, [["Factores de Depreciación", 6]]);
  assert.deepEqual(depreciation.columns, [
    "Tipo de Mantenimiento", "Edad", "Vida Útil Total", "Factor Edad FEd", "Conservación FCo", "Mantenimiento FMt",
    "Obsolescencia Tecnofuncional FOt", "Obsolescencia Económica FOe", "FRe", "V.N.R. Unitario Instalado",
  ]);
  assert.deepEqual(depreciation.rows, [["Cada 6 meses", "14", "30", "0.64", "0.98", "0.95", "1.00", "1.00", "0.59", "$ 740,788.90"]]);
  assert.deepEqual(depreciation.boxes.vnr, [["Valor Neto de Reposición del Bien (V.N.R.):", "$ 740,788.90"]]);

  assert.deepEqual(tableOf(block, "motor-maquinaria-costos-tabla-aditamentos").rows, [
    ["1", "Cucharón de 1 m3", "Caterpillar", "Caterpillar", "www.catmaq.c", "$ 117,000.00", "Nuevo Igual"],
    ["2", "Martillo Hidráulico de 12 HP", "Caterpillar", "Maq. Hdez.", "www.maqhdz.c", "$ 185,000.00", "Usado Igual"],
  ]);
  const attachments = tableOf(block, "motor-maquinaria-costos-tabla-aditamentos-vnr");
  assert.deepEqual(attachments.rows, [
    ["1", "5%", "3%", "1%", "9%", "$ 127,530.00", "10", "20", "10", "0.50", "0.95", "1.00", "1.00", "1.00", "0.48", "$ 60,576.75"],
    ["2", "0%", "0%", "0%", "0%", "$ 185,000.00", "5", "20", "15", "0.75", "0.95", "1.00", "1.00", "1.00", "0.71", "$ 131,812.50"],
  ]);
  assert.deepEqual(attachments.boxes, {
    aditamentos: [["Total V.N.R. de Piezas Especiales / Aditamentos:", "$ 192,389.25"]],
    valor: [["VALOR FÍSICO DEL BIEN V.N.R.:", "$ 933,000.00"], ["Cifra en letras:", "( NOVECIENTOS TREINTA Y TRES MIL PESOS 00/100 M. N.)"]],
  });
});

test("with the conservation applied once the item shows no FCo, and without attachments the value closes the depreciation table", () => {
  const cost = { ...workbookCost, conservationTwice: false, attachments: [] };
  const [block] = machineryCostBlocks(cost, costResult(cost));
  assert.equal(block.apartados.length, 4);
  const depreciation = tableOf(block, "motor-maquinaria-costos-tabla-vnr");
  assert.deepEqual(depreciation.groups, [["Factores de Depreciación", 5]]);
  assert.equal(depreciation.columns.includes("Conservación FCo"), false);
  assert.deepEqual(depreciation.rows, [["Cada 6 meses", "14", "30", "0.64", "0.95", "1.00", "1.00", "0.61", "$ 759,783.49"]]);
  assert.deepEqual(depreciation.boxes.valor[0], ["VALOR FÍSICO DEL BIEN V.N.R.:", "$ 760,000.00"]);
  // No page while the item cannot be computed.
  assert.deepEqual(machineryCostBlocks(DEFAULT_MACHINERY_COST, null), []);
});

test("the market page follows the book's sheet: offer level, comparables, characteristics against the subject, and the homologation", () => {
  const blocks = machineryMarketBlocks(workbookMarket, workbookCost.item, marketResult(workbookMarket));
  assert.deepEqual(blocks.map((block) => [block.id, block.title]), [["motor-maquinaria-mercado", "ENFOQUE COMPARATIVO DE MERCADO"]]);
  const [block] = blocks;
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), [
    "BIENES SIMILARES EN VENTA", "DATOS DE COMPARABLES", "CARACTERÍSTICAS TÉCNICAS", "CÁLCULO DE V.N.R. HOMOLOGADO",
  ]);
  // The six options in two rows of three, as the sheet prints them (C15:V16).
  assert.deepEqual(tableOf(block, "motor-maquinaria-mercado-tabla-oferta").rows, [
    ["MUY ALTA", "( X )", "MEDIA", "(   )", "BAJA", "(   )"],
    ["ALTA", "(   )", "MEDIA BAJA", "(   )", "NULA", "(   )"],
  ]);
  assert.deepEqual(tableOf(block, "motor-maquinaria-mercado-tabla-resumen").rows[0], [
    "C1", "Retroexcavadora", "Caterpillar", "420F", "2018", "5480", "Cucharón frontal y retro estándar", "15/12/2026", "$ 1,680,000.00",
  ]);
  assert.equal(tableOf(block, "motor-maquinaria-mercado-tabla-contacto").rows.length, 5);

  const characteristics = tableOf(block, "motor-maquinaria-mercado-tabla-caracteristicas");
  assert.deepEqual(characteristics.columns, ["Concepto", "Sujeto", "Comparable C1", "Comparable C2", "Comparable C3", "Comparable C4", "Comparable C5"]);
  assert.deepEqual(characteristics.rows.find((row) => row[0] === "Modelo"), ["Modelo", "416E", "420F", "420F", "420F2", "420E", "420F"]);
  assert.deepEqual(characteristics.rows.find((row) => row[0] === "V.U.R."), ["V.U.R.", "16", "22", "23", "21", "20", "24"]);

  const homologation = tableOf(block, "motor-maquinaria-mercado-tabla-homologacion");
  assert.deepEqual(homologation.groups, [["Factores de Homologación", 6]]);
  assert.deepEqual(homologation.rows, [
    ["C1", "$ 1,680,000.00", "3%", "4%", "7%", "$ 1,797,600.00", "0.82", "0.90", "0.95", "1.00", "1.00", "0.70", "$ 1,263,008.52"],
    ["C2", "$ 1,890,000.00", "3%", "5%", "8%", "$ 2,041,200.00", "0.86", "0.50", "1.00", "0.95", "1.00", "0.41", "$ 834,738.42"],
    ["C3", "$ 1,520,000.00", "2%", "2%", "4%", "$ 1,580,800.00", "0.81", "0.80", "0.95", "1.00", "1.00", "0.62", "$ 978,738.73"],
    ["C4", "$ 1,310,000.00", "1%", "2%", "3%", "$ 1,349,300.00", "0.72", "0.85", "1.00", "0.90", "1.00", "0.55", "$ 745,657.13"],
    ["C5", "$ 2,050,000.00", "3%", "2%", "5%", "$ 2,152,500.00", "0.87", "0.80", "1.00", "0.80", "1.00", "0.56", "$ 1,202,046.12"],
  ]);
  assert.deepEqual(homologation.boxes, {
    valores: [["Valor Prom. Homologado:", "$ 1,004,837.78"], ["Mediana:", "$ 978,738.73"]],
    valor: [["VALOR COMPARATIVO DE MERCADO:", "$ 980,000.00"], ["Cifra en letras:", "( NOVECIENTOS OCHENTA MIL PESOS 00/100 M. N.)"]],
  });
});

test("offers still being written print their data without the homologation, and a long list keeps every offer", () => {
  const partial = { ...workbookMarket, offerLevel: null, offers: [{ ...emptyOffer(0), description: "Retroexcavadora" }] };
  const [block] = machineryMarketBlocks(partial, workbookCost.item, null);
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), ["DATOS DE COMPARABLES", "CARACTERÍSTICAS TÉCNICAS"]);
  assert.deepEqual(machineryMarketBlocks(DEFAULT_MACHINERY_MARKET, workbookCost.item, null), []);

  const many = { ...workbookMarket, offers: Array.from({ length: 30 }, (_, index) => ({ ...workbookMarket.offers[index % 5], ref: `C${index + 1}` })) };
  const [long] = machineryMarketBlocks(many, workbookCost.item, marketResult(many));
  assert.equal(tableOf(long, "motor-maquinaria-mercado-tabla-homologacion").rows.length, 30);
  assert.equal(tableOf(long, "motor-maquinaria-mercado-tabla-resumen").rows.length, 30);
});

test("the pages replace the template blocks of their section, stay locked, and regenerate in place", () => {
  const template = (id: string): Block => ({ id, title: id, sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [] });
  const section: AppSection = {
    id: "costos", label: "V", title: "ENFOQUE DE COSTOS", sourceFile: "", enabled: true, required: false,
    blocks: [template("nota-del-perito"), ...COST_TEMPLATE_BLOCK_IDS.map((id) => template(id.toLowerCase()))],
  } as AppSection;
  const blocks = machineryCostBlocks(workbookCost, costResult(workbookCost));
  const updated = replaceGeneratedBlocks(section, isMachineryCostBlock, blocks, { placeholderIds: COST_TEMPLATE_BLOCK_IDS });
  assert.deepEqual(updated.blocks.map((block) => block.id), ["nota-del-perito", "motor-maquinaria-costos"]);
  assert.equal(replaceGeneratedBlocks(updated, isMachineryCostBlock, blocks, { placeholderIds: COST_TEMPLATE_BLOCK_IDS }), updated, "unchanged results leave the section alone");

  const once = { ...workbookCost, conservationTwice: false };
  const again = replaceGeneratedBlocks(updated, isMachineryCostBlock, machineryCostBlocks(once, costResult(once)), { placeholderIds: COST_TEMPLATE_BLOCK_IDS });
  assert.deepEqual(again.blocks.map((block) => block.id), ["nota-del-perito", "motor-maquinaria-costos"]);
  assert.notEqual(again, updated);

  assert.ok(blocks.every(isGeneratedBlock));
  assert.equal(isMachineryMarketBlock(blocks[0]), false);
  assert.deepEqual([...contentMoveRulesForSection(updated).lockedBlockIds], ["motor-maquinaria-costos"]);
});

test("the free technical characteristics print in their order between the description and the lives, and never enter the calculation", () => {
  const rows = (market: MachineryMarketDto) =>
    tableOf(machineryMarketBlocks(market, workbookCost.item, marketResult(market))[0], "motor-maquinaria-mercado-tabla-caracteristicas").rows;
  const fixed = ["Marca", "Modelo", "Año", "Horas", "Ubicación", "Edad", "V.U.T.", "V.U.R.", "Precio Oferta"];
  // A capture without free rows prints the fixed ones, as before they existed.
  const before = rows(workbookMarket);
  assert.deepEqual(before.map((row) => row[0]), fixed);

  // The book's rows G62:AK62, G64:AK64 and G71:AK71.
  const market: MachineryMarketDto = {
    ...workbookMarket,
    characteristics: [
      { label: "Cabina", subject: "Cerrada", values: ["Cerrada", "Cerrada", "Cerrada", "Cerrada", "Cerrada"] },
      { label: "Kilómetros", subject: "2,145", values: ["1,325", "1,060", "1,730", "2,022", "980"] },
      { label: " Nivel de Demanda ", subject: "Alta", values: ["Alta", "", "Alta", "Alta", "Alta"] },
      { label: "  ", subject: "sin concepto", values: ["", "", "", "", ""] },
    ],
  };
  const printed = rows(market);
  assert.deepEqual(printed.map((row) => row[0]), ["Marca", "Modelo", "Año", "Horas", "Ubicación", "Cabina", "Kilómetros", "Nivel de Demanda", "Edad", "V.U.T.", "V.U.R.", "Precio Oferta"]);
  assert.deepEqual(printed[6], ["Kilómetros", "2,145", "1,325", "1,060", "1,730", "2,022", "980"]);
  assert.deepEqual(printed[7], ["Nivel de Demanda", "Alta", "Alta", "—", "Alta", "Alta", "Alta"], "an empty value prints as the other empty cells");
  assert.deepEqual(printed.filter((row) => fixed.includes(row[0])), before, "the fixed rows do not change");

  // Descriptive only: same engine input, same values.
  assert.deepEqual(toMachineryMarketEngineInput(market), toMachineryMarketEngineInput(workbookMarket));
  const { trace: _trace, ...withRows } = marketResult(market)!;
  const { trace: _other, ...without } = marketResult(workbookMarket)!;
  assert.deepEqual(withRows, without);
});

test("a free characteristic carries one value per offer, and a capture saved before they existed has none", () => {
  const row = { label: "Cabina", subject: "Cerrada", values: ["Cerrada", "Abierta", "Cerrada", "Cerrada", "Cerrada"] };
  const parse = (market: unknown) => machineryInputSchema.safeParse({ market });
  const saved = parse({ ...workbookMarket, characteristics: [{ ...row, label: "  Cabina " }] });
  assert.ok(saved.success);
  assert.deepEqual(saved.data.market?.characteristics, [row], "texts are trimmed");

  // What the editor sent before the free rows existed is still accepted.
  const { characteristics: _none, ...former } = workbookMarket;
  const old = parse(former);
  assert.ok(old.success);
  assert.deepEqual(old.data.market?.characteristics, []);

  const message = (market: unknown) => parse(market).error?.issues[0]?.message;
  assert.equal(message({ ...workbookMarket, characteristics: [{ ...row, values: ["Cerrada"] }] }), "Cada característica técnica lleva un valor por oferta.");
  assert.equal(message({ ...workbookMarket, characteristics: [{ ...row, label: " " }] }), "Cada característica técnica necesita su concepto.");
  assert.equal(parse({ ...workbookMarket, characteristics: [{ ...row, label: "x".repeat(81) }] }).success, false);
  assert.equal(parse({ ...workbookMarket, characteristics: [{ ...row, subject: "x".repeat(201) }] }).success, false);
  assert.equal(parse({ ...workbookMarket, characteristics: [{ ...row, subject: 2145 }] }).success, false);
  assert.equal(message({ ...workbookMarket, characteristics: Array.from({ length: 31 }, () => row) }), "Se capturan hasta 30 características técnicas.");

  // Stored rows are read with exactly one value per offer.
  assert.deepEqual(alignedCharacteristics(undefined, 3), []);
  assert.deepEqual(alignedCharacteristics([{ label: "Cabina" }, { label: "Km", subject: "1", values: ["a", "b", "c", "d"] }], 3), [
    { label: "Cabina", subject: "", values: ["", "", ""] },
    { label: "Km", subject: "1", values: ["a", "b", "c"] },
  ]);
});
