"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const DOCUMENTS = {
  dictamen: { path: "dictamen/pdf", label: "Descargar PDF", filename: "Dictamen.pdf" },
  memoria: { path: "memoria-calculo/pdf", label: "Memoria de cálculo", filename: "Memoria-de-calculo.pdf" },
} as const;

/**
 * Asks the server for a PDF of the valuation and saves it: the dictamen (which
 * also stays with the valuation) or its calculation memory.
 */
export function DownloadDictamenPdfButton({
  kind = "dictamen",
  label,
  valuationId,
  variant,
}: {
  kind?: keyof typeof DOCUMENTS;
  /** Instead of the document's own label. */
  label?: string;
  valuationId: string;
  variant?: "outline";
}) {
  const [pending, setPending] = useState(false);
  const target = DOCUMENTS[kind];

  const download = async () => {
    setPending(true);
    try {
      const response = await fetch(`/api/avaluos/${valuationId}/${target.path}`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(response.status === 401 ? "Tu sesión expiró. Vuelve a iniciar sesión." : body?.error ?? "No se pudo generar el PDF.");
      }
      const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? target.filename;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el PDF.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button variant={variant} onClick={() => void download()} disabled={pending}>
      {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FileDown data-icon="inline-start" />}
      {pending ? "Generando PDF…" : label ?? target.label}
    </Button>
  );
}
