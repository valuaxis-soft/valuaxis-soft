"use client";

import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, SessionExpiredError } from "@/lib/api-client";
import {
  CONSERVATION_CRITERIA,
  CONSERVATION_CRITERION_LABELS,
  CONSERVATION_RATINGS,
  DEFAULT_COST_ROUNDING,
  LAND_FACTORS,
  LAND_FACTOR_SHORT_LABELS,
  MAX_CONSERVATION_OPTIONS,
  MAX_EXTRA_DEMERIT_FACTORS,
  constructionCostOf,
  conservationCriterionOf,
  conservationCriterionOfColumns,
  conservationOfRating,
  conservationOfState,
  costColumnsOf,
  costEngineConfig,
  emptyConstructionCost,
  emptyInstallation,
  findConstructionType,
  landReferenceArea,
  landUnitValue,
  remainingUsefulLife,
  toCostEngineInput,
  typesToAdd,
  withConstructionType,
  type ConservationCriterion,
  type ConservationCriterionDto,
  type ConstructionCostDto,
  type CostCalculationDto,
  type CostColumnsDto,
  type CostLandDto,
  type CostRoundingDto,
  type DemeritColumnsDto,
  type IndirectDto,
  type InstallationDto,
  type LandFactorKey,
} from "@/features/valuations/calculation/cost-types";
import { computeCostApproach } from "@/features/valuations/engine/costs";
import { ageFactor } from "@/features/valuations/engine/factors";
import { Trace } from "@/features/valuations/engine/trace";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { collectFormulas, withFormulaTexts, type CapturedFormulas } from "@/features/valuations/calculation/captured-formulas";
import { RoundingSelect, SurfacePowerSelect } from "./calculation-controls";
import { CALC_HEAD, CALC_HEAD_CELL, CALC_RESULT, CALC_ROW, CALC_TABLE, CALC_TABLE_FRAME } from "./calculation-table-style";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { numbersOf, textsOf, type Texts } from "./draft-texts";
import { FormulaInput } from "./formula-input";
import { CalculationPrecisionControl } from "./calculation-precision-control";
import { useSerializedSave } from "./use-serialized-save";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/** Completion and undivided share are fractions (1 = 100 %) edited as percentages; the added factors are texts too. */
type PercentRow<T> = Omit<Texts<T>, "completion" | "undivided" | "extraFactors"> & { completion: string; undivided: string; extraFactors: string[] };

type Draft = {
  land: Omit<Texts<CostLandDto>, "factors"> & { factors: Record<LandFactorKey, string> };
  constructions: PercentRow<ConstructionCostDto>[];
  installations: PercentRow<InstallationDto>[];
  indirects: Texts<IndirectDto>[];
  rounding: CostRoundingDto;
  columns: CostColumnsDto;
};

/** What the panel edits: every column of the capture, factors with a formula empty (null) when they take it. */
type PanelInput = {
  land: CostLandDto;
  constructions: ConstructionCostDto[];
  installations: InstallationDto[];
  indirects: IndirectDto[];
  rounding: CostRoundingDto;
  columns: CostColumnsDto;
  /** The formulas typed in its numeric fields, by path; see captured-formulas.ts. */
  formulas?: CapturedFormulas;
};

const ROUNDING_FIELDS: { key: keyof CostRoundingDto; label: string }[] = [
  { key: "land", label: "Terreno" },
  { key: "constructions", label: "Construcciones" },
  { key: "installations", label: "Instalaciones" },
  { key: "physicalValue", label: "Valor físico" },
];

const toText = (value: number | null) => (value === null ? "" : String(value));
const percentText = (fraction: number) => String(Number((fraction * 100).toFixed(6)));
/** An empty percentage is 100 %, as the books start them. */
const fractionOf = (text: string) => {
  const percent = parseDecimal(text);
  return percent === null ? 1 : Number((percent / 100).toFixed(10));
};

type CostRow = { completion: number; undivided: number; extraFactors?: number[] };

function percentRow<T extends CostRow>(row: T): PercentRow<T> {
  return {
    ...textsOf(row),
    completion: percentText(row.completion),
    undivided: percentText(row.undivided),
    extraFactors: (row.extraFactors ?? []).map(String),
  } as PercentRow<T>;
}

/** An added factor left empty is 1, as "Otro". */
function fractionRow<T extends CostRow>(row: PercentRow<T>, template: T): T {
  // The state of a criterion other than Ross-Heidecke is a text: the template of numbers does not carry it.
  const state = (row as unknown as { conservationState?: unknown }).conservationState;
  return {
    ...numbersOf(row as unknown as Texts<T>, template),
    completion: fractionOf(row.completion),
    undivided: fractionOf(row.undivided),
    extraFactors: row.extraFactors.map((text) => parseDecimal(text) ?? 1),
    ...(typeof state === "string" && state ? { conservationState: state } : {}),
  };
}

/** The draft of what the server holds; a field typed as a formula reads back as typed. */
function draftOf(input: CostCalculationDto): Draft {
  return withFormulaTexts(plainDraftOf(input), input.formulas);
}

function plainDraftOf(input: CostCalculationDto): Draft {
  return {
    land: {
      subjectArea: toText(input.land.subjectArea),
      referenceArea: toText(input.land.referenceArea),
      unitValue: toText(input.land.unitValue),
      surfacePower: String(input.land.surfacePower),
      factors: Object.fromEntries(Object.entries(input.land.factors).map(([key, value]) => [key, String(value)])) as Record<LandFactorKey, string>,
      surfaceFactor: toText(input.land.surfaceFactor),
      resultantFactor: toText(input.land.resultantFactor),
    },
    // Every type of the construction section enters with its data; the appraiser only captures its cost columns.
    constructions: [
      ...input.constructions.map((row) => percentRow(constructionCostOf(row))),
      ...typesToAdd(input.types, input.constructions, costColumnsOf(input.columns).excludedTypes).map((type) => percentRow(emptyConstructionCost(type.ref))),
    ],
    installations: input.installations.map(percentRow),
    indirects: input.indirects.map(textsOf),
    rounding: input.rounding ?? DEFAULT_COST_ROUNDING,
    columns: costColumnsOf(input.columns),
  };
}

function inputOf(draft: Draft): PanelInput {
  return {
    land: {
      subjectArea: parseDecimal(draft.land.subjectArea),
      referenceArea: parseDecimal(draft.land.referenceArea),
      unitValue: parseDecimal(draft.land.unitValue),
      surfacePower: parseDecimal(draft.land.surfacePower) ?? 3,
      factors: Object.fromEntries(Object.entries(draft.land.factors).map(([key, value]) => [key, parseDecimal(value) ?? 1])) as Record<LandFactorKey, number>,
      surfaceFactor: parseDecimal(draft.land.surfaceFactor),
      resultantFactor: parseDecimal(draft.land.resultantFactor),
    },
    constructions: draft.constructions.map((row) => fractionRow(row, emptyConstructionCost())),
    installations: draft.installations.map((row, index) => fractionRow(row, emptyInstallation(index))),
    indirects: draft.indirects.map((row) => numbersOf(row, { concept: "", percentage: null, base: null })),
    rounding: draft.rounding,
    columns: draft.columns,
  };
}

