import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonthsToIsoDate, formatValuationFolio, normalizeFolioPrefix, todayInMexico } from "../src/features/firm/firm-rules";
import { firmSettingsSchema } from "../src/features/firm/firm-schemas";
import { caratulaSection } from "../src/features/valuations/sections/caratula";
import { hydrateGeneralCaratulaTemplate } from "../src/features/valuations/services/general-valuation-template";

test("the validity adds calendar months and clamps to the month's last day", () => {
  assert.equal(addMonthsToIsoDate("2026-09-28", 6), "2027-03-28");
  assert.equal(addMonthsToIsoDate("2026-08-31", 6), "2027-02-28");
  assert.equal(addMonthsToIsoDate("2027-08-31", 6), "2028-02-29");
  assert.equal(addMonthsToIsoDate("2026-12-15", 1), "2027-01-15");
});

test("today is the date in Mexico City, not the server's", () => {
  // 03:00 UTC on 29 Sep is still 28 Sep in Guadalajara.
  assert.equal(todayInMexico(new Date("2026-09-29T03:00:00Z")), "2026-09-28");
});

test("folio prefixes are uppercase letters and digits", () => {
  assert.equal(normalizeFolioPrefix(" vda-26 "), "VDA26");
  assert.equal(formatValuationFolio("VDA", 12), "VDA-0012");
});

const valid = {
  legalName: "Valuadores de los Altos S.A. de C.V.",
  rfc: "val010101ab1",
  address: "Av. Despacho 100",
  phone: "33 1111 1111",
  email: "Contacto@Despacho.MX",
  appraiserName: "Ing. Álvaro Gutiérrez",
  appraiserRegistration: "CED-12345",
  validityMonths: 6,
  folioPrefix: "vda",
};

test("firm settings are normalized and empty texts become null", () => {
  const parsed = firmSettingsSchema.parse({ ...valid, address: "  ", phone: "" });
  assert.equal(parsed.rfc, "VAL010101AB1");
  assert.equal(parsed.email, "contacto@despacho.mx");
  assert.equal(parsed.folioPrefix, "VDA");
  assert.equal(parsed.address, null);
  assert.equal(parsed.phone, null);
});

test("invalid RFC, email, validity or prefix are rejected", () => {
  assert.equal(firmSettingsSchema.safeParse({ ...valid, rfc: "ABC" }).success, false);
  assert.equal(firmSettingsSchema.safeParse({ ...valid, email: "no-es-correo" }).success, false);
  assert.equal(firmSettingsSchema.safeParse({ ...valid, validityMonths: 0 }).success, false);
  assert.equal(firmSettingsSchema.safeParse({ ...valid, validityMonths: 25 }).success, false);
  assert.equal(firmSettingsSchema.safeParse({ ...valid, folioPrefix: "--" }).success, false);
});

test("a new valuation shows its date and validity in the carátula's DATOS DEL AVALÚO too", () => {
  const hydrated = hydrateGeneralCaratulaTemplate(structuredClone(caratulaSection), { valuationDate: "2026-09-28", validUntil: "2027-03-28" });
  const block = hydrated.blocks.find((item) => item.id === "caratula-block-4-datos-del-avaluo");
  const values = Object.fromEntries(block!.concepts.map((concept) => [concept.label, concept.value]));
  assert.match(String(values["Fecha de avaluo"]), /28 de septiembre de 2026/i);
  assert.match(String(values["Vigencia de avaluo"]), /28 de marzo de 2027/i);
});
