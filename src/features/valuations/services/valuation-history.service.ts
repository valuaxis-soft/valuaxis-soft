import { prisma } from "@/infrastructure/database/prisma-client";
import {
  buildHistoryEvents,
  pdfLabel,
  type AuditRow,
  type HistoryVersion,
  type StateRow,
  type ValuationHistory,
} from "./valuation-history";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The most recent audit rows a history reads; the status changes and versions are always all. */
const MAX_AUDIT_ROWS = 400;

type Person = { SNombre: string; SApellidoPaterno: string | null; SApellidoMaterno: string | null } | null;
const personName = (user: Person) => (user ? [user.SNombre, user.SApellidoPaterno, user.SApellidoMaterno].filter(Boolean).join(" ") : "");
const personSelect = { select: { SNombre: true, SApellidoPaterno: true, SApellidoMaterno: true } } as const;
const asRecord = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** The history of a valuation of the organization (not one in the trash), or null. */
export async function getValuationHistory(publicId: string, organizationId: number): Promise<ValuationHistory | null> {
  if (!UUID.test(publicId)) return null;
  const valuation = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: publicId, IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
    select: {
      IdAvaluo: true,
      SFolio: true,
      DFechaCreacion: true,
      DFechaRevisionAprobada: true,
      IdVersionTrabajo: true,
      IdVersionFinal: true,
      estadoAvaluo: { select: { SClave: true } },
      usuarioCreador: personSelect,
      avaluoOrigen: { select: { SFolio: true } },
    },
  });
  if (!valuation) return null;

  const [states, audits, copies, versions, exports] = await Promise.all([
    prisma.estadoAvaluoHistorial.findMany({
      where: { IdAvaluo: valuation.IdAvaluo },
      orderBy: { IdEstadoAvaluoHistorial: "asc" },
      select: {
        IdEstadoAvaluoHistorial: true,
        DFechaCambio: true,
        SMotivo: true,
        usuario: personSelect,
        estadoAnterior: { select: { SClave: true, SNombre: true } },
        estadoNuevo: { select: { SClave: true, SNombre: true } },
        versionAvaluo: { select: { INumeroVersion: true } },
      },
    }),
    prisma.auditoria.findMany({
      where: { SEntidad: "Avaluo", SIdentificadorEntidad: publicId, IdOrganizacion: organizationId },
      orderBy: { DFechaEvento: "desc" },
      take: MAX_AUDIT_ROWS,
      select: { IdAuditoria: true, DFechaEvento: true, SAccion: true, JMetadatos: true, usuario: personSelect },
    }),
    // The copies made of this one: their audit names this one as the source.
    prisma.auditoria.findMany({
      where: { SEntidad: "Avaluo", SAccion: "VALUATION_DUPLICATE", IdOrganizacion: organizationId, JMetadatos: { path: ["source"], equals: publicId } },
      orderBy: { DFechaEvento: "desc" },
      take: 50,
      select: { IdAuditoria: true, DFechaEvento: true, JMetadatos: true, usuario: personSelect },
    }),
    prisma.versionAvaluo.findMany({
      where: { IdAvaluo: valuation.IdAvaluo },
      orderBy: { INumeroVersion: "asc" },
      select: {
        IdVersionAvaluo: true,
        INumeroVersion: true,
        DFechaCreacion: true,
        DFechaFinalizacion: true,
        DFechaReapertura: true,
        SMotivoReapertura: true,
        usuarioCreador: personSelect,
        usuarioFinalizador: personSelect,
      },
    }),
    prisma.exportacionAvaluo.findMany({
      where: { IdAvaluo: valuation.IdAvaluo, IdArchivo: { not: null }, SFormato: "PDF", archivo: { DFechaEliminacion: null } },
      orderBy: { DFechaSolicitud: "desc" },
      take: 200,
      select: {
        IdVersionAvaluo: true,
        STipoExportacion: true,
        DFechaSolicitud: true,
        usuario: personSelect,
        archivo: { select: { UIdentificadorPublico: true, tipoArchivo: { select: { SClave: true } } } },
      },
    }),
  ]);

  const stateRows: StateRow[] = states.map((row) => ({
    id: String(row.IdEstadoAvaluoHistorial),
    at: row.DFechaCambio,
    actor: personName(row.usuario),
    from: row.estadoAnterior?.SClave ?? null,
    fromName: row.estadoAnterior?.SNombre ?? null,
    to: row.estadoNuevo.SClave,
    toName: row.estadoNuevo.SNombre,
    reason: row.SMotivo,
    version: row.versionAvaluo?.INumeroVersion ?? null,
  }));
  const auditRows: AuditRow[] = audits.map((row) => ({
    id: String(row.IdAuditoria),
    at: row.DFechaEvento,
    actor: personName(row.usuario),
    action: row.SAccion,
    metadata: asRecord(row.JMetadatos),
  }));

  const currentVersionId = valuation.IdVersionTrabajo ?? valuation.IdVersionFinal;
  const versionRows: HistoryVersion[] = versions.map((version) => ({
    number: version.INumeroVersion,
    current: version.IdVersionAvaluo === currentVersionId,
    createdAt: version.DFechaCreacion.toISOString(),
    createdBy: personName(version.usuarioCreador),
    concludedAt: version.DFechaFinalizacion?.toISOString() ?? null,
    concludedBy: version.usuarioFinalizador ? personName(version.usuarioFinalizador) : null,
    reopenedAt: version.DFechaReapertura?.toISOString() ?? null,
    reopenReason: version.SMotivoReapertura,
    pdfs: exports
      .filter((item) => item.IdVersionAvaluo === version.IdVersionAvaluo && item.archivo)
      .map((item) => ({
        fileId: item.archivo!.UIdentificadorPublico,
        at: item.DFechaSolicitud.toISOString(),
        by: personName(item.usuario),
        final: item.archivo!.tipoArchivo.SClave === "PDF_FINAL",
        label: pdfLabel(item.STipoExportacion),
      })),
  }));

  return {
    folio: valuation.SFolio,
    status: valuation.estadoAvaluo.SClave.toLowerCase(),
    reviewApprovedAt: valuation.DFechaRevisionAprobada?.toISOString() ?? null,
    events: buildHistoryEvents({
      states: stateRows,
      audits: auditRows,
      copiedFrom: valuation.avaluoOrigen ? { folio: valuation.avaluoOrigen.SFolio, at: valuation.DFechaCreacion, actor: personName(valuation.usuarioCreador) } : null,
      copies: copies.map((copy) => ({
        id: String(copy.IdAuditoria),
        folio: String(asRecord(copy.JMetadatos)?.folio ?? "otro folio"),
        at: copy.DFechaEvento,
        actor: personName(copy.usuario),
      })),
    }),
    // The most recent version first, as the history reads.
    versions: versionRows.reverse(),
  };
}

/**
 * A PDF the valuation stored with one of its exports, for its history's
 * «Descargar PDF»: its storage key, only when it is this valuation's.
 */
export async function findValuationPdf(publicId: string, organizationId: number, filePublicId: string) {
  if (!UUID.test(publicId) || !UUID.test(filePublicId)) return null;
  const item = await prisma.exportacionAvaluo.findFirst({
    where: {
      avaluo: { UIdentificadorPublico: publicId, IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
      archivo: { UIdentificadorPublico: filePublicId, IdOrganizacion: organizationId, DFechaEliminacion: null },
    },
    select: { archivo: { select: { SClaveObjeto: true, SNombreOriginal: true } } },
  });
  return item?.archivo ?? null;
}
