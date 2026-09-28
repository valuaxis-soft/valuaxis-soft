/**
 * Sends the dictamen to the client: a fresh PDF, kept with the valuation
 * like a download, attached to an email in the firm's name. Replies go to
 * the firm's email from Datos del despacho.
 */
import type { AuthUser } from "@/features/auth/model";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getEmailService } from "@/infrastructure/email/email.service";
import { generateDictamenPdf } from "./dictamen-pdf.service";
import { ValuationWorkflowError } from "./valuation-workflow/errors";

/** SES takes 40 MB per message and base64 adds a third. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function sendDictamenByEmail(
  user: AuthUser,
  valuationPublicId: string,
  sessionToken: string,
  input: { to: string[]; subject: string; message: string },
) {
  const firm = await prisma.organizacion.findUniqueOrThrow({
    where: { IdOrganizacion: user.organizationId },
    select: { SNombre: true, SCorreo: true, STelefono: true },
  });
  const pdf = await generateDictamenPdf(user, valuationPublicId, sessionToken, {
    exportType: "DICTAMEN_CORREO",
    parameters: { to: input.to },
  });
  if (pdf.buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new ValuationWorkflowError("El PDF pesa más de 25 MB y no cabe en un correo. Descárgalo y compártelo por otro medio.", 413);
  }

  try {
    await getEmailService().sendDictamenEmail({
      to: input.to,
      replyTo: firm.SCorreo,
      subject: input.subject,
      message: input.message,
      folio: pdf.folio,
      firm: { name: firm.SNombre, phone: firm.STelefono, email: firm.SCorreo },
      pdf: { filename: pdf.filename, content: pdf.buffer },
    });
  } catch (error) {
    console.error("[DICTAMEN_EMAIL]", error);
    throw new ValuationWorkflowError("El PDF se generó y quedó guardado, pero el correo no salió. Intenta de nuevo.", 502);
  }
  return { filename: pdf.filename, bytes: pdf.buffer.length };
}
