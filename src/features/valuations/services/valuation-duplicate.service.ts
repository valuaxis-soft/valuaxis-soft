/**
 * "Duplicar" a valuation (2 Nov 2026): a new valuation of the firm with its
 * own folio, "Nuevo", that starts with a copy of the document, the tables,
 * the carátula and the comparables of the original (its working version, or
 * its final one once concluded). The subject property and its address are
 * copied too; the exports, the credits and the history are not.
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { getValuationDefaults } from "@/features/firm/firm.service";
import { prisma } from "@/infrastructure/database/prisma-client";
import { reserveNextValuationFolio } from "./valuation-folio.service";
import { copyVersionContent } from "./valuation-version-copy.service";
import { ensureWorkingVersion } from "./valuation-workflow/working-version";
import { ValuationWorkflowError } from "./valuation-workflow/errors";

const DUPLICATE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

export async function duplicateValuation(user: AuthUser, publicId: string) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.avaluo.findFirst({
      where: { UIdentificadorPublico: publicId, IdOrganizacion: user.organizationId, BActivo: true, DFechaEliminacion: null },
      include: { propiedadSujeto: { include: { direccionesPropiedad: { where: { BEsDireccionActual: true }, take: 1 } } } },
    });
    if (!source) throw new ValuationWorkflowError("Avaluo no encontrado", 404);
    const fromVersionId = source.IdVersionTrabajo ?? source.IdVersionFinal;
    if (!fromVersionId) throw new ValuationWorkflowError("El avalúo todavía no tiene contenido que duplicar.", 409);

    const initialState = await tx.estadoAvaluo.findFirst({
      where: { BActivo: true, OR: [{ BEsInicial: true }, { SClave: { equals: "NUEVO", mode: "insensitive" } }] },
      orderBy: { IOrden: "asc" },
      select: { IdEstadoAvaluo: true },
    });
    if (!initialState) throw new ValuationWorkflowError("Falta el estado inicial de avalúo.", 500);

    const defaults = await getValuationDefaults(tx, user.organizationId);
    const folio = await reserveNextValuationFolio(tx, user.organizationId, defaults.folioPrefix);
    const title = source.STitulo === source.SFolio ? folio : `${source.STitulo} (copia)`;

    // The subject property, copied with its current address, so the copy has its own to edit.
    let propertyId: number | null = null;
    if (source.propiedadSujeto) {
      const { IdPropiedad: _id, UIdentificadorPublico: _publicId, DFechaCreacion: _created, DFechaModificacion: _modified, direccionesPropiedad, ...property } = source.propiedadSujeto;
      const created = await tx.propiedad.create({
        data: {
          ...property,
          JCaracteristicas: property.JCaracteristicas === null ? Prisma.DbNull : (property.JCaracteristicas as Prisma.InputJsonValue),
          direccionesPropiedad: {
            create: direccionesPropiedad.map(({ IdDireccionPropiedad: _addressId, IdPropiedad: _propertyId, DFechaCreacion: _addressCreated, DFechaModificacion: _addressModified, ...address }) => address),
          },
        } as Prisma.PropiedadUncheckedCreateInput,
        select: { IdPropiedad: true },
      });
      propertyId = created.IdPropiedad;
    }

    const created = await tx.avaluo.create({
      data: {
        IdOrganizacion: user.organizationId,
        IdUsuarioCreador: user.id,
        IdUsuarioResponsable: source.IdUsuarioResponsable ?? user.id,
        IdAvaluoOrigen: source.IdAvaluo,
        IdEstadoAvaluo: initialState.IdEstadoAvaluo,
        IdTipoAvaluo: source.IdTipoAvaluo,
        IdTipoInmueble: source.IdTipoInmueble,
        IdTipoOperacion: source.IdTipoOperacion,
        IdPlantillaAvaluo: source.IdPlantillaAvaluo,
        IdPropiedadSujeto: propertyId,
        SFolio: folio,
        STitulo: title.slice(0, 220),
        SNombreCliente: source.SNombreCliente,
      },
      select: { IdAvaluo: true, UIdentificadorPublico: true, SFolio: true },
    });
    const toVersionId = await ensureWorkingVersion({ avaluoId: created.IdAvaluo, userId: user.id, tx });
    const copied = await copyVersionContent(tx, { fromVersionId, toVersionId });
    // The copy keeps the folio of its own on the carátula, not the original's.
    await tx.caratulaAvaluo.updateMany({ where: { IdVersionAvaluo: toVersionId }, data: { SNumeroAvaluo: folio, SFolio: folio } });
    return { id: created.UIdentificadorPublico, folio: created.SFolio, copied };
  }, DUPLICATE_TRANSACTION_OPTIONS);
}
