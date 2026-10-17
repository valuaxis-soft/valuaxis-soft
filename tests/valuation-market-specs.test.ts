/**
 * The appraiser's observations of 13–14 Oct 2026 on the market approach:
 * several markets per valuation (land for rent too), the homologation basis,
 * factors typed as in his Excel, the firm's own factors, the justification of
 * the factors, the offer level grid and the characteristics list. None of it
 * changes a number of a capture made before.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { addCustomFactorTo, customFactorKey, resolveCustomFactors } from "../src/features/firm/custom-factors";
import { factorInputText, parseFactorInput, withTypedFactor } from "../src/features/valuations/calculation/factor-input";
import { homologationLegend, marketDocumentBlocks, withGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { comparableInputSchema, marketSettingsSchema } from "../src/features/valuations/calculation/market-schemas";
import {
  COMPARABLE_TYPES,
  DEFAULT_OFFER_LABELS,
  characteristicFieldsOf,
  characteristicText,
  comparableFormValues,
  defaultCharacteristicFields,
  defaultMarketSettings,
  homologationBasisOf,
  offerMarkOf,
  toMarketEngineInput,
  withCharacteristic,
  type ComparableDto,
  type MarketCalculationDto,
} from "../src/features/valuations/calculation/market-types";
import { DEFAULT_ENGINE_CONFIG, EXCEL_PROFILES } from "../src/features/valuations/engine/config";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import type { AppSection, TableContent } from "../src/features/valuations/model";
import { ensureTableV2 } from "../src/features/valuations/services/table";
import { moveSlot } from "../src/features/valuations/components/calculation/market-factor-slots";

function comparable(reference: number, area: number, price: number, factors: ComparableDto["factors"] = []): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price,
    landUse: null, shape: "Regular", zone: "Calle Tipo", frontage: 8, depth: 17.5, topography: null, services: "Completos", notes: null,
    sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, photos: [], factors,
  };
}

const negotiation = (value: number) => ({ type: "NEGOCIACION" as const, value, subjectRating: null, comparableRating: null, justification: null });

/** The Arandas land comparables (VI. ENF. MERCADO VENTA, rows 42–46): 9,000 adopted, 1,528,000 of value. */
const land: MarketCalculationDto = {
  settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 169.78, surfacePower: 6, adoptedUnitValue: 9000, rounding: -2 },
  comparables: [
    comparable(1, 140, 1260000, [negotiation(0.95)]),
    comparable(2, 140, 1220000, [negotiation(0.95)]),
    comparable(3, 192.5, 2032590, [negotiation(0.95)]),
    comparable(4, 196.62, 2261130, [negotiation(0.95)]),
  ],
  locked: false,
};

function compute(target: MarketCalculationDto) {
  const input = toMarketEngineInput(target);
  assert.ok(input.ok);
  return computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG);
}

function printed(table: TableContent) {
  const v2 = ensureTableV2(table);
  return {
    rows: v2.rows.map((row) => v2.columns.map((column) => {
      const cell = row.cells[column.id];
      return cell?.kind === "value" ? cell.value : "";
    })),
    columns: v2.columns.map((column) => column.name),
    schema: v2.schema,
  };
}
const section = (id: string): AppSection => ({ id, label: "VII", title: "MERCADO", sourceFile: "", enabled: true, required: false, blocks: [] });

/* ------------------------------------------------------------------ */
/*  1. Several markets                                                 */
/* ------------------------------------------------------------------ */

test("land for rent is a market of its own, with its wording and its pages", () => {
  assert.deepEqual([...COMPARABLE_TYPES], ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA", "TERRENO_RENTA"]);
  const rents: MarketCalculationDto = { ...land, settings: { ...land.settings, comparableType: "TERRENO_RENTA", adoptedUnitValue: 25 } };
  const [block] = marketDocumentBlocks(rents, compute(rents));
  assert.equal(block.id, "motor-mercado-terreno_renta-enfoque");
  assert.equal(block.title, "MERCADO DE RENTAS (TERRENOS)");
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), ["DATOS DE COMPARABLES (TERRENOS EN RENTA)", "HOMOLOGACIÓN (RENTAS DE TERRENOS)"]);
  const offers = printed(block.apartados[0].tables[1]);
  assert.deepEqual(offers.columns.slice(3), ["FECHA", "SUPERFICIE DE TERRENO (m²)", "RENTA MENSUAL $", "$/m²/mes"], "land gives the offer date");
  assert.match(printed(block.apartados[0].tables[0]).rows[0][3], /SUPERFICIE: 140\.00 m² ; SERVICIOS: Completos ; RENTA MENSUAL: \$1,260,000\.00$/);
  const valueBox = printed(block.apartados[1].tables[0]).schema?.summaryBoxes?.find((box) => box.id === "valor");
  assert.equal(valueBox?.rows.at(-1)?.label, "RENTA MENSUAL ESTIMADA DEL TERRENO:");
});

