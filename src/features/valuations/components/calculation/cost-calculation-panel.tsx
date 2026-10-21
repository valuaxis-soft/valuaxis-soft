"use client";

import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, SessionExpiredError } from "@/lib/api-client";
import {
  CONSERVATION_RATINGS,
  DEFAULT_COST_ROUNDING,
  LAND_FACTORS,
  LAND_FACTOR_SHORT_LABELS,
  constructionCostOf,
  conservationOfRating,
  costEngineConfig,
  emptyConstructionCost,
  emptyInstallation,
  findConstructionType,
  landReferenceArea,
  landUnitValue,
  remainingUsefulLife,
  toCostEngineInput,
  withConstructionType,
  type ConstructionCostDto,
  type CostCalculationDto,
  type CostLandDto,
  type CostRoundingDto,
  type IndirectDto,
  type InstallationDto,
  type LandFactorKey,
} from "@/features/valuations/calculation/cost-types";
import { computeCostApproach } from "@/features/valuations/engine/costs";
import { ageFactor } from "@/features/valuations/engine/factors";
import { Trace } from "@/features/valuations/engine/trace";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { RoundingSelect, SurfacePowerSelect } from "./calculation-controls";
import { numbersOf, textsOf, type Texts } from "./draft-texts";
import { useSerializedSave } from "./use-serialized-save";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/** Completion and undivided share are fractions (1 = 100 %) edited as percentages. */
type PercentRow<T> = Omit<Texts<T>, "completion" | "undivided"> & { completion: string; undivided: string };

type Draft = {
  land: Omit<Texts<CostLandDto>, "factors"> & { factors: Record<LandFactorKey, string> };
  constructions: PercentRow<ConstructionCostDto>[];
  installations: PercentRow<InstallationDto>[];
  indirects: Texts<IndirectDto>[];
  rounding: CostRoundingDto;
};

/** What the panel edits: every column of the capture, factors with a formula empty (null) when they take it. */
type PanelInput = {
  land: CostLandDto;
  constructions: ConstructionCostDto[];
  installations: InstallationDto[];
  indirects: IndirectDto[];
  rounding: CostRoundingDto;
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

function percentRow<T extends { completion: number; undivided: number }>(row: T): PercentRow<T> {
  return { ...textsOf(row), completion: percentText(row.completion), undivided: percentText(row.undivided) } as PercentRow<T>;
}

function fractionRow<T extends { completion: number; undivided: number }>(row: PercentRow<T>, template: T): T {
  return { ...numbersOf(row as Texts<T>, template), completion: fractionOf(row.completion), undivided: fractionOf(row.undivided) };
}

function draftOf(input: CostCalculationDto): Draft {
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
    constructions: input.constructions.map((row) => percentRow(constructionCostOf(row))),
    installations: input.installations.map(percentRow),
    indirects: input.indirects.map(textsOf),
    rounding: input.rounding ?? DEFAULT_COST_ROUNDING,
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
  };
}

/** What can be saved: rows still being written (no reference or description) wait in the draft. */
function payloadOf(input: PanelInput): PanelInput {
  return {
    land: input.land,
    constructions: input.constructions.filter((row) => row.ref.trim()),
    installations: input.installations.filter((row) => row.ref.trim() && row.description.trim()),
    indirects: input.indirects.filter((row) => row.concept.trim()),
    rounding: input.rounding,
  };
}

const savedInputOf = (calculation: CostCalculationDto): PanelInput => ({
  land: calculation.land,
  constructions: calculation.constructions.map(constructionCostOf),
  installations: calculation.installations,
  indirects: calculation.indirects,
  rounding: calculation.rounding ?? DEFAULT_COST_ROUNDING,
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
const figure = (value: number | null | undefined, digits = 2) =>
  (value === null || value === undefined ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits: digits }));
