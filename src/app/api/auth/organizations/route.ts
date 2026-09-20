import { NextResponse } from "next/server";

import { getCurrentSession } from "@/features/auth/services/session.service";
import {
  changeActiveOrganization,
  listAvailableOrganizations,
} from "@/features/auth/services/organization-access.service";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const organizations = await listAvailableOrganizations(session.user.id, session.organizationId);
  return NextResponse.json({ data: organizations });
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const organizationId =
    typeof body.IdOrganizacion === "number" && Number.isInteger(body.IdOrganizacion) && body.IdOrganizacion > 0
      ? body.IdOrganizacion
      : undefined;
  const organizationPublicId =
    typeof body.UIdentificadorPublico === "string" && isUuid(body.UIdentificadorPublico)
      ? body.UIdentificadorPublico
      : undefined;

  if (!organizationId && !organizationPublicId) {
    return NextResponse.json(
      { error: "Se requiere IdOrganizacion o UIdentificadorPublico válido" },
      { status: 400 },
    );
  }

  const result = await changeActiveOrganization({
    sessionId: session.sessionId,
    userId: session.user.id,
    organizationId,
    organizationPublicId,
  });

  if (!result.ok) {
    const status = result.reason === "ORGANIZATION_ACCESS_DENIED" ? 403 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ data: result.organization });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
