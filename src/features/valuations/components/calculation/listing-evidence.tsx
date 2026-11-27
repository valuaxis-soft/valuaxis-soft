"use client";

import { Info } from "lucide-react";

import { LISTING_SECTIONS, type ListingReading } from "@/features/ai/listing-prefill";
import { SheetSection } from "./comparable-sheet";

/**
 * «Pegar anuncio» in the card itself (V8.12, 11:40: «esa ventana ya debe tener
 * un estilo similar a esta»): what was read from the listing, in the card's own
 * sections and bands, each value with the fragment it came from, so the
 * appraiser checks it against the listing while the fields above are already
 * filled. Only the fields the listing gave, or that need a note.
 */
export function ListingEvidence({ reading }: { reading: Pick<ListingReading, "rows" | "notices" | "discarded"> }) {
  const found = reading.rows.filter((row) => row.evidence).length;
  const groups = LISTING_SECTIONS.map((section) => ({
    title: section.title,
    rows: section.fields.flatMap((field) => reading.rows.filter((row) => row.field === field && (row.evidence || row.note || row.value.trim()))),
  })).filter((group) => group.rows.length);
  return (
    <details open className="group rounded-sm border" data-listing-evidence>
      <summary className="cursor-pointer px-2 py-1.5 text-sm font-medium">
        Lo que se leyó del anuncio: <span className="tabular-nums" data-listing-found>{found} de {reading.rows.length}</span> datos de la ficha
        {reading.discarded ? (
          <span className="font-normal text-muted-foreground">
            {" "}· se descart{reading.discarded === 1 ? "ó 1 dato" : `aron ${reading.discarded} datos`} que no se pudo{reading.discarded === 1 ? "" : "ieron"} comprobar en el texto
          </span>
        ) : null}
      </summary>
      <div className="grid gap-2 border-t p-2">
        <p className="text-xs text-muted-foreground">Ya están en sus campos de la ficha. Revisa cada uno contra el fragmento del anuncio de donde se leyó; lo que el anuncio no dice quedó vacío.</p>
        {reading.notices.map((notice) => (
          <p key={notice} className="flex items-start gap-1.5 text-xs text-highlight-strong">
            <Info className="mt-0.5 size-3.5 shrink-0" /> {notice}
          </p>
        ))}
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((group) => (
            <SheetSection key={group.title} title={group.title}>
              <dl className="grid text-xs">
                {group.rows.map((row) => (
                  <div key={row.field} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-2 border-t px-2 py-1 first:border-t-0" data-listing-field={row.field}>
                    <dt className="font-medium text-muted-foreground">{row.label}</dt>
                    <dd className="min-w-0 wrap-break-word">
                      <span className="font-medium">{row.value || "—"}</span>
                      {row.evidence ? <q className="block text-muted-foreground" data-evidence>{row.evidence}</q> : <span className="block text-muted-foreground">El anuncio no lo dice.</span>}
                      {row.note ? <span className="block text-highlight-strong">{row.note}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </SheetSection>
          ))}
        </div>
      </div>
    </details>
  );
}
