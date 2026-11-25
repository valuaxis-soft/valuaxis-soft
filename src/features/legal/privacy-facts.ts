import { AUTH_SESSION_COOKIE } from "@/features/auth/constants/auth.constants";

/**
 * Facts «Mi cuenta» → «Privacidad» shows besides the boxes (matrix 1.10):
 * the cookies the platform sets and the ARCO contact. Pure.
 */

/**
 * Every cookie the platform sets: technical, first-party, none for analytics
 * or ads (the integral notice, 9.1). A new one is added here and in
 * docs/SECURITY.md, and the notice is checked before it ships.
 */
export const COOKIE_INVENTORY = [
  {
    name: AUTH_SESSION_COOKIE,
    purpose: "Mantener tu sesión iniciada.",
    duration: "8 horas desde tu última actividad, hasta 7 días desde que iniciaste sesión.",
  },
  {
    name: "valuaxis_oauth",
    purpose: "Ligar el inicio de sesión con Google a este navegador.",
    duration: "10 minutos, solo mientras entras con Google.",
  },
  {
    name: "valuaxis_registro",
    purpose: "Identificar la sesión de registro en la constancia de tu aceptación.",
    duration: "1 hora, solo al crear la cuenta.",
  },
] as const;

/**
 * The email for privacy and ARCO rights, as the integral notice in force
 * writes it (section 1). Null while the notice still has the blank.
 */
export function arcoEmailFrom(integralNotice: string | null | undefined): string | null {
  const match = /derechos ARCO, ([^\s,;]+@[^\s,;]+?)[,.;]?\s/.exec(integralNotice ?? "");
  return match ? match[1] : null;
}
