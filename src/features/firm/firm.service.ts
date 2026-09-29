/**
 * Datos del despacho: the organization's letterhead (name, legal name, RFC,
 * address, phone, email, logo) and the defaults every new valuation starts
 * with (responsible appraiser, validity months, folio prefix).
 */
import { randomUUID } from "node:crypto";

import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { saveUpload } from "@/features/files/services/upload";
import type { Letterhead } from "@/features/valuations/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { buildOrganizationAssetKey } from "@/infrastructure/storage/storage-keys";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import type { Prisma } from "@prisma/client";
import { addMonthsToIsoDate, todayInMexico } from "./firm-rules";
import type { FirmSettingsInput } from "./firm-schemas";

const LOGO_ENTITY = "ORGANIZACION_LOGO";
const LOGO_FILE_TYPE = "LOGOTIPO";
const LOGO_RELATION_TYPE = "ORGANIZACION";
export const LOGO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type FirmSettingsDto = FirmSettingsInput & { name: string; logoUrl: string | null };

async function findOrganization(organizationId: number) {
  const organization = await prisma.organizacion.findFirst({
    where: { IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
  });
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
  return organization;
}

async function findLogo(organization: { IdOrganizacion: number; UIdentificadorPublico: string }) {
  const relation = await prisma.relacionArchivo.findFirst({
    where: {
      SEntidad: LOGO_ENTITY,
      SIdentificadorEntidad: organization.UIdentificadorPublico,
      BPrincipal: true,
      archivo: { IdOrganizacion: organization.IdOrganizacion, BActivo: true, DFechaEliminacion: null },
    },
    include: { archivo: { select: { IdArchivo: true, UIdentificadorPublico: true, SClaveObjeto: true } } },
    orderBy: { DFechaCreacion: "desc" },
  });
  return relation?.archivo ?? null;
}

/**
 * A stable address for the logo: the page, the preview window and the PDF can
 * use it for as long as they are open. It redirects to a freshly signed URL;
 * a signed URL in the page itself would expire after 15 minutes.
 */
async function logoUrl(organization: { IdOrganizacion: number; UIdentificadorPublico: string }) {
  const logo = await findLogo(organization);
  return logo ? `/api/organizacion/despacho/logo?v=${logo.UIdentificadorPublico}` : null;
}

/** A freshly signed URL of the organization's logo, or null when it has none. */
export async function signedLogoUrl(organizationId: number) {
  const logo = await findLogo(await findOrganization(organizationId));
  return logo ? storageProvider.getPrivateDownloadUrl(logo.SClaveObjeto) : null;
}

export async function getFirmSettings(organizationId: number): Promise<FirmSettingsDto> {
  const organization = await findOrganization(organizationId);
  return {
    name: organization.SNombre,
    legalName: organization.SRazonSocial,
    rfc: organization.SRFC,
    address: organization.SDireccion,
    phone: organization.STelefono,
    email: organization.SCorreo,
    appraiserName: organization.SNombrePerito,
    appraiserRegistration: organization.SRegistroPerito,
    validityMonths: organization.IMesesVigencia,
    folioPrefix: organization.SPrefijoFolio,
    logoUrl: await logoUrl(organization),
  };
}

export async function saveFirmSettings(user: AuthUser, input: FirmSettingsInput) {
  const organization = await findOrganization(user.organizationId);
  await prisma.organizacion.update({
    where: { IdOrganizacion: organization.IdOrganizacion },
    data: {
      SRazonSocial: input.legalName,
      SRFC: input.rfc,
      SDireccion: input.address,
      STelefono: input.phone,
      SCorreo: input.email,
      SNombrePerito: input.appraiserName,
      SRegistroPerito: input.appraiserRegistration,
      IMesesVigencia: input.validityMonths,
      SPrefijoFolio: input.folioPrefix,
    },
  });
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: organization.IdOrganizacion,
    userId: user.id,
    entity: "Organizacion",
    entityId: String(organization.IdOrganizacion),
    action: "FIRM_SETTINGS",
    result: "EXITOSO",
    metadata: { folioPrefix: input.folioPrefix, validityMonths: input.validityMonths },
  });
}

/** The letterhead the document header falls back to. */
export async function getLetterhead(organizationId: number): Promise<Letterhead> {
  const organization = await findOrganization(organizationId);
  return {
    name: organization.SNombre,
    legalName: organization.SRazonSocial,
    rfc: organization.SRFC,
    address: organization.SDireccion,
    phone: organization.STelefono,
    email: organization.SCorreo,
    logoUrl: await logoUrl(organization),
  };
}

