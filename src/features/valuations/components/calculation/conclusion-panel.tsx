"use client";

import { Calculator, Loader2 } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, SessionExpiredError } from "@/lib/api-client";
import { canConclude, type ConclusionCalculationDto, type ConclusionMethod } from "@/features/valuations/calculation/conclusion-types";
import { APPROACH_LABELS, concludeValue, type Approach } from "@/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG } from "@/features/valuations/engine/config";
import { parseDecimal } from "./comparable-dialog";
import { useSerializedSave } from "./use-serialized-save";

const APPROACHES: Approach[] = ["costos", "mercado", "ingresos"];
const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/** Concluded value: which approach (or weights) and why, from the values each approach stored. */
export function ConclusionPanel(props: {
  valuationId: string;
  readOnly: boolean;
  onCalculation: (calculation: ConclusionCalculationDto) => void;
}) {
  const { valuationId } = props;
  const [calculation, setCalculation] = useState<ConclusionCalculationDto | null>(null);
  const [justification, setJustification] = useState("");
  const [weights, setWeights] = useState<Record<Approach, string>>({ costos: "", mercado: "", ingresos: "" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const readOnly = props.readOnly || Boolean(calculation?.locked);

  const applyServerState = (next: ConclusionCalculationDto) => {
    setCalculation(next);
    setJustification(next.justification ?? "");
    if (next.method.kind === "weighted") {
      const saved = next.method.weights;
      setWeights({ costos: String((saved.costos ?? 0) * 100), mercado: String((saved.mercado ?? 0) * 100), ingresos: String((saved.ingresos ?? 0) * 100) });
    }
  };
  const enqueueSave = useSerializedSave(async (settings: { method: ConclusionMethod; justification: string | null }) => {
    setSaving(true);
    try {
      applyServerState(await api.conclusion.save(valuationId, settings));
    } catch (error) {
      toast.error(error instanceof SessionExpiredError
        ? "Tu sesión expiró. Vuelve a iniciar sesión."
        : error instanceof Error ? error.message : "No se pudo guardar la conclusión.");
    } finally {
      setSaving(false);
    }
  });
  const report = useEffectEvent((next: ConclusionCalculationDto) => {
    if (!props.readOnly) props.onCalculation(next);
  });

  useEffect(() => {
    let active = true;
    api.conclusion.get(valuationId)
      .then((next) => { if (active) applyServerState(next); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "No se pudo cargar la conclusión."); });
    return () => { active = false; };
  }, [valuationId]);

  useEffect(() => {
    if (calculation) report(calculation);
  }, [calculation]);

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!calculation) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando la conclusión…
      </div>
    );
  }

  const weightedMethod: ConclusionMethod = {
    kind: "weighted",
    weights: Object.fromEntries(APPROACHES.map((approach) => [approach, (parseDecimal(weights[approach]) ?? 0) / 100])),
  };
  const method = calculation.method.kind === "weighted" ? weightedMethod : calculation.method;
  const result = canConclude({ values: calculation.values, method })
    ? concludeValue({ values: calculation.values, method }, DEFAULT_ENGINE_CONFIG)
    : null;
  const save = (next: { method?: ConclusionMethod; justification?: string }) => {
    if (readOnly) return;
    void enqueueSave({ method: next.method ?? method, justification: (next.justification ?? justification).trim() || null });
  };
  const methodValue = calculation.method.kind === "weighted" ? "ponderado" : calculation.method.approach;

  return (
    <section className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:p-4" aria-labelledby="conclusion-title">
      <header className="flex items-center justify-between gap-2">
        <h3 id="conclusion-title" className="flex items-center gap-2 text-sm font-semibold">
          <Calculator className="size-4" /> Conclusión de valor
        </h3>
        {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
      </header>

      <dl className="grid gap-x-4 gap-y-1 rounded-md border bg-background p-3 text-sm sm:grid-cols-3">
        {APPROACHES.map((approach) => (
          <div key={approach}>
            <dt className="text-xs text-muted-foreground">
              {APPROACH_LABELS[approach]}
              {approach === "mercado" && calculation.marketSource ? ` (${calculation.marketSource === "INMUEBLE_VENTA" ? "inmuebles" : "terrenos"})` : ""}
            </dt>
            <dd className="tabular-nums">{calculation.values[approach] === null ? "No aplica" : money(calculation.values[approach] as number)}</dd>
          </div>
        ))}
      </dl>

      <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="conclusion-method">Se concluye con</FieldLabel>
          <NativeSelect
            id="conclusion-method"
            className="w-full"
            value={methodValue}
            onChange={(event) => {
              const value = event.target.value;
              const next: ConclusionMethod = value === "ponderado" ? weightedMethod : { kind: "single", approach: value as Approach };
              setCalculation({ ...calculation, method: next });
              save({ method: next });
            }}
          >
            {APPROACHES.map((approach) => (
              <NativeSelectOption key={approach} value={approach} disabled={calculation.values[approach] === null}>
                {APPROACH_LABELS[approach]}
              </NativeSelectOption>
            ))}
            <NativeSelectOption value="ponderado">Ponderación de enfoques</NativeSelectOption>
          </NativeSelect>
        </Field>
        {calculation.method.kind === "weighted" ? (
          <div className="grid grid-cols-3 gap-2" onBlur={() => save({})}>
            {APPROACHES.map((approach) => (
              <Field key={approach}>
                <FieldLabel htmlFor={`conclusion-weight-${approach}`} className="text-xs">Peso {approach} (%)</FieldLabel>
                <Input
                  id={`conclusion-weight-${approach}`}
                  inputMode="decimal"
                  value={weights[approach]}
                  disabled={calculation.values[approach] === null}
                  onChange={(event) => setWeights((current) => ({ ...current, [approach]: event.target.value }))}
                />
              </Field>
            ))}
          </div>
        ) : null}
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="conclusion-justification">Justificación</FieldLabel>
          <Textarea
            id="conclusion-justification"
            rows={2}
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            onBlur={() => save({})}
          />
        </Field>
      </fieldset>

      {result ? (
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">Valor concluido</p>
          <p className="text-lg font-semibold tabular-nums">{money(result.value)}</p>
          <p className="text-xs text-muted-foreground">{result.valueInWords}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {calculation.method.kind === "weighted" ? "Los pesos de los enfoques con valor deben sumar 100 %." : "El enfoque elegido todavía no tiene valor."}
        </p>
      )}
    </section>
  );
}
