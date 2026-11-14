"use client";

/**
 * The bar of a selection of cells, over every table of the editor: the same
 * idea as «Seleccionar conceptos» (video 5.7, Álvaro: «seleccionas y eliges
 * el formato»). With nothing selected it says how to select; with cells, it
 * gives them bold, italic, underline, alignment, "Unidades de valor",
 * "Decimales" and "Limpiar formato", and copies or clears them. What a table
 * cannot do stays in the bar, disabled, with the reason.
 */
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ClipboardCopy, Eraser, MousePointerSquareDashed, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { StyleMark } from "../../services/table-cell-style";
import type { TableAlign, TableCellFormat, TableValueUnit } from "../../services/table";
import { DROPDOWN_PARTS, ValueFormatItems } from "./table-value-format-items";

const MARKS: Array<{ mark: StyleMark; letter: string; title: string; className: string }> = [
  { mark: "bold", letter: "N", title: "Negrita", className: "font-bold" },
  { mark: "italic", letter: "K", title: "Cursiva", className: "italic" },
  { mark: "underline", letter: "S", title: "Subrayado", className: "underline" },
];

const ALIGNS: Array<{ value: TableAlign; title: string; Icon: typeof AlignLeft }> = [
  { value: "left", title: "Alinear a la izquierda", Icon: AlignLeft },
  { value: "center", title: "Centrar", Icon: AlignCenter },
  { value: "right", title: "Alinear a la derecha", Icon: AlignRight },
];

/** How to select, said where the bar is while nothing is selected. */
export const CELL_SELECTION_HINT =
  "Selecciona celdas para darles formato: arrastra, Shift+clic o Ctrl+clic (⌘ en Mac); la letra de una columna o el número de una fila la toman completa y Ctrl+A toda la tabla.";

const separator = <span className="mx-1 h-4 border-l" aria-hidden="true" />;

export type CellSelectionBarProps = {
  /** More of what the table does, said after how to select while nothing is selected. */
  hint?: string;
  /** Cells selected, the title counted as one. */
  count: number;
  /** What the count is, in words: "3 celdas", "el título y 4 celdas". */
  label: string;
  readOnly: boolean;
  marks: Record<StyleMark, boolean>;
  align?: TableAlign;
  /** The format of the first cell selected, to mark what it has. */
  current?: TableCellFormat;
  /** Why the style cannot be chosen here (a capture table does not print). */
  formatLocked?: string;
  /** Why "Unidades de valor" cannot be chosen (a figure the calculation writes); or that only headers are selected. */
  unitsLocked?: string;
  decimalsLocked?: string;
  onMark: (mark: StyleMark) => void;
  onAlign: (align: TableAlign) => void;
  onUnit: (unit: TableValueUnit) => void;
  onDecimals: (decimals: number | undefined) => void;
  onClearFormat: () => void;
  onCopy: () => void;
  /** Clears what is written; absent when nothing selected takes typing. */
  onClearContents?: () => void;
  onDone: () => void;
};

