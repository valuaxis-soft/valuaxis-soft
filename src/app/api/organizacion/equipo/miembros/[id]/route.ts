import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { teamErrorResponse } from "@/features/team/team-error-response";
import { changeMemberRoleSchema } from "@/features/team/team-schemas";
import { changeMemberRole, removeMember } from "@/features/team/team.service";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const parseMemberId = (value: string) => (/^\d{1,9}$/.test(value) ? Number(value) : null);
const notFound = () => NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });

/** Changes a member's role. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/organizacion/equipo/miembros/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const memberId = parseMemberId((await params).id);
    if (!memberId) return notFound();
    const body = await readJsonBody(request, changeMemberRoleSchema);
    if (!body.ok) return body.response;
    await changeMemberRole(auth.user, memberId, body.data.role);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return teamErrorResponse("TEAM_MEMBER_ROLE", error, "No se pudo cambiar el rol.");
  }
}

/** Removes a member from the team; their account stays. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/organizacion/equipo/miembros/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const memberId = parseMemberId((await params).id);
    if (!memberId) return notFound();
    await removeMember(auth.user, memberId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return teamErrorResponse("TEAM_MEMBER_REMOVE", error, "No se pudo dar de baja al miembro.");
  }
}
