"use client";

import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api, SessionExpiredError } from "@/lib/api-client";
import {
  EMPTY_MACHINERY_ITEM,
  MACHINERY_EXPENSES,
  MACHINERY_FACTORS,
  QUOTATION_KINDS,
  emptyAttachment,
  emptyOffer,
  toMachineryCostEngineInput,
  toMachineryMarketEngineInput,
  type MachineryAttachmentDto,
  type MachineryCalculationDto,
  type MachineryCostDto,
  type MachineryItemDto,
  type MachineryMarketDto,
  type MachineryOfferDto,
} from "@/features/valuations/calculation/machinery-types";
import { OFFER_LEVELS, OFFER_LEVEL_LABELS, type OfferLevel } from "@/features/valuations/calculation/market-types";
import type { RoundingDigits } from "@/features/valuations/engine/config";
import { effectiveUsefulLife } from "@/features/valuations/engine/factors";
import { MACHINERY_CONSERVATION, computeMachineryCost, computeMachineryMarket } from "@/features/valuations/engine/machinery";
import { RoundingSelect } from "./calculation-controls";
import { numbersOf, textsOf, type Texts } from "./draft-texts";
import { useSerializedSave } from "./use-serialized-save";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const factor = (value: number | undefined) => (value === undefined ? "—" : value.toFixed(4));
const amount = (value: number | undefined) => (value === undefined ? "—" : money(value));
const cell = "h-7 min-w-0 px-1.5 text-xs";
const heading = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

/** Loads the machinery calculation and reports what the server holds, so the dictamen follows it. */
function useMachineryCalculation(valuationId: string, readOnly: boolean, onCalculation: (calculation: MachineryCalculationDto) => void) {
  const [calculation, setCalculation] = useState<MachineryCalculationDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const report = useEffectEvent((next: MachineryCalculationDto) => {
    if (!readOnly) onCalculation(next);
  });

  useEffect(() => {
    let active = true;
    api.machinery.get(valuationId)
      .then((next) => { if (active) setCalculation(next); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "No se pudo cargar el cálculo de maquinaria y equipo."); });
    return () => { active = false; };
  }, [valuationId]);

  useEffect(() => {
    if (calculation) report(calculation);
  }, [calculation]);

  return { calculation, setCalculation, loadError };
}

/** Saves one capture (costs or market) one request at a time, skipping what the server already holds. */
function useMachinerySave<K extends "cost" | "market">(
  part: K,
  valuationId: string,
  initial: MachineryCalculationDto[K],
  onSaved: (calculation: MachineryCalculationDto) => void,
) {
  const [saving, setSaving] = useState(false);
  const lastSaved = useRef(JSON.stringify(initial));
  const enqueueSave = useSerializedSave(async (payload: MachineryCalculationDto[K]) => {
    const sent = JSON.stringify(payload);
    if (sent === lastSaved.current) return;
    setSaving(true);
    try {
      const next = await api.machinery.save(valuationId, { [part]: payload });
      lastSaved.current = sent;
      // The draft stays as typed; only the saved state moves.
      onSaved(next);
    } catch (error) {
      toast.error(error instanceof SessionExpiredError
        ? "Tu sesión expiró. Vuelve a iniciar sesión."
        : error instanceof Error ? error.message : "No se pudo guardar el cálculo de maquinaria y equipo.");
    } finally {
      setSaving(false);
    }
  });
  return { saving, enqueueSave };
}

