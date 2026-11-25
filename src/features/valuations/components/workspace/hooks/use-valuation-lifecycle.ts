import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api, ApiError, SessionExpiredError } from "@/lib/api-client";
import { REOPEN_ACCEPTANCE_TEXT } from "@/features/valuations/components/workspace/valuation-lifecycle-dialogs";
import { downloadValuationDocument } from "@/features/valuations/components/dictamen/download-dictamen-pdf-button";
import { useExportNotice } from "@/features/valuations/components/dictamen/export-notice";

const DELIVERABLES_PENDING_KEY = "valuaxis:entregables-al-concluir";

/**
 * Concluding hands over the deliverables: the report and its calculation
 * memory download by themselves, once, when the page comes back concluded.
 * They stay in the notice of the concluded valuation to download again.
 * The export notice comes first; «Cancelar» leaves them one click away there.
 * The caller renders the returned dialog.
 */
export function useDeliverablesAfterConclude(valuationId: string | null, concluded: boolean) {
  const { ask, dialog } = useExportNotice();
  useEffect(() => {
    if (!valuationId || !concluded) return;
    let pending: string | null = null;
    try {
      pending = window.sessionStorage.getItem(DELIVERABLES_PENDING_KEY);
      if (pending === valuationId) window.sessionStorage.removeItem(DELIVERABLES_PENDING_KEY);
    } catch { return; }
    if (pending === valuationId) ask(() => void downloadValuationDocument(valuationId, "entregables"));
  }, [valuationId, concluded, ask]);
  return dialog;
}

/** Conclude and reopen: dialog state and the requests that change the valuation's lifecycle. */
export function useValuationLifecycle({
  handleSave,
  hasUnsavedChanges,
  onSessionExpired,
  valuationId,
}: {
  handleSave: () => Promise<boolean>;
  hasUnsavedChanges: boolean;
  onSessionExpired: () => void;
  valuationId: string | null;
}) {
  const [concludeOpen, setConcludeOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [lifecyclePending, setLifecyclePending] = useState(false);

  const runLifecycleAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setLifecyclePending(true);
    try {
      await action();
      toast.success(successMessage);
      // The loaded document belongs to a version that just changed state: load it again.
      window.location.reload();
    } catch (err) {
      if (err instanceof SessionExpiredError) onSessionExpired();
      else if (err instanceof ApiError && err.link) {
        // The server names where to fix it (e.g. buy credits): offer the way there.
        const link = err.link;
        toast.error(err.message, { action: { label: "Ir a Plan y facturación", onClick: () => window.location.assign(link) } });
      } else toast.error(err instanceof Error ? err.message : "No se pudo completar la acción.");
      setLifecyclePending(false);
    }
  };

  const handleConclude = async () => {
    if (!valuationId) return;
    if (hasUnsavedChanges && !(await handleSave())) return;
    setConcludeOpen(false);
    await runLifecycleAction(async () => {
      await api.valuations.conclude(valuationId);
      // The page loads again as concluded: it downloads the deliverables then (see useDeliverablesAfterConclude).
      try { window.sessionStorage.setItem(DELIVERABLES_PENDING_KEY, valuationId); } catch { /* without storage they are one click away, in the notice of the concluded valuation */ }
    }, "Avalúo concluido.");
  };

  const handleReopen = async (reason: string) => {
    if (!valuationId) return;
    setReopenOpen(false);
    await runLifecycleAction(
      () => api.valuations.reopen(valuationId, { reason, acceptedText: REOPEN_ACCEPTANCE_TEXT }),
      "Avalúo reabierto. Ya puedes editar la nueva versión.",
    );
  };

  return {
    concludeOpen,
    handleConclude,
    handleReopen,
    lifecyclePending,
    reopenOpen,
    setConcludeOpen,
    setReopenOpen,
  };
}
