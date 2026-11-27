/**
 * The emails about an account and the retention of its valuations (docs/CUENTAS.md).
 * The wording follows the lawyer's documents of 15 Nov 2026 (Terms 14.1–14.3,
 * commercial policies 3.2, license 17.10, privacy notice 7.3 and 8.3). Each
 * sent email is kept, with ACCOUNT_NOTICE_VERSION, in devpware_avisos_correo:
 * change the version whenever a text changes.
 */
import { SUSPENSION_CAUSES, type SuspensionCause } from "@/features/account/standing/account-standing-rules";
import { textToHtml } from "./escape-html";

export const ACCOUNT_NOTICE_VERSION = "2026-11-25";

export const ACCOUNT_NOTICE_KINDS = [
  "BAJA",
  "INACTIVIDAD",
  "INHABILITACION",
  "SUSPENSION_AVISO",
  "SUSPENSION",
  "REACTIVACION",
] as const;

type Common = {
  recipientName: string;
  email: string;
  /** Where the person writes to ask for a reactivation or to clarify (EMAIL_REPLY_TO). */
  supportEmail: string;
  appUrl: string;
};

export type AccountNoticeInput =
  | (Common & { kind: "BAJA"; requestedAt: Date })
  | (Common & { kind: "INACTIVIDAD"; disableFrom: Date })
  | (Common & { kind: "INHABILITACION"; noticedAt: Date; disabledAt: Date })
  | (Common & { kind: "SUSPENSION_AVISO"; cause: SuspensionCause; detail: string | null; deadline: Date; blocksAccess: boolean })
  | (Common & {
      kind: "SUSPENSION";
      cause: SuspensionCause;
      detail: string | null;
      startedAt: Date;
      urgent: boolean;
      noticedAt: Date | null;
      deadline: Date | null;
      blocksAccess: boolean;
    })
  | (Common & { kind: "REACTIVACION"; reactivatedAt: Date });

export type AccountNoticeContent = { subject: string; text: string; html: string };

const day = (date: Date) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(date);
const dayAndTime = (date: Date) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(date);

const BALANCE_KEPT =
  "La suspensión no extingue los Avalúos Disponibles pagados: conservas tu saldo a favor, sin vencimiento (Políticas comerciales, sección 3.2).";
const CONSULT_KEPT =
  "Mientras dure, no puedes elaborar ni concluir avalúos, pero sí entrar a tu cuenta para consultar y descargar tus avalúos concluidos mientras dure su guarda. La suspensión no suprime ningún dato.";
const IDENTITY_BLOCK =
  "Mientras verificamos la identidad del titular, el acceso a la cuenta queda bloqueado; verificada la identidad, restablecemos de inmediato la consulta y la descarga. Ese bloqueo no suprime ningún dato.";

function causeText(cause: SuspensionCause, detail: string | null) {
  const label = SUSPENSION_CAUSES[cause];
  return detail?.trim() ? `${label}. ${detail.trim()}` : `${label}.`;
}