function PanelFrame(props: { titleId: string; title: string; saving: boolean; locked: boolean; onBlur: () => void; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:p-4" aria-labelledby={props.titleId} onBlur={props.onBlur}>
      <header className="flex items-center justify-between gap-2">
        <h3 id={props.titleId} className="flex items-center gap-2 text-sm font-semibold">
          <Calculator className="size-4" /> {props.title}
        </h3>
        {props.saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
      </header>
      {props.locked ? <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p> : null}
      {props.children}
    </section>
  );
}

function PanelStatus(props: { loadError: string | null }) {
  if (props.loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{props.loadError}</p>;
  return (
    <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Cargando el cálculo de maquinaria y equipo…
    </div>
  );
}

function TextField(props: { id: string; label: string; value: string; numeric?: boolean; placeholder?: string; className?: string; onChange: (value: string) => void }) {
  return (
    <Field className={props.className}>
      <FieldLabel htmlFor={props.id} className="text-xs">{props.label}</FieldLabel>
      <Input
        id={props.id}
        inputMode={props.numeric ? "decimal" : undefined}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </Field>
  );
}

function Computed(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className={props.strong ? "text-base font-semibold tabular-nums" : "tabular-nums"}>{props.value}</dd>
    </div>
  );
}

/** Conservation rating of the book's table, 1 to 10. */
function RatingSelect(props: { id?: string; label: string; value: string; compact?: boolean; onChange: (value: string) => void }) {
  return (
    <select
      id={props.id}
      aria-label={props.label}
      className={props.compact ? "h-7 w-full rounded-md border bg-transparent px-1 text-xs" : "h-8 w-full rounded-md border bg-transparent px-2 text-sm"}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">—</option>
      {MACHINERY_CONSERVATION.map((row) => <option key={row.rating} value={String(row.rating)}>{row.rating} · {row.label} ({row.factor})</option>)}
    </select>
  );
}

type Column<Row> = {
  key: keyof Row & string;
  label: string;
  /** Free text; the rest are numbers, which accept formulas. */
  text?: boolean;
  /** Shown, not edited: the reference in the tables that repeat it. */
  fixed?: boolean;
  options?: readonly string[];
  rating?: boolean;
  placeholder?: string;
  className?: string;
};

/** A table of captured rows with the figures the engine computes for each one at the end. */
function CaptureTable<Row extends Record<string, string>>(props: {
  caption: string;
  minWidth: string;
  columns: Column<Row>[];
  rows: Row[];
  computed?: { label: string; value: (row: Row) => string }[];
  readOnly: boolean;
  onChange: (index: number, key: keyof Row & string, value: string) => void;
  onRemove?: (index: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border bg-background">
      <table className="w-full text-xs" style={{ minWidth: props.minWidth }} aria-label={props.caption}>
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            {props.columns.map((column) => <th key={column.key} className="px-1.5 py-1 text-left font-medium">{column.label}</th>)}
            {props.computed?.map((column) => <th key={column.label} className="px-1.5 py-1 text-right font-medium">{column.label}</th>)}
            {props.onRemove ? <th><span className="sr-only">Acciones</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index} className="border-t">
              {props.columns.map((column) => (
                <td key={column.key} className={`p-1 ${column.className ?? ""}`}>
                  {column.fixed ? <span className="px-1.5 font-medium">{row[column.key]}</span> : column.rating ? (
                    <RatingSelect compact label={column.label} value={row[column.key]} onChange={(value) => props.onChange(index, column.key, value)} />
                  ) : column.options ? (
                    <select
                      aria-label={column.label}
                      className="h-7 w-full rounded-md border bg-transparent px-1 text-xs"
                      value={row[column.key]}
                      onChange={(event) => props.onChange(index, column.key, event.target.value)}
                    >
                      <option value="">—</option>
                      {column.options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <Input
                      aria-label={column.label}
                      className={cell}
                      inputMode={column.text ? undefined : "decimal"}
                      value={row[column.key]}
                      placeholder={column.placeholder}
                      onChange={(event) => props.onChange(index, column.key, event.target.value)}
                    />
                  )}
                </td>
              ))}
              {props.computed?.map((column) => (
                <td key={column.label} className="px-1.5 text-right whitespace-nowrap tabular-nums">{column.value(row)}</td>
              ))}
              {props.onRemove ? (
                <td className="p-1">
                  {!props.readOnly ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${row.ref ?? ""}`} onClick={() => props.onRemove?.(index)}><Trash2 /></Button> : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const IDENTIFICATION: { key: keyof MachineryItemDto & string; label: string; wide?: boolean }[] = [
  { key: "name", label: "Nombre del bien", wide: true },
  { key: "brand", label: "Marca" },
  { key: "model", label: "Modelo" },
  { key: "year", label: "Año" },
  { key: "serial", label: "No. de serie" },
  { key: "engineNumber", label: "No. de motor" },
  { key: "plate", label: "No. de matrícula" },
  { key: "hours", label: "Horas" },
  { key: "physicalState", label: "Estado físico" },
  { key: "other", label: "Otro" },
  { key: "deficiencies", label: "Deficiencias", wide: true },
  { key: "attachmentsNote", label: "Piezas especiales / aditamentos", wide: true },
  { key: "notes", label: "Notas", wide: true },
];

const DEPRECIATION_COLUMNS = MACHINERY_FACTORS.map((item) => ({ key: item.key, label: item.short, className: "w-16" }));

const ATTACHMENT_COLUMNS: Column<Texts<MachineryAttachmentDto>>[] = [
  { key: "ref", label: "Ref.", text: true, className: "w-12" },
  { key: "description", label: "Aditamento", text: true, className: "min-w-40" },
  { key: "brand", label: "Marca", text: true, className: "w-24" },
  { key: "supplier", label: "Proveedor", text: true, className: "w-24" },
  { key: "source", label: "Fuente", text: true, className: "w-28" },
  { key: "quotationKind", label: "Cotización", options: QUOTATION_KINDS, className: "w-28" },
  { key: "quotedPrice", label: "Cotización MXN", className: "w-24" },
  { key: "fees", label: "F.E.E.S.", className: "w-14" },
  { key: "engineering", label: "G. ing.", className: "w-14" },
  { key: "installation", label: "G. instal.", className: "w-14" },
  { key: "age", label: "Edad", className: "w-12" },
  { key: "usefulLife", label: "VUT", className: "w-12" },
  ...DEPRECIATION_COLUMNS,
];

type CostDraft = { item: Texts<MachineryItemDto>; attachments: Texts<MachineryAttachmentDto>[]; rounding: RoundingDigits };

const costDraftOf = (cost: MachineryCostDto): CostDraft => ({ item: textsOf(cost.item), attachments: cost.attachments.map(textsOf), rounding: cost.rounding });
const costOf = (draft: CostDraft, conservationTwice: boolean): MachineryCostDto => ({
  item: numbersOf(draft.item, EMPTY_MACHINERY_ITEM),
  attachments: draft.attachments.map((row, index) => numbersOf(row, emptyAttachment(index))),
  rounding: draft.rounding,
  conservationTwice,
});
/** What can be saved: rows still being written (no reference) wait in the draft. */
const costPayloadOf = (cost: MachineryCostDto): MachineryCostDto => ({ ...cost, attachments: cost.attachments.filter((row) => row.ref.trim()) });

type PanelProps = {
  valuationId: string;
  readOnly: boolean;
  onCalculation: (calculation: MachineryCalculationDto) => void;
};

/**
 * Cost approach of a machinery valuation, as the book's sheet: the item, its
 * quotation, the expenses that install it, its depreciation, and its
 * attachments. Saves when a field loses focus.
 */
export function MachineryCostPanel(props: PanelProps) {
  const { calculation, setCalculation, loadError } = useMachineryCalculation(props.valuationId, props.readOnly, props.onCalculation);
  if (!calculation) return <PanelStatus loadError={loadError} />;
  return <CostForm valuationId={props.valuationId} readOnly={props.readOnly || calculation.locked} calculation={calculation} onSaved={setCalculation} />;
}

type FormProps = { valuationId: string; readOnly: boolean; calculation: MachineryCalculationDto; onSaved: (calculation: MachineryCalculationDto) => void };

function CostForm({ valuationId, readOnly, calculation, onSaved }: FormProps) {
  const { conservationTwice } = calculation.cost;
  const [draft, setDraft] = useState(() => costDraftOf(calculation.cost));
  const { saving, enqueueSave } = useMachinerySave("cost", valuationId, costPayloadOf(costOf(costDraftOf(calculation.cost), conservationTwice)), onSaved);

  const cost = costOf(draft, conservationTwice);
  const input = toMachineryCostEngineInput(cost);
  const result = input.ok ? computeMachineryCost(input.input) : null;
  const computed = new Map(result?.attachments.map((row) => [row.ref, row]) ?? []);

  const save = (next = cost) => {
    if (!readOnly) void enqueueSave(costPayloadOf(next));
  };
  // A select has no blur to wait for: it saves as soon as it changes.
  const change = (next: CostDraft) => {
    setDraft(next);
    save(costOf(next, conservationTwice));
  };
  const setItem = (key: keyof MachineryItemDto) => (value: string) => setDraft((current) => ({ ...current, item: { ...current.item, [key]: value } }));
  const itemField = (key: keyof MachineryItemDto & string, label: string, options: { numeric?: boolean; className?: string; placeholder?: string } = {}) => (
    <TextField key={key} id={`machinery-${key}`} label={label} value={draft.item[key]} onChange={setItem(key)} {...options} />
  );
  const setAttachment = (index: number, key: string, value: string) => {
    const next = { ...draft, attachments: draft.attachments.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)) };
    // The kind of quotation is a select.
    if (key === "quotationKind") change(next);
    else setDraft(next);
  };

  const age = cost.item.age;
  const usefulLife = cost.item.usefulLife;
  const extendedLife = age !== null && usefulLife !== null && usefulLife > 0 && effectiveUsefulLife(age, usefulLife, true) !== usefulLife;

  return (
    <PanelFrame titleId="machinery-cost-title" title="Cálculo del enfoque de costos de maquinaria y equipo" saving={saving} locked={calculation.locked} onBlur={() => save()}>
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3">
          <h4 className={heading}>Identificación del bien</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            {IDENTIFICATION.map((field) => itemField(field.key, field.label, { className: field.wide ? "sm:col-span-3" : undefined }))}
          </div>
        </div>

        <div className="grid gap-3">
          <h4 className={heading}>V.R.N. unitario del bien</h4>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="machinery-quotationKind" className="text-xs">Cotización</FieldLabel>
              <NativeSelect
                id="machinery-quotationKind"
                className="w-full"
                value={draft.item.quotationKind}
                onChange={(event) => change({ ...draft, item: { ...draft.item, quotationKind: event.target.value } })}
              >
                <NativeSelectOption value="">—</NativeSelectOption>
                {QUOTATION_KINDS.map((kind) => <NativeSelectOption key={kind} value={kind}>{kind}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            {itemField("supplier", "Proveedor")}
            {itemField("contact", "Teléfono / correo")}
            {itemField("originCountry", "País de origen")}
            {itemField("quotationDate", "Fecha de actualización")}
            {itemField("quotedPrice", "Costo en moneda de origen", { numeric: true })}
            {itemField("exchangeRate", "Tipo de cambio (pesos)", { numeric: true })}
            {itemField("otherFactor", "Otro (factor)", { numeric: true })}
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <Computed label="Valor de cotización en MXN" value={amount(result?.item.quotedMxn)} />
            <Computed label="V.R.N. unitario" value={amount(result?.item.newReplacementValue)} />
          </dl>
        </div>

        <div className="grid gap-3">
          <h4 className={heading}>V.R.N. instalado del bien</h4>
          <p className="text-xs text-muted-foreground">Gastos como fracción de la cotización (0.02 = 2 %).</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            {MACHINERY_EXPENSES.map((expense) => itemField(expense.key, expense.label, { numeric: true }))}
          </div>
          {itemField("expensesNotes", "Notas de los gastos")}
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <Computed label="Suma de gastos" value={result ? `${(result.item.expensesRate * 100).toFixed(2)} %` : "—"} />
            <Computed label="V.R.N. instalado" value={amount(result?.item.installedValue)} />
          </dl>
        </div>

        <div className="grid gap-3">
          <h4 className={heading}>V.N.R. unitario instalado del bien</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {itemField("maintenanceKind", "Tipo de mantenimiento")}
            {itemField("age", "Edad (años)", { numeric: true })}
            {itemField("usefulLife", "Vida útil total (años)", { numeric: true })}
            <Field>
              <FieldLabel htmlFor="machinery-rating" className="text-xs">Calificación de conservación</FieldLabel>
              <RatingSelect
                id="machinery-rating"
                label="Calificación de conservación"
                value={draft.item.rating}
                onChange={(rating) => change({ ...draft, item: { ...draft.item, rating } })}
              />
            </Field>
            {MACHINERY_FACTORS.filter((item) => conservationTwice || item.key !== "conservation")
              .map((item) => itemField(item.key, item.label, { numeric: true }))}
          </div>
          <p className="text-xs text-muted-foreground">
            {conservationTwice
              ? "La calificación de conservación entra en el factor de edad (FEd) y el FCo capturado multiplica además el factor resultante (FRe)."
              : "La calificación de conservación entra en el factor de edad (FEd); el factor resultante (FRe) no lleva otro factor de conservación."}
            {extendedLife ? ` La edad alcanza la vida útil: se calcula con una vida útil de ${(age ?? 0) + 1} años (edad + 1).` : ""}
          </p>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <Computed label="Factor de edad FEd" value={factor(result?.item.ageFactor)} />
            <Computed label="Factor resultante FRe" value={factor(result?.item.resultantFactor)} />
            <Computed label="V.N.R. del bien" value={amount(result?.item.value)} />
          </dl>
        </div>

        <div className="grid gap-2">
          <h4 className={heading}>V.N.R. de piezas especiales / aditamentos</h4>
          <CaptureTable
            caption="Piezas especiales y aditamentos"
            minWidth="1500px"
            columns={ATTACHMENT_COLUMNS}
            rows={draft.attachments}
            readOnly={readOnly}
            onChange={setAttachment}
            onRemove={(index) => change({ ...draft, attachments: draft.attachments.filter((_, rowIndex) => rowIndex !== index) })}
            computed={[
              { label: "V.R.N. instalado", value: (row) => amount(computed.get(row.ref)?.installedValue) },
              { label: "FEd", value: (row) => factor(computed.get(row.ref)?.ageFactor) },
              { label: "FRe", value: (row) => factor(computed.get(row.ref)?.resultantFactor) },
              { label: "V.N.R.", value: (row) => amount(computed.get(row.ref)?.value) },
            ]}
          />
          {!readOnly ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => setDraft((current) => ({ ...current, attachments: [...current.attachments, textsOf(emptyAttachment(current.attachments.length))] }))}
            >
              <Plus data-icon="inline-start" /> Aditamento
            </Button>
          ) : null}
        </div>

        <Field className="sm:max-w-xs">
          <FieldLabel htmlFor="machinery-cost-rounding" className="text-xs">Redondeo del valor físico</FieldLabel>
          <RoundingSelect id="machinery-cost-rounding" label="Redondeo del valor físico" value={draft.rounding} onChange={(rounding) => change({ ...draft, rounding })} />
        </Field>
      </fieldset>

      {result ? (
        <dl className="grid gap-x-4 gap-y-1 rounded-md border bg-background p-3 text-sm sm:grid-cols-3">
          <Computed label="V.N.R. del bien" value={money(result.item.value)} />
          <Computed label="Aditamentos" value={money(result.attachmentsTotal)} />
          <Computed label="Valor físico del bien" value={money(result.physicalValue)} strong />
        </dl>
      ) : !input.ok ? <p className="text-sm text-muted-foreground">{input.reason}</p> : null}
    </PanelFrame>
  );
}

type OfferTexts = Texts<MachineryOfferDto>;

const OFFER_SUMMARY_COLUMNS: Column<OfferTexts>[] = [
  { key: "ref", label: "Ref.", text: true, className: "w-14" },
  { key: "description", label: "Descripción", text: true, className: "min-w-40" },
  { key: "brand", label: "Marca", text: true, className: "w-28" },
  { key: "model", label: "Modelo", text: true, className: "w-24" },
  { key: "year", label: "Año", text: true, className: "w-16" },
  { key: "hours", label: "Horas", text: true, className: "w-20" },
  { key: "attachments", label: "Aditamentos", text: true, className: "min-w-40" },
  { key: "date", label: "Fecha", text: true, className: "w-24" },
  { key: "price", label: "Valor de oferta", className: "w-28" },
];

const OFFER_CONTACT_COLUMNS: Column<OfferTexts>[] = [
  { key: "ref", label: "Ref.", fixed: true, className: "w-14" },
  { key: "contact", label: "Contacto", text: true, className: "min-w-32" },
  { key: "company", label: "Empresa", text: true, className: "min-w-32" },
  { key: "phone", label: "Teléfono", text: true, className: "w-28" },
  { key: "email", label: "Correo", text: true, className: "min-w-32" },
  { key: "link", label: "Link", text: true, className: "min-w-32" },
  { key: "location", label: "Ubicación", text: true, className: "min-w-32" },
  { key: "notes", label: "Observaciones", text: true, className: "min-w-40" },
];

type MarketDraft = { offerLevel: OfferLevel | null; usefulLife: string; offers: OfferTexts[]; rounding: RoundingDigits };

const marketDraftOf = (market: MachineryMarketDto): MarketDraft =>
  ({ offerLevel: market.offerLevel, usefulLife: market.usefulLife === null ? "" : String(market.usefulLife), offers: market.offers.map(textsOf), rounding: market.rounding });
const marketOf = (draft: MarketDraft): MachineryMarketDto => ({
  offerLevel: draft.offerLevel,
  usefulLife: numbersOf({ usefulLife: draft.usefulLife }, { usefulLife: null as number | null }).usefulLife,
  offers: draft.offers.map((row, index) => numbersOf(row, emptyOffer(index))),
  rounding: draft.rounding,
});
const marketPayloadOf = (market: MachineryMarketDto): MachineryMarketDto => ({ ...market, offers: market.offers.filter((row) => row.ref.trim()) });

/**
 * Market approach of a machinery valuation, as the book's sheet: the offers of
 * similar equipment, their contacts, and the factors that take each one to the
 * subject. Saves when a field loses focus.
 */
export function MachineryMarketPanel(props: PanelProps) {
  const { calculation, setCalculation, loadError } = useMachineryCalculation(props.valuationId, props.readOnly, props.onCalculation);
  if (!calculation) return <PanelStatus loadError={loadError} />;
  return <MarketForm valuationId={props.valuationId} readOnly={props.readOnly || calculation.locked} calculation={calculation} onSaved={setCalculation} />;
}

function MarketForm({ valuationId, readOnly, calculation, onSaved }: FormProps) {
  const [draft, setDraft] = useState(() => marketDraftOf(calculation.market));
  const { saving, enqueueSave } = useMachinerySave("market", valuationId, marketPayloadOf(marketOf(marketDraftOf(calculation.market))), onSaved);

  const market = marketOf(draft);
  const input = toMachineryMarketEngineInput(market);
  const result = input.ok ? computeMachineryMarket(input.input) : null;
  const computed = new Map(result?.offers.map((row) => [row.id, row]) ?? []);

  const save = (next = market) => {
    if (!readOnly) void enqueueSave(marketPayloadOf(next));
  };
  // A select has no blur to wait for: it saves as soon as it changes.
  const change = (next: MarketDraft) => {
    setDraft(next);
    save(marketOf(next));
  };
  const setOffer = (index: number, key: string, value: string) => {
    const next = { ...draft, offers: draft.offers.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)) };
    if (key === "rating") change(next);
    else setDraft(next);
  };
  const homologationColumns: Column<OfferTexts>[] = [
    { key: "ref", label: "Ref.", fixed: true, className: "w-14" },
    { key: "fees", label: "F.E.E.S.", className: "w-16" },
    { key: "installation", label: "G. instal.", className: "w-16" },
    { key: "age", label: "Edad", className: "w-14" },
    { key: "usefulLife", label: "V.U.T.", className: "w-16", placeholder: draft.usefulLife || undefined },
    { key: "rating", label: "Calif. conservación", rating: true, className: "w-40" },
    ...DEPRECIATION_COLUMNS,
  ];

  return (
    <PanelFrame titleId="machinery-market-title" title="Cálculo del enfoque de mercado de maquinaria y equipo" saving={saving} locked={calculation.locked} onBlur={() => save()}>
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="machinery-offer-level" className="text-xs">Nivel de oferta observada</FieldLabel>
            <NativeSelect
              id="machinery-offer-level"
              className="w-full"
              value={draft.offerLevel ?? ""}
              onChange={(event) => change({ ...draft, offerLevel: (event.target.value || null) as OfferLevel | null })}
            >
              <NativeSelectOption value="">—</NativeSelectOption>
              {OFFER_LEVELS.map((level) => <NativeSelectOption key={level} value={level}>{OFFER_LEVEL_LABELS[level]}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <TextField
            id="machinery-market-life"
            label="Vida útil total, V.U.T. (años)"
            numeric
            value={draft.usefulLife}
            onChange={(usefulLife) => setDraft((current) => ({ ...current, usefulLife }))}
          />
          <Field>
            <FieldLabel htmlFor="machinery-market-rounding" className="text-xs">Redondeo del valor de mercado</FieldLabel>
            <RoundingSelect id="machinery-market-rounding" label="Redondeo del valor de mercado" value={draft.rounding} onChange={(rounding) => change({ ...draft, rounding })} />
          </Field>
        </div>

        <div className="grid gap-2">
          <h4 className={heading}>Resumen de comparables</h4>
          <CaptureTable
            caption="Resumen de comparables"
            minWidth="980px"
            columns={OFFER_SUMMARY_COLUMNS}
            rows={draft.offers}
            readOnly={readOnly}
            onChange={setOffer}
            onRemove={(index) => change({ ...draft, offers: draft.offers.filter((_, rowIndex) => rowIndex !== index) })}
          />
          {!readOnly ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => setDraft((current) => ({ ...current, offers: [...current.offers, textsOf(emptyOffer(current.offers.length))] }))}
            >
              <Plus data-icon="inline-start" /> Oferta
            </Button>
          ) : null}
        </div>

        {draft.offers.length ? (
          <>
            <div className="grid gap-2">
              <h4 className={heading}>Información de contacto</h4>
              <CaptureTable caption="Información de contacto" minWidth="980px" columns={OFFER_CONTACT_COLUMNS} rows={draft.offers} readOnly={readOnly} onChange={setOffer} />
            </div>
            <div className="grid gap-2">
              <h4 className={heading}>Cálculo del V.N.R. homologado</h4>
              <p className="text-xs text-muted-foreground">
                Gastos como fracción de la oferta (0.03 = 3 %). La V.U.T. de una oferta, si se deja vacía, es la de arriba; si su edad la alcanza, se calcula con edad + 1.
              </p>
              <CaptureTable
                caption="Cálculo del V.N.R. homologado"
                minWidth="1100px"
                columns={homologationColumns}
                rows={draft.offers}
                readOnly={readOnly}
                onChange={setOffer}
                computed={[
                  { label: "Puesto en sitio", value: (row) => amount(computed.get(row.ref)?.adjustedPrice) },
                  { label: "FEd", value: (row) => factor(computed.get(row.ref)?.ageFactor) },
                  { label: "FRe", value: (row) => factor(computed.get(row.ref)?.resultantFactor) },
                  { label: "V.N.R. homologado", value: (row) => amount(computed.get(row.ref)?.value) },
                ]}
              />
            </div>
          </>
        ) : null}
      </fieldset>

      {result ? (
        <dl className="grid gap-x-4 gap-y-1 rounded-md border bg-background p-3 text-sm sm:grid-cols-3">
          <Computed label="Valor promedio homologado" value={money(result.mean)} />
          <Computed label="Mediana" value={money(result.median)} />
          <Computed label="Valor comparativo de mercado" value={money(result.value)} strong />
        </dl>
      ) : !input.ok ? <p className="text-sm text-muted-foreground">{input.reason}</p> : null}
    </PanelFrame>
  );
}
