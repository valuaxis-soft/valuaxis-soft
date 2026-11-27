/**
 * The market sections as the appraiser's Excel (videos 8.7, 8.9, 8.10 and
 * 8.12, 26 Nov 2026): one structure in his order, the factors as the
 * homologation table's columns, columns linked to the data of the cards
 * (renamed in both directions), the statistics as a table he edits, the
 * notes of any table edited in place, and the step that brings valuations
 * already worked to this format. The comparables are invented.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTableLayout, layoutOf, sourceOf, tableNotesOf, withTableLayouts, withTableNotes } from "../src/features/valuations/calculation/generated-table-layout";
import { generatedTable, figureColumn, textColumn } from "../src/features/valuations/calculation/generated-content";
import { DEFAULT_HOMOLOGATION_NOTE, marketColumnField, marketDocumentBlocks, marketLinkTableOf, marketTableId } from "../src/features/valuations/calculation/market-document";
import { extraStatisticText, statisticFormulaValue, statisticLabel, withExtraStatistic, withStatisticLabel, withoutExtraStatistic } from "../src/features/valuations/calculation/market-statistics";
import { cardFieldLabel, linkableCardFields, linkedColumnId, withCardFieldLabel, withLinkedColumn } from "../src/features/valuations/calculation/market-table-columns";
import { defaultMarketSettings, homologatesOf, printedStatisticsOf, toMarketEngineInput, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { marketSettingsSchema } from "../src/features/valuations/calculation/market-schemas";
import { kindLayersOf, layerVisibility, visibleKindPins } from "../src/features/maps/base-map/layers";
import { readsAsHomologation } from "../src/features/valuations/components/editor/table-notes-editor";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { LAYOUT_STEPS, refreshDocumentLayout, revertLayoutRefresh } from "../src/features/valuations/services/layout-refresh";
import { createHomologationTable, ensureTableV2 } from "../src/features/valuations/services/table";

function comparable(reference: number, area: number, price: number, patch: Partial<ComparableDto> = {}): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Calle Inventada ${reference}`, area, price, folio: 90 + reference,
    landUse: "AU/H2", shape: "Regular", zone: null, frontage: 12, depth: 34, topography: null, services: null, notes: null,
    sourceName: `Portal ${reference}`, contactName: `Contacto ${reference}`, contactPhone: `33 0000 000${reference}`, url: null, offerDate: "2026-10-08",
    photos: [], bedrooms: 3,
    factors: [{ type: "NEGOCIACION", value: 0.95, subjectRating: null, comparableRating: null, justification: null }],
    ...patch,
  };
}

const market = (patch: Partial<MarketCalculationDto["settings"]> = {}, comparables = [comparable(1, 408, 3_721_900), comparable(2, 450, 5_500_000), comparable(3, 354, 4_600_000), comparable(4, 420, 3_990_000)]): MarketCalculationDto => ({
  settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 360, surfacePower: 6, ...patch },
  comparables,
  locked: false,
});

function pages(calculation: MarketCalculationDto, options: { capture?: boolean; advertiserData?: boolean } = {}) {
  const input = toMarketEngineInput(calculation);
  const result = input.ok ? computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG) : null;
  return marketDocumentBlocks(calculation, result, options);
}

const tables = (blocks: Block[]) => blocks.flatMap((block) => block.apartados.flatMap((apartado) => apartado.tables));
const tableOf = (blocks: Block[], id: string) => ensureTableV2(tables(blocks).find((table) => table.id === id)!);
const headers = (blocks: Block[], id: string) => tableOf(blocks, id).columns.map((column) => column.name);
const column = (blocks: Block[], id: string, name: string) => {
  const table = tableOf(blocks, id);
  const at = table.columns.find((item) => item.name === name)!;
  return table.rows.map((row) => (row.cells[at.id] as { value: string }).value);
};

test("V8.10: the market is one structure in the order of the Excel, also while it has no comparables", () => {
  const capture = pages(market(), { capture: true });
  assert.equal(capture.length, 1);
  assert.deepEqual(capture[0].apartados.map((apartado) => apartado.id.replace(/^.*-enfoque-/, "")), ["oferta", "datos", "homologacion"]);
  assert.deepEqual(tables(capture).map((table) => table.title), ["Nivel de oferta", "Comparables", "Datos de la oferta", "Homologación"]);
  assert.deepEqual(headers(capture, marketTableId("TERRENO_VENTA", "caracteristicas")), ["REF.", "ID", "UBICACIÓN", "USO DE SUELO", "CARACTERÍSTICAS"]);
  assert.deepEqual(column(capture, marketTableId("TERRENO_VENTA", "caracteristicas"), "ID"), ["C-00091", "C-00092", "C-00093", "C-00094"]);
  // Source, phone, contact and date apart, named as the card names them (video 8.9, 03:20).
  assert.deepEqual(headers(capture, marketTableId("TERRENO_VENTA", "ofertas")).slice(0, 5), ["REF.", "FUENTE O PORTAL", "TELÉFONO", "CONTACTO", "FECHA DE LA OFERTA"]);
  assert.deepEqual(column(capture, marketTableId("TERRENO_VENTA", "ofertas"), "TELÉFONO")[0], "33 0000 0001", "the editor sees the phone of the card");
  // The dictamen prints the advertiser only when the carátula says so (matrix 1.5 bis).
  assert.equal(column(pages(market()), marketTableId("TERRENO_VENTA", "ofertas"), "TELÉFONO")[0], "—");
  assert.equal(column(pages(market(), { advertiserData: true }), marketTableId("TERRENO_VENTA", "ofertas"), "CONTACTO")[0], "Contacto 1");
  // The place ids of the columns stay (what the appraiser set on them follows them): the contact has one of its own.
  assert.deepEqual(tableOf(capture, marketTableId("TERRENO_VENTA", "ofertas")).columns.map((item) => item.id), ["col-1", "col-2", "col-3", "col-contacto", "col-4", "col-5", "col-6", "col-7"]);
  assert.deepEqual(tableOf(capture, marketTableId("TERRENO_VENTA", "caracteristicas")).columns.map((item) => item.id), ["col-1", "col-folio", "col-2", "col-3", "col-4"]);

  // Without comparables, the editor keeps the structure (video 8.7: «que sí se vea la estructura siempre»); the dictamen prints nothing yet.
  const empty = market({}, []);
  assert.equal(pages(empty).length, 0);
  const structure = pages(empty, { capture: true });
  assert.deepEqual(tables(structure).map((table) => table.title), ["Nivel de oferta", "Comparables", "Datos de la oferta", "Homologación"]);
  assert.equal(tableOf(structure, marketTableId("TERRENO_VENTA", "homologacion")).rows.length, 0);
});

test("V8.10 (03:25): «Homologar» is gone; the factors are the homologation table's columns and FRe multiplies them", () => {
  const calculation = market({ homologate: false });
  assert.equal(homologatesOf(calculation.settings), true);
  const homologation = tableOf(pages(calculation), marketTableId("TERRENO_VENTA", "homologacion"));
  const names = homologation.columns.map((item) => item.name);
  assert.deepEqual(names.slice(4, 4 + calculation.settings.factorSlots.length + 1), ["Neg.", "Ubic.", "Sup.", "Zona", "Frente", "Uso", "FRe"]);
  // A factor renamed is the factor's name everywhere: its column prints it.
  const renamed = market({ factorSlots: calculation.settings.factorSlots.map((slot) => (slot.type === "ZONA" ? { ...slot, label: "Zona de influencia" } : slot)) });
  assert.ok(tableOf(pages(renamed), marketTableId("TERRENO_VENTA", "homologacion")).columns.some((item) => item.name === "Zona de influencia"));
  // A factor taken out leaves the table and the FRe.
  const fewer = market({ factorSlots: calculation.settings.factorSlots.filter((slot) => slot.type !== "USO_SUELO") });
  assert.equal(tableOf(pages(fewer), marketTableId("TERRENO_VENTA", "homologacion")).columns.some((item) => item.name === "Uso"), false);
});

test("V8.9: a column linked to a datum of the card, renamed in both directions", () => {
  const settings = defaultMarketSettings("TERRENO_VENTA");
  const fields = linkableCardFields(settings);
  assert.ok(fields.some((field) => field.key === "contactPhone" && field.label === "Teléfono"));
  assert.ok(fields.some((field) => field.key === "blockPosition" && field.label === "Ubicación en manzana"), "the factor of location's datum, by its name (08:50)");
  assert.ok(fields.some((field) => field.key === "frontage" && field.label === "FRENTE"), "the list of characteristics with its names");
  assert.equal(fields.some((field) => field.key === "bedrooms"), false, "land has no bedrooms");

  // Linked in the offers: a column with the datum of each comparable, at the end, with the card's name.
  const linked = market({ linkedColumns: withLinkedColumn(null, "ofertas", "url", true), fieldLabels: withCardFieldLabel(null, "sourceName", "Portal") });
  const blocks = pages(linked, { capture: true });
  const offers = marketTableId("TERRENO_VENTA", "ofertas");
  assert.equal(headers(blocks, offers).at(-1), "LIGA DEL ANUNCIO");
  assert.equal(tableOf(blocks, offers).columns.at(-1)?.id, linkedColumnId("url"));
  assert.deepEqual(column(blocks, offers, "LIGA DEL ANUNCIO"), ["—", "—", "—", "—"]);
  // The header renamed «Portal» is the card's name too (cardFieldLabel is what the card reads).
  assert.equal(headers(blocks, offers)[1], "PORTAL");
  assert.equal(cardFieldLabel(linked.settings, "sourceName"), "Portal");
  assert.equal(marketColumnField(linked.settings, offers, "col-2"), "sourceName");
  assert.equal(marketColumnField(linked.settings, offers, "col-contacto"), "contactName");
  assert.equal(marketColumnField(linked.settings, offers, linkedColumnId("url")), "url");
  assert.equal(marketColumnField(linked.settings, offers, "col-5"), null, "the area is the calculation's");
  assert.equal(marketLinkTableOf(offers), "ofertas");
  // Its own name again gives the card's back.
  assert.deepEqual(withCardFieldLabel({ sourceName: "Portal" }, "sourceName", "fuente o portal"), {});
  // Unlinked, the column goes.
  assert.deepEqual(withLinkedColumn(linked.settings.linkedColumns, "ofertas", "url", false).ofertas, []);
  // An added characteristic linked in the comparables: its name is the list's.
  const custom = market({
    characteristicFields: [{ key: "custom:vista", label: "Vista" }],
    linkedColumns: { caracteristicas: ["custom:vista"] },
  }, [comparable(1, 408, 3_721_900, { extra: { "custom:vista": "Al parque" } })]);
  const characteristics = marketTableId("TERRENO_VENTA", "caracteristicas");
  assert.deepEqual(column(pages(custom, { capture: true }), characteristics, "VISTA"), ["Al parque"]);
  // The settings that carry them pass the API's checks.
  assert.equal(marketSettingsSchema.safeParse({ ...linked.settings, factorSlots: linked.settings.factorSlots }).success, true);
  assert.equal(marketSettingsSchema.safeParse({ ...linked.settings, linkedColumns: { ofertas: ["<script>"] } }).success, false);
});

test("V8.10 (00:00–06:20): the statistics, chosen, renamed and of the appraiser's own; the median prints by default", () => {
  const base = market();
  const choice = printedStatisticsOf(base.settings);
  assert.ok(choice.order.includes("median") && !choice.hidden.includes("median"));
  const mode = withExtraStatistic(withStatisticLabel(choice, "mean", "Promedio"), "mode", "custom:moda");
  const formula = withExtraStatistic(mode, "formula", "custom:propio");
  const chosen = market({ printedStatistics: { ...formula, extra: formula.extra?.map((item) => (item.id === "custom:propio" ? { ...item, label: "Promedio con 5 % menos", formula: "=PROMEDIO*0.95" } : item)) } });
  assert.equal(marketSettingsSchema.safeParse(chosen.settings).success, true);
  assert.equal(statisticLabel(printedStatisticsOf(chosen.settings), "mean"), "Promedio");
  const homologation = tableOf(pages(chosen), marketTableId("TERRENO_VENTA", "homologacion"));
  const boxes = homologation.schema?.summaryBoxes ?? [];
  const values = boxes.find((box) => box.id === "valores")!.rows.map((row) => row.label);
  assert.equal(values[0], "Promedio:", "renamed");
  const dispersion = boxes.find((box) => box.id === "dispersion")!.rows;
  const own = dispersion.find((row) => row.id === "custom:propio")!;
  assert.equal(own.label, "Promedio con 5 % menos:");
  assert.match(own.value, /^\$ \d{1,3}(,\d{3})*\.\d{2}$/, "in pesos, with thousands");
  assert.equal(dispersion.find((row) => row.id === "custom:moda")?.value, "—", "four different values have no mode");
  // The formulas read the statistics by name.
  const stats = { count: 4, mean: 10_000, median: 9_000, min: 8_000, max: 12_000, standardDeviation: 1_000, coefficientOfVariation: 0.1, dispersion: 1.5, initialDispersion: 1.4, offerMin: 8_000, offerMax: 12_000 };
  assert.equal(statisticFormulaValue("=(MAXIMO-MINIMO)/PROMEDIO", stats), 0.4);
  assert.equal(statisticFormulaValue("=mínimo+N", stats), 8_004);
  assert.equal(statisticFormulaValue("=FOO*2", stats), null);
  assert.equal(extraStatisticText({ id: "custom:m", label: "Moda", kind: "mode" }, stats, [9_000, 9_000, 10_000]), "$ 9,000.00");
  assert.equal(extraStatisticText({ id: "custom:c", label: "CV", kind: "cv" }, stats, []), "10.00 %");
  assert.deepEqual(withoutExtraStatistic(formula, "custom:moda").order.includes("custom:moda"), false);
});

test("V8.7: the notes of a table are edited, added, taken out and moved, and stay when the calculation writes it again", () => {
  const written = generatedTable("motor-x-tabla", "Tabla", [figureColumn("REF"), textColumn("DATO")], [["1", "a"]], {
    notes: [{ position: "top", text: "Nota de arriba." }, { position: "table", text: DEFAULT_HOMOLOGATION_NOTE }],
  });
  const source = sourceOf(written);
  const notes = tableNotesOf(source, layoutOf(written));
  assert.deepEqual(notes.map((note) => note.text), ["Nota de arriba.", DEFAULT_HOMOLOGATION_NOTE]);
  // Edited, the first; taken out, the second; one of his own added before.
  const layout = withTableNotes({}, source, [{ position: "bottom", text: "Nota del valuador." }, { ...notes[0], text: "Arriba, a mi modo." }]);
  const edited = applyTableLayout(written, layout);
  assert.deepEqual(ensureTableV2(edited).schema?.notes, [
    { position: "bottom", text: "Nota del valuador." },
    { position: "top", text: "Arriba, a mi modo." },
  ]);
  // Written again by the calculation (with a new note): his notes stay, the new one joins after the last of its place.
  const again = generatedTable("motor-x-tabla", "Tabla", [figureColumn("REF"), textColumn("DATO")], [["1", "b"]], {
    notes: [{ position: "top", text: "Nota de arriba." }, { position: "table", text: DEFAULT_HOMOLOGATION_NOTE }, { position: "bottom", text: "Nueva del cálculo." }],
  });
  const block = (table: TableContent): Block => ({ id: "motor-x", title: "X", sectionLabel: "", enabled: true, required: false, concepts: [], tables: [], images: [], apartados: [{ id: "a", title: "A", enabled: true, concepts: [], images: [], tables: [table] }] });
  const [rewritten] = withTableLayouts([block(again)], [block(edited)]);
  assert.deepEqual(ensureTableV2(rewritten.apartados[0].tables[0]).schema?.notes?.map((note) => note.text), ["Nota del valuador.", "Nueva del cálculo.", "Arriba, a mi modo."]);
});

test("V8.12 (13:50): a table with a double header of factors and a resultant reads as a homologation and is offered the note", () => {
  const preset = createHomologationTable();
  assert.equal(readsAsHomologation(preset), true);
  const plain = generatedTable("t", "T", [textColumn("Concepto"), textColumn("Dato")], [["a", "b"]]);
  assert.equal(readsAsHomologation(ensureTableV2(plain)), false);
});

test("layout step 2: a «Tabla Homologación» made before is an ordinary table with its note, and market tables fit their columns", () => {
  const preset = createHomologationTable();
  const marketTable = applyTableLayout(
    generatedTable("motor-mercado-terreno_venta-enfoque-tabla-homologacion", "Homologación", [figureColumn("REF"), figureColumn("Neg.")], [["1", "0.95"]]),
    { widths: { "col-2": 140 } },
  );
  const terreno: AppSection = {
    id: "terreno", label: "II", title: "INFO TERRENO", sourceFile: "", enabled: true, required: false,
    blocks: [{ id: "b-1", title: "B", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], images: [], tables: [preset as unknown as TableContent] }],
  };
  const mercado: AppSection = {
    id: "mercadoVenta", label: "IX", title: "MERCADO", sourceFile: "", enabled: true, required: false,
    blocks: [{ id: "motor-mercado-terreno_venta-enfoque", title: "ENFOQUE", sectionLabel: "", enabled: true, required: false, concepts: [], tables: [], images: [], apartados: [{ id: "h", title: "H", enabled: true, concepts: [], images: [], tables: [marketTable] }] }],
  };
  const step = LAYOUT_STEPS.find((item) => item.id === "market-tables")!;
  const { sections, changes } = refreshDocumentLayout([terreno, mercado], [step]);
  assert.equal(changes.length, 2);
  const converted = ensureTableV2(sections[0].blocks[0].tables[0]);
  assert.equal(converted.schema?.presetId, undefined, "an ordinary table");
  assert.deepEqual(converted.schema?.headerGroups?.map((group) => group.title), ["Factores de Homologación"], "its double header stays");
  assert.ok(converted.schema?.zones.every((zone) => zone.kind === "fixed"));
  assert.ok(converted.schema?.notes?.some((note) => note.text === DEFAULT_HOMOLOGATION_NOTE));
  assert.deepEqual(converted.columns, preset.columns, "its columns stay");
  assert.equal(layoutOf(sections[1].blocks[0].apartados[0].tables[0]).widths, undefined, "the market's columns fit what they hold");
  // Idempotent: a second pass changes nothing.
  assert.equal(refreshDocumentLayout(sections, [step]).changes.length, 0);
  // «Deshacer» gives back exactly what it changed.
  const reverted = revertLayoutRefresh(sections, changes);
  assert.equal(ensureTableV2(reverted[0].blocks[0].tables[0]).schema?.presetId, "homologation");
  assert.deepEqual(layoutOf(reverted[1].blocks[0].apartados[0].tables[0]).widths, { "col-2": 140 });
});

test("V8.12 (16:20): the layers of the map of comparables tell the kinds apart, only those with comparables", () => {
  const pins = [
    { type: "INMUEBLE_VENTA" as const, kind: { key: "CASA_HABITACION", label: "Casa habitación" } },
    { type: "INMUEBLE_VENTA" as const, kind: { key: "CASA_HABITACION", label: "Casa habitación" } },
    { type: "INMUEBLE_RENTA" as const, kind: { key: "OFICINA", label: "Oficina" } },
    { type: "TERRENO_VENTA" as const, kind: { key: "TERRENO", label: "Terreno / Lote" } },
    { type: "INMUEBLE_VENTA" as const, kind: null },
  ];
  const layers = kindLayersOf(pins);
  assert.deepEqual(layers.map((layer) => [layer.title, layer.count]), [
    ["Casa habitación en venta", 2], ["Inmuebles en venta (sin tipo)", 1], ["Terreno / Lote en venta", 1], ["Oficina en renta", 1],
  ]);
  const hidden = new Set([layers[0].key]);
  assert.equal(visibleKindPins(pins, layerVisibility(), hidden).length, 3);
  assert.equal(visibleKindPins(pins, layerVisibility(["TERRENO_VENTA"]), new Set()).length, 1);
});
