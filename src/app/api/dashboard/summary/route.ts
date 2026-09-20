import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { getDashboardSummary } from "@/features/dashboard/services/dashboard-summary.service";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const summary = await getDashboardSummary(user);
    return NextResponse.json({ data: summary });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al cargar resumen del dashboard", details: String(error) },
      { status: 500 },
    );
  }
}
