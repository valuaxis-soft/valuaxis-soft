import type { AuthorizationContext } from "../types/authorization.types";

export function hasPermission(context: AuthorizationContext | null, permission: string) {
  return Boolean(context?.permissions.has(permission));
}

export function getEffectiveFeature(context: AuthorizationContext | null, feature: string) {
  return context?.features.get(feature) ?? null;
}

export function hasFeature(context: AuthorizationContext | null, feature: string) {
  const effective = getEffectiveFeature(context, feature);
  return Boolean(effective?.included);
}