test("land and buildings for sale write their own pages side by side in the market section", () => {
  const buildings: MarketCalculationDto = {
    ...land,
    settings: { ...land.settings, comparableType: "INMUEBLE_VENTA", subjectArea: 467.27, adoptedUnitValue: 13000 },
  };
  let market = section("mercadoVenta");
  market = withGeneratedBlocks(market, "TERRENO_VENTA", marketDocumentBlocks(land, compute(land)));
  market = withGeneratedBlocks(market, "INMUEBLE_VENTA", marketDocumentBlocks(buildings, compute(buildings)));
  const order = ["ENFOQUE COMPARATIVO DE MERCADO (TERRENOS)", "ENFOQUE COMPARATIVO DE MERCADO (INMUEBLES)"];
  assert.deepEqual(market.blocks.map((block) => block.title), order, "land first, as the books (VIII and X)");
  // Recomputing one leaves the other where it is.
  const again = withGeneratedBlocks(market, "TERRENO_VENTA", marketDocumentBlocks(land, compute(land)));
  assert.equal(again, market);
  // Buildings captured first: the land still goes before them, after the appraiser's own block.
  const own = { id: "nota", title: "NOTA", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [] };
  let reversed: AppSection = { ...section("mercadoVenta"), blocks: [own] };
  reversed = withGeneratedBlocks(reversed, "INMUEBLE_VENTA", marketDocumentBlocks(buildings, compute(buildings)), { position: "end" });
  reversed = withGeneratedBlocks(reversed, "TERRENO_VENTA", marketDocumentBlocks(land, compute(land)));
  assert.deepEqual(reversed.blocks.map((block) => block.title), ["NOTA", ...order]);
});

/* ------------------------------------------------------------------ */
/*  3. Homologation basis                                              */
/* ------------------------------------------------------------------ */

test("homologation against the subject leaves the lote tipo out; a capture of before keeps its basis and its numbers", () => {
  assert.equal(homologationBasisOf({ baseArea: 140 }), "LOTE_TIPO", "before the choice, a lote tipo means against it");
  assert.equal(homologationBasisOf({ baseArea: null }), "SUJETO");
  const withLote = { ...land, settings: { ...land.settings, baseArea: 140 } };
  const before = compute(withLote);
  assert.deepEqual(compute({ ...withLote, settings: { ...withLote.settings, homologationBasis: "LOTE_TIPO" } }), before);
  // Against the subject the captured lote tipo stays, but the surface factor uses the subject.
  const subject = compute({ ...withLote, settings: { ...withLote.settings, homologationBasis: "SUJETO" } });
  assert.deepEqual(subject, compute(land));
  assert.notDeepEqual(subject.homologation.comparables[0].surfaceFactor, before.homologation.comparables[0].surfaceFactor);
});

test("the box of the basis marks the option chosen, with both printed as in the format", () => {
  const rows = (settings: Partial<MarketCalculationDto["settings"]>) => {
    const target = { ...land, settings: { ...land.settings, ...settings } };
    return printed(marketDocumentBlocks(target, compute(target))[0].apartados[1].tables[0]).schema?.summaryBoxes?.[0];
  };
  const subject = rows({ baseArea: 140, homologationBasis: "SUJETO" });
  assert.equal(subject?.caption, "Homologación de acuerdo a:");
  assert.deepEqual(subject?.rows.map((row) => [row.label, row.value, row.mark]), [["Lote Tipo:", "140.00 m²", false], ["Lote Sujeto:", "169.78 m²", true]]);
  assert.deepEqual(rows({ baseArea: 140 })?.rows.map((row) => row.mark), [true, false]);
});

