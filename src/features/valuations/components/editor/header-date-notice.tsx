"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Link2, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Concept } from "@/features/valuations/model";
import { formatDateValue } from "@/features/valuations/services/concept-value-format";
import { HEADER_DATE_LABELS, headerDateMismatch, type HeaderDates } from "@/features/valuations/services/header-dates";

/** The dates of the page header, for the dates of the body to compare with; null where there is no header (a template). */
const HeaderDatesContext = createContext<HeaderDates | null>(null);

export function HeaderDatesProvider({ dates, children }: { dates: HeaderDates | null; children?: ReactNode }) {
  return <HeaderDatesContext value={dates}>{children}</HeaderDatesContext>;
}

export const useHeaderDates = () => useContext(HeaderDatesContext);

/**
 * Under a date of the body named like a date of the header («Fecha del
 * avalúo», «Fecha», «Vigencia»): a notice when it says another day, with
 * «Vincular» to take the header's and follow it; and, once linked, that it
 * follows the header, with «Desvincular». It never refuses the date typed.
 */
export function HeaderDateNotice({ concept, readOnly, onPatch }: {
  concept: Pick<Concept, "label" | "value" | "type" | "headerDate">;
  readOnly: boolean;
  onPatch: (patch: Partial<Concept>) => void;
}) {
  const dates = useHeaderDates();
  if (!dates || concept.type !== "date") return null;
  if (concept.headerDate) {
    return (
      <p className="flex flex-wrap items-center gap-1 text-[11px] leading-snug text-muted-foreground" data-header-date-linked={concept.headerDate}>
        <Link2 className="size-3" aria-hidden />
        Vinculada con {HEADER_DATE_LABELS[concept.headerDate]} del encabezado: cambia cuando cambia la del encabezado.
        {!readOnly ? (
          <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[11px]" onClick={() => onPatch({ headerDate: undefined })}>
            <Unlink data-icon="inline-start" /> Desvincular
          </Button>
        ) : null}
      </p>
    );
  }
  const mismatch = headerDateMismatch(concept, dates);
  if (!mismatch) return null;
  return (
    <p role="status" className="flex flex-wrap items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" data-header-date-mismatch={mismatch.kind}>
      Es distinta de {HEADER_DATE_LABELS[mismatch.kind]} del encabezado ({formatDateValue(mismatch.header, "short")}).
      {!readOnly ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-5 px-1.5 text-[11px]"
          title="Toma la fecha del encabezado y la sigue cuando cambie."
          onClick={() => onPatch({ value: mismatch.header, headerDate: mismatch.kind })}
        >
          <Link2 data-icon="inline-start" /> Vincular
        </Button>
      ) : null}
    </p>
  );
}
