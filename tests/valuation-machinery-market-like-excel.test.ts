/**
 * The machinery market as the real estate markets since PR #175 (26 Nov 2026:
 * every change applies to every approach): one structure in the block of the
 * dictamen in the order of the book's sheet «V. ENF. MERCADO», the factors as
 * the homologation's columns, the data of the offers as linked columns with
 * one name, editable statistics, the additional amount and the justification,
 * and the layout step that brings valuations already worked. Invented data.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { generatedTable, figureColumn } from "../src/features/valuations/calculation/generated-content";
import { applyTableLayout, layoutOf } from "../src/features/valuations/calculation/generated-table-layout";
import {
  MACHINERY_HOMOLOGATION_COLUMNS,
  machineryCaptureRows,
  machineryFactorColumnId,
  machineryMarketBlocks,
  machineryMarketTableId,
} from "../src/features/valuations/calculation/machinery-document";
import {
  machineryColumnField,
  machineryFieldLabel,
  machineryLinkableFields,
  withMachineryFieldLabel,
  withMachineryLinkedColumn,
} from "../src/features/valuations/calculation/machinery-market-columns";
import { machineryInputSchema } from "../src/features/valuations/calculation/machinery-schemas";
import {

  DEFAULT_MACHINERY_MARKET,
  EMPTY_MACHINERY_ITEM,
  emptyOffer,
  machineryFactorColumns,
  toMachineryMarketEngineInput,
  type MachineryMarketDto,
  type MachineryOfferDto,
} from "../src/features/valuations/calculation/machinery-types";
import { isRenamableGeneratedTitle } from "../src/features/valuations/calculation/market-document";
import { offerFromListing } from "../src/features/valuations/comparable-search/machinery-offers";
import { computeMachineryMarket } from "../src/features/valuations/engine/machinery";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { LAYOUT_STEPS, LAYOUT_VERSION, refreshDocumentLayout, revertLayoutRefresh } from "../src/features/valuations/services/layout-refresh";
import { ensureTableV2 } from "../src/features/valuations/services/table";

const subject = { ...EMPTY_MACHINERY_ITEM, name: "Montacargas de prueba", brand: "Marca Uno", model: "MX-1", year: "2015", hours: "4,000", age: 10, usefulLife: 20 };

const offer = (index: number, row: Partial<MachineryOfferDto>): MachineryOfferDto =>
  ({ ...emptyOffer(index), description: "Montacargas", brand: "Marca Uno", age: 0, rating: 10, ...row });

/**
 * Two offers whose values are worked out by hand: at age 0 and rating 10 the
 * age factor is 1. C1: 100,000 × (1 + 0.05 + 0.05) = 110,000 × FCo 0.9 = 99,000.
 * C2: 200,000 × FCo 0.5 = 100,000. Median and mean 99,500.
 */
const market: MachineryMarketDto = {
  ...DEFAULT_MACHINERY_MARKET,
  usefulLife: 10,
  rounding: null,
  offers: [
    offer(0, { model: "MX-2", price: 100000, fees: 0.05, installation: 0.05, conservation: 0.9, contact: "Persona Inventada", email: "ventas@ejemplo.test" }),
    offer(1, { model: "MX-3", price: 200000, conservation: 0.5 }),
  ],
};

function valueOf(dto: MachineryMarketDto) {
  const input = toMachineryMarketEngineInput(dto);
  assert.ok(input.ok);
  return computeMachineryMarket(input.input);
}

const tableIn = (block: Block, name: Parameters<typeof machineryMarketTableId>[0]) => {
  const table = block.apartados.flatMap((apartado) => apartado.tables).find((item) => item.id === machineryMarketTableId(name));
  return table ? ensureTableV2(table) : null;
};
const texts = (table: ReturnType<typeof tableIn>) => table!.rows.map((row) => table!.columns.map((column) => {
  const cell = row.cells[column.id];
  return cell?.kind === "value" ? cell.value : "";
}));

