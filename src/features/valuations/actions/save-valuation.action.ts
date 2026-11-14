"use server";

import { prisma } from "@/infrastructure/database/prisma-client";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/features/auth/session";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import { initiallyHiddenSections } from "@/features/valuations/sections/section-registry";
import {
  initializeWorkingVersionStructure,
  saveCaratula,
} from "@/features/valuations/services/valuation-workflow.service";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { getValuationDefaults } from "@/features/firm/firm.service";
import { reserveNextValuationFolio } from "@/features/valuations/services/valuation-folio.service";
import {
  hydrateGeneralCaratulaTemplate,
  isSystemGeneralValuationTemplate,
  resolveResponsibleValuatorName,
  type GeneralCaratulaDefaults,
} from "@/features/valuations/services/general-valuation-template";
import { stripClientDataFromSections } from "@/features/valuations/services/document-template";
import {
  OTHER_PROPERTY_KIND,
  OTHER_VALUATION_KIND,
  normalizePropertyKind,
  normalizeValuationKind,
  type OwnKindNames,
} from "@/features/valuations/services/property-kinds";
import { templateSectionsForCreation } from "@/features/valuations/services/valuation-template.service";
import { writeVersionSections } from "@/features/valuations/services/valuation-workflow/save-sections";
import type { SectionPayload } from "@/features/valuations/services/valuation-workflow/types";
import { buildSectionsPayload } from "@/features/valuations/components/workspace/model/save-payload";
import type { AppSection } from "@/features/valuations/model";
import { formatValidityMonths } from "@/features/valuations/services/valuation-signatures";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyResponsible } from "@/features/notifications/valuation-notices";

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
  propertyKindOther?: string;
  valuationKindOther?: string;
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
    return { ok: false, error: "No autorizado", status: 401 };
  }

  try {
    if (input.id) {
      if (!hasPermission(user, AUTH_PERMISSIONS.editValuations)) {
        return { ok: false, error: "Permiso insuficiente", status: 403 };
      }

      const existing = await prisma.avaluo.findFirst({
        where: {
          UIdentificadorPublico: input.id,
          IdOrganizacion: user.organizationId,
          BActivo: true,
          DFechaEliminacion: null,
        },
        select: {
          IdAvaluo: true, IdPropiedadSujeto: true, IdTipoInmueble: true, IdTipoOperacion: true, SFolio: true, STitulo: true, SNombreCliente: true,
          BBloqueado: true, IdEstadoAvaluo: true, IdVersionTrabajo: true, estadoAvaluo: { select: { BEsInicial: true } },
          tipoInmueble: { select: { SNombre: true } }, tipoOperacion: { select: { SNombre: true } },
        },
      });

      if (!existing) {
        return { ok: false, error: "Avaluo no encontrado", status: 404 };
      }
      if (existing.BBloqueado) {
        return { ok: false, error: "El avaluo concluido no permite edicion", status: 409 };
      }

      const changes: ValuationDataChange[] = [];
      await prisma.$transaction(async (tx) => {
        // The kinds the carátula chose, by their catalog keys; an unknown key keeps the current kind.
        const [propertyType, operationType] = await Promise.all([
          input.propertyKind ? tx.tipoInmueble.findFirst({ where: { BActivo: true, SClave: { equals: normalizePropertyKind(input.propertyKind), mode: "insensitive" } }, select: { IdTipoInmueble: true } }) : null,
          input.valuationKind ? tx.tipoOperacion.findFirst({ where: { BActivo: true, SClave: { equals: normalizeValuationKind(input.valuationKind), mode: "insensitive" } }, select: { IdTipoOperacion: true } }) : null,
        ]);
        const propertyTypeId = input.propertyTypeId ?? propertyType?.IdTipoInmueble ?? existing.IdTipoInmueble;
        // Only what the appraiser edits changes the title and the client: a save that does not send them keeps them
        // (the editor never sends the title, and the first save used to write the address over it).
        const title = input.title?.trim() || existing.STitulo;
        const sentClient = input.clientName ?? input.client;
        const clientName = sentClient === undefined ? existing.SNombreCliente : sentClient.trim() || null;
        changes.push(...await dataChanges(tx, existing, { title, clientName, propertyTypeId, operationTypeId: operationType?.IdTipoOperacion ?? existing.IdTipoOperacion }));
        await tx.avaluo.update({
          where: { IdAvaluo: existing.IdAvaluo },
          data: {
            STitulo: title,
            SNombreCliente: clientName,
            IdTipoInmueble: propertyTypeId,
            ...(operationType ? { IdTipoOperacion: operationType.IdTipoOperacion } : {}),
          },
        });

        await syncSubjectPropertyAndAddress({
          tx,
          valuationId: existing.IdAvaluo,
          organizationId: user.organizationId,
          propertyId: existing.IdPropiedadSujeto,
          propertyTypeId,
          propertyName: input.title || input.location || existing.SFolio,
          location: input.location,
          postalCode: input.postalCode,
        });
        await saveOwnKindNames(tx, existing.IdAvaluo, user.organizationId, propertyTypeId, input);
        // The first edit moves the valuation from "Nuevo" to "En edición" (2 Nov 2026: every valuation stayed "Nuevo").
        if (existing.estadoAvaluo.BEsInicial) await advanceToEditing(tx, existing, user.id);
      });

      revalidatePath("/");
      return {
        ok: true,
        data: await getValuationByPublicId(input.id, user.organizationId),
        /** What changed of the valuation's own data, for its history. */
        changes,
      };
    }

    if (!hasPermission(user, AUTH_PERMISSIONS.createValuations)) {
      return { ok: false, error: "Permiso insuficiente", status: 403 };
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
    // A template of the firm's own carries a whole document: it starts valuations of any type.
    const templateSections = plantilla && !plantilla.BEsSistema
      ? await templateSectionsForCreation(prisma, plantilla.IdPlantillaAvaluo, user.organizationId)
      : null;
    if (input.templateId && !templateSections && plantilla?.IdTipoAvaluo !== tipoAvaluo.IdTipoAvaluo) {
      return missingCatalog("TEMPLATE_NOT_APPLICABLE", "Plantilla aplicable al tipo seleccionado");
    }
    if (input.responsibleUserId && !responsable) {
      return missingCatalog("RESPONSIBLE_USER_INVALID", "Usuario responsable");
    }

    const valuation = await prisma.$transaction(async (tx) => {
      // Datos del despacho: folio prefix, signatures, date and validity.
      const defaults = await getValuationDefaults(tx, user.organizationId);
      const folio = await reserveNextValuationFolio(tx, user.organizationId, defaults.folioPrefix);
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
      const responsibleName = defaults.signers[0]?.name ?? resolveResponsibleValuatorName(responsable?.usuario, user.name);
      const generalCaratulaDefaults: GeneralCaratulaDefaults = {
        title: input.title,
        clientName: input.clientName ?? input.client,
        operationName: tipoOperacion.SNombre,
        responsibleName,
        valuationDate: defaults.valuationDate,
        validity: formatValidityMonths(defaults.validityMonths),
      };
      const versionId = await initializeWorkingVersionStructure({
        avaluoId: created.IdAvaluo,
        userId: user.id,
        tx,
        initializeGeneralCaratula: isSystemGeneralValuationTemplate(plantilla),
        // A machinery valuation starts without the real estate sections in view.
        initiallyHidden: initiallyHiddenSections(tipoInmueble.SClave),
        generalCaratulaDefaults,
      });
      if (templateSections) {
        await writeVersionSections(tx, versionId, templateDocumentPayload(templateSections, generalCaratulaDefaults));
      }
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
          // The firm's signatures; without them the appraiser adds who signs in the carátula.
          firmas: defaults.signers,
          fechaAvaluo: defaults.valuationDate,
          mesesVigencia: defaults.validityMonths,
        },
      });
      return created;
      // A template's document writes as many rows as a full save.
    }, { maxWait: 10_000, timeout: 60_000 });

    revalidatePath("/");
    // Tell the responsible appraiser when someone else assigned them the valuation.
    after(() => notifyResponsible("asignado", valuation.UIdentificadorPublico, user));
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

