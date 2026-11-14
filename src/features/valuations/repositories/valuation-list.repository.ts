/**
 * The firm's list of valuations (/avaluos and its Excel export): filters,
 * order and pages read in the database; and the trash, where a deleted
 * valuation waits TRASH_RETENTION_DAYS to be restored before it is deleted
 * for good.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { ValuationDateField, ValuationSortDirection, ValuationSortKey } from "@/features/dashboard/valuation-list-params";

/** Days a deleted valuation stays in the trash; after them it is deleted for good on the next look at the trash. */
export const TRASH_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ValuationPageItem = {
  id: string;
  folio: string;
  title: string;
  client: string;
  location: string;
  /** Lowercase SClave of the operation type. */
  valuationKind: string;
  /** Lowercase SClave of the property type. */
  propertyKind: string;
  propertyKindName: string;
  appraisalKindName: string;
  /** Lowercase SClave of the status. */
  status: string;
  statusName: string;
  /** The person responsible, or whoever created it when nobody was assigned. */
  appraiserName: string;
  createdAt: Date;
  updatedAt: Date;
  concludedAt: Date | null;
  /** The version in use: 1, or 2 and up once reopened. */
  version: number;
  /** When the firm archived it; null while it is in the main list. */
  archivedAt: Date | null;
  /** When it went to the trash; null outside of it. */
  deletedAt: Date | null;
  /** The reviewer approved it «En revisión»: ready to conclude. */
  reviewApprovedAt: Date | null;
};

export type ValuationPageQuery = {
  organizationId: number;
  page: number;
  pageSize: number;
  q?: string | null;
  /** Status key from the catalog (case-insensitive). */
  status?: string | null;
  /** The archived valuations instead of the ones in the main list. */
  archived?: boolean;
  /** The trash instead of the main list. */
  trash?: boolean;
  propertyKind?: string | null;
  appraisalKind?: string | null;
  appraiserId?: number | null;
  dateField?: ValuationDateField;
  /** "YYYY-MM-DD", inclusive days in Mexico's time. */
  from?: string | null;
  to?: string | null;
  sort?: ValuationSortKey;
  direction?: ValuationSortDirection;
};

const valuationPageSelect = Prisma.validator<Prisma.AvaluoSelect>()({
  UIdentificadorPublico: true,
  SFolio: true,
  STitulo: true,
  SNombreCliente: true,
  INumeroVersionActual: true,
  DFechaCreacion: true,
  DFechaModificacion: true,
  DFechaConclusion: true,
  DFechaArchivo: true,
  DFechaEliminacion: true,
  DFechaRevisionAprobada: true,
  estadoAvaluo: { select: { SClave: true, SNombre: true } },
  tipoAvaluo: { select: { SNombre: true } },
  tipoInmueble: { select: { SClave: true, SNombre: true } },
  tipoOperacion: { select: { SClave: true } },
  usuarioCreador: { select: { SNombre: true, SApellidoPaterno: true, SApellidoMaterno: true } },
  usuarioResponsable: { select: { SNombre: true, SApellidoPaterno: true, SApellidoMaterno: true } },
  propiedadSujeto: {
    select: {
      direccionesPropiedad: {
        where: { BEsDireccionActual: true },
        select: { SDireccionCompleta: true },
        take: 1,
      },
    },
  },
});

type PageRow = Prisma.AvaluoGetPayload<{ select: typeof valuationPageSelect }>;

const personName = (user: { SNombre: string; SApellidoPaterno: string | null; SApellidoMaterno: string | null } | null) =>
  user ? [user.SNombre, user.SApellidoPaterno, user.SApellidoMaterno].filter(Boolean).join(" ") : "";

/** The first instant of a Mexico City day (UTC−6 all year since 2022). */
const startOfMexicoDay = (day: string) => new Date(`${day}T00:00:00-06:00`);

export const trashCutoff = (now = new Date()) => new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS);

