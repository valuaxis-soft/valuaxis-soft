/**
 * Valuations that stayed «Nuevo» although somebody already captured them:
 * before 2 Nov 2026 the first save did not move them to «En edición», and
 * the audit of 5 Nov still saw them (AUD-14). This moves each to «En
 * edición» with a row of its status history that says it was a correction.
 * Run by `pnpm valuations:fix-status` (scripts/ops/corregir-estado-nuevo.ts).
 */
import { prisma } from "@/infrastructure/database/prisma-client";

/** A valuation edited this long after it was created was captured, not just created from its template. */
export const CAPTURED_AFTER_MS = 2 * 60 * 1000;
export const CORRECTION_REASON = "Correccion automatica: ya tenia captura y seguia en Nuevo";

export type StaleNewValuation = { id: number; publicId: string; folio: string; organizationId: number; createdAt: Date; updatedAt: Date; comparables: number };

/** The active valuations still «Nuevo» that were saved after their creation or have comparables. */
export async function findStaleNewValuations(options: { organizationId?: number | null } = {}): Promise<StaleNewValuation[]> {
  const rows = await prisma.avaluo.findMany({
    where: {
      BActivo: true,
      DFechaEliminacion: null,
      BBloqueado: false,
      IdVersionTrabajo: { not: null },
      estadoAvaluo: { BEsInicial: true },
      ...(options.organizationId ? { IdOrganizacion: options.organizationId } : {}),
    },
    select: {
      IdAvaluo: true, UIdentificadorPublico: true, SFolio: true, IdOrganizacion: true, DFechaCreacion: true, DFechaModificacion: true,
      _count: { select: { comparables: true } },
    },
    orderBy: { IdAvaluo: "asc" },
  });
  return rows
    .filter((row) => row._count.comparables > 0 || row.DFechaModificacion.getTime() - row.DFechaCreacion.getTime() > CAPTURED_AFTER_MS)
    .map((row) => ({
      id: row.IdAvaluo,
      publicId: row.UIdentificadorPublico,
      folio: row.SFolio,
      organizationId: row.IdOrganizacion,
      createdAt: row.DFechaCreacion,
      updatedAt: row.DFechaModificacion,
      comparables: row._count.comparables,
    }));
}

/** Moves those valuations to «En edición», each with its history row (by its creator); returns how many changed. */
export async function advanceStaleNewValuations(valuations: StaleNewValuation[]) {
  const editing = await prisma.estadoAvaluo.findFirst({ where: { BActivo: true, SClave: "EN_EDICION" }, select: { IdEstadoAvaluo: true } });
  if (!editing) throw new Error("Falta el estado EN_EDICION en el catálogo");
  let changed = 0;
  for (const valuation of valuations) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.avaluo.findUnique({
        where: { IdAvaluo: valuation.id },
        select: { IdEstadoAvaluo: true, IdVersionTrabajo: true, IdUsuarioCreador: true, DFechaModificacion: true, estadoAvaluo: { select: { BEsInicial: true } } },
      });
      // Saved meanwhile: the first save already moved it.
      if (!current?.estadoAvaluo.BEsInicial) return;
      await tx.avaluo.update({
        where: { IdAvaluo: valuation.id },
        // The list keeps ordering it by when it was really last edited.
        data: { IdEstadoAvaluo: editing.IdEstadoAvaluo, DFechaModificacion: current.DFechaModificacion },
      });
      await tx.estadoAvaluoHistorial.create({
        data: {
          IdAvaluo: valuation.id,
          IdVersionAvaluo: current.IdVersionTrabajo,
          IdUsuario: current.IdUsuarioCreador,
          IdEstadoAnterior: current.IdEstadoAvaluo,
          IdEstadoNuevo: editing.IdEstadoAvaluo,
          SMotivo: CORRECTION_REASON,
        },
      });
      changed += 1;
    });
  }
  return changed;
}
