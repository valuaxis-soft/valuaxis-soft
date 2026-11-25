/**
 * Vehicles (25 Nov 2026, the firm's automobile book «FORMATO AVALUO
 * AUTOMOVIL»): an automobile, a pickup, a truck or a motorcycle is valued as
 * machinery, but its carátula, its comparables' card and its market print the
 * fields of that book (km instead of hours). The calculation is the MEH one;
 * here it is checked against the automobile book's own figures. Every name,
 * plate and serial is invented.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { comparablePinCardHtml } from "../src/features/maps/base-map/pin-card";
import type { ComparablePinDto } from "../src/features/maps/base-map/types";
import { comparableMarketLabel } from "../src/features/valuations/calculation/comparable-classes";
import type { ComparableBaseItem } from "../src/features/valuations/comparable-base/comparable-base.service";
import { cellOf } from "../src/features/valuations/comparable-base/components/comparable-base-table";

import type { ComparableCardDto } from "../src/features/valuations/calculation/comparable-card.service";
import { isVehicleKind } from "../src/features/valuations/calculation/comparable-kinds";
import { machineryDetailsOf, vehicleCardRows } from "../src/features/valuations/calculation/comparable-machinery";
import { comparableValidity } from "../src/features/valuations/calculation/comparable-validity";
import { machineryCostBlocks, machineryMarketBlocks } from "../src/features/valuations/calculation/machinery-document";
import {
  EMPTY_MACHINERY_ITEM,
  MACHINERY_PROPERTY_TYPE,
  emptyOffer,
  toMachineryMarketEngineInput,
  type MachineryCostDto,
  type MachineryMarketDto,
} from "../src/features/valuations/calculation/machinery-types";
import { comparableInputSchema } from "../src/features/valuations/calculation/market-schemas";
import { defaultCharacteristicFields, type ComparableDto } from "../src/features/valuations/calculation/market-types";
import { ComparableCardView } from "../src/features/valuations/components/calculation/comparable-card-view";
import { ComparableSheetForm, type ComparableDialogProps } from "../src/features/valuations/components/calculation/comparable-dialog";
import { machineryDetailsFromDraft, machineryDraftOf } from "../src/features/valuations/components/calculation/comparable-machinery-fields";
import { SectionDocument } from "../src/features/valuations/components/report-preview";
import { computeMachineryCost, computeMachineryMarket } from "../src/features/valuations/engine/machinery";
import type { AppSection, Block, CaratulaFormData, Letterhead, ValuationMeta } from "../src/features/valuations/model";
import { getInitialSectionTemplate } from "../src/features/valuations/sections";
import { isVehicleEssence } from "../src/features/valuations/services/appraisal-subject";
import { hydrateGeneralCaratulaTemplate } from "../src/features/valuations/services/general-valuation-template";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const MACHINERY = MACHINERY_PROPERTY_TYPE.toLowerCase();

/** The automobile book's «l. CARATULA» (B29–B40), in its order. */
const VEHICLE_DATA = [
  "Tipo de máquina / equipo", "Marca", "Modelo", "Matrícula", "No. de serie chasis", "No. de serie motor",
  "Año de fabricación", "País de origen", "Potencia (HP/kW)", "Odómetro", "Ubicación del bien",
];
/** What its «I.3 DATOS DE IDENTIFICACIÓN DEL BIEN» adds, in its order, with the conservation of its inspection. */
const VEHICLE_CHARACTERISTICS = [
  "Color", "Submarca", "Tracción", "Tipo de transmisión", "Tipo de motor", "Combustible", "Componentes principales", "Estado de conservación",
];

/* ------------------------------------------------------------------ */
/*  Which valuations are of a vehicle                                  */
/* ------------------------------------------------------------------ */

