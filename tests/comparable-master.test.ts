import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";

import { canonicalUrl, canonicalUrlKey, duplicateReasons } from "../src/features/valuations/calculation/comparable-duplicates";
import { unitPriceByBasis } from "../src/features/valuations/calculation/comparable-card";
import type { CellValue } from "../src/features/valuations/calculation/comparable-import";
import { importedReview, parseComparableSheet, planRow } from "../src/features/valuations/calculation/comparable-import-plan";
import {
  MASTER_COLUMNS,
  MASTER_HEADER_ROW,
  columnLetter,
  findMasterHeader,
  masterRowValues,
  monthlyAndAnnualRent,
  parseDestination,
  propertyTypeKeyOf,
  resolveComparableType,
  type SheetRow,
} from "../src/features/valuations/calculation/comparable-master";
import { buildMasterWorkbook } from "../src/features/valuations/calculation/comparable-master-workbook";
import { readComparableFile } from "../src/features/valuations/calculation/comparable-workbook";
import type { ComparableDto } from "../src/features/valuations/calculation/market-types";

const headers = MASTER_COLUMNS.map((column) => column.header);
/** A master sheet: the header row at row 6 and the given rows as {header: value}. */
function masterSheet(rows: Array<Record<string, CellValue>>): CellValue[][] {
  const sheet: CellValue[][] = [["VALUAXIS SOFT"], [], [], [], ["01 CONTROL"], headers];
  for (const row of rows) sheet.push(headers.map((header) => row[header] ?? null));
  return sheet;
}

const land = {
  "Estado de uso": "Aceptado", "Tipo de inmueble": "Terreno", "Operación": "Venta", "Portal / fuente": "Inmuebles24",
  "ID publicación": "145-998", "Calle y número": "Hidalgo 12", "Colonia / localidad": "Centro", "Municipio": "Arandas",
  "Estado": "Jalisco", "Código postal": 1000, "Sup. terreno (m²)": 250, "Precio de oferta": "$1,250,000", "Moneda": "MXN",
  "Base del unitario": "Terreno m²", "URL de publicación": "https://www.inmuebles24.com/propiedades/145-998.html?utm=x#fotos",
  "Datos verificados": "Sí", "Fecha de consulta": "15/10/2026",
};

test("the master template has the four sheets, grouped headers at row 6, dropdowns, formulas and no example rows", async () => {
  const buffer = await buildMasterWorkbook({ valuationFolio: "AV-2026-0012" });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["INICIO", "COMPARABLES", "DICCIONARIO", "CATALOGOS"]);
  const start = workbook.getWorksheet("INICIO")!;
  assert.equal(start.getCell("D7").value, "Ambos");
  assert.equal(start.getCell("J7").value, "AV-2026-0012");
  assert.match(JSON.stringify(start.getCell("A14").value), /COUNTIF/);
  const sheet = workbook.getWorksheet("COMPARABLES")!;
  assert.deepEqual((sheet.getRow(MASTER_HEADER_ROW).values as unknown[]).slice(1), headers);
  const unit = MASTER_COLUMNS.findIndex((column) => column.key === "unitPrice");
  assert.match(String((sheet.getCell(7, unit + 1).value as { formula: string }).formula), /IFERROR/);
  const type = MASTER_COLUMNS.findIndex((column) => column.key === "operation");
  assert.equal(sheet.getCell(7, type + 1).dataValidation?.type, "list");
  assert.match(String(sheet.getCell(7, type + 1).dataValidation?.formulae?.[0]), /^CATALOGOS!/);
  // Read back, the template has no comparables, and INICIO's destination comes with it.
  const file = await readComparableFile(buffer, "plantilla.xlsx");
  assert.equal(file.destination, "AMBOS");
  const parsed = parseComparableSheet(file.rows, { defaultType: null });
  assert.equal(parsed.format, "MAESTRA");
  assert.equal(parsed.rows.length, 0);
});

test("headers tell the master workbook from a market's template", () => {
  assert.equal(findMasterHeader(masterSheet([])), MASTER_HEADER_ROW - 1);
  assert.equal(findMasterHeader([["Ubicación", "Superficie del terreno (m²)", "Precio de oferta ($)"]]), -1);
  // The appraiser's own workbook calls the street column "Ubicación / calle" and still reads.
  assert.equal(findMasterHeader([["REF / ID", "Folio avalúo", "Estado de uso", "Tipo de inmueble", "Operación", "Ubicación / calle"]]), 0);
  const market = parseComparableSheet([["Ubicación", "Precio de oferta ($)"], ["Calle 1", 100]], { defaultType: null });
  assert.equal(market.needsType, true);
  const typed = parseComparableSheet([["Ubicación", "Precio de oferta ($)"], ["Calle 1", 100]], { defaultType: "TERRENO_VENTA" });
  assert.equal(typed.format, "MERCADO");
  assert.equal(typed.rows[0].type, "TERRENO_VENTA");
});

