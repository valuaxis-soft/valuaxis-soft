"use client";

import { AlertTriangle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import {
  MAX_SCALE_LEVELS,
  computeMarketRegression,
  defaultMarketRegression,
  distinctValues,
  isNumericVariable,
  regressionFieldOptions,
  type MarketRegressionDto,
  type RegressionDependent,
  type RegressionVariableDto,
} from "@/features/valuations/calculation/market-regression";
import {
  characteristicFieldsOf,
  characteristicValueText,
  isRentComparableType,
  type CharacteristicField,
  type ComparableDto,
  type MarketCalculationDto,
  type MarketSettingsDto,
} from "@/features/valuations/calculation/market-types";
import type { HomologationStats } from "@/features/valuations/engine/market";
import {
  CONSTANT_LETTERS,
  ESTIMATION_METHOD_LABELS,
  MAX_REGRESSION_VARIABLES,
  RECOMMENDED_REGRESSION_COMPARABLES,
  VARIABLE_LETTERS,
} from "@/features/valuations/engine/regression";
import { CommitCell } from "./commit-cell";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const number = (value: number, digits = 2) => value.toLocaleString("es-MX", { maximumFractionDigits: digits });
/** Constants with eight significant figures, so a small coefficient keeps its digits. */
const constant = (value: number) => value.toLocaleString("es-MX", { maximumSignificantDigits: 8 });

/**
 * "Homologación por el método de regresión lineal": the appraiser chooses the
 * variables among the market's characteristics, gives the written ones a
 * scale, and reads Y for the subject beside the homologated mean and median.
 * A reference: it never changes the value adopted.
 */
export function MarketRegression(props: {
  calculation: Pick<MarketCalculationDto, "settings" | "comparables">;
  stats: HomologationStats | null;
  readOnly: boolean;
  /** A change of the settings, made on the latest ones (a change still on its way included). */
  onChange: (change: (current: MarketSettingsDto) => Partial<MarketSettingsDto>) => void;
  onExclude: (comparable: ComparableDto, excluded: boolean) => void;
}) {
  const { calculation, readOnly } = props;
  const { settings, comparables } = calculation;
  const regression = settings.regression ?? defaultMarketRegression();
  const rent = isRentComparableType(settings.comparableType);
  const unit = rent ? "$/m²/mes" : "$/m²";
  const options = regressionFieldOptions(settings);
  const update = (change: (current: MarketRegressionDto) => Partial<MarketRegressionDto>) => props.onChange((current) => {
    const base = current.regression ?? defaultMarketRegression();
    return { regression: { ...base, ...change(base) } };
  });
  const save = (patch: Partial<MarketRegressionDto>) => update(() => patch);
  const chosen = regression.variables
    .map((variable) => ({ variable, field: options.find((field) => field.key === variable.key) }))
    .filter((item): item is { variable: RegressionVariableDto; field: CharacteristicField } => Boolean(item.field));
  const outcome = computeMarketRegression(calculation);
  const fit = outcome?.ok ? outcome.result.fit : null;
  const fittedByReference = new Map(fit?.residuals.map((row) => [row.id, row]) ?? []);
  const included = comparables.filter((comparable) => !comparable.regressionExcluded).length;
  const hasAge = options.some((field) => /^edad/i.test(field.label.trim()));

  const toggleVariable = (key: string, checked: boolean) => update((current) => ({
    variables: checked
      ? [...current.variables.filter((variable) => variable.key !== key), { key }]
      : current.variables.filter((variable) => variable.key !== key),
  }));
  const setScale = (key: string, label: string, text: string) => {
    const value = parseDecimal(text);
    const present = new Set(distinctValues(calculation, key));
    update((current) => ({
      variables: current.variables.map((variable) => {
        if (variable.key !== key) return variable;
        const kept = (variable.scale ?? []).filter((level) => level.label !== label && present.has(level.label));
        const scale = value === null ? kept : [...kept, { label, value }];
        return { ...variable, scale: scale.length ? scale : null };
      }),
    }));
  };
  const setSubject = (key: string, text: string) => props.onChange((current) => {
    const { [key]: _previous, ...rest } = current.subjectCharacteristics ?? {};
    return { subjectCharacteristics: text.trim() ? { ...rest, [key]: text.trim() } : rest };
  });
  const yOf = (comparable: ComparableDto) => {
    if (!comparable.price) return null;
    if (regression.dependent === "PRICE") return comparable.price;
    return comparable.area ? comparable.price / comparable.area : null;
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <Checkbox checked={regression.enabled} disabled={readOnly} onCheckedChange={(checked) => save({ enabled: checked === true })} />
          Calcular por regresión lineal
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <Checkbox
            checked={regression.showInDictamen}
            disabled={readOnly || !regression.enabled}
            onCheckedChange={(checked) => save({ showInDictamen: checked === true })}
          />
          Mostrar en el dictamen
        </label>
        <span className="text-xs text-muted-foreground">
          {ESTIMATION_METHOD_LABELS[regression.method]}, Y = A + BX + CZ…: un valor de referencia como el promedio y la mediana; no
          cambia el valor adoptado.
        </span>
      </div>

      {regression.enabled ? (
        <fieldset disabled={readOnly} className="grid gap-3">
          <div className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <div className="grid content-start gap-1">
              <label htmlFor="regression-dependent" className="text-xs font-medium">Variable dependiente (Y)</label>
              <NativeSelect
                id="regression-dependent"
                className="w-full"
                value={regression.dependent}
                onChange={(event) => save({ dependent: event.target.value as RegressionDependent })}
              >
                <NativeSelectOption value="UNIT_VALUE">Valor unitario ({unit})</NativeSelectOption>
                <NativeSelectOption value="PRICE">{rent ? "Renta mensual" : "Precio de oferta"} ($)</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <span className="text-xs font-medium">Variables (X, Z…), hasta {MAX_REGRESSION_VARIABLES}</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {options.map((field) => {
                  const checked = regression.variables.some((variable) => variable.key === field.key);
                  return (
                    <label key={field.key} className="flex items-center gap-1.5">
                      <Checkbox
                        checked={checked}
                        disabled={readOnly || (!checked && regression.variables.length >= MAX_REGRESSION_VARIABLES)}
                        onCheckedChange={(value) => toggleVariable(field.key, value === true)}
                      />
                      {field.label}
                    </label>
                  );
                })}
              </div>
              {!hasAge && !readOnly ? (
                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  className="h-auto justify-start px-0"
                  onClick={() => props.onChange((current) => ({
                    characteristicFields: [...characteristicFieldsOf(current), { key: `custom:edad-${Date.now().toString(36)}`, label: "EDAD" }],
                  }))}
                >
                  <Plus data-icon="inline-start" /> Agregar la característica EDAD a los comparables
                </Button>
              ) : null}
            </div>
          </div>

          {chosen.length ? (
            <div className="overflow-x-auto rounded-md border bg-background">
              <table className="w-full min-w-[560px] text-sm" aria-label="Datos de la regresión lineal">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Entra</th>
                    <th className="px-2 py-1.5 text-left font-medium">N</th>
                    <th className="px-2 py-1.5 text-right font-medium">Y ({regression.dependent === "PRICE" ? "$" : unit})</th>
                    {chosen.map(({ field }, j) => (
                      <th key={field.key} className="px-2 py-1.5 text-right font-medium">{VARIABLE_LETTERS[j]} ({field.label})</th>
                    ))}
                    <th className="px-2 py-1.5 text-right font-medium">Y estimado</th>
                    <th className="px-2 py-1.5 text-right font-medium">Residuo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t bg-muted/20">
                    <td className="px-2 py-1.5 text-xs text-muted-foreground" colSpan={2}>Sujeto</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fit ? number(fit.estimate, 4) : "—"}</td>
                    {chosen.map(({ field }) => (
                      <td key={field.key} className="px-1 py-1">
                        {field.key === "area" ? (
                          <span className="block px-1.5 text-right tabular-nums" title="La superficie del sujeto de las especificaciones">
                            {settings.subjectArea ?? "—"}
                          </span>
                        ) : (
                          <CommitCell
                            ariaLabel={`${field.label} del sujeto en la regresión`}
                            disabled={readOnly}
                            numeric={isNumericVariable(calculation, field.key)}
                            value={settings.subjectCharacteristics?.[field.key] ?? ""}
                            onCommit={(text) => setSubject(field.key, text)}
                          />
                        )}
                      </td>
                    ))}
                    <td colSpan={2} />
                  </tr>
                  {comparables.map((comparable) => {
                    const y = yOf(comparable);
                    const row = fittedByReference.get(String(comparable.reference));
                    const excluded = Boolean(comparable.regressionExcluded);
                    return (
                      <tr key={comparable.id} className={excluded ? "border-t text-muted-foreground line-through" : "border-t"}>
                        <td className="px-2 py-1.5">
                          <Checkbox
                            aria-label={`Comparable ${comparable.reference} en la regresión`}
                            checked={!excluded}
                            disabled={readOnly}
                            onCheckedChange={(checked) => props.onExclude(comparable, checked !== true)}
                          />
                        </td>
                        <td className="px-2 py-1.5">{comparable.reference}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{y === null ? "—" : number(y, 4)}</td>
                        {chosen.map(({ field }) => (
                          <td key={field.key} className="px-2 py-1.5 text-right tabular-nums">
                            {(field.key === "area" ? (comparable.area === null ? "" : String(comparable.area)) : characteristicValueText(comparable, field.key)) || "—"}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right tabular-nums">{row ? number(row.fitted, 4) : "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{row ? number(row.residual, 4) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {chosen.filter(({ variable, field }) => variable.scale?.length || !isNumericVariable(calculation, field.key)).map(({ variable, field }) => {
            const values = distinctValues(calculation, field.key);
            return (
              <div key={field.key} className="grid gap-1.5 rounded-md border bg-background p-3">
                <p className="text-xs">
                  <span className="font-medium">Escala de {field.label}:</span>{" "}
                  <span className="text-muted-foreground">el número que toma cada valor escrito (por ejemplo popular = 1, medio = 2, residencial = 3, lujo = 4).</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {values.map((label) => (
                    <label key={label} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                      {label} =
                      <span className="w-16">
                        <CommitCell
                          ariaLabel={`Escala de ${field.label}: ${label}`}
                          disabled={readOnly}
                          numeric
                          value={String(variable.scale?.find((level) => level.label === label)?.value ?? "")}
                          onCommit={(text) => setScale(field.key, label, text)}
                          className="border-input"
                        />
                      </span>
                    </label>
                  ))}
                  {!values.length ? <span className="text-xs text-muted-foreground">Captura {field.label} en las características de los comparables.</span> : null}
                </div>
                {values.length > MAX_SCALE_LEVELS ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Hay {values.length} valores distintos; la escala lleva hasta {MAX_SCALE_LEVELS}. Unifica cómo están escritos.
                  </p>
                ) : null}
              </div>
            );
          })}

          {outcome?.ok && fit ? (
            <div className="grid gap-2 rounded-md border bg-background p-3 text-sm" aria-label="Resultado de la regresión lineal">
              <p className="font-mono text-xs">
                Y = {fit.coefficients.map((value, index) => (index === 0 ? constant(value) : `${value < 0 ? "−" : "+"} ${constant(Math.abs(value))}·${VARIABLE_LETTERS[index - 1]}`)).join(" ")}
              </p>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-4">
                {fit.coefficients.map((value, index) => (
                  <div key={CONSTANT_LETTERS[index]}>
                    <dt className="text-xs text-muted-foreground">{CONSTANT_LETTERS[index]}{index ? ` (${outcome.result.variables[index - 1]})` : " (ordenada)"}</dt>
                    <dd className="tabular-nums">{constant(value)}</dd>
                  </div>
                ))}
                <div><dt className="text-xs text-muted-foreground">R²</dt><dd className="tabular-nums">{fit.rSquared === null ? "—" : number(fit.rSquared, 4)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">R² ajustado</dt><dd className="tabular-nums">{fit.adjustedRSquared === null ? "—" : number(fit.adjustedRSquared, 4)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Error estándar</dt><dd className="tabular-nums">{number(fit.standardError, 4)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Comparables (N)</dt><dd className="tabular-nums">{fit.n}</dd></div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">{rent ? "Renta estimada" : "Precio estimado"} ({unit})</dt>
                  <dd className="text-base font-semibold tabular-nums">{outcome.result.unitValue === null ? "—" : money(outcome.result.unitValue)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">{rent ? "Renta mensual estimada" : "Valor estimado del inmueble"}</dt>
                  <dd className="text-base font-semibold tabular-nums">{money(outcome.result.value)}</dd>
                </div>
                {props.stats ? (
                  <div className="sm:col-span-4">
                    <dt className="text-xs text-muted-foreground">Para comparar: promedio y mediana homologados ({unit})</dt>
                    <dd className="tabular-nums">{money(props.stats.mean)} · {money(props.stats.median)}</dd>
                  </div>
                ) : null}
              </dl>
              {!fit.reliable ? (
                <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3.5 shrink-0" /> Con {fit.n} comparables (se recomiendan más de {RECOMMENDED_REGRESSION_COMPARABLES}) la regresión es poco
                  confiable y muy sensible a errores de captura: tómala solo como referencia.
                </p>
              ) : null}
            </div>
          ) : outcome && !outcome.ok ? (
            <p className="text-sm text-muted-foreground">{outcome.reason}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Entran {included} de {comparables.length} comparables. Los valores de cada variable son las características de los comparables (se
            editan arriba); quitar un comparable aquí no lo quita de la homologación.
          </p>
        </fieldset>
      ) : null}
    </div>
  );
}
