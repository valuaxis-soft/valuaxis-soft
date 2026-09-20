import { randomUUID } from "node:crypto";
import type { AuthUser } from "@/features/auth/model";
import { canEditProject, canViewProjects } from "@/features/auth/permissions";
import { prisma } from "@/infrastructure/database/prisma-client";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { buildValuationCoverImageKey } from "@/infrastructure/storage/storage-keys";
import { saveUpload, type UploadResult } from "@/features/files/services/upload";

export const COVER_IMAGE_FILE_TYPE = "IMAGEN_SUJETO";
export const COVER_IMAGE_RELATION_TYPE = "AVALUO";
export const COVER_IMAGE_ENTITY = "AVALUO_CARATULA_IMAGEN_PRINCIPAL";
export const COVER_IMAGE_USAGE = "CARATULA_IMAGEN_PRINCIPAL";
export const COVER_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type ValuationScope = {
  id: number;
  publicId: string;
  organizationId: number;
  organizationPublicId: string;
  status: string;
  locked: boolean;
};

export type CoverImageDto = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  warning?: string;
};

type StoredCoverImage = Omit<CoverImageDto, "url" | "warning"> & { key: string };

export type CoverImageServiceDependencies = {
  findValuation(publicId: string, organizationId: number): Promise<ValuationScope | null>;
  findPrincipal(valuation: ValuationScope): Promise<StoredCoverImage | null>;
  persistPrincipal(input: {
    valuation: ValuationScope;
    userId: number;
    filePublicId: string;
    upload: UploadResult;
  }): Promise<StoredCoverImage>;
  upload(file: File, key: string): Promise<UploadResult>;
  getPrivateUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
  createPublicId(): string;
};

export class CoverImageError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "CoverImageError";
  }
}

export function assertCoverImageAccess(
  user: AuthUser,
  valuation: ValuationScope | null,
  mode: "view" | "edit",
) {
  const permitted = mode === "edit" ? canEditProject(user) : canViewProjects(user);
  if (!permitted) throw new CoverImageError("Permiso insuficiente", 403, "FORBIDDEN");
  if (!valuation) throw new CoverImageError("Avaluo no encontrado", 404, "VALUATION_NOT_FOUND");
  if (valuation.organizationId !== user.organizationId) {
    throw new CoverImageError("Avaluo no encontrado", 404, "VALUATION_NOT_FOUND");
  }
  if (mode === "edit") {
    const status = valuation.status.toLowerCase();
    if (valuation.locked || status === "terminado" || status === "finalizado") {
      throw new CoverImageError(
        "El avaluo no permite edicion",
        409,
        "VALUATION_NOT_EDITABLE",
      );
    }
  }
}

export async function getPrincipalCoverImage(
  user: AuthUser,
  publicId: string,
  dependencies: CoverImageServiceDependencies = defaultDependencies,
): Promise<CoverImageDto | null> {
  const valuation = await dependencies.findValuation(publicId, user.organizationId);
  assertCoverImageAccess(user, valuation, "view");
  const image = await dependencies.findPrincipal(valuation!);
  if (!image) return null;

  try {
    return { ...coverImageMetadata(image), url: await dependencies.getPrivateUrl(image.key) };
  } catch {
    return {
      ...coverImageMetadata(image),
      url: null,
      warning: "La imagen existe, pero no fue posible generar una URL temporal.",
    };
  }
}