test("a master row maps type, structured location, details and recomputes the unit price", () => {
  const { rows } = parseComparableSheet(masterSheet([land]), { defaultType: null });
  const [row] = rows;
  assert.deepEqual(row.errors, []);
  assert.equal(row.type, "TERRENO_VENTA");
  assert.equal(row.payload?.area, 250);
  assert.equal(row.payload?.price, 1_250_000);
  assert.deepEqual(row.payload?.address, { street: "Hidalgo 12", neighborhood: "Centro", subdivision: null, municipality: "Arandas", state: "Jalisco", postalCode: "01000", number: null });
  assert.equal(row.payload?.location, "Hidalgo 12, col. Centro, C.P. 01000, Arandas, Jalisco");
  assert.equal(row.payload?.listingDetails?.publicationId, "145-998");
  assert.equal(row.payload?.propertyDetails?.unitBasis, "TERRENO_M2");
  assert.equal(row.payload?.consultedOn, "2026-10-15");
  assert.equal(row.summary.unitPrice, 5000);
  assert.equal(row.useStatus, "ACEPTADO");
  assert.equal(row.verified, "SI");
  assert.equal(row.row, 7);
});

test("unit price by basis: land m², built m² and land hectares", () => {
  const areas = { landArea: 2500, builtArea: 200 };
  assert.equal(unitPriceByBasis(1_000_000, "TERRENO_M2", areas), 400);
  assert.equal(unitPriceByBasis(1_000_000, "CONSTRUCCION_M2", areas), 5000);
  assert.equal(unitPriceByBasis(1_000_000, "TERRENO_HA", areas), 4_000_000);
  assert.equal(unitPriceByBasis(1_000_000, "CONSTRUCCION_M2", { landArea: 2500, builtArea: null }), null);
});

test("conditional rules: errors skip the row, warnings never do", () => {
  const { rows } = parseComparableSheet(masterSheet([
    { "Calle y número": "Sin tipo 1", "Precio de oferta": 100 },
    { ...land, "Operación": "Permuta" },
    { ...land, "Latitud": 20.7 },
    { "Tipo de inmueble": "Casa habitación", "Operación": "Renta", "Calle y número": "Juárez 4", "Municipio": "Arandas", "Precio de oferta": 240_000,
      "Periodo renta": "Anual", "Moneda": "USD", "Origen de dato": "Portal inmobiliario", "Sup. construcción (m²)": 120 },
    { ...land, "Estado de uso": "Descartado" },
    { ...land, "Sup. terreno (m²)": null, "Precio de oferta": null },
  ]), { defaultType: null });
  assert.match(rows[0].errors.join(" "), /Falta el tipo de inmueble/);
  assert.match(rows[1].errors.join(" "), /Operación: «Permuta» no es una opción/);
  assert.match(rows[2].errors.join(" "), /latitud y la longitud/);
  const rent = rows[3];
  assert.deepEqual(rent.errors, []);
  assert.equal(rent.type, "INMUEBLE_RENTA");
  assert.equal(rent.payload?.price, 20_000, "an annual rent is stored monthly");
  assert.equal(rent.payload?.listingDetails?.currency, "USD");
  assert.equal(rent.payload?.constructionType, "Casa habitación");
  const warnings = rent.warnings.join(" ");
  assert.match(warnings, /dividió entre 12/);
  assert.match(warnings, /USD/);
  assert.match(warnings, /falta la URL/);
  assert.match(warnings, /Sin base del unitario/);
  assert.equal(rows[4].useStatus, "DESCARTADO");
  assert.equal(rows[4].payload, null);
  assert.deepEqual(rows[5].errors, []);
  assert.ok(rows[5].payload, "no price and no area still imports");
  assert.match(rows[5].warnings.join(" "), /Sin precio/);
});

