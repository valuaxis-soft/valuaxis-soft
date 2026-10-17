"use client";

import { AlertTriangle } from "lucide-react";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { MarketApproachResult } from "@/features/valuations/engine/market";
import {
  DIRECT_FACTORS,
  factorFromOptions,
  factorWarnings,
  matchOption,
  optionJustification,
  optionsFor,
  type FactorCatalog,
} from "@/features/valuations/calculation/factor-catalog";
import { factorInputText, parseFactorInput, withTypedFactor } from "@/features/valuations/calculation/factor-input";
import {
  factorKey,
  factorValue,
  findFactor,
  type ComparableDto,
  type ComparableFactorDto,
  type FactorSlotConfig,
} from "@/features/valuations/calculation/market-types";
import { CommitCell } from "./commit-cell";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
/** Factors and FRe show two decimals, as the printed homologation; the engine keeps every digit. */
const twoDecimals = (value: number) => value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Options of the firm's catalog for a column; the firm's own factors have none. */
const slotOptions = (catalog: FactorCatalog, slot: FactorSlotConfig) => (slot.key ? [] : optionsFor(catalog, slot.type));

/**
 * The homologation as the appraiser's format prints it, and where its factors
 * are captured: a row per comparable, a column per factor, in multiplication
 * order. Each cell takes a number or a formula (=0.9/1.05); the surface
 * column, left empty, takes the formula with the power n.
 */
