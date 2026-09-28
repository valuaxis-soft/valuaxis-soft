import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { teamErrorResponse } from "@/features/team/team-error-response";
import { teamInviteLimiter } from "@/features/team/team-rate-limit";
import { resendInvitation, revokeInvitation } from "@/features/team/team.service";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const invalidId = () => NextResponse.json({ error: "Invitación no encontrada." }, { status: 404 });

/** Sends a new link; the previous one stops working. */
export async function POST(_request: Request, { params }: RouteContext<"/api/organizacion/equipo/invitaciones/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return invalidId();
    const limit = teamInviteLimiter.consume(`team-invite:${auth.user.organizationId}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    return NextResponse.json({ data: await resendInvitation(auth.user, id) });
  } catch (error) {
    return teamErrorResponse("TEAM_INVITE_RESEND", error, "No se pudo reenviar la invitación.");
  }
}

/** Cancels a pending invitation. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/organizacion/equipo/invitaciones/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return invalidId();
    await revokeInvitation(auth.user, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return teamErrorResponse("TEAM_INVITE_REVOKE", error, "No se pudo cancelar la invitación.");
  }
}