test("rows without type or operation take the market imported from", () => {
  assert.equal(resolveComparableType("", null, "INMUEBLE_RENTA"), "INMUEBLE_RENTA");
  assert.equal(resolveComparableType("Terreno rústico", null, "INMUEBLE_VENTA"), "TERRENO_VENTA");
  assert.equal(resolveComparableType("Bodega", "RENTA", null), "INMUEBLE_RENTA");
  assert.equal(resolveComparableType("", "VENTA", null), null);
  assert.equal(propertyTypeKeyOf("INMUEBLE_VENTA", "Casa habitación"), "CASA_HABITACION");
  assert.equal(propertyTypeKeyOf("INMUEBLE_VENTA", "Nave industrial"), "INDUSTRIAL");
  assert.equal(propertyTypeKeyOf("TERRENO_RENTA", null), "TERRENO");
  assert.equal(propertyTypeKeyOf("INMUEBLE_VENTA", "Palapa"), "OTRO");
});

test("canonical URL: no query or fragment, lower-case host without www, no trailing slash", () => {
  assert.equal(canonicalUrl("https://WWW.Inmuebles24.com/Propiedades/145.html/?utm_source=x#fotos"), "inmuebles24.com/Propiedades/145.html");
  assert.equal(canonicalUrlKey("http://inmuebles24.com/propiedades/145.html"), "inmuebles24.com/propiedades/145.html");
  assert.equal(canonicalUrl("portal.mx/sin-protocolo"), null);
  const probe = { url: "https://www.portal.mx/a/1?x=1", location: "", contactPhone: null, price: null };
  assert.deepEqual(duplicateReasons(probe, { url: "http://portal.mx/a/1/", location: "", contactPhone: null, price: null }), ["URL"]);
  assert.deepEqual(duplicateReasons(
    { url: null, location: "", contactPhone: null, price: null, publicationId: "ABC-1", sourceName: "Inmuebles24" },
    { url: null, location: "", contactPhone: null, price: null, publicationId: "abc-1", sourceName: "www.inmuebles24.com" },
  ), ["PUBLICATION"]);
  assert.deepEqual(duplicateReasons(
    { url: null, location: "", contactPhone: null, price: null, publicationId: "ABC-1", sourceName: "Lamudi" },
    { url: null, location: "", contactPhone: null, price: null, publicationId: "ABC-1", sourceName: "Inmuebles24" },
  ), [], "the same id in another portal is another listing");
  assert.deepEqual(duplicateReasons({ url: null, location: "", contactPhone: null, price: null, folio: 12 }, { url: null, location: "", contactPhone: null, price: null, folio: 12 }), ["FOLIO"]);
});

test("destination: the INICIO text, and where each row goes", () => {
  assert.equal(parseDestination("Solo avalúo"), "AVALUO");
  assert.equal(parseDestination("SOLO BASE GENERAL"), "BASE");
  assert.equal(parseDestination("ambos"), "AMBOS");
  assert.equal(parseDestination("otro"), null);
  const row = { type: "TERRENO_VENTA", payload: {}, useStatus: "PENDIENTE", valuationFolio: null } as unknown as SheetRow;
  const here = { kind: "valuation" as const, valuationId: "v1", valuationFolio: "AV-1", type: "TERRENO_VENTA" as const };
  assert.equal(planRow(row, here, "AMBOS", () => null).target.kind, "valuation");
  assert.equal(planRow(row, here, "BASE", () => null).target.kind, "base");
  const other = { ...row, type: "INMUEBLE_VENTA" } as SheetRow;
  assert.equal(planRow(other, here, "AMBOS", () => null).target.kind, "base");
  assert.equal(planRow(other, here, "AVALUO", () => null).target.kind, "skip");
  assert.match(planRow({ ...row, valuationFolio: "AV-9" }, here, "AMBOS", () => null).warnings.join(), /no es el de este avalúo/);

  const base = { kind: "base" as const };
  const resolve = (folio: string) => (folio === "AV-1" ? { valuationId: "v1", valuationFolio: "AV-1", writable: true }
    : folio === "AV-2" ? { valuationId: "v2", valuationFolio: "AV-2", writable: false } : null);
  assert.deepEqual(planRow({ ...row, valuationFolio: "AV-1" }, base, "AMBOS", resolve).target, { kind: "valuation", valuationId: "v1", valuationFolio: "AV-1", type: "TERRENO_VENTA" });
  const unknown = planRow({ ...row, valuationFolio: "AV-404" }, base, "AMBOS", resolve);
  assert.equal(unknown.target.kind, "base");
  assert.match(unknown.warnings.join(), /No hay un avalúo con folio AV-404/);
  assert.equal(planRow({ ...row, valuationFolio: "AV-404" }, base, "AVALUO", resolve).target.kind, "skip");
  assert.match(planRow({ ...row, valuationFolio: "AV-2" }, base, "AMBOS", resolve).warnings.join(), /concluido/);
  assert.equal(planRow(row, base, "AVALUO", resolve).target.kind, "skip");
  assert.equal(planRow(row, base, "AMBOS", resolve).target.kind, "base");
});

