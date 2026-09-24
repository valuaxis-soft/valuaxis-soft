"use client";

import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, SessionExpiredError } from "@/lib/api-client";
import {
  LAND_FACTORS,
  emptyConstruction,
  emptyInstallation,
  landUnitValue,
  toCostEngineInput,
  type ConstructionDto,
  type CostCalculationDto,
  type CostInputDto,
  type IndirectDto,
  type InstallationDto,
  type LandFactorKey,
} from "@/features/valuations/calculation/cost-types";
import { DEFAULT_ENGINE_CONFIG } from "@/features/valuations/engine/config";
import { computeCostApproach } from "@/features/valuations/engine/costs";
import { Trace } from "@/features/valuations/engine/trace";
import { parseDecimal } from "./comparable-dialog";
import { useSerializedSave } from "./use-serialized-save";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/** Every number is edited as text so "0." or "14,361" survive while typing. */
type Texts<T> = { [K in keyof T]: T[K] extends number | null ? string : T[K] };
type Draft = {
  land: Omit<Texts<CostInputDto["land"]>, "factors"> & { factors: Record<LandFactorKey, string> };
  constructions: Texts<ConstructionDto>[];
  installations: Texts<InstallationDto>[];
  indirects: Texts<IndirectDto>[];
};

const toText = (value: number | null) => (value === null ? "" : String(value));

function textsOf<T extends object>(row: T): Texts<T> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "number" || value === null ? toText(value as number | null) : value])) as Texts<T>;
}

function numbersOf<T extends object>(row: Texts<T>, template: T): T {
  return Object.fromEntries(Object.entries(template).map(([key, value]) => {
    const text = (row as Record<string, unknown>)[key];
    if (typeof value === "number" || value === null) {
      const parsed = parseDecimal(String(text ?? ""));
      // Factors default to 1 and fractions to their template value when left empty.
      return [key, parsed ?? (typeof value === "number" ? value : null)];
    }
    return [key, text];
  })) as T;
}

function draftOf(input: CostInputDto): Draft {
  return {
    land: {
      subjectArea: toText(input.land.subjectArea),
      referenceArea: toText(input.land.referenceArea),
      unitValue: toText(input.land.unitValue),
      surfacePower: String(input.land.surfacePower),
      factors: Object.fromEntries(Object.entries(input.land.factors).map(([key, value]) => [key, String(value)])) as Record<LandFactorKey, string>,
    },
    constructions: input.constructions.map(textsOf),
    installations: input.installations.map(textsOf),
    indirects: input.indirects.map(textsOf),
  };
}

function inputOf(draft: Draft): CostInputDto {
  return {
    land: {
      subjectArea: parseDecimal(draft.land.subjectArea),
      referenceArea: parseDecimal(draft.land.referenceArea),
      unitValue: parseDecimal(draft.land.unitValue),
      surfacePower: parseDecimal(draft.land.surfacePower) ?? 3,
      factors: Object.fromEntries(Object.entries(draft.land.factors).map(([key, value]) => [key, parseDecimal(value) ?? 1])) as Record<LandFactorKey, number>,
    },
    constructions: draft.constructions.map((row, index) => numbersOf(row, emptyConstruction(index))),
    installations: draft.installations.map((row, index) => numbersOf(row, emptyInstallation(index))),
    indirects: draft.indirects.map((row) => numbersOf(row, { concept: "", percentage: null, base: null })),
  };
}

/** What can be saved: rows still being written (no reference or description) wait in the draft. */
function payloadOf(input: CostInputDto): CostInputDto {
  return {
    land: input.land,
    constructions: input.constructions.filter((row) => row.ref.trim()),
    installations: input.installations.filter((row) => row.ref.trim() && row.description.trim()),
    indirects: input.indirects.filter((row) => row.concept.trim()),
  };
}

const savedInputOf = (calculation: CostCalculationDto): CostInputDto => ({
  land: calculation.land,
  constructions: calculation.constructions,
  installations: calculation.installations,
  indirects: calculation.indirects,
});

function compute(calculation: CostCalculationDto) {
  const input = toCostEngineInput(calculation);
  if (!input.ok) return { result: null, trace: null, reason: input.reason };
  const trace = new Trace();
  return { result: computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG, trace), trace, reason: null };
}

const cell = "h-7 min-w-0 px-1.5 text-xs";

