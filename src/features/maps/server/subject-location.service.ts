/**
 * The subject property's pin and the croquis settings of a valuation, kept
 * in the subject property's characteristics (subject-location.ts), with
 * the comparables of the valuation that have coordinates, for the map.
 */
import type { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { findValuation } from "@/features/valuations/calculation/access";
import type { ComparableType } from "@/features/valuations/calculation/market-types";
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";
import { prisma } from "@/infrastructure/database/prisma-client";

import { comparablePins, type ComparablePin, type CroquisSettings } from "../croquis";
import { readSubjectCroquisSettings, readSubjectLocation, withSubjectLocation, type SubjectLocation, type SubjectLocationInput } from "../subject-location";

export interface SubjectLocationDto {
  /** The pin, or null while the appraiser has not placed it. */
  location: SubjectLocation | null;
  /** The address of the carátula, the default search. */
  address: string;
  croquis: CroquisSettings;
  comparables: ComparablePin[];
  /** A concluded valuation shows its map but takes no change. */
  locked: boolean;
}

const asRecord = (value: unknown) => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** The comparables of the version the editor shows, as pins; those without coordinates are left out. */
async function valuationPins(versionId: number | null) {
  if (!versionId) return [];
  const rows = await prisma.comparableAvaluo.findMany({
    where: { IdVersionAvaluo: versionId, BIncluido: true },
    select: {
      UIdentificadorPublico: true,
      IReferencia: true,
      IOrden: true,
      JUbicacionSnapshot: true,
      JDireccionSnapshot: true,
      tipoComparable: { select: { SClave: true } },
      propiedad: { select: { SNombre: true } },
    },
    orderBy: [{ IOrden: "asc" }, { IdComparableAvaluo: "asc" }],
  });
  return comparablePins(
    rows.map((row) => {
      const coordinates = asRecord(row.JUbicacionSnapshot);
      const address = asRecord(row.JDireccionSnapshot);
      return {
        type: row.tipoComparable.SClave as ComparableType,
        comparable: {
          id: row.UIdentificadorPublico,
          reference: row.IReferencia ?? row.IOrden + 1,
          latitude: numberOrNull(coordinates.latitude),
          longitude: numberOrNull(coordinates.longitude),
          location: (typeof address.location === "string" && address.location) || row.propiedad.SNombre || "",
        },
      };
    }),
  );
}

export async function getSubjectLocation(publicId: string, organizationId: number): Promise<SubjectLocationDto> {
  const valuation = await findValuation(prisma, publicId, organizationId);
  const avaluo = await prisma.avaluo.findUniqueOrThrow({
    where: { IdAvaluo: valuation.IdAvaluo },
    select: {
      propiedadSujeto: {
        select: { JCaracteristicas: true, direccionesPropiedad: { where: { BEsDireccionActual: true }, select: { SDireccionCompleta: true }, take: 1 } },
      },
    },
  });
  const characteristics = avaluo.propiedadSujeto?.JCaracteristicas ?? null;
  return {
    location: readSubjectLocation(characteristics),
    address: avaluo.propiedadSujeto?.direccionesPropiedad[0]?.SDireccionCompleta ?? "",
    croquis: readSubjectCroquisSettings(characteristics),
    comparables: await valuationPins(valuation.IdVersionTrabajo ?? valuation.IdVersionFinal),
    locked: valuation.BBloqueado,
  };
}

/**
 * Saves the pin and the settings. The subject property is created when the
 * valuation has none yet (a valuation saved before its first full save), as
 * the own-kind names do.
 */
export async function saveSubjectLocation(publicId: string, user: AuthUser, input: SubjectLocationInput): Promise<SubjectLocationDto> {
  await prisma.$transaction(async (tx) => {
    const valuation = await findValuation(tx, publicId, user.organizationId);
    if (valuation.BBloqueado) throw new ValuationWorkflowError("El avalúo está concluido; reábrelo para editarlo.", 409);
    const avaluo = await tx.avaluo.findUniqueOrThrow({
      where: { IdAvaluo: valuation.IdAvaluo },
      select: { IdPropiedadSujeto: true, SFolio: true, STitulo: true },
    });
    let propertyId = avaluo.IdPropiedadSujeto;
    if (!propertyId) {
      const created = await tx.propiedad.create({
        data: { IdOrganizacion: user.organizationId, IdTipoInmueble: valuation.IdTipoInmueble, SNombre: avaluo.STitulo?.trim() || avaluo.SFolio },
        select: { IdPropiedad: true },
      });
      propertyId = created.IdPropiedad;
      await tx.avaluo.update({ where: { IdAvaluo: valuation.IdAvaluo }, data: { IdPropiedadSujeto: propertyId } });
    }
    const property = await tx.propiedad.findUniqueOrThrow({ where: { IdPropiedad: propertyId }, select: { JCaracteristicas: true } });
    await tx.propiedad.update({
      where: { IdPropiedad: propertyId },
      data: { JCaracteristicas: withSubjectLocation(property.JCaracteristicas, input) as Prisma.InputJsonObject },
    });
  });
  return getSubjectLocation(publicId, user.organizationId);
}
