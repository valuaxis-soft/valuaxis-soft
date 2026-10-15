"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ListChecks, Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Concept } from "@/features/valuations/model";

/**
 * Several concepts of one block or apartado chosen at once, to give them
 * the same "Espacio" in a single step. The scope owns the choice; the rows
 * read it to show their checkbox.
 */
type ConceptSelection = {
  selected: ReadonlySet<string>;
  toggle: (conceptId: string) => void;
};

const ConceptSelectionContext = createContext<ConceptSelection | null>(null);

/** The selection in progress around this concept, if any. */
export function useConceptSelection() {
  return useContext(ConceptSelectionContext);
}

/** The checkbox a concept row shows while its container is selecting concepts. */
export function ConceptSelectionCheckbox({ conceptId, label }: { conceptId: string; label: string }) {
  const selection = useConceptSelection();
  if (!selection) return null;
  const title = `Seleccionar ${label || "concepto"}`;
  return (
    <span className="flex size-7 items-center justify-center">
      <Checkbox
        aria-label={title}
        checked={selection.selected.has(conceptId)}
        onCheckedChange={() => selection.toggle(conceptId)}
      />
    </span>
  );
}

/** The spacing of the chosen concepts when they all share one; null when they differ. */
export function commonSpacingAfter(concepts: Array<Pick<Concept, "spacingAfter">>): number | null {
  const values = new Set(concepts.map((concept) => concept.spacingAfter ?? 0));
  return values.size === 1 ? [...values][0] : null;
}

export function ConceptSelectionScope({
  concepts,
  readOnly,
  onApplySpacing,
  actions,
  children,
}: {
  concepts: Concept[];
  readOnly: boolean;
  /** Gives every chosen concept the spacing, in one update. */
  onApplySpacing: (conceptIds: string[], spacingAfter: number) => void;
  /** The creation controls of the container, printed on the same line as the selection. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Concepts removed meanwhile drop out of the choice.
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const chosen = concepts.filter((concept) => selected.has(concept.id));
  const spacing = commonSpacingAfter(chosen);

  const toggle = (conceptId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(conceptId)) next.delete(conceptId);
    else next.add(conceptId);
    return next;
  });
  const stop = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const apply = (spacingAfter: number) => {
    if (!chosen.length) return;
    onApplySpacing(chosen.map((concept) => concept.id), Math.max(0, spacingAfter));
  };

  const toolbar = readOnly || concepts.length < 2 ? null : selecting ? (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs" data-concept-selection>
      <span className="tabular-nums">{chosen.length} de {concepts.length} seleccionados</span>
      <Button type="button" size="xs" variant="ghost" onClick={() => setSelected(new Set(conceptIds))}>
        Todos
      </Button>
      <Button type="button" size="xs" variant="ghost" disabled={!chosen.length} onClick={() => setSelected(new Set())}>
        Ninguno
      </Button>
      <span className="mx-1 h-4 border-l" aria-hidden="true" />
      <span className="text-muted-foreground">Espacio</span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Disminuir espacio de los seleccionados"
        disabled={!chosen.length || (spacing ?? 0) <= 0}
        onClick={() => apply((spacing ?? 0) - 1)}
      >
        <Minus />
      </Button>
      <span className="min-w-[1.5rem] text-center tabular-nums" title={spacing === null ? "Los seleccionados tienen espacios distintos" : undefined}>
        {spacing ?? "—"}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Aumentar espacio de los seleccionados"
        disabled={!chosen.length}
        onClick={() => apply((spacing ?? 0) + 1)}
      >
        <Plus />
      </Button>
      <Button type="button" size="xs" variant="outline" className="ml-1" onClick={stop}>
        <X data-icon="inline-start" />
        Listo
      </Button>
    </div>
  ) : (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      title="Elegir varios conceptos y darles el mismo espacio"
      onClick={() => setSelecting(true)}
    >
      <ListChecks data-icon="inline-start" />
      Seleccionar conceptos
    </Button>
  );

  return (
    <ConceptSelectionContext.Provider value={selecting && !readOnly ? { selected, toggle } : null}>
      {actions || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {toolbar}
        </div>
      ) : null}
      {children}
    </ConceptSelectionContext.Provider>
  );
}