test("an automobile, a pickup, a truck and a motorcycle are vehicles; the other machines are not", () => {
  for (const essence of ["Automóvil", "automovil", "  Camioneta ", "Camión", "MOTOCICLETA"]) assert.equal(isVehicleEssence(essence), true, essence);
  for (const essence of ["Retroexcavadora", "Maquinaria industrial", "Aeronave", "Grúa", "", null, undefined, "Casa habitación"]) {
    assert.equal(isVehicleEssence(essence), false, String(essence));
  }
  for (const key of ["AUTOMOVIL", "CAMIONETA", "CAMION", "MOTOCICLETA"]) assert.equal(isVehicleKind(key), true, key);
  for (const key of ["MAQUINARIA_CONSTRUCCION", "EQUIPO", "OTRO_MAQUINARIA", "CASA_HABITACION", "", null]) assert.equal(isVehicleKind(key), false, String(key));
});

/* ------------------------------------------------------------------ */
/*  Carátula                                                           */
/* ------------------------------------------------------------------ */

const labelsOf = (block: Block | undefined) => block?.concepts.map((concept) => concept.label);

test("a vehicle's carátula asks for the automobile book's data, in its order; a machine's stays as it was", () => {
  const template = getInitialSectionTemplate("CARATULA", MACHINERY, "Automóvil");
  assert.ok(template);
  const data = template.blocks.find((block) => block.title === "DATOS DEL BIEN A VALUAR");
  const characteristics = template.blocks.find((block) => block.title === "CARACTERÍSTICAS");
  assert.deepEqual(labelsOf(data), VEHICLE_DATA);
  assert.deepEqual(labelsOf(characteristics), VEHICLE_CHARACTERISTICS);
  const labels = template.blocks.flatMap((block) => block.concepts.map((concept) => concept.label));
  assert.ok(!labels.some((label) => /horómetro|horas/i.test(label)), "a vehicle is not measured in hours");

  // The applicant, the valuation, the assumptions and the conclusion are those of every carátula.
  const machine = getInitialSectionTemplate("CARATULA", MACHINERY, "Retroexcavadora")!;
  const shared = (section: AppSection) => section.blocks.filter((block) => !/datos-del-(bien-mueble|vehiculo)|caracteristicas/.test(block.id)).map((block) => block.id);
  assert.deepEqual(shared(template), shared(machine));
  assert.ok(machine.blocks.flatMap((block) => block.concepts).some((concept) => concept.label === "Horas de uso (horómetro)"), "a backhoe keeps its horómetro");
  assert.deepEqual(getInitialSectionTemplate("CARATULA", MACHINERY), getInitialSectionTemplate("CARATULA", MACHINERY, "Retroexcavadora"), "without an essence, a machine");

  // Each built-in vehicle takes it.
  for (const essence of ["Camioneta", "Camión", "Motocicleta"]) {
    const caratula = getInitialSectionTemplate("CARATULA", MACHINERY, essence)!;
    assert.deepEqual(labelsOf(caratula.blocks.find((block) => block.title === "DATOS DEL BIEN A VALUAR")), VEHICLE_DATA, essence);
  }

  // What is valued fills «Tipo de máquina / equipo», as the book.
  const hydrated = hydrateGeneralCaratulaTemplate(template, { essence: "Automóvil" });
  assert.equal(hydrated.blocks.flatMap((block) => block.concepts).find((concept) => concept.label === "Tipo de máquina / equipo")?.value, "Automóvil");
});

const caratula: CaratulaFormData = {
  tituloInmueble: "Automóvil sedán de prueba 2022",
  numeroAvaluo: "PRB-0002",
  folio: "PRB-0002",
  direccionEmpresa: "",
  telefonoEmpresa: "",
  correoEmpresa: "",
  solicitante: "",
  propietario: "",
  objeto: "",
  proposito: "",
  firmas: [],
  valorTotal: "250000",
  valorConLetra: "(DOSCIENTOS CINCUENTA MIL PESOS 00/100 M.N.)",
  fechaAvaluo: "2026-02-12",
  mesesVigencia: 6,
  fechaVigencia: "",
};
const letterhead: Letterhead = { name: "Despacho de prueba", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };

