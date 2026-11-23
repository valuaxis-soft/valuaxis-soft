"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import {
  MAX_EXTRA_COLUMNS,
  editGeneratedTable,
  layoutOf,
  sourceOf,
  summaryCaptionKey,
  summaryRowKey,
  withBoxLabel,
  applyTableLayout,
} from "@/features/valuations/calculation/generated-table-layout";
import type { TableContent } from "@/features/valuations/model";
import { appendTableColumn, ensureTableV2, insertTableRow, type TableV2 } from "@/features/valuations/services/table";
import { CommitCell } from "../calculation/commit-cell";
import { CALCULATED_CELL_HINT, CalculatedTableProvider, type CalculatedTableLock } from "./calculated-table-context";
import { CaptureSlotTarget, useCaptureDeclared, useCaptureStore } from "./capture-host";
import { TableEditorItem } from "./table-editor";

const asContent = (table: TableV2) => ({ ...table, version: 2 }) as unknown as TableContent;

/**
 * A table the calculation writes, in the editor as any configurable table
 * (video 5.3): the same grid, right-click menus and "Formato de la tabla".
 * The appraiser renames and groups its headers, hides, moves and formats its
 * columns and adds columns and rows of his own (text or formulas); the
 * figures of the calculation show in gray and are changed in its panel. Every
 * edit becomes the table's layout (`editGeneratedTable`), so the next
 * calculation writes the table again with all of it.
 */
export function GeneratedTableEditor(props: {
  table: TableContent;
  readOnly: boolean;
  /** Its blank cells are the capture of its calculation. */
  capture?: boolean;
  onUpdate: (updater: (table: TableContent) => TableContent) => void;
}) {
  const source = useMemo(() => sourceOf(props.table), [props.table]);
  const lock = useMemo<CalculatedTableLock>(() => {
    const rows = new Set(source.rows.map((row) => row.id));
    const columns = new Set(source.columns.map((column) => column.id));
    const places = new Map(source.columns.map((column, index) => [column.id, index]));
    return { row: (id) => rows.has(id), column: (id) => columns.has(id), ...(props.capture ? { inPlace: true, columnPlace: (id: string) => places.get(id) ?? -1 } : {}) };
  }, [source, props.capture]);
  const captureStore = useCaptureStore();
  const edit = (change: (table: TableContent) => TableContent) => props.onUpdate((current) => {
    const next = editGeneratedTable(current, change);
    // A header whose name is the calculation's (a factor of the homologation): the calculation takes the new name
    // and prints it everywhere (the annex, the memory), and the table keeps no label of its own over it.
    const naming = captureStore?.headerRename(source.id);
    if (!naming) return next;
    const before = layoutOf(current).labels ?? {};
    const after = layoutOf(next).labels ?? {};
    const taken = Object.keys(after).filter((id) => after[id] !== before[id] && after[id].trim() && naming.handles(id));
    if (!taken.length) return next;
    for (const id of taken) queueMicrotask(() => naming.rename(id, after[id].trim()));
    const labels = Object.fromEntries(Object.entries(after).filter(([id]) => !taken.includes(id)));
    return applyTableLayout(sourceOf(next), { ...layoutOf(next), labels });
  });
  const addColumn = () => {
    if ((layoutOf(props.table).extraColumns?.length ?? 0) >= MAX_EXTRA_COLUMNS) {
      toast.info(`Una tabla del cálculo lleva hasta ${MAX_EXTRA_COLUMNS} columnas propias.`);
      return;
    }
    edit((current) => asContent(appendTableColumn(ensureTableV2(current))));
  };

  return (
    <CalculatedTableProvider value={lock}>
      <div className="min-w-0" data-generated-table={source.id}>
        <TableEditorItem
          table={props.table}
          readOnly={props.readOnly}
          onUpdate={(_, change) => edit(change)}
          onAddColumn={addColumn}
          onAddRow={() => edit((current) => {
            const table = ensureTableV2(current);
            return asContent(insertTableRow(table, table.rows.length));
          })}
          // The calculation writes the table: it is hidden with its block, never removed here.
          onRemove={() => undefined}
          footer={(
            <>
              {/* Under the grid, what the calculation's capture adds to the table (a row more). */}
              <CaptureSlotTarget address={{ table: source.id, part: "footer" }} className="mt-2 flex flex-wrap items-center gap-2 empty:hidden" />
              <GeneratedBoxLabels table={props.table} readOnly={props.readOnly} onUpdate={props.onUpdate} />
            </>
          )}
        />
      </div>
    </CalculatedTableProvider>
  );
}

/** The figure of a row of a box: the calculation's, in gray, or the field of its capture when the appraiser sets it (the adopted value). */
function BoxValue(props: { table: string; box: string; value: string }) {
  const address = { table: props.table, box: props.box };
  if (useCaptureDeclared(address)) return <CaptureSlotTarget address={address} className="flex min-w-28 items-center" />;
  return (
    <span className="rounded-sm bg-muted/70 px-1.5 py-1 text-right tabular-nums" title={CALCULATED_CELL_HINT}>
      {props.value}
    </span>
  );
}

/**
 * The boxes printed with the table (subtotals, the value it gives), under the
 * grid as they print: each label is written as it should print («Valor neto
 * de reposición»), the figure stays the calculation's; empty, the label is
 * the calculation's again.
 */
function GeneratedBoxLabels(props: { table: TableContent; readOnly: boolean; onUpdate: (updater: (table: TableContent) => TableContent) => void }) {
  const source = sourceOf(props.table);
  const layout = layoutOf(props.table);
  const boxes = source.schema?.summaryBoxes ?? [];
  if (!boxes.length) return null;
  const rename = (key: string, text: string) =>
    props.onUpdate((current) => applyTableLayout(sourceOf(current), withBoxLabel(layoutOf(current), key, text)));
  return (
    <div className="mt-3 grid gap-2 border-t pt-3 text-xs" data-generated-table-boxes>
      <p className="text-muted-foreground">Recuadros de la tabla: escribe el nombre con el que se imprime cada renglón; la cifra la sigue escribiendo el cálculo. Vacío, vuelve el nombre del cálculo.</p>
      <div className="flex flex-wrap items-start gap-3">
        {boxes.map((box) => (
          <div key={box.id} className="grid min-w-56 gap-1 rounded-md border bg-background p-2">
            {box.caption !== undefined ? (
              <CommitCell
                ariaLabel={`Etiqueta ${box.caption}`}
                disabled={props.readOnly}
                value={layout.boxLabels?.[summaryCaptionKey(box)] ?? ""}
                placeholder={box.caption}
                className="border-input text-xs font-semibold"
                onCommit={(text) => rename(summaryCaptionKey(box), text)}
              />
            ) : null}
            {box.rows.map((row, index) => {
              const key = summaryRowKey(box, row, index);
              return (
                <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <CommitCell
                    ariaLabel={`Etiqueta ${row.label}`}
                    disabled={props.readOnly}
                    value={layout.boxLabels?.[key] ?? ""}
                    placeholder={row.label}
                    className="border-input text-xs"
                    onCommit={(text) => rename(key, text)}
                  />
                  <BoxValue table={source.id} box={key} value={row.value} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
