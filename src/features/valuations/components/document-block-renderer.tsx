"use client";

import type { Block, Concept, ImageContent, Apartado, TableContent, ContentLayoutRowV2 } from "@/features/valuations/model";
import { resolveBlockFlowV2 } from "@/features/valuations/services/block-flow";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { formatVisibleChildLabel, getBlockFlowApartadoOrder } from "@/features/valuations/services/visible-numbering";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";
import { formatConceptTitleWithColon } from "@/features/valuations/services/concept-title";
import { resolveCellConceptGuide } from "@/features/valuations/services/concept-presentation";
import { isLongTextList } from "@/features/valuations/services/document-long-text";
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
  const blockLongText = isLongTextList(block.concepts);

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
              longText={blockLongText}
            />
          ),
        });
      }

      continue;
    }

    // SINGLE APARTADO — its title travels with its first row; every further
    // row is its own item, so a long apartado continues on the next page
    // instead of being cut at the end of this one.
    if (firstItem.type === "apartado" && structuralRow.items.length === 1) {
      const subBlock = subBlocksById.get(firstItem.apartadoId);
      if (!subBlock || subBlock.enabled === false) continue;
      const apId = `ap-${block.id}-${structuralRow.id}`;
      const apartadoRows = subBlock.presentationMode === "technical-list" ? [] : resolveContentLayout(subBlock).rows;
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
            rows={apartadoRows.length ? apartadoRows.slice(0, 1) : undefined}
            className="mt-1"
          />
        ),
      });
      apartadoRows.slice(1).forEach((layoutRow, index) => {
        items.push({
          id: `${apId}:${layoutRow.id}`,
          continuesPrevious: true,
          node: (
            <DocumentApartadoRows
              subBlock={subBlock}
              rows={[layoutRow]}
              firstRowIndex={index + 1}
              applyConceptLayout={applyConceptLayout}
            />
          ),
        });
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
  longText,
}: {
  layoutRow: ContentLayoutRowV2;
  rowIndex: number;
  conceptsById: Map<string, Concept>;
  imagesById: Map<string, ImageContent>;
  tablesById: Map<string, TableContent>;
  applyConceptLayout: boolean;
  containerPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation;
  /** The container reads as prose: its concepts print a little larger. */
  longText: boolean;
}) {
  const theme = useDocumentTheme();
  const columnCount = layoutRow.columns.length;
  const gridClass = columnCount === 1
    ? "grid-cols-1"
    : columnCount === 2
      ? "grid-cols-2"
      : "grid-cols-3";

  // Concepts side by side share one rule under the whole row, so it stays
  // level whatever the height of each; a concept alone in its row carries its own.
  const visibleItems = layoutRow.columns.flatMap((column) => column.items).filter((itemRef) =>
    itemRef.type === "concept"
      ? conceptsById.get(itemRef.id)?.enabled !== false && conceptsById.has(itemRef.id)
      : itemRef.type === "image"
        ? imagesById.get(itemRef.id)?.enabled !== false && imagesById.has(itemRef.id)
        : tablesById.get(itemRef.id)?.enabled !== false && tablesById.has(itemRef.id),
  );
  const sharedRule = columnCount > 1 && visibleItems.length > 0 && visibleItems.every((itemRef) => itemRef.type === "concept");

  // First row: current spacing; subsequent rows: tighter 1px margin, or room
  // above a table so it does not touch the table or the concepts before it.
  const holdsTable = visibleItems.some((itemRef) => itemRef.type === "table");
  const rowClassName = cn(
    rowIndex === 0 ? theme.contentRow : holdsTable ? "mt-2.5 grid" : "mt-[1px] grid",
    gridClass,
    columnCount > 1 && "gap-x-4",
    sharedRule && theme.conceptRule,
  );

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
                    longText={longText}
                    ruled={!sharedRule}
                  />
                );
              }
              if (itemRef.type === "image") {
                const image = imagesById.get(itemRef.id);
                if (!image || image.enabled === false) return null;
                // Images sharing a row (location sketches) print as a compact framed pair.
                return (
                  <div className={columnCount > 1 ? "my-1" : "my-4"} key={itemRef.id}>
                    <DocumentImage image={image} sideBySide={columnCount > 1} />
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
  longText,
  ruled,
}: {
  concept: Concept;
  applyConceptLayout: boolean;
  labelGuidePx?: number;
  longText: boolean;
  /** Carries its own hairline; false when the row draws one for all its concepts. */
  ruled: boolean;
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
      className={cn(theme.conceptRowGrid, theme.conceptRow, ruled && theme.conceptRule, longText && theme.longTextRow, layoutClass)}
      style={gridStyle ? { ...layoutStyle, ...gridStyle } : layoutStyle}
    >
      <strong className={cn(theme.conceptLabel, "text-right", longText && theme.longText)}>
        {formatConceptTitleWithColon(concept.label)}
      </strong>
      <span className={cn(theme.conceptValue, longText && theme.longText)}>
        <DocumentConceptValue concept={concept} fallback="—" />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DocumentApartadoRows — content rows of one apartado                */
/* ------------------------------------------------------------------ */

function ApartadoContentRows({
  subBlock,
  rows,
  firstRowIndex,
  applyConceptLayout,
}: {
  subBlock: Apartado;
  rows: ContentLayoutRowV2[];
  firstRowIndex: number;
  applyConceptLayout: boolean;
}) {
  const conceptsById = new Map(subBlock.concepts.map((c) => [c.id, c]));
  const imagesById = new Map(subBlock.images.map((i) => [i.id, i]));
  const tablesById = new Map(subBlock.tables.map((t) => [t.id, t]));
  const longText = isLongTextList(subBlock.concepts);

  return (
    <>
      {rows.map((layoutRow, index) => (
        <DocumentContentRow
          key={layoutRow.id}
          layoutRow={layoutRow}
          rowIndex={firstRowIndex + index}
          conceptsById={conceptsById}
          imagesById={imagesById}
          tablesById={tablesById}
          applyConceptLayout={applyConceptLayout}
          containerPresentation={subBlock.conceptPresentation}
          longText={longText}
        />
      ))}
    </>
  );
}

/** Rows of an apartado that follow the item carrying its title, indented like it. */
function DocumentApartadoRows(props: {
  subBlock: Apartado;
  rows: ContentLayoutRowV2[];
  firstRowIndex: number;
  applyConceptLayout: boolean;
}) {
  return (
    <div className="pl-3">
      <ApartadoContentRows {...props} />
    </div>
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
  rows,
  className,
}: {
  block: Block;
  subBlock: Apartado;
  orderedApartados: Apartado[];
  applyConceptLayout: boolean;
  renderTitle?: (block: Block, subBlock: Apartado, displayLabel: string) => React.ReactNode;
  /** The rows printed under the title; every row of the apartado when omitted. */
  rows?: ContentLayoutRowV2[];
  className?: string;
}) {
  const theme = useDocumentTheme();
  // A title that carries its own letter ("A) TERRENO EN ESTUDIO") is not numbered again.
  const displayLabel = /^[A-Z]\)\s/.test(subBlock.title.trim())
    ? ""
    : formatVisibleChildLabel(block.sectionLabel, orderedApartados, subBlock.id);
  const isTechnicalList = subBlock.presentationMode === "technical-list";

  return (
    <section className={cn("pl-3", className)}>
      {renderTitle
        ? <>{renderTitle(block, subBlock, displayLabel)}</>
        : <h3 className={theme.apartadoTitle}>{[displayLabel, subBlock.title].filter(Boolean).join(" ")}</h3>
      }
      <div className={theme.apartadoRule} aria-hidden="true" />
      {isTechnicalList ? (
        <DocumentTechnicalList
          container={subBlock}
          containerPresentation={subBlock.conceptPresentation}
        />
      ) : (
        <ApartadoContentRows
          subBlock={subBlock}
          rows={rows ?? resolveContentLayout(subBlock).rows}
          firstRowIndex={0}
          applyConceptLayout={applyConceptLayout}
        />
      )}
    </section>
  );
}
