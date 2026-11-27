"use client";

import { Plus, Trash2 } from "lucide-react";
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
import { SortableRows, steppedIds, useSortableRow } from "./sortable-rows";

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
 * PROMEDIO, MEDIANA, MINIMO, MAXIMO, DESVEST, N). Each row is dragged by its
 * handle to another place, as the rows of every table (video 8.13, 01:27: the
 * arrows «está confuso cómo es que se ordenan»); from the keyboard, Space on
 * the handle, the arrows and Space again. The real estate markets and the
 * machinery market edit them the same way; `hint` says where they print.
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
  const add = (kind: ExtraStatisticKind) => props.onChange(withExtraStatistic(choice, kind, `custom:${Date.now().toString(36)}`));
  return (
    <div className="grid gap-1.5">
      {/* The whole table is the drag's context: its announcements for the screen reader never land inside the <tbody>. */}
      <SortableRows ids={choice.order} onMove={(order) => props.onChange({ ...choice, order: order as StatisticKey[] })}>
        <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly>
          <table className={cn(CALC_TABLE, "w-full text-sm")} aria-label="Estadísticas del mercado">
            <thead className={CALC_HEAD}>
              <tr>
                <th className={cn(CALC_HEAD_CELL, "w-8")}><span className="sr-only">Mover</span></th>
                <th className={cn(CALC_HEAD_CELL, "w-16")}>Imprimir</th>
                <th className={cn(CALC_HEAD_CELL, "text-left")}>Estadístico (como se imprime)</th>
                <th className={cn(CALC_HEAD_CELL, "w-40 text-right")}>Valor</th>
                <th className={cn(CALC_HEAD_CELL, "w-10")}><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {choice.order.map((key) => (
                <StatisticRow
                key={key}
                statistic={key}
                choice={choice}
                value={props.values(key)}
                readOnly={readOnly}
                onChange={props.onChange}
                onStep={(direction) => props.onChange({ ...choice, order: steppedIds(choice.order, key, direction) as StatisticKey[] })}
              />
              ))}
            </tbody>
          </table>
        </CalcTableContextMenu>
      </SortableRows>
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

/** One statistic of the table: its handle, whether it prints, its name (and formula) and its figure. */
function StatisticRow(props: {
  statistic: StatisticKey;
  choice: PrintedStatistics;
  value: string;
  readOnly: boolean;
  onChange: (choice: PrintedStatistics) => void;
  onStep: (direction: -1 | 1) => void;
}) {
  const { statistic: key, choice, readOnly } = props;
  const extra = choice.extra?.find((item) => item.id === key);
  const label = statisticLabel(choice, key);
  const sortable = useSortableRow(key, { disabled: readOnly, label: `Mover ${label}`, onStep: props.onStep });
  return (
    <tr {...sortable.row} className={cn(CALC_ROW, sortable.className)} data-statistic={key}>
      <td className="px-1 py-1 text-center">{sortable.handle}</td>
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
      <td className="px-2 py-1 text-right tabular-nums">{props.value}</td>
      <td className="px-1 py-1 text-center">
        {!readOnly && extra ? (
          <Button type="button" size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Quitar ${label}`} onClick={() => props.onChange(withoutExtraStatistic(choice, key))}>
            <Trash2 />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
