import { buildAuthorizationContext } from "@/features/auth/services/authorization-context.service";
import { hasFeature } from "@/features/auth/rules/subscription-access.rules";
import { requireSession } from "./require-session";

export async function requireFeature(feature: string) {
  const session = await requireSession();
  const context = await buildAuthorizationContext(session.user.id, session.organizationId);
  if (!hasFeature(context, feature)) {
    throw new Error("FEATURE_NOT_INCLUDED");
  }
  return context;
}
