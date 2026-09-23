"use client";

import type { Block, Concept, ContentLayout, ImageContent, Apartado, TableContent, ContentLayoutRowV2 } from "@/features/valuations/model";
import { resolveBlockFlowV2 } from "@/features/valuations/services/block-flow";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { formatVisibleChildLabel, getBlockFlowApartadoOrder } from "@/features/valuations/services/visible-numbering";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";
import { formatConceptTitleWithColon } from "@/features/valuations/services/concept-title";
import { resolveCellConceptGuide } from "@/features/valuations/services/concept-presentation";
import { cn } from "@/lib/utils";
import { DocumentConceptValue } from "./document-concept-value";
import { DocumentImage } from "./document-image";
import { DocumentTable } from "./document-table";
import { DocumentBlockTitleBar } from "./document-block-title-bar";
import { DocumentTechnicalList } from "./document-technical-list";
import type { DocumentFlowItem } from "./document-preview-page";

/* ------------------------------------------------------------------ */
/*  documentBlockFlowItems — pagination-friendly flow items from       */
/*  BlockFlowV2 structural rows                                       */
/* ------------------------------------------------------------------ */

/**
 * Produce one DocumentFlowItem per BlockFlowV2 structural row.
 *
 * This allows AutoPaginatedDocumentFlow to split large blocks across
 * pages without clipping Apartados.
 *
 * The title bar is emitted as the first item (if applicable).
 * Each content row and apartado row becomes its own flow item.
 * Paired Apartados remain a single flow item (they must stay side-by-side).
 */
export function documentBlockFlowItems(
  block: Block,
  options?: {
    applyConceptLayout?: boolean;
    renderTitleBar?: boolean;
    renderBlockTitle?: (block: Block) => React.ReactNode;
    renderContentRow?: (props: {
      layoutRow: ContentLayoutRowV2;
      conceptsById: Map<string, Concept>;
      imagesById: Map<string, ImageContent>;
      tablesById: Map<string, TableContent>;
      applyConceptLayout: boolean;
    }) => React.ReactNode;
  renderApartadoTitle?: (block: Block, subBlock: Apartado, displayLabel: string) => React.ReactNode;
    pairedApartadosClassName?: string;
  },
): DocumentFlowItem[] {
  const applyConceptLayout = options?.applyConceptLayout ?? false;
  const renderTitleBar = options?.renderTitleBar ?? true;
  const renderBlockTitle = options?.renderBlockTitle;
  const renderContentRow = options?.renderContentRow;
  const renderApartadoTitle = options?.renderApartadoTitle;
  const pairedApartadosClassName = options?.pairedApartadosClassName;
  const flowV2 = resolveBlockFlowV2(block);
  const structuralRows = flowV2?.rows ?? [];

  // Build lookups
  const conceptsById = new Map(block.concepts.map((c) => [c.id, c]));
  const imagesById = new Map(block.images.map((i) => [i.id, i]));
  const tablesById = new Map(block.tables.map((t) => [t.id, t]));
  const subBlocksById = new Map(block.apartados.map((sb) => [sb.id, sb]));
  const resolvedLayout = resolveContentLayout(block);
  const layoutRowsById = new Map(resolvedLayout.rows.map((r) => [r.id, r]));
  const orderedApartados = getBlockFlowApartadoOrder(block);

  const items: DocumentFlowItem[] = [];

  // Title bar as first item — carries the block's page-break flag
  if (renderTitleBar) {
    const titleId = `${block.id}:title`;
    items.push({
      id: titleId,
      startOnNewPage: block.startOnNewPage,
      node: renderBlockTitle
        ? <>{renderBlockTitle(block)}</>
        : <DocumentBlockTitleBar label={block.sectionLabel} title={block.title} />,
    });

  }

  // Each structural row as its own flow item
  for (const structuralRow of structuralRows) {
    const firstItem = structuralRow.items[0];
    if (!firstItem) continue;

    // CONTENT ROW
    if (firstItem.type === "content-row" && structuralRow.items.length === 1) {
      const layoutRow = layoutRowsById.get(firstItem.rowId);
      if (!layoutRow) continue;
      const crId = `cr-${block.id}-${structuralRow.id}`;
      if (renderContentRow) {
        items.push({
          id: crId,
          node: (
            <div>
              {renderContentRow({
                layoutRow,
                conceptsById,
                imagesById,
                tablesById,
                applyConceptLayout,
              })}
            </div>
          ),
        });
      } else {
        items.push({
          id: crId,
          node: (
            <DocumentContentRow
              layoutRow={layoutRow}
              rowIndex={0}
              conceptsById={conceptsById}
              imagesById={imagesById}
              tablesById={tablesById}
              applyConceptLayout={applyConceptLayout}
              containerPresentation={block.conceptPresentation}
            />
          ),
        });
      }

      continue;
    }

    // SINGLE APARTADO
    if (firstItem.type === "apartado" && structuralRow.items.length === 1) {
      const subBlock = subBlocksById.get(firstItem.apartadoId);
      if (!subBlock || subBlock.enabled === false) continue;
      const apId = `ap-${block.id}-${structuralRow.id}`;
      items.push({
        id: apId,
        startOnNewPage: subBlock.startOnNewPage,
        node: (
          <DocumentApartado
            block={block}
            subBlock={subBlock}
            orderedApartados={orderedApartados}
            applyConceptLayout={applyConceptLayout}
            renderTitle={renderApartadoTitle}
            className="mt-1"
          />
        ),
      });
      continue;
    }

    // PAIRED APARTADOS — keep as one item (must stay side-by-side)
    if (firstItem.type === "apartado" && structuralRow.items.length === 2) {
      const item0 = structuralRow.items[0];
      const item1 = structuralRow.items[1];
      if (item0.type !== "apartado" || item1.type !== "apartado") continue;
      const sb1 = subBlocksById.get(item0.apartadoId);
      const sb2 = subBlocksById.get(item1.apartadoId);
      // For paired apartados, if EITHER requests a page break, the pair starts on a new page
      const pairedStartOnNewPage = Boolean(sb1?.startOnNewPage) || Boolean(sb2?.startOnNewPage);
      const pairId = `pair-${block.id}-${structuralRow.id}`;
      items.push({
        id: pairId,
        startOnNewPage: pairedStartOnNewPage,
        node: (
          <div className={`mt-1 grid grid-cols-2 gap-4 ${pairedApartadosClassName ?? ""}`}>
            {sb1 && sb1.enabled !== false ? (
              <DocumentApartado
                block={block}
                subBlock={sb1}
                orderedApartados={orderedApartados}
                applyConceptLayout={applyConceptLayout}
                renderTitle={renderApartadoTitle}
              />
            ) : null}
            {sb2 && sb2.enabled !== false ? (
              <DocumentApartado
                block={block}
                subBlock={sb2}
                orderedApartados={orderedApartados}
                applyConceptLayout={applyConceptLayout}
                renderTitle={renderApartadoTitle}
              />
            ) : null}
          </div>
        ),
      });
    }
  }

  return items;
}

