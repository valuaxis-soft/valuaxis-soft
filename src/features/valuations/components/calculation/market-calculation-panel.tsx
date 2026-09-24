"use client";

import { AlertTriangle, Calculator, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, SessionExpiredError, type ComparableFormValues } from "@/lib/api-client";
import { DEFAULT_ENGINE_CONFIG } from "@/features/valuations/engine/config";
import { computeMarketApproach, type MarketApproachResult } from "@/features/valuations/engine/market";
import {
  COMPARABLE_TYPE_LABELS,
  FACTOR_TYPE_LABELS,
  FACTOR_TYPES,
  MIN_COMPARABLES,
  RECOMMENDED_MAX_DISPERSION,
  isComparableComplete,
  toMarketEngineInput,
  type ComparableDto,
  type ComparableType,
  type FactorType,
  type MarketCalculationDto,
  type MarketSettingsDto,
} from "@/features/valuations/calculation/market-types";
import { ComparableDialog, parseDecimal } from "./comparable-dialog";
import { useSerializedSave } from "./use-serialized-save";

const MARKET_TYPES: ComparableType[] = ["TERRENO_VENTA", "INMUEBLE_VENTA"];
const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const text = (value: number | null) => (value === null ? "" : String(value));

function compute(calculation: Pick<MarketCalculationDto, "settings" | "comparables">):
  { result: MarketApproachResult | null; reason: string | null } {
  const input = toMarketEngineInput(calculation);
  if (!input.ok) return { result: null, reason: input.reason };
  return { result: computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG), reason: null };
}

type SettingsDraft = Record<"subjectArea" | "baseArea" | "surfacePower" | "adoptedUnitValue" | "additionalAmount" | "justification", string>;

const draftFrom = (settings: MarketSettingsDto): SettingsDraft => ({
  subjectArea: text(settings.subjectArea),
  baseArea: text(settings.baseArea),
  surfacePower: String(settings.surfacePower),
  adoptedUnitValue: text(settings.adoptedUnitValue),
  additionalAmount: settings.additionalAmount ? String(settings.additionalAmount) : "",
  justification: settings.justification ?? "",
});

function settingsFrom(base: MarketSettingsDto, draft: SettingsDraft): MarketSettingsDto {
  return {
    ...base,
    subjectArea: parseDecimal(draft.subjectArea),
    baseArea: parseDecimal(draft.baseArea),
    surfacePower: parseDecimal(draft.surfacePower) ?? base.surfacePower,
    adoptedUnitValue: parseDecimal(draft.adoptedUnitValue),
    additionalAmount: parseDecimal(draft.additionalAmount) ?? 0,
    justification: draft.justification.trim() || null,
  };
}

/**
 * Comparables and market approach of the valuation: capture, live results and
 * the blocks it writes into the dictamen through `onCalculation`.
 */