export async function replacePrincipalCoverImage(
  user: AuthUser,
  publicId: string,
  file: File,
  dependencies: CoverImageServiceDependencies = defaultDependencies,
): Promise<CoverImageDto> {
  const valuation = await dependencies.findValuation(publicId, user.organizationId);
  assertCoverImageAccess(user, valuation, "edit");
  const filePublicId = dependencies.createPublicId();
  const key = buildValuationCoverImageKey(
    valuation!.organizationPublicId,
    valuation!.publicId,
    filePublicId,
  );
  const upload = await dependencies.upload(file, key);

  let stored: StoredCoverImage;
  try {
    stored = await dependencies.persistPrincipal({
      valuation: valuation!,
      userId: user.id,
      filePublicId,
      upload,
    });
  } catch (error) {
    try {
      await dependencies.deleteObject(upload.key);
    } catch (cleanupError) {
      console.error("[COVER_IMAGE] No fue posible eliminar el objeto huerfano", cleanupError);
    }
    throw error;
  }

  try {
    return { ...coverImageMetadata(stored), url: await dependencies.getPrivateUrl(stored.key) };
  } catch {
    return {
      ...coverImageMetadata(stored),
      url: null,
      warning: "La imagen se guardo, pero no fue posible generar una URL temporal.",
    };
  }
}

function coverImageMetadata(image: StoredCoverImage): Omit<CoverImageDto, "url" | "warning"> {
  return {
    id: image.id,
    filename: image.filename,
    mimeType: image.mimeType,
    size: image.size,
  };
}

const defaultDependencies: CoverImageServiceDependencies = {
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
  async findPrincipal(valuation) {
    const relation = await prisma.relacionArchivo.findFirst({
      where: {
        SEntidad: COVER_IMAGE_ENTITY,
        SIdentificadorEntidad: valuation.publicId,
        BPrincipal: true,
        tipoRelacionArchivo: { SClave: COVER_IMAGE_RELATION_TYPE, BActivo: true },
        archivo: {
          IdOrganizacion: valuation.organizationId,
          BActivo: true,
          DFechaEliminacion: null,
        },
      },
      include: { archivo: true },
      orderBy: { DFechaCreacion: "desc" },
    });
    return relation ? mapStoredCoverImage(relation.archivo) : null;
  },
  async persistPrincipal({ valuation, userId, filePublicId, upload }) {
    return prisma.$transaction(async (tx) => {
      const [fileType, relationType] = await Promise.all([
        tx.tipoArchivo.findFirst({
          where: { SClave: COVER_IMAGE_FILE_TYPE, BActivo: true },
          select: { IdTipoArchivo: true },
        }),
        tx.tipoRelacionArchivo.findFirst({
          where: { SClave: COVER_IMAGE_RELATION_TYPE, BActivo: true },
          select: { IdTipoRelacionArchivo: true },
        }),
      ]);
      if (!fileType || !relationType) {
        throw new CoverImageError(
          "Falta configuracion de catalogos para guardar la imagen.",
          500,
          "FILE_CATALOG_MISSING",
        );
      }

      await tx.relacionArchivo.updateMany({
        where: {
          IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
          SEntidad: COVER_IMAGE_ENTITY,
          SIdentificadorEntidad: valuation.publicId,
          BPrincipal: true,
        },
        data: { BPrincipal: false },
      });

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
          JMetadatos: { uso: COVER_IMAGE_USAGE },
        },
      });

      await tx.relacionArchivo.create({
        data: {
          IdArchivo: file.IdArchivo,
          IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
          SEntidad: COVER_IMAGE_ENTITY,
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
          SIdentificadorCarga: upload.key,
          SClaveObjetoTemporal: upload.key,
          STipoMimeEsperado: upload.mimeType,
          ITamanoEsperadoBytes: BigInt(upload.size),
          BCompletada: true,
          DFechaFinalizacion: new Date(),
        },
      });

      return mapStoredCoverImage(file);
    });
  },
  upload(file, key) {
    return saveUpload(file, {
      allowedMimeTypes: COVER_IMAGE_MIME_TYPES,
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

function mapStoredCoverImage(file: {
  UIdentificadorPublico: string;
  SClaveObjeto: string;
  SNombreOriginal: string;
  STipoMime: string;
  ITamanoBytes: bigint;
}): StoredCoverImage {
  return {
    id: file.UIdentificadorPublico,
    key: file.SClaveObjeto,
    filename: file.SNombreOriginal,
    mimeType: file.STipoMime,
    size: Number(file.ITamanoBytes),
  };
}
