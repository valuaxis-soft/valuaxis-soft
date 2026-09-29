/**
 * Comparables from a spreadsheet: one row per comparable, with the columns of
 * the Valuaxis template. Headers are matched without accents or case, in any
 * order; every row goes through the same validation as manual capture.
 * Factors are not imported: the appraiser rates them in the panel.
 */
import { comparableInputSchema, type ComparableInputPayload } from "./market-schemas";
import type { ComparableType } from "./market-types";

export const MAX_IMPORT_ROWS = 100;

type FieldKey = Exclude<keyof ComparableInputPayload, "factors">;
type Kind = "text" | "number" | "date" | "url";

export type ImportColumn = { key: FieldKey; header: string; kind: Kind; width: number; hint: string; required?: boolean };

const AREA_HEADERS: Record<ComparableType, string> = {
  TERRENO_VENTA: "Superficie del terreno (m²)",
  INMUEBLE_VENTA: "Superficie construida (m²)",
  INMUEBLE_RENTA: "Superficie rentable (m²)",
};
const PRICE_HEADERS: Record<ComparableType, string> = {
  TERRENO_VENTA: "Precio de oferta ($)",
  INMUEBLE_VENTA: "Precio de oferta ($)",
  INMUEBLE_RENTA: "Renta mensual ($)",
};

export function importColumns(type: ComparableType): ImportColumn[] {
  return [
    { key: "location", header: "Ubicación", kind: "text", width: 42, hint: "Calle, número, colonia y municipio.", required: true },
    { key: "area", header: AREA_HEADERS[type], kind: "number", width: 18, hint: "Solo el número, en m²." },
    { key: "price", header: PRICE_HEADERS[type], kind: "number", width: 18, hint: "Solo el número, sin centavos si no los tiene." },
    { key: "landUse", header: "Uso de suelo", kind: "text", width: 18, hint: "Habitacional, comercial, mixto…" },
    { key: "zone", header: "Zona", kind: "text", width: 14, hint: "Como la califica el despacho." },
    { key: "shape", header: "Forma", kind: "text", width: 14, hint: "Regular, irregular…" },
    { key: "topography", header: "Topografía", kind: "text", width: 14, hint: "Plana, pendiente…" },
    { key: "frontage", header: "Frente (m)", kind: "number", width: 11, hint: "Metros." },
    { key: "depth", header: "Fondo (m)", kind: "number", width: 11, hint: "Metros." },
    { key: "services", header: "Servicios", kind: "text", width: 22, hint: "Agua, drenaje, electricidad…" },
    { key: "notes", header: "Observaciones", kind: "text", width: 30, hint: "Cualquier nota del comparable." },
    { key: "sourceName", header: "Fuente", kind: "text", width: 18, hint: "Portal, inmobiliaria o persona." },
    { key: "contactName", header: "Contacto", kind: "text", width: 20, hint: "Quién ofrece." },
    { key: "contactPhone", header: "Teléfono", kind: "text", width: 16, hint: "Del contacto." },
    { key: "url", header: "Liga del anuncio", kind: "url", width: 36, hint: "Empieza con http:// o https://." },
    { key: "offerDate", header: "Fecha de la oferta", kind: "date", width: 16, hint: "dd/mm/aaaa." },
  ];
}

/** Other headers people write for the same column. */
const ALIASES: Partial<Record<FieldKey, string[]>> = {
  location: ["ubicacion", "direccion", "domicilio"],
  area: ["superficie", "sup", "m2", "area"],
  price: ["precio", "oferta", "renta", "importe", "valor"],
  landUse: ["uso"],
  contactPhone: ["telefono", "tel", "celular"],
  url: ["liga", "link", "url", "enlace"],
  offerDate: ["fecha"],
  sourceName: ["fuente", "portal"],
  contactName: ["contacto", "oferente"],
  notes: ["observaciones", "notas", "comentarios"],
};

const normalize = (value: string) =>
  value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** A spreadsheet cell as ExcelJS or the CSV reader gives it. */
export type CellValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | { text?: string; hyperlink?: string; richText?: Array<{ text: string }>; result?: unknown; formula?: string; error?: string };

export type ImportRowResult = {
  row: number;
  payload: ComparableInputPayload | null;
  errors: string[];
  summary: { location: string; area: number | null; price: number | null };
};

/** What the appraiser sees before importing: each row and why it would be skipped. */
export type ComparableImportPreview = {
  rows: Array<{ row: number; errors: string[]; location: string; area: number | null; price: number | null }>;
  valid: number;
  invalid: number;
  tooManyRows: boolean;
};

export type ImportResult = { rows: ImportRowResult[]; missingColumns: string[]; tooManyRows: boolean };

/** The cell's visible text; with `preferLink`, a hyperlink's address instead (only for the ad link column). */
function cellText(value: CellValue, preferLink = false): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.richText) return value.richText.map((part) => part.text).join("");
    if (value.hyperlink && (preferLink || !value.text)) return value.hyperlink;
    if (value.text !== undefined) return value.text;
    if (value.result !== undefined) return cellText(value.result as CellValue);
    return "";
  }
  return String(value);
}

function cellNumber(value: CellValue): { value: number | null; error?: string } {
  if (typeof value === "object" && value && "result" in value && value.result !== undefined) return cellNumber(value.result as CellValue);
  if (typeof value === "number") return Number.isFinite(value) ? { value } : { value: null, error: "no es un número" };
  const text = cellText(value).trim();
  if (!text) return { value: null };
  const clean = normalizeNumberText(text.replace(/[$\s]|m2|m²|mxn/gi, ""));
  const parsed = clean === null ? Number.NaN : Number(clean);
  return Number.isFinite(parsed) ? { value: parsed } : { value: null, error: `"${text}" no es un número` };
}

