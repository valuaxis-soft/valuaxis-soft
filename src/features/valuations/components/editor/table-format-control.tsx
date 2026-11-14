"use client";

import { Merge, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DEFAULT_TABLE_TITLE,
  TABLE_DECIMALS_MAX,
  TABLE_INDENT_MAX,
  TABLE_SPACING_MAX,
  canGroupTableHeaders,
  getDisplayColumns,
  groupTableHeaders,
  setTableCaptionShown,
  setTableDecimals,
  setTablePrintLayout,
  setTableWidthMode,
  tableDecimals,
  tablePrintLayout,
  ungroupTableHeaders,
  type TableAlign,
  type TableV2,
} from "@/features/valuations/services/table";
import { columnLetter } from "@/features/valuations/services/formula-references";

/**
 * How the table prints: as wide as the page or as its content, its decimals,
 * its title shown or not, the room before and after it, its indent and where
 * it sits (video 5.3 and 5.7), and a double header (one title over several
 * columns, as merging the cells above them). The same for every table, the
 * ones the calculation writes (`generated`) too: their double headers are kept
 * in their layout, and their decimals are those of their figures.
 */
export function TableFormatControl({
  table,
  readOnly,
  onChange,
  generated = false,
}: {
  table: TableV2;
  readOnly: boolean;
  onChange: (updater: (table: TableV2) => TableV2) => void;
  generated?: boolean;
}) {
  const columns = getDisplayColumns(table);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [title, setTitle] = useState("");
  const groups = table.schema?.headerGroups ?? [];
  const print = tablePrintLayout(table);
  // A table still named as the editor created it prints no title whatever this says.
  const untitled = !table.title.trim() || table.title.trim() === DEFAULT_TABLE_TITLE;
  const groupable = canGroupTableHeaders(table) && columns.length > 1;
  const fromId = columns.some((column) => column.id === from) ? from : columns[0]?.id ?? "";
  const toId = columns.some((column) => column.id === to) ? to : columns[Math.min(1, columns.length - 1)]?.id ?? "";
  const label = (columnId: string) => {
    const index = columns.findIndex((column) => column.id === columnId);
    return `${columnLetter(index)} · ${columns[index]?.name.trim() || "Sin título"}`;
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" size="icon" variant="outline" aria-label="Formato de la tabla" title="Formato de la tabla: título, ancho, espacio, sangría, decimales y encabezado doble" disabled={readOnly}>
            <Merge />
          </Button>
        }
      />
      <PopoverContent align="end" className="grid max-h-[min(80vh,640px)] w-80 gap-4 overflow-y-auto p-3">
        <Field orientation="horizontal">
          <Checkbox
            id={`table-caption-${table.id}`}
            checked={table.schema?.hideCaption !== true}
            onCheckedChange={(checked) => onChange((current) => setTableCaptionShown(current, checked === true))}
          />
          <div className="grid gap-1">
            <FieldLabel htmlFor={`table-caption-${table.id}`}>Mostrar el título en el dictamen</FieldLabel>
            <FieldDescription>
              {untitled
                ? "Ponle un nombre a la tabla para imprimirlo arriba de ella."
                : `«${table.title.trim()}» se imprime arriba de la tabla. Sin marcar, solo la nombra en el editor (para importarla o buscarla).`}
            </FieldDescription>
          </div>
        </Field>

        <Field className="gap-1.5">
          <FieldLabel htmlFor={`table-width-${table.id}`}>Ancho de la tabla</FieldLabel>
          <NativeSelect
            id={`table-width-${table.id}`}
            className="w-full"
            value={table.schema?.widthMode === "content" ? "content" : "page"}
            onChange={(event) => onChange((current) => setTableWidthMode(current, event.target.value === "content" ? "content" : "page"))}
          >
            <NativeSelectOption value="page">Ajustar a la página</NativeSelectOption>
            <NativeSelectOption value="content">Ajustar al contenido</NativeSelectOption>
          </NativeSelect>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <PixelField
            id={`table-spacing-before-${table.id}`}
            label="Espacio antes"
            value={print.spacingBefore ?? 0}
            max={TABLE_SPACING_MAX}
            onChange={(value) => onChange((current) => setTablePrintLayout(current, { spacingBefore: value }))}
          />
          <PixelField
            id={`table-spacing-after-${table.id}`}
            label="Espacio después"
            value={print.spacingAfter ?? 0}
            max={TABLE_SPACING_MAX}
            onChange={(value) => onChange((current) => setTablePrintLayout(current, { spacingAfter: value }))}
          />
          <PixelField
            id={`table-indent-${table.id}`}
            label="Sangría"
            value={print.indent ?? 0}
            max={TABLE_INDENT_MAX}
            onChange={(value) => onChange((current) => setTablePrintLayout(current, { indent: value }))}
          />
          <Field className="gap-1">
            <FieldLabel className="text-xs" htmlFor={`table-align-${table.id}`}>Alineación</FieldLabel>
            <NativeSelect
              id={`table-align-${table.id}`}
              className="w-full"
              value={print.align ?? "left"}
              onChange={(event) => onChange((current) => setTablePrintLayout(current, { align: event.target.value as TableAlign }))}
            >
              <NativeSelectOption value="left">Izquierda</NativeSelectOption>
              <NativeSelectOption value="center">Centro</NativeSelectOption>
              <NativeSelectOption value="right">Derecha</NativeSelectOption>
            </NativeSelect>
          </Field>
          <FieldDescription className="col-span-2">
            En puntos de la página (px). La sangría recorre la tabla desde el margen izquierdo; la alineación se nota cuando la tabla es más angosta que la página («Ajustar al contenido»).
          </FieldDescription>
        </div>

        <Field className="gap-1.5">
          <FieldLabel htmlFor={`table-decimals-${table.id}`}>Decimales</FieldLabel>
          <NativeSelect
            id={`table-decimals-${table.id}`}
            className="w-full"
            value={tableDecimals(table) === undefined ? "auto" : String(tableDecimals(table))}
            onChange={(event) => onChange((current) => setTableDecimals(current, event.target.value === "auto" ? null : Number(event.target.value)))}
          >
            <NativeSelectOption value="auto">{generated ? "Automático (según el cálculo)" : "Automático (según la fórmula)"}</NativeSelectOption>
            {Array.from({ length: TABLE_DECIMALS_MAX + 1 }, (_, decimals) => (
              <NativeSelectOption key={decimals} value={String(decimals)}>{decimals === 0 ? "Sin decimales" : `${decimals} ${decimals === 1 ? "decimal" : "decimales"}`}</NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            {generated
              ? "Con cuántos decimales se imprimen las cifras con decimales, montos y porcentajes de esta tabla. El cálculo conserva sus valores completos; las claves, edades y conteos quedan como están."
              : "Con cuántos decimales se muestran los resultados de las fórmulas de esta tabla, aquí y en el dictamen. Una celda con formato propio lo conserva."}
          </FieldDescription>
        </Field>

        {groupable ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Encabezado doble</p>
            <p className="text-xs text-muted-foreground">Un título de grupo sobre varias columnas, como combinar las celdas del encabezado.</p>
            <div className="grid grid-cols-2 gap-2">
              <Field className="gap-1">
                <FieldLabel className="text-xs" htmlFor={`group-from-${table.id}`}>De la columna</FieldLabel>
                <NativeSelect id={`group-from-${table.id}`} className="w-full" value={fromId} onChange={(event) => setFrom(event.target.value)}>
                  {columns.map((column) => <NativeSelectOption key={column.id} value={column.id}>{label(column.id)}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field className="gap-1">
                <FieldLabel className="text-xs" htmlFor={`group-to-${table.id}`}>A la columna</FieldLabel>
                <NativeSelect id={`group-to-${table.id}`} className="w-full" value={toId} onChange={(event) => setTo(event.target.value)}>
                  {columns.map((column) => <NativeSelectOption key={column.id} value={column.id}>{label(column.id)}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            </div>
            <Input aria-label="Título del grupo" placeholder="Título del grupo" value={title} onChange={(event) => setTitle(event.target.value)} />
            <Button
              type="button"
              size="sm"
              disabled={!title.trim() || !fromId || !toId}
              onClick={() => {
                onChange((current) => groupTableHeaders(current, fromId, toId, title));
                setTitle("");
              }}
            >
              <Merge data-icon="inline-start" />
              Combinar encabezados
            </Button>
          </div>
        ) : (
          <FieldDescription>El encabezado de esta tabla sigue su propio formato.</FieldDescription>
        )}

        {groupable && groups.length ? (
          <ul className="grid gap-1 text-sm">
            {groups.map((group) => (
              <li key={group.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
                <span className="min-w-0 truncate">{group.title}</span>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Separar el grupo ${group.title}`} title="Separar los encabezados" onClick={() => onChange((current) => ungroupTableHeaders(current, group.id))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** A length in px of "Formato de la tabla", from 0 to `max`; it is applied as it is typed. */
function PixelField({ id, label, value, max, onChange }: { id: string; label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <Field className="gap-1">
      <FieldLabel className="text-xs" htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={2}
        className="tabular-nums"
        value={value}
        onChange={(event) => {
          const typed = Number(event.target.value);
          if (Number.isFinite(typed)) onChange(Math.max(0, Math.min(max, Math.round(typed))));
        }}
      />
    </Field>
  );
}
