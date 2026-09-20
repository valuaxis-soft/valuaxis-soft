import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { searchComparablesByPostalCode } from "@/features/comparables/services/comparable-search";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const postalCode = searchParams.get("postalCode");

    if (!postalCode) {
      return NextResponse.json(
        { error: "Se requiere el parametro postalCode" },
        { status: 400 },
      );
    }

    const result = await searchComparablesByPostalCode({
      postalCode,
      organizationId: user.organizationId,
    });

    return NextResponse.json({ data: result.history });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener historial", details: String(error) },
      { status: 500 },
    );
  }
}
