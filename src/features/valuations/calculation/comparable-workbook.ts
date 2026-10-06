/**
 * Spreadsheet files for comparables: reading an uploaded .xlsx or .csv into
 * rows of cells, and writing the Valuaxis template to download.
 */
import ExcelJS from "exceljs";

import { importColumns, MAX_IMPORT_ROWS, type CellValue } from "./comparable-import";
import { MARKET_LABELS, type ComparableType } from "./market-types";

export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const SHEET_NAME = "Comparables";

export class SpreadsheetError extends Error {}

/** A 100-row sheet uncompresses to well under 1 MB; these limits only stop zip bombs. */
const ZIP_LIMITS = { maxEntries: 500, maxEntryBytes: 8 * 1024 * 1024, maxTotalBytes: 16 * 1024 * 1024 };

/**
 * Reads the zip's central directory, without inflating anything, and rejects
 * a package that would expand beyond the limits (an .xlsx is a zip). A small
 * file that inflates to gigabytes would otherwise block the server while
 * ExcelJS parses it.
 */
export function assertSafeZip(buffer: Buffer, limits = ZIP_LIMITS) {
  const tooBig = () => new SpreadsheetError("El archivo es demasiado grande por dentro. Usa la plantilla de Valuaxis.");
  const invalid = () => new SpreadsheetError("El archivo no es un Excel válido. Guárdalo como .xlsx e intenta de nuevo.");
  // End of central directory: signature, then up to a 64 KB comment.
  let end = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 22 - 0xffff); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { end = index; break; }
  }
  if (end < 0) throw invalid();
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (entries > limits.maxEntries || entries === 0xffff || offset === 0xffffffff) throw tooBig();
  let total = 0;
  for (let entry = 0; entry < entries; entry += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw invalid();
    const uncompressed = buffer.readUInt32LE(offset + 24);
    if (uncompressed === 0xffffffff || uncompressed > limits.maxEntryBytes) throw tooBig();
    total += uncompressed;
    if (total > limits.maxTotalBytes) throw tooBig();
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
}

/** RFC 4180 CSV with comma or semicolon (Excel in Spanish saves with ";"). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (quoted) {
      if (char === '"' && clean[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** UTF-8 when it is valid; otherwise Windows-1252, which Excel in Spanish uses for "CSV (delimitado por comas)". */
function decodeText(buffer: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** The uploaded sheet as rows of cells; row index = spreadsheet row number - 1. */
export async function readSpreadsheet(buffer: Buffer, filename: string): Promise<CellValue[][]> {
  if (buffer.length > MAX_IMPORT_FILE_BYTES) throw new SpreadsheetError("El archivo pesa más de 2 MB.");
  if (/\.csv$/i.test(filename)) return parseCsv(decodeText(buffer));
  if (!/\.xlsx$/i.test(filename)) throw new SpreadsheetError("Sube un archivo .xlsx o .csv.");

  if (buffer.length < 22) throw new SpreadsheetError("El archivo no es un Excel válido. Guárdalo como .xlsx e intenta de nuevo.");
  assertSafeZip(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new SpreadsheetError("El archivo no es un Excel válido. Guárdalo como .xlsx e intenta de nuevo.");
  }
  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) throw new SpreadsheetError("El archivo no tiene hojas.");
  if (sheet.actualRowCount > MAX_IMPORT_ROWS + 50) {
    throw new SpreadsheetError(`El archivo tiene más de ${MAX_IMPORT_ROWS} comparables. Divídelo en varios archivos.`);
  }
  const rows: CellValue[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows[rowNumber - 1] = values as CellValue[];
  });
  return Array.from(rows, (row) => row ?? []);
}

/** The template: a sheet to fill (header only) and one with instructions. */
export async function buildComparableTemplate(type: ComparableType): Promise<Buffer> {
  const columns = importColumns(type);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Valuaxis";

  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({ header: column.header, key: column.key, width: column.width }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F3D6E" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 32;
  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.note = column.hint;
    // The number of fronts is a count; the rest are areas, metres and amounts.
    if (column.kind === "number") sheet.getColumn(index + 1).numFmt = column.key === "frontCount" ? "0" : "#,##0.00";
    if (column.kind === "date") sheet.getColumn(index + 1).numFmt = "dd/mm/yyyy";
  });

  const help = workbook.addWorksheet("Instrucciones");
  help.columns = [{ width: 30 }, { width: 70 }];
  help.addRow([`Comparables · ${MARKET_LABELS[type].title}`]).font = { bold: true, size: 13 };
  help.addRow([]);
  help.addRow(["Cómo llenarlo", "Un comparable por renglón en la hoja Comparables, desde el renglón 2. No cambies los encabezados."]);
  help.addRow(["Obligatorio", "Solo la ubicación. Sin superficie o precio el comparable se importa, pero no entra al cálculo hasta completarlo."]);
  help.addRow(["Máximo", `${MAX_IMPORT_ROWS} comparables por archivo.`]);
  help.addRow(["Factores y fotos", "Se capturan en Valuaxis después de importar."]);
  help.addRow([]);
  help.addRow(["Columna", "Qué va"]).font = { bold: true };
  for (const column of columns) help.addRow([column.header + (column.required ? " *" : ""), column.hint]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
