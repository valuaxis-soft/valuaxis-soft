import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { requirePermissionPolicy } from "@/features/valuations/policies/valuation-access.policy";
import { concludeValuation } from "@/features/valuations/services/valuation-workflow.service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const permission = requirePermissionPolicy(user, "projects.complete");
    if (!permission.ok) {
      return NextResponse.json({ error: permission.error }, { status: permission.status });
    }

    const { id } = await params;
    const result = await concludeValuation({
      publicId: id,
      organizationId: user.organizationId,
      user,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al concluir avaluo" },
      { status: 400 },
    );
  }
}