test("the vehicle's carátula prints its data and characteristics as captured", () => {
  const values: Record<string, string> = {
    Marca: "Marca Inventada", Modelo: "Sedán GT", Matrícula: "ABC-000-X", "No. de serie chasis": "VIN-PRUEBA-0001", "No. de serie motor": "MOTOR-PRUEBA-01",
    "Año de fabricación": "2022", "País de origen": "México", "Potencia (HP/kW)": "201 HP", Odómetro: "63,500 km", "Ubicación del bien": "Guadalajara, Jalisco",
    Color: "Gris", Tracción: "Delantera", "Tipo de transmisión": "Automática", Combustible: "Gasolina", "Estado de conservación": "Bueno",
  };
  const template = hydrateGeneralCaratulaTemplate(getInitialSectionTemplate("CARATULA", MACHINERY, "Automóvil")!, { essence: "Automóvil" });
  const section: AppSection = {
    ...template,
    blocks: template.blocks.map((block) => ({ ...block, concepts: block.concepts.map((concept) => ({ ...concept, value: values[concept.label] ?? concept.value })) })),
  };
  const meta = { folio: "PRB-0002", client: "", postalCode: "", location: "Guadalajara, Jalisco", valuationKind: "venta", propertyKind: MACHINERY, appraisalClass: "MAQUINARIA", essence: "Automóvil" } as ValuationMeta;
  const html = renderToStaticMarkup(<SectionDocument caratula={caratula} letterhead={letterhead} meta={meta} principalCoverImage={null} section={section} />);
  for (const text of ["DATOS DEL BIEN A VALUAR", "CARACTERÍSTICAS", "Automóvil", ...Object.keys(values), ...Object.values(values)]) {
    assert.ok(html.includes(text), `«${text}» is printed`);
  }
  // In the book's order: the plate before the serials, the odómetro before the location.
  assert.ok(html.indexOf("Matrícula") < html.indexOf("No. de serie chasis") && html.indexOf("Odómetro") < html.indexOf("Ubicación del bien"));
  assert.match(html, /VALOR COMERCIAL DEL AUTOMÓVIL/);
  assert.doesNotMatch(html, /horómetro|inmueble/i);
});

/* ------------------------------------------------------------------ */
/*  Comparable card                                                    */
/* ------------------------------------------------------------------ */

const vehicleData = {
  brand: "Marca Inventada", model: "Sedán GT", year: 2022, condition: "Bueno", maintenance: "Preventivo", origin: "México", color: "Gris",
  meterKind: "ODOMETRO" as const, meterReading: 58_420, engine: "1.6 L turbo", doors: "4", spareTire: "Sí", serviceHistory: "Completo",
  repairs: "Ninguna", operatingState: "Activo", attachments: "Ninguno",
};

const vehicleComparable = (extra: Partial<ComparableDto> = {}): ComparableDto => ({
  id: "comparable-auto", reference: 1, location: "Colonia inventada, Guadalajara, Jalisco", area: null, price: 379_000, landUse: null,
  shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null, sourceName: "Portal de prueba",
  contactName: "Vendedor Inventado", contactPhone: null, url: null, offerDate: "2026-12-15", photos: [], factors: [],
  propertyDetails: { kind: "AUTOMOVIL", kindLabel: "Automóvil", assetClass: "MAQUINARIA" },
  machinery: vehicleData,
  ...extra,
});

