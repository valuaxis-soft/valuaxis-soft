import { randomUUID } from "node:crypto";

import type { AuthUser } from "@/features/auth/model";
import {
  assertCoverImageAccess,
  type ValuationScope,
} from "@/features/files/services/valuation-cover-image";
import { saveUpload, type UploadResult } from "@/features/files/services/upload";
import { prisma } from "@/infrastructure/database/prisma-client";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { buildValuationDatosImageKey } from "@/infrastructure/storage/storage-keys";

const DATOS_IMAGE_FILE_TYPE = "IMAGEN_SUJETO";
const DATOS_IMAGE_RELATION_TYPE = "AVALUO";
export const DATOS_IMAGE_ENTITY = "AVALUO_SECCION_DATOS_IMAGEN";
export const DATOS_IMAGE_USAGE = "DATOS_IMAGEN";
const DATOS_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type DatosImageDto = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  blockId: string;
  subBlockId: string | null;
  warning?: string;
};

export class DatosImageError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "DatosImageError";
  }
}

export async function listDatosImages(user: AuthUser, valuationPublicId: string) {
  const valuation = await findValuation(valuationPublicId, user.organizationId);
  assertCoverImageAccess(user, valuation, "view");
  const relations = await prisma.relacionArchivo.findMany({
    where: {
      SEntidad: DATOS_IMAGE_ENTITY,
      SIdentificadorEntidad: { startsWith: `${valuationPublicId}:` },
      tipoRelacionArchivo: { SClave: DATOS_IMAGE_RELATION_TYPE, BActivo: true },
      archivo: {
        IdOrganizacion: user.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
    },
    include: { archivo: true },
    orderBy: [{ IOrden: "asc" }, { DFechaCreacion: "asc" }],
  });

  return Promise.all(relations.map(async ({ archivo }) => toDto(archivo)));
}

export async function uploadDatosImage(
  user: AuthUser,
  valuationPublicId: string,
  blockId: string,
  subBlockId: string | null,
  file: File,
) {
  const valuation = await findValuation(valuationPublicId, user.organizationId);
  assertCoverImageAccess(user, valuation, "edit");
  if (!blockId.trim()) {
    throw new DatosImageError("Falta identificar el bloque de destino.", 400, "BLOCK_REQUIRED");
  }

  const filePublicId = randomUUID();
  let key: string;
  try {
    key = buildValuationDatosImageKey(
      valuation!.organizationPublicId,
      valuation!.publicId,
      blockId,
      subBlockId,
      filePublicId,
    );
  } catch {
    throw new DatosImageError(
      "El identificador del bloque o subbloque no es válido.",
      400,
      "INVALID_NODE_ID",
    );
  }

  const upload = await saveUpload(file, {
    allowedMimeTypes: DATOS_IMAGE_MIME_TYPES,
    generateDownloadUrl: false,
    key,
  });

  try {
    await persistDatosImage({
      valuation: valuation!,
      userId: user.id,
      filePublicId,
      blockId,
      subBlockId,
      upload,
    });
  } catch (error) {
    console.error("[DATOS_IMAGE] No se pudo registrar la imagen", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : undefined,
    });
    try {
      await storageProvider.deleteObject(upload.key);
    } catch (cleanupError) {
      console.error("[DATOS_IMAGE] No fue posible eliminar el objeto huérfano", cleanupError);
    }
    throw new DatosImageError(
      "No se pudo registrar la imagen. Intenta nuevamente.",
      500,
      "IMAGE_PERSISTENCE_FAILED",
    );
  }

  return toDto({
    UIdentificadorPublico: filePublicId,
    SClaveObjeto: upload.key,
    SNombreOriginal: upload.filename,
    STipoMime: upload.mimeType,
    ITamanoBytes: BigInt(upload.size),
    JMetadatos: datosMetadata(blockId, subBlockId),
  });
}

