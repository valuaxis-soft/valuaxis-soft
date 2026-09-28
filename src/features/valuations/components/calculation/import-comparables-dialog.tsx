"use client";

import { CheckCircle2, FileDown, FileSpreadsheet, Loader2, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { ComparableImportPreview } from "@/features/valuations/calculation/comparable-import";
import type { ComparableType, MarketCalculationDto } from "@/features/valuations/calculation/market-types";
import { cn } from "@/lib/utils";

const number = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits: 2 }));
const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo leer el archivo.";

/** Comparables from the Valuaxis Excel template: preview with row errors, then import the valid ones. */
export function ImportComparablesDialog({
  valuationId,
  type,
  onImported,
}: {
  valuationId: string;
  type: ComparableType;
  onImported: (calculation: MarketCalculationDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ComparableImportPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = "";
  };

  const choose = async (next: File | undefined) => {
    if (!next) return;
    setFile(next);
    setPreview(null);
    setBusy("preview");
    try {
      setPreview((await api.market.previewImport(valuationId, type, next)).preview);
    } catch (error) {
      toast.error(errorMessage(error));
      reset();
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (!file) return;
    setBusy("import");
    try {
      const result = await api.market.importComparables(valuationId, type, file);
      onImported(result.calculation);
      const skipped = result.preview.invalid;
      toast.success(`${result.imported} comparable${result.imported === 1 ? "" : "s"} importado${result.imported === 1 ? "" : "s"}${skipped ? `; ${skipped} con errores se omitieron` : ""}.`);
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheet data-icon="inline-start" /> Importar Excel
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (busy === null) { setOpen(next); if (!next) reset(); } }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importar comparables desde Excel</DialogTitle>
            <DialogDescription>
              Llena la plantilla, un comparable por renglón, y súbela aquí. Antes de guardar verás qué renglones tienen errores.
              Los factores y las fotos se capturan después.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <a className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/api/comparables/plantilla?tipo=${type}`} download>
              <FileDown data-icon="inline-start" /> Descargar plantilla
            </a>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(event) => void choose(event.target.files?.[0])}
            />
            <Button type="button" size="sm" disabled={busy !== null} onClick={() => input.current?.click()}>
              {busy === "preview" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FileSpreadsheet data-icon="inline-start" />}
              {file ? "Elegir otro archivo" : "Elegir archivo"}
            </Button>
            {file ? <span className="truncate text-xs text-muted-foreground">{file.name}</span> : null}
          </div>

          {preview ? (
            <div className="grid gap-2">
              <p className="text-sm">
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{preview.valid} listos para importar</span>
                {preview.invalid ? <span className="text-destructive"> · {preview.invalid} con errores (se omiten)</span> : null}
                {preview.tooManyRows ? <span className="text-amber-700"> · solo se leen los primeros 100</span> : null}
              </p>
              <div className="max-h-80 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="text-left">
                      <th className="px-2 py-1.5">Renglón</th>
                      <th className="px-2 py-1.5">Ubicación</th>
                      <th className="px-2 py-1.5 text-right">Superficie</th>
                      <th className="px-2 py-1.5 text-right">Precio</th>
                      <th className="px-2 py-1.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.row} className="border-t align-top">
                        <td className="px-2 py-1.5 tabular-nums">{row.row}</td>
                        <td className="px-2 py-1.5">{row.location || <span className="text-muted-foreground">(vacía)</span>}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{number(row.area)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{number(row.price)}</td>
                        <td className="px-2 py-1.5">
                          {row.errors.length ? (
                            <span className="flex items-start gap-1 text-destructive"><XCircle className="mt-0.5 size-3.5 shrink-0" />{row.errors.join(" ")}</span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-3.5" />Listo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>
            <Button type="button" disabled={busy !== null || !preview?.valid} onClick={() => void confirm()}>
              {busy === "import" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              Importar {preview?.valid ?? 0} comparable{preview?.valid === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
