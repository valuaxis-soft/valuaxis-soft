"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, FilePlus2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AppSection, Letterhead } from "../model";
import { documentNumberPresentation } from "../services/number-presentation";
import { documentPagePresentation } from "../services/page-presentation";
import { NumberPresentationProvider } from "./number-presentation-context";
import { PagePresentationProvider } from "./page-presentation-context";
import { SectionDocument } from "./report-preview";
import { caratulaFromValuation, initialMetaFor } from "./workspace/model/initial-hydration";
import { flattenSectionConcepts, getDocumentHeaderImage, resolveSectionConceptsForDisplay } from "./workspace/model/section-content";

/** The sections a template prints: enabled, with something in them. */
export const printableTemplateSections = (sections: AppSection[]) =>
  sections.filter((section) => section.enabled !== false && section.blocks.length > 0);

/**
 * "Vista previa" of a firm's template: its sections as the dictamen prints
 * them, one at a time, with the previous and next ones and a list to jump to
 * any, before creating a valuation with it. Read when it opens; nothing is
 * saved.
 */
export function TemplatePreviewButton(props: { templateId: string; name: string; letterhead: Letterhead; canCreate: boolean; number: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Eye data-icon="inline-start" /> Vista previa
      </Button>
      {open ? <TemplatePreviewDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function TemplatePreviewDialog(props: { templateId: string; name: string; letterhead: Letterhead; canCreate: boolean; number: number; onClose: () => void }) {
  const [state, setState] = useState<{ sections: AppSection[] } | { error: string } | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let active = true;
    api.templates.get(props.templateId)
      .then((template) => { if (active) setState({ sections: template.content.sections }); })
      .catch((error: unknown) => { if (active) setState({ error: error instanceof Error ? error.message : "No se pudo cargar la plantilla." }); });
    return () => { active = false; };
  }, [props.templateId]);

  const preview = useMemo(() => {
    if (!state || "error" in state) return null;
    const meta = initialMetaFor(null);
    const sections = printableTemplateSections(state.sections);
    const allConcepts = flattenSectionConcepts(state.sections);
    return {
      meta,
      caratula: caratulaFromValuation(null, meta, state.sections),
      headerImage: getDocumentHeaderImage(state.sections),
      numbers: documentNumberPresentation(state.sections),
      pages: documentPagePresentation(state.sections),
      sections: sections.map((section) => resolveSectionConceptsForDisplay(section, allConcepts)),
    };
  }, [state]);
  const section = preview?.sections[Math.min(index, preview.sections.length - 1)] ?? null;
  const count = preview?.sections.length ?? 0;
  const sectionName = (item: AppSection) => [item.label, item.title].filter(Boolean).join(". ");

  return (
    <Dialog open onOpenChange={(next) => { if (!next) props.onClose(); }}>
      <DialogContent className="flex max-h-[94vh] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Plantilla {props.number}: {props.name}</DialogTitle>
          <DialogDescription>Vista de impresión de cada sección con sus bloques, como la imprimirá el dictamen. Nada se guarda.</DialogDescription>
        </DialogHeader>
        {state === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando la plantilla…</p>
        ) : "error" in state ? (
          <p className="text-sm text-destructive" role="alert">{state.error}</p>
        ) : !preview || !section ? (
          <p className="text-sm text-muted-foreground">La plantilla no tiene secciones con contenido.</p>
        ) : (
          <>
            <nav className="flex flex-wrap items-center gap-2" aria-label="Secciones de la plantilla">
              <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>
                <ChevronLeft data-icon="inline-start" /> Anterior
              </Button>
              <NativeSelect
                size="sm"
                aria-label="Sección"
                className="min-w-0 flex-1 sm:max-w-sm"
                value={String(Math.min(index, count - 1))}
                onChange={(event) => setIndex(Number(event.target.value))}
              >
                {preview.sections.map((item, position) => (
                  <NativeSelectOption key={item.id} value={String(position)}>{sectionName(item)} ({item.blocks.length} {item.blocks.length === 1 ? "bloque" : "bloques"})</NativeSelectOption>
                ))}
              </NativeSelect>
              <Button type="button" size="sm" variant="outline" disabled={index >= count - 1} onClick={() => setIndex((current) => Math.min(count - 1, current + 1))}>
                Siguiente <ChevronRight data-icon="inline-end" />
              </Button>
              <span className="text-xs text-muted-foreground">Sección {Math.min(index, count - 1) + 1} de {count}</span>
            </nav>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-3" data-template-preview={section.id}>
              <NumberPresentationProvider presentation={preview.numbers}>
                <PagePresentationProvider presentation={preview.pages}>
                  <div className="mx-auto w-fit">
                    <SectionDocument
                      caratula={preview.caratula}
                      letterhead={props.letterhead}
                      documentHeaderImage={preview.headerImage}
                      meta={preview.meta}
                      principalCoverImage={null}
                      section={section}
                    />
                  </div>
                </PagePresentationProvider>
              </NumberPresentationProvider>
            </div>
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onClose}>Cerrar</Button>
          {props.canCreate ? (
            <Link href={`/workspace?action=new&plantilla=${props.templateId}`} className={cn(buttonVariants())}>
              <FilePlus2 data-icon="inline-start" /> Crear avalúo con esta plantilla
            </Link>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
