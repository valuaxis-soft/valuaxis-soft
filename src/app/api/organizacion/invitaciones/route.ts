import { after, NextResponse } from "next/server";
import { notifyMemberJoined } from "@/features/notifications/notification-events";
import { getCurrentSession, renewCurrentSession } from "@/features/auth/services/session.service";
import { teamErrorResponse } from "@/features/team/team-error-response";
import { acceptInvitationSchema } from "@/features/team/team-schemas";
import { acceptInvitation, listMyInvitations } from "@/features/team/team.service";
import { readJsonBody } from "@/lib/api-response";

const unauthorized = () => NextResponse.json({ error: "No autorizado" }, { status: 401 });

/** Pending invitations for the signed-in user's email. */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return unauthorized();
    return NextResponse.json({ data: await listMyInvitations(session.user) });
  } catch (error) {
    return teamErrorResponse("TEAM_MY_INVITES", error, "No se pudieron cargar tus invitaciones.");
  }
}

/** Accepts an invitation (by the link's token or from the dashboard) and opens that team. */
export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return unauthorized();
    const body = await readJsonBody(request, acceptInvitationSchema);
    if (!body.ok) return body.response;
    const result = await acceptInvitation(session.user, session.sessionId, body.data);
    await renewCurrentSession(session);
    // The team's administrators see in the app that someone joined.
    if (result.joined) after(() => notifyMemberJoined(result.organizationId, session.user.id));
    return NextResponse.json({ data: { organizationName: result.organizationName } });
  } catch (error) {
    return teamErrorResponse("TEAM_INVITE_ACCEPT", error, "No se pudo aceptar la invitación.");
  }
}
