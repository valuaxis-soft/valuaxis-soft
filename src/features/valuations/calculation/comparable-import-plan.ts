/**
 * Where each row of an import goes, and with which review. Pure: the import
 * service resolves the folios of the valuations and the user's permissions,
 * and asks here. Nothing fails the whole file: a row that cannot go where it
 * says is warned, and kept in the firm's base when the destination includes it.
 *
 * The firm's base is every comparable of its valuations (the version each
 * shows today) plus the ones kept without a valuation. So a comparable added
 * to a valuation is already in the base: "Ambos" adds it to the valuation,
 * and "Solo base general" keeps it in the base without one.
 */
import { COMPARABLE_TYPE_LABELS, type ComparableType } from "./market-types";
import { parseComparableRows, type CellValue, type ImportTargetDto } from "./comparable-import";
import {
  IMPORT_DESTINATION_LABELS,
  findMasterHeader,
  includesBase,
  includesValuation,
  parseMasterRows,
  type ImportDestination,
  type SheetRow,
} from "./comparable-master";

export type ParsedSheet = {
  format: "MAESTRA" | "MERCADO";
  rows: SheetRow[];
  /** Required columns missing: the file is not a template. */
  missingColumns: string[];
  /** The template of one market has no type column: the import needs one. */
  needsType: boolean;
  tooManyRows: boolean;
};

/**
 * Reads either template: the master workbook (by its headers) or the
 * template of one market (`defaultType` is its type; without one it cannot be read).
 */
export function parseComparableSheet(sheet: CellValue[][], options: { defaultType: ComparableType | null }): ParsedSheet {
  const header = findMasterHeader(sheet);
  if (header >= 0) {
    const parsed = parseMasterRows(sheet, header, options);
    return { format: "MAESTRA", rows: parsed.rows, missingColumns: [], needsType: false, tooManyRows: parsed.tooManyRows };
  }
  if (!options.defaultType) return { format: "MERCADO", rows: [], missingColumns: [], needsType: true, tooManyRows: false };
  const type = options.defaultType;
  const parsed = parseComparableRows(sheet, type);
  return {
    format: "MERCADO",
    missingColumns: parsed.missingColumns,
    needsType: false,
    tooManyRows: parsed.tooManyRows,
    rows: parsed.rows.map((row): SheetRow => ({
      row: row.row,
      type,
      payload: row.payload,
      errors: row.errors,
      warnings: [],
      summary: { ...row.summary, unitPrice: row.summary.area && row.summary.price ? row.summary.price / row.summary.area : null, currency: null },
      valuationFolio: null,
      folio: null,
      useStatus: "PENDIENTE",
      verified: null,
      reviewedBy: null,
      reviewedOn: null,
    })),
  };
}

/** Where the import is made from: a market of a valuation, or the Comparables page. */
export type ImportOrigin =
  | { kind: "valuation"; valuationId: string; valuationFolio: string; type: ComparableType }
  | { kind: "base" };

/** A valuation of the organization by its folio, as the service found it; `writable` false when concluded. */
export type ResolvedValuation = { valuationId: string; valuationFolio: string; writable: boolean };

export type PlannedRow = { target: ImportTargetDto; warnings: string[] };

const label = (type: ComparableType) => COMPARABLE_TYPE_LABELS[type].toLowerCase();
const sameFolio = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The target of one row and the warnings of its destination. */
export function planRow(
  row: Pick<SheetRow, "type" | "payload" | "useStatus" | "valuationFolio">,
  origin: ImportOrigin,
  destination: ImportDestination,
  resolve: (folio: string) => ResolvedValuation | null,
): PlannedRow {
  if (row.useStatus === "DESCARTADO" || !row.payload || !row.type) return { target: { kind: "skip" }, warnings: [] };
  const type = row.type;
  const base: PlannedRow = { target: { kind: "base", type }, warnings: [] };
  const skip = (warning: string): PlannedRow => ({ target: { kind: "skip" }, warnings: [warning] });
  if (destination === "BASE") return base;

  if (origin.kind === "valuation") {
    const warnings: string[] = [];
    if (row.valuationFolio && !sameFolio(row.valuationFolio, origin.valuationFolio)) {
      warnings.push(`El folio del renglón (${row.valuationFolio}) no es el de este avalúo (${origin.valuationFolio}); el folio solo es informativo aquí.`);
    }
    if (type === origin.type) {
      return { target: { kind: "valuation", valuationId: origin.valuationId, valuationFolio: origin.valuationFolio, type }, warnings };
    }
    if (includesBase(destination)) {
      return { target: { kind: "base", type }, warnings: [...warnings, `Es de ${label(type)}: se guarda en la base general; impórtalo desde ese mercado para usarlo en el avalúo.`] };
    }
    return { target: { kind: "skip" }, warnings: [...warnings, `Es de ${label(type)}: impórtalo desde ese mercado.`] };
  }

  if (!row.valuationFolio) {
    if (includesBase(destination)) return base;
    return skip(`Sin folio de avalúo: con destino «${IMPORT_DESTINATION_LABELS[destination]}» no se importa.`);
  }
  const valuation = resolve(row.valuationFolio);
  const fallback = includesBase(destination) ? "se guarda solo en la base general" : "no se importa";
  if (!valuation) {
    const warning = `No hay un avalúo con folio ${row.valuationFolio} que puedas editar: ${fallback}.`;
    return includesBase(destination) ? { target: { kind: "base", type }, warnings: [warning] } : skip(warning);
  }
  if (!valuation.writable) {
    const warning = `El avalúo ${valuation.valuationFolio} está concluido: ${fallback}.`;
    return includesBase(destination) ? { target: { kind: "base", type }, warnings: [warning] } : skip(warning);
  }
  return includesValuation(destination)
    ? { target: { kind: "valuation", valuationId: valuation.valuationId, valuationFolio: valuation.valuationFolio, type }, warnings: [] }
    : base;
}

/**
 * The review an imported row starts with: verified only when the file says
 * Aceptado with data verified "Sí" and the importing user can review
 * comparables; otherwise por revisar. Null is por revisar (nothing stored).
 */
export function importedReview(
  row: Pick<SheetRow, "useStatus" | "verified" | "reviewedBy" | "reviewedOn">,
  user: { id: number; name: string; canReview: boolean },
  now = new Date(),
): { review: { status: "VERIFICADO"; checks: Record<string, never>; notes: null; reviewedBy: string; reviewedById: number; reviewedAt: string } | null; warning: string | null } {
  const wantsVerified = row.useStatus === "ACEPTADO" && row.verified === "SI";
  if (!wantsVerified) {
    return { review: null, warning: row.useStatus === "ACEPTADO" ? "Aceptado sin datos verificados «Sí»: se importa por revisar." : null };
  }
  if (!user.canReview) return { review: null, warning: "Aceptado y verificado en el archivo, pero tu usuario no puede revisar comparables: se importa por revisar." };
  return {
    review: {
      status: "VERIFICADO",
      checks: {},
      notes: null,
      reviewedBy: row.reviewedBy ?? user.name,
      reviewedById: user.id,
      reviewedAt: row.reviewedOn ? `${row.reviewedOn}T12:00:00.000Z` : now.toISOString(),
    },
    warning: null,
  };
}