export function MarketCalculationPanel(props: {
  valuationId: string;
  readOnly: boolean;
  /** Suggested subject area (terreno section) while none is captured. */
  suggestedSubjectArea: number | null;
  onCalculation: (calculation: MarketCalculationDto, result: MarketApproachResult | null) => void;
}) {
  const { valuationId } = props;
  const [type, setType] = useState<ComparableType>("TERRENO_VENTA");
  const [calculation, setCalculation] = useState<MarketCalculationDto | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editing, setEditing] = useState<ComparableDto | "nuevo" | null>(null);

  const readOnly = props.readOnly || Boolean(calculation?.locked);

  const applyServerState = (next: MarketCalculationDto) => {
    setCalculation(next);
    setDraft(draftFrom(next.settings));
  };

  // Only an editor writes the result into the dictamen; a reader would leave unsaved changes.
  const reportCalculation = useEffectEvent((next: MarketCalculationDto) => {
    if (!props.readOnly && !next.locked) props.onCalculation(next, compute(next).result);
  });

  useEffect(() => {
    let active = true;
    api.market.get(valuationId, type)
      .then((next) => {
        if (!active) return;
        setLoadError(null);
        applyServerState(next);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "No se pudo cargar el enfoque de mercado.");
      });
    return () => {
      active = false;
    };
  }, [type, valuationId]);

  // The dictamen follows what the server stored, never an unsaved draft.
  useEffect(() => {
    if (calculation) reportCalculation(calculation);
  }, [calculation]);

  const run = async (action: () => Promise<MarketCalculationDto>, success?: string) => {
    try {
      applyServerState(await action());
      if (success) toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof SessionExpiredError
        ? "Tu sesión expiró. Vuelve a iniciar sesión."
        : error instanceof Error ? error.message : "No se pudo guardar.");
      return false;
    }
  };

  const liveSettings = calculation && draft ? settingsFrom(calculation.settings, draft) : null;
  // Recomputed on every render: a handful of comparables, and it follows every keystroke.
  const live = calculation && liveSettings ? compute({ settings: liveSettings, comparables: calculation.comparables }) : null;

  const enqueueSettings = useSerializedSave(async (settings: MarketSettingsDto) => {
    setSavingSettings(true);
    await run(() => api.market.saveSettings(valuationId, settings));
    setSavingSettings(false);
  });
  const saveSettings = async (settings = liveSettings) => {
    if (!calculation || !settings || readOnly) return;
    if (JSON.stringify(settings) === JSON.stringify(calculation.settings)) return;
    await enqueueSettings(settings);
  };

  const submitComparable = (current: ComparableDto | null) => async (values: ComparableFormValues) =>
    run(
      () => current
        ? api.market.updateComparable(valuationId, type, current.id, values)
        : api.market.createComparable(valuationId, type, values),
      current ? "Comparable guardado" : "Comparable agregado",
    );

  if (loadError) {
    return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  }
  if (!calculation || !draft || !liveSettings) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando el enfoque de mercado…
      </div>
    );
  }

  const { comparables } = calculation;
  const result = live?.result ?? null;
  const stats = result?.homologation.stats;
  const complete = comparables.filter(isComparableComplete).length;
  const byReference = new Map(result?.homologation.comparables.map((row) => [row.id, row]) ?? []);
  const setDraftField = (key: keyof SettingsDraft) => (event: { target: { value: string } }) =>
    setDraft((current) => (current ? { ...current, [key]: event.target.value } : current));
  const availableFactors = FACTOR_TYPES.filter((factor) => !calculation.settings.factorSlots.some((slot) => slot.type === factor));
  const editingComparable = editing === "nuevo" ? null : editing;

  return (
    <section className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:p-4" aria-labelledby="market-calculation-title">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="market-calculation-title" className="flex items-center gap-2 text-sm font-semibold">
          <Calculator className="size-4" /> Cálculo del enfoque de mercado
        </h3>
        <NativeSelect aria-label="Tipo de comparables" value={type} onChange={(event) => setType(event.target.value as ComparableType)}>
          {MARKET_TYPES.map((item) => <NativeSelectOption key={item} value={item}>{COMPARABLE_TYPE_LABELS[item]}</NativeSelectOption>)}
        </NativeSelect>
      </header>

      {calculation.locked ? (
        <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p>
      ) : null}

      <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-4" onBlur={() => void saveSettings()}>
        <Field>
          <FieldLabel htmlFor="market-subject-area">Superficie del sujeto (m²)</FieldLabel>
          <Input
            id="market-subject-area"
            inputMode="decimal"
            value={draft.subjectArea}
            placeholder={props.suggestedSubjectArea ? String(props.suggestedSubjectArea) : undefined}
            onChange={setDraftField("subjectArea")}
          />
          {!draft.subjectArea && props.suggestedSubjectArea ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto justify-start px-0"
              onClick={() => void saveSettings({ ...liveSettings, subjectArea: props.suggestedSubjectArea })}
            >
              Usar {props.suggestedSubjectArea} m² del terreno
            </Button>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="market-base-area">Lote tipo (m², opcional)</FieldLabel>
          <Input id="market-base-area" inputMode="decimal" value={draft.baseArea} placeholder="Igual al sujeto" onChange={setDraftField("baseArea")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="market-power">Potencia n</FieldLabel>
          <Input id="market-power" inputMode="decimal" value={draft.surfacePower} onChange={setDraftField("surfacePower")} />
          {result?.homologation.suggestedPower ? (
            <span className="text-xs text-muted-foreground">Sugerida por los comparables: {result.homologation.suggestedPower}</span>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="market-adopted">Valor unitario adoptado ($/m²)</FieldLabel>
          <Input
            id="market-adopted"
            inputMode="decimal"
            value={draft.adoptedUnitValue}
            placeholder={stats ? `Promedio: ${stats.mean.toFixed(2)}` : undefined}
            onChange={setDraftField("adoptedUnitValue")}
          />
        </Field>
        <Field className="sm:col-span-3">
          <FieldLabel htmlFor="market-justification">Justificación del valor adoptado</FieldLabel>
          <Textarea id="market-justification" rows={2} value={draft.justification} onChange={setDraftField("justification")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="market-additional">Monto adicional ($)</FieldLabel>
          <Input id="market-additional" inputMode="decimal" value={draft.additionalAmount} placeholder="0" onChange={setDraftField("additionalAmount")} />
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Factores, en orden:</span>
        {calculation.settings.factorSlots.map((slot) => (
          <Badge key={slot.type} variant={slot.type === "SUPERFICIE" ? "secondary" : "outline"}>
            {slot.label}
            {slot.type !== "SUPERFICIE" && !readOnly ? (
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground"
                aria-label={`Quitar el factor ${slot.label}`}
                onClick={() => void saveSettings({ ...liveSettings, factorSlots: liveSettings.factorSlots.filter((item) => item.type !== slot.type) })}
              >
                ×
              </button>
            ) : null}
          </Badge>
        ))}
        {!readOnly && availableFactors.length ? (
          <NativeSelect
            size="sm"
            aria-label="Agregar factor"
            value=""
            onChange={(event) => {
              const factor = event.target.value as FactorType;
              if (factor) void saveSettings({ ...liveSettings, factorSlots: [...liveSettings.factorSlots, { type: factor, label: FACTOR_TYPE_LABELS[factor] }] });
            }}
          >
            <NativeSelectOption value="">Agregar factor…</NativeSelectOption>
            {availableFactors.map((factor) => <NativeSelectOption key={factor} value={factor}>{FACTOR_TYPE_LABELS[factor]}</NativeSelectOption>)}
          </NativeSelect>
        ) : null}
        {savingSettings ? <Loader2 className="size-3 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
      </div>

      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Ref.</th>
              <th className="px-2 py-1.5 text-left font-medium">Ubicación</th>
              <th className="px-2 py-1.5 text-right font-medium">Superficie</th>
              <th className="px-2 py-1.5 text-right font-medium">Oferta</th>
              <th className="px-2 py-1.5 text-right font-medium">$/m²</th>
              <th className="px-2 py-1.5 text-right font-medium">F. resultante</th>
              <th className="px-2 py-1.5 text-right font-medium">Homologado</th>
              <th className="px-2 py-1.5"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {comparables.map((comparable) => {
              const row = byReference.get(String(comparable.reference));
              return (
                <tr key={comparable.id} className="border-t">
                  <td className="px-2 py-1.5">{comparable.reference}</td>
                  <td className="max-w-56 truncate px-2 py-1.5" title={comparable.location}>
                    {comparable.location}
                    {comparable.photos.length ? <span className="ml-1 text-xs text-muted-foreground">({comparable.photos.length} fotos)</span> : null}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{comparable.area ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{comparable.price ? money(comparable.price) : "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{row ? money(row.unitValue) : "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{row ? row.resultantFactor.toFixed(4) : "—"}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{row ? money(row.homologatedUnitValue) : "—"}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Editar comparable ${comparable.reference}`} onClick={() => setEditing(comparable)}>
                      <Pencil />
                    </Button>
                    {!readOnly ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Eliminar comparable ${comparable.reference}`}
                        onClick={() => {
                          if (window.confirm(`¿Eliminar el comparable ${comparable.reference}?`)) {
                            void run(() => api.market.deleteComparable(valuationId, type, comparable.id), "Comparable eliminado");
                          }
                        }}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!comparables.length ? (
              <tr><td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">Sin comparables todavía.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {!readOnly ? (
          <Button type="button" size="sm" onClick={() => setEditing("nuevo")}>
            <Plus data-icon="inline-start" /> Agregar comparable
          </Button>
        ) : <span />}
        {complete < MIN_COMPARABLES ? (
          <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5" /> Se recomiendan al menos {MIN_COMPARABLES} comparables completos ({complete} de {MIN_COMPARABLES}).
          </span>
        ) : null}
      </div>

      {result && stats ? (
        <dl className="grid gap-x-4 gap-y-1 rounded-md border bg-background p-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Promedio homologado</dt><dd className="tabular-nums">{money(stats.mean)} /m²</dd></div>
          <div><dt className="text-xs text-muted-foreground">Rango</dt><dd className="tabular-nums">{money(stats.min)} – {money(stats.max)}</dd></div>
          <div>
            <dt className="text-xs text-muted-foreground">Dispersión</dt>
            <dd className={stats.dispersion > RECOMMENDED_MAX_DISPERSION ? "text-amber-700 tabular-nums dark:text-amber-400" : "tabular-nums"}>
              {stats.dispersion.toFixed(2)}{stats.dispersion > RECOMMENDED_MAX_DISPERSION ? " (recomendado menos de 1.25)" : ""}
            </dd>
          </div>
          <div><dt className="text-xs text-muted-foreground">Valor adoptado</dt><dd className="tabular-nums">{money(result.adoptedUnitValue)} /m²</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Valor comparativo de mercado</dt>
            <dd className="text-base font-semibold tabular-nums">{money(result.value)}</dd>
          </div>
          {result.adoptedOutsideRange ? (
            <p className="flex items-center gap-1 text-xs text-amber-700 sm:col-span-3 dark:text-amber-400">
              <AlertTriangle className="size-3.5" /> El valor adoptado queda fuera del rango homologado; justifícalo.
            </p>
          ) : null}
        </dl>
      ) : live?.reason ? (
        <p className="text-sm text-muted-foreground">{live.reason}</p>
      ) : null}

      {editing ? (
        <ComparableDialog
          key={editingComparable?.id ?? "nuevo"}
          open
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          comparable={editingComparable ? comparables.find((item) => item.id === editingComparable.id) ?? editingComparable : null}
          factorSlots={calculation.settings.factorSlots}
          unitLabel="Precio de oferta ($)"
          readOnly={readOnly}
          onSubmit={submitComparable(editingComparable)}
          onUploadPhoto={async (file) => {
            if (editingComparable) await run(() => api.market.uploadPhoto(valuationId, type, editingComparable.id, file), "Fotografía agregada");
          }}
          onRemovePhoto={async (photoId) => {
            if (editingComparable) await run(() => api.market.deletePhoto(valuationId, type, editingComparable.id, photoId));
          }}
        />
      ) : null}
    </section>
  );
}
