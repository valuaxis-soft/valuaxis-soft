import { ChevronLeft, ChevronRight, FileImage } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PreviewViewer } from "./preview-viewer";
import type {
  AppSection,
  Block,
  CaratulaFormData,
  ImageContent,
  Letterhead,
  PrincipalCoverImage,
  Apartado,
  ValuationMeta,
} from "../model";
import { COMPANY_HEADER_BLOCK_ID } from "@/features/valuations/services/caratula-company-header";
import {
  getCaratulaBlockKind,
  primaryCaratulaConclusionId,
} from "@/features/valuations/services/caratula-blocks";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import { DocumentThemeProvider, useDocumentTheme } from "@/features/valuations/components/document-theme";
import { DatosPreview, datosFlowItems } from "./datos-generales-preview";
import { TerrenoPreview, terrenoFlowItems } from "./terreno-preview";
import { isTerrenoSection } from "@/features/valuations/sections/terreno";
import { ConstruccionPreview, construccionFlowItemsInFlow, isConstruccionSection } from "./construccion-preview";
import { documentBlockFlowItems, inPhotoGrid } from "./document-block-renderer";
import { DocumentPreviewHeader } from "./document-preview-header";
import {
  AutoPaginatedDocumentFlow,
  computeDocumentLayoutKey,
  type DocumentFlowItem,
} from "./document-preview-page";
import {
  CaratulaCoverModule,
  CaratulaAssumptionsModule,
  CaratulaBlockHeading,
  CaratulaConclusionModule,
  CaratulaSignaturesModule,
} from "./caratula-preview-modules";
import { conclusionBlockFlowItems } from "./conclusion-preview-modules";
import { useDocumentPaletteStyle } from "./page-presentation-context";
import { UnaccreditedNotice, useUnaccreditedNotice } from "@/features/accreditation/components/unaccredited-notice";
import { NOTICE_SECTION_KEYS } from "@/features/accreditation/accreditation-notice";
import { titlePrints } from "@/features/valuations/services/block-title";
import { isPhotoBlock, photoGridBlock } from "@/features/valuations/services/photo-layout";

/** The root of a document: always light, with the colours of its palette as CSS variables. */
function DocumentRoot({ children }: { children: ReactNode }) {
  return <div className="light" style={useDocumentPaletteStyle()}>{children}</div>;
}

const PRE_MARKET_LAYOUT_SECTION_KEYS = new Set([
  "CARATULA",
  "DATOS_GENERALES",
  "TERRENO",
  "CONSTRUCCION",
  "CONSIDERACIONES",
  "COSTOS",
]);

type SectionDocumentProps = {
  caratula: CaratulaFormData;
  letterhead: Letterhead;
  meta: ValuationMeta;
  section: AppSection;
  principalCoverImage: PrincipalCoverImage | null;
  documentHeaderImage?: ImageContent | null;
};

