"use client";

import { Merge, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  captureHeaderLayout,
  withCaptureGroup,
  withCaptureLabel,
  withoutCaptureGroup,
  type CaptureColumn,
  type CaptureHeaders,
} from "@/features/valuations/services/capture-headers";
import { cn } from "@/lib/utils";
import { CALC_HEAD, CALC_HEAD_CELL } from "./calculation-table-style";

/** A column of a capture table as its header shows it; `hint` is the tooltip of the header. */
export type CaptureHeadColumn = CaptureColumn & { hint?: string; className?: string };

/**
 * A header of a capture table, written over as in a configurable table: the
 * name the appraiser gives it is applied when the field is left or with
 * Enter; empty, the panel's name again. «Renombrar» of the right-click menu
 * focuses it.
 */
function HeaderName(props: { value: string; placeholder: string; label: string; readOnly: boolean; hint?: string; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    if (draft.trim() !== props.value) props.onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      aria-label={props.label}
      title={props.hint ?? "Escribe para cambiar el nombre del encabezado; vacío, vuelve el del panel."}
      disabled={props.readOnly}
      value={draft ?? props.value}
      placeholder={props.placeholder}
      size={Math.max(3, Math.min((draft ?? props.value).length || props.placeholder.length, 28))}
      className="field-sizing-content w-full min-w-[3ch] rounded-sm bg-transparent text-center font-bold outline-none placeholder:text-current focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default"
      data-capture-header=""
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * The header of a capture table of the calculation panels with the
 * appraiser's names and double headers. The captured data, its columns and
 * the calculation stay as they are: this is only how the panel names them.
 * A `fixed` column (#, the actions) keeps its header.
 */
export function CaptureTableHead(props: {
  columns: CaptureHeadColumn[];
  headers: CaptureHeaders | undefined;
  readOnly: boolean;
  onChange: (headers: CaptureHeaders) => void;
}) {
  const layout = captureHeaderLayout(props.columns, props.headers);
  const byKey = new Map(props.columns.map((column) => [column.key, column]));
  const columnCell = (cell: (typeof layout.bottom)[number], rowSpan?: number) => {
    const column = byKey.get(cell.key);
    return (
      <th key={cell.key} rowSpan={rowSpan} className={cn(CALC_HEAD_CELL, column?.className)} title={column?.hint} data-capture-column={cell.key}>
        {cell.fixed ? (
          column?.label ? cell.label : <span className="sr-only">Acciones</span>
        ) : (
          <HeaderName
            value={cell.label === cell.defaultLabel ? "" : cell.label}
            placeholder={cell.defaultLabel}
            label={`Encabezado ${cell.defaultLabel}`}
            hint={column?.hint}
            readOnly={props.readOnly}
            onCommit={(text) => props.onChange(withCaptureLabel(props.headers, cell.key, text))}
          />
        )}
      </th>
    );
  };
  return (
    <thead className={CALC_HEAD}>
      <tr>
        {layout.top.map((cell) => cell.kind === "group" ? (
          <th key={cell.id} colSpan={cell.colSpan} className={CALC_HEAD_CELL} data-capture-group={cell.id}>
            <HeaderName
              value={cell.title === cell.defaultTitle ? "" : cell.title}
              placeholder={cell.defaultTitle}
              label={`Título del grupo ${cell.defaultTitle}`}
              readOnly={props.readOnly}
              onCommit={(text) => props.onChange(withCaptureLabel(props.headers, cell.id, text))}
            />
          </th>
        ) : columnCell(cell, cell.rowSpan))}
      </tr>
      {layout.bottom.length ? <tr>{layout.bottom.map((cell) => columnCell(cell))}</tr> : null}
    </thead>
  );
}

/**
 * «Encabezados» of a capture table, as the double header of «Formato de la
 * tabla»: one title over several columns, separating a group, and the
 * panel's headers back.
 */
export function CaptureHeaderControl(props: {
  columns: CaptureHeadColumn[];
  headers: CaptureHeaders | undefined;
  readOnly: boolean;
  onChange: (headers: CaptureHeaders) => void;
  label: string;
}) {
  const columns = props.columns.filter((column) => !column.fixed);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [title, setTitle] = useState("");
  const layout = captureHeaderLayout(props.columns, props.headers);
  const groups = layout.top.flatMap((cell) => (cell.kind === "group" ? [cell] : []));
  const fromKey = columns.some((column) => column.key === from) ? from : columns[0]?.key ?? "";
  const toKey = columns.some((column) => column.key === to) ? to : columns[Math.min(1, columns.length - 1)]?.key ?? "";
  const labels = new Map([...layout.top, ...layout.bottom].flatMap((cell) => (cell.kind === "column" ? [[cell.key, cell.label] as const] : [])));
  const name = (key: string) => labels.get(key) ?? key;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" size="sm" variant="outline" className="justify-self-end" disabled={props.readOnly} title="Combinar encabezados (encabezado doble) o volver a los del panel" aria-label={`Encabezados de ${props.label}`}>
            <Merge data-icon="inline-start" /> Encabezados
          </Button>
        }
      />
      <PopoverContent align="end" className="grid w-80 gap-3 p-3">
        <p className="text-sm font-medium">Encabezados de {props.label}</p>
        <FieldDescription>
          Escribe sobre cualquier encabezado de la tabla para cambiarle el nombre. Aquí combinas varios bajo un título (encabezado doble). Solo cambia cómo se ven en el panel: lo capturado y el cálculo quedan igual.
        </FieldDescription>
        <div className="grid grid-cols-2 gap-2">
          <Field className="gap-1">
            <FieldLabel className="text-xs" htmlFor={`capture-from-${props.label}`}>De la columna</FieldLabel>
            <NativeSelect id={`capture-from-${props.label}`} className="w-full" value={fromKey} onChange={(event) => setFrom(event.target.value)}>
              {columns.map((column) => <NativeSelectOption key={column.key} value={column.key}>{name(column.key)}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field className="gap-1">
            <FieldLabel className="text-xs" htmlFor={`capture-to-${props.label}`}>A la columna</FieldLabel>
            <NativeSelect id={`capture-to-${props.label}`} className="w-full" value={toKey} onChange={(event) => setTo(event.target.value)}>
              {columns.map((column) => <NativeSelectOption key={column.key} value={column.key}>{name(column.key)}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
        </div>
        <Input aria-label="Título del grupo" placeholder="Título del grupo" value={title} onChange={(event) => setTitle(event.target.value)} />
        <Button
          type="button"
          size="sm"
          disabled={!title.trim() || !fromKey || !toKey}
          onClick={() => {
            props.onChange(withCaptureGroup(props.headers, props.columns, fromKey, toKey, title));
            setTitle("");
          }}
        >
          <Merge data-icon="inline-start" /> Combinar encabezados
        </Button>
        {groups.length ? (
          <ul className="grid gap-1 text-sm">
            {groups.map((group) => (
              <li key={group.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
                <span className="min-w-0 truncate">{group.title}</span>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Separar el grupo ${group.title}`} title="Separar los encabezados" onClick={() => props.onChange(withoutCaptureGroup(props.headers, props.columns, group.id))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => props.onChange({})}>
          <RotateCcw data-icon="inline-start" /> Volver a los encabezados del panel
        </Button>
      </PopoverContent>
    </Popover>
  );
}
