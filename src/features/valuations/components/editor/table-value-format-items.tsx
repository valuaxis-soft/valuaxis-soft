"use client";

/**
 * The lists of "Unidades de valor", "Decimales" and "Alineación" of a table's
 * cells, the same in a right click, in a column's menu and in the bar of a
 * selection of cells.
 */
import { Check } from "lucide-react";

import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { NUMERIC_VALUE_FORMAT_OPTIONS } from "../../services/concept-value-format";
import {
  TABLE_DECIMALS_MAX,
  tableValueDecimals,
  tableValueUnit,
  type TableAlign,
  type TableCellFormat,
  type TableValueUnit,
} from "../../services/table";
import { useCustomUnits } from "./custom-units-context";

export type MenuParts = {
  Item: typeof ContextMenuItem | typeof DropdownMenuItem;
  Separator: typeof ContextMenuSeparator | typeof DropdownMenuSeparator;
  Sub: typeof ContextMenuSub | typeof DropdownMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger | typeof DropdownMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent | typeof DropdownMenuSubContent;
};

export const CONTEXT_PARTS: MenuParts = { Item: ContextMenuItem, Separator: ContextMenuSeparator, Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent };
export const DROPDOWN_PARTS: MenuParts = { Item: DropdownMenuItem, Separator: DropdownMenuSeparator, Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent };

/** The units of "Unidades de valor": the concepts' own, less "Otra unidad" (the firm's are listed apart). */
const TABLE_UNIT_OPTIONS = NUMERIC_VALUE_FORMAT_OPTIONS.filter((option) => option.value !== "custom");

const sameUnit = (a: TableValueUnit, b: TableValueUnit) =>
  a.kind === b.kind && (a.kind === "unit" || a.kind === "firm" ? a.unit === (b as typeof a).unit : true);

const mark = (chosen: boolean) => <Check aria-hidden className={cn("size-3.5", !chosen && "invisible")} />;

/** "Automático", "Sin decimales", "1 decimal"… as the menus write them. */
export const decimalsLabel = (option: number | undefined) =>
  option === undefined ? "Automático" : option === 0 ? "Sin decimales" : `${option} ${option === 1 ? "decimal" : "decimales"}`;

export const DECIMAL_OPTIONS: Array<number | undefined> = [undefined, ...Array.from({ length: TABLE_DECIMALS_MAX + 1 }, (_, index) => index)];

/**
 * "Unidades de valor" or "Decimales" of a cell, a column or a selection, the
 * same lists as the concepts' (video 5.7). `current` marks what it has now;
 * the choice goes to `onUnit` or `onDecimals`, each keeping the other half.
 */
export function ValueFormatItems({ kind, parts, current, onUnit, onDecimals }: {
  kind: "units" | "decimals";
  parts: MenuParts;
  current?: TableCellFormat;
  onUnit: (unit: TableValueUnit) => void;
  onDecimals: (decimals: number | undefined) => void;
}) {
  const { Item, Separator } = parts;
  const { units: firmUnits } = useCustomUnits();
  const unit = tableValueUnit(current);
  const decimals = tableValueDecimals(current);
  if (kind === "decimals") {
    return DECIMAL_OPTIONS.map((option) => (
      <Item key={option ?? "auto"} onClick={() => onDecimals(option)}>
        {mark(option === decimals)}
        {decimalsLabel(option)}
      </Item>
    ));
  }
  return (
    <>
      <Item onClick={() => onUnit({ kind: "auto" })}>{mark(unit.kind === "auto")}Automático</Item>
      {TABLE_UNIT_OPTIONS.map((option) => {
        const next: TableValueUnit = { kind: "unit", unit: option.value as Exclude<typeof option.value, "custom"> };
        return <Item key={option.value} onClick={() => onUnit(next)}>{mark(sameUnit(unit, next))}{option.label}</Item>;
      })}
      {firmUnits.length ? <Separator /> : null}
      {firmUnits.map((name) => (
        <Item key={`firm:${name}`} onClick={() => onUnit({ kind: "firm", unit: name })}>{mark(sameUnit(unit, { kind: "firm", unit: name }))}{name} · del despacho</Item>
      ))}
      <Separator />
      <Item onClick={() => onUnit({ kind: "text" })}>{mark(unit.kind === "text")}Texto</Item>
    </>
  );
}

export const ALIGN_OPTIONS: Array<{ value: TableAlign; label: string }> = [
  { value: "left", label: "Izquierda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Derecha" },
];

/** "Alineación" of a cell or a selection. */
export function AlignItems({ parts, current, onAlign }: { parts: MenuParts; current?: TableAlign; onAlign: (align: TableAlign) => void }) {
  const { Item } = parts;
  return ALIGN_OPTIONS.map((option) => (
    <Item key={option.value} onClick={() => onAlign(option.value)}>
      {mark(current === option.value)}
      {option.label}
    </Item>
  ));
}
