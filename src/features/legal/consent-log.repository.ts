import type { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { ConsentBoxes, ConsentDocumentRef, ConsentEvent } from "./consent-rules";

/**
 * The log of acceptances and consents (`devpware_bitacora_consentimientos`,
 * matrix 3.2). Append only: this module has no update or delete, and a test
 * checks that no code changes a row. Kept ten years (CCom art. 49).
 */

type Client = Prisma.TransactionClient | typeof prisma;

export type ConsentMethod = "LOCAL" | "GOOGLE" | "CUENTA";

export type ConsentLogInput = {
  userId: number;
  email: string;
  event: ConsentEvent;
  method: ConsentMethod;
  documents: ConsentDocumentRef[];
  boxes: ConsentBoxes;
  /** The sign-up form's data (contact and identification), never the password. */
  form?: Record<string, string | null> | null;
  ip: string | null;
  userAgent: string | null;
  /** SHA-256 of the registration (or session) cookie, never the cookie itself. */
  cookieHash: string | null;
};

export function appendConsentLog(client: Client, input: ConsentLogInput) {
  return client.bitacoraConsentimiento.create({
    data: {
      IdUsuario: input.userId,
      SCorreo: input.email,
      SEvento: input.event,
      SMetodo: input.method,
      JDocumentos: input.documents as unknown as Prisma.InputJsonValue,
      JCasillas: input.boxes as unknown as Prisma.InputJsonValue,
      JFormulario: input.form ? (input.form as Prisma.InputJsonValue) : undefined,
      SDireccionIP: input.ip?.slice(0, 64) ?? null,
      SAgenteUsuario: input.userAgent?.slice(0, 1000) ?? null,
      SCookieSesionHash: input.cookieHash,
    },
  });
}

/** Every entry of an account, newest first. */
export function listConsentLog(userId: number) {
  return prisma.bitacoraConsentimiento.findMany({
    where: { IdUsuario: userId },
    orderBy: [{ DFechaEvento: "desc" }, { IdBitacoraConsentimiento: "desc" }],
  });
}
