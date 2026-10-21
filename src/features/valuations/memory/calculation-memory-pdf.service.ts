/**
 * The calculation memory as a PDF: Chromium prints the /avaluos/<id>/memoria-calculo
 * page with the user's session, as the dictamen PDF does, with the page
 * numbers at the foot. It is generated on request and not kept: it is
 * rebuilt from the valuation every time.
 */
import type { AuthUser } from "@/features/auth/model";
import { AUTH_SESSION_COOKIE } from "@/features/auth/constants/auth.constants";
import { prisma } from "@/infrastructure/database/prisma-client";
import { renderPageToPdf } from "@/infrastructure/pdf/chromium-pdf";
import { dictamenPdfFilename } from "../services/dictamen-pdf.service";
import { ValuationWorkflowError } from "../services/valuation-workflow/errors";

/** Safe file name for the download: Memoria-de-calculo-VDA-0001.pdf. */
export const calculationMemoryPdfFilename = (folio: string) => dictamenPdfFilename(folio).replace(/^Dictamen-/, "Memoria-de-calculo-");

export async function generateCalculationMemoryPdf(user: AuthUser, valuationPublicId: string, sessionToken: string) {
  const valuation = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: valuationPublicId, IdOrganizacion: user.organizationId, BActivo: true, DFechaEliminacion: null },
    select: { SFolio: true, BBloqueado: true, IdVersionTrabajo: true, IdVersionFinal: true },
  });
  if (!valuation) throw new ValuationWorkflowError("Avalúo no encontrado", 404);
  if (!valuation.IdVersionTrabajo && !valuation.IdVersionFinal) {
    throw new ValuationWorkflowError("El avalúo todavía no tiene contenido para imprimir.", 409);
  }
  const buffer = await renderPageToPdf({
    path: `/avaluos/${valuationPublicId}/memoria-calculo`,
    cookies: [{ name: AUTH_SESSION_COOKIE, value: sessionToken }],
    settleSelector: "main[data-print-memory] [data-memory-item]",
    pageNumbers: true,
  });
  return { buffer, filename: calculationMemoryPdfFilename(valuation.SFolio), final: valuation.BBloqueado };
}
