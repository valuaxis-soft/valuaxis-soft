/**
 * The precision of a valuation's calculations, read and changed. Changing it
 * recomputes every approach of the version with what is stored, so the
 * values, the trace and the conclusion follow it at once.
 */
import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { findValuation, versionPrecision, writableVersion } from "./access";
import { LEGACY_PRECISION, type CalculationPrecision } from "./calculation-precision";
import { recomputeMarkets } from "./market.service";

export type CalculationPrecisionDto = CalculationPrecision & { locked: boolean };

export async function getCalculationPrecision(publicId: string, organizationId: number): Promise<CalculationPrecisionDto> {
  return prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    const precision = versionId ? await versionPrecision(tx, versionId) : LEGACY_PRECISION;
    return { ...precision, locked: avaluo.BBloqueado };
  });
}

export async function saveCalculationPrecision(publicId: string, user: AuthUser, precision: CalculationPrecision) {
  await prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    await tx.versionAvaluo.update({ where: { IdVersionAvaluo: versionId }, data: { JConfiguracionCalculo: precision } });
    await recomputeMarkets(tx, versionId);
  }, { timeout: 30_000 });
}