function paragraphs(input: AccountNoticeInput): { subject: string; body: string[] } {
  const hello = `Hola ${input.recipientName},`;
  switch (input.kind) {
    case "BAJA":
      return {
        subject: "Registramos tu solicitud de baja · Valuaxis Soft",
        body: [
          hello,
          `Registramos tu solicitud de baja de la cuenta ${input.email} el ${dayAndTime(input.requestedAt)}. Desde ese momento dejas de tener acceso a tu cuenta.`,
          "Saldo: conservas como saldo a favor, sin vencimiento, los Avalúos Disponibles pagados que no hayas usado, y puedes reactivar tu cuenta cuando quieras para usarlos. Ese saldo no se devuelve en dinero (Términos y condiciones de uso, sección 14.2; Políticas comerciales, sección 3.2).",
          "Licencia: la Licencia de uso del software termina con la baja (Licencia, sección 17.10). Dejas de poder elaborar avalúos y de tener acceso a la consulta, pero tus avalúos concluidos se conservan hasta que venza su plazo de guarda y vuelves a consultarlos si reactivas tu cuenta antes de ese vencimiento (Términos y condiciones de uso, sección 14.3).",
          "Datos: la baja se tramita como solicitud de cancelación u oposición respecto de tus datos personales, con los plazos de la sección 7.3 del Aviso de privacidad integral. Cuando la cancelación proceda, los datos se bloquearán durante el plazo de prescripción de las acciones derivadas de la relación jurídica y, transcurrido este, se suprimirán, y te avisaremos. Se conservan los datos necesarios para respetar tu saldo a favor y para reactivar tu cuenta.",
          `Si quieres reactivar tu cuenta, escríbenos a ${input.supportEmail}.`,
        ],
      };
    case "INACTIVIDAD":
      return {
        subject: "Descarga tus reportes: tu cuenta lleva tres meses sin avalúos · Valuaxis Soft",
        body: [
          hello,
          `No has generado ningún avalúo en Valuaxis Soft durante tres meses. Te avisamos para que descargues los reportes de tus avalúos concluidos.`,
          `Si no vuelves a generar avalúos, a partir del ${day(input.disableFrom)} podemos inhabilitar temporalmente tu cuenta (Términos y condiciones de uso, sección 14.1, punto 1). Aun inhabilitada, podrás entrar para consultar y descargar tus avalúos concluidos mientras dure su guarda, y conservas tu saldo de Avalúos Disponibles pagados.`,
          `Puedes pedir la reactivación en cualquier momento por correo a ${input.supportEmail}; la reactivamos en un plazo máximo de doce horas naturales.`,
          `Tus avalúos: ${input.appUrl}/avaluos`,
        ],
      };
    case "INHABILITACION":
      return {
        subject: "Tu cuenta quedó inhabilitada temporalmente por inactividad · Valuaxis Soft",
        body: [
          hello,
          `Como te avisamos el ${day(input.noticedAt)}, tu cuenta ${input.email} quedó inhabilitada temporalmente por inactividad desde el ${dayAndTime(input.disabledAt)} (Términos y condiciones de uso, sección 14.1, punto 1).`,
          "Mientras esté inhabilitada no puedes elaborar ni concluir avalúos, pero sí entrar a tu cuenta para consultar y descargar tus avalúos concluidos mientras dure su guarda.",
          BALANCE_KEPT,
          `Para reactivarla, escríbenos a ${input.supportEmail}. La reactivamos en un plazo máximo de doce horas naturales, con tu saldo intacto.`,
        ],
      };
    case "SUSPENSION_AVISO":
      return {
        subject: "Aviso previo de suspensión de tu cuenta · Valuaxis Soft",
        body: [
          hello,
          `Te avisamos que Valuaxis Soft puede suspender tu cuenta ${input.email} por esta causa: ${causeText(input.cause, input.detail)}`,
          `Tienes cinco días hábiles, hasta el ${dayAndTime(input.deadline)}, para aclarar la causa respondiendo a este correo o escribiendo a ${input.supportEmail}. Si aclaras la causa, la cuenta no se suspende (Términos y condiciones de uso, sección 14.1).`,
          `Si se suspende: ${CONSULT_KEPT}`,
          ...(input.blocksAccess ? [IDENTITY_BLOCK] : []),
          BALANCE_KEPT,
        ],
      };
    case "SUSPENSION":
      return {
        subject: "Tu cuenta está suspendida · Valuaxis Soft",
        body: [
          hello,
          `Desde el ${dayAndTime(input.startedAt)} tu cuenta ${input.email} está suspendida por esta causa: ${causeText(input.cause, input.detail)}`,
          input.urgent && input.deadline
            ? `Por tratarse de un caso urgente, el aviso se da al suspender: tienes cinco días hábiles, hasta el ${dayAndTime(input.deadline)}, para aclarar la causa escribiendo a ${input.supportEmail}. Si la aclaras, levantamos la suspensión (Términos y condiciones de uso, sección 14.1).`
            : `Te lo avisamos${input.noticedAt ? ` el ${day(input.noticedAt)}` : ""}${input.deadline ? ` y el plazo para aclarar venció el ${dayAndTime(input.deadline)}` : ""}. Si aclaras la causa escribiendo a ${input.supportEmail}, levantamos la suspensión (Términos y condiciones de uso, sección 14.1).`,
          CONSULT_KEPT,
          ...(input.blocksAccess ? [IDENTITY_BLOCK] : []),
          BALANCE_KEPT,
        ],
      };
    case "REACTIVACION":
      return {
        subject: "Tu cuenta está activa de nuevo · Valuaxis Soft",
        body: [
          hello,
          `Reactivamos tu cuenta ${input.email} el ${dayAndTime(input.reactivatedAt)}. Ya puedes entrar, elaborar y concluir avalúos.`,
          "Tu saldo de Avalúos Disponibles se conservó intacto.",
          `Entra aquí: ${input.appUrl}/iniciar-sesion`,
        ],
      };
  }
}

export function buildAccountNotice(input: AccountNoticeInput): AccountNoticeContent {
  const { subject, body } = paragraphs(input);
  const text = body.join("\n\n");
  return {
    subject,
    text,
    html: ["<!doctype html>", '<html lang="es">', "<body>", textToHtml(text), "</body>", "</html>"].join(""),
  };
}