test("the book's four factors give the same values whether the market names them or not", () => {
  const result = valueOf(market);
  assert.deepEqual(result.offers.map((row) => Math.round(row.value)), [99000, 100000]);
  assert.equal(result.median, 99500);
  const named = valueOf({ ...market, factorColumns: [{ key: "conservation", label: "FCo" }, { key: "maintenance", label: "FMt" }, { key: "technological", label: "FOt" }, { key: "economic", label: "FOe" }] });
  assert.deepEqual(named.offers.map((row) => row.value), result.offers.map((row) => row.value));
});

test("a factor is a column: taken out it counts as 1, added it multiplies the FRe, and the values follow", () => {
  // Without FCo: 110,000 and 200,000, median 155,000.
  const withoutConservation = valueOf({ ...market, factorColumns: machineryFactorColumns(market).filter((column) => column.key !== "conservation") });
  assert.deepEqual(withoutConservation.offers.map((row) => Math.round(row.value)), [110000, 200000]);
  assert.equal(withoutConservation.median, 155000);
  // An added «Factor de marca» of 0.8 on C1: 99,000 × 0.8 = 79,200; median (79,200 + 100,000) / 2 = 89,600.
  const added = { ...market, factorColumns: [...machineryFactorColumns(market), { key: "xmarca", label: "Factor de marca" }], offers: [{ ...market.offers[0], extraFactors: { xmarca: 0.8 } }, market.offers[1]] };
  const result = valueOf(added);
  assert.deepEqual(result.offers.map((row) => Math.round(row.value)), [79200, 100000]);
  assert.equal(Math.round(result.median), 89600);
  assert.ok(result.trace.steps.some((step) => step.formula.includes("Factor de marca")), "the memory names it");

  const [block] = machineryMarketBlocks(added, subject, result);
  const homologation = tableIn(block, "homologacion")!;
  const ids = homologation.columns.map((column) => column.id);
  // The book's columns keep their places; the added one has its own id, so the appraiser's layout stays on each.
  assert.deepEqual(ids, ["col-1", "col-2", "col-3", "col-4", "col-5", "col-6", "col-7", "col-8", "col-9", "col-10", "col-11", machineryFactorColumnId("xmarca"), "col-12", "col-13"]);
  assert.equal(homologation.columns.find((column) => column.id === machineryFactorColumnId("xmarca"))?.name, "Factor de marca");
  assert.deepEqual(texts(homologation)[0].slice(11, 13), ["0.80", "0.72"]);
  const removed = machineryMarketBlocks({ ...market, factorColumns: machineryFactorColumns(market).filter((column) => column.key !== "conservation") }, subject, withoutConservation);
  const without = tableIn(removed[0], "homologacion")!.columns.map((column) => column.id);
  assert.equal(without.includes("col-8"), false);
  assert.ok(without.includes(MACHINERY_HOMOLOGATION_COLUMNS.resultant) && without.includes(MACHINERY_HOMOLOGATION_COLUMNS.value));
});

test("the additional amount goes on the rounded median and prints over the value", () => {
  // ROUND(99,500, −3) = 100,000, plus 500.
  const dto = { ...market, rounding: -3 as const, additionalAmount: 500 };
  const result = valueOf(dto);
  assert.equal(result.value, 100500);
  const homologation = tableIn(machineryMarketBlocks(dto, subject, result)[0], "homologacion")!;
  const box = homologation.schema?.summaryBoxes?.find((item) => item.id === "valor");
  assert.deepEqual(box?.rows.map((row) => row.label), ["Monto adicional a considerar:", "VALOR COMPARATIVO DE MERCADO:", "Cifra en letras:"]);
  assert.equal(valueOf({ ...market, rounding: -3 }).value, 100000, "none by default, as the book");
});

test("in the editor the structure is there with no offers, in the book's order, the offer level without a mark", () => {
  assert.deepEqual(machineryMarketBlocks(DEFAULT_MACHINERY_MARKET, subject, null), [], "the dictamen prints nothing yet");
  const [block] = machineryMarketBlocks(DEFAULT_MACHINERY_MARKET, subject, null, { capture: true });
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), [
    "BIENES SIMILARES EN VENTA", "DATOS DE COMPARABLES", "CARACTERÍSTICAS TÉCNICAS", "CÁLCULO DE V.N.R. HOMOLOGADO",
  ]);
  assert.ok(texts(tableIn(block, "oferta")).flat().every((value) => value !== "( X )"));
  assert.deepEqual(tableIn(block, "homologacion")!.columns.map((column) => column.name).slice(6), ["FEd", "FCo", "FMt", "FOt", "FOe", "FRe", "V.N.R. Unitario Instalado"]);
  assert.equal(isRenamableGeneratedTitle(block.id), true, "its name is the appraiser's, as a real estate market's");
});

