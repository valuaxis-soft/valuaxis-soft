"use client";

import { Check, Eye, EyeOff, Link2, Plus, Trash2, Undo2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  MAX_EXTRA_BOX_ROWS,
  MAX_EXTRA_COLUMNS,
  arrangedBoxRows,
  editGeneratedTable,
  layoutOf,
  sourceOf,
  summaryCaptionKey,
  summaryRowKey,
  tableNotesOf,
  withBoxLabel,
  withBoxRows,
  withColumnRestored,
  withTableNotes,
  applyTableLayout,
  type ArrangedBoxRow,
} from "@/features/valuations/calculation/generated-table-layout";
import type { TableContent } from "@/features/valuations/model";
import {
  appendTableColumn,
  ensureTableV2,
  insertTableRow,
  type GeneratedBoxRows,
  type GeneratedTableLayout,
  type TableSummaryBox,
  type TableV2,
} from "@/features/valuations/services/table";
import { cn } from "@/lib/utils";
import { CommitCell } from "../calculation/commit-cell";
import { SortableRows, useSortableRow } from "../calculation/sortable-rows";
import { CALCULATED_CELL_HINT, CalculatedTableProvider, type CalculatedTableLock } from "./calculated-table-context";
import { CaptureSlotTarget, useCaptureColumnsOf, useCaptureDeclared, useCaptureStore } from "./capture-host";
import { TableEditorItem } from "./table-editor";
import { TableNotesEditor } from "./table-notes-editor";

/**
 * «Agregar columna → Dato de la ficha» (video 8.9, 01:51: «si agregan una
 * columna, ligarlo a algún dato de las fichas»): every datum of the
 * comparables' card; the ones already in the table are checked, and choosing
 * one again takes it out.
 */
