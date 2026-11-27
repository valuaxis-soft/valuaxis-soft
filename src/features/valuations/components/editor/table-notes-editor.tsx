"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DEFAULT_HOMOLOGATION_NOTE } from "@/features/valuations/calculation/market-document";
import type { GeneratedTableNote, TableNote, TableV2 } from "@/features/valuations/services/table";
import { cn } from "@/lib/utils";
import { CommitCell } from "../calculation/commit-cell";

const POSITION_LABELS: Record<TableNote["position"], string> = {
  top: "Arriba de la tabla",
  table: "Justo debajo",
  bottom: "Al final",
};

/**
 * Whether a table reads as a homologation: a double header of factors and a
 * resultant column (FRe, «Factor resultante», «Resultante»). Such a table is
 * offered the note of the format under it (video 8.12, 13:50: «que esto lo
 * detecten automático… y me pongan esto»), with no special kind of table.
 */
export function readsAsHomologation(table: Pick<TableV2, "columns" | "schema">): boolean {
  const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const factors = (table.schema?.headerGroups ?? []).some((group) => /factor/.test(plain(group.title)));
  const resultant = table.columns.some((column) => /^(f\.?\s*re\b|fre\b|factor resultante|resultante)/.test(plain(column.name.trim())));
  return factors && resultant;
}

/**
 * The notes printed with a table (the small texts over and under it), as any
 * concept of the editor: in the size of the text, written in place, added,
 * taken out and moved (video 8.7, 02:36: «que se vean… y que también sea
 * editable de poder agregar otro dato, quitarlos»). The same in every
 * approach and in the appraiser's own tables.
 */
export function TableNotesEditor(props: {
  notes: GeneratedTableNote[];
  readOnly: boolean;
  onChange: (notes: GeneratedTableNote[]) => void;
  /** The note of the format offered to this table, when it does not have it. */
  suggestion?: string | null;
}) {
  const { readOnly } = props;
  // The justification of the factors is written in the capture's own fields, right here; the list keeps it, unseen.
  // The annex's summary of it is shown as it prints, written in each approach.
  const notes = props.notes.filter((note) => !note.justification);
  const written = props.notes.filter((note) => note.justification);
  const summary = written.filter((note) => note.fromApproach);
  const emit = (next: GeneratedTableNote[]) => props.onChange([...next, ...written]);
  const change = (index: number, patch: Partial<GeneratedTableNote>) => emit(notes.map((note, at) => (at === index ? { ...note, ...patch } : note)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...notes];
    const [note] = next.splice(index, 1);
    next.splice(index + by, 0, note);
    emit(next);
  };
  const suggestion = props.suggestion && !notes.some((note) => note.text.trim() === props.suggestion?.trim()) ? props.suggestion : null;
  if (readOnly && !notes.length && !summary.length) return null;
  return (
    <div className="mt-2 grid gap-1.5" data-table-notes-editor="">
      {summary.length ? (
        <div className="grid gap-0.5 rounded-md border border-l-4 border-l-primary/60 bg-primary/5 px-3 py-2 text-sm" data-justification-summary="">
          {summary.map((note, index) => (note.heading ? (
            <p key={index} className="font-semibold text-primary">{note.text}</p>
          ) : (
            <p key={index}>{note.label ? <strong className="text-primary">{note.label} </strong> : null}{note.text}</p>
          )))}
          <p className="text-xs text-muted-foreground">Es el resumen de lo que escribiste en cada enfoque: se cambia allá, en «Justificación de los factores utilizados».</p>
        </div>
      ) : null}
      {notes.map((note, index) => (
        <div key={`${note.key ?? "own"}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2" data-table-note={note.position}>
          <CommitCell
            ariaLabel={`Nota ${index + 1} de la tabla`}
            disabled={readOnly}
            value={note.label ? `${note.label} ${note.text}` : note.text}
            placeholder="Texto de la nota"
            className={cn("border-input text-sm text-foreground", note.heading && "font-semibold", note.small && "italic")}
            onCommit={(text) => {
              const typed = text.trim();
              if (!typed) return;
              // A label written before the text ("Comparable 1: …") stays the label.
              if (note.label && typed.startsWith(note.label)) change(index, { text: typed.slice(note.label.length).trim() });
              else change(index, { text: typed, label: undefined });
            }}
          />
          {!readOnly ? (
            <span className="flex items-center gap-0.5">
              <NativeSelect
                size="sm"
                aria-label={`Lugar de la nota ${index + 1}`}
                value={note.position}
                className="w-36 text-xs"
                onChange={(event) => change(index, { position: event.target.value as TableNote["position"] })}
              >
                {(Object.keys(POSITION_LABELS) as Array<TableNote["position"]>).map((position) => (
                  <NativeSelectOption key={position} value={position}>{POSITION_LABELS[position]}</NativeSelectOption>
                ))}
              </NativeSelect>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir la nota ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar la nota ${index + 1}`} disabled={index === notes.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-destructive"
                aria-label={`Quitar la nota ${index + 1}`}
                title="Quitar la nota (se deshace con Ctrl+Z)"
                onClick={() => emit(notes.filter((_, at) => at !== index))}
              >
                <Trash2 />
              </Button>
            </span>
          ) : null}
        </div>
      ))}
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => emit([...notes, { position: "bottom", text: "Nota" }])}>
            <Plus data-icon="inline-start" /> Agregar nota
          </Button>
          {suggestion ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              title={suggestion}
              data-suggested-note=""
              onClick={() => emit([...notes, { position: "table", text: suggestion }])}
            >
              <Plus data-icon="inline-start" /> Agregar la nota de la homologación
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The note of the format a table that reads as a homologation is offered. */
export const homologationNoteSuggestion = (table: Pick<TableV2, "columns" | "schema">) => (readsAsHomologation(table) ? DEFAULT_HOMOLOGATION_NOTE : null);
