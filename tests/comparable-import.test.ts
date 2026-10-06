import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { importColumns, MAX_IMPORT_ROWS, normalizeNumberText, parseComparableRows, type CellValue } from "../src/features/valuations/calculation/comparable-import";
import { assertSafeZip, buildComparableTemplate, parseCsv, readSpreadsheet } from "../src/features/valuations/calculation/comparable-workbook";

test("headers match without accents or case, in any order, and numbers accept currency formats", () => {
  const sheet: CellValue[][] = [
    ["PRECIO DE OFERTA ($)", "ubicacion", "Superficie del terreno (m2)", "Liga del anuncio", "Fecha de la oferta"],
    ["$1,528,000.00", "Calle Hidalgo 12, Arandas", "1,250.5", { text: "Ver anuncio", hyperlink: "https://portal.mx/anuncio/1" }, "05/09/2026"],
    [980000, "Calle Juárez 3", 800, null, new Date(Date.UTC(2026, 7, 20))],
  ];
  const result = parseComparableRows(sheet, "TERRENO_VENTA");
  assert.deepEqual(result.missingColumns, []);
  const [first, second] = result.rows;
  assert.deepEqual(first.errors, []);
  assert.equal(first.payload?.price, 1528000);
  assert.equal(first.payload?.area, 1250.5);
  assert.equal(first.payload?.url, "https://portal.mx/anuncio/1");
  assert.equal(first.payload?.offerDate, "2026-09-05");
  assert.deepEqual(first.payload?.factors, []);
  assert.equal(second.payload?.offerDate, "2026-08-20");
  assert.equal(second.row, 3);
});

test("each bad row says what is wrong, in Spanish, and good rows still import", () => {
  const sheet: CellValue[][] = [
    ["Ubicación", "Superficie construida (m²)", "Precio de oferta ($)", "Liga del anuncio", "Fecha de la oferta"],
    ["", 100, 1000000, null, null],
    ["Av. Uno 1", "cien", 1000000, null, null],
    ["Av. Dos 2", -5, 1000000, null, null],
    ["Av. Tres 3", 90, 900000, "portal.mx/sin-protocolo", "31/02/2026"],
    [null, null, null, null, null],
    ["Av. Cuatro 4", 120, 1500000, null, null],
  ];
  const { rows } = parseComparableRows(sheet, "INMUEBLE_VENTA");
  assert.equal(rows.length, 5, "empty rows are skipped");
  assert.match(rows[0].errors.join(" "), /Ubicación: Captura la ubicación/);
  assert.match(rows[1].errors.join(" "), /Superficie construida \(m²\): "cien" no es un número/);
  assert.match(rows[2].errors.join(" "), /debe ser mayor que cero/);
  assert.match(rows[3].errors.join(" "), /no es una fecha válida/);
  assert.equal(rows[4].payload?.location, "Av. Cuatro 4");
  assert.equal(rows.filter((row) => row.payload).length, 1);
});

test("the rent template calls the price monthly rent; a sheet without Ubicación is rejected", () => {
  const rent = parseComparableRows([["Ubicación", "Renta mensual ($)"], ["Local 5", "18,000"]], "INMUEBLE_RENTA");
  assert.equal(rent.rows[0].payload?.price, 18000);
  assert.deepEqual(parseComparableRows([["Precio"], [1]], "TERRENO_VENTA").missingColumns, ["Ubicación"]);
  const many = parseComparableRows([["Ubicación"], ...Array.from({ length: MAX_IMPORT_ROWS + 3 }, (_, i) => [`Calle ${i}`])], "TERRENO_VENTA");
  assert.equal(many.tooManyRows, true);
  assert.equal(many.rows.length, MAX_IMPORT_ROWS);
});

test("CSV saved by Excel in Spanish (semicolons, quotes, BOM) is read", () => {
  const rows = parseCsv('﻿Ubicación;Precio de oferta ($)\r\n"Calle 5; interior ""B""";"1,200,000"\r\n');
  assert.deepEqual(rows, [["Ubicación", "Precio de oferta ($)"], ['Calle 5; interior "B"', "1,200,000"]]);
  assert.equal(parseComparableRows(rows, "TERRENO_VENTA").rows[0].payload?.price, 1200000);
});

