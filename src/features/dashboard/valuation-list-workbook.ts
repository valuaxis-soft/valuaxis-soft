/**
 * «Exportar a Excel» of /avaluos: the rows of the list with its filters and
 * order (every page), in the columns the person sees, in their order. Dates
 * are real Excel dates, so the firm sorts and filters them in Excel too.
 */
import ExcelJS from "exceljs";
import type { ValuationPageItem } from "@/features/valuations/repositories/valuation-list.repository";
import { getStatusPresentation } from "./valuation-status";
import { VALUATION_COLUMN_LABELS, defaultColumnWidth, type ValuationColumn } from "./valuation-columns";

/** The most rows an export carries; the list says when there are more. */
export const MAX_VALUATION_EXPORT_ROWS = 5_000;

/** Excel has no time zone: the moments are written as Mexico City's wall clock. */
const MEXICO_OFFSET_MS = 6 * 60 * 60 * 1000;
const asMexicoWallClock = (date: Date) => new Date(date.getTime() - MEXICO_OFFSET_MS);

function cellValue(column: ValuationColumn, item: ValuationPageItem): ExcelJS.CellValue {
  switch (column) {
    case "folio": return item.folio;
    case "titulo": return item.title;
    case "cliente": return item.client;
    case "ubicacion": return item.location;
    case "tipo": return item.propertyKindName;
    case "tipoAvaluo": return item.appraisalKindName;
    case "estado": {
      const label = getStatusPresentation(item.status, item.statusName).label;
      return item.status === "en_revision" && item.reviewApprovedAt ? `${label} (aprobado)` : label;
    }
    case "valuador": return item.appraiserName;
    case "creacion": return asMexicoWallClock(item.createdAt);
    case "modificacion": return asMexicoWallClock(item.updatedAt);
    case "conclusion": return item.concludedAt ? asMexicoWallClock(item.concludedAt) : null;
    case "version": return `V${item.version}`;
  }
}

const DATE_COLUMNS: ReadonlySet<ValuationColumn> = new Set(["creacion", "modificacion", "conclusion"]);

export async function buildValuationListWorkbook(input: {
  items: ValuationPageItem[];
  columns: ValuationColumn[];
  /** «Avalúos», «Avalúos archivados» or «Papelera»: the sheet's name. */
  sheetName: string;
  /** The list had more rows than the export carries. */
  truncatedFrom?: number;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Valuaxis";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(input.sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = input.columns.map((column) => ({
    header: VALUATION_COLUMN_LABELS[column],
    key: column,
    width: Math.max(10, Math.round(defaultColumnWidth(column) / 7)),
    ...(DATE_COLUMNS.has(column) ? { style: { numFmt: "dd/mm/yyyy hh:mm" } } : {}),
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  for (const item of input.items) {
    sheet.addRow(Object.fromEntries(input.columns.map((column) => [column, cellValue(column, item)])));
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, input.columns.length) } };
  if (input.truncatedFrom && input.truncatedFrom > input.items.length) {
    const note = sheet.addRow([`Se exportaron ${input.items.length} de ${input.truncatedFrom} avalúos. Usa los filtros para exportar el resto.`]);
    note.font = { italic: true };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
