import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { generateValuationPdf, type PdfValuation } from "@/features/reports/services/pdf-generator";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import { requirePermissionPolicy } from "@/features/valuations/policies/valuation-access.policy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const permission = requirePermissionPolicy(user, "projects.export");
    if (!permission.ok) {
      return NextResponse.json({ error: permission.error }, { status: permission.status });
    }

    const valuation = await getValuationByPublicId(id, user.organizationId);
    if (!valuation) {
      return NextResponse.json({ error: "Avaluo no encontrado" }, { status: 404 });
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

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="avaluo-${valuation.folio}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al exportar avaluo", details: String(error) },
      { status: 500 },
    );
  }
}
