"use client";

import { AlertTriangle, CheckCircle2, Copy, FileDown, FileSpreadsheet, Loader2, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatComparableId, formatDay } from "@/features/valuations/calculation/comparable-card";
import { DUPLICATE_REASON_LABELS } from "@/features/valuations/calculation/comparable-duplicates";
import { IMPORT_DESTINATIONS, IMPORT_DESTINATION_LABELS, type ImportDestination } from "@/features/valuations/calculation/comparable-master";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { ComparableImportPreview, ImportBaseCounts, ImportTargetDto } from "@/features/valuations/calculation/comparable-import";
import { COMPARABLE_TYPES, COMPARABLE_TYPE_LABELS, type ComparableType, type MarketCalculationDto } from "@/features/valuations/calculation/market-types";
import { cn } from "@/lib/utils";

const number = (value: number | null | undefined) => (value === null || value === undefined ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits: 2 }));
const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo leer el archivo.";

/** The answers to the possible duplicates, as the import takes them: rows to reuse and rows to merge. */
function splitAnswers(answers: Record<number, string>) {
  const reuse: Record<number, string> = {};
  const merge: Record<number, string> = {};
  for (const [row, answer] of Object.entries(answers)) {
    const [kind, id] = answer.split(":");
    if (kind === "reuse" && id) reuse[Number(row)] = id;
    if (kind === "merge" && id) merge[Number(row)] = id;
  }
  return { reuse, merge };
}

/** The answers the preview proposes: "es el mismo" for each exact match (same number, publication or URL). */
const suggestedAnswers = (preview: ComparableImportPreview) =>
  Object.fromEntries(preview.rows.flatMap((row) => (row.suggested ? [[row.row, row.suggested]] : [])));

function targetLabel(target: ImportTargetDto | undefined) {
  if (!target || target.kind === "skip") return "No se importa";
  if (target.kind === "base") return `Base general · ${COMPARABLE_TYPE_LABELS[target.type]}`;
  return `Avalúo ${target.valuationFolio} · ${COMPARABLE_TYPE_LABELS[target.type]}`;
}