const head = "px-1.5 py-1 text-center font-medium";
const readOnlyCell = "px-1.5 whitespace-nowrap tabular-nums text-muted-foreground";
const FORMULA_HINT = "Vacío: se calcula con la fórmula del Excel. Escribe un valor para sustituirla; bórralo para volver a la fórmula.";

const LAND_REFERENCE_SOURCE = {
  captured: "Lote tipo capturado aquí; bórralo para tomar el del enfoque de mercado.",
  market: "Lote tipo del enfoque de mercado de terrenos (homologación indirecta): el sujeto se homologa contra él con la tabla de factores. Puedes escribir otro.",
  subject: "Sin lote tipo: homologación directa, el factor de superficie vale 1. Escribe un lote tipo para homologar el sujeto contra él.",
} as const;

/** Header of a demerit block, as the books group Cons., Edad, Otro and FRe under "Factores de Demérito". */
function DemeritHeader(props: { leading: string[]; remaining: string; trailing?: string[] }) {
  return (
    <thead className="bg-muted/60 text-muted-foreground">
      <tr>
        {props.leading.map((label) => <th key={label} rowSpan={2} className={head}>{label}</th>)}
        <th rowSpan={2} className={head}>{props.remaining}</th>
        <th rowSpan={2} className={head} title="Estado de conservación y calificación (criterio de Ross-Heidecke): da el factor Cons.">Estado de conservación</th>
        <th colSpan={4} className={head}>Factores de Demérito</th>
        <th rowSpan={2} className={head}>Grado de terminación (%)</th>
        <th rowSpan={2} className={head}>Indiviso (%)</th>
        {(props.trailing ?? []).map((label) => <th key={label} rowSpan={2} className={head}>{label}</th>)}
        <th rowSpan={2}><span className="sr-only">Acciones</span></th>
      </tr>
      <tr>{["Cons.", "Edad", "Otro", "FRe"].map((label) => <th key={label} className={head}>{label}</th>)}</tr>
    </thead>
  );
}

