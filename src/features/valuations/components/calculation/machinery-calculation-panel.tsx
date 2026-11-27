"use client";

import { ArrowDown, ArrowUp, Calculator, IdCard, Loader2, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { Fragment, useDeferredValue, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  EMPTY_MACHINERY_ITEM,
  EXTRA_FACTOR_KEY,
  MACHINERY_CHARACTERISTICS_MAX,
  MACHINERY_EXPENSES,
  MACHINERY_FACTORS,
  MAX_MACHINERY_FACTORS,
  QUOTATION_KINDS,
  alignedCharacteristics,
  conservationFollowsRating,
  conservationFromRating,
  emptyAttachment,
  emptyOffer,
  machineryFactorColumns,
  machineryOfferFactor,
  machineryStatisticsOf,
  toMachineryCostEngineInput,
  toMachineryMarketEngineInput,
  type MachineryAttachmentDto,
  type MachineryCalculationDto,
  type MachineryCharacteristicDto,
  type MachineryCostDto,
  type MachineryFactorColumn,
  type MachineryItemDto,
  type MachineryLinkTable,
  type MachineryMarketDto,
  type MachineryOfferDto,
} from "@/features/valuations/calculation/machinery-types";
import {
  MACHINERY_HOMOLOGATION_COLUMNS,
  MACHINERY_OFFER_INTRO,
  machineryCaptureRows,
  machineryCharacteristicColumn,
  machineryFactorAt,
  machineryFactorColumnId,
  machineryMarketBlocks,
  machineryMarketTableId,
  machineryStatistics,
  machineryUseLabels,
  type MachineryMarketTable,
} from "@/features/valuations/calculation/machinery-document";
import {
  MACHINERY_TABLE_FIELDS,
  isMachineryLinkedColumn,
  machineryColumnField,
  machineryFieldDefaultLabel,
  machineryFieldLabel,
  machineryLinkableFields,
  withMachineryFieldLabel,
  withMachineryLinkedColumn,
} from "@/features/valuations/calculation/machinery-market-columns";
import { MARKET_TEMPLATE_BLOCK_IDS } from "@/features/valuations/calculation/market-document";
import { offerLabelsOf, offerMarkOf, type OfferLevel, type PrintedStatistics } from "@/features/valuations/calculation/market-types";
import type { CapturePages } from "@/features/valuations/calculation/capture-display";
import { formatComparableId } from "@/features/valuations/calculation/comparable-card";
import { CaptureSlot, useCaptureColumns, usePublishCapturePages } from "../editor/capture-host";
import { useConfirmDelete } from "../editor/delete-confirm";
import { CommitCell } from "./commit-cell";
import { MarketOfferLevel } from "./market-offer-level";
import { StatisticsTable, statisticValueText } from "./market-statistics-table";
import { CALCULATION_REDO_LABEL, CALCULATION_UNDO_LABEL, useDraftHistory } from "./use-draft-history";
import type { RoundingDigits } from "@/features/valuations/engine/config";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { collectFormulas, renumberFormulas, withFormulaTexts } from "@/features/valuations/calculation/captured-formulas";
import { effectiveUsefulLife } from "@/features/valuations/engine/factors";
import { MACHINERY_CONSERVATION, computeMachineryCost, computeMachineryMarket } from "@/features/valuations/engine/machinery";
import { RoundingSelect } from "./calculation-controls";
import { CALC_SECTION_HEADING } from "./calculation-table-style";
import { numbersOf, textsOf, type Texts } from "./draft-texts";
import { FormulaInput } from "./formula-input";
import { useSerializedSave } from "./use-serialized-save";
import { SaveRefusedNotice, saveRefusedMessage } from "./save-refused";
import { MachineryAiSearch } from "./machinery-ai-search";
import { offerFromListing } from "@/features/valuations/comparable-search/machinery-offers";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const factor = (value: number | undefined) => (value === undefined ? "—" : value.toFixed(4));
const amount = (value: number | undefined) => (value === undefined ? "—" : money(value));
const cell = "h-7 min-w-0 px-1.5 text-xs";
const heading = CALC_SECTION_HEADING;

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
  // What the server refused last: while it stands, nothing typed after it is being saved.
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSaved = useRef(JSON.stringify(initial));
  const enqueueSave = useSerializedSave(async (payload: MachineryCalculationDto[K]) => {
    const sent = JSON.stringify(payload);
    if (sent === lastSaved.current) return;
    setSaving(true);
    try {
      const next = await api.machinery.save(valuationId, { [part]: payload });
      lastSaved.current = sent;
      setSaveError(null);
      // The draft stays as typed; only the saved state moves.
      onSaved(next);
    } catch (error) {
      const message = saveRefusedMessage(error, "No se pudo guardar el cálculo de maquinaria y equipo.");
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  });
  return { saving, saveError, enqueueSave };
}

function PanelFrame(props: {
  titleId: string;
  title: string;
  saving: boolean;
  saveError?: string | null;
  locked: boolean;
  onBlur: () => void;
  /** Ctrl+Z and Ctrl+Y of the panel's own undo, also in its fields placed in the tables of the dictamen. */
  onKeyDown?: (event: KeyboardEvent) => void;
  /** Buttons at the end of the header (the panel's undo and redo). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:p-4" aria-labelledby={props.titleId} onBlur={props.onBlur} onKeyDown={props.onKeyDown}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={props.titleId} className="flex items-center gap-2 text-sm font-semibold">
          <Calculator className="size-4" /> {props.title}
          {props.saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
        </h3>
        {props.actions}
      </header>
      {props.locked ? <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p> : null}
      <SaveRefusedNotice message={props.saveError ?? null} />
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
  const Control = props.numeric ? FormulaInput : Input;
  return (
    <Field className={props.className}>
      <FieldLabel htmlFor={props.id} className="text-xs">{props.label}</FieldLabel>
      <Control
        id={props.id}
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
      className={props.compact ? "h-7 w-full rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" : "h-8 w-full rounded-md border bg-transparent px-2 text-sm"}
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

/** A cell of a capture table: a number (which takes a formula) or a free text. */
function CaptureInput({ numeric, ...props }: ComponentProps<typeof Input> & { numeric: boolean; value: string }) {
  return numeric ? <FormulaInput {...props} /> : <Input {...props} />;
}

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
                      className="h-7 w-full rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={row[column.key]}
                      onChange={(event) => props.onChange(index, column.key, event.target.value)}
                    >
                      <option value="">—</option>
                      {column.options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <CaptureInput
                      numeric={!column.text}
                      aria-label={column.label}
                      className={cell}
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

/** The draft of what the server holds; a field typed as a formula reads back as typed. */
const costDraftOf = (cost: MachineryCostDto): CostDraft =>
  withFormulaTexts({ item: textsOf(cost.item), attachments: cost.attachments.map(textsOf), rounding: cost.rounding }, cost.formulas);
function costOf(draft: CostDraft, conservationTwice: boolean): MachineryCostDto {
  const cost = {
    item: numbersOf(draft.item, EMPTY_MACHINERY_ITEM),
    attachments: draft.attachments.map((row, index) => numbersOf(row, emptyAttachment(index))),
    rounding: draft.rounding,
    conservationTwice,
  };
  return { ...cost, formulas: collectFormulas(draft, cost) };
}
/** Indices of the rows with a reference: the ones saved. */
const withRef = (rows: { ref: string }[]) => rows.flatMap((row, index) => (row.ref.trim() ? [index] : []));
/** What can be saved: rows still being written (no reference) wait in the draft, and their formulas with them. */
const costPayloadOf = (cost: MachineryCostDto): MachineryCostDto => {
  const kept = withRef(cost.attachments);
  return { ...cost, attachments: kept.map((index) => cost.attachments[index]), formulas: renumberFormulas(cost.formulas ?? {}, "attachments", kept) };
};

type PanelProps = {
  valuationId: string;
  readOnly: boolean;
  onCalculation: (calculation: MachineryCalculationDto) => void;
  /** What is valued is a vehicle: its use is captured in km, as the automobile book (machinery-document.ts). */
  vehicle?: boolean;
};

/**
 * Cost approach of a machinery valuation, as the book's sheet: the item, its
 * quotation, the expenses that install it, its depreciation, and its
 * attachments. Saves when a field loses focus.
 */
export function MachineryCostPanel(props: PanelProps) {
  const { calculation, setCalculation, loadError } = useMachineryCalculation(props.valuationId, props.readOnly, props.onCalculation);
  if (!calculation) return <PanelStatus loadError={loadError} />;
  return <CostForm valuationId={props.valuationId} readOnly={props.readOnly || calculation.locked} calculation={calculation} onSaved={setCalculation} vehicle={props.vehicle} />;
}

type FormProps = { valuationId: string; readOnly: boolean; calculation: MachineryCalculationDto; onSaved: (calculation: MachineryCalculationDto) => void; vehicle?: boolean };

function CostForm({ valuationId, readOnly, calculation, onSaved, vehicle = false }: FormProps) {
  const useLabel = machineryUseLabels({ vehicle }).cost;
  const { conservationTwice } = calculation.cost;
  const [draft, setDraft] = useState(() => costDraftOf(calculation.cost));
  const { saving, saveError, enqueueSave } = useMachinerySave("cost", valuationId, costPayloadOf(costOf(costDraftOf(calculation.cost), conservationTwice)), onSaved);

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
  /**
   * The rating fills the item's FCo with the table's factor (question 3,
   * 9 Oct 2026) unless the appraiser typed a different one, which stays.
   */
  const setRating = (rating: string) => {
    const typed = parseDecimal(draft.item.conservation);
    const fromRating = conservationFromRating(parseDecimal(rating));
    const keepsTable = draft.item.conservation.trim() === "" || conservationFollowsRating(typed, parseDecimal(draft.item.rating));
    const conservation = keepsTable && fromRating !== null ? String(fromRating) : draft.item.conservation;
    change({ ...draft, item: { ...draft.item, rating, conservation } });
  };
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
    <PanelFrame titleId="machinery-cost-title" title="Cálculo del enfoque de costos de maquinaria y equipo" saving={saving} saveError={saveError} locked={calculation.locked} onBlur={() => save()}>
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3">
          <h4 className={heading}>Identificación del bien</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            {IDENTIFICATION.map((field) => itemField(field.key, field.key === "hours" ? useLabel : field.label, { className: field.wide ? "sm:col-span-3" : undefined }))}
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
                onChange={setRating}
              />
            </Field>
            {MACHINERY_FACTORS.filter((item) => conservationTwice || item.key !== "conservation")
              .map((item) => itemField(item.key, item.label, { numeric: true }))}
          </div>
          {conservationTwice && conservationFollowsRating(cost.item.conservation, cost.item.rating) ? (
            <p className="text-xs text-muted-foreground">FCo de la calificación {cost.item.rating}; puedes cambiarlo.</p>
          ) : null}
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

type MarketDraft = {
  offerLevel: OfferLevel | null;
  offerLabels: string[] | null;
  offerMark: number | null;
  offerIntro: string | null;
  usefulLife: string;
  offers: OfferTexts[];
  characteristics: MachineryCharacteristicDto[];
  rounding: RoundingDigits;
  factorColumns: MachineryFactorColumn[] | null;
  fieldLabels: Record<string, string>;
  linkedColumns: NonNullable<MachineryMarketDto["linkedColumns"]>;
  printedStatistics: PrintedStatistics | null;
  additionalAmount: string;
  justification: string;
};

const marketDraftOf = (market: MachineryMarketDto): MarketDraft => withFormulaTexts({
  offerLevel: market.offerLevel,
  offerLabels: market.offerLabels ?? null,
  // A capture of before keeps the level it marked.
  offerMark: offerMarkOf({ offerMark: market.offerMark ?? undefined, offerLevel: market.offerLevel, offerLabels: market.offerLabels }),
  offerIntro: market.offerIntro ?? null,
  usefulLife: market.usefulLife === null ? "" : String(market.usefulLife),
  offers: market.offers.map(textsOf),
  characteristics: alignedCharacteristics(market.characteristics, market.offers.length),
  rounding: market.rounding,
  factorColumns: market.factorColumns ?? null,
  fieldLabels: market.fieldLabels ?? {},
  linkedColumns: market.linkedColumns ?? {},
  printedStatistics: market.printedStatistics ?? null,
  additionalAmount: market.additionalAmount ? String(market.additionalAmount) : "",
  justification: market.justification ?? "",
}, market.formulas);
function marketOf(draft: MarketDraft): MachineryMarketDto {
  const numbers = numbersOf({ usefulLife: draft.usefulLife, additionalAmount: draft.additionalAmount }, { usefulLife: null as number | null, additionalAmount: 0 });
  const market: MachineryMarketDto = {
    offerLevel: draft.offerMark === null ? null : draft.offerLevel,
    offerLabels: draft.offerLabels,
    offerMark: draft.offerMark,
    offerIntro: draft.offerIntro,
    usefulLife: numbers.usefulLife,
    offers: draft.offers.map((row, index) => numbersOf(row, emptyOffer(index))),
    characteristics: draft.characteristics,
    rounding: draft.rounding,
    factorColumns: draft.factorColumns,
    fieldLabels: draft.fieldLabels,
    linkedColumns: draft.linkedColumns,
    printedStatistics: draft.printedStatistics,
    additionalAmount: numbers.additionalAmount,
    justification: draft.justification.trim() || null,
  };
  return { ...market, formulas: collectFormulas({ usefulLife: draft.usefulLife, additionalAmount: draft.additionalAmount, offers: draft.offers }, market) };
}
/** What is saved: the offers with a reference, and the characteristics with a concept, with the values of those offers. */
const marketPayloadOf = (market: MachineryMarketDto): MachineryMarketDto => {
  const kept = withRef(market.offers);
  return {
    ...market,
    formulas: renumberFormulas(market.formulas ?? {}, "offers", kept),
    offers: kept.map((index) => market.offers[index]),
    characteristics: market.characteristics
      .filter((row) => row.label.trim())
      .map((row) => ({ ...row, values: kept.map((index) => row.values[index] ?? "") })),
  };
};

/** Moves the row at `index` one place up (-1) or down (1). */
function moved<T>(rows: T[], index: number, step: -1 | 1): T[] {
  const target = index + step;
  if (target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The references of the book (C1, C2…) follow the order of the offers; one the appraiser named stays. */
const renumbered = (offers: OfferTexts[]) => offers.map((row, index) => (/^C\d+$/i.test(row.ref.trim()) ? { ...row, ref: `C${index + 1}` } : row));

/** A datum of an offer in its cell of the table of the dictamen: framed as a field, the appraiser's among the gray figures. */
const CAPTURE_TEXT_CELL = "border-input bg-background text-xs";
const shownNumber = (text: string, format: (value: number) => string) => {
  const value = parseDecimal(text);
  return value === null ? undefined : format(value);
};
const shownRate = (value: number) => `${(value * 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`;
const shownFactor = (value: number) => value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** A new factor's key: «x» and a short id. */
const newFactorKey = () => `x${Date.now().toString(36)}`;

/**
 * Market approach of a machinery valuation, as the book's sheet «V. ENF.
 * MERCADO» and as the real estate markets since 26 Nov 2026 (every change
 * applies to every approach): everything is captured in the block of the
 * dictamen that prints it, in the book's order (offer level, summary of the
 * comparables, contact, technical characteristics, homologation, values and
 * statistics); what does not print sits right above the table it affects.
 */
export function MachineryMarketPanel(props: PanelProps) {
  const { calculation, setCalculation, loadError } = useMachineryCalculation(props.valuationId, props.readOnly, props.onCalculation);
  if (!calculation) return <PanelStatus loadError={loadError} />;
  return <MarketForm valuationId={props.valuationId} readOnly={props.readOnly || calculation.locked} calculation={calculation} onSaved={setCalculation} vehicle={props.vehicle} />;
}

function MarketForm({ valuationId, readOnly, calculation, onSaved, vehicle = false }: FormProps) {
  const use = machineryUseLabels({ vehicle });
  const [draft, setDraft] = useState(() => marketDraftOf(calculation.market));
  const { saving, saveError, enqueueSave } = useMachinerySave("market", valuationId, marketPayloadOf(marketOf(marketDraftOf(calculation.market))), onSaved);
  const [card, setCard] = useState<number | null>(null);
  const confirmDelete = useConfirmDelete();

  const market = marketOf(draft);
  const input = toMachineryMarketEngineInput(market);
  const result = input.ok ? computeMachineryMarket(input.input) : null;
  const computed = new Map(result?.offers.map((row) => [row.id, row]) ?? []);

  const save = (next = market) => {
    if (!readOnly) void enqueueSave(marketPayloadOf(next));
  };
  // Undo and redo of the panel: every change of the capture, as in a real estate market.
  const history = useDraftHistory<MarketDraft>({
    apply: (target) => {
      setDraft(target);
      save(marketOf(target));
    },
    cellElement: () => null,
  });
  // The draft the latest render read: the columns' callbacks run after it.
  const latest = useRef(draft);
  useLayoutEffect(() => {
    latest.current = draft;
  });
  /** One change of the capture: shown, saved and a step of the panel's «Deshacer». */
  const change = (update: MarketDraft | ((current: MarketDraft) => MarketDraft)) => {
    const before = latest.current;
    const next = typeof update === "function" ? update(before) : update;
    if (next === before || JSON.stringify(next) === JSON.stringify(before)) return;
    history.record(before, null);
    latest.current = next;
    setDraft(next);
    save(marketOf(next));
  };
  const setOffer = (index: number, patch: Partial<OfferTexts>) =>
    change((current) => ({ ...current, offers: current.offers.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) }));

  // The pages of the market as the capture holds them now: their tables are where it is captured (one table, 20 nov 2026).
  const pagesDraft = useDeferredValue(draft);
  const capturePages = useMemo<CapturePages>(() => {
    const live = marketOf(pagesDraft);
    const liveInput = toMachineryMarketEngineInput(live);
    return {
      blocks: machineryMarketBlocks(live, calculation.cost.item, liveInput.ok ? computeMachineryMarket(liveInput.input) : null, { vehicle, capture: true }),
      placeholderIds: MARKET_TEMPLATE_BLOCK_IDS,
    };
  }, [pagesDraft, calculation.cost.item, vehicle]);
  usePublishCapturePages(capturePages);

  /*
   * The columns of the market's tables are the calculation's (videos 8.9 and 8.10): a factor of the homologation is
   * a column of its table (renamed, added among the factors or taken out there; the FRe multiplies them), and a
   * datum of the offer is a column whose name is the datum's everywhere: the column, the characteristics and the card.
   */
  const fieldOptions = { vehicle };
  const renameField = (key: string, label: string) =>
    change((current) => ({ ...current, fieldLabels: withMachineryFieldLabel(current.fieldLabels, key, label, fieldOptions) }));
  const toggleLinked = (table: MachineryLinkTable, key: string, on?: boolean) => change((current) => {
    const linked = current.linkedColumns[table] ?? [];
    return { ...current, linkedColumns: withMachineryLinkedColumn(current.linkedColumns, table, key, on ?? !linked.includes(key)) };
  });
  const factorsNow = () => machineryFactorColumns(latest.current);
  const factorAt = (columnId: string | null) => (columnId === null ? -1 : machineryFactorAt(factorsNow(), columnId));
  const fieldAt = (table: MachineryLinkTable, columnId: string) => machineryColumnField(latest.current, table, columnId);
  // A column added among the factors is a new factor (once, though the table tells it twice).
  const insertedFactors = useRef(new Set<string>());
  const addFactor = (after: string | null, name: string, columnId: string) => {
    if (insertedFactors.current.has(columnId)) return;
    insertedFactors.current.add(columnId);
    const factors = factorsNow();
    if (factors.length >= MAX_MACHINERY_FACTORS) {
      toast.info(`La homologación lleva hasta ${MAX_MACHINERY_FACTORS} factores (sin contar FEd ni FRe).`);
      return;
    }
    const position = after && factorAt(after) >= 0 ? factorAt(after) + 1 : 0;
    const typed = /^(nueva )?columna( \d+)?$/i.test(name.trim()) ? "" : name.trim().slice(0, 40);
    const factor = { key: newFactorKey(), label: typed || `Factor ${factors.length + 1}` };
    change((current) => ({ ...current, factorColumns: [...factors.slice(0, position), factor, ...factors.slice(position)] }));
    toast.success(`Factor «${factor.label}» agregado a la homologación.`, { description: "Escribe el factor de cada oferta en su columna (vacío cuenta como 1); el FRe los multiplica." });
  };
  const removeFactor = (index: number) => {
    const factors = factorsNow();
    const factor = factors[index];
    if (!factor) return;
    change((current) => ({ ...current, factorColumns: factors.filter((_, at) => at !== index) }));
    toast.success(`Factor «${factor.label}» quitado de la homologación.`, { description: "Lo capturado se conserva: Ctrl+Z o «Deshacer en este cálculo» lo regresa." });
  };
  const resumenTable = machineryMarketTableId("resumen");
  useCaptureColumns(resumenTable, {
    handles: (columnId) => fieldAt("resumen", columnId) !== null,
    rename: (columnId, label) => {
      const field = fieldAt("resumen", columnId);
      if (field) renameField(field, label);
    },
    // The reference and the offer are what the market is made of; the rest may go.
    removable: (columnId) => !["col-1", "col-9"].includes(columnId.toLowerCase()),
    takesRemoval: (columnId) => isMachineryLinkedColumn(latest.current, "resumen", columnId),
    remove: (columnId) => {
      const field = fieldAt("resumen", columnId);
      if (field) toggleLinked("resumen", field, false);
    },
    linkable: () => machineryLinkableFields(latest.current, "resumen", fieldOptions),
    link: (key) => toggleLinked("resumen", key),
  });
  const contactTable = machineryMarketTableId("contacto");
  useCaptureColumns(contactTable, {
    handles: (columnId) => fieldAt("contacto", columnId) !== null,
    rename: (columnId, label) => {
      const field = fieldAt("contacto", columnId);
      if (field) renameField(field, label);
    },
    removable: (columnId) => columnId.toLowerCase() !== "col-1",
    takesRemoval: (columnId) => isMachineryLinkedColumn(latest.current, "contacto", columnId),
    remove: (columnId) => {
      const field = fieldAt("contacto", columnId);
      if (field) toggleLinked("contacto", field, false);
    },
    linkable: () => machineryLinkableFields(latest.current, "contacto", fieldOptions),
    link: (key) => toggleLinked("contacto", key),
  });
  const homologationTable = machineryMarketTableId("homologacion");
  const columns = MACHINERY_HOMOLOGATION_COLUMNS;
  useCaptureColumns(homologationTable, {
    handles: (columnId) => factorAt(columnId) >= 0 || fieldAt("homologacion", columnId) !== null,
    rename: (columnId, label) => {
      const index = factorAt(columnId);
      if (index >= 0) {
        const factors = factorsNow();
        change((current) => ({ ...current, factorColumns: factors.map((item, at) => (at === index ? { ...item, label: label.trim().slice(0, 40) || item.label } : item)) }));
        return;
      }
      const field = fieldAt("homologacion", columnId);
      if (field) renameField(field, label);
    },
    // The offer, what puts it on site, the age factor, the FRe and the value are the homologation; the rest may go.
    removable: (columnId) => factorAt(columnId) >= 0 || [columns.fees, columns.installation, columns.expenses].includes(columnId.toLowerCase() as never)
      || isMachineryLinkedColumn(latest.current, "homologacion", columnId),
    takesRemoval: (columnId) => factorAt(columnId) >= 0 || isMachineryLinkedColumn(latest.current, "homologacion", columnId),
    remove: (columnId) => {
      const index = factorAt(columnId);
      if (index >= 0) {
        removeFactor(index);
        return;
      }
      const field = fieldAt("homologacion", columnId);
      if (field) toggleLinked("homologacion", field, false);
    },
    takesInsert: (after) => after !== null && (after.toLowerCase() === columns.age || factorAt(after) >= 0),
    insert: (after, name, columnId) => addFactor(after, name, columnId),
    // The statistics are edited in their own table under the homologation, not among the box labels.
    boxRowManaged: (rowKey) => rowKey.startsWith("valores."),
    linkable: () => machineryLinkableFields(latest.current, "homologacion", fieldOptions),
    link: (key) => toggleLinked("homologacion", key),
  });

  const rows = machineryCaptureRows(market);
  const tableId = machineryMarketTableId;
  const factors = machineryFactorColumns(market);
  const choice = machineryStatisticsOf(market);
  const stats = machineryStatistics(market, result);
  const homologatedValues = result?.offers.map((row) => row.value) ?? [];
  const label = (key: string) => machineryFieldLabel(market, key, fieldOptions);

  const addOffer = () => change((current) => ({
    ...current,
    offers: [...current.offers, textsOf(emptyOffer(current.offers.length))],
    characteristics: current.characteristics.map((row) => ({ ...row, values: [...row.values, ""] })),
  }));
  const moveOffer = (index: number, by: -1 | 1) => change((current) => ({
    ...current,
    offers: renumbered(moved(current.offers, index, by)),
    // Each value goes with its offer.
    characteristics: current.characteristics.map((row) => ({ ...row, values: moved(current.offers.map((_, at) => row.values[at] ?? ""), index, by) })),
  }));
  const removeOffer = (index: number) => {
    const before = latest.current;
    const offer = before.offers[index];
    change((current) => ({
      ...current,
      offers: renumbered(current.offers.filter((_, rowIndex) => rowIndex !== index)),
      // Its values leave with the offer.
      characteristics: current.characteristics.map((row) => ({ ...row, values: row.values.filter((_, valueIndex) => valueIndex !== index) })),
    }));
    toast.success(`Oferta ${offer?.ref ?? ""} eliminada.`, {
      description: "Deshacer (o Ctrl+Z en el cálculo) la regresa a su lugar con sus factores.",
      duration: 15000,
      action: { label: "Deshacer", onClick: () => change(before) },
    });
  };
  const setCharacteristics = (update: (rows: MachineryCharacteristicDto[]) => MachineryCharacteristicDto[]) =>
    change((current) => ({ ...current, characteristics: update(current.characteristics) }));
  const editCharacteristic = (index: number, patch: Partial<MachineryCharacteristicDto>) =>
    setCharacteristics((list) => list.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  const offerField = (index: number, table: MachineryMarketTable, column: string, key: keyof OfferTexts & string, options: { numeric?: boolean; display?: (value: number) => string; placeholder?: string } = {}) => {
    const row = draft.offers[index];
    const rowId = (table === "resumen" ? rows.resumen : table === "contacto" ? rows.contacto : rows.homologacion)[index];
    const text = String(row[key] ?? "");
    return (
      <CaptureSlot key={`${table}:${column}`} at={{ table: tableId(table), row: rowId, column }}>
        <CommitCell
          ariaLabel={`${key === "ref" ? "Referencia" : label(key)}, oferta ${row.ref || index + 1}`}
          className={cn(CAPTURE_TEXT_CELL, options.numeric && "text-right")}
          disabled={readOnly}
          numeric={options.numeric}
          noFill={key === "ref"}
          value={text}
          display={options.numeric && options.display ? shownNumber(text, options.display) : undefined}
          placeholder={options.placeholder}
          onCommit={(typed) => setOffer(index, { [key]: options.numeric ? typed : typed.trim() } as Partial<OfferTexts>)}
        />
      </CaptureSlot>
    );
  };
  const summaryKeys = ["description", "brand", "model", "year", "hours", "attachments", "date"] as const;
  const contactKeys = ["contact", "company", "phone", "email", "link", "location", "notes"] as const;

  return (
    <PanelFrame
      titleId="machinery-market-title"
      title="Cálculo del enfoque de mercado de maquinaria y equipo"
      saving={saving}
      saveError={saveError}
      locked={calculation.locked}
      onBlur={() => save()}
      onKeyDown={(event) => history.onKeyDown(event, latest.current)}
      actions={!readOnly ? (
        <span className="ml-auto inline-flex items-center gap-1" role="group" aria-label="Deshacer y rehacer del cálculo">
          <Button type="button" size="sm" variant="ghost" disabled={!history.canUndo} title="Deshacer el último cambio del cálculo (Ctrl+Z)" onClick={() => history.undo(latest.current)}>
            <Undo2 data-icon="inline-start" /> {CALCULATION_UNDO_LABEL}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={!history.canRedo} title="Rehacer (Ctrl+Y)" onClick={() => history.redo(latest.current)}>
            <Redo2 data-icon="inline-start" /> {CALCULATION_REDO_LABEL}
          </Button>
        </span>
      ) : null}
    >
      <p className="text-xs text-muted-foreground" data-machinery-strip-note="">
        Todo se captura abajo, en el bloque del enfoque de mercado y en el orden de tu formato: nivel de oferta, resumen de comparables, información de contacto,
        características técnicas, cálculo del V.N.R. homologado y valores. Las celdas en blanco son tuyas y las grises las calcula el sistema.
      </p>

      {/* Over the offer level of the page: the options and the one observed (the grid of the dictamen is not edited). */}
      <CaptureSlot at={{ table: tableId("oferta"), part: "before" }} fallback>
        <MarketOfferLevel
          labels={offerLabelsOf({ offerLabels: draft.offerLabels })}
          mark={draft.offerMark}
          intro={draft.offerIntro}
          defaultIntro={MACHINERY_OFFER_INTRO}
          readOnly={readOnly}
          onChange={(offer) => change((current) => ({ ...current, offerLabels: offer.offerLabels ?? null, offerMark: offer.offerMark ?? null, offerIntro: offer.offerIntro ?? null, offerLevel: null }))}
        />
      </CaptureSlot>

      {/* Over the summary of the comparables: adding them, by hand or with the AI search. */}
      <CaptureSlot at={{ table: resumenTable, part: "before" }} fallback>
        <div className="flex flex-wrap items-center gap-2" data-machinery-offers-bar="">
          {!readOnly ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={addOffer}>
                <Plus data-icon="inline-start" /> Agregar oferta
              </Button>
              {/* Audio of 26 nov 2026: the AI search also for machinery, for sale and for rent; its listings come in as offers. */}
              <MachineryAiSearch
                valuationId={valuationId}
                readOnly={readOnly}
                onOffers={(chosen) => {
                  change((current) => {
                    const offers = [...current.offers, ...chosen.map((choice, index) => textsOf(offerFromListing(choice.candidate, choice.item.folio, current.offers.length + index)))];
                    return { ...current, offers, characteristics: current.characteristics.map((row) => ({ ...row, values: offers.map((_, at) => row.values[at] ?? "") })) };
                  });
                  toast.success(`${chosen.length} oferta${chosen.length === 1 ? "" : "s"} agregada${chosen.length === 1 ? "" : "s"}; sus fichas quedan en la base del despacho. Captura edad, V.U.T. y calificación.`);
                }}
              />
            </>
          ) : null}
          {!draft.offers.length ? (
            <p className="text-sm text-muted-foreground">Sin ofertas todavía: agrégalas aquí y sus datos se escriben en las tablas de abajo.</p>
          ) : null}
        </div>
      </CaptureSlot>

      {/* Each offer in its rows of the tables of the dictamen: what it is, its contact and what homologates it are typed there. */}
      {draft.offers.map((row, index) => (
        <Fragment key={index}>
          {offerField(index, "resumen", "col-1", "ref")}
          {summaryKeys.map((key) => offerField(index, "resumen", MACHINERY_TABLE_FIELDS.resumen.find((column) => column.field === key)!.id, key))}
          {offerField(index, "resumen", "col-9", "price", { numeric: true, display: money })}
          <CaptureSlot at={{ table: resumenTable, row: rows.resumen[index] }}>
            <OfferRowActions
              reference={row.ref || String(index + 1)}
              first={index === 0}
              last={index === draft.offers.length - 1}
              readOnly={readOnly}
              onMove={(by) => moveOffer(index, by)}
              onOpen={() => setCard(index)}
              onDelete={() => confirmDelete({
                title: `¿Eliminar la oferta ${row.ref || index + 1}?`,
                description: "Se quita del mercado con sus factores, su contacto y sus características. Puedes regresarla con «Deshacer» en el aviso o con Ctrl+Z en el cálculo.",
                confirmLabel: "Eliminar oferta",
                onConfirm: () => removeOffer(index),
              })}
            />
          </CaptureSlot>
          {contactKeys.map((key) => offerField(index, "contacto", MACHINERY_TABLE_FIELDS.contacto.find((column) => column.field === key)!.id, key))}
          {/* Edad and V.U.T. of each offer, in their rows of the technical characteristics, as the book (G72:AK73). */}
          <CaptureSlot at={{ table: tableId("caracteristicas"), row: rows.characteristics.age, column: machineryCharacteristicColumn.offer(index) }}>
            <CommitCell ariaLabel={`Edad, oferta ${row.ref || index + 1}`} className={cn(CAPTURE_TEXT_CELL, "text-right")} numeric disabled={readOnly} value={row.age} onCommit={(age) => setOffer(index, { age })} />
          </CaptureSlot>
          <CaptureSlot at={{ table: tableId("caracteristicas"), row: rows.characteristics.usefulLife, column: machineryCharacteristicColumn.offer(index) }}>
            <CommitCell
              ariaLabel={`V.U.T., oferta ${row.ref || index + 1}`}
              className={cn(CAPTURE_TEXT_CELL, "text-right")}
              numeric
              disabled={readOnly}
              value={row.usefulLife}
              placeholder={draft.usefulLife || undefined}
              title="Vacía, la vida útil total de las ofertas (arriba de esta tabla)"
              onCommit={(usefulLife) => setOffer(index, { usefulLife })}
            />
          </CaptureSlot>
          {offerField(index, "homologacion", columns.fees, "fees", { numeric: true, display: shownRate })}
          {offerField(index, "homologacion", columns.installation, "installation", { numeric: true, display: shownRate })}
          {/* The conservation rating gives the age factor: chosen under its FEd. */}
          <CaptureSlot at={{ table: homologationTable, row: rows.homologacion[index], column: columns.age }}>
            <span className="grid w-full gap-0.5">
              <span className="px-1 text-right text-xs tabular-nums text-muted-foreground italic">{computed.get(row.ref) ? shownFactor(computed.get(row.ref)!.ageFactor) : "—"}</span>
              <RatingSelect compact label={`Calificación de conservación, oferta ${row.ref || index + 1}`} value={row.rating} onChange={(rating) => setOffer(index, { rating })} />
            </span>
          </CaptureSlot>
          {factors.map((factor) => (
            <CaptureSlot key={factor.key} at={{ table: homologationTable, row: rows.homologacion[index], column: machineryFactorColumnId(factor.key) }}>
              <CommitCell
                ariaLabel={`${factor.label}, oferta ${row.ref || index + 1}`}
                className={CAPTURE_TEXT_CELL}
                numeric
                disabled={readOnly}
                value={isExtraFactor(factor.key) ? (row.extraFactors[factor.key] === undefined ? "" : String(row.extraFactors[factor.key])) : String(row[factor.key as keyof OfferTexts] ?? "")}
                display={shownFactor(machineryOfferFactor(numbersOf(row, emptyOffer(index)), factor.key))}
                onCommit={(typed) => {
                  if (!isExtraFactor(factor.key)) {
                    setOffer(index, { [factor.key]: typed } as Partial<OfferTexts>);
                    return;
                  }
                  const value = parseDecimal(typed);
                  const { [factor.key]: _previous, ...others } = row.extraFactors;
                  setOffer(index, { extraFactors: value === null ? others : { ...others, [factor.key]: value } });
                }}
              />
            </CaptureSlot>
          ))}
        </Fragment>
      ))}

      {/* Over the technical characteristics: the useful life of the offers that do not carry their own. */}
      <CaptureSlot at={{ table: tableId("caracteristicas"), part: "before" }} fallback>
        <fieldset disabled={readOnly} className="grid gap-2 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end" data-machinery-characteristics-bar="">
          <Field>
            <FieldLabel className="text-xs">Vida útil total de las ofertas, V.U.T. (años)</FieldLabel>
            <CommitCell
              ariaLabel="Vida útil total de las ofertas, V.U.T. (años)"
              className="border-input"
              numeric
              disabled={readOnly}
              value={draft.usefulLife}
              onCommit={(usefulLife) => change((current) => ({ ...current, usefulLife }))}
            />
          </Field>
          <p className="pb-1 text-xs text-muted-foreground">
            La de cada oferta que no lleve la suya en su renglón V.U.T. Los renglones propios ({vehicle ? "Color, Motor, Puertas, Llanta repuesto" : "Cabina, Kilómetros, Procedencia, Nivel de demanda"}…) son descriptivos:
            no entran al cálculo. {use.characteristic}, Marca, Modelo, Año y Ubicación vienen del resumen y de la información de contacto.
          </p>
        </fieldset>
      </CaptureSlot>
      {draft.characteristics.map((row, index) => {
        const rowId = rows.characteristics.free[index];
        const name = row.label.trim() || `característica ${index + 1}`;
        const at = (column: string) => ({ table: tableId("caracteristicas"), row: rowId, column });
        return (
          <Fragment key={index}>
            <CaptureSlot at={at(machineryCharacteristicColumn.label)}>
              <CommitCell ariaLabel="Concepto" className={CAPTURE_TEXT_CELL} disabled={readOnly} noFill value={row.label} placeholder="Cabina, Kilómetros…" onCommit={(text) => editCharacteristic(index, { label: text.slice(0, 80) })} />
            </CaptureSlot>
            <CaptureSlot at={at(machineryCharacteristicColumn.subject)}>
              <CommitCell ariaLabel={`Sujeto: ${name}`} className={CAPTURE_TEXT_CELL} disabled={readOnly} value={row.subject} onCommit={(text) => editCharacteristic(index, { subject: text.slice(0, 200) })} />
            </CaptureSlot>
            {draft.offers.map((offer, offerIndex) => (
              <CaptureSlot key={offerIndex} at={at(machineryCharacteristicColumn.offer(offerIndex))}>
                <CommitCell
                  ariaLabel={`Comparable ${offer.ref || offerIndex + 1}: ${name}`}
                  className={CAPTURE_TEXT_CELL}
                  disabled={readOnly}
                  value={row.values[offerIndex] ?? ""}
                  onCommit={(text) => editCharacteristic(index, { values: draft.offers.map((_, at) => (at === offerIndex ? text.slice(0, 200) : row.values[at] ?? "")) })}
                />
              </CaptureSlot>
            ))}
            {!readOnly ? (
              <CaptureSlot at={{ table: tableId("caracteristicas"), row: rowId }}>
                <span className="flex items-center gap-0.5">
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir ${name}`} disabled={index === 0} onClick={() => setCharacteristics((list) => moved(list, index, -1))}><ArrowUp /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar ${name}`} disabled={index === draft.characteristics.length - 1} onClick={() => setCharacteristics((list) => moved(list, index, 1))}><ArrowDown /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Quitar ${name}`} onClick={() => setCharacteristics((list) => list.filter((_, at) => at !== index))}><Trash2 /></Button>
                </span>
              </CaptureSlot>
            ) : null}
          </Fragment>
        );
      })}
      {!readOnly && draft.characteristics.length < MACHINERY_CHARACTERISTICS_MAX ? (
        <CaptureSlot at={{ table: tableId("caracteristicas"), part: "footer" }}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => setCharacteristics((list) => [...list, { label: "", subject: "", values: draft.offers.map(() => "") }])}
          >
            <Plus data-icon="inline-start" /> Agregar característica
          </Button>
        </CaptureSlot>
      ) : null}

      {/* Over the homologation: what its factors are (no «Homologar», no chips: the factors are its columns). */}
      <CaptureSlot at={{ table: homologationTable, part: "before" }} fallback>
        <p className="text-xs text-muted-foreground" data-homologation-in-table="">
          Gastos como fracción de la oferta (0.03 = 3 %). Bajo FEd eliges la calificación de conservación de cada oferta; si su edad alcanza la V.U.T., se calcula con edad + 1.
          Los factores son las columnas bajo «Factores de Homologación»: escribe sobre un encabezado para renombrarlo, inserta una columna entre ellos para agregar un
          factor o elimínala para quitarlo. El FRe es el producto de FEd y los factores.
        </p>
      </CaptureSlot>

      {/* Under the homologation: the values and statistics, then the additional amount and the justification, at the end (video 8.10, 04:18). */}
      <CaptureSlot at={{ table: homologationTable, part: "after" }} fallback>
        <div className="grid gap-3" data-machinery-values="">
          <div className="grid gap-2 rounded-md border bg-background p-2" data-market-statistics="">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Valores y estadísticas</h4>
              <fieldset disabled={readOnly} className="flex items-center gap-2 text-sm">
                <label htmlFor="machinery-market-rounding" className="text-xs text-muted-foreground">Redondeo del valor</label>
                <RoundingSelect id="machinery-market-rounding" label="Redondeo del valor de mercado" value={draft.rounding} onChange={(rounding) => change((current) => ({ ...current, rounding }))} />
              </fieldset>
            </div>
            <StatisticsTable
              choice={choice}
              values={(key) => statisticValueText(key, choice, stats, homologatedValues)}
              readOnly={readOnly}
              hint="Las marcadas se imprimen en este orden en «Valores homologados resultantes»; el valor de mercado es la mediana redondeada."
              onChange={(printedStatistics) => change((current) => ({ ...current, printedStatistics }))}
            />
            {result ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Valor comparativo de mercado: </span>
                <span className="font-semibold tabular-nums">{money(result.value)}</span>
              </p>
            ) : !input.ok ? <p className="text-sm text-muted-foreground">{input.reason}</p> : null}
          </div>
          <fieldset disabled={readOnly} className="grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end" data-additional-amount="">
            <Field>
              <FieldLabel>Monto adicional a considerar ($)</FieldLabel>
              <CommitCell
                ariaLabel="Monto adicional a considerar ($)"
                className="border-input"
                numeric
                disabled={readOnly}
                value={draft.additionalAmount}
                display={shownNumber(draft.additionalAmount, money)}
                placeholder="0"
                onCommit={(additionalAmount) => change((current) => ({ ...current, additionalAmount }))}
              />
            </Field>
            <p className="pb-1 text-xs text-muted-foreground">Se suma a la mediana redondeada y se imprime sobre el valor comparativo de mercado cuando no es cero.</p>
          </fieldset>
          <fieldset disabled={readOnly} className="grid gap-1 rounded-md border bg-background p-2">
            <FieldLabel htmlFor="machinery-market-justification">Justificación de los factores utilizados (se imprime después de la homologación)</FieldLabel>
            <JustificationField
              key={draft.justification}
              id="machinery-market-justification"
              value={draft.justification}
              onCommit={(justification) => change((current) => ({ ...current, justification }))}
            />
          </fieldset>
        </div>
      </CaptureSlot>

      {card !== null && draft.offers[card] ? (
        <MachineryOfferCard
          offer={draft.offers[card]}
          market={market}
          vehicle={vehicle}
          readOnly={readOnly}
          onClose={() => setCard(null)}
          onChange={(patch) => setOffer(card, patch)}
          onRename={renameField}
        />
      ) : null}
    </PanelFrame>
  );
}

const isExtraFactor = (key: string) => EXTRA_FACTOR_KEY.test(key);

/** A text sent when the appraiser leaves it. */
function JustificationField(props: { id: string; value: string; onCommit: (text: string) => void }) {
  const [value, setValue] = useState(props.value);
  return (
    <Textarea
      id={props.id}
      rows={2}
      maxLength={2000}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value.trim() !== props.value.trim()) props.onCommit(value.trim());
      }}
    />
  );
}

/** What an offer's row of the summary does, at its end: move it, open its card, delete it. */
function OfferRowActions(props: { reference: string; first: boolean; last: boolean; readOnly: boolean; onMove: (by: -1 | 1) => void; onOpen: () => void; onDelete: () => void }) {
  return (
    <span className="flex items-center gap-0.5" data-offer-actions={props.reference}>
      {!props.readOnly ? (
        <>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir la oferta ${props.reference}`} disabled={props.first} onClick={() => props.onMove(-1)}><ArrowUp /></Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar la oferta ${props.reference}`} disabled={props.last} onClick={() => props.onMove(1)}><ArrowDown /></Button>
        </>
      ) : null}
      <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-xs" aria-label={`Ver ficha de la oferta ${props.reference}`} onClick={props.onOpen}>
        <IdCard data-icon="inline-start" /> Ver ficha
      </Button>
      {!props.readOnly ? (
        <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-xs text-destructive" aria-label={`Eliminar la oferta ${props.reference}`} onClick={props.onDelete}>
          <Trash2 data-icon="inline-start" /> Eliminar
        </Button>
      ) : null}
    </span>
  );
}

/** The data of the card the appraiser types in it: all of the offer's, with the names they have in the market. */
const CARD_FIELDS = ["description", "brand", "model", "year", "hours", "attachments", "date", "price", "contact", "company", "phone", "email", "link", "location", "notes", "fees", "installation", "age", "usefulLife"] as const;
const NUMERIC_CARD_FIELDS = new Set<string>(["price", "fees", "installation", "age", "usefulLife"]);

/**
 * «Ver ficha» of an offer: every datum of it in one place, also those no
 * table shows. The name of each datum is the market's: renamed here, the
 * columns and the rows of the characteristics read it too, and the other way
 * around (video 8.9).
 */
function MachineryOfferCard(props: {
  offer: OfferTexts;
  market: MachineryMarketDto;
  vehicle: boolean;
  readOnly: boolean;
  onClose: () => void;
  onChange: (patch: Partial<OfferTexts>) => void;
  onRename: (key: string, label: string) => void;
}) {
  const { offer } = props;
  const options = { vehicle: props.vehicle };
  const folio = formatComparableId(parseDecimal(offer.folio));
  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl" data-machinery-offer-card="">
        <DialogHeader>
          <DialogTitle>Ficha de la oferta {offer.ref}</DialogTitle>
          <DialogDescription>
            {folio ? `Ficha ${folio} de la base del despacho. ` : ""}Escribe sobre el nombre de un dato para renombrarlo: las columnas y las características lo toman.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          {CARD_FIELDS.map((key) => {
            const name = machineryFieldLabel(props.market, key, options);
            return (
              <div key={key} className="grid gap-1">
                <CommitCell
                  ariaLabel={`Nombre de «${name}»`}
                  disabled={props.readOnly}
                  value={name}
                  placeholder={machineryFieldDefaultLabel(key, options)}
                  title="Escribe el nombre con el que se imprime; vacío, vuelve el del formato"
                  className="h-6 border-transparent px-0 text-xs font-medium text-foreground hover:border-input focus-visible:border-input"
                  onCommit={(text) => props.onRename(key, text)}
                />
                <CommitCell
                  ariaLabel={`${name}, oferta ${offer.ref}`}
                  disabled={props.readOnly}
                  numeric={NUMERIC_CARD_FIELDS.has(key)}
                  value={String(offer[key] ?? "")}
                  className="border-input"
                  onCommit={(text) => props.onChange({ [key]: NUMERIC_CARD_FIELDS.has(key) ? text : text.trim() } as Partial<OfferTexts>)}
                />
              </div>
            );
          })}
          <div className="grid gap-1">
            <span className="text-xs font-medium">{machineryFieldLabel(props.market, "rating", options)}</span>
            <RatingSelect label={`Calificación de conservación, oferta ${offer.ref}`} value={offer.rating} onChange={(rating) => props.onChange({ rating })} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
