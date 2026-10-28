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
        <FileDown data-icon="inline-start" /> Descargar plantilla maestra
      </a>
      {canImport ? <ImportComparablesDialog scope={{ kind: "base", onImported: () => router.refresh() }} /> : null}
      <a className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={exportHref} download title="Los comparables filtrados, en la plantilla maestra, para editarlos e importarlos de vuelta">
        <FileDown data-icon="inline-start" /> Exportar a plantilla maestra
      </a>
    </div>
  );
}
