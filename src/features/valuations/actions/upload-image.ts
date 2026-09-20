"use server";

import { prisma } from "@/infrastructure/database/prisma-client";
import { saveUpload, UploadError } from "@/features/files/services/upload";
import { getCurrentUser } from "@/features/auth/session";

export async function uploadImage(file: File) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado" };
  }

  try {
    const result = await saveUpload(file);

    const upload = await prisma.cargaArchivo.create({
      data: {
        IdUsuario: user.id,
        IdOrganizacion: user.organizationId,
        SIdentificadorCarga: result.key,
        SClaveObjetoTemporal: result.key,
        STipoMimeEsperado: result.mimeType,
        ITamanoEsperadoBytes: BigInt(result.size),
        BCompletada: true,
        DFechaFinalizacion: new Date(),
      },
    });

    return { ok: true, data: { ...result, id: upload.IdCargaArchivo.toString() } };
  } catch (error) {
    if (error instanceof UploadError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: `Error al subir imagen: ${String(error)}` };
  }
}