function CardFieldColumnMenu(props: { fields: Array<{ key: string; label: string; linked: boolean }>; onLink: (key: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" className="h-7 text-xs" data-card-field-menu="" />}>
        <Link2 data-icon="inline-start" /> Columna con un dato de la ficha
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuGroup>
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          La columna muestra el dato de cada comparable; su nombre es el de la ficha y cambia en las dos partes.
        </DropdownMenuLabel>
        {props.fields.map((field) => (
          <DropdownMenuItem key={field.key} onClick={() => props.onLink(field.key)} data-card-field={field.key}>
            <Check className={cn("size-3.5", field.linked ? "opacity-100" : "opacity-0")} aria-hidden />
            {field.label}
          </DropdownMenuItem>
        ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  // Who names, takes out and adds the calculation's columns of this table (the market's panel), if anyone.
  const managed = useCaptureColumnsOf(source.id);
  const lock = useMemo<CalculatedTableLock>(() => {
    const rows = new Set(source.rows.map((row) => row.id));
    const columns = new Set(source.columns.map((column) => column.id));
    const places = new Map(source.columns.map((column, index) => [column.id, index]));
    return {
      row: (id) => rows.has(id),
      column: (id) => columns.has(id),
      ...(props.capture ? { inPlace: true, columnPlace: (id: string) => places.get(id) ?? -1 } : {}),
      ...(managed?.removable ? { removable: managed.removable } : {}),
    };
  }, [source, props.capture, managed]);
  const captureStore = useCaptureStore();
  const edit = (change: (table: TableContent) => TableContent) => props.onUpdate((current) => {
    const next = editGeneratedTable(current, change);
    // What the calculation owns of the columns: their names (a factor, a datum of the card), the ones taken out
    // and the ones added among the factors. The calculation takes the change and writes it everywhere it prints
    // (the cards, the annex, the memory); the table keeps no label, hidden column or column of its own over it.
    const naming = captureStore?.headerRename(source.id);
    if (!naming) return next;
    const layout = layoutOf(next);
    const before = layoutOf(current);
    const after = layout.labels ?? {};
    const taken = Object.keys(after).filter((id) => after[id] !== before.labels?.[id] && after[id].trim() && naming.handles(id));
    const removedNow = (layout.removed ?? []).filter((id) => !(before.removed ?? []).includes(id));
    const takenOut = removedNow.filter((id) => naming.takesRemoval?.(id));
    const addedNow = (layout.extraColumns ?? []).filter((column) => !(before.extraColumns ?? []).some((item) => item.id === column.id));
    const adopted = addedNow.filter((column) => naming.takesInsert?.(column.after));
    if (!taken.length && !takenOut.length && !adopted.length) return next;
    // Told after the table's update, once: the calculation writes the table again with the change.
    for (const id of taken) queueMicrotask(() => naming.rename(id, after[id].trim()));
    for (const id of takenOut) queueMicrotask(() => naming.remove?.(id));
    for (const column of adopted) queueMicrotask(() => naming.insert?.(column.after, column.name, column.id));
    const labels = Object.fromEntries(Object.entries(after).filter(([id]) => !taken.includes(id)));
    const removed = (layout.removed ?? []).filter((id) => !takenOut.includes(id));
    const extraColumns = (layout.extraColumns ?? []).filter((column) => !adopted.includes(column));
    // A factor added or taken out moves the calculation's columns after it: the order the table had before stays.
    const order = adopted.length || takenOut.length ? before.order : layout.order;
    const { removed: _removed, extraColumns: _extra, order: _order, ...rest } = layout;
    return applyTableLayout(sourceOf(next), {
      ...rest,
      labels,
      ...(removed.length ? { removed } : {}),
      ...(extraColumns.length ? { extraColumns } : {}),
      ...(order?.length ? { order } : {}),
    });
  });
  const restoreColumn = (columnId: string) => props.onUpdate((current) => applyTableLayout(sourceOf(current), withColumnRestored(layoutOf(current), columnId)));
  const removedColumns = (layoutOf(props.table).removed ?? []).flatMap((id) => {
    const column = source.columns.find((item) => item.id === id);
    return column ? [{ id, name: layoutOf(props.table).labels?.[id] ?? column.name }] : [];
  });
  const notes = tableNotesOf(source, layoutOf(props.table));
  const addColumn = () => {
    if ((layoutOf(props.table).extraColumns?.length ?? 0) >= MAX_EXTRA_COLUMNS) {
      toast.info(`Una tabla del cálculo lleva hasta ${MAX_EXTRA_COLUMNS} columnas propias.`);
      return;
    }
    edit((current) => asContent(appendTableColumn(ensureTableV2(current))));
  };

  return (
    <CalculatedTableProvider value={lock}>
      {/* The cells of the capture are white, the appraiser's among the gray figures of the calculation, whatever field holds them. */}
      <div
        className={cn("min-w-0", props.capture && "[&_[data-capture-slot]_input]:bg-background [&_[data-capture-slot]_select]:bg-background [&_[data-capture-slot]_input:disabled]:bg-transparent")}
        data-generated-table={source.id}
      >
        {/* Right above the table, what its calculation sets for it and does not print (video 8.10: one structure, in the Excel's order). */}
        {props.capture ? <CaptureSlotTarget address={{ table: source.id, part: "before" }} className="mb-2 grid min-w-0 gap-2 empty:hidden" /> : null}
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
              <CaptureSlotTarget address={{ table: source.id, part: "footer" }} className="mt-2 grid gap-2 empty:hidden" />
              {!props.readOnly && (removedColumns.length || managed?.linkable) ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-table-columns-bar="">
                  {managed?.linkable ? <CardFieldColumnMenu fields={managed.linkable()} onLink={(key) => managed.link?.(key)} /> : null}
                  {removedColumns.length ? (
                    <span className="flex flex-wrap items-center gap-1 text-muted-foreground" data-removed-columns="">
                      Columnas quitadas:
                      {removedColumns.map((column) => (
                        <Button key={column.id} type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-xs" title="Volver a mostrar esta columna" onClick={() => restoreColumn(column.id)}>
                          <Undo2 data-icon="inline-start" /> {column.name}
                        </Button>
                      ))}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {/* Its notes, in the size of the text, written in place, added, taken out and moved (video 8.7). */}
              <TableNotesEditor
                notes={notes}
                readOnly={props.readOnly}
                onChange={(next) => props.onUpdate((current) => applyTableLayout(sourceOf(current), withTableNotes(layoutOf(current), sourceOf(current), next)))}
              />
              <GeneratedBoxLabels table={props.table} readOnly={props.readOnly} onUpdate={props.onUpdate} />
              {/* After its notes and boxes, what the calculation's capture adds at the end (a market's values and statistics). */}
              <CaptureSlotTarget address={{ table: source.id, part: "after" }} className="mt-3 grid gap-3 empty:hidden" />
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
 * grid as they print, each a small table (video 8.7, 13:10): its rows are
 * dragged to another order, hidden from the dictamen (shown again faded),
 * and rows of the appraiser's own are added (a label and a value as written)
 * and removed. A label is written as it should print («Valor neto de
 * reposición») and shows as plain text, not as a faded hint; the figure stays
 * the calculation's. Emptied, the label is the calculation's again.
 */
function GeneratedBoxLabels(props: { table: TableContent; readOnly: boolean; onUpdate: (updater: (table: TableContent) => TableContent) => void }) {
  const source = sourceOf(props.table);
  const layout = layoutOf(props.table);
  // The rows a panel edits as a table of its own (the market's statistics) are not repeated here.
  const managed = useCaptureColumnsOf(source.id);
  const boxes = (source.schema?.summaryBoxes ?? [])
    .map((box) => ({ box, rows: box.rows.map((row, index) => ({ row, key: summaryRowKey(box, row, index) })).filter(({ key }) => !managed?.boxRowManaged?.(key)) }))
    .filter(({ box, rows }) => rows.length || box.caption !== undefined)
    .map(({ box }) => box);
  if (!boxes.length) return null;
  const change = (next: (current: ReturnType<typeof layoutOf>) => ReturnType<typeof layoutOf>) =>
    props.onUpdate((current) => applyTableLayout(sourceOf(current), next(layoutOf(current))));
  const rename = (key: string, text: string) => change((current) => withBoxLabel(current, key, text));
  return (
    <div className="mt-3 grid gap-2 border-t pt-3 text-sm" data-generated-table-boxes>
      <p className="text-xs text-muted-foreground">
        Recuadros de la tabla: escribe el nombre con el que se imprime cada renglón (vacío, vuelve el del cálculo); la cifra la escribe el cálculo.
        Arrastra para cambiar el orden, oculta lo que no quieras imprimir o agrega renglones tuyos.
      </p>
      <div className="flex flex-wrap items-start gap-3">
        {boxes.map((box) => (
          <BoxRowsEditor
            key={box.id}
            box={box}
            table={source.id}
            layout={layout}
            readOnly={props.readOnly}
            onRename={rename}
            onArrange={(arrange) => change((current) => withBoxRows(current, box.id, arrange))}
            managed={(key) => managed?.boxRowManaged?.(key) ?? false}
          />
        ))}
      </div>
    </div>
  );
}

/** One box under the table, as a small table of label and figure. */
function BoxRowsEditor(props: {
  box: TableSummaryBox;
  table: string;
  layout: GeneratedTableLayout;
  readOnly: boolean;
  onRename: (key: string, text: string) => void;
  onArrange: (arrange: (current: GeneratedBoxRows) => GeneratedBoxRows) => void;
  /** Rows a panel edits as a table of its own (the market's statistics): not repeated here. */
  managed?: (rowKey: string) => boolean;
}) {
  const { box, layout } = props;
  const rows = arrangedBoxRows(box, layout).filter((item) => !props.managed?.(item.key));
  const keys = rows.map((item) => item.key);
  const extras = layout.boxRows?.[box.id]?.extra ?? [];
  const setExtra = (id: string, patch: Partial<{ label: string; value: string }>) =>
    props.onArrange((current) => ({ ...current, extra: (current.extra ?? []).map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const toggleHidden = (key: string) => props.onArrange((current) => {
    const hidden = new Set(current.hidden ?? []);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    return { ...current, hidden: [...hidden] };
  });
  const remove = (item: ArrangedBoxRow) => {
    if (!item.own) {
      // A row of the calculation is not deleted: it is left out of the dictamen and comes back with «Mostrar».
      toggleHidden(item.key);
      toast.info(`«${item.row.label}» ya no se imprime.`, { description: "Es un renglón del cálculo: queda oculto y vuelve con el ojo." });
      return;
    }
    props.onArrange((current) => ({
      ...current,
      extra: (current.extra ?? []).filter((extra) => `${box.id}.${extra.id}` !== item.key),
      order: (current.order ?? []).filter((key) => key !== item.key),
      hidden: (current.hidden ?? []).filter((key) => key !== item.key),
    }));
  };
  const add = () => {
    if (extras.length >= MAX_EXTRA_BOX_ROWS) {
      toast.info(`Un recuadro lleva hasta ${MAX_EXTRA_BOX_ROWS} renglones tuyos.`);
      return;
    }
    const taken = new Set(extras.map((item) => item.id));
    let number = extras.length + 1;
    while (taken.has(`propio-${number}`)) number += 1;
    props.onArrange((current) => ({ ...current, extra: [...(current.extra ?? []), { id: `propio-${number}`, label: "", value: "" }] }));
  };
  return (
    <div className="grid min-w-64 gap-1 rounded-md border bg-background p-2" data-box-editor={box.id}>
      {box.caption !== undefined ? (
        <CommitCell
          ariaLabel={`Etiqueta ${box.caption}`}
          disabled={props.readOnly}
          value={layout.boxLabels?.[summaryCaptionKey(box)] ?? box.caption}
          className="border-input text-sm font-semibold"
          onCommit={(text) => props.onRename(summaryCaptionKey(box), text === box.caption ? "" : text)}
        />
      ) : null}
      <SortableRows ids={keys} onMove={(order) => props.onArrange((current) => ({ ...current, order }))}>
        {rows.map((item) => (
          <BoxRowEditor
            key={item.key}
            item={item}
            table={props.table}
            label={item.own ? item.row.label : layout.boxLabels?.[item.key] ?? item.row.label}
            readOnly={props.readOnly}
            onLabel={(text) => (item.own ? setExtra(item.row.id as string, { label: text }) : props.onRename(item.key, text === item.row.label ? "" : text))}
            onValue={(text) => setExtra(item.row.id as string, { value: text })}
            onToggleHidden={() => toggleHidden(item.key)}
            onRemove={() => remove(item)}
          />
        ))}
      </SortableRows>
      {!props.readOnly ? (
        <Button type="button" size="sm" variant="ghost" className="h-7 w-fit text-xs" onClick={add} data-box-add-row={box.id}>
          <Plus data-icon="inline-start" /> Renglón
        </Button>
      ) : null}
    </div>
  );
}

function BoxRowEditor(props: {
  item: ArrangedBoxRow;
  table: string;
  label: string;
  readOnly: boolean;
  onLabel: (text: string) => void;
  onValue: (text: string) => void;
  onToggleHidden: () => void;
  onRemove: () => void;
}) {
  const { item } = props;
  const sortable = useSortableRow(item.key, { disabled: props.readOnly, label: `Mover «${props.label || "renglón"}»` });
  return (
    <div
      {...sortable.row}
      className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1", sortable.className, item.hidden && "opacity-50")}
      data-box-row={item.key}
      data-box-row-hidden={item.hidden ? "" : undefined}
    >
      {sortable.handle ?? <span />}
      <CommitCell
        ariaLabel={`Etiqueta ${item.row.label || "del renglón"}`}
        disabled={props.readOnly}
        value={props.label}
        placeholder={item.own ? "Nombre del renglón" : item.row.label}
        className={cn("border-input text-sm text-foreground", item.row.emphasis && "font-semibold")}
        onCommit={props.onLabel}
      />
      {item.own ? (
        <CommitCell
          ariaLabel={`Valor de ${props.label || "el renglón"}`}
          disabled={props.readOnly}
          value={item.row.value}
          placeholder="Valor"
          className="w-28 border-input text-right text-sm"
          onCommit={props.onValue}
        />
      ) : <BoxValue table={props.table} box={item.key} value={item.row.value} />}
      {!props.readOnly ? (
        <span className="flex items-center">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-pressed={item.hidden}
            aria-label={item.hidden ? `Mostrar «${props.label}» en el dictamen` : `Ocultar «${props.label}» en el dictamen`}
            title={item.hidden ? "Oculto en el dictamen: clic para mostrarlo" : "Ocultar en el dictamen"}
            onClick={props.onToggleHidden}
          >
            {item.hidden ? <EyeOff /> : <Eye />}
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar «${props.label || "el renglón"}»`} title={item.own ? "Quitar el renglón" : "Es del cálculo: se oculta"} onClick={props.onRemove}>
            <Trash2 />
          </Button>
        </span>
      ) : null}
    </div>
  );
}
