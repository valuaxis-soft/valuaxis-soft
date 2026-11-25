import { prisma } from "@/infrastructure/database/prisma-client";
import { getEmailService } from "@/infrastructure/email/email.service";
import { getPublicAppUrl } from "@/lib/public-url";
import { supportEmail } from "./closure-effects";
import {
  ACCOUNT_NOTICE_VERSION,
  buildAccountNotice,
  type AccountNoticeInput,
} from "@/features/notifications/templates/account-notice";

/** Distributive Omit: keeps each kind's own fields. */
type WithoutCommon<T> = T extends unknown ? Omit<T, "supportEmail" | "appUrl"> : never;

function appUrl() {
  try {
    return getPublicAppUrl();
  } catch {
    return "";
  }
}

/**
 * Sends one notice and records it in devpware_avisos_correo, sent or not
 * (matrix 3.4): date, recipient, subject, the text as sent and its version.
 * A delivery failure never throws: the row says it was not sent, and the
 * daily task tries again the next day where it applies.
 */
export async function sendLoggedAccountNotice(input: {
  userId: number | null;
  to: string;
  notice: WithoutCommon<AccountNoticeInput>;
  entity?: { name: "Avaluo" | "SuspensionCuenta"; id: string };
  /** When it is sent: the run's clock, so a notice and the deadlines counted from it agree. */
  at?: Date;
}): Promise<{ sent: boolean }> {
  const content = buildAccountNotice({ ...input.notice, supportEmail: supportEmail(), appUrl: appUrl() } as AccountNoticeInput);
  let error: string | null = null;
  try {
    await getEmailService().sendAccountNotice({ to: input.to, ...content });
  } catch (cause) {
    error = (cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)).slice(0, 500);
    console.error(`[ACCOUNT_NOTICE] ${input.notice.kind} could not be sent`, error);
  }
  await prisma.avisoCorreo.create({
    data: {
      IdUsuario: input.userId,
      STipo: input.notice.kind,
      SVersion: ACCOUNT_NOTICE_VERSION,
      SDestinatario: input.to,
      SAsunto: content.subject.slice(0, 300),
      STexto: content.text,
      SEntidad: input.entity?.name ?? null,
      SIdentificadorEntidad: input.entity?.id ?? null,
      BEnviado: error === null,
      SError: error,
      ...(input.at ? { DFechaEnvio: input.at } : {}),
    },
  });
  return { sent: error === null };
}
