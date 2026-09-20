import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { requirePermissionPolicy } from "@/features/valuations/policies/valuation-access.policy";
import { reopenValuation } from "@/features/valuations/services/valuation-workflow.service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const permission = requirePermissionPolicy(user, "projects.reopen");
    if (!permission.ok) {
      return NextResponse.json({ error: permission.error }, { status: permission.status });
    }

    const body = await request.json();
    const { id } = await params;
    const result = await reopenValuation({
      publicId: id,
      organizationId: user.organizationId,
      user,
      reason: String(body.reason ?? ""),
      acceptedText: String(body.acceptedText ?? ""),
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al reabrir avaluo" },
      { status: 400 },
    );
  }
}