/** What a new valuation starts with: folio prefix, appraiser, date and validity. */
export async function getValuationDefaults(tx: Prisma.TransactionClient, organizationId: number, now = new Date()) {
  const organization = await tx.organizacion.findUniqueOrThrow({
    where: { IdOrganizacion: organizationId },
    select: { SPrefijoFolio: true, SNombrePerito: true, SRegistroPerito: true, IMesesVigencia: true },
  });
  const valuationDate = todayInMexico(now);
  return {
    folioPrefix: organization.SPrefijoFolio,
    appraiserName: organization.SNombrePerito,
    appraiserRegistration: organization.SRegistroPerito,
    valuationDate,
    validUntil: addMonthsToIsoDate(valuationDate, organization.IMesesVigencia),
  };
}

export async function replaceFirmLogo(user: AuthUser, file: File) {
  const organization = await findOrganization(user.organizationId);
  const filePublicId = randomUUID();
  const key = buildOrganizationAssetKey(organization.UIdentificadorPublico, "perfil", ["logotipo"], filePublicId, "jpg");
  const previous = await findLogo(organization);
  const upload = await saveUpload(file, { allowedMimeTypes: LOGO_MIME_TYPES, generateDownloadUrl: false, key });

  try {
    await prisma.$transaction(async (tx) => {
      const [fileType, relationType] = await Promise.all([
        tx.tipoArchivo.findFirstOrThrow({ where: { SClave: LOGO_FILE_TYPE, BActivo: true } }),
        tx.tipoRelacionArchivo.findFirstOrThrow({ where: { SClave: LOGO_RELATION_TYPE, BActivo: true } }),
      ]);
      if (previous) {
        await tx.relacionArchivo.updateMany({
          where: { SEntidad: LOGO_ENTITY, SIdentificadorEntidad: organization.UIdentificadorPublico, BPrincipal: true },
          data: { BPrincipal: false },
        });
        await tx.archivo.update({ where: { IdArchivo: previous.IdArchivo }, data: { BActivo: false, DFechaEliminacion: new Date() } });
      }
      const archivo = await tx.archivo.create({
        data: {
          UIdentificadorPublico: filePublicId,
          IdOrganizacion: organization.IdOrganizacion,
          IdUsuarioCarga: user.id,
          IdTipoArchivo: fileType.IdTipoArchivo,
          SBucket: upload.bucket,
          SClaveObjeto: upload.key,
          SNombreOriginal: upload.filename,
          SNombreAlmacenado: upload.storedFilename,
          STipoMime: upload.mimeType,
          SExtension: ".jpg",
          ITamanoBytes: BigInt(upload.size),
          SChecksum: upload.checksum,
          BPrivado: true,
          JMetadatos: { uso: LOGO_ENTITY },
        },
      });
      await tx.relacionArchivo.create({
        data: {
          IdArchivo: archivo.IdArchivo,
          IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
          SEntidad: LOGO_ENTITY,
          SIdentificadorEntidad: organization.UIdentificadorPublico,
          BPrincipal: true,
          IOrden: 0,
        },
      });
      await tx.cargaArchivo.create({
        data: {
          IdUsuario: user.id,
          IdOrganizacion: organization.IdOrganizacion,
          IdArchivo: archivo.IdArchivo,
          SIdentificadorCarga: filePublicId,
          STipoMimeEsperado: upload.mimeType,
          ITamanoEsperadoBytes: BigInt(upload.size),
          BCompletada: true,
          DFechaFinalizacion: new Date(),
        },
      });
    });
  } catch (error) {
    await storageProvider.deleteObject(upload.key).catch((cleanup) => console.error("[FIRM_LOGO_CLEANUP]", cleanup));
    throw error;
  }

  if (previous) {
    await storageProvider.deleteObject(previous.SClaveObjeto).catch((cleanup) => console.error("[FIRM_LOGO_CLEANUP]", cleanup));
  }
  await recordAuditEvent({
    typeKey: "CARGA_ARCHIVO",
    organizationId: organization.IdOrganizacion,
    userId: user.id,
    entity: "Archivo",
    entityId: filePublicId,
    action: "FIRM_LOGO",
    result: "EXITOSO",
  });
  return logoUrl(organization);
}

export async function deleteFirmLogo(user: AuthUser) {
  const organization = await findOrganization(user.organizationId);
  const previous = await findLogo(organization);
  if (!previous) return;
  await prisma.$transaction([
    prisma.relacionArchivo.updateMany({
      where: { SEntidad: LOGO_ENTITY, SIdentificadorEntidad: organization.UIdentificadorPublico, BPrincipal: true },
      data: { BPrincipal: false },
    }),
    prisma.archivo.update({ where: { IdArchivo: previous.IdArchivo }, data: { BActivo: false, DFechaEliminacion: new Date() } }),
  ]);
  await storageProvider.deleteObject(previous.SClaveObjeto).catch((cleanup) => console.error("[FIRM_LOGO_CLEANUP]", cleanup));
}
