"use client";

import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api, SessionExpiredError } from "@/lib/api-client";
import {
  DEDUCTIONS_BY_METHOD,
  DEFAULT_DEDUCTIONS,
  INCOME_METHOD_LABELS,
  RATE_TABLE_OPTIONS,
  toIncomeEngineInput,
  type IncomeCalculationDto,
  type IncomeDeductionDto,
  type IncomeInputDto,
} from "@/features/valuations/calculation/income-types";
import { DEFAULT_ENGINE_CONFIG } from "@/features/valuations/engine/config";
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES, computeIncomeApproach, type IncomeMethod } from "@/features/valuations/engine/income";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { useSerializedSave } from "./use-serialized-save";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const percent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)} %`;
const text = (value: number | null) => (value === null ? "" : String(value));
/** Fractions are edited as percentages ("7.92" for 0.0792). */
const asPercent = (value: number | null) => (value === null ? "" : String(Number((value * 100).toFixed(6))));
const fromPercent = (value: string) => { const parsed = parseDecimal(value); return parsed === null ? null : parsed / 100; };

/** The typical deductions of each book's method. */
const typicalDeductions = (method: IncomeMethod): IncomeDeductionDto[] => (method === "tabla" ? DEFAULT_DEDUCTIONS : DEDUCTIONS_BY_METHOD[method]);

type Draft = {
  method: IncomeMethod;
  annuity: { vacancyDays: string; contractYears: string; otherMonthlyIncome: string; tiie: string; inflation: string; remainingLifeYears: string; option: 1 | 2 };
  marketRate: { negotiation: string; vacancy: string; salePrices: Record<string, string> };
  units: { description: string; area: string; unitRent: string }[];
  /** Deduction rates are edited as percentages ("10" for 10 %). */
  deductions: { concept: string; rate: string }[];
  ratingColumns: (number | null)[];
  appliedRate: string;
};

const draftOf = (input: IncomeInputDto): Draft => ({
  method: input.method,
  annuity: {
    vacancyDays: text(input.annuity.vacancyDays),
    contractYears: text(input.annuity.contractYears),
    otherMonthlyIncome: text(input.annuity.otherMonthlyIncome),
    tiie: asPercent(input.annuity.tiie),
    inflation: asPercent(input.annuity.inflation),
    remainingLifeYears: text(input.annuity.remainingLifeYears),
    option: input.annuity.option,
  },
  marketRate: {
    negotiation: asPercent(input.marketRate.negotiation),
    vacancy: asPercent(input.marketRate.vacancy),
    salePrices: Object.fromEntries(Object.entries(input.marketRate.salePrices).map(([key, value]) => [key, text(value)])),
  },
  units: input.rentableUnits.map((unit) => ({ description: unit.description, area: text(unit.area), unitRent: text(unit.unitRent) })),
  deductions: input.deductions.map((deduction) => ({
    concept: deduction.concept,
    rate: deduction.rate === null ? "" : String(Number((deduction.rate * 100).toFixed(6))),
  })),
  ratingColumns: input.ratingColumns,
  appliedRate: input.appliedRate === null ? "" : String(Number((input.appliedRate * 100).toFixed(6))),
});

const inputOf = (draft: Draft): IncomeInputDto => ({
  method: draft.method,
  annuity: {
    vacancyDays: parseDecimal(draft.annuity.vacancyDays),
    contractYears: parseDecimal(draft.annuity.contractYears),
    otherMonthlyIncome: parseDecimal(draft.annuity.otherMonthlyIncome),
    tiie: fromPercent(draft.annuity.tiie),
    inflation: fromPercent(draft.annuity.inflation),
    remainingLifeYears: parseDecimal(draft.annuity.remainingLifeYears),
    option: draft.annuity.option,
  },
  marketRate: {
    negotiation: fromPercent(draft.marketRate.negotiation),
    vacancy: fromPercent(draft.marketRate.vacancy),
    salePrices: Object.fromEntries(Object.entries(draft.marketRate.salePrices).map(([key, value]) => [key, parseDecimal(value)])),
  },
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
  method: calculation.method,
  annuity: calculation.annuity,
  marketRate: calculation.marketRate,
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
  const method = draft.method;
  const setAnnuity = (key: keyof Draft["annuity"]) => (event: { target: { value: string } }) =>
    update({ annuity: { ...draft.annuity, [key]: event.target.value } });
  const changeMethod = (next: IncomeMethod) => {
    // Untouched typical deductions follow the method; edited ones stay as they are.
    const untouched = JSON.stringify(input.deductions) === JSON.stringify(typicalDeductions(method));
    const deductions = untouched
      ? typicalDeductions(next).map((row) => ({ concept: row.concept, rate: asPercent(row.rate) }))
      : draft.deductions;
    const nextDraft = { ...draft, method: next, deductions };
    setDraft(nextDraft);
    if (!readOnly) void enqueueSave(inputOf(nextDraft));
  };

  return (
    <section className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:p-4" aria-labelledby="income-calculation-title" onBlur={save}>
      <header className="flex items-center justify-between gap-2">
        <h3 id="income-calculation-title" className="flex items-center gap-2 text-sm font-semibold">
          <Calculator className="size-4" /> Cálculo del enfoque de ingresos
        </h3>
        {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
      </header>
      {calculation.locked ? <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p> : null}
      <Field className="max-w-md">
        <FieldLabel htmlFor="income-method">Método</FieldLabel>
        <NativeSelect id="income-method" className="w-full" disabled={readOnly} value={method} onChange={(event) => changeMethod(event.target.value as IncomeMethod)}>
          {(Object.keys(INCOME_METHOD_LABELS) as IncomeMethod[]).map((key) => (
            <NativeSelectOption key={key} value={key}>{INCOME_METHOD_LABELS[key]}</NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {!adopted && method !== "mercado" ? (
        <p className="text-xs text-muted-foreground">La renta unitaria sale del mercado de rentas. Captúralo en su sección, o escribe la renta de cada superficie.</p>
      ) : null}

      <fieldset disabled={readOnly} className="grid gap-4">
        {method !== "mercado" ? (
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
        ) : (
        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Precio de venta de cada comparable de renta</h4>
          <p className="text-xs text-muted-foreground">
            La tasa sale de comparar la renta de cada comparable con su precio de venta. Se usa la superficie del sujeto del mercado de rentas.
          </p>
          {calculation.rentMarket.comparables.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {calculation.rentMarket.comparables.map((comparable) => (
                <Field key={comparable.reference}>
                  <FieldLabel htmlFor={`income-sale-${comparable.reference}`} className="text-xs">
                    {comparable.reference}. {comparable.location}
                  </FieldLabel>
                  <Input
                    id={`income-sale-${comparable.reference}`}
                    inputMode="decimal"
                    placeholder="Precio de venta ($)"
                    value={draft.marketRate.salePrices[String(comparable.reference)] ?? ""}
                    onChange={(event) => update({ marketRate: { ...draft.marketRate, salePrices: { ...draft.marketRate.salePrices, [String(comparable.reference)]: event.target.value } } })}
                  />
                </Field>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">Captura primero los comparables del mercado de rentas.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="income-negotiation" className="text-xs">Negociación (%)</FieldLabel>
              <Input id="income-negotiation" inputMode="decimal" value={draft.marketRate.negotiation} onChange={(event) => update({ marketRate: { ...draft.marketRate, negotiation: event.target.value } })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="income-vacancy" className="text-xs">Vacíos (%)</FieldLabel>
              <Input id="income-vacancy" inputMode="decimal" value={draft.marketRate.vacancy} onChange={(event) => update({ marketRate: { ...draft.marketRate, vacancy: event.target.value } })} />
            </Field>
          </div>
        </div>
        )}

        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {method === "mercado" ? "Gastos de operación (%)" : method === "anualidad" ? "Deducciones (%, sin vacíos)" : "Deducciones (% de la renta bruta)"}
          </h4>
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

        {method === "anualidad" ? (
        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Vacíos y capitalización</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field><FieldLabel htmlFor="income-vacancy-days" className="text-xs">Días de vacío</FieldLabel><Input id="income-vacancy-days" inputMode="decimal" value={draft.annuity.vacancyDays} onChange={setAnnuity("vacancyDays")} /></Field>
            <Field><FieldLabel htmlFor="income-contract-years" className="text-xs">Años de contrato</FieldLabel><Input id="income-contract-years" inputMode="decimal" value={draft.annuity.contractYears} onChange={setAnnuity("contractYears")} /></Field>
            <Field><FieldLabel htmlFor="income-other" className="text-xs">Otros ingresos ($/mes)</FieldLabel><Input id="income-other" inputMode="decimal" value={draft.annuity.otherMonthlyIncome} onChange={setAnnuity("otherMonthlyIncome")} /></Field>
            <Field><FieldLabel htmlFor="income-tiie" className="text-xs">TIIE 28 días (%)</FieldLabel><Input id="income-tiie" inputMode="decimal" value={draft.annuity.tiie} onChange={setAnnuity("tiie")} /></Field>
            <Field><FieldLabel htmlFor="income-inflation" className="text-xs">Inflación anual estimada (%)</FieldLabel><Input id="income-inflation" inputMode="decimal" value={draft.annuity.inflation} onChange={setAnnuity("inflation")} /></Field>
            <Field><FieldLabel htmlFor="income-remaining-life" className="text-xs">Vida útil remanente (años)</FieldLabel><Input id="income-remaining-life" inputMode="decimal" value={draft.annuity.remainingLifeYears} onChange={setAnnuity("remainingLifeYears")} /></Field>
          </div>
          <Field className="max-w-md">
            <FieldLabel htmlFor="income-option" className="text-xs">Valor que se concluye</FieldLabel>
            <NativeSelect id="income-option" className="w-full" value={String(draft.annuity.option)} onChange={(event) => update({ annuity: { ...draft.annuity, option: Number(event.target.value) as 1 | 2 } })}>
              <NativeSelectOption value="1">Opción 1: tasa base mercado</NativeSelectOption>
              <NativeSelectOption value="2">Opción 2: anualidad</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
        ) : null}

        {method === "tabla" ? (
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
        ) : null}
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
          {result.annuity ? (
            <div className="sm:col-span-4 grid gap-1 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Opción 1 · tasa {percent(result.annuity.option1.rate, 4)}</dt><dd className="tabular-nums">{money(result.annuity.option1.value)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Opción 2 · tasa {percent(result.annuity.option2.rate, 4)}, {result.annuity.option2.months} meses</dt><dd className="tabular-nums">{money(result.annuity.option2.value)}</dd></div>
            </div>
          ) : null}
          {result.marketRate ? (
            <div className="sm:col-span-4">
              <dt className="text-xs text-muted-foreground">Tasa de cada comparable</dt>
              <dd className="tabular-nums">{result.marketRate.comparables.map((row) => `${row.id}: ${percent(row.rate, 4)}`).join(" · ")}</dd>
            </div>
          ) : null}
          <div className="sm:col-span-4">
            <dt className="text-xs text-muted-foreground">Valor por capitalización de rentas</dt>
            <dd className="text-base font-semibold tabular-nums">{money(result.value)}</dd>
          </div>
        </dl>
      ) : !engineInput.ok ? <p className="text-sm text-muted-foreground">{engineInput.reason}</p> : null}
    </section>
  );
}
