import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { MAX_IMPORT_ROWS, parseComparableRows, type CellValue } from "../src/features/valuations/calculation/comparable-import";
import { buildComparableTemplate, parseCsv, readSpreadsheet } from "../src/features/valuations/calculation/comparable-workbook";

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
  sheet.addRow(["Santa Teresa 391, Arandas", 450, 1528000, "Habitacional", "Media", "Regular", "Plana", 15, 30, "Todos", null, "Inmuebles24", "Juan", "3312345678", "https://portal.mx/1", new Date(Date.UTC(2026, 8, 1))]);
  const filled = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = parseComparableRows(await readSpreadsheet(filled, "llenado.xlsx"), "TERRENO_VENTA");
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].errors, []);
  assert.equal(result.rows[0].payload?.frontage, 15);
  assert.equal(result.rows[0].payload?.contactPhone, "3312345678");
  assert.equal(result.rows[0].payload?.offerDate, "2026-09-01");
});

test("other files are refused with a clear message", async () => {
  await assert.rejects(readSpreadsheet(Buffer.from("hola"), "datos.pdf"), /\.xlsx o \.csv/);
  await assert.rejects(readSpreadsheet(Buffer.from("no es zip"), "datos.xlsx"), /no es un Excel válido/);
});
