"use client";

import { FileDown } from "lucide-react";
import { useRouter } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { ImportComparablesDialog } from "@/features/valuations/components/calculation/import-comparables-dialog";
import { cn } from "@/lib/utils";

/**
 * The master workbook of the firm's base: download it empty, import it to
 * the base (or to the valuations of its folios), and export the comparables
 * the filters show, to edit and import back.
 */
export function ComparableBaseActions({ exportHref, canImport }: { exportHref: string; canImport: boolean }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/api/comparables/plantilla?destino=BASE" download>
        <FileDown data-icon="inline-start" /> Plantilla maestra
      </a>
      {canImport ? <ImportComparablesDialog scope={{ kind: "base", onImported: () => router.refresh() }} triggerLabel="Importar a la base" /> : null}
      <a className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={exportHref} download>
        <FileDown data-icon="inline-start" /> Exportar Excel
      </a>
    </div>
  );
}
