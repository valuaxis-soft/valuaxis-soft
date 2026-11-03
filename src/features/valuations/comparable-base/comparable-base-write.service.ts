/**
 * Writing the firm's base of comparables from the Comparables page, without
 * a valuation (migration 048): a new comparable, the edit of its card, a
 * copy, its place on the map, its images, and deleting it. A comparable
 * captured in a valuation belongs to that valuation: editing it from here
 * keeps that capture as it is and adds a newer one to the base under the same
 * number, as "Es el mismo" does when importing; only its coordinates are
 * written in place (nothing of the calculation or the dictamen reads them).
 * Every read and write stays within the user's organization.
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { buildBaseComparableAssetKey } from "@/infrastructure/storage/storage-keys";
import { asRecord, inFirmBase, type Tx } from "../calculation/access";
import { coordinatesError } from "../calculation/comparable-card";
import type { ComparableInputPayload } from "../calculation/market-schemas";
import {
  assertRoomForPhoto,
  basePropertyTypeId,
  comparableInclude,
  comparableTypeId,
  importToFirmBase,
  insertComparable,
  reusedEvidenceOf,
  storeComparableImage,
  toComparableDto,
  updateBaseCapture,
  type BaseImportResult,
  type ImageSlot,
} from "../calculation/market.service";
import { comparableFormValues, type ComparableType } from "../calculation/market-types";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";

const include = { ...comparableInclude, tipoComparable: { select: { SClave: true } }, avaluo: { select: { SFolio: true } } } satisfies Prisma.ComparableAvaluoInclude;

/** A comparable of the firm's base by the id of one of its captures, or 404. */
async function findInBase(tx: Tx, organizationId: number, comparableId: string) {
  const row = await tx.comparableAvaluo.findFirst({ where: { UIdentificadorPublico: comparableId, ...inFirmBase(organizationId) }, include });
  if (!row) throw new ValuationWorkflowError("Comparable no encontrado", 404);
  return row;
}

/** "Nuevo comparable" in Comparables: kept in the base without a valuation; `mergeInto` answers "es el mismo" to one of the base. */
export async function createBaseComparable(
  user: AuthUser, type: ComparableType, payload: ComparableInputPayload, options: { mergeInto?: string } = {},
): Promise<BaseImportResult> {
  const [result] = await importToFirmBase(user, [{ type, payload, ...(options.mergeInto ? { mergeInto: options.mergeInto } : {}) }]);
  return result;
}

/**
 * "Editar ficha": a comparable of the base without a valuation is updated in
 * place (its validity starts again only when its data changed); one captured
 * in a valuation gets a newer capture in the base under its number, with its
 * photos and screenshot, and that capture is the one the card shows from then on.
 */
export async function updateBaseComparable(user: AuthUser, comparableId: string, type: ComparableType, payload: ComparableInputPayload) {
  return prisma.$transaction(async (tx) => {
    const source = await findInBase(tx, user.organizationId, comparableId);
    const typeId = await comparableTypeId(tx, type);
    if (source.IdAvaluo === null) {
      await updateBaseCapture(tx, source, { type, typeId, payload, renew: false });
      return { id: source.UIdentificadorPublico, created: false };
    }
    const propertyTypeId = await basePropertyTypeId(tx, type, payload.constructionType ?? null);
    const { dataUpdatedAt: _kept, ...evidence } = reusedEvidenceOf(source);
    const id = await insertComparable(tx, { kind: "base", typeId, propertyTypeId }, user, type, payload, evidence);
    return { id, created: true };
  });
}

/** "Duplicar": a copy in the base with its own number, with the same data, photos and screenshot; no factors. */
export async function duplicateBaseComparable(user: AuthUser, comparableId: string) {
  return prisma.$transaction(async (tx) => {
    const source = await findInBase(tx, user.organizationId, comparableId);
    const type = source.tipoComparable.SClave as ComparableType;
    const { formulas, ...values } = comparableFormValues(await toComparableDto(source, false));
    const payload: ComparableInputPayload = {
      ...values,
      formulas: Object.fromEntries(Object.entries(formulas ?? {}).filter(([path]) => !path.startsWith("factors."))),
      factors: [],
    };
    const { folio: _folio, dataUpdatedAt: _kept, ...evidence } = reusedEvidenceOf(source);
    const typeId = await comparableTypeId(tx, type);
    const propertyTypeId = await basePropertyTypeId(tx, type, payload.constructionType ?? null);
    const id = await insertComparable(tx, { kind: "base", typeId, propertyTypeId }, user, type, payload, evidence);
    const created = await tx.comparableAvaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: id }, select: { propiedad: { select: { IFolioComparable: true } } } });
    return { id, folio: created.propiedad.IFolioComparable };
  });
}

