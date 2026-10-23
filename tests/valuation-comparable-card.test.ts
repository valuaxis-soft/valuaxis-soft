import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coordinatesError,
  formatAddress,
  formatComparableId,
  parseComparableId,
  todayInMexico,
} from "../src/features/valuations/calculation/comparable-card";
import {
  addressKey,
  duplicateReasons,
  normalizeAddressText,
  phoneKey,
  samePrice,
  type DuplicateProbe,
} from "../src/features/valuations/calculation/comparable-duplicates";
import {
  BUILT_AREA_TOLERANCE,
  builtAreaDifference,
  comparableWarnings,
  isPortalName,
  monthsBetween,
  type WarningInput,
} from "../src/features/valuations/calculation/comparable-review";
import { comparableInputSchema, comparableReviewSchema } from "../src/features/valuations/calculation/market-schemas";
import { parseComparableSearchQuery, searchedTypes } from "../src/features/valuations/comparable-search/schemas";

test("a comparable's number reads C-00123, and is read back from what the appraiser types", () => {
  assert.equal(formatComparableId(123), "C-00123");
  assert.equal(formatComparableId(1), "C-00001");
  assert.equal(formatComparableId(123456), "C-123456");
  assert.equal(formatComparableId(null), null);
  assert.equal(formatComparableId(0), null);
  assert.equal(parseComparableId("C-00123"), 123);
  assert.equal(parseComparableId(" c123 "), 123);
  assert.equal(parseComparableId("00042"), 42);
  assert.equal(parseComparableId("Centro"), null);
  assert.equal(parseComparableId("C-0"), null);
});

test("the address parts make the line the dictamen prints", () => {
  assert.equal(
    formatAddress({ street: "Juárez", number: "12", neighborhood: "Centro", postalCode: "47180", municipality: "Arandas", state: "Jalisco" }),
    "Juárez 12, col. Centro, C.P. 47180, Arandas, Jalisco",
  );
  assert.equal(formatAddress({ municipality: "Arandas", state: " " }), "Arandas");
  assert.equal(formatAddress(null), "");
});

test("addresses are compared without accents, abbreviations or the words that name their parts", () => {
  assert.equal(normalizeAddressText("Av. Juárez #12-A, Col. Centro"), "avenida juarez 12 a centro");
  assert.equal(normalizeAddressText("Calle Benito Juárez No. 12"), "benito juarez 12");
  assert.deepEqual(addressKey({ location: "Calle Juárez 12, col. Centro, Arandas" })?.street, "juarez 12");
  assert.equal(addressKey({ location: "Arandas, Jalisco" }), null, "a town is not one property");
  assert.equal(addressKey({ location: "Calle Juárez, Arandas" }), null, "a street without a number is not one either");
  assert.equal(addressKey({ location: "", address: { street: "Av. Juárez", number: "12" } })?.street, "avenida juarez 12");
});

const probe = (overrides: Partial<DuplicateProbe> = {}): DuplicateProbe =>
  ({ url: null, location: "", address: null, contactPhone: null, price: 1_000_000, ...overrides });

test("the same property: same listing, same address, or same phone with the price within 1 %", () => {
  assert.deepEqual(duplicateReasons(
    probe({ url: "https://www.inmuebles24.com/propiedades/terreno-123.html#fotos" }),
    probe({ url: "http://inmuebles24.com/propiedades/terreno-123.html/" }),
  ), ["URL"]);
  assert.deepEqual(duplicateReasons(probe({ url: "https://portal.mx/a/1" }), probe({ url: "https://portal.mx/a/2" })), []);

  // A single location line against the parts of another capture.
  assert.deepEqual(duplicateReasons(
    probe({ location: "Calle Juárez #12, Col. Centro, Arandas" }),
    probe({ location: "", address: { street: "Juárez", number: "12", neighborhood: "Centro", municipality: "Arandas" } }),
  ), ["ADDRESS"]);
  // The same street and number in another town is another property.
  assert.deepEqual(duplicateReasons(probe({ location: "Juárez 12, Arandas" }), probe({ location: "Juárez 12, Tepatitlán" })), []);
  assert.deepEqual(duplicateReasons(probe({ location: "Juárez 12, Arandas" }), probe({ location: "Juárez 14, Arandas" })), []);

  assert.equal(phoneKey("+52 (348) 123-4567"), "3481234567");
  assert.equal(phoneKey("348 123 4567"), "3481234567");
  assert.equal(phoneKey("12-34"), null);
  assert.ok(samePrice(1_000_000, 1_010_000));
  assert.ok(!samePrice(1_000_000, 1_011_000));
  assert.deepEqual(duplicateReasons(
    probe({ contactPhone: "348 123 4567", price: 1_000_000 }),
    probe({ contactPhone: "+52 3481234567", price: 995_000 }),
  ), ["PHONE_PRICE"]);
  assert.deepEqual(duplicateReasons(
    probe({ contactPhone: "348 123 4567", price: 1_000_000 }),
    probe({ contactPhone: "348 123 4567", price: 1_200_000 }),
  ), [], "the same agent offering another property");
});

