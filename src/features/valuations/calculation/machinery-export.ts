/**
 * «Exportar Excel» of the machinery market (V8.13, 05:31: «en rentas falta
 * exportar Excel… no me tienen las mismas funciones»): the offers of the
 * valuation, one row each, as the real estate markets export theirs. Contact,
 * phone and e-mail are the advertiser's personal data: they go only to users
 * who can edit comparables (canExportContact).
 */
import ExcelJS from "exceljs";

import { formatComparableId } from "./comparable-card";
import type { MachineryOfferDto } from "./machinery-types";

type Column = { header: string; width: number; value: (offer: MachineryOfferDto) => string | number | null; contact?: boolean };

const COLUMNS: Column[] = [
  { header: "Ref.", width: 6, value: (offer) => offer.ref },
  { header: "ID del despacho", width: 14, value: (offer) => formatComparableId(offer.folio) ?? "" },
  { header: "Descripción", width: 36, value: (offer) => offer.description },
  { header: "Marca", width: 16, value: (offer) => offer.brand },
  { header: "Modelo", width: 16, value: (offer) => offer.model },
  { header: "Año", width: 8, value: (offer) => offer.year },
  { header: "Horas", width: 10, value: (offer) => offer.hours },
  { header: "Aditamentos", width: 24, value: (offer) => offer.attachments },
  { header: "Fecha", width: 12, value: (offer) => offer.date },
  { header: "Precio", width: 16, value: (offer) => offer.price },
  { header: "Contacto", width: 22, value: (offer) => offer.contact, contact: true },
  { header: "Empresa", width: 22, value: (offer) => offer.company },
  { header: "Teléfono", width: 16, value: (offer) => offer.phone, contact: true },
  { header: "Correo", width: 24, value: (offer) => offer.email, contact: true },
  { header: "Liga", width: 40, value: (offer) => offer.link },
  { header: "Ubicación", width: 28, value: (offer) => offer.location },
  { header: "Edad", width: 8, value: (offer) => offer.age },
  { header: "V.U.T.", width: 8, value: (offer) => offer.usefulLife },
  { header: "Calificación", width: 12, value: (offer) => offer.rating },
  { header: "Observaciones", width: 36, value: (offer) => offer.notes },
];

/** The header row and one row per offer, as the workbook writes them; without contact for who may not take it out. */
export function machineryOfferRows(offers: readonly MachineryOfferDto[], includeContact: boolean) {
  const columns = COLUMNS.filter((column) => includeContact || !column.contact);
  return {
    headers: columns.map((column) => column.header),
    widths: columns.map((column) => column.width),
    rows: offers.map((offer) => columns.map((column) => {
      const value = column.value(offer);
      return typeof value === "string" ? value.trim() : value;
    })),
  };
}

/** The workbook «Ofertas de maquinaria» of a valuation. */
export async function buildMachineryOffersWorkbook(offers: readonly MachineryOfferDto[], options: { includeContact: boolean; folio: string }) {
  const { headers, widths, rows } = machineryOfferRows(offers, options.includeContact);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Valuaxis";
  const sheet = workbook.addWorksheet("Ofertas de maquinaria");
  sheet.addRow([`Ofertas de maquinaria del avalúo ${options.folio}`]).font = { bold: true };
  const header = sheet.addRow(headers);
  header.font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  const price = headers.indexOf("Precio") + 1;
  if (price > 0) sheet.getColumn(price).numFmt = "$#,##0.00";
  sheet.views = [{ state: "frozen", ySplit: 2 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
