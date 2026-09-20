import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { getValuationCreationCatalogs } from "@/features/valuations/services/valuation-catalogs.service";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const catalogs = await getValuationCreationCatalogs(user.organizationId);
    return NextResponse.json({ data: catalogs });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener catalogos de avaluos", details: String(error) },
      { status: 500 },
    );
  }
}
