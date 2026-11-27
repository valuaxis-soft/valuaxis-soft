"use client";

import { Calculator, Columns2, Loader2, MoreHorizontal, Plus, Rows2, Trash2 } from "lucide-react";
import { Fragment, useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "@/lib/api-client";
import {
  DEDUCTIONS_BY_METHOD,
  DEFAULT_DEDUCTIONS,
  DEFAULT_RATE_TABLE,
  INCOME_METHOD_LABELS,
  concludedMonthlyRentFor,
  editRateRows,
  isRatingRow,
  withRateRows,
  rateCriteriaOf,
  rateTableOf,
  ratingColumnsFor,
  toIncomeEngineInput,
  type IncomeCalculationDto,
  type IncomeDeductionDto,
  type IncomeInputDto,
  type RateTableRowDto,
  incomeEngineConfig,
} from "@/features/valuations/calculation/income-types";
import { RATE_TABLE_RATES, computeIncomeApproach, type IncomeApproachResult, type IncomeMethod } from "@/features/valuations/engine/income";
import type { RoundingDigits } from "@/features/valuations/engine/config";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { collectFormulas, withFormulaTexts } from "@/features/valuations/calculation/captured-formulas";
import { FormulaInput } from "./formula-input";
import type { CapturePages } from "@/features/valuations/calculation/capture-display";
import { INCOME_CAPTURE, INCOME_TEMPLATE_BLOCK_IDS, incomeCaptureBlocks } from "@/features/valuations/calculation/income-document";
import { CaptureSlot, usePublishCapturePages } from "../editor/capture-host";
import { ApproachLeftOutNotice, ApproachRemoval, type ApproachInReport } from "./approach-removal";
import { CalcTableContextMenu } from "./calc-table-context-menu";
import { CaptureHeaderControl, CaptureTableHead, type CaptureHeadColumn } from "./capture-table-head";
import { withTableHeaders, type CaptureHeaders, type SectionCaptureHeaders } from "@/features/valuations/services/capture-headers";
import { rowActionsOf } from "./calc-table-rows";
import { CALC_ROW, CALC_SECTION_HEADING, CALC_TABLE, CALC_TABLE_FRAME } from "./calculation-table-style";
import { RoundingMenu } from "./rounding-menu";
import { useSerializedSave } from "./use-serialized-save";
import { cn } from "@/lib/utils";
import { SaveRefusedNotice, saveRefusedMessage } from "./save-refused";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const percent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)} %`;
const text = (value: number | null) => (value === null ? "" : String(value));
/** Fractions are edited as percentages ("7.92" for 0.0792). */
const asPercent = (value: number | null) => (value === null ? "" : String(Number((value * 100).toFixed(6))));
/** A field in percent: "7.92" is 7.92 %, and so is "7.92 %" while its sign is still there (video 8.14, 22:14). */
const fromPercent = (value: string) => {
  const typed = value.trim();
  if (typed.endsWith("%") && !typed.startsWith("=")) return parseDecimal(typed);
  const parsed = parseDecimal(value);
  return parsed === null ? null : parsed / 100;
};

/** The typical deductions of each book's method. */
const typicalDeductions = (method: IncomeMethod): IncomeDeductionDto[] => (method === "tabla" ? DEFAULT_DEDUCTIONS : DEDUCTIONS_BY_METHOD[method]);

type Draft = {
  method: IncomeMethod;
  annuity: { vacancyDays: string; contractYears: string; otherMonthlyIncome: string; tiie: string; inflation: string; remainingLifeYears: string; option: 1 | 2 };
  marketRate: { negotiation: string; vacancy: string; salePrices: Record<string, string> };
  units: { description: string; area: string; unitRent: string }[];
  /** Deduction rates are edited as percentages ("10" for 10 %). */
  deductions: { concept: string; rate: string }[];
  /** Where the second table of deductions starts; null, one table. */
  deductionsSplit: number | null;
  ratingColumns: (number | null)[];
  /** Bravo Armejo's table as the appraiser keeps it. */
  rateTable: RateTableRowDto[];
  /** The rates of «Tasa a utilizar», as percentages. */
  appliedRate: string;
  rateFromMarket: string;
  weightedRate: string;
  rounding: RoundingDigits;
};

/** The draft of what the server holds; a field typed as a formula reads back as typed. */
function draftOf(input: IncomeInputDto): Draft {
  const formulas = Object.fromEntries(Object.entries(input.formulas ?? {}).map(([path, formula]) => [path.replace(/^rentableUnits\./, "units."), formula]));
  return withFormulaTexts(plainDraftOf(input), formulas);
}

const plainDraftOf = (input: IncomeInputDto): Draft => ({
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
  deductionsSplit: input.deductionsSplit ?? null,
  ratingColumns: ratingColumnsFor(rateTableOf(input), input.ratingColumns),
  rateTable: rateTableOf(input),
  appliedRate: asPercent(input.appliedRate),
  rateFromMarket: asPercent(input.rateFromMarket),
  weightedRate: asPercent(input.weightedRate),
  rounding: input.rounding,
});

/** What the panel saves, with the formulas typed in its numeric fields (deductions without a concept are not saved). */
function inputOf(draft: Draft): IncomeInputDto {
  const input = valuesOf(draft);
  const typed = {
    annuity: draft.annuity,
    marketRate: draft.marketRate,
    rentableUnits: draft.units,
    deductions: draft.deductions.filter((deduction) => deduction.concept.trim()),
    appliedRate: draft.appliedRate,
    rateFromMarket: draft.rateFromMarket,
    weightedRate: draft.weightedRate,
  };
  return { ...input, formulas: collectFormulas(typed, input) };
}

/** The books' table is not saved again: only the appraiser's own. */
const sameAsBooks = (rows: RateTableRowDto[]) => JSON.stringify(rows) === JSON.stringify(DEFAULT_RATE_TABLE);

const valuesOf = (draft: Draft): IncomeInputDto => {
  const deductions = draft.deductions
    .filter((deduction) => deduction.concept.trim())
    .map((deduction) => ({ concept: deduction.concept.trim(), rate: fromPercent(deduction.rate) }));
  return {
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
    deductions,
    // The split only while the second table has deductions.
    deductionsSplit: draft.deductionsSplit !== null && draft.deductionsSplit < deductions.length ? draft.deductionsSplit : null,
    ratingColumns: draft.ratingColumns,
    rateTable: sameAsBooks(draft.rateTable) ? null : draft.rateTable,
    appliedRate: fromPercent(draft.appliedRate),
    rateFromMarket: fromPercent(draft.rateFromMarket),
    weightedRate: fromPercent(draft.weightedRate),
    rounding: draft.rounding,
  };
};

const savedInputOf = (calculation: IncomeCalculationDto): IncomeInputDto => ({
  method: calculation.method,
  annuity: calculation.annuity,
  marketRate: calculation.marketRate,
  rentableUnits: calculation.rentableUnits,
  deductions: calculation.deductions,
  deductionsSplit: calculation.deductionsSplit ?? null,
  ratingColumns: calculation.ratingColumns,
  rateTable: calculation.rateTable ?? null,
  appliedRate: calculation.appliedRate,
  rateFromMarket: calculation.rateFromMarket,
  weightedRate: calculation.weightedRate,
  rounding: calculation.rounding,
  formulas: calculation.formulas ?? {},
});

/** The columns of the capture tables of the panel, by key, as the panel names them; # and the actions keep theirs. */
const SALE_PRICE_COLUMNS: CaptureHeadColumn[] = [{ key: "comparable", label: "Comparable" }, { key: "precio", label: "Precio de venta ($)" }];
const DEDUCTION_COLUMNS: CaptureHeadColumn[] = [{ key: "numero", label: "#", fixed: true }, { key: "concepto", label: "Concepto" }, { key: "porcentaje", label: "Porcentaje (%)" }];

/** A figure the system calculates, as the gray cells of the tables, with its formula on hover (video 8.14, 17:40: «si tú pones el cursor que te diga la fórmula»). */
function ComputedFigure({ formula, children }: { formula: string; children: ReactNode }) {
  return (
    <span className="block w-full rounded-sm bg-muted/70 px-1.5 py-1 text-right tabular-nums" title={formula} data-computed-formula={formula}>
      {children}
    </span>
  );
}

/** The formula of each figure of «Determinación del valor», as the books work it out. */
function resultFormulas(result: IncomeApproachResult | null, concluded: boolean): Partial<Record<Parameters<typeof INCOME_CAPTURE.result.row>[0], string>> {
  const shown = (value: number | null | undefined, as: (value: number) => string) => (value === null || value === undefined ? "" : ` = ${as(value)}`);
  return {
    bruta: concluded ? "= Renta mensual concluida en el mercado de rentas, con su redondeo" : "= Σ renta mensual de cada superficie (superficie × renta unitaria)",
    deducciones: "= Σ porcentajes de las deducciones (las de todas sus tablas)",
    "neta-mensual": `= Ingreso bruto mensual − Ingreso bruto mensual × Total de deducciones${result ? ` = ${money(result.grossMonthlyRent)} − ${money(result.grossMonthlyRent)} × ${percent(result.deductionsRate)}` : ""}`,
    "neta-anual": `= Renta neta mensual × 12${shown(result?.netMonthlyRent, (value) => `${money(value)} × 12`)}`,
    tasa: "= IV) Tasa aplicada de «Tasa a utilizar»; vacía, la tasa resultante con todos sus decimales",
  };
}

/**
 * Income approach: rentable area and rent (adopted in the rent market),
 * deductions and the capitalization rate from Bravo Armejo's table or
 * captured. Everything is captured in the tables of its block; the panel
 * keeps only the method (video 8.14, 09:40: «para no tener otro recuadro acá
 * arriba»), and the TR method's sale prices, which no table prints.
 */
export function IncomeCalculationPanel(props: {
  valuationId: string;
  readOnly: boolean;
  onCalculation: (calculation: IncomeCalculationDto) => void;
  /** «Quitar este enfoque»: the section's «Agregar al informe valuatorio». */
  approach?: ApproachInReport;
  /** The headers of its capture tables as the appraiser named and grouped them, kept with the section. */
  captureHeaders?: SectionCaptureHeaders;
  onCaptureHeaders?: (headers: SectionCaptureHeaders) => void;
}) {
  const { valuationId } = props;
  const [calculation, setCalculation] = useState<IncomeCalculationDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const readOnly = props.readOnly || Boolean(calculation?.locked);
  // The headers of each capture table as the appraiser named and grouped them; the data and the calculation do not change.
  const headOf = (table: string) => ({
    headers: props.captureHeaders?.[table],
    readOnly: readOnly || !props.onCaptureHeaders,
    onChange: (headers: CaptureHeaders) => props.onCaptureHeaders?.(withTableHeaders(props.captureHeaders, table, headers)),
  });
  const lastSaved = useRef<string | null>(null);

  const applyServerState = (next: IncomeCalculationDto) => {
    lastSaved.current = JSON.stringify(savedInputOf(next));
    setCalculation(next);
    setDraft(draftOf(next));
  };
  const enqueueSave = useSerializedSave(async (payload: IncomeInputDto) => {
    if (JSON.stringify(payload) === lastSaved.current) {
      // Back to what the server holds: nothing is left unsaved.
      setSaveError(null);
      return;
    }
    setSaving(true);
    try {
      const next = await api.income.save(valuationId, payload);
      lastSaved.current = JSON.stringify(savedInputOf(next));
      setSaveError(null);
      setCalculation(next);
    } catch (error) {
      const message = saveRefusedMessage(error, "No se pudo guardar el enfoque de ingresos.");
      setSaveError(message);
      toast.error(message);
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

  // The pages of the approach as the capture holds them right now: their tables are where it is captured (one table, 20 nov 2026).
  // Built a moment after each key, not within it: typing stays as quick as before.
  const pagesDraft = useDeferredValue(draft);
  const capturePages = useMemo<CapturePages | null>(() => {
    if (!calculation || !pagesDraft) return null;
    const typed = valuesOf(pagesDraft);
    const engine = toIncomeEngineInput({ ...inputOf(pagesDraft), rentMarket: calculation.rentMarket });
    const computed = engine.ok ? computeIncomeApproach(engine.input, incomeEngineConfig(calculation)) : null;
    // Every row being written, also a deduction without its concept yet.
    const deductions = pagesDraft.deductions.map((deduction) => ({ concept: deduction.concept, rate: fromPercent(deduction.rate) }));
    return {
      blocks: incomeCaptureBlocks({ ...calculation, ...typed, deductions, deductionsSplit: pagesDraft.deductionsSplit, rateTable: pagesDraft.rateTable }, computed),
      placeholderIds: INCOME_TEMPLATE_BLOCK_IDS,
    };
  }, [calculation, pagesDraft]);
  usePublishCapturePages(capturePages);

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
  const result = engineInput.ok ? computeIncomeApproach(engineInput.input, incomeEngineConfig(calculation)) : null;
  const save = () => { if (!readOnly) void enqueueSave(input); };
  const update = (patch: Partial<Draft>) => setDraft((current) => current && { ...current, ...patch });
  // Rows added, moved or removed from a table's right-click menu are saved at once, as a change of method.
  const commit = (patch: Partial<Draft>) => {
    const nextDraft = { ...draft, ...patch };
    setDraft(nextDraft);
    if (!readOnly) void enqueueSave(inputOf(nextDraft));
  };
  const deductionRows = rowActionsOf(draft.deductions, () => ({ concept: "", rate: "" }), (deductions) => commit({ deductions }));
  const cellInput = "h-7 text-xs";
  const unitRowIds = INCOME_CAPTURE.rows(INCOME_CAPTURE.units.table, draft.units.length);
  const deductionPlaces = INCOME_CAPTURE.deductions.places(draft.deductions.length, draft.deductionsSplit);
  const split = deductionPlaces.some((place) => place.table === INCOME_CAPTURE.deductions.tables[1]);
  const lastDeductionsTable = INCOME_CAPTURE.deductions.tables[split ? 1 : 0];
  const adopted = calculation.rentMarket.adoptedUnitRent;
  // What a rentable surface inherits while it is not typed (FAL-13): the rent adopted in the rent market, and its subject's area when there is one surface.
  const inheritedRent = adopted && adopted > 0 ? adopted : null;
  const subjectArea = calculation.rentMarket.subjectArea;
  const inheritedArea = draft.units.length === 1 && subjectArea && subjectArea > 0 ? subjectArea : null;
  // The monthly rent the rent market concluded, rounded there (video 8.14, 04:10): the gross rent of one inherited surface.
  const concludedRent = concludedMonthlyRentFor({ rentableUnits: input.rentableUnits, rentMarket: calculation.rentMarket });
  const gross = result?.grossMonthlyRent ?? null;
  const method = draft.method;
  const setAnnuity = (key: keyof Draft["annuity"]) => (event: { target: { value: string } }) =>
    update({ annuity: { ...draft.annuity, [key]: event.target.value } });
  const changeMethod = (next: IncomeMethod) => {
    // Untouched typical deductions follow the method; edited ones stay as they are.
    const untouched = JSON.stringify(input.deductions) === JSON.stringify(typicalDeductions(method));
    const deductions = untouched
      ? typicalDeductions(next).map((row) => ({ concept: row.concept, rate: asPercent(row.rate) }))
      : draft.deductions;
    commit({ method: next, deductions, deductionsSplit: untouched ? null : draft.deductionsSplit });
  };
  const rateRows = draft.rateTable;
  const rateRowIds = INCOME_CAPTURE.rating.rowIds(rateRows);
  const setRateRows = (rows: RateTableRowDto[], saveNow: boolean) => (saveNow ? commit : update)(withRateRows(draft, rows));
  const setRateCell = (rowIndex: number, cell: number, value: string) =>
    setRateRows(rateRows.map((row, index) => (index === rowIndex ? { ...row, cells: row.cells.map((item, at) => (at === cell ? value : item)) } : row)), false);
  const valueText = result ? `${money(result.value)} M.N.` : engineInput.ok ? "" : engineInput.reason;
  const rounding = (
    <RoundingMenu label="valor por ingresos" value={draft.rounding} readOnly={readOnly} onChange={(digits) => commit({ rounding: digits })}>
      <span className="rounded-sm bg-muted/70 px-1.5 py-1 text-right font-semibold tabular-nums" title={result ? `= Renta neta anual / Tasa de capitalización = ${money(result.netAnnualRent)} / ${percent(result.appliedRate, 4)}` : undefined} data-income-value="">
        {valueText}
      </span>
    </RoundingMenu>
  );
  const formulas = resultFormulas(result, concludedRent !== null);

  return (
    <section className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:p-4" aria-labelledby="income-calculation-title" onBlur={save}>
      <SaveRefusedNotice message={saveError} />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 id="income-calculation-title" className="flex items-center gap-2 text-sm font-semibold">
            <Calculator className="size-4" /> Cálculo del enfoque de ingresos
          </h3>
          {/* The method, in one line: the rest is captured in the tables of the block (video 8.14, 09:40). */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground" htmlFor="income-method">
            Método
            <NativeSelect
              id="income-method"
              className="h-8 w-auto text-sm text-foreground"
              disabled={readOnly}
              value={method}
              title="Capitalización directa con la tasa de Bravo Armejo, anualidad con TIIE o tasa de mercado (venta / renta). La capitalización inversa, el método residual y el flujo de efectivo descontado no están disponibles."
              data-income-methods=""
              onChange={(event) => changeMethod(event.target.value as IncomeMethod)}
            >
              {(Object.keys(INCOME_METHOD_LABELS) as IncomeMethod[]).map((key) => (
                <NativeSelectOption key={key} value={key}>{INCOME_METHOD_LABELS[key]}</NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </div>
        <div className="flex items-center gap-2">
          {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
          {props.approach ? <ApproachRemoval name="ingresos" approach={props.approach} readOnly={readOnly} /> : null}
        </div>
      </header>
      {props.approach && !props.approach.included ? <ApproachLeftOutNotice name="ingresos" /> : null}
      {calculation.locked ? <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p> : null}
      {!adopted && method !== "mercado" ? (
        <p className="text-xs text-muted-foreground">La renta unitaria sale del mercado de rentas. Captúralo en su sección, o escribe la renta de cada superficie en su tabla.</p>
      ) : null}

      <fieldset disabled={readOnly} className="grid gap-3">
        {method !== "mercado" ? (
        // Adding a row goes under its table; while the page has no such table on screen, here.
        <div className="flex flex-wrap gap-2 empty:hidden">
          <CaptureSlot at={{ table: INCOME_CAPTURE.units.table, part: "footer" }} fallback>
            {!readOnly ? (
              <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => commit({ units: [...draft.units, { description: "", area: "", unitRent: "" }] })}>
                <Plus data-icon="inline-start" /> Superficie rentable
              </Button>
            ) : null}
          </CaptureSlot>
          <CaptureSlot at={{ table: lastDeductionsTable, part: "footer" }} fallback>
            {!readOnly ? (
              <span className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => commit({ deductions: [...draft.deductions, { concept: "", rate: "" }] })}>
                  <Plus data-icon="inline-start" /> Deducción
                </Button>
                {split ? (
                  <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => commit({ deductionsSplit: null })} data-deductions-split="unir">
                    <Rows2 data-icon="inline-start" /> Unir en una tabla
                  </Button>
                ) : draft.deductions.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="w-fit"
                    title="Las deducciones se imprimen en dos tablas, una junto a la otra; todas cuentan en el total."
                    onClick={() => commit({ deductionsSplit: Math.ceil(draft.deductions.length / 2) })}
                    data-deductions-split="dividir"
                  >
                    <Columns2 data-icon="inline-start" /> Dividir en dos tablas
                  </Button>
                ) : null}
              </span>
            ) : null}
          </CaptureSlot>
          {method === "tabla" ? (
            <CaptureSlot at={{ table: INCOME_CAPTURE.rating.table, part: "footer" }}>
              {!readOnly ? (
                <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setRateRows(editRateRows(rateRows, "criterion-below", rateRows.length - 1), true)} data-rate-add-criterion="">
                  <Plus data-icon="inline-start" /> Criterio
                </Button>
              ) : null}
            </CaptureSlot>
          ) : null}
        </div>
        ) : (
        <div className="grid gap-2">
          <h4 className={CALC_SECTION_HEADING}>
            Precio de venta de cada comparable de renta
            <CaptureHeaderControl label="Precio de venta de cada comparable" columns={SALE_PRICE_COLUMNS} {...headOf("ingresos.precios")} />
          </h4>
          <p className="text-xs text-muted-foreground">
            La tasa sale de comparar la renta de cada comparable con su precio de venta. Se usa la superficie del sujeto del mercado de rentas.
          </p>
          {calculation.rentMarket.comparables.length ? (
            <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly={readOnly}>
              <table className={cn(CALC_TABLE, "w-full min-w-[480px]")} aria-label="Precio de venta de cada comparable de renta">
                <CaptureTableHead columns={SALE_PRICE_COLUMNS} {...headOf("ingresos.precios")} />
                <tbody>
                  {calculation.rentMarket.comparables.map((comparable) => (
                    <tr key={comparable.reference} className={CALC_ROW}>
                      <td className="px-1.5">{comparable.reference}. {comparable.location}</td>
                      <td className="w-48 p-1">
                        <FormulaInput
                          aria-label={`Precio de venta de ${comparable.reference}`}
                          className={cellInput}
                          placeholder="Precio de venta ($)"
                          value={draft.marketRate.salePrices[String(comparable.reference)] ?? ""}
                          onChange={(event) => update({ marketRate: { ...draft.marketRate, salePrices: { ...draft.marketRate.salePrices, [String(comparable.reference)]: event.target.value } } })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CalcTableContextMenu>
          ) : <p className="text-sm text-muted-foreground">Captura primero los comparables del mercado de rentas.</p>}
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1.5" htmlFor="income-negotiation">
              Negociación (%)
              <FormulaInput id="income-negotiation" percentUnits className="h-8 w-24" value={draft.marketRate.negotiation} onChange={(event) => update({ marketRate: { ...draft.marketRate, negotiation: event.target.value } })} />
            </label>
            <label className="flex items-center gap-1.5" htmlFor="income-vacancy">
              Vacíos (%)
              <FormulaInput id="income-vacancy" percentUnits className="h-8 w-24" value={draft.marketRate.vacancy} onChange={(event) => update({ marketRate: { ...draft.marketRate, vacancy: event.target.value } })} />
            </label>
          </div>
          <h4 className={CALC_SECTION_HEADING}>
            Gastos de operación (%)
            <CaptureHeaderControl label="Deducciones" columns={DEDUCTION_COLUMNS} {...headOf("ingresos.deducciones")} />
          </h4>
          <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly={readOnly} rows={deductionRows}>
            <table className={cn(CALC_TABLE, "w-full min-w-[420px]")} aria-label="Deducciones">
              <CaptureTableHead columns={DEDUCTION_COLUMNS} {...headOf("ingresos.deducciones")} />
              <tbody>
                {draft.deductions.map((deduction, index) => (
                  <tr key={index} className={CALC_ROW}>
                    <td className="w-8 px-1.5 text-center tabular-nums">{index + 1}</td>
                    <td className="p-1">
                      <Input aria-label="Concepto de la deducción" className={cellInput} value={deduction.concept} onChange={(event) => update({ deductions: draft.deductions.map((item, i) => i === index ? { ...item, concept: event.target.value } : item) })} />
                    </td>
                    <td className="w-32 p-1">
                      <FormulaInput aria-label={`${deduction.concept}: porcentaje`} percentUnits className={cellInput} value={deduction.rate} onChange={(event) => update({ deductions: draft.deductions.map((item, i) => i === index ? { ...item, rate: event.target.value } : item) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CalcTableContextMenu>
          {!readOnly ? (
            <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => update({ deductions: [...draft.deductions, { concept: "", rate: "" }] })}>
              <Plus data-icon="inline-start" /> Deducción
            </Button>
          ) : null}
          {/* TR prints no table that is captured here: its value, with its rounding, in one line. */}
          <p className="flex flex-wrap items-center gap-2 text-sm" data-income-market-value="">
            <span className="text-muted-foreground">Valor por capitalización de rentas:</span> {rounding}
          </p>
        </div>
        )}

        {method === "anualidad" ? (
        <div className="grid gap-2">
          <h4 className={CALC_SECTION_HEADING}>Vacíos y capitalización</h4>
          <div className="flex flex-wrap gap-3 text-xs">
            {([
              ["vacancyDays", "income-vacancy-days", "Días de vacío", false],
              ["contractYears", "income-contract-years", "Años de contrato", false],
              ["otherMonthlyIncome", "income-other", "Otros ingresos ($/mes)", false],
              ["tiie", "income-tiie", "TIIE 28 días (%)", true],
              ["inflation", "income-inflation", "Inflación anual estimada (%)", true],
              ["remainingLifeYears", "income-remaining-life", "Vida útil remanente (años)", false],
            ] as const).map(([key, id, label, inPercent]) => (
              <label key={key} className="flex items-center gap-1.5" htmlFor={id}>
                {label}
                <FormulaInput id={id} percentUnits={inPercent} className="h-8 w-24" value={draft.annuity[key]} onChange={setAnnuity(key)} />
              </label>
            ))}
            <label className="flex items-center gap-1.5" htmlFor="income-option">
              Valor que se concluye
              <NativeSelect id="income-option" className="h-8 w-auto" value={String(draft.annuity.option)} onChange={(event) => update({ annuity: { ...draft.annuity, option: Number(event.target.value) as 1 | 2 } })}>
                <NativeSelectOption value="1">Opción 1: tasa base mercado</NativeSelectOption>
                <NativeSelectOption value="2">Opción 2: anualidad</NativeSelectOption>
              </NativeSelect>
            </label>
          </div>
        </div>
        ) : null}
      </fieldset>

      {method === "mercado" && !result && !engineInput.ok ? <p className="text-sm text-muted-foreground">{engineInput.reason}</p> : null}
      {/* TCH and TU: each rentable surface, deduction and rating in its row of the tables of the dictamen. */}
      {method !== "mercado" ? draft.units.map((unit, index) => {
        const cellAt = (column: string) => ({ table: INCOME_CAPTURE.units.table, row: unitRowIds[index], column });
        const unitArea = parseDecimal(unit.area) ?? inheritedArea;
        const unitRent = parseDecimal(unit.unitRent) ?? inheritedRent;
        const monthly = concludedRent ?? (unitArea !== null && unitRent !== null ? unitArea * unitRent : null);
        return (
          <Fragment key={`unit-${index}`}>
            <CaptureSlot at={cellAt(INCOME_CAPTURE.units.description)}>
              <Input aria-label="Concepto" className={cellInput} disabled={readOnly} placeholder="Superficie rentable" value={unit.description} onChange={(event) => update({ units: draft.units.map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} />
            </CaptureSlot>
            <CaptureSlot at={cellAt(INCOME_CAPTURE.units.area)}>
              <FormulaInput
                aria-label="Superficie (m²)"
                className={cn(cellInput, !unit.area && inheritedArea !== null && "text-muted-foreground")}
                disabled={readOnly}
                // The subject's area of the rent market, as a value and not a hint: written over, the typed one rules.
                value={unit.area || (inheritedArea === null ? "" : String(inheritedArea))}
                title={!unit.area && inheritedArea !== null ? "Superficie del sujeto del mercado de rentas. Escribe otra para usarla aquí." : undefined}
                data-inherited={!unit.area && inheritedArea !== null ? "mercado-rentas" : undefined}
                data-no-fill={inheritedArea !== null ? "computed" : undefined}
                onChange={(event) => update({ units: draft.units.map((item, i) => i === index ? { ...item, area: event.target.value } : item) })}
              />
            </CaptureSlot>
            <CaptureSlot at={cellAt(INCOME_CAPTURE.units.unitRent)}>
              <FormulaInput
                aria-label="Renta ($/m²/mes)"
                className={cn(cellInput, !unit.unitRent && inheritedRent !== null && "text-muted-foreground")}
                disabled={readOnly}
                // The rent adopted in the rent market, the one the calculation uses: one rent, not a hint beside an empty cell.
                value={unit.unitRent || (inheritedRent === null ? "" : String(inheritedRent))}
                title={!unit.unitRent && inheritedRent !== null ? "Renta adoptada en el mercado de rentas. Escribe otra para usarla en esta superficie." : undefined}
                data-inherited={!unit.unitRent && inheritedRent !== null ? "mercado-rentas" : undefined}
                data-no-fill={inheritedRent !== null ? "computed" : undefined}
                onChange={(event) => update({ units: draft.units.map((item, i) => i === index ? { ...item, unitRent: event.target.value } : item) })}
              />
            </CaptureSlot>
            {monthly !== null ? (
              <CaptureSlot at={cellAt(INCOME_CAPTURE.units.monthly)}>
                <ComputedFigure
                  formula={concludedRent !== null
                    ? `= Renta mensual concluida en el mercado de rentas, con su redondeo (${unitArea ?? 0} m² × ${money(unitRent ?? 0)} = ${money((unitArea ?? 0) * (unitRent ?? 0))} sin redondear)`
                    : `= Superficie rentable × Renta unitaria = ${unitArea} × ${money(unitRent ?? 0)}`}
                >
                  {money(monthly)}
                </ComputedFigure>
              </CaptureSlot>
            ) : null}
            {!readOnly && draft.units.length > 1 ? (
              <CaptureSlot at={{ table: INCOME_CAPTURE.units.table, row: unitRowIds[index] }}>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Quitar la superficie" onClick={() => commit({ units: draft.units.filter((_, i) => i !== index) })}><Trash2 /></Button>
              </CaptureSlot>
            ) : null}
          </Fragment>
        );
      }) : null}
      {method !== "mercado" ? draft.deductions.map((deduction, index) => {
        const place = deductionPlaces[index];
        const cellAt = (column: string) => ({ table: place.table, row: place.row, column });
        const rate = fromPercent(deduction.rate);
        return (
          <Fragment key={`deduction-${index}`}>
            <CaptureSlot at={cellAt(INCOME_CAPTURE.deductions.concept)}>
              <Input aria-label="Concepto de la deducción" className={cellInput} disabled={readOnly} value={deduction.concept} onChange={(event) => update({ deductions: draft.deductions.map((item, i) => i === index ? { ...item, concept: event.target.value } : item) })} />
            </CaptureSlot>
            <CaptureSlot at={cellAt(INCOME_CAPTURE.deductions.rate)}>
              <span className="flex items-center gap-0.5">
                <FormulaInput
                  aria-label={`${deduction.concept}: porcentaje`}
                  percentUnits
                  className={cellInput}
                  disabled={readOnly}
                  title="En porcentaje: 3 o 3 % son el 3 %. Admite fórmulas con «=»."
                  value={deduction.rate}
                  onChange={(event) => update({ deductions: draft.deductions.map((item, i) => i === index ? { ...item, rate: event.target.value } : item) })}
                />
                <span className="text-muted-foreground">%</span>
              </span>
            </CaptureSlot>
            {gross !== null && rate !== null ? (
              <CaptureSlot at={cellAt(INCOME_CAPTURE.deductions.amount)}>
                <ComputedFigure formula={`= Porcentaje × Ingreso bruto mensual = ${percent(rate)} × ${money(gross)}`}>{money(rate * gross)}</ComputedFigure>
              </CaptureSlot>
            ) : null}
            {!readOnly ? (
              <CaptureSlot at={{ table: place.table, row: place.row }}>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar la deducción ${deduction.concept}`.trim()} onClick={() => commit({ deductions: draft.deductions.filter((_, i) => i !== index) })}><Trash2 /></Button>
              </CaptureSlot>
            ) : null}
          </Fragment>
        );
      }) : null}
      {/* Bravo Armejo's table: each row's concept and options written in it, the 1 of each criterion clicked in its «calificación» row. */}
      {method === "tabla" ? rateRows.map((row, rowIndex) => {
        const rowId = rateRowIds[rowIndex];
        const rating = isRatingRow(row);
        const criterion = rating ? rateCriteriaOf(rateRows.slice(0, rowIndex + 1)).length - 1 : -1;
        const criterionName = rating ? rateCriteriaOf(rateRows)[criterion]?.name ?? "" : "";
        return (
          <Fragment key={row.key}>
            <CaptureSlot at={{ table: INCOME_CAPTURE.rating.table, row: rowId, column: INCOME_CAPTURE.rating.label }}>
              <Input
                aria-label={rating ? `Renglón de calificación de ${criterionName}` : "Concepto del renglón"}
                className={cn(cellInput, "text-center", !rating && "font-semibold")}
                disabled={readOnly}
                value={row.cells[0] ?? ""}
                title="Un renglón que dice «calificación» es donde se califica el criterio de arriba: se pinta de color y cuenta en la tasa."
                onChange={(event) => setRateCell(rowIndex, 0, event.target.value)}
              />
            </CaptureSlot>
            {RATE_TABLE_RATES.map((rate, column) => {
              const at = { table: INCOME_CAPTURE.rating.table, row: rowId, column: INCOME_CAPTURE.rating.column(column) };
              if (!rating) {
                return (
                  <CaptureSlot key={column} at={at}>
                    <Input aria-label={`Opción de ${percent(rate, 0)}`} className={cn(cellInput, "text-center")} disabled={readOnly} value={row.cells[column + 1] ?? ""} onChange={(event) => setRateCell(rowIndex, column + 1, event.target.value)} />
                  </CaptureSlot>
                );
              }
              const marked = draft.ratingColumns[criterion] === column;
              return (
                <CaptureSlot key={column} at={at}>
                  <button
                    type="button"
                    aria-label={`${criterionName}: calificar en ${percent(rate, 0)}`}
                    aria-pressed={marked}
                    title={marked ? "Quitar la calificación" : `Calificar ${criterionName.toLowerCase()} en ${percent(rate, 0)}`}
                    disabled={readOnly}
                    className={cn(
                      "h-7 w-full rounded-sm border border-dashed border-input bg-background text-center text-xs font-semibold tabular-nums transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:border-transparent disabled:bg-transparent",
                      marked && "border-solid border-primary bg-primary/10 text-primary",
                    )}
                    data-rating-mark={marked ? "" : undefined}
                    onClick={() => commit({ ratingColumns: draft.ratingColumns.map((chosen, i) => (i === criterion ? (marked ? null : column) : chosen)) })}
                  >
                    {marked ? "1" : ""}
                  </button>
                </CaptureSlot>
              );
            })}
            {!readOnly ? (
              <CaptureSlot at={{ table: INCOME_CAPTURE.rating.table, row: rowId }}>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label="Opciones del renglón" data-rate-row-menu=""><MoreHorizontal /></Button>} />
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuItem onClick={() => setRateRows(editRateRows(rateRows, "row-below", rowIndex), true)}>Insertar renglón abajo</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRateRows(editRateRows(rateRows, "criterion-below", rowIndex), true)}>Insertar criterio con su calificación</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={rateRows.length <= 1}
                      onClick={() => {
                        const before = { rateTable: draft.rateTable, ratingColumns: draft.ratingColumns };
                        setRateRows(editRateRows(rateRows, "delete", rowIndex), true);
                        toast.success("Renglón quitado de la tabla de tasa.", { action: { label: "Deshacer", onClick: () => commit(before) } });
                      }}
                    >
                      <Trash2 data-icon="inline-start" /> Quitar renglón
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CaptureSlot>
            ) : null}
          </Fragment>
        );
      }) : null}
      {/* «Tasa a utilizar»: the market and weighted rates (printed for reference) and the rate applied, in their cells. */}
      {method === "tabla" ? ([
        ["rateFromMarket", "Tasa obtenida de mercado (%)", undefined],
        ["weightedRate", "Tasa ponderada (%)", undefined],
        ["appliedRate", "Tasa aplicada (%)", result?.tableRate ?? null],
      ] as const).map(([key, label, fromTable]) => (
        <CaptureSlot key={key} at={{ table: INCOME_CAPTURE.rateToUse.table, row: INCOME_CAPTURE.rateToUse.rows[key], column: INCOME_CAPTURE.rateToUse.column }}>
          <span className="flex items-center gap-0.5">
            <FormulaInput
              aria-label={label}
              percentUnits
              className={cellInput}
              disabled={readOnly}
              value={draft[key]}
              // Empty, the rate applied is the table's, with every decimal.
              placeholder={fromTable ? `${(fromTable * 100).toFixed(4)} (de la tabla)` : undefined}
              data-no-fill={fromTable ? "computed" : undefined}
              onChange={(event) => update({ [key]: event.target.value })}
            />
            <span className="text-muted-foreground">%</span>
          </span>
        </CaptureSlot>
      )) : null}
      {/* «Determinación del valor»: each figure with its formula on hover, and the value with its rounding as an option of its own (video 8.14, 05:20). */}
      {method !== "mercado" ? (Object.entries(formulas) as [Parameters<typeof INCOME_CAPTURE.result.row>[0], string][]).map(([key, formula]) => {
        const figure = key === "bruta" ? (gross === null ? null : money(gross))
          : key === "deducciones" ? (result ? percent(result.deductionsRate) : null)
            : key === "neta-mensual" ? (result ? money(result.netMonthlyRent) : null)
              : key === "neta-anual" ? (result ? money(result.netAnnualRent) : null)
                : result ? percent(result.appliedRate, 4) : null;
        return figure === null ? null : (
          <CaptureSlot key={key} at={{ table: INCOME_CAPTURE.result.table, row: INCOME_CAPTURE.result.row(key), column: INCOME_CAPTURE.result.column }}>
            <ComputedFigure formula={formula}>{figure}</ComputedFigure>
          </CaptureSlot>
        );
      }) : null}
      {method !== "mercado" ? <CaptureSlot at={{ table: INCOME_CAPTURE.result.table, box: INCOME_CAPTURE.result.box }}>{rounding}</CaptureSlot> : null}
    </section>
  );
}
