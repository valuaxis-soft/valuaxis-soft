import { AUTH_PERMISSIONS, type AuthPermission, type AuthUser } from "./model";

export function hasPermission(
  user: Pick<AuthUser, "active" | "permissions"> | null | undefined,
  permission: AuthPermission,
) {
  if (!user?.active) return false;
  return user.permissions.includes(permission);
}

export const canViewProjects = (user: AuthUser | null | undefined) =>
  hasPermission(user, AUTH_PERMISSIONS.viewValuations);

export const canEditProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, AUTH_PERMISSIONS.editValuations);

/**
 * Reviewing the comparables of a valuation against their listings is the
 * reviewer's job as much as the appraiser's: either permission is enough,
 * though the rest of the valuation stays read-only for a reviewer.
 */
export const REVIEW_COMPARABLES_PERMISSIONS = [AUTH_PERMISSIONS.editValuations, AUTH_PERMISSIONS.reviewValuations] as const;

export const canReviewComparables = (user: AuthUser | null | undefined) =>
  REVIEW_COMPARABLES_PERMISSIONS.some((permission) => hasPermission(user, permission));

export const canExportProject = (user: AuthUser | null | undefined) =>
  hasPermission(user, AUTH_PERMISSIONS.exportValuations);
