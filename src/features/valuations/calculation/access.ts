/**
 * Access to the version a calculation reads or writes: the version the editor
 * shows (working, or final once concluded), and the working version for
 * edits, which concluded valuations do not allow.
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { ensureWorkingVersion } from "../services/valuation-workflow/working-version";

export type Tx = Prisma.TransactionClient;

export const decimal = (value: Prisma.Decimal | null | undefined) => (value === null || value === undefined ? null : Number(value));
export const asRecord = (value: Prisma.JsonValue | null) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export async function findValuation(tx: Tx, publicId: string, organizationId: number) {
  const avaluo = await tx.avaluo.findFirst({
    where: { UIdentificadorPublico: publicId, IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
    select: {
      IdAvaluo: true,
      IdVersionTrabajo: true,
      IdVersionFinal: true,
      BBloqueado: true,
      IdTipoInmueble: true,
      organizacion: { select: { UIdentificadorPublico: true } },
    },
  });
  if (!avaluo) throw new ValuationWorkflowError("Avalúo no encontrado", 404);
  return avaluo;
}

export async function writableVersion(tx: Tx, publicId: string, user: AuthUser) {
  const avaluo = await findValuation(tx, publicId, user.organizationId);
  if (avaluo.BBloqueado) throw new ValuationWorkflowError("El avalúo está concluido; reábrelo para editarlo.", 409);
  const versionId = avaluo.IdVersionTrabajo ?? (await ensureWorkingVersion({ avaluoId: avaluo.IdAvaluo, userId: user.id, tx }));
  return { avaluo, versionId };
}

export async function catalogId<T extends { SClave: string }>(
  find: (key: string) => Promise<T | null>,
  key: string,
  pick: (row: T) => number,
) {
  const row = await find(key);
  if (!row) throw new ValuationWorkflowError(`Falta la clave ${key} en el catálogo.`, 500);
  return pick(row);
}