export type DeleteBaseOutcome = {
  /** Comparables of the base without a valuation that were deleted. */
  deleted: number;
  /** Captures that belong to a valuation: they stay, and are removed from the valuation's market instead. */
  kept: Array<{ id: string; folio: number | null; valuationFolio: string }>;
};

/** "Eliminar", one or many: only a comparable kept in the base without a valuation is deleted; its files stay. */
export async function deleteBaseComparables(user: AuthUser, comparableIds: string[]): Promise<DeleteBaseOutcome> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.comparableAvaluo.findMany({
      where: { UIdentificadorPublico: { in: comparableIds }, ...inFirmBase(user.organizationId) },
      select: { IdComparableAvaluo: true, UIdentificadorPublico: true, IdAvaluo: true, propiedad: { select: { IFolioComparable: true } }, avaluo: { select: { SFolio: true } } },
    });
    const kept = rows.flatMap((row) => (row.avaluo ? [{ id: row.UIdentificadorPublico, folio: row.propiedad.IFolioComparable, valuationFolio: row.avaluo.SFolio }] : []));
    const removable = rows.filter((row) => row.IdAvaluo === null).map((row) => row.IdComparableAvaluo);
    const { count } = removable.length ? await tx.comparableAvaluo.deleteMany({ where: { IdComparableAvaluo: { in: removable } } }) : { count: 0 };
    return { deleted: count, kept };
  });
}

/** "Ubicar": the pin on the map, written in place on that capture; both coordinates, each within its range. */
export async function setBaseComparableCoordinates(user: AuthUser, comparableId: string, coordinates: { latitude: number; longitude: number }) {
  const problem = coordinatesError(coordinates.latitude, coordinates.longitude);
  if (problem) throw new ValuationWorkflowError(problem, 400);
  return prisma.$transaction(async (tx) => {
    const source = await findInBase(tx, user.organizationId, comparableId);
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: source.IdComparableAvaluo },
      data: { JUbicacionSnapshot: { latitude: coordinates.latitude, longitude: coordinates.longitude } as Prisma.InputJsonValue },
    });
  });
}

/** Images of a comparable kept in the base without a valuation; one of a valuation takes its images there. */
async function writableBaseCapture(tx: Tx, user: AuthUser, comparableId: string) {
  const row = await findInBase(tx, user.organizationId, comparableId);
  if (row.IdAvaluo !== null) {
    const where = row.avaluo ? `el avalúo ${row.avaluo.SFolio}` : "un avalúo";
    throw new ValuationWorkflowError(`Este comparable se capturó en ${where}: sus imágenes se cambian desde ahí.`, 409);
  }
  return row;
}

/** A photo of the property after the others, or the "pantalla de referencia" in place of the one before. */
export async function addBaseComparableImage(user: AuthUser, comparableId: string, file: File, slot: ImageSlot) {
  const { row, organization } = await prisma.$transaction(async (tx) => {
    const current = await writableBaseCapture(tx, user, comparableId);
    assertRoomForPhoto(current, slot);
    const firm = await tx.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: user.organizationId }, select: { UIdentificadorPublico: true } });
    return { row: current, organization: firm };
  });
  const fileId = randomUUID();
  const key = buildBaseComparableAssetKey(organization.UIdentificadorPublico, comparableId, "imagenes", fileId, "jpg");
  await storeComparableImage(user, { comparableId, where: { IdComparableAvaluo: row.IdComparableAvaluo }, fileId, key, file, slot });
}

/** Removes a photo (by id) or the screenshot from a comparable of the base; the file stays, as in a valuation. */
export async function removeBaseComparableImage(user: AuthUser, comparableId: string, target: { photoId: string } | { screenshot: true }) {
  return prisma.$transaction(async (tx) => {
    const current = await writableBaseCapture(tx, user, comparableId);
    if ("screenshot" in target) {
      const publication = asRecord(current.JPublicacionSnapshot);
      await tx.comparableAvaluo.update({
        where: { IdComparableAvaluo: current.IdComparableAvaluo },
        data: { JPublicacionSnapshot: { ...publication, screenshot: null } as Prisma.InputJsonValue },
      });
      return;
    }
    const photos = Array.isArray(current.JImagenesSnapshot) ? current.JImagenesSnapshot : [];
    await tx.comparableAvaluo.update({
      where: { IdComparableAvaluo: current.IdComparableAvaluo },
      data: { JImagenesSnapshot: photos.filter((photo) => asRecord(photo).id !== target.photoId) as Prisma.InputJsonValue },
    });
  });
}