/**
 * The template's document as the first save of the new valuation: its
 * carátula takes this valuation's title, client, date and signer, as the
 * system's template does.
 */
function templateDocumentPayload(sections: AppSection[], defaults: GeneralCaratulaDefaults): SectionPayload[] {
  // A template saved with a client's data (before 2 Nov 2026) never passes them on: the new valuation starts blank.
  const clean = stripClientDataFromSections(sections, { includeImages: true });
  const hydrated = clean.map((section) => (section.id === "caratula" ? hydrateGeneralCaratulaTemplate(section, defaults) : section));
  return buildSectionsPayload(hydrated) as SectionPayload[];
}

/** A field of the valuation's own data that a save changed: «Cliente: «A» → «B»» in its history. */
export type ValuationDataChange = { field: string; from: string; to: string };

/** The title, client and kinds a save changes, by name, to record them in the valuation's history. */
async function dataChanges(
  tx: Prisma.TransactionClient,
  existing: { STitulo: string; SNombreCliente: string | null; IdTipoInmueble: number; IdTipoOperacion: number; tipoInmueble: { SNombre: string }; tipoOperacion: { SNombre: string } },
  next: { title: string; clientName: string | null; propertyTypeId: number; operationTypeId: number },
): Promise<ValuationDataChange[]> {
  const changes: ValuationDataChange[] = [];
  if (next.title !== existing.STitulo) changes.push({ field: "Título", from: existing.STitulo, to: next.title });
  if ((next.clientName ?? "") !== (existing.SNombreCliente ?? "")) changes.push({ field: "Cliente", from: existing.SNombreCliente ?? "", to: next.clientName ?? "" });
  if (next.propertyTypeId !== existing.IdTipoInmueble) {
    const kind = await tx.tipoInmueble.findUnique({ where: { IdTipoInmueble: next.propertyTypeId }, select: { SNombre: true } });
    changes.push({ field: "Tipo de bien", from: existing.tipoInmueble.SNombre, to: kind?.SNombre ?? "" });
  }
  if (next.operationTypeId !== existing.IdTipoOperacion) {
    const kind = await tx.tipoOperacion.findUnique({ where: { IdTipoOperacion: next.operationTypeId }, select: { SNombre: true } });
    changes.push({ field: "Tipo de avalúo", from: existing.tipoOperacion.SNombre, to: kind?.SNombre ?? "" });
  }
  return changes;
}

