/**
 * An image of the editor (any section but Datos generales): stored, registered
 * as a file of the organization and given its stable address. Both the
 * generic upload (`POST /api/uploads`) and the croquis the server renders
 * go through here, so a croquis is a normal valuation image.
 */
import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { stableDownloadUrl } from "@/infrastructure/storage/stable-url";

import { saveUpload, type UploadResult } from "./upload";

/** Images the editor adds to any section other than Datos generales. */
const GENERIC_UPLOAD_FILE_TYPE = "OTRO";

export type EditorImageDto = UploadResult & { url: string; id: string };

export async function storeEditorImage(user: Pick<AuthUser, "id" | "organizationId">, file: File, usage = "IMAGEN_EDITOR"): Promise<EditorImageDto> {
  const result = await saveUpload(file, { generateDownloadUrl: false });

  // A completed upload must point to its file (check constraint from
  // migration 011), so the file is registered first.
  const upload = await prisma.$transaction(async (tx) => {
    const fileType = await tx.tipoArchivo.findFirstOrThrow({
      where: { SClave: GENERIC_UPLOAD_FILE_TYPE, BActivo: true },
      select: { IdTipoArchivo: true },
    });
    const stored = await tx.archivo.create({
      data: {
        UIdentificadorPublico: randomUUID(),
        IdOrganizacion: user.organizationId,
        IdUsuarioCarga: user.id,
        IdTipoArchivo: fileType.IdTipoArchivo,
        SBucket: result.bucket,
        SClaveObjeto: result.key,
        SNombreOriginal: result.filename,
        SNombreAlmacenado: result.storedFilename,
        STipoMime: result.mimeType,
        SExtension: extname(result.storedFilename),
        ITamanoBytes: BigInt(result.size),
        SChecksum: result.checksum,
        BPrivado: true,
        JMetadatos: { uso: usage },
      },
    });
    return tx.cargaArchivo.create({
      data: {
        IdUsuario: user.id,
        IdOrganizacion: user.organizationId,
        IdArchivo: stored.IdArchivo,
        SIdentificadorCarga: result.key,
        SClaveObjetoTemporal: result.key,
        STipoMimeEsperado: result.mimeType,
        ITamanoEsperadoBytes: BigInt(result.size),
        BCompletada: true,
        DFechaFinalizacion: new Date(),
      },
    });
  });

  // The editor keeps this address while it is open: it must not expire.
  const url = await stableDownloadUrl(result.key);
  return { ...result, url, id: upload.IdCargaArchivo.toString() };
}
