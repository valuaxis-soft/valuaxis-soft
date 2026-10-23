/**
 * Comparables to Excel in the master workbook, to edit and import back: the
 * firm's base with the filters of the Comparables page, or the markets of a
 * valuation. Contact and phone go only to users who can edit comparables.
 * Only the user's organization is ever read.
 */
import type { AuthUser } from "@/features/auth/model";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { prisma } from "@/infrastructure/database/prisma-client";
import { inFirmBase } from "../calculation/access";
import { masterRowValues, type MasterRowValue } from "../calculation/comparable-master";
import { buildMasterWorkbook } from "../calculation/comparable-master-workbook";
import { comparableInclude, getMarketCalculation, toComparableDto } from "../calculation/market.service";
import { COMPARABLE_TYPES, type ComparableType } from "../calculation/market-types";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { listComparableBase } from "./comparable-base.service";
import type { ComparableListParams } from "./comparable-list-params";

/** The most comparables one export writes; an import reads up to 100 per file. */
export const MAX_EXPORT_ROWS = 1000;

/** Contact and phone are the advertiser's personal data: only who can edit comparables takes them out. */
export const canExportContact = (user: AuthUser) =>
  hasPermission(user, AUTH_PERMISSIONS.editValuations) || hasPermission(user, AUTH_PERMISSIONS.manageComparables);

/**
 * The firm's base as the list shows it with `params` (all its pages, up to
 * MAX_EXPORT_ROWS), one row per comparable of the base, its most recent
 * capture. "Folio avalúo" stays empty and INICIO says "Solo base general":
 * imported back, the rows update the base, not the valuations that used them.
 */
export async function exportFirmBase(user: AuthUser, params: ComparableListParams) {
  const { items, total } = await listComparableBase(user.organizationId, { ...params, page: 1 }, { pageSize: MAX_EXPORT_ROWS, withThumbnails: false });
  const rows = await prisma.comparableAvaluo.findMany({
    where: { UIdentificadorPublico: { in: items.map((item) => item.id) }, ...inFirmBase(user.organizationId) },
    include: { ...comparableInclude, tipoComparable: { select: { SClave: true } } },
  });
  const byId = new Map(rows.map((row) => [row.UIdentificadorPublico, row]));
  const includeContact = canExportContact(user);
  const values: Array<Record<string, MasterRowValue>> = [];
  for (const item of items) {
    const row = byId.get(item.id);
    if (!row) continue;
    values.push(masterRowValues(await toComparableDto(row, false), row.tipoComparable.SClave as ComparableType, { valuationFolio: null, includeContact }));
  }
  return { buffer: await buildMasterWorkbook({ rows: values, destination: "BASE" }), count: values.length, total };
}

/**
 * The comparables of a valuation, of one market or of all of them, with its
 * folio: imported back into it, each row is recognized by its number.
 */
export async function exportValuationComparables(user: AuthUser, publicId: string, type: ComparableType | null) {
  const valuation = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: publicId, IdOrganizacion: user.organizationId, BActivo: true, DFechaEliminacion: null },
    select: { SFolio: true },
  });
  if (!valuation) throw new ValuationWorkflowError("Avalúo no encontrado", 404);
  const includeContact = canExportContact(user);
  const values: Array<Record<string, MasterRowValue>> = [];
  for (const market of type ? [type] : COMPARABLE_TYPES) {
    const { comparables } = await getMarketCalculation(publicId, user.organizationId, market);
    for (const comparable of comparables) {
      values.push(masterRowValues(comparable, market, { valuationFolio: valuation.SFolio, includeContact }));
    }
  }
  return {
    buffer: await buildMasterWorkbook({ rows: values, destination: "AMBOS", valuationFolio: valuation.SFolio }),
    count: values.length,
    folio: valuation.SFolio,
  };
}
