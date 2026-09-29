"use client";

import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, SessionExpiredError } from "@/lib/api-client";
import {
  COMPUTED_FACTORS,
  DIRECT_FACTORS,
  type FactorCatalog,
  type FactorLimits,
} from "@/features/valuations/calculation/factor-catalog";
import { FACTOR_TYPE_LABELS, FACTOR_TYPES, type FactorType } from "@/features/valuations/calculation/market-types";
import { parseDecimal } from "@/features/valuations/components/calculation/comparable-dialog";

type OptionDraft = { label: string; value: string };
type Draft = { factors: Record<FactorType, OptionDraft[]>; limits: Record<keyof FactorLimits, string> };

const EDITABLE_FACTORS = FACTOR_TYPES.filter((type) => !COMPUTED_FACTORS.has(type));
const LIMIT_LABELS: Record<keyof FactorLimits, string> = {
  factorMin: "Factor mínimo",
  factorMax: "Factor máximo",
  resultantMin: "Resultante mínimo",
  resultantMax: "Resultante máximo",
};

const toDraft = (catalog: FactorCatalog): Draft => ({
  factors: Object.fromEntries(EDITABLE_FACTORS.map((type) => [
    type,
    (catalog.factors[type] ?? []).map((option) => ({ label: option.label, value: String(option.value) })),
  ])) as Draft["factors"],
  limits: Object.fromEntries(Object.entries(catalog.limits).map(([key, value]) => [key, String(value)])) as Draft["limits"],
});

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : fallback;

/** The firm's homologation factor catalog: ratings per factor and the allowed ranges. */
export function FactorCatalogEditor() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [customized, setCustomized] = useState(false);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const apply = (next: { catalog: FactorCatalog; customized: boolean }) => {
    setDraft(toDraft(next.catalog));
    setCustomized(next.customized);
  };

  useEffect(() => {
    let active = true;
    api.firm.factors()
      .then((next) => { if (active) apply(next); })
      .catch((error: unknown) => { if (active) setLoadError(errorMessage(error, "No se pudo cargar el catálogo de factores.")); });
    return () => { active = false; };
  }, []);

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!draft) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando el catálogo de factores…
      </div>
    );
  }

  const setOptions = (type: FactorType, options: OptionDraft[]) =>
    setDraft((current) => (current ? { ...current, factors: { ...current.factors, [type]: options } } : current));

  const save = async () => {
    const factors: FactorCatalog["factors"] = {};
    for (const type of EDITABLE_FACTORS) {
      const options = draft.factors[type]
        .filter((option) => option.label.trim() || option.value.trim())
        .map((option) => ({ label: option.label.trim(), value: parseDecimal(option.value) ?? Number.NaN }));
      if (options.some((option) => !option.label || !Number.isFinite(option.value) || option.value <= 0)) {
        toast.error(`${FACTOR_TYPE_LABELS[type]}: cada calificación necesita nombre y un valor mayor que cero.`);
        return;
      }
      if (options.length) factors[type] = options;
    }
    const limits = Object.fromEntries(Object.entries(draft.limits).map(([key, value]) => [key, parseDecimal(value) ?? Number.NaN])) as FactorLimits;
    setBusy("save");
    try {
      apply(await api.firm.saveFactors({ factors, limits }));
      toast.success("Catálogo de factores guardado.");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo guardar el catálogo."));
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!window.confirm("¿Volver al catálogo que propone Valuaxis? Se pierden los cambios del despacho.")) return;
    setBusy("reset");
    try {
      apply(await api.firm.resetFactors());
      toast.success("Se restableció el catálogo propuesto.");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo restablecer el catálogo."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Catálogo de factores de homologación
          <Badge variant={customized ? "default" : "secondary"}>{customized ? "Del despacho" : "Propuesto por Valuaxis"}</Badge>
        </CardTitle>
        <CardDescription>
          Las calificaciones que el perito elige para el sujeto y cada comparable; el factor es sujeto entre comparable. La negociación
          es un factor directo. El propuesto sale de los valores que usan sus libros de Excel; ajústelo a los criterios del despacho.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-3 sm:grid-cols-4">
          {(Object.keys(LIMIT_LABELS) as Array<keyof FactorLimits>).map((key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`limit-${key}`} className="text-xs">{LIMIT_LABELS[key]}</FieldLabel>
              <Input
                id={`limit-${key}`}
                inputMode="decimal"
                value={draft.limits[key]}
                onChange={(event) => setDraft({ ...draft, limits: { ...draft.limits, [key]: event.target.value } })}
              />
            </Field>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-4">
            Un comparable con un factor o un factor resultante fuera de estos rangos se marca en el panel de mercado.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {EDITABLE_FACTORS.map((type) => {
            const options = draft.factors[type];
            return (
              <section key={type} className="grid gap-2 rounded-md border p-3" aria-label={FACTOR_TYPE_LABELS[type]}>
                <h4 className="text-sm font-medium">
                  {FACTOR_TYPE_LABELS[type]}
                  {DIRECT_FACTORS.has(type) ? <span className="ml-2 text-xs font-normal text-muted-foreground">factor directo</span> : null}
                </h4>
                {options.length === 0 ? <p className="text-xs text-muted-foreground">Sin calificaciones: se captura a mano.</p> : null}
                {options.map((option, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2">
                    <Input
                      aria-label={`${FACTOR_TYPE_LABELS[type]}: nombre de la calificación ${index + 1}`}
                      value={option.label}
                      maxLength={60}
                      onChange={(event) => setOptions(type, options.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))}
                    />
                    <Input
                      aria-label={`${FACTOR_TYPE_LABELS[type]}: valor de la calificación ${index + 1}`}
                      inputMode="decimal"
                      value={option.value}
                      onChange={(event) => setOptions(type, options.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Quitar ${option.label || "calificación"}`}
                      onClick={() => setOptions(type, options.filter((_, i) => i !== index))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setOptions(type, [...options, { label: "", value: "1" }])}>
                  <Plus data-icon="inline-start" /> Agregar calificación
                </Button>
              </section>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {customized ? (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void reset()}>
              {busy === "reset" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <RotateCcw data-icon="inline-start" />}
              Volver al propuesto
            </Button>
          ) : null}
          <Button type="button" disabled={busy !== null} onClick={() => void save()}>
            {busy === "save" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            Guardar catálogo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