test("the capture places each datum in its row: offers in the summary, the age and the life in the characteristics", () => {
  const dto = { ...market, characteristics: [{ label: "Cabina", subject: "Cerrada", values: ["Abierta", "Cerrada"] }] };
  const [block] = machineryMarketBlocks(dto, subject, valueOf(dto), { capture: true });
  const rows = machineryCaptureRows(dto);
  const characteristics = tableIn(block, "caracteristicas")!;
  const labelOf = (rowId: string) => {
    const row = characteristics.rows.find((item) => item.id === rowId)!;
    const cell = row.cells["col-1"];
    return cell?.kind === "value" ? cell.value : "";
  };
  assert.equal(labelOf(rows.characteristics.free[0]), "Cabina");
  assert.equal(labelOf(rows.characteristics.age), "Edad");
  assert.equal(labelOf(rows.characteristics.usefulLife), "V.U.T.");
  assert.deepEqual(tableIn(block, "resumen")!.rows.map((row) => row.id), rows.resumen);
  assert.deepEqual(tableIn(block, "homologacion")!.rows.map((row) => row.id), rows.homologacion);
});

test("a datum has one name: renamed in a column, its row and its card read it; linked, it is a column of the table", () => {
  const labels = withMachineryFieldLabel(null, "brand", "Fabricante");
  const named = { ...market, fieldLabels: labels };
  const [block] = machineryMarketBlocks(named, subject, valueOf(named));
  assert.equal(tableIn(block, "resumen")!.columns.find((column) => column.id === "col-3")?.name, "Fabricante");
  assert.equal(texts(tableIn(block, "caracteristicas"))[0][0], "Fabricante", "the row of the characteristics");
  assert.equal(machineryFieldLabel(named, "brand"), "Fabricante", "the card");
  assert.deepEqual(withMachineryFieldLabel(labels, "brand", "marca"), {}, "the book's name takes the appraiser's out");
  assert.equal(machineryFieldLabel(market, "hours", { vehicle: true }), "Kms");

  const linked = { ...market, linkedColumns: withMachineryLinkedColumn(null, "homologacion", "email", true) };
  const homologation = tableIn(machineryMarketBlocks(linked, subject, valueOf(linked))[0], "homologacion")!;
  assert.equal(homologation.columns.at(-1)?.id, "campo-email");
  assert.equal(texts(homologation)[0].at(-1), "ventas@ejemplo.test");
  assert.equal(machineryColumnField(linked, "homologacion", "campo-email"), "email");
  assert.equal(machineryColumnField(linked, "resumen", "col-3"), "brand");
  assert.equal(machineryColumnField(linked, "homologacion", "col-7"), null, "FEd is the calculation's");
  assert.equal(machineryLinkableFields(linked, "homologacion").find((field) => field.key === "email")?.linked, true);
  assert.equal(machineryLinkableFields(linked, "homologacion").some((field) => field.key === "price"), false, "not one the table already shows");
});

test("the statistics are a table: the book's mean and median by default, and the appraiser chooses, renames and adds", () => {
  const result = valueOf(market);
  const boxOf = (dto: MachineryMarketDto) => tableIn(machineryMarketBlocks(dto, subject, result)[0], "homologacion")!.schema?.summaryBoxes?.find((box) => box.id === "valores")?.rows.map((row) => [row.label, row.value]);
  assert.deepEqual(boxOf(market), [["Valor Prom. Homologado:", "$ 99,500.00"], ["Mediana:", "$ 99,500.00"]]);
  const chosen = boxOf({
    ...market,
    printedStatistics: {
      order: ["max", "median", "custom:propio"], hidden: [],
      labels: { max: "Máximo" },
      extra: [{ id: "custom:propio", label: "Mediana menos 5 %", kind: "formula", formula: "=MEDIANA*0.95" }],
    },
  });
  assert.deepEqual(chosen?.slice(0, 3), [["Máximo:", "$ 100,000.00"], ["Mediana homologada:", "$ 99,500.00"], ["Mediana menos 5 %:", "$ 94,525.00"]]);
});

