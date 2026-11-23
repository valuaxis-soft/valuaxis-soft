import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { getCurrentSession, renewCurrentSession } from "@/features/auth/services/session.service";
import { isPlatformOperator } from "@/features/operator/operator-access";
import { requireSession } from "./require-session";
import type { ApiGuardResult } from "./api-guard";

/** A person who is not an operator only leaves a trace: the page answers as if it did not exist. */
function auditDenied(user: { id: number; organizationId: number }, path: string) {
  return recordAuditEvent({
    typeKey: "ACCESO_DENEGADO",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "Operador",
    entityId: path,
    action: "OPERATOR_ACCESS_DENIED",
    result: "RECHAZADO",
  });
}

/**
 * Route handlers of /api/operador/**: a session of a verified operator
 * (OPERATOR_EMAILS). Anyone else, signed in or not, gets 404, so the route's
 * existence is not revealed.
 */
export async function requireOperatorApi(path: string): Promise<ApiGuardResult> {
  const session = await getCurrentSession();
  if (!session || !session.user.emailVerified || !isPlatformOperator(session.user.email)) {
    if (session) await auditDenied(session.user, path);
    return { ok: false, response: NextResponse.json({ error: "No encontrado" }, { status: 404 }) };
  }
  await renewCurrentSession(session);
  return { ok: true, user: session.user };
}

/** Pages of /operador/**: the login without a session (like every private page), 404 for anyone who is not an operator. */
export async function requireOperatorPage(path: string) {
  const user = await requireSession(path);
  if (!user.emailVerified || !isPlatformOperator(user.email)) {
    await auditDenied(user, path);
    notFound();
  }
  return user;
}
