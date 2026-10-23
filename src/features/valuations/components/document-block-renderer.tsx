"use client";

import type { Block, Concept, ImageContent, Apartado, TableContent, ContentLayoutRowV2 } from "@/features/valuations/model";
import { resolveBlockFlowV2 } from "@/features/valuations/services/block-flow";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { formatVisibleChildLabel, getBlockFlowApartadoOrder } from "@/features/valuations/services/visible-numbering";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";
import { formatConceptTitleWithColon } from "@/features/valuations/services/concept-title";
import { labelGuideColumns, resolveCellConceptGuide } from "@/features/valuations/services/concept-presentation";
import { isLongTextList } from "@/features/valuations/services/document-long-text";
import { MIN_ROWS_BEFORE_BREAK, MIN_ROWS_WITH_TAIL, type DocumentTableFragment } from "@/features/valuations/services/table-pagination";
import { cn } from "@/lib/utils";
import { DocumentConceptValue } from "./document-concept-value";
import { DocumentParagraph, conceptSpacingStyle } from "./document-paragraph";
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
      /** The rows to print of the row's table, when it breaks across pages. */
      tableFragment?: DocumentTableFragment;
    }) => React.ReactNode;
  renderApartadoTitle?: (block: Block, subBlock: Apartado, displayLabel: string) => React.ReactNode;
    /**
     * Prints an apartado in a format of its own: `node` stands for its title
     * and whatever it prints itself, and `rows` are the content rows left,
     * printed after it like those of any apartado. Null prints it as usual.
     */
    renderApartadoHead?: (subBlock: Apartado, displayLabel: string) => ApartadoHead | null;
    pairedApartadosClassName?: string;
  },
): DocumentFlowItem[] {
  const applyConceptLayout = options?.applyConceptLayout ?? false;
  const renderTitleBar = options?.renderTitleBar ?? true;
  const renderBlockTitle = options?.renderBlockTitle;
  const renderContentRow = options?.renderContentRow;
  const renderApartadoTitle = options?.renderApartadoTitle;
  const pairedApartadosClassName = options?.pairedApartadosClassName;
  const renderApartadoHead = options?.renderApartadoHead;
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
  const apartadoHead = (subBlock: Apartado) =>
    renderApartadoHead?.(subBlock, formatVisibleChildLabel(block.sectionLabel, orderedApartados, subBlock.id)) ?? null;
  const renderPairedApartado = (subBlock: Apartado) => {
    const head = apartadoHead(subBlock);
    if (head) {
      return (
        <section>
          {head.node}
          <ApartadoContentRows subBlock={subBlock} rows={head.rows} firstRowIndex={1} applyConceptLayout={applyConceptLayout} />
        </section>
      );
    }
    return (
      <DocumentApartado
        block={block}
        subBlock={subBlock}
        orderedApartados={orderedApartados}
        applyConceptLayout={applyConceptLayout}
        renderTitle={renderApartadoTitle}
      />
    );
  };

  const items: DocumentFlowItem[] = [];
  // What the item before is: the rows right under the title, or one after
  // another, sit as close as the rows of an apartado do.
  let previous: "title" | "content" | "apartado" | null = null;
  let directRowIndex = 0;

  // Title bar as first item — carries the block's page-break flag and never
  // stays alone at the foot of a page.
  if (renderTitleBar) {
    const titleId = `${block.id}:title`;
    previous = "title";
    items.push({
      id: titleId,
      startOnNewPage: block.startOnNewPage,
      keepWithNext: true,
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
      // A row whose every item is hidden prints nothing, not even its room.
      if (!layoutRow || !hasVisibleItems(layoutRow, block)) continue;
      const rowIndex = previous === "content" ? directRowIndex + 1 : 0;
      const continuesPrevious = previous === "title" || previous === "content" ? true : undefined;
      directRowIndex = rowIndex;
      previous = "content";
      const crId = `cr-${block.id}-${structuralRow.id}`;
      const splits = holdsOnlyATable(layoutRow, block);
      const renderRow = renderContentRow
        ? (tableFragment?: DocumentTableFragment) => (
          <div>
            {renderContentRow({
              layoutRow,
              conceptsById,
              imagesById,
              tablesById,
              applyConceptLayout,
              tableFragment,
            })}
          </div>
        )
        : (tableFragment?: DocumentTableFragment) => (
          <DocumentContentRow
            layoutRow={layoutRow}
            rowIndex={rowIndex}
            conceptsById={conceptsById}
            imagesById={imagesById}
            tablesById={tablesById}
            applyConceptLayout={applyConceptLayout}
            containerPresentation={block.conceptPresentation}
            longText={blockLongText}
            tableFragment={tableFragment}
          />
        );
      items.push({ id: crId, continuesPrevious, node: renderRow(), renderTableFragment: splits ? renderRow : undefined });

      continue;
    }

    // SINGLE APARTADO — its title travels with its first row; every further
    // row is its own item, so a long apartado continues on the next page
    // instead of being cut at the end of this one.
    if (firstItem.type === "apartado" && structuralRow.items.length === 1) {
      const subBlock = subBlocksById.get(firstItem.apartadoId);
      if (!subBlock || subBlock.enabled === false || holdsOnlyHiddenTables(subBlock)) continue;
      const apId = `ap-${block.id}-${structuralRow.id}`;
      // The first apartado sits right under the block's title bar.
      const underTitle = previous === "title" ? true : undefined;
      previous = "apartado";
      const head = apartadoHead(subBlock);
      if (head) {
        const renderHeadRow = (layoutRow: ContentLayoutRowV2, rowIndex: number, tableFragment?: DocumentTableFragment) => (
          <ApartadoContentRows
            subBlock={subBlock}
            rows={[layoutRow]}
            firstRowIndex={rowIndex}
            applyConceptLayout={applyConceptLayout}
            tableFragment={tableFragment}
          />
        );
        items.push({ id: apId, startOnNewPage: subBlock.startOnNewPage, continuesPrevious: underTitle, keepWithNext: head.rows.length > 0, node: head.node });
        head.rows.forEach((layoutRow, index) => {
          items.push({
            id: `${apId}:${layoutRow.id}`,
            continuesPrevious: true,
            node: renderHeadRow(layoutRow, index + 1),
            renderTableFragment: holdsOnlyATable(layoutRow, subBlock)
              ? (tableFragment) => renderHeadRow(layoutRow, index + 1, tableFragment)
              : undefined,
          });
        });
        continue;
      }
      const apartadoRows = subBlock.presentationMode === "technical-list"
        ? []
        : resolveContentLayout(subBlock).rows.filter((layoutRow) => hasVisibleItems(layoutRow, subBlock));
      const renderFurtherRow = (layoutRow: ContentLayoutRowV2, rowIndex: number, tableFragment?: DocumentTableFragment) => (
        <DocumentApartadoRows
          subBlock={subBlock}
          rows={[layoutRow]}
          firstRowIndex={rowIndex}
          applyConceptLayout={applyConceptLayout}
          tableFragment={tableFragment}
        />
      );
      // The title stays with the first rows of a table that breaks; its continuations print without it.
      const renderTitledRow = (tableFragment?: DocumentTableFragment) => tableFragment?.continuation
        ? renderFurtherRow(apartadoRows[0], 0, tableFragment)
        : (
          <DocumentApartado
            block={block}
            subBlock={subBlock}
            orderedApartados={orderedApartados}
            applyConceptLayout={applyConceptLayout}
            renderTitle={renderApartadoTitle}
            rows={apartadoRows.length ? apartadoRows.slice(0, 1) : undefined}
            tableFragment={tableFragment}
            className="mt-1"
          />
        );
      items.push({
        id: apId,
        startOnNewPage: subBlock.startOnNewPage,
        continuesPrevious: underTitle,
        node: renderTitledRow(),
        renderTableFragment: apartadoRows.length && holdsOnlyATable(apartadoRows[0], subBlock) ? renderTitledRow : undefined,
      });
      apartadoRows.slice(1).forEach((layoutRow, index) => {
        items.push({
          id: `${apId}:${layoutRow.id}`,
          continuesPrevious: true,
          node: renderFurtherRow(layoutRow, index + 1),
          renderTableFragment: holdsOnlyATable(layoutRow, subBlock)
            ? (tableFragment) => renderFurtherRow(layoutRow, index + 1, tableFragment)
            : undefined,
        });
      });
      continue;
    }

    // PAIRED APARTADOS — keep as one item (must stay side-by-side)
    if (firstItem.type === "apartado" && structuralRow.items.length === 2) {
      const item0 = structuralRow.items[0];
      const item1 = structuralRow.items[1];
      if (item0.type !== "apartado" || item1.type !== "apartado") continue;
      const shown = (subBlock: Apartado | undefined) =>
        subBlock && subBlock.enabled !== false && !holdsOnlyHiddenTables(subBlock) ? subBlock : undefined;
      const sb1 = shown(subBlocksById.get(item0.apartadoId));
      const sb2 = shown(subBlocksById.get(item1.apartadoId));
      if (!sb1 && !sb2) continue;
      const underTitle = previous === "title" ? true : undefined;
      previous = "apartado";
      // For paired apartados, if EITHER requests a page break, the pair starts on a new page
      const pairedStartOnNewPage = Boolean(sb1?.startOnNewPage) || Boolean(sb2?.startOnNewPage);
      const pairId = `pair-${block.id}-${structuralRow.id}`;
      items.push({
        id: pairId,
        startOnNewPage: pairedStartOnNewPage,
        continuesPrevious: underTitle,
        node: (
          <div className={`mt-1 grid grid-cols-2 gap-4 ${pairedApartadosClassName ?? ""}`}>
            {sb1 ? renderPairedApartado(sb1) : null}
            {sb2 ? renderPairedApartado(sb2) : null}
          </div>
        ),
      });
    }
  }

  return items;
}

/** An apartado printed in a format of its own; see `renderApartadoHead`. */
export type ApartadoHead = { node: React.ReactNode; rows: ContentLayoutRowV2[] };

/**
 * The row is one table and nothing else, long enough to break across pages:
 * its item may be split by rows. Tables side by side, or sharing a row with
 * concepts or images, stay whole.
 */
type ContentContainer = Pick<Block, "concepts" | "images" | "tables">;

/** The items of the row that print: the ones that exist and are not hidden. */
function visibleRowItems(layoutRow: ContentLayoutRowV2, container: ContentContainer, columns = layoutRow.columns) {
  const shown = (list: Array<{ id: string; enabled?: boolean }>, id: string) => list.some((entry) => entry.id === id && entry.enabled !== false);
  return columns.flatMap((column) => column.items).filter((itemRef) =>
    shown(itemRef.type === "concept" ? container.concepts : itemRef.type === "image" ? container.images : container.tables, itemRef.id));
}

function hasVisibleItems(layoutRow: ContentLayoutRowV2, container: ContentContainer): boolean {
  return visibleRowItems(layoutRow, container).length > 0;
}

/**
 * An apartado that holds tables and nothing else, every one of them hidden:
 * its title belongs to the tables, so it does not print either.
 */
function holdsOnlyHiddenTables(subBlock: Apartado): boolean {
  if (!subBlock.tables.length) return false;
  return [...subBlock.concepts, ...subBlock.images, ...subBlock.tables].every((entry) => entry.enabled === false);
}

function holdsOnlyATable(layoutRow: ContentLayoutRowV2, container: ContentContainer): boolean {
  if (layoutRow.columns.length !== 1) return false;
  const visible = visibleRowItems(layoutRow, container);
  if (visible.length !== 1 || visible[0].type !== "table") return false;
  const table = container.tables.find((entry) => entry.id === visible[0].id);
  return (table?.rows.length ?? 0) >= MIN_ROWS_BEFORE_BREAK + MIN_ROWS_WITH_TAIL;
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
  tableFragment,
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
  /** The rows to print of the row's table, when it breaks across pages. */
  tableFragment?: DocumentTableFragment;
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
    // The continuation of a table opens its page: no room above it.
    tableFragment?.continuation ? "grid" : rowIndex === 0 ? theme.contentRow : holdsTable ? "mt-2.5 grid" : "mt-[1px] grid",
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
                if (concept.type === "paragraph") {
                  return <DocumentParagraph key={itemRef.id} concept={concept} longText={longText} style={conceptSpacingStyle(concept)} />;
                }
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
                return <DocumentTable key={itemRef.id} table={table} variant="report" fragment={tableFragment} />;
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
  // The room the appraiser gives a concept ("Espacio") prints in every section and layout.
  const layoutStyle = conceptSpacingStyle(concept);

  // When a guide px is provided, override the theme grid with a fixed-pixel template
  const gridStyle = labelGuidePx != null
    ? { gridTemplateColumns: labelGuideColumns(labelGuidePx) }
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
  tableFragment,
}: {
  subBlock: Apartado;
  rows: ContentLayoutRowV2[];
  firstRowIndex: number;
  applyConceptLayout: boolean;
  tableFragment?: DocumentTableFragment;
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
          tableFragment={tableFragment}
        />
      ))}
    </>
  );
}