/* ------------------------------------------------------------------ */
/*  4. Factors typed in the homologation table                         */
/* ------------------------------------------------------------------ */

test("a factor cell takes a number, a formula or the ratings, as the Excel writes them", () => {
  assert.deepEqual(parseFactorInput(""), { kind: "empty" });
  assert.deepEqual(parseFactorInput("0.95"), { kind: "value", value: 0.95 });
  assert.deepEqual(parseFactorInput("=1.1/1.05"), { kind: "ratings", subjectRating: 1.1, comparableRating: 1.05 });
  assert.deepEqual(parseFactorInput(" = 1 / 1.15 "), { kind: "ratings", subjectRating: 1, comparableRating: 1.15 });
  const formula = parseFactorInput("=(140/169.78)^(1/6)");
  assert.equal(formula.kind, "value");
  assert.ok(formula.kind === "value" && Math.abs(formula.value - (140 / 169.78) ** (1 / 6)) < 1e-12);
  assert.deepEqual(parseFactorInput("=1/0"), { kind: "invalid" });
  assert.deepEqual(parseFactorInput("alto"), { kind: "invalid" });

  assert.equal(factorInputText({ value: 1.0476, subjectRating: 1.1, comparableRating: 1.05 }), "=1.1/1.05", "reads back as typed");
  assert.equal(factorInputText({ value: 0.95, subjectRating: null, comparableRating: null }), "0.95");
  assert.equal(factorInputText(undefined), "");
});

test("typing a factor replaces that factor only, keeps its justification, and emptying it removes it", () => {
  const factors = [{ ...negotiation(0.95), justification: "Contado" }, { type: "ZONA" as const, value: 0.9, subjectRating: null, comparableRating: null, justification: null }];
  const typed = withTypedFactor(factors, { type: "NEGOCIACION" }, { kind: "ratings", subjectRating: 1, comparableRating: 1.05 });
  assert.deepEqual(typed.find((factor) => factor.type === "NEGOCIACION"), {
    type: "NEGOCIACION", value: 1 / 1.05, subjectRating: 1, comparableRating: 1.05, justification: "Contado",
  });
  assert.equal(typed.length, 2);
  assert.deepEqual(withTypedFactor(factors, { type: "ZONA" }, { kind: "empty" }).map((factor) => factor.type), ["NEGOCIACION"]);
  const own = withTypedFactor(factors, { type: "OTRO", key: "custom:vista" }, { kind: "value", value: 1.05 });
  assert.equal(own.find((factor) => factor.key === "custom:vista")?.value, 1.05, "the firm's factor goes by its key");
});

test("the Arandas homologation typed in the table gives the book's numbers", () => {
  // Rows 42–45 of the sheet: Neg. 0.95, Ubic., Zona, Frent and Uso as the appraiser typed them.
  const typed: Array<Record<"UBICACION" | "ZONA" | "FRENTE" | "USO_SUELO", string>> = [
    { UBICACION: "=1/1", ZONA: "=0.9/1", FRENTE: "=1/1", USO_SUELO: "=1.1/1.05" },
    { UBICACION: "=1/1", ZONA: "=0.9/1.05", FRENTE: "=1/1", USO_SUELO: "=1.1/1.05" },
    { UBICACION: "=1/1", ZONA: "=0.9/1", FRENTE: "=1/1", USO_SUELO: "=1.1/1" },
    { UBICACION: "=1/1.15", ZONA: "=0.9/1", FRENTE: "=1/1.15", USO_SUELO: "=1.1/1" },
  ];
  const comparables = land.comparables.map((item, index) => ({
    ...item,
    factors: (Object.entries(typed[index]) as Array<[keyof (typeof typed)[number], string]>).reduce((factors, [type, text]) => {
      const input = parseFactorInput(text);
      assert.notEqual(input.kind, "invalid");
      return input.kind === "invalid" ? factors : withTypedFactor(factors, { type }, input);
    }, item.factors),
  }));
  // The sheet marks "Lote Sujeto" (I38) and orients the surface factor as its own profile.
  const input = toMarketEngineInput({ ...land, settings: { ...land.settings, homologationBasis: "SUJETO" }, comparables });
  assert.ok(input.ok);
  const result = computeMarketApproach(input.input, EXCEL_PROFILES.ARANDAS);
  const resultants = result.homologation.comparables.map((row) => row.resultantFactor);
  const book = [0.8673806948286904, 0.8260768522178003, 0.9603941381815846, 0.7287635559188418];
  resultants.forEach((value, index) => assert.ok(Math.abs(value - book[index]) < 1e-12, `FRe ${index + 1}: ${value}`));
  assert.equal(result.value, 1528000);
});