/**
 * Cost approach: land (valued with the unit value adopted in the land market),
 * constructions and special installations captured once for the dictamen, and
 * indirects. Saves when a field loses focus.
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
  const enqueueSave = useSerializedSave(async (payload: CostInputDto) => {
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
  const live = compute({ ...calculation, ...input });
  const value = (key: string) => live.trace?.find(key)?.value;
  const marketValue = calculation.market.adoptedUnitValue;

  const save = () => {
    if (!readOnly) void enqueueSave(payloadOf(input));
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
  function removeRow(list: "constructions" | "installations" | "indirects", index: number) {
    setDraft((current) => current && { ...current, [list]: current[list].filter((_, rowIndex) => rowIndex !== index) });
  }
  const addRow = (list: "constructions" | "installations" | "indirects") => setDraft((current) => {
    if (!current) return current;
    if (list === "constructions") return { ...current, constructions: [...current.constructions, textsOf(emptyConstruction(current.constructions.length))] };
    if (list === "installations") return { ...current, installations: [...current.installations, textsOf(emptyInstallation(current.installations.length))] };
    return { ...current, indirects: [...current.indirects, { concept: "", percentage: "", base: "" }] };
  });

  const textInput = (list: "constructions" | "installations" | "indirects", index: number, key: string, current: string, label: string, numeric = true) => (
    <Input
      aria-label={label}
      className={cell}
      inputMode={numeric ? "decimal" : undefined}
      value={current}
      onChange={(event) => setRow(list, index, key, event.target.value)}
    />
  );

  return (
    <section className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:p-4" aria-labelledby="cost-calculation-title" onBlur={() => void save()}>
      <header className="flex items-center justify-between gap-2">
        <h3 id="cost-calculation-title" className="flex items-center gap-2 text-sm font-semibold">
          <Calculator className="size-4" /> Cálculo del enfoque de costos
        </h3>
        {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
      </header>
      {calculation.locked ? <p className="text-sm text-muted-foreground">El avalúo está concluido: el cálculo es de solo lectura.</p> : null}

      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-3">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">A) Terreno</h4>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="cost-land-area">Superficie (m²)</FieldLabel>
              <Input id="cost-land-area" inputMode="decimal" value={draft.land.subjectArea} placeholder={calculation.market.subjectArea ? `De mercado: ${calculation.market.subjectArea}` : undefined} onChange={setLand("subjectArea")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-land-reference">Lote tipo (m²)</FieldLabel>
              <Input id="cost-land-reference" inputMode="decimal" value={draft.land.referenceArea} placeholder="Igual al sujeto" onChange={setLand("referenceArea")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-land-value">Valor unitario ($/m²)</FieldLabel>
              <Input id="cost-land-value" inputMode="decimal" value={draft.land.unitValue} placeholder={marketValue ? `De mercado: ${marketValue}` : "Captura el mercado de terrenos"} onChange={setLand("unitValue")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-land-power">Potencia n</FieldLabel>
              <Input id="cost-land-power" inputMode="decimal" value={draft.land.surfacePower} onChange={setLand("surfacePower")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            {LAND_FACTORS.map((factor) => factor.key === "surface" ? (
              <Field key={factor.key}>
                <FieldLabel>{factor.label}</FieldLabel>
                <p className="flex h-8 items-center text-sm tabular-nums text-muted-foreground">{value("costos.terreno.factorSuperficie")?.toFixed(4) ?? "—"}</p>
              </Field>
            ) : (
              <Field key={factor.key}>
                <FieldLabel htmlFor={`cost-factor-${factor.key}`}>{factor.label}</FieldLabel>
                <Input id={`cost-factor-${factor.key}`} inputMode="decimal" value={draft.land.factors[factor.key]} onChange={setFactor(factor.key)} />
              </Field>
            ))}
          </div>
          {!draft.land.unitValue && !marketValue ? (
            <p className="text-xs text-muted-foreground">El valor unitario sale del enfoque de mercado de terrenos; captúralo ahí o escríbelo aquí.</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">B) Construcciones</h4>
          <div className="overflow-x-auto rounded-md border bg-background">
            <table className="w-full min-w-[860px] text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  {["Ref.", "Descripción", "Sup. (m²)", "Edad", "Vida útil", "F. conserv.", "Grado term.", "Indiviso", "VRN ($/m²)", "VNR"].map((label) => (
                    <th key={label} className="px-1.5 py-1 text-left font-medium">{label}</th>
                  ))}
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {draft.constructions.map((row, index) => (
                  <tr key={index} className="border-t">
                    <td className="w-16 p-1">{textInput("constructions", index, "ref", row.ref, "Referencia", false)}</td>
                    <td className="min-w-48 p-1">{textInput("constructions", index, "description", row.description, "Descripción", false)}</td>
                    <td className="w-20 p-1">{textInput("constructions", index, "area", row.area, "Superficie")}</td>
                    <td className="w-14 p-1">{textInput("constructions", index, "age", row.age, "Edad")}</td>
                    <td className="w-14 p-1">{textInput("constructions", index, "usefulLife", row.usefulLife, "Vida útil")}</td>
                    <td className="w-16 p-1">{textInput("constructions", index, "conservation", row.conservation, "Factor de conservación")}</td>
                    <td className="w-14 p-1">{textInput("constructions", index, "completion", row.completion, "Grado de terminación")}</td>
                    <td className="w-14 p-1">{textInput("constructions", index, "undivided", row.undivided, "Indiviso")}</td>
                    <td className="w-24 p-1">{textInput("constructions", index, "unitReplacementCost", row.unitReplacementCost, "VRN unitario")}</td>
                    <td className="px-1.5 text-right font-medium whitespace-nowrap tabular-nums">
                      {(() => { const vnr = value(`costos.construcciones.${row.ref}.vnrParcial`); return vnr === undefined ? "—" : money(vnr); })()}
                    </td>
                    <td className="p-1">
                      {!readOnly ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${row.ref}`} onClick={() => removeRow("constructions", index)}><Trash2 /></Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly ? <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => addRow("constructions")}><Plus data-icon="inline-start" /> Construcción</Button> : null}
        </div>

        <div className="grid gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">C) Instalaciones especiales, elementos accesorios y obras complementarias</h4>
          <div className="overflow-x-auto rounded-md border bg-background">
            <table className="w-full min-w-[960px] text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  {["Ref.", "Descripción", "P/C", "Unidad", "Cantidad", "Edad", "Vida útil", "F. conserv.", "Mantenimiento", "VRN unitario", "VNR"].map((label) => (
                    <th key={label} className="px-1.5 py-1 text-left font-medium">{label}</th>
                  ))}
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {draft.installations.map((row, index) => (
                  <tr key={index} className="border-t">
                    <td className="w-12 p-1">{textInput("installations", index, "ref", row.ref, "Referencia", false)}</td>
                    <td className="min-w-48 p-1">{textInput("installations", index, "description", row.description, "Descripción", false)}</td>
                    <td className="w-16 p-1">
                      <select
                        aria-label="Privativa o común"
                        className="h-7 w-full rounded-md border bg-transparent px-1 text-xs"
                        value={row.share}
                        onChange={(event) => setRow("installations", index, "share", event.target.value)}
                      >
                        <option value="P">P</option>
                        <option value="C">C</option>
                      </select>
                    </td>
                    <td className="w-16 p-1">{textInput("installations", index, "unit", row.unit, "Unidad", false)}</td>
                    <td className="w-16 p-1">{textInput("installations", index, "quantity", row.quantity, "Cantidad")}</td>
                    <td className="w-12 p-1">{textInput("installations", index, "age", row.age, "Edad")}</td>
                    <td className="w-12 p-1">{textInput("installations", index, "usefulLife", row.usefulLife, "Vida útil")}</td>
                    <td className="w-16 p-1">{textInput("installations", index, "conservation", row.conservation, "Factor de conservación")}</td>
                    <td className="w-24 p-1">{textInput("installations", index, "maintenance", row.maintenance, "Mantenimiento", false)}</td>
                    <td className="w-24 p-1">{textInput("installations", index, "unitReplacementCost", row.unitReplacementCost, "VRN unitario")}</td>
                    <td className="px-1.5 text-right font-medium whitespace-nowrap tabular-nums">
                      {(() => { const vnr = value(`costos.instalaciones.${row.ref}.vnrParcial`); return vnr === undefined ? "—" : money(vnr); })()}
                    </td>
                    <td className="p-1">
                      {!readOnly ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar la instalación ${row.ref}`} onClick={() => removeRow("installations", index)}><Trash2 /></Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly ? <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => addRow("installations")}><Plus data-icon="inline-start" /> Instalación</Button> : null}
        </div>

        <details className="grid gap-2" open={draft.indirects.length > 0}>
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted-foreground uppercase">E) Indirectos (opcional)</summary>
          {draft.indirects.map((row, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_5rem_8rem_auto] items-center gap-2">
              {textInput("indirects", index, "concept", row.concept, "Concepto", false)}
              {textInput("indirects", index, "percentage", row.percentage, "Porcentaje (0.05 = 5 %)")}
              {textInput("indirects", index, "base", row.base, "Base")}
              {!readOnly ? <Button type="button" size="icon-sm" variant="ghost" aria-label="Quitar el indirecto" onClick={() => removeRow("indirects", index)}><Trash2 /></Button> : null}
            </div>
          ))}
          {!readOnly ? <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => addRow("indirects")}><Plus data-icon="inline-start" /> Indirecto</Button> : null}
        </details>
      </fieldset>

      {live.result ? (
        <dl className="grid gap-x-4 gap-y-1 rounded-md border bg-background p-3 text-sm sm:grid-cols-5">
          <div><dt className="text-xs text-muted-foreground">A) Terreno</dt><dd className="tabular-nums">{money(live.result.land)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">B) Construcciones</dt><dd className="tabular-nums">{money(live.result.constructions)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">C) Instalaciones</dt><dd className="tabular-nums">{money(live.result.specialInstallations)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">E) Indirectos</dt><dd className="tabular-nums">{money(live.result.indirects)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Valor físico</dt><dd className="text-base font-semibold tabular-nums">{money(live.result.physicalValue)}</dd></div>
          {landUnitValue({ land: input.land, market: calculation.market }) === null ? (
            <p className="text-xs text-muted-foreground sm:col-span-5">Sin valor unitario del terreno: el valor físico no incluye el terreno.</p>
          ) : null}
        </dl>
      ) : live.reason ? <p className="text-sm text-muted-foreground">{live.reason}</p> : null}
    </section>
  );
}
