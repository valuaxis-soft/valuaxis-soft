import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";
import { internalError } from "@/lib/api-response";
import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/database/prisma-client";
import { requireApiUser } from "@/security/guards/api-guard";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { saveUpload, UploadError } from "@/features/files/services/upload";

/** Images the editor adds to any section other than Datos generales. */
const GENERIC_UPLOAD_FILE_TYPE = "OTRO";

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const limited = uploadRateLimitResponse(user.id);
    if (limited) return limited;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se envio ningun archivo" }, { status: 400 });
    }

    const result = await saveUpload(file);

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
          JMetadatos: { uso: "IMAGEN_EDITOR" },
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

    return NextResponse.json({ data: { ...result, id: upload.IdCargaArchivo.toString() } }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return internalError("UPLOAD", error, "No se pudo subir el archivo.");
  }
}