test("an accepted, verified row imports verified only for a user who can review", () => {
  const accepted = { useStatus: "ACEPTADO" as const, verified: "SI" as const, reviewedBy: "Álvaro", reviewedOn: "2026-10-20" };
  const reviewer = importedReview(accepted, { id: 7, name: "Perito", canReview: true });
  assert.equal(reviewer.review?.status, "VERIFICADO");
  assert.equal(reviewer.review?.reviewedBy, "Álvaro");
  assert.equal(reviewer.review?.reviewedAt, "2026-10-20T12:00:00.000Z");
  const viewer = importedReview(accepted, { id: 8, name: "Lector", canReview: false });
  assert.equal(viewer.review, null);
  assert.match(viewer.warning ?? "", /no puede revisar/);
  assert.equal(importedReview({ ...accepted, verified: "PARCIAL" }, { id: 7, name: "Perito", canReview: true }).review, null);
  assert.equal(importedReview({ ...accepted, useStatus: "PENDIENTE" }, { id: 7, name: "Perito", canReview: true }).warning, null);
});

test("round trip: an exported comparable reads back to the same data", async () => {
  const comparable = {
    id: "x", reference: 1, folio: 123, location: "Hidalgo 12, col. Centro, Arandas", area: 120, price: 2_400_000,
    landUse: "Habitacional", landUseKey: "H-3", shape: "Regular", zone: "Calle tipo", frontCount: 1, frontage: 8, depth: 25,
    topography: "Plano (<6%)", services: "Completos", conservation: "Bueno", quality: "Media", notes: "Revisado en sitio",
    sourceName: "Inmuebles24", contactName: "Ana", contactPhone: "3481234567", url: "https://inmuebles24.com/p/1",
    offerDate: "2026-09-01", consultedOn: "2026-10-01", listingText: "Casa de dos niveles",
    address: { street: "Hidalgo 12", neighborhood: "Centro", municipality: "Arandas", state: "Jalisco", postalCode: "47180" },
    urbanProximity: "INTERMEDIA", operationType: "VENTA", latitude: 20.7, longitude: -102.3, landArea: 200, bedrooms: 3, bathrooms: 2.5,
    constructionType: "Casa habitación",
    propertyDetails: { age: 10, levels: 2, parking: 2, paving: "Concreto", blockPosition: "Intermedio", unitBasis: "CONSTRUCCION_M2" },
    listingDetails: { publicationId: "P-1", currency: "MXN", photoUrl: "https://inmuebles24.com/f/1.jpg", dataOrigin: "Portal inmobiliario", dataVerified: "SI" },
    review: { status: "VERIFICADO", checks: {}, notes: null, reviewedBy: "Perito", reviewedAt: "2026-10-02T15:00:00.000Z" },
    photos: [], factors: [],
  } as unknown as ComparableDto;
  const values = masterRowValues(comparable, "INMUEBLE_VENTA", { valuationFolio: "AV-1", includeContact: true });
  const hidden = masterRowValues(comparable, "INMUEBLE_VENTA", { valuationFolio: "AV-1", includeContact: false });
  assert.equal(hidden.contactName, null);
  assert.equal(hidden.contactPhone, null);
  const buffer = await buildMasterWorkbook({ rows: [values], valuationFolio: "AV-1" });
  const { rows } = parseComparableSheet((await readComparableFile(buffer, "exportado.xlsx")).rows, { defaultType: null });
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.deepEqual(row.errors, []);
  assert.equal(row.type, "INMUEBLE_VENTA");
  assert.equal(row.folio, 123);
  assert.equal(row.valuationFolio, "AV-1");
  assert.equal(row.useStatus, "ACEPTADO");
  assert.equal(row.verified, "SI");
  const payload = row.payload!;
  for (const key of ["location", "area", "price", "landUse", "landUseKey", "shape", "zone", "frontCount", "frontage", "depth", "topography",
    "services", "conservation", "quality", "notes", "sourceName", "contactName", "contactPhone", "url", "offerDate", "consultedOn", "listingText",
    "urbanProximity", "latitude", "longitude", "landArea", "bedrooms", "bathrooms", "constructionType"] as const) {
    assert.deepEqual(payload[key], comparable[key], key);
  }
  assert.equal(payload.address?.street, "Hidalgo 12");
  assert.equal(payload.address?.postalCode, "47180");
  assert.deepEqual(payload.propertyDetails, comparable.propertyDetails);
  assert.equal(payload.listingDetails?.publicationId, "P-1");
  assert.equal(payload.listingDetails?.photoUrl, "https://inmuebles24.com/f/1.jpg");
  assert.equal(row.summary.unitPrice, 20_000);
});

