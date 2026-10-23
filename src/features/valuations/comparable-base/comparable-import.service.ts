/**
 * Importing a spreadsheet of comparables, from a market of a valuation or
 * from the Comparables page: the preview (each row with its errors, warnings,
 * destination and possible duplicates) and the import itself. Rows go to the
 * market of a valuation (which already makes them part of the firm's base) or
 * to the base without a valuation, as the destination and the row's "Folio
 * avalúo" say. Only the user's organization is ever read or written.
 */
import type { AuthUser } from "@/features/auth/model";
import { canReviewComparables } from "@/features/auth/permissions";
import { prisma } from "@/infrastructure/database/prisma-client";
import { todayInMexico } from "../calculation/comparable-card";
import { EXACT_DUPLICATE_REASONS } from "../calculation/comparable-duplicates";
import type { ComparableImportPreview, ImportBaseCounts } from "../calculation/comparable-import";
import {
  importedReview,
  parseComparableSheet,
  planRow,
  type ImportOrigin,
  type ParsedSheet,
  type PlannedRow,
  type ResolvedValuation,
} from "../calculation/comparable-import-plan";
import type { ImportDestination, SheetRow } from "../calculation/comparable-master";
import { findDuplicates, type DuplicateMatchDto } from "../calculation/comparable-card.service";
import type { ComparableInputPayload } from "../calculation/market-schemas";
import {
  getMarketCalculation,
  importComparables,
  importToFirmBase,
  updateComparable,
  type BaseImportEntry,
  type ImportEntry,
  type ReviewSnapshot,
} from "../calculation/market.service";
import type { ComparableType } from "../calculation/market-types";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";

export type ComparableFile = { rows: Parameters<typeof parseComparableSheet>[0]; destination: ImportDestination | null };

export class ImportFileError extends Error {}

type Analysis = {
  parsed: ParsedSheet;
  destination: ImportDestination;
  rows: Array<SheetRow & PlannedRow & { review: ReviewSnapshot | null; duplicates: DuplicateMatchDto[] }>;
  preview: ComparableImportPreview;
};

/** The valuations of the organization the rows name, by folio (any case), with whether they can still be edited. */
async function resolveFolios(organizationId: number, folios: string[]) {
  const wanted = [...new Set(folios.map((folio) => folio.trim()).filter(Boolean))];
  if (!wanted.length) return new Map<string, ResolvedValuation>();
  const rows = await prisma.avaluo.findMany({
    where: {
      IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null,
      OR: wanted.map((folio) => ({ SFolio: { equals: folio, mode: "insensitive" as const } })),
    },
    select: { UIdentificadorPublico: true, SFolio: true, BBloqueado: true },
  });
  return new Map(rows.map((row) => [row.SFolio.trim().toLowerCase(), {
    valuationId: row.UIdentificadorPublico, valuationFolio: row.SFolio, writable: !row.BBloqueado,
  }]));
}

/** Reads the file and decides each row, without writing anything. */
async function analyze(
  user: AuthUser,
  origin: ImportOrigin,
  file: ComparableFile,
  options: { destination: ImportDestination | null; defaultType: ComparableType | null },
): Promise<Analysis> {
  const parsed = parseComparableSheet(file.rows, { defaultType: options.defaultType });
  if (parsed.needsType) throw new ImportFileError("Es la plantilla de un solo mercado: elige el tipo de comparable antes de subirla, o usa la plantilla maestra.");
  if (parsed.missingColumns.length) throw new ImportFileError(`Falta la columna ${parsed.missingColumns.join(", ")}. Usa la plantilla de Valuaxis.`);
  const destination = options.destination ?? file.destination ?? "AMBOS";
  const folios = origin.kind === "base" ? await resolveFolios(user.organizationId, parsed.rows.flatMap((row) => (row.valuationFolio ? [row.valuationFolio] : []))) : new Map();
  const canReview = canReviewComparables(user);

  const rows = await Promise.all(parsed.rows.map(async (row) => {
    const plan = planRow(row, origin, destination, (folio) => folios.get(folio.trim().toLowerCase()) ?? null);
    const { review, warning } = plan.target.kind === "skip" ? { review: null, warning: null }
      : importedReview(row, { id: user.id, name: user.name, canReview });
    // The valuation the row goes to marks the duplicates already in it; one to the base looks at the whole base.
    const duplicates = row.payload && plan.target.kind !== "skip"
      ? await findDuplicates(plan.target.kind === "valuation" ? plan.target.valuationId : null, user.organizationId, {
        ...row.payload,
        publicationId: row.payload.listingDetails?.publicationId ?? null,
        sourceName: row.payload.sourceName,
        folio: row.folio,
      })
      : [];
    // The same number, publication or URL first: they are the listing itself.
    const exact = (match: DuplicateMatchDto) => (match.reasons.some((reason) => EXACT_DUPLICATE_REASONS.has(reason)) ? 0 : 1);
    return {
      ...row, ...plan, warnings: [...row.warnings, ...plan.warnings, ...(warning ? [warning] : [])],
      review: review as ReviewSnapshot | null, duplicates: [...duplicates].sort((a, b) => exact(a) - exact(b)),
    };
  }));

  const preview: ComparableImportPreview = {
    format: parsed.format,
    destination,
    fileDestination: file.destination,
    rows: rows.map((row) => {
      const matches = row.duplicates.slice(0, 3);
      const exact = matches.find((match) => match.reasons.some((reason) => EXACT_DUPLICATE_REASONS.has(reason)));
      return {
        row: row.row,
        errors: row.errors,
        warnings: row.warnings,
        location: row.summary.location,
        area: row.summary.area,
        price: row.summary.price,
        unitPrice: row.summary.unitPrice,
        currency: row.summary.currency,
        type: row.type,
        target: row.target,
        review: row.target.kind === "skip" ? null : row.review ? "VERIFICADO" : "POR_REVISAR",
        ...(matches.length ? {
          duplicates: matches.map((match) => ({
            comparableId: match.comparableId, folio: match.folio, valuationFolio: match.valuation?.folio ?? null, reasons: match.reasons,
            updatedOn: match.updatedOn,
          })),
          suggested: exact ? `merge:${exact.comparableId}` : null,
        } : {}),
      };
    }),
    valid: rows.filter((row) => row.payload && row.target.kind !== "skip").length,
    invalid: rows.filter((row) => row.errors.length).length,
    skipped: rows.filter((row) => !row.errors.length && row.target.kind === "skip").length,
    tooManyRows: parsed.tooManyRows,
  };
  return { parsed, destination, rows, preview };
}

