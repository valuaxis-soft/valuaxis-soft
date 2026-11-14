import { useMemo, type ReactNode } from "react";
import type { AppSection, TableContent } from "../model";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";
import { captureKindOf, isCaptureMarked } from "../calculation/construction-capture";
import { ensureTableV2, tablePrintLayout } from "../services/table";
import type { DocumentTableFragment } from "../services/table-pagination";
import {
  AutoPaginatedDocumentFlow,
  computeDocumentLayoutKey,
  type DocumentFlowItem,
} from "./document-preview-page";
import { documentBlockFlowItems } from "./document-block-renderer";
import { DocumentTable } from "./document-table";

export function isConstruccionSection(section: AppSection) {
  return section.id === "construccion" || getCanonicalSectionKey(section.id) === "CONSTRUCCION";
}

const CONSTRUCTION_TEXT_CLASS = "text-[#222]";
const CONSTRUCTION_FONT = { fontFamily: "Arial, Calibri, sans-serif" };

/** The printed items of the construction section, with its own tables. */
export function construccionFlowItems(section: AppSection): DocumentFlowItem[] {
  return section.blocks
    .filter((block) => block.enabled)
    .flatMap((block) => documentBlockFlowItems(block, {
      renderContentRow: (props) => <ConstructionContentRow {...props} />,
    }));
}

/**
 * The same items printed after another section, on its pages: each carries
 * the type and color the section's own pages give their content.
 */
export function construccionFlowItemsInFlow(section: AppSection): DocumentFlowItem[] {
  const styled = (node: ReactNode) => <div className={CONSTRUCTION_TEXT_CLASS} style={CONSTRUCTION_FONT}>{node}</div>;
  return construccionFlowItems(section).map((item) => ({
    ...item,
    node: styled(item.node),
    ...(item.renderTableFragment ? { renderTableFragment: (fragment: DocumentTableFragment) => styled(item.renderTableFragment!(fragment)) } : {}),
  }));
}

export function ConstruccionPreview({
  header,
  section,
}: {
  header: ReactNode;
  section: AppSection;
}) {
  const theme = useDocumentTheme();
  const items = construccionFlowItems(section);
  const contentLayoutKey = useMemo(() => computeDocumentLayoutKey(section), [section]);

  return (
    <AutoPaginatedDocumentFlow
      contentClassName={`${theme.sectionGap} ${theme.pagePadding} ${CONSTRUCTION_TEXT_CLASS}`}
      contentProps={{ "data-construccion-preview": true }}
      contentLayoutKey={contentLayoutKey}
      contentStyle={CONSTRUCTION_FONT}
      header={header}
      items={items}
      pageKeyPrefix="construccion"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Construction-specific content row (tables use custom renderer)     */
/* ------------------------------------------------------------------ */

function ConstructionContentRow({
  layoutRow,
  tablesById,
  tableFragment,
}: {
  layoutRow: { columns: Array<{ id: string; items: Array<{ type: string; id: string }> }> };
  conceptsById: Map<string, { id: string; enabled?: boolean; label: string; layoutSpan?: string; spacingBefore?: number; spacingAfter?: number }>;
  imagesById: Map<string, { id: string; enabled?: boolean }>;
  tablesById: Map<string, TableContent>;
  applyConceptLayout: boolean;
  tableFragment?: DocumentTableFragment;
}) {
  const theme = useDocumentTheme();
  const columnCount = layoutRow.columns.length;
  const gridClass = columnCount === 1
    ? "grid-cols-1"
    : columnCount === 2
      ? "grid-cols-2"
      : "grid-cols-3";

  // A table with "Espacio antes" takes exactly that room above it, as in every section.
  const tableSetsRoom = layoutRow.columns.some((column) => column.items.some((itemRef) => {
    const table = itemRef.type === "table" ? tablesById.get(itemRef.id) : undefined;
    return table !== undefined && table.enabled !== false && tablePrintLayout(ensureTableV2(table)).spacingBefore !== undefined;
  }));

  return (
    // The continuation of a table opens its page: no room above it.
    <div className={`${tableFragment?.continuation || tableSetsRoom ? "grid" : theme.contentRow} ${gridClass}`}>
      {layoutRow.columns.map((column) => (
        <div key={column.id} className="min-w-0">
          {column.items.map((itemRef) => {
            // Tables use ConstructionTable; concepts/images fall through to default
            if (itemRef.type === "table") {
              const table = tablesById.get(itemRef.id);
              if (!table || table.enabled === false) return null;
              return <ConstructionTable key={itemRef.id} table={table} fragment={tableFragment} />;
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Construction table                                                 */
/* ------------------------------------------------------------------ */

/**
 * A table of the construction section prints as every table of the
 * dictamen (video 5.3: «tal como se ve»): its headers renamed and combined,
 * its hidden columns and rows left out, the columns of the appraiser and
 * the results of its formulas. The construction types and installations
 * tables saved before they were the capture never printed their title (the
 * subbloque already says it): they still do not.
 */
function ConstructionTable({ table, fragment }: { table: TableContent; fragment?: DocumentTableFragment }) {
  if (table.enabled === false) return null;
  const legacyCapture = captureKindOf(table) !== null && !isCaptureMarked(table);
  return <DocumentTable table={legacyCapture ? withoutCaption(table) : table} variant="report" fragment={fragment} />;
}

function withoutCaption(table: TableContent): TableContent {
  const v2 = ensureTableV2(table);
  return { ...v2, schema: { ...(v2.schema ?? { zones: [] }), hideCaption: true } } as unknown as TableContent;
}