const keptRows = <T,>(rows: T[], keep: (row: T) => boolean) => rows.flatMap((row, index) => (keep(row) ? [index] : []));

/**
 * What can be saved: rows still being written (no reference or description)
 * wait in the draft. The formulas typed in the rows saved go with them.
 */
function payloadOf(draft: Draft): PanelInput {
  const input = inputOf(draft);
  const constructions = keptRows(input.constructions, (row) => Boolean(row.ref.trim()));
  const installations = keptRows(input.installations, (row) => Boolean(row.ref.trim() && row.description.trim()));
  const indirects = keptRows(input.indirects, (row) => Boolean(row.concept.trim()));
  const payload = {
    land: input.land,
    constructions: constructions.map((index) => input.constructions[index]),
    installations: installations.map((index) => input.installations[index]),
    indirects: indirects.map((index) => input.indirects[index]),
    rounding: input.rounding,
    columns: input.columns,
  };
  const typed = {
    land: draft.land,
    constructions: constructions.map((index) => draft.constructions[index]),
    installations: installations.map((index) => draft.installations[index]),
    indirects: indirects.map((index) => draft.indirects[index]),
  };
  return { ...payload, formulas: collectFormulas(typed, payload) };
}

const savedInputOf = (calculation: CostCalculationDto): PanelInput => ({
  land: calculation.land,
  constructions: calculation.constructions.map(constructionCostOf),
  installations: calculation.installations,
  indirects: calculation.indirects,
  rounding: calculation.rounding ?? DEFAULT_COST_ROUNDING,
  columns: costColumnsOf(calculation.columns),
  formulas: calculation.formulas ?? {},
});

/** The live result of what is typed: each construction row takes the data of the type it picked. */
function compute(calculation: CostCalculationDto, input: PanelInput) {
  const constructions = input.constructions.map((row) => withConstructionType(row, calculation.types));
  return computeCalculation({ ...calculation, ...input, constructions });
}

function computeCalculation(calculation: CostCalculationDto) {
  const input = toCostEngineInput(calculation);
  if (!input.ok) return { result: null, trace: null, reason: input.reason };
  const trace = new Trace();
  return { result: computeCostApproach(input.input, costEngineConfig(calculation), trace), trace, reason: null };
}

const cell = "h-7 min-w-0 px-1.5 text-xs";
const resultCell = cn(cell, CALC_RESULT);
const figure = (value: number | null | undefined, digits = 2) =>
  (value === null || value === undefined ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits: digits }));
const head = CALC_HEAD_CELL;
// What the calculation gives, in the gray of the table, not lighter.
const readOnlyCell = "px-1.5 whitespace-nowrap tabular-nums";
const FORMULA_HINT = "Vacío: se calcula con la fórmula del Excel. Escribe un valor para sustituirla; bórralo para volver a la fórmula.";

const LAND_REFERENCE_SOURCE = {
  captured: "Lote tipo capturado aquí; bórralo para tomar el del enfoque de mercado.",
  market: "Lote tipo del enfoque de mercado de terrenos (homologación indirecta): el sujeto se homologa contra él con la tabla de factores. Puedes escribir otro.",
  subject: "Sin lote tipo: homologación directa, el factor de superficie vale 1. Escribe un lote tipo para homologar el sujeto contra él.",
} as const;

/** The demerit columns of a table: Cons., Edad, "Otro" as named, the factors added and FRe. */
const demeritLabels = (factors: DemeritColumnsDto) => [
  "Cons.", "Edad", factors.other.trim() || "Otro", ...factors.extra.map((name, index) => name.trim() || `Factor ${index + 1}`), "FRe",
];

/** Header of a demerit block, as the books group Cons., Edad, Otro and FRe under "Factores de Demérito". */
function DemeritHeader(props: { leading: string[]; remaining: string; factors: DemeritColumnsDto; trailing?: string[] }) {
  const labels = demeritLabels(props.factors);
  return (
    <thead className={CALC_HEAD}>
      <tr>
        {props.leading.map((label) => <th key={label} rowSpan={2} className={head}>{label}</th>)}
        <th rowSpan={2} className={head}>{props.remaining}</th>
        <th rowSpan={2} className={head} title={`Estado de conservación (${CONSERVATION_CRITERION_LABELS[props.factors.conservation?.kind ?? "ROSS_HEIDECKE"]}): propone el factor Cons.`}>Estado de conservación</th>
        <th colSpan={labels.length} className={head}>Factores de Demérito</th>
        <th rowSpan={2} className={head}>Grado de terminación (%)</th>
        <th rowSpan={2} className={head}>Indiviso (%)</th>
        {(props.trailing ?? []).map((label) => <th key={label} rowSpan={2} className={head}>{label}</th>)}
        <th rowSpan={2} className={head}><span className="sr-only">Acciones</span></th>
      </tr>
      <tr>{labels.map((label, index) => <th key={index} className={head}>{label}</th>)}</tr>
    </thead>
  );
}

/**
 * The names of the demerit columns of a table and its added factors: "Otro"
 * renamed, and up to two factors more that multiply the FRe as "Otro" does.
 */
