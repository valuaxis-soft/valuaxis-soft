"use client";

import { Calculator, Link2, Link2Off, Loader2, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { Fragment, useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import {
  CONSERVATION_CRITERIA,
  CONSERVATION_CRITERION_LABELS,
  CONSERVATION_RATINGS,
  DEFAULT_COST_ROUNDING,
  LAND_FACTORS,
  MAX_CONSERVATION_OPTIONS,
  MAX_EXTRA_DEMERIT_FACTORS,
  constructionCostOf,
  conservationCriterionOf,
  addConstructionDisabledReason,
  conservationCriterionOfColumns,
  conservationOfRating,
  conservationOfState,
  costColumnsOf,
  costEngineConfig,
  emptyConstructionCost,
  emptyInstallation,
  findConstructionType,
  installationHasData,
  landReferenceArea,
  landUnitValue,
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
import { computeCostApproach, demeritPreview } from "@/features/valuations/engine/costs";
import { nextCaptureRef } from "@/features/valuations/calculation/construction-capture";
import { Trace } from "@/features/valuations/engine/trace";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { collectFormulas, withFormulaTexts, type CapturedFormulas } from "@/features/valuations/calculation/captured-formulas";
import type { CapturePages } from "@/features/valuations/calculation/capture-display";
import { COST_TEMPLATE_BLOCK_IDS, costCaptureColumns, costDocumentBlocks, costIndirectOrder } from "@/features/valuations/calculation/cost-document";
import { RoundingSelect, SurfacePowerSelect } from "./calculation-controls";
import { CALC_RESULT } from "./calculation-table-style";
import { ApproachLeftOutNotice, ApproachRemoval, type ApproachInReport } from "./approach-removal";
import { CaptureSlot, usePublishCapturePages, type CaptureAddress } from "../editor/capture-host";
import { cn } from "@/lib/utils";
import { numbersOf, textsOf, type Texts } from "./draft-texts";
import { FormulaInput } from "./formula-input";
import { EditorConfigPanel } from "../editor/editor-config-panel";
import { CalculationPrecisionSummary } from "./calculation-precision-control";
import { useSerializedSave } from "./use-serialized-save";
import { useDraftHistory } from "./use-draft-history";
import { factorDecimals } from "@/features/valuations/calculation/calculation-precision";
import { SaveRefusedNotice, saveRefusedMessage } from "./save-refused";

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
  // An installation's own name in the cost approach; empty, it is linked to its description again.
  const costName = (row as unknown as { costName?: unknown }).costName;
  return {
    ...numbersOf(row as unknown as Texts<T>, template),
    completion: fractionOf(row.completion),
    undivided: fractionOf(row.undivided),
    extraFactors: row.extraFactors.map((text) => parseDecimal(text) ?? 1),
    ...(typeof state === "string" && state ? { conservationState: state } : {}),
    ...(typeof costName === "string" && costName.trim() ? { costName: costName.trim() } : {}),
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
 * The installations after one is taken out: numbered 1, 2, 3… as they were,
 * they are numbered again in order (video 7.4, 20:30), as the editor's
 * tables do; references of the appraiser's own (IE-1, A…) stay as written.
 */
export function withoutInstallation<T extends { ref: string }>(rows: T[], index: number): T[] {
  const consecutive = rows.every((row, position) => row.ref.trim() === String(position + 1));
  const kept = rows.filter((_, position) => position !== index);
  return consecutive ? kept.map((row, position) => ({ ...row, ref: String(position + 1) })) : kept;
}

/**
 * The draft with a row taken out put back in its place, when something was
 * changed after it went: a construction enters the calculation again, and
 * installations numbered 1, 2, 3… are numbered again.
 */
function withRowBack(current: Draft, list: "constructions" | "installations" | "indirects", index: number, before: Draft): Draft {
  const row = before[list][index];
  if (!row) return current;
  const rows = [...current[list].slice(0, index), row, ...current[list].slice(index)];
  if (list === "constructions") {
    const ref = (row as Draft["constructions"][number]).ref.trim().toLowerCase();
    const excludedTypes = (current.columns.excludedTypes ?? []).filter((item) => item.trim().toLowerCase() !== ref);
    return { ...current, columns: { ...current.columns, excludedTypes }, constructions: rows as Draft["constructions"] };
  }
  if (list === "installations") {
    const installations = rows as Draft["installations"];
    const consecutive = current.installations.every((item, position) => item.ref.trim() === String(position + 1));
    const taken = new Set(current.installations.map((item) => item.ref.trim().toLowerCase()));
    return {
      ...current,
      installations: consecutive
        ? installations.map((item, position) => ({ ...item, ref: String(position + 1) }))
        : installations.map((item, position) => (position === index && taken.has(item.ref.trim().toLowerCase()) ? { ...item, ref: `${item.ref}-b` } : item)),
    };
  }
  return { ...current, indirects: rows as Draft["indirects"] };
}

/**
 * What can be saved: rows still being written (no reference or description)
 * wait in the draft. The formulas typed in the rows saved go with them.
 */
function payloadOf(draft: Draft): PanelInput {
  const input = inputOf(draft);
  const constructions = keptRows(input.constructions, (row) => Boolean(row.ref.trim()));
  const installations = keptRows(input.installations, (row) => Boolean(row.ref.trim()) && installationHasData(row));
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
const FORMULA_HINT = "Vacío: se calcula con la fórmula del Excel. Escribe un valor para sustituirla; bórralo para volver a la fórmula.";
/** Why a factor with a formula shows a dash: what it still needs. */
const PENDING_FORMULA_HINT = "Se calcula en cuanto el renglón tiene edad, vida útil y Cons. (o su estado de conservación).";

const LAND_REFERENCE_SOURCE = {
  captured: "Lote tipo capturado aquí; bórralo para tomar el del enfoque de mercado.",
  market: "Lote tipo del enfoque de mercado de terrenos (homologación indirecta): el sujeto se homologa contra él con la tabla de factores. Puedes escribir otro.",
  subject: "Sin lote tipo: homologación directa, el factor de superficie vale 1. Escribe un lote tipo para homologar el sujeto contra él.",
} as const;

/** The demerit columns of a table: Cons., Edad, "Otro" as named, the factors added and FRe. */
const demeritLabels = (factors: DemeritColumnsDto) => [
  "Cons.", "Edad", factors.other.trim() || "Otro", ...factors.extra.map((name, index) => name.trim() || `Factor ${index + 1}`), "FRe",
];

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

/** The states of the sheet «ROSS HEIDECKE», each with its calificaciones, in the table's order. */
const CONSERVATION_STATES = [...new Set(CONSERVATION_RATINGS.map((row) => row.state))];

/**
 * Estado de conservación and calificación of a row, as the sheet rates them;
 * "Sin calificar" leaves the Cons. to be typed, as before the ratings.
 */
function ConservationRatingSelect(props: { value: string; label: string; criterion: ConservationCriterionDto; disabled?: boolean; onChange: (value: string) => void }) {
  if (props.criterion.kind !== "ROSS_HEIDECKE") {
    const listed = props.criterion.options.some((option) => option.label === props.value);
    return (
      <select
        aria-label={props.label}
        className="h-6 w-full min-w-0 rounded-md border border-input bg-background px-1 text-[11px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        value={props.value}
        disabled={props.disabled}
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
      className="h-6 w-full min-w-0 rounded-md border border-input bg-background px-1 text-[11px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      value={props.value}
      disabled={props.disabled}
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
  /** Which table it rates, in the costs' configuration. */
  title: string;
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
        <span className="font-medium">{props.title}</span>
        <select
          aria-label={props.title}
          className="h-7 rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
        <p className="rounded-sm border border-highlight/50 bg-highlight/10 px-2 py-1 text-foreground" data-suggested-values>
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

/** Why a reference typed for the installation at `index` cannot be kept: another installation already has it (case and spaces aside). */
export function installationRefProblem(refs: string[], index: number, ref: string): string | null {
  const key = ref.trim().toLowerCase();
  const taken = refs.some((other, position) => position !== index && other.trim().toLowerCase() === key);
  return taken ? `Ya hay una instalación con la referencia «${ref.trim()}». Escribe otra: las referencias no se repiten.` : null;
}

/**
 * The reference of an installation, in its cell: sent when the cell is left
 * (the row of the table is known by it, so it cannot change at every key).
 * Linked with the table of INF. CONSTRUCCIÓN it is written there too; with
 * that table unlinked, this is where it is changed.
 */
function InstallationRefInput(props: { value: string; disabled: boolean; onCommit: (ref: string) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <Input
      aria-label="Referencia"
      className={cell}
      autoComplete="off"
      disabled={props.disabled}
      data-no-fill=""
      value={typed ?? props.value}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={(event) => {
        const ref = typed?.trim();
        setTyped(null);
        if (!ref || ref === props.value) return;
        // The panel saves on every blur with what it held before this one: only the save of the new reference must go,
        // or the old one was saved after it and came back on reloading.
        event.stopPropagation();
        props.onCommit(ref);
      }}
    />
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
  /** «Quitar este enfoque»: the section's «Agregar al informe valuatorio». */
  approach?: ApproachInReport;
}) {
  const { valuationId } = props;
  const [calculation, setCalculation] = useState<CostCalculationDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const readOnly = props.readOnly || Boolean(calculation?.locked);

  // What the server holds, to skip saves that would not change anything.
  const lastSaved = useRef<string | null>(null);
  const enqueueSave = useSerializedSave(async (payload: PanelInput) => {
    if (JSON.stringify(payload) === lastSaved.current) {
      // Back to what the server holds: nothing is left unsaved.
      setSaveError(null);
      return;
    }
    setSaving(true);
    try {
      const next = await api.costs.save(valuationId, payload);
      lastSaved.current = JSON.stringify(savedInputOf(next));
      setSaveError(null);
      // The draft stays as typed; only the saved state moves.
      setCalculation(next);
    } catch (error) {
      const message = saveRefusedMessage(error, "No se pudo guardar el enfoque de costos.");
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  });
  // Undo and redo of the panel (Ctrl+Z, Ctrl+Y), as in the market panel: taking out a row comes back too (video 7.4, 20:27).
  const saveDraft = (next: Draft) => {
    if (!readOnly) void enqueueSave(payloadOf(next));
  };
  const history = useDraftHistory<Draft>({
    apply: (next) => {
      setDraft(next);
      saveDraft(next);
    },
    cellElement: (cell) => document.querySelector<HTMLElement>(`[data-cost-cell="${window.CSS.escape(cell)}"]`),
  });
  const applyServerState = (next: CostCalculationDto) => {
    lastSaved.current = JSON.stringify(savedInputOf(next));
    setCalculation(next);
    setDraft(draftOf(next));
    history.reset();
  };
  const loaded = useEffectEvent((next: CostCalculationDto) => applyServerState(next));
  const report = useEffectEvent((next: CostCalculationDto) => {
    if (!props.readOnly) props.onCalculation(next);
  });

  useEffect(() => {
    let active = true;
    api.costs.get(valuationId)
      .then((next) => { if (active) loaded(next); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "No se pudo cargar el enfoque de costos."); });
    return () => { active = false; };
  }, [valuationId]);

  useEffect(() => {
    if (calculation) report(calculation);
  }, [calculation]);

  const draftRef = useRef<Draft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  });

  // The page of the approach as the capture holds it right now: its tables are where it is captured (one table, 20 nov 2026).
  const derived = useMemo(() => {
    if (!calculation || !draft) return null;
    const input = inputOf(draft);
    const live = compute(calculation, input);
    return { input, live };
  }, [calculation, draft]);
  // Built a moment after each key, not within it: typing stays as quick as before.
  const pagesDraft = useDeferredValue(draft);
  const capturePages = useMemo<CapturePages | null>(() => {
    if (!calculation || !pagesDraft) return null;
    const input = inputOf(pagesDraft);
    const live = compute(calculation, input);
    const captured = { ...calculation, ...input, constructions: input.constructions.map((row) => withConstructionType(row, calculation.types)) };
    return { blocks: costDocumentBlocks(captured, live.result, live.trace, { capture: true }), placeholderIds: COST_TEMPLATE_BLOCK_IDS };
  }, [calculation, pagesDraft]);
  usePublishCapturePages(capturePages);

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!calculation || !draft || !derived) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando el enfoque de costos…
      </div>
    );
  }

  const { input, live } = derived;
  const installationKey = (ref: string) => `costos.instalaciones.${ref}`;
  const step = (key: string) => live.trace?.find(key);
  /** What the formula gives, for the placeholder of a factor the appraiser may type over. */
  const formulaValue = (key: string) => {
    const found = step(key);
    if (!found) return undefined;
    return typeof found.inputs.formula === "number" ? found.inputs.formula : found.value;
  };
  const config = costEngineConfig({ ...input, precision: calculation.precision });
  const marketValue = calculation.market.adoptedUnitValue;
  const reference = landReferenceArea({ land: input.land, market: calculation.market });
  const pickedRefs = new Set(draft.constructions.map((row) => row.ref.trim().toLowerCase()));
  const unpickedTypes = calculation.types.filter((type) => !pickedRefs.has(type.ref.trim().toLowerCase()));
  const addConstructionReason = addConstructionDisabledReason(calculation.types.length, unpickedTypes.length);

  const save = (next = draft) => saveDraft(next);
  // Each change is one step of «Deshacer»; typing in one field is one step, as in the document.
  const record = (cell: string | null) => history.record(draft, cell);
  // A select has no blur to wait for: it saves as soon as it changes.
  const change = (patch: Partial<Pick<Draft, "rounding">> & { surfacePower?: number }) => {
    const land = patch.surfacePower === undefined ? draft.land : { ...draft.land, surfacePower: String(patch.surfacePower) };
    const next = { ...draft, land, rounding: patch.rounding ?? draft.rounding };
    record(null);
    setDraft(next);
    save(next);
  };

  const setLand = (key: keyof Omit<Draft["land"], "factors">) => (event: { target: { value: string } }) => {
    record(`land.${key}`);
    setDraft((current) => current && { ...current, land: { ...current.land, [key]: event.target.value } });
  };
  const setFactor = (key: LandFactorKey) => (event: { target: { value: string } }) => {
    record(`land.factors.${key}`);
    setDraft((current) => current && { ...current, land: { ...current.land, factors: { ...current.land.factors, [key]: event.target.value } } });
  };
  function setRow<K extends "constructions" | "installations" | "indirects">(list: K, index: number, key: string, next: string) {
    record(`${list}.${index}.${key}`);
    setDraft((current) => current && {
      ...current,
      [list]: current[list].map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: next } : row)),
    });
  }
  /**
   * A removal has no blur to wait for: it saves at once, and «Deshacer» (or
   * Ctrl+Z) brings the row back (video 7.4, 20:27). A construction removed
   * here stays described in its section; the installations numbered 1, 2,
   * 3… are numbered again, here and in the table of the construction section.
   */
  function removeRow(list: "constructions" | "installations" | "indirects", index: number) {
    if (!draft) return;
    const before = draft;
    // A type taken out stays out: the others of the construction section keep entering on their own.
    const removedRef = list === "constructions" ? draft.constructions[index]?.ref.trim() : "";
    const columns = removedRef
      ? { ...draft.columns, excludedTypes: [...new Set([...(draft.columns.excludedTypes ?? []), removedRef])] }
      : draft.columns;
    const rows = list === "installations" ? withoutInstallation(draft.installations, index) : draft[list].filter((_, rowIndex) => rowIndex !== index);
    const next = { ...draft, columns, [list]: rows };
    record(null);
    setDraft(next);
    save(next);
    const removed = before[list][index];
    const name = list === "constructions"
      ? `Se quitó ${removedRef || "la construcción"} del cálculo`
      : list === "installations" ? `Se quitó la instalación ${(removed as Draft["installations"][number] | undefined)?.ref ?? ""}`.trim() : "Se quitó el indirecto";
    toast.success(name, {
      description: "Ctrl+Z también lo deshace.",
      action: {
        label: "Deshacer",
        onClick: () => {
          const current = draftRef.current;
          if (!current) return;
          // Nothing changed since: the step back. Otherwise the row goes back to its place in what there is now.
          if (current === next) {
            history.undo(current);
            return;
          }
          const restored = withRowBack(current, list, index, before);
          history.record(current, null);
          setDraft(restored);
          saveDraft(restored);
        },
      },
    });
  }
  // The calificación is a select too: it saves at once and gives the Cons. Picking one replaces a Cons.
  // typed before (it used to win over the calificación, so changing the calificación changed nothing).
  // With another criterion the state picked writes its factor in Cons., which stays editable.
  const pickRating = (list: "constructions" | "installations", index: number, rating: string) => {
    const criterion = conservationCriterionOfColumns(draft.columns[list]);
    const ross = criterion.kind === "ROSS_HEIDECKE";
    const factor = ross ? null : conservationOfState(criterion, rating);
    record(null);
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
    record(commit ? null : `criterio.${list}`);
    const next = { ...draft, columns: { ...draft.columns, [list]: { ...draft.columns[list], conservation: criterion } } };
    setDraft(next);
    if (commit) save(next);
  };
  // The names of the demerit columns are typed (saved when the field is left); adding or removing a factor saves at once.
  const renameDemerit = (list: "constructions" | "installations", factors: DemeritColumnsDto) => {
    record(`columnas.${list}`);
    setDraft((current) => current && { ...current, columns: { ...current.columns, [list]: factors } });
  };
  const addDemerit = (list: "constructions" | "installations") => {
    const factors = draft.columns[list];
    if (factors.extra.length >= MAX_EXTRA_DEMERIT_FACTORS) return;
    record(null);
    const next = { ...draft, columns: { ...draft.columns, [list]: { ...factors, extra: [...factors.extra, ""] } } };
    setDraft(next);
    save(next);
  };
  const removeDemerit = (list: "constructions" | "installations", index: number) => {
    const factors = draft.columns[list];
    record(null);
    const next = {
      ...draft,
      columns: { ...draft.columns, [list]: { ...factors, extra: factors.extra.filter((_, position) => position !== index) } },
      [list]: draft[list].map((row) => ({ ...row, extraFactors: row.extraFactors.filter((_, position) => position !== index) })),
    };
    setDraft(next);
    save(next);
  };
  const setExtraFactor = (list: "constructions" | "installations", index: number, position: number, text: string) => {
    record(`${list}.${index}.extraFactors.${position}`);
    setDraft((current) => current && {
      ...current,
      [list]: current[list].map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const extraFactors = Array.from({ length: Math.max(row.extraFactors.length, position + 1) }, (_, item) => row.extraFactors[item] ?? "");
        extraFactors[position] = text;
        return { ...row, extraFactors };
      }),
    });
  };
  /**
   * The name of an installation in the cost approach (video 7.4, 28:00):
   * linked, its description in the construction section; unlinked, a name
   * of its own (a short one for the cost tables) that is not written there.
   */
  const toggleNameLink = (index: number) => {
    const row = draft.installations[index];
    if (!row) return;
    const linked = typeof row.costName !== "string";
    const next = {
      ...draft,
      installations: draft.installations.map((item, position) => {
        if (position !== index) return item;
        if (linked) return { ...item, costName: item.description };
        const { costName: _own, ...rest } = item;
        return rest;
      }),
    };
    record(null);
    setDraft(next);
    save(next);
  };
  // The type is a select: picking one saves at once.
  const pickConstruction = (index: number, ref: string) => {
    record(null);
    const next = { ...draft, constructions: draft.constructions.map((row, rowIndex) => (rowIndex === index ? { ...row, ref } : row)) };
    setDraft(next);
    save(next);
  };
  const addRow = (list: "constructions" | "installations" | "indirects") => {
    record(null);
    insertRow(list);
  };
  const insertRow = (list: "constructions" | "installations" | "indirects") => setDraft((current) => {
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
    // The next free number: with 1 and 3 left, a new one is 4, not a second 3 the save refuses (and the row was lost on reloading).
    if (list === "installations") {
      const ref = nextCaptureRef("installations", current.installations.map((row) => row.ref));
      return { ...current, installations: [...current.installations, { ...percentRow(emptyInstallation(current.installations.length)), ref }] };
    }
    return { ...current, indirects: [...current.indirects, { concept: "", percentage: "", base: "" }] };
  });

  /** `grouping`: amounts and areas show their thousands separator; factors, ages and percentages do not. */
  const textInput = (
    list: "constructions" | "installations" | "indirects", index: number, key: string, current: string, label: string, numeric = true, placeholder?: string, grouping = false, title?: string,
  ) => {
    const Control = numeric ? FormulaInput : Input;
    return (
      <Control
        {...(numeric && grouping ? { grouping: true } : {})}
        aria-label={label}
        className={cell}
        disabled={readOnly}
        value={current}
        placeholder={placeholder}
        // The browser's own suggestions (1.1, 100…) covered the cells (video 7.4, 26:45).
        autoComplete="off"
        data-cost-cell={`${list}.${index}.${key}`}
        title={title ?? (placeholder === undefined ? undefined : `${label}. ${FORMULA_HINT}`)}
        // The age factor, the base of an indirect and a conservation from its rating are calculated while empty.
        data-no-fill={key === "ageFactor" || key === "base" || (key === "conservation" && placeholder !== undefined) ? "computed" : undefined}
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
        disabled={readOnly}
        value={current}
        placeholder="100"
        autoComplete="off"
        data-cost-cell={`${list}.${index}.${key}`}
        onChange={(event) => setRow(list, index, key, event.target.value)}
      />
      <span className="text-muted-foreground">%</span>
    </div>
  );
  // Placeholder of a factor with a formula: the formula's result with the valuation's decimals, shown while the field is empty;
  // a dash while the row lacks what the formula needs (it used to say «Fórmula», video 7.4, 24:10).
  const decimals = factorDecimals(calculation.precision);
  const hint = (formula: number | null | undefined) => (formula === undefined || formula === null
    ? "—"
    : formula.toLocaleString("es-MX", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  const hintTitle = (label: string, formula: number | null | undefined) =>
    `${label}. ${formula === undefined || formula === null ? PENDING_FORMULA_HINT : FORMULA_HINT}`;
  /**
   * The demerit factors of a row: Cons. typed or, empty, the one of the
   * calificación; Edad and FRe by formula unless typed; Otro typed (1 when empty).
   */
  const demeritCells = (
    list: "constructions" | "installations",
    index: number,
    row: { conservation: string; conservationRating: string; ageFactor: string; otherFactor: string; extraFactors: string[]; resultantFactor: string; completion: string; undivided: string },
    key: string,
    age: number | null,
    usefulLife: number | null,
    cellAt: (column: string) => CaptureAddress,
    columns: { conservation: string; ageFactor: string; otherFactor: string; extraFactors: string[]; resultantFactor: string; completion: string; undivided: string },
  ) => {
    const criterion = conservationCriterionOfColumns(draft.columns[list]);
    const ross = criterion.kind === "ROSS_HEIDECKE";
    const fromRating = ross ? conservationOfRating(parseDecimal(row.conservationRating)) : null;
    const state = (row as { conservationState?: string | null }).conservationState ?? "";
    // Edad and FRe as the calculation gives them; a row without its value (or not complete) gets them too.
    const extras = draft.columns[list].extra.map((_, position) => parseDecimal(row.extraFactors[position] ?? "") ?? 1);
    const base = {
      ref: key, age, usefulLife, conservation: parseDecimal(row.conservation) ?? fromRating,
      otherFactor: parseDecimal(row.otherFactor) ?? 1, ...(extras.length ? { extraFactors: extras } : {}),
    };
    const typedAge = parseDecimal(row.ageFactor);
    const ageFormula = formulaValue(`${key}.factorEdad`) ?? demeritPreview(base, config).ageFactor;
    const resultantFormula = formulaValue(`${key}.factorResultante`)
      ?? demeritPreview({ ...base, ...(typedAge === null ? {} : { ageFactor: typedAge }) }, config).resultantFactor;
    const ageLabel = "Factor de edad = 1 − (edad / vida útil)^1.4";
    return (
      <>
        {/* Cons.: the factor, and beside it the state of conservation that proposes it (not a column of the dictamen). */}
        <CaptureSlot at={cellAt(columns.conservation)}>
          <span className="grid w-full min-w-24 gap-0.5 py-0.5">
            {textInput(list, index, "conservation", row.conservation, "Factor de conservación (Cons.)", true, fromRating === null ? undefined : figure(fromRating, 3))}
            <ConservationRatingSelect
              value={ross ? row.conservationRating : state}
              criterion={criterion}
              disabled={readOnly}
              label={ross ? "Estado de conservación y calificación" : `Estado de conservación (${criterion.name.trim() || CONSERVATION_CRITERION_LABELS[criterion.kind]})`}
              onChange={(rating) => pickRating(list, index, rating)}
            />
          </span>
        </CaptureSlot>
        <CaptureSlot at={cellAt(columns.ageFactor)}>{textInput(list, index, "ageFactor", row.ageFactor, ageLabel, true, hint(ageFormula), false, hintTitle(ageLabel, ageFormula))}</CaptureSlot>
        <CaptureSlot at={cellAt(columns.otherFactor)}>{textInput(list, index, "otherFactor", row.otherFactor, draft.columns[list].other, true, "1")}</CaptureSlot>
        {draft.columns[list].extra.map((name, position) => (columns.extraFactors[position] ? (
          <CaptureSlot key={position} at={cellAt(columns.extraFactors[position])}>
            <FormulaInput
              aria-label={name.trim() || `Factor ${position + 1}`}
              className={cell}
              disabled={readOnly}
              value={row.extraFactors[position] ?? ""}
              placeholder="1"
              autoComplete="off"
              data-cost-cell={`${list}.${index}.extraFactors.${position}`}
              onChange={(event) => setExtraFactor(list, index, position, event.target.value)}
            />
          </CaptureSlot>
        ) : null))}
        <CaptureSlot at={cellAt(columns.resultantFactor)}>
          <FormulaInput
            aria-label="Factor resultante FRe = Cons. × Edad × Otro"
            data-no-fill="computed"
            className={resultCell}
            disabled={readOnly}
            value={row.resultantFactor}
            placeholder={hint(resultantFormula)}
            autoComplete="off"
            data-cost-cell={`${list}.${index}.resultantFactor`}
            title={hintTitle(`Factor resultante FRe = ${demeritLabels(draft.columns[list]).slice(0, -1).join(" × ")}`, resultantFormula)}
            onChange={(event) => setRow(list, index, "resultantFactor", event.target.value)}
          />
        </CaptureSlot>
        <CaptureSlot at={cellAt(columns.completion)}>{percentInput(list, index, "completion", row.completion, "Grado de terminación")}</CaptureSlot>
        <CaptureSlot at={cellAt(columns.undivided)}>{percentInput(list, index, "undivided", row.undivided, "Indiviso")}</CaptureSlot>
      </>
    );
  };
  // Where each datum sits in the tables of the page (cost-document.ts): it is typed there, not in a table of the panel.
  const at = costCaptureColumns(draft.columns);
  const constructionKeys = draft.constructions.map((row) => row.ref);
  const installationKeys = draft.installations.map((row) => row.ref);
  const constructionRowIds = at.constructions.rows(constructionKeys);
  const constructionValueRowIds = at.constructionValues.rows(constructionKeys);
  const installationRowIds = at.installations.rows(installationKeys);
  const installationValueRowIds = at.installationValues.rows(installationKeys);
  const indirectRowIds = at.indirects.rows(draft.indirects.length);
  const indirectPlaces = costIndirectOrder(input.indirects);
  const landCell = (column: string) => ({ table: at.land.table, row: at.land.row, column });
  const surfaceFormula = step("costos.terreno.factorSuperficie")?.formula;
  const addRowButton = (list: "constructions" | "installations" | "indirects", label: string, reason: string | null = null) => (
    <span title={reason ?? undefined} className="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" className="w-fit" disabled={readOnly || reason !== null} onClick={() => addRow(list)}>
        <Plus data-icon="inline-start" /> {label}
      </Button>
    </span>
  );

  return (
    <section
      className="grid gap-3"
      aria-labelledby="cost-calculation-title"
      onBlur={() => save()}
      onKeyDown={(event) => history.onKeyDown(event, draft)}
      data-calculation-strip="costos"
    >
      {/* What configures the calculation and is not a table of the dictamen (video 7.4, 18:49): everything else is captured in the tables of its block. */}
      <EditorConfigPanel
        title="Configuración del cálculo de costos"
        description="Los datos del enfoque se capturan abajo, en las tablas de su bloque: las celdas en blanco son tuyas y las grises las calcula el sistema. Aquí queda solo lo que no es una tabla del dictamen."
      >
        <SaveRefusedNotice message={saveError} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="cost-calculation-title" className="flex items-center gap-2 text-sm font-semibold">
            <Calculator className="size-4" /> Cálculo del enfoque de costos
          </h3>
          <div className="flex items-center gap-2">
            {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
            {!readOnly ? (
              <span className="inline-flex items-center gap-1" role="group" aria-label="Deshacer y rehacer del cálculo">
                <Button type="button" size="sm" variant="ghost" disabled={!history.canUndo} title="Deshacer el último cambio del cálculo (Ctrl+Z)" onClick={() => history.undo(draft)}>
                  <Undo2 data-icon="inline-start" /> Deshacer
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={!history.canRedo} title="Rehacer (Ctrl+Y)" onClick={() => history.redo(draft)}>
                  <Redo2 data-icon="inline-start" /> Rehacer
                </Button>
              </span>
            ) : null}
            {props.approach ? <ApproachRemoval name="costos" approach={props.approach} readOnly={readOnly} /> : null}
          </div>
        </div>
        {props.approach && !props.approach.included ? <ApproachLeftOutNotice name="costos" /> : null}
        {calculation.locked ? <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p> : null}
        <fieldset disabled={readOnly} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field>
              {/* Without a lote tipo the homologation is against the subject, and the field says so with its measure. */}
              <FieldLabel htmlFor="cost-land-reference" className="text-xs">A) Terreno: {reference.source === "subject" ? "Lote Sujeto (m²)" : "Lote Tipo (m²)"}</FieldLabel>
              <FormulaInput
                id="cost-land-reference" autoComplete="off"
                grouping
                value={draft.land.referenceArea}
                placeholder={calculation.market.baseArea !== null ? `De mercado: ${calculation.market.baseArea}` : reference.area ? `Sujeto: ${reference.area}` : "Igual al sujeto"}
                onChange={setLand("referenceArea")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-land-power" className="text-xs">A) Terreno: potencia n</FieldLabel>
              <SurfacePowerSelect id="cost-land-power" value={input.land.surfacePower} onChange={(surfacePower) => change({ surfacePower })} />
            </Field>
            {ROUNDING_FIELDS.map((field) => (
              <Field key={field.key}>
                <FieldLabel htmlFor={`cost-rounding-${field.key}`} className="text-xs">Redondeo: {field.label.toLowerCase()}</FieldLabel>
                <RoundingSelect
                  id={`cost-rounding-${field.key}`}
                  label={`Redondeo de ${field.label.toLowerCase()}`}
                  value={draft.rounding[field.key]}
                  onChange={(digits) => change({ rounding: { ...draft.rounding, [field.key]: digits } })}
                />
              </Field>
            ))}
          </div>
          <p className="text-xs text-muted-foreground" data-testid="cost-land-reference-source">
            {reference.source === "subject" ? LAND_REFERENCE_SOURCE.subject : `${LAND_REFERENCE_SOURCE[reference.source]} Lote tipo: ${figure(reference.area)} m².`}
            {" "}Sup. = {surfaceFormula && surfaceFormula !== "capturado por el valuador" ? surfaceFormula : "(lote tipo / superficie del sujeto)^(1/n)"}; FRe = Neg. × Ubic. × Sup. × Serv. × Clas. × Top.
            {!draft.land.unitValue && !marketValue ? " El valor unitario sale del enfoque de mercado de terrenos; captúralo ahí o escríbelo en su celda." : ""}
          </p>
          <div className="grid gap-2 lg:grid-cols-2">
            <div className="grid content-start gap-2">
              <ConservationCriterionEditor
                id="cost-constructions"
                title="B) Construcciones: criterio de conservación"
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
            </div>
            <div className="grid content-start gap-2">
              <ConservationCriterionEditor
                id="cost-installations"
                title="C) Instalaciones: criterio de conservación"
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
            </div>
          </div>
        </fieldset>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">Cómo se llenan las tablas</summary>
          <p className="mt-1">
            Los factores con fórmula en el Excel (Sup. y FRe del terreno; Edad y FRe de construcciones e instalaciones) se calculan solos mientras su celda está vacía; el número gris es el resultado de la fórmula. Escribe un valor para sustituirla y bórralo para volver a la fórmula. El factor de conservación (Cons.) sale del estado de conservación y su calificación mientras no escribas otro.
          </p>
          <p className="mt-1">
            B) Cada tipo escrito en la tabla de tipos de construcción de la sección INF. CONSTRUCCIÓN entra solo, con su referencia, descripción, superficie, edad y vida útil: aquí capturas sus columnas de costo. Quitar un renglón lo saca del cálculo y del enfoque impreso; el tipo sigue en esa tabla y vuelve con «+ Construcción».
          </p>
          <p className="mt-1" data-testid="cost-installations-legend">
            C) P/C: P = Privativa, C = Común. Las sumas privativa y común son informativas; el subtotal incluye las dos. Las instalaciones están vinculadas con su tabla de la sección INF. CONSTRUCCIÓN: lo que agregues o cambies allá (descripción, unidad, cantidad, edad, vida útil) llega aquí, y lo de aquí se escribe allá. Con la cadena de cada renglón desvinculas solo el nombre, para escribir aquí uno más breve.
          </p>
          <p className="mt-1">D) Costos indirectos, solo si el avalúo los lleva: concepto, porcentaje (0.05 = 5 %) y base. Con la base vacía se calculan sobre el valor de construcciones e instalaciones.</p>
        </details>
        {unpickedTypes.length ? (
          <p className="text-xs text-muted-foreground" data-testid="cost-unpicked-types">
            Fuera del cálculo (solo descritos en la sección de construcciones): {unpickedTypes.map((type) => type.ref).join(", ")}.
          </p>
        ) : null}
        {!calculation.types.length ? (
          <p className="text-xs text-muted-foreground">Aún no hay tipos de construcción: escríbelos en la tabla de tipos de la sección INF. CONSTRUCCIÓN.</p>
        ) : null}
        {addConstructionReason && calculation.types.length ? (
          <p className="text-xs text-muted-foreground" data-testid="cost-add-construction-reason">{addConstructionReason}</p>
        ) : null}
        {/* Adding a row goes under its table; while the page has no such table yet, here. */}
        <div className="flex flex-wrap items-center gap-2 empty:hidden" data-testid="cost-add-rows">
          <CaptureSlot at={{ table: at.constructions.table, part: "footer" }} fallback>
            {addRowButton("constructions", "Construcción", addConstructionReason)}
          </CaptureSlot>
          <CaptureSlot at={{ table: at.installations.table, part: "footer" }} fallback>
            {addRowButton("installations", "Instalación")}
          </CaptureSlot>
          <CaptureSlot at={{ table: at.indirects.table, part: "footer" }} fallback>
            {addRowButton("indirects", "Indirecto")}
          </CaptureSlot>
        </div>
        {!live.result && live.reason ? <p className="text-sm text-muted-foreground">{live.reason}</p> : null}
        {live.result && landUnitValue({ land: input.land, market: calculation.market }) === null ? (
          <p className="text-xs text-muted-foreground">Sin valor unitario del terreno: el valor físico no incluye el terreno.</p>
        ) : null}
        <CalculationPrecisionSummary precision={calculation.precision} />
      </EditorConfigPanel>

      {/* A) Terreno: its row of the table of the page. */}
      <CaptureSlot at={landCell(at.land.subjectArea)}>
        <FormulaInput
          id="cost-land-area" autoComplete="off"
          grouping
          aria-label="Superficie de Sujeto (m²)"
          data-no-fill={calculation.market.subjectArea ? "computed" : undefined}
          data-cost-cell="land.subjectArea"
          className={cell}
          disabled={readOnly}
          value={draft.land.subjectArea}
          placeholder={calculation.market.subjectArea ? `De mercado: ${calculation.market.subjectArea}` : undefined}
          onChange={setLand("subjectArea")}
        />
      </CaptureSlot>
      <CaptureSlot at={landCell(at.land.unitValue)}>
        <FormulaInput
          id="cost-land-value" autoComplete="off"
          grouping
          aria-label="Valor comparativo de Mercado ($/m²)"
          data-no-fill={marketValue ? "computed" : undefined}
          data-cost-cell="land.unitValue"
          className={cell}
          disabled={readOnly}
          value={draft.land.unitValue}
          placeholder={marketValue ? `De mercado: ${marketValue}` : "Del mercado de terrenos"}
          title="Vacío: el valor unitario adoptado en el enfoque de mercado de terrenos. Escribe otro para sustituirlo."
          onChange={setLand("unitValue")}
        />
      </CaptureSlot>
      {LAND_FACTORS.map((factor) => (
        <CaptureSlot key={factor.key} at={landCell(at.land.factors[factor.key])}>
          {factor.key === "surface" ? (
            <FormulaInput
              id="cost-factor-surface" autoComplete="off"
              aria-label="Factor de superficie (Sup.)"
              data-no-fill="computed"
              data-cost-cell="land.surfaceFactor"
              className={cell}
              disabled={readOnly}
              value={draft.land.surfaceFactor}
              placeholder={hint(formulaValue("costos.terreno.factorSuperficie"))}
              title={`Sup. = ${surfaceFormula ?? "(lote tipo / superficie del sujeto)^(1/n)"}. ${FORMULA_HINT}`}
              onChange={setLand("surfaceFactor")}
            />
          ) : (
            <FormulaInput
              id={`cost-factor-${factor.key}`} autoComplete="off" aria-label={factor.label} className={cell} disabled={readOnly}
              data-cost-cell={`land.factors.${factor.key}`}
              value={draft.land.factors[factor.key]} onChange={setFactor(factor.key)}
            />
          )}
        </CaptureSlot>
      ))}
      <CaptureSlot at={landCell(at.land.resultantFactor)}>
        <FormulaInput
          id="cost-factor-resultant" autoComplete="off"
          aria-label="Factor resultante del terreno (FRe)"
          data-no-fill="computed"
          data-cost-cell="land.resultantFactor"
          className={resultCell}
          disabled={readOnly}
          value={draft.land.resultantFactor}
          placeholder={hint(formulaValue("costos.terreno.factorResultante"))}
          title={`FRe = Neg. × Ubic. × Sup. × Serv. × Clas. × Top. ${FORMULA_HINT}`}
          onChange={setLand("resultantFactor")}
        />
      </CaptureSlot>

      {/* B) Construcciones: the cost columns of each type, in its rows of the two tables. */}
      {draft.constructions.map((row, index) => {
        const type = findConstructionType(calculation.types, row.ref);
        const rowId = constructionRowIds[index];
        const cellAt = (column: string) => ({ table: at.constructions.table, row: rowId, column });
        return (
          <Fragment key={index}>
            <CaptureSlot at={cellAt(at.constructions.ref)}>
              <select
                aria-label="Tipo de construcción"
                className="h-7 w-full min-w-16 rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={type ? type.ref : row.ref}
                disabled={readOnly}
                data-no-fill=""
                onChange={(event) => pickConstruction(index, event.target.value)}
              >
                {type ? null : <option value={row.ref}>{row.ref || "—"}</option>}
                {calculation.types.map((option) => <option key={option.ref} value={option.ref}>{option.ref}</option>)}
              </select>
            </CaptureSlot>
            {demeritCells("constructions", index, row, `costos.construcciones.${row.ref}`, type?.age ?? null, type?.usefulLife ?? null, cellAt, at.constructions)}
            <CaptureSlot at={{ table: at.constructionValues.table, row: constructionValueRowIds[index], column: at.constructionValues.unitReplacementCost }}>
              {textInput("constructions", index, "unitReplacementCost", row.unitReplacementCost, "VRN unitario ($/m²)", true, undefined, true)}
            </CaptureSlot>
            {!readOnly ? (
              <CaptureSlot at={{ table: at.constructions.table, row: rowId }}>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${row.ref} del cálculo`} title={`Quitar ${row.ref} del cálculo (el tipo sigue en INF. CONSTRUCCIÓN)`} onClick={() => removeRow("constructions", index)}><Trash2 /></Button>
              </CaptureSlot>
            ) : null}
          </Fragment>
        );
      })}

      {/* C) Instalaciones especiales: each one in its rows of the two tables. */}
      {draft.installations.map((row, index) => {
        const numbers = input.installations[index];
        const rowId = installationRowIds[index];
        const cellAt = (column: string) => ({ table: at.installations.table, row: rowId, column });
        const ownName = typeof row.costName === "string";
        return (
          <Fragment key={index}>
            <CaptureSlot at={cellAt(at.installations.share)}>
              <select
                aria-label="P/C (P = Privativa, C = Común)"
                title="P = Privativa, C = Común"
                className="h-7 w-full min-w-12 rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={row.share}
                disabled={readOnly}
                onChange={(event) => setRow("installations", index, "share", event.target.value)}
              >
                <option value="P">P</option>
                <option value="C">C</option>
              </select>
            </CaptureSlot>
            <CaptureSlot at={cellAt(at.installations.ref)}>
              <InstallationRefInput
                value={row.ref}
                disabled={readOnly}
                onCommit={(ref) => {
                  // A repeated reference makes the server refuse the whole capture: said here, and the cell keeps the one it had.
                  const problem = installationRefProblem(draft.installations.map((item) => item.ref), index, ref);
                  if (problem) {
                    toast.error(problem);
                    return;
                  }
                  record(null);
                  const next = { ...draft, installations: draft.installations.map((item, position) => (position === index ? { ...item, ref } : item)) };
                  setDraft(next);
                  save(next);
                }}
              />
            </CaptureSlot>
            <CaptureSlot at={cellAt(at.installations.description)}>
              {ownName
                ? textInput("installations", index, "costName", row.costName ?? "", "Nombre en Costos (desvinculado de la descripción de INF. CONSTRUCCIÓN)", false, row.description, false, `Nombre propio de Costos. La descripción de INF. CONSTRUCCIÓN sigue siendo «${row.description}».`)
                : textInput("installations", index, "description", row.description, "Descripción", false)}
            </CaptureSlot>
            <CaptureSlot at={cellAt(at.installations.unit)}>{textInput("installations", index, "unit", row.unit, "Unidad", false)}</CaptureSlot>
            <CaptureSlot at={cellAt(at.installations.quantity)}>{textInput("installations", index, "quantity", row.quantity, "Cantidad", true, undefined, true)}</CaptureSlot>
            <CaptureSlot at={cellAt(at.installations.age)}>{textInput("installations", index, "age", row.age, "Edad")}</CaptureSlot>
            <CaptureSlot at={cellAt(at.installations.usefulLife)}>{textInput("installations", index, "usefulLife", row.usefulLife, "Vida útil")}</CaptureSlot>
            {demeritCells("installations", index, row, installationKey(row.ref), numbers.age, numbers.usefulLife, cellAt, at.installations)}
            <CaptureSlot at={{ table: at.installationValues.table, row: installationValueRowIds[index], column: at.installationValues.unitReplacementCost }}>
              {textInput("installations", index, "unitReplacementCost", row.unitReplacementCost, "VRN unitario", true, undefined, true)}
            </CaptureSlot>
            {!readOnly ? (
              <CaptureSlot at={{ table: at.installations.table, row: rowId }}>
                <span className="flex items-center">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-pressed={ownName}
                    aria-label={ownName ? `Vincular el nombre de la instalación ${row.ref}` : `Desvincular el nombre de la instalación ${row.ref}`}
                    title={ownName
                      ? "Nombre propio de Costos. Vincúlalo para volver a la descripción de INF. CONSTRUCCIÓN."
                      : "Nombre vinculado con la descripción de INF. CONSTRUCCIÓN. Desvincúlalo para escribir aquí uno más breve; edad, vida útil y cantidad siguen vinculadas."}
                    onClick={() => toggleNameLink(index)}
                  >
                    {ownName ? <Link2Off /> : <Link2 />}
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar la instalación ${row.ref}`} onClick={() => removeRow("installations", index)}><Trash2 /></Button>
                </span>
              </CaptureSlot>
            ) : null}
          </Fragment>
        );
      })}

      {/* D) Costos indirectos: each one in its row of the table. */}
      {draft.indirects.map((row, index) => {
        const rowId = indirectRowIds[indirectPlaces.indexOf(index)];
        if (!rowId) return null;
        const cellAt = (column: string) => ({ table: at.indirects.table, row: rowId, column });
        return (
          <Fragment key={index}>
            <CaptureSlot at={cellAt(at.indirects.concept)}>{textInput("indirects", index, "concept", row.concept, "Concepto", false)}</CaptureSlot>
            <CaptureSlot at={cellAt(at.indirects.percentage)}>{textInput("indirects", index, "percentage", row.percentage, "Porcentaje (0.05 = 5 %)")}</CaptureSlot>
            <CaptureSlot at={cellAt(at.indirects.base)}>{textInput("indirects", index, "base", row.base, "Base ($); vacía: construcciones e instalaciones", true, "Construcciones e instalaciones", true)}</CaptureSlot>
            {!readOnly ? (
              <CaptureSlot at={{ table: at.indirects.table, row: rowId }}>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Quitar el indirecto" onClick={() => removeRow("indirects", index)}><Trash2 /></Button>
              </CaptureSlot>
            ) : null}
          </Fragment>
        );
      })}
    </section>
  );
}