export async function deleteDatosImage(
  user: AuthUser,
  valuationPublicId: string,
  imagePublicId: string,
) {
  const valuation = await findValuation(valuationPublicId, user.organizationId);
  assertCoverImageAccess(user, valuation, "edit");
  const relation = await prisma.relacionArchivo.findFirst({
    where: {
      SEntidad: DATOS_IMAGE_ENTITY,
      SIdentificadorEntidad: { startsWith: `${valuationPublicId}:` },
      archivo: {
        UIdentificadorPublico: imagePublicId,
        IdOrganizacion: user.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
    },
    include: { archivo: true },
  });
  if (!relation) return false;

  await prisma.archivo.update({
    where: { IdArchivo: relation.IdArchivo },
    data: { BActivo: false, DFechaEliminacion: new Date() },
  });
  try {
    await storageProvider.deleteObject(relation.archivo.SClaveObjeto);
  } catch (error) {
    console.error("[DATOS_IMAGE] La imagen se desactivó, pero no se pudo borrar el objeto", error);
  }
  return true;
}

async function findValuation(publicId: string, organizationId: number): Promise<ValuationScope | null> {
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
}

async function persistDatosImage(input: {
  valuation: ValuationScope;
  userId: number;
  filePublicId: string;
  blockId: string;
  subBlockId: string | null;
  upload: UploadResult;
}) {
  await prisma.$transaction(async (tx) => {
    const [fileType, relationType] = await Promise.all([
      tx.tipoArchivo.findFirst({
        where: { SClave: DATOS_IMAGE_FILE_TYPE, BActivo: true },
        select: { IdTipoArchivo: true },
      }),
      tx.tipoRelacionArchivo.findFirst({
        where: { SClave: DATOS_IMAGE_RELATION_TYPE, BActivo: true },
        select: { IdTipoRelacionArchivo: true },
      }),
    ]);
    if (!fileType || !relationType) {
      throw new DatosImageError(
        "Falta configuración de catálogos para guardar la imagen.",
        500,
        "FILE_CATALOG_MISSING",
      );
    }

    const file = await tx.archivo.create({
      data: {
        UIdentificadorPublico: input.filePublicId,
        IdOrganizacion: input.valuation.organizationId,
        IdUsuarioCarga: input.userId,
        IdTipoArchivo: fileType.IdTipoArchivo,
        SBucket: input.upload.bucket,
        SClaveObjeto: input.upload.key,
        SNombreOriginal: input.upload.filename,
        SNombreAlmacenado: input.upload.storedFilename,
        STipoMime: input.upload.mimeType,
        SExtension: ".jpg",
        ITamanoBytes: BigInt(input.upload.size),
        SChecksum: input.upload.checksum,
        BPrivado: true,
        JMetadatos: datosMetadata(input.blockId, input.subBlockId),
      },
    });

    await tx.relacionArchivo.create({
      data: {
        IdArchivo: file.IdArchivo,
        IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
        SEntidad: DATOS_IMAGE_ENTITY,
        SIdentificadorEntidad: relationIdentifier(
          input.valuation.publicId,
          input.blockId,
          input.subBlockId,
        ),
        BPrincipal: false,
        IOrden: 0,
      },
    });

    await tx.cargaArchivo.create({
      data: {
        IdUsuario: input.userId,
        IdOrganizacion: input.valuation.organizationId,
        IdArchivo: file.IdArchivo,
        SIdentificadorCarga: input.filePublicId,
        STipoMimeEsperado: input.upload.mimeType,
        ITamanoEsperadoBytes: BigInt(input.upload.size),
        BCompletada: true,
        DFechaFinalizacion: new Date(),
      },
    });
  });
}

async function toDto(file: {
  UIdentificadorPublico: string;
  SClaveObjeto: string;
  SNombreOriginal: string;
  STipoMime: string;
  ITamanoBytes: bigint;
  JMetadatos: unknown;
}): Promise<DatosImageDto> {
  const metadata = readDatosMetadata(file.JMetadatos);
  try {
    return {
      id: file.UIdentificadorPublico,
      filename: file.SNombreOriginal,
      mimeType: file.STipoMime,
      size: Number(file.ITamanoBytes),
      url: await storageProvider.getPrivateDownloadUrl(file.SClaveObjeto),
      ...metadata,
    };
  } catch {
    return {
      id: file.UIdentificadorPublico,
      filename: file.SNombreOriginal,
      mimeType: file.STipoMime,
      size: Number(file.ITamanoBytes),
      url: null,
      warning: "La imagen existe, pero no fue posible generar una URL temporal.",
      ...metadata,
    };
  }
}

function datosMetadata(blockId: string, apartadoId: string | null) {
  return {
    uso: DATOS_IMAGE_USAGE,
    sectionKey: "datos",
    blockId,
    ...(apartadoId ? { subblockId: apartadoId } : {}),
  };
}

function readDatosMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DatosImageError("Metadatos de imagen inválidos.", 500, "INVALID_IMAGE_METADATA");
  }
  const metadata = value as Record<string, unknown>;
  if (typeof metadata.blockId !== "string") {
    throw new DatosImageError("Metadatos de imagen incompletos.", 500, "INVALID_IMAGE_METADATA");
  }
  return {
    blockId: metadata.blockId,
    subBlockId: typeof metadata.subblockId === "string" ? metadata.subblockId : null,
  };
}

function relationIdentifier(valuationId: string, blockId: string, apartadoId: string | null) {
  return [valuationId, blockId, apartadoId].filter(Boolean).join(":");
}
