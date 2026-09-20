import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import {
  deleteDocumentHeaderImage,
  getDocumentHeaderImage,
  replaceDocumentHeaderImage,
} from "@/features/files/services/valuation-document-header-image";
import { CoverImageError } from "@/features/files/services/valuation-cover-image";
import { UploadError } from "@/features/files/services/upload";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/avaluos/[id]/caratula/imagen-encabezado">,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    return NextResponse.json({ data: await getDocumentHeaderImage(user, id) });
  } catch (error) {
    return documentHeaderImageErrorResponse(error, "consultar");
  }
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/avaluos/[id]/caratula/imagen-encabezado">,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const formData = await request.formData();
    const candidate = formData.get("file");
    if (!(candidate instanceof File)) {
      return NextResponse.json({ error: "No se envio ninguna imagen" }, { status: 400 });
    }
    return NextResponse.json({ data: await replaceDocumentHeaderImage(user, id, candidate) }, { status: 201 });
  } catch (error) {
    return documentHeaderImageErrorResponse(error, "subir");
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/avaluos/[id]/caratula/imagen-encabezado">,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    return NextResponse.json({ data: await deleteDocumentHeaderImage(user, id) });
  } catch (error) {
    return documentHeaderImageErrorResponse(error, "eliminar");
  }
}

function documentHeaderImageErrorResponse(error: unknown, operation: "consultar" | "subir" | "eliminar") {
  if (error instanceof CoverImageError || error instanceof UploadError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error instanceof UploadError ? 400 : error.status },
    );
  }
  console.error(`[DOCUMENT_HEADER_IMAGE] Error al ${operation} la imagen del encabezado`, error);
  return NextResponse.json(
    { error: `No se pudo ${operation} la imagen del encabezado.` },
    { status: 500 },
  );
}
