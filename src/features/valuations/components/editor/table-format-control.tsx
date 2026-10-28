"use client";

import { Merge, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  canGroupTableHeaders,
  getDisplayColumns,
  groupTableHeaders,
  setTableWidthMode,
  ungroupTableHeaders,
  type TableV2,
} from "@/features/valuations/services/table";
import { columnLetter } from "@/features/valuations/services/formula-references";

/**
 * How the table prints: as wide as the page or as its content, and a double
 * header (one title over several columns, as merging the cells above them).
 */
export function TableFormatControl({
  table,
  readOnly,
  onChange,
}: {
  table: TableV2;
  readOnly: boolean;
  onChange: (updater: (table: TableV2) => TableV2) => void;
}) {
  const columns = getDisplayColumns(table);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [title, setTitle] = useState("");
  const groups = table.schema?.headerGroups ?? [];
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
          <Button type="button" size="icon" variant="outline" aria-label="Formato de la tabla" title="Formato de la tabla: ancho y encabezado doble" disabled={readOnly}>
            <Merge />
          </Button>
        }
      />
      <PopoverContent align="end" className="grid w-80 gap-4 p-3">
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
