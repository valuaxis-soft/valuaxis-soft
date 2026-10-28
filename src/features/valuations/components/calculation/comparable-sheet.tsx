import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The look of a comparable's sheet, like the tables of the dictamen: a light
 * blue band for each group and label cells in gray beside their values.
 * `printable` drops the dark-mode tones (the calculation memory prints on
 * white whatever the screen theme).
 */
const tones = (printable: boolean) => ({
  frame: printable ? "border-slate-300" : "border-slate-300 dark:border-slate-700",
  band: printable ? "bg-[#DCE6F2] text-[#00285A]" : "bg-[#DCE6F2] text-[#00285A] dark:bg-[#12345a] dark:text-blue-100",
  label: printable ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300",
  value: printable ? "bg-white text-black" : "bg-background",
});

/** A group of the sheet: its title band over its content. */
export function SheetSection(props: { title: string; children: ReactNode; printable?: boolean; className?: string; aside?: ReactNode }) {
  const tone = tones(Boolean(props.printable));
  return (
    <section className={cn("break-inside-avoid overflow-hidden rounded-sm border", tone.frame, props.className)} aria-label={props.title}>
      <h3 className={cn("flex items-center justify-between gap-2 px-2 py-1 text-[11px] font-bold tracking-wide uppercase", tone.band)}>
        <span>{props.title}</span>
        {props.aside}
      </h3>
      <div className={tone.value}>{props.children}</div>
    </section>
  );
}

/** A group of a capture form with the sheet's band: the same groups the card shows. */
export function SheetFormSection(props: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <SheetSection title={props.title} className={props.className}>
      <div className="grid gap-3 p-3">
        {props.hint ? <p className="text-xs text-muted-foreground">{props.hint}</p> : null}
        {props.children}
      </div>
    </SheetSection>
  );
}

export type SheetItem ={ label: string; value: ReactNode; wide?: boolean };

/** The items in rows of up to `perRow` pairs; a wide item takes a row of its own. */
export function sheetRows<T extends { wide?: boolean }>(items: T[], perRow = 2): T[][] {
  const rows: T[][] = [];
  let current: T[] = [];
  for (const item of items) {
    if (item.wide) {
      if (current.length) rows.push(current);
      rows.push([item]);
      current = [];
      continue;
    }
    current.push(item);
    if (current.length === perRow) {
      rows.push(current);
      current = [];
    }
  }
  if (current.length) rows.push(current);
  return rows;
}

/** Label and value pairs as a table, two pairs per row; a wide item takes the whole row. */
export function SheetTable({ items, printable = false }: { items: SheetItem[]; printable?: boolean }) {
  const tone = tones(printable);
  const cell = cn("border-t px-2 py-1 text-left align-top", tone.frame);
  const label = cn(cell, tone.label, "w-[18%] font-medium");
  return (
    <table className="w-full table-fixed border-collapse text-xs">
      <tbody>
        {sheetRows(items).map((row, index) => (
          <tr key={index} className="break-inside-avoid">
            {row.map((item) => (
              <SheetPair key={item.label} item={item} labelClass={label} valueClass={cn(cell, "wrap-break-word")} span={item.wide ? 3 : row.length === 1 ? 3 : 1} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SheetPair({ item, labelClass, valueClass, span }: { item: SheetItem; labelClass: string; valueClass: string; span: number }) {
  return (
    <>
      <th scope="row" className={labelClass}>{item.label}</th>
      <td className={valueClass} colSpan={span}>{item.value}</td>
    </>
  );
}