test("factors and FRe print with two decimals; the firm's own factor prints its name", () => {
  const vista = { type: "OTRO" as const, key: "custom:vista", value: 1.05, subjectRating: null, comparableRating: null, justification: null };
  const target: MarketCalculationDto = {
    ...land,
    settings: { ...land.settings, factorSlots: [...land.settings.factorSlots.slice(0, 5), { type: "OTRO", key: "custom:vista", label: "Vista" }] },
    comparables: land.comparables.map((item) => ({ ...item, factors: [...item.factors, vista] })),
  };
  const table = printed(marketDocumentBlocks(target, compute(target))[0].apartados[1].tables[0]);
  assert.deepEqual(table.columns.slice(4, 11), ["Neg.", "Ubic.", "Sup.", "Zona", "Frente", "Vista", "FRe"]);
  assert.equal(table.rows[0][9], "1.05");
  assert.match(table.rows[0][10], /^\d\.\d{2}$/);
  // The own factor multiplies like any other.
  const plain = compute(land).homologation.comparables[0].resultantFactor;
  assert.ok(Math.abs(compute(target).homologation.comparables[0].resultantFactor - plain * 1.05) < 1e-12);
});

/* ------------------------------------------------------------------ */
/*  5. The firm's factors and their order                              */
/* ------------------------------------------------------------------ */

test("a factor the firm creates is kept once, however it is written, and offered again", () => {
  assert.equal(customFactorKey("Vista al mar"), "custom:vista-al-mar");
  assert.equal(customFactorKey("  VISTA  al  Mar "), "custom:vista-al-mar");
  assert.equal(customFactorKey("Pendiente (%)"), "custom:pendiente");
  const first = addCustomFactorTo([], "Vista");
  assert.deepEqual(first, { factors: [{ key: "custom:vista", label: "Vista" }], factor: { key: "custom:vista", label: "Vista" }, added: true });
  const again = addCustomFactorTo(first.factors, "vísta");
  assert.equal(again.added, false);
  assert.deepEqual(again.factor, { key: "custom:vista", label: "Vista" }, "the one kept is answered");
  assert.deepEqual(resolveCustomFactors([{ label: "Acceso" }, { label: "acceso" }, "x", null, { label: 3 }]), [{ key: "custom:acceso", label: "Acceso" }]);
  assert.deepEqual(resolveCustomFactors(null), []);
});

test("at most six factors per homologation, each once; the firm's factors go by their key", () => {
  const slots = (count: number) => [{ type: "SUPERFICIE", label: "Sup." }, ...["NEGOCIACION", "UBICACION", "ZONA", "FRENTE", "USO_SUELO", "FORMA"]
    .slice(0, count - 1).map((type) => ({ type, label: type }))];
  const base = { ...land.settings };
  assert.ok(marketSettingsSchema.safeParse({ ...base, factorSlots: slots(6) }).success);
  const seven = marketSettingsSchema.safeParse({ ...base, factorSlots: slots(7) });
  assert.equal(seven.success, false);
  assert.match(seven.error?.issues[0].message ?? "", /hasta 6 factores \(sin contar el FRe\)/);
  const own = [{ type: "SUPERFICIE", label: "Sup." }, { type: "OTRO", key: "custom:vista", label: "Vista" }, { type: "OTRO", key: "custom:acceso", label: "Acceso" }];
  assert.ok(marketSettingsSchema.safeParse({ ...base, factorSlots: own }).success, "two own factors, both of type OTRO");
  assert.equal(marketSettingsSchema.safeParse({ ...base, factorSlots: [...own, own[1]] }).success, false);
  assert.equal(marketSettingsSchema.safeParse({ ...base, factorSlots: [own[0], { type: "ZONA", key: "custom:zona", label: "Zona" }] }).success, false);
  const factors = [{ ...negotiation(1), type: "OTRO", key: "custom:vista" }, { ...negotiation(1), type: "OTRO", key: "custom:acceso" }];
  assert.ok(comparableInputSchema.safeParse({ ...comparableFormValues(land.comparables[0]), factors }).success);
});

