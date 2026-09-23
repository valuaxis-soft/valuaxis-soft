import { createHash } from "node:crypto";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { AuthUser } from "@/features/auth/model";
import { copyVersionContent } from "@/features/valuations/services/valuation-version-copy.service";
import { ValuationWorkflowError } from "./errors";

export async function concludeValuation(input: {
  publicId: string;
  organizationId: number;
  user: AuthUser;
}) {
  return prisma.$transaction(async (tx) => {
    const avaluo = await tx.avaluo.findFirst({
      where: {
        UIdentificadorPublico: input.publicId,
        IdOrganizacion: input.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
      include: {
        versionTrabajo: { include: { seccionesDocumentos: true } },
      },
    });
    if (!avaluo) throw new ValuationWorkflowError("Avaluo no encontrado", 404);
    if (!avaluo.IdVersionTrabajo || !avaluo.versionTrabajo) throw new ValuationWorkflowError("No existe version de trabajo", 409);
    if (avaluo.BBloqueado) return { id: input.publicId, alreadyConcluded: true };

    const finalVersionState = await tx.estadoVersionAvaluo.findFirst({
      where: { BActivo: true, BEsFinal: true },
      orderBy: { IOrden: "asc" },
    });
    const finalValuationState = await tx.estadoAvaluo.findFirst({
      where: { BActivo: true, BEsFinal: true },
      orderBy: { IOrden: "asc" },
    });
    if (!finalVersionState || !finalValuationState) {
      throw new ValuationWorkflowError("Faltan estados finales configurados", 500);
    }

    const requiredSections = avaluo.versionTrabajo.seccionesDocumentos.filter(
      (section) => section.BObligatoria && section.BVisible,
    );
    if (!requiredSections.length) {
      throw new ValuationWorkflowError("No hay secciones obligatorias configuradas para concluir", 409);
    }

    const contentHash = createHash("sha256")
      .update(JSON.stringify(avaluo.versionTrabajo.seccionesDocumentos))
      .digest("hex");

    await tx.versionAvaluo.update({
      where: { IdVersionAvaluo: avaluo.IdVersionTrabajo },
      data: {
        IdEstadoVersionAvaluo: finalVersionState.IdEstadoVersionAvaluo,
        IdUsuarioFinalizador: input.user.id,
        DFechaFinalizacion: new Date(),
        SHashContenido: contentHash,
      },
    });

    await tx.avaluo.update({
      where: { IdAvaluo: avaluo.IdAvaluo },
      data: {
        IdEstadoAvaluo: finalValuationState.IdEstadoAvaluo,
        IdVersionFinal: avaluo.IdVersionTrabajo,
        IdVersionTrabajo: null,
        BBloqueado: true,
        DFechaConclusion: new Date(),
        DFechaBloqueo: new Date(),
      },
    });

    await tx.estadoAvaluoHistorial.create({
      data: {
        IdAvaluo: avaluo.IdAvaluo,
        IdVersionAvaluo: avaluo.IdVersionTrabajo,
        IdUsuario: input.user.id,
        IdEstadoAnterior: avaluo.IdEstadoAvaluo,
        IdEstadoNuevo: finalValuationState.IdEstadoAvaluo,
        SMotivo: "Conclusion de avaluo",
      },
    });

    return { id: input.publicId, hash: contentHash, status: finalValuationState.SClave };
  });
}

/** Reopening copies the whole document; a large valuation can exceed Prisma's 5 s default. */
const REOPEN_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

export async function reopenValuation(input: {
  publicId: string;
  organizationId: number;
  user: AuthUser;
  reason: string;
  acceptedText: string;
}) {
  if (!input.reason.trim()) throw new ValuationWorkflowError("El motivo es obligatorio", 400);
  if (!input.acceptedText.trim()) throw new ValuationWorkflowError("La aceptacion de terminos es obligatoria", 400);

  return prisma.$transaction(async (tx) => {
    const avaluo = await tx.avaluo.findFirst({
      where: {
        UIdentificadorPublico: input.publicId,
        IdOrganizacion: input.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
      select: {
        IdAvaluo: true,
        IdEstadoAvaluo: true,
        IdVersionFinal: true,
        IdVersionTrabajo: true,
        INumeroVersionActual: true,
      },
    });
    if (!avaluo) throw new ValuationWorkflowError("Avaluo no encontrado", 404);
    if (!avaluo.IdVersionFinal) throw new ValuationWorkflowError("No existe version final para reabrir", 409);
    if (avaluo.IdVersionTrabajo) return { id: input.publicId, alreadyOpen: true };

    const editableVersionState = await tx.estadoVersionAvaluo.findFirst({
      where: { BActivo: true, BPermiteEdicion: true, BEsFinal: false },
      orderBy: { IOrden: "asc" },
    });
    const editableValuationState = await tx.estadoAvaluo.findFirst({
      where: { BActivo: true, BPermiteEdicion: true, BEsFinal: false },
      orderBy: { IOrden: "asc" },
    });
    if (!editableVersionState || !editableValuationState) {
      throw new ValuationWorkflowError("Faltan estados editables configurados", 500);
    }

    const nextVersionNumber = avaluo.INumeroVersionActual + 1;
    const newVersion = await tx.versionAvaluo.create({
      data: {
        IdAvaluo: avaluo.IdAvaluo,
        IdVersionOrigen: avaluo.IdVersionFinal,
        IdUsuarioCreador: input.user.id,
        IdEstadoVersionAvaluo: editableVersionState.IdEstadoVersionAvaluo,
        INumeroVersion: nextVersionNumber,
        SMotivoReapertura: input.reason,
        STextoAceptacion: input.acceptedText,
        BTerminosAceptados: true,
        DFechaReapertura: new Date(),
        DFechaAceptacionTerminos: new Date(),
      },
    });

    const copied = await copyVersionContent(tx, {
      fromVersionId: avaluo.IdVersionFinal,
      toVersionId: newVersion.IdVersionAvaluo,
    });

    await tx.reaperturaAvaluo.create({
      data: {
        IdAvaluo: avaluo.IdAvaluo,
        IdVersionAnterior: avaluo.IdVersionFinal,
        IdVersionNueva: newVersion.IdVersionAvaluo,
        IdUsuario: input.user.id,
        SMotivo: input.reason,
        STextoAceptado: input.acceptedText,
        BTerminosAceptados: true,
      },
    });

    await tx.avaluo.update({
      where: { IdAvaluo: avaluo.IdAvaluo },
      data: {
        IdEstadoAvaluo: editableValuationState.IdEstadoAvaluo,
        IdVersionTrabajo: newVersion.IdVersionAvaluo,
        INumeroVersionActual: nextVersionNumber,
        BBloqueado: false,
        DFechaBloqueo: null,
      },
    });

    await tx.estadoAvaluoHistorial.create({
      data: {
        IdAvaluo: avaluo.IdAvaluo,
        IdVersionAvaluo: newVersion.IdVersionAvaluo,
        IdUsuario: input.user.id,
        IdEstadoAnterior: avaluo.IdEstadoAvaluo,
        IdEstadoNuevo: editableValuationState.IdEstadoAvaluo,
        SMotivo: input.reason,
      },
    });

    return { id: input.publicId, versionId: newVersion.IdVersionAvaluo, copied };
  }, REOPEN_TRANSACTION_OPTIONS);
}
