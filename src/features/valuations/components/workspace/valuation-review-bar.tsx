"use client";

import { CircleCheck, History, Loader2, Send, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ValuationStatusBadge } from "@/features/dashboard/components/valuation-status-badge";
import { ValuationHistoryDialog } from "@/features/valuations/components/history/valuation-history-dialog";
import type { SaveStatus } from "@/features/valuations/components/feedback/save-status-indicator";
import { api, SessionExpiredError } from "@/lib/api-client";

type ReviewAction = "enviar" | "aprobar" | "regresar";

const SENDABLE = new Set(["nuevo", "en_edicion", "reabierto"]);
const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

const DIALOG: Record<ReviewAction, { title: string; description: string; label: string; placeholder: string; confirm: string; required: boolean }> = {
  enviar: {
    title: "Enviar a revisión",
    description: "El revisor del despacho lo verá «En revisión». Puedes seguir editándolo mientras tanto; el sistema solo avisa.",
    label: "Nota para el revisor (opcional)",
    placeholder: "Por ejemplo: revisar la homologación de terrenos.",
    confirm: "Enviar a revisión",
    required: false,
  },
  aprobar: {
    title: "Aprobar la revisión",
    description: "El avalúo queda aprobado y listo para concluir. Quien lo concluye sigue siendo quien tiene el permiso de concluir.",
    label: "Nota (opcional)",
    placeholder: "Por ejemplo: revisado contra el Excel del despacho.",
    confirm: "Aprobar",
    required: false,
  },
  regresar: {
    title: "Regresar a edición",
    description: "El avalúo vuelve a «En edición» para que el valuador corrija. El motivo queda en el historial.",
    label: "Motivo (obligatorio)",
    placeholder: "Por ejemplo: falta la fotografía de la fachada y la firma del perito.",
    confirm: "Regresar a edición",
    required: true,
  },
};

/**
 * The line under the editor's top bar: the valuation's status, its review
 * (Nuevo → En edición → «Enviar a revisión» → «Aprobar» or «Regresar a
 * edición» → Concluir) and «Historial». Each button shows only to whom its
 * permission allows; none of them keeps anybody from editing or concluding.
 */
export function ValuationReviewBar({
  valuationId,
  folio,
  initialStatus,
  initialApprovedAt,
  locked,
  canSend,
  canReview,
  canExport,
  saveStatus,
  hasUnsavedChanges,
  onSave,
}: {
  valuationId: string;
  folio: string;
  initialStatus: string;
  initialApprovedAt: Date | null;
  locked: boolean;
  /** AVALUO_EDITAR. */
  canSend: boolean;
  /** AVALUO_REVISAR. */
  canReview: boolean;
  canExport: boolean;
  saveStatus: SaveStatus;
  hasUnsavedChanges: boolean;
  onSave: () => Promise<boolean>;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [approvedAt, setApprovedAt] = useState<Date | null>(initialApprovedAt);
  const [previousSave, setPreviousSave] = useState(saveStatus);
  const [dialog, setDialog] = useState<ReviewAction | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // The first save moves the valuation from «Nuevo» to «En edición» in the server; the line follows it.
  if (saveStatus !== previousSave) {
    setPreviousSave(saveStatus);
    if (previousSave === "saving" && saveStatus === "saved" && status === "nuevo") setStatus("en_edicion");
  }

  const open = (action: ReviewAction) => {
    setNote("");
    setDialog(action);
  };

  const confirm = async () => {
    if (!dialog) return;
    const action = dialog;
    if (DIALOG[action].required && !note.trim()) return;
    setPending(true);
    try {
      // What the reviewer sees is what is saved.
      if (action === "enviar" && hasUnsavedChanges && !(await onSave())) return;
      const result = await api.valuations.review(valuationId, action, note.trim() || undefined);
      setStatus(result.status);
      setApprovedAt(result.approvedAt ? new Date(result.approvedAt) : null);
      setDialog(null);
      toast.success(
        action === "enviar" ? `${folio} quedó «En revisión».`
          : action === "aprobar" ? `${folio} quedó aprobado: listo para concluir.`
            : `${folio} regresó a «En edición».`,
      );
    } catch (error) {
      toast.error(error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo completar la acción.");
    } finally {
      setPending(false);
    }
  };

  const inReview = status === "en_revision";
  const config = dialog ? DIALOG[dialog] : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" data-review-bar="" data-status={status}>
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Estado</span>
        <ValuationStatusBadge status={status} />
      </span>
      {inReview && approvedAt ? (
        <span className="inline-flex items-center gap-1 text-xs text-success-strong" data-review-approved="">
          <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
          Aprobado el {dateTime.format(approvedAt)}: listo para concluir
        </span>
      ) : inReview ? (
        <span className="text-xs text-muted-foreground">{canReview ? "Pendiente de tu revisión." : "Esperando al revisor. Puedes seguir editando."}</span>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!locked && canSend && SENDABLE.has(status) ? (
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => open("enviar")} data-review-action="enviar">
            <Send data-icon="inline-start" />
            Enviar a revisión
          </Button>
        ) : null}
        {!locked && canReview && inReview && !approvedAt ? (
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => open("aprobar")} data-review-action="aprobar">
            <CircleCheck data-icon="inline-start" />
            Aprobar
          </Button>
        ) : null}
        {!locked && canReview && inReview ? (
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => open("regresar")} data-review-action="regresar">
            <Undo2 data-icon="inline-start" />
            Regresar a edición
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setHistoryOpen(true)} data-history-open="">
          <History data-icon="inline-start" />
          Historial
        </Button>
      </div>

      <ValuationHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} valuationId={valuationId} folio={folio} canExport={canExport} />

      <AlertDialog open={dialog !== null} onOpenChange={(next) => { if (!next && !pending) setDialog(null); }}>
        <AlertDialogContent>
          {config ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{config.title}</AlertDialogTitle>
                <AlertDialogDescription>{config.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <Field>
                <FieldLabel htmlFor="review-note">{config.label}</FieldLabel>
                <Textarea
                  id="review-note"
                  value={note}
                  maxLength={1000}
                  rows={3}
                  placeholder={config.placeholder}
                  onChange={(event) => setNote(event.target.value)}
                  aria-required={config.required}
                />
              </Field>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                <Button type="button" disabled={pending || (config.required && !note.trim())} onClick={() => void confirm()}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  {config.confirm}
                </Button>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