/** Browsing the preview to the previous or next section, without changing the editor's active one. */
export type PreviewSectionNavigation = {
  /** Name of the section shown, as the tab reads it. */
  label: string;
  position: { index: number; total: number };
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function ReportPreview({
  navigation,
  group,
  ...props
}: SectionDocumentProps & {
  navigation?: PreviewSectionNavigation;
  /**
   * The sections printed on the same pages as this one («Continuar donde
   * terminó la sección anterior»), this one among them: the preview lays them
   * out together, as the dictamen does. Absent or alone: only this section.
   */
  group?: AppSection[];
}) {
  const isCaratula = props.section.id === "caratula";
  const sharedWith = group && group.length > 1 ? group.filter((section) => section.id !== props.section.id) : [];
  const unaccreditedNotice = useUnaccreditedNotice();
  // A section printed after another on the same pages opens where it starts, not on the group's first page (video 7.1, 2:46).
  const startItemId = sharedWith.length && group && group[0]?.id !== props.section.id
    ? sectionFlowItems(props.section, unaccreditedNotice)[0]?.id ?? null
    : null;
  const documentRef = useRef<HTMLDivElement>(null);
  useScrollToSectionStart(documentRef, startItemId, props.section.id);

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg">
      <CardHeader className="shrink-0 border-b">
        <CardTitle className="flex items-center gap-2">
          <FileImage />
          Vista previa de la sección
        </CardTitle>
        {navigation ? (
          <CardAction className="flex items-center gap-1" data-preview-section-navigation>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Sección anterior"
              title="Ver la sección anterior"
              disabled={!navigation.canPrevious}
              onClick={navigation.onPrevious}
            >
              <ChevronLeft />
            </Button>
            <span className="max-w-56 truncate text-xs text-muted-foreground" title={navigation.label}>
              {navigation.label}
              <span className="ml-1 tabular-nums">({navigation.position.index}/{navigation.position.total})</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Sección siguiente"
              title="Ver la sección siguiente"
              disabled={!navigation.canNext}
              onClick={navigation.onNext}
            >
              <ChevronRight />
            </Button>
          </CardAction>
        ) : null}
        {sharedWith.length ? (
          <p className="col-span-full text-xs text-muted-foreground" data-preview-shared-pages="">
            Comparte páginas con {sharedWith.map((section) => section.title).join(", ")}: se muestra como se imprime, una sección
            a continuación de la otra.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <PreviewViewer key={props.section.id} className="h-full">
          {/* Carátula: no gray background — page fills the desk naturally */}
          <div ref={documentRef} className={isCaratula ? "min-h-full p-4 sm:p-6 lg:p-8" : "min-h-full bg-muted/40 p-4 sm:p-6 lg:p-8"}>
            {sharedWith.length && group ? (
              <ContinuousSectionsDocument
                caratula={props.caratula}
                letterhead={props.letterhead}
                meta={props.meta}
                sections={group}
                documentHeaderImage={props.documentHeaderImage}
              />
            ) : (
              <SectionDocument {...props} />
            )}
          </div>
        </PreviewViewer>
      </CardContent>
    </Card>
  );
}

/**
 * Once the shared pages are laid out, brings where the section starts
 * (`startItemId`, its first printed item) to the top of the viewer: once per
 * section shown, so editing it later does not move the view.
 */
function useScrollToSectionStart(rootRef: { current: HTMLElement | null }, startItemId: string | null, sectionId: string) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !startItemId) return;
    const scroll = () => {
      const pagination = root.querySelector("[data-document-pagination]");
      if (pagination?.getAttribute("data-document-pagination") !== "ready") return false;
      const item = [...root.querySelectorAll<HTMLElement>('[data-document-pagination-content="visible"] [data-document-flow-item-id]')]
        .find((element) => element.getAttribute("data-document-flow-item-id") === startItemId);
      const scroller = item?.closest<HTMLElement>("[data-preview-scroller]");
      if (!item || !scroller) return false;
      // Only the viewer scrolls, to the section's first title (on its page, even halfway down); the editor stays where it is.
      scroller.scrollTop += item.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
      return true;
    };
    if (scroll()) return;
    const observer = new MutationObserver(() => {
      if (scroll()) observer.disconnect();
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-document-pagination"] });
    // Pagination settles in a moment; past that the view stays where the appraiser leaves it.
    const stop = window.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(stop);
    };
  }, [rootRef, startItemId, sectionId]);
}

/**
 * The printed pages of one section. The editor preview shows one at a time;
 * the dictamen stacks every enabled section.
 */
export function SectionDocument({
  caratula,
  letterhead,
  meta,
  section,
  principalCoverImage,
  documentHeaderImage,
}: SectionDocumentProps) {
  const isDatosGenerales = isDatosSection(section);
  const isTerreno = isTerrenoSection(section);
  const isConstruccion = isConstruccionSection(section);
  const header = <DocumentPreviewHeader caratula={caratula} letterhead={letterhead} headerImage={documentHeaderImage} propertyKind={meta.propertyKind} />;

  if (section.id === "caratula") {
    return (
      <DocumentThemeProvider variant="caratula">
        <DocumentRoot>
          <CaratulaPreview
            caratula={caratula}
            meta={meta}
            section={section}
            principalImage={principalCoverImage}
            header={header}
          />
        </DocumentRoot>
      </DocumentThemeProvider>
    );
  }

  return (
    <DocumentThemeProvider variant="standard">
      <DocumentRoot>
        {isDatosGenerales ? (
          <DatosPreview header={header} section={section} />
        ) : isTerreno ? (
          <TerrenoPreview header={header} section={section} />
        ) : isConstruccion ? (
          <ConstruccionPreview header={header} section={section} />
        ) : (
          <ReportSection
            applyConceptLayout={PRE_MARKET_LAYOUT_SECTION_KEYS.has(getCanonicalSectionKey(section.id))}
            caratula={caratula}
            header={header}
            section={section}
          />
        )}
      </DocumentRoot>
    </DocumentThemeProvider>
  );
}

const isDatosSection = (section: AppSection) => section.id === "datos" || getCanonicalSectionKey(section.id) === "DATOS_GENERALES";

/**
 * The printed items of a section other than the carátula, as its own pages
 * lay them out: to print it on the pages of the section before.
 */
