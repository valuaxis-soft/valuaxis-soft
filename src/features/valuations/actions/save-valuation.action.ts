"use server";

import { prisma } from "@/infrastructure/database/prisma-client";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/features/auth/session";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import {
  initializeWorkingVersionStructure,
  saveCaratula,
} from "@/features/valuations/services/valuation-workflow.service";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { reserveNextValuationFolio } from "@/features/valuations/services/valuation-folio.service";
import {
  isSystemGeneralValuationTemplate,
  resolveResponsibleValuatorName,
} from "@/features/valuations/services/general-valuation-template";
import { revalidatePath } from "next/cache";

export type SaveValuationInput = {
  id?: string;
  folio?: string;
  title?: string;
  client?: string;
  clientName?: string;
  location?: string;
  postalCode?: string;
  valuationKind?: string;
  propertyKind?: string;
  appraisalTypeId?: number;
  propertyTypeId?: number;
  operationTypeId?: number;
  templateId?: number | null;
  responsibleUserId?: number | null;
  status?: string;
};

export async function saveValuation(input: SaveValuationInput) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado" };
  }

  try {
    if (input.id) {
      if (!hasPermission(user, AUTH_PERMISSIONS.editValuations)) {
        return { ok: false, error: "Permiso insuficiente" };
      }

      const existing = await prisma.avaluo.findFirst({
        where: {
          UIdentificadorPublico: input.id,
          IdOrganizacion: user.organizationId,
          BActivo: true,
          DFechaEliminacion: null,
        },
        select: { IdAvaluo: true, IdPropiedadSujeto: true, IdTipoInmueble: true, SFolio: true, BBloqueado: true },
      });

      if (!existing) {
        return { ok: false, error: "Avaluo no encontrado" };
      }
      if (existing.BBloqueado) {
        return { ok: false, error: "El avaluo concluido no permite edicion" };
      }

      await prisma.$transaction(async (tx) => {
        await tx.avaluo.update({
          where: { IdAvaluo: existing.IdAvaluo },
          data: {
            STitulo: input.title || input.location || existing.SFolio,
            SNombreCliente: input.clientName ?? input.client ?? null,
          },
        });

        await syncSubjectPropertyAndAddress({
          tx,
          valuationId: existing.IdAvaluo,
          organizationId: user.organizationId,
          propertyId: existing.IdPropiedadSujeto,
          propertyTypeId: input.propertyTypeId ?? existing.IdTipoInmueble,
          propertyName: input.title || input.location || existing.SFolio,
          location: input.location,
          postalCode: input.postalCode,
        });
      });

      revalidatePath("/");
      return {
        ok: true,
        data: await getValuationByPublicId(input.id, user.organizationId),
      };
    }

    if (!hasPermission(user, AUTH_PERMISSIONS.createValuations)) {
      return { ok: false, error: "Permiso insuficiente" };
    }

    const catalogError = await validateCreationCatalogs(input, user.organizationId);
    if (catalogError) {
      return { ok: false, error: catalogError.message, code: catalogError.code, missingCatalog: catalogError.label };
    }

    const [estadoAvaluo, tipoAvaluo, tipoInmueble, tipoOperacion, plantilla, responsable] = await Promise.all([
      prisma.estadoAvaluo.findFirst({
        where: {
          BActivo: true,
          OR: [{ BEsInicial: true }, { SClave: { equals: input.status ?? "NUEVO", mode: "insensitive" } }],
        },
        orderBy: { IOrden: "asc" },
      }),
      prisma.tipoAvaluo.findFirst({ where: { IdTipoAvaluo: input.appraisalTypeId, BActivo: true } }),
      prisma.tipoInmueble.findFirst({
        where: { IdTipoInmueble: input.propertyTypeId, BActivo: true },
      }),
      prisma.tipoOperacion.findFirst({
        where: { IdTipoOperacion: input.operationTypeId, BActivo: true },
      }),
      input.templateId
        ? prisma.plantillaAvaluo.findFirst({
            where: {
              IdPlantillaAvaluo: input.templateId,
              BActivo: true,
              OR: [{ IdOrganizacion: null }, { IdOrganizacion: user.organizationId }],
            },
          })
        : null,
      input.responsibleUserId
        ? prisma.miembroOrganizacion.findFirst({
            where: {
              IdOrganizacion: user.organizationId,
              IdUsuario: input.responsibleUserId,
              BActivo: true,
              usuario: { BActivo: true, DFechaEliminacion: null },
            },
            select: {
              IdUsuario: true,
              usuario: {
                select: { SNombre: true, SApellidoPaterno: true, SApellidoMaterno: true },
              },
            },
          })
        : null,
    ]);

    if (!estadoAvaluo) return missingCatalog("CATALOG_NEW_STATUS_MISSING", "Estado inicial de avaluo");
    if (!tipoAvaluo) return missingCatalog("CATALOG_TYPE_APPRAISAL_MISSING", "Tipo de avaluo");
    if (!tipoInmueble) return missingCatalog("CATALOG_PROPERTY_TYPE_MISSING", "Tipo de inmueble");
    if (!tipoOperacion) return missingCatalog("CATALOG_OPERATION_TYPE_MISSING", "Tipo de operacion");
    if (input.templateId && !plantilla) return missingCatalog("TEMPLATE_MISSING", "Plantilla");
    if (input.templateId && plantilla?.IdTipoAvaluo !== tipoAvaluo.IdTipoAvaluo) {
      return missingCatalog("TEMPLATE_NOT_APPLICABLE", "Plantilla aplicable al tipo seleccionado");
    }
    if (input.responsibleUserId && !responsable) {
      return missingCatalog("RESPONSIBLE_USER_INVALID", "Usuario responsable");
    }

    const valuation = await prisma.$transaction(async (tx) => {
      const folio = await reserveNextValuationFolio(tx, user.organizationId);
      const created = await tx.avaluo.create({
        data: {
          IdOrganizacion: user.organizationId,
          IdUsuarioCreador: user.id,
          IdUsuarioResponsable: input.responsibleUserId ?? user.id,
          IdEstadoAvaluo: estadoAvaluo.IdEstadoAvaluo,
          IdTipoAvaluo: tipoAvaluo.IdTipoAvaluo,
          IdTipoInmueble: tipoInmueble.IdTipoInmueble,
          IdTipoOperacion: tipoOperacion.IdTipoOperacion,
          IdPlantillaAvaluo: plantilla?.IdPlantillaAvaluo ?? null,
          SFolio: folio,
          STitulo: input.title || folio,
          SNombreCliente: input.clientName ?? input.client ?? null,
        },
      });
      await syncSubjectPropertyAndAddress({
        tx,
        valuationId: created.IdAvaluo,
        organizationId: user.organizationId,
        propertyId: null,
        propertyTypeId: tipoInmueble.IdTipoInmueble,
        propertyName: input.title || input.location || folio,
        location: input.location,
        postalCode: input.postalCode,
      });
      const responsibleName = resolveResponsibleValuatorName(responsable?.usuario, user.name);
      const versionId = await initializeWorkingVersionStructure({
        avaluoId: created.IdAvaluo,
        userId: user.id,
        tx,
        initializeGeneralCaratula: isSystemGeneralValuationTemplate(plantilla),
        generalCaratulaDefaults: {
          title: input.title,
          clientName: input.clientName ?? input.client,
          operationName: tipoOperacion.SNombre,
          responsibleName,
        },
      });
      await saveCaratula({
        versionId,
        tx,
        payload: {
          numeroAvaluo: folio,
          folio,
          solicitante: input.clientName ?? input.client ?? null,
          propietario: input.clientName ?? input.client ?? null,
          objeto: null,
          proposito: tipoOperacion.SNombre,
          valuador: responsibleName,
        },
      });
      return created;
    });

    revalidatePath("/");
    return {
      ok: true,
      data: await getValuationByPublicId(valuation.UIdentificadorPublico, user.organizationId),
    };
  } catch (error) {
    return { ok: false, error: `Error al guardar: ${String(error)}` };
  }
}

