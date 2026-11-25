/**
 * Kinds of comparable, real estate and machinery apart, offers in dollars and
 * age (the appraiser's voice notes of 24 Nov 2026): «tú pones oficina en renta
 * y te salen oficinas», «no se van a mezclar los comparables de inmuebles en
 * maquinaria y equipo», «con un tipo de cambio», «la edad es un factor
 * primordial». Pure: no database.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ageFromYear, type ComparableListingDetails } from "../src/features/valuations/calculation/comparable-card";
import {
  COMPARABLE_CLASSES,
  comparableClassOf,
  comparableClassOfType,
  comparableClassOfValuation,
} from "../src/features/valuations/calculation/comparable-classes";
import {
  defaultExchangeRateSource,
  exchangeNote,
  missingExchangeRate,
  offerInPesos,
  priceInPesos,
  withOfferInPesos,
} from "../src/features/valuations/calculation/comparable-currency";
import { duplicateProbeOf } from "../src/features/valuations/calculation/comparable-duplicates";
import { parseComparableSheet, planRow } from "../src/features/valuations/calculation/comparable-import-plan";
import { PROPERTY_TYPE_OPTIONS, masterRowValues } from "../src/features/valuations/calculation/comparable-master";
import { buildMasterWorkbook } from "../src/features/valuations/calculation/comparable-master-workbook";
import { readComparableFile } from "../src/features/valuations/calculation/comparable-workbook";
import {
  BUILT_IN_KINDS,
  OTHER_MACHINERY_KIND,
  OTHER_REAL_ESTATE_KIND,
  addCustomKindTo,
  customKindKey,
  kindFromText,
  kindOfComparable,
  kindOptions,
  kindPlural,
  propertyTypeKeyOfKind,
  removeCustomKindFrom,
  resolveCustomKinds,
  withCustomKinds,
  withKindDetails,
  type ComparableKind,
} from "../src/features/valuations/calculation/comparable-kinds";
import { marketDocumentBlocks } from "../src/features/valuations/calculation/market-document";
import { comparableInputSchema } from "../src/features/valuations/calculation/market-schemas";
import { comparableWarnings } from "../src/features/valuations/calculation/comparable-review";
import {
  defaultMarketSettings,
  isComparableComplete,
  toMarketEngineInput,
  type ComparableDto,
  type MarketCalculationDto,
} from "../src/features/valuations/calculation/market-types";
import { classCondition, kindCondition } from "../src/features/valuations/comparable-search/own-base-sql";
import { searchedKindWords, suggestedWebSearchText, webListingSearchPrompt } from "../src/features/valuations/comparable-search/web-listings";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeMarketApproach } from "../src/features/valuations/engine/market";

const labels = (kindClass: "INMUEBLE" | "MAQUINARIA") => kindOptions(kindClass).map((kind) => kind.label);

test("the kinds of each class, in their order, with «Otro» last", () => {
  assert.deepEqual(labels("INMUEBLE"), [
    "Terreno / Lote", "Casa habitación", "Casa en condominio", "Departamento", "Oficina", "Local comercial", "Bodega / Nave industrial", "Edificio", "Otro",
  ]);
  assert.deepEqual(labels("MAQUINARIA"), [
    "Automóvil", "Camioneta", "Camión", "Motocicleta", "Maquinaria de construcción", "Maquinaria industrial / de producción", "Equipo", "Aeronave",
    "Embarcación", "Otro",
  ]);
  // Every key is once, and each kind belongs to one class.
  assert.equal(new Set(BUILT_IN_KINDS.map((kind) => kind.key)).size, BUILT_IN_KINDS.length);
  assert.deepEqual([...new Set(BUILT_IN_KINDS.map((kind) => kind.class))], [...COMPARABLE_CLASSES]);
});

test("the firm extends the list like the units: written, ticked, kept once, offered before «Otro»", () => {
  const first = addCustomKindTo([], "  Retroexcavadora ", "MAQUINARIA");
  assert.equal(first.added, true);
  assert.deepEqual(first.kind, { key: "custom:retroexcavadora", label: "Retroexcavadora", class: "MAQUINARIA" });
  // The same name however written, or one of Valuaxis's, adds nothing and the comparable takes the one there is.
  const again = addCustomKindTo(first.kinds, "RETROEXCAVADORA", "MAQUINARIA");
  assert.equal(again.added, false);
  assert.equal(again.kind?.key, "custom:retroexcavadora");
  const builtIn = addCustomKindTo(first.kinds, "oficina", "INMUEBLE");
  assert.equal(builtIn.added, false);
  assert.equal(builtIn.kind?.key, "OFICINA");
  assert.equal(addCustomKindTo(first.kinds, "Nave industrial", "INMUEBLE").kind?.key, "BODEGA", "either half of «Bodega / Nave industrial»");
  const farm = addCustomKindTo(first.kinds, "Granja", "INMUEBLE");
  assert.equal(farm.added, true);
  const options = kindOptions("MAQUINARIA", farm.kinds);
  assert.equal(options.at(-2)?.label, "Retroexcavadora");
  assert.equal(options.at(-1)?.key, OTHER_MACHINERY_KIND);
  assert.ok(!options.some((kind) => kind.label === "Granja"), "a kind of the other class is not offered");
  // Stored and read back; anything malformed is left out.
  // Kept beside the firm's units and its other lists, in the same JSON list of the organization, without touching them.
  const others = ["piezas", { lista: "queSeValua", clase: "MAQUINARIA", nombre: "Grúa" }];
  const stored = withCustomKinds(others, farm.kinds);
  assert.deepEqual(stored.slice(0, 2), others);
  assert.deepEqual(stored[2], { lista: "tipoComparable", clase: "MAQUINARIA", nombre: "Retroexcavadora" });
  assert.deepEqual(resolveCustomKinds(stored), farm.kinds);
  assert.deepEqual(withCustomKinds(stored, []), others);
  assert.deepEqual(resolveCustomKinds([{ lista: "tipoComparable", clase: "INMUEBLE", nombre: "" }, { lista: "tipoComparable", clase: "BARCO", nombre: "Avión" }, "x"]), []);
  assert.equal(customKindKey("Grúa torre"), "custom:grua-torre");
  assert.deepEqual(removeCustomKindFrom(farm.kinds, "custom:granja").kinds, first.kinds);
});

test("a kind written as text: Valuaxis's, the firm's, words of before, or «Otro» with the text kept", () => {
  const custom: ComparableKind[] = [{ key: "custom:retroexcavadora", label: "Retroexcavadora", class: "MAQUINARIA" }];
  assert.equal(kindFromText("Casa", null)?.key, "CASA_HABITACION");
  assert.equal(kindFromText("Casa en condominio", null)?.key, "CASA_CONDOMINIO");
  assert.equal(kindFromText("Bodega", null)?.key, "BODEGA");
  assert.equal(kindFromText("Terreno rústico", null)?.key, "TERRENO");
  assert.equal(kindFromText("Consultorio", null)?.key, "OFICINA");
  assert.equal(kindFromText("Equipo y maquinaria", null)?.key, "EQUIPO");
  assert.equal(kindFromText("retroexcavadora", null, custom)?.key, "custom:retroexcavadora");
  assert.deepEqual(kindFromText("Salón de eventos", "INMUEBLE"), { key: OTHER_REAL_ESTATE_KIND, label: "Salón de eventos", class: "INMUEBLE" });
  assert.deepEqual(kindFromText("Tractor", "MAQUINARIA"), { key: OTHER_MACHINERY_KIND, label: "Tractor", class: "MAQUINARIA" });
});

test("a comparable of before reads its kind from its market or its type of construction", () => {
  assert.equal(kindOfComparable({ type: "TERRENO_VENTA", constructionType: null })?.key, "TERRENO");
  assert.equal(kindOfComparable({ type: "INMUEBLE_VENTA", constructionType: "Departamento en torre" })?.key, "DEPARTAMENTO");
  assert.equal(kindOfComparable({ type: "INMUEBLE_VENTA", constructionType: "Moderna" }), null);
  // A captured kind wins; «Otro» shows its name.
  const other = kindOfComparable({ type: "INMUEBLE_VENTA", constructionType: "Casa", propertyDetails: { kind: OTHER_REAL_ESTATE_KIND, kindLabel: "Granja" } });
  assert.deepEqual(other, { key: OTHER_REAL_ESTATE_KIND, label: "Granja", class: "INMUEBLE" });
  assert.equal(propertyTypeKeyOfKind({ key: "CASA_CONDOMINIO", label: "", class: "INMUEBLE" }), "CASA_HABITACION");
  assert.equal(propertyTypeKeyOfKind({ key: "custom:avion", label: "Avión", class: "MAQUINARIA" }), "MAQUINARIA_EQUIPO");
  // Saved, a kind of Valuaxis takes its class and name; the schema refuses an unknown key.
  assert.deepEqual(withKindDetails({ kind: "CAMION", kindLabel: "x", assetClass: "INMUEBLE" }), { kind: "CAMION", kindLabel: "Camión", assetClass: "MAQUINARIA" });
  assert.equal(comparableInputSchema.shape.propertyDetails.safeParse({ kind: "NAVE_ESPACIAL" }).success, false);
  assert.equal(comparableInputSchema.shape.propertyDetails.safeParse({ kind: "custom:grua-torre", kindLabel: "Grúa torre", assetClass: "MAQUINARIA" }).success, true);
});

test("real estate and machinery never mix: markets, valuations, duplicates, the import and the SQL of the base", () => {
  assert.equal(comparableClassOfType("TERRENO_VENTA"), "INMUEBLE");
  assert.equal(comparableClassOfType("INMUEBLE_RENTA"), "INMUEBLE");
  assert.equal(comparableClassOfType("MAQUINARIA_VENTA"), "MAQUINARIA");
  assert.equal(comparableClassOfValuation("maquinaria_equipo"), "MAQUINARIA");
  assert.equal(comparableClassOfValuation("casa_habitacion"), "INMUEBLE");
  assert.equal(comparableClassOf({ assetClass: "MAQUINARIA" }), "MAQUINARIA");
  // Before kinds, «Equipo y maquinaria» as the type of construction already said it (3 Nov 2026).
  assert.equal(comparableClassOf({ constructionType: "Equipo y maquinaria" }), "MAQUINARIA");
  assert.equal(comparableClassOf({ constructionType: "Casa habitación" }), "INMUEBLE");
  const probe = duplicateProbeOf({
    url: null, location: "x", contactPhone: null, price: 1, area: 1, sourceName: null, propertyDetails: { assetClass: "MAQUINARIA" },
  });
  assert.equal(probe.assetClass, "MAQUINARIA");
  // A row of machinery imported from a market goes to the base, never into the valuation's market.
  const payload = comparableInputSchema.parse({
    location: "Patio de maquinaria, Arandas", area: null, price: 950_000, landUse: null, shape: null, zone: null, frontage: null, depth: null,
    topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, factors: [],
    propertyDetails: { kind: "MAQUINARIA_CONSTRUCCION", assetClass: "MAQUINARIA" },
  });
  const origin = { kind: "valuation" as const, valuationId: "v", valuationFolio: "AV-1", type: "INMUEBLE_VENTA" as const };
  const planned = planRow({ type: "INMUEBLE_VENTA", payload, useStatus: "PENDIENTE", valuationFolio: null }, origin, "AMBOS", () => null);
  assert.deepEqual(planned.target, { kind: "base", type: "INMUEBLE_VENTA" });
  assert.match(planned.warnings.join(" "), /maquinaria y equipo/);
  assert.equal(planRow({ type: "INMUEBLE_VENTA", payload, useStatus: "PENDIENTE", valuationFolio: null }, origin, "AVALUO", () => null).target.kind, "skip");
  // The SQL compares the class and the kind of the snapshot (and the words of before).
  const sql = classCondition("INMUEBLE")[0];
  assert.match(sql.sql, /assetClass/);
  assert.deepEqual(sql.values, ["INMUEBLE"]);
  assert.deepEqual(classCondition(null), []);
  const kind = kindCondition("DEPARTAMENTO")[0];
  assert.match(kind.sql, /'kind'/);
  assert.deepEqual(kind.values, ["DEPARTAMENTO", "^depa"]);
});

test("an offer in dollars: the calculation takes its pesos at the rate; without a rate it waits", () => {
  const offer = offerInPesos({ currency: "USD", price: 50_000, exchangeRate: 18.34562, exchangeRateDate: "2026-11-24" });
  // The rate is kept with the four decimals the DOF publishes.
  assert.equal(offer.price, 917_280);
  assert.deepEqual(offer.listing, {
    currency: "USD", priceInCurrency: 50_000, exchangeRate: 18.3456, exchangeRateDate: "2026-11-24",
    exchangeRateSource: "Tipo de cambio FIX publicado en el DOF del 24/11/2026",
  });
  assert.equal(defaultExchangeRateSource(null), "Tipo de cambio FIX publicado en el DOF del dd/mm/aaaa");
  // Without a rate there are no pesos: the comparable does not enter the calculation, and it is warned.
  const waiting: ComparableListingDetails = { currency: "USD", priceInCurrency: 50_000, exchangeRate: null };
  assert.equal(priceInPesos({ price: 50_000, listingDetails: waiting }), null);
  assert.equal(isComparableComplete({ area: 100, price: 50_000, listingDetails: waiting }), false);
  assert.equal(missingExchangeRate({ listingDetails: waiting }), true);
  const warnings = comparableWarnings(
    { location: "Calle 1", area: 100, sourceName: null, contactName: "Ana", contactPhone: "3480000000", offerDate: null, hasScreenshot: true, listingDetails: waiting },
    { type: "TERRENO_VENTA", subjectArea: null, today: "2026-11-24" },
  );
  assert.ok(warnings.some((warning) => warning.key === "NO_EXCHANGE_RATE"));
  // What is saved: the client of the card sends the dollars and the rate, and the price becomes the pesos.
  const sent: { price: number | null; listingDetails: ComparableListingDetails } = { price: 1, listingDetails: { currency: "USD", priceInCurrency: 50_000, exchangeRate: 20 } };
  const saved = withOfferInPesos(sent);
  assert.equal(saved.price, 1_000_000);
  assert.equal(saved.listingDetails?.exchangeRateSource, "Tipo de cambio FIX publicado en el DOF del dd/mm/aaaa");
  // A client of before sent the dollars as the price.
  assert.equal(withOfferInPesos({ price: 50_000, listingDetails: { currency: "USD", exchangeRate: 20 } }).price, 1_000_000);
  assert.deepEqual(withOfferInPesos({ price: 5, listingDetails: { currency: "MXN" } }), { price: 5, listingDetails: { currency: "MXN" } });
  assert.equal(exchangeNote({ price: 917_280, listingDetails: { currency: "USD", priceInCurrency: 50_000, exchangeRate: 18.3456, exchangeRateSource: "DOF" } }),
    "US$50,000.00 × 18.3456 = $917,280.00 (DOF)");
  assert.equal(exchangeNote({ price: 5, listingDetails: { currency: "MXN" } }), null);
});

/** The Arandas land comparables (VI. ENF. MERCADO VENTA, rows 42–46): 9,000 adopted, 1,528,000 of value. */
function landMarket(third: Partial<ComparableDto>): MarketCalculationDto {
  const negotiation = [{ type: "NEGOCIACION" as const, value: 0.95, subjectRating: null, comparableRating: null, justification: null }];
  const comparable = (reference: number, area: number, price: number | null, extra: Partial<ComparableDto> = {}): ComparableDto => ({
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price,
    landUse: null, shape: "Regular", zone: "Calle Tipo", frontage: 8, depth: 17.5, topography: null, services: "Completos", notes: null,
    sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, photos: [], factors: negotiation, ...extra,
  });
  return {
    settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 169.78, surfacePower: 6, adoptedUnitValue: 9000, rounding: -2 },
    comparables: [
      comparable(1, 140, 1260000), comparable(2, 140, 1220000), comparable(3, 192.5, 2032590, third), comparable(4, 196.62, 2261130),
    ],
    locked: false,
  };
}

