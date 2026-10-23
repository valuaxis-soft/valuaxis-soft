import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { duplicateReasons } from "../src/features/valuations/calculation/comparable-duplicates";
import { parseComparableRows } from "../src/features/valuations/calculation/comparable-import";
import { OFFER_MAX_AGE_MONTHS, comparableWarnings } from "../src/features/valuations/calculation/comparable-review";
import { addMonths, comparableDataChanged, comparableValidity } from "../src/features/valuations/calculation/comparable-validity";
import { comparableInputSchema } from "../src/features/valuations/calculation/market-schemas";
import {
  buildComparableListHref,
  hasAdvancedFilters,
  parseComparableListParams,
} from "../src/features/valuations/comparable-base/comparable-list-params";
import { ComparableValidityLine } from "../src/features/valuations/components/calculation/comparable-validity-badge";

test("a comparable is valid six months from its capture or last update, the same months the review uses for an old offer", () => {
  assert.equal(OFFER_MAX_AGE_MONTHS, 6);
  assert.equal(addMonths("2026-10-23", 6), "2027-04-23");
  assert.equal(addMonths("2026-08-31", 6), "2027-02-28", "a day past the end of the month falls on its last day");
  assert.equal(addMonths("2027-08-31", 6), "2028-02-29");
  assert.deepEqual(comparableValidity("2026-04-23", "2026-10-23"), { updatedOn: "2026-04-23", validUntil: "2026-10-23", expired: false });
  assert.equal(comparableValidity("2026-04-23", "2026-10-24").expired, true);
  // A timestamp counts by its day in Mexico: 03:00 UTC on 24 oct is still 23 oct there.
  assert.equal(comparableValidity(new Date("2026-10-24T03:00:00Z"), "2026-10-24").updatedOn, "2026-10-23");
});

test("only a change of the comparable's data renews it; factors, regression and fields left out do not", () => {
  const stored = { location: "Juárez 12", area: 150, price: 3_000_000, landUse: null, extra: {}, address: { street: "Juárez", number: "12" } };
  assert.equal(comparableDataChanged(stored, { ...stored }), false);
  assert.equal(comparableDataChanged(stored, { ...stored, landUse: "", extra: { "custom:vista": "" } }), false, "empty is the same as nothing");
  assert.equal(comparableDataChanged(stored, { location: "Juárez 12", area: 150, price: 3_000_000 }), false, "a field left out keeps its value");
  assert.equal(comparableDataChanged(stored, { ...stored, price: 2_950_000 }), true);
  assert.equal(comparableDataChanged(stored, { ...stored, address: { number: "12", street: "Juárez", postalCode: "47180" } }), true);
  assert.equal(comparableDataChanged(stored, { ...stored, bedrooms: 3 }), true);
  assert.equal(comparableDataChanged(stored, { ...stored, factors: [{ type: "ZONA" }], regressionExcluded: true } as never), false);
});

test("an expired comparable is a warning of the review, never a block", () => {
  const base = { location: "Juárez 12", area: 100, sourceName: "Lamudi", contactName: "Ana", contactPhone: "33 1234 5678", offerDate: null, hasScreenshot: true };
  const context = { type: "TERRENO_VENTA" as const, subjectArea: null, today: "2026-10-23" };
  assert.deepEqual(comparableWarnings({ ...base, validity: comparableValidity("2026-05-01", context.today) }, context), []);
  const warnings = comparableWarnings({ ...base, validity: comparableValidity("2026-03-01", context.today) }, context);
  assert.deepEqual(warnings.map((warning) => warning.key), ["EXPIRED"]);
  assert.match(warnings[0].message, /Vencido/);
  assert.match(warnings[0].message, /1 sept?\.? 2026/);
});

test("the validity line shows the two dates and marks an expired comparable", () => {
  const html = renderToStaticMarkup(createElement(ComparableValidityLine, { validity: comparableValidity("2026-03-01", "2026-10-23") }));
  assert.match(html, /Fecha de alta \/ actualización/);
  assert.match(html, /1 mar 2026/);
  assert.match(html, /Vigente hasta/);
  assert.match(html, /1 sept?\.? 2026/);
  assert.match(html, /data-validity="VENCIDO"/);
  assert.match(renderToStaticMarkup(createElement(ComparableValidityLine, { validity: comparableValidity("2026-10-01", "2026-10-23") })), /Vigente</);
});

