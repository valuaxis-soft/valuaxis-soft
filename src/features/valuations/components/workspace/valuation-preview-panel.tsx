"use client";

import { ReportPreview } from "@/features/valuations/components/report-preview";
import type { AppSection, CaratulaFormData, Comparable, ImageContent, Letterhead, PrincipalCoverImage } from "@/features/valuations/model";
import type { ValuationMeta } from "@/features/valuations/services/valuation-constants";

export function ValuationPreviewPanel({
  activeSection,
  caratula,
  letterhead,
  meta,
  selectedComparables,
  principalCoverImage,
  documentHeaderImage,
}: {
  activeSection: AppSection;
  caratula: CaratulaFormData;
  letterhead: Letterhead;
  meta: ValuationMeta;
  selectedComparables: Comparable[];
  principalCoverImage: PrincipalCoverImage | null;
  documentHeaderImage?: ImageContent | null;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="min-h-0 flex-1">
        {activeSection.enabled === false ? (
          <div className="flex h-full items-center justify-center rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Esta sección está oculta en el documento.
          </div>
        ) : (
          <ReportPreview
            meta={meta}
            section={activeSection}
            caratula={caratula}
            letterhead={letterhead}
            comparables={selectedComparables}
            principalCoverImage={principalCoverImage}
            documentHeaderImage={documentHeaderImage}
          />
        )}
      </div>
    </div>
  );
}