test("the firm's book with one offer in dollars gives the same value: 1,528,000", () => {
  // Comparable 3 published at US$101,629.50 with a rate of 20.0000: its pesos are the 2,032,590 of the book.
  const dollars = landMarket({ price: 2032590, listingDetails: { currency: "USD", priceInCurrency: 101_629.5, exchangeRate: 20 } });
  const input = toMarketEngineInput(dollars);
  assert.ok(input.ok);
  assert.equal(input.input.comparables[2].price, 2032590);
  assert.equal(computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG).value, 1528000);
  // Without the rate, comparable 3 waits and the homologation is of the other three.
  const waiting = toMarketEngineInput(landMarket({ price: null, listingDetails: { currency: "USD", priceInCurrency: 101_629.5 } }));
  assert.ok(waiting.ok);
  assert.deepEqual(waiting.input.comparables.map((comparable) => comparable.id), ["1", "2", "4"]);
  // The dictamen prints the dollars, the rate and its source under the offers.
  const result = computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG);
  const printed = JSON.stringify(marketDocumentBlocks(dollars, result));
  assert.match(printed, /Ref\. 3: US\$101,629\.50 × 20\.0000 = \$2,032,590\.00 \(Tipo de cambio FIX publicado en el DOF del dd\/mm\/aaaa\)\./);
  assert.doesNotMatch(JSON.stringify(marketDocumentBlocks(landMarket({}), result)), /US\$/, "a market in pesos prints as always");
});

