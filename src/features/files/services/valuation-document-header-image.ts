import { randomUUID } from "node:crypto";
import type { AuthUser } from "@/features/auth/model";
import {
  assertCoverImageAccess,
  type ValuationScope,
} from "@/features/files/services/valuation-cover-image";
import { saveUpload, type UploadResult } from "@/features/files/services/upload";
import { prisma } from "@/infrastructure/database/prisma-client";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { buildValuationDocumentHeaderImageKey } from "@/infrastructure/storage/storage-keys";

const FILE_TYPE = "IMAGEN_SUJETO";
const RELATION_TYPE = "AVALUO";
export const HEADER_IMAGE_ENTITY = "AVALUO_CARATULA_ENCABEZADO_IMAGEN";
export const HEADER_IMAGE_USAGE = "CARATULA_ENCABEZADO_IMAGEN";
export const HEADER_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type DocumentHeaderImageDto = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  warning?: string;
};

type StoredHeaderImage = Omit<DocumentHeaderImageDto, "url" | "warning"> & { key: string };

export type DocumentHeaderImageServiceDependencies = {
  findValuation(publicId: string, organizationId: number): Promise<ValuationScope | null>;
  findHeader(valuation: ValuationScope): Promise<StoredHeaderImage | null>;
  persistHeader(input: {
    valuation: ValuationScope;
    userId: number;
    filePublicId: string;
    upload: UploadResult;
  }): Promise<StoredHeaderImage>;
  deactivateHeader(valuation: ValuationScope): Promise<{ key: string } | null>;
  upload(file: File, key: string): Promise<UploadResult>;
  getPrivateUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
  createPublicId(): string;
};

export async function getDocumentHeaderImage(
  user: AuthUser,
  valuationPublicId: string,
  dependencies: DocumentHeaderImageServiceDependencies = defaultDependencies,
): Promise<DocumentHeaderImageDto | null> {
  const valuation = await dependencies.findValuation(valuationPublicId, user.organizationId);
  assertCoverImageAccess(user, valuation, "view");
  const image = await dependencies.findHeader(valuation!);
  if (!image) return null;
  return toDto(image, dependencies);
}

export async function replaceDocumentHeaderImage(
  user: AuthUser,
  valuationPublicId: string,
  file: File,
  dependencies: DocumentHeaderImageServiceDependencies = defaultDependencies,
): Promise<DocumentHeaderImageDto> {
  const valuation = await dependencies.findValuation(valuationPublicId, user.organizationId);
  assertCoverImageAccess(user, valuation, "edit");
  const filePublicId = dependencies.createPublicId();
  const key = buildValuationDocumentHeaderImageKey(
    valuation!.organizationPublicId,
    valuation!.publicId,
    filePublicId,
  );
  const previous = await dependencies.findHeader(valuation!);
  const upload = await dependencies.upload(file, key);

  let stored: StoredHeaderImage;
  try {
    stored = await dependencies.persistHeader({
      valuation: valuation!,
      userId: user.id,
      filePublicId,
      upload,
    });
  } catch (error) {
    try {
      await dependencies.deleteObject(upload.key);
    } catch (cleanupError) {
      console.error("[DOCUMENT_HEADER_IMAGE] No fue posible eliminar el objeto huerfano", cleanupError);
    }
    throw error;
  }

  if (previous && previous.key !== stored.key) {
    try {
      await dependencies.deleteObject(previous.key);
    } catch (cleanupError) {
      console.error("[DOCUMENT_HEADER_IMAGE] La imagen se reemplazo, pero no se pudo borrar el objeto anterior", cleanupError);
    }
  }

  return toDto(stored, dependencies);
}

export async function deleteDocumentHeaderImage(
  user: AuthUser,
  valuationPublicId: string,
  dependencies: DocumentHeaderImageServiceDependencies = defaultDependencies,
): Promise<{ deleted: boolean }> {
  const valuation = await dependencies.findValuation(valuationPublicId, user.organizationId);
  assertCoverImageAccess(user, valuation, "edit");
  const previous = await dependencies.deactivateHeader(valuation!);
  if (!previous) return { deleted: false };
  try {
    await dependencies.deleteObject(previous.key);
  } catch (error) {
    console.error("[DOCUMENT_HEADER_IMAGE] La imagen se desactivó, pero no se pudo borrar el objeto", error);
  }
  return { deleted: true };
}

async function toDto(
  image: StoredHeaderImage,
  dependencies: Pick<DocumentHeaderImageServiceDependencies, "getPrivateUrl">,
): Promise<DocumentHeaderImageDto> {
  try {
    return { ...headerImageMetadata(image), url: await dependencies.getPrivateUrl(image.key) };
  } catch {
    return {
      ...headerImageMetadata(image),
      url: null,
      warning: "La imagen existe, pero no fue posible generar una URL temporal.",
    };
  }
}

function headerImageMetadata(image: StoredHeaderImage): Omit<DocumentHeaderImageDto, "url" | "warning"> {
  return {
    id: image.id,
    filename: image.filename,
    mimeType: image.mimeType,
    size: image.size,
  };
}