test("a vehicle's card shows the automobile book's characteristics in its order; a machine's keeps its own", () => {
  assert.deepEqual(vehicleCardRows(vehicleData).map((row) => row.label), [
    "Marca", "Modelo", "Año", "Conservación", "Tipo de mant.", "Procedencia", "Color", "Kilómetros", "Motor", "Puertas",
    "Llanta repuesto", "Historial servicios", "Reparaciones", "Edo. operativo", "Aditamentos",
  ]);
  assert.equal(vehicleCardRows(vehicleData).find((row) => row.label === "Kilómetros")?.value, "58,420 km");
  assert.equal(vehicleCardRows({ meterReading: 12_000 }).find((row) => row.label === "Kilómetros")?.value, "12,000 km", "a vehicle is read in km");
  assert.equal(vehicleCardRows(null).find((row) => row.label === "Color")?.value, "—");

  const card: ComparableCardDto = {
    comparable: vehicleComparable(), type: "INMUEBLE_VENTA", valuation: null, validity: comparableValidity("2026-12-01", "2026-12-16"), warnings: [], uses: [], history: [],
  };
  const html = renderToStaticMarkup(<ComparableCardView card={card} />);
  assert.match(html, /data-vehicle-card/);
  for (const text of ["Datos del vehículo", "Marca Inventada", "Sedán GT", "2022", "Gris", "58,420 km", "1.6 L turbo", "Historial servicios", "Completo", "Edo. operativo"]) {
    assert.ok(html.includes(text), text);
  }
  for (const machine of ["Datos de la máquina o equipo", "Flete / costo de envío", "Capacidad / potencia", "Horómetro"]) assert.ok(!html.includes(machine), machine);

  // A backhoe is still a machine.
  const backhoe = renderToStaticMarkup(<ComparableCardView card={{ ...card, comparable: vehicleComparable({ propertyDetails: { kind: "MAQUINARIA_CONSTRUCCION", assetClass: "MAQUINARIA" } }) }} />);
  assert.ok(backhoe.includes("Datos de la máquina o equipo") && !backhoe.includes("data-vehicle-card"));
});

test("a vehicle's sheet asks for its fields, saves them in km, and keeps what it does not ask for", () => {
  const props: ComparableDialogProps = {
    open: true, onOpenChange: () => undefined, comparable: vehicleComparable(), card: null, characteristicFields: defaultCharacteristicFields("INMUEBLE_VENTA"),
    comparableType: "INMUEBLE_VENTA", unitLabel: "Precio de oferta ($)", readOnly: false, onSubmit: async () => true, comparableClass: "MAQUINARIA",
    onUploadPhoto: async () => undefined, onRemovePhoto: async () => undefined, onUploadScreenshot: async () => undefined, onRemoveScreenshot: async () => undefined,
    onCheckDuplicates: async () => [], onReuse: async () => true,
  };
  const sheet = renderToStaticMarkup(<ComparableSheetForm {...props} />);
  assert.match(sheet, /data-vehicle-fields/);
  for (const id of ["machinery-color", "machinery-engine", "machinery-doors", "machinery-spareTire", "machinery-serviceHistory", "machinery-repairs"]) {
    assert.ok(sheet.includes(`id="${id}"`), id);
  }
  assert.ok(sheet.includes("Kilómetros") && sheet.includes("Tipo de mant.") && sheet.includes("Edo. operativo"));
  for (const machine of ["id=\"machinery-meter-kind\"", "id=\"machinery-freight\"", "id=\"machinery-serial\""]) assert.ok(!sheet.includes(machine), machine);

  // Saved in km, with what the vehicle's sheet does not show (a serial captured as a machine) kept.
  const draft = machineryDraftOf({ ...vehicleData, meterKind: null, serial: "SERIE-ANTERIOR" });
  assert.deepEqual(machineryDetailsFromDraft(draft, { vehicle: true }), { details: { ...vehicleData, serial: "SERIE-ANTERIOR" } });
  const withoutReading = machineryDetailsFromDraft({ ...draft, meterReading: "" }, { vehicle: true });
  assert.ok("details" in withoutReading && withoutReading.details?.meterKind === undefined, "no reading, no meter");

  // The API keeps them: the schema takes them, and a stored snapshot reads back the same.
  const payload = { location: "X", area: null, price: 1, landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, factors: [] };
  const parsed = comparableInputSchema.safeParse({ ...payload, machinery: vehicleData });
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data.machinery, vehicleData);
  assert.deepEqual(machineryDetailsOf(vehicleData), vehicleData);
});