test("age from the model year and the valuation's day, editable afterwards", () => {
  assert.equal(ageFromYear(2018, "2026-11-24"), 8);
  assert.equal(ageFromYear(2026, "2026-01-02"), 0);
  assert.equal(ageFromYear(2030, "2026-11-24"), null, "a year after the valuation is not an age");
  assert.equal(ageFromYear(null, "2026-11-24"), null);
  assert.equal(comparableInputSchema.shape.propertyDetails.safeParse({ year: 2018, age: 8 }).success, true);
  assert.equal(comparableInputSchema.shape.propertyDetails.safeParse({ year: 18.5 }).success, false);
});

test("«Buscar con IA» asks for the kind chosen: offices, backhoes; with the market's words without one", () => {
  const subject = { propertyType: "Oficina", neighborhood: "Centro", municipality: "Villa Ejemplo", state: "Jalisco", address: null, area: 120, landUse: null };
  const office: ComparableKind = { key: "OFICINA", label: "Oficina", class: "INMUEBLE" };
  assert.equal(
    suggestedWebSearchText("INMUEBLE_RENTA", subject, office),
    "Oficinas en renta en Villa Ejemplo, Jalisco, en la colonia Centro o cerca de ella, de 84 a 160 m² de construcción (el sujeto mide 120 m²). "
    + "Necesito cinco, con superficie, precio, zona, características y la liga de cada anuncio.",
  );
  const backhoe: ComparableKind = { key: "custom:retroexcavadora", label: "Retroexcavadora", class: "MAQUINARIA" };
  assert.equal(
    suggestedWebSearchText("INMUEBLE_VENTA", subject, backhoe),
    "Retroexcavadoras en venta en Villa Ejemplo, Jalisco. Necesito cinco, con precio, marca, modelo, año, horas de uso o kilometraje, ubicación y la liga de cada anuncio.",
  );
  assert.equal(kindPlural({ key: "LOCAL_COMERCIAL", label: "Local comercial" }), "Locales comerciales");
  assert.equal(kindPlural({ key: "custom:avion", label: "Avión" }), "Aviones");
  assert.equal(kindPlural({ key: OTHER_MACHINERY_KIND, label: "Tractor" }), "Tractores");
  assert.equal(searchedKindWords("INMUEBLE_RENTA", office), "oficinas en renta");
  assert.equal(searchedKindWords("TERRENO_VENTA", null), "terrenos en venta");
  // The rules are the same for every search (and the 5-per-search limit stays); what changes is in the request.
  const prompt = webListingSearchPrompt({ type: "INMUEBLE_VENTA", kind: backhoe, text: "retroexcavadoras en Jalisco", previous: [], knownUrls: [], count: 5 }, "2026-11-24");
  assert.match(prompt.user, /Tipo de comparable que se busca: Retroexcavadoras en venta\./);
  assert.match(prompt.user, /Clase de bien: maquinaria y equipo/);
  assert.match(prompt.user, /reporta como máximo cinco anuncios/);
  const plain = webListingSearchPrompt({ type: "INMUEBLE_VENTA", text: "casas en Arandas", previous: [], knownUrls: [], count: 5 }, "2026-11-24");
  assert.equal(prompt.system, plain.system);
  assert.doesNotMatch(plain.user, /Clase de bien/);
  assert.match(prompt.system, /información no confiable/);
  assert.match(prompt.system, /Nunca escribas, completes ni corrijas una dirección web de memoria/);
});

