"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { HomologationStats } from "@/features/valuations/engine/market";
import { EXTRA_STATISTIC_KINDS, type ExtraStatisticKind, type PrintedStatistics, type StatisticKey } from "@/features/valuations/calculation/market-types";
import {
  EXTRA_STATISTIC_LABELS,
  extraStatisticText,
  statisticLabel,
  withExtraStatistic,
  withExtraStatisticFormula,
  withStatisticLabel,
  withoutExtraStatistic,
} from "@/features/valuations/calculation/market-statistics";
import { CALC_HEAD, CALC_HEAD_CELL, CALC_ROW, CALC_TABLE, CALC_TABLE_FRAME } from "./calculation-table-style";
import { CalcTableContextMenu } from "./calc-table-context-menu";
import { CommitCell } from "./commit-cell";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/** The figure of a statistic of the box, as it prints: in pesos with thousands, a dispersion with two decimals; «—» while there is no result. */
export function statisticValueText(key: StatisticKey, choice: PrintedStatistics, stats: HomologationStats | null, homologated: readonly number[]): string {
  if (!stats) return "—";
  const extra = choice.extra?.find((item) => item.id === key);
  if (extra) return extraStatisticText(extra, stats, homologated) ?? "—";
  switch (key) {
    case "initialDispersion": return stats.initialDispersion.toFixed(2);
    case "dispersion": return stats.dispersion.toFixed(2);
    case "offerMin": return money(stats.offerMin);
    case "offerMax": return money(stats.offerMax);
    case "min": return money(stats.min);
    case "max": return money(stats.max);
    case "mean": return money(stats.mean);
    case "median": return money(stats.median);
    default: return "—";
  }
}

/** Under the table of a real estate market: where its statistics print. */
const MARKET_STATISTICS_HINT = "Las marcadas se imprimen en este orden: el promedio y la mediana junto al valor adoptado, las demás en el recuadro de la dispersión.";

/**
 * The statistics of a market as a small table (video 8.10, 00:28–06:20):
 * which print (the box), their names as they print, their order, and
 * statistics of the appraiser's own (moda, desviación… or a formula over
 * PROMEDIO, MEDIANA, MINIMO, MAXIMO, DESVEST, N). The real estate markets
 * and the machinery market edit them the same way; `hint` says where they print.
 */
export function StatisticsTable(props: {
  choice: PrintedStatistics;
  values: (key: StatisticKey) => string;
  readOnly: boolean;
  onChange: (choice: PrintedStatistics) => void;
  hint?: string;
}) {
  const { choice, readOnly } = props;
  const [adding, setAdding] = useState<ExtraStatisticKind | "">("");
  const move = (index: number, by: -1 | 1) => {
    const order = [...choice.order];
    const [key] = order.splice(index, 1);
    order.splice(index + by, 0, key);
    props.onChange({ ...choice, order });
  };
  const add = (kind: ExtraStatisticKind) => props.onChange(withExtraStatistic(choice, kind, `custom:${Date.now().toString(36)}`));
  return (
    <div className="grid gap-1.5">
      <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly>
        <table className={cn(CALC_TABLE, "w-full text-sm")} aria-label="Estadísticas del mercado">
          <thead className={CALC_HEAD}>
            <tr>
              <th className={cn(CALC_HEAD_CELL, "w-16")}>Imprimir</th>
              <th className={cn(CALC_HEAD_CELL, "text-left")}>Estadístico (como se imprime)</th>
              <th className={cn(CALC_HEAD_CELL, "w-40 text-right")}>Valor</th>
              <th className={cn(CALC_HEAD_CELL, "w-28")}><span className="sr-only">Orden</span></th>
            </tr>
          </thead>
          <tbody>
            {choice.order.map((key, index) => {
              const extra = choice.extra?.find((item) => item.id === key);
              const label = statisticLabel(choice, key);
              return (
                <tr key={key} className={CALC_ROW} data-statistic={key}>
                  <td className="px-2 py-1 text-center">
                    <Checkbox
                      aria-label={`Imprimir ${label}`}
                      checked={!choice.hidden.includes(key)}
                      disabled={readOnly}
                      onCheckedChange={(checked) => props.onChange({ ...choice, hidden: checked === true ? choice.hidden.filter((item) => item !== key) : [...choice.hidden, key] })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <span className="grid gap-1">
                      <CommitCell
                        ariaLabel={`Nombre de ${label}`}
                        disabled={readOnly}
                        value={label}
                        className="border-input text-sm text-foreground"
                        onCommit={(text) => props.onChange(withStatisticLabel(choice, key, text))}
                      />
                      {extra?.kind === "formula" ? (
                        <CommitCell
                          ariaLabel={`Fórmula de ${label}`}
                          disabled={readOnly}
                          value={extra.formula ?? ""}
                          placeholder="=PROMEDIO*0.95"
                          title="Usa PROMEDIO, MEDIANA, MINIMO, MAXIMO, DESVEST y N: =(MAXIMO-MINIMO)/PROMEDIO"
                          className="border-input font-mono text-xs"
                          onCommit={(text) => props.onChange(withExtraStatisticFormula(choice, key, text))}
                        />
                      ) : null}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{props.values(key)}</td>
                  <td className="px-1 py-1">
                    {!readOnly ? (
                      <span className="flex items-center justify-end gap-0.5">
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir ${label}`} disabled={index === 0} onClick={() => move(index, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar ${label}`} disabled={index === choice.order.length - 1} onClick={() => move(index, 1)}>
                          <ArrowDown />
                        </Button>
                        {extra ? (
                          <Button type="button" size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Quitar ${label}`} onClick={() => props.onChange(withoutExtraStatistic(choice, key))}>
                            <Trash2 />
                          </Button>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CalcTableContextMenu>
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <NativeSelect
            size="sm"
            aria-label="Estadístico por agregar"
            value={adding}
            className="w-56 text-xs"
            onChange={(event) => setAdding(event.target.value as ExtraStatisticKind | "")}
          >
            <NativeSelectOption value="">Agregar estadístico…</NativeSelectOption>
            {EXTRA_STATISTIC_KINDS.map((kind) => (
              <NativeSelectOption key={kind} value={kind}>{EXTRA_STATISTIC_LABELS[kind]}</NativeSelectOption>
            ))}
          </NativeSelect>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!adding} onClick={() => { if (adding) add(adding); setAdding(""); }}>
            <Plus data-icon="inline-start" /> Agregar
          </Button>
          <span className="text-muted-foreground">{props.hint ?? MARKET_STATISTICS_HINT}</span>
        </div>
      ) : null}
    </div>
  );
}