async function validateCreationCatalogs(input: SaveValuationInput, organizationId: number) {
  if (!input.appraisalTypeId) {
    return catalogError("CATALOG_TYPE_APPRAISAL_MISSING", "Tipo de avaluo");
  }
  if (!input.propertyTypeId) {
    return catalogError("CATALOG_PROPERTY_TYPE_MISSING", "Tipo de inmueble");
  }
  if (!input.operationTypeId) {
    return catalogError("CATALOG_OPERATION_TYPE_MISSING", "Tipo de operacion");
  }

  const [initialStatus, workVersionStatus, organization] = await Promise.all([
    prisma.estadoAvaluo.findFirst({
      where: { BActivo: true, OR: [{ BEsInicial: true }, { SClave: { equals: "NUEVO", mode: "insensitive" } }] },
      select: { IdEstadoAvaluo: true },
    }),
    prisma.estadoVersionAvaluo.findFirst({
      where: { BActivo: true, BPermiteEdicion: true, BEsFinal: false },
      select: { IdEstadoVersionAvaluo: true },
    }),
    prisma.organizacion.findFirst({
      where: { IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
      select: { IdOrganizacion: true },
    }),
  ]);

  if (!organization) return catalogError("ORGANIZATION_INACTIVE", "Organizacion activa");
  if (!initialStatus) return catalogError("CATALOG_NEW_STATUS_MISSING", "Estado inicial de avaluo");
  if (!workVersionStatus) return catalogError("CATALOG_WORK_VERSION_STATUS_MISSING", "Estado de version de trabajo");
  return null;
}

function missingCatalog(code: string, label: string) {
  return {
    ok: false as const,
    error: "No se puede crear el avaluo porque falta configuracion del sistema.",
    code,
    missingCatalog: label,
  };
}

function catalogError(code: string, label: string) {
  return {
    code,
    label,
    message: "No se puede crear el avaluo porque falta configuracion del sistema.",
  };
}

async function syncSubjectPropertyAndAddress(input: {
  tx: Prisma.TransactionClient;
  valuationId: number;
  organizationId: number;
  propertyId: number | null;
  propertyTypeId: number;
  propertyName: string;
  location?: string | null;
  postalCode?: string | null;
}) {
  const location = cleanOptionalText(input.location);
  const postalCode = cleanOptionalText(input.postalCode);
  if (!location && !postalCode) return;

  const origin = await input.tx.origenDato.findFirst({
    where: { BActivo: true, SClave: { equals: "USUARIO", mode: "insensitive" } },
    orderBy: { IOrden: "asc" },
    select: { IdOrigenDato: true },
  });
  if (!origin) throw new Error("No existe origen de dato USUARIO activo");

  const property = input.propertyId
    ? await input.tx.propiedad.update({
        where: { IdPropiedad: input.propertyId },
        data: {
          IdTipoInmueble: input.propertyTypeId,
          SNombre: cleanOptionalText(input.propertyName) ?? location ?? postalCode,
        },
        select: { IdPropiedad: true },
      })
    : await input.tx.propiedad.create({
        data: {
          IdOrganizacion: input.organizationId,
          IdTipoInmueble: input.propertyTypeId,
          SNombre: cleanOptionalText(input.propertyName) ?? location ?? postalCode,
        },
        select: { IdPropiedad: true },
      });

  if (!input.propertyId) {
    await input.tx.avaluo.update({
      where: { IdAvaluo: input.valuationId },
      data: { IdPropiedadSujeto: property.IdPropiedad },
    });
  }

  const currentAddress = await input.tx.direccionPropiedad.findFirst({
    where: { IdPropiedad: property.IdPropiedad, BEsDireccionActual: true },
    select: { IdDireccionPropiedad: true },
  });
  const addressData = {
    IdOrigenDato: origin.IdOrigenDato,
    SDireccionCompleta: location ?? `Codigo postal ${postalCode}`,
    SCodigoPostal: postalCode,
    BEsDireccionActual: true,
    BConfirmada: false,
    NLatitud: new Prisma.Decimal(0),
    NLongitud: new Prisma.Decimal(0),
  };

  if (currentAddress) {
    await input.tx.direccionPropiedad.update({
      where: { IdDireccionPropiedad: currentAddress.IdDireccionPropiedad },
      data: addressData,
    });
    return;
  }

  await input.tx.direccionPropiedad.create({
    data: {
      IdPropiedad: property.IdPropiedad,
      ...addressData,
    },
  });
}

function cleanOptionalText(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length ? text : null;
}