test("a record that matches in everything but a detail is a possible duplicate: same colonia, area and price", () => {
  const stored = { url: null, location: "Allende 30, col. Centro, Arandas", contactPhone: null, price: 1_500_000, area: 500 };
  assert.deepEqual(duplicateReasons({ ...stored, location: "Allende, col. Centro, Arandas", price: 1_505_000 }, stored), ["SIMILAR"]);
  assert.deepEqual(duplicateReasons({ ...stored, location: "Allende, col. Centro, Arandas", area: 520 }, stored), [], "another area");
  assert.deepEqual(duplicateReasons({ ...stored, location: "Allende, col. Las Fuentes, Tepatitlán" }, stored), [], "another place");
  assert.deepEqual(duplicateReasons({ ...stored, location: "Allende" }, stored), [], "no colonia to compare");
  assert.deepEqual(duplicateReasons(stored, stored), ["ADDRESS"], "the same address says it already");
});

test("the capture and the import take the land area, bedrooms, bathrooms and type of construction of a building", () => {
  const parsed = comparableInputSchema.safeParse({
    location: "Juárez 12", area: 150, price: 3_000_000, landUse: null, shape: null, zone: null, frontage: null, depth: null,
    topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
    factors: [], landArea: 250, bedrooms: 3, bathrooms: 2.5, constructionType: " Casa habitación ",
  });
  assert.ok(parsed.success);
  assert.equal(parsed.data.constructionType, "Casa habitación");
  const halves = comparableInputSchema.shape.bathrooms.safeParse(2.3);
  assert.equal(halves.success, false);
  assert.equal(comparableInputSchema.shape.bedrooms.safeParse(2.5).success, false);

  const sheet = [
    ["Ubicación", "Superficie construida (m²)", "Precio de oferta ($)", "Tipo de construcción", "Superficie de terreno (m²)", "Recámaras", "Baños"],
    ["Juárez 12, Arandas", 150, 3_000_000, "Casa habitación", 250, 3, 2.5],
    ["Hidalgo 8, Arandas", 90, 1_000_000, "", "", "dos", ""],
  ];
  const result = parseComparableRows(sheet, "INMUEBLE_VENTA");
  assert.deepEqual(result.missingColumns, []);
  const [house, broken] = result.rows;
  assert.equal(house.payload?.landArea, 250);
  assert.equal(house.payload?.bedrooms, 3);
  assert.equal(house.payload?.bathrooms, 2.5);
  assert.equal(house.payload?.constructionType, "Casa habitación");
  assert.equal(broken.payload, null);
  assert.match(broken.errors.join(" "), /Recámaras/);
});

test("the list's query string is read safely and written back the same", () => {
  const params = parseComparableListParams({
    q: "  Juárez   centro ", cliente: "Banco", municipio: "Arandas", cp: "47180", tipo: ["INMUEBLE_VENTA", "nada", "inmueble_venta"],
    operacion: "venta", terrenoMin: "1,250.5", construidaMax: "abc", recamaras: "3", banos: "2,5", desde: "2026-02-30", hasta: "2026-10-01",
    vigencia: "vencido", orden: "precio_desc", page: "3",
  });
  assert.equal(params.q, "Juárez centro");
  assert.deepEqual(params.types, ["INMUEBLE_VENTA"]);
  assert.equal(params.operation, "VENTA");
  assert.equal(params.landAreaMin, 1250.5);
  assert.equal(params.builtAreaMax, null, "not a number: left out");
  assert.equal(params.bathrooms, 2.5);
  assert.equal(params.from, null, "not a day: left out");
  assert.equal(params.to, "2026-10-01");
  assert.equal(params.validity, "VENCIDO");
  assert.equal(params.sort, "precio_desc");
  assert.equal(params.page, 3);
  assert.equal(parseComparableListParams({ cp: "4718" }).postalCode, "", "a postal code has five digits");
  assert.equal(parseComparableListParams({ orden: "DROP TABLE" }).sort, "reciente");
  assert.equal(hasAdvancedFilters(parseComparableListParams({ q: "x", orden: "antiguo" })), false);
  assert.equal(hasAdvancedFilters(params), true);

  const href = buildComparableListHref({ ...params, page: 1 });
  assert.deepEqual(parseComparableListParams(Object.fromEntries(
    [...new URL(href, "https://valuaxis.test").searchParams.keys()].map((key) => [key, new URL(href, "https://valuaxis.test").searchParams.getAll(key)]),
  )), { ...params, page: 1 });
  assert.equal(buildComparableListHref({}), "/comparables");
});