export function sectionFlowItems(section: AppSection, unaccreditedNotice = false, caratula?: Pick<CaratulaFormData, "firmas">): DocumentFlowItem[] {
  if (isDatosSection(section)) return datosFlowItems(section);
  if (isTerrenoSection(section)) return terrenoFlowItems(section);
  if (isConstruccionSection(section)) return construccionFlowItemsInFlow(section);
  const applyConceptLayout = PRE_MARKET_LAYOUT_SECTION_KEYS.has(getCanonicalSectionKey(section.id));
  return withUnaccreditedNotice(section, sectionBlockItems(section, applyConceptLayout, caratula), unaccreditedNotice);
}

/**
 * The blocks of a section other than the carátula. The conclusion's value
 * and its FIRMAS print in the despacho's format (video 7.1).
 */
function sectionBlockItems(section: AppSection, applyConceptLayout: boolean, caratula?: Pick<CaratulaFormData, "firmas">): DocumentFlowItem[] {
  const print = (block: Block) => reportBlockFlowItems(block, applyConceptLayout);
  const key = getCanonicalSectionKey(section.id);
  const conclusion = key === "CONCLUSIONES";
  return section.blocks
    .filter((block) => block.enabled)
    // FAL-11: the photographs of the subject and of the comparables, two per row with their captions.
    .flatMap((block) => (isPhotoBlock(key, block) ? inPhotoGrid(print(photoGridBlock(block))) : conclusion ? conclusionBlockFlowItems(block, caratula, print) : print(block)));
}

const NOTICE_SECTIONS: ReadonlySet<string> = new Set(NOTICE_SECTION_KEYS);

/**
 * Consideraciones and Conclusión carry the "DOCUMENTO SIN VALIDEZ OFICIAL"
 * notice of an unaccredited issuer as a fixed item: right under the section's
 * first title, or first when it starts with no title.
 */
function withUnaccreditedNotice(section: AppSection, items: DocumentFlowItem[], show: boolean): DocumentFlowItem[] {
  const key = getCanonicalSectionKey(section.id);
  if (!show || !NOTICE_SECTIONS.has(key)) return items;
  const notice: DocumentFlowItem = {
    id: `${section.id}-unaccredited-notice`,
    node: <UnaccreditedNotice location={key.toLowerCase()} />,
  };
  const at = items[0]?.keepWithNext ? 1 : 0;
  return [...items.slice(0, at), notice, ...items.slice(at)];
}

/**
 * Sections that share their pages ("Continuar donde terminó la sección
 * anterior"): one flow, so each one starts right where the one before ends.
 */
export function ContinuousSectionsDocument({
  caratula,
  letterhead,
  meta,
  sections,
  documentHeaderImage,
}: Omit<SectionDocumentProps, "section" | "principalCoverImage"> & { sections: AppSection[] }) {
  const header = <DocumentPreviewHeader caratula={caratula} letterhead={letterhead} headerImage={documentHeaderImage} propertyKind={meta.propertyKind} />;
  return (
    <DocumentThemeProvider variant="standard">
      <DocumentRoot>
        <ContinuousSectionsFlow caratula={caratula} header={header} sections={sections} />
      </DocumentRoot>
    </DocumentThemeProvider>
  );
}

function ContinuousSectionsFlow({ caratula, header, sections }: { caratula: CaratulaFormData; header: ReactNode; sections: AppSection[] }) {
  const theme = useDocumentTheme();
  const unaccreditedNotice = useUnaccreditedNotice();
  const items = sections.flatMap((section) => sectionFlowItems(section, unaccreditedNotice, caratula));
  const contentLayoutKey = useMemo(() => sections.map(computeDocumentLayoutKey).join(":"), [sections]);
  return (
    <AutoPaginatedDocumentFlow
      contentClassName={`${theme.sectionGap} ${theme.pagePadding}`}
      contentLayoutKey={contentLayoutKey}
      header={header}
      items={items}
      pageKeyPrefix={`continuous-${sections[0]?.id ?? "report"}`}
    />
  );
}