const comparable = (overrides: Partial<WarningInput> = {}): WarningInput => ({
  location: "Juárez 12, Arandas", address: null, area: 100, sourceName: "Inmuebles24", contactName: "Ana López", contactPhone: "3481234567",
  offerDate: "2026-10-01", consultedOn: "2026-10-01", hasScreenshot: true, ...overrides,
});
const keys = (input: WarningInput, type: "INMUEBLE_VENTA" | "TERRENO_VENTA" = "INMUEBLE_VENTA", subjectArea: number | null = 100) =>
  comparableWarnings(input, { type, subjectArea, today: "2026-10-22" }).map((warning) => warning.key);

test("±20 %: a building whose built area differs more from the subject's is flagged, never blocked", () => {
  assert.equal(BUILT_AREA_TOLERANCE, 0.2);
  assert.equal(builtAreaDifference(125, 100), 0.25);
  assert.equal(builtAreaDifference(null, 100), null);
  assert.deepEqual(keys(comparable({ area: 120 })), [], "exactly 20 % is within");
  assert.deepEqual(keys(comparable({ area: 80 })), []);
  assert.deepEqual(keys(comparable({ area: 120.5 })), ["BUILT_AREA"]);
  assert.deepEqual(keys(comparable({ area: 79 })), ["BUILT_AREA"]);
  const [warning] = comparableWarnings(comparable({ area: 150 }), { type: "INMUEBLE_VENTA", subjectArea: 100, today: "2026-10-22" });
  assert.match(warning.message, /50 % mayor/);
  assert.deepEqual(keys(comparable({ area: 300 }), "TERRENO_VENTA"), [], "land is not held to the rule");
  assert.deepEqual(keys(comparable({ area: 300 }), "INMUEBLE_VENTA", null), [], "without the subject's area there is nothing to compare");
});

test("the other warnings: no number, only the portal as contact, no screenshot, an old offer", () => {
  assert.deepEqual(keys(comparable({ location: "Calle Juárez, Arandas" })), ["NO_NUMBER"]);
  assert.deepEqual(keys(comparable({ location: "x", address: { street: "Juárez", number: "12" } })), []);
  assert.deepEqual(keys(comparable({ location: "Juárez 12", address: { street: "Juárez", municipality: "Arandas" } })), ["NO_NUMBER"]);

  assert.ok(isPortalName("Inmuebles24.com"));
  assert.ok(isPortalName("www.lamudi.com.mx"));
  assert.ok(isPortalName("Mercado Libre"));
  assert.ok(!isPortalName("Inmobiliaria Altos 360"));
  assert.deepEqual(keys(comparable({ contactName: "Inmuebles24", contactPhone: null })), ["PORTAL_CONTACT"]);
  assert.deepEqual(keys(comparable({ contactName: null, contactPhone: null })), ["PORTAL_CONTACT"]);
  assert.deepEqual(keys(comparable({ contactName: "Inmuebles24", contactPhone: "3481234567" })), [], "the advertiser's phone is enough");
  assert.deepEqual(keys(comparable({ contactName: "Ana López", contactPhone: null })), []);

  assert.deepEqual(keys(comparable({ hasScreenshot: false })), ["NO_SCREENSHOT"]);

  assert.equal(monthsBetween("2026-04-22", "2026-10-22"), 6);
  assert.equal(monthsBetween("2026-04-23", "2026-10-22"), 5);
  assert.deepEqual(keys(comparable({ offerDate: "2026-04-22" })), ["OLD_OFFER"]);
  assert.deepEqual(keys(comparable({ offerDate: "2026-05-01" })), []);
  assert.deepEqual(keys(comparable({ offerDate: null, consultedOn: "2026-01-10" })), ["OLD_OFFER"], "without an offer date, the consultation");
});

