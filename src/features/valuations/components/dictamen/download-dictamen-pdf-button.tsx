"use client";

import { FileArchive, FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const DOCUMENTS = {
  dictamen: { path: "dictamen/pdf", label: "Descargar PDF", filename: "Dictamen.pdf", generating: "Generando el dictamen…", done: "Dictamen descargado." },
  memoria: { path: "memoria-calculo/pdf", label: "Memoria de cálculo", filename: "Memoria-de-calculo.pdf", generating: "Generando memoria…", done: "Memoria descargada." },
  /** The dictamen and its calculation memory, together in one .zip. */
  entregables: { path: "entregables", label: "Informe y memoria (.zip)", filename: "Entregables.zip", generating: "Generando el informe y la memoria…", done: "Informe y memoria descargados." },
} as const;

/**
 * Asks the server for a PDF of the valuation and saves it: the dictamen (which
 * also stays with the valuation), its calculation memory, or both in a .zip.
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
  variant?: "outline" | "default";
}) {
  const [pending, setPending] = useState(false);
  const target = DOCUMENTS[kind];

  const download = async () => {
    setPending(true);
    // The download gives no sign of its own: the toast says it is generating and when it is saved.
    const notice = toast.loading(target.generating);
    try {
      const response = await fetch(`/api/avaluos/${valuationId}/${target.path}`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(response.status === 401 ? "Tu sesión expiró. Vuelve a iniciar sesión." : body?.error ?? "No se pudo generar el documento.");
      }
      const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? target.filename;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(target.done, { id: notice });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el PDF.", { id: notice });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button variant={variant} onClick={() => void download()} disabled={pending}>
      {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : kind === "entregables" ? <FileArchive data-icon="inline-start" /> : <FileDown data-icon="inline-start" />}
      {pending ? (kind === "entregables" ? "Generando los dos PDF…" : "Generando PDF…") : label ?? target.label}
    </Button>
  );
}
