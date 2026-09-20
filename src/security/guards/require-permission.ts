import { buildAuthorizationContext } from "@/features/auth/services/authorization-context.service";
import { hasPermission } from "@/features/auth/rules/subscription-access.rules";
import { requireSession } from "./require-session";

export async function requirePermission(permission: string) {
  const session = await requireSession();
  const context = await buildAuthorizationContext(session.user.id, session.organizationId);
  if (!hasPermission(context, permission)) {
    throw new Error("PERMISSION_DENIED");
  }
  return context;
}
