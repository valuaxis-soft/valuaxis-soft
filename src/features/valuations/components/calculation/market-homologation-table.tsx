"use client";

import { AlertTriangle } from "lucide-react";
import { Fragment } from "react";

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
import { factorFormulaOf, factorInputText, parseFactorInput, withFactorFormula, withTypedComparableFactor } from "@/features/valuations/calculation/factor-input";
import {
  factorKey,
  factorValue,
  findFactor,
  type ComparableDto,
  type FactorSlotConfig,
} from "@/features/valuations/calculation/market-types";
import { CaptureSlot } from "../editor/capture-host";
import { CommitCell } from "./commit-cell";

/** A factor in its cell of the table of the dictamen: framed as a field, so it reads as the appraiser's among the gray figures. */
const CAPTURE_FACTOR_CELL = "border-input bg-background text-xs";
/** Factors and FRe show the decimals of the valuation (two unless it chose four), as the printed homologation. */
const withDecimals = (decimals: number) => (value: number) =>
  value.toLocaleString("es-MX", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Options of the firm's catalog for a column; the firm's own factors have none. */
const slotOptions = (catalog: FactorCatalog, slot: FactorSlotConfig) => (slot.key ? [] : optionsFor(catalog, slot.type));

/**
 * The factors of the homologation, captured in the homologation table of the
 * dictamen (20 nov 2026: one table): a field per comparable and factor, each
 * in the cell of that table that prints it (`at`). Each takes a number or a
 * formula (=0.9/1.05); the surface factor, left empty, takes the formula with
 * the power n. The figures around them (unit values, FRe, homologated value)
 * are the table's own, written by the calculation.
 */
export function MarketHomologationCapture(props: {
  comparables: ComparableDto[];
  slots: FactorSlotConfig[];
  result: MarketApproachResult | null;
  catalog: FactorCatalog;
  readOnly: boolean;
  /** The homologation table of the page: its id, the row of each comparable and the column of each factor. */
  at: { table: string; rows: string[]; factor: (slotIndex: number) => string };
  /** A change of the comparable's factors (and their formulas), applied to what the server holds of it. */
  onFactors: (comparable: ComparableDto, change: (current: ComparableDto) => ComparableDto) => void;
  onInvalid: (message: string) => void;
  /** Decimals the factors are shown with; two by default. */
  decimals?: number;
  /** The formula of each surface factor the calculation computes, by reference: shown while its cell is edited. */
  surfaceFormulas?: ReadonlyMap<string, string>;
}) {
  const { comparables, slots, catalog, readOnly } = props;
  const twoDecimals = withDecimals(props.decimals ?? 2);
  const byReference = new Map(props.result?.homologation.comparables.map((row) => [row.id, row]) ?? []);

  const typed = (comparable: ComparableDto, slot: FactorSlotConfig) => (text: string) => {
    const input = parseFactorInput(text);
    if (input.kind === "invalid") {
      // Examples, not a range: any number or arithmetic is a factor (video 7.4, 06:54).
      props.onInvalid(`«${text}» no se lee como número. Escribe un número (por ejemplo, 0.95) o una operación (por ejemplo, =1/1.1).`);
      return;
    }
    props.onFactors(comparable, (current) => withTypedComparableFactor(current, slot, input));
  };

  /** A rating of the catalog picked for the comparable: the factor and why come from the options. */
  const picked = (comparable: ComparableDto, slot: FactorSlotConfig) => (label: string) => {
    const options = slotOptions(catalog, slot);
    const subject = options.find((option) => option.label === slot.subjectOption) ?? null;
    const option = options.find((item) => item.label === label) ?? null;
    const factor = factorFromOptions(slot.type, subject, option);
    props.onFactors(comparable, (current) => {
      const others = current.factors.filter((item) => factorKey(item) !== factorKey(slot));
      return {
        ...current,
        factors: factor ? [...others, { type: slot.type, ...factor, justification: optionJustification(slot.type, slot.label, subject, option) }] : others,
        // A rating picked from the catalog is no longer the formula typed before.
        formulas: withFactorFormula(current.formulas, slot),
      };
    });
  };

  const warningsOf = (comparable: ComparableDto, surface: number, resultant: number) => {
    const factors = slots.map((slot) => ({
      label: slot.label,
      value: slot.type === "SUPERFICIE" ? surface : factorValue(findFactor(comparable, slot)),
    }));
    return factorWarnings(factors, resultant, catalog.limits);
  };

  return (
    <>
      {comparables.map((comparable, index) => {
        const rowId = props.at.rows[index];
        if (!rowId) return null;
        const row = byReference.get(String(comparable.reference));
        const warnings = row ? warningsOf(comparable, row.surfaceFactor, row.resultantFactor) : [];
        const detail = warnings.map((warning) => `${warning.label}: ${twoDecimals(warning.value)}`).join(" · ");
        return (
          <Fragment key={comparable.id}>
            {slots.map((slot, slotIndex) => {
              const label = `${slot.label}, comparable ${comparable.reference}`;
              const at = { table: props.at.table, row: rowId, column: props.at.factor(slotIndex) };
              if (slot.type === "SUPERFICIE") {
                const surface = comparable.factors.find((factor) => factor.type === "SUPERFICIE");
                return (
                  <CaptureSlot key={factorKey(slot)} at={at}>
                    <CommitCell
                      ariaLabel={label}
                      numeric
                      formulaKey={`homologacion:${comparable.id}:${factorKey(slot)}`}
                      disabled={readOnly}
                      value={factorInputText(surface, factorFormulaOf(comparable, slot))}
                      display={surface?.value ? twoDecimals(surface.value) : row ? twoDecimals(row.surfaceFactor) : ""}
                      computed={!surface?.value}
                      placeholder="fórmula"
                      // Empty, the formula with the power n gives it: copying a factor along the row leaves it alone.
                      noFill="computed"
                      editText={surface?.value ? undefined : props.surfaceFormulas?.get(String(comparable.reference))}
                      title={surface?.value
                        ? "Factor escrito por ti; vacíalo para usar la fórmula"
                        : `Fórmula con la potencia n${props.surfaceFormulas?.get(String(comparable.reference)) ? `: ${props.surfaceFormulas.get(String(comparable.reference))}` : ""}; escribe otro valor si lo prefieres`}
                      className={CAPTURE_FACTOR_CELL}
                      onCommit={typed(comparable, slot)}
                    />
                  </CaptureSlot>
                );
              }
              const factor = findFactor(comparable, slot);
              const options = slotOptions(catalog, slot);
              const direct = DIRECT_FACTORS.has(slot.type);
              const current = direct ? matchOption(options, factor?.value) : matchOption(options, factor?.comparableRating);
              return (
                <CaptureSlot key={factorKey(slot)} at={at}>
                  <span className="grid w-full gap-0.5">
                    <CommitCell
                      ariaLabel={label}
                      numeric
                      formulaKey={`homologacion:${comparable.id}:${factorKey(slot)}`}
                      disabled={readOnly}
                      value={factorInputText(factor, factorFormulaOf(comparable, slot))}
                      display={twoDecimals(factorValue(factor))}
                      computed={!factor}
                      className={CAPTURE_FACTOR_CELL}
                      onCommit={typed(comparable, slot)}
                    />
                    {options.length ? (
                      <NativeSelect
                        size="sm"
                        aria-label={`${label}: calificación del catálogo`}
                        className="w-full text-xs"
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
                  </span>
                </CaptureSlot>
              );
            })}
            {/* A factor or the FRe out of the range the firm set: a warning at the end of the row, never a block. */}
            {warnings.length ? (
              <CaptureSlot at={{ table: props.at.table, row: rowId }}>
                <AlertTriangle className="size-3.5 text-highlight-strong" aria-label={`Fuera del rango del despacho: ${detail}`} data-factor-warning="">
                  <title>{`Fuera del rango que fijó el despacho: ${detail}`}</title>
                </AlertTriangle>
              </CaptureSlot>
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}