export function MarketHomologationTable(props: {
  comparables: ComparableDto[];
  slots: FactorSlotConfig[];
  result: MarketApproachResult | null;
  catalog: FactorCatalog;
  readOnly: boolean;
  unitValueLabel: string;
  homologatedLabel: string;
  legend: string;
  onFactors: (comparable: ComparableDto, factors: ComparableFactorDto[]) => void;
  onInvalid: (message: string) => void;
}) {
  const { comparables, slots, catalog, readOnly } = props;
  const byReference = new Map(props.result?.homologation.comparables.map((row) => [row.id, row]) ?? []);

  const typed = (comparable: ComparableDto, slot: FactorSlotConfig) => (text: string) => {
    const input = parseFactorInput(text);
    if (input.kind === "invalid") {
      props.onInvalid(`«${text}» no es un factor válido: escribe un número o una fórmula como =0.9/1.05.`);
      return;
    }
    props.onFactors(comparable, withTypedFactor(comparable.factors, slot, input));
  };

  /** A rating of the catalog picked for the comparable: the factor and why come from the options. */
  const picked = (comparable: ComparableDto, slot: FactorSlotConfig) => (label: string) => {
    const options = slotOptions(catalog, slot);
    const subject = options.find((option) => option.label === slot.subjectOption) ?? null;
    const option = options.find((item) => item.label === label) ?? null;
    const factor = factorFromOptions(slot.type, subject, option);
    const others = comparable.factors.filter((item) => factorKey(item) !== factorKey(slot));
    props.onFactors(comparable, factor
      ? [...others, { type: slot.type, ...factor, justification: optionJustification(slot.type, slot.label, subject, option) }]
      : others);
  };

  const warningsOf = (comparable: ComparableDto, surface: number, resultant: number) => {
    const factors = slots.map((slot) => ({
      label: slot.label,
      value: slot.type === "SUPERFICIE" ? surface : factorValue(findFactor(comparable, slot)),
    }));
    return factorWarnings(factors, resultant, catalog.limits);
  };

  return (
    <div className="grid gap-1.5">
      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full min-w-[640px] text-sm" aria-label="Homologación">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left font-medium" rowSpan={2}>Ref.</th>
              <th className="px-2 py-1 text-right font-medium" rowSpan={2}>{props.unitValueLabel}</th>
              <th className="border-x px-2 py-1 text-center font-medium" colSpan={slots.length + 1}>Factores de homologación</th>
              <th className="px-2 py-1 text-right font-medium" rowSpan={2}>{props.homologatedLabel}</th>
            </tr>
            <tr>
              {slots.map((slot) => (
                <th key={factorKey(slot)} className="min-w-20 px-1 py-1 text-center font-medium">{slot.label}</th>
              ))}
              <th className="border-r px-2 py-1 text-center font-medium">FRe</th>
            </tr>
          </thead>
          <tbody>
            {comparables.map((comparable) => {
              const row = byReference.get(String(comparable.reference));
              const warnings = row ? warningsOf(comparable, row.surfaceFactor, row.resultantFactor) : [];
              const detail = warnings.map((warning) => `${warning.label}: ${twoDecimals(warning.value)}`).join(" · ");
              return (
                <tr key={comparable.id} className="border-t align-top">
                  <td className="px-2 py-1.5">{comparable.reference}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{row ? money(row.unitValue) : "—"}</td>
                  {slots.map((slot) => {
                    const label = `${slot.label}, comparable ${comparable.reference}`;
                    if (slot.type === "SUPERFICIE") {
                      const surface = comparable.factors.find((factor) => factor.type === "SUPERFICIE");
                      return (
                        <td key={factorKey(slot)} className="px-1 py-1">
                          <CommitCell
                            ariaLabel={label}
                            numeric
                            disabled={readOnly}
                            value={factorInputText(surface)}
                            display={surface?.value ? twoDecimals(surface.value) : row ? twoDecimals(row.surfaceFactor) : ""}
                            computed={!surface?.value}
                            placeholder="fórmula"
                            title={surface?.value ? "Factor escrito por ti; vacíalo para usar la fórmula" : "Fórmula con la potencia n; escribe otro valor si lo prefieres"}
                            onCommit={typed(comparable, slot)}
                          />
                        </td>
                      );
                    }
                    const factor = findFactor(comparable, slot);
                    const options = slotOptions(catalog, slot);
                    const direct = DIRECT_FACTORS.has(slot.type);
                    const current = direct ? matchOption(options, factor?.value) : matchOption(options, factor?.comparableRating);
                    return (
                      <td key={factorKey(slot)} className="px-1 py-1">
                        <CommitCell
                          ariaLabel={label}
                          numeric
                          disabled={readOnly}
                          value={factorInputText(factor)}
                          display={twoDecimals(factorValue(factor))}
                          computed={!factor}
                          onCommit={typed(comparable, slot)}
                        />
                        {options.length ? (
                          <NativeSelect
                            size="sm"
                            aria-label={`${label}: calificación del catálogo`}
                            className="mt-0.5 w-full text-xs"
                            disabled={readOnly || (!direct && !slot.subjectOption)}
                            title={!direct && !slot.subjectOption ? "Elige primero la calificación del sujeto" : undefined}
                            value={current?.label ?? ""}
                            onChange={(event) => picked(comparable, slot)(event.target.value)}
                          >
                            <NativeSelectOption value="">{direct ? "Catálogo…" : "Calif.…"}</NativeSelectOption>
                            {options.map((option) => (
                              <NativeSelectOption key={option.label} value={option.label}>{option.label} ({option.value})</NativeSelectOption>
                            ))}
                          </NativeSelect>
                        ) : null}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {row ? (
                      <span className="inline-flex items-center gap-1">
                        {warnings.length ? (
                          <AlertTriangle className="size-3.5 text-amber-600" aria-label={`Fuera del rango del despacho: ${detail}`}>
                            <title>{`Fuera del rango que fijó el despacho: ${detail}`}</title>
                          </AlertTriangle>
                        ) : null}
                        {twoDecimals(row.resultantFactor)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{row ? money(row.homologatedUnitValue) : "—"}</td>
                </tr>
              );
            })}
            {!comparables.length ? (
              <tr><td colSpan={slots.length + 4} className="px-2 py-6 text-center text-muted-foreground">Agrega comparables para homologarlos.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{props.legend}</p>
    </div>
  );
}
