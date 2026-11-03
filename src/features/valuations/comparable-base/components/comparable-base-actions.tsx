"use client";

import { FileDown, FileSpreadsheet, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ImportComparablesDialog } from "@/features/valuations/components/calculation/import-comparables-dialog";
import { cn } from "@/lib/utils";
import { BaseComparableDialog } from "./base-comparable-dialog";

/** The names of the buttons of the Comparables page, as the client decided them (29 oct 2026). */
export const BASE_ACTION_LABELS = {
  new: "Nuevo comparable",
  import: "Importar Excel",
  export: "Exportar Excel",
  template: "Descargar plantilla",
} as const;

/** The links of the page that need no JavaScript: the export of what the filters show, and the empty template. */
export function ComparableBaseLinks({ exportHref }: { exportHref: string }) {
  return (
    <>
      <a
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        href={exportHref}
        download
        title="Los comparables filtrados, en la plantilla de Valuaxis, para editarlos e importarlos de vuelta"
      >
        <FileSpreadsheet data-icon="inline-start" /> {BASE_ACTION_LABELS.export}
      </a>
      <a className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")} href="/api/comparables/plantilla?destino=BASE" download>
        <FileDown data-icon="inline-start" /> {BASE_ACTION_LABELS.template}
      </a>
    </>
  );
}

/**
 * The actions of the Comparables page: a new comparable captured in the base
 * (the same form as in a valuation), the Excel import and export in the
 * master template, and the empty template to fill.
 */
export function ComparableBaseActions({ exportHref, canEdit, validityMonths, attributeNames }: {
  exportHref: string;
  canEdit: boolean;
  validityMonths: number;
  attributeNames: string[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit ? (
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          <Plus data-icon="inline-start" /> {BASE_ACTION_LABELS.new}
        </Button>
      ) : null}
      {canEdit ? <ImportComparablesDialog scope={{ kind: "base", onImported: () => router.refresh() }} /> : null}
      <ComparableBaseLinks exportHref={exportHref} />
      {creating ? (
        <BaseComparableDialog
          open
          onOpenChange={(open) => { if (!open) setCreating(false); }}
          card={null}
          defaultValidityMonths={validityMonths}
          attributeNames={attributeNames}
        />
      ) : null}
    </div>
  );
}
