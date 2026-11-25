import { ACCOUNT_CLOSURE_BALANCE_NOTICE } from "@/features/billing/credit-rules";

/**
 * What «Dar de baja mi cuenta» shows before confirming (matrix 1.11, «Efectos
 * que se informan antes de confirmar»): the balance (commercial policies 3.2
 * and 6.4), the license (17.10) and the data (privacy notice 7.3 and 8.3).
 */
export const ACCOUNT_CLOSURE_EFFECTS = [
  { title: "Saldo", text: ACCOUNT_CLOSURE_BALANCE_NOTICE },
  {
    title: "Licencia",
    text: "La Licencia de uso del software termina con la baja (sección 17.10): dejas de poder elaborar avalúos y de tener acceso a la consulta. Tus avalúos concluidos se conservan hasta que venza su plazo de guarda, y vuelves a consultarlos si reactivas tu cuenta antes de ese vencimiento.",
  },
  {
    title: "Datos personales",
    text: "La baja se tramita como solicitud de cancelación u oposición de tus datos, conforme al Aviso de privacidad integral (secciones 7.3 y 8.3): se bloquean durante el plazo de prescripción de las acciones de la relación y después se suprimen, y te avisamos. Se conservan los necesarios para respetar tu saldo a favor y reactivar tu cuenta.",
  },
  {
    title: "Reactivación",
    text: "Puedes reactivar tu cuenta cuando quieras, escribiéndonos por correo, para volver a consultar tus avalúos y usar tu saldo.",
  },
] as const;

/**
 * Where a person writes to ask for a closure or a reactivation, or to clarify
 * a suspension: the «correo electrónico de atención» of Terms 1.1, which is
 * the reply-to of the system's emails (EMAIL_REPLY_TO).
 */
export function supportEmail(environment: Record<string, string | undefined> = process.env) {
  return environment.EMAIL_REPLY_TO?.trim() || "contacto@valuaxissoft.com";
}
