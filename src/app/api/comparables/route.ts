import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { listComparables } from "@/features/comparables/repositories/comparable.repository";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const comparables = await listComparables({
      organizationId: user.organizationId,
      valuationId: searchParams.get("valuationId"),
      postalCode: searchParams.get("postalCode"),
    });

    return NextResponse.json({ data: comparables });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener comparables", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        "La creacion de comparables debe realizarse contra Propiedad/PublicacionPropiedad/ComparableAvaluo con catalogos existentes.",
    },
    { status: 501 },
  );
}
