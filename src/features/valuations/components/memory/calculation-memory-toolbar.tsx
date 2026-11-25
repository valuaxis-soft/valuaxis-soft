"use client";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DownloadDictamenPdfButton } from "../dictamen/download-dictamen-pdf-button";
import { ExportPrintButton } from "../dictamen/export-notice";
import { DELIVERABLES_NEED_CONCLUSION } from "@/features/valuations/lifecycle-rules";

/** Above the memory on screen; it does not print. */
export function CalculationMemoryToolbar({ concluded, folio, valuationId }: {
  /** Not concluded: a preview on screen, with no print, PDF or .zip (lifecycle-rules.ts). */
  concluded: boolean;
  folio: string;
  valuationId: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
        {/* A full load: this page keeps the strict CSP of a printed document, and the editor needs Google's for its map. */}
        <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`/workspace?id=${valuationId}`} />}>
          <ArrowLeft data-icon="inline-start" />
          Volver al editor
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">Memoria de cálculo {folio}</h1>
          <p className="text-xs text-muted-foreground">Cómo se obtuvo cada valor calculado del avalúo.</p>
        </div>
        {concluded ? (
          <>
            <ExportPrintButton />
            <DownloadDictamenPdfButton kind="memoria" label="Descargar PDF" valuationId={valuationId} />
            <DownloadDictamenPdfButton kind="entregables" variant="outline" valuationId={valuationId} />
          </>
        ) : null}
      </div>
      {!concluded ? (
        <p role="status" className="border-t bg-highlight/15 px-4 py-2 text-center text-sm" data-preview-only="">
          <strong>Vista previa.</strong> {DELIVERABLES_NEED_CONCLUSION}
        </p>
      ) : null}
    </header>
  );
}
