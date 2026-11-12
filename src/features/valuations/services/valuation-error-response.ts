import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { internalError } from "@/lib/api-response";
import { ValuationWorkflowError } from "./valuation-workflow.service";

/** Letters and digits that read the same aloud and on a screenshot (no 0/O, 1/I/L). */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * «G-7KX3QF»: a short code the user can read out or screenshot, printed with
 * the error in the server's log, so a failed save is found at once (V5.7-20).
 */
export function errorReference(bytes: Uint8Array = randomBytes(6)) {
  return `G-${Array.from(bytes.slice(0, 6), (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join("")}`;
}

/** The kind of failure in words for the user, when the database says it; never its details. */
export function failureCause(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": return "un dato que debe ser único está repetido";
      case "P2003": return "algo del documento apunta a un dato que ya no existe";
      case "P2025": return "un dato del documento ya no existe";
      case "P2028": return "el guardado tardó demasiado";
      case "P2034": return "otro guardado del mismo avalúo ocurrió al mismo tiempo";
      case "P1001": case "P1002": case "P1017": return "se perdió la conexión con la base de datos";
      default: return null;
    }
  }
  const message = error instanceof Error ? error.message : "";
  if (/check constraint|23514/.test(message)) return "el documento tiene una estructura que la base de datos no acepta";
  if (/Transaction (already closed|API error)|expired transaction/i.test(message)) return "el guardado tardó demasiado";
  if (error instanceof Prisma.PrismaClientInitializationError) return "se perdió la conexión con la base de datos";
  return null;
}

/** For the log: the database's code and the constraint or message, not the content. */
function causeForLog(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return { prismaCode: error.code, meta: error.meta };
  const message = error instanceof Error ? error.message : String(error);
  return { message: message.slice(-500) };
}

/**
 * Business failures return their message; anything else is logged with a
 * code (and the valuation's id) and the client gets the message, the kind of
 * failure when it is known and that code, never the details.
 */
export function valuationErrorResponse(context: string, error: unknown, fallbackMessage: string, details: { valuationId?: string } = {}) {
  if (error instanceof ValuationWorkflowError && error.status !== 500) {
    return NextResponse.json({ error: error.message, ...(error.link ? { link: error.link } : {}) }, { status: error.status });
  }
  if (!details.valuationId && !(error instanceof ValuationWorkflowError)) return internalError(context, error, fallbackMessage);
  const reference = errorReference();
  const cause = failureCause(error);
  console.error(`[${context}] ${reference}`, { valuationId: details.valuationId ?? null, cause: causeForLog(error) }, error);
  const message = error instanceof ValuationWorkflowError ? error.message : fallbackMessage.replace(/\.$/, "");
  return NextResponse.json(
    { error: `${message}${cause ? `: ${cause}` : ""}. Código: ${reference}.`, code: reference },
    { status: 500 },
  );
}
