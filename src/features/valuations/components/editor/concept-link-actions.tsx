"use client";

/**
 * Linking a concept already created to a datum of the valuation (Álvaro,
 * video 5.6, 14:30–20:49): «Vincular con…» in its ⋮ and right-click menus
 * opens a search of the valuation's concepts, and writing a value another
 * concept already holds (or naming it like one with a value) offers
 * «Este dato ya existe en «…». ¿Vincularlo?» without stopping the writing.
 * The link is the editor's own: the two share the value (`concept-links.ts`).
 */
import { useRef, useState } from "react";
import { Link } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { linkableConcepts, suggestLink } from "@/features/valuations/services/concept-link-suggestions";
import { conceptTypeLabel } from "@/features/valuations/services/concept-types";
import { normalizeConceptTitle } from "@/features/valuations/services/concept-title";
import { useStructureTransfer } from "../workspace/structure-transfer-context";
import { conceptPreview } from "./concept-creation-control";

/** How many concepts the search lists at once; writing narrows them. */
const LISTED = 40;

/** «Vincular con…»: the concepts of the valuation to take the datum from, with a search by title, datum or place. */
export function LinkConceptDialog({ conceptId, open, onOpenChange, onLink }: {
  conceptId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Links the concept's datum to the one of `sourceId`. */
  onLink: (sourceId: string) => void;
}) {
  const transfer = useStructureTransfer();
  const [search, setSearch] = useState("");
  const sections = open && transfer ? transfer.latestSections() : [];
  const all = linkableConcepts(sections);
  const target = all.find((item) => item.concept.id === conceptId)?.concept;
  const needle = search.trim().toLowerCase();
  const candidates = all
    .filter((item) => item.concept.id !== conceptId && (item.concept.label.trim() || item.concept.value.trim()))
    .filter((item) => !(target?.valueKey && item.concept.valueKey === target.valueKey))
    .filter((item) => !needle || `${item.concept.label} ${conceptPreview(item.concept.value)} ${item.location}`.toLowerCase().includes(needle));
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setSearch("");
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg" data-link-concept-dialog="">
        <DialogHeader>
          <DialogTitle>Vincular con…</DialogTitle>
          <DialogDescription>
            {target ? `«${normalizeConceptTitle(target.label) || "Concepto"}» tomará el dato del concepto que elijas` : "El concepto tomará el dato del que elijas"} y desde
            entonces los dos mostrarán siempre el mismo. Su título no cambia; «Desvincular» los separa.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Buscar concepto para vincular"
          placeholder="Buscar por título, dato o sección"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1" data-link-candidates="">
          {candidates.length ? candidates.slice(0, LISTED).map(({ concept, location }) => (
            <div key={concept.id} className="grid gap-1.5 rounded-md border bg-card p-2.5" data-link-candidate={concept.id}>
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium wrap-break-word">{normalizeConceptTitle(concept.label) || "Sin título"}</span>
                <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px]">{conceptTypeLabel(concept.type)}</Badge>
              </div>
              <p className="line-clamp-3 text-sm wrap-break-word text-foreground/90" title={conceptPreview(concept.value)}>{conceptPreview(concept.value)}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-xs text-muted-foreground">{location}</p>
                <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 text-sm" onClick={() => { onLink(concept.id); close(false); }}>
                  <Link data-icon="inline-start" />
                  Vincular dato
                </Button>
              </div>
            </div>
          )) : <p className="text-sm text-muted-foreground">{needle ? "Ningún concepto coincide con la búsqueda." : "No hay otros conceptos en el avalúo."}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Pairs already offered: the notice does not come back for the same concept and datum. */
const offered = new Set<string>();

/**
 * The notice «Este dato ya existe en «…». ¿Vincularlo?» after writing a value
 * another concept holds (`"value"`) or naming the concept like one with a
 * value (`"title"`). It never stops the writing and never links on its own.
 * Returns the function to call when the title or the value is left.
 */
export function useLinkSuggestion(conceptId: string, onLink: ((sourceId: string) => void) | undefined) {
  const transfer = useStructureTransfer();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (reason: "value" | "title") => {
    if (!transfer || transfer.readOnly || !onLink) return;
    if (timer.current) clearTimeout(timer.current);
    // After the field commits what was written: the check reads the document as it is then.
    timer.current = setTimeout(() => {
      const suggestion = suggestLink(transfer.latestSections(), conceptId, reason);
      if (!suggestion) return;
      const key = `${conceptId}:${suggestion.source.id}`;
      if (offered.has(key)) return;
      offered.add(key);
      const where = [suggestion.location, normalizeConceptTitle(suggestion.source.label)].filter(Boolean).join(" › ");
      toast(`Este dato ya existe en «${where}». ¿Vincularlo?`, {
        description: reason === "value"
          ? "Al vincularlo, los dos muestran siempre el mismo dato y aparece el ícono de vinculado."
          : `Ahí dice «${conceptPreview(suggestion.source.value)}». Al vincularlo, este concepto toma ese dato y los dos muestran siempre el mismo.`,
        duration: 15_000,
        action: { label: "Vincular", onClick: () => onLink(suggestion.source.id) },
      });
    }, 150);
  };
}
