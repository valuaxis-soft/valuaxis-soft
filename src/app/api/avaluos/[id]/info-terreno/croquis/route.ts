import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/features/auth/session";
import { CoverImageError } from "@/features/files/services/valuation-cover-image";
import {
  listTerrainSketches,
  replaceTerrainSketch,
  TerrainSketchError,
} from "@/features/files/services/valuation-terrain-sketch";
import { UploadError } from "@/features/files/services/upload";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/avaluos/[id]/info-terreno/croquis">,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    return NextResponse.json({ data: await listTerrainSketches(user, id) });
  } catch (error) {
    return terrainSketchErrorResponse(error, "consultar");
  }
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/avaluos/[id]/info-terreno/croquis">,
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const limited = uploadRateLimitResponse(user.id);
    if (limited) return limited;
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get("file");
    const slot = formData.get("slot");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta la imagen del croquis." }, { status: 400 });
    }
    const image = await replaceTerrainSketch(user, id, slot, file);
    return NextResponse.json({ data: image }, { status: 201 });
  } catch (error) {
    return terrainSketchErrorResponse(error, "subir");
  }
}

function terrainSketchErrorResponse(error: unknown, operation: "consultar" | "subir") {
  if (
    error instanceof TerrainSketchError
    || error instanceof CoverImageError
    || error instanceof UploadError
  ) {
    const status = error instanceof UploadError ? 400 : error.status;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  console.error(`[TERRAIN_SKETCH] Error al ${operation} croquis`, error);
  return NextResponse.json(
    { error: `No se pudo ${operation} el croquis de localización.` },
    { status: 500 },
  );
}
