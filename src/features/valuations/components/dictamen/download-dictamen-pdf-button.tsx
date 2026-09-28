"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Asks the server for the dictamen PDF and saves it; it also stays with the valuation. */
export function DownloadDictamenPdfButton({ valuationId }: { valuationId: string }) {
  const [pending, setPending] = useState(false);

  const download = async () => {
    setPending(true);
    try {
      const response = await fetch(`/api/avaluos/${valuationId}/dictamen/pdf`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(response.status === 401 ? "Tu sesión expiró. Vuelve a iniciar sesión." : body?.error ?? "No se pudo generar el PDF.");
      }
      const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "Dictamen.pdf";
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
    <Button onClick={() => void download()} disabled={pending}>
      {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FileDown data-icon="inline-start" />}
      {pending ? "Generando PDF…" : "Descargar PDF"}
    </Button>
  );
}
