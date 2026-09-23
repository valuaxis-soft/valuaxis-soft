import { FileImage } from "lucide-react";
import { useMemo, type CSSProperties, type ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PreviewViewer } from "./preview-viewer";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AppSection,
  Block,
  CaratulaFormData,
  Comparable,
  ImageContent,
  PrincipalCoverImage,
  Apartado,
  ValuationMeta,
} from "../model";
import { COMPANY_HEADER_BLOCK_ID } from "@/features/valuations/services/caratula-company-header";
import {
  getCaratulaBlockKind,
} from "@/features/valuations/services/caratula-blocks";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import { DocumentThemeProvider, useDocumentTheme } from "@/features/valuations/components/document-theme";
import { DatosPreview } from "./datos-generales-preview";
import { TerrenoPreview } from "./terreno-preview";
import { isTerrenoSection } from "@/features/valuations/sections/terreno";
import { ConstruccionPreview, isConstruccionSection } from "./construccion-preview";
import { documentBlockFlowItems } from "./document-block-renderer";
import { DocumentPreviewHeader } from "./document-preview-header";
import {
  AutoPaginatedDocumentFlow,
  computeDocumentLayoutKey,
  DocumentPreviewPage,
  type DocumentFlowItem,
} from "./document-preview-page";
import {
  CaratulaCoverModule,
  CaratulaAssumptionsModule,
  CaratulaConclusionModule,
} from "./caratula-preview-modules";

const CARATULA_BLUE = "#003B73";
const CARATULA_DARK_BLUE = "#00285A";

const CARATULA_COLOR_VARS = {
  "--caratula-blue": CARATULA_BLUE,
  "--caratula-dark-blue": CARATULA_DARK_BLUE,
} as CSSProperties;
const PRE_MARKET_LAYOUT_SECTION_KEYS = new Set([
  "CARATULA",
  "DATOS_GENERALES",
  "TERRENO",
  "CONSTRUCCION",
  "CONSIDERACIONES",
  "COSTOS",
]);

