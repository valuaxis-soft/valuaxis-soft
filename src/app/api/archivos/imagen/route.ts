import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/database/prisma-client";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { internalError } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const notFound = () => NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });

/** A storage key as this app builds them: path segments of safe characters, no traversal. */
const isStorageKey = (key: string) => key.length <= 1024 && /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/.test(key) && !key.split("/").includes("..");

/**
 * A stored image for a member of the organization that owns it: a redirect to
 * a freshly signed URL. Files are registered with their organization; images
 * from before that registry live under the organization's own folder, or under
 * the unguessable generic uploads path.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!isStorageKey(key)) return notFound();

    const files = await prisma.archivo.findMany({ where: { SClaveObjeto: key }, select: { IdOrganizacion: true }, take: 5 });
    let allowed = files.some((file) => file.IdOrganizacion === auth.user.organizationId);
    if (!allowed && files.length === 0) {
      if (key.startsWith("organizaciones/")) {
        const organization = await prisma.organizacion.findUnique({
          where: { IdOrganizacion: auth.user.organizationId },
          select: { UIdentificadorPublico: true },
        });
        allowed = Boolean(organization) && key.startsWith(`organizaciones/${organization?.UIdentificadorPublico}/`);
      } else {
        allowed = key.startsWith("uploads/");
      }
    }
    if (!allowed) return notFound();

    const url = await storageProvider.getPrivateDownloadUrl(key);
    return NextResponse.redirect(new URL(url, request.url), { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return internalError("STORED_IMAGE", error, "No se pudo cargar la imagen.");
  }
}
