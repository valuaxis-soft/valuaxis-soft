"use client";

import { useState } from "react";
import { PencilLine } from "lucide-react";

import { Input } from "@/components/ui/input";

/** The longest name of a datum of the card (market-schemas.ts, `fieldLabels`). */
const CARD_FIELD_NAME_MAX = 60;

/**
 * The name of a datum of the card that the market can rename (video 8.9:
 * «si yo cambio el nombre de la columna, también en las fichas», and back):
 * the label of its field, with «Cambiar nombre» beside it. The name is
 * written in place, as the names of «Características agregadas»; Enter or
 * leaving the field keeps it, Esc leaves it as it was, and an empty name
 * gives back the card's own.
 */
export function SheetFieldName(props: { label: string; htmlFor?: string; fieldKey: string; onRename: (label: string) => void; autoComplete: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (editing !== null) {
    const done = (keep: boolean) => {
      setEditing(null);
      if (keep && editing.trim() !== props.label.trim()) props.onRename(editing);
    };
    return (
      <Input
        autoFocus
        autoComplete={props.autoComplete}
        aria-label={`Nombre de «${props.label}» en las fichas y columnas de este mercado`}
        className="h-6 bg-background px-1 text-xs font-medium"
        maxLength={CARD_FIELD_NAME_MAX}
        value={editing}
        data-field-name-input={props.fieldKey}
        onChange={(event) => setEditing(event.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); done(true); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); done(false); }
        }}
      />
    );
  }
  return (
    <span className="flex min-w-0 items-start gap-1">
      {props.htmlFor ? <label htmlFor={props.htmlFor}>{props.label}</label> : <span>{props.label}</span>}
      <button
        type="button"
        className="-my-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Cambiar el nombre de «${props.label}»`}
        title="Cambiar nombre: se cambia también en las columnas de las tablas de este mercado"
        data-field-rename={props.fieldKey}
        onClick={() => setEditing(props.label)}
      >
        <PencilLine className="size-3" />
      </button>
    </span>
  );
}
