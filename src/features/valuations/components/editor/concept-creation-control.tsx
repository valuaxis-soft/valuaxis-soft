"use client";

import type { Concept, ConceptType } from "@/features/valuations/model";
import { Copy, FilePlus2, Link, Link2, ListPlus } from "lucide-react";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UNTITLED_CARATULA_CONCEPT } from "@/features/valuations/services/caratula-blocks";

type ConceptReference ={
    concept: Concept;
    source: string;
}

const CONCEPT_TYPE_OPTIONS: Array<{
    type: ConceptType;
    label: string;
    Icon?: typeof Link;
}> = [
    { type: "text", label: "Texto" },
    { type: "date", label: "Fecha" },
    { type: "phone", label: "Teléfono" },
    { type: "email", label: "Correo" },
    { type: "number", label: "Número"},
    { type: "url", label: "Url", Icon: FilePlus2 },
    { type: "longText", label: "Texto largo", Icon: ListPlus },
];

function conceptTypeLabel(type: ConceptType | undefined) {
  const labels: Record<ConceptType, string> = {
    text: "Texto",
    date: "Fecha",
    phone: "Teléfono",
    email: "Correo",
    number: "Número",
    currency: "Moneda",
    measurement: "Medida",
    longText: "Texto largo",
    url: "Vínculo / URL",
  };

  return labels[type ?? "text"];
}

function conceptPreview(value: string) {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > 42 ? `${compact.slice(0, 42)}…` : compact || "Sin dato";
}

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
  onAddConcept: (type?: ConceptType) => void;
  onAddConceptFromExisting?: (
    concept: Concept,
    mode: "copy" | "full" | "value"
  ) => void;
  onConceptSearchChange: (value: string) => void;
  readOnly: boolean;
  triggerClassName?: string;
  triggerVariant?: "ghost" | "outline";
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" size="sm" variant={triggerVariant} className={triggerClassName} disabled={readOnly}>
            <ListPlus data-icon="inline-start" />
            Concepto
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Crear concepto</p>
            <div className="flex flex-wrap gap-1.5">
              {CONCEPT_TYPE_OPTIONS.map((option) => (
                <Button
                  key={option.type}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => onAddConcept(option.type)}
                >
                  {option.Icon ? <option.Icon data-icon="inline-start" /> : null}
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          {onAddConceptFromExisting ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Usar concepto existente</p>
              <Input
                className="h-8"
                value={conceptSearch}
                placeholder="Buscar concepto"
                onChange={(event) => onConceptSearchChange(event.target.value)}
              />
              <div className="flex max-h-56 flex-col gap-1 overflow-auto">
                {conceptReferences.length ? conceptReferences.slice(0, 8).map(({ concept, source }) => (
                  <div key={`${source}-${concept.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 py-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-xs font-medium">{concept.label || UNTITLED_CARATULA_CONCEPT}</span>
                        <Badge variant="secondary" className="h-5 px-1 text-[10px]">{conceptTypeLabel(concept.type)}</Badge>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{conceptPreview(concept.value)} · {source}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-7"
                        title="Copiar independiente. No se sincroniza."
                        aria-label="Copiar independiente. No se sincroniza."
                        onClick={() => onAddConceptFromExisting(concept, "copy")}
                      >
                        <Copy />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-7"
                        title="Vincular completo. Título y dato se sincronizan."
                        aria-label="Vincular completo. Título y dato se sincronizan."
                        onClick={() => onAddConceptFromExisting(concept, "full")}
                      >
                        <Link2 />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-7"
                        title="Vincular solo dato. Solo el dato se sincroniza."
                        aria-label="Vincular solo dato. Solo el dato se sincroniza."
                        onClick={() => onAddConceptFromExisting(concept, "value")}
                      >
                        <Link />
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="text-xs text-muted-foreground">No hay conceptos para reutilizar.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}