test("a machine or a vehicle is never labelled with a real estate market: card header, sheet, base list and map pin", () => {
  assert.equal(comparableMarketLabel("INMUEBLE_VENTA", "MAQUINARIA"), "Maquinaria y equipo en venta");
  assert.equal(comparableMarketLabel("INMUEBLE_RENTA", "MAQUINARIA"), "Maquinaria y equipo en renta");
  assert.equal(comparableMarketLabel("INMUEBLE_VENTA", "INMUEBLE"), "Inmuebles en venta");
  assert.equal(comparableMarketLabel("TERRENO_VENTA"), "Terrenos en venta", "real estate as before");

  const card: ComparableCardDto = {
    comparable: vehicleComparable(), type: "INMUEBLE_VENTA", valuation: null, validity: comparableValidity("2026-12-01", "2026-12-16"), warnings: [], uses: [], history: [],
  };
  const header = (html: string) => /data-card-market="">([^<]*)</.exec(html)?.[1];
  assert.equal(header(renderToStaticMarkup(<ComparableCardView card={card} />)), "Maquinaria y equipo en venta");
  const house = { ...card, comparable: vehicleComparable({ machinery: null, area: 180, propertyDetails: { kind: "CASA_HABITACION", assetClass: "INMUEBLE" } }) };
  assert.equal(header(renderToStaticMarkup(<ComparableCardView card={house} />)), "Inmuebles en venta");

  const props: ComparableDialogProps = {
    open: true, onOpenChange: () => undefined, comparable: vehicleComparable(), card: null, characteristicFields: defaultCharacteristicFields("INMUEBLE_VENTA"),
    comparableType: "INMUEBLE_VENTA", unitLabel: "Precio de oferta ($)", readOnly: false, onSubmit: async () => true, comparableClass: "MAQUINARIA",
    onUploadPhoto: async () => undefined, onRemovePhoto: async () => undefined, onUploadScreenshot: async () => undefined, onRemoveScreenshot: async () => undefined,
    onCheckDuplicates: async () => [], onReuse: async () => true,
  };
  const sheet = renderToStaticMarkup(<ComparableSheetForm {...props} />);
  assert.equal(header(sheet), "Maquinaria y equipo en venta");
  assert.ok(!sheet.includes("Inmuebles en venta"));

  // The base's «Tipo» column.
  const item = { type: "INMUEBLE_VENTA", operationType: "VENTA", assetClass: "MAQUINARIA" } as ComparableBaseItem;
  assert.match(renderToStaticMarkup(<>{cellOf("tipo", item)}</>), /<p>Maquinaria y equipo en venta<\/p>/);
  assert.match(renderToStaticMarkup(<>{cellOf("tipo", { ...item, assetClass: "INMUEBLE" })}</>), /<p>Inmuebles en venta<\/p>/);

  // The pin of the base's map.
  const pin = {
    id: "c1", folio: 12, type: "INMUEBLE_VENTA", operationType: "VENTA", location: "Colonia inventada", lat: 20.6, lon: -103.4, area: null, landArea: null, builtArea: null,
    price: 379_000, bedrooms: null, bathrooms: null, sourceName: null, url: null, thumbnailUrl: null, updatedOn: "2026-11-20", validUntil: "2027-05-20", expired: false,
  } satisfies ComparablePinDto;
  assert.match(comparablePinCardHtml({ ...pin, assetClass: "MAQUINARIA" }), /C-00012 · Maquinaria y equipo en venta/);
  assert.match(comparablePinCardHtml(pin), /C-00012 · Inmuebles en venta/);
});

/* ------------------------------------------------------------------ */
/*  Market and cost: the automobile book's figures                     */
/* ------------------------------------------------------------------ */