test("the downloaded template reads back, and a filled one imports", async () => {
  const template = await buildComparableTemplate("TERRENO_VENTA");
  const empty = parseComparableRows(await readSpreadsheet(template, "plantilla.xlsx"), "TERRENO_VENTA");
  assert.deepEqual(empty, { rows: [], missingColumns: [], tooManyRows: false });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Comparables")!;
  const filledRow: Record<string, unknown> = {
    location: "Santa Teresa 391, Arandas", area: 450, price: 1528000, landUseKey: "AU-I/H-3", landUse: "Habitacional", zone: "Media", shape: "Regular",
    topography: "Plana", frontCount: 2, frontage: 15, depth: 30, services: "Todos", sourceName: "Inmuebles24", contactName: "Juan",
    contactPhone: "3312345678", url: "https://portal.mx/1", offerDate: new Date(Date.UTC(2026, 8, 1)),
  };
  sheet.addRow(importColumns("TERRENO_VENTA").map((column) => filledRow[column.key] ?? null));
  const filled = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = parseComparableRows(await readSpreadsheet(filled, "llenado.xlsx"), "TERRENO_VENTA");
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].errors, []);
  assert.equal(result.rows[0].payload?.frontage, 15);
  assert.equal(result.rows[0].payload?.frontCount, 2);
  assert.equal(result.rows[0].payload?.landUseKey, "AU-I/H-3");
  assert.equal(result.rows[0].payload?.landUse, "Habitacional");
  assert.equal(result.rows[0].payload?.contactPhone, "3312345678");
  assert.equal(result.rows[0].payload?.offerDate, "2026-09-01");
});

test("other files are refused with a clear message", async () => {
  await assert.rejects(readSpreadsheet(Buffer.from("hola"), "datos.pdf"), /\.xlsx o \.csv/);
  await assert.rejects(readSpreadsheet(Buffer.from("no es zip"), "datos.xlsx"), /no es un Excel válido/);
});

test("numbers are read with either decimal separator, as Mexican and Spanish spreadsheets write them", () => {
  const cases: Array<[string, string | null]> = [
    ["1,528,000.50", "1528000.50"], ["1.528.000,50", "1528000.50"], ["120,5", "120.5"], ["1528000,00", "1528000.00"],
    ["1,528", "1528"], ["1.528.000", "1528000"], ["0,528", "0.528"], ["12.5", "12.5"], ["2,500", "2500"], ["abc", null], ["1,2,3", null],
  ];
  for (const [input, expected] of cases) assert.equal(normalizeNumberText(input), expected, input);
  const rows = parseComparableRows([["Ubicación", "Superficie del terreno (m²)", "Precio de oferta ($)"], ["Calle 1", "120,5", "1528000,00"]], "TERRENO_VENTA");
  assert.equal(rows.rows[0].payload?.area, 120.5);
  assert.equal(rows.rows[0].payload?.price, 1528000);
});

test("a CSV saved by Excel in Spanish (Windows-1252) keeps its accents", async () => {
  const latin1 = Buffer.from("Ubicaci\xf3n;Precio de oferta ($)\r\nCalle Ju\xe1rez 3;900000\r\n", "latin1");
  const result = parseComparableRows(await readSpreadsheet(latin1, "comparables.csv"), "TERRENO_VENTA");
  assert.deepEqual(result.missingColumns, []);
  assert.equal(result.rows[0].payload?.location, "Calle Juárez 3");
});

test("a location linked to a map keeps its text; only the ad column takes the link", () => {
  const result = parseComparableRows([
    ["Ubicación", "Liga del anuncio"],
    [{ text: "Av. Juárez 12", hyperlink: "https://maps.google.com/x" }, { text: "Ver anuncio", hyperlink: "https://portal.mx/1" }],
  ], "TERRENO_VENTA");
  assert.equal(result.rows[0].payload?.location, "Av. Juárez 12");
  assert.equal(result.rows[0].payload?.url, "https://portal.mx/1");
});