export function ReportPreview({
  caratula,
  companyName,
  meta,
  section,
  comparables,
  principalCoverImage,
  documentHeaderImage,
}: {
  caratula: CaratulaFormData;
  companyName: string;
  meta: ValuationMeta;
  section: AppSection;
  comparables: Comparable[];
  principalCoverImage: PrincipalCoverImage | null;
  documentHeaderImage?: ImageContent | null;
}) {
  const isDatosGenerales =
    section.id === "datos" || getCanonicalSectionKey(section.id) === "DATOS_GENERALES";
  const isTerreno = isTerrenoSection(section);
  const isConstruccion = isConstruccionSection(section);
  const isCaratula = section.id === "caratula";

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg">
      <CardHeader className="shrink-0 border-b">
        <CardTitle className="flex items-center gap-2">
          <FileImage />
          Vista previa de la sección
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <PreviewViewer key={section.id} className="h-full">
          {/* Carátula: no gray background — page fills the desk naturally */}
          {isCaratula ? (
            <div className="min-h-full p-4 sm:p-6 lg:p-8">
              <DocumentThemeProvider variant="caratula">
                <div className="light" style={CARATULA_COLOR_VARS}>
                  <CaratulaPreview
                    caratula={caratula}
                    meta={meta}
                    section={section}
                    principalImage={principalCoverImage}
                    header={<DocumentPreviewHeader caratula={caratula} companyName={companyName} headerImage={documentHeaderImage} />}
                  />
                </div>
              </DocumentThemeProvider>
            </div>
          ) : (
            <div className="min-h-full bg-muted/40 p-4 sm:p-6 lg:p-8">
              <DocumentThemeProvider variant="standard">
                <div className="light" style={CARATULA_COLOR_VARS}>
                  {isDatosGenerales ? (
                    <DatosPreview
                      header={<DocumentPreviewHeader caratula={caratula} companyName={companyName} headerImage={documentHeaderImage} />}
                      section={section}
                    />
                  ) : isTerreno ? (
                    <TerrenoPreview
                      header={<DocumentPreviewHeader caratula={caratula} companyName={companyName} headerImage={documentHeaderImage} />}
                      section={section}
                    />
                  ) : isConstruccion ? (
                    <ConstruccionPreview
                      header={<DocumentPreviewHeader caratula={caratula} companyName={companyName} headerImage={documentHeaderImage} />}
                      section={section}
                    />
                  ) : (
                    <ReportSection
                      applyConceptLayout={PRE_MARKET_LAYOUT_SECTION_KEYS.has(getCanonicalSectionKey(section.id))}
                      header={<DocumentPreviewHeader caratula={caratula} companyName={companyName} headerImage={documentHeaderImage} />}
                      section={section}
                    />
                  )}

                  {section.id === "mercadoVenta" && comparables.length ? (
                    <DocumentPreviewPage
                      header={<DocumentPreviewHeader caratula={caratula} companyName={companyName} headerImage={documentHeaderImage} />}
                    >
                      <section className="px-5 pb-7 sm:px-7">
                        <h2 className="border-b border-blue-900 pb-1 text-sm font-bold text-blue-950">
                          COMPARABLES SELECCIONADOS
                        </h2>
                        <Table>
                          <TableCaption>Comparables que pasarían al reporte final.</TableCaption>
                          <TableHeader>
                            <TableRow>
                              <TableHead>ID</TableHead>
                              <TableHead>Precio</TableHead>
                              <TableHead>Área</TableHead>
                              <TableHead>$/m²</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {comparables.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>{item.id}</TableCell>
                                <TableCell>{item.price}</TableCell>
                                <TableCell>{item.area}</TableCell>
                                <TableCell>{item.pricePerMeter}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </section>
                    </DocumentPreviewPage>
                  ) : null}
                </div>
              </DocumentThemeProvider>
            </div>
          )}
        </PreviewViewer>
      </CardContent>
    </Card>
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
  const visibleBlocks = section.blocks.filter(
    (block) => block.enabled && block.id !== COMPANY_HEADER_BLOCK_ID,
  );
  const assumptions = visibleBlocks.filter((block) => getCaratulaBlockKind(block) === "assumptions");
  const conclusions = visibleBlocks.filter((block) => getCaratulaBlockKind(block) === "conclusion");
  const columnBlocks = visibleBlocks.filter(
    (block) => getCaratulaBlockKind(block) === "intermediate",
  );

  // Carátula editable blocks show titles WITHOUT numeric section labels.
  const caratulaTitleOptions = {
    renderBlockTitle: (block: Block) => (
      <h2 className={theme.sectionTitle}>
        {block.title || "No se proporcionó"}
      </h2>
    ),
    renderApartadoTitle: (_block: Block, subBlock: Apartado) => (
      <h3 className={theme.apartadoTitle}>{subBlock.title}</h3>
    ),
  };

  // Build all items: fixed modules + editable blocks, paginated as one flow.
  const items: DocumentFlowItem[] = [
    // Fixed: Cover
    { id: "caratula-cover", node: <CaratulaCoverModule caratula={caratula} meta={meta} principalImage={principalImage} /> },
    // Editable blocks — no title bar in carátula document rendering
    ...columnBlocks.flatMap((block) => reportBlockFlowItems(block, true, { renderTitleBar: false, ...caratulaTitleOptions })),
    // Fixed: Assumptions
    { id: "caratula-assumptions", node: <CaratulaAssumptionsModule blocks={assumptions} /> },
    // Fixed: Conclusion
    { id: "caratula-conclusion", node: <CaratulaConclusionModule blocks={conclusions} caratula={caratula} /> },
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
  header,
  section,
}: {
  applyConceptLayout: boolean;
  header: ReactNode;
  section: AppSection;
}) {
  const theme = useDocumentTheme();
  const items = section.blocks
    .filter((block) => block.enabled)
    .flatMap((block) => reportBlockFlowItems(block, applyConceptLayout));
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