function DemeritColumnsEditor(props: {
  id: string;
  factors: DemeritColumnsDto;
  readOnly: boolean;
  onRename: (next: DemeritColumnsDto) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const { factors } = props;
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs" data-testid={`${props.id}-demerit-columns`}>
      <label className="grid gap-0.5">
        <span className="text-muted-foreground">Nombre de la columna «Otro»</span>
        <Input
          aria-label="Nombre de la columna Otro"
          className="h-7 w-36 text-xs"
          value={factors.other}
          onChange={(event) => props.onRename({ ...factors, other: event.target.value })}
        />
      </label>
      {factors.extra.map((name, index) => (
        <label key={index} className="grid gap-0.5">
          <span className="text-muted-foreground">Factor agregado {index + 1}</span>
          <span className="flex items-center gap-1">
            <Input
              aria-label={`Nombre del factor agregado ${index + 1}`}
              className="h-7 w-36 text-xs"
              value={name}
              placeholder={`Factor ${index + 1}`}
              onChange={(event) => props.onRename({ ...factors, extra: factors.extra.map((item, position) => (position === index ? event.target.value : item)) })}
            />
            {!props.readOnly ? (
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar el factor agregado ${index + 1}`} onClick={() => props.onRemove(index)}><Trash2 /></Button>
            ) : null}
          </span>
        </label>
      ))}
      {!props.readOnly ? (
        <Button type="button" size="sm" variant="outline" disabled={factors.extra.length >= MAX_EXTRA_DEMERIT_FACTORS} onClick={props.onAdd}>
          <Plus data-icon="inline-start" /> Factor de demérito
        </Button>
      ) : null}
      <span className="basis-full text-muted-foreground">
        Los factores agregados multiplican el FRe igual que «Otro» (vacíos valen 1). Hasta {MAX_EXTRA_DEMERIT_FACTORS} por tabla.
      </span>
    </div>
  );
}

/** Header of a valuation block: VRN and VNR, each with its unit and partial value, around the resultant factor. */
function ValuationHeader(props: { leading: string[]; resultant: string; netValue: string }) {
  return (
    <thead className={CALC_HEAD}>
      <tr>
        {props.leading.map((label) => <th key={label} rowSpan={2} className={head}>{label}</th>)}
        <th colSpan={2} className={head}>Valor de Reposición Nuevo (VRN)</th>
        <th rowSpan={2} className={head}>{props.resultant}</th>
        <th colSpan={2} className={head}>{props.netValue}</th>
      </tr>
      <tr>{["Valor Unit. $", "Valor Parcial VRN $", "Valor Unit. $", "Valor Parcial VNR $"].map((label, index) => <th key={index} className={head}>{label}</th>)}</tr>
    </thead>
  );
}

/** The states of the sheet «ROSS HEIDECKE», each with its calificaciones, in the table's order. */
const CONSERVATION_STATES = [...new Set(CONSERVATION_RATINGS.map((row) => row.state))];

/**
 * Estado de conservación and calificación of a row, as the sheet rates them;
 * "Sin calificar" leaves the Cons. to be typed, as before the ratings.
 */
function ConservationRatingSelect(props: { value: string; label: string; criterion: ConservationCriterionDto; onChange: (value: string) => void }) {
  if (props.criterion.kind !== "ROSS_HEIDECKE") {
    const listed = props.criterion.options.some((option) => option.label === props.value);
    return (
      <select
        aria-label={props.label}
        className="h-7 w-full min-w-32 rounded-md border bg-transparent px-1 text-xs"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">Sin calificar</option>
        {props.value && !listed ? <option value={props.value}>{props.value}</option> : null}
        {props.criterion.options.filter((option) => option.label.trim()).map((option) => (
          <option key={option.label} value={option.label}>{option.label} = {option.factor.toFixed(2)}</option>
        ))}
      </select>
    );
  }
  return (
    <select
      aria-label={props.label}
      className="h-7 w-full min-w-32 rounded-md border bg-transparent px-1 text-xs"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">Sin calificar</option>
      {CONSERVATION_STATES.map((state) => (
        <optgroup key={state} label={state}>
          {CONSERVATION_RATINGS.filter((row) => row.state === state).map((row) => (
            <option key={row.rating} value={String(row.rating)}>{state} {row.rating} = {row.factor.toFixed(3)}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * The criterion a table rates its conservation by, chosen before the value:
 * Ross-Heidecke (estado and calificación), the table of states of
 * conservation (suggested factors, to adjust) or the appraiser's own (name,
 * states and factors). The state picked writes its factor in Cons.
 */
function ConservationCriterionEditor(props: {
  id: string;
  criterion: ConservationCriterionDto;
  readOnly: boolean;
  onChange: (next: ConservationCriterionDto, commit: boolean) => void;
}) {
  const { criterion } = props;
  const setOption = (index: number, patch: Partial<{ label: string; factor: string }>) => props.onChange({
    ...criterion,
    options: criterion.options.map((option, position) => (position === index ? {
      label: patch.label ?? option.label,
      factor: patch.factor === undefined ? option.factor : parseDecimal(patch.factor) ?? option.factor,
    } : option)),
  }, false);
  return (
    <div className="grid gap-2 rounded-md border bg-background/60 p-2 text-xs" data-testid={`${props.id}-conservation-criterion`}>
      <label className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Criterio de conservación</span>
        <select
          aria-label="Criterio de conservación"
          className="h-7 rounded-md border bg-transparent px-1 text-xs"
          value={criterion.kind}
          disabled={props.readOnly}
          onChange={(event) => props.onChange(conservationCriterionOf(event.target.value as ConservationCriterion, criterion), true)}
        >
          {CONSERVATION_CRITERIA.map((kind) => <option key={kind} value={kind}>{CONSERVATION_CRITERION_LABELS[kind]}</option>)}
        </select>
        <span className="text-muted-foreground">
          {criterion.kind === "ROSS_HEIDECKE"
            ? "Elige el estado y la calificación de la hoja Ross-Heidecke en cada renglón."
            : "Elige el estado en cada renglón: su factor llena Cons., que puedes cambiar a mano."}
        </span>
      </label>
      {criterion.kind === "TABLA_ESTADO" ? (
        <p className="rounded-sm bg-amber-50 px-2 py-1 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-suggested-values>
          Valores sugeridos, ajústalos: la tabla aún debe confirmarse con el despacho.
        </p>
      ) : null}
      {criterion.kind === "PROPIO" ? (
        <label className="grid max-w-xs gap-0.5">
          <span className="text-muted-foreground">Nombre del criterio</span>
          <Input
            aria-label="Nombre del criterio propio"
            className="h-7 text-xs"
            value={criterion.name}
            maxLength={60}
            placeholder="Criterio del despacho"
            onChange={(event) => props.onChange({ ...criterion, name: event.target.value }, false)}
          />
        </label>
      ) : null}
      {criterion.kind !== "ROSS_HEIDECKE" ? (
        <div className="grid gap-1">
          <div className="grid max-w-md grid-cols-[minmax(0,1fr)_6rem_auto] gap-1 font-medium text-muted-foreground">
            <span>Calificación</span><span>Factor</span><span className="sr-only">Acciones</span>
          </div>
          {criterion.options.map((option, index) => (
            <div key={index} className="grid max-w-md grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-1">
              <Input
                aria-label={`Calificación ${index + 1}`}
                className="h-7 text-xs"
                value={option.label}
                maxLength={60}
                onChange={(event) => setOption(index, { label: event.target.value })}
              />
              <Input
                aria-label={`Factor de ${option.label || `la calificación ${index + 1}`}`}
                className="h-7 text-xs"
                inputMode="decimal"
                defaultValue={String(option.factor)}
                onChange={(event) => setOption(index, { factor: event.target.value })}
              />
              {!props.readOnly ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Quitar ${option.label || `la calificación ${index + 1}`}`}
                  onClick={() => props.onChange({ ...criterion, options: criterion.options.filter((_, position) => position !== index) }, true)}
                >
                  <Trash2 />
                </Button>
              ) : <span />}
            </div>
          ))}
          {!props.readOnly ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              disabled={criterion.options.length >= MAX_CONSERVATION_OPTIONS}
              onClick={() => props.onChange({ ...criterion, options: [...criterion.options, { label: "", factor: 1 }] }, true)}
            >
              <Plus data-icon="inline-start" /> Calificación
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A boxed figure under a table, as the books close each block. */
function Box(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border bg-background px-2 py-1 text-xs ${props.strong ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{props.label}</span>
      <span className="tabular-nums">{props.value}</span>
    </div>
  );
}

/**
 * Cost approach: land (valued with the unit value adopted in the land market
 * and homologated against its lote tipo), the construction types picked from
 * the construction section with their cost columns, special installations
 * captured once for the dictamen, and indirects. Saves when a field loses focus.
 */
export function CostCalculationPanel(props: {
  valuationId: string;
  readOnly: boolean;
  onCalculation: (calculation: CostCalculationDto) => void;
}) {
  const { valuationId } = props;
  const [calculation, setCalculation] = useState<CostCalculationDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const readOnly = props.readOnly || Boolean(calculation?.locked);

  // What the server holds, to skip saves that would not change anything.
  const lastSaved = useRef<string | null>(null);
  const applyServerState = (next: CostCalculationDto) => {
    lastSaved.current = JSON.stringify(savedInputOf(next));
    setCalculation(next);
    setDraft(draftOf(next));
  };
  const enqueueSave = useSerializedSave(async (payload: PanelInput) => {
    if (JSON.stringify(payload) === lastSaved.current) return;
    setSaving(true);
    try {
      const next = await api.costs.save(valuationId, payload);
      lastSaved.current = JSON.stringify(savedInputOf(next));
      // The draft stays as typed; only the saved state moves.
      setCalculation(next);
    } catch (error) {
      toast.error(error instanceof SessionExpiredError
        ? "Tu sesión expiró. Vuelve a iniciar sesión."
        : error instanceof Error ? error.message : "No se pudo guardar el enfoque de costos.");
    } finally {
      setSaving(false);
    }
  });
  const report = useEffectEvent((next: CostCalculationDto) => {
    if (!props.readOnly) props.onCalculation(next);
  });

  useEffect(() => {
    let active = true;
    api.costs.get(valuationId)
      .then((next) => { if (active) applyServerState(next); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "No se pudo cargar el enfoque de costos."); });
    return () => { active = false; };
  }, [valuationId]);

  useEffect(() => {
    if (calculation) report(calculation);
  }, [calculation]);

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!calculation || !draft) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando el enfoque de costos…
      </div>
    );
  }

  const input = inputOf(draft);
  const live = compute(calculation, input);
  const step = (key: string) => live.trace?.find(key);
  const value = (key: string) => step(key)?.value;
  /** What the formula gives, for the placeholder of a factor the appraiser may type over. */
  const formulaValue = (key: string) => {
    const found = step(key);
    if (!found) return undefined;
    return typeof found.inputs.formula === "number" ? found.inputs.formula : found.value;
  };
  const subtotalOf = (key: string) => {
    const subtotal = step(key)?.inputs.subtotal;
    return typeof subtotal === "number" ? money(subtotal) : "—";
  };
  const config = costEngineConfig({ ...input, precision: calculation.precision });
  const marketValue = calculation.market.adoptedUnitValue;
  const reference = landReferenceArea({ land: input.land, market: calculation.market });
  const subjectArea = input.land.subjectArea ?? calculation.market.subjectArea;
  const pickedRefs = new Set(draft.constructions.map((row) => row.ref.trim().toLowerCase()));
  const unpickedTypes = calculation.types.filter((type) => !pickedRefs.has(type.ref.trim().toLowerCase()));

  const save = (next = draft) => {
    if (!readOnly) void enqueueSave(payloadOf(next));
  };
  // A select has no blur to wait for: it saves as soon as it changes.
  const change = (patch: Partial<Pick<Draft, "rounding">> & { surfacePower?: number }) => {
    const land = patch.surfacePower === undefined ? draft.land : { ...draft.land, surfacePower: String(patch.surfacePower) };
    const next = { ...draft, land, rounding: patch.rounding ?? draft.rounding };
    setDraft(next);
    save(next);
  };

  const setLand = (key: keyof Omit<Draft["land"], "factors">) => (event: { target: { value: string } }) =>
    setDraft((current) => current && { ...current, land: { ...current.land, [key]: event.target.value } });
  const setFactor = (key: LandFactorKey) => (event: { target: { value: string } }) =>
    setDraft((current) => current && { ...current, land: { ...current.land, factors: { ...current.land.factors, [key]: event.target.value } } });
  function setRow<K extends "constructions" | "installations" | "indirects">(list: K, index: number, key: string, next: string) {
    setDraft((current) => current && {
      ...current,
      [list]: current[list].map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: next } : row)),
    });
  }
  // A removal has no blur to wait for: it saves at once. A construction removed here stays described in its section.
  function removeRow(list: "constructions" | "installations" | "indirects", index: number) {
    if (!draft) return;
    // A type taken out stays out: the others of the construction section keep entering on their own.
    const removedRef = list === "constructions" ? draft.constructions[index]?.ref.trim() : "";
    const columns = removedRef
      ? { ...draft.columns, excludedTypes: [...new Set([...(draft.columns.excludedTypes ?? []), removedRef])] }
      : draft.columns;
    const next = { ...draft, columns, [list]: draft[list].filter((_, rowIndex) => rowIndex !== index) };
    setDraft(next);
    save(next);
  }
  // The calificación is a select too: it saves at once and gives the Cons. Picking one replaces a Cons.
  // typed before (it used to win over the calificación, so changing the calificación changed nothing).
  // With another criterion the state picked writes its factor in Cons., which stays editable.
  const pickRating = (list: "constructions" | "installations", index: number, rating: string) => {
    const criterion = conservationCriterionOfColumns(draft.columns[list]);
    const ross = criterion.kind === "ROSS_HEIDECKE";
    const factor = ross ? null : conservationOfState(criterion, rating);
    const next = {
      ...draft,
      [list]: draft[list].map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        if (ross) return { ...row, conservationRating: rating, conservationState: null, ...(rating ? { conservation: "" } : {}) };
        return { ...row, conservationRating: "", conservationState: rating || null, ...(factor === null ? {} : { conservation: String(factor) }) };
      }),
    };
    setDraft(next);
    save(next);
  };
  // The criterion of a table: typed changes wait for the field to be left; picking a criterion or adding a state saves at once.
  const changeCriterion = (list: "constructions" | "installations", criterion: ConservationCriterionDto, commit: boolean) => {
    const next = { ...draft, columns: { ...draft.columns, [list]: { ...draft.columns[list], conservation: criterion } } };
    setDraft(next);
    if (commit) save(next);
  };
  // The names of the demerit columns are typed (saved when the field is left); adding or removing a factor saves at once.
  const renameDemerit = (list: "constructions" | "installations", factors: DemeritColumnsDto) =>
    setDraft((current) => current && { ...current, columns: { ...current.columns, [list]: factors } });
  const addDemerit = (list: "constructions" | "installations") => {
    const factors = draft.columns[list];
    if (factors.extra.length >= MAX_EXTRA_DEMERIT_FACTORS) return;
    const next = { ...draft, columns: { ...draft.columns, [list]: { ...factors, extra: [...factors.extra, ""] } } };
    setDraft(next);
    save(next);
  };
  const removeDemerit = (list: "constructions" | "installations", index: number) => {
    const factors = draft.columns[list];
    const next = {
      ...draft,
      columns: { ...draft.columns, [list]: { ...factors, extra: factors.extra.filter((_, position) => position !== index) } },
      [list]: draft[list].map((row) => ({ ...row, extraFactors: row.extraFactors.filter((_, position) => position !== index) })),
    };
    setDraft(next);
    save(next);
  };
  const setExtraFactor = (list: "constructions" | "installations", index: number, position: number, text: string) =>
    setDraft((current) => current && {
      ...current,
      [list]: current[list].map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const extraFactors = Array.from({ length: Math.max(row.extraFactors.length, position + 1) }, (_, item) => row.extraFactors[item] ?? "");
        extraFactors[position] = text;
        return { ...row, extraFactors };
      }),
    });
  // Mantenim. prints in the construction section and does not enter the calculation: an appraisal of a building may leave it out.
  const showMaintenance = draft.columns.showMaintenance ?? draft.installations.some((row) => row.maintenance.trim());
  const toggleMaintenance = (show: boolean) => {
    const next = { ...draft, columns: { ...draft.columns, showMaintenance: show } };
    setDraft(next);
    save(next);
  };
  // The type is a select: picking one saves at once.
  const pickConstruction = (index: number, ref: string) => {
    const next = { ...draft, constructions: draft.constructions.map((row, rowIndex) => (rowIndex === index ? { ...row, ref } : row)) };
    setDraft(next);
    save(next);
  };
  const addRow = (list: "constructions" | "installations" | "indirects") => setDraft((current) => {
    if (!current) return current;
    // A new construction row picks the first type not valued yet, and takes it back into the cost approach.
    if (list === "constructions") {
      const ref = unpickedTypes[0]?.ref ?? "";
      const excludedTypes = (current.columns.excludedTypes ?? []).filter((item) => item.trim().toLowerCase() !== ref.trim().toLowerCase());
      return {
        ...current,
        columns: { ...current.columns, excludedTypes },
        constructions: [...current.constructions, percentRow(emptyConstructionCost(ref))],
      };
    }
    if (list === "installations") return { ...current, installations: [...current.installations, percentRow(emptyInstallation(current.installations.length))] };
    return { ...current, indirects: [...current.indirects, { concept: "", percentage: "", base: "" }] };
  });

  /** `grouping`: amounts and areas show their thousands separator; factors, ages and percentages do not. */
  const textInput = (
    list: "constructions" | "installations" | "indirects", index: number, key: string, current: string, label: string, numeric = true, placeholder?: string, grouping = false,
  ) => {
    const Control = numeric ? FormulaInput : Input;
    return (
      <Control
        {...(numeric && grouping ? { grouping: true } : {})}
        aria-label={label}
        className={cell}
        value={current}
        placeholder={placeholder}
        title={placeholder === undefined ? undefined : `${label}. ${FORMULA_HINT}`}
        onChange={(event) => setRow(list, index, key, event.target.value)}
      />
    );
  };
  // A percentage from 0 to 100, stored as a fraction; the % sign sits next to it.
  const percentInput = (list: "constructions" | "installations", index: number, key: "completion" | "undivided", current: string, label: string) => (
    <div className="flex items-center gap-0.5">
      <FormulaInput
        aria-label={`${label} (%)`}
        className={cell}
        value={current}
        placeholder="100"
        onChange={(event) => setRow(list, index, key, event.target.value)}
      />
      <span className="text-muted-foreground">%</span>
    </div>
  );
  // Placeholder of a factor with a formula: the formula's result, shown while the field is empty.
  const hint = (formula: number | undefined) => (formula === undefined ? "Fórmula" : figure(formula, 4));
  /**
   * The demerit factors of a row: Cons. typed or, empty, the one of the
   * calificación; Edad and FRe by formula unless typed; Otro typed (1 when empty).
   */
  const demeritCells = (
    list: "constructions" | "installations",
    index: number,
    row: { conservation: string; conservationRating: string; ageFactor: string; otherFactor: string; extraFactors: string[]; resultantFactor: string },
    key: string,
    age: number | null,
    usefulLife: number | null,
  ) => {
    const ageFormula = formulaValue(`${key}.factorEdad`) ?? (age !== null && usefulLife ? ageFactor(age, usefulLife, config.ageFactor) : undefined);
    const criterion = conservationCriterionOfColumns(draft.columns[list]);
    const ross = criterion.kind === "ROSS_HEIDECKE";
    const fromRating = ross ? conservationOfRating(parseDecimal(row.conservationRating)) : null;
    const state = (row as { conservationState?: string | null }).conservationState ?? "";
    return (
      <>
        <td className="w-36 p-1">
          <ConservationRatingSelect
            value={ross ? row.conservationRating : state}
            criterion={criterion}
            label={ross ? "Estado de conservación y calificación" : `Estado de conservación (${criterion.name.trim() || CONSERVATION_CRITERION_LABELS[criterion.kind]})`}
            onChange={(rating) => pickRating(list, index, rating)}
          />
        </td>
        <td className="w-16 p-1">
          {textInput(list, index, "conservation", row.conservation, "Factor de conservación (Cons.)", true, fromRating === null ? undefined : figure(fromRating, 3))}
        </td>
        <td className="w-16 p-1">{textInput(list, index, "ageFactor", row.ageFactor, "Factor de edad = 1 − (edad / vida útil)^1.4", true, hint(ageFormula))}</td>
        <td className="w-14 p-1">{textInput(list, index, "otherFactor", row.otherFactor, draft.columns[list].other, true, "1")}</td>
        {draft.columns[list].extra.map((name, position) => (
          <td key={position} className="w-14 p-1">
            <FormulaInput
              aria-label={name.trim() || `Factor ${position + 1}`}
              className={cell}
              value={row.extraFactors[position] ?? ""}
              placeholder="1"
              onChange={(event) => setExtraFactor(list, index, position, event.target.value)}
            />
          </td>
        ))}
        <td className="w-16 p-1">
          <FormulaInput
            aria-label="Factor resultante FRe = Cons. × Edad × Otro"
            className={resultCell}
            value={row.resultantFactor}
            placeholder={hint(formulaValue(`${key}.factorResultante`))}
            title={`Factor resultante FRe = ${demeritLabels(draft.columns[list]).slice(0, -1).join(" × ")}. ${FORMULA_HINT}`}
            onChange={(event) => setRow(list, index, "resultantFactor", event.target.value)}
          />
        </td>
      </>
    );
  };
  const amount = (key: string) => {
    const found = value(key);
    return found === undefined ? "—" : money(found);
  };
  const constructionRows = draft.constructions.map((row) => ({ row, type: findConstructionType(calculation.types, row.ref), key: `costos.construcciones.${row.ref}` }));
  const installationKey = (ref: string) => `costos.instalaciones.${ref}`;
  const surfaceFormula = step("costos.terreno.factorSuperficie")?.formula;

  return (
    <section className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:p-4" aria-labelledby="cost-calculation-title" onBlur={() => save()}>
      <header className="flex items-center justify-between gap-2">
        <h3 id="cost-calculation-title" className="flex items-center gap-2 text-sm font-semibold">
          <Calculator className="size-4" /> Cálculo del enfoque de costos
        </h3>
        {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
      </header>
      {calculation.locked ? <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p> : null}
      <CalculationPrecisionControl
        valuationId={valuationId}
        precision={calculation.precision}
        readOnly={readOnly}
        onChanged={() => void api.costs.get(valuationId).then(applyServerState).catch(() => undefined)}
      />
      <p className="text-xs text-muted-foreground">
        Los factores con fórmula en el Excel (Sup. y FRe del terreno; Edad y FRe de construcciones e instalaciones) se calculan solos mientras el campo está vacío; el número gris es el resultado de la fórmula. Escribe un valor para sustituirla y bórralo para volver a la fórmula. El factor de conservación (Cons.) sale del estado de conservación y su calificación (criterio de Ross-Heidecke) mientras no escribas otro.
      </p>

      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">A) Terreno en estudio</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              {/* Without a lote tipo the homologation is against the subject, and the field says so with its measure. */}
              <FieldLabel htmlFor="cost-land-reference">{reference.source === "subject" ? "Lote Sujeto (m²)" : "Lote Tipo (m²)"}</FieldLabel>
              <FormulaInput
                id="cost-land-reference"
                grouping
                value={draft.land.referenceArea}
                placeholder={calculation.market.baseArea !== null ? `De mercado: ${calculation.market.baseArea}` : reference.area ? `Sujeto: ${reference.area}` : "Igual al sujeto"}
                onChange={setLand("referenceArea")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-land-value">Valor comparativo de Mercado ($/m²)</FieldLabel>
              <FormulaInput id="cost-land-value" grouping value={draft.land.unitValue} placeholder={marketValue ? `De mercado: ${marketValue}` : "Captura el mercado de terrenos"} onChange={setLand("unitValue")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-land-power">Potencia</FieldLabel>
              <SurfacePowerSelect id="cost-land-power" value={input.land.surfacePower} onChange={(surfacePower) => change({ surfacePower })} />
            </Field>
          </div>
          <div className={CALC_TABLE_FRAME}>
            <table className={cn(CALC_TABLE, "w-auto min-w-[900px]")} aria-label="Terreno en estudio">
              <thead className={CALC_HEAD}>
                <tr>
                  {["Fracción", "Superficie de Sujeto (m²)", "Valor Unitario ($/m²)"].map((label) => <th key={label} rowSpan={2} className={head}>{label}</th>)}
                  <th colSpan={LAND_FACTORS.length + 1} className={head}>Factores de Homologación</th>
                  {["Valor Unitario Neto $/m²", "Valor Parcial $"].map((label) => <th key={label} rowSpan={2} className={head}>{label}</th>)}
                </tr>
                <tr>
                  {LAND_FACTORS.map((factor) => <th key={factor.key} className={head} title={factor.label}>{LAND_FACTOR_SHORT_LABELS[factor.key]}</th>)}
                  <th className={head}>FRe</th>
                </tr>
              </thead>
              <tbody>
                <tr className={CALC_ROW}>
                  <td className="px-1.5 text-center">I</td>
                  <td className="w-24 p-1">
                    <FormulaInput
                      id="cost-land-area"
                      grouping
                      aria-label="Superficie de Sujeto (m²)"
                      className={cell}
                      value={draft.land.subjectArea}
                      placeholder={calculation.market.subjectArea ? `De mercado: ${calculation.market.subjectArea}` : undefined}
                      onChange={setLand("subjectArea")}
                    />
                  </td>
                  <td className={`w-24 ${readOnlyCell}`}>{amount("costos.terreno.valorUnitario")}</td>
                  {LAND_FACTORS.map((factor) => (
                    <td key={factor.key} className="w-16 p-1">
                      {factor.key === "surface" ? (
                        <FormulaInput
                          id="cost-factor-surface"
                          aria-label="Factor de superficie (Sup.)"
                          className={cell}
                          value={draft.land.surfaceFactor}
                          placeholder={hint(formulaValue("costos.terreno.factorSuperficie"))}
                          title={`Sup. = ${surfaceFormula ?? "(lote tipo / superficie del sujeto)^(1/n)"}. ${FORMULA_HINT}`}
                          onChange={setLand("surfaceFactor")}
                        />
                      ) : (
                        <FormulaInput id={`cost-factor-${factor.key}`} aria-label={factor.label} className={cell} value={draft.land.factors[factor.key]} onChange={setFactor(factor.key)} />
                      )}
                    </td>
                  ))}
                  <td className="w-16 p-1">
                    <FormulaInput
                      id="cost-factor-resultant"
                      aria-label="Factor resultante del terreno (FRe)"
                      className={resultCell}
                      value={draft.land.resultantFactor}
                      placeholder={hint(formulaValue("costos.terreno.factorResultante"))}
                      title={`FRe = Neg. × Ubic. × Sup. × Serv. × Clas. × Top. ${FORMULA_HINT}`}
                      onChange={setLand("resultantFactor")}
                    />
                  </td>
                  <td className={`w-24 ${readOnlyCell}`}>{amount("costos.terreno.valorUnitarioNeto")}</td>
                  <td className={`w-28 ${readOnlyCell}`}>{amount("costos.terreno.valorParcial")}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Sup. = {surfaceFormula && surfaceFormula !== "capturado por el valuador" ? surfaceFormula : "(lote tipo / superficie del sujeto)^(1/n)"}, n = potencia. FRe = Neg. × Ubic. × Sup. × Serv. × Clas. × Top.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Box label="Superficie valuada:" value={subjectArea ? `${figure(subjectArea)} m²` : "—"} />
            <Box label="Valor Unitario Medio ($/m²):" value={amount("costos.terreno.valorUnitarioNeto")} />
            <Box label="A) Valor del Terreno:" value={amount("costos.terreno.valor")} strong />
          </div>
          {!draft.land.unitValue && !marketValue ? (
            <p className="text-xs text-muted-foreground">El valor unitario sale del enfoque de mercado de terrenos; captúralo ahí o escríbelo aquí.</p>
          ) : null}
          <p className="text-xs text-muted-foreground" data-testid="cost-land-reference-source">
            {reference.source === "subject" ? LAND_REFERENCE_SOURCE.subject : `${LAND_REFERENCE_SOURCE[reference.source]} Lote tipo: ${figure(reference.area)} m².`}
          </p>
        </div>

        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">B) Construcciones</h4>
          <p className="text-xs text-muted-foreground">
            Cada tipo dado de alta en la sección de construcciones entra solo, con su referencia, descripción, clasificación, calidad, superficie, edad y vida útil:
            aquí solo capturas sus columnas de costo. Quitar un renglón lo saca del cálculo y del enfoque impreso; el tipo sigue descrito en la sección de construcciones
            y vuelve con «+ Construcción». Para quitarlo de todo el avalúo, bórralo allá.
            {calculation.types.length ? "" : " Aún no hay tipos: captúralos en la sección INF. CONSTRUCCIÓN."}
          </p>
          <ConservationCriterionEditor
            id="cost-constructions"
            criterion={conservationCriterionOfColumns(draft.columns.constructions)}
            readOnly={readOnly}
            onChange={(criterion, commit) => changeCriterion("constructions", criterion, commit)}
          />
          <DemeritColumnsEditor
            id="cost-constructions"
            factors={draft.columns.constructions}
            readOnly={readOnly}
            onRename={(factors) => renameDemerit("constructions", factors)}
            onAdd={() => addDemerit("constructions")}
            onRemove={(position) => removeDemerit("constructions", position)}
          />
          <div className={CALC_TABLE_FRAME}>
            <table className={cn(CALC_TABLE, "w-full min-w-[1000px]")} aria-label="Construcciones: factores de demérito">
              <DemeritHeader
                leading={["Ref.", "Tipo de Construcción", "Clasificación", "Calidad", "Superficie Construida (m²)", "Edad", "Vida útil"]}
                remaining="Vida remanente"
                factors={draft.columns.constructions}
              />
              <tbody>
                {constructionRows.map(({ row, type, key }, index) => (
                  <tr key={index} className={CALC_ROW}>
                    <td className="w-20 p-1">
                      <select
                        aria-label="Tipo de construcción"
                        className="h-7 w-full rounded-md border bg-transparent px-1 text-xs"
                        value={type ? type.ref : row.ref}
                        onChange={(event) => pickConstruction(index, event.target.value)}
                      >
                        {type ? null : <option value={row.ref}>{row.ref || "—"}</option>}
                        {calculation.types.map((option) => <option key={option.ref} value={option.ref}>{option.ref}</option>)}
                      </select>
                    </td>
                    <td className={`min-w-40 ${readOnlyCell}`}>{type?.description || "—"}</td>
                    <td className={`min-w-24 ${readOnlyCell}`}>{type?.classification || "—"}</td>
                    <td className={`min-w-20 ${readOnlyCell}`}>{type?.quality || "—"}</td>
                    <td className={`w-20 ${readOnlyCell}`}>{figure(type?.area)}</td>
                    <td className={`w-12 ${readOnlyCell}`}>{figure(type?.age)}</td>
                    <td className={`w-12 ${readOnlyCell}`}>{figure(type?.usefulLife)}</td>
                    <td className={`w-12 ${readOnlyCell}`}>{figure(type ? remainingUsefulLife(type) : null)}</td>
                    {demeritCells("constructions", index, row, key, type?.age ?? null, type?.usefulLife ?? null)}
                    <td className="w-20 p-1">{percentInput("constructions", index, "completion", row.completion, "Grado de terminación")}</td>
                    <td className="w-20 p-1">{percentInput("constructions", index, "undivided", row.undivided, "Indiviso")}</td>
                    <td className="p-1">
                      {!readOnly ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${row.ref} del cálculo`} onClick={() => removeRow("constructions", index)}><Trash2 /></Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={CALC_TABLE_FRAME}>
            <table className={cn(CALC_TABLE, "w-full min-w-[900px]")} aria-label="Construcciones: valor de reposición">
              <ValuationHeader leading={["Ref.", "Tipo de Construcción", "Superficie Construida (m²)"]} resultant="Factor Resultante" netValue="Valor Neto de Reposición (VNR)" />
              <tbody>
                {constructionRows.map(({ row, type, key }, index) => (
                  <tr key={index} className={CALC_ROW}>
                    <td className="w-20 px-1.5">{row.ref || "—"}</td>
                    <td className={`min-w-40 ${readOnlyCell}`}>{type?.description || "—"}</td>
                    <td className={`w-20 ${readOnlyCell}`}>{figure(type?.area)}</td>
                    <td className="w-28 p-1">{textInput("constructions", index, "unitReplacementCost", row.unitReplacementCost, "VRN unitario ($/m²)", true, undefined, true)}</td>
                    <td className={`w-28 ${readOnlyCell}`}>{amount(`${key}.vrnParcial`)}</td>
                    <td className={cn("w-16", readOnlyCell, CALC_RESULT)}>{figure(value(`${key}.factorResultante`), 4)}</td>
                    <td className={`w-28 ${readOnlyCell}`}>{amount(`${key}.vnrUnitario`)}</td>
                    <td className="w-28 px-1.5 text-right font-medium whitespace-nowrap tabular-nums">{amount(`${key}.vnrParcial`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {constructionRows.length ? (
            <div className="grid gap-2 sm:grid-cols-4">
              <Box label="Subtotal:" value={subtotalOf("costos.construcciones.valor")} />
              <Box label="Superficie valuada:" value={`${figure(constructionRows.reduce((sum, { type }) => sum + (type?.area ?? 0), 0))} m²`} />
              <Box label="Valor Unitario Medio ($/m²):" value={amount("costos.construcciones.valorUnitarioMedio")} />
              <Box label="B) Valor de las Construcciones:" value={amount("costos.construcciones.valor")} strong />
            </div>
          ) : null}
          {unpickedTypes.length ? (
            <p className="text-xs text-muted-foreground" data-testid="cost-unpicked-types">
              Fuera del cálculo (solo descritos en la sección de construcciones): {unpickedTypes.map((type) => type.ref).join(", ")}.
            </p>
          ) : null}
          {!readOnly ? (
            <Button type="button" size="sm" variant="outline" className="w-fit" disabled={!unpickedTypes.length} onClick={() => addRow("constructions")}>
              <Plus data-icon="inline-start" /> Construcción
            </Button>
          ) : null}
        </div>

        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">C) Instalaciones especiales, elementos accesorios y obras complementarias (IE, EA, OC)</h4>
          <p className="text-xs text-muted-foreground" data-testid="cost-installations-legend">
            P/C: P = Privativa, C = Común. Las sumas privativa y común son informativas; el subtotal incluye las dos.
            Mantenim. se imprime en la tabla de instalaciones de la sección de construcciones y no entra en el cálculo; si el avalúo no lo lleva, quítalo aquí
            y borra la columna de esa tabla.
          </p>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <ConservationCriterionEditor
              id="cost-installations"
              criterion={conservationCriterionOfColumns(draft.columns.installations)}
              readOnly={readOnly}
              onChange={(criterion, commit) => changeCriterion("installations", criterion, commit)}
            />
            <DemeritColumnsEditor
              id="cost-installations"
              factors={draft.columns.installations}
              readOnly={readOnly}
              onRename={(factors) => renameDemerit("installations", factors)}
              onAdd={() => addDemerit("installations")}
              onRemove={(position) => removeDemerit("installations", position)}
            />
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox checked={showMaintenance} disabled={readOnly} onCheckedChange={(checked) => toggleMaintenance(checked === true)} />
              Capturar Mantenim.
            </label>
          </div>
          <div className={CALC_TABLE_FRAME}>
            <table className={cn(CALC_TABLE, "w-full min-w-[1200px]")} aria-label="Instalaciones especiales: factores de demérito">
              <DemeritHeader
                leading={["P/C", "Ref.", "Descripción", "Unidad", "Cant.", "Edad", "Vida útil"]}
                remaining="Vida Remanente"
                factors={draft.columns.installations}
                trailing={showMaintenance ? ["Mantenim."] : []}
              />
              <tbody>
                {draft.installations.map((row, index) => {
                  const numbers = input.installations[index];
                  return (
                    <tr key={index} className={CALC_ROW}>
                      <td className="w-14 p-1">
                        <select
                          aria-label="P/C (P = Privativa, C = Común)"
                          title="P = Privativa, C = Común"
                          className="h-7 w-full rounded-md border bg-transparent px-1 text-xs"
                          value={row.share}
                          onChange={(event) => setRow("installations", index, "share", event.target.value)}
                        >
                          <option value="P">P</option>
                          <option value="C">C</option>
                        </select>
                      </td>
                      <td className="w-12 p-1">{textInput("installations", index, "ref", row.ref, "Referencia", false)}</td>
                      <td className="min-w-48 p-1">{textInput("installations", index, "description", row.description, "Descripción", false)}</td>
                      <td className="w-16 p-1">{textInput("installations", index, "unit", row.unit, "Unidad", false)}</td>
                      <td className="w-16 p-1">{textInput("installations", index, "quantity", row.quantity, "Cantidad", true, undefined, true)}</td>
                      <td className="w-12 p-1">{textInput("installations", index, "age", row.age, "Edad")}</td>
                      <td className="w-12 p-1">{textInput("installations", index, "usefulLife", row.usefulLife, "Vida útil")}</td>
                      <td className={`w-12 ${readOnlyCell}`}>{figure(remainingUsefulLife(numbers))}</td>
                      {demeritCells("installations", index, row, installationKey(row.ref), numbers.age, numbers.usefulLife)}
                      <td className="w-20 p-1">{percentInput("installations", index, "completion", row.completion, "Grado de terminación")}</td>
                      <td className="w-20 p-1">{percentInput("installations", index, "undivided", row.undivided, "Indiviso")}</td>
                      {showMaintenance ? (
                        <td className="w-24 p-1">{textInput("installations", index, "maintenance", row.maintenance, "Mantenimiento (sección de construcciones)", false)}</td>
                      ) : null}
                      <td className="p-1">
                        {!readOnly ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar la instalación ${row.ref}`} onClick={() => removeRow("installations", index)}><Trash2 /></Button> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={CALC_TABLE_FRAME}>
            <table className={cn(CALC_TABLE, "w-full min-w-[1000px]")} aria-label="Instalaciones especiales: valor de reposición">
              <ValuationHeader leading={["P/C", "Ref.", "Descripción", "Unidad", "Cant."]} resultant="F. Result" netValue="Valor Neto Reposición (VNR)" />
              <tbody>
                {draft.installations.map((row, index) => {
                  const key = installationKey(row.ref);
                  return (
                    <tr key={index} className={CALC_ROW}>
                      <td className="w-14 px-1.5">{row.share}</td>
                      <td className="w-12 px-1.5">{row.ref || "—"}</td>
                      <td className={`min-w-48 ${readOnlyCell}`}>{row.description || "—"}</td>
                      <td className={`w-16 ${readOnlyCell}`}>{row.unit || "—"}</td>
                      <td className={`w-16 ${readOnlyCell}`}>{figure(input.installations[index].quantity)}</td>
                      <td className="w-28 p-1">{textInput("installations", index, "unitReplacementCost", row.unitReplacementCost, "VRN unitario", true, undefined, true)}</td>
                      <td className={`w-28 ${readOnlyCell}`}>{amount(`${key}.vrnParcial`)}</td>
                      <td className={cn("w-16", readOnlyCell, CALC_RESULT)}>{figure(value(`${key}.factorResultante`), 4)}</td>
                      <td className={`w-28 ${readOnlyCell}`}>{amount(`${key}.vnrUnitario`)}</td>
                      <td className="w-28 px-1.5 text-right font-medium whitespace-nowrap tabular-nums">{amount(`${key}.vnrParcial`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {draft.installations.length ? (
            <div className="grid gap-2 sm:grid-cols-4">
              <Box label="Suma Privativa (P):" value={amount("costos.instalaciones.privativas")} />
              <Box label="Suma Común (C):" value={amount("costos.instalaciones.comunes")} />
              <Box label="Subtotal:" value={subtotalOf("costos.instalaciones.valor")} />
              <Box label="C) Valor de Instalaciones Especiales:" value={amount("costos.instalaciones.valor")} strong />
            </div>
          ) : null}
          {!readOnly ? <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => addRow("installations")}><Plus data-icon="inline-start" /> Instalación</Button> : null}
        </div>

        <details className="grid gap-2" open={draft.indirects.length > 0}>
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted-foreground uppercase">D) Costos indirectos (solo si el avalúo los lleva)</summary>
          <p className="text-xs text-muted-foreground">
            Concepto, porcentaje (0.05 = 5 %) y base. Con la base vacía se calculan sobre el valor de construcciones e instalaciones.
          </p>
          {draft.indirects.map((row, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_5rem_8rem_auto] items-center gap-2">
              {textInput("indirects", index, "concept", row.concept, "Concepto", false)}
              {textInput("indirects", index, "percentage", row.percentage, "Porcentaje (0.05 = 5 %)")}
              {textInput("indirects", index, "base", row.base, "Base ($); vacía: construcciones e instalaciones", true, undefined, true)}
              {!readOnly ? <Button type="button" size="icon-sm" variant="ghost" aria-label="Quitar el indirecto" onClick={() => removeRow("indirects", index)}><Trash2 /></Button> : null}
            </div>
          ))}
          {!readOnly ? <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => addRow("indirects")}><Plus data-icon="inline-start" /> Indirecto</Button> : null}
        </details>

        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Redondeos</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ROUNDING_FIELDS.map((field) => (
              <Field key={field.key}>
                <FieldLabel htmlFor={`cost-rounding-${field.key}`} className="text-xs">{field.label}</FieldLabel>
                <RoundingSelect
                  id={`cost-rounding-${field.key}`}
                  label={`Redondeo de ${field.label.toLowerCase()}`}
                  value={draft.rounding[field.key]}
                  onChange={(digits) => change({ rounding: { ...draft.rounding, [field.key]: digits } })}
                />
              </Field>
            ))}
          </div>
        </div>
      </fieldset>

      {live.result ? (
        <dl className="grid gap-x-4 gap-y-1 rounded-md border bg-background p-3 text-sm sm:grid-cols-5">
          <div><dt className="text-xs text-muted-foreground">A) Terreno</dt><dd className="tabular-nums">{money(live.result.land)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">B) Construcciones</dt><dd className="tabular-nums">{money(live.result.constructions)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">C) Instalaciones</dt><dd className="tabular-nums">{money(live.result.specialInstallations)}</dd></div>
          {live.result.indirects ? (
            <div><dt className="text-xs text-muted-foreground">D) Costos indirectos</dt><dd className="tabular-nums">{money(live.result.indirects)}</dd></div>
          ) : null}
          <div><dt className="text-xs text-muted-foreground">Valor físico de reposición</dt><dd className="text-base font-semibold tabular-nums">{money(live.result.physicalValue)}</dd></div>
          {landUnitValue({ land: input.land, market: calculation.market }) === null ? (
            <p className="text-xs text-muted-foreground sm:col-span-5">Sin valor unitario del terreno: el valor físico no incluye el terreno.</p>
          ) : null}
        </dl>
      ) : live.reason ? <p className="text-sm text-muted-foreground">{live.reason}</p> : null}
    </section>
  );
}
