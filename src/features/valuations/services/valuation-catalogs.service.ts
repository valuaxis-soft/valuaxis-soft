import { prisma } from "@/infrastructure/database/prisma-client";
import { readDocumentTemplate } from "./document-template";

export type CatalogOption = {
  id: number;
  label: string;
  key?: string;
};

export type ValuationCreationCatalogs = {
  appraisalTypes: CatalogOption[];
  propertyTypes: CatalogOption[];
  operationTypes: CatalogOption[];
  /**
   * The system's templates and the firm's own. `document`: the template holds
   * a whole document (one the firm saved), which starts valuations of any type.
   */
  templates: (CatalogOption & { appraisalTypeId: number | null; system: boolean; document: boolean })[];
  responsibleUsers: CatalogOption[];
};

export async function getValuationCreationCatalogs(organizationId: number) {
  const [appraisalTypes, propertyTypes, operationTypes, templates, responsibleUsers] =
    await Promise.all([
      prisma.tipoAvaluo.findMany({
        where: { BActivo: true },
        orderBy: [{ IOrden: "asc" }, { SNombre: "asc" }],
        select: { IdTipoAvaluo: true, SClave: true, SNombre: true },
      }),
      prisma.tipoInmueble.findMany({
        where: { BActivo: true },
        orderBy: [{ IOrden: "asc" }, { SNombre: "asc" }],
        select: { IdTipoInmueble: true, SClave: true, SNombre: true },
      }),
      prisma.tipoOperacion.findMany({
        where: { BActivo: true },
        orderBy: [{ IOrden: "asc" }, { SNombre: "asc" }],
        select: { IdTipoOperacion: true, SClave: true, SNombre: true },
      }),
      prisma.plantillaAvaluo.findMany({
        where: {
          BActivo: true,
          DFechaEliminacion: null,
          OR: [{ IdOrganizacion: null }, { IdOrganizacion: organizationId }],
        },
        orderBy: [{ SNombre: "asc" }],
        select: {
          IdPlantillaAvaluo: true,
          IdTipoAvaluo: true,
          SNombre: true,
          BEsSistema: true,
          versiones: { where: { BActiva: true }, orderBy: { INumeroVersion: "desc" }, take: 1, select: { JConfiguracionGeneral: true } },
        },
      }),
      prisma.miembroOrganizacion.findMany({
        where: {
          IdOrganizacion: organizationId,
          BActivo: true,
          usuario: {
            BActivo: true,
            DFechaEliminacion: null,
          },
        },
        orderBy: [{ usuario: { SNombre: "asc" } }],
        select: {
          usuario: {
            select: {
              IdUsuario: true,
              SNombre: true,
              SApellidoPaterno: true,
              SApellidoMaterno: true,
              SCorreo: true,
            },
          },
        },
      }),
    ]);

  return {
    appraisalTypes: appraisalTypes.map((item) => ({
      id: item.IdTipoAvaluo,
      label: item.SNombre,
      key: item.SClave,
    })),
    propertyTypes: propertyTypes.map((item) => ({
      id: item.IdTipoInmueble,
      label: item.SNombre,
      key: item.SClave,
    })),
    operationTypes: operationTypes.map((item) => ({
      id: item.IdTipoOperacion,
      label: item.SNombre,
      key: item.SClave,
    })),
    templates: templates.map((item) => ({
      id: item.IdPlantillaAvaluo,
      label: item.SNombre,
      appraisalTypeId: item.IdTipoAvaluo,
      system: item.BEsSistema,
      document: !item.BEsSistema && readDocumentTemplate(item.versiones[0]?.JConfiguracionGeneral) !== null,
    })),
    responsibleUsers: responsibleUsers.map((item) => ({
      id: item.usuario.IdUsuario,
      label: fullName(item.usuario) || item.usuario.SCorreo,
    })),
  } satisfies ValuationCreationCatalogs;
}

function fullName(user: {
  SNombre: string;
  SApellidoPaterno: string | null;
  SApellidoMaterno: string | null;
}) {
  return [user.SNombre, user.SApellidoPaterno, user.SApellidoMaterno].filter(Boolean).join(" ");
}
