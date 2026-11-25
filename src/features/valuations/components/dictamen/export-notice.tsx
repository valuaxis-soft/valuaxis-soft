"use client";

/**
 * The lawyer's notice before every export of a concluded valuation (the PDF,
 * the calculation memory, the .zip, printing, sending by email and the .zip
 * that downloads by itself after concluding): the report belongs to the
 * appraiser. It shows every time, with no «no volver a mostrar» (Álvaro,
 * 25 Nov 2026).
 */
import { Printer } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export const EXPORT_NOTICE_TEXT =
  "El reporte es suyo. Usted responde de sus datos, criterios, conclusiones y firma, y de conservarlo por el plazo que le exijan sus obligaciones profesionales.";
export const EXPORT_NOTICE_CONFIRM = "Exportar";
export const EXPORT_NOTICE_CANCEL = "Cancelar";

export function ExportNoticeDialog({ open, onExport, onCancel }: { open: boolean; onExport: () => void; onCancel: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent data-export-notice="">
        <AlertDialogHeader>
          <AlertDialogTitle>Antes de exportar</AlertDialogTitle>
          <AlertDialogDescription className="text-foreground">{EXPORT_NOTICE_TEXT}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{EXPORT_NOTICE_CANCEL}</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={onExport}>{EXPORT_NOTICE_CONFIRM}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * `ask(action)` shows the notice and runs the export only on «Exportar»;
 * `dialog` is rendered by the component that exports.
 */
export function useExportNotice() {
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const ask = useCallback((action: () => void) => {
    pending.current = action;
    setOpen(true);
  }, []);
  const dialog = (
    <ExportNoticeDialog
      open={open}
      onCancel={() => { pending.current = null; setOpen(false); }}
      onExport={() => {
        const action = pending.current;
        pending.current = null;
        setOpen(false);
        action?.();
      }}
    />
  );
  return { ask, dialog };
}

/** «Imprimir» of a concluded document: the browser's print, after the notice. */
export function ExportPrintButton() {
  const notice = useExportNotice();
  return (
    <>
      <Button variant="outline" onClick={() => notice.ask(() => window.print())}>
        <Printer data-icon="inline-start" />
        Imprimir
      </Button>
      {notice.dialog}
    </>
  );
}
