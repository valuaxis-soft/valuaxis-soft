"use client";

import { ReportPreview, type PreviewSectionNavigation } from "@/features/valuations/components/report-preview";
import type { AppSection, CaratulaFormData, ImageContent, Letterhead, PrincipalCoverImage } from "@/features/valuations/model";
import type { ValuationMeta } from "@/features/valuations/services/valuation-constants";

export function ValuationPreviewPanel({
  activeSection,
  caratula,
  group,
  letterhead,
  meta,
  navigation,
  principalCoverImage,
  documentHeaderImage,
}: {
  activeSection: AppSection;
  caratula: CaratulaFormData;
  /** The sections printed on the same pages as the shown one, it among them («Continuar donde terminó»). */
  group?: AppSection[];
  letterhead: Letterhead;
  meta: ValuationMeta;
  /** Browsing to the previous or next section without leaving the editor's active one. */
  navigation?: PreviewSectionNavigation;
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
            navigation={navigation}
            group={group}
            section={activeSection}
            caratula={caratula}
            letterhead={letterhead}
            principalCoverImage={principalCoverImage}
            documentHeaderImage={documentHeaderImage}
          />
        )}
      </div>
    </div>
  );
}