test("reordering the factors moves their columns; each comparable's values follow their factor", () => {
  const slots = land.settings.factorSlots;
  const moved = moveSlot(slots, 0, 3);
  assert.deepEqual(moved.map((slot) => slot.type), ["UBICACION", "SUPERFICIE", "ZONA", "NEGOCIACION", "FRENTE", "USO_SUELO"]);
  assert.equal(moveSlot(slots, 0, 9), slots, "out of the list, nothing moves");
  const target = { ...land, settings: { ...land.settings, factorSlots: moved } };
  const table = printed(marketDocumentBlocks(target, compute(target))[0].apartados[1].tables[0]);
  assert.equal(table.columns[7], "Neg.");
  assert.equal(table.rows[0][7], "0.95");
  // The product is the same factors in another order.
  assert.ok(Math.abs(compute(target).homologation.comparables[0].resultantFactor - compute(land).homologation.comparables[0].resultantFactor) < 1e-12);
});

/* ------------------------------------------------------------------ */
/*  6. Justification of the factors, and the legend                    */
/* ------------------------------------------------------------------ */

test("the justification of the factors prints after the tables, one per comparable, unless turned off", () => {
  const target: MarketCalculationDto = {
    ...land,
    settings: { ...land.settings, justification: "Criterio del perito." },
    comparables: land.comparables.map((item, index) => ({ ...item, factorJustification: index === 1 ? null : `Texto ${item.reference}` })),
  };
  const notes = (calculation: MarketCalculationDto) => printed(marketDocumentBlocks(calculation, compute(calculation))[0].apartados[1].tables[0]).schema?.notes;
  assert.deepEqual(notes(target), [
    { position: "bottom", text: "Cuando el factor de homologación es menor a la unidad denota que la oferta es mejor que el predio valuado." },
    { position: "bottom", label: "Justificación de los factores utilizados:", text: "Criterio del perito." },
    { position: "bottom", label: "Comparable 1:", text: "Texto 1" },
    { position: "bottom", label: "Comparable 3:", text: "Texto 3" },
    { position: "bottom", label: "Comparable 4:", text: "Texto 4" },
  ]);
  assert.deepEqual(notes({ ...target, settings: { ...target.settings, showFactorJustification: false } }), [
    { position: "bottom", text: homologationLegend("TERRENO_VENTA") },
  ], "off: only the legend");
  assert.match(homologationLegend("INMUEBLE_VENTA"), /mejor que el inmueble valuado\.$/);
});

/* ------------------------------------------------------------------ */
/*  7. Offer level                                                     */
/* ------------------------------------------------------------------ */

test("the offer level takes the appraiser's options, mark and sentence, in the 3 × 2 grid", () => {
  assert.equal(offerMarkOf({ offerLevel: "MEDIA_BAJA" }), 3, "a capture of before keeps its mark");
  assert.equal(offerMarkOf({ offerLevel: "MEDIA_BAJA", offerMark: null }), null, "unmarked from then on");
  assert.equal(offerMarkOf({ offerLabels: ["A", "B"], offerMark: 4 }), null, "a mark out of the options is none");
  const target: MarketCalculationDto = {
    ...land,
    settings: { ...land.settings, offerLabels: ["ABUNDANTE", "SUFICIENTE", "ESCASA", "NULA"], offerMark: 2, offerIntro: "Oferta de lotes en el fraccionamiento." },
  };
  const [offer] = marketDocumentBlocks(target, null)[0].apartados;
  assert.equal(offer.title, "TERRENOS SIMILARES EN VENTA");
  const grid = printed(offer.tables[0]);
  assert.deepEqual(grid.rows, [
    ["ABUNDANTE", "(   )", "ESCASA", "( X )", "", ""],
    ["SUFICIENTE", "(   )", "NULA", "(   )", "", ""],
  ]);
  assert.deepEqual(grid.schema?.notes, [{ position: "top", text: "Oferta de lotes en el fraccionamiento." }]);
  const defaults = printed(marketDocumentBlocks({ ...land, settings: { ...land.settings, offerMark: 0 } }, null)[0].apartados[0].tables[0]);
  assert.deepEqual(defaults.rows.map((row) => row[0]), [DEFAULT_OFFER_LABELS[0], DEFAULT_OFFER_LABELS[1]]);
  assert.equal(defaults.rows[0][1], "( X )");
  assert.equal(marketDocumentBlocks(land, null)[0].apartados.length, 2, "unmarked, not printed");
});