/** Rows of an apartado that follow the item carrying its title, flush with it. */
function DocumentApartadoRows(props: {
  subBlock: Apartado;
  rows: ContentLayoutRowV2[];
  firstRowIndex: number;
  applyConceptLayout: boolean;
  tableFragment?: DocumentTableFragment;
}) {
  return (
    <div>
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
  tableFragment,
  className,
}: {
  block: Block;
  subBlock: Apartado;
  orderedApartados: Apartado[];
  applyConceptLayout: boolean;
  renderTitle?: (block: Block, subBlock: Apartado, displayLabel: string) => React.ReactNode;
  /** The rows printed under the title; every row of the apartado when omitted. */
  rows?: ContentLayoutRowV2[];
  /** The rows to print of the table of its only row, when it breaks across pages. */
  tableFragment?: DocumentTableFragment;
  className?: string;
}) {
  // A title that carries its own letter ("A) TERRENO EN ESTUDIO") is not numbered again.
  const displayLabel = /^[A-Z]\)\s/.test(subBlock.title.trim())
    ? ""
    : formatVisibleChildLabel(block.sectionLabel, orderedApartados, subBlock.id);
  const isTechnicalList = subBlock.presentationMode === "technical-list";

  return (
    // No indent: every apartado title starts at the left edge of the block's
    // title bar, like those of a format of their own (medidas y colindancias).
    <section className={className}>
      {renderTitle
        ? <>{renderTitle(block, subBlock, displayLabel)}</>
        : <DocumentApartadoTitle>{[displayLabel, subBlock.title].filter(Boolean).join(" ")}</DocumentApartadoTitle>
      }
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
          tableFragment={tableFragment}
        />
      )}
    </section>
  );
}

/** The title of an apartado, with its rule: the same in every section and for every kind of content. */
export function DocumentApartadoTitle({ children }: { children: React.ReactNode }) {
  const theme = useDocumentTheme();
  return <h3 className={theme.apartadoTitle}>{children}</h3>;
}
