/**
 * The two lists of the dashboard that read beyond the valuations page: what
 * needs attention and the recent status changes. Each one is a single bounded
 * query on indexed columns, scoped to the organization.
 */
import { prisma } from "@/infrastructure/database/prisma-client";
import { OPEN_STATUS_KEYS, STALE_DRAFT_DAYS, buildAttentionList, type AttentionItem } from "@/features/dashboard/attention";

/** Rows read to choose the attention list from; the list shows fewer. */
const ATTENTION_CANDIDATES = 30;
const ACTIVITY_ITEMS = 6;

/** Open, non-archived valuations of the organization that are in review, without comparables or idle for a month. */
export async function listAttentionValuations(organizationId: number, now = new Date()): Promise<AttentionItem[]> {
  const staleBefore = new Date(now.getTime() - STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.avaluo.findMany({
    where: {
      IdOrganizacion: organizationId,
      BActivo: true,
      DFechaEliminacion: null,
      DFechaArchivo: null,
      estadoAvaluo: { SClave: { in: OPEN_STATUS_KEYS.map((key) => key.toUpperCase()) } },
      OR: [
        { estadoAvaluo: { SClave: "EN_REVISION" } },
        { estadoAvaluo: { SClave: { in: ["EN_EDICION", "REABIERTO"] } }, comparables: { none: {} } },
        { estadoAvaluo: { SClave: { in: ["NUEVO", "EN_EDICION", "REABIERTO"] } }, DFechaModificacion: { lte: staleBefore } },
      ],
    },
    select: {
      UIdentificadorPublico: true,
      SFolio: true,
      STitulo: true,
      SNombreCliente: true,
      DFechaModificacion: true,
      estadoAvaluo: { select: { SClave: true } },
      _count: { select: { comparables: true } },
    },
    orderBy: [{ DFechaModificacion: "asc" }, { IdAvaluo: "asc" }],
    take: ATTENTION_CANDIDATES,
  });

  return buildAttentionList(
    rows.map((row) => ({
      id: row.UIdentificadorPublico,
      folio: row.SFolio,
      title: row.STitulo,
      client: row.SNombreCliente ?? "",
      status: row.estadoAvaluo.SClave.toLowerCase(),
      updatedAt: row.DFechaModificacion,
      comparables: row._count.comparables,
    })),
    now,
  );
}

export type ActivityItem = {
  id: string;
  valuationId: string;
  folio: string;
  title: string;
  /** Lowercase status keys; `from` is null for the first status. */
  from: string | null;
  to: string;
  toName: string;
  who: string;
  at: Date;
};

/** The last status changes of the organization's live valuations, newest first. */
export async function listRecentActivity(organizationId: number): Promise<ActivityItem[]> {
  const rows = await prisma.estadoAvaluoHistorial.findMany({
    where: { avaluo: { IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null } },
    select: {
      IdEstadoAvaluoHistorial: true,
      DFechaCambio: true,
      estadoAnterior: { select: { SClave: true } },
      estadoNuevo: { select: { SClave: true, SNombre: true } },
      usuario: { select: { SNombre: true, SApellidoPaterno: true } },
      avaluo: { select: { UIdentificadorPublico: true, SFolio: true, STitulo: true } },
    },
    orderBy: [{ DFechaCambio: "desc" }, { IdEstadoAvaluoHistorial: "desc" }],
    take: ACTIVITY_ITEMS,
  });

  return rows.map((row) => ({
    id: row.IdEstadoAvaluoHistorial.toString(),
    valuationId: row.avaluo.UIdentificadorPublico,
    folio: row.avaluo.SFolio,
    title: row.avaluo.STitulo,
    from: row.estadoAnterior?.SClave.toLowerCase() ?? null,
    to: row.estadoNuevo.SClave.toLowerCase(),
    toName: row.estadoNuevo.SNombre,
    who: [row.usuario.SNombre, row.usuario.SApellidoPaterno].filter(Boolean).join(" "),
    at: row.DFechaCambio,
  }));
}