function CaratulaPreview({
  caratula,
  meta,
  section,
  principalImage,
  header,
}: {
  caratula: CaratulaFormData;
  meta: ValuationMeta;
  section: AppSection;
  principalImage: PrincipalCoverImage | null;
  header: ReactNode;
}) {
  const theme = useDocumentTheme();
  const unaccreditedNotice = useUnaccreditedNotice();
  const visibleBlocks = section.blocks.filter(
    (block) => block.enabled && block.id !== COMPANY_HEADER_BLOCK_ID,
  );
  // The first conclusion printed carries the commercial value and its words.
  const valueConclusionId = primaryCaratulaConclusionId(visibleBlocks);

  // Carátula editable blocks show titles WITHOUT numeric section labels.
  const caratulaTitleOptions = {
    renderBlockTitle: (block: Block) => <div className="mt-3"><CaratulaBlockHeading title={block.title} hidden={block.titleHidden} /></div>,
    renderApartadoTitle: (_block: Block, subBlock: Apartado) => (
      titlePrints(subBlock) ? <h3 className={theme.apartadoTitle}>{subBlock.title}</h3> : null
    ),
  };
  // The subbloques of the assumptions and the conclusion print after their texts, as in any block.
  const apartadoItems = (block: Block) =>
    reportBlockFlowItems({ ...block, concepts: [], images: [], tables: [] }, true, { renderTitleBar: false, ...caratulaTitleOptions });

  // The blocks print in the editor's order, each with its title, like any section (videos 5.2, 5.5 and 5.6).
  const blockItems = visibleBlocks.flatMap((block): DocumentFlowItem[] => {
    const kind = getCaratulaBlockKind(block);
    if (kind === "assumptions") {
      return [{ id: `caratula-assumptions-${block.id}`, node: <CaratulaAssumptionsModule blocks={[block]} /> }, ...apartadoItems(block)];
    }
    if (kind === "conclusion") {
      const node = <CaratulaConclusionModule blocks={[block]} caratula={caratula} meta={meta} showValue={block.id === valueConclusionId} />;
      return [{ id: `caratula-conclusion-${block.id}`, node }, ...apartadoItems(block)];
    }
    return reportBlockFlowItems(block, true, caratulaTitleOptions);
  });

  // Build all items: fixed modules + editable blocks, paginated as one flow.
  const items: DocumentFlowItem[] = [
    // Fixed: Cover
    { id: "caratula-cover", node: <CaratulaCoverModule caratula={caratula} meta={meta} principalImage={principalImage} /> },
    // Fixed, for an unaccredited issuer: on the cover, under the principal image
    ...(unaccreditedNotice ? [{ id: "caratula-unaccredited-notice", node: <UnaccreditedNotice location="caratula" /> }] : []),
    ...blockItems,
    // With its conclusion hidden, the commercial value still prints, as it always did.
    ...(valueConclusionId ? [] : [{ id: "caratula-conclusion", node: <CaratulaConclusionModule blocks={[]} caratula={caratula} meta={meta} /> }]),
    // Fixed: Signatures, their own item so many of them can move to the next page
    { id: "caratula-signatures", node: <CaratulaSignaturesModule caratula={caratula} /> },
  ];

  const contentLayoutKey = useMemo(() => computeDocumentLayoutKey(section), [section]);

  return (
    <AutoPaginatedDocumentFlow
      contentClassName={`${theme.sectionGap} ${theme.pagePadding}`}
      contentLayoutKey={contentLayoutKey}
      header={header}
      items={items}
      pageKeyPrefix="caratula"
    />
  );
}

function ReportSection({
  applyConceptLayout,
  caratula,
  header,
  section,
}: {
  applyConceptLayout: boolean;
  caratula: CaratulaFormData;
  header: ReactNode;
  section: AppSection;
}) {
  const theme = useDocumentTheme();
  const unaccreditedNotice = useUnaccreditedNotice();
  const items = withUnaccreditedNotice(section, sectionBlockItems(section, applyConceptLayout, caratula), unaccreditedNotice);
  const contentLayoutKey = useMemo(() => computeDocumentLayoutKey(section), [section]);

  return (
    <AutoPaginatedDocumentFlow
      contentClassName={`${theme.sectionGap} ${theme.pagePadding}`}
      contentLayoutKey={contentLayoutKey}
      header={header}
      items={items}
      pageKeyPrefix="report"
    />
  );
}

/**
 * Convert a Block into pagination-friendly DocumentFlowItems for report preview.
 *
 * Delegates to the canonical documentBlockFlowItems which correctly:
 * - Emits the block title bar as its own flow item with block.startOnNewPage
 * - Emits each apartado as its own flow item with subBlock.startOnNewPage
 * - Emits content rows without page-break flags
 * - Handles paired apartados with combined startOnNewPage
 *
 * Key difference from the old implementation: startOnNewPage is NO LONGER
 * gated on applyConceptLayout — a manual page break is a semantic instruction
 * independent of concept layout formatting.
 */
function reportBlockFlowItems(
  block: Block,
  applyConceptLayout: boolean,
  options?: {
    renderTitleBar?: boolean;
    renderBlockTitle?: (block: Block) => ReactNode;
    renderApartadoTitle?: (block: Block, subBlock: Apartado, displayLabel: string) => ReactNode;
  },
): DocumentFlowItem[] {
  return documentBlockFlowItems(block, {
    applyConceptLayout,
    renderTitleBar: options?.renderTitleBar ?? true,
    renderBlockTitle: options?.renderBlockTitle,
    renderApartadoTitle: options?.renderApartadoTitle,
  });
}
