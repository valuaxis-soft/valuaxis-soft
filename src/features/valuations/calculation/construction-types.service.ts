/**
 * Construction types of a valuation version: reference, description,
 * classification, quality, surface, age and useful life, captured once in the
 * construction section (`TipoConstruccionAvaluo`). The cost approach picks
 * them by reference and keeps its own columns in `CostoConstruccion`, so a
 * change here recomputes the cost approach. Each type is its row: renaming
 * its reference keeps the row, and with it what the cost approach captured.
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";
import { asRecord, decimal, findValuation, formulasOrThrow, writableVersion, type Tx } from "./access";
import { storedFormulas, type CapturedFormulas } from "./captured-formulas";
import type { ConstructionTypesPayload } from "./cost-schemas";
import { recomputeCosts } from "./cost.service";
import { remainingUsefulLife, type ConstructionTypeDto, type ConstructionTypesDto } from "./cost-types";

type StoredType = ConstructionTypeDto & { id: number };

const refKey = (ref: string) => ref.trim().toLowerCase();

/** The formulas of the types' numeric fields live with the construction record, by path ("types.0.area"). */
export const typeFormulasOf = (construction: { JDatosAdicionales: Prisma.JsonValue | null } | null): CapturedFormulas =>
  storedFormulas(asRecord(construction?.JDatosAdicionales ?? null).typeFormulas);

/** The construction record of the version, created on first use. */
export async function constructionOf(tx: Tx, versionId: number) {
  return (await tx.construccionAvaluo.findFirst({ where: { IdVersionAvaluo: versionId }, orderBy: { IdConstruccionAvaluo: "asc" } }))
    ?? (await tx.construccionAvaluo.create({ data: { IdVersionAvaluo: versionId } }));
}

/** The types of the version, in their order, with their row ids. */
export async function loadConstructionTypes(tx: Tx, versionId: number): Promise<StoredType[]> {
  const rows = await tx.tipoConstruccionAvaluo.findMany({
    where: { construccionAvaluo: { IdVersionAvaluo: versionId } },
    orderBy: [{ IOrden: "asc" }, { IdTipoConstruccionAvaluo: "asc" }],
  });
  return rows.map((row) => ({
    id: row.IdTipoConstruccionAvaluo,
    ref: row.SReferencia ?? "",
    description: row.SDescripcion ?? "",
    classification: row.SClasificacion ?? "",
    quality: row.SCalidad ?? "",
    area: decimal(row.NSuperficie),
    age: decimal(row.NEdad),
    usefulLife: decimal(row.NVidaUtilTotal),
  }));
}

/** Creates a type at the end of the list; the cost approach uses it for a capture that still carries the type's data. */
export async function createConstructionType(tx: Tx, constructionId: number, type: ConstructionTypeDto, order: number) {
  return tx.tipoConstruccionAvaluo.create({
    data: {
      IdConstruccionAvaluo: constructionId,
      SReferencia: type.ref,
      SDescripcion: type.description || null,
      SClasificacion: type.classification || null,
      SCalidad: type.quality || null,
      NEdad: type.age,
      NVidaUtilTotal: type.usefulLife,
      NVidaUtilRemanente: remainingUsefulLife(type),
      NSuperficie: type.area,
      IOrden: order,
    },
  });
}

/** Keeps the built surface of the construction record as the sum of its types. */
export async function updateBuiltArea(tx: Tx, constructionId: number) {
  const types = await tx.tipoConstruccionAvaluo.findMany({ where: { IdConstruccionAvaluo: constructionId }, select: { NSuperficie: true } });
  const total = types.reduce((sum, row) => sum + (decimal(row.NSuperficie) ?? 0), 0);
  await tx.construccionAvaluo.update({ where: { IdConstruccionAvaluo: constructionId }, data: { NSuperficieConstruida: total || null } });
}

export async function getConstructionTypes(publicId: string, organizationId: number): Promise<ConstructionTypesDto> {
  return prisma.$transaction(async (tx) => {
    const avaluo = await findValuation(tx, publicId, organizationId);
    const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
    if (!versionId) return { types: [], locked: avaluo.BBloqueado, formulas: {} };
    const [types, construction] = await Promise.all([
      loadConstructionTypes(tx, versionId),
      tx.construccionAvaluo.findFirst({ where: { IdVersionAvaluo: versionId }, orderBy: { IdConstruccionAvaluo: "asc" }, select: { JDatosAdicionales: true } }),
    ]);
    return { types, locked: avaluo.BBloqueado, formulas: typeFormulasOf(construction) };
  });
}

/**
 * Replaces the list of types. A type keeps its row when the client sends its
 * id, so renaming its reference (T-1 → T-3) keeps what the cost approach
 * captured for it; a type sent without id (older clients) is matched by its
 * reference, as before. A removed type takes its cost row with it. The cost
 * approach is recomputed afterwards: its trace and its pages follow the new
 * reference, since nothing else names a type by its reference.
 */
export async function saveConstructionTypes(publicId: string, user: AuthUser, payload: ConstructionTypesPayload) {
  return prisma.$transaction(async (tx) => {
    const { versionId } = await writableVersion(tx, publicId, user);
    const construction = await constructionOf(tx, versionId);
    const current = await loadConstructionTypes(tx, versionId);
    const byId = new Map(current.map((type) => [type.id, type]));
    const byRef = new Map(current.map((type) => [refKey(type.ref), type]));

    const matched = payload.types.map((type) => {
      if (type.id === undefined) return byRef.get(refKey(type.ref)) ?? null;
      const existing = byId.get(type.id);
      if (!existing) throw new ValuationWorkflowError(`El tipo de construcción ${type.ref} ya no existe; vuelve a cargar la sección.`, 409);
      return existing;
    });
    const matchedIds = matched.flatMap((type) => (type ? [type.id] : []));
    if (new Set(matchedIds).size !== matchedIds.length) throw new ValuationWorkflowError("Un tipo de construcción se envió dos veces.", 400);

    const formulas = formulasOrThrow({
      next: payload,
      sent: payload.formulas,
      previous: { types: current },
      previousFormulas: typeFormulasOf(construction),
    });

    const kept = new Set(matchedIds);
    const removed = current.filter((type) => !kept.has(type.id)).map((type) => type.id);
    if (removed.length) {
      await tx.costoConstruccion.deleteMany({ where: { IdTipoConstruccionAvaluo: { in: removed } } });
      await tx.tipoConstruccionAvaluo.deleteMany({ where: { IdTipoConstruccionAvaluo: { in: removed } } });
    }
    for (const [index, type] of payload.types.entries()) {
      const existing = matched[index];
      if (!existing) {
        await createConstructionType(tx, construction.IdConstruccionAvaluo, type, index);
        continue;
      }
      await tx.tipoConstruccionAvaluo.update({
        where: { IdTipoConstruccionAvaluo: existing.id },
        data: {
          SReferencia: type.ref,
          SDescripcion: type.description || null,
          SClasificacion: type.classification || null,
          SCalidad: type.quality || null,
          NEdad: type.age,
          NVidaUtilTotal: type.usefulLife,
          NVidaUtilRemanente: remainingUsefulLife(type),
          NSuperficie: type.area,
          IOrden: index,
        },
      });
    }
    await tx.construccionAvaluo.update({
      where: { IdConstruccionAvaluo: construction.IdConstruccionAvaluo },
      data: { JDatosAdicionales: { ...asRecord(construction.JDatosAdicionales), typeFormulas: formulas } as Prisma.InputJsonValue },
    });
    await updateBuiltArea(tx, construction.IdConstruccionAvaluo);
    await recomputeCosts(tx, versionId);
  });
}