export function CellSelectionBar(props: CellSelectionBarProps) {
  const { count, readOnly } = props;
  if (readOnly) return null;
  // The bar takes the place of the hint, the same height: selecting never moves the table under the mouse.
  if (!count) {
    return (
      <p className="mb-2 flex min-h-8 items-start gap-1.5 text-xs text-muted-foreground" data-cell-selection-hint="">
        <MousePointerSquareDashed aria-hidden className="mt-px size-3 shrink-0" />
        <span>{CELL_SELECTION_HINT} Clic derecho en una celda, en un encabezado o en el número de fila para más opciones.{props.hint ? ` ${props.hint}` : ""}</span>
      </p>
    );
  }
  const styleDisabled = Boolean(props.formatLocked);
  return (
    <div
      className="mb-2 flex min-h-8 items-center gap-1 overflow-x-auto rounded-lg border border-primary/40 bg-card px-2 py-0.5 text-xs whitespace-nowrap shadow-soft"
      role="toolbar"
      aria-label="Celdas seleccionadas"
      data-cell-selection=""
      // A click on the bar keeps the selection and the focus where they are.
      onMouseDown={(event) => {
        if ((event.target as Element).closest("button")) event.preventDefault();
      }}
    >
      <span className="tabular-nums font-medium" data-cell-selection-count={count}>{props.label}</span>
      {separator}
      <span className="flex items-center gap-0.5" role="group" aria-label="Formato del texto de las celdas seleccionadas">
        {MARKS.map((item) => (
          <Button
            key={item.mark}
            type="button"
            size="icon-xs"
            variant={props.marks[item.mark] ? "secondary" : "ghost"}
            className={cn(item.className, props.marks[item.mark] && "ring-1 ring-primary/40")}
            aria-label={`${item.title} a las celdas seleccionadas`}
            aria-pressed={props.marks[item.mark]}
            title={props.formatLocked ?? `${item.title}: si todas ya la tienen, se quita`}
            disabled={styleDisabled}
            data-cell-mark={item.mark}
            onClick={() => props.onMark(item.mark)}
          >
            {item.letter}
          </Button>
        ))}
      </span>
      <span className="flex items-center gap-0.5" role="group" aria-label="Alineación de las celdas seleccionadas">
        {ALIGNS.map(({ value, title, Icon }) => (
          <Button
            key={value}
            type="button"
            size="icon-xs"
            variant={props.align === value ? "secondary" : "ghost"}
            aria-label={title}
            aria-pressed={props.align === value}
            title={props.formatLocked ?? title}
            disabled={styleDisabled}
            data-cell-align={value}
            onClick={() => props.onAlign(value)}
          >
            <Icon />
          </Button>
        ))}
      </span>
      {separator}
      <FormatMenu {...props} label="Unidades de valor" kind="units" locked={props.formatLocked ?? props.unitsLocked} />
      <FormatMenu {...props} label="Decimales" kind="decimals" locked={props.formatLocked ?? props.decimalsLocked} />
      <Button type="button" size="xs" variant="ghost" disabled={styleDisabled} title={props.formatLocked ?? "Quita negrita, cursiva, subrayado, alineación, unidades y decimales; lo escrito se queda"} onClick={props.onClearFormat}>
        <Eraser data-icon="inline-start" />
        Limpiar formato
      </Button>
      {separator}
      <Button type="button" size="xs" variant="ghost" title="Copiar (Ctrl+C / ⌘C): se pega igual en Excel" onClick={props.onCopy}>
        <ClipboardCopy data-icon="inline-start" />
        Copiar
      </Button>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={!props.onClearContents}
        title={props.onClearContents ? "Borrar el contenido (Supr): más de tres celdas con datos piden confirmación; se deshace con «Deshacer»" : "Nada de lo seleccionado se escribe aquí."}
        onClick={props.onClearContents}
      >
        <Trash2 data-icon="inline-start" />
        Borrar contenido
      </Button>
      <Button type="button" size="icon-xs" variant="ghost" className="ml-auto" aria-label="Quitar la selección (Esc)" title="Quitar la selección (Esc)" onClick={props.onDone}>
        <X />
      </Button>
    </div>
  );
}

function FormatMenu({ label, kind, locked, current, onUnit, onDecimals }: CellSelectionBarProps & { label: string; kind: "units" | "decimals"; locked?: string }) {
  if (locked) {
    return (
      <span title={locked}>
        <Button type="button" size="xs" variant="ghost" disabled>
          {label}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" size="xs" variant="ghost" data-cell-format={kind} />}>
        {label}
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-52 overflow-y-auto">
        <ValueFormatItems kind={kind} parts={DROPDOWN_PARTS} current={current} onUnit={onUnit} onDecimals={onDecimals} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "3 celdas", "el título", "el título y 4 celdas". */
export function selectionLabel(cells: number, title: boolean) {
  const cellText = cells === 1 ? "1 celda" : `${cells} celdas`;
  if (!title) return `${cellText} seleccionada${cells === 1 ? "" : "s"}`;
  return cells ? `Título y ${cellText}` : "Título seleccionado";
}
