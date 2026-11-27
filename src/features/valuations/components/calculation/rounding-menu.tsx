"use client";

import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROUNDING_OPTIONS, type RoundingDigits } from "@/features/valuations/engine/config";
import { cn } from "@/lib/utils";

const NONE = "none";
const keyOf = (digits: RoundingDigits) => (digits === null ? NONE : String(digits));
const digitsOf = (key: string): RoundingDigits => (key === NONE ? null : Number(key));

/** How a value is rounded, in words: «A miles», «Sin redondeo». */
export const roundingLabel = (digits: RoundingDigits) => ROUNDING_OPTIONS.find((option) => option.digits === digits)?.label ?? `A ${digits} dígitos`;

/**
 * A concluded value with its rounding as an option of the value itself
 * (video 8.14, 05:20: «¿por qué no me ponen los redondeos… como opciones con
 * un clic derecho?»; 06:50: «redondeo, opción, los tres puntitos o clic
 * derecho»): the figure, and beside it «⋯»; the right click on the figure
 * opens the same menu. No box of its own: the rounding is where the value is.
 *
 * Any calculation plugs it on the cell or the bar of its concluded value: it
 * takes the digits chosen (Excel ROUND, null for none) and says when they change.
 */
export function RoundingMenu(props: {
  /** What is rounded, for the menu and the screen reader: «valor por ingresos». */
  label: string;
  value: RoundingDigits;
  onChange: (digits: RoundingDigits) => void;
  readOnly?: boolean;
  /** The figure as it shows; the menu goes beside it. */
  children: ReactNode;
  className?: string;
}) {
  const title = `Redondeo del ${props.label}: ${roundingLabel(props.value).toLowerCase()}. Clic derecho o «⋯» para cambiarlo.`;
  const choose = (key: string) => {
    const digits = digitsOf(key);
    if (digits !== props.value) props.onChange(digits);
  };
  if (props.readOnly) {
    return <span className={cn("inline-flex items-center gap-1", props.className)} title={title}>{props.children}</span>;
  }
  return (
    // The right click stays here: the cell's own menu (the table's) does not open over this one.
    <span className={cn("inline-flex items-center gap-1", props.className)} onContextMenu={(event) => event.stopPropagation()} data-rounding-menu={keyOf(props.value)}>
      <ContextMenu>
        <ContextMenuTrigger className="inline-flex cursor-context-menu items-center" title={title}>{props.children}</ContextMenuTrigger>
        <ContextMenuContent className="min-w-48">
          <ContextMenuGroup>
            <ContextMenuLabel>Redondeo del {props.label}</ContextMenuLabel>
            <ContextMenuRadioGroup value={keyOf(props.value)}>
              {ROUNDING_OPTIONS.map((option) => (
                <ContextMenuRadioItem key={option.label} value={keyOf(option.digits)} onClick={() => choose(keyOf(option.digits))}>
                  {option.label}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" size="icon-xs" variant="ghost" aria-label={`Redondeo del ${props.label}`} title={title} data-rounding-trigger="">
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Redondeo del {props.label}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={keyOf(props.value)} onValueChange={(key) => choose(String(key))}>
              {ROUNDING_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.label} value={keyOf(option.digits)}>{option.label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
