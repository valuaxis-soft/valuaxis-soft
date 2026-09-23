import { NextResponse } from "next/server";
import { getCurrentSession, renewCurrentSession } from "@/features/auth/services/session.service";

/**
 * Session heartbeat. Open editors call it periodically: it renews an active
 * session and tells the client when it expires.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const expiresAt = await renewCurrentSession(session);
  return NextResponse.json({ data: { expiresAt: expiresAt.toISOString() } });
}
