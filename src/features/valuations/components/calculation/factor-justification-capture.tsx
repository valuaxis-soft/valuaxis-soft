"use client";

import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * «Justificación de los factores utilizados» in the editor: right under the
 * homologation table and its notes, before its values, where the dictamen
 * prints it (video 8.13, 02:02: «va debajo de esta tabla, antes de la
 * conclusión… tiene que tener coherencia de dónde aparece en el formato»).
 * The same frame in every market and in machinery; the fields are each
 * approach's.
 */
export function FactorJustificationCapture(props: {
  children: ReactNode;
  readOnly: boolean;
  /** Whether it prints; absent, it always does when it has text. */
  shown?: boolean;
  onShownChange?: (shown: boolean) => void;
}) {
  const shown = props.shown !== false;
  return (
    <section
      className="grid gap-2 rounded-md border border-l-4 border-l-primary/60 bg-primary/5 p-3"
      aria-label="Justificación de los factores utilizados"
      data-market-justification=""
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold text-primary">Justificación de los factores utilizados</h4>
        {props.onShownChange ? (
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={shown} disabled={props.readOnly} onCheckedChange={(checked) => props.onShownChange?.(checked === true)} />
            Se imprime en el dictamen
          </label>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {shown
          ? "Se imprime aquí, justo debajo de la tabla de homologación y antes de sus valores, y su resumen va en «Factores de homologación»."
          : "No se imprime en este enfoque; su resumen sí va en «Factores de homologación»."}
      </p>
      {props.children}
    </section>
  );
}
