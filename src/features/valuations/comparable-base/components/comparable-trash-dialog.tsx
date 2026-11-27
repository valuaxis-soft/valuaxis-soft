"use client";

import { ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatComparableId, formatDay } from "@/features/valuations/calculation/comparable-card";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { TrashedComparable } from "../comparable-trash.service";

/** The ages the appraiser named (V8.8, 12:30): «de 6 meses para atrás, de un año, de 2 años». */
const AGES = [
  { months: 6, label: "Más de 6 meses" },
  { months: 12, label: "Más de 1 año" },
  { months: 24, label: "Más de 2 años" },
] as const;

const errorText = (error: unknown) => (error instanceof Error ? error.message : "No se pudo completar.");

/**
 * «Borrar comparables viejos» of the Comparables page: choose how old, see how
 * many and which, confirm, and they go to the trash. «Deshacer» of the notice
 * and «Restaurar» of the trash bring them back. Their numbers are never given
 * again, and the valuations that used them do not change.
 */
export function ComparableTrashDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState<number>(12);
  // The count of the age last asked for; one of another age is not shown.
  const [loaded, setLoaded] = useState<{ months: number; count: number; cutoff: string; sample: string[] } | null>(null);
  const preview = loaded?.months === months ? loaded : null;
  const [trash, setTrash] = useState<TrashedComparable[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    api.comparableBase.trashPreview(months)
      .then((next) => { if (active) setLoaded(next); })
      .catch((failure) => { if (active) setError(errorText(failure)); });
    api.comparableBase.trash()
      .then((next) => { if (active) setTrash(next.items); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [open, months]);

  const restore = async (folios: number[] | "all") => {
    setBusy(true);
    try {
      const { restored } = await api.comparableBase.restoreTrash(folios);
      toast.success(`${restored} comparable${restored === 1 ? "" : "s"} de vuelta en la base, con su mismo número.`);
      setTrash((current) => (folios === "all" ? [] : current.filter((item) => !folios.includes(item.folio))));
      router.refresh();
    } catch (failure) {
      toast.error(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const { folios } = await api.comparableBase.trashOld(months);
      setOpen(false);
      router.refresh();
      toast.success(`${folios.length} comparable${folios.length === 1 ? "" : "s"} en la papelera.`, {
        description: "Sus números no se vuelven a usar y los avalúos que los usaron no cambian. Los recuperas con «Deshacer» o desde la papelera.",
        duration: 15_000,
        action: folios.length ? { label: "Deshacer", onClick: () => void restore(folios) } : undefined,
      });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)} data-trash-old>
        <Trash2 data-icon="inline-start" /> Borrar comparables viejos
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Borrar comparables viejos</DialogTitle>
            <DialogDescription>
              Los comparables de la base cuyos datos son más viejos que lo que elijas se mandan a la papelera: dejan de aparecer en Comparables, en las búsquedas y
              en el mapa. No se renumera nada ni se vuelve a usar su número, y los avalúos que los usaron se quedan como están.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Antigüedad de sus datos">
              {AGES.map((age) => (
                <Button
                  key={age.months}
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={months === age.months}
                  variant={months === age.months ? "default" : "outline"}
                  onClick={() => setMonths(age.months)}
                >
                  {age.label}
                </Button>
              ))}
            </div>
            <p className="text-sm" aria-live="polite" data-trash-preview>
              {preview ? (
                preview.count ? (
                  <>
                    <span className="font-medium tabular-nums">{preview.count} comparable{preview.count === 1 ? "" : "s"}</span> con datos anteriores al {formatDay(preview.cutoff)}
                    {preview.sample.length ? <span className="text-muted-foreground">: {preview.sample.join(", ")}{preview.count > preview.sample.length ? "…" : ""}</span> : null}
                  </>
                ) : <span className="text-muted-foreground">No hay comparables con datos anteriores al {formatDay(preview.cutoff)}.</span>
              ) : <span className="text-muted-foreground"><Loader2 className="inline size-3.5 animate-spin" /> Contando…</span>}
            </p>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

            {trash.length ? (
              <section className="grid gap-2 border-t pt-3" aria-label="Papelera" data-trash-list>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Papelera: {trash.length} comparable{trash.length === 1 ? "" : "s"}</h3>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void restore("all")}>
                    <ArchiveRestore data-icon="inline-start" /> Restaurar todos
                  </Button>
                </div>
                <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
                  {trash.map((item) => (
                    <li key={item.folio}>
                      <button
                        type="button"
                        className={cn("rounded-md border px-2 py-0.5 font-mono text-xs hover:bg-muted", busy && "opacity-60")}
                        disabled={busy}
                        title={`Restaurar${item.by ? `; lo mandó ${item.by}` : ""}`}
                        onClick={() => void restore([item.folio])}
                      >
                        {formatComparableId(item.folio)} · restaurar
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cerrar</Button>
            <Button type="button" variant="destructive" disabled={busy || !preview?.count} onClick={() => void confirm()} data-trash-confirm>
              {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Trash2 data-icon="inline-start" />}
              Mandar {preview?.count ?? 0} a la papelera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
