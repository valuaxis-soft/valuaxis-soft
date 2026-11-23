/**
 * «Exportar a Excel» of /operador/usuarios: every row of the search (every
 * page), the same columns as the screen. Dates are real Excel dates. No
 * content of any valuation: only the two counts.
 */
import ExcelJS from "exceljs";
import { ACCREDITATION_LABELS } from "./user-directory-params";
import type { UserDirectoryEntry } from "./user-directory.repository";

/** Excel has no time zone: the moments are written as Mexico City's wall clock. */
const MEXICO_OFFSET_MS = 6 * 60 * 60 * 1000;
const asMexicoWallClock = (date: Date) => new Date(date.getTime() - MEXICO_OFFSET_MS);

export const membershipsText = (entry: Pick<UserDirectoryEntry, "memberships">) =>
  entry.memberships.map((member) => `${member.organization} (${member.role})`).join("; ");

export const accreditationText = (entry: Pick<UserDirectoryEntry, "accreditation" | "accreditationLevel">) =>
  `${ACCREDITATION_LABELS[entry.accreditation] ?? entry.accreditation}${entry.accreditationLevel ? ` · ${entry.accreditationLevel}` : ""}`;

const COLUMNS: { header: string; width: number; date?: boolean; value: (entry: UserDirectoryEntry) => ExcelJS.CellValue }[] = [
  { header: "Nombre", width: 30, value: (entry) => entry.name },
  { header: "Correo", width: 34, value: (entry) => entry.email },
  { header: "Correo verificado", width: 12, value: (entry) => (entry.emailVerified ? "Sí" : "No") },
  { header: "Teléfono (sin verificar)", width: 18, value: (entry) => entry.phone },
  { header: "Cuenta", width: 10, value: (entry) => (entry.active ? "Activa" : "Inactiva") },
  { header: "Despachos y rol", width: 44, value: membershipsText },
  { header: "Acreditación", width: 24, value: accreditationText },
  { header: "Alta", width: 18, date: true, value: (entry) => asMexicoWallClock(entry.signedUpAt) },
  { header: "Último acceso", width: 18, date: true, value: (entry) => (entry.lastAccessAt ? asMexicoWallClock(entry.lastAccessAt) : null) },
  { header: "Avalúos creados", width: 10, value: (entry) => entry.valuationsCreated },
  { header: "Avalúos concluidos", width: 10, value: (entry) => entry.valuationsConcluded },
];

export async function buildUserDirectoryWorkbook(input: { items: UserDirectoryEntry[]; truncatedFrom?: number }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Valuaxis Soft";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Usuarios", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((column, index) => ({
    header: column.header,
    key: String(index),
    width: column.width,
    ...(column.date ? { style: { numFmt: "dd/mm/yyyy hh:mm" } } : {}),
  }));
  sheet.getRow(1).font = { bold: true };
  for (const item of input.items) sheet.addRow(COLUMNS.map((column) => column.value(item)));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  if (input.truncatedFrom && input.truncatedFrom > input.items.length) {
    const note = sheet.addRow([`Se exportaron ${input.items.length} de ${input.truncatedFrom} usuarios. Usa la búsqueda o el filtro para exportar el resto.`]);
    note.font = { italic: true };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
