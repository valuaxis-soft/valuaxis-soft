"use client";

import { ArrowDown, ArrowUp, ClipboardCheck, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { COMPARABLE_VALIDITY_MONTHS } from "@/features/valuations/calculation/comparable-validity";
import {
  BUILT_IN_CHECK_NOTES,
  DEFAULT_REVIEW_CHECKLIST,
  MAX_REVIEW_CHECKS,
  comparableReviewChecklistSchema,
  isBuiltInCheck,
  moveCheck,
  newCheckKey,
  type ReviewChecklistItem,
} from "@/features/valuations/calculation/comparable-review-checklist";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { ComparableReviewSettingsDto } from "../comparable-review-settings.service";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : fallback;

type Draft = { checks: ReviewChecklistItem[]; tolerance: string; validityMonths: string };

const toDraft = (settings: ComparableReviewSettingsDto): Draft => ({
  checks: settings.checks,
  tolerance: String(settings.builtAreaTolerancePercent),
  validityMonths: String(settings.validityMonths),
});

/**
 * Despacho → Revisión de comparables: the administrator adds, removes,
 * renames and orders the points of the review, marks which are required,
 * and sets the thresholds of its warnings. Reviews already saved keep the
 * names their points had.
 */
export function ComparableReviewChecklistCard() {
  const [settings, setSettings] = useState<ComparableReviewSettingsDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.firm.reviewChecklist()
      .then((next) => { if (active) { setSettings(next); setDraft(toDraft(next)); } })
      .catch((error: unknown) => { if (active) setLoadError(errorMessage(error, "No se pudo cargar la lista de verificación.")); });
    return () => { active = false; };
  }, []);

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!settings || !draft) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando la lista de verificación…
      </div>
    );
  }

  const setChecks = (update: (checks: ReviewChecklistItem[]) => ReviewChecklistItem[]) =>
    setDraft((current) => (current ? { ...current, checks: update(current.checks) } : current));
  const setItem = (index: number, patch: Partial<ReviewChecklistItem>) =>
    setChecks((checks) => checks.map((check, at) => (at === index ? { ...check, ...patch } : check)));
  const addItem = () => setChecks((checks) => [
    ...checks,
    { key: newCheckKey(checks.map((check) => check.key)), label: "", required: false, hint: null },
  ]);

  const send = async (checklist: ComparableReviewSettingsDto | null, message: string) => {
    setBusy(true);
    try {
      const next = await api.firm.saveReviewChecklist({
        checklist: checklist ? { checks: checklist.checks, builtAreaTolerancePercent: checklist.builtAreaTolerancePercent } : null,
        validityMonths: Number(draft.validityMonths),
      });
      setSettings(next);
      setDraft(toDraft(next));
      toast.success(message);
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo guardar la lista de verificación."));
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const parsed = comparableReviewChecklistSchema.safeParse({ checks: draft.checks, builtAreaTolerancePercent: Number(draft.tolerance) });
    if (!parsed.success) {
      // Say what is wrong before asking the server: an empty name, a repeated one, the percentage.
      toast.error(parsed.error.issues[0]?.message ?? "Revisa la lista de verificación.");
      return;
    }
    void send({ ...settings, ...parsed.data }, "Lista de verificación de comparables guardada.");
  };

  return (
    <form onSubmit={save} data-review-checklist-settings>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-5" /> Revisión de comparables</CardTitle>
          <CardDescription>
            Los puntos que el valuador revisa contra cada anuncio en «Revisión de comparables», en este orden, y los umbrales de sus avisos.
            Un punto obligatorio solo avisa si falta al marcar el comparable como verificado; nunca impide guardar ni concluir. Las revisiones
            ya guardadas conservan el nombre que tenían sus puntos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ol className="grid gap-2" aria-label="Puntos de verificación">
            {draft.checks.map((check, index) => (
              <li
                key={check.key}
                className="grid gap-2 rounded-md border bg-card p-2 sm:grid-cols-[2rem_minmax(0,1fr)_auto_auto] sm:items-center"
                data-checklist-item={check.key}
              >
                <span className="text-sm font-semibold text-muted-foreground tabular-nums">{index + 1}.</span>
                <div className="grid gap-1">
                  <Input
                    aria-label={`Nombre del punto ${index + 1}`}
                    value={check.label}
                    maxLength={120}
                    placeholder="Por ejemplo: El uso de suelo coincide"
                    disabled={busy}
                    onChange={(event) => setItem(index, { label: event.target.value })}
                  />
                  {isBuiltInCheck(check.key) && BUILT_IN_CHECK_NOTES[check.key] ? (
                    <span className="text-xs text-muted-foreground">{BUILT_IN_CHECK_NOTES[check.key]}</span>
                  ) : null}
                </div>
                <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                  <Checkbox checked={check.required} disabled={busy} onCheckedChange={(checked) => setItem(index, { required: checked === true })} />
                  Obligatoria
                </label>
                <div className="flex gap-1">
                  <Button type="button" size="icon-sm" variant="outline" aria-label={`Subir el punto ${index + 1}`} title="Subir"
                    disabled={busy || index === 0} onClick={() => setChecks((checks) => moveCheck(checks, index, -1))}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" size="icon-sm" variant="outline" aria-label={`Bajar el punto ${index + 1}`} title="Bajar"
                    disabled={busy || index === draft.checks.length - 1} onClick={() => setChecks((checks) => moveCheck(checks, index, 1))}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" size="icon-sm" variant="outline" aria-label={`Quitar el punto ${index + 1}`} title="Quitar"
                    disabled={busy || draft.checks.length === 1} onClick={() => setChecks((checks) => checks.filter((_, at) => at !== index))}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy || draft.checks.length >= MAX_REVIEW_CHECKS} onClick={addItem}>
              <Plus data-icon="inline-start" /> Agregar punto
            </Button>
            {settings.customized ? <Badge variant="secondary">Lista propia del despacho</Badge> : <Badge variant="outline">Lista de Valuaxis</Badge>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="review-built-area-tolerance">Superficie construida: diferencia que avisa (±%)</FieldLabel>
              <Input
                id="review-built-area-tolerance"
                type="number"
                min={1}
                max={100}
                step={1}
                className="tabular-nums"
                value={draft.tolerance}
                disabled={busy}
                onChange={(event) => setDraft((current) => (current ? { ...current, tolerance: event.target.value } : current))}
              />
              <FieldDescription>
                Un comparable construido cuya superficie difiere de la del sujeto más de este porcentaje muestra un aviso. Valuaxis usa ±
                {DEFAULT_REVIEW_CHECKLIST.builtAreaTolerancePercent} %.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="review-validity-months">Vigencia de los comparables (meses)</FieldLabel>
              <NativeSelect
                id="review-validity-months"
                className="w-full"
                value={draft.validityMonths}
                disabled={busy}
                onChange={(event) => setDraft((current) => (current ? { ...current, validityMonths: event.target.value } : current))}
              >
                {COMPARABLE_VALIDITY_MONTHS.map((months) => (
                  <NativeSelectOption key={months} value={String(months)}>{months} {months === 1 ? "mes" : "meses"}</NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Los meses con que nace cada comparable nuevo desde su fecha de consulta (en cada comparable se puede cambiar); una oferta más
                vieja que su vigencia muestra un aviso.
              </FieldDescription>
            </Field>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !settings.customized}
              title="Vuelve a la lista y al porcentaje de Valuaxis; la vigencia queda como esté"
              onClick={() => void send(null, "Se restableció la lista de verificación de Valuaxis.")}
            >
              <RotateCcw data-icon="inline-start" /> Restablecer la de Valuaxis
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar revisión de comparables
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