test("the API takes the new captures and refuses a factor that is not one, or one twice", () => {
  const payload = (extra: Partial<MachineryMarketDto>) => ({ market: { ...market, ...extra } });
  assert.equal(machineryInputSchema.safeParse(payload({
    factorColumns: [{ key: "maintenance", label: "Mant." }, { key: "xabc", label: "Otro" }],
    fieldLabels: { brand: "Fabricante" }, linkedColumns: { resumen: ["email"] },
    offerLabels: ["ALTA", "BAJA"], offerMark: 1, additionalAmount: 1000, justification: "Por su estado.",
    printedStatistics: { order: ["mean"], hidden: [] },
  })).success, true);
  assert.equal(machineryInputSchema.safeParse(payload({ factorColumns: [{ key: "otro", label: "X" }] })).success, false);
  assert.equal(machineryInputSchema.safeParse(payload({ factorColumns: [{ key: "xabc", label: "A" }, { key: "xabc", label: "B" }] })).success, false);
  assert.equal(machineryInputSchema.safeParse(payload({ fieldLabels: { inventado: "X" } })).success, false);
});

test("an offer of the AI search keeps the number of its card, and the summary prints it beside the reference", () => {
  const found = offerFromListing({ title: "Montacargas", price: 150000, currency: "MXN", listingDate: null, contactName: null, agency: null, portal: "Portal", contactPhone: null, url: "https://ejemplo.test/1", neighborhood: null, municipality: null, state: null, reference: null, notes: null }, 91, 0);
  assert.equal(found.folio, 91);
  const dto = { ...market, offers: [{ ...found, ...offer(0, { price: 150000, conservation: 1 }), folio: 91 }] };
  const summary = tableIn(machineryMarketBlocks(dto, subject, valueOf(dto))[0], "resumen")!;
  assert.deepEqual(summary.columns.slice(0, 2).map((column) => column.name), ["REF.", "ID"]);
  assert.equal(texts(summary)[0][1], "C-00091");
  assert.equal(tableIn(machineryMarketBlocks(market, subject, valueOf(market))[0], "resumen")!.columns.some((column) => column.id === "col-folio"), false, "none without a card");
});

test("layout step 3 fits the machinery market's columns, once, and «Deshacer» gives the widths back", () => {
  const table = applyTableLayout(generatedTable(machineryMarketTableId("homologacion"), "V.N.R. homologado", [figureColumn("REF."), figureColumn("FCo")], [["C1", "0.90"]]), { widths: { "col-2": 160 } });
  const section: AppSection = {
    id: "mercadoVenta", label: "VI", title: "MERCADO", sourceFile: "", enabled: true, required: false,
    blocks: [{ id: "motor-maquinaria-mercado", title: "ENFOQUE", sectionLabel: "", enabled: true, required: false, concepts: [], tables: [], images: [], apartados: [{ id: "h", title: "H", enabled: true, concepts: [], images: [], tables: [table as TableContent] }] }],
  };
  const step = LAYOUT_STEPS.find((item) => item.id === "machinery-market-tables")!;
  assert.equal(step.version, 3);
  assert.ok(LAYOUT_VERSION >= step.version);
  const { sections, changes } = refreshDocumentLayout([section], [step]);
  assert.equal(changes.length, 1);
  assert.equal(layoutOf(sections[0].blocks[0].apartados[0].tables[0]).widths, undefined);
  assert.equal(refreshDocumentLayout(sections, [step]).changes.length, 0, "idempotent");
  assert.deepEqual(layoutOf(revertLayoutRefresh(sections, changes)[0].blocks[0].apartados[0].tables[0]).widths, { "col-2": 160 });
});