test("Excel: the kinds the app has, unknown ones as «Otro» with the text kept, dollars with their rate and the year, back and forth", async () => {
  const machine = {
    id: "m", reference: 1, folio: 77, location: "Patio Ficticio 3, Arandas", area: null, price: 1_834_560,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: "Portal Ejemplo", contactName: null, contactPhone: null, url: "https://portal.example/maquina/1", offerDate: "2026-11-20",
    operationType: "VENTA", constructionType: null,
    propertyDetails: { kind: "custom:retroexcavadora", kindLabel: "Retroexcavadora", assetClass: "MAQUINARIA", year: 2018, age: 8 },
    listingDetails: { currency: "USD", priceInCurrency: 100_000, exchangeRate: 18.3456, exchangeRateDate: "2026-11-24", exchangeRateSource: "Tipo de cambio FIX publicado en el DOF del 24/11/2026" },
    photos: [], factors: [],
  } as unknown as ComparableDto;
  const values = masterRowValues(machine, "INMUEBLE_VENTA", { valuationFolio: null, includeContact: false });
  assert.equal(values.propertyType, "Retroexcavadora");
  assert.equal(values.price, 100_000, "the row carries the dollars");
  assert.equal(values.currency, "USD");
  assert.equal(values.exchangeRate, 18.3456);
  assert.equal(values.year, 2018);
  const buffer = await buildMasterWorkbook({ rows: [values] });
  const file = await readComparableFile(buffer, "exportado.xlsx");
  const custom: ComparableKind[] = [{ key: "custom:retroexcavadora", label: "Retroexcavadora", class: "MAQUINARIA" }];
  const [row] = parseComparableSheet(file.rows, { defaultType: null, customKinds: custom }).rows;
  assert.deepEqual(row.errors, []);
  assert.equal(row.type, "INMUEBLE_VENTA");
  const payload = row.payload!;
  assert.equal(payload.price, 1_834_560, "the pesos at the rate");
  assert.deepEqual(
    [payload.listingDetails?.currency, payload.listingDetails?.priceInCurrency, payload.listingDetails?.exchangeRate, payload.listingDetails?.exchangeRateDate],
    ["USD", 100_000, 18.3456, "2026-11-24"],
  );
  assert.deepEqual(
    [payload.propertyDetails?.kind, payload.propertyDetails?.assetClass, payload.propertyDetails?.year, payload.propertyDetails?.age],
    ["custom:retroexcavadora", "MAQUINARIA", 2018, 8],
  );
  assert.equal(payload.constructionType, null, "a machine has no type of construction");
  // Without the firm's list nothing says it is a machine: «Otro» (of real estate), the name kept as written, with a warning.
  const [unknown] = parseComparableSheet(file.rows, { defaultType: null }).rows;
  assert.deepEqual([unknown.payload?.propertyDetails?.kind, unknown.payload?.propertyDetails?.kindLabel], [OTHER_REAL_ESTATE_KIND, "Retroexcavadora"]);
  assert.match(unknown.warnings.join(" "), /no está en la lista de tipos: se guarda como «Otro»/);
  // The template lists the kinds the card offers (FAL-20), both classes, not the twelve of before.
  assert.ok(PROPERTY_TYPE_OPTIONS.includes("Casa en condominio") && PROPERTY_TYPE_OPTIONS.includes("Maquinaria de construcción"));
  assert.ok(!PROPERTY_TYPE_OPTIONS.includes("Hotel"));
});