function baseSummary(base: ImportBaseCounts | undefined) {
  if (!base) return "";
  const parts = [
    base.created ? `${base.created} nuevo${base.created === 1 ? "" : "s"} en la base` : "",
    base.updated ? `${base.updated} actualizado${base.updated === 1 ? "" : "s"} en la base` : "",
    base.kept ? `${base.kept} ya estaba${base.kept === 1 ? "" : "n"}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

/** Where the dialog imports: a market of a valuation, or the firm's base (/comparables). */
export type ImportScope =
  | { kind: "valuation"; valuationId: string; type: ComparableType; onImported: (calculation: MarketCalculationDto) => void }
  | { kind: "base"; onImported: () => void };

/**
 * Comparables from Excel: the master workbook (any type, to a valuation, to
 * the base or both) or a market's template. The destination starts as the
 * file's INICIO says and the user confirms it; the preview shows each row's
 * errors, warnings, destination and possible duplicates before importing.
 */
/** The same name everywhere: one template, the master one, wherever it is imported from. */
const IMPORT_MASTER_LABEL = "Importar plantilla maestra";

export function ImportComparablesDialog({ scope }: { scope: ImportScope }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ComparableImportPreview | null>(null);
  const [destination, setDestination] = useState<ImportDestination | null>(null);
  // For a market's template uploaded to the base: the type of its rows.
  const [defaultType, setDefaultType] = useState<ComparableType | "">("");
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  // The answer to each possible duplicate: row → "merge:<id>" (es el mismo), "reuse:<id>" (usar el existente); none keeps both.
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setAnswers({});
    setDestination(null);
    if (input.current) input.current.value = "";
  };

  const read = async (next: File, chosen: ImportDestination | null, type: ComparableType | "") => {
    setBusy("preview");
    try {
      const result = scope.kind === "valuation"
        ? await api.market.previewImport(scope.valuationId, scope.type, next, chosen ?? undefined)
        : await api.comparableBase.previewImport(next, chosen ?? undefined, type || undefined);
      setPreview(result.preview);
      setDestination(result.preview.destination);
      setAnswers(suggestedAnswers(result.preview));
    } catch (error) {
      toast.error(errorMessage(error));
      setPreview(null);
    } finally {
      setBusy(null);
    }
  };

  const choose = async (next: File | undefined) => {
    if (!next) return;
    setFile(next);
    setPreview(null);
    // A new file starts with its own destination (INICIO).
    setDestination(null);
    await read(next, null, defaultType);
  };

  const confirm = async () => {
    if (!file || !destination) return;
    setBusy("import");
    try {
      const { reuse, merge } = splitAnswers(answers);
      const skipped = (preview?.invalid ?? 0) + (preview?.skipped ?? 0);
      if (scope.kind === "valuation") {
        const result = await api.market.importComparables(scope.valuationId, scope.type, file, reuse, merge, destination);
        scope.onImported(result.calculation);
        const base = baseSummary(result.base);
        toast.success(`${result.imported} comparable${result.imported === 1 ? "" : "s"} en el avalúo${base ? `; ${base}` : ""}${skipped ? `; ${skipped} se omitieron` : ""}.`);
      } else {
        const result = await api.comparableBase.importComparables(file, reuse, merge, destination, defaultType || undefined);
        scope.onImported();
        const base = baseSummary(result.base);
        const parts = [result.imported ? `${result.imported} agregado${result.imported === 1 ? "" : "s"} a avalúos` : "", base].filter(Boolean);
        toast.success(`${parts.join("; ") || "Sin cambios"}${skipped ? `; ${skipped} se omitieron` : ""}.`);
      }
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const templateHref = scope.kind === "valuation"
    ? `/api/comparables/plantilla?avaluo=${scope.valuationId}`
    : "/api/comparables/plantilla?destino=BASE";

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        title={scope.kind === "valuation"
          ? "La plantilla maestra de comparables (Excel): a este avalúo, a la base del despacho o a los dos"
          : "La plantilla maestra de comparables (Excel): a la base del despacho y a los avalúos de sus folios"}
        onClick={() => setOpen(true)}
      >
        <FileSpreadsheet data-icon="inline-start" /> {IMPORT_MASTER_LABEL}
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (busy === null) { setOpen(next); if (!next) reset(); } }}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{IMPORT_MASTER_LABEL}</DialogTitle>
            <DialogDescription>
              {scope.kind === "valuation"
                ? "Desde este avalúo: los comparables van a este avalúo, a la base del despacho o a los dos, según el destino que confirmes. "
                : "Desde Comparables: los comparables van a la base del despacho y, con su «Folio avalúo», a esos avalúos. "}
              Usa la plantilla maestra (cualquier tipo de comparable, a un avalúo, a la base general o a los dos) o la plantilla de un mercado.
              Antes de guardar verás los errores, los avisos, el destino de cada renglón y los posibles duplicados.
              Los factores y las fotos se capturan después, en el avalúo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <a className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={templateHref} download>
              <FileDown data-icon="inline-start" /> Plantilla maestra
            </a>
            {scope.kind === "valuation" ? (
              <a className={cn(buttonVariants({ variant: "ghost", size: "sm" }))} href={`/api/comparables/plantilla?tipo=${scope.type}`} download>
                Plantilla de este mercado
              </a>
            ) : (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Plantilla de un mercado:
                <NativeSelect
                  size="sm"
                  aria-label="Tipo de comparable de la plantilla de un mercado"
                  value={defaultType}
                  onChange={(event) => {
                    const next = event.target.value as ComparableType | "";
                    setDefaultType(next);
                    if (file) void read(file, destination, next);
                  }}
                >
                  <NativeSelectOption value="">(la maestra trae el tipo)</NativeSelectOption>
                  {COMPARABLE_TYPES.map((type) => <NativeSelectOption key={type} value={type}>{COMPARABLE_TYPE_LABELS[type]}</NativeSelectOption>)}
                </NativeSelect>
              </label>
            )}
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
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <span className="font-medium">Destino</span>
                  <NativeSelect
                    size="sm"
                    aria-label="Destino de los comparables"
                    value={destination ?? preview.destination}
                    disabled={busy !== null}
                    onChange={(event) => {
                      const next = event.target.value as ImportDestination;
                      setDestination(next);
                      if (file) void read(file, next, defaultType);
                    }}
                  >
                    {IMPORT_DESTINATIONS.map((item) => <NativeSelectOption key={item} value={item}>{IMPORT_DESTINATION_LABELS[item]}</NativeSelectOption>)}
                  </NativeSelect>
                </label>
                {preview.fileDestination ? (
                  <span className="text-xs text-muted-foreground">El archivo dice «{IMPORT_DESTINATION_LABELS[preview.fileDestination]}».</span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {preview.format === "MAESTRA" ? "Plantilla maestra" : "Plantilla de un mercado"}.
                  {" "}Un comparable de un avalúo ya forma parte de la base general.
                </span>
              </div>
              <p className="text-sm">
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{preview.valid} listos para importar</span>
                {preview.invalid ? <span className="text-destructive"> · {preview.invalid} con errores (se omiten)</span> : null}
                {preview.skipped ? <span className="text-muted-foreground"> · {preview.skipped} no se importan (descartados o fuera del destino)</span> : null}
                {preview.tooManyRows ? <span className="text-amber-700"> · solo se leen los primeros 100</span> : null}
              </p>
              <div className="max-h-[26rem] overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="text-left">
                      <th className="px-2 py-1.5">Renglón</th>
                      <th className="px-2 py-1.5">Destino</th>
                      <th className="px-2 py-1.5">Ubicación</th>
                      <th className="px-2 py-1.5 text-right">Superficie</th>
                      <th className="px-2 py-1.5 text-right">Precio</th>
                      <th className="px-2 py-1.5 text-right">Unitario</th>
                      <th className="px-2 py-1.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.row} className="border-t align-top" data-import-row={row.row}>
                        <td className="px-2 py-1.5 tabular-nums">{row.row}</td>
                        <td className="px-2 py-1.5">
                          {targetLabel(row.target)}
                          {row.review === "VERIFICADO" ? <span className="block text-emerald-700 dark:text-emerald-400">Verificado</span> : null}
                        </td>
                        <td className="px-2 py-1.5">{row.location || <span className="text-muted-foreground">(vacía)</span>}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{number(row.area)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{number(row.price)}{row.currency === "USD" ? " USD" : ""}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{number(row.unitPrice)}</td>
                        <td className="grid gap-1 px-2 py-1.5">
                          {row.errors.length ? (
                            <span className="flex items-start gap-1 text-destructive"><XCircle className="mt-0.5 size-3.5 shrink-0" />{row.errors.join(" ")}</span>
                          ) : null}
                          {row.warnings?.length ? (
                            <span className="flex items-start gap-1 text-amber-700 dark:text-amber-400" data-import-warning={row.row}>
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{row.warnings.join(" ")}
                            </span>
                          ) : null}
                          {!row.errors.length && row.duplicates?.length ? (
                            <span className="grid gap-1" data-import-duplicate={row.row}>
                              <span className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                                <Copy className="mt-0.5 size-3.5 shrink-0" />
                                Posible duplicado: {row.duplicates.map((match) =>
                                  `${formatComparableId(match.folio) ?? "sin número"} (${match.valuationFolio ? `avalúo ${match.valuationFolio}` : "base general"}; ${match.reasons.map((reason) => DUPLICATE_REASON_LABELS[reason]).join(", ")}; datos del ${formatDay(match.updatedOn)})`).join("; ")}
                              </span>
                              <NativeSelect
                                size="sm"
                                aria-label={`Qué hacer con el renglón ${row.row}`}
                                value={answers[row.row] ?? ""}
                                onChange={(event) => setAnswers((current) => {
                                  const { [row.row]: _previous, ...rest } = current;
                                  return event.target.value ? { ...rest, [row.row]: event.target.value } : rest;
                                })}
                              >
                                <NativeSelectOption value="">Son diferentes: conservar ambos</NativeSelectOption>
                                {row.duplicates.map((match) => {
                                  const name = formatComparableId(match.folio) ?? (match.valuationFolio ? `el del avalúo ${match.valuationFolio}` : "el de la base");
                                  return [
                                    <NativeSelectOption key={`merge:${match.comparableId}`} value={`merge:${match.comparableId}`}>
                                      Es el mismo que {name}: conservar el más reciente
                                    </NativeSelectOption>,
                                    <NativeSelectOption key={`reuse:${match.comparableId}`} value={`reuse:${match.comparableId}`}>
                                      Usar {name} sin cambios
                                    </NativeSelectOption>,
                                  ];
                                })}
                              </NativeSelect>
                            </span>
                          ) : null}
                          {!row.errors.length && !row.warnings?.length && !row.duplicates?.length && row.target?.kind !== "skip" ? (
                            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-3.5" />Listo</span>
                          ) : null}
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
