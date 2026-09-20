import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getCurrentUser } from "@/features/auth/session";
import { saveUpload, UploadError } from "@/features/files/services/upload";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se envio ningun archivo" }, { status: 400 });
    }

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

    return NextResponse.json({ data: { ...result, id: upload.IdCargaArchivo.toString() } }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Error al subir archivo", details: String(error) },
      { status: 500 },
    );
  }
}