test("column letters", () => {
  assert.equal(columnLetter(0), "A");
  assert.equal(columnLetter(25), "Z");
  assert.equal(columnLetter(26), "AA");
  assert.equal(columnLetter(52), "BA");
});

test("rent: monthly or annual, the other computed; with both the month rules", () => {
  assert.deepEqual(monthlyAndAnnualRent({ monthly: 20_000, annual: null, price: null, period: null }), { monthly: 20_000, annual: 240_000, warnings: [] });
  const fromYear = monthlyAndAnnualRent({ monthly: null, annual: 240_000, price: null, period: null });
  assert.equal(fromYear.monthly, 20_000);
  assert.match(fromYear.warnings.join(" "), /calculó entre 12/);
  const both = monthlyAndAnnualRent({ monthly: 20_000, annual: 250_000, price: 1, period: "ANUAL" });
  assert.equal(both.monthly, 20_000);
  assert.match(both.warnings.join(" "), /no es la mensual por 12/);
  assert.deepEqual(monthlyAndAnnualRent({ monthly: 20_000, annual: 240_000, price: null, period: null }).warnings, [], "they agree");
  assert.equal(monthlyAndAnnualRent({ monthly: null, annual: null, price: 240_000, period: "ANUAL" }).monthly, 20_000, "the price by its period, as before");

  const { rows } = parseComparableSheet(masterSheet([
    { "Tipo de inmueble": "Local comercial", "Operación": "Renta", "Calle y número": "Juárez 4", "Municipio": "Arandas", "Renta anual": 180_000, "Sup. construcción (m²)": 60 },
    { "Tipo de inmueble": "Local comercial", "Operación": "Renta", "Calle y número": "Juárez 6", "Municipio": "Arandas", "Renta mensual": 12_000, "Sup. construcción (m²)": 60 },
  ]), { defaultType: null });
  assert.equal(rows[0].payload?.price, 15_000);
  assert.equal(rows[1].payload?.price, 12_000);
  assert.deepEqual(rows[1].errors, []);
});

test("an exported rent carries its monthly and annual rent", () => {
  const comparable = { id: "r", reference: 1, location: "Juárez 4", area: 60, price: 15_000, photos: [], factors: [] } as unknown as ComparableDto;
  const values = masterRowValues(comparable, "INMUEBLE_RENTA", { valuationFolio: null, includeContact: false });
  assert.equal(values.monthlyRent, 15_000);
  assert.equal(values.annualRent, 180_000);
  const sale = masterRowValues({ ...comparable, price: 1_000_000 } as ComparableDto, "INMUEBLE_VENTA", { valuationFolio: null, includeContact: false });
  assert.equal(sale.monthlyRent, null);
});

test("the template groups the advanced columns, freezes the first ones, and the appraiser's lists only inform", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildMasterWorkbook() as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("COMPARABLES")!;
  const at = (key: string) => MASTER_COLUMNS.findIndex((column) => column.key === key) + 1;
  for (const key of ["latitude", "publicationId", "currency", "reviewedOn"]) {
    assert.equal(sheet.getColumn(at(key)).outlineLevel, 1, key);
    assert.equal(sheet.getColumn(at(key)).hidden, true, key);
  }
  for (const key of ["price", "street", "useStatus"]) assert.equal(sheet.getColumn(at(key)).hidden, false, key);
  assert.equal(sheet.views[0].state, "frozen");
  assert.equal((sheet.views[0] as { xSplit?: number }).xSplit, 5);
  assert.equal(sheet.getCell(7, at("quality")).dataValidation?.errorStyle, "information");
  assert.equal(sheet.getCell(7, at("conservation")).dataValidation?.showErrorMessage, true);
  assert.equal(sheet.getCell(7, at("operation")).dataValidation?.errorStyle, "stop");
  const start = workbook.getWorksheet("INICIO")!;
  assert.match(String(start.getCell("A4").value), /INSTRUCCIONES BREVES/);
  assert.match(String(start.getCell("A4").value), /Importar plantilla maestra/);
});
