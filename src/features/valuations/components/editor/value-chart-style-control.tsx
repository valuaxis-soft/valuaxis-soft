"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ValueChartStyle } from "@/features/valuations/model";

const STYLES: Array<{ value: ValueChartStyle; label: string }> = [
  { value: "bars", label: "Barras verticales" },
  { value: "bars-3d", label: "Barras en relieve (3D)" },
  { value: "horizontal", label: "Barras horizontales" },
];

/**
 * The conclusion's subbloque of the chart of the values: its style (video
 * 8.15, 3:10: «la grafiquita, con alguna personalización, estilo… en 3D»).
 * The chart draws the values of the resumen de valores; the subbloque is
 * moved, hidden and titled as any other.
 */
export function ValueChartStyleControl({ style, readOnly, onChange }: { style: ValueChartStyle; readOnly: boolean; onChange: (style: ValueChartStyle) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs" data-value-chart-style>
      <label htmlFor="value-chart-style" className="font-medium">Estilo de la gráfica</label>
      <NativeSelect
        id="value-chart-style"
        size="sm"
        className="w-56"
        disabled={readOnly}
        value={style}
        onChange={(event) => onChange(event.target.value as ValueChartStyle)}
      >
        {STYLES.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
      </NativeSelect>
      <span className="text-muted-foreground">Dibuja los valores del subbloque «Resumen de valores», con los colores del avalúo.</span>
    </div>
  );
}