/**
 * «V. ENF. MERCADO» of the automobile book (rows 72–85): price, age, useful
 * life 30, the conservation rating and FCo · FMt · FOt · FOe of each offer.
 */
const BOOK_OFFERS = [
  { price: 379_000, age: 8, rating: 10, factors: [0.9, 0.95, 1, 1], km: "58420" },
  { price: 445_000, age: 7, rating: 7, factors: [0.5, 1, 0.95, 1], km: "22150" },
  { price: 390_000, age: 9, rating: 8, factors: [0.8, 0.95, 1, 1], km: "89400" },
  { price: 432_000, age: 10, rating: 8, factors: [0.85, 1, 0.9, 1], km: "17000" },
  { price: 450_000, age: 6, rating: 9, factors: [0.8, 1, 0.8, 1], km: "12000" },
];

const bookMarket = (): MachineryMarketDto => ({
  offerLevel: "MUY_ALTA",
  usefulLife: 30,
  rounding: -4,
  characteristics: [],
  offers: BOOK_OFFERS.map((offer, index) => ({
    ...emptyOffer(index),
    description: `Sedán de prueba C${index + 1}`, brand: "Marca Inventada", model: "Sedán GT", year: String(2026 - offer.age), hours: offer.km,
    attachments: "Ninguno", date: "2026-12-15", price: offer.price, age: offer.age, rating: offer.rating,
    conservation: offer.factors[0], maintenance: offer.factors[1], technological: offer.factors[2], economic: offer.factors[3],
  })),
});

/** A generated table as it prints: its column names and its rows of text. */
type GeneratedTable = { title: string; columns: { id: string; name: string }[]; rows: { cells: Record<string, { value: string }> }[] };
const readTable = (table: unknown) => {
  const { title, columns, rows } = table as GeneratedTable;
  return { title, columns: columns.map((column) => column.name), rows: rows.map((row) => columns.map((column) => row.cells[column.id]?.value ?? "")) };
};

const subject: MachineryCostDto["item"] = { ...EMPTY_MACHINERY_ITEM, name: "Automóvil", brand: "Marca Inventada", model: "Sedán GT", year: "2022", hours: "63,500 km" };

test("the market of a vehicle gives the automobile book's homologated values (AI88, AI89, AI91)", () => {
  const input = toMachineryMarketEngineInput(bookMarket());
  assert.ok(input.ok);
  const result = computeMachineryMarket(input.input);
  // FEd of each offer, AR81–AR85.
  const bookAgeFactors = [0.8428348594768899, 0.8000624075730579, 0.794293251209032, 0.7655719451323924, 0.8859894989456109];
  result.offers.forEach((offer, index) => assert.ok(Math.abs(offer.ageFactor - bookAgeFactors[index]) < 1e-9, `FEd C${index + 1}`));
  const bookValues = [273116.42203918874, 169113.1914007551, 235428.5196583571, 253006.216427353, 255164.97569633595];
  result.offers.forEach((offer, index) => assert.ok(Math.abs(offer.value - bookValues[index]) < 1e-6, `V.N.R. C${index + 1}`));
  assert.ok(Math.abs(result.mean - 237165.865044398) < 1e-6);
  assert.ok(Math.abs(result.median - 253006.216427353) < 1e-6);
  assert.equal(result.value, 250_000);
});