/** Header of a valuation block: VRN and VNR, each with its unit and partial value, around the resultant factor. */
function ValuationHeader(props: { leading: string[]; resultant: string; netValue: string }) {
  return (
    <thead className="bg-muted/60 text-muted-foreground">
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
function ConservationRatingSelect(props: { value: string; label: string; onChange: (value: string) => void }) {
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
  const config = costEngineConfig(input);
  const marketValue = calculation.market.adoptedUnitValue;
  const reference = landReferenceArea({ land: input.land, market: calculation.market });
  const subjectArea = input.land.subjectArea ?? calculation.market.subjectArea;
  const pickedRefs = new Set(draft.constructions.map((row) => row.ref.trim().toLowerCase()));
  const unpickedTypes = calculation.types.filter((type) => !pickedRefs.has(type.ref.trim().toLowerCase()));

  const save = (next = input) => {
    if (!readOnly) void enqueueSave(payloadOf(next));
  };
  // A select has no blur to wait for: it saves as soon as it changes.
  const change = (patch: Partial<Pick<Draft, "rounding">> & { surfacePower?: number }) => {
    const land = patch.surfacePower === undefined ? draft.land : { ...draft.land, surfacePower: String(patch.surfacePower) };
    const next = { ...draft, land, rounding: patch.rounding ?? draft.rounding };
    setDraft(next);
    save(inputOf(next));
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
    const next = { ...draft, [list]: draft[list].filter((_, rowIndex) => rowIndex !== index) };
    setDraft(next);
    save(inputOf(next));
  }
  // The calificación is a select too: it saves at once, and gives the Cons. unless one is typed.
  const pickRating = (list: "constructions" | "installations", index: number, rating: string) => {
    const next = { ...draft, [list]: draft[list].map((row, rowIndex) => (rowIndex === index ? { ...row, conservationRating: rating } : row)) };
    setDraft(next);
    save(inputOf(next));
  };
  // The type is a select: picking one saves at once.
  const pickConstruction = (index: number, ref: string) => {
    const next = { ...draft, constructions: draft.constructions.map((row, rowIndex) => (rowIndex === index ? { ...row, ref } : row)) };
    setDraft(next);
    save(inputOf(next));
  };
  const addRow = (list: "constructions" | "installations" | "indirects") => setDraft((current) => {
    if (!current) return current;
    // A new construction row picks the first type not valued yet; the appraiser can change it.
    if (list === "constructions") return { ...current, constructions: [...current.constructions, percentRow(emptyConstructionCost(unpickedTypes[0]?.ref ?? ""))] };
    if (list === "installations") return { ...current, installations: [...current.installations, percentRow(emptyInstallation(current.installations.length))] };
    return { ...current, indirects: [...current.indirects, { concept: "", percentage: "", base: "" }] };
  });

  const textInput = (list: "constructions" | "installations" | "indirects", index: number, key: string, current: string, label: string, numeric = true, placeholder?: string) => (
    <Input
      aria-label={label}
      className={cell}
      inputMode={numeric ? "decimal" : undefined}
      value={current}
      placeholder={placeholder}
      title={placeholder === undefined ? undefined : `${label}. ${FORMULA_HINT}`}
      onChange={(event) => setRow(list, index, key, event.target.value)}
    />
  );
  // A percentage from 0 to 100, stored as a fraction; the % sign sits next to it.
  const percentInput = (list: "constructions" | "installations", index: number, key: "completion" | "undivided", current: string, label: string) => (
    <div className="flex items-center gap-0.5">
      <Input
        aria-label={`${label} (%)`}
        className={cell}
        inputMode="decimal"
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
    row: { conservation: string; conservationRating: string; ageFactor: string; otherFactor: string; resultantFactor: string },
    key: string,
    age: number | null,
    usefulLife: number | null,
  ) => {
    const ageFormula = formulaValue(`${key}.factorEdad`) ?? (age !== null && usefulLife ? ageFactor(age, usefulLife, config.ageFactor) : undefined);
    const fromRating = conservationOfRating(parseDecimal(row.conservationRating));
    return (
      <>
        <td className="w-36 p-1">
          <ConservationRatingSelect value={row.conservationRating} label="Estado de conservación y calificación" onChange={(rating) => pickRating(list, index, rating)} />
        </td>
        <td className="w-16 p-1">
          {textInput(list, index, "conservation", row.conservation, "Factor de conservación (Cons.)", true, fromRating === null ? undefined : figure(fromRating, 3))}
        </td>
        <td className="w-16 p-1">{textInput(list, index, "ageFactor", row.ageFactor, "Factor de edad = 1 − (edad / vida útil)^1.4", true, hint(ageFormula))}</td>
        <td className="w-14 p-1">{textInput(list, index, "otherFactor", row.otherFactor, "Otro factor", true, "1")}</td>
        <td className="w-16 p-1">{textInput(list, index, "resultantFactor", row.resultantFactor, "Factor resultante FRe = Cons. × Edad × Otro", true, hint(formulaValue(`${key}.factorResultante`)))}</td>
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
      <p className="text-xs text-muted-foreground">
        Los factores con fórmula en el Excel (Sup. y FRe del terreno; Edad y FRe de construcciones e instalaciones) se calculan solos mientras el campo está vacío; el número gris es el resultado de la fórmula. Escribe un valor para sustituirla y bórralo para volver a la fórmula. El factor de conservación (Cons.) sale del estado de conservación y su calificación (criterio de Ross-Heidecke) mientras no escribas otro.
      </p>

      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">A) Terreno en estudio</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="cost-land-reference">Lote Tipo (m²)</FieldLabel>
              <Input
                id="cost-land-reference"
                inputMode="decimal"
                value={draft.land.referenceArea}
                placeholder={calculation.market.baseArea !== null ? `De mercado: ${calculation.market.baseArea}` : "Igual al sujeto"}
                onChange={setLand("referenceArea")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-land-value">Valor comparativo de Mercado ($/m²)</FieldLabel>
              <Input id="cost-land-value" inputMode="decimal" value={draft.land.unitValue} placeholder={marketValue ? `De mercado: ${marketValue}` : "Captura el mercado de terrenos"} onChange={setLand("unitValue")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-land-power">Potencia</FieldLabel>
              <SurfacePowerSelect id="cost-land-power" value={input.land.surfacePower} onChange={(surfacePower) => change({ surfacePower })} />
            </Field>
          </div>
          <div className="overflow-x-auto rounded-md border bg-background">
            <table className="w-auto min-w-[900px] text-xs" aria-label="Terreno en estudio">
              <thead className="bg-muted/60 text-muted-foreground">
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
                <tr className="border-t">
                  <td className="px-1.5 text-center">I</td>
                  <td className="w-24 p-1">
                    <Input
                      id="cost-land-area"
                      aria-label="Superficie de Sujeto (m²)"
                      className={cell}
                      inputMode="decimal"
                      value={draft.land.subjectArea}
                      placeholder={calculation.market.subjectArea ? `De mercado: ${calculation.market.subjectArea}` : undefined}
                      onChange={setLand("subjectArea")}
                    />
                  </td>
                  <td className={`w-24 ${readOnlyCell}`}>{amount("costos.terreno.valorUnitario")}</td>
                  {LAND_FACTORS.map((factor) => (
                    <td key={factor.key} className="w-16 p-1">
                      {factor.key === "surface" ? (
                        <Input
                          id="cost-factor-surface"
                          aria-label="Factor de superficie (Sup.)"
                          className={cell}
                          inputMode="decimal"
                          value={draft.land.surfaceFactor}
                          placeholder={hint(formulaValue("costos.terreno.factorSuperficie"))}
                          title={`Sup. = ${surfaceFormula ?? "(lote tipo / superficie del sujeto)^(1/n)"}. ${FORMULA_HINT}`}
                          onChange={setLand("surfaceFactor")}
                        />
                      ) : (
                        <Input id={`cost-factor-${factor.key}`} aria-label={factor.label} className={cell} inputMode="decimal" value={draft.land.factors[factor.key]} onChange={setFactor(factor.key)} />
                      )}
                    </td>
                  ))}
                  <td className="w-16 p-1">
                    <Input
                      id="cost-factor-resultant"
                      aria-label="Factor resultante del terreno (FRe)"
                      className={cell}
                      inputMode="decimal"
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
            Cada renglón elige un tipo de la sección de construcciones; su descripción, superficie, edad y vida útil se capturan allá una sola vez.
            Quitar un renglón lo saca del cálculo y del enfoque impreso; el tipo sigue descrito en la sección de construcciones. Para quitarlo de todo el avalúo, bórralo allá.
            {calculation.types.length ? "" : " Aún no hay tipos: captúralos en la sección INF. CONSTRUCCIÓN."}
          </p>
          <div className="overflow-x-auto rounded-md border bg-background">
            <table className="w-full min-w-[1000px] text-xs" aria-label="Construcciones: factores de demérito">
              <DemeritHeader leading={["Ref.", "Tipo de Construcción", "Superficie Construida (m²)", "Edad", "Vida útil"]} remaining="Vida remanente" />
              <tbody>
                {constructionRows.map(({ row, type, key }, index) => (
                  <tr key={index} className="border-t">
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
          <div className="overflow-x-auto rounded-md border bg-background">
            <table className="w-full min-w-[900px] text-xs" aria-label="Construcciones: valor de reposición">
              <ValuationHeader leading={["Ref.", "Tipo de Construcción", "Superficie Construida (m²)"]} resultant="Factor Resultante" netValue="Valor Neto de Reposición (VNR)" />
              <tbody>
                {constructionRows.map(({ row, type, key }, index) => (
                  <tr key={index} className="border-t">
                    <td className="w-20 px-1.5">{row.ref || "—"}</td>
                    <td className={`min-w-40 ${readOnlyCell}`}>{type?.description || "—"}</td>
                    <td className={`w-20 ${readOnlyCell}`}>{figure(type?.area)}</td>
                    <td className="w-28 p-1">{textInput("constructions", index, "unitReplacementCost", row.unitReplacementCost, "VRN unitario ($/m²)")}</td>
                    <td className={`w-28 ${readOnlyCell}`}>{amount(`${key}.vrnParcial`)}</td>
                    <td className={`w-16 ${readOnlyCell}`}>{figure(value(`${key}.factorResultante`), 4)}</td>
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
            Mantenim. se imprime en la tabla de instalaciones de la sección de construcciones y no entra en el cálculo.
          </p>
          <div className="overflow-x-auto rounded-md border bg-background">
            <table className="w-full min-w-[1200px] text-xs" aria-label="Instalaciones especiales: factores de demérito">
              <DemeritHeader leading={["P/C", "Ref.", "Descripción", "Unidad", "Cant.", "Edad", "Vida útil"]} remaining="Vida Remanente" trailing={["Mantenim."]} />
              <tbody>
                {draft.installations.map((row, index) => {
                  const numbers = input.installations[index];
                  return (
                    <tr key={index} className="border-t">
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
                      <td className="w-16 p-1">{textInput("installations", index, "quantity", row.quantity, "Cantidad")}</td>
                      <td className="w-12 p-1">{textInput("installations", index, "age", row.age, "Edad")}</td>
                      <td className="w-12 p-1">{textInput("installations", index, "usefulLife", row.usefulLife, "Vida útil")}</td>
                      <td className={`w-12 ${readOnlyCell}`}>{figure(remainingUsefulLife(numbers))}</td>
                      {demeritCells("installations", index, row, installationKey(row.ref), numbers.age, numbers.usefulLife)}
                      <td className="w-20 p-1">{percentInput("installations", index, "completion", row.completion, "Grado de terminación")}</td>
                      <td className="w-20 p-1">{percentInput("installations", index, "undivided", row.undivided, "Indiviso")}</td>
                      <td className="w-24 p-1">{textInput("installations", index, "maintenance", row.maintenance, "Mantenimiento (sección de construcciones)", false)}</td>
                      <td className="p-1">
                        {!readOnly ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar la instalación ${row.ref}`} onClick={() => removeRow("installations", index)}><Trash2 /></Button> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-md border bg-background">
            <table className="w-full min-w-[1000px] text-xs" aria-label="Instalaciones especiales: valor de reposición">
              <ValuationHeader leading={["P/C", "Ref.", "Descripción", "Unidad", "Cant."]} resultant="F. Result" netValue="Valor Neto Reposición (VNR)" />
              <tbody>
                {draft.installations.map((row, index) => {
                  const key = installationKey(row.ref);
                  return (
                    <tr key={index} className="border-t">
                      <td className="w-14 px-1.5">{row.share}</td>
                      <td className="w-12 px-1.5">{row.ref || "—"}</td>
                      <td className={`min-w-48 ${readOnlyCell}`}>{row.description || "—"}</td>
                      <td className={`w-16 ${readOnlyCell}`}>{row.unit || "—"}</td>
                      <td className={`w-16 ${readOnlyCell}`}>{figure(input.installations[index].quantity)}</td>
                      <td className="w-28 p-1">{textInput("installations", index, "unitReplacementCost", row.unitReplacementCost, "VRN unitario")}</td>
                      <td className={`w-28 ${readOnlyCell}`}>{amount(`${key}.vrnParcial`)}</td>
                      <td className={`w-16 ${readOnlyCell}`}>{figure(value(`${key}.factorResultante`), 4)}</td>
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
              {textInput("indirects", index, "base", row.base, "Base ($); vacía: construcciones e instalaciones")}
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