test("coordinates go both or none, within their ranges; today is Mexico City's", () => {
  assert.equal(coordinatesError(null, null), null);
  assert.equal(coordinatesError(20.7, -102.3), null);
  assert.match(coordinatesError(20.7, null) ?? "", /latitud y la longitud/);
  assert.match(coordinatesError(91, 0) ?? "", /latitud/);
  assert.match(coordinatesError(0, -181) ?? "", /longitud/);
  assert.equal(todayInMexico(new Date("2026-10-23T03:00:00Z")), "2026-10-22");
});

const base = {
  location: "Juárez 12", area: 100, price: 1_000_000, landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null,
  services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, factors: [],
};

test("the capture takes the new fields, optional, and checks them", () => {
  const parsed = comparableInputSchema.parse({
    ...base,
    address: { state: "Jalisco", municipality: "Arandas", postalCode: "47180", neighborhood: " ", street: "Juárez", number: "12" },
    urbanProximity: "INTERMEDIA", operationType: "VENTA", latitude: 20.7092, longitude: -102.3467,
    consultedOn: "2026-10-22", validUntil: null, listingText: "Vendo terreno en Arandas…",
  });
  assert.equal(parsed.address?.neighborhood, null, "an empty part is not kept");
  assert.equal(parsed.urbanProximity, "INTERMEDIA");
  assert.ok(comparableInputSchema.safeParse(base).success, "a client of before sends none of them");
  assert.equal(comparableInputSchema.safeParse({ ...base, latitude: 91 }).success, false);
  assert.equal(comparableInputSchema.safeParse({ ...base, address: { postalCode: "4718" } }).success, false);
  assert.equal(comparableInputSchema.safeParse({ ...base, urbanProximity: "CENTRO" }).success, false);
  assert.equal(comparableInputSchema.safeParse({ ...base, consultedOn: "22/10/2026" }).success, false);

  assert.deepEqual(comparableReviewSchema.parse({ status: "CON_OBSERVACIONES", checks: { photo: true, price: false } }),
    { status: "CON_OBSERVACIONES", checks: { photo: true, price: false }, notes: null });
  assert.equal(comparableReviewSchema.safeParse({ status: "APROBADO" }).success, false);
  assert.equal(comparableReviewSchema.safeParse({ status: "VERIFICADO", checks: { color: true } }).success, false);
});

test("the search takes filters, and the text may be left out when one is used", () => {
  const params = (values: Record<string, string>) => new URLSearchParams(values);
  const filtered = parseComparableSearchQuery(params({ tipo: "INMUEBLE_VENTA", estado: "Jalisco", municipio: "Arandas", cp: "47180", consultaDesde: "2026-01-01" }));
  assert.ok(filtered.ok);
  assert.equal(filtered.query.text, "");
  assert.deepEqual(filtered.query.filters, { state: "Jalisco", municipality: "Arandas", postalCode: "47180", consultedFrom: "2026-01-01" });

  const widened = parseComparableSearchQuery(params({ tipo: "TERRENO_VENTA", q: "centro", operacion: "TODAS" }));
  assert.ok(widened.ok);
  assert.deepEqual(widened.query.filters?.types, ["TERRENO_VENTA", "TERRENO_RENTA"]);
  assert.deepEqual(searchedTypes("INMUEBLE_RENTA"), ["INMUEBLE_RENTA"]);
  assert.deepEqual(searchedTypes("INMUEBLE_RENTA", "TODOS", "TODAS").sort(), ["INMUEBLE_RENTA", "INMUEBLE_VENTA", "TERRENO_RENTA", "TERRENO_VENTA"]);

  const rejected: [Record<string, string>, RegExp][] = [
    [{ tipo: "TERRENO_VENTA" }, /o usa un filtro/],
    [{ tipo: "TERRENO_VENTA", q: "ab", estado: "Jalisco" }, /al menos 3 letras/],
    [{ tipo: "TERRENO_VENTA", cp: "471" }, /5 dígitos/],
    [{ tipo: "TERRENO_VENTA", inmueble: "CASA" }, /Tipo de inmueble/],
    [{ tipo: "TERRENO_VENTA", consultaDesde: "2026-10-01", consultaHasta: "2026-09-01" }, /posterior/],
  ];
  for (const [values, message] of rejected) {
    const parsed = parseComparableSearchQuery(params(values));
    assert.ok(!parsed.ok, JSON.stringify(values));
    assert.match(parsed.error, message);
  }
});
