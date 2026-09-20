import { DEFAULT_LOGIN_REDIRECT } from "@/features/auth/constants/auth.constants";

const allowedInternalPrefixes = [
  "/dashboard",
  "/avaluos",
  "/configuracion",
  "/organizacion",
  "/suscripcion",
  "/workspace",
] as const;

export function safeRedirectPath(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return DEFAULT_LOGIN_REDIRECT;
  }

  return allowedInternalPrefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))
    ? value
    : DEFAULT_LOGIN_REDIRECT;
}
