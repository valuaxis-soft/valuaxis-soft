import { NextResponse } from "next/server";
import { requireApiUser } from "@/security/guards/api-guard";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { concludeValuation } from "@/features/valuations/services/valuation-workflow.service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.concludeValuations);
    if (!auth.ok) return auth.response;
    const { user } = auth;

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
