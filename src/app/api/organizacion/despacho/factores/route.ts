import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getFactorCatalog, saveFactorCatalog } from "@/features/firm/firm.service";
import { factorCatalogSchema } from "@/features/valuations/calculation/factor-catalog";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The firm's homologation factor catalog, for everyone who works on valuations. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await getFactorCatalog(auth.user.organizationId) });
  } catch (error) {
    return internalError("FACTOR_CATALOG_GET", error, "No se pudo cargar el catálogo de factores.");
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, factorCatalogSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await saveFactorCatalog(auth.user, body.data) });
  } catch (error) {
    return internalError("FACTOR_CATALOG_SAVE", error, "No se pudo guardar el catálogo de factores.");
  }
}

/** Back to the catalog the system proposes. */
export async function DELETE() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await saveFactorCatalog(auth.user, null) });
  } catch (error) {
    return internalError("FACTOR_CATALOG_RESET", error, "No se pudo restablecer el catálogo de factores.");
  }
}
