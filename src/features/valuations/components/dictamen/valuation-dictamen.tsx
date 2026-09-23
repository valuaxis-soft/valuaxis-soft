"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SectionDocument } from "@/features/valuations/components/report-preview";
import {
  caratulaFromValuation,
  initialMetaFor,
  initialSectionsFor,
} from "@/features/valuations/components/workspace/model/initial-hydration";
import {
  flattenSectionConcepts,
  getDocumentHeaderImage,
  resolveSectionConceptsForDisplay,
} from "@/features/valuations/components/workspace/model/section-content";
import { useStoredValuationImages } from "@/features/valuations/components/workspace/hooks/use-stored-images";
import { transformComparables } from "@/features/valuations/mappers/transform-valuation";
import type { ValuationDetail } from "@/features/valuations/repositories/valuation.repository";

/**
 * The whole dictamen as saved: every enabled section, in order, with the same
 * pages the editor preview shows. Printing it (or saving it as PDF from the
 * print dialog) gives one Letter page per document page.
 */
export function ValuationDictamen({
  companyName,
  initialValuation,
  valuationId,
}: {
  companyName: string;
  initialValuation: ValuationDetail;
  valuationId: string;
}) {
  const [initial] = useState(() => {
    const sections = initialSectionsFor(initialValuation);
    const meta = initialMetaFor(initialValuation);
    return {
      caratula: caratulaFromValuation(initialValuation, meta, sections),
      comparables: transformComparables(initialValuation.comparables ?? []).filter((item) => item.selected),
      meta,
      sections,
    };
  });
  const [sections, setSections] = useState(initial.sections);
  const { principalCoverImage } = useStoredValuationImages({ setSections, valuationId });
  const documentHeaderImage = getDocumentHeaderImage(sections);

  const printableSections = useMemo(() => {
    const allConcepts = flattenSectionConcepts(sections);
    return sections
      .filter((section) => section.enabled !== false)
      .map((section) => resolveSectionConceptsForDisplay(section, allConcepts));
  }, [sections]);

  return (
    <div className="min-h-dvh bg-muted/40 print:bg-white">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" render={<Link href={`/workspace?id=${valuationId}`} />}>
            <ArrowLeft data-icon="inline-start" />
            Volver al editor
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">Dictamen {initial.meta.folio}</h1>
            <p className="text-xs text-muted-foreground">
              Para obtener el PDF, elige &quot;Guardar como PDF&quot; como destino al imprimir.
            </p>
          </div>
          <Button onClick={() => window.print()}>
            <Printer data-icon="inline-start" />
            Imprimir o guardar PDF
          </Button>
        </div>
      </header>

      <main data-print-document className="overflow-x-auto py-8 print:overflow-visible print:p-0">
        <div className="flex w-fit min-w-full flex-col gap-6 px-4 print:gap-0 print:p-0">
          {printableSections.map((section) => (
            <SectionDocument
              caratula={initial.caratula}
              comparables={initial.comparables}
              companyName={companyName}
              documentHeaderImage={documentHeaderImage}
              key={section.id}
              meta={initial.meta}
              principalCoverImage={principalCoverImage}
              section={section}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
