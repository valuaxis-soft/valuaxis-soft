"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DownloadDictamenPdfButton } from "./download-dictamen-pdf-button";
import { UnaccreditedNoticeProvider } from "@/features/accreditation/components/unaccredited-notice";
import { SendDictamenEmailDialog } from "./send-dictamen-email-dialog";
import { NumberPresentationProvider } from "@/features/valuations/components/number-presentation-context";
import { ContinuousSectionsDocument, SectionDocument } from "@/features/valuations/components/report-preview";
import { DocumentPageFooterProvider, numberDocumentPages } from "@/features/valuations/components/document-preview-page";
import { printableSectionGroups } from "@/features/valuations/services/printable-sections";
import { documentNumberPresentation } from "@/features/valuations/services/number-presentation";
import { PagePresentationProvider } from "@/features/valuations/components/page-presentation-context";
import { documentPagePresentation } from "@/features/valuations/services/page-presentation";
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
import type { ValuationDetail } from "@/features/valuations/repositories/valuation.repository";
import type { Letterhead } from "@/features/valuations/model";

/**
 * The whole dictamen as saved: every enabled section, in order, with the same
 * pages the editor preview shows. Printing it (or saving it as PDF from the
 * print dialog) gives one Letter page per document page.
 */
export function ValuationDictamen({
  canShare,
  letterhead,
  initialValuation,
  valuationId,
  unaccreditedNotice,
}: {
  canShare: boolean;
  letterhead: Letterhead;
  initialValuation: ValuationDetail;
  valuationId: string;
  /** The issuer is not accredited: every copy prints "DOCUMENTO SIN VALIDEZ OFICIAL" (docs/ACREDITACION.md). */
  unaccreditedNotice: boolean;
}) {
  const [initial] = useState(() => {
    const sections = initialSectionsFor(initialValuation);
    const meta = initialMetaFor(initialValuation);
    return {
      caratula: caratulaFromValuation(initialValuation, meta, sections),
      meta,
      sections,
    };
  });
  const [sections, setSections] = useState(initial.sections);
  const { principalCoverImage } = useStoredValuationImages({ setSections, valuationId });
  const documentHeaderImage = getDocumentHeaderImage(sections);
  // "Página n de m" across every section: written whenever the pages change, as each section paginates on its own.
  const documentRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const container = documentRef.current;
    if (!container) return;
    numberDocumentPages(container);
    const observer = new MutationObserver(() => numberDocumentPages(container));
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // The approaches left out of the dictamen do not print, and a section that continues the one before shares its pages.
  const printableGroups = useMemo(() => {
    const allConcepts = flattenSectionConcepts(sections);
    return printableSectionGroups(sections, { unaccreditedNotice })
      .map((group) => group.map((section) => resolveSectionConceptsForDisplay(section, allConcepts)));
  }, [sections, unaccreditedNotice]);

  return (
    <div className="min-h-dvh bg-muted/40 print:bg-white">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
        <DictamenToolbar backHref={`/workspace?id=${valuationId}`} folio={initial.meta.folio}>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer data-icon="inline-start" />
            Imprimir
          </Button>
          {canShare ? <SendDictamenEmailDialog valuationId={valuationId} folio={initial.meta.folio} firmName={letterhead.name} /> : null}
          <DownloadDictamenPdfButton kind="memoria" variant="outline" valuationId={valuationId} />
          <DownloadDictamenPdfButton valuationId={valuationId} />
          <DownloadDictamenPdfButton kind="entregables" variant="outline" valuationId={valuationId} />
        </DictamenToolbar>
      </header>

      <main data-print-document className="overflow-x-auto py-8 print:overflow-visible print:p-0" ref={documentRef}>
        <DocumentPageFooterProvider enabled>
        <UnaccreditedNoticeProvider show={unaccreditedNotice}>
        <NumberPresentationProvider presentation={documentNumberPresentation(sections)}>
        <PagePresentationProvider presentation={documentPagePresentation(sections)}>
          <DictamenPages>
            {printableGroups.map((group) => group.length === 1 ? (
              <SectionDocument
                caratula={initial.caratula}
                letterhead={letterhead}
                documentHeaderImage={documentHeaderImage}
                key={group[0].id}
                meta={initial.meta}
                principalCoverImage={principalCoverImage}
                section={group[0]}
              />
            ) : (
              <ContinuousSectionsDocument
                caratula={initial.caratula}
                letterhead={letterhead}
                documentHeaderImage={documentHeaderImage}
                key={group.map((section) => section.id).join("+")}
                meta={initial.meta}
                sections={group}
              />
            ))}
          </DictamenPages>
        </PagePresentationProvider>
        </NumberPresentationProvider>
        </UnaccreditedNoticeProvider>
        </DocumentPageFooterProvider>
      </main>
    </div>
  );
}

/**
 * The column of pages. On screen it is as wide as its widest page, so a
 * landscape page scrolls sideways with the others centered. In print it is
 * the width of an upright page: Chromium shrinks the whole document until
 * its widest box fits the page, so a column as wide as a landscape page made
 * every page of the PDF print at 77 %. A landscape page still prints whole,
 * on its own sheet lying on its side (`@page landscape` in globals.css).
 */
export function DictamenPages({ children }: { children: ReactNode }) {
  return <div className="flex w-fit min-w-full flex-col gap-6 px-4 print:w-full print:gap-0 print:p-0">{children}</div>;
}

/**
 * The bar over the dictamen. The title keeps a readable width and the buttons
 * wrap as one group below it, so a narrow window or a zoomed-out page never
 * squeezes the title into a column of single words (video 5.3).
 */
export function DictamenToolbar({ backHref, children, folio }: { backHref: string; children: ReactNode; folio: string }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      {/* A full load: this page keeps the strict CSP of a printed document, and the editor needs Google's for its map. */}
      <Button variant="ghost" size="sm" nativeButton={false} render={<a href={backHref} />}>
        <ArrowLeft data-icon="inline-start" />
        Volver al editor
      </Button>
      <div className="min-w-64 flex-1" data-dictamen-title>
        <h1 className="truncate text-sm font-semibold">Dictamen {folio}</h1>
        <p className="text-xs text-muted-foreground">
          El PDF se genera en el servidor y queda guardado con el avalúo.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2" data-dictamen-actions>
        {children}
      </div>
    </div>
  );
}