/**
 * "1,528,000.50", "1.528.000,50", "120,5" and "1528000" to a plain number:
 * with both separators the last one is the decimal point; with only one, it
 * is a thousands separator when every group after it has three digits and
 * there is more than one group or the first group is short ("1,528" but not "0,528").
 */
export function normalizeNumberText(text: string): string | null {
  if (!/^-?[\d.,]+$/.test(text)) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    return text.split(thousands).join("").replace(decimal, ".");
  }
  const separator = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
  if (!separator) return text;
  const [head, ...groups] = text.split(separator);
  const thousands = groups.every((group) => group.length === 3) && head.replace("-", "").length >= 1 && head.replace("-", "") !== "0"
    && (groups.length > 1 || head.replace("-", "").length <= 3);
  if (thousands) return head + groups.join("");
  return groups.length === 1 ? `${head}.${groups[0]}` : null;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function cellDate(value: CellValue): { value: string | null; error?: string } {
  if (value instanceof Date) return { value: value.toISOString().slice(0, 10) };
  if (typeof value === "number") return { value: new Date(EXCEL_EPOCH + Math.round(value) * 86_400_000).toISOString().slice(0, 10) };
  const text = cellText(value).trim();
  if (!text) return { value: null };
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const mx = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : mx ? [mx[3], mx[2], mx[1]] : [];
  if (!year) return { value: null, error: `"${text}" no es una fecha (usa dd/mm/aaaa)` };
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) {
    return { value: null, error: `"${text}" no es una fecha válida` };
  }
  return { value: date.toISOString().slice(0, 10) };
}

/** Which column holds each field, from the header row. */
function mapHeaders(headerRow: CellValue[], columns: ImportColumn[]) {
  const headers = headerRow.map((cell) => normalize(cellText(cell)));
  const positions = new Map<FieldKey, number>();
  for (const column of columns) {
    const exact = headers.indexOf(normalize(column.header));
    const alias = exact >= 0 ? exact : headers.findIndex((header, index) =>
      header !== "" && ![...positions.values()].includes(index) && (ALIASES[column.key] ?? []).some((word) => header.startsWith(word)));
    if (alias >= 0) positions.set(column.key, alias);
  }
  return positions;
}

/** Zod's default messages are in English; the ones written in the schema are already in Spanish. */
function friendlyMessage(issue: { code: string; message: string }) {
  if (!/^(Too|Invalid|Expected)/.test(issue.message)) return issue.message;
  if (issue.code === "too_small") return "debe ser mayor que cero.";
  if (issue.code === "too_big") return "es demasiado largo o demasiado grande.";
  if (issue.code === "invalid_type") return "tiene un valor que no es válido.";
  return issue.message;
}

/** Reads the sheet's rows (the first one is the header) into comparables ready to save, or row errors. */
export function parseComparableRows(sheet: CellValue[][], type: ComparableType): ImportResult {
  const columns = importColumns(type);
  const headerIndex = sheet.findIndex((row) => row.some((cell) => cellText(cell).trim() !== ""));
  if (headerIndex < 0) return { rows: [], missingColumns: ["Ubicación"], tooManyRows: false };
  const positions = mapHeaders(sheet[headerIndex], columns);
  const missingColumns = columns.filter((column) => column.required && !positions.has(column.key)).map((column) => column.header);
  if (missingColumns.length) return { rows: [], missingColumns, tooManyRows: false };

  const dataRows = sheet
    .map((cells, index) => ({ cells, row: index + 1 }))
    .slice(headerIndex + 1)
    .filter(({ cells }) => cells.some((cell) => cellText(cell).trim() !== ""));
  const tooManyRows = dataRows.length > MAX_IMPORT_ROWS;

  const rows = dataRows.slice(0, MAX_IMPORT_ROWS).map(({ cells, row }): ImportRowResult => {
    const errors: string[] = [];
    const values: Record<string, unknown> = { factors: [] };
    for (const column of columns) {
      const position = positions.get(column.key);
      const cell = position === undefined ? null : cells[position];
      if (column.kind === "number") {
        const parsed = cellNumber(cell);
        if (parsed.error) errors.push(`${column.header}: ${parsed.error}.`);
        values[column.key] = parsed.value;
      } else if (column.kind === "date") {
        const parsed = cellDate(cell);
        if (parsed.error) errors.push(`${column.header}: ${parsed.error}.`);
        values[column.key] = parsed.value;
      } else {
        values[column.key] = cellText(cell, column.kind === "url").trim() || (column.key === "location" ? "" : null);
      }
    }
    const summary = {
      location: String(values.location ?? ""),
      area: (values.area as number | null) ?? null,
      price: (values.price as number | null) ?? null,
    };
    if (errors.length) return { row, payload: null, errors, summary };

    const parsed = comparableInputSchema.safeParse(values);
    if (!parsed.success) {
      const header = (key: PropertyKey) => columns.find((column) => column.key === key)?.header ?? String(key);
      const messages = parsed.error.issues.map((issue) => `${header(issue.path[0] ?? "")}: ${friendlyMessage(issue)}`);
      return { row, payload: null, errors: messages, summary };
    }
    return { row, payload: parsed.data, errors: [], summary };
  });

  return { rows, missingColumns: [], tooManyRows };
}