/* ------------------------------------------------------------------ */
/*  DocumentContentRow — renders one ContentLayoutV2 row               */
/* ------------------------------------------------------------------ */

function DocumentContentRow({
  layoutRow,
  rowIndex,
  conceptsById,
  imagesById,
  tablesById,
  applyConceptLayout,
  containerPresentation,
}: {
  layoutRow: ContentLayoutRowV2;
  rowIndex: number;
  conceptsById: Map<string, Concept>;
  imagesById: Map<string, ImageContent>;
  tablesById: Map<string, TableContent>;
  applyConceptLayout: boolean;
  containerPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation;
}) {
  const theme = useDocumentTheme();
  const columnCount = layoutRow.columns.length;
  const gridClass = columnCount === 1
    ? "grid-cols-1"
    : columnCount === 2
      ? "grid-cols-2"
      : "grid-cols-3";

  // First row: current spacing; subsequent rows: tighter 1px margin
  const rowClassName = rowIndex === 0
    ? `${theme.contentRow} ${gridClass}`
    : `mt-[1px] grid ${gridClass}`;

  return (
    <div className={rowClassName}>
      {layoutRow.columns.map((column) => {
        const cellGuidePx = resolveCellConceptGuide(column.conceptPresentation, containerPresentation);
        return (
          <div key={column.id} className="min-w-0">
            {column.items.map((itemRef) => {
              if (itemRef.type === "concept") {
                const concept = conceptsById.get(itemRef.id);
                if (!concept || concept.enabled === false) return null;
                return (
                  <DocumentConceptCell
                    key={itemRef.id}
                    concept={concept}
                    applyConceptLayout={applyConceptLayout}
                    labelGuidePx={cellGuidePx}
                  />
                );
              }
              if (itemRef.type === "image") {
                const image = imagesById.get(itemRef.id);
                if (!image || image.enabled === false) return null;
                return (
                  <div className="my-4" key={itemRef.id}>
                    <DocumentImage image={image} />
                  </div>
                );
              }
              if (itemRef.type === "table") {
                const table = tablesById.get(itemRef.id);
                if (!table || table.enabled === false) return null;
                return <DocumentTable key={itemRef.id} table={table} variant="report" />;
              }
              return null;
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DocumentConceptCell — single concept in document layout            */
/* ------------------------------------------------------------------ */

function DocumentConceptCell({
  concept,
  applyConceptLayout,
  labelGuidePx,
}: {
  concept: Concept;
  applyConceptLayout: boolean;
  labelGuidePx?: number;
}) {
  const theme = useDocumentTheme();
  const layoutClass = applyConceptLayout && concept.layoutSpan === "full" ? "col-span-2" : "";
  const layoutStyle = applyConceptLayout
    ? { marginTop: concept.spacingBefore ?? 0, marginBottom: concept.spacingAfter ?? 0 }
    : undefined;

  // When a guide px is provided, override the theme grid with a fixed-pixel template
  const gridStyle = labelGuidePx != null
    ? { gridTemplateColumns: `${labelGuidePx}px minmax(0, 1fr)` }
    : undefined;

  return (
    <div
      className={`${theme.conceptRowGrid} ${layoutClass}`}
      style={gridStyle ? { ...layoutStyle, ...gridStyle } : layoutStyle}
    >
      <strong className={`${theme.conceptLabel} text-right`}>
        {formatConceptTitleWithColon(concept.label)}
      </strong>
      <span className={theme.conceptValue}>
        <DocumentConceptValue applyFormatting={applyConceptLayout} concept={concept} fallback="—" />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DocumentContentLayoutRenderer — shared layout renderer             */
/* ------------------------------------------------------------------ */

function DocumentContentLayoutRenderer({
  container,
  applyConceptLayout,
  containerPresentation,
}: {
  container: { concepts: Concept[]; images: ImageContent[]; tables: TableContent[]; contentLayout?: ContentLayout };
  applyConceptLayout: boolean;
  containerPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation;
}) {
  const resolvedLayout = resolveContentLayout(container);
  const conceptsById = new Map(container.concepts.map((c) => [c.id, c]));
  const imagesById = new Map(container.images.map((i) => [i.id, i]));
  const tablesById = new Map(container.tables.map((t) => [t.id, t]));

  return (
    <>
      {resolvedLayout.rows.map((layoutRow, rowIndex) => (
        <DocumentContentRow
          key={layoutRow.id}
          layoutRow={layoutRow}
          rowIndex={rowIndex}
          conceptsById={conceptsById}
          imagesById={imagesById}
          tablesById={tablesById}
          applyConceptLayout={applyConceptLayout}
          containerPresentation={containerPresentation}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  DocumentApartado — single apartado in document layout              */
/* ------------------------------------------------------------------ */

function DocumentApartado({
  block,
  subBlock,
  orderedApartados,
  applyConceptLayout,
  renderTitle,
  className,
}: {
  block: Block;
  subBlock: Apartado;
  orderedApartados: Apartado[];
  applyConceptLayout: boolean;
  renderTitle?: (block: Block, subBlock: Apartado, displayLabel: string) => React.ReactNode;
  className?: string;
}) {
  const theme = useDocumentTheme();
  const displayLabel = formatVisibleChildLabel(block.sectionLabel, orderedApartados, subBlock.id);
  const isTechnicalList = subBlock.presentationMode === "technical-list";

  return (
    <section className={cn("pl-3", className)}>
      {renderTitle
        ? <>{renderTitle(block, subBlock, displayLabel)}</>
        : <h3 className={theme.apartadoTitle}>{displayLabel} {subBlock.title}</h3>
      }
      <div className={theme.apartadoRule} aria-hidden="true" />
      {isTechnicalList ? (
        <DocumentTechnicalList
          container={subBlock}
          applyConceptLayout={applyConceptLayout}
          containerPresentation={subBlock.conceptPresentation}
        />
      ) : (
        <DocumentContentLayoutRenderer
          container={subBlock}
          applyConceptLayout={applyConceptLayout}
          containerPresentation={subBlock.conceptPresentation}
        />
      )}
    </section>
  );
}
