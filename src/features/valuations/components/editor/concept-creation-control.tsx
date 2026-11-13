"use client";

import { useState } from "react";
import type { Concept, ConceptCreationKind } from "@/features/valuations/model";
import { Copy, Link, Link2, ListPlus, X } from "lucide-react";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UNTITLED_CARATULA_CONCEPT } from "@/features/valuations/services/caratula-blocks";
import { CONCEPT_CREATION_OPTIONS, conceptTypeLabel } from "@/features/valuations/services/concept-types";
import { stripTextMarks } from "@/features/valuations/services/text-marks";
import { usePopoverDragGuard } from "./popover-drag-guard";

type ConceptReference ={
    concept: Concept;
    source: string;
}

/** The value as the picker lists it: its whole text, without the bold, italic or underline tags. */
export function conceptPreview(value: string) {
  return stripTextMarks(value).trim().replace(/\s+/g, " ") || "Sin dato";
}

/** How many existing concepts the picker lists at once; the search narrows them. */
const LISTED_REFERENCES = 30;

/**
 * The three ways to reuse an existing concept, each with its name on the
 * button, not only an icon (Álvaro, video 5.6: «no sé qué hace cada uno»).
 */
const EXISTING_CONCEPT_MODES: ReadonlyArray<{ mode: "copy" | "full" | "value"; label: string; hint: string; icon: typeof Copy }> = [
  { mode: "copy", label: "Copiar", hint: "Una copia independiente: no se sincroniza.", icon: Copy },
  { mode: "full", label: "Vincular todo", hint: "Título y dato se sincronizan con el original.", icon: Link2 },
  { mode: "value", label: "Vincular dato", hint: "Solo el dato se sincroniza; el título es propio.", icon: Link },
];

export function ConceptCreationControl({
  conceptReferences,
  conceptSearch,
  onAddConcept,
  onAddConceptFromExisting,
  onConceptSearchChange,
  readOnly,
  triggerClassName,
  triggerVariant = "outline",
}: {
  conceptReferences: ConceptReference[];
  conceptSearch: string;
  onAddConcept: (kind?: ConceptCreationKind) => void;
  onAddConceptFromExisting?: (
    concept: Concept,
    mode: "copy" | "full" | "value"
  ) => void;
  onConceptSearchChange: (value: string) => void;
  readOnly: boolean;
  triggerClassName?: string;
  triggerVariant?: "ghost" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const keepOpen = usePopoverDragGuard();
  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (keepOpen(next, details)) return;
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button type="button" size="sm" variant={triggerVariant} className={triggerClassName} disabled={readOnly}>
            <ListPlus data-icon="inline-start" />
            Concepto
          </Button>
        }
      />
      <PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] p-4" data-concept-creation="">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Crear concepto</p>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Cerrar"
                title="Cerrar"
                data-concept-creation-close=""
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2" data-concept-types>
              {CONCEPT_CREATION_OPTIONS.map((option) => (
                <Button
                  key={option.kind}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-sm"
                  onClick={() => onAddConcept(option.kind)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          {onAddConceptFromExisting ? (
            <div className="flex flex-col gap-2 border-t pt-3">
              <p className="text-sm font-semibold">Usar concepto existente</p>
              <Input
                className="h-9"
                value={conceptSearch}
                placeholder="Buscar por título, dato o sección"
                aria-label="Buscar concepto existente"
                onChange={(event) => onConceptSearchChange(event.target.value)}
              />
              <div className="flex max-h-[min(24rem,50vh)] flex-col gap-2 overflow-auto pr-1" data-existing-concepts>
                {conceptReferences.length ? conceptReferences.slice(0, LISTED_REFERENCES).map(({ concept, source }) => (
                  // Each concept in its own box: its title, its whole value and where it is.
                  <div key={`${source}-${concept.id}`} className="grid gap-1.5 rounded-md border bg-card p-2.5" data-existing-concept={concept.id}>
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-sm font-medium wrap-break-word">{concept.label || UNTITLED_CARATULA_CONCEPT}</span>
                      <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px]">{conceptTypeLabel(concept.type)}</Badge>
                    </div>
                    {/* Up to four lines of the value, the whole of it on hover: a long text does not bury the list. */}
                    <p className="line-clamp-4 text-sm wrap-break-word text-foreground/90" title={conceptPreview(concept.value)}>{conceptPreview(concept.value)}</p>
                    <p className="text-xs text-muted-foreground">{source}</p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {EXISTING_CONCEPT_MODES.map(({ mode, label, hint, icon: Icon }) => (
                        <Button
                          key={mode}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-sm"
                          title={hint}
                          onClick={() => onAddConceptFromExisting(concept, mode)}
                        >
                          <Icon data-icon="inline-start" />
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No hay conceptos para reutilizar.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Copiar: independiente. Vincular todo: título y dato iguales al original. Vincular dato: solo el dato.
              </p>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
