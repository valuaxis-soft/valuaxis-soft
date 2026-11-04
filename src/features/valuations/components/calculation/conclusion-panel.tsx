"use client";

import { Calculator, Loader2, X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, SessionExpiredError } from "@/lib/api-client";
import {
  SUMMARY_SOURCES,
  SUMMARY_SOURCE_LABELS,
  canConclude,
  conclusionEngineConfig,
  conclusionInput,
  summaryRowValues,
  type ConclusionCalculationDto,
  type ConclusionMethod,
  type ConclusionSummaryRow,
  type SummarySource,
} from "@/features/valuations/calculation/conclusion-types";
import { APPROACH_LABELS, concludeValue, type Approach } from "@/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG, type RoundingDigits } from "@/features/valuations/engine/config";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { formulaOr, formulasOfFields, type CapturedFormulas } from "@/features/valuations/calculation/captured-formulas";
import { FormulaInput } from "./formula-input";
import { RoundingSelect } from "./calculation-controls";
import { useSerializedSave } from "./use-serialized-save";
import { marketLeftOut } from "@/features/valuations/services/report-approaches";

const APPROACHES: Approach[] = ["costos", "mercado", "ingresos"];
const weightPath = (approach: Approach) => `method.weights.${approach}`;
const MARKET_SOURCE_LABELS: Record<NonNullable<ConclusionCalculationDto["marketSource"]>, string> = {
  INMUEBLE_VENTA: "inmuebles",
  TERRENO_VENTA: "terrenos",
  MAQUINARIA_VENTA: "maquinaria y equipo",
};
const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/** Whether the document leaves the approach out of the dictamen ("Agregar al informe valuatorio" off). */
function leftOut(calculation: ConclusionCalculationDto, approach: Approach) {
  const excluded = new Set(calculation.excluded ?? []);
  return approach === "mercado" ? marketLeftOut(excluded) : excluded.has(approach);
}

/**
 * "Resumen de valores": which values the conclusion lists and under what
 * name (video 5.1, 3 Nov 2026). Without rows the three approaches print as
 * always; with one row only, the concluded value is that value.
 */
