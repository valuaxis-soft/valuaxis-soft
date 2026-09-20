import { NextResponse } from "next/server";
import { searchComparablesByPostalCode } from "@/features/comparables/services/comparable-search";
import { getCurrentUser } from "@/features/auth/session";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const postalCode = searchParams.get("postalCode");
    const operation = searchParams.get("operation") || undefined;
    const propertyKind = searchParams.get("propertyKind") || undefined;
    const excludeValuationId = searchParams.get("excludeValuationId") || undefined;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    if (!postalCode) {
      return NextResponse.json(
        { error: "Se requiere el parametro postalCode" },
        { status: 400 },
      );
    }

    const result = await searchComparablesByPostalCode({
      postalCode,
      operation,
      propertyKind,
      excludeValuationId,
      organizationId: user.organizationId,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al buscar comparables", details: String(error) },
      { status: 500 },
    );
  }
}
