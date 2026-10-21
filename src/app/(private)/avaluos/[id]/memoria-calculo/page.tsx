import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { isInternalRender } from "@/infrastructure/pdf/internal-render";
import { CalculationMemoryDocument } from "@/features/valuations/components/memory/calculation-memory-document";
import { CalculationMemoryToolbar } from "@/features/valuations/components/memory/calculation-memory-toolbar";
import { getDocumentHeaderImage } from "@/features/valuations/components/workspace/model/section-content";
import { loadCalculationMemory } from "@/features/valuations/memory/calculation-memory.service";
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Memoria de cálculo" };

/**
 * The calculation memory of a valuation, to read, print or download as PDF.
 * The same permission as the dictamen; a concluded valuation shows its final
 * version, read-only like everything else of it.
 */
export default async function CalculationMemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession(`/avaluos/${id}/memoria-calculo`);
  if (!hasPermission(user, AUTH_PERMISSIONS.exportValuations)) redirect(`/workspace?id=${id}`);

  const loaded = await loadCalculationMemory(user, id).catch((error: unknown) => {
    if (error instanceof ValuationWorkflowError && error.status === 404) return null;
    throw error;
  });
  if (!loaded) redirect("/avaluos");

  const requestHeaders = await headers();
  // The server's PDF renderer opening this page is not a separate export: the PDF route audits it.
  if (!isInternalRender(requestHeaders)) {
    await auditValuation({
      action: "EXPORT",
      user,
      valuationPublicId: id,
      request: new Request(`http://internal/avaluos/${id}/memoria-calculo`, { headers: requestHeaders }),
      metadata: { format: "memoria-calculo" },
    });
  }

  return (
    <div className="min-h-dvh bg-muted/40 print:bg-white">
      <CalculationMemoryToolbar folio={loaded.memory.folio} valuationId={id} />
      <CalculationMemoryDocument
        caratula={loaded.caratula}
        headerImage={getDocumentHeaderImage(loaded.sections)}
        letterhead={loaded.letterhead}
        memory={loaded.memory}
        propertyKind={loaded.propertyKind}
      />
    </div>
  );
}
