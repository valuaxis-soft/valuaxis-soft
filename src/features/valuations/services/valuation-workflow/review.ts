import type { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { AuthUser } from "@/features/auth/model";
import { ValuationWorkflowError } from "./errors";

/**
 * The review of a valuation: Nuevo → En edición (first save) → «Enviar a
 * revisión» → the reviewer «Aprobar» (ready to conclude) or «Regresar a
 * edición» with a reason → Concluir. Each step is a row of the status
 * history, so the history tells who did it, when and why. Nothing here keeps
 * the appraiser from editing or concluding: the permissions do (AVALUO_EDITAR
 * to send, AVALUO_REVISAR to approve or return), the system only tells.
 */
export type ReviewAction = "enviar" | "aprobar" | "regresar";

/** The states a valuation can be sent to review from: the open ones before review. */
const SENDABLE_STATES = new Set(["NUEVO", "EN_EDICION", "REABIERTO"]);
export const REVIEW_NOTE_MAX_LENGTH = 1000;

export type ReviewOutcome = { id: string; status: string; approvedAt: Date | null; unchanged?: boolean };

async function stateByKey(tx: Prisma.TransactionClient, key: string) {
  const state = await tx.estadoAvaluo.findFirst({ where: { BActivo: true, SClave: key }, select: { IdEstadoAvaluo: true, SClave: true } });
  if (!state) throw new ValuationWorkflowError(`Falta el estado ${key} en el catálogo`, 500);
  return state;
}

export async function changeReviewState(input: {
  publicId: string;
  organizationId: number;
  user: AuthUser;
  action: ReviewAction;
  note?: string | null;
}): Promise<ReviewOutcome> {
  const note = input.note?.trim().slice(0, REVIEW_NOTE_MAX_LENGTH) || null;
  if (input.action === "regresar" && !note) throw new ValuationWorkflowError("Escribe el motivo para regresarlo a edición.", 400);

  return prisma.$transaction(async (tx) => {
    const valuation = await tx.avaluo.findFirst({
      where: { UIdentificadorPublico: input.publicId, IdOrganizacion: input.organizationId, BActivo: true, DFechaEliminacion: null },
      select: { IdAvaluo: true, IdEstadoAvaluo: true, IdVersionTrabajo: true, BBloqueado: true, DFechaRevisionAprobada: true, estadoAvaluo: { select: { SClave: true } } },
    });
    if (!valuation) throw new ValuationWorkflowError("Avaluo no encontrado", 404);
    if (valuation.BBloqueado || !valuation.IdVersionTrabajo) throw new ValuationWorkflowError("El avalúo ya está concluido; para cambiarlo, reábrelo.", 409);
    const current = valuation.estadoAvaluo.SClave.toUpperCase();

    const record = (toStateId: number) => tx.estadoAvaluoHistorial.create({
      data: {
        IdAvaluo: valuation.IdAvaluo,
        IdVersionAvaluo: valuation.IdVersionTrabajo,
        IdUsuario: input.user.id,
        IdEstadoAnterior: valuation.IdEstadoAvaluo,
        IdEstadoNuevo: toStateId,
        SMotivo: note,
      },
    });

    if (input.action === "enviar") {
      if (current === "EN_REVISION") return { id: input.publicId, status: "en_revision", approvedAt: valuation.DFechaRevisionAprobada, unchanged: true };
      if (!SENDABLE_STATES.has(current)) throw new ValuationWorkflowError("Este avalúo no se puede enviar a revisión en su estado actual.", 409);
      const review = await stateByKey(tx, "EN_REVISION");
      await tx.avaluo.update({ where: { IdAvaluo: valuation.IdAvaluo }, data: { IdEstadoAvaluo: review.IdEstadoAvaluo, DFechaRevisionAprobada: null } });
      await record(review.IdEstadoAvaluo);
      return { id: input.publicId, status: "en_revision", approvedAt: null };
    }

    if (current !== "EN_REVISION") throw new ValuationWorkflowError("El avalúo no está en revisión.", 409);

    if (input.action === "aprobar") {
      if (valuation.DFechaRevisionAprobada) return { id: input.publicId, status: "en_revision", approvedAt: valuation.DFechaRevisionAprobada, unchanged: true };
      const approvedAt = new Date();
      await tx.avaluo.update({ where: { IdAvaluo: valuation.IdAvaluo }, data: { DFechaRevisionAprobada: approvedAt } });
      // Same state before and after: the history reads it as the approval.
      await record(valuation.IdEstadoAvaluo);
      return { id: input.publicId, status: "en_revision", approvedAt };
    }

    const editing = await stateByKey(tx, "EN_EDICION");
    await tx.avaluo.update({ where: { IdAvaluo: valuation.IdAvaluo }, data: { IdEstadoAvaluo: editing.IdEstadoAvaluo, DFechaRevisionAprobada: null } });
    await record(editing.IdEstadoAvaluo);
    return { id: input.publicId, status: "en_edicion", approvedAt: null };
  });
}