test("the market of a vehicle prints the book's «RESUMEN DE COMPARABLES» with Kms; a machine's with Horas", () => {
  const market = bookMarket();
  const input = toMachineryMarketEngineInput(market);
  assert.ok(input.ok);
  const result = computeMachineryMarket(input.input);
  const tablesOf = (blocks: Block[]) => blocks.flatMap((block) => block.apartados.flatMap((apartado) => apartado.tables.map(readTable)));

  const vehicle = tablesOf(machineryMarketBlocks(market, subject, result, { vehicle: true }));
  const summary = vehicle.find((table) => table.title === "Resumen de comparables")!;
  assert.deepEqual(summary.columns, ["REF.", "Descripción", "Marca", "Modelo", "Año", "Kms", "Aditamentos", "Fecha", "Valor de Oferta"]);
  assert.deepEqual(summary.rows[0], ["C1", "Sedán de prueba C1", "Marca Inventada", "Sedán GT", "2018", "58420", "Ninguno", "2026-12-15", "$ 379,000.00"]);
  const characteristics = vehicle.find((table) => table.title === "Características técnicas")!;
  assert.deepEqual(characteristics.rows.find((row) => row[0] === "Kilómetros")?.slice(0, 3), ["Kilómetros", "63,500 km", "58420"]);
  assert.ok(!characteristics.rows.some((row) => row[0] === "Horas"));

  const machine = tablesOf(machineryMarketBlocks(market, subject, result));
  assert.equal(machine.find((table) => table.title === "Resumen de comparables")!.columns[5], "Horas", "a machine as before");
});

test("the cost of a vehicle gives the automobile book's V.N.R. and physical value (W41, V57, V59), with its use in km", () => {
  // «IV. ENF. COSTOS»: 25,000 USD at 17.65, age 4 of 30, rating 8, FCo 0.975, FMt 0.95, FOt 1, FOe 0.8; two attachments.
  const cost: MachineryCostDto = {
    item: {
      ...subject, quotedPrice: 25_000, exchangeRate: 17.65, otherFactor: 1, age: 4, usefulLife: 30, rating: 8,
      conservation: 0.975, maintenance: 0.95, technological: 1, economic: 0.8,
    },
    attachments: [
      { ref: "1", description: "Alerón", brand: "", supplier: "", source: "", quotationKind: "Nuevo Igual", quotedPrice: 15_000, fees: 0.02, engineering: 0, installation: 0.01, age: 10, usefulLife: 20, conservation: 0.95, maintenance: 1, technological: 1, economic: 1 },
      { ref: "2", description: "Película protectora", brand: "", supplier: "", source: "", quotationKind: "Nuevo Igual", quotedPrice: 65_000, fees: 0, engineering: 0, installation: 0, age: 5, usefulLife: 20, conservation: 0.95, maintenance: 1, technological: 1, economic: 1 },
    ],
    // The automobile book rounds the physical value to tens of thousands (V59); the MEH book to thousands.
    rounding: -4,
    conservationTwice: true,
  };
  const result = computeMachineryCost({
    item: {
      quotedPrice: 25_000, exchangeRate: 17.65, otherFactor: 1, expenses: [], age: 4, usefulLife: 30, rating: 8,
      factors: { conservation: 0.975, maintenance: 0.95, technological: 1, economic: 0.8 },
    },
    attachments: cost.attachments.map((row) => ({ ref: row.ref, quotedPrice: row.quotedPrice!, expenseRates: [row.fees, row.engineering, row.installation], age: row.age!, usefulLife: row.usefulLife!, factors: { conservation: 0.95, maintenance: 1, technological: 1, economic: 1 } })),
    conservationTwice: true,
    rounding: -4,
  });
  assert.ok(Math.abs(result.item.ageFactor - 0.9169344095026019) < 1e-9, "J41");
  assert.ok(Math.abs(result.item.value - 299806.6053710301) < 1e-6, "W41");
  assert.deepEqual(result.attachments.map((row) => Math.round(row.value * 100) / 100), [7338.75, 46312.5]);
  assert.ok(Math.abs(result.attachmentsTotal - 53651.25) < 1e-6, "V57");
  assert.equal(result.physicalValue, 350_000, "V59");

  const tables = machineryCostBlocks(cost, result, { vehicle: true }).flatMap((block) => block.apartados.flatMap((apartado) => apartado.tables.map(readTable)));
  const state = tables.find((table) => table.title === "Estado del bien")!;
  assert.equal(state.columns[1], "Kilometraje");
  assert.equal(state.rows[0][1], "63,500 km");
});
