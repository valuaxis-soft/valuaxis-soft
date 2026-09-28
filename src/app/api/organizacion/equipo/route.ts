import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { teamErrorResponse } from "@/features/team/team-error-response";
import { teamSettingsSchema } from "@/features/team/team-schemas";
import { getTeam, saveTeamSettings } from "@/features/team/team.service";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Members, pending invitations and the roles an administrator can assign. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await getTeam(auth.user) });
  } catch (error) {
    return teamErrorResponse("TEAM_GET", error, "No se pudo cargar el equipo.");
  }
}

/** Names the organization; a personal space becomes a team. */
export async function PATCH(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, teamSettingsSchema);
    if (!body.ok) return body.response;
    await saveTeamSettings(auth.user, body.data);
    return NextResponse.json({ data: await getTeam(auth.user) });
  } catch (error) {
    return teamErrorResponse("TEAM_SETTINGS", error, "No se pudo guardar el equipo.");
  }
}