/* ------------------------------------------------------------------ */
/*  10. Characteristics                                                */
/* ------------------------------------------------------------------ */

test("the characteristics follow the appraiser's list: renamed, removed, added, or his own text", () => {
  assert.deepEqual(defaultCharacteristicFields("TERRENO_VENTA").map((field) => field.label), [
    "N. FRENTES", "USO DE SUELO", "FORMA", "ZONA", "FRENTE", "FONDO", "SUPERFICIE", "TOPOGRAFÍA", "SERVICIOS", "OFERTA", "OBSERVACIONES",
  ], "land, as row 21 of the sheet");
  assert.ok(defaultCharacteristicFields("INMUEBLE_VENTA").some((field) => field.label === "CALIDAD"));
  assert.deepEqual(characteristicFieldsOf(land.settings), defaultCharacteristicFields("TERRENO_VENTA"), "missing, the format's");

  const fields = [{ key: "shape", label: "FORMA DEL LOTE" }, { key: "custom:vista", label: "VISTA" }, { key: "area", label: "SUPERFICIE" }];
  const first = withCharacteristic(land.comparables[0], "custom:vista", " Al parque ", null);
  assert.equal(characteristicText(first, "custom:vista"), "Al parque");
  assert.equal(characteristicText(withCharacteristic(first, "custom:vista", "", null), "custom:vista"), "", "emptied, removed");
  assert.equal(withCharacteristic(first, "frontage", "=16/2", 8).frontage, 8);
  const target: MarketCalculationDto = {
    ...land,
    settings: { ...land.settings, characteristicFields: fields },
    comparables: [first, { ...land.comparables[1], characteristicsText: "Lote en esquina con dos frentes." }, ...land.comparables.slice(2)],
  };
  const rows = printed(marketDocumentBlocks(target, null)[0].apartados[0].tables[0]).rows;
  assert.equal(rows[0][3], "FORMA DEL LOTE: Regular ; VISTA: Al parque ; SUPERFICIE: 140.00 m²");
  assert.equal(rows[1][3], "Lote en esquina con dos frentes.", "his own text instead of the line");
  // A field taken off the list stops printing; what was captured stays with the comparable.
  assert.equal(target.comparables[0].zone, "Calle Tipo");
  assert.doesNotMatch(rows[0][3], /ZONA/);
});

test("the characteristics, the justification and the offer grid do not reach the engine", () => {
  const captured: MarketCalculationDto = {
    ...land,
    settings: {
      ...land.settings, characteristicFields: [{ key: "custom:vista", label: "VISTA" }], subjectCharacteristics: { "custom:vista": "Parque" },
      offerLabels: ["A"], offerMark: 0, offerIntro: "x", showFactorJustification: false,
    },
    comparables: land.comparables.map((item) => ({ ...item, extra: { "custom:vista": "Parque" }, characteristicsText: "x", factorJustification: "y" })),
  };
  assert.deepEqual(toMarketEngineInput(captured), toMarketEngineInput(land));
});

test("a comparable sent back keeps everything but its id, reference and photos", () => {
  const values = comparableFormValues({ ...land.comparables[0], photos: [{ id: "p", title: "t", url: "u" }], extra: { "custom:vista": "Parque" } });
  assert.equal("id" in values || "reference" in values || "photos" in values, false);
  assert.deepEqual(values.extra, { "custom:vista": "Parque" });
  const parsed = comparableInputSchema.safeParse({ ...values, extra: { "custom:vista": "Parque", "custom:acceso": " " } });
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data.extra, { "custom:vista": "Parque" }, "empty values are not kept");
  assert.equal(comparableInputSchema.safeParse({ ...values, extra: { vista: "x" } }).success, false, "a key that is no field");
});
