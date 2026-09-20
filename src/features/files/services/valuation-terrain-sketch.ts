import { randomUUID } from "node:crypto";

import type { AuthUser } from "@/features/auth/model";
import {
  assertCoverImageAccess,
  type ValuationScope,
} from "@/features/files/services/valuation-cover-image";
import { saveUpload, type UploadResult } from "@/features/files/services/upload";
import { prisma } from "@/infrastructure/database/prisma-client";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { buildValuationTerrainSketchKey } from "@/infrastructure/storage/storage-keys";

const FILE_TYPE = "IMAGEN_SUJETO";
const RELATION_TYPE = "AVALUO";
export const TERRAIN_SKETCH_ENTITY = "AVALUO_INFO_TERRENO_CROQUIS";
export const TERRAIN_SKETCH_USAGE = "INFO_TERRENO_CROQUIS";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type TerrainSketchSlot = "macro" | "micro";

export type TerrainSketchDto = {
  id: string;
  slot: TerrainSketchSlot;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  warning?: string;
};

type StoredSketch = Omit<TerrainSketchDto, "url" | "warning"> & { key: string };

export class TerrainSketchError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "TerrainSketchError";
  }
}

export function parseTerrainSketchSlot(value: unknown): TerrainSketchSlot {
  if (value === "macro" || value === "micro") return value;
  throw new TerrainSketchError("El slot debe ser macro o micro.", 400, "INVALID_SLOT");
}

export async function listTerrainSketches(user: AuthUser, valuationPublicId: string) {
  const valuation = await findValuation(valuationPublicId, user.organizationId);
  assertCoverImageAccess(user, valuation, "view");
  const relations = await prisma.relacionArchivo.findMany({
    where: {
      SEntidad: TERRAIN_SKETCH_ENTITY,
      SIdentificadorEntidad: valuation!.publicId,
      BPrincipal: true,
      tipoRelacionArchivo: { SClave: RELATION_TYPE, BActivo: true },
      archivo: {
        IdOrganizacion: user.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
    },
    include: { archivo: true },
    orderBy: { DFechaCreacion: "desc" },
  });

  const bySlot = new Map<TerrainSketchSlot, StoredSketch>();
  for (const relation of relations) {
    const stored = mapStoredSketch(relation.archivo);
    if (!bySlot.has(stored.slot)) bySlot.set(stored.slot, stored);
  }
  return Promise.all([...bySlot.values()].map(toDto));
}

export async function replaceTerrainSketch(
  user: AuthUser,
  valuationPublicId: string,
  slotInput: unknown,
  file: File,
) {
  const slot = parseTerrainSketchSlot(slotInput);
  const valuation = await findValuation(valuationPublicId, user.organizationId);
  assertCoverImageAccess(user, valuation, "edit");
  const filePublicId = randomUUID();
  const key = buildValuationTerrainSketchKey(
    valuation!.organizationPublicId,
    valuation!.publicId,
    slot,
    filePublicId,
  );
  const upload = await saveUpload(file, {
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    generateDownloadUrl: false,
    key,
  });

  let stored: StoredSketch;
  try {
    stored = await persistTerrainSketch({
      valuation: valuation!,
      userId: user.id,
      filePublicId,
      slot,
      upload,
    });
  } catch (error) {
    try {
      await storageProvider.deleteObject(upload.key);
    } catch (cleanupError) {
      console.error("[TERRAIN_SKETCH] No fue posible eliminar el objeto huérfano", cleanupError);
    }
    throw error;
  }

  return toDto(stored);
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

async function persistTerrainSketch(input: {
  valuation: ValuationScope;
  userId: number;
  filePublicId: string;
  slot: TerrainSketchSlot;
  upload: UploadResult;
}): Promise<StoredSketch> {
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
      throw new TerrainSketchError(
        "Falta configuración de catálogos para guardar el croquis.",
        500,
        "FILE_CATALOG_MISSING",
      );
    }

    const currentRelations = await tx.relacionArchivo.findMany({
      where: {
        IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
        SEntidad: TERRAIN_SKETCH_ENTITY,
        SIdentificadorEntidad: input.valuation.publicId,
        BPrincipal: true,
      },
      include: { archivo: { select: { JMetadatos: true } } },
    });
    const previousIds = currentRelations
      .filter((relation) => readSlot(relation.archivo.JMetadatos) === input.slot)
      .map((relation) => relation.IdRelacionArchivo);
    if (previousIds.length) {
      await tx.relacionArchivo.updateMany({
        where: { IdRelacionArchivo: { in: previousIds } },
        data: { BPrincipal: false },
      });
    }

    const metadata = terrainSketchMetadata(input.slot);
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
        JMetadatos: metadata,
      },
    });

    await tx.relacionArchivo.create({
      data: {
        IdArchivo: file.IdArchivo,
        IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo,
        SEntidad: TERRAIN_SKETCH_ENTITY,
        SIdentificadorEntidad: input.valuation.publicId,
        BPrincipal: true,
        IOrden: input.slot === "macro" ? 0 : 1,
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

    return mapStoredSketch(file);
  });
}

async function toDto(stored: StoredSketch): Promise<TerrainSketchDto> {
  const { key, ...metadata } = stored;
  try {
    return { ...metadata, url: await storageProvider.getPrivateDownloadUrl(key) };
  } catch {
    return {
      ...metadata,
      url: null,
      warning: "El croquis existe, pero no fue posible generar una URL temporal.",
    };
  }
}

function terrainSketchMetadata(slot: TerrainSketchSlot) {
  return {
    uso: TERRAIN_SKETCH_USAGE,
    sectionKey: "info-terreno",
    elementKey: "croquis-localizacion",
    slot,
  };
}

function readSlot(value: unknown): TerrainSketchSlot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const slot = (value as Record<string, unknown>).slot;
  return slot === "macro" || slot === "micro" ? slot : null;
}

function mapStoredSketch(file: {
  UIdentificadorPublico: string;
  SClaveObjeto: string;
  SNombreOriginal: string;
  STipoMime: string;
  ITamanoBytes: bigint;
  JMetadatos: unknown;
}): StoredSketch {
  const slot = readSlot(file.JMetadatos);
  if (!slot) {
    throw new TerrainSketchError("Metadatos de croquis inválidos.", 500, "INVALID_METADATA");
  }
  return {
    id: file.UIdentificadorPublico,
    key: file.SClaveObjeto,
    slot,
    filename: file.SNombreOriginal,
    mimeType: file.STipoMime,
    size: Number(file.ITamanoBytes),
  };
}