function ConclusionSummaryEditor({
  calculation,
  readOnly,
  onChange,
}: {
  calculation: ConclusionCalculationDto;
  readOnly: boolean;
  onChange: (rows: ConclusionSummaryRow[]) => void;
}) {
  const rows = calculation.summaryRows ?? [];
  const available = calculation.available ?? {};
  const unused = SUMMARY_SOURCES.filter((source) => !rows.some((row) => row.source === source));
  const [draft, setDraft] = useState<Record<number, string>>({});
  const valueText = (source: SummarySource) => {
    const value = available[source];
    return value === null || value === undefined ? "sin calcular" : money(value);
  };
  return (
    <fieldset disabled={readOnly} className="grid gap-2 rounded-md border bg-background p-3" data-conclusion-summary>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Resumen de valores</p>
        {unused.length ? (
          <NativeSelect
            aria-label="Agregar un valor al resumen"
            className="w-64"
            value=""
            onChange={(event) => {
              const source = event.target.value as SummarySource | "";
              if (!source) return;
              onChange([...rows, { source, label: SUMMARY_SOURCE_LABELS[source] }]);
            }}
          >
            <NativeSelectOption value="">Agregar un valor…</NativeSelectOption>
            {unused.map((source) => (
              <NativeSelectOption key={source} value={source}>
                {SUMMARY_SOURCE_LABELS[source]} · {valueText(source)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="grid gap-2">
          {rows.map((row, index) => (
            <li key={row.source} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2" data-summary-row={row.source}>
              <Input
                aria-label={`Nombre del valor ${SUMMARY_SOURCE_LABELS[row.source]}`}
                value={draft[index] ?? row.label}
                maxLength={200}
                onChange={(event) => setDraft((current) => ({ ...current, [index]: event.target.value }))}
                onBlur={() => {
                  const label = (draft[index] ?? row.label).trim() || SUMMARY_SOURCE_LABELS[row.source];
                  setDraft((current) => { const next = { ...current }; delete next[index]; return next; });
                  if (label !== row.label) onChange(rows.map((item, position) => (position === index ? { ...item, label } : item)));
                }}
              />
              <span className="text-sm tabular-nums text-muted-foreground">{valueText(row.source)}</span>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${row.label} del resumen`} onClick={() => onChange(rows.filter((_, position) => position !== index))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <FieldDescription>
          Sin filas, el dictamen lista los tres enfoques como siempre. Agrega los valores que concluyes (mercado de inmuebles, terrenos, rentas, costos, ingresos, regresión o programación por metas) y nómbralos como deben leerse.
        </FieldDescription>
      )}
      {rows.length === 1 ? <FieldDescription>Con un solo valor en el resumen, el valor concluido es ese valor.</FieldDescription> : null}
    </fieldset>
  );
}

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
      // A weight typed as a formula reads back as typed.
      const weight = (approach: Approach) => formulaOr(next.formulas, weightPath(approach), String((saved[approach] ?? 0) * 100));
      setWeights({ costos: weight("costos"), mercado: weight("mercado"), ingresos: weight("ingresos") });
    }
  };
  const enqueueSave = useSerializedSave(async (settings: { method: ConclusionMethod; justification: string | null; rounding: RoundingDigits; formulas: CapturedFormulas; summaryRows: ConclusionSummaryRow[] }) => {
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
  const current = { ...calculation, method };
  const summaryRows = summaryRowValues(calculation);
  const result = canConclude(current) ? concludeValue(conclusionInput(current), conclusionEngineConfig(calculation)) : null;
  const rounding = calculation.rounding === undefined ? DEFAULT_ENGINE_CONFIG.rounding.conclusion : calculation.rounding;
  const save = (next: { method?: ConclusionMethod; justification?: string; rounding?: RoundingDigits; summaryRows?: ConclusionSummaryRow[] }) => {
    if (readOnly) return;
    const sent = next.method ?? method;
    void enqueueSave({
      method: sent,
      justification: (next.justification ?? justification).trim() || null,
      rounding: next.rounding === undefined ? rounding : next.rounding,
      summaryRows: next.summaryRows ?? calculation.summaryRows ?? [],
      // The weights' formulas go with the weights; concluding with one approach has none.
      formulas: sent.kind === "weighted" ? formulasOfFields(APPROACHES.map((approach) => [weightPath(approach), weights[approach]] as const)) : {},
    });
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
              {approach === "mercado" && calculation.marketSource ? ` (${MARKET_SOURCE_LABELS[calculation.marketSource]})` : ""}
            </dt>
            <dd className="tabular-nums">
              {leftOut(calculation, approach)
                ? <span className="text-muted-foreground" data-approach-left-out="">No incluido en el informe</span>
                : calculation.values[approach] === null ? "No aplica" : money(calculation.values[approach] as number)}
            </dd>
          </div>
        ))}
      </dl>

      <ConclusionSummaryEditor
        calculation={calculation}
        readOnly={readOnly}
        onChange={(rows) => {
          setCalculation({ ...calculation, summaryRows: rows });
          save({ summaryRows: rows });
        }}
      />

      <fieldset disabled={readOnly || summaryRows.length === 1} className="grid gap-3 sm:grid-cols-2">
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
                <FormulaInput
                  id={`conclusion-weight-${approach}`}
                  value={weights[approach]}
                  disabled={calculation.values[approach] === null}
                  onChange={(event) => setWeights((current) => ({ ...current, [approach]: event.target.value }))}
                />
              </Field>
            ))}
          </div>
        ) : null}
        <Field>
          <FieldLabel htmlFor="conclusion-rounding">Redondeo de los valores y la conclusión</FieldLabel>
          <RoundingSelect
            id="conclusion-rounding"
            label="Redondeo de la conclusión"
            value={rounding}
            onChange={(digits) => {
              setCalculation({ ...calculation, rounding: digits });
              save({ rounding: digits });
            }}
          />
        </Field>
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
          <p className="text-xs text-muted-foreground">Valor concluido{summaryRows.length === 1 ? ` · ${summaryRows[0].label}` : ""}</p>
          <p className="text-lg font-semibold tabular-nums">{money(result.value)}</p>
          <p className="text-xs text-muted-foreground">{result.valueInWords}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {summaryRows.length === 1
            ? "El valor elegido en el resumen todavía no está calculado."
            : calculation.method.kind === "weighted" ? "Los pesos de los enfoques con valor deben sumar 100 %." : "El enfoque elegido todavía no tiene valor."}
        </p>
      )}
    </section>
  );
}
