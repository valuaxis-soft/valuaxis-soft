import { useMemo, type ReactNode } from "react";
import type { AppSection, TableContent } from "../model";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";
import { ensureTableV2 } from "../services/table";
import {
  AutoPaginatedDocumentFlow,
  computeDocumentLayoutKey,
} from "./document-preview-page";
import { documentBlockFlowItems } from "./document-block-renderer";

const CONSTRUCTION_TABLE_HEADER = "#BDD7EE";
const CONSTRUCTION_EMPTY_ROW = "#D9D9D9";

export function isConstruccionSection(section: AppSection) {
  return section.id === "construccion" || getCanonicalSectionKey(section.id) === "CONSTRUCCION";
}

export function ConstruccionPreview({
  header,
  section,
}: {
  header: ReactNode;
  section: AppSection;
}) {
  const theme = useDocumentTheme();
  const visibleBlocks = section.blocks.filter((block) => block.enabled);
  const items = visibleBlocks.flatMap((block) =>
    documentBlockFlowItems(block, {
      renderContentRow: (props) => <ConstructionContentRow {...props} />,
    }),
  );
  const contentLayoutKey = useMemo(() => computeDocumentLayoutKey(section), [section]);

  return (
    <AutoPaginatedDocumentFlow
      contentClassName={`${theme.sectionGap} ${theme.pagePadding} text-[#222]`}
      contentProps={{ "data-construccion-preview": true }}
      contentLayoutKey={contentLayoutKey}
      contentStyle={{ fontFamily: "Arial, Calibri, sans-serif" }}
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
  conceptsById,
  imagesById,
  tablesById,
  applyConceptLayout,
}: {
  layoutRow: { columns: Array<{ id: string; items: Array<{ type: string; id: string }> }> };
  conceptsById: Map<string, { id: string; enabled?: boolean; label: string; layoutSpan?: string; spacingBefore?: number; spacingAfter?: number }>;
  imagesById: Map<string, { id: string; enabled?: boolean }>;
  tablesById: Map<string, TableContent>;
  applyConceptLayout: boolean;
}) {
  const theme = useDocumentTheme();
  const columnCount = layoutRow.columns.length;
  const gridClass = columnCount === 1
    ? "grid-cols-1"
    : columnCount === 2
      ? "grid-cols-2"
      : "grid-cols-3";

  return (
    <div className={`${theme.contentRow} ${gridClass}`}>
      {layoutRow.columns.map((column) => (
        <div key={column.id} className="min-w-0">
          {column.items.map((itemRef) => {
            // Tables use ConstructionTable; concepts/images fall through to default
            if (itemRef.type === "table") {
              const table = tablesById.get(itemRef.id);
              if (!table || table.enabled === false) return null;
              return <ConstructionTable key={itemRef.id} table={table} />;
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Construction table (retains custom styling)                        */
/* ------------------------------------------------------------------ */

function ConstructionTable({ table }: { table: TableContent }) {
  if (table.enabled === false) return null;

  const t2 = ensureTableV2(table);
  const columns = t2.columns.length ? t2.columns : [{ id: "__empty", name: "" }];

  return (
    <div className="mt-1 overflow-hidden">
      <table className="w-full border-collapse table-layout-fixed text-[9.5px] leading-tight text-[#222]">
        <colgroup>
          {columns.map((column) => (
            <col key={`${table.id}-col-${column.id}`} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className="border border-[#7F7F7F] px-1 py-1 text-center font-black text-wrap break-words whitespace-normal"
                key={`${table.id}-head-${column.id}`}
                style={{ backgroundColor: CONSTRUCTION_TABLE_HEADER }}
              >
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t2.rows.map((row, rowIndex) => {
            const emptyVisualRow = columns.every((col) => {
              const cell = row.cells[col.id];
              return !cell || (cell.kind === "value" && !String(cell.value ?? "").trim());
            });
            return (
              <tr
                key={`${table.id}-row-${row.id}`}
                style={{ backgroundColor: emptyVisualRow ? CONSTRUCTION_EMPTY_ROW : "white" }}
              >
                {columns.map((column) => {
                  const cell = row.cells[column.id];
                  const value = cell?.kind === "value" ? cell.value : "";
                  return (
                    <td
                      className="border border-[#7F7F7F] px-1 py-0.5 align-top text-wrap break-words whitespace-normal"
                      key={`${table.id}-cell-${row.id}-${column.id}`}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
