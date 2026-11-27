"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REVIEW_TONES, REVIEW_TONE_LABELS, type ReviewStatusItem } from "@/features/valuations/calculation/comparable-review";
import { MAX_REVIEW_STATUSES, newStatusKey, reviewStatusListSchema } from "@/features/valuations/calculation/comparable-review-checklist";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { REVIEW_TONE_STYLES } from "./review-status-style";

/**
 * «Estados de revisión» (V8.12, 04:49: «una opción aquí arribita… que si desean
 * añadir otro o eliminar algún estado lo puedan eliminar o modificar, y así se
 * marca para todos»): one row per state with its name and its colour, in the
 * look the review already has. Deleting a state changes no comparable: each
 * keeps it, with its name, until the appraiser gives it another.
 */
export function ReviewStatusEditor(props: { statuses: ReviewStatusItem[]; onSaved: (statuses: ReviewStatusItem[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ReviewStatusItem[]>(props.statuses);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = (index: number, change: Partial<ReviewStatusItem>) =>
    setDraft((current) => current.map((item, at) => (at === index ? { ...item, ...change } : item)));

  const save = async () => {
    const parsed = reviewStatusListSchema.safeParse({ statuses: draft.map((item) => ({ ...item, label: item.label.trim() })) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los estados.");
      return;
    }
    setSaving(true);
    try {
      const saved = await api.firm.saveReviewStatuses(parsed.data.statuses);
      props.onSaved(saved.statuses);
      toast.success("Estados de revisión guardados para todo el despacho.");
      props.onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudieron guardar los estados.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid gap-2 rounded-md border bg-muted/30 p-3" aria-label="Estados de revisión" data-review-status-editor>
      <div>
        <h3 className="text-sm font-semibold">Estados de revisión del despacho</h3>
        <p className="text-xs text-muted-foreground">
          Agrega, cambia el nombre o el color, o quita estados; valen para todos los comparables del despacho y su color se ve en cada etiqueta. Quitar un estado no cambia los comparables que lo tienen:
          lo conservan hasta que les pongas otro. «Sin revisar» va primero y no se quita.
        </p>
      </div>
      <ul className="grid gap-1.5">
        {draft.map((item, index) => (
          <li key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]" data-review-status-row={item.key}>
            <Input
              aria-label={`Nombre del estado ${index + 1}`}
              maxLength={60}
              value={item.label}
              onChange={(event) => edit(index, { label: event.target.value })}
            />
            {/* V8.13 (12:32): the colour of the label, picked from swatches; the chip beside shows how it reads. */}
            <div className="order-last col-span-2 flex flex-wrap items-center gap-1.5 sm:order-none sm:col-span-1" role="radiogroup" aria-label={`Color del estado ${item.label || index + 1}`}>
              {REVIEW_TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  role="radio"
                  aria-checked={item.tone === tone}
                  aria-label={REVIEW_TONE_LABELS[tone]}
                  title={REVIEW_TONE_LABELS[tone]}
                  data-review-tone={tone}
                  onClick={() => edit(index, { tone })}
                  className={cn(
                    "size-6 rounded-full border-2 border-background shadow-[0_0_0_1px_var(--border)] transition-transform duration-150 hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none",
                    REVIEW_TONE_STYLES[tone].solid,
                    item.tone === tone && "shadow-[0_0_0_2px_var(--foreground)]",
                  )}
                />
              ))}
              <span className={cn("ml-1 rounded-sm px-1.5 py-0.5 text-xs font-medium", REVIEW_TONE_STYLES[item.tone].solid)} data-review-status-preview="">
                {item.label.trim() || "Sin nombre"}
              </span>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Quitar el estado ${item.label}`}
              disabled={index === 0}
              title={index === 0 ? "«Sin revisar» no se quita" : "Quitar este estado de la lista; los comparables que lo tienen lo conservan"}
              onClick={() => setDraft((current) => current.filter((_, at) => at !== index))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={draft.length >= MAX_REVIEW_STATUSES}
          onClick={() => setDraft((current) => [...current, { key: newStatusKey(current.map((item) => item.key)), label: "", tone: "ocre" }])}
        >
          <Plus data-icon="inline-start" /> Agregar estado
        </Button>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={props.onClose}>Cancelar</Button>
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
          Guardar estados
        </Button>
      </div>
    </section>
  );
}
