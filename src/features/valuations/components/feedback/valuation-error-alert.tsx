"use client";

import { ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DownloadDictamenPdfButton } from "../dictamen/download-dictamen-pdf-button";

/**
 * Why the capture is read-only. A concluded valuation also offers its two
 * deliverables, the dictamen and the calculation memory, together.
 */
export function ReadOnlyValuationAlert({ reason = "role", deliverablesOf }: {
  reason?: "role" | "concluded";
  /** The valuation whose PDFs the user may download; absent without the export permission. */
  deliverablesOf?: string | null;
}) {
  return (
    <Alert>
      <ShieldCheck />
      <AlertTitle>{reason === "concluded" ? "Avalúo concluido" : "Modo consulta"}</AlertTitle>
      <AlertDescription>
        {reason === "concluded"
          ? "Esta versión está cerrada. Para corregirla, reábrela: se creará una versión nueva y esta se conserva."
          : "Tu rol permite ver y exportar avalúos, pero no editar su captura."}
        {reason === "concluded" && deliverablesOf ? (
          <div className="mt-2 grid gap-2" data-deliverables>
            <p className="font-medium text-foreground">Entregables: el informe en PDF y su memoria de cálculo.</p>
            <div className="flex flex-wrap gap-2">
              <DownloadDictamenPdfButton valuationId={deliverablesOf} label="Informe (PDF)" variant="outline" />
              <DownloadDictamenPdfButton kind="memoria" label="Memoria de cálculo (PDF)" variant="outline" valuationId={deliverablesOf} />
              <DownloadDictamenPdfButton kind="entregables" label="Los dos (.zip)" variant="default" valuationId={deliverablesOf} />
            </div>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