export async function previewComparableImport(
  user: AuthUser, origin: ImportOrigin, file: ComparableFile,
  options: { destination: ImportDestination | null; defaultType: ComparableType | null },
) {
  return (await analyze(user, origin, file, options)).preview;
}

export type ImportSummary = {
  preview: ComparableImportPreview;
  /** Rows added to the market of a valuation. */
  toValuations: number;
  toBase: ImportBaseCounts;
  /** Valuations and markets that received rows. */
  markets: Array<{ valuationId: string; type: ComparableType; count: number }>;
};

/**
 * Imports the valid rows. `reuse` and `merge` are the answers to possible
 * duplicates by row: only a comparable the preview offered for that row is taken.
 * Each valuation market is one transaction, the base another.
 */
export async function runComparableImport(
  user: AuthUser, origin: ImportOrigin, file: ComparableFile,
  options: { destination: ImportDestination | null; defaultType: ComparableType | null; reuse: Record<string, string>; merge: Record<string, string> },
): Promise<ImportSummary> {
  const { rows, preview } = await analyze(user, origin, file, options);
  const markets = new Map<string, { valuationId: string; type: ComparableType; entries: ImportEntry[] }>();
  const base: BaseImportEntry[] = [];
  const updates: Array<{ valuationId: string; type: ComparableType; comparableId: string; payload: ComparableInputPayload }> = [];
  let keptByAnswer = 0;
  for (const row of rows) {
    if (!row.payload || row.target.kind === "skip") continue;
    const offered = (chosen: string | undefined) => Boolean(chosen && row.duplicates.some((match) => match.comparableId === chosen));
    const reused = options.reuse[String(row.row)];
    const merged = options.merge[String(row.row)];
    const inThisValuation = (chosen: string | undefined) => row.duplicates.find((match) => match.comparableId === chosen && match.sameValuation);
    const here = row.target.kind === "valuation" ? inThisValuation(merged) : undefined;
    if (row.target.kind === "valuation" && offered(reused) && inThisValuation(reused)) {
      // "Usar el existente" for one already in this valuation: nothing to add.
      keptByAnswer += 1;
    } else if (row.target.kind === "valuation" && here) {
      // "Es el mismo" as one already in this valuation (a file exported and edited): it is updated in place,
      // unless its data is the more recent.
      const captured = row.payload.consultedOn ?? row.payload.offerDate ?? todayInMexico();
      if (here.updatedOn > captured) keptByAnswer += 1;
      else updates.push({ valuationId: row.target.valuationId, type: here.type, comparableId: here.comparableId, payload: row.payload });
    } else if (row.target.kind === "valuation") {
      const key = `${row.target.valuationId}|${row.target.type}`;
      const market = markets.get(key) ?? { valuationId: row.target.valuationId, type: row.target.type, entries: [] };
      market.entries.push(offered(reused) ? { reuseFrom: reused }
        : offered(merged) ? { mergeInto: merged, payload: row.payload, review: row.review }
          : { ...row.payload, review: row.review });
      markets.set(key, market);
    } else if (offered(reused)) {
      // "Usar el existente" in the base: it is already there.
      keptByAnswer += 1;
    } else {
      base.push({ type: row.target.type, payload: row.payload, review: row.review, ...(offered(merged) ? { mergeInto: merged } : {}) });
    }
  }
  if (!markets.size && !base.length && !updates.length && !keptByAnswer) throw new ValuationWorkflowError("No hay comparables válidos para importar.", 400);

  let toValuations = 0;
  for (const market of markets.values()) toValuations += await importComparables(market.valuationId, user, market.type, market.entries);
  for (const update of updates) {
    // Its factors are the valuation's homologation work: they stay as they were.
    const { comparables } = await getMarketCalculation(update.valuationId, user.organizationId, update.type);
    const current = comparables.find((comparable) => comparable.id === update.comparableId);
    if (!current) continue;
    await updateComparable(update.valuationId, user, update.comparableId, { ...update.payload, factors: current.factors });
    toValuations += 1;
  }
  const outcomes = base.length ? await importToFirmBase(user, base) : [];
  return {
    preview,
    toValuations,
    toBase: {
      created: outcomes.filter((outcome) => outcome === "CREATED").length,
      updated: outcomes.filter((outcome) => outcome === "UPDATED").length,
      kept: outcomes.filter((outcome) => outcome === "KEPT").length + keptByAnswer,
    },
    markets: [
      ...[...markets.values()].map((market) => ({ valuationId: market.valuationId, type: market.type, count: market.entries.length })),
      ...updates.map((update) => ({ valuationId: update.valuationId, type: update.type, count: 1 })),
    ],
  };
}