/** The rows of the list, of the archive or of the trash, with every filter. */
export function valuationPageWhere(query: Omit<ValuationPageQuery, "page" | "pageSize">, now = new Date()): Prisma.AvaluoWhereInput {
  const search = query.q?.trim();
  const status = query.status?.trim();
  const and: Prisma.AvaluoWhereInput[] = [];
  if (search) {
    and.push({
      OR: [
        { SFolio: { contains: search, mode: "insensitive" } },
        { STitulo: { contains: search, mode: "insensitive" } },
        { SNombreCliente: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  if (query.appraiserId) {
    and.push({ OR: [{ IdUsuarioResponsable: query.appraiserId }, { IdUsuarioResponsable: null, IdUsuarioCreador: query.appraiserId }] });
  }
  if (query.from || query.to) {
    const column = query.dateField === "modificacion" ? "DFechaModificacion" : query.dateField === "conclusion" ? "DFechaConclusion" : "DFechaCreacion";
    const range: Prisma.DateTimeFilter = {};
    if (query.from) range.gte = startOfMexicoDay(query.from);
    if (query.to) range.lt = new Date(startOfMexicoDay(query.to).getTime() + DAY_MS);
    and.push({ [column]: range });
  }

  return {
    IdOrganizacion: query.organizationId,
    ...(query.trash
      ? { BActivo: false, DFechaEliminacion: { gte: trashCutoff(now) }, DFechaEliminacionDefinitiva: null }
      : { BActivo: true, DFechaEliminacion: null, DFechaArchivo: query.archived ? { not: null } : null }),
    ...(status ? { estadoAvaluo: { SClave: status.toUpperCase() } } : {}),
    ...(query.propertyKind ? { tipoInmueble: { SClave: query.propertyKind.toUpperCase() } } : {}),
    ...(query.appraisalKind ? { tipoAvaluo: { SClave: query.appraisalKind.toUpperCase() } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

/** The order of the page, by the column chosen; the id breaks ties so the pages never repeat a row. */
function valuationPageOrder(sort: ValuationSortKey = "modificacion", direction: ValuationSortDirection = "desc"): Prisma.AvaluoOrderByWithRelationInput[] {
  const last = { sort: direction, nulls: "last" } as const;
  const first: Prisma.AvaluoOrderByWithRelationInput[] = sort === "folio" ? [{ SFolio: direction }]
    : sort === "titulo" ? [{ STitulo: direction }]
    : sort === "cliente" ? [{ SNombreCliente: last }]
    : sort === "tipo" ? [{ tipoInmueble: { SNombre: direction } }]
    : sort === "tipoavaluo" ? [{ tipoAvaluo: { SNombre: direction } }]
    : sort === "estado" ? [{ estadoAvaluo: { IOrden: direction } }]
    : sort === "valuador" ? [{ usuarioResponsable: { SNombre: direction } }, { usuarioCreador: { SNombre: direction } }]
    : sort === "creacion" ? [{ DFechaCreacion: direction }]
    : sort === "conclusion" ? [{ DFechaConclusion: last }]
    : sort === "version" ? [{ INumeroVersionActual: direction }]
    : sort === "eliminacion" ? [{ DFechaEliminacion: last }]
    : [{ DFechaModificacion: direction }];
  return [...first, { IdAvaluo: direction }];
}

function mapPageRow(row: PageRow): ValuationPageItem {
  return {
    id: row.UIdentificadorPublico,
    folio: row.SFolio,
    title: row.STitulo,
    client: row.SNombreCliente ?? "",
    location: row.propiedadSujeto?.direccionesPropiedad[0]?.SDireccionCompleta ?? "",
    valuationKind: row.tipoOperacion.SClave.toLowerCase(),
    propertyKind: row.tipoInmueble.SClave.toLowerCase(),
    propertyKindName: row.tipoInmueble.SNombre,
    appraisalKindName: row.tipoAvaluo.SNombre,
    status: row.estadoAvaluo.SClave.toLowerCase(),
    statusName: row.estadoAvaluo.SNombre,
    appraiserName: personName(row.usuarioResponsable) || personName(row.usuarioCreador),
    createdAt: row.DFechaCreacion,
    updatedAt: row.DFechaModificacion,
    concludedAt: row.DFechaConclusion,
    version: row.INumeroVersionActual,
    archivedAt: row.DFechaArchivo,
    deletedAt: row.DFechaEliminacion,
    reviewApprovedAt: row.DFechaRevisionAprobada,
  };
}

/** One page of the organization's valuations, most recently modified first unless sorted otherwise, filtered in the database. */
export async function listValuationsPage(
  query: ValuationPageQuery,
): Promise<{ items: ValuationPageItem[]; total: number }> {
  const pageSize = Math.max(1, Math.min(Math.trunc(query.pageSize), 100));
  const page = Math.max(1, Math.trunc(query.page));
  // The trash deletes for good what waited its days before it is read.
  if (query.trash) await purgeExpiredTrash(query.organizationId);
  const where = valuationPageWhere(query);

  const [rows, total] = await prisma.$transaction([
    prisma.avaluo.findMany({
      where,
      select: valuationPageSelect,
      orderBy: valuationPageOrder(query.sort, query.direction),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.avaluo.count({ where }),
  ]);

  return { total, items: rows.map(mapPageRow) };
}

/** Every row of the list as filtered and sorted, for «Exportar a Excel»; at most `limit`. */
export async function listValuationsForExport(query: Omit<ValuationPageQuery, "page" | "pageSize">, limit: number) {
  if (query.trash) await purgeExpiredTrash(query.organizationId);
  const where = valuationPageWhere(query);
  const [rows, total] = await prisma.$transaction([
    prisma.avaluo.findMany({ where, select: valuationPageSelect, orderBy: valuationPageOrder(query.sort, query.direction), take: limit }),
    prisma.avaluo.count({ where }),
  ]);
  return { items: rows.map(mapPageRow), total };
}

/** The people the «Valuador» filter offers: whoever created or is responsible for a valuation of the firm. */
export async function listValuationAppraisers(organizationId: number): Promise<Array<{ id: number; name: string }>> {
  const users = await prisma.usuario.findMany({
    where: {
      OR: [
        { avaluosCreados: { some: { IdOrganizacion: organizationId, DFechaEliminacionDefinitiva: null } } },
        { avaluosResponsable: { some: { IdOrganizacion: organizationId, DFechaEliminacionDefinitiva: null } } },
      ],
    },
    select: { IdUsuario: true, SNombre: true, SApellidoPaterno: true, SApellidoMaterno: true },
    orderBy: [{ SNombre: "asc" }, { IdUsuario: "asc" }],
    take: 200,
  });
  return users.map((user) => ({ id: user.IdUsuario, name: personName(user) }));
}

/** The property and appraisal types the filters offer, in the catalog's order. */
export async function listValuationKinds() {
  const [propertyKinds, appraisalKinds] = await Promise.all([
    prisma.tipoInmueble.findMany({ where: { BActivo: true }, select: { SClave: true, SNombre: true }, orderBy: [{ IOrden: "asc" }, { IdTipoInmueble: "asc" }] }),
    prisma.tipoAvaluo.findMany({ where: { BActivo: true }, select: { SClave: true, SNombre: true }, orderBy: [{ IOrden: "asc" }, { IdTipoAvaluo: "asc" }] }),
  ]);
  const option = (kind: { SClave: string; SNombre: string }) => ({ key: kind.SClave.toLowerCase(), name: kind.SNombre });
  return { propertyKinds: propertyKinds.map(option), appraisalKinds: appraisalKinds.map(option) };
}

/** Sends the valuation to the trash: out of every list, search, map and count, and not editable, until it is restored. */
export async function moveValuationToTrash(id: string, organizationId: number) {
  if (!UUID.test(id)) return null;
  const existing = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: id, IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
    select: { IdAvaluo: true, SFolio: true },
  });
  if (!existing) return null;
  await prisma.avaluo.update({ where: { IdAvaluo: existing.IdAvaluo }, data: { BActivo: false, DFechaEliminacion: new Date() } });
  return { id, folio: existing.SFolio };
}

export type TrashOutcome =
  | { ok: true; id: string; folio: string }
  | { ok: false; status: 404 | 409; error: string };

/** A valuation of the trash still within its days, or null. */
async function trashedValuation(id: string, organizationId: number, now = new Date()) {
  if (!UUID.test(id)) return null;
  return prisma.avaluo.findFirst({
    where: {
      UIdentificadorPublico: id,
      IdOrganizacion: organizationId,
      BActivo: false,
      DFechaEliminacion: { gte: trashCutoff(now) },
      DFechaEliminacionDefinitiva: null,
    },
    select: { IdAvaluo: true, SFolio: true },
  });
}

/** Brings a valuation back from the trash to the list, as it was. */
export async function restoreValuationFromTrash(id: string, organizationId: number): Promise<TrashOutcome> {
  const trashed = await trashedValuation(id, organizationId);
  if (!trashed) return { ok: false, status: 404, error: "El avalúo ya no está en la papelera." };
  try {
    await prisma.avaluo.update({ where: { IdAvaluo: trashed.IdAvaluo }, data: { BActivo: true, DFechaEliminacion: null } });
  } catch (error) {
    // The folio is unique among the valuations not deleted (migration 005).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, status: 409, error: `Ya hay otro avalúo con el folio ${trashed.SFolio}; no se puede restaurar.` };
    }
    throw error;
  }
  return { ok: true, id, folio: trashed.SFolio };
}

/**
 * «Eliminar definitivamente»: out of the trash for good, with no way back.
 * The row stays for the credits it consumed and the audit; nothing shows it.
 * The folio typed must be the valuation's, as the dialog asks.
 */
export async function purgeValuationFromTrash(id: string, organizationId: number, confirmFolio: string): Promise<TrashOutcome> {
  const trashed = await trashedValuation(id, organizationId);
  if (!trashed) return { ok: false, status: 404, error: "El avalúo ya no está en la papelera." };
  if (confirmFolio.trim().toLowerCase() !== trashed.SFolio.trim().toLowerCase()) {
    return { ok: false, status: 409, error: `Escribe el folio ${trashed.SFolio} para confirmar.` };
  }
  await prisma.avaluo.update({ where: { IdAvaluo: trashed.IdAvaluo }, data: { DFechaEliminacionDefinitiva: new Date() } });
  return { ok: true, id, folio: trashed.SFolio };
}

/** Deletes for good the valuations of the organization that waited their days in the trash; returns how many. */
export async function purgeExpiredTrash(organizationId: number, now = new Date()) {
  const { count } = await prisma.avaluo.updateMany({
    where: { IdOrganizacion: organizationId, BActivo: false, DFechaEliminacion: { lt: trashCutoff(now) }, DFechaEliminacionDefinitiva: null },
    data: { DFechaEliminacionDefinitiva: now },
  });
  return count;
}
