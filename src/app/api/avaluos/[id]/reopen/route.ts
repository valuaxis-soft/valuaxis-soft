import { NextResponse } from "next/server";
import { requireApiUser } from "@/security/guards/api-guard";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { reopenValuation } from "@/features/valuations/services/valuation-workflow.service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.reopenValuations);
    if (!auth.ok) return auth.response;
    const { user } = auth;

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
