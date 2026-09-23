import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/features/auth/session";
import {
  DatosImageError,
  deleteDatosImage,
  listDatosImages,
  uploadDatosImage,
} from "@/features/files/services/valuation-datos-image";
import { CoverImageError } from "@/features/files/services/valuation-cover-image";
import { UploadError } from "@/features/files/services/upload";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/avaluos/[id]/datos/imagenes">,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    return NextResponse.json({ data: await listDatosImages(user, id) });
  } catch (error) {
    return datosImageErrorResponse(error, "consultar");
  }
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/avaluos/[id]/datos/imagenes">,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const limited = uploadRateLimitResponse(user.id);
    if (limited) return limited;
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get("file");
    const blockId = formData.get("blockId");
    const subBlockId = formData.get("subBlockId");
    if (!(file instanceof File) || typeof blockId !== "string") {
      return NextResponse.json({ error: "Faltan la imagen o el bloque de destino." }, { status: 400 });
    }
    const image = await uploadDatosImage(
      user,
      id,
      blockId,
      typeof subBlockId === "string" ? subBlockId : null,
      file,
    );
    return NextResponse.json({ data: image }, { status: 201 });
  } catch (error) {
    return datosImageErrorResponse(error, "subir");
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteContext<"/api/avaluos/[id]/datos/imagenes">,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const imageId = new URL(request.url).searchParams.get("imageId");
    if (!imageId) {
      return NextResponse.json({ error: "Falta identificar la imagen." }, { status: 400 });
    }
    const { id } = await params;
    const deleted = await deleteDatosImage(user, id, imageId);
    return NextResponse.json({ data: { deleted } });
  } catch (error) {
    return datosImageErrorResponse(error, "eliminar");
  }
}

function datosImageErrorResponse(error: unknown, operation: "consultar" | "subir" | "eliminar") {
  if (
    error instanceof DatosImageError ||
    error instanceof CoverImageError ||
    error instanceof UploadError
  ) {
    const status = error instanceof UploadError ? 400 : error.status;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  console.error(`[DATOS_IMAGE] Error al ${operation} imagen`, error);
  return NextResponse.json(
    { error: `No se pudo ${operation} la imagen de Datos generales.` },
    { status: 500 },
  );
}
