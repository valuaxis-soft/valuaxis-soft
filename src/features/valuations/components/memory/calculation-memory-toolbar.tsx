"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DownloadDictamenPdfButton } from "../dictamen/download-dictamen-pdf-button";

/** Above the memory on screen; it does not print. */
export function CalculationMemoryToolbar({ folio, valuationId }: { folio: string; valuationId: string }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/workspace?id=${valuationId}`} />}>
          <ArrowLeft data-icon="inline-start" />
          Volver al editor
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">Memoria de cálculo {folio}</h1>
          <p className="text-xs text-muted-foreground">Cómo se obtuvo cada valor calculado del avalúo.</p>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer data-icon="inline-start" />
          Imprimir
        </Button>
        <DownloadDictamenPdfButton kind="memoria" label="Descargar PDF" valuationId={valuationId} />
        <DownloadDictamenPdfButton kind="entregables" variant="outline" valuationId={valuationId} />
      </div>
    </header>
  );
}