/** The valuation leaves "Nuevo" for "En edición" once somebody edits it; its history records the change. */
async function advanceToEditing(tx: Prisma.TransactionClient, valuation: { IdAvaluo: number; IdEstadoAvaluo: number; IdVersionTrabajo: number | null }, userId: number) {
  const editing = await tx.estadoAvaluo.findFirst({
    where: { BActivo: true, SClave: { equals: "EN_EDICION", mode: "insensitive" } },
    select: { IdEstadoAvaluo: true },
  });
  if (!editing || editing.IdEstadoAvaluo === valuation.IdEstadoAvaluo || !valuation.IdVersionTrabajo) return;
  await tx.avaluo.update({ where: { IdAvaluo: valuation.IdAvaluo }, data: { IdEstadoAvaluo: editing.IdEstadoAvaluo } });
  await tx.estadoAvaluoHistorial.create({
    data: {
      IdAvaluo: valuation.IdAvaluo,
      IdVersionAvaluo: valuation.IdVersionTrabajo,
      IdUsuario: userId,
      IdEstadoAnterior: valuation.IdEstadoAvaluo,
      IdEstadoNuevo: editing.IdEstadoAvaluo,
      SMotivo: "Primera edicion",
    },
  });
}

/**
 * The names of the kinds of the appraiser's own ("Otro…"), on the subject
 * property's characteristics (no column of their own). A name is kept only
 * while its kind is "otro"/"otra".
 */
async function saveOwnKindNames(
  tx: Prisma.TransactionClient,
  valuationId: number,
  organizationId: number,
  propertyTypeId: number,
  input: Pick<SaveValuationInput, "propertyKind" | "valuationKind" | "propertyKindOther" | "valuationKindOther" | "title" | "location">,
) {
  if (input.propertyKindOther === undefined && input.valuationKindOther === undefined) return;
  const names: OwnKindNames = {
    ...(normalizePropertyKind(input.propertyKind) === OTHER_PROPERTY_KIND && input.propertyKindOther?.trim() ? { tipoBienOtro: input.propertyKindOther.trim() } : {}),
    ...(normalizeValuationKind(input.valuationKind) === OTHER_VALUATION_KIND && input.valuationKindOther?.trim() ? { tipoAvaluoOtro: input.valuationKindOther.trim() } : {}),
  };
  // The croquis panel merges the pin into the same characteristics; both lock the valuation's row first (subject-location.service.ts).
  await tx.$queryRaw(Prisma.sql`SELECT 1 FROM "devpware_avaluos" WHERE "IdAvaluo" = ${valuationId} FOR UPDATE`);
  const valuation = await tx.avaluo.findUnique({ where: { IdAvaluo: valuationId }, select: { IdPropiedadSujeto: true, SFolio: true } });
  if (!valuation) return;
  let propertyId = valuation.IdPropiedadSujeto;
  if (!propertyId) {
    if (!Object.keys(names).length) return;
    const created = await tx.propiedad.create({
      data: { IdOrganizacion: organizationId, IdTipoInmueble: propertyTypeId, SNombre: cleanOptionalText(input.title) ?? cleanOptionalText(input.location) ?? valuation.SFolio },
      select: { IdPropiedad: true },
    });
    propertyId = created.IdPropiedad;
    await tx.avaluo.update({ where: { IdAvaluo: valuationId }, data: { IdPropiedadSujeto: propertyId } });
  }
  const property = await tx.propiedad.findUnique({ where: { IdPropiedad: propertyId }, select: { JCaracteristicas: true } });
  const current = property?.JCaracteristicas && typeof property.JCaracteristicas === "object" && !Array.isArray(property.JCaracteristicas)
    ? (property.JCaracteristicas as Record<string, unknown>)
    : {};
  const { tipoBienOtro: _bien, tipoAvaluoOtro: _avaluo, ...rest } = current;
  await tx.propiedad.update({ where: { IdPropiedad: propertyId }, data: { JCaracteristicas: { ...rest, ...names } as Prisma.InputJsonObject } });
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
