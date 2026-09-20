import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import {
  CoverImageError,
  getPrincipalCoverImage,
  replacePrincipalCoverImage,
} from "@/features/files/services/valuation-cover-image";
import { UploadError } from "@/features/files/services/upload";

type RouteDependencies = {
  currentUser: typeof getCurrentUser;
  getImage: typeof getPrincipalCoverImage;
  replaceImage: typeof replacePrincipalCoverImage;
};

export function createCoverImageRouteHandlers(
  dependencies: RouteDependencies = {
    currentUser: getCurrentUser,
    getImage: getPrincipalCoverImage,
    replaceImage: replacePrincipalCoverImage,
  },
) {
  return {
    async GET(
      _request: Request,
      { params }: { params: Promise<{ id: string }> },
    ) {
      try {
        const user = await dependencies.currentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id } = await params;
        const image = await dependencies.getImage(user, id);
        return NextResponse.json({ data: image });
      } catch (error) {
        return coverImageErrorResponse(error, "consultar");
      }
    },

    async POST(
      request: Request,
      { params }: { params: Promise<{ id: string }> },
    ) {
      try {
        const user = await dependencies.currentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id } = await params;
        const formData = await request.formData();
        const candidate = formData.get("file");
        if (!(candidate instanceof File)) {
          return NextResponse.json({ error: "No se envio ninguna imagen" }, { status: 400 });
        }
        const image = await dependencies.replaceImage(user, id, candidate);
        return NextResponse.json({ data: image }, { status: 201 });
      } catch (error) {
        return coverImageErrorResponse(error, "subir");
      }
    },
  };
}

function coverImageErrorResponse(error: unknown, operation: "consultar" | "subir") {
  if (error instanceof CoverImageError || error instanceof UploadError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error instanceof CoverImageError ? error.status : 400 },
    );
  }
  console.error(`[COVER_IMAGE] Error al ${operation} la imagen principal`, error);
  return NextResponse.json(
    { error: `No se pudo ${operation} la imagen principal.` },
    { status: 500 },
  );
}

const handlers = createCoverImageRouteHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
