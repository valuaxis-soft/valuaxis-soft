"use client";

import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api, SessionExpiredError } from "@/lib/api-client";
import { RATE_TABLE_OPTIONS, toIncomeEngineInput, type IncomeCalculationDto, type IncomeInputDto } from "@/features/valuations/calculation/income-types";
import { DEFAULT_ENGINE_CONFIG } from "@/features/valuations/engine/config";
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES, computeIncomeApproach } from "@/features/valuations/engine/income";
import { parseDecimal } from "./comparable-dialog";
import { useSerializedSave } from "./use-serialized-save";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const percent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)} %`;
const text = (value: number | null) => (value === null ? "" : String(value));

type Draft = {
  units: { description: string; area: string; unitRent: string }[];
  /** Deduction rates are edited as percentages ("10" for 10 %). */
  deductions: { concept: string; rate: string }[];
  ratingColumns: (number | null)[];
  appliedRate: string;
};

const draftOf = (input: IncomeInputDto): Draft => ({
  units: input.rentableUnits.map((unit) => ({ description: unit.description, area: text(unit.area), unitRent: text(unit.unitRent) })),
  deductions: input.deductions.map((deduction) => ({
    concept: deduction.concept,
    rate: deduction.rate === null ? "" : String(Number((deduction.rate * 100).toFixed(6))),
  })),
  ratingColumns: input.ratingColumns,
  appliedRate: input.appliedRate === null ? "" : String(Number((input.appliedRate * 100).toFixed(6))),
});

const inputOf = (draft: Draft): IncomeInputDto => ({
  rentableUnits: draft.units.map((unit) => ({ description: unit.description, area: parseDecimal(unit.area), unitRent: parseDecimal(unit.unitRent) })),
  deductions: draft.deductions
    .filter((deduction) => deduction.concept.trim())
    .map((deduction) => {
      const rate = parseDecimal(deduction.rate);
      return { concept: deduction.concept.trim(), rate: rate === null ? null : rate / 100 };
    }),
  ratingColumns: draft.ratingColumns,
  appliedRate: (() => { const rate = parseDecimal(draft.appliedRate); return rate === null ? null : rate / 100; })(),
});

const savedInputOf = (calculation: IncomeCalculationDto): IncomeInputDto => ({
  rentableUnits: calculation.rentableUnits,
  deductions: calculation.deductions,
  ratingColumns: calculation.ratingColumns,
  appliedRate: calculation.appliedRate,
});

/**
 * Income approach: rentable area and rent (adopted in the rent market),
 * deductions and the capitalization rate from the books' table or captured.
 */
export function IncomeCalculationPanel(props: {
  valuationId: string;
  readOnly: boolean;
  onCalculation: (calculation: IncomeCalculationDto) => void;
}) {
  const { valuationId } = props;
  const [calculation, setCalculation] = useState<IncomeCalculationDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const readOnly = props.readOnly || Boolean(calculation?.locked);
  const lastSaved = useRef<string | null>(null);

  const applyServerState = (next: IncomeCalculationDto) => {
    lastSaved.current = JSON.stringify(savedInputOf(next));
    setCalculation(next);
    setDraft(draftOf(next));
  };
  const enqueueSave = useSerializedSave(async (payload: IncomeInputDto) => {
    if (JSON.stringify(payload) === lastSaved.current) return;
    setSaving(true);
    try {
      const next = await api.income.save(valuationId, payload);
      lastSaved.current = JSON.stringify(savedInputOf(next));
      setCalculation(next);
    } catch (error) {
      toast.error(error instanceof SessionExpiredError
        ? "Tu sesión expiró. Vuelve a iniciar sesión."
        : error instanceof Error ? error.message : "No se pudo guardar el enfoque de ingresos.");
    } finally {
      setSaving(false);
    }
  });
  const report = useEffectEvent((next: IncomeCalculationDto) => {
    if (!props.readOnly) props.onCalculation(next);
  });

  useEffect(() => {
    let active = true;
    api.income.get(valuationId)
      .then((next) => { if (active) applyServerState(next); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "No se pudo cargar el enfoque de ingresos."); });
    return () => { active = false; };
  }, [valuationId]);

  useEffect(() => {
    if (calculation) report(calculation);
  }, [calculation]);

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!calculation || !draft) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando el enfoque de ingresos…
      </div>
    );
  }

  const input = inputOf(draft);
  const engineInput = toIncomeEngineInput({ ...input, rentMarket: calculation.rentMarket });
  const result = engineInput.ok ? computeIncomeApproach(engineInput.input, DEFAULT_ENGINE_CONFIG) : null;
  const save = () => { if (!readOnly) void enqueueSave(input); };
  const update = (patch: Partial<Draft>) => setDraft((current) => current && { ...current, ...patch });
  const adopted = calculation.rentMarket.adoptedUnitRent;

  return (
    <section className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:p-4" aria-labelledby="income-calculation-title" onBlur={save}>
      <header className="flex items-center justify-between gap-2">
        <h3 id="income-calculation-title" className="flex items-center gap-2 text-sm font-semibold">
          <Calculator className="size-4" /> Cálculo del enfoque de ingresos
        </h3>
        {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
      </header>
      {calculation.locked ? <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p> : null}
      {!adopted ? (
        <p className="text-xs text-muted-foreground">La renta unitaria sale del mercado de rentas. Captúralo en su sección, o escribe la renta de cada superficie.</p>
      ) : null}

      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Superficie rentable</h4>
          {draft.units.map((unit, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_7rem_9rem_auto] items-end gap-2">
              <Field>
                <FieldLabel htmlFor={`income-unit-${index}`} className="text-xs">Concepto</FieldLabel>
                <Input id={`income-unit-${index}`} value={unit.description} onChange={(event) => update({ units: draft.units.map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`income-area-${index}`} className="text-xs">Superficie (m²)</FieldLabel>
                <Input
                  id={`income-area-${index}`}
                  inputMode="decimal"
                  value={unit.area}
                  placeholder={draft.units.length === 1 && calculation.rentMarket.subjectArea ? String(calculation.rentMarket.subjectArea) : undefined}
                  onChange={(event) => update({ units: draft.units.map((item, i) => i === index ? { ...item, area: event.target.value } : item) })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`income-rent-${index}`} className="text-xs">Renta ($/m²/mes)</FieldLabel>
                <Input
                  id={`income-rent-${index}`}
                  inputMode="decimal"
                  value={unit.unitRent}
                  placeholder={adopted ? `Mercado: ${adopted}` : undefined}
                  onChange={(event) => update({ units: draft.units.map((item, i) => i === index ? { ...item, unitRent: event.target.value } : item) })}
                />
              </Field>
              {!readOnly && draft.units.length > 1 ? (
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Quitar la superficie" onClick={() => update({ units: draft.units.filter((_, i) => i !== index) })}><Trash2 /></Button>
              ) : <span />}
            </div>
          ))}
          {!readOnly ? (
            <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => update({ units: [...draft.units, { description: "", area: "", unitRent: "" }] })}>
              <Plus data-icon="inline-start" /> Superficie rentable
            </Button>
          ) : null}
        </div>

        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Deducciones (% de la renta bruta)</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {draft.deductions.map((deduction, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2">
                <Input aria-label="Concepto de la deducción" value={deduction.concept} onChange={(event) => update({ deductions: draft.deductions.map((item, i) => i === index ? { ...item, concept: event.target.value } : item) })} />
                <Input aria-label={`${deduction.concept}: porcentaje`} inputMode="decimal" value={deduction.rate} onChange={(event) => update({ deductions: draft.deductions.map((item, i) => i === index ? { ...item, rate: event.target.value } : item) })} />
              </div>
            ))}
          </div>
          {!readOnly ? (
            <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => update({ deductions: [...draft.deductions, { concept: "", rate: "" }] })}>
              <Plus data-icon="inline-start" /> Deducción
            </Button>
          ) : null}
        </div>

        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tasa de capitalización</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {RATE_TABLE_CRITERIA.map((criterion, index) => (
              <label key={criterion} className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-2 text-sm">
                <span className="text-muted-foreground">{criterion}</span>
                <NativeSelect
                  className="w-full"
                  value={draft.ratingColumns[index] === null ? "" : String(draft.ratingColumns[index])}
                  onChange={(event) => update({
                    ratingColumns: draft.ratingColumns.map((column, i) => i === index ? (event.target.value === "" ? null : Number(event.target.value)) : column),
                  })}
                >
                  <NativeSelectOption value="">Sin calificar</NativeSelectOption>
                  {RATE_TABLE_OPTIONS[criterion].map((option, column) => (
                    <NativeSelectOption key={option} value={String(column)}>{option} ({percent(RATE_TABLE_RATES[column], 0)})</NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            ))}
          </div>
          <Field className="max-w-60">
            <FieldLabel htmlFor="income-applied-rate">Tasa aplicada (%, opcional)</FieldLabel>
            <Input
              id="income-applied-rate"
              inputMode="decimal"
              value={draft.appliedRate}
              placeholder={result?.tableRate ? `De la tabla: ${(result.tableRate * 100).toFixed(4)}` : undefined}
              onChange={(event) => update({ appliedRate: event.target.value })}
            />
          </Field>
        </div>
      </fieldset>

      {result ? (
        <dl className="grid gap-x-4 gap-y-1 rounded-md border bg-background p-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Renta bruta mensual</dt><dd className="tabular-nums">{money(result.grossMonthlyRent)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Deducciones</dt><dd className="tabular-nums">{percent(result.deductionsRate)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Renta neta anual</dt><dd className="tabular-nums">{money(result.netAnnualRent)}</dd></div>
          <div>
            <dt className="text-xs text-muted-foreground">Tasa aplicada</dt>
            <dd className="tabular-nums">{percent(result.appliedRate, 4)}{result.tableRate !== null && result.appliedRate !== result.tableRate ? ` (tabla ${percent(result.tableRate, 4)})` : ""}</dd>
          </div>
          <div className="sm:col-span-4">
            <dt className="text-xs text-muted-foreground">Valor por capitalización de rentas</dt>
            <dd className="text-base font-semibold tabular-nums">{money(result.value)}</dd>
          </div>
        </dl>
      ) : !engineInput.ok ? <p className="text-sm text-muted-foreground">{engineInput.reason}</p> : null}
    </section>
  );
}
