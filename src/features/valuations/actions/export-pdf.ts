"use server";

import { generateValuationPdf, type PdfValuation } from "@/features/reports/services/pdf-generator";
import { getCurrentUser } from "@/features/auth/session";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import { requirePermissionPolicy } from "@/features/valuations/policies/valuation-access.policy";

export async function exportValuationPdf(valuationId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado" };
  }
  const permission = requirePermissionPolicy(user, "projects.export");
  if (!permission.ok) {
    return { ok: false, error: permission.error };
  }

  try {
    const valuation = await getValuationByPublicId(valuationId, user.organizationId);
    if (!valuation) {
      return { ok: false, error: "Avaluo no encontrado" };
    }

    const pdfData: PdfValuation = {
      folio: valuation.folio,
      client: valuation.client,
      location: valuation.location,
      postalCode: valuation.postalCode,
      valuationKind: valuation.valuationKind,
      propertyKind: valuation.propertyKind,
      sections: valuation.sections.map((section) => ({
        label: section.label,
        title: section.title,
        blocks: section.blocks.map((block) => ({
          label: block.label,
          title: block.title,
          concepts: block.concepts.map((concept) => ({
            label: concept.label,
            value: concept.value,
          })),
          tables: [],
          images: [],
          subBlocks: block.subBlocks.map((subBlock, index) => ({
            label: `${block.label}.${index + 1}`,
            title: subBlock.title,
            concepts: subBlock.concepts.map((concept) => ({
              label: concept.label,
              value: concept.value,
            })),
          })),
        })),
      })),
    };

    const pdfBytes = await generateValuationPdf(pdfData);

    return {
      ok: true,
      data: Buffer.from(pdfBytes).toString("base64"),
      filename: `avaluo-${valuation.folio}.pdf`,
    };
  } catch (error) {
    return { ok: false, error: `Error al generar PDF: ${String(error)}` };
  }
}
