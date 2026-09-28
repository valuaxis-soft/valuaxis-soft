import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { teamErrorResponse } from "@/features/team/team-error-response";
import { teamInviteLimiter } from "@/features/team/team-rate-limit";
import { inviteMemberSchema } from "@/features/team/team-schemas";
import { inviteMember } from "@/features/team/team.service";
import { readJsonBody, tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Invites an email with a role and sends the link. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, inviteMemberSchema);
    if (!body.ok) return body.response;
    const limit = teamInviteLimiter.consume(`team-invite:${auth.user.organizationId}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    return NextResponse.json({ data: await inviteMember(auth.user, body.data) }, { status: 201 });
  } catch (error) {
    return teamErrorResponse("TEAM_INVITE", error, "No se pudo enviar la invitación.");
  }
}