test("a small file that would inflate to hundreds of megabytes is refused before parsing", async () => {
  const template = await buildComparableTemplate("TERRENO_VENTA");
  assert.doesNotThrow(() => assertSafeZip(template));
  // Claim a huge uncompressed size in the first central directory entry.
  const bomb = Buffer.from(template);
  const entry = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bomb.writeUInt32LE(300 * 1024 * 1024, entry + 24);
  assert.throws(() => assertSafeZip(bomb), /demasiado grande/);
  await assert.rejects(readSpreadsheet(bomb, "bomba.xlsx"), /demasiado grande/);
});

/** The header row of a template, as downloaded. */
async function templateHeaders(type: Parameters<typeof buildComparableTemplate>[0]) {
  const [headers] = await readSpreadsheet(await buildComparableTemplate(type), "plantilla.xlsx");
  return headers.map(String);
}

test("the template carries the fronts and the land use key; conservation and quality only for built properties", async () => {
  const land = await templateHeaders("TERRENO_VENTA");
  assert.ok(land.indexOf("Clave de uso de suelo") >= 0 && land.includes("Número de frentes"));
  assert.equal(land.includes("Conservación") || land.includes("Calidad"), false);
  for (const type of ["INMUEBLE_VENTA", "INMUEBLE_RENTA"] as const) {
    const built = await templateHeaders(type);
    assert.ok(["Clave de uso de suelo", "Número de frentes", "Conservación", "Calidad"].every((header) => built.includes(header)), type);
  }
});

test("a sheet of the template before these columns imports as it did, with them empty", () => {
  const former = [
    "Ubicación", "Superficie del terreno (m²)", "Precio de oferta ($)", "Uso de suelo", "Zona", "Forma", "Topografía", "Frente (m)", "Fondo (m)",
    "Servicios", "Observaciones", "Fuente", "Contacto", "Teléfono", "Liga del anuncio", "Fecha de la oferta",
  ];
  const result = parseComparableRows([
    former,
    ["Calle Villa Toledo", 140, 1260000, "AU-I/CS-D (Área Urbana)", "Calle Inferior", "Regular", "Plano", 8, 17.5, "Completos", null, "Altos 360", null, "348 249 3129", null, "04/05/2026"],
  ], "TERRENO_VENTA");
  assert.deepEqual(result.missingColumns, []);
  const payload = result.rows[0].payload;
  assert.deepEqual(result.rows[0].errors, []);
  assert.equal(payload?.landUse, "AU-I/CS-D (Área Urbana)");
  assert.equal(payload?.frontage, 8, "the frontage in metres is not taken for the number of fronts");
  // The land template has no conservation or quality at all.
  assert.deepEqual([payload?.landUseKey, payload?.frontCount, payload?.conservation, payload?.quality], [null, null, undefined, undefined]);
});

test("the new columns import, and the number of fronts must be a whole number from 1", () => {
  const headers = ["Ubicación", "Clave de uso de suelo", "Uso de suelo", "Número de frentes", "Frente (m)", "Conservación", "Calidad"];
  const { rows } = parseComparableRows([
    headers,
    ["Av. Uno 1", "HC 4 / 25", "Habitacional - Comercial", 2, 10, "Buena", "Media"],
    ["Av. Dos 2", null, null, 1.5, null, null, null],
    ["Av. Tres 3", null, null, 0, null, null, null],
  ], "INMUEBLE_RENTA");
  assert.deepEqual(rows[0].errors, []);
  const { landUseKey, landUse, frontCount, frontage, conservation, quality } = rows[0].payload!;
  assert.deepEqual({ landUseKey, landUse, frontCount, frontage, conservation, quality }, {
    landUseKey: "HC 4 / 25", landUse: "Habitacional - Comercial", frontCount: 2, frontage: 10, conservation: "Buena", quality: "Media",
  });
  assert.match(rows[1].errors.join(" "), /Número de frentes: El número de frentes debe ser un entero/);
  assert.match(rows[2].errors.join(" "), /Número de frentes: El número de frentes debe ser 1 o más/);

  // The land template has no conservation or quality: those columns of a sheet are ignored.
  const land = parseComparableRows([headers, ["Lote 1", "H-3", null, 1, 8, "Buena", "Media"]], "TERRENO_VENTA");
  assert.deepEqual([land.rows[0].payload?.frontCount, land.rows[0].payload?.conservation], [1, undefined]);
});
