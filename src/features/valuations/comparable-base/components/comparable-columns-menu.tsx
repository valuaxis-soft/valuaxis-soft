"use client";

import { DropdownMenuCheckboxItem, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { COMPARABLE_COLUMN_LABELS, type ColumnLayout, type ComparableColumn } from "../column-layout";

/**
 * Items of the «Columnas» menu. Base UI requires a menu label to live inside a
 * group; a bare label throws «MenuGroupContext is missing» when the menu opens,
 * which the error boundary showed as «Algo salió mal».
 */
export function ComparableColumnsMenuItems(props: {
  layout: ColumnLayout;
  onToggle: (key: ComparableColumn) => void;
  onReset: () => void;
}) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
        {props.layout.map((column) => (
          <DropdownMenuCheckboxItem key={column.key} checked={column.visible} closeOnClick={false} onCheckedChange={() => props.onToggle(column.key)}>
            {COMPARABLE_COLUMN_LABELS[column.key]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={props.onReset}>Restablecer columnas</DropdownMenuItem>
    </>
  );
}