const defaultDependencies: DocumentHeaderImageServiceDependencies = {
  async findValuation(publicId, organizationId) {
    const valuation = await prisma.avaluo.findFirst({
      where: {
        UIdentificadorPublico: publicId,
        IdOrganizacion: organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
      select: {
        IdAvaluo: true,
        UIdentificadorPublico: true,
        IdOrganizacion: true,
        BBloqueado: true,
        organizacion: { select: { UIdentificadorPublico: true } },
        estadoAvaluo: { select: { SClave: true } },
      },
    });
    return valuation
      ? {
          id: valuation.IdAvaluo,
          publicId: valuation.UIdentificadorPublico,
          organizationId: valuation.IdOrganizacion,
          organizationPublicId: valuation.organizacion.UIdentificadorPublico,
          status: valuation.estadoAvaluo.SClave,
          locked: valuation.BBloqueado,
        }
      : null;
  },
  async findHeader(valuation) {
    const relation = await prisma.relacionArchivo.findFirst({
      where: {
        SEntidad: HEADER_IMAGE_ENTITY,
        SIdentificadorEntidad: valuation.publicId,
        BPrincipal: true,
        tipoRelacionArchivo: { SClave: RELATION_TYPE, BActivo: true },
        archivo: {
          IdOrganizacion: valuation.organizationId,
          BActivo: true,
          DFechaEliminacion: null,
        },
      },
      include: { archivo: true },
      orderBy: { DFechaCreacion: "desc" },
    });
    return relation ? mapStoredHeaderImage(relation.archivo) : null;
  },
  async persistHeader({ valuation, userId, filePublicId, upload }) {
    return prisma.$transaction(async (tx) => {
      const [fileType, relationType] = await Promise.all([
        tx.tipoArchivo.findFirst({
          where: { SClave: FILE_TYPE, BActivo: true },
          select: { IdTipoArchivo: true },
        }),
        tx.tipoRelacionArchivo.findFirst({
          where: { SClave: RELATION_TYPE, BActivo: true },
          select: { IdTipoRelacionArchivo: true },
        }),
      ]);
      if (!fileType || !relationType) {
        throw new Error("Falta configuracion de catalogos para guardar la imagen del encabezado.");
      }

      const previousRelations = await tx.relacionArchivo.findMany({
        where: {
          IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
          SEntidad: HEADER_IMAGE_ENTITY,
          SIdentificadorEntidad: valuation.publicId,
          BPrincipal: true,
        },
        select: { IdArchivo: true },
      });
      const previousFileIds = previousRelations.map((relation) => relation.IdArchivo);

      await tx.relacionArchivo.updateMany({
        where: {
          IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
          SEntidad: HEADER_IMAGE_ENTITY,
          SIdentificadorEntidad: valuation.publicId,
          BPrincipal: true,
        },
        data: { BPrincipal: false },
      });

      if (previousFileIds.length > 0) {
        await tx.archivo.updateMany({
          where: { IdArchivo: { in: previousFileIds } },
          data: { BActivo: false, DFechaEliminacion: new Date() },
        });
      }

      const file = await tx.archivo.create({
        data: {
          UIdentificadorPublico: filePublicId,
          IdOrganizacion: valuation.organizationId,
          IdUsuarioCarga: userId,
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
          JMetadatos: { uso: HEADER_IMAGE_USAGE, contentRole: "document-header" },
        },
      });

      await tx.relacionArchivo.create({
        data: {
          IdArchivo: file.IdArchivo,
          IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
          SEntidad: HEADER_IMAGE_ENTITY,
          SIdentificadorEntidad: valuation.publicId,
          BPrincipal: true,
          IOrden: 0,
        },
      });

      await tx.cargaArchivo.create({
        data: {
          IdUsuario: userId,
          IdOrganizacion: valuation.organizationId,
          IdArchivo: file.IdArchivo,
          SIdentificadorCarga: filePublicId,
          STipoMimeEsperado: upload.mimeType,
          ITamanoEsperadoBytes: BigInt(upload.size),
          BCompletada: true,
          DFechaFinalizacion: new Date(),
        },
      });

      return mapStoredHeaderImage(file);
    });
  },
  async deactivateHeader(valuation) {
    return prisma.$transaction(async (tx) => {
      const relation = await tx.relacionArchivo.findFirst({
        where: {
          SEntidad: HEADER_IMAGE_ENTITY,
          SIdentificadorEntidad: valuation.publicId,
          BPrincipal: true,
          archivo: {
            IdOrganizacion: valuation.organizationId,
            BActivo: true,
            DFechaEliminacion: null,
          },
        },
        include: { archivo: true },
        orderBy: { DFechaCreacion: "desc" },
      });
      if (!relation) return null;

      await tx.relacionArchivo.update({
        where: { IdRelacionArchivo: relation.IdRelacionArchivo },
        data: { BPrincipal: false },
      });
      await tx.archivo.update({
        where: { IdArchivo: relation.IdArchivo },
        data: { BActivo: false, DFechaEliminacion: new Date() },
      });
      return { key: relation.archivo.SClaveObjeto };
    });
  },
  upload(file, key) {
    return saveUpload(file, {
      allowedMimeTypes: HEADER_IMAGE_MIME_TYPES,
      generateDownloadUrl: false,
      key,
    });
  },
  getPrivateUrl(key) {
    return storageProvider.getPrivateDownloadUrl(key);
  },
  deleteObject(key) {
    return storageProvider.deleteObject(key);
  },
  createPublicId: randomUUID,
};

function mapStoredHeaderImage(file: {
  UIdentificadorPublico: string;
  SClaveObjeto: string;
  SNombreOriginal: string;
  STipoMime: string;
  ITamanoBytes: bigint;
}): StoredHeaderImage {
  return {
    id: file.UIdentificadorPublico,
    key: file.SClaveObjeto,
    filename: file.SNombreOriginal,
    mimeType: file.STipoMime,
    size: Number(file.ITamanoBytes),
  };
}
