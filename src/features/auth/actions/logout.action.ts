"use server";

import { redirect } from "next/navigation";
import { recordAuditEvent } from "../repositories/audit.repository";
import { getCurrentSession, revokeCurrentSession } from "../services/session.service";

export async function logoutAction() {
  const session = await getCurrentSession();
  await revokeCurrentSession();
  if (session) {
    await recordAuditEvent({
      typeKey: "CIERRE_SESION",
      organizationId: session.organizationId,
      userId: session.user.id,
      entity: "Sesion",
      entityId: String(session.sessionId),
      action: "LOGOUT",
      result: "EXITOSO",
    });
  }
  redirect("/iniciar-sesion");
}
